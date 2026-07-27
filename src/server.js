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
  stopReauthRetries,
} = require('./services/bitwardenClient');

/** @type {import('http').Server|null} */
let server = null;

/** @type {Object|null} */
let cache = null;

let isShuttingDown = false;

/**
 * Initializes all services and starts the HTTP server.
 *
 * @returns {Promise<import('http').Server>} The listening HTTP server instance.
 */
async function startServer() {
  // Initial load to get log level
  const initialConfig = loadConfig(process.env, { skipDotEnv: false });
  const logger = createLogger({ level: initialConfig.logLevel });

  // Reload with logger to get structured startup logs
  const config = loadConfig(process.env, { skipDotEnv: false, logger });

  // Clean stale state file from prior unclean shutdown (PBI-11)
  cleanStaleStateFile(config.bwsStateFile, { logger });

  // Create cache instance (PBI-05)
  cache = createCache({
    defaultTtlSeconds: config.cacheTtl,
    maxEntries: config.cacheMaxEntries,
  });

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
    reauthRetryMaxAttempts: config.reauthRetryMaxAttempts,
    reauthRetryBaseMs: config.reauthRetryBaseMs,
  });

  // Build Express app with all integrations
  const app = buildApp({
    client,
    isReady: () => getIsClientReady(),
    cache,
    circuitBreaker,
    attemptReauth,
    gatewayAuthSecret: config.gatewayAuthSecret,
    bulkMaxIds: config.bulkMaxIds,
    rateLimitWindowMs: config.rateLimitWindowMs,
    rateLimitMaxRequests: config.rateLimitMaxRequests,
    trustedProxyCidrs: config.trustedProxyCidrs,
    logger,
  });

  server = app.listen(config.port, () => {
    logger.info({
      port: config.port,
      cacheTtl: config.cacheTtl,
      cacheMaxEntries: config.cacheMaxEntries,
      circuitBreakerThreshold: config.circuitBreakerThreshold,
      circuitBreakerCooldown: config.circuitBreakerCooldown,
      gatewayAuthEnforced: !!config.gatewayAuthSecret,
      trustedProxyCidrs: config.trustedProxyCidrs,
      requestTimeoutMs: config.requestTimeoutMs,
      headersTimeoutMs: config.headersTimeoutMs,
      keepAliveTimeoutMs: config.keepAliveTimeoutMs,
    }, 'Vault Bridge listening internally.');
  });

  // Bound slow clients and hung downstream responses. The upstream SDK may
  // still need its own transport timeout, but these limits prevent sockets
  // from consuming this server indefinitely.
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;

  const shutdown = (signal, exitCode = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received.');
    if (cache) {
      if (typeof cache.stop === 'function') {
        cache.stop();
      } else {
        cache.clear();
      }
      logger.info('Cache cleared.');
    }
    stopReauthRetries();
    // Securely delete state file on shutdown (PBI-11)
    secureDelete(config.bwsStateFile, { logger });
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing process exit.');
      process.exit(exitCode || 1);
    }, config.requestTimeoutMs);
    forceExit.unref();
    server.close((err) => {
      clearTimeout(forceExit);
      if (err) {
        logger.error({ err }, 'Error while closing HTTP server.');
        process.exit(1);
      }
      process.exit(exitCode);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  server.on('error', (err) => {
    logger.fatal({ err }, 'HTTP server error.');
    shutdown('SERVER_ERROR', 1);
  });

  return server;
}

module.exports = { startServer };
