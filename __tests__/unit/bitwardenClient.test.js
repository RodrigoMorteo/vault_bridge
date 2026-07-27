jest.mock('@bitwarden/sdk-napi', () => ({
  BitwardenClient: jest.fn(),
  DeviceType: { SDK: 'SDK' },
}));

jest.mock('@bitwarden/sdk-napi/binding', () => ({
  LogLevel: { Info: 'Info' },
}));

const { BitwardenClient } = require('@bitwarden/sdk-napi');
const {
  initBitwarden,
  attemptReauth,
  getIsClientReady,
  stopReauthRetries,
  _resetForTesting,
} = require('../../src/services/bitwardenClient');

describe('bitwardenClient lifecycle', () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    _resetForTesting();
  });

  afterEach(() => {
    stopReauthRetries();
    _resetForTesting();
    jest.useRealTimers();
  });

  test('rejects missing credentials instead of exiting the process', async () => {
    await expect(initBitwarden({ stateFile: '/tmp/state', logger }))
      .rejects.toThrow('BWS_ACCESS_TOKEN environment variable is missing');
  });

  test('retries failed re-authentication with bounded backoff and recovers', async () => {
    const loginAccessToken = jest.fn()
      .mockResolvedValueOnce(undefined) // initial authentication
      .mockRejectedValueOnce(new Error('network unavailable')) // first re-auth attempt
      .mockResolvedValueOnce(undefined); // scheduled retry
    BitwardenClient.mockImplementation(() => ({
      auth: () => ({ loginAccessToken }),
    }));

    await initBitwarden({
      accessToken: 'test-token',
      stateFile: '/tmp/state',
      logger,
      reauthRetryMaxAttempts: 2,
      reauthRetryBaseMs: 100,
    });

    await expect(attemptReauth()).resolves.toBe(false);
    expect(getIsClientReady()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, delayMs: 100 }),
      expect.stringContaining('Scheduling'),
    );

    await jest.advanceTimersByTimeAsync(100);
    expect(loginAccessToken).toHaveBeenCalledTimes(3);
    expect(getIsClientReady()).toBe(true);
  });
});
