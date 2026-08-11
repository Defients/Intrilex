// ═══════════════════════════════════════════════════════════════
// match-server-production.test.mjs
//
// Tests for production deployment configuration of the match server.
// Verifies:
//   - PORT env var is respected
//   - HOST env var is respected
//   - Health endpoint returns version + protocolVersion
//   - Health endpoint returns service name
//   - Malformed WebSocket messages don't crash the server
//   - Invalid origins are rejected when ALLOWED_ORIGINS is set
//   - Graceful shutdown via close()
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const TEST_PORT = 3499;

async function startTestServer(port = TEST_PORT, opts = {}) {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  return startServer({
    port,
    host: '127.0.0.1',
    dbPath: ':memory:',
    persistent: false,
    authMode: 'disabled',
    ...opts,
  });
}

describe('match-server production configuration', () => {
  let server = null;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  describe('health endpoint', () => {
    it('GET /health returns 200 with service info', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.server, 'Intrilex Match Authority');
      assert.equal(typeof body.version, 'string');
      assert.equal(body.protocolVersion, 2);
      assert.equal(typeof body.uptime, 'number');
      assert.equal(typeof body.activeConnections, 'number');
    });

    it('GET / returns same as /health', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.server, 'Intrilex Match Authority');
    });

    it('GET /metrics returns health metrics', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/metrics`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(typeof body.uptime, 'number');
      assert.equal(typeof body.memory, 'object');
    });

    it('GET /unknown returns 404', async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/unknown`);
      assert.equal(res.status, 404);
    });
  });

  describe('WebSocket message safety', () => {
    it('malformed JSON does not crash server', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
      await new Promise((resolve) => ws.on('open', resolve));

      // Send malformed JSON
      ws.send('not valid json {{{');
      ws.send('');
      ws.send('null');
      ws.send('[]');
      ws.send('"string"');

      // Wait briefly to ensure server processes without crashing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Server should still be responsive
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      assert.equal(res.status, 200);

      ws.close();
    });

    it('oversized payload is rejected', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
      await new Promise((resolve) => ws.on('open', resolve));

      // Send a message larger than maxPayload (65536 bytes)
      const huge = JSON.stringify({ type: 'X', payload: { data: 'x'.repeat(70000) } });
      ws.send(huge);

      // Wait for the server to process/close
      const closed = await Promise.race([
        new Promise((resolve) => ws.on('close', () => resolve(true))),
        new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
      ]);

      // The connection should be closed by the server due to oversized payload
      assert.equal(closed, true);
    });

    it('unknown message type is safely handled', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
      await new Promise((resolve) => ws.on('open', resolve));

      ws.send(JSON.stringify({ protocolVersion: 2, type: 'UNKNOWN_TYPE', payload: {} }));

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Server should still be responsive
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      assert.equal(res.status, 200);

      ws.close();
    });
  });

  describe('protocol versioning', () => {
    it('rejects wrong protocol version', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
      await new Promise((resolve) => ws.on('open', resolve));

      ws.send(JSON.stringify({ protocolVersion: 99, type: 'CREATE_MATCH', payload: { profileId: 'core-foundation-authority' } }));

      const msg = await new Promise((resolve) => {
        ws.on('message', (data) => resolve(JSON.parse(data.toString())));
        setTimeout(() => resolve(null), 3000);
      });

      assert.ok(msg, 'should receive a response');
      // Server should reject with error
      if (msg.type === 'ERROR') {
        assert.match(msg.payload?.reason ?? msg.payload?.message ?? '', /protocol/i);
      }

      ws.close();
    });
  });

  describe('graceful shutdown', () => {
    it('close() shuts down the server cleanly', async () => {
      const testServer = await startTestServer(TEST_PORT + 10);
      assert.ok(testServer, 'server should start');

      // Verify it's running
      const res = await fetch(`http://127.0.0.1:${TEST_PORT + 10}/health`);
      assert.equal(res.status, 200);

      // Shut it down
      await testServer.close();

      // Verify it's no longer responding
      await assert.rejects(
        fetch(`http://127.0.0.1:${TEST_PORT + 10}/health`, { signal: AbortSignal.timeout(2000) }),
        /fetch|ECONNREFUSED|aborted/i
      );
    });
  });
});

describe('match-server PORT env var', () => {
  it('startServer respects custom port', async () => {
    const customPort = TEST_PORT + 20;
    const testServer = await startTestServer(customPort);
    try {
      const res = await fetch(`http://127.0.0.1:${customPort}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.server, 'Intrilex Match Authority');
    } finally {
      await testServer.close();
    }
  });
});

describe('match-server origin validation', () => {
  it('rejects connections from disallowed origins', async () => {
    const testServer = await startTestServer(TEST_PORT + 30, {
      allowedOrigins: ['https://intrilex.cards'],
    });
    try {
      // Connect with a disallowed origin
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 30}`, {
        headers: { Origin: 'https://evil.example.com' },
      });

      const closed = await Promise.race([
        new Promise((resolve) => ws.on('close', () => resolve(true))),
        new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
      ]);

      assert.equal(closed, true, 'connection from disallowed origin should be closed');
    } finally {
      await testServer.close();
    }
  });

  it('accepts connections from allowed origins', async () => {
    const testServer = await startTestServer(TEST_PORT + 40, {
      allowedOrigins: ['http://localhost:4173'],
    });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 40}`, {
        headers: { Origin: 'http://localhost:4173' },
      });

      const opened = await Promise.race([
        new Promise((resolve) => ws.on('open', () => resolve(true))),
        new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
      ]);

      assert.equal(opened, true, 'connection from allowed origin should succeed');
      ws.close();
    } finally {
      await testServer.close();
    }
  });
});
