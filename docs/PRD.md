# MiNi Payment Server — product requirements

Source: backend master prompt (24 Sep 2026). Status column reflects source code, not intent.

## Product statement

MiNi Payment is a **sandbox/demo** consumer payment platform that demonstrates real payment-engineering concepts (secure auth, precise money, ledger, idempotency, state machines, real-time events, provider adapters, webhooks, audit, risk, observability, recovery) without moving real money. Simulated transfers are never represented as real banking, UPI or card transactions.

## Actors

| Actor | Description |
| --- | --- |
| USER | Consumer who sends, requests and receives sandbox money, pays sandbox bills |
| SUPPORT | Reads user context to help; no money movement |
| OPERATIONS | Manages billers, limits, reconciliation views |
| ADMIN | Manages roles and configuration |
| AUDITOR | Read-only access to audit logs |
| DEVELOPER | Accesses Developer Lab and diagnostics in non-production |
| Sandbox provider | Simulated payment/bill/recharge/OTP provider with realistic delays and failures |

## Functional requirements

| ID | Requirement | Task(s) | Status |
| --- | --- | --- | --- |
| R-01 | Versioned REST API under `/api/v1` with consistent success/error envelopes | BE-001 | Implemented (health only) |
| R-02 | Register, login, logout, refresh rotation, logout-all, session expiry | BE-004 | Planned |
| R-03 | OTP (email/phone verification, reset password) via provider abstraction | BE-007 | Planned |
| R-04 | Transaction PIN setup/verify with lockout | BE-008 | Planned |
| R-05 | Device and session management, revoke sessions | BE-009 | Planned |
| R-06 | RBAC + resource ownership on every protected route | BE-005 | Planned |
| R-07 | Double-entry sandbox ledger; wallet balances derived from immutable entries | BE-010 | Planned |
| R-08 | Payments with explicit state machine; server decides amount validity, sender, fee, status | BE-002, BE-012 | Domain implemented; API planned |
| R-09 | Idempotent money-moving endpoints (`Idempotency-Key`) | BE-011 | Planned |
| R-10 | Real-time user-scoped events over authenticated Socket.IO | BE-013 | Planned |
| R-11 | Transaction history with cursor pagination, filters, summary, export | BE-014 | Planned |
| R-12 | In-app notifications; email/SMS/push abstractions; delivery never blocks payment completion | BE-015 | Planned |
| R-13 | Contacts and beneficiaries with privacy-aware lookup | BE-016 | Planned |
| R-14 | Money requests (PENDING, PAID, DECLINED, CANCELLED, EXPIRED) | BE-017 | Planned |
| R-15 | Signed demo QR payloads without secrets | BE-018 | Planned |
| R-16 | Refunds and reversals via compensating ledger entries | BE-019 | Planned |
| R-17 | Provider webhooks with signature, timestamp, replay and dedupe protection | BE-021 | Planned |
| R-18 | Rule-based sandbox risk engine (explicitly not bank-grade) | BE-022 | Planned |
| R-19 | Bills and mobile recharge through provider adapters | BE-023 | Planned |
| R-20 | Rewards rules engine; server-computed, idempotent | BE-024 | Planned |
| R-21 | Security center APIs | BE-025 | Planned |
| R-22 | User analytics | BE-026 | Planned |
| R-23 | Append-only audit log separate from application logs | BE-006 | Planned |
| R-24 | Developer Lab APIs isolated from payment domain | BE-028 | Planned |
| R-25 | OpenAPI reflecting implemented routes; Swagger UI outside production | BE-001, BE-020 | Document served; UI planned |

## Non-functional requirements

| ID | Requirement | Status |
| --- | --- | --- |
| N-01 | No floating-point money; integer minor units | Implemented (helpers) |
| N-02 | Sensitive data never logged or returned | Redaction implemented; per-module DTOs planned |
| N-03 | Health and readiness endpoints for orchestration | Implemented |
| N-04 | Environment-based configuration; no committed secrets | Implemented |
| N-05 | Local stack via Docker Compose; CI with lint, typecheck, tests, build, audit, Docker build | Written; not yet executed (BE-029) |
| N-06 | Documented backup/restore with an actual restore test before production | Planned (BE-030) |

## Out of scope

Real money movement, real UPI/bank/card integration, KYC, PCI-DSS scope, settlement, production deployment. Any of these requires a separate decision, an approved provider and compliance work.

## M1 acceptance (first end-to-end milestone)

A synthetic user registers, logs in, receives sandbox balance, creates and authorizes a payment to another synthetic user with an idempotency key and PIN; the ledger shows balanced entries; both users receive Socket.IO events; the payment appears in both histories; retries with the same key create no duplicate.
