// Browser-Node anchor parity test: verifies that the browser anchor.js and the
// Node anchor.mjs produce identical verification results for the same inputs.
// This is the parity gate required by Phase 6 / Section 7.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from '@intrilex/shared';
import * as nodeAnchor from '@intrilex/decision-intelligence/anchor';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// Load the browser anchor.js as a plain module (it's zero-dependency).
const browserAnchorPath = path.join(root, 'apps/lab-web/src/anchor.js');
const browserAnchorUrl = `file://${browserAnchorPath.replace(/\\/g, '/')}`;
const browserAnchor = await import(browserAnchorUrl);

// Install hash in both
nodeAnchor.installAnchorHash(hashCanonical);
browserAnchor.installAnchorHash(hashCanonical);

// Real retained authority — dynamically find a valid match
import { readdirSync } from 'node:fs';
const traceDirPath = path.join(root, 'sample-data/autonomy/decision-traces');
const availableTraces = readdirSync(traceDirPath).filter(f => f.endsWith('.json'));
const firstTraceFile = JSON.parse(read(`sample-data/autonomy/decision-traces/${availableTraces[0]}`));
const MATCH_ID = firstTraceFile.matchId;
const DECISION_ID = firstTraceFile.traces[0].decisionId;
const traceFile = firstTraceFile;
const trace = traceFile.traces.find((t) => t.decisionId === DECISION_ID);

const anchor = {
  matchId: MATCH_ID,
  replayContentHash: 'a'.repeat(64),
  replayIntegrityHash: 'b'.repeat(64),
  decisionId: DECISION_ID,
  decisionIndex: 0,
  replayCommandIndex: 1,
  beforeStateHash: 'c'.repeat(64),
  actorId: 'P1',
  seat: 1,
  legalActionSetHash: 'd'.repeat(64),
  selectedActionId: trace.selectedActionId,
  selectedCommandHash: 'e'.repeat(64),
  postSelectedActionStateHash: 'f'.repeat(64),
  engineVersion: '4.2.6',
  rulesVersion: '4.1.2'
};

const retainedRecord = {
  decisionId: DECISION_ID,
  decisionIndex: 0,
  checkpointHash: trace.checkpointHash,
  seat: 1,
  selectedActionId: trace.selectedActionId
};

const restoredAuthority = {
  matchId: MATCH_ID,
  replayContentHash: 'a'.repeat(64),
  replayIntegrityHash: 'b'.repeat(64),
  replayEngineVersion: '4.2.6',
  replayRulesVersion: '4.1.2',
  replayCommandCount: 131,
  checkpointIndex: 0,
  beforeStateHash: 'c'.repeat(64),
  legalActionSetHash: 'd'.repeat(64),
  legalActionIds: [trace.selectedActionId, 'other'],
  frameActorId: 'P1',
  frameSeat: 1,
  selectedCommandHash: 'e'.repeat(64),
  postSelectedActionStateHash: 'f'.repeat(64),
  commandHashAtReplayCommandIndex: 'e'.repeat(64),
  derivedReplayCommandIndex: 1
};

describe('Browser-Node anchor parity', () => {
  it('anchor.js and anchor.mjs are byte-identical (single source of truth)', () => {
    const nodeSrc = readFileSync(path.join(root, 'packages/decision-intelligence/src/anchor.mjs'));
    const browserSrc = readFileSync(path.join(root, 'apps/lab-web/src/anchor.js'));
    assert.deepEqual(Buffer.from(nodeSrc), Buffer.from(browserSrc),
      'anchor.mjs and anchor.js must be byte-identical');
  });

  it('both resolvers produce identical results for authentic anchor', () => {
    const n = nodeAnchor.verifyAnchorAuthority({ anchor, retainedRecord, restoredAuthority });
    const b = browserAnchor.verifyAnchorAuthority({ anchor, retainedRecord, restoredAuthority });
    assert.deepEqual(n, b);
  });

  it('both resolvers produce identical results for synthetic decisionId', () => {
    const bad = { ...anchor, decisionId: 'DT-FAKE' };
    const n = nodeAnchor.verifyAnchorAuthority({ anchor: bad, retainedRecord, restoredAuthority });
    const b = browserAnchor.verifyAnchorAuthority({ anchor: bad, retainedRecord, restoredAuthority });
    assert.deepEqual(n, b);
    assert.equal(n.valid, false);
  });

  it('both resolvers produce identical results for wrong actor', () => {
    const bad = { ...anchor, actorId: 'WRONG' };
    const n = nodeAnchor.verifyAnchorAuthority({ anchor: bad, retainedRecord, restoredAuthority });
    const b = browserAnchor.verifyAnchorAuthority({ anchor: bad, retainedRecord, restoredAuthority });
    assert.deepEqual(n, b);
    assert.equal(n.valid, false);
  });

  it('both resolvers produce identical results for truncated hash', () => {
    const bad = { ...anchor, beforeStateHash: 'c'.repeat(16) };
    const n = nodeAnchor.verifyAnchorAuthority({ anchor: bad, retainedRecord, restoredAuthority });
    const b = browserAnchor.verifyAnchorAuthority({ anchor: bad, retainedRecord, restoredAuthority });
    assert.deepEqual(n, b);
    assert.equal(n.valid, false);
  });

  it('both resolvers produce identical verifiedAnchorHash', () => {
    const n = nodeAnchor.verifiedAnchorHash(anchor, retainedRecord, restoredAuthority);
    const b = browserAnchor.verifiedAnchorHash(anchor, retainedRecord, restoredAuthority);
    assert.equal(n, b, 'verifiedAnchorHash must be identical across Node and browser');
  });

  it('both resolvers export the same API surface', () => {
    const nodeKeys = Object.keys(nodeAnchor).sort();
    const browserKeys = Object.keys(browserAnchor).sort();
    assert.deepEqual(nodeKeys, browserKeys,
      `API mismatch: Node=${nodeKeys.join(',')} Browser=${browserKeys.join(',')}`);
  });
});

