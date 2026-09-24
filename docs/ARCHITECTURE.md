# MiNi Payment Server — architecture

## Style: modular monolith

One deployable Node.js process (Express 5 + TypeScript, ESM) with strict internal module boundaries. MongoDB is the source of truth; Redis holds short-lived, reconstructible state. See ADR-001 for why microservices are deferred.

```mermaid
flowchart LR
  Client[mini-payment-app] -->|HTTPS /api/v1| API
  Client <-->|Socket.IO (planned)| API
  subgraph API[mini-payment-server process]
    MW[Middleware: request id, logging, helmet, CORS, body limit, operator-key guard, auth*]
    Modules[Modules: auth*, payments*, ledger*, ...]
    Bus[In-process domain events*]
    MW --> Modules --> Bus
  end
  Modules --> Mongo[(MongoDB replica set)]
  Modules --> Redis[(Redis)]
  Bus --> Queue[BullMQ on Redis*]
  Modules --> Providers[Provider adapters: sandbox*]
```

`*` = planned; see [TASKS.md](../TASKS.md).

## Source layout

```text
src/
  app.ts                 createApp(deps): composes middleware and routers (no I/O at import time)
  server.ts              bootstrap: config, logger, connections, listen, graceful shutdown
  config/                zod-validated environment
  common/
    errors/              AppError + stable error-code registry
    logging/             pino logger + redaction list
    middleware/          request-id, operator-key rejection, error handler
    utils/               money, timeouts
  docs/openapi.ts        OpenAPI 3.1 for implemented routes
  modules/
    health/              liveness/readiness
    payments/domain/     payment state machine (pure)
  infrastructure/
    database/mongodb/    mongoose connection + readiness
    database/redis/      ioredis connection + readiness
tests/
  unit/  integration/  helpers/
```

Planned directories (created only when a task needs them): `common/guards`, `common/validators`, `common/events`, `modules/<name>` for each module in the PRD, `infrastructure/providers/{payments,email,sms,push}`, `infrastructure/queue`, `infrastructure/websocket`, `infrastructure/jobs`, `infrastructure/observability`, `migrations/`.

## Module anatomy

```text
modules/payments/
  payments.routes.ts       path + middleware + validation schema binding
  payments.controller.ts   HTTP translation only
  payments.service.ts      business rules, transactions, events
  payments.repository.ts   Mongoose queries (atomic, status-conditional)
  payments.model.ts        schema + indexes
  payments.schemas.ts      zod request/response schemas
  payments.dto.ts          document → public DTO
  domain/                  pure logic (state machine, fee rules)
  index.ts                 the module's public surface (service + types)
```

Boundary rules: a module never imports another module's model or repository. Cross-module needs go through the other module's exported service (synchronous) or domain events (asynchronous). This keeps each module extractable.

## Request pipeline

1. `requestId` — accept safe inbound `X-Request-Id` or generate UUID; echo header.
2. `pino-http` — structured access log with requestId (health checks not logged).
3. `helmet` — security headers.
4. `cors` — explicit origin allowlist, credentials enabled, `x-request-id` exposed.
5. `express.json` — body limit from `REQUEST_BODY_LIMIT`.
6. `rejectOperatorKeys` — rejects `$`-prefixed, dotted and prototype keys.
7. Routers under `/api/v1`.
8. `notFoundHandler` → `errorHandler` (single error contract).

Express 5 forwards rejected promises from async handlers to the error handler, so handlers do not need try/catch wrappers.

## Runtime and configuration

| Variable | Meaning |
| --- | --- |
| `NODE_ENV` | Node semantics: development, test, production |
| `APP_ENV` | Deployment label: local, development, test, staging, production (staging/production force `NODE_ENV=production` and forbid wildcard CORS) |
| `PAYMENT_PROVIDER_MODE` | Only `sandbox` is accepted |
| `MONGODB_URI` | Must target a replica set (transactions) |
| `REDIS_URL` | Redis connection |

The HTTP server starts before database connections complete; readiness returns 503 until MongoDB and Redis respond. MongoDB reconnects with capped exponential backoff; ioredis reconnects automatically. `bufferCommands` is disabled so queries fail fast during outages instead of hanging.

## Data and consistency

- MongoDB 8 replica set (single node locally) for multi-document transactions used by ledger transfers.
- Mongoose global `sanitizeFilter` and `strictQuery` enabled.
- Money as integer minor units (ADR-003). Ledger design and idempotency are in [PAYMENT_LIFECYCLE.md](PAYMENT_LIFECYCLE.md).
- Redis is never the source of truth for financial records.

## Real-time and async (planned)

Domain events are emitted in-process after a transaction commits. Subscribers: Socket.IO gateway (user rooms `user:<id>`), notification queue producer, rewards, analytics projections. BullMQ on Redis handles notifications, receipts, provider polling, webhook processing and reconciliation. The event interface is kept broker-agnostic so it can later be backed by SQS/SNS or another broker without changing publishers.

## Extraction path

When there is an operational reason (independent scaling, deployment cadence, team ownership, fault isolation), modules can become services in this order, each already isolated behind a service interface and events:

| Candidate | Trigger for extraction |
| --- | --- |
| notifications | Delivery volume/latency must not affect API; provider outages |
| provider-integration + webhooks | Real provider onboarding, network isolation, separate secrets |
| risk | Heavier models or independent release cadence |
| analytics/reporting | Heavy aggregation load; MySQL/warehouse projection |
| payments + ledger | Last; requires distributed transaction strategy (outbox/saga) |

Prerequisite for any extraction: a transactional outbox so events are published reliably across process boundaries.

## Deployment readiness (not deployed)

Container image (`Dockerfile`, non-root, healthcheck) and Compose stack exist. Future AWS mapping, introduced only when justified: ECS Fargate (API), MongoDB Atlas or DocumentDB (evaluate transaction/feature compatibility first), ElastiCache Redis, Secrets Manager, CloudWatch, ALB + WAF.
