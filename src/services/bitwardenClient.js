/**
 * @module services/bitwardenClient
 * @description Bitwarden SDK client wrapper. Handles authentication,
 *   exposes the initialized client for secret retrieval operations,
 *   and provides proactive token lifecycle management (re-authentication
 *   on expiry).
 *
 *   Dependency: @bitwarden/sdk-napi (native N-API binding).
 */

const { BitwardenClient, DeviceType } = require('@bitwarden/sdk-napi');
const { LogLevel } = require('@bitwarden/sdk-napi/binding');

/** @type {BitwardenClient|null} */
let client = null;

/** @type {boolean} */
let isClientReady = false;

/** @type {boolean} - Mutex flag to prevent concurrent re-auth attempts. */
let isReauthenticating = false;

/** @type {{ accessToken: string, stateFile: string, logger: any }|null} */
let authConfig = null;

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

  // Store config for re-authentication
  authConfig = { accessToken, stateFile, logger: log };

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
 * Attempts re-authentication after detecting an expired or invalid token.
 * Uses a mutex flag to prevent concurrent re-auth attempts.
 *
 * @returns {Promise<boolean>} True if re-auth succeeded, false otherwise.
 */
async function attemptReauth() {
  if (!authConfig) return false;
  if (isReauthenticating) return false;

  const log = authConfig.logger || console;

  isReauthenticating = true;
  isClientReady = false;

  try {
    log.warn('Token expired or invalid. Attempting re-authentication...');

    const bwClient = new BitwardenClient(
      {
        apiUrl: 'https://api.bitwarden.com',
        identityUrl: 'https://identity.bitwarden.com',
        deviceType: DeviceType.SDK,
      },
      LogLevel.Info,
    );

    await bwClient.auth().loginAccessToken(authConfig.accessToken, authConfig.stateFile);
    client = bwClient;
    isClientReady = true;
    isReauthenticating = false;
    log.info('Re-authentication successful.');
    return true;
  } catch (err) {
    log.error({ err }, 'Re-authentication failed. Service degraded.');
    isClientReady = false;
    isReauthenticating = false;
    return false;
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

/**
 * Returns whether a re-authentication is currently in progress.
 * @returns {boolean}
 */
function getIsReauthenticating() {
  return isReauthenticating;
}

/**
 * Resets internal state. For testing only.
 * @private
 */
function _resetForTesting() {
  client = null;
  isClientReady = false;
  isReauthenticating = false;
  authConfig = null;
}

module.exports = {
  initBitwarden,
  attemptReauth,
  getClient,
  getIsClientReady,
  getIsReauthenticating,
  _resetForTesting,
};
