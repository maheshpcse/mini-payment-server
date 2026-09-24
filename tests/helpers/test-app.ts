import { pino } from 'pino';
import { createApp } from '../../src/app.js';
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

export function buildTestApp(options: { readinessChecks?: DependencyCheck[]; env?: Record<string, string> } = {}) {
  const config = loadConfig({ ...TEST_ENV, ...options.env });
  return createApp({
    config,
    logger: pino({ level: 'silent' }),
    version: '0.0.0-test',
    readinessChecks: options.readinessChecks ?? [upCheck('mongodb'), upCheck('redis')],
  });
}
