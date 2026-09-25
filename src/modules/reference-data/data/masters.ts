import { MAX_PAYMENT_METHODS } from '../../payment-methods/payment-method.model.js';
import { PAYMENT_STATUSES } from '../../payments/domain/payment-state.js';
import { DEFAULT_PREFERENCES, PAYMENT_LIMIT_CEILINGS } from '../../users/user.model.js';
import { AVATAR_MAX_BYTES } from '../../users/users.routes.js';

export const MASTER_TYPES = [
  'currency',
  'country',
  'bank',
  'upi_handle',
  'account_type',
  'payment_method_type',
  'payment_status',
  'transaction_type',
  'request_status',
  'spending_category',
  'bill_category',
  'notification_channel',
  'notification_event',
  'user_status',
  'platform_setting',
] as const;

export type MasterType = (typeof MASTER_TYPES)[number];

export interface MasterSeed {
  type: MasterType;
  code: string;
  label: string;
  order: number;
  attributes: Record<string, unknown>;
  active: boolean;
}

/** IFSC bank-code prefix → bank name. Unknown prefixes make the bank name a required input. */
export const IFSC_BANKS: Record<string, string> = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  IDIB: 'Indian Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  IDFB: 'IDFC FIRST Bank',
  FDRL: 'Federal Bank',
};

type Entry = [code: string, label: string, attributes?: Record<string, unknown>];

function list(type: MasterType, entries: Entry[]): MasterSeed[] {
  return entries.map(([code, label, attributes = {}], index) => ({ type, code, label, order: (index + 1) * 10, attributes, active: true }));
}

const PAYMENT_STATUS_LABELS: Record<(typeof PAYMENT_STATUSES)[number], [string, boolean]> = {
  CREATED: ['Created', false],
  AWAITING_AUTHORIZATION: ['Awaiting authorization', false],
  AUTHORIZED: ['Authorized', false],
  PROCESSING: ['Processing', false],
  SUCCESS: ['Successful', true],
  FAILED: ['Failed', true],
  REVERSED: ['Reversed', true],
  REFUND_PENDING: ['Refund pending', false],
  REFUNDED: ['Refunded', true],
  CANCELLED: ['Cancelled', true],
  EXPIRED: ['Expired', true],
};

export const MASTERS: MasterSeed[] = [
  ...list('currency', [['INR', 'Indian Rupee', { symbol: '₹', minorUnits: 2, locale: 'en-IN' }]]),
  ...list('country', [['IN', 'India', { dialCode: '+91', currency: 'INR' }]]),
  ...list(
    'bank',
    Object.entries(IFSC_BANKS).map(([code, name]): Entry => [code, name, { ifscPrefix: code }]),
  ),
  ...list('upi_handle', [
    ['okhdfcbank', '@okhdfcbank', { bank: 'HDFC' }],
    ['okicici', '@okicici', { bank: 'ICIC' }],
    ['oksbi', '@oksbi', { bank: 'SBIN' }],
    ['okaxis', '@okaxis', { bank: 'UTIB' }],
    ['ybl', '@ybl', { bank: 'YESB' }],
    ['paytm', '@paytm', { bank: null }],
    ['upi', '@upi', { bank: null }],
    ['minipay', '@minipay', { bank: null, sandboxOnly: true }],
  ]),
  ...list('account_type', [
    ['SAVINGS', 'Savings account'],
    ['CURRENT', 'Current account'],
  ]),
  ...list('payment_method_type', [
    ['BANK_ACCOUNT', 'Bank account'],
    ['UPI_ID', 'UPI ID'],
    ['WALLET', 'MiNi wallet'],
  ]),
  ...list(
    'payment_status',
    PAYMENT_STATUSES.map((status): Entry => [status, PAYMENT_STATUS_LABELS[status][0], { terminal: PAYMENT_STATUS_LABELS[status][1] }]),
  ),
  ...list('transaction_type', [
    ['P2P_SEND', 'Sent to a person', { direction: 'DEBIT' }],
    ['P2P_RECEIVE', 'Received from a person', { direction: 'CREDIT' }],
    ['MERCHANT', 'Merchant payment', { direction: 'DEBIT' }],
    ['BILL', 'Bill payment', { direction: 'DEBIT' }],
    ['RECHARGE', 'Mobile recharge', { direction: 'DEBIT' }],
    ['REFUND', 'Refund', { direction: 'CREDIT' }],
    ['TOP_UP', 'Sandbox top-up', { direction: 'CREDIT' }],
  ]),
  ...list('request_status', [
    ['PENDING', 'Pending'],
    ['PAID', 'Paid'],
    ['DECLINED', 'Declined'],
    ['CANCELLED', 'Cancelled'],
    ['EXPIRED', 'Expired'],
  ]),
  ...list('spending_category', [
    ['FOOD', 'Food & dining', { icon: 'UtensilsCrossed' }],
    ['GROCERIES', 'Groceries', { icon: 'ShoppingBasket' }],
    ['SHOPPING', 'Shopping', { icon: 'ShoppingBag' }],
    ['TRAVEL', 'Travel', { icon: 'Plane' }],
    ['BILLS', 'Bills & utilities', { icon: 'Landmark' }],
    ['ENTERTAINMENT', 'Entertainment', { icon: 'Clapperboard' }],
    ['HEALTH', 'Health', { icon: 'HeartPulse' }],
    ['EDUCATION', 'Education', { icon: 'GraduationCap' }],
    ['TRANSFERS', 'Transfers', { icon: 'ArrowLeftRight' }],
    ['OTHER', 'Other', { icon: 'Shapes' }],
  ]),
  ...list('bill_category', [
    ['ELECTRICITY', 'Electricity', { icon: 'Zap' }],
    ['WATER', 'Water', { icon: 'Droplets' }],
    ['GAS', 'Piped gas', { icon: 'Flame' }],
    ['BROADBAND', 'Broadband', { icon: 'Wifi' }],
    ['DTH', 'DTH', { icon: 'Tv' }],
    ['MOBILE_POSTPAID', 'Mobile postpaid', { icon: 'Smartphone' }],
    ['MOBILE_PREPAID', 'Mobile recharge', { icon: 'Smartphone' }],
    ['INSURANCE', 'Insurance', { icon: 'ShieldCheck' }],
  ]),
  ...list('notification_channel', [
    ['push', 'Push', { default: DEFAULT_PREFERENCES.notifications.channels.push }],
    ['email', 'Email', { default: DEFAULT_PREFERENCES.notifications.channels.email }],
    ['sms', 'SMS', { default: DEFAULT_PREFERENCES.notifications.channels.sms }],
  ]),
  ...list('notification_event', [
    ['payments', 'Payments', { default: DEFAULT_PREFERENCES.notifications.events.payments, mandatory: false }],
    ['requests', 'Money requests', { default: DEFAULT_PREFERENCES.notifications.events.requests, mandatory: false }],
    ['promotions', 'Offers & rewards', { default: DEFAULT_PREFERENCES.notifications.events.promotions, mandatory: false }],
    ['security', 'Security alerts', { default: true, mandatory: true }],
  ]),
  ...list('user_status', [
    ['ACTIVE', 'Active'],
    ['DISABLED', 'Disabled'],
  ]),
  ...list('platform_setting', [
    ['PER_TRANSACTION_LIMIT_CEILING_MINOR', 'Highest per-transaction limit a user may set', { value: PAYMENT_LIMIT_CEILINGS.perTransactionMinor }],
    ['DAILY_LIMIT_CEILING_MINOR', 'Highest daily limit a user may set', { value: PAYMENT_LIMIT_CEILINGS.dailyMinor }],
    ['DEFAULT_PER_TRANSACTION_LIMIT_MINOR', 'Default per-transaction limit', { value: DEFAULT_PREFERENCES.payments.perTransactionLimitMinor }],
    ['DEFAULT_DAILY_LIMIT_MINOR', 'Default daily limit', { value: DEFAULT_PREFERENCES.payments.dailyLimitMinor }],
    ['MAX_PAYMENT_METHODS', 'Linked bank accounts + UPI IDs per user', { value: MAX_PAYMENT_METHODS }],
    ['AVATAR_MAX_BYTES', 'Largest avatar upload', { value: AVATAR_MAX_BYTES }],
  ]),
];
