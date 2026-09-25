import type { Migration } from '../infrastructure/database/mongodb/migrations/runner.js';

/** Must match the indexes declared on the corresponding Mongoose schemas (parity-tested). */
export const accountsAndSessions: Migration = {
  version: 1,
  name: 'accounts-and-sessions',
  async up(db) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    for (const name of ['users', 'sessions', 'password_resets', 'avatars', 'payment_methods']) {
      if (!existing.has(name)) await db.createCollection(name);
    }

    await db.collection('users').createIndexes([
      { key: { publicId: 1 }, name: 'publicId_1', unique: true },
      { key: { email: 1 }, name: 'email_1', unique: true },
      { key: { phone: 1 }, name: 'phone_1', unique: true, partialFilterExpression: { phone: { $type: 'string' } } },
    ]);
    await db.collection('sessions').createIndexes([
      { key: { sessionId: 1 }, name: 'sessionId_1', unique: true },
      { key: { userId: 1, revokedAt: 1 }, name: 'userId_1_revokedAt_1' },
      { key: { expiresAt: 1 }, name: 'expiresAt_1', expireAfterSeconds: 0 },
    ]);
    await db.collection('password_resets').createIndexes([
      { key: { tokenHash: 1 }, name: 'tokenHash_1', unique: true },
      { key: { userId: 1 }, name: 'userId_1' },
      { key: { expiresAt: 1 }, name: 'expiresAt_1', expireAfterSeconds: 0 },
    ]);
    await db.collection('avatars').createIndexes([
      { key: { avatarId: 1 }, name: 'avatarId_1', unique: true },
      { key: { userId: 1 }, name: 'userId_1' },
    ]);
    await db.collection('payment_methods').createIndexes([
      { key: { publicId: 1 }, name: 'publicId_1', unique: true },
      { key: { userId: 1, uniqueKey: 1 }, name: 'userId_1_uniqueKey_1', unique: true },
      { key: { userId: 1, createdAt: 1 }, name: 'userId_1_createdAt_1' },
    ]);
  },
};
