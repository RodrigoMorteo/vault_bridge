/**
 * @module routes/metrics
 * @description Prometheus metrics endpoint. Exposes operational metrics
 *   in Prometheus exposition format for scraping by monitoring infrastructure.
 *
 *   Metrics exposed:
 *   - http_requests_total (counter, labeled by method, route, status_code)
 *   - http_request_duration_seconds (histogram, labeled by method, route)
 *   - cache_hits_total (counter)
 *   - cache_misses_total (counter)
 *   - circuit_breaker_state (gauge: 0=closed, 1=open, 2=half-open)
 */

'use strict';

const express = require('express');
const promClient = require('prom-client');

// Create a dedicated registry (not the global default) for isolation
const register = new promClient.Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
promClient.collectDefaultMetrics({ register });

// --- Custom metrics ---

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

const cacheHitsTotal = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  registers: [register],
});

const cacheMissesTotal = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  registers: [register],
});

const circuitBreakerGauge = new promClient.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  registers: [register],
});

/**
 * Maps circuit breaker state strings to numeric gauge values.
 */
const CB_STATE_VALUES = { closed: 0, open: 1, 'half-open': 2 };

/**
 * Creates the metrics router and returns both the router and the
 * instrumentation functions for use by other middleware.
 *
 * @returns {{ router: express.Router, instruments: Object }}
 */
function createMetricsRouter() {
  const router = express.Router();

  router.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end('Failed to generate metrics.');
    }
  });

  const instruments = {
    httpRequestsTotal,
    httpRequestDuration,
    cacheHitsTotal,
    cacheMissesTotal,
    circuitBreakerGauge,
    CB_STATE_VALUES,
    register,
  };

  return { router, instruments };
}

module.exports = { createMetricsRouter };
