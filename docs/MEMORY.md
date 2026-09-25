# Project memory

Update after every work session: what changed, checks actually run, limits, next bounded task. Keep secrets, personal data and transcripts out.

## Standing preferences

- Sandbox/demo only; never present simulated transfers as real payments.
- Modular monolith first (ADR-001); split services only with an operational reason.
- Documentation-first, evidence-based task closure (miniHrmsUI discipline, not its runtime).
- INR, integer minor units.
- Frontend is the sibling React + Vite + TypeScript repo `mini-payment-app`; dev origin `http://localhost:5173`, API `http://localhost:4000/api/v1`.

## 24 September 2026 — Foundation

**Done:** BE-001 (skeleton, config, logging, errors, security middleware, health/readiness/OpenAPI, Mongo/Redis connections, Docker/Compose/CI files) and BE-002 (money helpers, payment state machine). Full documentation set created.

**Checks run:** `npm run check` (lint, typecheck, 70 tests, build) passing. Smoke run of the built server against MongoDB 8.2.6 replica set and Redis 7.0.15: readiness 200/503/200 across a Redis restart; operator-key rejection; graceful SIGTERM shutdown.

**Not verified:** Docker image build and Compose stack (no Docker in the build environment); CI has not run.

**Next bounded task:** BE-003 (database test harness + migrations), then BE-004 (auth). BE-029 (Docker validation) can run in parallel on a Docker-capable machine.

## 24 September 2026 — BE-003 and Railway deployment

**Done:** BE-003 (in-memory replica-set test harness, forward-only migration runner with lock and history checks, ADR-008). BE-032 (Railway config as code, deploy check/prepare scripts, PORT-aware Docker health check, compose runs migrations first, CI image validation, `docs/DEPLOYMENT.md`) modelled on miniHrmsServer.

**Checks run:** `npm run check` 92/92 tests; `railway.json` validated against `https://railway.com/railway.schema.json`; built `deploy:prepare` against the local replica set (applied, then no-op) and against a standalone mongod (rejected, exit 1); `deploy:check` with a development config lists every violation without values.

**Not verified:** Docker build (no Docker here; CI covers it), any live Railway/Atlas deployment.

**Open question (decide before BE-004 ships):** refresh-token cookie across `github.io` → `up.railway.app` is cross-site. Preferred: same-site custom domains with `SameSite=Lax`; fallback `SameSite=None; Secure; Partitioned` + Origin checks.

**Next bounded task:** BE-004 (auth).

## 24 September 2026 — Actions dispatch + Railway deploy workflow

**Why:** the merged `ci.yml` had no `workflow_dispatch`, so GitHub showed no **Run workflow** button, and there was no Actions workflow that deploys the API (miniHrmsServer's `backend-ci.yml` has dispatch).

**Done:** BE-033 — `Backend CI` (push/PR on main+master, Run workflow, step summary) and `Deploy to Railway` (`railway up --ci` via project token, readiness poll, opt-in auto-deploy after CI).

**Checks run:** `actionlint` on all four workflows in both repos; Railway CLI 5.62.1 `up --help` flags; unauthenticated run fails fast. `npm run check` still green.

**Not verified:** a real Railway deploy (needs `RAILWAY_TOKEN` and a provisioned project).

## 24 September 2026 — Live CORS failure on GitHub Pages

**Symptom:** `https://maheshpcse.github.io/mini-payment-app/` → preflight to Railway had no `Access-Control-Allow-Origin`. API itself healthy (`/health/ready` 200, MongoDB + Redis up).

**Cause (probed with curl):** Railway `CORS_ORIGINS` was `https://maheshpcse.github.io/mini-payment-app/`; browsers send `Origin: https://maheshpcse.github.io`, so nothing matched. Pre-deploy validation would have rejected that value, so the running release evidently did not execute `deploy:prepare` — to confirm in Railway deploy logs.

**Fix:** origins normalized to scheme+host (path, trailing slash, quotes dropped, deduplicated); rejected origins logged once each (bounded); effective `corsOrigins` in the startup log. Verified with the built server using the exact Railway value.

**Security:** `.env.production` with live Railway MongoDB/Redis credentials had been committed to the public repo (and a placeholder `.env`). Files removed and CI now fails on tracked env files; **credentials must be rotated in Railway** (history still contains them).

## 24 September 2026 — Auth, profile, avatars, preferences, payment methods

**Done:** BE-004 (register, login, refresh rotation with replay detection, logout, logout-all, forgot/reset/change password, sessions), BE-034 (profile, avatar, preferences), BE-035 (sandbox bank accounts and UPI IDs, wallet summary). Migration `0001-accounts-and-sessions`. Removed the Developer Lab task (BE-028) and the `DEVELOPER` role — the Lab was out of scope.

**Checks run:** `npm run check` → 12 files / 132 tests. Built server against the local replica set + Redis, driven by the web app in headless Chrome.

**Decided:** cross-site cookies use `SameSite=None; Secure; Partitioned` + Origin checks (see DEPLOYMENT.md); custom domains remain the long-term fix.

**Action for the owner:** set `JWT_SECRET` in Railway before deploying (pre-deploy check fails without it). Rotate the MongoDB/Redis credentials that were previously committed.

**Not verified:** live Railway deploy; reset-email delivery (no provider yet, BE-015).

**Next bounded task:** BE-005 roles/permissions, then BE-010 ledger so the wallet shows a real sandbox balance.

## 25 September 2026 — Reference data and demo logins

**Done:** BE-036. Roles, permissions, menus, master data (banks, UPI handles, statuses, categories, platform settings) and fictional merchants/billers/operators live in `src/modules/reference-data/data` and are seeded by migration `0002-reference-data`. Migration `0003-demo-accounts` creates demo logins (password `MiniPay@2026`; staff demos only outside staging/production). New `GET /masters`, `/menus`, `/entities`. Migrations now receive `{appEnv, fingerprintSecret, hasher}`. Everything is listed in [MASTER_DATA.md](MASTER_DATA.md).

**Decided:** demo accounts are shared, so password, profile, avatar and session changes return `DEMO_ACCOUNT_RESTRICTED`; payment methods and preferences stay editable so the pages can be tried.

**Next bounded task:** BE-005 `requireRole` using the seeded permissions, then BE-010 ledger.

## 25 September 2026 — Usernames and sign-in by email or username

**Done:** BE-037. Users have a unique lowercase `username` (required at sign-up, editable in the profile). `POST /auth/login` takes `{identifier, password}` where the identifier is an email or a username; `{email}` still works for older clients. `POST /auth/register` now only creates the account (`201 {user}`), and the web app sends people to the sign-in page. Migration `0004-usernames` backfills existing accounts and gives demo logins their handles (`priya.demo`, `rahul.demo`, …).

**Decided:** `USERNAME_UNAVAILABLE` names the field because usernames are public handles; email/phone conflicts stay unspecific. Email and username are separate rate-limit buckets.

**Next bounded task:** BE-005 `requireRole`, then BE-010 ledger.

