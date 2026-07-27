/**
 * @module app
 * @description Express application assembly. Creates and configures the
 *   Express app with all route handlers, middleware, and instrumentation.
 *   This is the composition root for the HTTP layer.
 */

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { createHealthRouter } = require('./routes/health');
const { createVaultRouter } = require('./routes/vault');
const { createMetricsRouter } = require('./routes/metrics');
const { createRequestIdMiddleware } = require('./middleware/requestId');
const { createGatewayAuth } = require('./middleware/gatewayAuth');
const { createLogger } = require('./utils/logger');

/**
 * Returns a bounded-cardinality, non-sensitive route label for logs and
 * metrics. Never use a raw vault path because it embeds the secret UUID.
 *
 * @param {express.Request} req
 * @returns {string}
 */
function getRequestRoute(req) {
  if (req.route && typeof req.route.path === 'string') {
    return req.route.path;
  }
  if (/^\/vault\/secret\/[^/]+$/.test(req.path)) {
    return '/vault/secret/:id';
  }
  if (req.path === '/vault/secrets' || req.path === '/health' || req.path === '/metrics') {
    return req.path;
  }
  return '/unmatched';
}

/**
 * Builds and returns the configured Express application.
 *
 * @param {Object}   deps
 * @param {Object}   deps.client              - Bitwarden SDK client instance.
 * @param {Function} [deps.isReady]           - Returns true when the vault client is ready.
 * @param {Object}   [deps.cache]             - TTL cache instance.
 * @param {Object}   [deps.circuitBreaker]    - Circuit breaker instance.
 * @param {Function} [deps.attemptReauth]     - Re-auth function for token lifecycle.
 * @param {string}   [deps.gatewayAuthSecret]  - Shared secret for gateway auth. Non-empty
 *                                               enables enforcement; empty = passthrough.
 * @param {number}   [deps.bulkMaxIds]        - Maximum IDs per bulk request.
 * @param {number}   [deps.rateLimitWindowMs] - Rate limit window in ms.
 * @param {number}   [deps.rateLimitMaxRequests] - Max requests per window.
 * @param {string[]} [deps.trustedProxyCidrs] - Explicit reverse-proxy IPs/CIDRs whose
 *                                              X-Forwarded-For headers may be trusted.
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
  gatewayAuthSecret = '',
  bulkMaxIds,
  rateLimitWindowMs = 900000,
  rateLimitMaxRequests = 100,
  trustedProxyCidrs = [],
  logger,
  logLevel = 'info',
}) {
  const app = express();
  const log = logger || createLogger({ level: logLevel });

  // Never use `true` or a hop count here. Both can allow a directly connected
  // client to forge X-Forwarded-For when there are shorter network paths.
  // With no configured proxy, Express ignores forwarded headers entirely.
  app.set('trust proxy', trustedProxyCidrs.length > 0 ? trustedProxyCidrs : false);

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
      const route = getRequestRoute(req);

      // Log request completion
      req.log.info({
        method: req.method,
        route,
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

  // Gateway auth middleware (applied before vault routes, exempt for /health, /metrics).
  // Auth is enforced solely by GATEWAY_AUTH_SECRET presence — no separate flag needed.
  app.use(createGatewayAuth({
    sharedSecret: gatewayAuthSecret,
    logger: log,
  }));

  // Routes
  app.use(healthRouter);
  app.use(metricsRouter);

  // Rate limiting for vault routes (PBI-20)
  app.use('/vault', rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // The library treats an X-Forwarded-For header with trust proxy disabled
    // as a validation error. We deliberately support that safe default: in
    // this mode request.ip is the socket peer and the untrusted header is
    // ignored. When trustedProxyCidrs is configured Express validates the
    // socket peer before using the forwarded address.
    validate: { xForwardedForHeader: false },
    message: { error: 'Too many requests, please try again later.' },
    handler: (req, res, next, options) => {
      req.log.warn({
        windowMs: options.windowMs,
        max: options.max,
      }, 'Rate limit exceeded');
      res.status(options.statusCode).send(options.message);
    },
  }));

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

  // Convert errors forwarded by middleware (including third-party validation
  // errors) into a logged, opaque response. This keeps request failures from
  // escaping the HTTP stack or exposing implementation details to clients.
  app.use((err, req, res, _next) => {
    const requestLog = req.log || log;
    requestLog.error({ err }, 'Unhandled HTTP middleware error');
    if (res.headersSent) {
      _next(err);
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = { buildApp };
