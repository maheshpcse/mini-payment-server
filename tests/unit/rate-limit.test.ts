import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createMemoryRateLimitStore, rateLimit, type RateLimitStore } from '../../src/common/middleware/rate-limit.js';
import { createErrorHandler } from '../../src/common/middleware/error-handler.js';

const logger = pino({ level: 'silent' });

function appWith(store: RateLimitStore, limit = 2) {
  const app = express();
  app.get('/', rateLimit(store, logger, [{ name: 'test', limit, windowMs: 60_000, key: () => 'k' }]), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(createErrorHandler(logger));
  return app;
}

describe('rate limiting', () => {
  it('opens a new window after the previous one expires', async () => {
    let now = 0;
    const store = createMemoryRateLimitStore(() => now);
    expect((await store.hit('a', 1000)).count).toBe(1);
    expect(await store.hit('a', 1000)).toEqual({ count: 2, resetInMs: 1000 });
    now = 1000;
    expect((await store.hit('a', 1000)).count).toBe(1);
  });

  it('rejects over the limit with 429 and Retry-After', async () => {
    const app = appWith(createMemoryRateLimitStore());
    await request(app).get('/');
    await request(app).get('/');
    const res = await request(app).get('/');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
  });

  it('fails open when the store is unavailable', async () => {
    const broken: RateLimitStore = { hit: async () => Promise.reject(new Error('redis down')) };
    const res = await request(appWith(broken, 0)).get('/');
    expect(res.status).toBe(200);
  });
});
