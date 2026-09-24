# Observability and business continuity

## Implemented

| Capability | Detail |
| --- | --- |
| Structured logs | pino JSON to stdout (`pino-pretty` only when `APP_ENV=local`); ISO timestamps; `service` field |
| Request/correlation id | `X-Request-Id` accepted if well-formed, otherwise generated; included in access logs and every error response |
| Access logs | `pino-http`; health endpoints excluded to reduce noise |
| Error logs | 5xx logged at `error` with the error object; 4xx at `warn` with code only |
| Liveness | `GET /api/v1/health` — process up, version, environment, provider mode |
| Readiness | `GET /api/v1/health/ready` — MongoDB ping and Redis PING with 2 s timeouts; 503 when any is down |
| Dependency state logs | MongoDB connect/disconnect and retry backoff; Redis status changes logged once per change |
| Redaction | See [SECURITY.md](SECURITY.md#sensitive-data-in-logs) |

## Planned (BE-027 unless noted)

- Metrics hook (Prometheus-compatible or OpenTelemetry): HTTP latency/status histograms, payment state transition counters, ledger reconciliation mismatches, queue depth/failed jobs, Socket.IO connections.
- MongoDB slow-query logging (command monitoring with threshold) and index review.
- Error-monitoring integration point (e.g. Sentry) behind an interface; disabled when no DSN is configured.
- Audit log is a separate collection (BE-006), never mixed with application logs.

## Business continuity

Nothing below has been executed yet; production readiness requires an actual restore test (BE-030).

| Component | Expectation |
| --- | --- |
| MongoDB | Source of truth. Managed snapshots + point-in-time recovery where hosting supports it (e.g. Atlas); otherwise scheduled `mongodump` of the replica set to object storage. Restore drill into an isolated instance, then run ledger reconciliation. |
| Redis | Reconstructible. AOF enabled locally. Loss means dropped rate-limit counters, pending OTPs (users re-request) and idempotency cache (Mongo remains authoritative). |
| Queues (BullMQ) | Jobs must be idempotent; after Redis loss, a sweeper re-enqueues work derived from Mongo state (e.g. payments stuck in PROCESSING → provider status polling). |
| Provider calls | Bounded retries with exponential backoff; status polling for timeouts. |
| Webhooks | Dedupe by `{provider, eventId}`; providers' replay features can be used safely. |
| MySQL (if adopted) | Rebuildable projection; backups optional. |
| Initial RPO/RTO assumptions | RPO ≤ 15 min, RTO ≤ 4 h for a sandbox demo. To be confirmed by the product owner. |
