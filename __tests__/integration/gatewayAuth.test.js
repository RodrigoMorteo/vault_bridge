const { createGatewayAuth } = require('../../src/middleware/gatewayAuth');

describe('gatewayAuth middleware', () => {
  let mockRes;
  let mockNext;
  const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  // --- When disabled, no secret ---
  test('allows all requests when disabled and no shared secret', () => {
    const mw = createGatewayAuth({ enabled: false, logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: {} };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  // --- When disabled, with shared secret ---
  test('allows request when disabled, shared secret matches', () => {
    const mw = createGatewayAuth({ enabled: false, sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Bearer my-key' } };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('rejects request when disabled, shared secret does not match', () => {
    const mw = createGatewayAuth({ enabled: false, sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Bearer wrong' }, log: silentLogger };
    mw(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  test('rejects request when disabled, shared secret configured but no header', () => {
    const mw = createGatewayAuth({ enabled: false, sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: {}, log: silentLogger };
    mw(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  // --- When enabled ---
  test('allows request when enabled and Bearer token present', () => {
    const mw = createGatewayAuth({ enabled: true, logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Bearer jwt-token-here' } };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('rejects request when enabled and no Authorization header', () => {
    const mw = createGatewayAuth({ enabled: true, logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: {}, log: silentLogger };
    mw(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  test('rejects request when enabled and non-Bearer format', () => {
    const mw = createGatewayAuth({ enabled: true, logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Basic abc' }, log: silentLogger };
    mw(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  // --- Exempt endpoints ---
  test('allows /health without auth when enabled', () => {
    const mw = createGatewayAuth({ enabled: true, logger: silentLogger });
    const req = { path: '/health', headers: {} };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('allows /metrics without auth when enabled', () => {
    const mw = createGatewayAuth({ enabled: true, logger: silentLogger });
    const req = { path: '/metrics', headers: {} };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
