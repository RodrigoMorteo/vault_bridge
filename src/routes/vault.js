/**
 * @module routes/vault
 * @description Vault secret retrieval route handler. Proxies requests
 *   to the Bitwarden SDK client with in-memory caching, UUID v4 input
 *   validation, granular error mapping, circuit breaker protection,
 *   and token lifecycle management.
 */

const express = require('express');
const { createValidateSecretId } = require('../middleware/validateSecretId');
const { classifyError } = require('../utils/errorClassifier');

/**
 * Creates the vault routes router.
 *
 * @param {Object}   deps
 * @param {Object}   deps.client          - Bitwarden SDK client instance.
 * @param {Function} deps.isReady         - Returns true when the vault client is ready.
 * @param {Object}   [deps.cache]         - TTL cache instance (optional).
 * @param {Object}   [deps.circuitBreaker] - Circuit breaker instance (optional).
 * @param {Function} [deps.attemptReauth] - Re-auth function for token lifecycle (optional).
 * @param {Object}   [deps.instruments]   - Prometheus instruments (optional).
 * @param {import('pino').Logger} [deps.logger] - Logger instance.
 * @returns {express.Router}
 */
function createVaultRouter({ client, isReady, cache, circuitBreaker, attemptReauth, instruments, logger }) {
  const router = express.Router();
  const validateSecretId = createValidateSecretId();

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

      // Attempt stale serve from cache (cache may still have the entry even if expired in stats)
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

      // Populate cache
      if (cache) {
        cache.set(secretId, result);
      }

      // Record success for circuit breaker
      if (circuitBreaker) {
        circuitBreaker.recordSuccess();
      }

      return res.status(200).json(result);
    } catch (error) {
      const classification = classifyError(error);

      log.error({ err: error, secretId }, 'Error retrieving secret.');

      // Record failure for circuit breaker
      if (circuitBreaker) {
        circuitBreaker.recordFailure();
      }

      // Trigger re-auth if this is an auth error
      if (classification.isAuthError && attemptReauth) {
        attemptReauth().catch(() => {}); // fire-and-forget
      }

      return res.status(classification.statusCode).json({
        error: classification.message,
      });
    }
  });

  return router;
}

module.exports = { createVaultRouter };
