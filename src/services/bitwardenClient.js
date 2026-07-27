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

/** @type {NodeJS.Timeout|null} */
let reauthTimer = null;

const MAX_REAUTH_RETRY_DELAY_MS = 30000;

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
async function initBitwarden({
  accessToken,
  stateFile,
  logger,
  reauthRetryMaxAttempts = 5,
  reauthRetryBaseMs = 1000,
}) {
  const log = logger || console;

  if (!accessToken) {
    throw new Error('BWS_ACCESS_TOKEN environment variable is missing.');
  }

  // Store config for re-authentication
  authConfig = {
    accessToken,
    stateFile,
    logger: log,
    reauthRetryMaxAttempts,
    reauthRetryBaseMs,
    reauthRetryAttempts: 0,
  };

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
    isClientReady = false;
    throw err;
  }
}

/** Schedules the next bounded exponential re-authentication retry. */
function scheduleReauthRetry() {
  if (!authConfig || reauthTimer) return;

  if (authConfig.reauthRetryAttempts >= authConfig.reauthRetryMaxAttempts) {
    authConfig.logger.error({
      attempts: authConfig.reauthRetryAttempts,
    }, 'Re-authentication retry limit reached. Awaiting operator action or process restart.');
    return;
  }

  const delayMs = Math.min(
    authConfig.reauthRetryBaseMs * (2 ** authConfig.reauthRetryAttempts),
    MAX_REAUTH_RETRY_DELAY_MS,
  );
  authConfig.reauthRetryAttempts++;
  authConfig.logger.warn({
    attempt: authConfig.reauthRetryAttempts,
    delayMs,
  }, 'Scheduling Bitwarden re-authentication retry.');
  reauthTimer = setTimeout(() => {
    reauthTimer = null;
    attemptReauth();
  }, delayMs);
  if (typeof reauthTimer.unref === 'function') {
    reauthTimer.unref();
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
    authConfig.reauthRetryAttempts = 0;
    isReauthenticating = false;
    log.info('Re-authentication successful.');
    return true;
  } catch (err) {
    log.error({ err }, 'Re-authentication failed. Service degraded.');
    isClientReady = false;
    isReauthenticating = false;
    scheduleReauthRetry();
    return false;
  }
}

/** Cancels scheduled background retry work during service shutdown. */
function stopReauthRetries() {
  if (reauthTimer) {
    clearTimeout(reauthTimer);
    reauthTimer = null;
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
  stopReauthRetries();
  client = null;
  isClientReady = false;
  isReauthenticating = false;
  authConfig = null;
}

module.exports = {
  initBitwarden,
  attemptReauth,
  stopReauthRetries,
  getClient,
  getIsClientReady,
  getIsReauthenticating,
  _resetForTesting,
};
