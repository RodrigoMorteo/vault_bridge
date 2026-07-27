const request = require('supertest');
const { buildApp } = require('../../src/app');

describe('Rate Limiting Integration', () => {
  let app;
  const mockClient = {
    secrets: () => ({
      get: jest.fn().mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000', key: 'test', value: 'secret' })
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Create app with very low rate limit for testing
    app = buildApp({
      client: mockClient,
      isReady: () => true,
      rateLimitWindowMs: 60000, // 1 minute
      rateLimitMaxRequests: 2,   // Only 2 requests allowed
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnThis()
      }
    });
  });

  test('allows requests within the rate limit', async () => {
    const res1 = await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000');
    expect(res1.statusCode).toBe(200);

    const res2 = await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000');
    expect(res2.statusCode).toBe(200);
  });

  test('returns 429 when rate limit is exceeded', async () => {
    // First two requests are fine
    await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000');
    await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000');

    // Third request should be rate limited
    const res = await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000');
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests, please try again later.' });
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('retry-after');
  });

  test('exempts /health and /metrics from rate limiting', async () => {
    // Exhaust the limit on vault routes
    await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000');
    await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000');
    await request(app).get('/vault/secret/550e8400-e29b-41d4-a716-446655440000'); // 429

    // Health and metrics should still work
    const healthRes = await request(app).get('/health');
    expect(healthRes.statusCode).toBe(200);

    const metricsRes = await request(app).get('/metrics');
    expect(metricsRes.statusCode).toBe(200);
  });

  test('handles untrusted X-Forwarded-For without a validation error', async () => {
    const res = await request(app)
      .get('/vault/secret/550e8400-e29b-41d4-a716-446655440000')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(res.statusCode).toBe(200);
  });
});
