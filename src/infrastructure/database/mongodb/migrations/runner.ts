import type { Logger } from 'pino';
import type { mongoose } from '../mongoose.js';

type Db = mongoose.mongo.Db;

/**
 * Forward-only migration. `up` must be safe to re-run after a partial failure
 * (e.g. `createIndex` is idempotent), because a crash between `up` and the
 * history insert re-executes it on the next run.
 */
export interface Migration {
  version: number;
  name: string;
  up(db: Db): Promise<void>;
}

export interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: Date;
  durationMs: number;
}

interface MigrationLock {
  _id: string;
  lockedAt: Date;
  expiresAt: Date;
}

export const MIGRATIONS_COLLECTION = 'migrations';
export const MIGRATION_LOCKS_COLLECTION = 'migration_locks';
const LOCK_ID = 'migrations';
const LOCK_TTL_MS = 10 * 60_000;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export function validateMigrations(migrations: readonly Migration[]): Migration[] {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  sorted.forEach((migration, index) => {
    if (!Number.isSafeInteger(migration.version) || migration.version <= 0) {
      throw new MigrationError(`migration "${migration.name}" has an invalid version ${migration.version}`);
    }
    if (index > 0 && sorted[index - 1]!.version === migration.version) {
      throw new MigrationError(`duplicate migration version ${migration.version}`);
    }
    if (!/^[a-z0-9-]+$/.test(migration.name)) {
      throw new MigrationError(`migration name "${migration.name}" must be kebab-case`);
    }
  });
  return sorted;
}

async function acquireLock(db: Db, now: Date): Promise<void> {
  const locks = db.collection<MigrationLock>(MIGRATION_LOCKS_COLLECTION);
  const lock = { lockedAt: now, expiresAt: new Date(now.getTime() + LOCK_TTL_MS) };
  try {
    await locks.insertOne({ _id: LOCK_ID, ...lock });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    // A crashed runner leaves its lock behind; take it over only once it has expired.
    const takenOver = await locks.findOneAndUpdate({ _id: LOCK_ID, expiresAt: { $lt: now } }, { $set: lock });
    if (!takenOver) throw new MigrationError('another migration run holds the lock');
  }
}

export async function runMigrations(options: {
  db: Db;
  migrations: readonly Migration[];
  logger: Logger;
  now?: () => Date;
}): Promise<{ applied: string[]; alreadyApplied: number }> {
  const { db, logger } = options;
  const now = options.now ?? (() => new Date());
  const migrations = validateMigrations(options.migrations);
  const history = db.collection<MigrationRecord>(MIGRATIONS_COLLECTION);

  await acquireLock(db, now());
  try {
    await history.createIndex({ version: 1 }, { unique: true });
    const records = await history.find({}, { projection: { _id: 0, version: 1, name: 1 } }).toArray();
    const recorded = new Map(records.map((record) => [record.version, record.name]));

    for (const [version, name] of recorded) {
      const known = migrations.find((migration) => migration.version === version);
      if (!known) throw new MigrationError(`database has migration ${version} (${name}) that this build does not know`);
      if (known.name !== name) {
        throw new MigrationError(`migration ${version} is recorded as "${name}" but this build calls it "${known.name}"`);
      }
    }

    const applied: string[] = [];
    for (const migration of migrations) {
      if (recorded.has(migration.version)) continue;
      const label = `${String(migration.version).padStart(4, '0')}-${migration.name}`;
      const startedAt = Date.now();
      logger.info({ migration: label }, 'applying migration');
      await migration.up(db);
      await history.insertOne({
        version: migration.version,
        name: migration.name,
        appliedAt: now(),
        durationMs: Date.now() - startedAt,
      });
      applied.push(label);
    }
    logger.info({ applied: applied.length, alreadyApplied: recorded.size }, 'migrations complete');
    return { applied, alreadyApplied: recorded.size };
  } finally {
    await db.collection<MigrationLock>(MIGRATION_LOCKS_COLLECTION).deleteOne({ _id: LOCK_ID });
  }
}
