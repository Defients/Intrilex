// ═══════════════════════════════════════════════════════════════
// kill-orphaned-smoke.mjs — T8: Kill orphaned browser-smoke processes
//
// AGENTS.md warns: "Do not leave orphaned browser-ui-smoke.mjs
// processes running — they will continuously overwrite the committed
// PASS report with FAIL, causing test 96 in v0.10.0-behavioral.test.mjs
// to fail intermittently."
//
// This script:
//   1. Scans for running browser-ui-smoke.mjs processes
//   2. Terminates them
//   3. Logs the cleanup action
//
// Intended to be run before CI or on a timer to prevent flaky tests.
// Usage: node scripts/kill-orphaned-smoke.mjs
// ═══════════════════════════════════════════════════════════════

import { execSync } from 'node:child_process';

const SMOKE_SCRIPT = 'browser-ui-smoke.mjs';
const E2E_SCRIPT = 'browser-e2e-certification.mjs';
const E2E_NETWORK = 'browser-network-e2e.mjs';
const TARGETS = [SMOKE_SCRIPT, E2E_SCRIPT, E2E_NETWORK];

let killed = 0;

for (const target of TARGETS) {
  try {
    // Find PIDs of processes running the target script
    // Use wmic on Windows, pgrep on Unix
    let pids = [];
    if (process.platform === 'win32') {
      try {
        const output = execSync(
          `wmic process where "commandline like '%${target}%'" get processid /format:value`,
          { encoding: 'utf8', timeout: 10000 }
        );
        pids = output
          .split('\n')
          .map(line => line.match(/ProcessId=(\d+)/)?.[1])
          .filter(Boolean)
          .filter(pid => pid !== String(process.pid));
      } catch {
        // wmic may not be available
      }
    } else {
      try {
        const output = execSync(`pgrep -f "${target}"`, { encoding: 'utf8', timeout: 10000 });
        pids = output.split('\n').filter(Boolean).filter(pid => pid !== String(process.pid));
      } catch {
        // pgrep returns non-zero when no matches
      }
    }

    for (const pid of pids) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
        } else {
          execSync(`kill -9 ${pid}`, { timeout: 5000 });
        }
        killed++;
        console.log(`[kill-orphaned-smoke] Terminated PID ${pid} (${target})`);
      } catch (err) {
        // Process may have already exited
      }
    }
  } catch {
    // No processes found or platform unsupported
  }
}

if (killed === 0) {
  console.log('[kill-orphaned-smoke] No orphaned browser smoke processes found.');
} else {
  console.log(`[kill-orphaned-smoke] Terminated ${killed} orphaned process(es).`);
}

export { killed };
