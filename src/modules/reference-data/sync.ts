import type { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';
import { ENTITIES } from './data/entities.js';
import { MASTERS } from './data/masters.js';
import { MENUS } from './data/menus.js';
import { PERMISSIONS, ROLES } from './data/roles.js';

type Db = mongoose.mongo.Db;
type Row = Record<string, unknown>;

async function upsertAll(db: Db, collection: string, rows: Row[], keyOf: (row: Row) => Row, now: Date) {
  if (rows.length === 0) return;
  await db.collection(collection).bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: keyOf(row),
        update: { $set: { ...row, updatedAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

/**
 * Makes the reference collections match ./data. Safe to run any number of
 * times. Code-owned rows (roles, permissions, menus) that were removed from
 * the files are deleted; masters and entities are deactivated instead because
 * payments may still reference them.
 */
export async function syncReferenceData(db: Db, now = new Date()): Promise<void> {
  await upsertAll(db, 'permissions', PERMISSIONS as unknown as Row[], (row) => ({ code: row.code }), now);
  await db.collection('permissions').deleteMany({ code: { $nin: PERMISSIONS.map((permission) => permission.code) } });

  await upsertAll(db, 'roles', ROLES as unknown as Row[], (row) => ({ code: row.code }), now);
  await db.collection('roles').deleteMany({ code: { $nin: ROLES.map((role) => role.code) } });

  await upsertAll(db, 'menus', MENUS as unknown as Row[], (row) => ({ menuId: row.menuId }), now);
  await db.collection('menus').deleteMany({ menuId: { $nin: MENUS.map((menu) => menu.menuId) } });

  await upsertAll(db, 'master_data', MASTERS as unknown as Row[], (row) => ({ type: row.type, code: row.code }), now);
  await db.collection('master_data').updateMany(
    { $nor: MASTERS.map((master) => ({ type: master.type, code: master.code })), active: true },
    { $set: { active: false, updatedAt: now } },
  );

  await upsertAll(db, 'entities', ENTITIES as unknown as Row[], (row) => ({ code: row.code }), now);
  await db.collection('entities').updateMany(
    { code: { $nin: ENTITIES.map((entity) => entity.code) }, active: true },
    { $set: { active: false, updatedAt: now } },
  );
}
