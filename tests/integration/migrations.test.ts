import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { runMigrations } from '../../src/infrastructure/database/mongodb/migrations/runner.js';
import { mongoose } from '../../src/infrastructure/database/mongodb/mongoose.js';
import { migrations } from '../../src/migrations/index.js';
import '../../src/modules/auth/password-reset.model.js';
import '../../src/modules/auth/session.model.js';
import '../../src/modules/payment-methods/payment-method.model.js';
import '../../src/modules/reference-data/reference-data.models.js';
import '../../src/modules/users/avatar.model.js';
import '../../src/modules/users/user.model.js';
import { FAST_HASHER } from '../helpers/test-app.js';

/**
 * Production runs with autoIndex off, so migrations are the only thing that
 * creates indexes. This proves they match what the schemas declare.
 */
describe('migrations ↔ schema index parity', () => {
  const connection = mongoose.createConnection();

  beforeAll(async () => {
    await connection.openUri(inject('mongoUri'), { dbName: `test_${randomUUID().replaceAll('-', '')}`, autoIndex: false, autoCreate: false });
  });

  afterAll(async () => {
    await connection.db?.dropDatabase();
    await connection.close();
  });

  it('creates exactly the indexes every model declares', async () => {
    await runMigrations({ db: connection.db!, migrations, logger: pino({ level: 'silent' }), context: { hasher: FAST_HASHER } });
    expect(Object.keys(mongoose.models)).toEqual(expect.arrayContaining(['User', 'Role', 'Menu', 'MasterData', 'Entity']));
    for (const [name, model] of Object.entries(mongoose.models)) {
      const bound = connection.model(name, model.schema);
      const diff = await bound.diffIndexes();
      expect(diff, name).toEqual({ toDrop: [], toCreate: [] });
    }
  });
});
