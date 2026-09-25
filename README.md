# mini-payment-server

Backend for **MiNi Payment App**: a **sandbox / demo payment platform**. It moves no real money and performs no real banking, UPI, card or settlement operations. Provider adapters are designed so an approved payment provider can be connected later.

Architecture: **TypeScript + Express 5 modular monolith**, **MongoDB** (primary store), **Redis** (short-lived state, rate limits, queues). No microservices yet. See [docs/DECISIONS.md](docs/DECISIONS.md) (ADR-001).

## Status

Foundation plus authentication and accounts. What exists today is listed in [docs/MEMORY.md](docs/MEMORY.md); planned work with acceptance criteria is in [TASKS.md](TASKS.md).

| Implemented | Not implemented yet |
| --- | --- |
| Config validation, structured logging with redaction, request ids, error contract, Helmet/CORS, body limits, NoSQL operator-key rejection | PIN, OTP, email/phone verification |
| Auth: register, login, refresh rotation with replay detection, logout(-all), forgot/reset/change password, sessions; Redis rate limiting | Roles/permissions (BE-005), audit log |
| Profile, avatars, notification/payment preferences, sandbox bank accounts and UPI IDs | Email/SMS/push delivery (BE-015) |
| `GET /api/v1/health`, `GET /api/v1/health/ready`, `GET /api/v1/openapi.json` | Ledger-backed wallet balance, payments API, idempotency storage |
| Money helpers (integer minor units) and payment state machine (domain only) | Socket.IO, queues, notifications, webhooks, all other modules |
| MongoDB/Redis connection management with readiness; migrations | |

## Quick start

Requirements: Node.js 22.12+ and either Docker or local MongoDB (as a replica set) and Redis.

```bash
cp .env.example .env
docker compose up -d mongo redis   # or run your own MongoDB replica set + Redis
npm install
npm run migrate                    # indexes, reference data and demo logins
npm run dev                        # http://localhost:4000/api/v1/health
```

Demo login: `demo@example.com` / `MiniPay@2026`. All demo accounts, including the local-only staff ones, are listed in [docs/MASTER_DATA.md](docs/MASTER_DATA.md#demo-logins).

Full stack in containers: `docker compose up --build`.

Production: Railway (Docker) for this API, GitHub Pages for the app — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch mode with `tsx`, loads `.env` if present |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm test` | Vitest unit + HTTP + database integration tests (starts an in-memory MongoDB 8.2.6 replica set; set `MONGODB_TEST_URI` to use your own) |
| `npm run migrate` | Apply pending forward-only migrations (`migrate:prod` in the built image) |
| `npm run deploy:check` / `deploy:prepare` | Hosted-deployment config validation / Railway pre-deploy (validate + migrate); run after `npm run build` |
| `npm run check` | Everything CI runs except Docker and audit |

## Documentation

Start with [docs/PROJECT_ANALYSIS.md](docs/PROJECT_ANALYSIS.md), then [RULES.md](RULES.md) and [TASKS.md](TASKS.md).

| Document | Purpose |
| --- | --- |
| [PRD](docs/PRD.md) | Product scope, actors, acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | Modules, layers, runtime, extraction path |
| [API contracts](docs/API_CONTRACTS.md) | Envelope, errors, headers, implemented and planned endpoints |
| [Data dictionary](docs/DATA_DICTIONARY.md) | Collections, fields, indexes |
| [Master data](docs/MASTER_DATA.md) | Roles, permissions, menus, masters, sandbox entities, **demo logins** |
| [Payment lifecycle](docs/PAYMENT_LIFECYCLE.md) | State machine, ledger, idempotency, concurrency |
| [Provider integration](docs/PROVIDER_INTEGRATION.md) | Adapter interfaces and webhook rules |
| [Security](docs/SECURITY.md) | Controls in place and planned, threat notes |
| [Observability](docs/OBSERVABILITY.md) | Logs, health, metrics, backup/restore |
| [Test plan](docs/TEST_PLAN.md) | Test matrix and current results |
| [Decisions](docs/DECISIONS.md) | ADRs |
| [Memory](docs/MEMORY.md) | Dated handoff: current state and next step |

Frontend: [mini-payment-app](https://github.com/maheshpcse/mini-payment-app) (React + Vite + TypeScript).
