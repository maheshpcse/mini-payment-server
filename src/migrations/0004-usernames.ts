import type { Migration } from '../infrastructure/database/mongodb/migrations/runner.js';
import { DEMO_ACCOUNTS, DEMO_USERNAMES } from '../modules/reference-data/data/demo-accounts.js';
import { RESERVED_USERNAMES } from '../modules/users/user.schemas.js';

const MAX_BASE_LENGTH = 24;

/** Email local part squeezed into the username rules (see usernameSchema). */
export function usernameBaseFromEmail(email: string): string {
  const base = (email.split('@')[0] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '.')
    .replace(/[._]{2,}/g, (run) => run[0]!)
    .replace(/^[^a-z]+/, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/[._]+$/, '');
  return base.length >= 3 ? base : `user${base ? `.${base}` : ''}`.replace(/[._]+$/, '');
}

/**
 * Sign-in by username: adds the unique handle index, gives demo accounts their
 * published handles and derives one for everybody else from their email.
 */
export const usernames: Migration = {
  version: 4,
  name: 'usernames',
  async up(db) {
    const users = db.collection<{ publicId: string; email: string; username?: string | null; isDemo?: boolean }>('users');
    await users.createIndex(
      { username: 1 },
      { name: 'username_1', unique: true, partialFilterExpression: { username: { $type: 'string' } } },
    );

    const taken = new Set(
      (await users.find({ username: { $type: 'string' } }, { projection: { username: 1 } }).toArray()).map((u) => u.username!),
    );

    for (const account of DEMO_ACCOUNTS) {
      if (taken.has(account.username)) continue;
      const result = await users.updateOne(
        { email: account.email, isDemo: true, username: { $not: { $type: 'string' } } },
        { $set: { username: account.username } },
      );
      if (result.modifiedCount > 0) taken.add(account.username);
    }

    const pending = users.find({ username: { $not: { $type: 'string' } } }, { projection: { publicId: 1, email: 1 } }).sort({ _id: 1 });
    for await (const user of pending) {
      const base = usernameBaseFromEmail(user.email);
      let candidate = base;
      for (let suffix = 2; taken.has(candidate) || RESERVED_USERNAMES.has(candidate) || DEMO_USERNAMES.has(candidate); suffix += 1) candidate = `${base}${suffix}`;
      await users.updateOne({ publicId: user.publicId }, { $set: { username: candidate } });
      taken.add(candidate);
    }
  },
};
