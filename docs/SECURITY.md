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

## Sensitive data in logs

Never log: passwords, PINs, OTPs, access/refresh tokens, cookies, API keys, secrets, private keys, card numbers/CVV, identity documents. Redacted paths are listed in `REDACTED_PATHS`; add new sensitive field names there and to the logger test. Identifiers such as phone/email are masked in DTOs and logs (planned helper with BE-004).

## Planned controls

| Control | Design | Task |
| --- | --- | --- |
| Password hashing | Argon2id (memory-hard; parameters documented and benchmarked) | BE-004 |
| Access tokens | JWT, ≤ 15 min, asymmetric or strong HMAC key from env/secret manager, `aud`/`iss` checked | BE-004 |
| Refresh tokens | Opaque random, stored as SHA-256 hash, rotation on each use, family revocation on reuse, httpOnly Secure SameSite cookie | BE-004 |
| Rate limiting | Redis-backed limits: auth (per IP + per account), OTP, payments | BE-004, BE-007, BE-012 |
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
