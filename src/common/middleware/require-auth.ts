import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import type { AccessTokenService } from '../security/tokens.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  roles: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/**
 * Verifies the bearer access token and that its session is still active, so
 * logout, logout-all and password changes take effect immediately rather than
 * when the access token expires. Role checks (BE-005) build on `req.auth`.
 */
export function createRequireAuth(deps: {
  tokens: AccessTokenService;
  isSessionActive(userId: string, sessionId: string): Promise<boolean>;
}): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw new AppError('UNAUTHENTICATED');
    const claims = await deps.tokens.verify(token);
    if (!claims) throw new AppError('UNAUTHENTICATED');
    if (!(await deps.isSessionActive(claims.userId, claims.sessionId))) throw new AppError('AUTH_SESSION_EXPIRED');
    req.auth = claims;
    next();
  };
}

export function authOf(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw new AppError('UNAUTHENTICATED');
  return req.auth;
}
