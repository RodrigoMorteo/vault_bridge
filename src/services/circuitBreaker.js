/**
 * @module services/circuitBreaker
 * @description Circuit breaker pattern for upstream Bitwarden API calls.
 *   Monitors failures and transitions through states:
 *     closed → open → half-open → closed
 *
 *   When open, requests are fast-failed (optionally served from stale cache).
 *   After a cooling period, a single probe request is allowed through (half-open).
 *   If the probe succeeds, the circuit closes; if it fails, it reopens.
 */

'use strict';

const STATES = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open',
});

/**
 * Creates a circuit breaker instance.
 *
 * @param {Object}  [options]
 * @param {number}  [options.failureThreshold=5]   - Consecutive failures to trip the circuit.
 * @param {number}  [options.cooldownMs=30000]      - Milliseconds to wait before half-open probe.
 * @param {import('pino').Logger} [options.logger]  - Logger instance.
 * @returns {Object} Circuit breaker interface.
 */
function createCircuitBreaker({ failureThreshold = 5, cooldownMs = 30000, logger } = {}) {
  const log = logger || console;

  let state = STATES.CLOSED;
  let consecutiveFailures = 0;
  let openedAt = null;

  /**
   * Returns the current circuit state.
   * @returns {string} 'closed' | 'open' | 'half-open'
   */
  function getState() {
    // Auto-transition from open → half-open when cooldown expires
    if (state === STATES.OPEN && Date.now() - openedAt >= cooldownMs) {
      state = STATES.HALF_OPEN;
      log.info('Circuit breaker transitioning to half-open.');
    }
    return state;
  }

  /**
   * Checks if a request should be allowed through.
   * @returns {boolean} True if the circuit allows requests.
   */
  function allowRequest() {
    const currentState = getState();
    return currentState === STATES.CLOSED || currentState === STATES.HALF_OPEN;
  }

  /**
   * Records a successful upstream call. Resets failures and closes the circuit.
   */
  function recordSuccess() {
    if (state === STATES.HALF_OPEN) {
      log.info('Circuit breaker closing after successful probe.');
    }
    consecutiveFailures = 0;
    state = STATES.CLOSED;
    openedAt = null;
  }

  /**
   * Records a failed upstream call. Increments failure count and potentially opens the circuit.
   */
  function recordFailure() {
    consecutiveFailures++;

    if (state === STATES.HALF_OPEN) {
      // Probe failed — reopen
      state = STATES.OPEN;
      openedAt = Date.now();
      log.warn('Circuit breaker re-opened after failed probe.');
      return;
    }

    if (consecutiveFailures >= failureThreshold && state === STATES.CLOSED) {
      state = STATES.OPEN;
      openedAt = Date.now();
      log.warn({ consecutiveFailures, failureThreshold }, 'Circuit breaker opened.');
    }
  }

  /**
   * Returns circuit breaker statistics.
   * @returns {{ state: string, consecutiveFailures: number }}
   */
  function stats() {
    return {
      state: getState(),
      consecutiveFailures,
    };
  }

  /**
   * Resets the circuit breaker to closed state.
   */
  function reset() {
    state = STATES.CLOSED;
    consecutiveFailures = 0;
    openedAt = null;
  }

  return {
    getState,
    allowRequest,
    recordSuccess,
    recordFailure,
    stats,
    reset,
  };
}

module.exports = { createCircuitBreaker, STATES };
