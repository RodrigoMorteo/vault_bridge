/**
 * @module middleware/validateSecretId
 * @description Express middleware that validates the `:id` route parameter
 *   against UUID v4 format. Rejects malformed requests with HTTP 400 before
 *   they reach the Bitwarden SDK, preventing injection attacks and unnecessary
 *   upstream API calls.
 */

'use strict';

/**
 * UUID v4 regex pattern. Matches the canonical 8-4-4-4-12 format with
 * version nibble = 4 and variant nibble = [89ab].
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Creates UUID v4 validation middleware for the `:id` parameter.
 *
 * @returns {Function} Express middleware function.
 */
function createValidateSecretId() {
  return (req, res, next) => {
    const id = req.params.id;

    if (!id || !UUID_V4_REGEX.test(id)) {
      return res.status(400).json({
        error: 'Invalid secret ID format. Expected UUID v4.',
      });
    }

    next();
  };
}

module.exports = { createValidateSecretId, UUID_V4_REGEX };
