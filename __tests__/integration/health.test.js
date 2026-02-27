const request = require('supertest');
const { buildApp } = require('../../src/app');
const { createLogger } = require('../../src/utils/logger');
const { createCache } = require('../../src/services/cache');
const { createCircuitBreaker } = require('../../src/services/circuitBreaker');
const { PassThrough } = require('stream');

const silentLogger = createLogger({ level: 'silent', destination: new PassThrough() });

const createMockClient = (getImplementation) => {
  const getMock = jest.fn(getImplementation);
  const secretsMock = jest.fn(() => ({ get: getMock }));
  return { secrets: secretsMock, __getMock: getMock, __secretsMock: secretsMock };
};

describe('health endpoint (PBI-12)', () => {
  // --- Shallow probe (backward compatible) ---
  test('GET /health returns { status: "ok" } when client is ready', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });

    await request(app)
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  test('GET /health returns { status: "unavailable" } when client is not ready', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => false, logger: silentLogger });

    await request(app)
      .get('/health')
      .expect(503)
      .expect({ status: 'unavailable' });
  });

  // --- Deep probe ---
  test('GET /health?deep=true returns structured response when healthy', async () => {
    const client = createMockClient(() => Promise.resolve());
    const cache = createCache({ defaultTtlSeconds: 60 });
    const circuitBreaker = createCircuitBreaker({ logger: silentLogger });
    const app = buildApp({
      client,
      isReady: () => true,
      cache,
      circuitBreaker,
      logger: silentLogger,
    });

    const response = await request(app)
      .get('/health?deep=true')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.dependencies).toHaveProperty('bitwarden_session', 'active');
    expect(response.body.dependencies).toHaveProperty('cache', 'enabled');
    expect(response.body.dependencies).toHaveProperty('circuit_breaker', 'closed');
    expect(response.body.dependencies).toHaveProperty('last_upstream_success');
  });

  test('GET /health?deep=true returns degraded when session expired but cache warm', async () => {
    const client = createMockClient(() => Promise.resolve());
    const cache = createCache({ defaultTtlSeconds: 60 });
    cache.set('some-key', { value: 'cached' }); // warm cache
    const app = buildApp({
      client,
      isReady: () => false, // session expired
      cache,
      logger: silentLogger,
    });

    const response = await request(app)
      .get('/health?deep=true')
      .expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.dependencies.bitwarden_session).toBe('expired');
    expect(response.body.dependencies.cache).toBe('enabled');
    expect(response.body.dependencies.cache_size).toBe(1);
  });

  test('GET /health?deep=true returns unavailable when session expired and cache empty', async () => {
    const client = createMockClient(() => Promise.resolve());
    const cache = createCache({ defaultTtlSeconds: 60 });
    const app = buildApp({
      client,
      isReady: () => false,
      cache,
      logger: silentLogger,
    });

    const response = await request(app)
      .get('/health?deep=true')
      .expect(503);

    expect(response.body.status).toBe('unavailable');
    expect(response.body.dependencies.bitwarden_session).toBe('expired');
  });

  test('GET /health?deep=true returns degraded when circuit breaker is open but cache warm', async () => {
    const client = createMockClient(() => Promise.resolve());
    const cache = createCache({ defaultTtlSeconds: 60 });
    cache.set('key', { value: 'cached' });
    const circuitBreaker = createCircuitBreaker({ failureThreshold: 1, logger: silentLogger });
    circuitBreaker.recordFailure(); // trip the breaker
    const app = buildApp({
      client,
      isReady: () => true,
      cache,
      circuitBreaker,
      logger: silentLogger,
    });

    const response = await request(app)
      .get('/health?deep=true')
      .expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.dependencies.circuit_breaker).toBe('open');
  });
});
