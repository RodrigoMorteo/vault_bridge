/**
 * @module utils/stateFile
 * @description Secure state file lifecycle management. Provides secure
 *   deletion (zero + unlink) of the Bitwarden SDK state file on shutdown,
 *   crash, or stale detection at startup.
 *
 *   Security: Overwrites file content with zeros before deletion to prevent
 *   recovery of session tokens from disk.
 */

'use strict';

const fs = require('fs');

/**
 * Securely deletes a file by overwriting its content with zeros, then
 * removing it from the filesystem.
 *
 * @param {string} filePath - Absolute path to the file to destroy.
 * @param {Object} [options]
 * @param {import('pino').Logger} [options.logger] - Logger instance.
 * @param {Object} [options.fsModule] - Filesystem module (injectable for testing).
 * @returns {boolean} True if the file was successfully destroyed, false if it didn't exist.
 */
function secureDelete(filePath, { logger, fsModule } = {}) {
  const _fs = fsModule || fs;
  const log = logger || console;

  try {
    if (!_fs.existsSync(filePath)) {
      return false;
    }

    const stat = _fs.statSync(filePath);
    const zeros = Buffer.alloc(stat.size, 0);
    _fs.writeFileSync(filePath, zeros);
    _fs.unlinkSync(filePath);

    log.info({ filePath }, 'State file securely deleted.');
    return true;
  } catch (err) {
    log.error({ err, filePath }, 'Failed to securely delete state file.');
    return false;
  }
}

/**
 * Checks for and securely removes a stale state file from a prior
 * unclean shutdown. Should be called before initBitwarden().
 *
 * @param {string} filePath - Path to the state file.
 * @param {Object} [options]
 * @param {import('pino').Logger} [options.logger] - Logger instance.
 * @param {Object} [options.fsModule] - Filesystem module (injectable for testing).
 * @returns {boolean} True if a stale file was found and cleaned.
 */
function cleanStaleStateFile(filePath, { logger, fsModule } = {}) {
  const _fs = fsModule || fs;
  const log = logger || console;

  if (_fs.existsSync(filePath)) {
    log.warn({ filePath }, 'Stale state file detected from prior unclean shutdown. Cleaning...');
    return secureDelete(filePath, { logger: log, fsModule: _fs });
  }

  return false;
}

/**
 * Registers shutdown handlers (SIGTERM, SIGINT, uncaughtException) that
 * securely delete the state file before process exit.
 *
 * @param {string} filePath - Path to the state file.
 * @param {Object} [options]
 * @param {import('pino').Logger} [options.logger] - Logger instance.
 * @returns {Function} The shutdown handler function (for testing).
 */
function registerShutdownCleanup(filePath, { logger } = {}) {
  const log = logger || console;

  const handler = (reason) => {
    log.info({ reason }, 'Performing state file cleanup on shutdown.');
    secureDelete(filePath, { logger: log });
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));
  process.on('uncaughtException', (err) => {
    log.error({ err }, 'Uncaught exception. Attempting state file cleanup.');
    secureDelete(filePath, { logger: log });
  });

  return handler;
}

module.exports = { secureDelete, cleanStaleStateFile, registerShutdownCleanup };
