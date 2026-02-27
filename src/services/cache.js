/**
 * @module services/cache
 * @description In-memory TTL cache for secret retrieval responses.
 *   Uses a native Map with per-entry expiry timestamps. Each bridge
 *   instance maintains its own independent cache (no shared state).
 *
 *   Implements ADR-002 (Accepted): Local In-Memory Cache with
 *   configurable TTL.
 */

'use strict';

/**
 * Creates a new TTL cache instance.
 *
 * @param {Object}  [options]
 * @param {number}  [options.defaultTtlSeconds=60] - Default TTL in seconds.
 * @returns {Object} Cache interface: get, set, has, delete, clear, stats, size.
 */
function createCache({ defaultTtlSeconds = 60 } = {}) {
  /** @type {Map<string, { value: any, expiresAt: number }>} */
  const store = new Map();

  let hits = 0;
  let misses = 0;

  /**
   * Checks if an entry exists and is not expired. Evicts if expired.
   * @param {string} key
   * @returns {boolean}
   */
  function has(key) {
    const entry = store.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Retrieves a cached value. Returns undefined if missing or expired.
   * @param {string} key
   * @returns {any|undefined}
   */
  function get(key) {
    const entry = store.get(key);
    if (!entry) {
      misses++;
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      store.delete(key);
      misses++;
      return undefined;
    }
    hits++;
    return entry.value;
  }

  /**
   * Stores a value with a TTL.
   * @param {string} key
   * @param {any}    value
   * @param {number} [ttlSeconds] - Override default TTL for this entry.
   */
  function set(key, value, ttlSeconds) {
    const ttl = ttlSeconds !== undefined ? ttlSeconds : defaultTtlSeconds;
    store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  /**
   * Removes a specific entry.
   * @param {string} key
   * @returns {boolean} True if the entry existed.
   */
  function del(key) {
    return store.delete(key);
  }

  /**
   * Clears all entries and resets stats.
   */
  function clear() {
    store.clear();
    hits = 0;
    misses = 0;
  }

  /**
   * Returns cache statistics.
   * @returns {{ size: number, hits: number, misses: number }}
   */
  function stats() {
    return { size: store.size, hits, misses };
  }

  /**
   * Returns the number of entries (including potentially expired ones).
   * @returns {number}
   */
  function size() {
    return store.size;
  }

  return { get, set, has, delete: del, clear, stats, size };
}

module.exports = { createCache };
