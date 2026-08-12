import { verifyCertifiedReplay } from './engine/browser-entry.js?v=659a089d50b6';
import { hashCanonical, sha256Text } from './engine/hash.js?v=659a089d50b6';

const output = document.querySelector('#result');
const setResult = (status, value) => {
  const json = JSON.stringify(value);
  document.body.dataset.status = status;
  document.body.dataset.report = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  output.textContent = json;
};
const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};
const workerProof = (fixtureIds) => new Promise((resolve, reject) => {
  const worker = new Worker('worker.js', { type: 'module' });
  const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker proof timeout')); }, 90000);
  worker.onmessage = ({ data }) => {
    if (data?.type === 'verify-corpus-result') {
      clearTimeout(timer); worker.terminate();
      data.ok ? resolve(data.result) : reject(new Error(data.error));
    }
  };
  worker.onerror = (event) => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
  worker.postMessage({ type: 'verify-corpus', fixtureIds });
});

try {
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['Intrilex 🜂', 'bb4c0e83c96cda657c9485429a37f6d4fb845a2988bb3a45bc925ef2e96409a5']
  ];
  for (const [text, expected] of vectors) {
    const actual = sha256Text(text);
    if (actual !== expected) throw new Error(`SHA-256 vector mismatch for ${JSON.stringify(text)}: ${actual}`);
  }
  const index = await fetchJson('data/replay-index.json');
  const fixtureIds = index.records.map((record) => record.fixtureId);
  const summaries = [];
  const started = performance.now();
  for (const fixtureId of fixtureIds) {
    const replay = await fetchJson(`data/certified-replays/${encodeURIComponent(fixtureId)}.certified.replay.json`);
    const verified = verifyCertifiedReplay(replay);
    summaries.push({ fixtureId, contentHash: replay.contentHash, finalStateHash: replay.finalStateHash, accepted: verified.accepted.length, events: verified.events.length });
  }
  const mainThread = {
    replayCount: summaries.length,
    commandCount: summaries.reduce((sum, item) => sum + item.accepted, 0),
    eventCount: summaries.reduce((sum, item) => sum + item.events, 0),
    aggregateHash: hashCanonical(summaries),
    durationMs: Math.round(performance.now() - started)
  };
  const worker = await workerProof(fixtureIds);
  if (worker.aggregateHash !== mainThread.aggregateHash) throw new Error(`Main/worker aggregate mismatch: ${mainThread.aggregateHash} != ${worker.aggregateHash}`);
  setResult('PASS', { status: 'PASS', userAgent: navigator.userAgent, vectors: vectors.length, mainThread, worker });
} catch (error) {
  setResult('FAIL', { status: 'FAIL', error: error?.stack ?? String(error) });
}
