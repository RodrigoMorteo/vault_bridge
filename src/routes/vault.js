/**
 * @module routes/vault
 * @description Vault secret retrieval route handler. Proxies requests
 *   to the Bitwarden SDK client with in-memory caching, UUID v4 input
 *   validation, granular error mapping, and token lifecycle management.
 */

const express = require('express');
const { createValidateSecretId } = require('../middleware/validateSecretId');
const { classifyError } = require('../utils/errorClassifier');

/**
 * Creates the vault routes router.
 *
 * @param {Object}   deps
 * @param {Object}   deps.client         - Bitwarden SDK client instance.
 * @param {Function} deps.isReady        - Returns true when the vault client is ready.
 * @param {Object}   [deps.cache]        - TTL cache instance (optional).
 * @param {Function} [deps.attemptReauth] - Re-auth function for token lifecycle (optional).
 * @param {import('pino').Logger} [deps.logger] - Logger instance.
 * @returns {express.Router}
 */
function createVaultRouter({ client, isReady, cache, attemptReauth, logger }) {
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
        return res.status(200).json(cached);
      }
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

      return res.status(200).json(result);
    } catch (error) {
      const classification = classifyError(error);

      log.error({ err: error, secretId }, 'Error retrieving secret.');

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
