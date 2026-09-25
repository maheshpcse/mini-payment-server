# MiNi Payment Server — security

Sandbox system: no real money, card data or bank credentials are handled. This document separates controls **in place** (with source) from **planned** controls. It is not a penetration test or compliance attestation.

## Controls in place

| Control | Source | Test |
| --- | --- | --- |
| Environment validation; errors list variable names, never values | `src/config/env.ts` | `tests/unit/env.test.ts` |
| Only sandbox provider mode accepted | `src/config/env.ts` | env test |
| Wildcard CORS forbidden in staging/production; explicit allowlist | `src/config/env.ts`, `src/app.ts` | env + app tests |
| Helmet security headers, `x-powered-by` disabled | `src/app.ts` | app test |
| JSON body limit (default 100 kb) | `src/app.ts` | app test (413) |
| Rejection of `$`-prefixed, dotted, `__proto__`/`constructor`/`prototype` keys in body/query | `src/common/middleware/reject-operator-keys.ts` | app test |
| Mongoose `sanitizeFilter` + `strictQuery` | `src/infrastructure/database/mongodb/connection.ts` | — (exercised from BE-003) |
| Simple query parser (no nested query objects) | `src/app.ts` | — |
| Uniform error contract; no stack traces or internal messages to clients | `src/common/middleware/error-handler.ts` | app test |
| Request id validation (no arbitrary client text in logs) | `src/common/middleware/request-id.ts` | app test |
| Log redaction of credentials and payment secrets | `src/common/logging/logger.ts` | `tests/unit/logger.test.ts` |
| Readiness hides dependency error details | `src/modules/health/health.routes.ts` | app test |
| Non-root container user | `Dockerfile` | not executed yet (BE-029) |
| Production dependency audit in CI | `.github/workflows/ci.yml` | CI not yet run |
| Argon2id password hashing (19 MiB, t=2, p=1); dummy verify for unknown emails so timing does not reveal accounts | `src/common/security/password-hasher.ts` | `tests/integration/auth.test.ts` |
| HS256 access JWT ≤ 15 min with `iss`/`aud`; `JWT_SECRET` required and non-placeholder when deployed; every request also checks the session is active | `src/common/security/tokens.ts`, `src/common/middleware/require-auth.ts`, `src/config/deployment.ts` | auth + deployment-config tests |
| Opaque refresh token stored as SHA-256; atomic compare-and-swap rotation; replay of a previous token revokes the session | `src/modules/auth/auth.service.ts` | auth test (replay, concurrent refresh) |
| Refresh cookie HttpOnly, `Path=/api/v1/auth`; `SameSite=None; Secure; Partitioned` when deployed; trusted-Origin check on cookie endpoints (CSRF) | `src/modules/auth/auth.routes.ts` | auth test |
| Redis fixed-window rate limits per IP, per typed login identifier (email or username, hashed) and per user on auth routes. An account's email and username are separate buckets, so the per-account ceiling is effectively 20 guesses / 15 min, still bounded by the per-IP bucket; fail open with a warning if Redis is down | `src/common/middleware/rate-limit.ts` | `tests/unit/rate-limit.test.ts`, auth test |
| Published demo logins are read-only for password, profile, avatar and sessions (`DEMO_ACCOUNT_RESTRICTED`), get no reset tokens, only see their own session, and skip the per-identifier login bucket (by email or username) so one visitor cannot lock others out; staff demo accounts are never seeded in staging/production | `src/migrations/0003-demo-accounts.ts`, `auth.service.ts`, `users.routes.ts` | `tests/integration/reference-data.test.ts` |
| No account enumeration: same login error for unknown email/username or wrong password, same forgot-password response, email/phone registration conflict does not name the field. Usernames are public handles, so `USERNAME_UNAVAILABLE` does name them; demo and staff-like handles are reserved so nobody can impersonate them | auth service, `user.schemas.ts` | auth test |
| Registration never starts a session: the new user must sign in with the password they just chose | `auth.routes.ts` | auth test |
| Password reset: 30-min single-use hashed token; reset revokes all sessions, change revokes all others | auth service | auth test |
| Ownership: every account query is scoped to the caller; others' resources return 404 | users + payment-methods routes | accounts + auth tests |
| Avatars: type by magic bytes, ≤ 512 KB, unguessable ids, `nosniff` | `src/modules/users/users.routes.ts` | accounts test |
| Bank accounts: only last 4 + HMAC fingerprint stored; account numbers redacted from logs | `src/modules/payment-methods`, logger | accounts + logger tests |

## Sensitive data in logs

Never log: passwords, PINs, OTPs, access/refresh tokens, cookies, API keys, secrets, private keys, card numbers/CVV, identity documents. Redacted paths are listed in `REDACTED_PATHS`; add new sensitive field names there and to the logger test. Identifiers such as phone/email are masked in DTOs and logs (planned helper with BE-004).

## Planned controls

| Control | Design | Task |
| --- | --- | --- |
| Rate limiting | Redis-backed limits for OTP and payments | BE-007, BE-012 |
| Signing key rotation | Key ids (`kid`) so `JWT_SECRET` can rotate without signing everyone out | BE-005 |
| RBAC + ownership | Permission-based guards; ownership filters in repositories; 404 for others' resources | BE-005 |
| Transaction PIN | Argon2id hash, lockout after 5 failures, audit | BE-008 |
| OTP | Hashed, 5-min expiry, attempt limit, resend delay, single use | BE-007 |
| Payment authorization | Session + PIN + optional OTP by risk + device trust + limits + balance + recipient checks + idempotency | BE-012, BE-022 |
| Socket auth | Access token on handshake, user-scoped rooms only | BE-013 |
| QR signing | HMAC-signed payload with key id + expiry; no secrets in payload | BE-018 |
| Webhook security | Signature, timestamp, dedupe, raw body | BE-021 |
| Audit log | Append-only, separate collection | BE-006 |
| Mass-assignment prevention | Zod schemas with explicit fields; DTO mappers | every module |

## Card data rule

The system must not collect or store PAN, CVV, magnetic stripe data or card PINs. Any future card flow uses provider-hosted fields/tokenization.

## Threat notes (initial)

| Threat | Mitigation |
| --- | --- |
| Credential stuffing | Rate limits, uniform login errors, audit + `LOGIN_DETECTED` notification |
| Refresh token theft | Rotation + reuse detection revokes the family |
| IDOR on payments/transactions | Ownership in repository queries |
| Double spend | Conditional debit + transactions + idempotency |
| NoSQL injection | Zod validation, operator-key rejection, `sanitizeFilter` |
| Log leakage | Redaction + no request-body logging |
| Sandbox confusion | Sandbox mode in health/OpenAPI/UI; no real provider code paths |

## Secrets

Configuration via environment; `.env` is git-ignored; `.env.example` has placeholders only. Production secrets belong in a secret manager (e.g. AWS Secrets Manager) when hosting is chosen.
