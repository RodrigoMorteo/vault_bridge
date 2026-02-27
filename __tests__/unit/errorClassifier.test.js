const { classifyError, ERROR_RULES, DEFAULT_CLASSIFICATION } = require('../../src/utils/errorClassifier');

describe('errorClassifier module', () => {
  test('classifies "not found" error as 404', () => {
    const result = classifyError(new Error('Secret not found'));
    expect(result.statusCode).toBe(404);
    expect(result.message).toBe('Secret not found.');
    expect(result.isAuthError).toBe(false);
  });

  test('classifies "does not exist" error as 404', () => {
    const result = classifyError(new Error('The requested resource does not exist'));
    expect(result.statusCode).toBe(404);
    expect(result.message).toBe('Secret not found.');
  });

  test('classifies "unauthorized" error as 502 with isAuthError=true', () => {
    const result = classifyError(new Error('Unauthorized'));
    expect(result.statusCode).toBe(502);
    expect(result.message).toBe('Upstream vault service unavailable.');
    expect(result.isAuthError).toBe(true);
  });

  test('classifies "token expired" error as 502 with isAuthError=true', () => {
    const result = classifyError(new Error('Token expired'));
    expect(result.statusCode).toBe(502);
    expect(result.isAuthError).toBe(true);
  });

  test('classifies "invalid token" error as 502 with isAuthError=true', () => {
    const result = classifyError(new Error('Invalid token provided'));
    expect(result.statusCode).toBe(502);
    expect(result.isAuthError).toBe(true);
  });

  test('classifies "access denied" error as 502 with isAuthError=true', () => {
    const result = classifyError(new Error('Access denied'));
    expect(result.statusCode).toBe(502);
    expect(result.isAuthError).toBe(true);
  });

  test('classifies timeout error as 502', () => {
    const result = classifyError(new Error('Request timed out'));
    expect(result.statusCode).toBe(502);
    expect(result.message).toBe('Upstream vault service unavailable.');
    expect(result.isAuthError).toBe(false);
  });

  test('classifies ETIMEDOUT error code as 502', () => {
    const err = new Error('connect');
    err.code = 'ETIMEDOUT';
    const result = classifyError(err);
    expect(result.statusCode).toBe(502);
  });

  test('classifies ECONNREFUSED error as 502', () => {
    const err = new Error('connect');
    err.code = 'ECONNREFUSED';
    const result = classifyError(err);
    expect(result.statusCode).toBe(502);
    expect(result.isAuthError).toBe(false);
  });

  test('classifies ECONNRESET error as 502', () => {
    const err = new Error('socket hang up');
    err.code = 'ECONNRESET';
    const result = classifyError(err);
    expect(result.statusCode).toBe(502);
  });

  test('classifies rate limit error as 502', () => {
    const result = classifyError(new Error('Too many requests'));
    expect(result.statusCode).toBe(502);
    expect(result.isAuthError).toBe(false);
  });

  test('classifies network error as 502', () => {
    const result = classifyError(new Error('network error'));
    expect(result.statusCode).toBe(502);
  });

  test('defaults to 500 for unknown errors', () => {
    const result = classifyError(new Error('Something completely unexpected'));
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('Failed to retrieve secret from vault.');
    expect(result.isAuthError).toBe(false);
  });

  test('handles error with empty message', () => {
    const result = classifyError(new Error(''));
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('Failed to retrieve secret from vault.');
  });

  test('exports ERROR_RULES array', () => {
    expect(Array.isArray(ERROR_RULES)).toBe(true);
    expect(ERROR_RULES.length).toBeGreaterThan(0);
  });

  test('exports DEFAULT_CLASSIFICATION', () => {
    expect(DEFAULT_CLASSIFICATION).toHaveProperty('statusCode', 500);
    expect(DEFAULT_CLASSIFICATION).toHaveProperty('message');
    expect(DEFAULT_CLASSIFICATION).toHaveProperty('isAuthError', false);
  });
});
