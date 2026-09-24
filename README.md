# mini-payment-server

Backend for **MiNi Payment App**: a **sandbox / demo payment platform**. It moves no real money and performs no real banking, UPI, card or settlement operations. Provider adapters are designed so an approved payment provider can be connected later.

Architecture: **TypeScript + Express 5 modular monolith**, **MongoDB** (primary store), **Redis** (short-lived state, rate limits, queues). No microservices yet. See [docs/DECISIONS.md](docs/DECISIONS.md) (ADR-001).

## Status

Foundation stage only. What exists today is listed in [docs/MEMORY.md](docs/MEMORY.md); planned work with acceptance criteria is in [TASKS.md](TASKS.md).

| Implemented | Not implemented yet |
| --- | --- |
| Config validation, structured logging with redaction, request ids, error contract, Helmet/CORS, body limits, NoSQL operator-key rejection | Auth, users, sessions, PIN, OTP |
| `GET /api/v1/health`, `GET /api/v1/health/ready`, `GET /api/v1/openapi.json` | Ledger, wallets, payments API, idempotency storage |
| Money helpers (integer minor units) and payment state machine (domain only) | Socket.IO, queues, notifications, webhooks, all other modules |
| MongoDB/Redis connection management with readiness | Rate limiting (needs Redis store, see BE-004) |

## Quick start

Requirements: Node.js 22.12+ and either Docker or local MongoDB (as a replica set) and Redis.

```bash
cp .env.example .env
docker compose up -d mongo redis   # or run your own MongoDB replica set + Redis
npm install
npm run dev                        # http://localhost:4000/api/v1/health
```

Full stack in containers: `docker compose up --build`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch mode with `tsx`, loads `.env` if present |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm test` | Vitest unit + HTTP integration tests (no database needed) |
| `npm run check` | Everything CI runs except Docker and audit |

## Documentation

Start with [docs/PROJECT_ANALYSIS.md](docs/PROJECT_ANALYSIS.md), then [RULES.md](RULES.md) and [TASKS.md](TASKS.md).

| Document | Purpose |
| --- | --- |
| [PRD](docs/PRD.md) | Product scope, actors, acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | Modules, layers, runtime, extraction path |
| [API contracts](docs/API_CONTRACTS.md) | Envelope, errors, headers, implemented and planned endpoints |
| [Data dictionary](docs/DATA_DICTIONARY.md) | Collections, fields, indexes |
| [Payment lifecycle](docs/PAYMENT_LIFECYCLE.md) | State machine, ledger, idempotency, concurrency |
| [Provider integration](docs/PROVIDER_INTEGRATION.md) | Adapter interfaces and webhook rules |
| [Security](docs/SECURITY.md) | Controls in place and planned, threat notes |
| [Observability](docs/OBSERVABILITY.md) | Logs, health, metrics, backup/restore |
| [Test plan](docs/TEST_PLAN.md) | Test matrix and current results |
| [Decisions](docs/DECISIONS.md) | ADRs |
| [Memory](docs/MEMORY.md) | Dated handoff: current state and next step |

Frontend: [mini-payment-app](https://github.com/maheshpcse/mini-payment-app) (React + Vite + TypeScript).
