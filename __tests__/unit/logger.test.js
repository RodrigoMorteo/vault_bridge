const { createLogger, REDACT_PATHS } = require('../../src/utils/logger');
const { PassThrough } = require('stream');

/**
 * Helper: creates a logger writing to an in-memory stream and returns
 * a function to read back the logged JSON lines.
 */
function createTestLogger(level = 'trace') {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));

  const logger = createLogger({ level, destination: stream });

  const getLines = () =>
    chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

  return { logger, getLines };
}

describe('logger module', () => {
  test('creates a logger that outputs valid JSON', () => {
    const { logger, getLines } = createTestLogger();

    logger.info('test message');
    const lines = getLines();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty('msg', 'test message');
    expect(lines[0]).toHaveProperty('level', 30); // pino info = 30
    expect(lines[0]).toHaveProperty('time');
  });

  test('includes ISO timestamp', () => {
    const { logger, getLines } = createTestLogger();

    logger.info('timestamp test');
    const lines = getLines();

    // isoTime produces ISO 8601 format
    expect(lines[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('respects log level — suppresses info when level is warn', () => {
    const { logger, getLines } = createTestLogger('warn');

    logger.info('should not appear');
    logger.warn('should appear');
    const lines = getLines();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty('msg', 'should appear');
  });

  test('redacts top-level "key" field', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({ key: 'my-secret-key' }, 'secret access');
    const lines = getLines();

    expect(lines[0].key).toBe('[REDACTED]');
  });

  test('redacts top-level "value" field', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({ value: 'super-secret-value' }, 'secret access');
    const lines = getLines();

    expect(lines[0].value).toBe('[REDACTED]');
  });

  test('redacts top-level "token" field', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({ token: 'bearer-abc123' }, 'auth event');
    const lines = getLines();

    expect(lines[0].token).toBe('[REDACTED]');
  });

  test('redacts top-level "authorization" field', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({ authorization: 'Bearer xyz' }, 'header logged');
    const lines = getLines();

    expect(lines[0].authorization).toBe('[REDACTED]');
  });

  test('redacts top-level "BWS_ACCESS_TOKEN" field', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({ BWS_ACCESS_TOKEN: 'token-value' }, 'config logged');
    const lines = getLines();

    expect(lines[0].BWS_ACCESS_TOKEN).toBe('[REDACTED]');
  });

  test('redacts top-level "accessToken" field', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({ accessToken: 'my-access-token' }, 'token logged');
    const lines = getLines();

    expect(lines[0].accessToken).toBe('[REDACTED]');
  });

  test('redacts nested "key" and "value" fields inside objects', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({
      secret: { key: 'nested-key', value: 'nested-value' },
    }, 'nested secret');
    const lines = getLines();

    expect(lines[0].secret.key).toBe('[REDACTED]');
    expect(lines[0].secret.value).toBe('[REDACTED]');
  });

  test('redacts nested "token" field inside objects', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({
      auth: { token: 'nested-token' },
    }, 'nested auth');
    const lines = getLines();

    expect(lines[0].auth.token).toBe('[REDACTED]');
  });

  test('does not redact non-sensitive fields', () => {
    const { logger, getLines } = createTestLogger();

    logger.info({ method: 'GET', path: '/health', statusCode: 200 }, 'request');
    const lines = getLines();

    expect(lines[0].method).toBe('GET');
    expect(lines[0].path).toBe('/health');
    expect(lines[0].statusCode).toBe(200);
  });

  test('child logger inherits redaction config', () => {
    const { logger, getLines } = createTestLogger();

    const child = logger.child({ requestId: 'req-123' });
    child.info({ key: 'secret-key' }, 'child log');
    const lines = getLines();

    expect(lines[0].requestId).toBe('req-123');
    expect(lines[0].key).toBe('[REDACTED]');
  });

  test('REDACT_PATHS is exported and contains expected paths', () => {
    expect(REDACT_PATHS).toContain('key');
    expect(REDACT_PATHS).toContain('value');
    expect(REDACT_PATHS).toContain('BWS_ACCESS_TOKEN');
    expect(REDACT_PATHS).toContain('authorization');
    expect(REDACT_PATHS).toContain('token');
    expect(REDACT_PATHS).toContain('*.key');
    expect(REDACT_PATHS).toContain('*.value');
  });
});
