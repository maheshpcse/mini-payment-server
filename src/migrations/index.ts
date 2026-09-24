import type { Migration } from '../infrastructure/database/mongodb/migrations/runner.js';
import { accountsAndSessions } from './0001-accounts-and-sessions.js';

/** Ordered, append-only. Never edit or remove a migration once it has been merged. */
export const migrations: Migration[] = [accountsAndSessions];
