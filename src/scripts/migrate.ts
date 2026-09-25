import { createLogger } from '../common/logging/logger.js';
import { loadConfig } from '../config/env.js';
import { applyMigrations } from '../infrastructure/database/mongodb/migrations/apply.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, pretty: config.APP_ENV === 'local' });
  await applyMigrations({
    uri: config.MONGODB_URI,
    logger,
    requireReplicaSet: false,
    context: { appEnv: config.APP_ENV, fingerprintSecret: config.JWT_SECRET },
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
