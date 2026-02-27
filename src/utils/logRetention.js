/**
 * @module utils/logRetention
 * @description Log retention and archival policy. Provides utilities for
 *   time-based log rotation awareness. In a containerized deployment,
 *   actual log rotation is handled by the container runtime or a log
 *   shipping agent (e.g., Fluentd, Vector). This module provides:
 *
 *   1. Configuration of the retention window (LOG_RETENTION_DAYS).
 *   2. A utility to calculate the retention cutoff timestamp.
 *   3. Metadata to attach to log output for downstream processing.
 *
 *   Note: Pino outputs to stdout (per 12-factor app). Log storage,
 *   rotation, and archival are infrastructure concerns. This module
 *   exposes the policy parameters for infrastructure tooling to consume
 *   via the /health?deep=true endpoint or application startup logs.
 */

'use strict';

/**
 * Default retention period in days (per product_development_plan.md §1).
 */
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Loads the log retention policy configuration.
 *
 * @param {Object} [env=process.env] - Environment variable source.
 * @returns {Readonly<{ retentionDays: number, retentionCutoff: string }>}
 */
function loadRetentionPolicy(env = process.env) {
  const rawDays = env.LOG_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS);
  const retentionDays = Number(rawDays);

  if (Number.isNaN(retentionDays) || retentionDays < 1) {
    return Object.freeze({
      retentionDays: DEFAULT_RETENTION_DAYS,
      retentionCutoff: calculateCutoff(DEFAULT_RETENTION_DAYS),
    });
  }

  return Object.freeze({
    retentionDays,
    retentionCutoff: calculateCutoff(retentionDays),
  });
}

/**
 * Calculates the retention cutoff date (ISO 8601).
 *
 * @param {number} days - Number of days to retain.
 * @returns {string} ISO 8601 date string.
 */
function calculateCutoff(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

/**
 * Returns log retention metadata for inclusion in startup logs
 * and deep health checks.
 *
 * @param {Object} [env=process.env] - Environment variable source.
 * @returns {{ retentionDays: number, retentionCutoff: string }}
 */
function getRetentionMetadata(env) {
  return loadRetentionPolicy(env);
}

module.exports = {
  loadRetentionPolicy,
  calculateCutoff,
  getRetentionMetadata,
  DEFAULT_RETENTION_DAYS,
};
