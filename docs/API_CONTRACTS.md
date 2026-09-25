# MiNi Payment Server — API contracts

Base path: `/api/v1`. JSON only. The machine-readable contract for implemented endpoints is served at `GET /api/v1/openapi.json` and must be updated in the same change as any route.

## Conventions

### Success envelope

```json
{ "data": { "...": "..." } }
```

Lists (planned) add cursor pagination:

```json
{ "data": [], "page": { "nextCursor": "opaque-string-or-null", "limit": 20 } }
```

### Error envelope

```json
{
  "error": {
    "code": "PAYMENT_INVALID_STATE",
    "message": "The payment cannot move to the requested state.",
    "requestId": "8f0f5a9e-...",
    "details": { "from": "SUCCESS", "to": "PROCESSING", "allowed": ["REFUND_PENDING", "REVERSED"] }
  }
}
```

`details` is optional. Stack traces and internal messages are never returned. Codes are stable identifiers; clients branch on `code`, not `message`.

### Headers

| Header | Direction | Rule |
| --- | --- | --- |
| `X-Request-Id` | both | Optional inbound (8–128 chars `[A-Za-z0-9._-]`), otherwise generated; always returned and exposed via CORS |
| `Authorization: Bearer <access token>` | request | Required on authenticated routes; HS256 JWT, `iss` `mini-payment-server`, `aud` `mini-payment-app`, ≤ 15 min. The server also checks the session is still active, so logout takes effect immediately |
| `Cookie: mp_rt=…` | request | Refresh token, HttpOnly, `Path=/api/v1/auth`; `SameSite=Lax` locally, `SameSite=None; Secure; Partitioned` when deployed. Only `/auth/refresh` and `/auth/logout` read it, and both require a trusted `Origin` |
| `Idempotency-Key` | request | Required on money-moving POSTs (BE-011); UUID recommended |

### Money in APIs

Amounts are sent and returned as `{ "amountMinor": 1023, "currency": "INR" }`. Clients may display `formatMinorUnits` output; they never send floating-point amounts.

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Schema or reserved-key validation failed; `details` lists `{path, message}` |
| `REQUEST_MALFORMED` | 400 | Invalid JSON |
| `REQUEST_TOO_LARGE` | 413 | Body over limit |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired credentials |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `RESOURCE_NOT_FOUND` | 404 | Resource missing or not owned by caller |
| `ROUTE_NOT_FOUND` | 404 | Unknown route |
| `RATE_LIMITED` | 429 | Throttled |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login failed (no user enumeration) |
| `AUTH_SESSION_EXPIRED` | 401 | Refresh token missing, expired, revoked or replayed; access token's session ended |
| `AUTH_REGISTRATION_CONFLICT` | 409 | Email or phone already registered (does not say which) |
| `AUTH_RESET_TOKEN_INVALID` | 400 | Reset token unknown, used or expired |
| `PROFILE_PHONE_UNAVAILABLE` | 409 | Phone number belongs to another account |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Avatar is not PNG/JPEG/WebP (checked by magic bytes) |
| `PAYMENT_METHOD_DUPLICATE` | 409 | Bank account or UPI ID already linked |
| `PAYMENT_METHOD_LIMIT_REACHED` | 422 | More than 10 linked methods |
| `OTP_EXPIRED` | 400 | OTP expired |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | OTP attempt limit reached |
| `PAYMENT_INVALID_AMOUNT` | 400 | Amount malformed, non-positive or out of range |
| `PAYMENT_INSUFFICIENT_FUNDS` | 422 | Sandbox balance too low |
| `PAYMENT_INVALID_STATE` | 409 | Transition not allowed |
| `PAYMENT_LIMIT_EXCEEDED` | 422 | Limit exceeded |
| `PAYMENT_DUPLICATE_REQUEST` | 409 | Idempotency key reused with a different request |
| `PAYMENT_RECIPIENT_NOT_FOUND` | 404 | Recipient not resolvable |
| `SERVICE_UNAVAILABLE` | 503 | Dependency unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected failure |

## Implemented endpoints

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| GET | `/health` | none | 200 `{data:{status:"ok",service,version,environment,providerMode:"sandbox",uptimeSeconds}}` |
| GET | `/health/ready` | none | 200 `{data:{status:"ready",dependencies:[{name,status:"up",latencyMs}]}}` or 503 with `status:"not_ready"` |
| GET | `/openapi.json` | none | OpenAPI 3.1 document |
| POST | `/auth/register` | none | 201 session grant `{accessToken, tokenType, expiresIn, user}` + refresh cookie. Rate limit 10/h per IP |
| POST | `/auth/login` | none | 200 session grant + cookie. 50/15 min per IP, 10/15 min per email |
| POST | `/auth/refresh` | cookie + trusted Origin | 200 session grant; rotates the cookie. 120/min per IP |
| POST | `/auth/logout` | cookie + trusted Origin | 204; revokes the session, clears the cookie |
| POST | `/auth/logout-all` | bearer | 204; revokes every session |
| POST | `/auth/password/forgot` | none | 202 (same for unknown emails); `sandboxResetToken` only when `APP_ENV` is `local`/`test`. 20/h per IP, 5/h per email |
| POST | `/auth/password/reset` | none | 204; single-use 30-min token, revokes all sessions |
| POST | `/auth/password/change` | bearer | 204; revokes every other session. 10/15 min per user |
| GET / DELETE | `/auth/sessions`, `/auth/sessions/:sessionId` | bearer | Own active sessions (`id`, `userAgent`, `createdAt`, `lastUsedAt`, `current`) / revoke one (404 if not owned) |
| GET / PATCH | `/users/me` | bearer | User DTO (`initials`, `fullName`, `avatarUrl`); PATCH `firstName`, `lastName`, `phone` (email and roles are not writable) |
| PUT / DELETE | `/users/me/avatar` | bearer | Raw PNG/JPEG/WebP body ≤ 512 KB → updated user / 200 without avatar |
| GET | `/avatars/:avatarId` | none | Image bytes; `Cross-Origin-Resource-Policy: cross-origin`, immutable caching (ids are unguessable and change on every upload) |
| GET / PATCH | `/users/me/preferences` | bearer | Notification channels (push, email, sms), events (security locked on), payment limits (≤ server ceilings, per-transaction ≤ daily), `hideBalance` |
| GET | `/payment-methods` | bearer | Own bank accounts (masked: last 4, IFSC, bank) and UPI IDs |
| POST | `/payment-methods/bank-accounts`, `/payment-methods/upi-ids` | bearer | 201 method; full account number is never stored or returned |
| POST / DELETE | `/payment-methods/:methodId/default`, `/payment-methods/:methodId` | bearer | Updated list; deleting the default promotes the oldest remaining method |
| GET | `/wallets/me` | bearer | Sandbox wallet summary; `balanceMinor` 0 and `ledgerAvailable: false` until BE-010 |

## Planned endpoints (not implemented)

Listed so frontend and backend agree on direction; each becomes a contract only when its task lands with tests and OpenAPI.

| Area | Endpoints | Task |
| --- | --- | --- |
| auth | `POST /auth/otp/request`, `/auth/otp/verify` | BE-007 |
| security | `POST /security/pin`, `PUT /security/pin`, `GET /security/events` | BE-008, BE-025 |
| wallets | `GET /wallets/me` balance derived from the ledger; sandbox top-up | BE-010 |
| payments | `POST /payments`, `GET /payments`, `GET /payments/:paymentId`, `POST /payments/:paymentId/authorize`, `/cancel`, `/refund` | BE-012, BE-019 |
| transactions | `GET /transactions`, `GET /transactions/:id`, `GET /transactions/summary`, `GET /transactions/export` | BE-014 |
| contacts | `GET/POST /contacts`, `PATCH/DELETE /contacts/:id`, `GET /contacts/recent`, `GET /contacts/favorites`, `POST /contacts/:id/favorite` | BE-016 |
| payment-requests | `POST/GET /payment-requests`, `GET /payment-requests/:id`, `POST /payment-requests/:id/pay`, `/cancel`, `/remind` | BE-017 |
| qr | `POST /qr/generate`, `POST /qr/parse` | BE-018 |
| notifications | `GET /notifications`, `POST /notifications/:id/read` | BE-015 |
| bills, recharges, rewards, analytics | see TASKS | BE-023, BE-024, BE-026 |
| webhooks | `POST /webhooks/:provider` | BE-021 |

## Socket.IO (planned, BE-013)

Handshake: `auth: { token: <access token> }`; the server joins the socket only to `user:<userId>`. Events: `payment.created`, `payment.processing`, `payment.success`, `payment.failed`, `payment.refunded`, `request.created`, `request.paid`, `notification.created`, `security.alert`. Payloads carry the same public DTOs as REST.
