import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { buildTestApp, downCheck, TEST_ENV, upCheck } from '../helpers/test-app.js';

describe('health endpoints', () => {
  it('reports liveness with sandbox provider mode', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      service: 'mini-payment-server',
      environment: 'test',
      providerMode: 'sandbox',
      version: '0.0.0-test',
    });
  });

  it('is ready when every dependency is up', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.dependencies.map((d: { name: string }) => d.name)).toEqual(['mongodb', 'redis']);
  });

  it('returns 503 without leaking connection details when a dependency is down', async () => {
    const app = buildTestApp({ readinessChecks: [downCheck('mongodb'), upCheck('redis')] });
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.dependencies[0]).toMatchObject({ name: 'mongodb', status: 'down' });
    expect(JSON.stringify(res.body)).not.toContain('secret-host');
  });
});

describe('request ids', () => {
  it('generates a request id when none is supplied', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed inbound request id', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health').set('X-Request-Id', 'client-req-12345');
    expect(res.headers['x-request-id']).toBe('client-req-12345');
  });

  it('replaces a malformed inbound request id', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health').set('X-Request-Id', 'bad id <script>');
    expect(res.headers['x-request-id']).not.toBe('bad id <script>');
  });
});

describe('error contract', () => {
  it('returns ROUTE_NOT_FOUND with the request id for unknown routes', async () => {
    const res = await request(buildTestApp()).get('/api/v1/does-not-exist').set('X-Request-Id', 'trace-abcdef12');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String), requestId: 'trace-abcdef12' },
    });
  });

  it('returns REQUEST_MALFORMED for invalid JSON without a stack trace', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUEST_MALFORMED');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  it('returns REQUEST_TOO_LARGE above the body limit', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ note: 'x'.repeat(2048) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('REQUEST_TOO_LARGE');
  });

  it.each([
    [{ email: { $ne: null } }, 'email.$ne'],
    [{ profile: { 'a.b': 1 } }, 'profile.a.b'],
    [JSON.parse('{"__proto__": {"admin": true}}'), '__proto__'],
  ])('rejects reserved keys in request bodies (%j)', async (body, path) => {
    const res = await request(buildTestApp()).post('/api/v1/health').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toBe(path);
  });
});

describe('security headers and CORS', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('allows configured origins only', async () => {
    const allowed = await request(buildTestApp()).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-expose-headers']).toContain('x-request-id');

    const denied = await request(buildTestApp()).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers the GitHub Pages preflight when CORS_ORIGINS was pasted with the repository path', async () => {
    const app = buildTestApp({ env: { CORS_ORIGINS: 'https://maheshpcse.github.io/mini-payment-app/' } });
    const res = await request(app)
      .options('/api/v1/health/ready')
      .set('Origin', 'https://maheshpcse.github.io')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-request-id');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://maheshpcse.github.io');
    expect(res.headers['access-control-allow-headers']).toContain('x-request-id');
  });

  it('logs a rejected origin once so misconfiguration is diagnosable', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'warn' }, { write: (line: string) => void lines.push(line) });
    const app = createApp({ config: loadConfig(TEST_ENV), logger, version: 'test', readinessChecks: [] });
    await request(app).get('/api/v1/health').set('Origin', 'https://maheshpcse.github.io');
    await request(app).get('/api/v1/health').set('Origin', 'https://maheshpcse.github.io');
    const warnings = lines.map((line) => JSON.parse(line)).filter((entry) => entry.msg.startsWith('CORS'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ origin: 'https://maheshpcse.github.io', allowedOrigins: ['http://localhost:5173'] });
  });
});
