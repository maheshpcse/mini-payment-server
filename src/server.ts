import { createRequire } from 'node:module';
import { createApp } from './app.js';
import { createLogger } from './common/logging/logger.js';
import { loadConfig } from './config/env.js';
import { createMongoConnection } from './infrastructure/database/mongodb/connection.js';
import { createRedisConnection } from './infrastructure/database/redis/connection.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, pretty: config.APP_ENV === 'local' });

  const mongo = createMongoConnection({ uri: config.MONGODB_URI, autoIndex: config.NODE_ENV !== 'production', logger });
  const redis = createRedisConnection({ url: config.REDIS_URL, logger });

  const app = createApp({ config, logger, version, readinessChecks: [mongo.readinessCheck, redis.readinessCheck] });

  // The HTTP server starts before dependencies connect so liveness/readiness can report outages.
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, environment: config.APP_ENV, providerMode: config.PAYMENT_PROVIDER_MODE }, 'server listening');
  });
  void mongo.connect();
  void redis.connect();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(async () => {
      await Promise.allSettled([mongo.disconnect(), redis.disconnect()]);
      logger.info('shutdown complete');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
