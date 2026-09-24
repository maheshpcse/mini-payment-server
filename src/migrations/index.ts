import type { Migration } from '../infrastructure/database/mongodb/migrations/runner.js';

/** Ordered, append-only. Never edit or remove a migration once it has been merged. */
export const migrations: Migration[] = [];
