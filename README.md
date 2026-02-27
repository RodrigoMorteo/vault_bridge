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
| `PORT` | HTTP port for the service. (For Docker Compose, this sets the external listening port). | `3000` | No |
| `BWS_STATE_FILE` | Path to store SDK state. | `/tmp/bws_state.json` | No |

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
- **200** `{ "status": "ok" }` when the Bitwarden client is ready.
- **503** `{ "status": "unavailable" }` when not ready.

### GET `/vault/secret/:id`
- **200** `{ id, key, value }` — plaintext secret fields from BWS.
- **503** `{ error: "Vault client not ready" }` if SDK not initialized.
- **500** `{ error: "Failed to retrieve secret from vault." }` on masked retrieval errors.

## Operational Notes
- Do not emit secrets or tokens in logs.
- Process exits on failed Bitwarden authentication to avoid stale state.
- Graceful shutdown is wired for `SIGTERM`/`SIGINT`.

## Contributing
Please read our [Contribution Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a Pull Request.  
For security vulnerability reporting, see our [Security Policy](SECURITY.md).

## License
Licensed under the [Apache License 2.0](LICENSE).

Copyright (c) 2026 Rodrigo Morteo.
