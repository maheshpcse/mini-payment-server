/**
 * OpenAPI description of the endpoints that are implemented today. Add a path
 * here in the same change that adds its route; tests/integration/openapi.test.ts
 * checks that documented routes respond.
 */
const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', example: 'VALIDATION_FAILED' },
        message: { type: 'string' },
        requestId: { type: 'string' },
        details: {},
      },
    },
  },
} as const;

const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const errorResponse = (description: string) => ({ description, ...json({ $ref: '#/components/schemas/Error' }) });

function op(
  summary: string,
  tag: string,
  responses: Record<string, string>,
  options: { auth?: boolean; body?: object; bodyType?: string } = {},
) {
  const documented: Record<string, object> = {};
  for (const [status, description] of Object.entries(responses)) {
    documented[status] = Number(status) >= 400 ? errorResponse(description) : { description };
  }
  if (options.auth) documented['401'] ??= errorResponse('Missing, invalid or revoked access token');
  return {
    summary,
    tags: [tag],
    ...(options.auth ? { security: [{ bearerAuth: [] }] } : {}),
    ...(options.body
      ? { requestBody: { required: true, content: { [options.bodyType ?? 'application/json']: { schema: options.body } } } }
      : {}),
    responses: documented,
  };
}

const str = { type: 'string' } as const;
const bool = { type: 'boolean' } as const;
const obj = (properties: Record<string, object>, required: string[] = Object.keys(properties)) => ({
  type: 'object',
  required,
  properties,
});

const DEMO = 'DEMO_ACCOUNT_RESTRICTED: shared demo accounts cannot make this change';

const authPaths = {
  '/auth/register': {
    post: op(
      'Create an account (no session: sign in afterwards)',
      'auth',
      {
        '201': '`{ user }`; no tokens or cookie are issued',
        '400': 'Validation failed',
        '409': 'USERNAME_UNAVAILABLE (details on `username`) or AUTH_REGISTRATION_CONFLICT (email/phone, deliberately unspecific)',
        '429': 'Rate limited',
      },
      { body: obj({ firstName: str, lastName: str, username: str, email: str, phone: str, password: str }, ['firstName', 'lastName', 'username', 'email', 'password']) },
    ),
  },
  '/auth/login': {
    post: op(
      'Sign in with email or username and password',
      'auth',
      { '200': 'Access token + user; refresh cookie set', '400': 'Validation failed', '401': 'Invalid credentials', '429': 'Rate limited' },
      {
        body: {
          ...obj({ identifier: { ...str, description: 'Email (contains "@") or username' }, email: { ...str, deprecated: true, description: 'Older clients; same as `identifier`' }, password: str }, ['password']),
          oneOf: [{ required: ['identifier'] }, { required: ['email'] }],
        },
      },
    ),
  },
  '/auth/refresh': {
    post: op('Rotate the refresh cookie and issue a new access token', 'auth', {
      '200': 'New access token; cookie rotated',
      '401': 'Session expired, revoked or refresh token reused',
      '403': 'Origin not allowed',
    }),
  },
  '/auth/logout': { post: op('Revoke the current session (cookie)', 'auth', { '204': 'Signed out' }) },
  '/auth/logout-all': { post: op('Revoke every session for the user', 'auth', { '204': 'All sessions revoked', '403': DEMO }, { auth: true }) },
  '/auth/password/forgot': {
    post: op(
      'Request a password reset link (same response whether or not the account exists)',
      'auth',
      { '202': 'Accepted. In local/test only, `sandboxResetToken` is included', '429': 'Rate limited' },
      { body: obj({ email: str }) },
    ),
  },
  '/auth/password/reset': {
    post: op(
      'Set a new password with a reset token; revokes all sessions',
      'auth',
      { '204': 'Password updated', '400': 'Invalid/expired token or weak password' },
      { body: obj({ token: str, password: str }) },
    ),
  },
  '/auth/password/change': {
    post: op(
      'Change password; revokes other sessions',
      'auth',
      { '204': 'Password changed', '400': 'Weak password', '401': 'Current password incorrect', '403': DEMO },
      { auth: true, body: obj({ currentPassword: str, newPassword: str }) },
    ),
  },
  '/auth/sessions': { get: op('List active sessions', 'auth', { '200': 'Sessions, newest activity first (demo accounts see only the current one)' }, { auth: true }) },
  '/auth/sessions/{sessionId}': {
    delete: op('Revoke one of your sessions', 'auth', { '204': 'Revoked', '403': DEMO, '404': 'No such active session' }, { auth: true }),
  },
};

const userPaths = {
  '/users/me': {
    get: op('Current user profile', 'users', { '200': 'Profile' }, { auth: true }),
    patch: op(
      'Update first name, last name, username or mobile number',
      'users',
      { '200': 'Updated profile', '400': 'Validation failed', '403': DEMO, '409': 'USERNAME_UNAVAILABLE or PROFILE_PHONE_UNAVAILABLE' },
      { auth: true, body: obj({ firstName: str, lastName: str, username: str, phone: { type: ['string', 'null'] } }, []) },
    ),
  },
  '/users/me/avatar': {
    put: op(
      'Upload or replace the avatar (PNG, JPEG or WebP, ≤ 512 KB, raw body)',
      'users',
      { '200': 'Updated profile with avatarUrl', '403': DEMO, '413': 'Too large', '415': 'Unsupported or mismatched image type' },
      { auth: true, body: { type: 'string', format: 'binary' }, bodyType: 'image/*' },
    ),
    delete: op('Remove the avatar (initials are shown instead)', 'users', { '200': 'Updated profile', '403': DEMO }, { auth: true }),
  },
  '/users/me/preferences': {
    get: op('Notification and payment preferences', 'users', { '200': 'Preferences with sandbox ceilings' }, { auth: true }),
    patch: op(
      'Partially update preferences (security alerts cannot be disabled)',
      'users',
      { '200': 'Updated preferences', '400': 'Validation failed' },
      {
        auth: true,
        body: obj(
          {
            notifications: obj({ channels: obj({ push: bool, email: bool, sms: bool }, []), events: obj({ payments: bool, requests: bool, promotions: bool }, []) }, []),
            payments: obj({ perTransactionLimitMinor: { type: 'integer' }, dailyLimitMinor: { type: 'integer' }, hideBalance: bool }, []),
          },
          [],
        ),
      },
    ),
  },
  '/avatars/{avatarId}': {
    get: op('Avatar image by unguessable id (public, immutable)', 'users', { '200': 'Image bytes', '404': 'Not found' }),
  },
};

const paymentMethodPaths = {
  '/wallets/me': { get: op('Sandbox wallet summary', 'wallets', { '200': 'Wallet (balance 0 until the ledger ships)' }, { auth: true }) },
  '/payment-methods': { get: op('Linked bank accounts and UPI IDs', 'wallets', { '200': 'Payment methods' }, { auth: true }) },
  '/payment-methods/bank-accounts': {
    post: op(
      'Link a sandbox bank account (only the last 4 digits are stored)',
      'wallets',
      { '201': 'Linked', '400': 'Validation failed', '409': 'Already linked', '422': 'Limit reached' },
      { auth: true, body: obj({ accountHolderName: str, accountNumber: str, ifsc: str, accountType: { enum: ['SAVINGS', 'CURRENT'] }, bankName: str, label: str }, ['accountHolderName', 'accountNumber', 'ifsc']) },
    ),
  },
  '/payment-methods/upi-ids': {
    post: op(
      'Link a sandbox UPI ID',
      'wallets',
      { '201': 'Linked', '400': 'Validation failed', '409': 'Already linked', '422': 'Limit reached' },
      { auth: true, body: obj({ vpa: str, label: str }, ['vpa']) },
    ),
  },
  '/payment-methods/{methodId}/default': {
    post: op('Make a payment method the default', 'wallets', { '200': 'Updated list', '404': 'Not found' }, { auth: true }),
  },
  '/payment-methods/{methodId}': {
    delete: op('Unlink a payment method', 'wallets', { '200': 'Updated list', '404': 'Not found' }, { auth: true }),
  },
};

const referenceDataPaths = {
  '/masters': {
    get: {
      ...op('Master data grouped by type (public, cacheable for 5 minutes)', 'reference-data', { '200': 'Map of type → [{ code, label, attributes }]', '400': 'Unknown type' }),
      parameters: [
        {
          name: 'types',
          in: 'query',
          required: false,
          description: 'Comma-separated master types, e.g. `bank,upi_handle`. Omit for all.',
          schema: str,
        },
      ],
    },
  },
  '/menus': {
    get: op('Navigation menus the current user\'s roles permit, plus the resolved permissions', 'reference-data', { '200': 'Roles, permissions and ordered menus' }, { auth: true }),
  },
  '/entities': {
    get: {
      ...op('Active sandbox merchants, billers and telecom operators', 'reference-data', { '200': 'Entities', '400': 'Unknown type' }, { auth: true }),
      parameters: [{ name: 'type', in: 'query', required: false, schema: { enum: ['MERCHANT', 'BILLER', 'TELECOM_OPERATOR'] } }],
    },
  },
};

export function buildOpenApiDocument(version: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MiNi Payment API (sandbox)',
      version,
      description: 'Sandbox/demo payment platform. No real money movement, banking, UPI or card processing is performed.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      schemas: { Error: errorSchema },
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      headers: {
        RequestId: { description: 'Correlation id echoed or generated by the server.', schema: { type: 'string' } },
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness: the process is running',
          tags: ['health'],
          responses: {
            '200': {
              description: 'Process is alive',
              headers: { 'x-request-id': { $ref: '#/components/headers/RequestId' } },
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          status: { const: 'ok' },
                          service: { type: 'string' },
                          version: { type: 'string' },
                          environment: { type: 'string' },
                          providerMode: { const: 'sandbox' },
                          uptimeSeconds: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/health/ready': {
        get: {
          summary: 'Readiness: MongoDB and Redis are reachable',
          tags: ['health'],
          responses: {
            '200': { description: 'All dependencies are up' },
            '503': { description: 'At least one dependency is down; per-dependency status is returned' },
          },
        },
      },
      '/openapi.json': {
        get: { summary: 'This document', tags: ['meta'], responses: { '200': { description: 'OpenAPI document' } } },
      },
      ...authPaths,
      ...userPaths,
      ...paymentMethodPaths,
      ...referenceDataPaths,
    },
  };
}
