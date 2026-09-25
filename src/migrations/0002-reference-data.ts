import type { Migration } from '../infrastructure/database/mongodb/migrations/runner.js';
import { syncReferenceData } from '../modules/reference-data/sync.js';

/**
 * Roles, permissions, menus, master data and sandbox entities. Indexes must
 * match reference-data.models.ts (parity-tested). To change the data later,
 * edit src/modules/reference-data/data and add a migration that calls
 * syncReferenceData again.
 */
export const referenceData: Migration = {
  version: 2,
  name: 'reference-data',
  async up(db) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    for (const name of ['permissions', 'roles', 'menus', 'master_data', 'entities']) {
      if (!existing.has(name)) await db.createCollection(name);
    }

    await db.collection('permissions').createIndexes([{ key: { code: 1 }, name: 'code_1', unique: true }]);
    await db.collection('roles').createIndexes([{ key: { code: 1 }, name: 'code_1', unique: true }]);
    await db.collection('menus').createIndexes([{ key: { menuId: 1 }, name: 'menuId_1', unique: true }]);
    await db.collection('master_data').createIndexes([{ key: { type: 1, code: 1 }, name: 'type_1_code_1', unique: true }]);
    await db.collection('entities').createIndexes([
      { key: { code: 1 }, name: 'code_1', unique: true },
      { key: { type: 1, active: 1 }, name: 'type_1_active_1' },
      { key: { vpa: 1 }, name: 'vpa_1', unique: true, partialFilterExpression: { vpa: { $type: 'string' } } },
    ]);

    await syncReferenceData(db);
  },
};
