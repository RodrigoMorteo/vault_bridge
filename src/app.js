/**
 * @module app
 * @description Express application assembly. Creates and configures the
 *   Express app with all route handlers and middleware. This is the
 *   composition root for the HTTP layer.
 */

const express = require('express');
const { createHealthRouter } = require('./routes/health');
const { createVaultRouter } = require('./routes/vault');
const { createRequestIdMiddleware } = require('./middleware/requestId');
const { createLogger } = require('./utils/logger');

/**
 * Builds and returns the configured Express application.
 *
 * @param {Object}   deps
 * @param {Object}   deps.client         - Bitwarden SDK client instance.
 * @param {Function} [deps.isReady]      - Returns true when the vault client is ready.
 * @param {Object}   [deps.cache]        - TTL cache instance (optional).
 * @param {Function} [deps.attemptReauth] - Re-auth function for token lifecycle (optional).
 * @param {import('pino').Logger} [deps.logger] - Logger instance (auto-created if not provided).
 * @param {string}   [deps.logLevel]     - Log level for auto-created logger.
 * @returns {express.Application}
 */
function buildApp({ client, isReady = () => true, cache, attemptReauth, logger, logLevel = 'info' }) {
  const app = express();
  const log = logger || createLogger({ level: logLevel });

  // Attach request ID and child logger to every request
  app.use(createRequestIdMiddleware({ logger: log }));

  // Request logging middleware
  app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
      req.log.info({
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - startTime,
      }, 'Request completed');
    });
    next();
  });

  app.use(createHealthRouter({ isReady }));
  app.use(createVaultRouter({ client, isReady, cache, attemptReauth, logger: log }));

  return app;
}

module.exports = { buildApp };
