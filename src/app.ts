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
  app.use(
    cors({
      origin: config.CORS_ORIGINS.includes('*') ? true : config.CORS_ORIGINS,
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
