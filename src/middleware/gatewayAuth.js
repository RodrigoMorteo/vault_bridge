/**
 * @module middleware/gatewayAuth
 * @description Express middleware for Zero-Trust gateway integration.
 *   Auth enforcement is driven solely by the presence of GATEWAY_AUTH_SECRET:
 *   - If GATEWAY_AUTH_SECRET is set, every /vault/* request must supply a
 *     matching "Authorization: Bearer <secret>" header.
 *   - If GATEWAY_AUTH_SECRET is absent, the middleware is fully transparent
 *     (no auth required — suitable for deployments that rely entirely on an
 *     upstream APISix key_auth plugin or run in a trusted network).
 *
 *   Operational endpoints (/health, /metrics) are always exempt.
 *
 *   Implements ADR-003 (Zero-Trust via APISix Integration).
 */

'use strict';

const crypto = require('crypto');

/**
 * Compares two bearer-token values without leaking matching-prefix timing.
 *
 * @param {string} provided
 * @param {string} expected
 * @returns {boolean}
 */
function secureTokenEquals(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Creates gateway auth middleware.
 *
 * Auth is enforced when and only when `sharedSecret` is a non-empty string.
 * The deprecated `enabled` flag has been removed to eliminate the ambiguous
 * four-state truth table (enabled × sharedSecret) that caused pass-through
 * failures when GATEWAY_AUTH_ENABLED was unset.
 *
 * @param {Object}  options
 * @param {string}  [options.sharedSecret]   - Shared secret. When present,
 *   every non-operational request must carry "Bearer <sharedSecret>".
 * @param {import('pino').Logger} [options.logger] - Logger instance.
 * @returns {Function} Express middleware function.
 */
function createGatewayAuth({ sharedSecret = '', logger }) {
  const log = logger || console;

  return (req, res, next) => {
    // Operational endpoints are always exempt from auth checks.
    if (req.path === '/health' || req.path === '/metrics') {
      return next();
    }

    // No secret configured — middleware is transparent (passthrough).
    // This is the correct default when running behind a fully-trusted APISix
    // gateway that handles auth upstream, or in local development without auth.
    if (!sharedSecret) {
      return next();
    }

    // Secret configured — enforce Bearer token match (fail-closed).
    const authHeader = req.headers.authorization;
    const bearerPrefix = 'Bearer ';
    const providedToken = typeof authHeader === 'string' && authHeader.startsWith(bearerPrefix)
      ? authHeader.slice(bearerPrefix.length)
      : '';
    if (!secureTokenEquals(providedToken, sharedSecret)) {
      (req.log || log).warn('Gateway auth: missing or invalid Authorization header.');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Token matches — allow through.
    next();
  };
}

module.exports = { createGatewayAuth, secureTokenEquals };
