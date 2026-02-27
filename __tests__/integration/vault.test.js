const request = require('supertest');
const { buildApp } = require('../../src/app');
const { createLogger } = require('../../src/utils/logger');
const { PassThrough } = require('stream');

// Silent logger for tests — avoids pino JSON noise in test output
const silentLogger = createLogger({ level: 'silent', destination: new PassThrough() });

const createMockClient = (getImplementation) => {
    const getMock = jest.fn(getImplementation);
    const secretsMock = jest.fn(() => ({ get: getMock }));
    return { secrets: secretsMock, __getMock: getMock, __secretsMock: secretsMock };
};

describe('bws-vault-bridge routes', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

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

    test('returns 503 when the vault client is not ready', async () => {
        const client = createMockClient(() => Promise.resolve());
        const app = buildApp({ client, isReady: () => false, logger: silentLogger });

        await request(app)
            .get('/vault/secret/secret-123')
            .expect(503)
            .expect({ error: 'Vault client not ready' });
    });

    test('returns the decrypted secret payload when ready', async () => {
        const mockSecret = { id: 'secret-123', key: 'demo-key', value: 'demo-value' };
        const client = createMockClient(() => Promise.resolve(mockSecret));
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        const response = await request(app).get('/vault/secret/secret-123').expect(200);

        expect(response.body).toEqual(mockSecret);
        expect(client.__secretsMock).toHaveBeenCalled();
        expect(client.__getMock).toHaveBeenCalledWith('secret-123');
    });

    test('masks vault errors and returns 500 on secret retrieval failure', async () => {
        const client = createMockClient(() => Promise.reject(new Error('vault failure')));
        const app = buildApp({ client, isReady: () => true, logger: silentLogger });

        const response = await request(app).get('/vault/secret/secret-123').expect(500);

        expect(response.body).toEqual({ error: 'Failed to retrieve secret from vault.' });
    });
});
