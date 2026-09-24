import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/errors/app-error.js';
import {
  PAYMENT_STATUSES,
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminalStatus,
  type PaymentStatus,
} from '../../src/modules/payments/domain/payment-state.js';

describe('payment state machine', () => {
  it('follows the happy path from creation to success', () => {
    const path: PaymentStatus[] = ['CREATED', 'AWAITING_AUTHORIZATION', 'AUTHORIZED', 'PROCESSING', 'SUCCESS'];
    for (let i = 1; i < path.length; i += 1) {
      expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
    }
  });

  it('supports the refund path', () => {
    expect(canTransition('SUCCESS', 'REFUND_PENDING')).toBe(true);
    expect(canTransition('REFUND_PENDING', 'REFUNDED')).toBe(true);
  });

  it.each<[PaymentStatus, PaymentStatus]>([
    ['SUCCESS', 'PROCESSING'],
    ['SUCCESS', 'FAILED'],
    ['FAILED', 'SUCCESS'],
    ['CREATED', 'SUCCESS'],
    ['CREATED', 'PROCESSING'],
    ['AWAITING_AUTHORIZATION', 'SUCCESS'],
    ['PROCESSING', 'CANCELLED'],
    ['REFUNDED', 'SUCCESS'],
    ['CANCELLED', 'AUTHORIZED'],
    ['EXPIRED', 'AUTHORIZED'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(AppError);
  });

  it('reports PAYMENT_INVALID_STATE with the allowed targets', () => {
    try {
      assertTransition('SUCCESS', 'PROCESSING');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appError = err as AppError;
      expect(appError.code).toBe('PAYMENT_INVALID_STATE');
      expect(appError.status).toBe(409);
      expect(appError.details).toEqual({ from: 'SUCCESS', to: 'PROCESSING', allowed: ['REFUND_PENDING', 'REVERSED'] });
    }
  });

  it('treats final states as terminal with no outgoing transitions', () => {
    const terminal = PAYMENT_STATUSES.filter(isTerminalStatus);
    expect(terminal.sort()).toEqual(['CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED', 'REVERSED']);
    for (const status of terminal) expect(allowedTransitions(status)).toHaveLength(0);
  });

  it('never allows a self-transition', () => {
    for (const status of PAYMENT_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it('only references known statuses', () => {
    for (const status of PAYMENT_STATUSES) {
      for (const target of allowedTransitions(status)) expect(PAYMENT_STATUSES).toContain(target);
    }
  });
});
