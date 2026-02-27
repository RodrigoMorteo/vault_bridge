/**
 * @module services/bitwardenClient
 * @description Bitwarden SDK client wrapper. Handles authentication and
 *   exposes the initialized client for secret retrieval operations.
 *   Dependency: @bitwarden/sdk-napi (native N-API binding).
 */

const { BitwardenClient, DeviceType } = require('@bitwarden/sdk-napi');
const { LogLevel } = require('@bitwarden/sdk-napi/binding');

/** @type {BitwardenClient|null} */
let client = null;

/** @type {boolean} */
let isClientReady = false;

/**
 * Authenticates with Bitwarden Secrets Manager using a machine-account
 * access token. On success, stores the client reference internally.
 *
 * @param {Object}  options
 * @param {string}  options.accessToken  - BWS machine-account access token.
 * @param {string}  options.stateFile    - Path to the SDK state file.
 * @param {import('pino').Logger} [options.logger] - Logger instance.
 * @returns {Promise<BitwardenClient>} The authenticated client instance.
 * @throws {Error} If authentication fails.
 */
async function initBitwarden({ accessToken, stateFile, logger }) {
  const log = logger || console;

  if (!accessToken) {
    log.error('FATAL: BWS_ACCESS_TOKEN environment variable is missing.');
    process.exit(1);
  }

  try {
    const bwClient = new BitwardenClient(
      {
        apiUrl: 'https://api.bitwarden.com',
        identityUrl: 'https://identity.bitwarden.com',
        deviceType: DeviceType.SDK,
      },
      LogLevel.Info,
    );

    await bwClient.auth().loginAccessToken(accessToken, stateFile);
    client = bwClient;
    isClientReady = true;
    log.info('Bitwarden Machine Account Authenticated Successfully.');
    return bwClient;
  } catch (err) {
    log.error({ err }, 'Failed to authenticate with Bitwarden.');
    process.exit(1);
  }
}

/**
 * Returns the current Bitwarden client instance.
 * @returns {BitwardenClient|null}
 */
function getClient() {
  return client;
}

/**
 * Returns whether the Bitwarden client is authenticated and ready.
 * @returns {boolean}
 */
function getIsClientReady() {
  return isClientReady;
}

module.exports = {
  initBitwarden,
  getClient,
  getIsClientReady,
};
