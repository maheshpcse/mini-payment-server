import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import {
  MIGRATION_LOCKS_COLLECTION,
  MIGRATIONS_COLLECTION,
  MigrationError,
  runMigrations,
  type Migration,
} from '../../src/infrastructure/database/mongodb/migrations/runner.js';
import { mongoose } from '../../src/infrastructure/database/mongodb/mongoose.js';
import { useTestDatabase } from '../helpers/database.js';

const logger = pino({ level: 'silent' });
const database = useTestDatabase();

function widgetMigration(calls: string[]): Migration {
  return {
    version: 1,
    name: 'create-widgets',
    async up(db) {
      calls.push('create-widgets');
      await db.createCollection('widgets').catch(() => undefined);
      await db.collection('widgets').createIndex({ sku: 1 }, { unique: true });
    },
  };
}

describe('database test harness', () => {
  it('runs against a replica set and supports multi-document transactions', async () => {
    const { db } = database;
    await db.createCollection('accounts');
    await db.collection('accounts').createIndex({ owner: 1 }, { unique: true });

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await db.collection('accounts').insertOne({ owner: 'a', balance: 100 }, { session });
      await db.collection('accounts').insertOne({ owner: 'b', balance: 0 }, { session });
    });
    await expect(
      session.withTransaction(async () => {
        await db.collection('accounts').updateOne({ owner: 'a' }, { $inc: { balance: -50 } }, { session });
        await db.collection('accounts').insertOne({ owner: 'b', balance: 50 }, { session });
      }),
    ).rejects.toMatchObject({ code: 11000 });
    await session.endSession();

    const balances = await db.collection('accounts').find({}, { projection: { _id: 0 } }).sort({ owner: 1 }).toArray();
    expect(balances).toEqual([
      { owner: 'a', balance: 100 },
      { owner: 'b', balance: 0 },
    ]);
  });
});

describe('migration runner', () => {
  it('applies pending migrations once and records them', async () => {
    const calls: string[] = [];
    const first = await runMigrations({ db: database.db, migrations: [widgetMigration(calls)], logger });
    const second = await runMigrations({ db: database.db, migrations: [widgetMigration(calls)], logger });

    expect(first).toEqual({ applied: ['0001-create-widgets'], alreadyApplied: 0 });
    expect(second).toEqual({ applied: [], alreadyApplied: 1 });
    expect(calls).toEqual(['create-widgets']);
    const indexes = await database.db.collection('widgets').indexes();
    expect(indexes.some((index) => index.name === 'sku_1' && index.unique)).toBe(true);
    expect(await database.db.collection(MIGRATIONS_COLLECTION).countDocuments()).toBe(1);
    expect(await database.db.collection(MIGRATION_LOCKS_COLLECTION).countDocuments()).toBe(0);
  });

  it('applies only migrations newer than the recorded history, in order', async () => {
    const calls: string[] = [];
    await runMigrations({ db: database.db, migrations: [widgetMigration(calls)], logger });
    const later: Migration = { version: 2, name: 'seed-nothing', up: async () => void calls.push('seed-nothing') };
    const result = await runMigrations({ db: database.db, migrations: [later, widgetMigration(calls)], logger });
    expect(result.applied).toEqual(['0002-seed-nothing']);
    expect(calls).toEqual(['create-widgets', 'seed-nothing']);
  });

  it('refuses to run when history was rewritten or is unknown to the build', async () => {
    await runMigrations({ db: database.db, migrations: [widgetMigration([])], logger });
    const renamed: Migration = { ...widgetMigration([]), name: 'renamed' };
    await expect(runMigrations({ db: database.db, migrations: [renamed], logger })).rejects.toThrow(MigrationError);
    await expect(runMigrations({ db: database.db, migrations: [], logger })).rejects.toThrow(/does not know/);
  });

  it('does not record a migration that failed, and releases the lock', async () => {
    const failing: Migration = { version: 1, name: 'boom', up: async () => Promise.reject(new Error('boom')) };
    await expect(runMigrations({ db: database.db, migrations: [failing], logger })).rejects.toThrow('boom');
    expect(await database.db.collection(MIGRATIONS_COLLECTION).countDocuments()).toBe(0);
    expect(await database.db.collection(MIGRATION_LOCKS_COLLECTION).countDocuments()).toBe(0);
  });

  it('blocks a concurrent run but takes over an expired lock', async () => {
    const locks = database.db.collection<{ _id: string; lockedAt: Date; expiresAt: Date }>(MIGRATION_LOCKS_COLLECTION);
    await locks.insertOne({ _id: 'migrations', lockedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    await expect(runMigrations({ db: database.db, migrations: [], logger })).rejects.toThrow(/holds the lock/);

    await locks.updateOne({ _id: 'migrations' }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    await expect(runMigrations({ db: database.db, migrations: [], logger })).resolves.toEqual({ applied: [], alreadyApplied: 0 });
  });

  it('rejects duplicate versions and non-kebab names before touching the database', async () => {
    const duplicate = [widgetMigration([]), { ...widgetMigration([]), name: 'other' }];
    await expect(runMigrations({ db: database.db, migrations: duplicate, logger })).rejects.toThrow(/duplicate/);
    const badName: Migration = { version: 1, name: 'Bad Name', up: async () => undefined };
    await expect(runMigrations({ db: database.db, migrations: [badName], logger })).rejects.toThrow(/kebab-case/);
  });
});
