const request = require('supertest');
const { buildApp } = require('../../src/app');
const { createLogger } = require('../../src/utils/logger');
const { createCache } = require('../../src/services/cache');
const { PassThrough } = require('stream');

const silentLogger = createLogger({ level: 'silent', destination: new PassThrough() });

const VALID_UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';

const createMockClient = (getImplementation) => {
  const getMock = jest.fn(getImplementation);
  const secretsMock = jest.fn(() => ({ get: getMock }));
  return { secrets: secretsMock, __getMock: getMock, __secretsMock: secretsMock };
};

describe('POST /vault/secrets (bulk retrieval, PBI-15)', () => {
  test('returns secrets for valid IDs', async () => {
    const secrets = {
      [VALID_UUID_1]: { id: VALID_UUID_1, key: 'key-1', value: 'value-1' },
      [VALID_UUID_2]: { id: VALID_UUID_2, key: 'key-2', value: 'value-2' },
    };
    const client = createMockClient((id) => Promise.resolve(secrets[id]));
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });

    const response = await request(app)
      .post('/vault/secrets')
      .send({ ids: [VALID_UUID_1, VALID_UUID_2] })
      .expect(200);

    expect(response.body.secrets).toHaveLength(2);
    expect(response.body.errors).toHaveLength(0);
  });

  test('returns partial results when some IDs fail', async () => {
    const client = createMockClient((id) => {
      if (id === VALID_UUID_1) {
        return Promise.resolve({ id: VALID_UUID_1, key: 'k', value: 'v' });
      }
      return Promise.reject(new Error('Secret not found'));
    });
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });

    const response = await request(app)
      .post('/vault/secrets')
      .send({ ids: [VALID_UUID_1, VALID_UUID_2] })
      .expect(200);

    expect(response.body.secrets).toHaveLength(1);
    expect(response.body.errors).toHaveLength(1);
    expect(response.body.errors[0].id).toBe(VALID_UUID_2);
    expect(response.body.errors[0].status).toBe(404);
  });

  test('serves cached secrets without upstream calls', async () => {
    const mockSecret = { id: VALID_UUID_1, key: 'k', value: 'v' };
    const client = createMockClient(() => Promise.resolve(mockSecret));
    const cache = createCache({ defaultTtlSeconds: 60 });
    cache.set(VALID_UUID_1, mockSecret); // pre-populate

    const app = buildApp({ client, isReady: () => true, cache, logger: silentLogger });

    const response = await request(app)
      .post('/vault/secrets')
      .send({ ids: [VALID_UUID_1] })
      .expect(200);

    expect(response.body.secrets).toHaveLength(1);
    expect(client.__getMock).not.toHaveBeenCalled();
  });

  test('returns 400 for missing ids array', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });

    await request(app)
      .post('/vault/secrets')
      .send({})
      .expect(400);
  });

  test('returns 400 for empty ids array', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });

    await request(app)
      .post('/vault/secrets')
      .send({ ids: [] })
      .expect(400);
  });

  test('returns 400 when exceeding 50 IDs', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });
    const ids = Array.from({ length: 51 }, (_, i) =>
      `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`
    );

    const response = await request(app)
      .post('/vault/secrets')
      .send({ ids })
      .expect(400);

    expect(response.body.error).toContain('Maximum 50 IDs');
  });

  test('returns 400 for invalid UUID in bulk request', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => true, logger: silentLogger });

    const response = await request(app)
      .post('/vault/secrets')
      .send({ ids: [VALID_UUID_1, 'not-a-uuid'] })
      .expect(400);

    expect(response.body.invalidIds).toContain('not-a-uuid');
  });

  test('returns 503 when vault client is not ready', async () => {
    const client = createMockClient(() => Promise.resolve());
    const app = buildApp({ client, isReady: () => false, logger: silentLogger });

    await request(app)
      .post('/vault/secrets')
      .send({ ids: [VALID_UUID_1] })
      .expect(503);
  });
});
