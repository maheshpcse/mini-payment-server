import { AppError } from '../../../common/errors/app-error.js';

export const PAYMENT_STATUSES = [
  'CREATED',
  'AWAITING_AUTHORIZATION',
  'AUTHORIZED',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'REVERSED',
  'REFUND_PENDING',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * The only permitted status transitions. docs/PAYMENT_LIFECYCLE.md documents
 * the meaning of each edge; update both together.
 *
 * REFUND_PENDING -> SUCCESS represents a refund the provider rejected: the
 * original payment remains settled.
 */
const TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  CREATED: ['AWAITING_AUTHORIZATION', 'CANCELLED', 'EXPIRED'],
  AWAITING_AUTHORIZATION: ['AUTHORIZED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  AUTHORIZED: ['PROCESSING', 'CANCELLED', 'EXPIRED'],
  PROCESSING: ['SUCCESS', 'FAILED'],
  SUCCESS: ['REFUND_PENDING', 'REVERSED'],
  REFUND_PENDING: ['REFUNDED', 'SUCCESS'],
  FAILED: [],
  REVERSED: [],
  REFUNDED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function allowedTransitions(from: PaymentStatus): readonly PaymentStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: PaymentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError('PAYMENT_INVALID_STATE', {
      details: { from, to, allowed: TRANSITIONS[from] },
    });
  }
}
