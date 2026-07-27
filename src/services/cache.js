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
 * @param {number}  [options.maxEntries=1000] - Maximum entries retained in memory.
 * @param {number}  [options.cleanupIntervalMs=60000] - Expiry sweep interval; 0 disables it.
 * @returns {Object} Cache interface: get, set, has, delete, clear, sweep, stop, stats, size.
 */
function createCache({
  defaultTtlSeconds = 60,
  maxEntries = 1000,
  cleanupIntervalMs = 60000,
} = {}) {
  /** @type {Map<string, { value: any, expiresAt: number }>} */
  const store = new Map();

  let hits = 0;
  let misses = 0;

  /**
   * Removes entries whose TTL has elapsed. Map insertion order lets us evict
   * the oldest live entry when the configured bound is reached.
   *
   * @returns {number} Count of removed entries.
   */
  function sweep() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of store) {
      if (now >= entry.expiresAt) {
        store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  const cleanupTimer = cleanupIntervalMs > 0
    ? setInterval(sweep, cleanupIntervalMs)
    : null;
  // A maintenance timer must never keep the process alive during shutdown.
  if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }

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

    sweep();
    if (!store.has(key)) {
      while (store.size >= maxEntries) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) break;
        store.delete(oldestKey);
      }
    }

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

  /** Stops background expiry maintenance and clears plaintext entries. */
  function stop() {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
    }
    clear();
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

  return { get, set, has, delete: del, clear, sweep, stop, stats, size };
}

module.exports = { createCache };
