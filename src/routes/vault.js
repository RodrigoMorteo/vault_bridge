/**
 * @module routes/vault
 * @description Vault secret retrieval route handlers. Proxies requests
 *   to the Bitwarden SDK client with in-memory caching, UUID v4 input
 *   validation, granular error mapping, circuit breaker protection,
 *   and token lifecycle management.
 *
 *   Endpoints:
 *   - GET  /vault/secret/:id  — single secret retrieval
 *   - POST /vault/secrets     — bulk secret retrieval (PBI-15)
 */

const express = require('express');
const { createValidateSecretId } = require('../middleware/validateSecretId');
const { classifyError } = require('../utils/errorClassifier');
const { UUID_V4_REGEX } = require('../middleware/validateSecretId');

const MAX_BULK_IDS = 50;

/**
 * Creates the vault routes router.
 *
 * @param {Object}   deps
 * @param {Object}   deps.client            - Bitwarden SDK client instance.
 * @param {Function} deps.isReady           - Returns true when the vault client is ready.
 * @param {Object}   [deps.cache]           - TTL cache instance (optional).
 * @param {Object}   [deps.circuitBreaker]  - Circuit breaker instance (optional).
 * @param {Function} [deps.attemptReauth]   - Re-auth function for token lifecycle (optional).
 * @param {Object}   [deps.instruments]     - Prometheus instruments (optional).
 * @param {Function} [deps.onUpstreamSuccess] - Callback on successful upstream call (optional).
 * @param {import('pino').Logger} [deps.logger] - Logger instance.
 * @returns {express.Router}
 */
function createVaultRouter({ client, isReady, cache, circuitBreaker, attemptReauth, instruments, onUpstreamSuccess, logger }) {
  const router = express.Router();
  const validateSecretId = createValidateSecretId();

  // Parse JSON body for POST routes
  router.use(express.json());

  // --- Single secret retrieval ---
  router.get('/vault/secret/:id', validateSecretId, async (req, res) => {
    const log = req.log || logger || console;

    if (!isReady()) {
      return res.status(503).json({ error: 'Vault client not ready.' });
    }

    const secretId = req.params.id;

    // Check cache first
    if (cache) {
      const cached = cache.get(secretId);
      if (cached !== undefined) {
        log.debug({ secretId, cacheHit: true }, 'Serving secret from cache.');
        if (instruments) instruments.cacheHitsTotal.inc();
        return res.status(200).json(cached);
      }
      if (instruments) instruments.cacheMissesTotal.inc();
    }

    // Circuit breaker check
    if (circuitBreaker && !circuitBreaker.allowRequest()) {
      log.warn({ secretId }, 'Circuit breaker is open. Checking stale cache...');
      if (cache) {
        const stale = cache.get(secretId);
        if (stale !== undefined) {
          res.set('X-Degraded-Mode', 'true');
          return res.status(200).json(stale);
        }
      }
      return res.status(503).json({ error: 'Upstream service temporarily unavailable.' });
    }

    try {
      const secretResponse = await client.secrets().get(secretId);
      const result = {
        id: secretResponse.id,
        key: secretResponse.key,
        value: secretResponse.value,
      };

      if (cache) cache.set(secretId, result);
      if (circuitBreaker) circuitBreaker.recordSuccess();
      if (onUpstreamSuccess) onUpstreamSuccess();

      return res.status(200).json(result);
    } catch (error) {
      const classification = classifyError(error);
      log.error({ err: error, secretId }, 'Error retrieving secret.');
      if (circuitBreaker) circuitBreaker.recordFailure();
      if (classification.isAuthError && attemptReauth) {
        attemptReauth().catch(() => {});
      }
      return res.status(classification.statusCode).json({ error: classification.message });
    }
  });

  // --- Bulk secret retrieval (PBI-15) ---
  router.post('/vault/secrets', async (req, res) => {
    const log = req.log || logger || console;

    if (!isReady()) {
      return res.status(503).json({ error: 'Vault client not ready.' });
    }

    const { ids } = req.body || {};

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Request body must contain a non-empty "ids" array.' });
    }

    if (ids.length > MAX_BULK_IDS) {
      return res.status(400).json({ error: `Maximum ${MAX_BULK_IDS} IDs per request.` });
    }

    // Validate each ID is UUID v4
    const invalidIds = ids.filter((id) => !UUID_V4_REGEX.test(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        error: 'Invalid secret ID format. Expected UUID v4.',
        invalidIds,
      });
    }

    const results = [];
    const errors = [];

    for (const secretId of ids) {
      // Check cache first
      if (cache) {
        const cached = cache.get(secretId);
        if (cached !== undefined) {
          if (instruments) instruments.cacheHitsTotal.inc();
          results.push(cached);
          continue;
        }
        if (instruments) instruments.cacheMissesTotal.inc();
      }

      // Circuit breaker check
      if (circuitBreaker && !circuitBreaker.allowRequest()) {
        errors.push({ id: secretId, status: 503, error: 'Upstream service temporarily unavailable.' });
        continue;
      }

      try {
        const secretResponse = await client.secrets().get(secretId);
        const result = {
          id: secretResponse.id,
          key: secretResponse.key,
          value: secretResponse.value,
        };

        if (cache) cache.set(secretId, result);
        if (circuitBreaker) circuitBreaker.recordSuccess();
        if (onUpstreamSuccess) onUpstreamSuccess();
        results.push(result);
      } catch (error) {
        const classification = classifyError(error);
        log.error({ err: error, secretId }, 'Error retrieving secret in bulk request.');
        if (circuitBreaker) circuitBreaker.recordFailure();
        if (classification.isAuthError && attemptReauth) {
          attemptReauth().catch(() => {});
        }
        errors.push({ id: secretId, status: classification.statusCode, error: classification.message });
      }
    }

    return res.status(200).json({ secrets: results, errors });
  });

  return router;
}

module.exports = { createVaultRouter, MAX_BULK_IDS };
