import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createMemoryRateLimitStore } from '../../src/common/middleware/rate-limit.js';
import { SessionModel } from '../../src/modules/auth/session.model.js';
import { UserModel } from '../../src/modules/users/user.model.js';
import { useTestDatabase } from '../helpers/database.js';
import { buildTestApp } from '../helpers/test-app.js';

useTestDatabase();

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'staple window orbit 42';

function registration(overrides: Record<string, unknown> = {}) {
  const email = typeof overrides.email === 'string' ? overrides.email : 'asha@example.com';
  const username = email.trim().split('@')[0]!.toLowerCase();
  return { firstName: 'Asha', lastName: 'Verma', username, email: 'asha@example.com', password: PASSWORD, ...overrides };
}

function refreshCookieFrom(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((cookie) => cookie.startsWith('mp_rt='));
}

function cookieValue(setCookie: string): string {
  return setCookie.split(';')[0]!;
}

/** Registers, then signs in (registration itself never starts a session). */
async function register(app = buildTestApp(), overrides: Record<string, unknown> = {}) {
  const body = registration(overrides);
  const created = await request(app).post('/api/v1/auth/register').send(body);
  expect(created.status).toBe(201);
  const res = await request(app).post('/api/v1/auth/login').send({ identifier: body.email, password: body.password });
  expect(res.status).toBe(200);
  return { app, created, res, accessToken: res.body.data.accessToken as string, cookie: cookieValue(refreshCookieFrom(res)!) };
}

describe('registration', () => {
  it('creates the user without starting a session', async () => {
    const res = await request(buildTestApp()).post('/api/v1/auth/register').send(registration());
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ user: expect.objectContaining({ username: 'asha', email: 'asha@example.com', isDemo: false }) });
    expect(res.body.data.user.id).toMatch(/^usr_[a-f0-9]{20}$/);
    expect(res.body.data).not.toHaveProperty('accessToken');
    expect(refreshCookieFrom(res)).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await SessionModel.countDocuments({})).toBe(0);
  });

  it('signing in afterwards returns an access token and sets an HttpOnly refresh cookie scoped to /api/v1/auth', async () => {
    const { app, res, accessToken } = await register();
    expect(res.body.data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { firstName: 'Asha', lastName: 'Verma', fullName: 'Asha Verma', initials: 'AV', username: 'asha', email: 'asha@example.com', avatarUrl: null },
    });
    expect(res.body.data).not.toHaveProperty('refreshToken');
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = refreshCookieFrom(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const stored = await UserModel.findOne({ email: 'asha@example.com' }).lean();
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);

    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('asha@example.com');
    expect(me.body.data).not.toHaveProperty('passwordHash');
  });

  it('normalizes email and Indian mobile numbers', async () => {
    const { created } = await register(buildTestApp(), { email: '  Asha@Example.COM ', phone: '+91 98765-43210', username: ' Asha_V ' });
    expect(created.body.data.user).toMatchObject({ email: 'asha@example.com', phone: '+919876543210', username: 'asha_v' });
  });

  it('says when a username is taken, but not when an email is', async () => {
    const app = buildTestApp();
    await register(app);
    const username = await request(app).post('/api/v1/auth/register').send(registration({ email: 'other@example.com', username: 'ASHA' }));
    expect(username.status).toBe(409);
    expect(username.body.error).toMatchObject({ code: 'USERNAME_UNAVAILABLE', details: [{ path: 'username' }] });
  });

  it('validates usernames and reserves staff, product and demo handles', async () => {
    const app = buildTestApp();
    for (const username of ['ab', '1asha', 'asha..v', 'asha.', 'asha v', 'a'.repeat(31), 'admin', 'support', 'priya.demo']) {
      const res = await request(app).post('/api/v1/auth/register').send(registration({ username }));
      expect(res.status, username).toBe(400);
      expect(res.body.error.details.map((detail: { path: string }) => detail.path), username).toContain('username');
    }
    const missing = await request(app).post('/api/v1/auth/register').send({ ...registration(), username: undefined });
    expect(missing.status).toBe(400);
  });

  it('rejects duplicate accounts without saying which field collided', async () => {
    const app = buildTestApp();
    await register(app);
    const res = await request(app).post('/api/v1/auth/register').send(registration({ email: 'ASHA@example.com' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTH_REGISTRATION_CONFLICT');
  });

  it('validates names, email and password strength', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/auth/register')
      .send({ firstName: '1', lastName: '', username: 'x', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['firstName', 'lastName', 'username', 'email', 'password']));
  });

  it('rejects passwords containing the email name or username, and unknown fields', async () => {
    const app = buildTestApp();
    const weak = await request(app).post('/api/v1/auth/register').send(registration({ password: 'my-asha-password' }));
    expect(weak.status).toBe(400);
    const handle = await request(app).post('/api/v1/auth/register').send(registration({ username: 'moonbeam', password: 'my-moonbeam-pw' }));
    expect(handle.body.error.details).toEqual([{ path: 'password', message: 'must not contain your username' }]);
    const extra = await request(app).post('/api/v1/auth/register').send(registration({ roles: ['ADMIN'] }));
    expect(extra.status).toBe(400);
  });
});

describe('login', () => {
  it('signs in with the right password and gives the same error for a wrong password or unknown email', async () => {
    const app = buildTestApp();
    await register(app);

    const ok = await request(app).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(refreshCookieFrom(ok)).toBeDefined();

    const wrong = await request(app).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: 'wrong password!' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'wrong password!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(unknown.body.error).toMatchObject({ code: wrong.body.error.code, message: wrong.body.error.message });
  });

  it('accepts the email or the username (any case) as the identifier, and the legacy email field', async () => {
    const app = buildTestApp();
    await register(app);
    for (const identifier of ['asha@example.com', ' ASHA@example.com', 'asha', 'Asha ']) {
      const res = await request(app).post('/api/v1/auth/login').send({ identifier, password: PASSWORD });
      expect(res.status, identifier).toBe(200);
      expect(res.body.data.user.username).toBe('asha');
    }
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD })).status).toBe(200);

    const wrong = await request(app).post('/api/v1/auth/login').send({ identifier: 'asha', password: 'wrong password!' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ identifier: 'nobody', password: 'wrong password!' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const missing = await request(app).post('/api/v1/auth/login').send({ password: PASSWORD });
    expect(missing.body.error.details).toEqual([{ path: 'identifier', message: 'is required' }]);
    const badEmail = await request(app).post('/api/v1/auth/login').send({ identifier: 'asha@', password: PASSWORD });
    expect(badEmail.status).toBe(400);
  });

  it('rate limits repeated attempts for one email or username with Retry-After', async () => {
    const app = buildTestApp({ rateLimitStore: createMemoryRateLimitStore() });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post('/api/v1/auth/login').send({ email: 'target@example.com', password: 'guess-guess' });
    }
    const blocked = await request(app).post('/api/v1/auth/login').send({ email: 'Target@example.com', password: 'guess-guess' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post('/api/v1/auth/login').send({ identifier: 'target', password: 'guess-guess' });
    }
    expect((await request(app).post('/api/v1/auth/login').send({ identifier: 'TARGET', password: 'guess-guess' })).status).toBe(429);
  });
});

describe('refresh rotation', () => {
  it('rotates the refresh token and revokes the session when an old token is replayed', async () => {
    const { app, cookie: first } = await register();

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', first);
    expect(rotated.status).toBe(200);
    const second = cookieValue(refreshCookieFrom(rotated)!);
    expect(second).not.toBe(first);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('AUTH_SESSION_EXPIRED');
    expect(refreshCookieFrom(replay)).toMatch(/mp_rt=;/);

    // The legitimate latest token is now dead too: the whole family was revoked.
    const afterReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', second);
    expect(afterReuse.status).toBe(401);
    expect(await SessionModel.findOne({}).lean()).toMatchObject({ revokeReason: 'REUSE_DETECTED' });

    // The access token issued before the reuse stops working immediately.
    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${rotated.body.data.accessToken}`);
    expect(me.status).toBe(401);
  });

  it('allows exactly one of two concurrent refreshes with the same token', async () => {
    const { app, cookie } = await register();
    const results = await Promise.all([
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
  });

  it('rejects missing or malformed cookies and untrusted origins', async () => {
    const { app, cookie } = await register();
    expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', 'mp_rt=garbage')).status).toBe(401);
    const csrf = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('Origin', 'https://evil.example');
    expect(csrf.status).toBe(403);
    const trusted = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).set('Origin', 'http://localhost:5173');
    expect(trusted.status).toBe(200);
  });

  it('uses SameSite=None; Secure; Partitioned cookies for cross-site deployments', async () => {
    const { res } = await register(buildTestApp({ env: { REFRESH_COOKIE_SAMESITE: 'none' } }));
    const cookie = refreshCookieFrom(res)!;
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Partitioned/i);
  });
});

describe('logout and sessions', () => {
  it('logout revokes the session behind the cookie', async () => {
    const { app, cookie, accessToken } = await register();
    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`)).status).toBe(401);
  });

  it('lists sessions, revokes one, and logout-all ends every session', async () => {
    const { app, accessToken } = await register();
    const second = await request(app).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD });
    const auth = { Authorization: `Bearer ${accessToken}` };

    const list = await request(app).get('/api/v1/auth/sessions').set(auth);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((session: { current: boolean }) => session.current)).toHaveLength(1);

    const other = list.body.data.find((session: { current: boolean }) => !session.current);
    expect((await request(app).delete(`/api/v1/auth/sessions/${other.id}`).set(auth)).status).toBe(204);
    expect((await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${second.body.data.accessToken}`)).status).toBe(401);

    expect((await request(app).post('/api/v1/auth/logout-all').set(auth)).status).toBe(204);
    expect((await request(app).get('/api/v1/users/me').set(auth)).status).toBe(401);
  });

  it('does not let one user revoke another user\'s session', async () => {
    const app = buildTestApp();
    const asha = await register(app);
    const ravi = await register(app, { email: 'ravi@example.com', firstName: 'Ravi' });
    const raviSessions = await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${ravi.accessToken}`);
    const res = await request(app)
      .delete(`/api/v1/auth/sessions/${raviSessions.body.data[0].id}`)
      .set('Authorization', `Bearer ${asha.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects tampered access tokens', async () => {
    const { app, accessToken } = await register();
    const tampered = `${accessToken.slice(0, -2)}xx`;
    expect((await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${tampered}`)).status).toBe(401);
    expect((await request(app).get('/api/v1/users/me')).status).toBe(401);
  });
});

describe('password reset and change', () => {
  it('answers forgot-password identically for unknown emails and exposes the token only in sandbox environments', async () => {
    const app = buildTestApp();
    await register(app);
    const known = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'asha@example.com' });
    const unknown = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'ghost@example.com' });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body.data).toEqual({ accepted: true });
    expect(known.body.data.sandboxResetToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const staging = buildTestApp({ env: { APP_ENV: 'development' } });
    const hidden = await request(staging).post('/api/v1/auth/password/forgot').send({ email: 'asha@example.com' });
    expect(hidden.body.data).toEqual({ accepted: true });
  });

  it('resets the password once, revokes existing sessions and accepts the new password', async () => {
    const { app, accessToken } = await register();
    const forgot = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'asha@example.com' });
    const token = forgot.body.data.sandboxResetToken as string;

    const reset = await request(app).post('/api/v1/auth/password/reset').send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(204);
    const again = await request(app).post('/api/v1/auth/password/reset').send({ token, password: NEW_PASSWORD });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');

    expect((await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: NEW_PASSWORD })).status).toBe(200);
  });

  it('changes the password with the current one and keeps only the current session', async () => {
    const { app, accessToken } = await register();
    const other = await request(app).post('/api/v1/auth/login').send({ email: 'asha@example.com', password: PASSWORD });
    const auth = { Authorization: `Bearer ${accessToken}` };

    const wrong = await request(app).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: 'not it at all', newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('The current password is incorrect.');

    const same = await request(app).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);

    const ok = await request(app).post('/api/v1/auth/password/change').set(auth).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(ok.status).toBe(204);
    expect((await request(app).get('/api/v1/users/me').set(auth)).status).toBe(200);
    expect((await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${other.body.data.accessToken}`)).status).toBe(401);
  });
});
