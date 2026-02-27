/**
 * @module app
 * @description Express application assembly. Creates and configures the
 *   Express app with all route handlers, middleware, and instrumentation.
 *   This is the composition root for the HTTP layer.
 */

const express = require('express');
const { createHealthRouter } = require('./routes/health');
const { createVaultRouter } = require('./routes/vault');
const { createMetricsRouter } = require('./routes/metrics');
const { createRequestIdMiddleware } = require('./middleware/requestId');
const { createGatewayAuth } = require('./middleware/gatewayAuth');
const { createLogger } = require('./utils/logger');

/**
 * Builds and returns the configured Express application.
 *
 * @param {Object}   deps
 * @param {Object}   deps.client              - Bitwarden SDK client instance.
 * @param {Function} [deps.isReady]           - Returns true when the vault client is ready.
 * @param {Object}   [deps.cache]             - TTL cache instance.
 * @param {Object}   [deps.circuitBreaker]    - Circuit breaker instance.
 * @param {Function} [deps.attemptReauth]     - Re-auth function for token lifecycle.
 * @param {boolean}  [deps.gatewayAuthEnabled] - Whether gateway auth is enforced.
 * @param {string}   [deps.gatewayAuthSecret]  - Shared secret for local auth.
 * @param {number}   [deps.bulkMaxIds]        - Maximum IDs per bulk request.
 * @param {import('pino').Logger} [deps.logger] - Logger instance.
 * @param {string}   [deps.logLevel]          - Log level for auto-created logger.
 * @returns {express.Application}
 */
function buildApp({
  client,
  isReady = () => true,
  cache,
  circuitBreaker,
  attemptReauth,
  gatewayAuthEnabled = false,
  gatewayAuthSecret = '',
  bulkMaxIds,
  logger,
  logLevel = 'info',
}) {
  const app = express();
  const log = logger || createLogger({ level: logLevel });

  // Create metrics
  const { router: metricsRouter, instruments } = createMetricsRouter();

  // Create health router with deep probe dependencies
  const healthRouter = createHealthRouter({
    isReady,
    cache,
    circuitBreaker,
  });

  // Attach request ID and child logger to every request
  app.use(createRequestIdMiddleware({ logger: log }));

  // Request instrumentation middleware (before routes, after requestId)
  app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
      const durationSeconds = (Date.now() - startTime) / 1000;
      const route = req.route ? req.route.path : req.path;

      // Log request completion
      req.log.info({
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - startTime,
      }, 'Request completed');

      // Prometheus instrumentation (skip /metrics to avoid noise)
      if (req.path !== '/metrics') {
        instruments.httpRequestsTotal.inc({
          method: req.method,
          route,
          status_code: res.statusCode,
        });
        instruments.httpRequestDuration.observe(
          { method: req.method, route },
          durationSeconds,
        );
      }

      // Update circuit breaker gauge
      if (circuitBreaker) {
        const cbState = circuitBreaker.getState();
        instruments.circuitBreakerGauge.set(
          instruments.CB_STATE_VALUES[cbState] || 0,
        );
      }
    });
    next();
  });

  // Gateway auth middleware (applied before vault routes, exempt for /health, /metrics)
  app.use(createGatewayAuth({
    enabled: gatewayAuthEnabled,
    sharedSecret: gatewayAuthSecret,
    logger: log,
  }));

  // Routes
  app.use(healthRouter);
  app.use(metricsRouter);
  app.use(createVaultRouter({
    client,
    isReady,
    cache,
    circuitBreaker,
    attemptReauth,
    instruments,
    bulkMaxIds,
    logger: log,
    onUpstreamSuccess: () => healthRouter.recordUpstreamSuccess && healthRouter.recordUpstreamSuccess(),
  }));

  return app;
}

module.exports = { buildApp };
