/**
 * @module utils/errorClassifier
 * @description Maps Bitwarden SDK error messages to appropriate HTTP
 *   status codes. Uses pattern matching (regex) rather than exact string
 *   comparison to be resilient to SDK version changes (Risk R3).
 *
 *   All error responses remain opaque — no stack traces or internal
 *   details are exposed to the client.
 */

'use strict';

/**
 * Error classification rules. Evaluated in order — first match wins.
 * Patterns are case-insensitive.
 *
 * @type {Array<{ pattern: RegExp, statusCode: number, message: string, isAuthError: boolean }>}
 */
const ERROR_RULES = [
  {
    pattern: /not\s*found|no\s*secret|does\s*not\s*exist/i,
    statusCode: 404,
    message: 'Secret not found.',
    isAuthError: false,
  },
  {
    pattern: /unauthorized|token\s*expired|invalid\s*token|access\s*denied|authentication/i,
    statusCode: 502,
    message: 'Upstream vault service unavailable.',
    isAuthError: true,
  },
  {
    pattern: /timeout|timed?\s*out|ETIMEDOUT|ECONNABORTED/i,
    statusCode: 502,
    message: 'Upstream vault service unavailable.',
    isAuthError: false,
  },
  {
    pattern: /ECONNREFUSED|ECONNRESET|EPIPE|network|socket|connect/i,
    statusCode: 502,
    message: 'Upstream vault service unavailable.',
    isAuthError: false,
  },
  {
    pattern: /rate\s*limit|too\s*many\s*requests|429/i,
    statusCode: 502,
    message: 'Upstream vault service unavailable.',
    isAuthError: false,
  },
];

/**
 * Default classification when no rule matches.
 */
const DEFAULT_CLASSIFICATION = {
  statusCode: 500,
  message: 'Failed to retrieve secret from vault.',
  isAuthError: false,
};

/**
 * Classifies a Bitwarden SDK error into an HTTP response.
 *
 * @param {Error} error - The error thrown by the SDK.
 * @returns {{ statusCode: number, message: string, isAuthError: boolean }}
 */
function classifyError(error) {
  const errorText = `${error.message || ''} ${error.code || ''}`;

  for (const rule of ERROR_RULES) {
    if (rule.pattern.test(errorText)) {
      return {
        statusCode: rule.statusCode,
        message: rule.message,
        isAuthError: rule.isAuthError,
      };
    }
  }

  return { ...DEFAULT_CLASSIFICATION };
}

module.exports = { classifyError, ERROR_RULES, DEFAULT_CLASSIFICATION };
