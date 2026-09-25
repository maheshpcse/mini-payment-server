import { createLogger } from '../common/logging/logger.js';
import { validateDeploymentEnv } from '../config/deployment.js';
import { loadConfig } from '../config/env.js';
import { applyMigrations } from '../infrastructure/database/mongodb/migrations/apply.js';

/** Railway pre-deploy step: a nonzero exit stops the release before traffic moves to it. */
async function main(): Promise<void> {
  const errors = validateDeploymentEnv(process.env);
  if (errors.length > 0) throw new Error(`Deployment configuration invalid:\n- ${errors.join('\n- ')}`);
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, pretty: false });
  await applyMigrations({
    uri: config.MONGODB_URI,
    logger,
    requireReplicaSet: true,
    context: { appEnv: config.APP_ENV, fingerprintSecret: config.JWT_SECRET },
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`deploy:prepare failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
