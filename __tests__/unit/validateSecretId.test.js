const { createValidateSecretId, UUID_V4_REGEX } = require('../../src/middleware/validateSecretId');

describe('validateSecretId middleware', () => {
  let middleware;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    middleware = createValidateSecretId();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  test('passes valid UUID v4 to next()', () => {
    const req = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  test('passes valid UUID v4 with uppercase to next()', () => {
    const req = { params: { id: '550E8400-E29B-41D4-A716-446655440000' } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('rejects non-UUID string with 400', () => {
    const req = { params: { id: 'not-a-uuid' } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Invalid secret ID format. Expected UUID v4.',
    });
  });

  test('rejects UUID v1 (wrong version nibble)', () => {
    const req = { params: { id: '550e8400-e29b-11d4-a716-446655440000' } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects SQL injection string', () => {
    const req = { params: { id: "'; DROP TABLE secrets; --" } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects path traversal string', () => {
    const req = { params: { id: '../../etc/passwd' } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects empty string', () => {
    const req = { params: { id: '' } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects missing id parameter', () => {
    const req = { params: {} };
    middleware(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects UUID with extra characters', () => {
    const req = { params: { id: '550e8400-e29b-41d4-a716-446655440000-extra' } };
    middleware(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('UUID_V4_REGEX is exported', () => {
    expect(UUID_V4_REGEX).toBeInstanceOf(RegExp);
    expect(UUID_V4_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(UUID_V4_REGEX.test('not-a-uuid')).toBe(false);
  });
});
