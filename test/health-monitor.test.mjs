// ═══════════════════════════════════════════════════════════════
// health-monitor.test.mjs — Tests for the health monitor module
//
// Proves:
//   - Health monitor emits alerts when thresholds are breached
//   - Health monitor emits periodic health snapshots
//   - Health monitor handles errors gracefully (never crashes)
//   - Alert severities escalate correctly
//   - Event counter deltas are computed correctly
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHealthMonitor } from '../apps/match-server/src/monitoring/health-monitor.mjs';

function makeMetrics(overrides = {}) {
  return {
    uptime: 60000,
    activeConnections: 10,
    activeMatches: 5,
    queueSize: 0,
    memory: { rssMB: 50, heapUsedMB: 30, heapTotalMB: 60 },
    events: {
      connectionOpen: 10, connectionClose: 5, matchCreate: 5, matchJoin: 5,
      matchStart: 3, matchEnd: 2, actionSubmit: 20, actionReject: 1,
      rateLimitHit: 2, ipBan: 3, spectateJoin: 1, spectateLeave: 1,
      reconnect: 2, error: 1, globalConnectionReject: 0, ipConnectionReject: 0,
      replayDownload: 0, authSuccess: 8, authFailure: 2, authRefresh: 1, authRequired: 3,
    },
    auth: { mode: 'required', verifierConfigured: true },
    persistence: { persistorType: 'SqliteMatchStore' },
    ...overrides,
  };
}

test('health-monitor: emits alert when connection density is high', () => {
  const events = [];
  const monitor = startHealthMonitor({
    getHealthMetrics: () => makeMetrics({ activeConnections: 450 }),
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000, // don't trigger interval during test
    maxGlobalConnections: 500,
  });

  monitor.check();

  const alerts = events.filter(e => e.event === 'healthAlert');
  assert.ok(alerts.length > 0, 'Should emit at least one alert');
  const connAlert = alerts.find(a => a.data.type === 'highConnectionDensity');
  assert.ok(connAlert, 'Should emit highConnectionDensity alert');
  assert.equal(connAlert.data.severity, 'warning');
  assert.equal(connAlert.data.activeConnections, 450);

  monitor.stop();
});

test('health-monitor: emits critical alert at 95% connection density', () => {
  const events = [];
  const monitor = startHealthMonitor({
    getHealthMetrics: () => makeMetrics({ activeConnections: 490 }),
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000,
    maxGlobalConnections: 500,
  });

  monitor.check();

  const alerts = events.filter(e => e.event === 'healthAlert');
  const connAlert = alerts.find(a => a.data.type === 'highConnectionDensity');
  assert.ok(connAlert, 'Should emit highConnectionDensity alert');
  assert.equal(connAlert.data.severity, 'critical');

  monitor.stop();
});

test('health-monitor: emits alert when match capacity is high', () => {
  const events = [];
  const monitor = startHealthMonitor({
    getHealthMetrics: () => makeMetrics({ activeMatches: 85 }),
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000,
    maxMatches: 100,
  });

  monitor.check();

  const alerts = events.filter(e => e.event === 'healthAlert');
  const matchAlert = alerts.find(a => a.data.type === 'matchCapacityWarning');
  assert.ok(matchAlert, 'Should emit matchCapacityWarning alert');
  assert.equal(matchAlert.data.severity, 'warning');

  monitor.stop();
});

test('health-monitor: emits alert for memory pressure', () => {
  const events = [];
  const monitor = startHealthMonitor({
    getHealthMetrics: () => makeMetrics({
      memory: { rssMB: 200, heapUsedMB: 95, heapTotalMB: 100 },
    }),
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000,
  });

  monitor.check();

  const alerts = events.filter(e => e.event === 'healthAlert');
  const memAlert = alerts.find(a => a.data.type === 'memoryPressure');
  assert.ok(memAlert, 'Should emit memoryPressure alert');
  assert.equal(memAlert.data.severity, 'warning');

  monitor.stop();
});

test('health-monitor: emits health snapshot on every check', () => {
  const events = [];
  const monitor = startHealthMonitor({
    getHealthMetrics: () => makeMetrics(),
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000,
  });

  monitor.check();

  const snapshots = events.filter(e => e.event === 'healthSnapshot');
  assert.equal(snapshots.length, 1, 'Should emit one health snapshot');
  assert.ok(snapshots[0].data.uptime !== undefined);
  assert.ok(snapshots[0].data.activeConnections !== undefined);

  monitor.stop();
});

test('health-monitor: detects auth failure spike via counter delta', () => {
  const events = [];
  let callCount = 0;
  let metrics = makeMetrics();

  const monitor = startHealthMonitor({
    getHealthMetrics: () => {
      callCount++;
      if (callCount === 1) {
        // First call — baseline
        return makeMetrics();
      }
      // Second call — auth failures spiked
      return makeMetrics({
        events: { ...makeMetrics().events, authFailure: 30 },
      });
    },
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000,
    authFailureSpikeThreshold: 20,
  });

  monitor.check(); // baseline
  events.length = 0;
  monitor.check(); // spike

  const alerts = events.filter(e => e.event === 'healthAlert');
  const authAlert = alerts.find(a => a.data.type === 'authFailureSpike');
  // Delta = 30 - 2 = 28, which is >= 20
  assert.ok(authAlert, 'Should emit authFailureSpike alert');
  assert.equal(authAlert.data.count, 28);

  monitor.stop();
});

test('health-monitor: does not alert when thresholds are not breached', () => {
  const events = [];
  const monitor = startHealthMonitor({
    getHealthMetrics: () => makeMetrics(), // all normal
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000,
  });

  monitor.check();

  const alerts = events.filter(e => e.event === 'healthAlert');
  assert.equal(alerts.length, 0, 'Should not emit any alerts when all metrics are normal');
  // But should still emit a snapshot
  const snapshots = events.filter(e => e.event === 'healthSnapshot');
  assert.equal(snapshots.length, 1);

  monitor.stop();
});

test('health-monitor: handles getHealthMetrics errors gracefully', () => {
  const events = [];
  const monitor = startHealthMonitor({
    getHealthMetrics: () => { throw new Error('metrics unavailable'); },
    logEvent: (event, data) => events.push({ event, data }),
    intervalMs: 100000,
  });

  // Should not throw
  assert.doesNotThrow(() => monitor.check());

  const errorEvents = events.filter(e => e.event === 'healthMonitorError');
  assert.ok(errorEvents.length > 0, 'Should log healthMonitorError');
  assert.ok(errorEvents[0].data.error.includes('metrics unavailable'));

  monitor.stop();
});
