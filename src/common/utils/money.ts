import { AppError } from '../errors/app-error.js';

/**
 * Money is represented as an integer count of the currency's minor unit
 * (e.g. paise for INR). Floating-point arithmetic is never applied to amounts;
 * decimal strings are converted by string manipulation only.
 */
export const CURRENCIES = {
  INR: { exponent: 2 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCIES, value);
}

function assertSafeMinor(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new AppError('PAYMENT_INVALID_AMOUNT', { message: 'Amount must be a safe integer number of minor units.' });
  }
  return value;
}

/** Converts a user-facing decimal string such as "10.23" to minor units (1023). */
export function toMinorUnits(amount: string, currency: CurrencyCode): number {
  const { exponent } = CURRENCIES[currency];
  const pattern = new RegExp(`^(\\d{1,13})(?:\\.(\\d{1,${exponent}}))?$`);
  const match = pattern.exec(amount.trim());
  if (!match) {
    throw new AppError('PAYMENT_INVALID_AMOUNT', {
      message: `Amount must be a non-negative decimal with at most ${exponent} fractional digits.`,
    });
  }
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(exponent, '0');
  return assertSafeMinor(Number(`${whole}${fraction}`));
}

/** Formats minor units as a plain decimal string ("1023" -> "10.23"), without currency symbols. */
export function formatMinorUnits(minor: number, currency: CurrencyCode): string {
  assertSafeMinor(minor);
  const exponent: number = CURRENCIES[currency].exponent;
  const sign = minor < 0 ? '-' : '';
  const digits = Math.abs(minor).toString().padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return exponent === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

export function addMinor(a: number, b: number): number {
  return assertSafeMinor(assertSafeMinor(a) + assertSafeMinor(b));
}

export function subtractMinor(a: number, b: number): number {
  return assertSafeMinor(assertSafeMinor(a) - assertSafeMinor(b));
}

export function assertPositiveMinor(minor: number): number {
  if (assertSafeMinor(minor) <= 0) {
    throw new AppError('PAYMENT_INVALID_AMOUNT', { message: 'Amount must be greater than zero.' });
  }
  return minor;
}
