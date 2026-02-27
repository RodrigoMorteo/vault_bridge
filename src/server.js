/**
 * @module server
 * @description HTTP server bootstrap and lifecycle management. Handles
 *   Bitwarden client initialization, server startup, cache creation,
 *   circuit breaker setup, state file security, and graceful shutdown.
 */

const { loadConfig } = require('./config');
const { buildApp } = require('./app');
const { createLogger } = require('./utils/logger');
const { createCache } = require('./services/cache');
const { createCircuitBreaker } = require('./services/circuitBreaker');
const { cleanStaleStateFile, secureDelete } = require('./utils/stateFile');
const {
  initBitwarden,
  getClient,
  getIsClientReady,
  attemptReauth,
} = require('./services/bitwardenClient');

/** @type {import('http').Server|null} */
let server = null;

/** @type {Object|null} */
let cache = null;

/**
 * Initializes all services and starts the HTTP server.
 *
 * @returns {Promise<import('http').Server>} The listening HTTP server instance.
 */
async function startServer() {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  // Clean stale state file from prior unclean shutdown (PBI-11)
  cleanStaleStateFile(config.bwsStateFile, { logger });

  // Create cache instance (PBI-05)
  cache = createCache({ defaultTtlSeconds: config.cacheTtl });

  // Create circuit breaker (PBI-09)
  const circuitBreaker = createCircuitBreaker({
    failureThreshold: config.circuitBreakerThreshold,
    cooldownMs: config.circuitBreakerCooldown * 1000,
    logger,
  });

  // Initialize Bitwarden client
  const client = getClient() || await initBitwarden({
    accessToken: config.bwsAccessToken,
    stateFile: config.bwsStateFile,
    logger,
  });

  // Build Express app with all integrations
  const app = buildApp({
    client,
    isReady: () => getIsClientReady(),
    cache,
    circuitBreaker,
    attemptReauth,
    gatewayAuthEnabled: config.gatewayAuthEnabled,
    gatewayAuthSecret: config.gatewayAuthSecret,
    bulkMaxIds: config.bulkMaxIds,
    logger,
  });

  server = app.listen(config.port, () => {
    logger.info({
      port: config.port,
      cacheTtl: config.cacheTtl,
      circuitBreakerThreshold: config.circuitBreakerThreshold,
      circuitBreakerCooldown: config.circuitBreakerCooldown,
      gatewayAuthEnabled: config.gatewayAuthEnabled,
    }, 'Vault Bridge listening internally.');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutdown signal received.');
    if (cache) {
      cache.clear();
      logger.info('Cache cleared.');
    }
    // Securely delete state file on shutdown (PBI-11)
    secureDelete(config.bwsStateFile, { logger });
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

module.exports = { startServer };
