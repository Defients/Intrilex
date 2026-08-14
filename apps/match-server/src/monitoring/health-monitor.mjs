// ═══════════════════════════════════════════════════════════════
// health-monitor.mjs — Periodic health monitoring + structured alerts
//
// Runs a periodic health check on the match server and emits structured
// JSON alert entries to stderr when thresholds are breached. Alerts are
// emitted in the same JSON Lines format as logEvent, so they flow through
// the same log forwarding pipeline (journald → log aggregator).
//
// Alert conditions:
//   - highConnectionDensity: active connections > 80% of MAX_GLOBAL_CONNECTIONS
//   - authFailureSpike: authFailure count > 20 in the last check interval
//   - errorRateSpike: error count > 10 in the last check interval
//   - memoryPressure: heap usage > 90% of heap total
//   - matchCapacityWarning: active matches > 80% of MAX_MATCHES
//   - ipBanSpike: banned IPs > 20 in the last check interval
//
// Usage (called from startServer):
//   import { startHealthMonitor } from './monitoring/health-monitor.mjs';
//   const monitor = startHealthMonitor({
//     getHealthMetrics: () => server.getHealthMetrics(),
//     logEvent: (event, data) => server.logEvent(event, data),
//     intervalMs: 60000,  // check every 60s (default)
//   });
//   // On shutdown:
//   monitor.stop();
//
// The monitor is non-blocking — health check errors are caught and logged,
// never crashing the server. Alert thresholds are configurable via opts.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} HealthMonitorOptions
 * @property {() => object} getHealthMetrics - Returns the current health metrics object
 * @property {(event: string, data?: object) => void} logEvent - Structured log emitter
 * @property {number} [intervalMs] - Check interval in milliseconds (default: 60000)
 * @property {number} [connectionWarnThreshold] - Fraction of max connections to warn at (default: 0.8)
 * @property {number} [matchCapacityWarnThreshold] - Fraction of max matches to warn at (default: 0.8)
 * @property {number} [authFailureSpikeThreshold] - Auth failures per interval to alert (default: 20)
 * @property {number} [errorSpikeThreshold] - Errors per interval to alert (default: 10)
 * @property {number} [ipBanSpikeThreshold] - New IP bans per interval to alert (default: 20)
 * @property {number} [memoryWarnFraction] - Heap usage fraction to warn at (default: 0.9)
 * @property {number} [maxGlobalConnections] - Global connection cap (default: 500)
 * @property {number} [maxMatches] - Match capacity cap (default: 100)
 */

/**
 * Default alert thresholds.
 */
const DEFAULTS = {
  intervalMs: 60000,
  connectionWarnThreshold: 0.8,
  matchCapacityWarnThreshold: 0.8,
  authFailureSpikeThreshold: 20,
  errorSpikeThreshold: 10,
  ipBanSpikeThreshold: 20,
  memoryWarnFraction: 0.9,
  maxGlobalConnections: 500,
  maxMatches: 100,
};

/**
 * Start a periodic health monitor.
 *
 * @param {HealthMonitorOptions} opts
 * @returns {{ stop: () => void, check: () => void }}
 */
export function startHealthMonitor(opts) {
  const config = { ...DEFAULTS, ...opts };
  const { getHealthMetrics, logEvent } = config;

  // Track previous event counter values to compute deltas per interval
  let prevCounters = null;

  function check() {
    let metrics;
    try {
      metrics = getHealthMetrics();
    } catch (err) {
      // Health check must never crash the server
      logEvent('healthMonitorError', { error: err?.message ?? String(err) });
      return;
    }

    const now = Date.now();
    const alerts = [];

    // ── Connection density ──
    const connFraction = metrics.activeConnections / config.maxGlobalConnections;
    if (connFraction >= config.connectionWarnThreshold) {
      alerts.push({
        type: 'highConnectionDensity',
        severity: connFraction >= 0.95 ? 'critical' : 'warning',
        activeConnections: metrics.activeConnections,
        maxConnections: config.maxGlobalConnections,
        fraction: Math.round(connFraction * 100) / 100,
      });
    }

    // ── Match capacity ──
    const matchFraction = metrics.activeMatches / config.maxMatches;
    if (matchFraction >= config.matchCapacityWarnThreshold) {
      alerts.push({
        type: 'matchCapacityWarning',
        severity: matchFraction >= 0.95 ? 'critical' : 'warning',
        activeMatches: metrics.activeMatches,
        maxMatches: config.maxMatches,
        fraction: Math.round(matchFraction * 100) / 100,
      });
    }

    // ── Memory pressure ──
    if (metrics.memory) {
      const heapFraction = metrics.memory.heapUsedMB / metrics.memory.heapTotalMB;
      if (heapFraction >= config.memoryWarnFraction && metrics.memory.heapTotalMB > 0) {
        alerts.push({
          type: 'memoryPressure',
          severity: heapFraction >= 0.98 ? 'critical' : 'warning',
          heapUsedMB: metrics.memory.heapUsedMB,
          heapTotalMB: metrics.memory.heapTotalMB,
          rssMB: metrics.memory.rssMB,
          fraction: Math.round(heapFraction * 100) / 100,
        });
      }
    }

    // ── Event counter deltas (auth failures, errors, IP bans) ──
    if (prevCounters && metrics.events) {
      const delta = (key) => (metrics.events[key] ?? 0) - (prevCounters[key] ?? 0);

      const authFailures = delta('authFailure');
      if (authFailures >= config.authFailureSpikeThreshold) {
        alerts.push({
          type: 'authFailureSpike',
          severity: authFailures >= config.authFailureSpikeThreshold * 2 ? 'critical' : 'warning',
          count: authFailures,
          threshold: config.authFailureSpikeThreshold,
        });
      }

      const errors = delta('error');
      if (errors >= config.errorSpikeThreshold) {
        alerts.push({
          type: 'errorRateSpike',
          severity: errors >= config.errorSpikeThreshold * 2 ? 'critical' : 'warning',
          count: errors,
          threshold: config.errorSpikeThreshold,
        });
      }

      const ipBans = delta('ipBan');
      if (ipBans >= config.ipBanSpikeThreshold) {
        alerts.push({
          type: 'ipBanSpike',
          severity: ipBans >= config.ipBanSpikeThreshold * 2 ? 'critical' : 'warning',
          count: ipBans,
          threshold: config.ipBanSpikeThreshold,
        });
      }
    }

    // Update previous counters for next delta computation
    prevCounters = metrics.events ? { ...metrics.events } : null;

    // Emit alerts as structured log entries
    for (const alert of alerts) {
      logEvent('healthAlert', { ...alert, ts: new Date().toISOString() });
    }

    // Emit a periodic health snapshot (even when no alerts — useful for dashboards)
    logEvent('healthSnapshot', {
      uptime: metrics.uptime,
      activeConnections: metrics.activeConnections,
      activeMatches: metrics.activeMatches,
      queueSize: metrics.queueSize,
      rssMB: metrics.memory?.rssMB ?? 0,
      heapUsedMB: metrics.memory?.heapUsedMB ?? 0,
      alertCount: alerts.length,
    });
  }

  // Run initial check after a short delay (let server warm up)
  const initialTimer = setTimeout(check, 5000);
  const interval = setInterval(check, config.intervalMs);

  // Don't keep the process alive solely for the monitor
  interval.unref?.();
  initialTimer.unref?.();

  return {
    stop() {
      clearTimeout(initialTimer);
      clearInterval(interval);
    },
    check, // expose for testing
  };
}
