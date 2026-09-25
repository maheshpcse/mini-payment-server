import type { USER_ROLES } from '../../users/user.model.js';

export type RoleCode = (typeof USER_ROLES)[number];

export interface PermissionSeed {
  code: string;
  module: string;
  description: string;
  /** CONSUMER permissions act on the caller's own data; STAFF ones act across users. */
  scope: 'CONSUMER' | 'STAFF';
}

export interface RoleSeed {
  code: RoleCode;
  name: string;
  description: string;
  permissions: string[];
  /** System roles are defined in code and cannot be deleted or renamed from an admin UI. */
  isSystem: true;
}

export const PERMISSIONS: PermissionSeed[] = [
  { code: 'profile.manage.own', module: 'users', scope: 'CONSUMER', description: 'View and edit own profile, avatar and preferences' },
  { code: 'security.manage.own', module: 'auth', scope: 'CONSUMER', description: 'Change own password and manage own sessions' },
  { code: 'wallet.read.own', module: 'wallets', scope: 'CONSUMER', description: 'View own sandbox wallet' },
  { code: 'payment-methods.manage.own', module: 'payment-methods', scope: 'CONSUMER', description: 'Link, unlink and choose default bank accounts and UPI IDs' },
  { code: 'payments.create', module: 'payments', scope: 'CONSUMER', description: 'Send sandbox payments' },
  { code: 'payments.read.own', module: 'transactions', scope: 'CONSUMER', description: 'View own payment history and receipts' },
  { code: 'requests.manage.own', module: 'payment-requests', scope: 'CONSUMER', description: 'Create, pay and cancel own money requests' },
  { code: 'contacts.manage.own', module: 'contacts', scope: 'CONSUMER', description: 'Manage own contacts and beneficiaries' },
  { code: 'bills.pay', module: 'bills', scope: 'CONSUMER', description: 'Pay sandbox bills and recharges' },
  { code: 'rewards.read.own', module: 'rewards', scope: 'CONSUMER', description: 'View own rewards' },
  { code: 'analytics.read.own', module: 'analytics', scope: 'CONSUMER', description: 'View own spending insights' },
  { code: 'notifications.read.own', module: 'notifications', scope: 'CONSUMER', description: 'View own notifications' },
  { code: 'users.read', module: 'users', scope: 'STAFF', description: 'Look up any user (masked personal data)' },
  { code: 'users.manage', module: 'users', scope: 'STAFF', description: 'Disable or re-enable user accounts' },
  { code: 'payments.read.any', module: 'payments', scope: 'STAFF', description: 'View any payment and its lifecycle' },
  { code: 'refunds.approve', module: 'payments', scope: 'STAFF', description: 'Approve refunds and reversals' },
  { code: 'billers.manage', module: 'bills', scope: 'STAFF', description: 'Manage sandbox billers, merchants and operators' },
  { code: 'limits.manage', module: 'risk', scope: 'STAFF', description: 'Change platform payment limits and risk rules' },
  { code: 'reconciliation.read', module: 'ledger', scope: 'STAFF', description: 'View ledger reconciliation reports' },
  { code: 'roles.manage', module: 'access-control', scope: 'STAFF', description: 'Assign roles to users' },
  { code: 'settings.manage', module: 'platform', scope: 'STAFF', description: 'Change platform settings and master data' },
  { code: 'audit.read', module: 'audit', scope: 'STAFF', description: 'Read the audit log' },
  { code: 'reports.read', module: 'reporting', scope: 'STAFF', description: 'View operational reports' },
];

const CONSUMER = PERMISSIONS.filter((permission) => permission.scope === 'CONSUMER').map((permission) => permission.code);

export const ROLES: RoleSeed[] = [
  {
    code: 'USER',
    name: 'Customer',
    description: 'Every registered account. Acts only on its own data.',
    permissions: CONSUMER,
    isSystem: true,
  },
  {
    code: 'SUPPORT',
    name: 'Support agent',
    description: 'Helps customers: reads users and payments, cannot move money or change settings.',
    permissions: ['users.read', 'payments.read.any', 'audit.read'],
    isSystem: true,
  },
  {
    code: 'OPERATIONS',
    name: 'Operations',
    description: 'Runs day-to-day payment operations: refunds, billers, limits and reconciliation.',
    permissions: ['users.read', 'payments.read.any', 'refunds.approve', 'billers.manage', 'limits.manage', 'reconciliation.read', 'reports.read'],
    isSystem: true,
  },
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Manages users, roles and platform settings. Refund approval stays with Operations (separation of duties).',
    permissions: ['users.read', 'users.manage', 'payments.read.any', 'billers.manage', 'limits.manage', 'roles.manage', 'settings.manage', 'audit.read', 'reports.read'],
    isSystem: true,
  },
  {
    code: 'AUDITOR',
    name: 'Auditor',
    description: 'Read-only access to payments, reconciliation, reports and the audit log.',
    permissions: ['payments.read.any', 'reconciliation.read', 'reports.read', 'audit.read'],
    isSystem: true,
  },
];
