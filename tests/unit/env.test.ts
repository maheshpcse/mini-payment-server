import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const base = {
  MONGODB_URI: 'mongodb://localhost:27017/mini_payment',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(base);
    expect(config.NODE_ENV).toBe('development');
    expect(config.APP_ENV).toBe('local');
    expect(config.PAYMENT_PROVIDER_MODE).toBe('sandbox');
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('parses comma-separated origins', () => {
    const config = loadConfig({ ...base, CORS_ORIGINS: 'https://a.example, https://b.example' });
    expect(config.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('requires database URLs', () => {
    expect(() => loadConfig({})).toThrow(/MONGODB_URI[\s\S]*REDIS_URL/);
  });

  it('rejects non-sandbox provider modes', () => {
    expect(() => loadConfig({ ...base, PAYMENT_PROVIDER_MODE: 'live' })).toThrow(/PAYMENT_PROVIDER_MODE/);
  });

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', APP_ENV: 'production', CORS_ORIGINS: '*' }),
    ).toThrow(/wildcard/);
  });

  it('requires NODE_ENV=production for staging', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'staging', CORS_ORIGINS: 'https://app.example' })).toThrow(/NODE_ENV/);
  });

  it('never echoes supplied values in validation errors', () => {
    const secretUri = 'postgres://admin:SuperSecret@db.internal';
    try {
      loadConfig({ ...base, MONGODB_URI: secretUri });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('SuperSecret');
      expect((err as Error).message).toContain('MONGODB_URI');
    }
  });
});
