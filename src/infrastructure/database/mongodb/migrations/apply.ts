import type { Logger } from 'pino';
import { migrations } from '../../../../migrations/index.js';
import { mongoose } from '../mongoose.js';
import { runMigrations, type MigrationContext } from './runner.js';

/** Connects, optionally verifies the server is a replica set, applies pending migrations and disconnects. */
export async function applyMigrations(options: {
  uri: string;
  logger: Logger;
  requireReplicaSet: boolean;
  context: Pick<MigrationContext, 'appEnv' | 'fingerprintSecret'>;
}): Promise<void> {
  const { uri, logger, requireReplicaSet, context } = options;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, autoIndex: false });
  try {
    const db = mongoose.connection.db!;
    if (requireReplicaSet) {
      const hello = await db.admin().command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid') {
        throw new Error('MongoDB is a standalone server; the ledger needs a replica set or sharded cluster for transactions');
      }
    }
    await runMigrations({ db, migrations, logger, context });
  } finally {
    await mongoose.disconnect();
  }
}
