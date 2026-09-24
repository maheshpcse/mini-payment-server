# MiNi Payment Server — development rules

These rules apply to every human or AI contributor. Current explicit user instructions take precedence. Reading this file does not authorize executing the backlog.

## Before changing code

1. Read [docs/PROJECT_ANALYSIS.md](docs/PROJECT_ANALYSIS.md), this file, the relevant specialist docs, the source you will touch and its tests.
2. Distinguish **implemented** behavior (source + passing test), **requested** behavior (PRD/TASKS) and **unknowns**. Never describe planned behavior as implemented.
3. Pick one bounded task from [TASKS.md](TASKS.md). Identify affected contracts (API, data, events) before editing.

## Architecture

4. Keep the modular monolith (ADR-001). A module owns its routes, controller, service, repository and models under `src/modules/<name>/`. Other modules use its exported service or domain events, never its models or collections directly.
5. Flow: route → middleware (auth, validation) → controller (HTTP only) → service (business rules) → repository (persistence) → database/provider. Skip a layer only when it would be an empty pass-through.
6. Do not add abstractions, dependencies or infrastructure (brokers, AWS services, MySQL) without a task that needs them and a DECISIONS entry.
7. Preserve existing working behavior; do not replace a working system because another pattern is fashionable.

## Money and payments

8. Money is an integer count of minor units (`amountMinor`) plus an ISO currency. No floating-point arithmetic on amounts. Use `src/common/utils/money.ts`.
9. Payment status changes go through `assertTransition` and a status-conditional atomic update. Never accept status, fee, sender or balance from the client.
10. Balances derive from immutable ledger entries. Never write `balance += amount` without the corresponding ledger entries in the same transaction.
11. Money-moving endpoints require an `Idempotency-Key` and must be safe under retries and concurrent requests.

## Security

12. Authorization is enforced server-side: authentication, RBAC and resource ownership on every protected route. Client guards are not security.
13. Validate all external input (body, params, query, headers, webhooks) with Zod. Unknown fields are rejected or stripped; never spread request bodies into models.
14. Responses use explicit DTO mappers. Never return raw Mongoose documents.
15. Never log or return passwords, PINs, OTPs, tokens, secrets, private keys or card data. Extend `REDACTED_PATHS` when adding a sensitive field.
16. Never collect raw PAN/CVV/card PIN. Future card flows use provider-hosted tokenization.
17. No real secrets in the repository, fixtures, tests or examples. `.env.example` holds placeholders only. Use synthetic data.

## Data

18. Schema/data changes ship as forward-only versioned migrations (BE-003). Never edit an applied migration.
19. Never run destructive or migration tests against a shared or production database; use disposable databases.
20. Declare indexes for real query patterns and document them in [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md).

## Delivery

21. Keep changes scoped and reviewable; one logical change per commit.
22. Run meaningful checks (`npm run check`, plus integration tests once available) and report actual results, including failures and what was not run.
23. Update affected docs in the same change: API_CONTRACTS + OpenAPI for endpoints, DATA_DICTIONARY for models, PAYMENT_LIFECYCLE for states, SECURITY for controls, MEMORY after each session.
24. Close a task in TASKS.md only with verification evidence (commands run, results, revision).
25. Do not commit, push, deploy or change remote infrastructure unless the user or the operating environment explicitly instructs it.
