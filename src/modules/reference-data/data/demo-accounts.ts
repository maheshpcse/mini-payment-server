import type { MigrationContext } from '../../../infrastructure/database/mongodb/migrations/runner.js';
import type { RoleCode } from './roles.js';

/**
 * Published on purpose so anyone can try the sandbox. Demo accounts cannot
 * change their password, profile or sessions, and cannot request a reset, so
 * nobody can lock others out of them.
 */
export const DEMO_PASSWORD = 'MiniPay@2026';

export interface DemoPaymentMethodSeed {
  type: 'BANK_ACCOUNT' | 'UPI_ID';
  label: string;
  vpa?: string;
  bank?: { accountNumber: string; ifsc: string; accountType: 'SAVINGS' | 'CURRENT' };
}

export interface DemoAccountSeed {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: RoleCode[];
  /** Staff accounts carry privileged roles and are never seeded into staging or production. */
  environments: 'ALL' | 'NON_DEPLOYED';
  paymentMethods: DemoPaymentMethodSeed[];
}

export const DEMO_ACCOUNTS: DemoAccountSeed[] = [
  {
    email: 'demo@example.com',
    firstName: 'Priya',
    lastName: 'Sharma',
    phone: '+919000000001',
    roles: ['USER'],
    environments: 'ALL',
    paymentMethods: [
      { type: 'UPI_ID', label: 'Personal UPI', vpa: 'priya.demo@okhdfcbank' },
      { type: 'BANK_ACCOUNT', label: 'Salary account', bank: { accountNumber: '000123456789', ifsc: 'HDFC0001234', accountType: 'SAVINGS' } },
    ],
  },
  {
    email: 'demo.friend@example.com',
    firstName: 'Rahul',
    lastName: 'Verma',
    phone: '+919000000002',
    roles: ['USER'],
    environments: 'ALL',
    paymentMethods: [{ type: 'UPI_ID', label: 'Personal UPI', vpa: 'rahul.demo@oksbi' }],
  },
  { email: 'admin.demo@example.com', firstName: 'Anita', lastName: 'Admin', phone: null, roles: ['USER', 'ADMIN'], environments: 'NON_DEPLOYED', paymentMethods: [] },
  { email: 'support.demo@example.com', firstName: 'Sanjay', lastName: 'Support', phone: null, roles: ['USER', 'SUPPORT'], environments: 'NON_DEPLOYED', paymentMethods: [] },
  { email: 'operations.demo@example.com', firstName: 'Owen', lastName: 'Operations', phone: null, roles: ['USER', 'OPERATIONS'], environments: 'NON_DEPLOYED', paymentMethods: [] },
  { email: 'auditor.demo@example.com', firstName: 'Aisha', lastName: 'Auditor', phone: null, roles: ['USER', 'AUDITOR'], environments: 'NON_DEPLOYED', paymentMethods: [] },
];

export function demoAccountsFor(appEnv: MigrationContext['appEnv']): DemoAccountSeed[] {
  const deployed = appEnv === 'staging' || appEnv === 'production';
  return DEMO_ACCOUNTS.filter((account) => account.environments === 'ALL' || !deployed);
}

const DEMO_EMAILS = new Set(DEMO_ACCOUNTS.map((account) => account.email));

export function isDemoEmail(email: string): boolean {
  return DEMO_EMAILS.has(email.trim().toLowerCase());
}
