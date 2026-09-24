# Architecture decision records

## ADR-001 — Modular monolith, not microservices (24 Sep 2026)

**Context.** The master prompt lists 20+ modules. Splitting them into services up front would add network failure modes, distributed transactions for money movement, per-service deployment/observability and duplicated auth—before any load or team-scaling reason exists.

**Decision.** One TypeScript/Express process with strict module boundaries (own models, service interfaces, domain events). MongoDB + Redis only.

**Consequences.** Simple local development and atomic ledger transactions. Boundaries are enforced by convention and review (RULES 4). Extraction candidates and triggers are documented in ARCHITECTURE.md; a transactional outbox is a prerequisite for the first extraction.

## ADR-002 — MongoDB replica set as source of truth; Redis for ephemeral state (24 Sep 2026)

**Decision.** MongoDB 8 via Mongoose 9, always as a replica set (single node locally) so ledger transfers use multi-document transactions. Redis (ioredis) for rate limits, OTP throttling, idempotency cache, queues and Socket.IO fan-out; never authoritative for money.

**Consequences.** Local setup needs a replica set (Compose handles it). DocumentDB compatibility must be evaluated before choosing it over Atlas.

## ADR-003 — Money as integer minor units (24 Sep 2026)

**Decision.** `amountMinor: number` (safe integer) + `currency`. Decimal strings converted without floats. JS `number` is sufficient: 13 whole digits of INR fit well within 2^53.

**Alternatives.** `Decimal128`/decimal libraries: more flexible for FX but heavier and easier to misuse in arithmetic. Revisit if multi-currency with FX is required.

## ADR-004 — Express 5, Zod 4, pino, Vitest (24 Sep 2026)

**Decision.** Express 5 (native async error propagation), Zod 4 for config and request validation, pino/pino-http for structured logs with redaction, Vitest + Supertest for tests, ESM with `nodenext` resolution.

**Consequences.** Relative imports use `.js` extensions. `createApp()` is dependency-injected (config, logger, readiness checks) so HTTP tests run without databases.

## ADR-005 — TypeScript 6.0.x instead of 7 (24 Sep 2026)

**Context.** TypeScript 7 is the latest release, but typescript-eslint 8.70 supports `typescript >=4.8.4 <6.1.0`.

**Decision.** Pin `typescript@~6.0.3`. Re-evaluate when typescript-eslint supports 7.

## ADR-006 — Start HTTP before dependencies connect (24 Sep 2026)

**Decision.** The server listens immediately; MongoDB connects with capped backoff, Redis reconnects automatically, readiness reports 503 until both are up. `bufferCommands=false` makes queries fail fast.

**Consequences.** Orchestrators must route traffic on readiness, not liveness.

## ADR-007 — MySQL deferred (24 Sep 2026)

**Decision.** No MySQL container or code until a reporting requirement is confirmed (BE-031). If adopted, it is an asynchronous projection from domain events, never a synchronous dual write or a "backup" of MongoDB.

## ADR-008 — Forward-only migrations own production indexes (24 Sep 2026)

**Context.** Mongoose `autoIndex` builds indexes on model load, which is convenient locally but uncontrolled in production (unplanned index builds at deploy, no history).

**Decision.** `src/migrations` holds ordered, append-only migrations run by `npm run migrate` (`migrate:prod` in the image) before the API starts. History lives in `migrations`; a `migration_locks` document with a 10-minute expiry prevents concurrent runs. Production runs with `autoIndex=false`; development and tests keep it on. Schema-declared indexes must match the migration that creates them (parity tested per module). Integration tests use a `mongodb-memory-server` 8.2.6 replica set (override with `MONGODB_TEST_URI`), one database per test file.

**Consequences.** Index changes require a new migration; destructive changes (drops, backfills) are separate, reviewed migrations.
