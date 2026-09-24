import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/docs/openapi.js';
import { buildTestApp } from '../helpers/test-app.js';

describe('OpenAPI document', () => {
  it('is served under /api/v1', async () => {
    const res = await request(buildTestApp()).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.version).toBe('0.0.0-test');
  });

  it('documents only routes that are implemented', async () => {
    const app = buildTestApp();
    const document = buildOpenApiDocument('test');
    for (const [path, operations] of Object.entries(document.paths)) {
      for (const method of Object.keys(operations)) {
        const res = await request(app)[method as 'get'](`/api/v1${path}`);
        expect(res.body?.error?.code, `${method.toUpperCase()} ${path}`).not.toBe('ROUTE_NOT_FOUND');
      }
    }
  });
});
