const { createCache } = require('../../src/services/cache');

describe('cache module', () => {
  test('returns undefined for missing key (cache miss)', () => {
    const cache = createCache();
    expect(cache.get('nonexistent')).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
  });

  test('stores and retrieves a value (cache hit)', () => {
    const cache = createCache({ defaultTtlSeconds: 60 });
    const data = { id: 'abc', key: 'name', value: 'secret' };

    cache.set('abc', data);
    const result = cache.get('abc');

    expect(result).toEqual(data);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(0);
  });

  test('evicts expired entries on get()', () => {
    const cache = createCache({ defaultTtlSeconds: 0 });
    cache.set('abc', 'value');

    const result = cache.get('abc');
    expect(result).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
  });

  test('has() returns false for expired entries', () => {
    const cache = createCache({ defaultTtlSeconds: 0 });
    cache.set('abc', 'value');

    expect(cache.has('abc')).toBe(false);
  });

  test('has() returns true for valid entries', () => {
    const cache = createCache({ defaultTtlSeconds: 60 });
    cache.set('abc', 'value');

    expect(cache.has('abc')).toBe(true);
  });

  test('has() returns false for missing keys', () => {
    const cache = createCache();
    expect(cache.has('nonexistent')).toBe(false);
  });

  test('set() with custom TTL overrides default', () => {
    const cache = createCache({ defaultTtlSeconds: 60 });
    cache.set('abc', 'value', 0);

    expect(cache.get('abc')).toBeUndefined();
  });

  test('delete() removes an entry', () => {
    const cache = createCache();
    cache.set('abc', 'value');
    expect(cache.delete('abc')).toBe(true);
    expect(cache.get('abc')).toBeUndefined();
  });

  test('delete() returns false for nonexistent key', () => {
    const cache = createCache();
    expect(cache.delete('nonexistent')).toBe(false);
  });

  test('clear() empties all entries and resets stats', () => {
    const cache = createCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.get('c');

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.stats()).toEqual({ size: 0, hits: 0, misses: 0 });
  });

  test('stats() reports correct hit/miss counts', () => {
    const cache = createCache({ defaultTtlSeconds: 60 });
    cache.set('a', 1);

    cache.get('a'); // hit
    cache.get('a'); // hit
    cache.get('b'); // miss

    expect(cache.stats()).toEqual({ size: 1, hits: 2, misses: 1 });
  });

  test('size() returns the number of stored entries', () => {
    const cache = createCache();
    expect(cache.size()).toBe(0);

    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);
  });

  test('set() overwrites existing entry', () => {
    const cache = createCache();
    cache.set('a', 'old');
    cache.set('a', 'new');

    expect(cache.get('a')).toBe('new');
    expect(cache.size()).toBe(1);
  });
});
