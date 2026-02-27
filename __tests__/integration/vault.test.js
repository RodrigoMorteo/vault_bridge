const request = require('supertest');
const { buildApp } = require('../../src/app');
const { createLogger } = require('../../src/utils/logger');
const { createCache } = require('../../src/services/cache');
const { PassThrough } = require('stream');

// Silent logger for tests — avoids pino JSON noise in test output
const silentLogger = createLogger({ level: 'silent', destination: new PassThrough() });

// Valid UUID v4 for tests
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const createMockClient = (getImplementation) => {
    const getMock = jest.fn(getImplementation);
    const secretsMock = jest.fn(() => ({ get: getMock }));
    return { secrets: secretsMock, __getMock: getMock, __secretsMock: secretsMock };
};

describe('bws-vault-bridge routes', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // --- Health routes ---
    test('health returns ok when the vault client is ready', async () => {
        const client = createMockClient(() => Promise.resolve());
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        await request(app).get('/health').expect(200).expect({ status: 'ok' });
    });

    test('health returns unavailable when the vault client is not ready', async () => {
        const client = createMockClient(() => Promise.resolve());
        const app = buildApp({ client, isReady: () => false, logger: silentLogger });

        await request(app).get('/health').expect(503).expect({ status: 'unavailable' });
    });

    // --- Vault route: basic behavior ---
    test('returns 503 when the vault client is not ready', async () => {
        const client = createMockClient(() => Promise.resolve());
        const app = buildApp({ client, isReady: () => false, logger: silentLogger });

        await request(app)
            .get(`/vault/secret/${VALID_UUID}`)
            .expect(503)
            .expect({ error: 'Vault client not ready.' });
    });

    test('returns the decrypted secret payload when ready', async () => {
        const mockSecret = { id: VALID_UUID, key: 'demo-key', value: 'demo-value' };
        const client = createMockClient(() => Promise.resolve(mockSecret));
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        const response = await request(app).get(`/vault/secret/${VALID_UUID}`).expect(200);

        expect(response.body).toEqual(mockSecret);
        expect(client.__secretsMock).toHaveBeenCalled();
        expect(client.__getMock).toHaveBeenCalledWith(VALID_UUID);
    });

    // --- Input validation (PBI-04) ---
    test('returns 400 for invalid secret ID format', async () => {
        const client = createMockClient(() => Promise.resolve());
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        await request(app)
            .get('/vault/secret/not-a-uuid')
            .expect(400)
            .expect({ error: 'Invalid secret ID format. Expected UUID v4.' });
    });

    test('returns 400 for SQL injection attempt', async () => {
        const client = createMockClient(() => Promise.resolve());
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        await request(app)
            .get("/vault/secret/'; DROP TABLE secrets; --")
            .expect(400);
    });

    // --- Caching (PBI-05) ---
    test('serves from cache on second request', async () => {
        const mockSecret = { id: VALID_UUID, key: 'demo-key', value: 'demo-value' };
        const client = createMockClient(() => Promise.resolve(mockSecret));
        const cache = createCache({ defaultTtlSeconds: 60 });
        const app = buildApp({ client, isReady: () => true, cache, logger: silentLogger });

        // First request — populates cache
        await request(app).get(`/vault/secret/${VALID_UUID}`).expect(200);
        expect(client.__getMock).toHaveBeenCalledTimes(1);

        // Second request — served from cache
        const response = await request(app).get(`/vault/secret/${VALID_UUID}`).expect(200);
        expect(response.body).toEqual(mockSecret);
        expect(client.__getMock).toHaveBeenCalledTimes(1); // NOT called again
    });

    test('cache miss triggers upstream call', async () => {
        const mockSecret = { id: VALID_UUID, key: 'demo-key', value: 'demo-value' };
        const client = createMockClient(() => Promise.resolve(mockSecret));
        const cache = createCache({ defaultTtlSeconds: 60 });
        const app = buildApp({ client, isReady: () => true, cache, logger: silentLogger });

        await request(app).get(`/vault/secret/${VALID_UUID}`).expect(200);
        expect(client.__getMock).toHaveBeenCalledTimes(1);
        expect(cache.stats().misses).toBe(1);
        expect(cache.stats().hits).toBe(0);
    });

    // --- Granular error mapping (PBI-06) ---
    test('returns 404 for "not found" SDK error', async () => {
        const client = createMockClient(() => Promise.reject(new Error('Secret not found')));
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        await request(app)
            .get(`/vault/secret/${VALID_UUID}`)
            .expect(404)
            .expect({ error: 'Secret not found.' });
    });

    test('returns 502 for connection error', async () => {
        const err = new Error('connect');
        err.code = 'ECONNREFUSED';
        const client = createMockClient(() => Promise.reject(err));
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        await request(app)
            .get(`/vault/secret/${VALID_UUID}`)
            .expect(502)
            .expect({ error: 'Upstream vault service unavailable.' });
    });

    test('returns 500 for unknown SDK error', async () => {
        const client = createMockClient(() => Promise.reject(new Error('unexpected error')));
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        await request(app)
            .get(`/vault/secret/${VALID_UUID}`)
            .expect(500)
            .expect({ error: 'Failed to retrieve secret from vault.' });
    });

    // --- Token lifecycle (PBI-08) ---
    test('triggers re-auth on auth error', async () => {
        const client = createMockClient(() => Promise.reject(new Error('Unauthorized')));
        const mockReauth = jest.fn().mockResolvedValue(true);
        const app = buildApp({ client, isReady: () => true, attemptReauth: mockReauth, logger: silentLogger });

        await request(app)
            .get(`/vault/secret/${VALID_UUID}`)
            .expect(502);

        expect(mockReauth).toHaveBeenCalledTimes(1);
    });

    test('does not trigger re-auth on non-auth error', async () => {
        const client = createMockClient(() => Promise.reject(new Error('Secret not found')));
        const mockReauth = jest.fn().mockResolvedValue(true);
        const app = buildApp({ client, isReady: () => true, attemptReauth: mockReauth, logger: silentLogger });

        await request(app)
            .get(`/vault/secret/${VALID_UUID}`)
            .expect(404);

        expect(mockReauth).not.toHaveBeenCalled();
    });
});
