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
The service requires the `BWS_ACCESS_TOKEN` environment variable to be set. This token corresponds to a Bitwarden Machine Account.

### Environment Variables
| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `BWS_ACCESS_TOKEN` | Machine account access token. | - | **Yes** |
| `PORT` | HTTP port for the service (1–65535). | `3000` | No |
| `BWS_STATE_FILE` | Path to store SDK state. | `/tmp/bws_state.json` | No |
| `CACHE_TTL` | Cache time-to-live in seconds. | `60` | No |
| `LOG_LEVEL` | Logging level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). | `info` | No |
| `CIRCUIT_BREAKER_THRESHOLD` | Consecutive upstream failures to trip the circuit breaker. | `5` | No |
| `CIRCUIT_BREAKER_COOLDOWN` | Seconds to wait before half-open probe. | `30` | No |
| `GATEWAY_AUTH_ENABLED` | Enable gateway header validation (`true`/`false`). | `false` | No |
| `GATEWAY_AUTH_SECRET` | Shared secret for local dev auth (when gateway disabled). | - | No |
| `LOG_RETENTION_DAYS` | Log retention period in days (for compliance metadata). | `90` | No |

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

**Request body:** `{ "ids": ["uuid1", "uuid2", ...] }` (maximum 50 IDs).

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
- Circuit breaker protects against upstream failures: opens after `CIRCUIT_BREAKER_THRESHOLD` consecutive failures, serves stale cache when possible, probes after `CIRCUIT_BREAKER_COOLDOWN` seconds.
- Gateway auth (`GATEWAY_AUTH_ENABLED`): when enabled, validates `Authorization: Bearer <token>` on `/vault/*` routes. When disabled with `GATEWAY_AUTH_SECRET` set, validates a fixed shared secret.
- Proactive token lifecycle: on auth errors the bridge attempts re-authentication; if it fails, `/health` returns 503 triggering orchestrator restart.
- State file (`BWS_STATE_FILE`) is securely zeroed and deleted on shutdown. Stale files from prior crashes are cleaned at startup.
- Process exits on initial Bitwarden authentication failure to avoid stale state.
- Graceful shutdown clears the cache, securely deletes the state file, and closes connections on `SIGTERM`/`SIGINT`.

## Contributing
Please read our [Contribution Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a Pull Request.  
For security vulnerability reporting, see our [Security Policy](SECURITY.md).

## License
Licensed under the [Apache License 2.0](LICENSE).

Copyright (c) 2026 Rodrigo Morteo.
