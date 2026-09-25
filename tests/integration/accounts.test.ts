import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AvatarModel } from '../../src/modules/users/avatar.model.js';
import { useTestDatabase } from '../helpers/database.js';
import { buildTestApp } from '../helpers/test-app.js';

useTestDatabase();

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32, 2)]);

async function signUp(app = buildTestApp(), email = 'asha@example.com', firstName = 'Asha') {
  const password = 'correct horse battery';
  const created = await request(app)
    .post('/api/v1/auth/register')
    .send({ firstName, lastName: 'Verma', username: email.split('@')[0], email, password });
  expect(created.status).toBe(201);
  const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });
  return { app, auth: { Authorization: `Bearer ${res.body.data.accessToken as string}` } };
}

describe('profile', () => {
  it('updates names and phone, recomputing initials', async () => {
    const { app, auth } = await signUp();
    const res = await request(app).patch('/api/v1/users/me').set(auth).send({ firstName: 'élodie', lastName: "d'Souza", phone: '09876543210' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fullName: "élodie d'Souza", initials: 'ÉD', phone: '+919876543210' });

    const cleared = await request(app).patch('/api/v1/users/me').set(auth).send({ phone: '' });
    expect(cleared.body.data.phone).toBeNull();
  });

  it('rejects email or role changes and phone numbers owned by someone else', async () => {
    const app = buildTestApp();
    const asha = await signUp(app);
    const ravi = await signUp(app, 'ravi@example.com', 'Ravi');
    await request(app).patch('/api/v1/users/me').set(asha.auth).send({ phone: '9876543210' });

    expect((await request(app).patch('/api/v1/users/me').set(ravi.auth).send({ email: 'x@example.com' })).status).toBe(400);
    expect((await request(app).patch('/api/v1/users/me').set(ravi.auth).send({ roles: ['ADMIN'] })).status).toBe(400);
    const taken = await request(app).patch('/api/v1/users/me').set(ravi.auth).send({ phone: '9876543210' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('PROFILE_PHONE_UNAVAILABLE');
  });

  it('changes the username, which then works for sign-in, and refuses taken or reserved ones', async () => {
    const app = buildTestApp();
    const asha = await signUp(app);
    const ravi = await signUp(app, 'ravi@example.com', 'Ravi');

    const renamed = await request(app).patch('/api/v1/users/me').set(asha.auth).send({ username: 'Asha.V' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.username).toBe('asha.v');
    const login = await request(app).post('/api/v1/auth/login').send({ identifier: 'asha.v', password: 'correct horse battery' });
    expect(login.status).toBe(200);

    const taken = await request(app).patch('/api/v1/users/me').set(ravi.auth).send({ username: 'ASHA.V' });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatchObject({ code: 'USERNAME_UNAVAILABLE', details: [{ path: 'username' }] });
    expect((await request(app).patch('/api/v1/users/me').set(ravi.auth).send({ username: 'root' })).status).toBe(400);
  });
});

describe('avatar', () => {
  it('uploads, serves cross-origin with immutable caching, replaces and removes the avatar', async () => {
    const { app, auth } = await signUp();
    const upload = await request(app).put('/api/v1/users/me/avatar').set(auth).set('Content-Type', 'image/png').send(PNG);
    expect(upload.status).toBe(200);
    const url = upload.body.data.avatarUrl as string;
    expect(url).toMatch(/^\/avatars\/[A-Za-z0-9_-]{32}$/);

    const image = await request(app).get(`/api/v1${url}`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);

    const replaced = await request(app).put('/api/v1/users/me/avatar').set(auth).set('Content-Type', 'image/webp').send(WEBP);
    expect(replaced.body.data.avatarUrl).not.toBe(url);
    expect((await request(app).get(`/api/v1${url}`)).status).toBe(404);
    expect(await AvatarModel.countDocuments()).toBe(1);

    const removed = await request(app).delete('/api/v1/users/me/avatar').set(auth);
    expect(removed.body.data).toMatchObject({ avatarUrl: null, initials: 'AV' });
    expect(await AvatarModel.countDocuments()).toBe(0);
  });

  it('rejects non-images, mismatched types, oversized files and anonymous uploads', async () => {
    const { app, auth } = await signUp();
    const svg = await request(app).put('/api/v1/users/me/avatar').set(auth).set('Content-Type', 'image/svg+xml').send(Buffer.from('<svg/>'));
    expect(svg.status).toBe(415);
    const disguised = await request(app).put('/api/v1/users/me/avatar').set(auth).set('Content-Type', 'image/png').send(Buffer.from('<html>'));
    expect(disguised.status).toBe(415);
    const mismatch = await request(app).put('/api/v1/users/me/avatar').set(auth).set('Content-Type', 'image/jpeg').send(PNG);
    expect(mismatch.status).toBe(415);
    const huge = await request(app)
      .put('/api/v1/users/me/avatar')
      .set(auth)
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([PNG, Buffer.alloc(600 * 1024)]));
    expect(huge.status).toBe(413);
    expect((await request(app).put('/api/v1/users/me/avatar').set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
  });
});

describe('preferences', () => {
  it('returns defaults, merges partial updates and keeps security alerts on', async () => {
    const { app, auth } = await signUp();
    const initial = await request(app).get('/api/v1/users/me/preferences').set(auth);
    expect(initial.body.data.notifications).toEqual({
      channels: { push: false, email: true, sms: false },
      events: { payments: true, requests: true, promotions: false, security: true },
    });

    const updated = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set(auth)
      .send({ notifications: { channels: { push: true, sms: true } }, payments: { hideBalance: true, perTransactionLimitMinor: 500_000 } });
    expect(updated.status).toBe(200);
    expect(updated.body.data.notifications.channels).toEqual({ push: true, email: true, sms: true });
    expect(updated.body.data.payments).toMatchObject({ hideBalance: true, perTransactionLimitMinor: 500_000, dailyLimitMinor: 2_500_000 });

    const noSecurity = await request(app).patch('/api/v1/users/me/preferences').set(auth).send({ notifications: { events: { security: false } } });
    expect(noSecurity.status).toBe(400);
  });

  it('enforces limit ceilings and per-transaction ≤ daily', async () => {
    const { app, auth } = await signUp();
    const tooHigh = await request(app).patch('/api/v1/users/me/preferences').set(auth).send({ payments: { perTransactionLimitMinor: 50_000_000 } });
    expect(tooHigh.status).toBe(400);
    const inverted = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set(auth)
      .send({ payments: { perTransactionLimitMinor: 2_000_000, dailyLimitMinor: 1_000_000 } });
    expect(inverted.status).toBe(400);
    expect(inverted.body.error.details[0].path).toBe('payments.perTransactionLimitMinor');
  });
});

describe('payment methods and wallet', () => {
  it('links bank accounts and UPI IDs, derives the bank from the IFSC and never returns the full account number', async () => {
    const { app, auth } = await signUp();
    const bank = await request(app)
      .post('/api/v1/payment-methods/bank-accounts')
      .set(auth)
      .send({ accountHolderName: 'Asha Verma', accountNumber: '123456789012', ifsc: 'hdfc0001234' });
    expect(bank.status).toBe(201);
    expect(bank.body.data).toMatchObject({
      type: 'BANK_ACCOUNT',
      isDefault: true,
      bank: { bankName: 'HDFC Bank', accountLast4: '9012', maskedAccountNumber: '•••• 9012', ifsc: 'HDFC0001234', accountType: 'SAVINGS' },
    });
    expect(JSON.stringify(bank.body)).not.toContain('123456789012');

    const upi = await request(app).post('/api/v1/payment-methods/upi-ids').set(auth).send({ vpa: 'Asha.Verma@okhdfc' });
    expect(upi.status).toBe(201);
    expect(upi.body.data).toMatchObject({ type: 'UPI_ID', isDefault: false, upi: { vpa: 'asha.verma@okhdfc' } });

    const dupBank = await request(app)
      .post('/api/v1/payment-methods/bank-accounts')
      .set(auth)
      .send({ accountHolderName: 'Asha Verma', accountNumber: '123456789012', ifsc: 'HDFC0009999' });
    expect(dupBank.status).toBe(409);
    expect((await request(app).post('/api/v1/payment-methods/upi-ids').set(auth).send({ vpa: 'asha.verma@okhdfc' })).status).toBe(409);

    const unknownBank = await request(app)
      .post('/api/v1/payment-methods/bank-accounts')
      .set(auth)
      .send({ accountHolderName: 'Asha Verma', accountNumber: '999988887777', ifsc: 'ZZZZ0001234' });
    expect(unknownBank.status).toBe(400);
    expect(unknownBank.body.error.details[0].path).toBe('bankName');

    const wallet = await request(app).get('/api/v1/wallets/me').set(auth);
    expect(wallet.body.data).toMatchObject({ currency: 'INR', balanceMinor: 0, sandbox: true, linked: { bankAccounts: 1, upiIds: 1 }, defaultMethodId: bank.body.data.id });
  });

  it('switches the default, promotes the oldest remaining method on delete, and scopes everything to the owner', async () => {
    const app = buildTestApp();
    const asha = await signUp(app);
    const ravi = await signUp(app, 'ravi@example.com', 'Ravi');
    const first = await request(app).post('/api/v1/payment-methods/upi-ids').set(asha.auth).send({ vpa: 'asha@oksbi' });
    const second = await request(app).post('/api/v1/payment-methods/upi-ids').set(asha.auth).send({ vpa: 'asha@ybl' });
    const third = await request(app).post('/api/v1/payment-methods/upi-ids').set(asha.auth).send({ vpa: 'asha@paytm' });

    const switched = await request(app).post(`/api/v1/payment-methods/${third.body.data.id}/default`).set(asha.auth);
    expect(switched.body.data.filter((method: { isDefault: boolean }) => method.isDefault).map((method: { id: string }) => method.id)).toEqual([third.body.data.id]);

    const afterDelete = await request(app).delete(`/api/v1/payment-methods/${third.body.data.id}`).set(asha.auth);
    expect(afterDelete.body.data.find((method: { isDefault: boolean }) => method.isDefault).id).toBe(first.body.data.id);

    expect((await request(app).delete(`/api/v1/payment-methods/${second.body.data.id}`).set(ravi.auth)).status).toBe(404);
    expect((await request(app).post(`/api/v1/payment-methods/${second.body.data.id}/default`).set(ravi.auth)).status).toBe(404);
    expect((await request(app).get('/api/v1/payment-methods').set(ravi.auth)).body.data).toEqual([]);
  });

  it('caps the number of linked methods', async () => {
    const { app, auth } = await signUp();
    for (let index = 0; index < 10; index += 1) {
      expect((await request(app).post('/api/v1/payment-methods/upi-ids').set(auth).send({ vpa: `asha${index}@okaxis` })).status).toBe(201);
    }
    const res = await request(app).post('/api/v1/payment-methods/upi-ids').set(auth).send({ vpa: 'asha10@okaxis' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PAYMENT_METHOD_LIMIT_REACHED');
  });
});
