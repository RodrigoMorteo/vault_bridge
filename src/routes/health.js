/**
 * @module routes/health
 * @description Health check route handler. Returns service availability
 *   status for liveness probes and orchestrator health monitoring.
 */

const express = require('express');

/**
 * Creates the health check router.
 *
 * @param {Object}   deps
 * @param {Function} deps.isReady - Returns true when the vault client is ready.
 * @returns {express.Router}
 */
function createHealthRouter({ isReady }) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    if (isReady()) {
      return res.status(200).json({ status: 'ok' });
    }
    return res.status(503).json({ status: 'unavailable' });
  });

  return router;
}

module.exports = { createHealthRouter };
