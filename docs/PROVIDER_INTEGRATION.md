# Provider integration

**Only sandbox providers will exist until an approved provider contract is signed.** No production API is imitated and no credentials are fabricated. `PAYMENT_PROVIDER_MODE` currently accepts only `sandbox`.

## Payment provider interface (BE-012)

```ts
interface PaymentProvider {
  readonly name: string;                        // 'sandbox'
  initiate(input: InitiatePaymentInput): Promise<ProviderResult>;
  verify(providerReference: string): Promise<ProviderResult>;
  queryStatus(providerReference: string): Promise<ProviderStatus>;
  cancel(providerReference: string): Promise<ProviderResult>;
  refund(input: RefundInput): Promise<ProviderResult>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean;
  parseWebhook(rawBody: Buffer): ProviderWebhookEvent;
}
```

Provider results are normalized to internal outcomes (`PENDING`, `SUCCEEDED`, `FAILED` + normalized failure code). Provider-specific codes stay in `provider_logs` and never leak to clients.

## Sandbox behavior

Deterministic scenarios keyed on amount so tests and demos are reproducible:

| Amount (minor units) ends with | Outcome |
| --- | --- |
| `…13` | FAILED (`PROVIDER_DECLINED`) |
| `…99` | Timeout, resolved later by status polling |
| otherwise | SUCCESS after a configurable delay (default 1.5 s) |

(Final mapping is fixed when BE-012 lands and is covered by tests.)

## Other adapters

| Interface | Responsibilities | Task |
| --- | --- | --- |
| `OtpProvider` | send(target, purpose) → delivery ref; codes generated and hashed by the core, not the provider | BE-007 |
| `EmailProvider`, `SmsProvider`, `PushProvider` | send(message) | BE-015 |
| `BillProvider` | fetchBill, validateCustomer, payBill, queryStatus | BE-023 |
| `RechargeProvider` | listPlans, recharge, queryStatus | BE-023 |

Adapters live in `src/infrastructure/providers/<kind>/` and are selected by configuration at bootstrap. Controllers never import adapters.

## Webhooks (BE-021)

`POST /webhooks/:provider` uses the raw body (signature verification needs exact bytes).

1. Resolve adapter by `:provider`; unknown → 404.
2. Verify signature (HMAC or provider scheme) and timestamp window (±5 min) → otherwise 401, audited.
3. Insert into `webhook_events` with unique `{provider, eventId}`; duplicate → 200 without reprocessing.
4. Respond 2xx immediately; enqueue processing job.
5. Worker applies state transitions via the payments service (state machine + conditional update).

Retries: outbound provider calls use bounded exponential backoff; webhook jobs retry via BullMQ with dead-letter after N attempts.

## Onboarding a real provider (future checklist)

Signed agreement and compliance review; secrets in a secret manager; network allowlists; contract tests against the provider sandbox; reconciliation job; runbook for outages; new DECISIONS entry; update SECURITY and this document.
