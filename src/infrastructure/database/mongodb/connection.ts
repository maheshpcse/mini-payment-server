import mongoose from 'mongoose';
import type { Logger } from 'pino';
import { withTimeout } from '../../../common/utils/with-timeout.js';
import type { DependencyCheck } from '../../../modules/health/health.types.js';

mongoose.set('strictQuery', true);
// Casts untrusted filter objects so values such as { $ne: null } cannot act as operators.
mongoose.set('sanitizeFilter', true);

export interface MongoConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readinessCheck: DependencyCheck;
}

export function createMongoConnection(options: { uri: string; autoIndex: boolean; logger: Logger }): MongoConnection {
  const { uri, autoIndex, logger } = options;
  let stopped = false;

  mongoose.connection.on('connected', () => logger.info('mongodb connected'));
  mongoose.connection.on('disconnected', () => {
    if (!stopped) logger.warn('mongodb disconnected');
  });

  async function connect(): Promise<void> {
    let attempt = 0;
    while (!stopped) {
      try {
        // bufferCommands=false makes queries fail fast instead of queueing while the database is unavailable.
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000, autoIndex, bufferCommands: false });
        return;
      } catch (err) {
        attempt += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
        logger.error({ err: { message: (err as Error).message }, attempt, retryInMs: delay }, 'mongodb connection failed');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    connect,
    async disconnect() {
      stopped = true;
      await mongoose.disconnect();
    },
    readinessCheck: {
      name: 'mongodb',
      async check() {
        const db = mongoose.connection.db;
        if (mongoose.connection.readyState !== 1 || !db) throw new Error('not connected');
        await withTimeout(db.admin().ping(), 2_000, 'mongodb ping');
      },
    },
  };
}
