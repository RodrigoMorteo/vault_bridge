/**
 * @module middleware/gatewayAuth
 * @description Express middleware for Zero-Trust gateway integration.
 *   When enabled (GATEWAY_AUTH_ENABLED=true), validates the Authorization
 *   header on /vault/* routes. When disabled, validates against a
 *   configurable fixed shared secret (GATEWAY_AUTH_SECRET).
 *
 *   Operational endpoints (/health, /metrics) are exempt from gateway auth.
 *
 *   Implements ADR-003 (Zero-Trust via APISix Integration).
 */

'use strict';

/**
 * Creates gateway auth middleware.
 *
 * @param {Object}  options
 * @param {boolean} options.enabled          - Whether gateway auth is enforced.
 * @param {string}  [options.sharedSecret]   - Shared secret for local dev auth.
 * @param {import('pino').Logger} [options.logger] - Logger instance.
 * @returns {Function} Express middleware function.
 */
function createGatewayAuth({ enabled, sharedSecret = '', logger }) {
  const log = logger || console;

  return (req, res, next) => {
    // Skip auth for operational endpoints
    if (req.path === '/health' || req.path === '/metrics') {
      return next();
    }

    // Skip auth when disabled (local development)
    if (!enabled) {
      // If a shared secret is configured, validate it
      if (sharedSecret) {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${sharedSecret}`) {
          (req.log || log).warn({ path: req.path }, 'Gateway auth: invalid shared secret.');
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      return next();
    }

    // Gateway auth enabled — validate Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      (req.log || log).warn({ path: req.path }, 'Gateway auth: missing Authorization header.');
      return res.status(403).json({ error: 'Forbidden' });
    }

    // When gateway is enabled, we trust the header from APISix
    // (JWT verification would be added here in PBI-07b)
    if (!authHeader.startsWith('Bearer ')) {
      (req.log || log).warn({ path: req.path }, 'Gateway auth: invalid Authorization format.');
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Header present and formatted correctly — allow through
    next();
  };
}

module.exports = { createGatewayAuth };
