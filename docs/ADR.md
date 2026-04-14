# Project Architectural Decision Records Document: BWS Vault Bridge

**CONFIDENTIAL**

## Document Status and Version Control
This document is classified as a living artifact subject to continuous iteration and refinement throughout the project lifecycle. All content, specifications, and plans herein are provisional and may be updated without formal change control until the final v1.0 (Live) release milestone.

For current, authoritative details, always reference the latest version in the official repository.

### Revision History
| Version | Date | Description | Author |
| :--- | :--- | :--- | :--- |
| 1.0.0 | 2024-05-20 | Initial Draft | Rodrigo Morteo |

---

## 001. Architecture Pattern: Centralized Secret Bridge

### 1. Title and Identifier
**001. Architecture Pattern: Centralized Secret Bridge**

### 2. Status and Date
**Status:** Accepted
**Date:** 2024-05-20

### 3. Context
Internal microservices and AI agents require access to secrets stored in Bitwarden Secrets Manager. Directly embedding the Bitwarden SDK (`@bitwarden/sdk-napi`) into every consumer service increases build complexity (native dependencies), bloats container sizes, and decentralizes the management of machine authentication tokens.

### 4. Evaluation Criteria and Options
- **Scalability:** How easily can we add new consumers?
- **Maintenance:** How difficult is it to update the SDK version?
- **Security:** Where are the machine tokens stored?

**Options:**
1. **Embedded SDK:** Each microservice installs the SDK and manages its own token.
2. **Centralized Bridge:** A single service wraps the SDK and exposes a lightweight HTTP API.
3. **Sidecar Pattern:** A Bitwarden container runs alongside every application pod.

### 5. Decision
We will use the **Centralized Bridge** pattern. We will implement a dedicated Node.js microservice (`bws-vault-bridge`) that authenticates with Bitwarden and exposes secrets via a RESTful internal API.

**Justification:** This drastically reduces the "blast radius" of SDK updates. Consumers only need to know how to make an HTTP GET request, decoupling them from Bitwarden's specific implementation details.

### 6. Consequences
**Positive:**
- Simplified consumer logic (just `curl`).
- Centralized auditing and logging of secret access.
- Single point of configuration for Bitwarden credentials.

**Negative:**
- Creates a Single Point of Failure (SPOF); if the bridge is down, no service can start.
- Requires high-availability deployment strategies (replicas).

### 7. Compliance and Governance
- **Automated:** CI pipeline checks for SDK vulnerabilities in the bridge repo only.
- **Manual:** Architecture reviews must approve any new endpoints added to the bridge.

### 8. Notes and Consultation
- Author: Rodrigo Morteo
- Consultation: Security Team (approved strict network isolation for this service).

---

## 002. Caching Strategy: In-Memory TTL

### 1. Title and Identifier
**002. Caching Strategy: In-Memory TTL**

### 2. Status and Date
**Status:** Implemented
**Date:** 2024-05-20

### 3. Context
The `bws-vault-bridge` currently fetches secrets from the upstream Bitwarden API for every request. This introduces significant latency (WAN round-trip) and risks triggering Bitwarden's strict API rate limits, potentially causing a denial-of-service for all dependent applications.

### 4. Evaluation Criteria and Options
- **Latency:** Must be < 10ms for cached reads.
- **Freshness:** Secrets must not be stale for more than 5 minutes.
- **Complexity:** Minimal additional infrastructure dependencies.

**Options:**
1. **No Cache:** Fetch every time (Status Quo).
2. **Redis/External Cache:** Shared cache between bridge instances.
3. **Local In-Memory Cache:** Node.js memory (Map/LRU) with TTL.

### 5. Decision
We will use a **Local In-Memory Cache** with a configurable Time-To-Live (TTL), default 60 seconds. Each bridge instance will maintain its own independent cache.

**Justification:** Redis introduces unnecessary infrastructure complexity for this use case. A local cache is faster (no network hop) and sufficient because secret consistency (eventual consistency) is acceptable for the 60s window. If a secret rotates, waiting 60s is acceptable.

### 6. Consequences
**Positive:**
- Immediate response times (< 1ms) for hot secrets.
- drastic reduction in upstream API calls (Cost/Rate-Limit savings).

**Negative:**
- Potential for stale data during the TTL window.
- Memory usage on the container will increase slightly.

### 7. Compliance and Governance
- **Automated:** Load tests (`k6`) must verify that repeated requests do not trigger upstream calls (mocked).
- **Monitoring:** Cache Hit/Miss ratio metrics must be exported to Prometheus.

### 8. Notes and Consultation
- Author: Rodrigo Morteo

---

## 003. Security Model: Zero-Trust via APISix Integration

### 1. Title and Identifier
**003. Security Model: Zero-Trust via APISix Integration**

### 2. Status and Date
**Status:** Implemented — Revised 2026-04-14
**Date:** 2024-05-20

### 3. Context
The bridge exposes secrets to anyone who can reach its HTTP port. In a flat network or shared Kubernetes cluster, a compromised container could theoretically request all secrets. We need a mechanism to restrict *who* can call the bridge without adding complex auth logic to the bridge itself.

### 4. Evaluation Criteria and Options
- **Security:** Must prevent unauthorized access.
- **Performance:** Minimal overhead on requests.
- **Decoupling:** The bridge should remain "dumb" regarding identity providers.

**Options:**
1. **Application-Level Auth:** Bridge validates API Keys/OIDC tokens directly.
2. **Network Policy:** Kubernetes NetworkPolicies restrict ingress IPs.
3. **Gateway Offloading:** APISix handles auth and forwards a trusted header.

### 5. Decision
We will use **Gateway Offloading via APISix**. The bridge will sit behind an internal APISix route that enforces authentication (e.g., mTLS or JWT). The bridge will only accept traffic containing a specific, signed internal header or from the APISix CIDR block.

**Justification:** This adheres to the "dumb pipe" philosophy. Security policy is managed in the Gateway, not the code. It allows us to change auth providers (e.g., Keycloak to Okta) without touching the bridge code.

#### Revision — 2026-04-14: Remove `GATEWAY_AUTH_ENABLED` flag

**Problem identified:** The original implementation introduced a `GATEWAY_AUTH_ENABLED` boolean flag alongside `GATEWAY_AUTH_SECRET`, creating a four-state truth table (`enabled × sharedSecret`). When APISix's `key_auth` plugin injects an `Authorization: Bearer <key>` header on every request, and `GATEWAY_AUTH_ENABLED` was unset (defaulting to `false`) while `GATEWAY_AUTH_SECRET` was accidentally set in the environment, the middleware silently enforced auth — returning `401` with no visible flag configured, making the failure non-obvious to operators.

**Revised decision:** Remove `GATEWAY_AUTH_ENABLED`. Auth enforcement is derived **exclusively** from `GATEWAY_AUTH_SECRET` presence:
- `GATEWAY_AUTH_SECRET` **absent or empty** → middleware is fully transparent (passthrough). Correct for deployments where APISix handles auth upstream, or in trusted isolated networks.
- `GATEWAY_AUTH_SECRET=<value>` → every `/vault/*` request must carry `Authorization: Bearer <value>`. Missing or wrong token returns `401 Unauthorized` (RFC 7235 semantically correct — prior implementation incorrectly returned `403`).

**Justification:** Single env var as source of truth (KISS). Eliminates the ambiguous dual-control surface. Fail-closed when a secret is configured (Zero Trust).

### 6. Consequences
**Positive:**
- Zero code changes required in the bridge for complex auth flows.
- Centralized policy enforcement.
- Single env var controls auth enforcement — no ambiguous flag/secret combination.
- Correct HTTP semantics: `401 Unauthorized` for missing/invalid credential (was `403`).

**Negative:**
- The bridge is insecure if deployed *without* the gateway **and** without `GATEWAY_AUTH_SECRET` set (must be documented/enforced via NetworkPolicy).
- Operators who previously relied on `GATEWAY_AUTH_ENABLED=true` with no secret (gateway-trusted passthrough with header format check) must remove that variable — it is now a no-op.

### 7. Compliance and Governance
- **Automated:** 8 integration tests in `__tests__/integration/gatewayAuth.test.js` cover all passthrough and enforcement scenarios.
- **Manual:** Deployment manifests (Helm) must include NetworkPolicies denying direct ingress. `GATEWAY_AUTH_SECRET` must be injected via Kubernetes Secret, not plain env.

### 8. Notes and Consultation
- Author: Rodrigo Mortero
- Consultation: Platform Engineering (Confirmed APISix availability).
- Revision Author: Roo (AI Assistant) — 2026-04-14
- Implementation: `src/middleware/gatewayAuth.js`, `src/config/index.js`

---

## 004. Logging Strategy: Pino over Winston/Bunyan

### 1. Title and Identifier
**004. Logging Strategy: Pino over Winston/Bunyan**

### 2. Status and Date
**Status:** Implemented
**Date:** 2026-02-27

### 3. Context
The bridge requires structured JSON logging with automatic redaction of sensitive fields (secrets, tokens, authorization headers) per `supplementary_specification.md` §2.1 and `SECURITY.md`. The logging library must support: configurable log levels, field-level redaction, JSON serialization, per-request child loggers, and minimal performance overhead in a high-throughput microservice.

### 4. Evaluation Criteria and Options
- **Performance:** Logging must not add measurable latency to request handling.
- **Redaction:** Built-in field redaction (not a DIY wrapper).
- **JSON Native:** Output must be valid JSON for centralized log aggregation.
- **Ecosystem:** Must support child loggers for request-scoped context (requestId).

**Options:**
1. **Winston:** Feature-rich, widely adopted. Uses transports for formatting.
2. **Bunyan:** JSON-native, good child logger support. Less actively maintained.
3. **Pino:** JSON-native, built-in redaction paths, child logger support, ~5x faster than Winston in benchmarks. Minimal API surface.

### 5. Decision
We will use **Pino** (`pino` npm package) as the structured logging library.

**Justification:** Pino is the fastest JSON logger in the Node.js ecosystem. Its built-in `redact` option supports path-based censoring (e.g., `['key', 'value', '*.token']`) without custom serializers. Child loggers (for per-request `requestId` context) are zero-allocation. These properties align perfectly with our high-throughput, security-sensitive use case.

### 6. Consequences
**Positive:**
- Native JSON output — no formatter configuration needed.
- Built-in redaction eliminates risk of DIY redaction bugs.
- Child loggers enable request-scoped tracing without middleware overhead.
- `pino.stdTimeFunctions.isoTime` provides ISO 8601 timestamps natively.

**Negative:**
- Human-readable dev output requires `pino-pretty` (not installed; accept JSON in dev for consistency).
- Pino's opinionated API means less customization than Winston (acceptable per YAGNI).

### 7. Compliance and Governance
- **Automated:** Unit tests verify all sensitive fields are redacted (14 tests in `logger.test.js`).
- **Automated:** Integration tests use silent logger to confirm no secret leakage.

### 8. Notes and Consultation
- Author: AI Code Assistant (Session 1)
- Implementation: `src/utils/logger.js`, `src/middleware/requestId.js`
- Refs: PBI-03

---

## 005. Observability: Prometheus Metrics via prom-client

### 1. Title and Identifier
**005. Observability: Prometheus Metrics via prom-client**

### 2. Status and Date
**Status:** Implemented
**Date:** 2026-02-27

### 3. Context
The bridge requires a `/metrics` endpoint in Prometheus exposition format for integration with the monitoring stack (Prometheus + Grafana). Metrics needed include: HTTP request counters (by method/route/status), request latency histograms, cache hit/miss ratios, and circuit breaker state.

### 4. Evaluation Criteria and Options
- **Compatibility:** Must output valid Prometheus exposition format.
- **Isolation:** Metrics registry should not conflict with other services.
- **Performance:** Collection overhead must be negligible.

**Options:**
1. **prom-client:** De facto standard for Node.js Prometheus instrumentation. Supports custom registries, default metrics, histograms, gauges, counters.
2. **Custom implementation:** Hand-roll exposition format. No dependencies.
3. **OpenTelemetry SDK:** Vendor-neutral, but heavier and more complex for a focused use case.

### 5. Decision
We will use **prom-client** with a **dedicated (non-global) registry** for metric isolation.

**Justification:** `prom-client` is the de facto standard for Node.js Prometheus instrumentation, used by thousands of production services. A dedicated registry prevents metric pollution if the bridge is ever composed with other Express apps. The library provides built-in default metrics (CPU, memory, event loop) with zero additional code.

### 6. Consequences
**Positive:**
- Standard Prometheus format — works out-of-box with existing Grafana dashboards.
- Dedicated registry prevents metric namespace collisions.
- Default metrics provide system-level observability for free.

**Negative:**
- Adds a production dependency (~50KB).
- `/metrics` endpoint must be excluded from gateway auth and request logging.

### 7. Compliance and Governance
- **Automated:** Integration tests verify `/metrics` returns expected metric names.
- **Automated:** `/metrics` is exempt from gateway auth middleware.

### 8. Notes and Consultation
- Author: AI Code Assistant (Session 1)
- Implementation: `src/routes/metrics.js`
- Refs: PBI-10

---

## 006. Resilience Pattern: Custom Circuit Breaker

### 1. Title and Identifier
**006. Resilience Pattern: Custom Circuit Breaker**

### 2. Status and Date
**Status:** Implemented
**Date:** 2026-02-27

### 3. Context
The bridge proxies all secret requests to the upstream Bitwarden API. If the upstream becomes degraded (rate limiting, network issues, authentication failures), the bridge could exhaust resources on doomed requests and cascade failures to all consuming services.

### 4. Evaluation Criteria and Options
- **Simplicity:** Minimal code surface for auditability.
- **Configurability:** Threshold and cooldown must be environment-variable driven.
- **Integration:** Must coexist with the TTL cache for stale-serve during open state.
- **Dependency count:** Prefer zero additional dependencies.

**Options:**
1. **opossum:** Popular circuit breaker library. Feature-rich (events, fallbacks, metrics).
2. **cockatiel:** TypeScript-native, policy-based resilience (retry, circuit breaker, bulkhead).
3. **Custom implementation:** Simple state machine in ~120 LOC. No dependencies.

### 5. Decision
We will implement a **custom circuit breaker** as a simple state machine (closed → open → half-open → closed) with no external dependencies.

**Justification:** Our circuit breaker requirements are straightforward: count consecutive failures, open on threshold, probe after cooldown. Libraries like `opossum` provide timeout wrapping, event emitters, and fallback functions that we don't need (YAGNI). A ~120 LOC custom implementation is easier to audit, test, and understand than configuring a library's abstraction layer. The circuit breaker integrates tightly with our cache for stale-serve, which is simpler with direct state access than through a library's callback API.

### 6. Consequences
**Positive:**
- Zero additional dependencies.
- Full control over state transitions and integration with cache.
- Simple API: `allowRequest()`, `recordSuccess()`, `recordFailure()`, `getState()`.
- Easy to instrument with Prometheus gauge.

**Negative:**
- No built-in timeout wrapping (acceptable — SDK has its own timeout handling).
- No event emitter pattern (state logged directly via Pino).
- Maintenance burden if requirements grow significantly (mitigated: can migrate to opossum later).

### 7. Compliance and Governance
- **Automated:** 10 unit tests cover all state transitions (closed, open, half-open, probe success/failure).
- **Automated:** Circuit breaker state exposed via Prometheus gauge (`circuit_breaker_state`).
- **Configuration:** `CIRCUIT_BREAKER_THRESHOLD` (default: 5), `CIRCUIT_BREAKER_COOLDOWN` (default: 30s).

### 8. Notes and Consultation
- Author: AI Code Assistant (Session 1)
- Implementation: `src/services/circuitBreaker.js`
- Refs: PBI-09

---

## 007. Rate Limiting Strategy: express-rate-limit

### 1. Title and Identifier
**007. Rate Limiting Strategy: express-rate-limit**

### 2. Status and Date
**Status:** Proposed
**Date:** 2026-03-27

### 3. Context
The bridge is susceptible to brute-force attacks and resource exhaustion if a client makes an excessive number of requests. While the upstream Bitwarden API has its own rate limits, the bridge should protect itself and the upstream service by enforcing its own limits at the edge.

### 4. Evaluation Criteria and Options
- **Simplicity:** Easy to integrate with Express.
- **Flexibility:** Supports configurable windows and request counts.
- **Storage:** Support for in-memory storage (default) and external stores (Redis) if needed later.
- **Standardization:** Follows standard HTTP headers (`Retry-After`, `X-RateLimit-*`).

**Options:**
1. **express-rate-limit:** De facto standard for Express. Simple, well-maintained, supports various stores.
2. **rate-limiter-flexible:** More powerful and flexible, but higher complexity.
3. **Custom Implementation:** Simple but requires manual header management and state tracking.

### 5. Decision
We will use **express-rate-limit**.

**Justification:** It is the most widely used rate-limiting middleware for Express, providing a perfect balance of simplicity and features. It natively supports the required HTTP headers and allows for easy configuration via environment variables.

### 6. Consequences
**Positive:**
- Protection against brute-force and DoS.
- Standardized rate-limit headers for clients.
- Minimal implementation effort.

**Negative:**
- Adds a new production dependency.
- In-memory storage is per-instance (acceptable for our current architecture).

### 7. Compliance and Governance
- **Automated:** Integration tests must verify 429 responses when limits are exceeded.
- **Monitoring:** Rate limit hits should ideally be instrumented (future PBI).

### 8. Notes and Consultation
- Author: Roo (AI Assistant)
- Refs: PBI-20