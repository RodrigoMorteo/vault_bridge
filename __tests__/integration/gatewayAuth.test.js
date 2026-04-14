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

  // --- No secret configured (passthrough mode) ---
  test('allows all requests when no sharedSecret is configured', () => {
    const mw = createGatewayAuth({ logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: {} };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('allows requests with any header when no sharedSecret is configured', () => {
    const mw = createGatewayAuth({ logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Bearer anything' } };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  // --- Secret configured (enforce mode) ---
  test('allows request when sharedSecret matches Authorization header', () => {
    const mw = createGatewayAuth({ sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Bearer my-key' } };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('rejects with 401 when sharedSecret is set and token does not match', () => {
    const mw = createGatewayAuth({ sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Bearer wrong' }, log: silentLogger };
    mw(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  test('rejects with 401 when sharedSecret is set and Authorization header is absent', () => {
    const mw = createGatewayAuth({ sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: {}, log: silentLogger };
    mw(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  test('rejects with 401 when sharedSecret is set and non-Bearer format is used', () => {
    const mw = createGatewayAuth({ sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/vault/secret/abc', headers: { authorization: 'Basic my-key' }, log: silentLogger };
    mw(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  // --- Exempt endpoints (always passthrough regardless of secret) ---
  test('allows /health without auth even when sharedSecret is configured', () => {
    const mw = createGatewayAuth({ sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/health', headers: {} };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('allows /metrics without auth even when sharedSecret is configured', () => {
    const mw = createGatewayAuth({ sharedSecret: 'my-key', logger: silentLogger });
    const req = { path: '/metrics', headers: {} };
    mw(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
