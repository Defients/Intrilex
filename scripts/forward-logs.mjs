#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// forward-logs.mjs — Structured log forwarder for the match server
//
// Reads JSON Lines log entries from stdin and forwards them to one or
// more destinations. Designed to be piped from the match server's
// stderr output:
//
//   node apps/match-server/src/server.mjs 2>&1 1>/dev/null | \
//     node scripts/forward-logs.mjs --webhook-url https://...
//
// Or via systemd journal:
//   journalctl -u intrilex-match-server -f -o json | \
//     node scripts/forward-logs.mjs --webhook-url https://...
//
// Destinations:
//   --webhook-url <url>     HTTP POST each log entry as JSON to this URL
//   --filter <event>        Only forward entries matching these event names
//                           (comma-separated, e.g. "healthAlert,healthSnapshot")
//   --batch-size <n>        Batch entries before sending (default: 1)
//   --batch-interval <ms>   Flush batch after this interval even if not full (default: 5000)
//
// The forwarder is non-blocking and resilient — network errors are logged
// to stderr but don't crash the forwarder. Entries are dropped if the
// webhook is unreachable (no disk queue — this is a simple forwarder,
// not a durable log pipeline).
// ═══════════════════════════════════════════════════════════════

import { createInterface } from 'node:readline';
import { request } from 'node:http';
import { request as requestHttps } from 'node:https';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    webhookUrl: null,
    filter: null, // Set of event names to forward, or null for all
    batchSize: 1,
    batchIntervalMs: 5000,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--webhook-url': opts.webhookUrl = args[++i]; break;
      case '--filter': opts.filter = new Set(args[++i].split(',').map(s => s.trim())); break;
      case '--batch-size': opts.batchSize = parseInt(args[++i], 10); break;
      case '--batch-interval': opts.batchIntervalMs = parseInt(args[++i], 10); break;
      case '--help':
        console.log('Usage: node scripts/forward-logs.mjs --webhook-url <url> [--filter events] [--batch-size n] [--batch-interval ms]');
        process.exit(0);
    }
  }
  return opts;
}

async function sendBatch(url, entries) {
  if (!url || entries.length === 0) return;
  const body = JSON.stringify(entries);
  const isHttps = url.startsWith('https://');
  const reqFn = isHttps ? requestHttps : request;
  return new Promise((resolve) => {
    const req = reqFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      res.resume(); // drain
      resolve(res.statusCode);
    });
    req.on('error', (err) => {
      process.stderr.write(`[forward-logs] Send error: ${err.message}\n`);
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      process.stderr.write('[forward-logs] Send timeout\n');
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

async function main() {
  const opts = parseArgs();
  if (!opts.webhookUrl) {
    process.stderr.write('[forward-logs] No --webhook-url provided — logs will be echoed to stdout\n');
  }

  let batch = [];
  let flushTimer = null;

  async function flush() {
    if (batch.length === 0) return;
    const toSend = batch;
    batch = [];
    if (opts.webhookUrl) {
      await sendBatch(opts.webhookUrl, toSend);
    } else {
      // Echo to stdout when no webhook is configured (for testing)
      for (const entry of toSend) {
        process.stdout.write(JSON.stringify(entry) + '\n');
      }
    }
  }

  if (opts.batchSize > 1) {
    flushTimer = setInterval(flush, opts.batchIntervalMs);
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on('line', (line) => {
    try {
      const entry = JSON.parse(line);
      // Apply filter if configured
      if (opts.filter && !opts.filter.has(entry.event)) return;
      batch.push(entry);
      if (batch.length >= opts.batchSize) {
        flush();
      }
    } catch {
      // Not a JSON log line — skip silently
    }
  });

  rl.on('close', async () => {
    if (flushTimer) clearInterval(flushTimer);
    await flush();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`[forward-logs] FATAL: ${err.message}\n`);
  process.exit(1);
});
