# Deployment: Railway (API) + GitHub Pages (app)

The API runs on Railway as a Docker service. The React app ([mini-payment-app](https://github.com/maheshpcse/mini-payment-app)) is a static site on GitHub Pages; Pages cannot run this server or proxy `/api`. Everything stays in sandbox mode: `PAYMENT_PROVIDER_MODE` accepts only `sandbox`.

```
Browser ── https://maheshpcse.github.io/mini-payment-app/ (GitHub Pages, static)
   │  fetch + CORS
   ▼
Railway: mini-payment-server (Docker)  ──►  MongoDB replica set (Atlas or Railway template)
                                       └──►  Railway Redis
```

## Files

| File | Purpose |
| --- | --- |
| `railway.json` | Config as code: Dockerfile builder, pre-deploy migrations, start command, readiness health check, restart policy, 15 s draining |
| `Dockerfile` | Multi-stage build; runtime is `node:22-alpine` as non-root `node`, only `dist` + production dependencies; health check honours Railway's `PORT` |
| `.env.production.example` | Variable reference (placeholders only) |
| `src/config/deployment.ts` | Hosted-deployment rules on top of normal env validation |
| `src/scripts/deploy-check.ts` | `npm run deploy:check`: validates configuration without connecting or printing values |
| `src/scripts/deploy-prepare.ts` | Railway pre-deploy: validate, verify MongoDB is a replica set, apply pending migrations |
| `.github/workflows/ci.yml` | **Backend CI** (push, PR, Run workflow): lint, typecheck, tests, build, audit; builds the image and runs `deploy-check` inside it with synthetic values |
| `.github/workflows/deploy-railway.yml` | **Deploy to Railway** (Run workflow, or after CI when enabled): `railway up --ci` + readiness check |

## 1. Provision data services

**MongoDB (must be a replica set).** The ledger uses multi-document transactions, so a standalone server is rejected by `deploy:prepare`.

- Recommended: MongoDB Atlas (every tier, including free M0, is a replica set). Create a database user with `readWrite` on `mini_payment`, allow Railway's egress (Atlas network access), and copy the `mongodb+srv://` URI with `/mini_payment` as the path.
- Alternative: a Railway MongoDB **replica-set** template. Its URI must include `replicaSet=<name>`. Railway's plain MongoDB template is standalone and will fail pre-deploy.

**Redis.** Add Railway's Redis service in the same project. Redis only holds short-lived state (rate limits, OTP attempts, idempotency cache, queues).

## 2. Create the API service

1. Railway → New → GitHub repo → `maheshpcse/mini-payment-server`, branch `main`. Root directory `/`; Railway picks up `/railway.json`.
2. Variables (see `.env.production.example`):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (image default) |
| `APP_ENV` | `production` (or `staging`) |
| `PAYMENT_PROVIDER_MODE` | `sandbox` |
| `CORS_ORIGINS` | `https://maheshpcse.github.io` — origin only: no `/mini-payment-app`, no trailing slash; comma-separate extra origins |
| `TRUST_PROXY_HOPS` | `1` |
| `MONGODB_URI` | Atlas `mongodb+srv://…/mini_payment?retryWrites=true&w=majority`, or the replica-set template's URI |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (use the variable-reference picker; the name follows your Redis service) |
| `LOG_LEVEL` | `info` |

   Leave `PORT` unset; Railway injects it. Railway reads **Variables**, not files: never commit `.env` or `.env.production` (the app does not load them in production, and CI fails if one is tracked). If credentials were ever committed, rotate them — deleting the file does not remove it from git history.

   Prefer Railway private networking for data services (`${{MongoDB.MONGO_URL}}`-style references resolving to `*.railway.internal`) over the public `*.proxy.rlwy.net` endpoints, and include the database name in `MONGODB_URI` (`/mini_payment`); without it the driver uses `test`.
3. Settings → Networking → Generate Domain. Note the HTTPS URL, e.g. `https://mini-payment-server-production.up.railway.app`.
4. Deploy. The sequence is: Docker build → `node dist/scripts/deploy-prepare.js` (nonzero exit aborts the release, the previous deployment keeps serving) → `node dist/server.js` → Railway waits for `GET /api/v1/health/ready` to return 200 (up to 120 s) before switching traffic.

Then pick **one** way to trigger deployments (using both deploys every push twice):

- **Railway autodeploy (dashboard).** Service → Settings → Source: repository `maheshpcse/mini-payment-server`, branch `main`, and enable **Wait for CI** so Railway deploys only after **Backend CI** passes.
- **GitHub Actions (`deploy-railway.yml`).** Disconnect the service's GitHub source (or turn off autodeploy), then configure the repository as below. See [GitHub Actions](#github-actions).

## 3. Verify

```bash
API=https://YOUR-SERVICE.up.railway.app
curl -s $API/api/v1/health         # {"data":{"status":"ok",...,"providerMode":"sandbox"}}
curl -s $API/api/v1/health/ready   # 200 with mongodb/redis "up"; 503 names the failing dependency
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS $API/api/v1/health \
  -H 'Origin: https://maheshpcse.github.io' -H 'Access-Control-Request-Method: GET'   # 204
```

Then set the frontend repository variable `API_BASE_URL=$API/api/v1` (see the app's `docs/DEPLOYMENT.md`).

## GitHub Actions

| Workflow | Triggers | Does |
| --- | --- | --- |
| `.github/workflows/ci.yml` — **Backend CI** | push / pull request to `main` or `master`, **Run workflow** | Lint, typecheck, tests (incl. MongoDB replica-set integration), build, audit; builds the Railway image and runs `deploy-check` inside it with synthetic values. No secrets. |
| `.github/workflows/deploy-railway.yml` — **Deploy to Railway** | **Run workflow** (choose the Railway environment, default `production`); after a green Backend CI push on `main` when `RAILWAY_DEPLOY_ON_CI=true` | Installs the Railway CLI, `railway up --ci` for the configured service (Railway builds the Dockerfile, runs pre-deploy migrations, waits for readiness), then polls `RAILWAY_PUBLIC_URL/api/v1/health/ready` |

The **Run workflow** button appears only for workflows that declare `workflow_dispatch` **and exist on the default branch** (`main`). A workflow that is only on a feature branch or open PR is not listed with that button; merge it first.

Repository settings for Deploy to Railway (Settings → Secrets and variables → Actions):

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `RAILWAY_TOKEN` | Railway → Project → Settings → Tokens → create a **project token** for the target environment |
| Variable | `RAILWAY_SERVICE` | Service name, default `mini-payment-server` |
| Variable | `RAILWAY_PUBLIC_URL` | `https://YOUR-SERVICE.up.railway.app` (enables the readiness check and the environment link) |
| Variable | `RAILWAY_DEPLOY_ON_CI` | `true` to deploy automatically after Backend CI passes on `main`; unset for manual-only |

The job runs in a GitHub environment named after the Railway environment (`production`), so you can add required reviewers there, or store `RAILWAY_TOKEN` as an environment secret instead of a repository secret.

## Migrations

`deploy:prepare` runs forward-only migrations from `src/migrations` (ADR-008). History is kept in `migrations`; `migration_locks` prevents two releases migrating at once and expires after 10 minutes if a run crashes — do not delete a lock while a deployment is running. Pre-deploy timeout is 300 s. Production runs with `autoIndex=false`, so indexes come only from migrations.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| No **Run workflow** button | The workflow is not on `main` yet, or Actions are disabled (Settings → Actions → General) |
| Deploy to Railway fails at "Check deployment settings" | `RAILWAY_TOKEN` secret missing |
| `railway up` says "Not signed in" / unauthorized | Token expired, is an account token for another workspace, or belongs to a different project/environment |
| Every push deploys twice | Both Railway autodeploy and `RAILWAY_DEPLOY_ON_CI=true` are enabled; keep one |
| Pre-deploy fails with `Deployment configuration invalid` | The listed variables are missing or break a rule; values are never printed |
| `MongoDB is a standalone server` | Use Atlas or a replica-set template |
| `another migration run holds the lock` | A concurrent release is migrating; retry after it finishes |
| Health check timeout / 503 on `/health/ready` | MongoDB network access (Atlas IP allowlist) or Redis reference is wrong; check deploy logs |
| Browser: `No 'Access-Control-Allow-Origin' header` on the preflight | `CORS_ORIGINS` does not contain the page's origin. The origin is scheme + host only: for `https://maheshpcse.github.io/mini-payment-app/` it is `https://maheshpcse.github.io`. Entries with a path, trailing slash or quotes are normalized to their origin at startup; the `server listening` log shows the effective `corsOrigins`, and each rejected origin is logged once as `CORS: origin not allowed`. Check with `curl -si -X OPTIONS $API/api/v1/health/ready -H 'Origin: https://maheshpcse.github.io' -H 'Access-Control-Request-Method: GET'` |

## Known constraint for authentication (BE-004)

GitHub Pages (`*.github.io`) and Railway (`*.up.railway.app`) are different sites, so a `SameSite=Strict/Lax` refresh-token cookie is never sent cross-site, and browsers increasingly block third-party cookies even with `SameSite=None`. Before BE-004 ships, choose one: (a) custom domains on the same site (e.g. `pay.example.com` on Pages and `api.example.com` on Railway) with `SameSite=Lax` cookies — preferred; or (b) `SameSite=None; Secure; Partitioned` cookies plus Origin checks, accepting that some browsers will force re-login. Recorded as an open question in `docs/MEMORY.md`.

## Status

Files are prepared and validated locally (see TASKS BE-029/BE-032). No Railway project, Atlas cluster or live deployment has been created from this environment; Docker is not installed here, so the image build is verified in CI.

References: [Railway config as code](https://docs.railway.com/reference/config-as-code), [pre-deploy command](https://docs.railway.com/guides/pre-deploy-command), [health checks](https://docs.railway.com/reference/healthchecks), [variables](https://docs.railway.com/guides/variables).
