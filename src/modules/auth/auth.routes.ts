import { createHash } from 'node:crypto';
import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { parseWith } from '../../common/http/validate.js';
import { rateLimit, type RateLimitStore } from '../../common/middleware/rate-limit.js';
import { authOf } from '../../common/middleware/require-auth.js';
import type { AppConfig } from '../../config/env.js';
import { isDemoEmail } from '../reference-data/data/demo-accounts.js';
import { emailSchema, passwordSchema, personNameSchema, phoneSchema } from '../users/user.schemas.js';
import type { AuthService, SessionGrant } from './auth.service.js';

export const REFRESH_COOKIE = 'mp_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const registerSchema = z
  .object({
    firstName: personNameSchema,
    lastName: personNameSchema,
    email: emailSchema,
    phone: z.union([phoneSchema, z.literal('').transform(() => undefined)]).optional(),
    password: passwordSchema,
  })
  .strict();

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'is required').max(128) }).strict();
const forgotSchema = z.object({ email: emailSchema }).strict();
const resetSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'is invalid'), password: passwordSchema }).strict();
const changeSchema = z.object({ currentPassword: z.string().min(1, 'is required').max(128), newPassword: passwordSchema }).strict();
const sessionIdSchema = z.string().regex(/^ses_[a-f0-9]{20}$/);

const MINUTE = 60_000;

function emailBucket(req: Request): string | undefined {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== 'string') return undefined;
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

/** The demo password is public, so a per-account bucket would only let one visitor lock everyone else out. */
function loginEmailBucket(req: Request): string | undefined {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email === 'string' && isDemoEmail(email)) return undefined;
  return emailBucket(req);
}

export interface AuthRouterDeps {
  authService: AuthService;
  config: AppConfig;
  logger: Logger;
  rateLimitStore: RateLimitStore;
  requireAuth: RequestHandler;
}

export function createAuthRouter({ authService, config, logger, rateLimitStore, requireAuth }: AuthRouterDeps): Router {
  const router = Router();
  const allowAnyOrigin = config.CORS_ORIGINS.includes('*');
  const allowedOrigins = new Set(config.CORS_ORIGINS);

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: config.REFRESH_COOKIE_SECURE,
    sameSite: config.REFRESH_COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
    // CHIPS: keeps the cross-site cookie working where third-party cookies are partitioned.
    ...(config.REFRESH_COOKIE_SAMESITE === 'none' ? { partitioned: true } : {}),
  };

  const ip = (req: Request) => req.ip ?? 'unknown';
  const limit = (name: string, max: number, windowMs: number, key: (req: Request) => string | undefined = ip) =>
    ({ name, limit: max, windowMs, key });

  /** Cookie-authenticated endpoints additionally require an allowed Origin when the browser sends one (CSRF defence). */
  const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
    const origin = req.get('origin');
    if (origin && !allowAnyOrigin && !allowedOrigins.has(origin)) throw new AppError('FORBIDDEN');
    next();
  };

  function sendGrant(res: Response, status: number, grant: SessionGrant) {
    res.cookie(REFRESH_COOKIE, grant.refreshToken, { ...cookieOptions, expires: grant.refreshExpiresAt });
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({
      data: { accessToken: grant.accessToken, tokenType: grant.tokenType, expiresIn: grant.expiresIn, user: grant.user },
    });
  }

  function clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
  }

  const userAgent = (req: Request) => req.get('user-agent') ?? '';
  const refreshCookie = (req: Request): string | undefined => {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  };

  router.post(
    '/register',
    rateLimit(rateLimitStore, logger, [limit('register-ip', 10, 60 * MINUTE)]),
    async (req, res) => {
      const input = parseWith(registerSchema, req.body);
      sendGrant(res, 201, await authService.register(input, userAgent(req)));
    },
  );

  router.post(
    '/login',
    rateLimit(rateLimitStore, logger, [limit('login-ip', 50, 15 * MINUTE), limit('login-email', 10, 15 * MINUTE, loginEmailBucket)]),
    async (req, res) => {
      const { email, password } = parseWith(loginSchema, req.body);
      sendGrant(res, 200, await authService.login(email, password, userAgent(req)));
    },
  );

  router.post(
    '/refresh',
    requireTrustedOrigin,
    rateLimit(rateLimitStore, logger, [limit('refresh-ip', 120, MINUTE)]),
    async (req, res) => {
      try {
        sendGrant(res, 200, await authService.refresh(refreshCookie(req), userAgent(req)));
      } catch (err) {
        clearCookie(res);
        throw err;
      }
    },
  );

  router.post('/logout', requireTrustedOrigin, async (req, res) => {
    await authService.logout(refreshCookie(req));
    clearCookie(res);
    res.status(204).end();
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    await authService.logoutAll(authOf(req).userId);
    clearCookie(res);
    res.status(204).end();
  });

  router.post(
    '/password/forgot',
    rateLimit(rateLimitStore, logger, [limit('forgot-ip', 20, 60 * MINUTE), limit('forgot-email', 5, 60 * MINUTE, emailBucket)]),
    async (req, res) => {
      const { email } = parseWith(forgotSchema, req.body);
      const token = await authService.requestPasswordReset(email);
      // Same response whether or not the account exists (no account enumeration).
      const data: Record<string, unknown> = { accepted: true };
      if (config.EXPOSE_SANDBOX_SECRETS && token) data.sandboxResetToken = token;
      res.setHeader('Cache-Control', 'no-store');
      res.status(202).json({ data });
    },
  );

  router.post(
    '/password/reset',
    rateLimit(rateLimitStore, logger, [limit('reset-ip', 20, 15 * MINUTE)]),
    async (req, res) => {
      const { token, password } = parseWith(resetSchema, req.body);
      await authService.resetPassword(token, password);
      clearCookie(res);
      res.status(204).end();
    },
  );

  router.post(
    '/password/change',
    requireAuth,
    rateLimit(rateLimitStore, logger, [limit('change-password-user', 10, 15 * MINUTE, (req) => req.auth?.userId)]),
    async (req, res) => {
      const { userId, sessionId } = authOf(req);
      const { currentPassword, newPassword } = parseWith(changeSchema, req.body);
      await authService.changePassword(userId, sessionId, currentPassword, newPassword);
      res.status(204).end();
    },
  );

  router.get('/sessions', requireAuth, async (req, res) => {
    const { userId, sessionId } = authOf(req);
    res.json({ data: await authService.listSessions(userId, sessionId) });
  });

  router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
    const target = sessionIdSchema.safeParse(req.params.sessionId);
    if (!target.success) throw new AppError('RESOURCE_NOT_FOUND');
    await authService.revokeSession(authOf(req).userId, target.data);
    res.status(204).end();
  });

  return router;
}
