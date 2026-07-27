/**
 * @module config
 * @description Centralized configuration module. Reads all environment
 *   variables, validates required values, coerces types, and exports a
 *   frozen configuration object. No other module should access
 *   `process.env` directly — import from this module instead.
 *
 *   Fail-fast: exits with code 1 and a structured error on missing
 *   required variables or invalid types.
 */

'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const dotenv = require('dotenv');

/**
 * @typedef {Object} AppConfig
 * @property {string}  bwsAccessToken           - BWS machine-account access token.
 * @property {number}  port                      - HTTP port for the service.
 * @property {string}  bwsStateFile              - Path to Bitwarden SDK state file.
 * @property {number}  cacheTtl                  - Cache time-to-live in seconds.
 * @property {number}  cacheMaxEntries           - Maximum in-memory secret cache entries.
 * @property {string}  logLevel                  - Logging level.
 * @property {number}  circuitBreakerThreshold   - Consecutive failures to trip circuit.
 * @property {number}  circuitBreakerCooldown    - Cooldown period in seconds.
 * @property {string}  gatewayAuthSecret         - Shared secret for gateway auth. When non-empty,
 *                                                 every /vault/* request must supply a matching
 *                                                 Bearer token. Empty string = auth disabled.
 * @property {number}  rateLimitWindowMs         - Rate limit window in milliseconds.
 * @property {number}  rateLimitMaxRequests      - Max requests per window.
 * @property {string[]} trustedProxyCidrs         - Explicit proxy IPs/CIDRs whose forwarded
 *                                                  headers may be trusted.
 * @property {number}  reauthRetryMaxAttempts     - Background re-authentication retry limit.
 * @property {number}  reauthRetryBaseMs          - Initial re-authentication retry delay.
 * @property {number}  requestTimeoutMs           - Maximum duration of an HTTP request.
 * @property {number}  headersTimeoutMs           - Maximum duration to receive request headers.
 * @property {number}  keepAliveTimeoutMs         - Idle HTTP keep-alive duration.
 */

const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const TRUSTED_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * Validates an IP address or CIDR accepted by Express/proxy-addr. Do not
 * accept hop counts or `true`: either can let a directly connected client
 * spoof X-Forwarded-For on a topology with multiple ingress paths.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidTrustedProxy(value) {
  if (TRUSTED_PROXY_NAMES.has(value)) {
    return true;
  }

  const [address, prefix, ...rest] = value.split('/');
  const ipVersion = net.isIP(address);
  if (!ipVersion || rest.length > 0) {
    return false;
  }

  if (prefix === undefined) {
    return true;
  }

  return /^\d+$/.test(prefix)
    && Number(prefix) >= 0
    && Number(prefix) <= (ipVersion === 4 ? 32 : 128);
}

/**
 * Loads, validates, and returns the application configuration from
 * environment variables.
 *
 * @param {Object} [env=process.env] - Environment variable source (injectable for testing).
 * @returns {Readonly<AppConfig>} Frozen configuration object.
 * @throws {Error} Logs error and calls process.exit(1) on validation failure.
 */
function loadConfig(envSource = process.env, options = {}) {
  const errors = [];
  const logs = [];
  const skipDotEnv = options.skipDotEnv || false;
  const logger = options.logger;

  // Load .env file if it exists and not skipped
  const envPath = path.resolve(process.cwd(), '.env');
  let dotEnvConfig = {};
  if (!skipDotEnv && fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      dotEnvConfig = result.parsed;
    }
  }

  /**
   * Helper to get value with priority: .env > environment > default
   */
  const getValue = (key, defaultValue = undefined) => {
    if (dotEnvConfig[key] !== undefined) {
      logs.push(`Config: Loaded ${key} from .env file.`);
      return dotEnvConfig[key];
    }
    if (envSource[key] !== undefined) {
      logs.push(`Config: Loaded ${key} from environment variables.`);
      return envSource[key];
    }
    if (defaultValue !== undefined) {
      logs.push(`Config: Loaded ${key} from default value.`);
      return defaultValue;
    }
    return undefined;
  };

  // --- Required variables ---
  const bwsAccessToken = getValue('BWS_ACCESS_TOKEN');
  if (!bwsAccessToken) {
    errors.push('BWS_ACCESS_TOKEN is required but not set.');
  }

  // --- Optional variables with defaults and type coercion ---
  const rawPort = getValue('PORT', '3000');
  const port = Number(rawPort);
  if (Number.isNaN(port) || !Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be a valid integer between 1 and 65535. Got: "${rawPort}".`);
  }

  const bwsStateFile = getValue('BWS_STATE_FILE', '/tmp/bws_state.json');

  const rawCacheTtl = getValue('CACHE_TTL', '60');
  const cacheTtl = Number(rawCacheTtl);
  if (Number.isNaN(cacheTtl) || cacheTtl < 0) {
    errors.push(`CACHE_TTL must be a non-negative number. Got: "${rawCacheTtl}".`);
  }

  const rawCacheMaxEntries = getValue('CACHE_MAX_ENTRIES', '1000');
  const cacheMaxEntries = Number(rawCacheMaxEntries);
  if (Number.isNaN(cacheMaxEntries) || !Number.isInteger(cacheMaxEntries) || cacheMaxEntries < 1) {
    errors.push(`CACHE_MAX_ENTRIES must be a positive integer. Got: "${rawCacheMaxEntries}".`);
  }

  const rawLogLevel = getValue('LOG_LEVEL', 'info');
  const logLevel = rawLogLevel.toLowerCase();
  if (!VALID_LOG_LEVELS.includes(logLevel)) {
    errors.push(`LOG_LEVEL must be one of [${VALID_LOG_LEVELS.join(', ')}]. Got: "${rawLogLevel}".`);
  }

  // --- Bulk retrieval config ---
  const rawBulkMaxIds = getValue('BULK_MAX_IDS', '50');
  const bulkMaxIds = Number(rawBulkMaxIds);
  if (Number.isNaN(bulkMaxIds) || !Number.isInteger(bulkMaxIds) || bulkMaxIds < 1) {
    errors.push(`BULK_MAX_IDS must be a positive integer. Got: "${rawBulkMaxIds}".`);
  }

  // --- Circuit breaker config ---
  const rawCbThreshold = getValue('CIRCUIT_BREAKER_THRESHOLD', '5');
  const circuitBreakerThreshold = Number(rawCbThreshold);
  if (Number.isNaN(circuitBreakerThreshold) || circuitBreakerThreshold < 1) {
    errors.push(`CIRCUIT_BREAKER_THRESHOLD must be a positive integer. Got: "${rawCbThreshold}".`);
  }

  const rawCbCooldown = getValue('CIRCUIT_BREAKER_COOLDOWN', '30');
  const circuitBreakerCooldown = Number(rawCbCooldown);
  if (Number.isNaN(circuitBreakerCooldown) || circuitBreakerCooldown < 0) {
    errors.push(`CIRCUIT_BREAKER_COOLDOWN must be a non-negative number. Got: "${rawCbCooldown}".`);
  }

  // --- Gateway auth config ---
  // Auth is enabled when and only when GATEWAY_AUTH_SECRET is a non-empty string.
  // GATEWAY_AUTH_ENABLED has been removed — a single env var is the source of truth,
  // eliminating the ambiguous (enabled=false, secret=set) and (enabled=true, secret='')
  // states that caused unexpected 401s when the flag was unset.
  const gatewayAuthSecret = getValue('GATEWAY_AUTH_SECRET', '');

  // --- Rate limiting config ---
  const rawRateLimitWindowMs = getValue('RATE_LIMIT_WINDOW_MS', '900000'); // 15 minutes
  const rateLimitWindowMs = Number(rawRateLimitWindowMs);
  if (Number.isNaN(rateLimitWindowMs) || rateLimitWindowMs < 0) {
    errors.push(`RATE_LIMIT_WINDOW_MS must be a non-negative number. Got: "${rawRateLimitWindowMs}".`);
  }

  const rawRateLimitMaxRequests = getValue('RATE_LIMIT_MAX_REQUESTS', '100');
  const rateLimitMaxRequests = Number(rawRateLimitMaxRequests);
  if (Number.isNaN(rateLimitMaxRequests) || !Number.isInteger(rateLimitMaxRequests) || rateLimitMaxRequests < 1) {
    errors.push(`RATE_LIMIT_MAX_REQUESTS must be a positive integer. Got: "${rawRateLimitMaxRequests}".`);
  }

  // Trust forwarded headers only from explicitly declared reverse proxies.
  // Leaving this unset is safe for direct container access: X-Forwarded-For
  // is ignored and rate limiting uses the socket peer address instead.
  const rawTrustedProxyCidrs = getValue('TRUSTED_PROXY_CIDRS', '');
  const trustedProxyCidrs = rawTrustedProxyCidrs
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const invalidTrustedProxy = trustedProxyCidrs.find((value) => !isValidTrustedProxy(value));
  if (invalidTrustedProxy) {
    errors.push(
      `TRUSTED_PROXY_CIDRS must be a comma-separated list of IP addresses, CIDRs, or `
      + `the names loopback, linklocal, uniquelocal. Got invalid value: "${invalidTrustedProxy}".`,
    );
  }

  // --- Re-authentication resilience config ---
  const rawReauthRetryMaxAttempts = getValue('REAUTH_RETRY_MAX_ATTEMPTS', '5');
  const reauthRetryMaxAttempts = Number(rawReauthRetryMaxAttempts);
  if (Number.isNaN(reauthRetryMaxAttempts) || !Number.isInteger(reauthRetryMaxAttempts) || reauthRetryMaxAttempts < 0) {
    errors.push(`REAUTH_RETRY_MAX_ATTEMPTS must be a non-negative integer. Got: "${rawReauthRetryMaxAttempts}".`);
  }

  const rawReauthRetryBaseMs = getValue('REAUTH_RETRY_BASE_MS', '1000');
  const reauthRetryBaseMs = Number(rawReauthRetryBaseMs);
  if (Number.isNaN(reauthRetryBaseMs) || !Number.isInteger(reauthRetryBaseMs) || reauthRetryBaseMs < 1) {
    errors.push(`REAUTH_RETRY_BASE_MS must be a positive integer. Got: "${rawReauthRetryBaseMs}".`);
  }

  // --- HTTP server resource bounds ---
  const rawRequestTimeoutMs = getValue('REQUEST_TIMEOUT_MS', '30000');
  const requestTimeoutMs = Number(rawRequestTimeoutMs);
  if (Number.isNaN(requestTimeoutMs) || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    errors.push(`REQUEST_TIMEOUT_MS must be a positive integer. Got: "${rawRequestTimeoutMs}".`);
  }

  const rawHeadersTimeoutMs = getValue('HEADERS_TIMEOUT_MS', '10000');
  const headersTimeoutMs = Number(rawHeadersTimeoutMs);
  if (Number.isNaN(headersTimeoutMs) || !Number.isInteger(headersTimeoutMs) || headersTimeoutMs < 1) {
    errors.push(`HEADERS_TIMEOUT_MS must be a positive integer. Got: "${rawHeadersTimeoutMs}".`);
  } else if (!Number.isNaN(requestTimeoutMs) && headersTimeoutMs > requestTimeoutMs) {
    errors.push(`HEADERS_TIMEOUT_MS must not exceed REQUEST_TIMEOUT_MS. Got: "${rawHeadersTimeoutMs}" > "${rawRequestTimeoutMs}".`);
  }

  const rawKeepAliveTimeoutMs = getValue('KEEP_ALIVE_TIMEOUT_MS', '5000');
  const keepAliveTimeoutMs = Number(rawKeepAliveTimeoutMs);
  if (Number.isNaN(keepAliveTimeoutMs) || !Number.isInteger(keepAliveTimeoutMs) || keepAliveTimeoutMs < 1) {
    errors.push(`KEEP_ALIVE_TIMEOUT_MS must be a positive integer. Got: "${rawKeepAliveTimeoutMs}".`);
  }

  // --- Fail-fast on validation errors ---
  // --- Fail-fast on validation errors ---
  if (errors.length > 0) {
    if (logger && typeof logger.error === 'function') {
      logger.error('FATAL: Configuration validation failed:');
      errors.forEach((msg) => logger.error(`  - ${msg}`));
    } else {
      console.error('FATAL: Configuration validation failed:');
      errors.forEach((msg) => console.error(`  - ${msg}`));
    }
    process.exit(1);
  }

  // Log successful configuration loading
  if (logger && typeof logger.info === 'function') {
    logs.forEach((msg) => logger.info(msg));
  } else {
    logs.forEach((msg) => console.log(msg));
  }

  return Object.freeze({
    bwsAccessToken,
    port,
    bwsStateFile,
    cacheTtl,
    cacheMaxEntries,
    logLevel,
    bulkMaxIds,
    circuitBreakerThreshold,
    circuitBreakerCooldown,
    gatewayAuthSecret,
    rateLimitWindowMs,
    rateLimitMaxRequests,
    trustedProxyCidrs,
    reauthRetryMaxAttempts,
    reauthRetryBaseMs,
    requestTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs,
  });
}

module.exports = { loadConfig, isValidTrustedProxy };
