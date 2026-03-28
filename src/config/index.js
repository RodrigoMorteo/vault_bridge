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
const path = require('path');
const dotenv = require('dotenv');

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
 * @property {number}  rateLimitWindowMs         - Rate limit window in milliseconds.
 * @property {number}  rateLimitMaxRequests      - Max requests per window.
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
  const gatewayAuthEnabled = (getValue('GATEWAY_AUTH_ENABLED', 'false')).toLowerCase() === 'true';
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
    logLevel,
    bulkMaxIds,
    circuitBreakerThreshold,
    circuitBreakerCooldown,
    gatewayAuthEnabled,
    gatewayAuthSecret,
    rateLimitWindowMs,
    rateLimitMaxRequests,
  });
}

module.exports = { loadConfig };
