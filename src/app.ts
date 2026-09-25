import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { createErrorHandler, notFoundHandler } from './common/middleware/error-handler.js';
import { createMemoryRateLimitStore, type RateLimitStore } from './common/middleware/rate-limit.js';
import { rejectOperatorKeys } from './common/middleware/reject-operator-keys.js';
import { REQUEST_ID_HEADER, requestId } from './common/middleware/request-id.js';
import { createRequireAuth } from './common/middleware/require-auth.js';
import { createPasswordHasher, type PasswordHasher } from './common/security/password-hasher.js';
import { createAccessTokenService } from './common/security/tokens.js';
import type { AppConfig } from './config/env.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import type { DependencyCheck } from './modules/health/health.types.js';
import { createPaymentMethodsRouter, createWalletsRouter } from './modules/payment-methods/payment-methods.routes.js';
import { createAvatarsRouter, createUsersRouter } from './modules/users/users.routes.js';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  version: string;
  readinessChecks: DependencyCheck[];
  /** Defaults to an in-process store; production passes the Redis store so limits hold across instances. */
  rateLimitStore?: RateLimitStore;
  passwordHasher?: PasswordHasher;
}

export function createApp({ config, logger, version, readinessChecks, rateLimitStore, passwordHasher }: AppDependencies): Express {
  const app = express();
  const tokens = createAccessTokenService({ secret: config.JWT_SECRET, ttlSeconds: config.ACCESS_TOKEN_TTL_SECONDS });
  const authService = createAuthService({
    hasher: passwordHasher ?? createPasswordHasher(),
    tokens,
    refreshTokenTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    logger,
  });
  const requireAuth = createRequireAuth({ tokens, isSessionActive: authService.isSessionActive });

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.set('query parser', 'simple');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      customProps: (req) => ({ requestId: (req as express.Request).requestId }),
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
    }),
  );
  app.use(helmet());
  const allowAnyOrigin = config.CORS_ORIGINS.includes('*');
  const allowedOrigins = new Set(config.CORS_ORIGINS);
  const reportedOrigins = new Set<string>();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowAnyOrigin || allowedOrigins.has(origin)) return callback(null, true);
        // One warning per distinct origin (bounded) so a misconfigured CORS_ORIGINS is visible in the logs.
        if (reportedOrigins.size < 50 && !reportedOrigins.has(origin)) {
          reportedOrigins.add(origin);
          logger.warn(
            { origin: origin.slice(0, 200), allowedOrigins: config.CORS_ORIGINS },
            'CORS: origin not allowed; add it to CORS_ORIGINS if it is a legitimate frontend',
          );
        }
        return callback(null, false);
      },
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER],
    }),
  );
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(rejectOperatorKeys);

  const api = express.Router();
  api.use(
    '/health',
    createHealthRouter({
      version,
      environment: config.APP_ENV,
      providerMode: config.PAYMENT_PROVIDER_MODE,
      readinessChecks,
    }),
  );
  api.use(
    '/auth',
    createAuthRouter({ authService, config, logger, rateLimitStore: rateLimitStore ?? createMemoryRateLimitStore(), requireAuth }),
  );
  api.use('/users', createUsersRouter({ requireAuth }));
  api.use('/avatars', createAvatarsRouter());
  api.use('/payment-methods', createPaymentMethodsRouter({ requireAuth, fingerprintSecret: config.JWT_SECRET }));
  api.use('/wallets', createWalletsRouter({ requireAuth }));
  api.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument(version));
  });
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
