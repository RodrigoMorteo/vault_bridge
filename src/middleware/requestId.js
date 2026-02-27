/**
 * @module middleware/requestId
 * @description Express middleware that generates a unique request ID for
 *   each incoming request using crypto.randomUUID(). The ID is attached
 *   to `req.id` and a child logger instance is attached to `req.log`
 *   for request-scoped structured logging.
 */

'use strict';

const crypto = require('crypto');

/**
 * Creates request ID middleware.
 *
 * @param {Object}  deps
 * @param {import('pino').Logger} deps.logger - Parent logger instance.
 * @returns {Function} Express middleware function.
 */
function createRequestIdMiddleware({ logger }) {
  return (req, _res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    req.log = logger.child({ requestId: req.id });
    next();
  };
}

module.exports = { createRequestIdMiddleware };
