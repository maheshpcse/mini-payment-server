import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Browsers send `Origin` as scheme://host[:port] only, so an entry copied from
 * the address bar (e.g. https://user.github.io/repo/) is reduced to its origin.
 * Unparseable entries are kept verbatim for validation to report.
 */
export function normalizeOrigin(entry: string): string {
  const unquoted = entry.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  if (unquoted === '*') return unquoted;
  try {
    const url = new URL(unquoted);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // fall through
  }
  return unquoted;
}

const originList = z.string().transform((value) => [
  ...new Set(
    value
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean),
  ),
]);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'development', 'test', 'staging', 'production']).default('local'),
    PAYMENT_PROVIDER_MODE: z.literal('sandbox').default('sandbox'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    CORS_ORIGINS: originList.default(['http://localhost:5173']),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    REQUEST_BODY_LIMIT: z.string().regex(/^\d+(b|kb|mb)$/i).default('100kb'),
    MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// or rediss:// URL'),
    /** HMAC key for access tokens and payment-method fingerprints. Required when deployed. */
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(14),
    /**
     * `none` is needed when the app and API are on different sites (github.io → railway.app);
     * `lax` suits same-site setups such as localhost or pay.example.com + api.example.com.
     */
    REFRESH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
  })
  .superRefine((env, ctx) => {
    const isDeployed = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
    if (isDeployed && !env.JWT_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'is required in staging/production (32+ random characters)' });
    }
    if (isDeployed && env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'wildcard origin is not allowed in staging/production' });
    }
    if (isDeployed && env.NODE_ENV !== 'production') {
      ctx.addIssue({ code: 'custom', path: ['NODE_ENV'], message: 'staging/production must run with NODE_ENV=production' });
    }
  });

type ParsedEnv = z.infer<typeof envSchema>;

export type AppConfig = Omit<ParsedEnv, 'JWT_SECRET' | 'REFRESH_COOKIE_SAMESITE'> & {
  JWT_SECRET: string;
  REFRESH_COOKIE_SAMESITE: 'lax' | 'strict' | 'none';
  REFRESH_COOKIE_SECURE: boolean;
  /** Local/test only: password-reset responses include the token because no mail provider exists yet. */
  EXPOSE_SANDBOX_SECRETS: boolean;
};

/**
 * Parses configuration from environment variables. Error messages list only
 * variable names and rules, never the supplied values.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
  }
  const env = result.data;
  const isDeployed = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
  const sameSite = env.REFRESH_COOKIE_SAMESITE ?? (isDeployed ? 'none' : 'lax');
  return {
    ...env,
    // Without a configured secret (local/test only) tokens are valid until the process restarts.
    JWT_SECRET: env.JWT_SECRET ?? randomBytes(48).toString('base64url'),
    REFRESH_COOKIE_SAMESITE: sameSite,
    REFRESH_COOKIE_SECURE: isDeployed || sameSite === 'none',
    EXPOSE_SANDBOX_SECRETS: env.APP_ENV === 'local' || env.APP_ENV === 'test',
  };
}
