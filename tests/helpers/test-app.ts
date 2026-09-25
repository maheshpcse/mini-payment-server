import { pino } from 'pino';
import { createApp } from '../../src/app.js';
import type { RateLimitStore } from '../../src/common/middleware/rate-limit.js';
import { createPasswordHasher } from '../../src/common/security/password-hasher.js';
import { loadConfig } from '../../src/config/env.js';
import type { DependencyCheck } from '../../src/modules/health/health.types.js';

export const TEST_ENV = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/mini_payment_test',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'http://localhost:5173',
  REQUEST_BODY_LIMIT: '1kb',
} as const;

export function upCheck(name: string): DependencyCheck {
  return { name, check: async () => undefined };
}

export function downCheck(name: string): DependencyCheck {
  return {
    name,
    check: async () => {
      throw new Error('connect ECONNREFUSED secret-host.internal:27017');
    },
  };
}

/** Minimal Argon2id cost so auth suites stay fast; production uses OWASP_ARGON2. */
export const FAST_HASHER = createPasswordHasher({ memoryCost: 1024, timeCost: 1, parallelism: 1 });

export function buildTestApp(
  options: { readinessChecks?: DependencyCheck[]; env?: Record<string, string>; rateLimitStore?: RateLimitStore } = {},
) {
  const config = loadConfig({ ...TEST_ENV, ...options.env });
  return createApp({
    config,
    logger: pino({ level: 'silent' }),
    version: '0.0.0-test',
    readinessChecks: options.readinessChecks ?? [upCheck('mongodb'), upCheck('redis')],
    passwordHasher: FAST_HASHER,
    ...(options.rateLimitStore ? { rateLimitStore: options.rateLimitStore } : {}),
  });
}
