const { loadConfig } = require('../../src/config');

describe('config module', () => {
  let mockExit;
  let mockConsoleError;

  beforeEach(() => {
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  test('returns frozen config with all defaults when only BWS_ACCESS_TOKEN is set', () => {
    const config = loadConfig({ BWS_ACCESS_TOKEN: 'test-token-123' });

    expect(config).toEqual({
      bwsAccessToken: 'test-token-123',
      port: 3000,
      bwsStateFile: '/tmp/bws_state.json',
      cacheTtl: 60,
      logLevel: 'info',
      circuitBreakerThreshold: 5,
      circuitBreakerCooldown: 30,
      gatewayAuthEnabled: false,
      gatewayAuthSecret: '',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('uses custom values when all environment variables are set', () => {
    const config = loadConfig({
      BWS_ACCESS_TOKEN: 'custom-token',
      PORT: '8080',
      BWS_STATE_FILE: '/var/run/bws_state.json',
      CACHE_TTL: '120',
      LOG_LEVEL: 'debug',
      CIRCUIT_BREAKER_THRESHOLD: '3',
      CIRCUIT_BREAKER_COOLDOWN: '60',
      GATEWAY_AUTH_ENABLED: 'true',
      GATEWAY_AUTH_SECRET: 'my-secret',
    });

    expect(config).toEqual({
      bwsAccessToken: 'custom-token',
      port: 8080,
      bwsStateFile: '/var/run/bws_state.json',
      cacheTtl: 120,
      logLevel: 'debug',
      circuitBreakerThreshold: 3,
      circuitBreakerCooldown: 60,
      gatewayAuthEnabled: true,
      gatewayAuthSecret: 'my-secret',
    });
  });

  test('exits with code 1 when BWS_ACCESS_TOKEN is missing', () => {
    expect(() => loadConfig({})).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Configuration validation failed')
    );
  });

  test('exits with code 1 when PORT is not a valid number', () => {
    expect(() => loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      PORT: 'not-a-number',
    })).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('PORT must be a valid integer')
    );
  });

  test('exits with code 1 when CACHE_TTL is not a valid number', () => {
    expect(() => loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      CACHE_TTL: 'abc',
    })).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('CACHE_TTL must be a non-negative number')
    );
  });

  test('exits with code 1 when LOG_LEVEL is invalid', () => {
    expect(() => loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      LOG_LEVEL: 'verbose',
    })).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('LOG_LEVEL must be one of')
    );
  });

  test('exits with code 1 when CIRCUIT_BREAKER_THRESHOLD is invalid', () => {
    expect(() => loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      CIRCUIT_BREAKER_THRESHOLD: 'bad',
    })).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('CIRCUIT_BREAKER_THRESHOLD must be a positive integer')
    );
  });

  test('exits with code 1 when CIRCUIT_BREAKER_COOLDOWN is invalid', () => {
    expect(() => loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      CIRCUIT_BREAKER_COOLDOWN: 'bad',
    })).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('CIRCUIT_BREAKER_COOLDOWN must be a non-negative number')
    );
  });

  test('reports multiple errors at once', () => {
    expect(() => loadConfig({
      PORT: 'bad',
      CACHE_TTL: 'bad',
    })).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);
    // Should report: missing token, bad port, bad cache ttl
    expect(mockConsoleError).toHaveBeenCalledTimes(4); // 1 header + 3 errors
  });

  test('normalizes LOG_LEVEL to lowercase', () => {
    const config = loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      LOG_LEVEL: 'WARN',
    });
    expect(config.logLevel).toBe('warn');
  });

  test('accepts CACHE_TTL of 0', () => {
    const config = loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      CACHE_TTL: '0',
    });
    expect(config.cacheTtl).toBe(0);
  });

  test('GATEWAY_AUTH_ENABLED defaults to false', () => {
    const config = loadConfig({ BWS_ACCESS_TOKEN: 'token' });
    expect(config.gatewayAuthEnabled).toBe(false);
  });

  test('GATEWAY_AUTH_ENABLED parses "true" correctly', () => {
    const config = loadConfig({
      BWS_ACCESS_TOKEN: 'token',
      GATEWAY_AUTH_ENABLED: 'true',
    });
    expect(config.gatewayAuthEnabled).toBe(true);
  });
});
