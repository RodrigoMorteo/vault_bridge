/**
 * @module routes/health
 * @description Health check route handler. Supports both shallow (liveness)
 *   and deep (readiness) probe modes.
 *
 *   Shallow probe (GET /health): backward-compatible simple status.
 *   Deep probe (GET /health?deep=true): structured dependency health
 *   including Bitwarden session, cache status, and last upstream success.
 */

const express = require('express');

/**
 * Creates the health check router.
 *
 * @param {Object}   deps
 * @param {Function} deps.isReady              - Returns true when the vault client is ready.
 * @param {Object}   [deps.cache]              - Cache instance (for deep probe).
 * @param {Object}   [deps.circuitBreaker]     - Circuit breaker instance (for deep probe).
 * @param {Function} [deps.getLastUpstreamSuccess] - Returns ISO timestamp of last successful upstream call.
 * @returns {express.Router}
 */
function createHealthRouter({ isReady, cache, circuitBreaker, getLastUpstreamSuccess }) {
  const router = express.Router();

  /** Track last upstream success time */
  let lastUpstreamSuccessTime = null;

  /**
   * Updates the last upstream success timestamp.
   * Called externally when a successful upstream call is made.
   */
  function recordUpstreamSuccess() {
    lastUpstreamSuccessTime = new Date().toISOString();
  }

  router.get('/health', (_req, res) => {
    const clientReady = isReady();
    const deep = _req.query.deep === 'true';

    if (!deep) {
      // Shallow probe — backward compatible
      if (clientReady) {
        return res.status(200).json({ status: 'ok' });
      }
      return res.status(503).json({ status: 'unavailable' });
    }

    // Deep probe — structured dependency health
    const cacheEnabled = cache != null;
    const cacheStats = cacheEnabled ? cache.stats() : null;
    const cacheWarm = cacheEnabled && cacheStats.size > 0;

    const cbState = circuitBreaker ? circuitBreaker.getState() : 'unknown';

    const lastSuccess = getLastUpstreamSuccess
      ? getLastUpstreamSuccess()
      : lastUpstreamSuccessTime;

    // Determine overall status
    let status;
    if (clientReady && cbState !== 'open') {
      status = 'ok';
    } else if (!clientReady && cacheWarm) {
      status = 'degraded';
    } else if (cbState === 'open' && cacheWarm) {
      status = 'degraded';
    } else {
      status = 'unavailable';
    }

    const statusCode = status === 'unavailable' ? 503 : 200;

    return res.status(statusCode).json({
      status,
      dependencies: {
        bitwarden_session: clientReady ? 'active' : 'expired',
        cache: cacheEnabled ? 'enabled' : 'disabled',
        cache_size: cacheStats ? cacheStats.size : 0,
        circuit_breaker: cbState,
        last_upstream_success: lastSuccess || null,
      },
    });
  });

  // Expose for external use
  router.recordUpstreamSuccess = recordUpstreamSuccess;

  return router;
}

module.exports = { createHealthRouter };
