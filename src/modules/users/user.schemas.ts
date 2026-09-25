import { z } from 'zod';
import { DEFAULT_PREFERENCES, PAYMENT_LIMIT_CEILINGS, type UserDocument } from './user.model.js';

export const personNameSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(50, 'must be at most 50 characters')
  .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, "may contain letters, spaces, apostrophes, dots and hyphens");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('must be a valid email address'));

/** Indian mobile numbers; stored in E.164 (+91XXXXXXXXXX). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'must be a 10-digit Indian mobile number'))
  .transform((digits) => `+91${digits}`);

/** NIST SP 800-63B: length over composition rules; upper bound protects the hasher. */
export const passwordSchema = z
  .string()
  .min(10, 'must be at least 10 characters')
  .max(128, 'must be at most 128 characters')
  .refine((value) => value.trim().length > 0 && new Set(value).size >= 4, 'is too simple');

export const profileUpdateSchema = z
  .object({
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional(),
    phone: z.union([phoneSchema, z.literal(null), z.literal('').transform(() => null)]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'provide at least one field');

const limitMinor = z.number().int().positive().max(PAYMENT_LIMIT_CEILINGS.dailyMinor);

export const preferencesUpdateSchema = z
  .object({
    notifications: z
      .object({
        channels: z.object({ push: z.boolean(), email: z.boolean(), sms: z.boolean() }).partial().strict().optional(),
        events: z
          .object({ payments: z.boolean(), requests: z.boolean(), promotions: z.boolean(), security: z.literal(true) })
          .partial()
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    payments: z
      .object({
        perTransactionLimitMinor: limitMinor.max(PAYMENT_LIMIT_CEILINGS.perTransactionMinor),
        dailyLimitMinor: limitMinor,
        hideBalance: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '').toLocaleUpperCase('en-IN');
}

export function toUserDto(user: UserDocument) {
  return {
    id: user.publicId,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    initials: `${initialOf(user.firstName)}${initialOf(user.lastName)}`,
    email: user.email,
    emailVerified: false,
    phone: user.phone ?? null,
    avatarUrl: user.avatar ? `/avatars/${user.avatar.avatarId}` : null,
    roles: user.roles,
    isDemo: user.isDemo === true,
    createdAt: user.createdAt.toISOString(),
  };
}

export type UserDto = ReturnType<typeof toUserDto>;

export function withDefaultPreferences(preferences: Partial<UserDocument['preferences']> | undefined) {
  return {
    notifications: {
      channels: { ...DEFAULT_PREFERENCES.notifications.channels, ...preferences?.notifications?.channels },
      events: { ...DEFAULT_PREFERENCES.notifications.events, ...preferences?.notifications?.events, security: true },
    },
    payments: { ...DEFAULT_PREFERENCES.payments, ...preferences?.payments },
  };
}
