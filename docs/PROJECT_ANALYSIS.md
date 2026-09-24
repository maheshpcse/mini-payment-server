# MiNi Payment Server — project analysis

Analysis date: 24 September 2026. Scope: this repository, the sibling [mini-payment-app](https://github.com/maheshpcse/mini-payment-app) and the supplied master prompts (backend, frontend, full-stack). This is a source-based assessment, not a production certification.

## Starting point

The repository contained only a one-line README. No prior code, dependencies, data, CI or infrastructure existed, so there was no compatibility constraint to preserve. The stack is therefore chosen fresh from the master prompt (ADR-001 to ADR-005 in [DECISIONS.md](DECISIONS.md)).

## Inputs and how they are applied

| Input | Application |
| --- | --- |
| Backend master prompt §1–§60 | Requirements source. Captured in [PRD](PRD.md) and decomposed into bounded tasks in [TASKS.md](../TASKS.md). |
| Explicit direction: no microservices first | Modular monolith with module boundaries that allow later extraction of payments, notifications, risk, provider integration and analytics (ADR-001, [ARCHITECTURE](ARCHITECTURE.md#extraction-path)). |
| [miniHrmsUI](https://github.com/maheshpcse/miniHrmsUI) engineering discipline | Documentation-first: RULES, TASKS with evidence, PROJECT_ANALYSIS, specialist docs, dated MEMORY handoffs. Its Angular/Express/MySQL runtime is **not** reused. |
| Prompt §45 delivery strategy (frontend) / §53 (backend) | Incremental stages with a working build after each; this session delivers only the Foundation stage. |

## Current state (evidence-based)

| Area | State | Evidence |
| --- | --- | --- |
| Runtime skeleton, config, logging, errors, security middleware | Implemented | `src/app.ts`, `src/common/**`, `tests/integration/app.test.ts` |
| Health / readiness / OpenAPI | Implemented | `src/modules/health`, `src/docs/openapi.ts`, tests |
| Money helpers, payment state machine | Implemented as pure domain code | `src/common/utils/money.ts`, `src/modules/payments/domain/payment-state.ts`, unit tests |
| MongoDB and Redis connectivity | Implemented (connect, reconnect, readiness) | Manual smoke run recorded in TASKS BE-001 |
| Docker image and compose | Written, **not executed** here | BE-029 |
| CI workflow | Written, **not yet run** | `.github/workflows/ci.yml` |
| Auth, sessions, password reset, rate limiting | Implemented | `src/modules/auth`, `tests/integration/auth.test.ts` |
| Profile, avatar, preferences, sandbox payment methods, wallet summary | Implemented | `src/modules/{users,payment-methods}`, `tests/integration/accounts.test.ts` |
| Ledger, payments API, real-time, remaining modules | **Not implemented** | TASKS BE-005 onward |

## Requirement interpretation and unknowns

| Topic | Interpretation | Open question for product owner |
| --- | --- | --- |
| Currency | INR only, minor unit paise | Multi-currency needed? (would require FX rules) |
| Sandbox funding | Users receive sandbox balance from a system ledger account | Starting balance / top-up rules |
| Payment limits | Per-transaction and daily limits configured server-side | Actual limit values |
| OTP channel | Sandbox provider logs nothing sensitive and returns codes only in `local`/`test` | Which real email/SMS provider, if any |
| MySQL | Optional reporting projection, deferred (BE-031) | Is reporting in MySQL actually required? |
| AWS | Not introduced; design is container-friendly | Target hosting and budget |
| Compliance | Sandbox only; no KYC, PCI, or RBI obligations assumed | Any real-money ambition changes scope fundamentally |

## Risks

| Risk | Mitigation |
| --- | --- |
| Uncontrolled AI-generated breadth (hundreds of files, repeated rewrites) | RULES + bounded TASKS with acceptance/verification; one stage per change |
| Money correctness (floats, double spend, races) | ADR-003 integer minor units; state machine; ledger + Mongo transactions; idempotency (BE-010/011/012) |
| Sandbox mistaken for real payments | `PAYMENT_PROVIDER_MODE` accepts only `sandbox`; health and OpenAPI state sandbox mode; UI must label demo mode |
| Library version churn (new majors: Express 5, Zod 4, Mongoose 9, ioredis 6, Vitest 5) | Versions pinned via lockfile; TypeScript held at 6.0.x for typescript-eslint support (ADR-005) |
| Docker/CI untested at time of writing | BE-029 before any deployment work |

## Ownership roles

Product owner: scope, limits, metrics. Backend maintainer: contracts, data, security, tests. Release maintainer: CI, containers, backups. These are responsibility roles, not named people.
