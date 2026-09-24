import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import { mongoose } from '../../src/infrastructure/database/mongodb/mongoose.js';

/**
 * Connects the shared mongoose instance to a database unique to this test
 * file, and drops it afterwards. Collections are emptied after each test
 * unless `keepDataBetweenTests` is set; indexes are kept.
 */
export function useTestDatabase(options: { keepDataBetweenTests?: boolean } = {}) {
  const dbName = `test_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    await mongoose.connect(inject('mongoUri'), { dbName, autoIndex: true, serverSelectionTimeoutMS: 10_000 });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  });

  if (!options.keepDataBetweenTests) {
    afterEach(async () => {
      const collections = await mongoose.connection.db!.collections();
      await Promise.all(collections.map((collection) => collection.deleteMany({})));
    });
  }

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  return {
    get db() {
      return mongoose.connection.db!;
    },
  };
}
