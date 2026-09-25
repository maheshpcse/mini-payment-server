import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { parseWith } from '../../common/http/validate.js';
import { authOf } from '../../common/middleware/require-auth.js';
import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';
import { MASTER_TYPES, type MasterSeed } from './data/masters.js';
import type { EntitySeed } from './data/entities.js';
import type { MenuSeed } from './data/menus.js';
import type { RoleCode, RoleSeed } from './data/roles.js';
import { USER_ROLES } from '../users/user.model.js';
import { EntityModel, MasterDataModel, MenuModel, RoleModel } from './reference-data.models.js';

const { trusted } = mongoose;

const GROUP_ORDER: MenuSeed['group'][] = ['PAYMENTS', 'ACCOUNT', 'ADMINISTRATION'];

const mastersQuery = z
  .object({
    types: z
      .string()
      .transform((value) => value.split(',').map((type) => type.trim()).filter(Boolean))
      .pipe(z.array(z.enum(MASTER_TYPES)).max(MASTER_TYPES.length))
      .optional(),
  })
  .strict();

const entitiesQuery = z.object({ type: z.enum(['MERCHANT', 'BILLER', 'TELECOM_OPERATOR']).optional() }).strict();

/** Public: lookup lists the sign-up and payment forms need before a user is signed in. */
export function createMastersRouter(): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const { types } = parseWith(mastersQuery, req.query);
    const rows = await MasterDataModel.find({ active: true, ...(types ? { type: trusted({ $in: types }) } : {}) })
      .sort({ type: 1, order: 1 })
      .lean<MasterSeed[]>();
    const grouped: Record<string, { code: string; label: string; attributes: Record<string, unknown> }[]> = {};
    for (const row of rows) {
      (grouped[row.type] ??= []).push({ code: row.code, label: row.label, attributes: row.attributes ?? {} });
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ data: grouped });
  });
  return router;
}

export function createMenusRouter({ requireAuth }: { requireAuth: RequestHandler }): Router {
  const router = Router();
  router.get('/', requireAuth, async (req, res) => {
    const { roles } = authOf(req);
    const known = roles.filter((role): role is RoleCode => (USER_ROLES as readonly string[]).includes(role));
    const assigned = await RoleModel.find({ code: trusted({ $in: known }) }).lean<RoleSeed[]>();
    const permissions = [...new Set(assigned.flatMap((role) => role.permissions))].sort();
    const menus = await MenuModel.find({ permission: trusted({ $in: permissions }) }).lean<MenuSeed[]>();
    menus.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.order - b.order);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.json({
      data: {
        roles,
        permissions,
        menus: menus.map(({ menuId, label, path, icon, group, order, permission, status, task, description }) => ({
          id: menuId,
          label,
          path,
          icon,
          group,
          order,
          permission,
          status,
          task: task ?? null,
          description,
        })),
      },
    });
  });
  return router;
}

export function createEntitiesRouter({ requireAuth }: { requireAuth: RequestHandler }): Router {
  const router = Router();
  router.get('/', requireAuth, async (req, res) => {
    const { type } = parseWith(entitiesQuery, req.query);
    const entities = await EntityModel.find({ active: true, ...(type ? { type } : {}) })
      .sort({ type: 1, name: 1 })
      .lean<EntitySeed[]>();
    res.json({
      data: entities.map(({ code, type: entityType, name, category, vpa, city, attributes, sandbox }) => ({
        code,
        type: entityType,
        name,
        category,
        vpa: vpa ?? null,
        city: city ?? null,
        attributes: attributes ?? {},
        sandbox,
      })),
    });
  });
  return router;
}
