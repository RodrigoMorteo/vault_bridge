/**
 * @module server
 * @description HTTP server bootstrap and lifecycle management. Handles
 *   Bitwarden client initialization, server startup, and graceful
 *   shutdown on process signals (SIGTERM, SIGINT).
 */

const { loadConfig } = require('./config');
const { buildApp } = require('./app');
const { createLogger } = require('./utils/logger');
const { initBitwarden, getClient, getIsClientReady } = require('./services/bitwardenClient');

/** @type {import('http').Server|null} */
let server = null;

/**
 * Initializes the Bitwarden client, builds the Express app, and starts
 * the HTTP server.
 *
 * @returns {Promise<import('http').Server>} The listening HTTP server instance.
 */
async function startServer() {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  const client = getClient() || await initBitwarden({
    accessToken: config.bwsAccessToken,
    stateFile: config.bwsStateFile,
    logger,
  });
  const app = buildApp({ client, isReady: () => getIsClientReady(), logger });

  server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Vault Bridge listening internally.');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutdown signal received.');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

module.exports = { startServer };
