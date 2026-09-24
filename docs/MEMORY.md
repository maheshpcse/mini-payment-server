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
