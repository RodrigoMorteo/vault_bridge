/**
 * @module routes/vault
 * @description Vault secret retrieval route handler. Proxies requests
 *   to the Bitwarden SDK client and returns decrypted secret payloads.
 */

const express = require('express');

/**
 * Creates the vault routes router.
 *
 * @param {Object}   deps
 * @param {Object}   deps.client  - Bitwarden SDK client instance.
 * @param {Function} deps.isReady - Returns true when the vault client is ready.
 * @param {import('pino').Logger} [deps.logger] - Logger instance (optional, falls back to req.log or console).
 * @returns {express.Router}
 */
function createVaultRouter({ client, isReady, logger }) {
  const router = express.Router();

  router.get('/vault/secret/:id', async (req, res) => {
    const log = req.log || logger || console;

    if (!isReady()) {
      return res.status(503).json({ error: 'Vault client not ready' });
    }

    try {
      const secretId = req.params.id;
      const secretResponse = await client.secrets().get(secretId);

      return res.status(200).json({
        id: secretResponse.id,
        key: secretResponse.key,
        value: secretResponse.value,
      });
    } catch (error) {
      log.error({ err: error, secretId: req.params.id }, 'Error retrieving secret.');
      return res.status(500).json({ error: 'Failed to retrieve secret from vault.' });
    }
  });

  return router;
}

module.exports = { createVaultRouter };
