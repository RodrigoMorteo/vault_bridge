/**
 * @module server
 * @description HTTP server bootstrap and lifecycle management. Handles
 *   Bitwarden client initialization, server startup, cache creation,
 *   and graceful shutdown on process signals (SIGTERM, SIGINT).
 */

const { loadConfig } = require('./config');
const { buildApp } = require('./app');
const { createLogger } = require('./utils/logger');
const { createCache } = require('./services/cache');
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
 * Initializes the Bitwarden client, builds the Express app, and starts
 * the HTTP server.
 *
 * @returns {Promise<import('http').Server>} The listening HTTP server instance.
 */
async function startServer() {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  // Create cache instance
  cache = createCache({ defaultTtlSeconds: config.cacheTtl });

  const client = getClient() || await initBitwarden({
    accessToken: config.bwsAccessToken,
    stateFile: config.bwsStateFile,
    logger,
  });

  const app = buildApp({
    client,
    isReady: () => getIsClientReady(),
    cache,
    attemptReauth,
    logger,
  });

  server = app.listen(config.port, () => {
    logger.info({ port: config.port, cacheTtl: config.cacheTtl }, 'Vault Bridge listening internally.');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutdown signal received.');
    if (cache) {
      cache.clear();
      logger.info('Cache cleared.');
    }
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

module.exports = { startServer };
