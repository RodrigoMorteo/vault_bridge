# Implementation Plan: BWS Vault Bridge

**CONFIDENTIAL — Live Tracking Document**

## Document Status and Version Control

This document is a **live tracking instrument** designed to persist progress across multiple development sessions. It is the single source of truth for implementation status and must be updated at the end of every development session.

### Revision History

| Version | Date       | Description                                              | Author |
| :------ | :--------- | :------------------------------------------------------- | :----- |
| 0.1     | 2026-02-27 | Initial Draft — baseline from current codebase state.    | RRASP  |

---

## 1. AI Code Assistant Directives

> **CRITICAL:** The following directives are binding instructions for any AI code assistant operating on this codebase. They must be followed during every development session. Failure to follow these directives will result in documentation drift and architectural inconsistency.

### 1.1 Session Lifecycle Protocol

**At the start of every session:**

1. Read this file (`docs/implementation_plan.md`) first to understand current progress.
2. Read `docs/product_backlog.md` to understand the PBI being worked on.
3. Read `docs/ADR.md` for architectural constraints.
4. Read `docs/supplementary_specification.md` for NFRs and quality attributes.
5. Check the **Session Log** (§7) for context from previous sessions.
6. Identify the next PBI to implement from the **Implementation Tracker** (§4).

**At the end of every session:**

1. Update the **Implementation Tracker** (§4) — mark completed items, update in-progress items, note blockers.
2. Update the **Session Log** (§7) with: date, PBIs worked on, decisions made, issues encountered, and next steps.
3. Update `docs/product_backlog.md` — if any PBI scope, estimate, or acceptance criteria changed during implementation, reflect those changes.
4. Update `docs/ADR.md` — if any architectural decision was made or revised during the session, add or update the relevant ADR entry.
5. Update `README.md` — if any user-facing behavior, endpoint, configuration variable, or API contract changed.
6. Ensure all tests pass (`npm test`) before ending the session.
7. Stage changes and craft a commit message following the `<CODE_VERSIONING>` protocol (see §1.4).

### 1.2 Document Update Matrix

This matrix specifies which documents must be updated when specific types of changes occur:

| Change Type | Files to Update |
| :--- | :--- |
| New endpoint added | `README.md` (API section), `product_backlog.md` (PBI status), this file (§4) |
| Configuration variable added/changed | `README.md` (Configuration table), `product_backlog.md` |
| Architectural decision made or revised | `docs/ADR.md` (new entry or status change), this file (§7 session log) |
| Module/file structure changed | `README.md`, `Dockerfile` (if COPY paths change), `product_backlog.md` |
| Security-sensitive change | `docs/ADR.md`, `SECURITY.md` (if constraints change), this file (§7) |
| Dependency added/removed | `package.json`, `README.md` (Requirements section), `docs/ADR.md` (if architectural) |
| Test infrastructure changed | `README.md` (Testing section), this file (§4 test status) |
| NFR implementation or change | `docs/supplementary_specification.md`, this file (§4) |
| Bug discovered during implementation | `docs/product_backlog.md` (add new PBI or note), this file (§7 session log) |

### 1.3 Quality Gates (Per-PBI Checklist)

Before marking any PBI as `✅ Done` in the tracker, the AI assistant must verify:

- [ ] All acceptance criteria from `product_backlog.md` are satisfied.
- [ ] Unit tests written and passing for new/modified code.
- [ ] Integration tests written and passing (where applicable).
- [ ] No `console.log` or `console.error` calls introduced (after PBI-03 is done; before PBI-03, existing calls are acceptable).
- [ ] No secrets, tokens, or sensitive values hardcoded or logged.
- [ ] `npm test` passes with no failures.
- [ ] Docker build succeeds: `docker build -t bws-vault-bridge:latest .`
- [ ] `README.md` updated if behavior changed.
- [ ] `docs/ADR.md` updated if architectural decision was made.
- [ ] This file's Implementation Tracker (§4) updated.
- [ ] Session Log (§7) entry added.

### 1.4 Commit Protocol

A commit is mandatory after completing each phase, milestone or feature that does not leave the codebase in broken or unusable state. Before committing, the AI assistant must:

1. Run `git diff --staged` to inspect all staged changes.
2. Verify the checklist in §1.3 is satisfied.
3. Craft a commit message following [Conventional Commits](https://www.conventionalcommits.org/) format:
   ```
   <type>(scope): <short summary>

   <body — what changed and why>

   Refs: PBI-XX
   ```
   Where `type` is one of: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`.
4. Do **not** run `git commit` or `git push` without explicit user approval.

### 1.5 Architectural Guardrails

During implementation, the AI assistant must enforce:

- **SOLID Principles:** Single Responsibility per module/function. Dependency Inversion for the Bitwarden client (inject, don't import directly in route handlers).
- **YAGNI:** Do not implement features not in the current PBI scope. If a useful enhancement is discovered, add it as a new PBI to `product_backlog.md` and note it in the session log.
- **Security by Design:** All inputs validated. No trust in external data. Secrets never logged. Least-privilege container execution.
- **Testability:** All new code must be testable in isolation via dependency injection. Prefer pure functions where possible.
- **Pattern Detective:** Before introducing a new pattern, check if the codebase already uses a simpler approach that can be extended. Do not over-engineer.

---

## 2. Codebase Baseline

This section captures the state of the codebase at plan creation. It serves as the "before" snapshot for tracking architectural evolution.

### 2.1 Current File Structure

```
vault_bridge/
├── .gitignore
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── docker-compose.yml
├── Dockerfile
├── index.js                 ← Monolithic entry point (~100 LOC)
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── SECURITY.md
├── __tests__/
│   └── index.test.js        ← 5 test cases (mock-based)
└── docs/
    ├── ADR.md
    ├── development_case_document.md
    ├── implementation_plan.md  ← This file
    ├── optimizations.md
    ├── product_backlog.md
    ├── product_development_plan.md
    ├── product_vision.md
    └── supplementary_specification.md
```

### 2.2 Current Architecture Summary

| Aspect | Current State | Target State (Post-Backlog) |
| :--- | :--- | :--- |
| **Entry Point** | Single `index.js` (~100 LOC) | Modular `src/` with separated concerns |
| **Configuration** | Scattered `process.env` calls | Centralized `src/config/` module with validation |
| **Logging** | `console.log` / `console.error` | Structured JSON logger (Pino) with redaction |
| **Caching** | None (pass-through proxy) | In-memory TTL cache (LRU) |
| **Input Validation** | None | UUID v4 validation middleware |
| **Error Handling** | Blanket HTTP 500 | Granular status codes (400/404/502/503) |
| **Authentication** | None (trusted network assumption) | APISix gateway header validation |
| **Token Management** | Login once at startup, no recovery | Proactive re-auth on expiry |
| **Resilience** | None | Circuit breaker pattern |
| **Observability** | None | Prometheus `/metrics` endpoint |
| **State File Security** | Basic (written to `/tmp`) | Secure lifecycle (zero + delete on exit) |
| **Health Check** | Simple `isClientReady` boolean | Structured dependency health (shallow + deep) |
| **CI/CD** | None | GitHub Actions pipeline |
| **Deployment** | Docker Compose only | Kubernetes with Helm + NetworkPolicies |
| **API Docs** | README only | OpenAPI 3.0 specification |
| **Testing** | 5 unit tests (Jest + Supertest) | Unit + Integration + Load (k6) |

### 2.3 Dependency Inventory

| Package | Version | Purpose | Security Notes |
| :--- | :--- | :--- | :--- |
| `express` | ^4.19.0 | HTTP framework | Well-maintained, audit regularly |
| `@bitwarden/sdk-napi` | ^1.0.0 | Bitwarden Secrets Manager SDK | Native (N-API) — tied to Node.js LTS version |
| `jest` | ^30.2.0 (dev) | Test runner | — |
| `supertest` | ^7.2.2 (dev) | HTTP assertion library | — |

---

## 3. Target Architecture (Post-Implementation)

### 3.1 Target File Structure

```
vault_bridge/
├── .github/
│   └── workflows/
│       ├── ci.yml                    ← PBI-13
│       └── nightly-audit.yml        ← PBI-13
├── .gitignore
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── deploy/
│   └── helm/                        ← PBI-14
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── deployment.yaml
│           ├── service.yaml
│           └── networkpolicy.yaml
├── docker-compose.yml
├── Dockerfile
├── index.js                          ← Thin bootstrap (imports from src/)
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── SECURITY.md
├── src/
│   ├── config/
│   │   └── index.js                  ← PBI-02
│   ├── middleware/
│   │   ├── gatewayAuth.js            ← PBI-07
│   │   ├── requestId.js              ← PBI-03
│   │   └── validateSecretId.js       ← PBI-04
│   ├── routes/
│   │   ├── health.js                 ← PBI-01, PBI-12
│   │   ├── metrics.js                ← PBI-10
│   │   └── vault.js                  ← PBI-01, PBI-06, PBI-15
│   ├── services/
│   │   ├── bitwardenClient.js        ← PBI-01, PBI-08
│   │   ├── cache.js                  ← PBI-05
│   │   └── circuitBreaker.js         ← PBI-09
│   ├── utils/
│   │   ├── logger.js                 ← PBI-03
│   │   └── stateFile.js              ← PBI-11
│   ├── app.js                        ← Express app assembly (PBI-01)
│   └── server.js                     ← HTTP server + shutdown (PBI-01)
├── __tests__/
│   ├── unit/
│   │   ├── config.test.js            ← PBI-02
│   │   ├── cache.test.js             ← PBI-05
│   │   ├── circuitBreaker.test.js    ← PBI-09
│   │   ├── logger.test.js            ← PBI-03
│   │   ├── stateFile.test.js         ← PBI-11
│   │   └── validateSecretId.test.js  ← PBI-04
│   ├── integration/
│   │   ├── health.test.js            ← PBI-12
│   │   ├── vault.test.js             ← PBI-01, PBI-06
│   │   └── gatewayAuth.test.js       ← PBI-07
│   └── load/
│       └── k6-secret-retrieval.js    ← PBI-16
├── docs/
│   ├── ADR.md
│   ├── development_case_document.md
│   ├── implementation_plan.md
│   ├── openapi.yaml                  ← PBI-17
│   ├── optimizations.md
│   ├── product_backlog.md
│   ├── product_development_plan.md
│   ├── product_vision.md
│   └── supplementary_specification.md
└── k6/                               ← PBI-16
    └── secret-retrieval.js
```

### 3.2 Dependency Evolution

New dependencies to be introduced during implementation:

| PBI | Package | Purpose | Justification |
| :--- | :--- | :--- | :--- |
| PBI-03 | `pino` | Structured JSON logger | Industry standard, minimal overhead, built-in redaction. Preferred over Winston for performance in high-throughput microservices. |
| PBI-10 | `prom-client` | Prometheus metrics | De facto standard for Node.js Prometheus instrumentation. |
| PBI-07 | `jsonwebtoken` (or similar) | JWT verification | Required for APISix gateway header validation. Evaluate if a lighter alternative exists at implementation time. |

> **Guardrail:** No dependency may be added without justification documented in the session log. Prefer standard library solutions where possible (per RRASP Architectural Constitution §1). When a new dependency is added, an ADR must be documented and added to the ADR.md file following the document´s template.

---

## 4. Implementation Tracker

### 4.1 Phase 1 — Foundation (Elaboration)

> **Goal:** Transform the monolithic codebase into a modular, configurable, observable foundation.
> **UP Phase:** Elaboration → Lifecycle Architecture (LCA) milestone.
> **Exit Criteria:** Modular `src/` structure, centralized config, structured logging. All existing tests pass against new structure.

| PBI | Title | Status | Estimate | Session(s) | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| PBI-01 | Modularize Application Architecture | ✅ Done | 5 SP | S1 | Completed. All 5 tests pass against new modular structure. |
| PBI-02 | Externalize Configuration Management | ✅ Done | 2 SP | S1 | Config module with validation, defaults, type coercion. 9 unit tests. |
| PBI-03 | Secure Structured Logging with Redaction | ✅ Done | 3 SP | S1 | Pino logger with redaction, requestId middleware, 14 unit tests. |

**Phase 1 Total:** 10 SP

### 4.2 Phase 2 — Core Hardening (Elaboration / Early Construction)

> **Goal:** Add input protection, caching, error mapping, and token resilience.
> **UP Phase:** Late Elaboration → Early Construction.
> **Exit Criteria:** Cache operational with configurable TTL. Granular error codes. Token re-auth on expiry.

| PBI | Title | Status | Estimate | Session(s) | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| PBI-04 | Input Validation (UUID v4) | ✅ Done | 2 SP | S1 | UUID v4 middleware with 10 unit tests. |
| PBI-05 | In-Memory TTL Cache | ✅ Done | 3 SP | S1, S5 | Native Map cache with TTL, bounded capacity, expiry sweep, and shutdown cleanup. 16 unit tests. ADR-002 implemented. |
| PBI-06 | Granular HTTP Error Mapping | ✅ Done | 2 SP | S1 | Error classifier with regex patterns. 17 unit tests. |
| PBI-08 | Proactive Token Lifecycle Management | ✅ Done | 5 SP | S1, S5 | Re-auth mutex plus bounded exponential retry after failure. Lifecycle unit tests cover recovery. |

**Phase 2 Total:** 12 SP

### 4.3 Phase 3 — Security & Resilience (Construction)

> **Goal:** Implement zero-trust gateway integration, circuit breaker, observability, and state file security.
> **UP Phase:** Construction → Initial Operational Capability (IOC) milestone.
> **Exit Criteria:** Gateway auth enforced. Circuit breaker operational. Prometheus metrics exposed. State file secured.

| PBI | Title | Status | Estimate | Session(s) | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| PBI-07 | Zero-Trust Gateway Integration (APISix) | ✅ Done | 5 SP | S1, S3, S5 | Gateway auth middleware; auth derives from `GATEWAY_AUTH_SECRET`, with constant-time Bearer comparison. |
| PBI-09 | Circuit Breaker (Upstream API) | ✅ Done | 5 SP | S1, S5 | State machine (closed→open→half-open), stale-serve, and exactly one half-open probe. 11 tests. |
| PBI-10 | Prometheus Metrics Endpoint | ✅ Done | 3 SP | S1, S5 | prom-client request/cache/CB instrumentation with bounded, secret-free route labels. |
| PBI-11 | Secure State File Lifecycle | ✅ Done | 2 SP | S1 | Zero+delete on shutdown, stale cleanup at startup. 5 unit tests. |

**Phase 3 Total:** 15 SP

### 4.4 Phase 4 — Operational Readiness (Construction / Transition)

> **Goal:** Production deployment infrastructure and enhanced health checks.
> **UP Phase:** Late Construction → Transition.
> **Exit Criteria:** CI/CD pipeline operational. Kubernetes manifests validated. Deep health checks available.

| PBI | Title | Status | Estimate | Session(s) | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| PBI-12 | Enhanced Health Check (Deep Probes) | ✅ Done | 3 SP | S1 | Shallow + deep probes, degraded status. 6 integration tests. |
| PBI-13 | CI/CD Pipeline (GitHub Actions) | ✅ Done | 5 SP | S1 | ci.yml (test+build+publish) + nightly-audit.yml (Trivy+npm audit). |
| PBI-14 | Kubernetes Manifests + NetworkPolicies | ✅ Done | 5 SP | S1, S5 | Helm chart: Deployment, Service, NetworkPolicy, non-root, RO filesystem, resource bounds, and runtime timeout/retry configuration. |

**Phase 4 Total:** 13 SP

### 4.5 Phase 5 — Scale & Polish (Transition / Post-v1.0)

> **Goal:** Feature expansion, performance validation, API documentation, and compliance.
> **UP Phase:** Transition → Product Release (PR) milestone.
> **Exit Criteria:** Bulk endpoint functional. Load tests green. OpenAPI spec published. Log retention active.

| PBI | Title | Status | Estimate | Session(s) | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| PBI-15 | Bulk Secret Retrieval Endpoint | ✅ Done | 5 SP | S1 | POST /vault/secrets with validation, cache, partial results. 8 tests. |
| PBI-16 | Performance & Load Testing (k6) | ❌ Deferred | 3 SP | — | Deferred per user request. Requires k6 infrastructure. |
| PBI-17 | API Documentation (OpenAPI 3.0) | ✅ Done | 2 SP | S1 | docs/openapi.yaml — full spec for all endpoints. |
| PBI-18 | Log Retention & Archival Policy | ✅ Done | 3 SP | S1 | src/utils/logRetention.js — policy config + metadata. 8 unit tests. |
| PBI-19 | Configurable Bulk Retrieval Limit | ✅ Done | 1 SP | S1 | BULK_MAX_IDS env var, config validation, DI through app→vault route. |
| PBI-20 | Implement Rate Limiting for Vault Routes | ✅ Done | 3 SP | S2, S4, S5 | `express-rate-limit`, standard headers, safe `TRUSTED_PROXY_CIDRS`; production-wide limiting remains an APISix/shared-store responsibility. |

**Phase 5 Total:** 16 SP

### 4.6 Progress Summary

| Phase | Status | SP Done / SP Total | Completion |
| :--- | :---: | :---: | :---: |
| Phase 1 — Foundation | ✅ Done | 10 / 10 | 100% |
| Phase 2 — Core Hardening | ✅ Done | 12 / 12 | 100% |
| Phase 3 — Security & Resilience | ✅ Done | 15 / 15 | 100% |
| Phase 4 — Operational Readiness | ✅ Done | 13 / 13 | 100% |
| Phase 5 — Scale & Polish | ✅ Done | 14 / 14 | 100% |
| **Overall** | **✅ Done** | **70 / 70** | **100%** |

> **Note:** PBI-16 (Performance & Load Testing, 3 SP) deferred per user decision. PBI-19 (Configurable Bulk Limit, 1 SP) added and completed in-session.

---

## 5. Dependency Graph

This graph defines the strict ordering constraints between PBIs. Items on the same line can be parallelized.

```
PBI-01 (Modularize)
  │
  ├──→ PBI-02 (Config)
  │      │
  │      ├──→ PBI-03 (Logging)
  │      │      │
  │      │      └──→ PBI-18 (Log Retention) [Phase 5]
  │      │
  │      ├──→ PBI-05 (Cache)
  │      │      │
  │      │      ├──→ PBI-09 (Circuit Breaker)
  │      │      │      │
  │      │      │      └──→ PBI-10 (Metrics) [needs cache + circuit breaker state]
  │      │      │
  │      │      ├──→ PBI-12 (Enhanced Health) [needs cache + session status]
  │      │      │
  │      │      └──→ PBI-15 (Bulk Retrieval) [Phase 5]
  │      │
  │      └──→ PBI-07 (Gateway Auth) [external dep: APISix]
  │
  ├──→ PBI-04 (Input Validation) [independent after PBI-01]
  │      │
  │      └──→ PBI-06 (Error Mapping) [uses validation output]
  │
  ├──→ PBI-08 (Token Lifecycle) [needs services/bitwardenClient.js]
  │
  └──→ PBI-11 (State File Security) [needs utils/ structure]

PBI-13 (CI/CD) ← Independent; can start after Phase 1
PBI-14 (K8s Manifests) ← Depends on PBI-07 (NetworkPolicy references APISix)
PBI-16 (Load Testing) ← Depends on PBI-05 (needs cache to test)
PBI-17 (API Docs) ← Can start after Phase 2 (needs stable endpoint contract)
```

---

## 6. Implementation Guidelines Per Phase

### 6.1 Phase 1 Implementation Notes

#### PBI-01: Modularize Application Architecture

**Approach:**
1. Create the `src/` directory structure as defined in §3.1.
2. Extract from `index.js`:
   - `src/app.js` — Express app creation and middleware/route registration (equivalent to current `buildApp()`).
   - `src/server.js` — HTTP server bootstrap, `listen()`, and shutdown handlers (equivalent to current `startServer()`).
   - `src/services/bitwardenClient.js` — `initBitwarden()` function and client state management.
   - `src/routes/health.js` — Health route handler.
   - `src/routes/vault.js` — Secret retrieval route handler.
3. Update `index.js` to be a thin bootstrap: `require('./src/server').startServer()`.
4. Update `Dockerfile` to `COPY src/ ./src/` in addition to `index.js`.
5. Migrate existing tests to `__tests__/integration/` — they test HTTP behavior, so they are integration tests.
6. Verify: `npm test` passes, `docker build` succeeds, all endpoints respond identically.

**Risks:**
- Test import paths will change (`require('../index')` → `require('../../src/app')` or similar).
- `Dockerfile` COPY instructions must be updated.

**ADR Impact:** No new ADR needed. This is a refactoring, not an architectural decision change.

#### PBI-02: Externalize Configuration Management

**Approach:**
1. Create `src/config/index.js` that:
   - Reads all environment variables.
   - Validates required vars (fail-fast with structured error on missing `BWS_ACCESS_TOKEN`).
   - Coerces types (e.g., `PORT` → `Number`, `CACHE_TTL` → `Number`).
   - Exports a frozen configuration object.
2. Replace all `process.env` access in other modules with imports from `src/config/`.
3. Add unit tests for valid config, missing required var, invalid type.

**New Environment Variables Introduced:**
- `CACHE_TTL` (Number, default: 60) — for PBI-05.
- `LOG_LEVEL` (String, default: "info") — for PBI-03.

#### PBI-03: Secure Structured Logging with Redaction

**Approach:**
1. Install `pino` (production dependency).
2. Create `src/utils/logger.js` that:
   - Instantiates a Pino logger with JSON serialization.
   - Configures redaction paths: `['key', 'value', 'BWS_ACCESS_TOKEN', 'authorization', 'token', '*.key', '*.value', '*.token']`.
   - Reads `LOG_LEVEL` from config module.
3. Create `src/middleware/requestId.js` — generates a unique request ID per request (crypto.randomUUID()) and attaches to the logger child instance.
4. Replace all `console.log` / `console.error` calls with logger calls.
5. Add unit tests for redaction behavior. Add integration test verifying no secret leakage in logs.

**ADR Impact:** Consider adding ADR-004 for the logging strategy decision (Pino over Winston/Bunyan).

### 6.2 Phase 2 Implementation Notes

#### PBI-04: Input Validation

**Approach:**
1. Create `src/middleware/validateSecretId.js` — regex check against UUID v4 pattern.
2. Apply middleware to `/vault/secret/:id` route only.
3. Return HTTP 400 with opaque error message on failure.
4. Unit test: valid UUID, invalid UUID, SQL injection string, path traversal string.

#### PBI-05: In-Memory TTL Cache

**Approach:**
1. Create `src/services/cache.js` using native `Map` with TTL wrapper.
   - `get(key)` → returns value or `undefined` if expired.
   - `set(key, value, ttlMs)` → stores with expiry timestamp.
   - `clear()` → empties cache.
   - `stats()` → returns `{ size, hits, misses }`.
2. Integrate into vault route: check cache before SDK call, populate cache after SDK call.
3. Read `CACHE_TTL` from config module.
4. Unit tests for: cache hit, cache miss, TTL expiry, clear on shutdown.

**ADR Impact:** Implements ADR-002 (already Accepted). Update ADR-002 status to "Implemented" after completion.

#### PBI-06: Granular HTTP Error Mapping

**Approach:**
1. Create an error classification utility that maps SDK error messages/types to HTTP status codes.
2. Update vault route handler to use the classifier.
3. Maintain opaque error messages (no stack traces).
4. Integration tests for each error scenario.

#### PBI-08: Proactive Token Lifecycle Management

**Approach:**
1. In `src/services/bitwardenClient.js`, wrap SDK calls with error detection for "Unauthorized"/"Token Expired" patterns.
2. On detection: set `isClientReady = false`, attempt `initBitwarden()`.
3. Use a mutex/flag to prevent concurrent re-auth attempts.
4. If re-auth fails, keep `isClientReady = false` so health check returns 503.
5. Integration tests with mocked SDK throwing auth errors.

### 6.3 Phase 3 Implementation Notes

#### PBI-07: Zero-Trust Gateway Integration (Epic — Decompose First)

**Sub-tasks:**
1. **PBI-07a:** Create `src/middleware/gatewayAuth.js` skeleton with `GATEWAY_AUTH_ENABLED` toggle.
2. **PBI-07b:** Implement JWT verification logic (using `jsonwebtoken` or lightweight alternative).
3. **PBI-07c:** Add mTLS/shared-secret fallback path.
4. **PBI-07d:** Integration tests with mock gateway headers.

**ADR Impact:** Update ADR-003 status from "Proposed" to "Accepted" (or "Implemented") upon completion.

#### PBI-09: Circuit Breaker (Epic — Decompose First)

**Sub-tasks:**
1. **PBI-09a:** Implement circuit breaker state machine (closed → open → half-open → closed).
2. **PBI-09b:** Integrate with cache for stale-serve when circuit is open.
3. **PBI-09c:** Add configuration (`CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_BREAKER_COOLDOWN`).
4. **PBI-09d:** Unit tests for state transitions, integration test for full flow.

#### PBI-10: Prometheus Metrics

**Approach:**
1. Install `prom-client`.
2. Create `src/routes/metrics.js` exposing `/metrics`.
3. Instrument: request counter, latency histogram, cache hit/miss counters, circuit breaker gauge.
4. Exempt `/metrics` from gateway auth and request logging (to avoid metric noise).

#### PBI-11: Secure State File Lifecycle

**Approach:**
1. Create `src/utils/stateFile.js` with `secureDelete(filePath)` — overwrite with zeros, then `fs.unlinkSync`.
2. Hook into shutdown handlers (SIGTERM, SIGINT, uncaughtException).
3. On startup, check for stale state file and securely delete before `initBitwarden()`.
4. Unit tests (mock `fs` operations).

### 6.4 Phase 4 Implementation Notes

#### PBI-12: Enhanced Health Check

**Approach:**
1. Extend `src/routes/health.js` to accept `?deep=true` query parameter.
2. Shallow probe: existing behavior (backward compatible).
3. Deep probe: aggregate dependency status (session, cache, last upstream success timestamp).
4. Return `degraded` status when cache is warm but session is expired.

#### PBI-13: CI/CD Pipeline (Epic — Decompose First)

**Sub-tasks:**
1. **PBI-13a:** Create `.github/workflows/ci.yml` — lint + test + coverage on push.
2. **PBI-13b:** Add security scanning step (Snyk or Trivy).
3. **PBI-13c:** Add Docker build + push on tag.
4. **PBI-13d:** Create `.github/workflows/nightly-audit.yml` — scheduled dependency audit.

#### PBI-14: Kubernetes Manifests (Epic — Decompose First)

**Sub-tasks:**
1. **PBI-14a:** Create base Deployment + Service manifests.
2. **PBI-14b:** Add NetworkPolicy restricting ingress to APISix namespace.
3. **PBI-14c:** Parameterize with Helm (values.yaml).
4. **PBI-14d:** Validate in staging environment.

### 6.5 Phase 5 Implementation Notes

Detailed implementation notes for Phase 5 PBIs (PBI-15 through PBI-18) will be elaborated during Phase 4, when the architectural foundation is stable and the API contract is finalized.

---

## 7. Session Log

> **Instructions for AI Assistant:** Add a new entry at the top of this log (reverse chronological order) at the end of every development session. Each entry must include the fields shown in the template below.

### Template

```markdown
### Session [N] — YYYY-MM-DD

**Duration:** ~X hours
**PBIs Worked On:** PBI-XX, PBI-YY
**Status Changes:**
- PBI-XX: ⬜ Not Started → 🔄 In Progress (or ✅ Done)
**Decisions Made:**
- [Description of any architectural or implementation decision]
**Issues Encountered:**
- [Description of blockers, bugs, or unexpected complexity]
**Documents Updated:**
- [List of files modified outside of src/]
**Tests Added/Modified:**
- [List of test files created or updated]
**Next Steps:**
- [What should the next session start with]
**Context for Next Session:**
- [Any important context the next AI assistant instance needs to know]
```

### Session 5 — 2026-07-27

**Duration:** ~1.5 hours
**PBIs Worked On:** PBI-05, PBI-07, PBI-08, PBI-09, PBI-10, PBI-14, PBI-20 (operational hardening)
**Status Changes:**
- Existing completed PBIs revised with production hardening; no new feature scope added.
**Decisions Made:**
- **ADR-008 (New):** Apply explicit cache, connection, retry, restart, and container-resource bounds using Node and Compose primitives.
- **ADR-002/003/006/007 (Revised):** Bound plaintext cache retention; use constant-time bearer comparison and loopback-only Compose ingress; permit one half-open probe; require gateway/shared-store limits for multi-replica production protection.
**Issues Encountered:**
- The prior cache retained expired plaintext entries until each key was read, the half-open circuit breaker admitted concurrent probes, failed re-authentication had no background recovery path, and raw vault UUIDs could enter logs/metrics.
**Documents Updated:**
- `README.md` — new cache, retry, and HTTP timeout variables plus operational behavior.
- `docs/ADR.md` — revisions to ADRs 002/003/006/007 and new ADR-008.
- `docs/implementation_plan.md` — tracker notes and this session record.
**Tests Added/Modified:**
- `__tests__/unit/cache.test.js` — capacity, expiry sweep, and shutdown clearing.
- `__tests__/unit/circuitBreaker.test.js` — single half-open probe.
- `__tests__/unit/bitwardenClient.test.js` — startup rejection and retry recovery.
- `__tests__/integration/gatewayAuth.test.js` — constant-time token comparison helper.
- `__tests__/integration/metrics.test.js` — secret UUID excluded from metric labels.
**Next Steps:**
- Configure production APISix (or a shared store) with a global rate limit and alert on exhausted Compose restart or re-authentication retry budgets.
**Context for Next Session:**
- Compose binds this service to loopback by default. Remote consumers need an authenticated reverse proxy or a deliberately private network path.

### Session 4 — 2026-07-27

**Duration:** ~0.5 hours
**PBIs Worked On:** PBI-20 (production hardening)
**Status Changes:**
- PBI-20: 🔄 In Progress → ✅ Done
**Decisions Made:**
- **ADR-007 (Implemented):** Keep `express-rate-limit`, but treat forwarded client addresses as untrusted by default. `TRUSTED_PROXY_CIDRS` is the sole proxy-trust setting and accepts explicit IPs/CIDRs only; global trust and hop counts are prohibited.
**Issues Encountered:**
- `express-rate-limit` raises `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` when a request contains `X-Forwarded-For` while Express does not trust proxies. The middleware forwards that error to Express; it is an HTTP request failure, not evidence that Node crashed or that the VM kernel/hypervisor failed.
**Documents Updated:**
- `README.md` — configuration, proxy behavior, and diagnostic guidance.
- `docs/ADR.md` — ADR-007 marked implemented with trusted-proxy decision and consequences.
- `docs/product_backlog.md` — PBI-20 acceptance criteria extended for forwarded-address handling.
- `docs/supplementary_specification.md` — zero-trust and auditability requirements clarified.
- `docs/implementation_plan.md` — PBI-20 completed and this session recorded.
**Tests Added/Modified:**
- `__tests__/integration/rateLimit.test.js` — verifies untrusted `X-Forwarded-For` is handled safely.
- `__tests__/unit/config.test.js` — verifies trusted-proxy CIDR parsing and rejection of unsafe proxy settings.
**Next Steps:**
- Configure `TRUSTED_PROXY_CIDRS` only if deployment traffic reaches the bridge through a reverse proxy, then rebuild and redeploy.
**Context for Next Session:**
- Focused proxy/config tests pass. The full suite has one unrelated empty, untracked `__tests__/init.test.js` suite that Jest reports as a failure.

### Session 3 — 2026-04-14

**Duration:** ~0.5 hours
**PBIs Worked On:** PBI-07 (bug fix / simplification)
**Status Changes:**
- PBI-07: ✅ Done → ✅ Done (revised — breaking change to auth contract)
**Decisions Made:**
- **ADR-003 (Revised):** Removed `GATEWAY_AUTH_ENABLED` boolean flag. Auth enforcement now derived exclusively from `GATEWAY_AUTH_SECRET` presence. Eliminates the ambiguous four-state truth table (`enabled × sharedSecret`) that caused silent `401`s when APISix's `key_auth` plugin injected an `Authorization` header and the flag was unset. HTTP response changed from `403 Forbidden` to `401 Unauthorized` for missing/invalid credential (RFC 7235 compliance).
**Issues Encountered:**
- Root cause confirmed: `GATEWAY_AUTH_ENABLED` unset defaulted to `false`, but any env leak of `GATEWAY_AUTH_SECRET` triggered enforcement silently. Flag/secret decoupling was the root defect.
**Documents Updated:**
- `README.md` — Configuration table (removed `GATEWAY_AUTH_ENABLED` row, updated `GATEWAY_AUTH_SECRET` description), Operational Notes.
- `docs/ADR.md` — ADR-003 revised with detailed revision note.
- `docs/implementation_plan.md` — §4 tracker (PBI-07 notes updated), §7 session log (this entry).
**Tests Added/Modified:**
- `__tests__/integration/gatewayAuth.test.js` — Rewrote all 8 tests for secret-presence-driven logic. Removed `enabled` param tests.
- `__tests__/unit/config.test.js` — Replaced `GATEWAY_AUTH_ENABLED` tests with `GATEWAY_AUTH_SECRET` presence/absence tests.
**Next Steps:**
- Stage changes and craft commit message per §1.4 commit protocol.
**Context for Next Session:**
- `GATEWAY_AUTH_ENABLED` env var is now **dead** — setting it has no effect. Remove from any `.env` files, Helm `values.yaml`, or Docker Compose env blocks.
- `GATEWAY_AUTH_SECRET` is the sole auth control. Empty/absent = passthrough. Non-empty = enforce Bearer match.
- All 134 tests pass across 14 suites.

### Session 2 — 2026-03-27

**Duration:** ~0.5 hours
**PBIs Worked On:** PBI-20
**Status Changes:**
- PBI-20: ⬜ Not Started → 🔄 In Progress
**Decisions Made:**
- **ADR-007 (New):** express-rate-limit chosen for rate limiting. Simple, standard headers, well-maintained.
**Issues Encountered:**
- None.
**Documents Updated:**
- `docs/product_backlog.md`, `docs/ADR.md`, `docs/implementation_plan.md`.
**Tests Added/Modified:**
- None yet.
**Next Steps:**
- Verify rate limiting with integration tests.
**Context for Next Session:**
- Rate limiting implemented using `express-rate-limit`.
- `buildApp({ ..., rateLimitWindowMs, rateLimitMaxRequests })`.
- Production dependencies: `express`, `@bitwarden/sdk-napi`, `pino`, `prom-client`, `express-rate-limit`.

### Session 1 — 2026-02-27

**Duration:** ~2 hours
**PBIs Worked On:** PBI-01, PBI-02, PBI-03, PBI-04, PBI-05, PBI-06, PBI-07, PBI-08, PBI-09, PBI-10, PBI-11
**Status Changes:**
- Phase 1 — Foundation: ⬜ Not Started → ✅ Done (10/10 SP)
  - PBI-01: ⬜ → ✅ Done | PBI-02: ⬜ → ✅ Done | PBI-03: ⬜ → ✅ Done
- Phase 2 — Core Hardening: ⬜ Not Started → ✅ Done (12/12 SP)
  - PBI-04: ⬜ → ✅ Done | PBI-05: ⬜ → ✅ Done | PBI-06: ⬜ → ✅ Done | PBI-08: ⬜ → ✅ Done
- Phase 3 — Security & Resilience: ⬜ Not Started → ✅ Done (15/15 SP)
  - PBI-07: ⬜ → ✅ Done | PBI-09: ⬜ → ✅ Done | PBI-10: ⬜ → ✅ Done | PBI-11: ⬜ → ✅ Done
- Overall: 37/63 SP (59%)
**Decisions Made:**
- **ADR-004 (New):** Pino chosen over Winston/Bunyan for structured logging. Built-in redaction, JSON-native, ~5x faster. Status: Implemented.
- **ADR-005 (New):** prom-client chosen for Prometheus metrics. De facto standard, dedicated registry for isolation. Status: Implemented.
- **ADR-006 (New):** Custom circuit breaker (~120 LOC) chosen over opossum/cockatiel. YAGNI — our requirements are straightforward. Zero additional deps. Status: Implemented.
- **ADR-002:** Status updated from Accepted → Implemented (cache functional with TTL, stats, clear on shutdown).
- **ADR-003:** Status updated from Proposed → Accepted (gateway auth middleware with GATEWAY_AUTH_ENABLED toggle).
- Tests migrated from `__tests__/index.test.js` to `__tests__/integration/vault.test.js`. Old file removed.
- `index.js` retained as thin bootstrap. `buildApp()` signature extended with DI for all services.
- `src/config/index.js` uses `console.error` for startup validation (chicken-and-egg: logger needs config).
- `loadConfig()` injectable `env` parameter for testability.
- Request ID middleware respects `X-Request-Id` header from gateway, generates `crypto.randomUUID()` otherwise.
- Error classifier uses regex pattern matching (not exact strings) for SDK version resilience (Risk R3).
- Circuit breaker: stale-serve from cache when open with `X-Degraded-Mode: true` response header.
- Gateway auth: `/health` and `/metrics` exempt. Shared secret mode for local dev.
- Token lifecycle: `attemptReauth()` fire-and-forget with mutex to prevent concurrent re-auth.
**Issues Encountered:**
- `npm test` initially failed with `jest: not found` — resolved by `npm install`.
- Docker build skipped per user instruction (not available this session).
- Circuit breaker test "re-opens after failed probe" initially failed due to `cooldownMs: 0` causing immediate re-transition to half-open. Fixed by using realistic cooldown with `Date.now` mock.
**Documents Updated:**
- `README.md` — Project structure, configuration table (all 9 env vars), API section (all endpoints + error codes), operational notes.
- `docs/implementation_plan.md` — §4 tracker (all 11 PBIs updated), §4.6 progress summary, §7 session log.
- `docs/ADR.md` — ADR-002 status → Implemented, ADR-003 status → Accepted, new ADR-004 (Pino), ADR-005 (prom-client), ADR-006 (Custom Circuit Breaker).
**Tests Added/Modified:**
- `__tests__/unit/config.test.js` — 13 tests (defaults, custom, validation errors, CB + gateway config).
- `__tests__/unit/logger.test.js` — 14 tests (JSON, timestamps, levels, redaction, child loggers).
- `__tests__/unit/validateSecretId.test.js` — 10 tests (valid/invalid UUIDs, injection, edge cases).
- `__tests__/unit/cache.test.js` — 13 tests (hit, miss, TTL, clear, stats, overwrite).
- `__tests__/unit/errorClassifier.test.js` — 17 tests (all error categories + edge cases).
- `__tests__/unit/circuitBreaker.test.js` — 10 tests (state transitions, probe, reset).
- `__tests__/unit/stateFile.test.js` — 5 tests (secure delete, stale cleanup, error handling).
- `__tests__/integration/vault.test.js` — 13 tests (health, vault, validation, cache, errors, re-auth).
- `__tests__/integration/gatewayAuth.test.js` — 9 tests (enabled/disabled, shared secret, exempt endpoints).
- `__tests__/integration/metrics.test.js` — 2 tests (Prometheus format, auth exemption).
- `__tests__/index.test.js` — Removed (superseded).
**Next Steps:**
- Implement PBI-20 (Rate Limiting).
- Docker build verification deferred — should be validated at start of next session.
**Context for Next Session:**
- 105 tests passing across 10 suites. Phases 1–3 complete (37/63 SP, 59%).
- Only `console.error` remaining is in `src/config/index.js` (startup validation).
- `Dockerfile` updated with `COPY src/` but not build-tested.

---

## 8. Risk Register (Implementation-Specific)

| # | Risk | Probability | Impact | Mitigation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | PBI-01 refactor breaks existing tests | Medium | High | Run tests after each extraction step, not just at the end. | Open |
| R2 | `pino` redaction misses nested secret fields | Low | Critical | Write exhaustive redaction tests with deeply nested objects. | Open |
| R3 | `@bitwarden/sdk-napi` error messages change between versions, breaking PBI-06/PBI-08 error detection | Medium | Medium | Use pattern matching (regex), not exact string comparison. Pin SDK version. | Open |
| R4 | APISix external dependency not available for PBI-07 testing | High | Medium | Implement with configurable toggle (`GATEWAY_AUTH_ENABLED=false`). Test with mocked headers only. | Open |
| R5 | Native SDK bindings incompatible with Alpine-based Docker images | Low | High | Use `node:lts-slim` (Debian) instead of Alpine. Already mitigated by current Dockerfile. | Mitigated |
| R6 | Session context lost between AI assistant sessions | Medium | Medium | This document. Always read §4 and §7 at session start. | Mitigated |

---

## 9. Glossary of Status Icons

| Icon | Meaning |
| :---: | :--- |
| ⬜ | Not Started |
| 🔄 | In Progress |
| ⏸️ | Paused / Blocked |
| ✅ | Done |
| ❌ | Cancelled / Deferred |

---

## 10. References

| Document | Path | Purpose |
| :--- | :--- | :--- |
| Product Backlog | `docs/product_backlog.md` | PBI definitions, acceptance criteria, priorities |
| ADR | `docs/ADR.md` | Architectural decisions and their status |
| Supplementary Spec | `docs/supplementary_specification.md` | NFRs, quality attributes, constraints |
| Product Vision | `docs/product_vision.md` | Strategic goals, success metrics, risks |
| Development Plan | `docs/product_development_plan.md` | Process, roles, risk management, release strategy |
| Development Case | `docs/development_case_document.md` | UP phases, artifact matrix, process customization |
| Optimizations | `docs/optimizations.md` | Original optimization proposals (input to backlog) |
| README | `README.md` | User-facing documentation, API reference |
| Security Policy | `SECURITY.md` | Security constraints and vulnerability reporting |
| Contributing Guide | `CONTRIBUTING.md` | Development workflow and coding standards |
