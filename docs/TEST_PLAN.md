# MiNi Payment Server — test plan

## Commands

| Command | Scope |
| --- | --- |
| `npm test` | Vitest: unit + HTTP integration via Supertest (no external services) |
| `npm run check` | lint + typecheck + tests + build |
| CI (`.github/workflows/ci.yml`) | `check` steps + `npm audit --omit=dev --audit-level=high` + Docker build + compose validation |

Planned: `npm run test:integration` with `mongodb-memory-server` replica set (BE-003); Redis via a CI service container or an in-memory test double for rate limits.

## Test data

Synthetic only. No real names, phone numbers, emails, bank or card data. Use `example.com` / `example.test` domains and obviously fake numbers.

## Current results (24 Sep 2026)

`npm run check`: 12 files, 132 tests, all passing. Manual smoke runs against a real MongoDB 8.2.6 replica set and Redis 7.0.15 are recorded in TASKS (BE-001, BE-004).

| File | Covers |
| --- | --- |
| `tests/unit/money.test.ts` | decimal→minor conversion, binary-inexact values, malformed input, formatting, round trip, overflow |
| `tests/unit/payment-state.test.ts` | allowed/forbidden transitions, terminal states, error code/details |
| `tests/unit/env.test.ts` | defaults, CSV parsing, required vars, sandbox-only, production CORS/NODE_ENV rules, no value echo |
| `tests/unit/logger.test.ts` | redaction of auth header, cookie, password, PIN, OTP, refresh token |
| `tests/integration/app.test.ts` | health/readiness, request ids, 404/400/413 contract, operator-key rejection, Helmet, CORS allowlist |
| `tests/integration/openapi.test.ts` | OpenAPI served; documented routes exist |
| `tests/integration/database.test.ts` | replica-set transactions, migration runner lock/history |
| `tests/integration/migrations.test.ts` | migration 0001 indexes equal the model indexes |
| `tests/integration/auth.test.ts` | registration, login without enumeration, rate limit, refresh rotation + replay, concurrent refresh, Origin/cookie checks, cross-site cookie flags, logout/sessions, tampered tokens, forgot/reset/change password |
| `tests/integration/accounts.test.ts` | profile, avatar upload/serve/validation, preferences + ceilings, bank accounts/UPI IDs, defaults, ownership, method cap |
| `tests/unit/rate-limit.test.ts` | windows, 429 + Retry-After, fail-open |
| `tests/unit/deployment-config.test.ts` | hosted-deployment rules incl. JWT secret and SameSite |

## Required matrix (from master prompt §48–§49)

| Area | Cases | Task |
| --- | --- | --- |
| Auth | register, login, refresh, rotation reuse, logout, logout-all, revoked session | BE-004 |
| OTP | expired, too many attempts, reuse, resend delay | BE-007 |
| PIN | incorrect PIN, lockout | BE-008 |
| Authorization | role checks, ownership (IDOR) | BE-005 |
| Payments | creation, authorization, invalid transition, expired payment, insufficient balance, invalid recipient, limit exceeded | BE-012 |
| Idempotency | replay, conflicting body, concurrent identical requests | BE-011 |
| Concurrency | parallel debits cannot overdraw | BE-010 |
| Refunds | double refund, balanced ledger | BE-019 |
| Requests | expired, non-recipient pay | BE-017 |
| QR | tampered, expired | BE-018 |
| Notifications | failure does not fail payment | BE-015 |
| WebSocket | unauthenticated rejected, cross-user isolation | BE-013 |
| Webhooks | duplicate event, bad signature, stale timestamp | BE-021 |
| Rate limiting | auth, OTP, payments | BE-004 |
| Failure injection | provider timeout/failure, database failure, queue failure | BE-012, BE-015 |

## Rules

Report actual results including failures and skipped suites. Never run destructive tests against shared or production databases. A task closes only with its verification recorded in TASKS.md.
