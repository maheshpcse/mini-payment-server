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
| `Authorization: Bearer <access token>` | request | Planned (BE-004) |
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

## Planned endpoints (not implemented)

Listed so frontend and backend agree on direction; each becomes a contract only when its task lands with tests and OpenAPI.

| Area | Endpoints | Task |
| --- | --- | --- |
| auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/otp/request`, `/auth/otp/verify`, `/auth/password/forgot`, `/auth/password/reset` | BE-004, BE-007 |
| users/profile | `GET /users/me`, `PATCH /users/me` | BE-004 |
| security | `POST /security/pin`, `PUT /security/pin`, `GET /security/sessions`, `DELETE /security/sessions/:id`, `GET /security/events` | BE-008, BE-009, BE-025 |
| wallets | `GET /wallets/me` (balance derived from ledger) | BE-010 |
| payments | `POST /payments`, `GET /payments`, `GET /payments/:paymentId`, `POST /payments/:paymentId/authorize`, `/cancel`, `/refund` | BE-012, BE-019 |
| transactions | `GET /transactions`, `GET /transactions/:id`, `GET /transactions/summary`, `GET /transactions/export` | BE-014 |
| contacts | `GET/POST /contacts`, `PATCH/DELETE /contacts/:id`, `GET /contacts/recent`, `GET /contacts/favorites`, `POST /contacts/:id/favorite` | BE-016 |
| payment-requests | `POST/GET /payment-requests`, `GET /payment-requests/:id`, `POST /payment-requests/:id/pay`, `/cancel`, `/remind` | BE-017 |
| qr | `POST /qr/generate`, `POST /qr/parse` | BE-018 |
| notifications | `GET /notifications`, `POST /notifications/:id/read` | BE-015 |
| bills, recharges, rewards, analytics | see TASKS | BE-023, BE-024, BE-026 |
| webhooks | `POST /webhooks/:provider` | BE-021 |
| developer-lab | `GET /developer-lab/topics`, `/questions`, `/questions/:id`, `POST /developer-lab/answers`, `GET /developer-lab/workflows`, `/relationships` | BE-028 |

## Socket.IO (planned, BE-013)

Handshake: `auth: { token: <access token> }`; the server joins the socket only to `user:<userId>`. Events: `payment.created`, `payment.processing`, `payment.success`, `payment.failed`, `payment.refunded`, `request.created`, `request.paid`, `notification.created`, `security.alert`. Payloads carry the same public DTOs as REST.
