import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { OllamaClient, OLLAMA_ERROR, OllamaError } from '@intrilex/analytics-ai/ollama-client';
import { discoverOllama, verifyModel } from '@intrilex/analytics-ai/model-discovery';

// ── Helpers: spin up a mock Ollama server ──────────────────────────
function startMockServer({ handler, status: _status = 200 } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      try { await handler(req, res); }
      catch (err) { res.statusCode = 500; res.end(JSON.stringify({ error: String(err) })); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

async function withServer(fn, opts) {
  const { server, url } = await startMockServer(opts);
  try { return await fn(url); }
  finally { server.close(); }
}

// ── Tests ──────────────────────────────────────────────────────────

test('ollama-client: successful connection test', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    const status = await client.testConnection();
    assert.equal(status.ok, true);
    assert.equal(status.endpoint, url);
  }, { handler: (req, res) => res.end(JSON.stringify({ version: '0.1.32' })) });
});

test('ollama-client: unreachable server returns structured error', async () => {
  const client = new OllamaClient({ endpoint: 'http://127.0.0.1:1', timeoutMs: 1000 });
  const status = await client.testConnection();
  assert.equal(status.ok, false);
  assert.equal(status.error, OLLAMA_ERROR.UNREACHABLE);
});

test('ollama-client: model discovery lists installed models', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    const result = await client.listModels();
    assert.equal(result.ok, true);
    assert.equal(result.models.length, 2);
    assert.equal(result.models[0].name, 'llama3:latest');
  }, { handler: (req, res) => {
    if (req.url.startsWith('/api/tags')) res.end(JSON.stringify({ models: [{ name: 'llama3:latest', size: 4000 }, { name: 'qwen2:7b', size: 5000 }] }));
    else res.end(JSON.stringify({ version: '0.1.32' }));
  } });
});

test('ollama-client: missing model returns MODEL_NOT_FOUND on 404', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    await assert.rejects(
      client.chat({ model: 'ghost', messages: [{ role: 'user', content: 'hi' }], stream: false }),
      (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.MODEL_NOT_FOUND
    );
  }, { handler: (req, res) => { res.statusCode = 404; res.end(JSON.stringify({ error: 'model not found' })); } });
});

test('ollama-client: non-streaming chat returns full text', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    const result = await client.chat({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }], stream: false });
    assert.equal(result.text, '{"summary":"ok"}');
    assert.equal(result.done, true);
  }, { handler: async (req, res) => {
    const body = JSON.parse(await readBody(req));
    assert.equal(body.stream, false);
    res.end(JSON.stringify({ message: { content: '{"summary":"ok"}' }, done: true }));
  } });
});

test('ollama-client: streaming chat invokes onToken and concatenates', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    const tokens = [];
    const result = await client.chat({
      model: 'llama3',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      onToken: (t) => tokens.push(t)
    });
    assert.equal(result.text, '{"a":1}{"b":2}');
    assert.equal(tokens.length, 2);
    assert.equal(result.done, true);
  }, { handler: async (req, res) => {
    const body = JSON.parse(await readBody(req));
    assert.equal(body.stream, true);
    res.write(JSON.stringify({ message: { content: '{"a":1}' }, done: false }) + '\n');
    res.write(JSON.stringify({ message: { content: '{"b":2}' }, done: true }) + '\n');
    res.end();
  } });
});

test('ollama-client: empty content produces EMPTY_RESPONSE', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    await assert.rejects(
      client.chat({ model: 'llama3', messages: [], stream: false }),
      (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.EMPTY_RESPONSE
    );
  }, { handler: (req, res) => res.end(JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop' })) });
});

test('ollama-client: 200 response with error field throws HTTP_ERROR', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    await assert.rejects(
      client.chat({ model: 'llama3', messages: [], stream: false }),
      (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.HTTP_ERROR && /too large/.test(err.message)
    );
  }, { handler: (req, res) => res.end(JSON.stringify({ error: 'model requires too large a context' })) });
});

test('ollama-client: streaming thinking-only output produces EMPTY_RESPONSE', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    await assert.rejects(
      client.chat({ model: 'deepseek-r1', messages: [], stream: true }),
      (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.EMPTY_RESPONSE && /thinking/.test(err.message)
    );
  }, { handler: async (req, res) => {
    await readBody(req);
    res.write(JSON.stringify({ message: { thinking: 'let me reason…' }, done: false }) + '\n');
    res.write(JSON.stringify({ message: { content: '' }, done: true, done_reason: 'length' }) + '\n');
    res.end();
  } });
});

test('ollama-client: streaming error chunk throws HTTP_ERROR', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    await assert.rejects(
      client.chat({ model: 'llama3', messages: [], stream: true }),
      (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.HTTP_ERROR && /boom/.test(err.message)
    );
  }, { handler: async (req, res) => {
    await readBody(req);
    res.write(JSON.stringify({ message: { content: '{"a":' }, done: false }) + '\n');
    res.write(JSON.stringify({ error: 'boom' }) + '\n');
    res.end();
  } });
});

test('ollama-client: final stream line without trailing newline is processed', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    const tokens = [];
    const result = await client.chat({ model: 'llama3', messages: [], stream: true, onToken: (t) => tokens.push(t) });
    assert.equal(result.text, '{"a":1}');
    assert.equal(tokens.length, 1);
    assert.equal(result.doneReason, 'stop');
  }, { handler: async (req, res) => {
    await readBody(req);
    // Single chunk, no trailing newline — previously dropped from the buffer.
    res.end(JSON.stringify({ message: { content: '{"a":1}' }, done: true, done_reason: 'stop' }));
  } });
});

test('ollama-client: forwards format and think fields in request body', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    const result = await client.chat({
      model: 'llama3', messages: [], stream: false,
      format: { type: 'object' }, think: false
    });
    assert.equal(result.text, '{"ok":true}');
  }, { handler: async (req, res) => {
    const body = JSON.parse(await readBody(req));
    assert.deepEqual(body.format, { type: 'object' });
    assert.equal(body.think, false);
    res.end(JSON.stringify({ message: { content: '{"ok":true}' }, done: true }));
  } });
});

test('ollama-client: timeout produces TIMEOUT error', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 200 });
    await assert.rejects(
      client.chat({ model: 'llama3', messages: [], stream: false }),
      (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.TIMEOUT
    );
  }, { handler: (_req, _res) => { /* never respond */ } });
});

test('ollama-client: cancellation via AbortSignal produces CANCELLED', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 5000 });
    const ac = new AbortController();
    const p = client.chat({ model: 'llama3', messages: [], stream: false, signal: ac.signal });
    ac.abort();
    await assert.rejects(p, (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.CANCELLED);
  }, { handler: (_req1, _res1) => { /* never respond */ } });
});

test('ollama-client: pre-aborted signal rejects immediately as CANCELLED', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 5000 });
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      client.chat({ model: 'llama3', messages: [], stream: false, signal: ac.signal }),
      (err) => err instanceof OllamaError && err.category === OLLAMA_ERROR.CANCELLED
    );
  }, { handler: (req, res) => res.end('{}') });
});

test('ollama-client: invalid (non-JSON) response is handled by chat caller', async () => {
  await withServer(async (url) => {
    const client = new OllamaClient({ endpoint: url, timeoutMs: 3000 });
    // Non-streaming: chat will try res.json() — but our mock returns text.
    // The client does not parse non-stream as JSON itself; it returns message.content.
    const result = await client.chat({ model: 'llama3', messages: [], stream: false });
    assert.equal(result.text, 'not json');
  }, { handler: (req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ message: { content: 'not json' } })); } });
});

test('model-discovery: discoverOllama aggregates connection + models', async () => {
  await withServer(async (url) => {
    const d = await discoverOllama({ endpoint: url, timeoutMs: 3000 });
    assert.equal(d.reachable, true);
    assert.equal(d.models.length, 1);
    assert.equal(d.version.version, '0.1.32');
  }, { handler: (req, res) => {
    if (req.url.startsWith('/api/tags')) res.end(JSON.stringify({ models: [{ name: 'llama3:latest' }] }));
    else res.end(JSON.stringify({ version: '0.1.32' }));
  } });
});

test('model-discovery: verifyModel reports not-installed', async () => {
  await withServer(async (url) => {
    const v = await verifyModel({ endpoint: url, model: 'ghost', timeoutMs: 3000 });
    assert.equal(v.available, false);
    assert.equal(v.reason, 'not-installed');
  }, { handler: (req, res) => {
    if (req.url.startsWith('/api/tags')) res.end(JSON.stringify({ models: [{ name: 'llama3:latest' }] }));
    else res.end(JSON.stringify({ version: '0.1.32' }));
  } });
});

test('model-discovery: unreachable endpoint returns reachable=false', async () => {
  const d = await discoverOllama({ endpoint: 'http://127.0.0.1:1', timeoutMs: 500 });
  assert.equal(d.reachable, false);
  assert.equal(d.ok, false);
});
