# MiNi Payment Server — data dictionary

Implemented collections are listed first and match the Mongoose schemas and migration `0001-accounts-and-sessions`; the rest is the design target for planned models. Collection names use snake_case; fields use camelCase. All documents have `createdAt`/`updatedAt` unless stated.

## Conventions

- Public identifiers are prefixed random ids (e.g. `pay_…`, `usr_…`) exposed in APIs; Mongo `_id` stays internal.
- Money: `amountMinor` (integer, minor units) + `currency` (ISO 4217, currently `INR`).
- Secrets (passwords, PINs, OTPs, refresh tokens) are stored only as hashes.
- Growing histories live in their own collections, never embedded arrays on `users`.

## Implemented collections

| Collection | Key fields | Indexes | Task |
| --- | --- | --- | --- |
| `users` | publicId, email, phone?, firstName, lastName, passwordHash, passwordChangedAt?, roles[], status (ACTIVE/DISABLED), avatar {avatarId, contentType, updatedAt}?, preferences {notifications {channels, events}, payments {perTransactionLimitMinor, dailyLimitMinor, hideBalance}} | unique publicId, unique email, unique phone (partial) | BE-004, BE-034 |
| `avatars` | avatarId, userId, contentType, data (binary, ≤ 512 KB), size, createdAt (no updatedAt) | unique avatarId, userId | BE-034 |
| `sessions` | sessionId, userId, refreshTokenHash, previousTokenHashes[≤5], userAgent, createdAt, lastUsedAt, expiresAt, revokedAt?, revokeReason? (one document per refresh-token family; looked up by the `ses_` id embedded in the token) | unique sessionId, userId+revokedAt, TTL on expiresAt | BE-004, BE-009 |
| `password_resets` | tokenHash, userId, createdAt, expiresAt, usedAt? | unique tokenHash, userId, TTL on expiresAt | BE-004 |
| `payment_methods` | publicId, userId, type (BANK_ACCOUNT/UPI_ID), uniqueKey (HMAC fingerprint / VPA), label?, isDefault, verifiedAt, bank {bankName, accountHolderName, accountLast4, ifsc, accountType}?, upi {vpa}? | unique publicId, unique userId+uniqueKey, userId+createdAt | BE-035 |
| `migrations` | version, name, appliedAt, checksum | unique version | BE-003 |

## Planned collections

| Collection | Key fields | Indexes | Task |
| --- | --- | --- | --- |
| `users` (additions) | emailVerifiedAt, phoneVerifiedAt, pinHash, pinFailedAttempts, pinLockedUntil | — | BE-007, BE-008 |
| `profiles` | userId, displayName, paymentHandle, avatarUrl | unique userId, unique paymentHandle | BE-004 |
| `devices` | userId, deviceId, userAgent, firstSeenAt, lastSeenAt, trusted, revokedAt, ipMetadata | unique userId+deviceId | BE-009 |
| `otp_challenges` | userId/target, purpose, codeHash, attempts, expiresAt, consumedAt, resendAvailableAt | target+purpose; TTL on expiresAt | BE-007 |
| `ledger_accounts` | ownerType (USER/SYSTEM), ownerId, kind (WALLET/SANDBOX_FUNDING/…), currency, cachedBalanceMinor, version | unique ownerType+ownerId+kind+currency | BE-010 |
| `ledger_entries` | transferId, accountId, direction (DEBIT/CREDIT), amountMinor, currency, balanceAfterMinor, createdAt (immutable, no updatedAt) | accountId+createdAt; transferId | BE-010 |
| `transfers` | publicId, type (FUNDING/PAYMENT/REFUND/REVERSAL), paymentId, status, amountMinor, currency | unique publicId; paymentId | BE-010 |
| `payments` | paymentId, userId (payer), payeeUserId, amountMinor, currency, paymentType, source, destination, provider, providerReference, status, statusHistory (bounded), failureCode, failureReason, metadata, completedAt, version | unique paymentId; userId+createdAt; payeeUserId+createdAt; status; provider+providerReference (unique, partial) | BE-012 |
| `transactions` | userId, paymentId, direction, counterparty (masked), amountMinor, status, type, occurredAt | userId+createdAt+_id; userId+status; userId+type | BE-014 |
| `idempotency_keys` | userId, key, fingerprint, state (IN_PROGRESS/COMPLETED), responseStatus, responseBody, expiresAt | unique userId+key; TTL on expiresAt | BE-011 |
| `payment_requests` | publicId, requesterId, recipientId, amountMinor, note, status, expiresAt, paidPaymentId | recipientId+status; requesterId+createdAt | BE-017 |
| `contacts` | ownerId, contactUserId?, displayName, identifierMasked, favorite, lastPaidAt | ownerId+favorite; ownerId+lastPaidAt | BE-016 |
| `beneficiaries` | ownerId, type, displayName, maskedAccount, verifiedAt | ownerId | BE-016 |
| `qr_payloads` | publicId, ownerId, type (USER/MERCHANT/REQUEST), amountMinor?, expiresAt, signatureKeyId | publicId unique; ownerId+createdAt | BE-018 |
| `notifications` | userId, type, title, body, data, readAt, channels[] | userId+createdAt; userId+readAt | BE-015 |
| `billers`, `bills`, `recharges` | provider, category, customer ref (masked), amountMinor, status, providerReference | per task | BE-023 |
| `rewards`, `reward_rules` | userId, sourceEventId, type, points/amountMinor, status | unique userId+sourceEventId | BE-024 |
| `security_events` | userId, type, severity, metadata | userId+createdAt | BE-025 |
| `audit_logs` | actor, action, target, requestId, result, metadata, createdAt (append-only) | actor.id+createdAt; target+createdAt | BE-006 |
| `webhook_events` | provider, eventId, receivedAt, signatureValid, status, processedAt | unique provider+eventId | BE-021 |
| `provider_logs` | provider, operation, requestRef, outcome, latencyMs (no secrets) | provider+createdAt; TTL | BE-012 |

## Redis keys (planned)

| Pattern | Purpose | TTL |
| --- | --- | --- |
| `rl:<route>:<subject>` | Rate-limit counters | window length |
| `idem:<userId>:<key>` | Idempotency in-flight lock / cache (Mongo remains authoritative) | ≤ 24 h |
| `otp:attempts:<target>` | OTP throttling | minutes |
| `bull:*` | BullMQ queues | managed by BullMQ |
| Socket.IO adapter channels | Cross-instance event fan-out | n/a |
