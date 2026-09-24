import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDeploymentEnv } from '../../src/config/deployment.js';

const SECRET_HOST = 'cluster0.secret-host.mongodb.net';
const valid = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  CORS_ORIGINS: 'https://maheshpcse.github.io',
  TRUST_PROXY_HOPS: '1',
  MONGODB_URI: `mongodb+srv://user:pw@${SECRET_HOST}/mini_payment`,
  REDIS_URL: 'redis://default:pw@redis.railway.internal:6379',
};

describe('validateDeploymentEnv', () => {
  it('accepts a Railway + Atlas production configuration', () => {
    expect(validateDeploymentEnv(valid)).toEqual([]);
  });

  it('accepts a mongodb:// URI that names a replica set', () => {
    expect(validateDeploymentEnv({ ...valid, MONGODB_URI: 'mongodb://mongo.railway.internal:27017/app?replicaSet=rs0' })).toEqual([]);
  });

  it.each([
    [{ NODE_ENV: 'development', APP_ENV: 'development' }, /NODE_ENV must be production/],
    [{ APP_ENV: 'local' }, /APP_ENV must be staging or production/],
    [{ TRUST_PROXY_HOPS: '0' }, /TRUST_PROXY_HOPS/],
    [{ LOG_LEVEL: 'debug' }, /LOG_LEVEL/],
    [{ CORS_ORIGINS: 'http://maheshpcse.github.io' }, /HTTPS origins/],
    [{ CORS_ORIGINS: 'https://maheshpcse.github.io/mini-payment-app' }, /HTTPS origins/],
    [{ CORS_ORIGINS: 'https://maheshpcse.github.io/' }, /HTTPS origins/],
    [{ CORS_ORIGINS: '*' }, /wildcard/],
    [{ MONGODB_URI: 'mongodb://localhost:27017/app?replicaSet=rs0' }, /hosted MongoDB/],
    [{ MONGODB_URI: 'mongodb://mongo.railway.internal:27017/app' }, /replica set/],
    [{ REDIS_URL: 'redis://127.0.0.1:6379' }, /hosted Redis/],
  ])('rejects %o', (override, message) => {
    expect(validateDeploymentEnv({ ...valid, ...override }).join('\n')).toMatch(message);
  });

  it('never echoes configured values', () => {
    const errors = validateDeploymentEnv({ ...valid, CORS_ORIGINS: 'http://leak.example', MONGODB_URI: `mongodb://${SECRET_HOST}/x` });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).not.toMatch(/leak\.example|secret-host/);
  });
});

describe('railway.json', () => {
  const railway = JSON.parse(readFileSync(new URL('../../railway.json', import.meta.url), 'utf8'));

  it('builds with the Dockerfile, migrates before deploy and gates on readiness', () => {
    expect(railway.build.builder).toBe('DOCKERFILE');
    expect(railway.deploy.preDeployCommand).toEqual(['node dist/scripts/deploy-prepare.js']);
    expect(railway.deploy.startCommand).toBe('node dist/server.js');
    expect(railway.deploy.healthcheckPath).toBe('/api/v1/health/ready');
  });
});
