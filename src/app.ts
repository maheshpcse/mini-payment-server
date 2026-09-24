import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { createErrorHandler, notFoundHandler } from './common/middleware/error-handler.js';
import { rejectOperatorKeys } from './common/middleware/reject-operator-keys.js';
import { REQUEST_ID_HEADER, requestId } from './common/middleware/request-id.js';
import type { AppConfig } from './config/env.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import type { DependencyCheck } from './modules/health/health.types.js';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  version: string;
  readinessChecks: DependencyCheck[];
}

export function createApp({ config, logger, version, readinessChecks }: AppDependencies): Express {
  const app = express();

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
  api.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument(version));
  });
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
