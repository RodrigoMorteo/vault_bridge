const { loadRetentionPolicy, calculateCutoff, getRetentionMetadata, DEFAULT_RETENTION_DAYS } = require('../../src/utils/logRetention');

describe('logRetention module', () => {
  test('defaults to 90 days retention', () => {
    const policy = loadRetentionPolicy({});
    expect(policy.retentionDays).toBe(90);
    expect(policy.retentionCutoff).toBeDefined();
  });

  test('uses LOG_RETENTION_DAYS from env', () => {
    const policy = loadRetentionPolicy({ LOG_RETENTION_DAYS: '30' });
    expect(policy.retentionDays).toBe(30);
  });

  test('returns frozen object', () => {
    const policy = loadRetentionPolicy({});
    expect(Object.isFrozen(policy)).toBe(true);
  });

  test('falls back to default on invalid LOG_RETENTION_DAYS', () => {
    const policy = loadRetentionPolicy({ LOG_RETENTION_DAYS: 'invalid' });
    expect(policy.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
  });

  test('falls back to default on zero LOG_RETENTION_DAYS', () => {
    const policy = loadRetentionPolicy({ LOG_RETENTION_DAYS: '0' });
    expect(policy.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
  });

  test('calculateCutoff returns ISO string in the past', () => {
    const cutoff = calculateCutoff(30);
    const cutoffDate = new Date(cutoff);
    expect(cutoffDate.getTime()).toBeLessThan(Date.now());
  });

  test('getRetentionMetadata returns same as loadRetentionPolicy', () => {
    const meta = getRetentionMetadata({ LOG_RETENTION_DAYS: '60' });
    expect(meta.retentionDays).toBe(60);
    expect(meta.retentionCutoff).toBeDefined();
  });

  test('DEFAULT_RETENTION_DAYS is exported as 90', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
  });
});
