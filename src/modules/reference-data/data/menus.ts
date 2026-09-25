export interface MenuSeed {
  menuId: string;
  label: string;
  path: string;
  /** lucide-react icon name used by the web app */
  icon: string;
  group: 'PAYMENTS' | 'ACCOUNT' | 'ADMINISTRATION';
  order: number;
  permission: string;
  status: 'LIVE' | 'PLANNED';
  /** TASKS.md id that delivers the page while it is PLANNED */
  task: string | null;
  description: string;
}

/** Consumer entries mirror mini-payment-app `src/config/navigation.ts`; keep ids and paths in sync. */
export const MENUS: MenuSeed[] = [
  { menuId: 'home', label: 'Home', path: '/', icon: 'House', group: 'PAYMENTS', order: 10, permission: 'wallet.read.own', status: 'LIVE', task: null, description: 'Sandbox workspace overview.' },
  { menuId: 'pay', label: 'Pay', path: '/pay', icon: 'Send', group: 'PAYMENTS', order: 20, permission: 'payments.create', status: 'PLANNED', task: 'FE-008', description: 'Send sandbox money to a contact, payment ID or QR recipient.' },
  { menuId: 'scan', label: 'Scan', path: '/scan', icon: 'ScanLine', group: 'PAYMENTS', order: 30, permission: 'payments.create', status: 'PLANNED', task: 'FE-010', description: 'Scan or upload a demo QR code and pay a sandbox recipient.' },
  { menuId: 'contacts', label: 'Contacts', path: '/contacts', icon: 'Users', group: 'PAYMENTS', order: 40, permission: 'contacts.manage.own', status: 'PLANNED', task: 'FE-007', description: 'People-first list of recipients, favorites and beneficiaries.' },
  { menuId: 'transactions', label: 'Transactions', path: '/transactions', icon: 'ReceiptText', group: 'PAYMENTS', order: 50, permission: 'payments.read.own', status: 'PLANNED', task: 'FE-009', description: 'Timeline of sandbox payments with filters, details and receipts.' },
  { menuId: 'wallets', label: 'Wallets', path: '/wallets', icon: 'WalletCards', group: 'PAYMENTS', order: 60, permission: 'payment-methods.manage.own', status: 'LIVE', task: null, description: 'MiNi wallet, linked bank accounts and UPI IDs (sandbox).' },
  { menuId: 'bills', label: 'Bills', path: '/bills', icon: 'Landmark', group: 'PAYMENTS', order: 70, permission: 'bills.pay', status: 'PLANNED', task: 'FE-012', description: 'Sandbox billers, reminders and autopay simulation.' },
  { menuId: 'recharge', label: 'Recharge', path: '/recharge', icon: 'Smartphone', group: 'PAYMENTS', order: 80, permission: 'bills.pay', status: 'PLANNED', task: 'FE-012', description: 'Mobile recharge simulation with operator plans.' },
  { menuId: 'rewards', label: 'Rewards', path: '/rewards', icon: 'Gift', group: 'PAYMENTS', order: 90, permission: 'rewards.read.own', status: 'PLANNED', task: 'FE-013', description: 'Points, streaks and cashback simulations. No real monetary value.' },
  { menuId: 'analytics', label: 'Analytics', path: '/analytics', icon: 'ChartPie', group: 'PAYMENTS', order: 100, permission: 'analytics.read.own', status: 'PLANNED', task: 'FE-014', description: 'Spending and receiving insights from your sandbox activity.' },
  { menuId: 'notifications', label: 'Notifications', path: '/notifications', icon: 'Bell', group: 'PAYMENTS', order: 110, permission: 'notifications.read.own', status: 'PLANNED', task: 'FE-011', description: 'Real-time payment, request and security notifications.' },
  { menuId: 'profile', label: 'Profile', path: '/profile', icon: 'UserRound', group: 'ACCOUNT', order: 10, permission: 'profile.manage.own', status: 'LIVE', task: null, description: 'Your name, contact details and avatar.' },
  { menuId: 'security', label: 'Security', path: '/settings/security', icon: 'ShieldCheck', group: 'ACCOUNT', order: 20, permission: 'security.manage.own', status: 'LIVE', task: null, description: 'Password and signed-in sessions.' },
  { menuId: 'settings', label: 'Settings', path: '/settings', icon: 'Settings', group: 'ACCOUNT', order: 30, permission: 'profile.manage.own', status: 'LIVE', task: null, description: 'Notifications, payments and appearance.' },
  { menuId: 'admin-users', label: 'Users', path: '/admin/users', icon: 'UsersRound', group: 'ADMINISTRATION', order: 10, permission: 'users.read', status: 'PLANNED', task: 'FE-028', description: 'Find customers and review their account status.' },
  { menuId: 'admin-payments', label: 'Payments', path: '/admin/payments', icon: 'ArrowLeftRight', group: 'ADMINISTRATION', order: 20, permission: 'payments.read.any', status: 'PLANNED', task: 'FE-028', description: 'Search payments and inspect their lifecycle.' },
  { menuId: 'admin-refunds', label: 'Refunds', path: '/admin/refunds', icon: 'Undo2', group: 'ADMINISTRATION', order: 30, permission: 'refunds.approve', status: 'PLANNED', task: 'FE-028', description: 'Review and approve refund requests.' },
  { menuId: 'admin-billers', label: 'Billers & merchants', path: '/admin/billers', icon: 'Store', group: 'ADMINISTRATION', order: 40, permission: 'billers.manage', status: 'PLANNED', task: 'FE-028', description: 'Sandbox billers, merchants and telecom operators.' },
  { menuId: 'admin-limits', label: 'Limits & risk', path: '/admin/limits', icon: 'Gauge', group: 'ADMINISTRATION', order: 50, permission: 'limits.manage', status: 'PLANNED', task: 'FE-028', description: 'Platform payment limits and risk rules.' },
  { menuId: 'admin-reconciliation', label: 'Reconciliation', path: '/admin/reconciliation', icon: 'Scale', group: 'ADMINISTRATION', order: 60, permission: 'reconciliation.read', status: 'PLANNED', task: 'FE-028', description: 'Ledger balance checks and mismatches.' },
  { menuId: 'admin-roles', label: 'Roles', path: '/admin/roles', icon: 'KeyRound', group: 'ADMINISTRATION', order: 70, permission: 'roles.manage', status: 'PLANNED', task: 'FE-028', description: 'Assign staff roles.' },
  { menuId: 'admin-settings', label: 'Platform settings', path: '/admin/settings', icon: 'SlidersHorizontal', group: 'ADMINISTRATION', order: 80, permission: 'settings.manage', status: 'PLANNED', task: 'FE-028', description: 'Master data and platform configuration.' },
  { menuId: 'admin-audit', label: 'Audit log', path: '/admin/audit-logs', icon: 'ScrollText', group: 'ADMINISTRATION', order: 90, permission: 'audit.read', status: 'PLANNED', task: 'FE-028', description: 'Who did what, when, from which request.' },
  { menuId: 'admin-reports', label: 'Reports', path: '/admin/reports', icon: 'FileBarChart', group: 'ADMINISTRATION', order: 100, permission: 'reports.read', status: 'PLANNED', task: 'FE-028', description: 'Operational volume and success-rate reports.' },
];
