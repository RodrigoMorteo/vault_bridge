# bws-vault-bridge

Internal Bitwarden Secrets Manager bridge for MCP consumers. Handles plaintext secrets under strict security boundaries.

## Table of Contents
- [Overview](#overview)
- [Architecture & Security Constraints](#architecture--security-constraints)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running](#running)
- [Testing](#testing)
- [API](#api)
- [Operational Notes](#operational-notes)
- [Contributing](#contributing)
- [License](#license)

## Overview
A minimal Express.js microservice that proxies secret retrieval from Bitwarden Secrets Manager (BWS) to an MCP client. Designed for internal-only use.

### Project Structure
```
vault_bridge/
├── index.js                     ← Thin bootstrap (delegates to src/)
├── src/
│   ├── app.js                   ← Express app assembly (composition root)
│   ├── server.js                ← HTTP server bootstrap + shutdown
│   ├── config/                  ← Centralized configuration (planned)
│   ├── middleware/               ← Shared middleware (planned)
│   ├── routes/
│   │   ├── health.js            ← Health check route
│   │   └── vault.js             ← Secret retrieval route
│   ├── services/
│   │   └── bitwardenClient.js   ← Bitwarden SDK wrapper
│   └── utils/                   ← Shared utilities (planned)
├── __tests__/
│   └── integration/
│       └── vault.test.js        ← Integration tests (HTTP behavior)
└── docs/                        ← Architecture & planning documents
```

## Architecture & Security Constraints
- Never log, print, or expose secret `key`/`value` or `BWS_ACCESS_TOKEN`.
- Fail fast if Bitwarden SDK auth fails or state is lost.
- Return opaque 5xx/4xx errors; do not surface Bitwarden stack traces.
- Uses Bitwarden SDK native bindings with a local `stateFile` for auth handshakes.

## Requirements
- Node.js LTS (v22+ recommended; tested with v24.14.0)
- npm (comes with Node). If using `nvm`, select LTS before running commands:
  ```bash
  source ~/.nvm/nvm.sh && nvm use --lts
  ```

## Installation
```bash
source ~/.nvm/nvm.sh && nvm use --lts
npm install
```

## Configuration
The service supports configuration via a `.env` file, environment variables, or hardcoded defaults.

**Loading Priority:**
1.  `.env` file (highest)
2.  Environment variables
3.  Hardcoded defaults (lowest)

The application logs the source of each variable at startup. The `BWS_ACCESS_TOKEN` is the only **required** variable and has no default.

### Configuration Variables
| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `BWS_ACCESS_TOKEN` | Machine account access token. | - | **Yes** |
| `PORT` | HTTP port for the service (1–65535). | `3000` | No |
| `BWS_STATE_FILE` | Path to store SDK state. | `/tmp/bws_state.json` | No |
| `CACHE_TTL` | Cache time-to-live in seconds. | `60` | No |
| `CACHE_MAX_ENTRIES` | Maximum plaintext secrets retained in the in-memory cache; oldest entries are evicted at capacity. | `1000` | No |
| `LOG_LEVEL` | Logging level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). | `info` | No |
| `CIRCUIT_BREAKER_THRESHOLD` | Consecutive upstream failures to trip the circuit breaker. | `5` | No |
| `CIRCUIT_BREAKER_COOLDOWN` | Seconds to wait before half-open probe. | `30` | No |
| `GATEWAY_AUTH_SECRET` | When set to a non-empty string, every `/vault/*` request must supply a matching `Authorization: Bearer <secret>` header. When absent or empty, the middleware is fully transparent (passthrough). Use this when the bridge is **not** behind an APISix gateway that handles auth upstream. | *(unset)* | No |
| `BULK_MAX_IDS` | Maximum number of secret IDs per bulk retrieval request. | `50` | No |
| `LOG_RETENTION_DAYS` | Log retention period in days (for compliance metadata). | `90` | No |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds. | `900000` (15m) | No |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window for `/vault/*` routes. | `100` | No |
| `TRUSTED_PROXY_CIDRS` | Comma-separated IPs/CIDRs for reverse proxies allowed to supply `X-Forwarded-For`. Leave unset for direct access. | *(unset)* | No |
| `REAUTH_RETRY_MAX_ATTEMPTS` | Number of background re-authentication retries after an auth failure. | `5` | No |
| `REAUTH_RETRY_BASE_MS` | Initial retry delay in milliseconds; retries use bounded exponential backoff. | `1000` | No |
| `REQUEST_TIMEOUT_MS` | Maximum lifetime of an HTTP request. | `30000` | No |
| `HEADERS_TIMEOUT_MS` | Maximum time allowed to receive HTTP request headers. Must not exceed `REQUEST_TIMEOUT_MS`. | `10000` | No |
| `KEEP_ALIVE_TIMEOUT_MS` | Idle keep-alive connection timeout. | `5000` | No |

All configuration is centralized in `src/config/index.js`. The application validates all variables at startup and exits with code 1 on invalid or missing required values.

## Running
Ensure you have Node.js LTS installed and dependencies (`npm install`) are ready.

### Linux / macOS (Bash/Zsh)
```bash
export BWS_ACCESS_TOKEN="<your_machine_account_access_token>"
npm start
```

### Windows (PowerShell)
```powershell
$env:BWS_ACCESS_TOKEN="<your_machine_account_access_token>"
npm start
```

### Docker (Example)
```bash
docker run -e BWS_ACCESS_TOKEN="<your_machine_account_access_token>" -p 3000:3000 bws-vault-bridge
```

### Docker Compose (Portainer)
This project includes a `docker-compose.yml` for easy deployment.
1. Set `BWS_ACCESS_TOKEN` in your environment (or `.env` file).
2. Optionally set `PORT` to change the external listening port (default: 3000).
3. Run:
   ```bash
   docker-compose up -d
   ```



## Testing
```bash
source ~/.nvm/nvm.sh && nvm use --lts
npm test
```
Tests mock `@bitwarden/sdk-napi`; no live Bitwarden access is required.

## API
### GET `/health`

Supports shallow (liveness) and deep (readiness) probe modes.

**Shallow probe** (default):
- **200** `{ "status": "ok" }` — Bitwarden client is ready.
- **503** `{ "status": "unavailable" }` — not ready.

**Deep probe** (`GET /health?deep=true`):
- **200** `{ "status": "ok|degraded", "dependencies": { ... } }` — structured dependency health.
- **503** `{ "status": "unavailable", "dependencies": { ... } }` — all dependencies down.

Dependencies reported: `bitwarden_session` (active/expired), `cache` (enabled/disabled), `cache_size`, `circuit_breaker` (closed/open/half-open), `last_upstream_success` (ISO 8601 timestamp).

Status is `degraded` when the cache has warm entries but the Bitwarden session is expired or the circuit breaker is open.

### GET `/vault/secret/:id`

The `:id` parameter must be a valid UUID v4 string.

- **200** `{ id, key, value }` — plaintext secret fields from BWS. Served from in-memory cache if within TTL.
- **400** `{ error: "Invalid secret ID format. Expected UUID v4." }` — malformed `:id` parameter.
- **404** `{ error: "Secret not found." }` — valid UUID but secret does not exist in Bitwarden.
- **502** `{ error: "Upstream vault service unavailable." }` — Bitwarden API unreachable, timeout, auth error, or rate limit.
- **503** `{ error: "Vault client not ready." }` — SDK not initialized or re-authentication in progress.
- **500** `{ error: "Failed to retrieve secret from vault." }` — unexpected/unclassified error.

When the circuit breaker is open and a cached value is available, the response includes a `X-Degraded-Mode: true` header.

### POST `/vault/secrets`

Bulk secret retrieval. Accepts an array of UUID v4 IDs and returns all resolved secrets in a single response.

**Request body:** `{ "ids": ["uuid1", "uuid2", ...] }` (maximum configurable via `BULK_MAX_IDS`, default: 50).

- **200** `{ "secrets": [...], "errors": [...] }` — partial results with any errors listed separately.
- **400** — missing/empty `ids` array, exceeding 50 IDs, or invalid UUID format.
- **503** `{ error: "Vault client not ready." }` — SDK not initialized.

Cached secrets are served without upstream calls. Uncached secrets are fetched individually.

### GET `/metrics`
- **200** — Prometheus exposition format. Includes: `http_requests_total`, `http_request_duration_seconds`, `cache_hits_total`, `cache_misses_total`, `circuit_breaker_state`.
- Exempt from gateway authentication.

## Operational Notes
- All logs are structured JSON (Pino) with automatic redaction of sensitive fields (`key`, `value`, `token`, `authorization`, `BWS_ACCESS_TOKEN`).
- Each request is assigned a unique `requestId` (or forwarded from `X-Request-Id` header).
- In-memory TTL cache reduces upstream API calls; configurable via `CACHE_TTL`.
- Cache entries are bounded by `CACHE_MAX_ENTRIES`, expired entries are swept every minute, and the cache is cleared during shutdown so plaintext values do not accumulate indefinitely.
- Circuit breaker protects against upstream failures: opens after `CIRCUIT_BREAKER_THRESHOLD` consecutive failures, serves stale cache when possible, probes after `CIRCUIT_BREAKER_COOLDOWN` seconds.
- Rate limiting: enforced on all `/vault/*` routes using `express-rate-limit`. Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`. Operational endpoints (`/health`, `/metrics`) are exempt.
- Proxy handling: forwarded client addresses are ignored by default. If the bridge is behind a reverse proxy, set `TRUSTED_PROXY_CIDRS` to only that proxy's address or network (for example, `10.42.0.0/16`); do not use `true` or a hop count. This preserves correct per-client rate limiting without accepting spoofed headers.
- Proxy/rate-limit diagnostics: an `X-Forwarded-For` header must not terminate the process. If `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` appears after deployment, verify that the running image includes this fix and that the deployment configuration matches it. Investigate any VM shutdown separately through container OOM status and guest/Proxmox logs; an HTTP middleware validation failure alone is not evidence of a kernel or hypervisor failure.
- Gateway auth: controlled solely by `GATEWAY_AUTH_SECRET`. When set, every `/vault/*` request must carry a matching `Authorization: Bearer <secret>` header — missing or wrong token returns `401 Unauthorized`. When unset, the middleware is fully transparent (suitable for deployments behind a trusted APISix gateway or in isolated dev environments). `/health` and `/metrics` are always exempt.
- Proactive token lifecycle: on auth errors the bridge attempts re-authentication; if it fails, `/health` returns 503 triggering orchestrator restart.
- Re-authentication retries use bounded exponential backoff; after the retry budget is exhausted, the service remains unavailable for operator intervention or orchestrator restart rather than retrying indefinitely.
- HTTP header, request, and keep-alive timeouts protect the process from slow or stalled clients. In Docker Compose, the bridge is loopback-only by default, has memory/PID/log limits, and uses a bounded restart policy.
- State file (`BWS_STATE_FILE`) is securely zeroed and deleted on shutdown. Stale files from prior crashes are cleaned at startup.
- Process exits on initial Bitwarden authentication failure to avoid stale state.
- Graceful shutdown clears the cache, securely deletes the state file, and closes connections on `SIGTERM`/`SIGINT`.

## Contributing
Please read our [Contribution Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a Pull Request.  
For security vulnerability reporting, see our [Security Policy](SECURITY.md).

## License
Licensed under the [Apache License 2.0](LICENSE).

Copyright (c) 2026 Rodrigo Morteo.
