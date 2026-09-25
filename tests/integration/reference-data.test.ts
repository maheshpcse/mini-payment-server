import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations, type MigrationContext } from '../../src/infrastructure/database/mongodb/migrations/runner.js';
import { migrations } from '../../src/migrations/index.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../src/modules/reference-data/data/demo-accounts.js';
import { ENTITIES } from '../../src/modules/reference-data/data/entities.js';
import { MASTERS } from '../../src/modules/reference-data/data/masters.js';
import { MENUS } from '../../src/modules/reference-data/data/menus.js';
import { PERMISSIONS, ROLES } from '../../src/modules/reference-data/data/roles.js';
import { syncReferenceData } from '../../src/modules/reference-data/sync.js';
import { useTestDatabase } from '../helpers/database.js';
import { buildTestApp, FAST_HASHER } from '../helpers/test-app.js';

const database = useTestDatabase();
const SECRET = 'reference-data-test-secret-0123456789abcdef';
const logger = pino({ level: 'silent' });

function migrate(appEnv: MigrationContext['appEnv'] = 'test') {
  return runMigrations({ db: database.db, migrations, logger, context: { appEnv, fingerprintSecret: SECRET, hasher: FAST_HASHER } });
}

const app = () => buildTestApp({ env: { JWT_SECRET: SECRET } });

async function login(email: string, password = DEMO_PASSWORD, target = app()) {
  const res = await request(target).post('/api/v1/auth/login').send({ email, password });
  return { res, app: target, auth: { Authorization: `Bearer ${res.body.data?.accessToken as string}` } };
}

describe('reference data migration', () => {
  beforeEach(() => migrate());

  it('writes every role, permission, menu, master and entity from the data files', async () => {
    const count = (name: string) => database.db.collection(name).countDocuments();
    expect(await count('permissions')).toBe(PERMISSIONS.length);
    expect(await count('roles')).toBe(ROLES.length);
    expect(await count('menus')).toBe(MENUS.length);
    expect(await count('master_data')).toBe(MASTERS.length);
    expect(await count('entities')).toBe(ENTITIES.length);
  });

  it('is idempotent and removes or deactivates rows dropped from the files', async () => {
    await database.db.collection('menus').insertOne({ menuId: 'retired', label: 'Old' });
    await database.db.collection('master_data').insertOne({ type: 'bank', code: 'OLDB', label: 'Old bank', active: true });
    await syncReferenceData(database.db);
    await syncReferenceData(database.db);
    expect(await database.db.collection('menus').countDocuments()).toBe(MENUS.length);
    expect(await database.db.collection('master_data').findOne({ code: 'OLDB' })).toMatchObject({ active: false });
    expect(await database.db.collection('roles').countDocuments()).toBe(ROLES.length);
  });

  it('only references permissions that exist', () => {
    const codes = new Set(PERMISSIONS.map((permission) => permission.code));
    for (const role of ROLES) for (const permission of role.permissions) expect(codes, role.code).toContain(permission);
    for (const menu of MENUS) expect(codes, menu.menuId).toContain(menu.permission);
  });
});

describe('demo accounts', () => {
  it('seeds every demo login outside staging/production, with linked payment methods', async () => {
    await migrate('test');
    for (const account of DEMO_ACCOUNTS) {
      const { res } = await login(account.email);
      expect(res.status, account.email).toBe(200);
      expect(res.body.data.user).toMatchObject({ email: account.email, isDemo: true, roles: account.roles });
    }
    const priya = await login('demo@example.com');
    const methods = await request(priya.app).get('/api/v1/payment-methods').set(priya.auth);
    expect(methods.body.data).toHaveLength(2);
    expect(methods.body.data[0]).toMatchObject({ type: 'UPI_ID', isDefault: true, upi: { vpa: 'priya.demo@okhdfcbank' } });
    expect(methods.body.data[1].bank).toMatchObject({ bankName: 'HDFC Bank', accountLast4: '6789', ifsc: 'HDFC0001234' });

    // Seeded fingerprints use the API's key, so re-linking the same account is a duplicate.
    const again = await request(priya.app)
      .post('/api/v1/payment-methods/bank-accounts')
      .set(priya.auth)
      .send({ accountHolderName: 'Priya Sharma', accountNumber: '000123456789', ifsc: 'HDFC0001234' });
    expect(again.status).toBe(409);
  });

  it('never seeds staff demo accounts in production', async () => {
    await migrate('production');
    expect((await login('demo@example.com')).res.status).toBe(200);
    for (const email of ['admin.demo@example.com', 'support.demo@example.com', 'operations.demo@example.com', 'auditor.demo@example.com']) {
      expect((await login(email)).res.status, email).toBe(401);
    }
  });

  it('leaves an existing non-demo account with a demo address untouched', async () => {
    const target = app();
    await request(target)
      .post('/api/v1/auth/register')
      .send({ firstName: 'Real', lastName: 'Person', email: 'demo@example.com', password: 'correct horse battery' });
    await migrate('test');
    expect((await login('demo@example.com', DEMO_PASSWORD, target)).res.status).toBe(401);
    const real = await login('demo@example.com', 'correct horse battery', target);
    expect(real.res.body.data.user.isDemo).toBe(false);
    expect(await database.db.collection('payment_methods').countDocuments()).toBe(1);
  });

  it('blocks changes that would let one visitor lock others out', async () => {
    await migrate('test');
    const { app: target, auth } = await login('demo@example.com');
    const other = await login('demo@example.com', DEMO_PASSWORD, target);
    const restricted = [
      request(target).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: DEMO_PASSWORD, newPassword: 'another long password' }),
      request(target).post('/api/v1/auth/logout-all').set(auth),
      request(target).patch('/api/v1/users/me').set(auth).send({ firstName: 'Hacker' }),
      request(target).put('/api/v1/users/me/avatar').set(auth).set('Content-Type', 'image/png').send(Buffer.alloc(16)),
      request(target).delete('/api/v1/users/me/avatar').set(auth),
    ];
    for (const res of await Promise.all(restricted)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEMO_ACCOUNT_RESTRICTED');
    }

    const sessions = await request(target).get('/api/v1/auth/sessions').set(auth);
    expect(sessions.body.data).toHaveLength(1);
    expect(sessions.body.data[0].current).toBe(true);
    const otherSessions = await request(target).get('/api/v1/auth/sessions').set(other.auth);
    const revoke = await request(target).delete(`/api/v1/auth/sessions/${otherSessions.body.data[0].id as string}`).set(auth);
    expect(revoke.body.error.code).toBe('DEMO_ACCOUNT_RESTRICTED');

    const forgot = await request(target).post('/api/v1/auth/password/forgot').send({ email: 'demo@example.com' });
    expect(forgot.status).toBe(202);
    expect(forgot.body.data.sandboxResetToken).toBeUndefined();

    // Preferences stay editable so the settings pages can be tried.
    const prefs = await request(target).patch('/api/v1/users/me/preferences').set(auth).send({ payments: { hideBalance: true } });
    expect(prefs.status).toBe(200);
  });

  it('exempts demo emails from the per-account login lockout', async () => {
    await migrate('test');
    const target = app();
    for (let attempt = 0; attempt < 11; attempt += 1) {
      expect((await login('demo@example.com', 'wrong password', target)).res.status).toBe(401);
    }
    expect((await login('demo@example.com', DEMO_PASSWORD, target)).res.status).toBe(200);
  });
});

describe('reference data API', () => {
  beforeEach(() => migrate());

  it('serves master data publicly, grouped by type, with an optional type filter', async () => {
    const all = await request(app()).get('/api/v1/masters');
    expect(all.status).toBe(200);
    expect(all.headers['cache-control']).toBe('public, max-age=300');
    expect(all.body.data.bank).toContainEqual({ code: 'HDFC', label: 'HDFC Bank', attributes: { ifscPrefix: 'HDFC' } });
    expect(all.body.data.payment_status).toHaveLength(11);

    const some = await request(app()).get('/api/v1/masters?types=currency,upi_handle');
    expect(Object.keys(some.body.data).sort()).toEqual(['currency', 'upi_handle']);
    expect((await request(app()).get('/api/v1/masters?types=secrets')).status).toBe(400);
  });

  it('returns only the menus the caller’s roles permit', async () => {
    const priya = await login('demo@example.com');
    const consumer = await request(priya.app).get('/api/v1/menus').set(priya.auth);
    expect(consumer.status).toBe(200);
    const groups = new Set((consumer.body.data.menus as { group: string }[]).map((menu) => menu.group));
    expect([...groups]).toEqual(['PAYMENTS', 'ACCOUNT']);
    expect(consumer.body.data.menus[0]).toMatchObject({ id: 'home', path: '/', status: 'LIVE' });

    const admin = await login('admin.demo@example.com');
    const staff = await request(admin.app).get('/api/v1/menus').set(admin.auth);
    const ids = (staff.body.data.menus as { id: string }[]).map((menu) => menu.id);
    expect(ids).toContain('admin-roles');
    expect(ids).not.toContain('admin-refunds');

    expect((await request(app()).get('/api/v1/menus')).status).toBe(401);
  });

  it('lists sandbox entities for signed-in users', async () => {
    const priya = await login('demo@example.com');
    const billers = await request(priya.app).get('/api/v1/entities?type=BILLER').set(priya.auth);
    expect(billers.status).toBe(200);
    expect(billers.body.data.length).toBe(ENTITIES.filter((entity) => entity.type === 'BILLER').length);
    expect(billers.body.data.every((entity: { sandbox: boolean }) => entity.sandbox)).toBe(true);
    expect((await request(app()).get('/api/v1/entities')).status).toBe(401);
  });
});
