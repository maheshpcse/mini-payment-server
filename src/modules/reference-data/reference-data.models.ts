import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';
import type { EntitySeed } from './data/entities.js';
import type { MasterSeed } from './data/masters.js';
import type { MenuSeed } from './data/menus.js';
import type { PermissionSeed, RoleSeed } from './data/roles.js';

/**
 * Reference data is owned by the files in ./data and written by migrations;
 * the API only reads it. Index declarations must match migrations 0002.
 */
const options = (collection: string) => ({ collection, timestamps: true, versionKey: false }) as const;
const attributes = { type: mongoose.Schema.Types.Mixed, default: () => ({}) };

const permissionSchema = new mongoose.Schema<PermissionSeed>(
  {
    code: { type: String, required: true },
    module: { type: String, required: true },
    description: { type: String, required: true },
    scope: { type: String, enum: ['CONSUMER', 'STAFF'], required: true },
  },
  options('permissions'),
);
permissionSchema.index({ code: 1 }, { unique: true });

const roleSchema = new mongoose.Schema<RoleSeed>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: true },
  },
  options('roles'),
);
roleSchema.index({ code: 1 }, { unique: true });

const menuSchema = new mongoose.Schema<MenuSeed>(
  {
    menuId: { type: String, required: true },
    label: { type: String, required: true },
    path: { type: String, required: true },
    icon: { type: String, required: true },
    group: { type: String, enum: ['PAYMENTS', 'ACCOUNT', 'ADMINISTRATION'], required: true },
    order: { type: Number, required: true },
    permission: { type: String, required: true },
    status: { type: String, enum: ['LIVE', 'PLANNED'], required: true },
    task: { type: String, default: null },
    description: { type: String, required: true },
  },
  options('menus'),
);
menuSchema.index({ menuId: 1 }, { unique: true });

const masterSchema = new mongoose.Schema<MasterSeed>(
  {
    type: { type: String, required: true },
    code: { type: String, required: true },
    label: { type: String, required: true },
    order: { type: Number, required: true },
    attributes,
    active: { type: Boolean, default: true },
  },
  options('master_data'),
);
masterSchema.index({ type: 1, code: 1 }, { unique: true });

const entitySchema = new mongoose.Schema<EntitySeed>(
  {
    code: { type: String, required: true },
    type: { type: String, enum: ['MERCHANT', 'BILLER', 'TELECOM_OPERATOR'], required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    vpa: { type: String, default: null },
    city: { type: String, default: null },
    attributes,
    active: { type: Boolean, default: true },
    sandbox: { type: Boolean, default: true },
  },
  options('entities'),
);
entitySchema.index({ code: 1 }, { unique: true });
entitySchema.index({ type: 1, active: 1 });
entitySchema.index({ vpa: 1 }, { unique: true, partialFilterExpression: { vpa: { $type: 'string' } } });

export const PermissionModel = mongoose.model<PermissionSeed>('Permission', permissionSchema);
export const RoleModel = mongoose.model<RoleSeed>('Role', roleSchema);
export const MenuModel = mongoose.model<MenuSeed>('Menu', menuSchema);
export const MasterDataModel = mongoose.model<MasterSeed>('MasterData', masterSchema);
export const EntityModel = mongoose.model<EntitySeed>('Entity', entitySchema);
