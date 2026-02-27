const request = require('supertest');
const { buildApp } = require('../../src/app');
const { createLogger } = require('../../src/utils/logger');
const { PassThrough } = require('stream');

const silentLogger = createLogger({ level: 'silent', destination: new PassThrough() });

const createMockClient = (getImplementation) => {
  const getMock = jest.fn(getImplementation);
  const secretsMock = jest.fn(() => ({ get: getMock }));
  return { secrets: secretsMock, __getMock: getMock, __secretsMock: secretsMock };
};

describe('metrics endpoint (PBI-10)', () => {
  test('GET /metrics returns Prometheus exposition format', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });

    const response = await request(app)
      .get('/metrics')
      .expect(200);

    // Should contain Prometheus format content type
    expect(response.headers['content-type']).toMatch(/text\/plain|application\/openmetrics/);
    // Should contain our custom metrics
    expect(response.text).toContain('http_requests_total');
    expect(response.text).toContain('http_request_duration_seconds');
    expect(response.text).toContain('cache_hits_total');
    expect(response.text).toContain('cache_misses_total');
    expect(response.text).toContain('circuit_breaker_state');
  });

  test('/metrics is accessible without gateway auth when enabled', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({
      client,
      isReady: () => true,
      gatewayAuthEnabled: true,
      logger: silentLogger,
    });

    await request(app)
      .get('/metrics')
      .expect(200);
  });
});
