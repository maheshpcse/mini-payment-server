import { createLogger } from '../common/logging/logger.js';
import { loadConfig } from '../config/env.js';
import { runMigrations } from '../infrastructure/database/mongodb/migrations/runner.js';
import { mongoose } from '../infrastructure/database/mongodb/mongoose.js';
import { migrations } from '../migrations/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, pretty: config.APP_ENV === 'local' });
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000, autoIndex: false });
  try {
    await runMigrations({ db: mongoose.connection.db!, migrations, logger });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
