/**
 * @module utils/logger
 * @description Structured JSON logger with automatic redaction of sensitive
 *   fields. Built on Pino for minimal overhead in high-throughput services.
 *
 *   Redacted fields: key, value, BWS_ACCESS_TOKEN, authorization, token,
 *   and any nested occurrence (*.key, *.value, *.token).
 *
 *   Usage:
 *     const { createLogger } = require('./utils/logger');
 *     const logger = createLogger();
 *     logger.info({ requestId: '...' }, 'Request received');
 */

'use strict';

const pino = require('pino');

/**
 * Redaction paths for Pino. These patterns ensure sensitive data is
 * replaced with '[REDACTED]' in all log output, including nested objects.
 */
const REDACT_PATHS = [
  'key',
  'value',
  'BWS_ACCESS_TOKEN',
  'authorization',
  'token',
  'accessToken',
  '*.key',
  '*.value',
  '*.token',
  '*.authorization',
  '*.accessToken',
  '*.BWS_ACCESS_TOKEN',
];

/**
 * Creates a configured Pino logger instance.
 *
 * @param {Object}  [options]
 * @param {string}  [options.level='info']  - Log level (trace|debug|info|warn|error|fatal).
 * @param {Object}  [options.destination]   - Pino destination stream (for testing).
 * @returns {import('pino').Logger}
 */
function createLogger({ level = 'info', destination } = {}) {
  const config = {
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (destination) {
    return pino(config, destination);
  }

  return pino(config);
}

module.exports = { createLogger, REDACT_PATHS };
