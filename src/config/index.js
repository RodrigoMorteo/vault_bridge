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

/**
 * @typedef {Object} AppConfig
 * @property {string}  bwsAccessToken           - BWS machine-account access token.
 * @property {number}  port                      - HTTP port for the service.
 * @property {string}  bwsStateFile              - Path to Bitwarden SDK state file.
 * @property {number}  cacheTtl                  - Cache time-to-live in seconds.
 * @property {string}  logLevel                  - Logging level.
 * @property {number}  circuitBreakerThreshold   - Consecutive failures to trip circuit.
 * @property {number}  circuitBreakerCooldown    - Cooldown period in seconds.
 * @property {boolean} gatewayAuthEnabled        - Whether gateway auth is enforced.
 * @property {string}  gatewayAuthSecret         - Shared secret for gateway auth (when gateway disabled).
 */

const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/**
 * Loads, validates, and returns the application configuration from
 * environment variables.
 *
 * @param {Object} [env=process.env] - Environment variable source (injectable for testing).
 * @returns {Readonly<AppConfig>} Frozen configuration object.
 * @throws {Error} Logs error and calls process.exit(1) on validation failure.
 */
function loadConfig(env = process.env) {
  const errors = [];

  // --- Required variables ---
  const bwsAccessToken = env.BWS_ACCESS_TOKEN;
  if (!bwsAccessToken) {
    errors.push('BWS_ACCESS_TOKEN is required but not set.');
  }

  // --- Optional variables with defaults and type coercion ---
  const rawPort = env.PORT || '3000';
  const port = Number(rawPort);
  if (Number.isNaN(port) || !Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be a valid integer between 1 and 65535. Got: "${rawPort}".`);
  }

  const bwsStateFile = env.BWS_STATE_FILE || '/tmp/bws_state.json';

  const rawCacheTtl = env.CACHE_TTL || '60';
  const cacheTtl = Number(rawCacheTtl);
  if (Number.isNaN(cacheTtl) || cacheTtl < 0) {
    errors.push(`CACHE_TTL must be a non-negative number. Got: "${rawCacheTtl}".`);
  }

  const logLevel = (env.LOG_LEVEL || 'info').toLowerCase();
  if (!VALID_LOG_LEVELS.includes(logLevel)) {
    errors.push(`LOG_LEVEL must be one of [${VALID_LOG_LEVELS.join(', ')}]. Got: "${env.LOG_LEVEL}".`);
  }

  // --- Circuit breaker config ---
  const rawCbThreshold = env.CIRCUIT_BREAKER_THRESHOLD || '5';
  const circuitBreakerThreshold = Number(rawCbThreshold);
  if (Number.isNaN(circuitBreakerThreshold) || circuitBreakerThreshold < 1) {
    errors.push(`CIRCUIT_BREAKER_THRESHOLD must be a positive integer. Got: "${rawCbThreshold}".`);
  }

  const rawCbCooldown = env.CIRCUIT_BREAKER_COOLDOWN || '30';
  const circuitBreakerCooldown = Number(rawCbCooldown);
  if (Number.isNaN(circuitBreakerCooldown) || circuitBreakerCooldown < 0) {
    errors.push(`CIRCUIT_BREAKER_COOLDOWN must be a non-negative number. Got: "${rawCbCooldown}".`);
  }

  // --- Gateway auth config ---
  const gatewayAuthEnabled = (env.GATEWAY_AUTH_ENABLED || 'false').toLowerCase() === 'true';
  const gatewayAuthSecret = env.GATEWAY_AUTH_SECRET || '';

  // --- Fail-fast on validation errors ---
  if (errors.length > 0) {
    console.error('FATAL: Configuration validation failed:');
    errors.forEach((msg) => console.error(`  - ${msg}`));
    process.exit(1);
  }

  return Object.freeze({
    bwsAccessToken,
    port,
    bwsStateFile,
    cacheTtl,
    logLevel,
    circuitBreakerThreshold,
    circuitBreakerCooldown,
    gatewayAuthEnabled,
    gatewayAuthSecret,
  });
}

module.exports = { loadConfig };
