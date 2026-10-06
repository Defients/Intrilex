// ═══════════════════════════════════════════════════════════════
// forensic-replay.test.mjs — Forensic replay model tests
//
// Tests for:
//   - Forensic session creation and validation
//   - Bookmark management (add, remove, update, query)
//   - Branch management (add, remove, attach frames, query)
//   - Annotation management (add, remove, query)
//   - Comparison management (add, remove)
//   - Import/export serialization
//   - Puzzle generation from replay positions
//   - Branch reconstruction
//   - Persistence layer (localStorage fallback)
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FORENSIC_SCHEMA_VERSION,
  generateId,
  createForensicSession,
  validateForensicSession,
  addBookmark,
  removeBookmark,
  updateBookmark,
  sortedBookmarks,
  findBookmarkAtFrame,
  addBranch,
  removeBranch,
  attachBranchFrames,
  branchesAtFrame,
  addAnnotation,
  removeAnnotation,
  annotationsAtFrame,
  addComparison,
  removeComparison,
  frameSummary,
  exportForensicSession,
  importForensicSession,
} from '../apps/lab-web/src/forensic/forensic-model.mjs';

import {
  derivePuzzleFromReplay,
  suggestObjectiveType,
  derivePuzzlesFromFrames,
} from '../apps/lab-web/src/forensic/puzzle-generator.mjs';

import { PUZZLE_SCHEMA_VERSION, PuzzleObjectiveType } from '../apps/lab-web/src/play/puzzle/puzzle-types.mjs';

// ── Helpers ─────────────────────────────────────────────────────

function makeMockReplay() {
  return {
    format: 'intrilex-replay',
    version: 2,
    fixtureId: 'TEST-001',
    matchId: 'TEST-001',
    profileId: 'first-contact-trigger-closure',
    seed: 12345,
    initialState: { players: { P1: { hand: [], pr: [], er: [] }, P2: { hand: [], pr: [], er: [] } } },
    commands: [
      { type: 'DRAW', actorId: 'P1' },
      { type: 'SCORE', actorId: 'P1', cardId: '7H' },
      { type: 'DRAW', actorId: 'P2' },
      { type: 'SCORE', actorId: 'P2', cardId: '5C' },
    ],
    events: [],
    checkpoints: [],
    integrityHash: 'abc123',
  };
}

// ═══════════════════════════════════════════════════════════════
// FORENSIC SESSION
// ═══════════════════════════════════════════════════════════════

test('Forensic: createForensicSession creates valid session', () => {
  const session = createForensicSession('R-TEST-001');
  assert.equal(session.schemaVersion, FORENSIC_SCHEMA_VERSION);
  assert.equal(session.replayId, 'R-TEST-001');
  assert.deepEqual(session.bookmarks, []);
  assert.deepEqual(session.branches, []);
  assert.deepEqual(session.annotations, []);
  assert.deepEqual(session.comparisons, []);
  assert.ok(session.createdAt);
  assert.ok(session.updatedAt);
});

test('Forensic: createForensicSession rejects invalid replayId', () => {
  assert.throws(() => createForensicSession(''), { message: 'FORENSIC_INVALID_REPLAY_ID' });
  assert.throws(() => createForensicSession(null), { message: 'FORENSIC_INVALID_REPLAY_ID' });
  assert.throws(() => createForensicSession(123), { message: 'FORENSIC_INVALID_REPLAY_ID' });
});

test('Forensic: validateForensicSession accepts valid session', () => {
  const session = createForensicSession('R-TEST-002');
  const { valid, errors } = validateForensicSession(session);
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test('Forensic: validateForensicSession rejects invalid session', () => {
  const { valid, errors } = validateForensicSession(null);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('Forensic: validateForensicSession rejects wrong schema version', () => {
  const { valid, errors } = validateForensicSession({ schemaVersion: 999, replayId: 'X', bookmarks: [], branches: [], annotations: [], comparisons: [] });
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.includes('Schema version')));
});

test('Forensic: generateId returns unique strings', () => {
  const id1 = generateId();
  const id2 = generateId();
  assert.ok(typeof id1 === 'string' && id1.length > 0);
  assert.ok(typeof id2 === 'string' && id2.length > 0);
  assert.notEqual(id1, id2);
});

// ═══════════════════════════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════════════════════════

test('Forensic: addBookmark adds a bookmark', () => {
  const session = createForensicSession('R-BM-001');
  const updated = addBookmark(session, { frameIndex: 5, label: 'Key decision', note: 'Could have countered here' });
  assert.equal(updated.bookmarks.length, 1);
  assert.equal(updated.bookmarks[0].frameIndex, 5);
  assert.equal(updated.bookmarks[0].label, 'Key decision');
  assert.equal(updated.bookmarks[0].note, 'Could have countered here');
  assert.ok(updated.bookmarks[0].id);
  assert.ok(updated.bookmarks[0].createdAt);
  // updatedAt should be a valid ISO string (may equal session.updatedAt if same ms)
  assert.ok(typeof updated.updatedAt === 'string');
});

test('Forensic: addBookmark rejects invalid frameIndex', () => {
  const session = createForensicSession('R-BM-002');
  assert.throws(() => addBookmark(session, { frameIndex: -1 }), { message: 'FORENSIC_INVALID_FRAME_INDEX' });
  assert.throws(() => addBookmark(session, { frameIndex: 'abc' }), { message: 'FORENSIC_INVALID_FRAME_INDEX' });
});

test('Forensic: addBookmark is immutable (original session unchanged)', () => {
  const session = createForensicSession('R-BM-003');
  addBookmark(session, { frameIndex: 1 });
  assert.equal(session.bookmarks.length, 0, 'Original session should not be mutated');
});

test('Forensic: removeBookmark removes by ID', () => {
  let session = createForensicSession('R-BM-004');
  session = addBookmark(session, { frameIndex: 3 });
  session = addBookmark(session, { frameIndex: 7 });
  const idToRemove = session.bookmarks[0].id;
  session = removeBookmark(session, idToRemove);
  assert.equal(session.bookmarks.length, 1);
  assert.equal(session.bookmarks[0].frameIndex, 7);
});

test('Forensic: updateBookmark updates label and note', () => {
  let session = createForensicSession('R-BM-005');
  session = addBookmark(session, { frameIndex: 2, label: 'Old', note: 'Old note' });
  const id = session.bookmarks[0].id;
  session = updateBookmark(session, id, { label: 'New label', note: 'New note' });
  assert.equal(session.bookmarks[0].label, 'New label');
  assert.equal(session.bookmarks[0].note, 'New note');
});

test('Forensic: sortedBookmarks returns sorted by frameIndex', () => {
  let session = createForensicSession('R-BM-006');
  session = addBookmark(session, { frameIndex: 10 });
  session = addBookmark(session, { frameIndex: 2 });
  session = addBookmark(session, { frameIndex: 5 });
  const sorted = sortedBookmarks(session);
  assert.deepEqual(sorted.map(b => b.frameIndex), [2, 5, 10]);
});

test('Forensic: findBookmarkAtFrame finds exact match', () => {
  let session = createForensicSession('R-BM-007');
  session = addBookmark(session, { frameIndex: 5 });
  const found = findBookmarkAtFrame(session, 5);
  assert.ok(found);
  assert.equal(found.frameIndex, 5);
});

test('Forensic: findBookmarkAtFrame with tolerance', () => {
  let session = createForensicSession('R-BM-008');
  session = addBookmark(session, { frameIndex: 5 });
  const found = findBookmarkAtFrame(session, 7, 3);
  assert.ok(found);
  assert.equal(found.frameIndex, 5);
  const notFound = findBookmarkAtFrame(session, 20, 3);
  assert.equal(notFound, null);
});

// ═══════════════════════════════════════════════════════════════
// BRANCHES
// ═══════════════════════════════════════════════════════════════

test('Forensic: addBranch adds a branch', () => {
  const session = createForensicSession('R-BR-001');
  const updated = addBranch(session, {
    parentFrameIndex: 3,
    alternateCommands: [{ type: 'SCORE', actorId: 'P1', cardId: 'KS' }],
    label: 'Alt line: King play',
  });
  assert.equal(updated.branches.length, 1);
  assert.equal(updated.branches[0].parentFrameIndex, 3);
  assert.equal(updated.branches[0].label, 'Alt line: King play');
  assert.equal(updated.branches[0].frames, null);
  assert.ok(updated.branches[0].id);
});

test('Forensic: addBranch rejects invalid inputs', () => {
  const session = createForensicSession('R-BR-002');
  assert.throws(() => addBranch(session, { parentFrameIndex: -1, alternateCommands: [] }), { message: 'FORENSIC_INVALID_FRAME_INDEX' });
  assert.throws(() => addBranch(session, { parentFrameIndex: 0, alternateCommands: 'not-array' }), { message: 'FORENSIC_INVALID_COMMANDS' });
});

test('Forensic: removeBranch removes by ID', () => {
  let session = createForensicSession('R-BR-003');
  session = addBranch(session, { parentFrameIndex: 1, alternateCommands: [] });
  session = addBranch(session, { parentFrameIndex: 2, alternateCommands: [] });
  const idToRemove = session.branches[0].id;
  session = removeBranch(session, idToRemove);
  assert.equal(session.branches.length, 1);
  assert.equal(session.branches[0].parentFrameIndex, 2);
});

test('Forensic: attachBranchFrames sets frames on a branch', () => {
  let session = createForensicSession('R-BR-004');
  session = addBranch(session, { parentFrameIndex: 1, alternateCommands: [{ type: 'DRAW' }] });
  const id = session.branches[0].id;
  const mockFrames = [{ state: {}, events: [], command: null, frameIndex: 0 }];
  session = attachBranchFrames(session, id, mockFrames);
  assert.deepEqual(session.branches[0].frames, mockFrames);
});

test('Forensic: branchesAtFrame returns branches at a specific frame', () => {
  let session = createForensicSession('R-BR-005');
  session = addBranch(session, { parentFrameIndex: 3, alternateCommands: [] });
  session = addBranch(session, { parentFrameIndex: 5, alternateCommands: [] });
  session = addBranch(session, { parentFrameIndex: 3, alternateCommands: [] });
  const atFrame3 = branchesAtFrame(session, 3);
  assert.equal(atFrame3.length, 2);
  const atFrame5 = branchesAtFrame(session, 5);
  assert.equal(atFrame5.length, 1);
});

// ═══════════════════════════════════════════════════════════════
// ANNOTATIONS
// ═══════════════════════════════════════════════════════════════

test('Forensic: addAnnotation adds an annotation', () => {
  const session = createForensicSession('R-AN-001');
  const updated = addAnnotation(session, { frameIndex: 4, text: 'This was a mistake' });
  assert.equal(updated.annotations.length, 1);
  assert.equal(updated.annotations[0].frameIndex, 4);
  assert.equal(updated.annotations[0].text, 'This was a mistake');
});

test('Forensic: addAnnotation rejects invalid text', () => {
  const session = createForensicSession('R-AN-002');
  assert.throws(() => addAnnotation(session, { frameIndex: 0, text: '' }), { message: 'FORENSIC_INVALID_ANNOTATION_TEXT' });
  assert.throws(() => addAnnotation(session, { frameIndex: 0, text: null }), { message: 'FORENSIC_INVALID_ANNOTATION_TEXT' });
});

test('Forensic: removeAnnotation removes by ID', () => {
  let session = createForensicSession('R-AN-003');
  session = addAnnotation(session, { frameIndex: 1, text: 'A' });
  session = addAnnotation(session, { frameIndex: 2, text: 'B' });
  const idToRemove = session.annotations[0].id;
  session = removeAnnotation(session, idToRemove);
  assert.equal(session.annotations.length, 1);
  assert.equal(session.annotations[0].text, 'B');
});

test('Forensic: annotationsAtFrame returns annotations sorted by creation', () => {
  let session = createForensicSession('R-AN-004');
  session = addAnnotation(session, { frameIndex: 5, text: 'Second' });
  session = addAnnotation(session, { frameIndex: 5, text: 'Third' });
  session = addAnnotation(session, { frameIndex: 3, text: 'Other frame' });
  const atFrame5 = annotationsAtFrame(session, 5);
  assert.equal(atFrame5.length, 2);
  assert.equal(atFrame5[0].text, 'Second');
  assert.equal(atFrame5[1].text, 'Third');
});

// ═══════════════════════════════════════════════════════════════
// COMPARISONS
// ═══════════════════════════════════════════════════════════════

test('Forensic: addComparison adds a comparison', () => {
  const session = createForensicSession('R-CMP-001');
  const updated = addComparison(session, {
    label: 'Compare two openings',
    entries: [
      { replayId: 'R-001', frameIndex: 5 },
      { replayId: 'R-002', frameIndex: 5 },
    ],
  });
  assert.equal(updated.comparisons.length, 1);
  assert.equal(updated.comparisons[0].label, 'Compare two openings');
  assert.equal(updated.comparisons[0].entries.length, 2);
});

test('Forensic: addComparison requires at least 2 entries', () => {
  const session = createForensicSession('R-CMP-002');
  assert.throws(() => addComparison(session, { label: 'X', entries: [{ replayId: 'R', frameIndex: 0 }] }), { message: 'FORENSIC_INVALID_COMPARISON_ENTRIES' });
});

test('Forensic: addComparison rejects invalid label', () => {
  const session = createForensicSession('R-CMP-003');
  assert.throws(() => addComparison(session, { label: '', entries: [{ replayId: 'R', frameIndex: 0 }, { replayId: 'R2', frameIndex: 0 }] }), { message: 'FORENSIC_INVALID_COMPARISON_LABEL' });
});

test('Forensic: removeComparison removes by ID', () => {
  let session = createForensicSession('R-CMP-004');
  session = addComparison(session, { label: 'A', entries: [{ replayId: 'R', frameIndex: 0 }, { replayId: 'R2', frameIndex: 0 }] });
  session = addComparison(session, { label: 'B', entries: [{ replayId: 'R', frameIndex: 1 }, { replayId: 'R2', frameIndex: 1 }] });
  const idToRemove = session.comparisons[0].id;
  session = removeComparison(session, idToRemove);
  assert.equal(session.comparisons.length, 1);
  assert.equal(session.comparisons[0].label, 'B');
});

// ═══════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════

test('Forensic: frameSummary aggregates activity at a frame', () => {
  let session = createForensicSession('R-FS-001');
  session = addBookmark(session, { frameIndex: 5 });
  session = addBranch(session, { parentFrameIndex: 5, alternateCommands: [] });
  session = addAnnotation(session, { frameIndex: 5, text: 'Note' });
  const summary = frameSummary(session, 5);
  assert.equal(summary.hasBookmark, true);
  assert.equal(summary.bookmarkCount, 1);
  assert.equal(summary.branchCount, 1);
  assert.equal(summary.annotationCount, 1);
});

test('Forensic: frameSummary for empty frame', () => {
  const session = createForensicSession('R-FS-002');
  const summary = frameSummary(session, 99);
  assert.equal(summary.hasBookmark, false);
  assert.equal(summary.bookmarkCount, 0);
  assert.equal(summary.branchCount, 0);
  assert.equal(summary.annotationCount, 0);
});

// ═══════════════════════════════════════════════════════════════
// IMPORT / EXPORT
// ═══════════════════════════════════════════════════════════════

test('Forensic: exportForensicSession produces valid JSON', () => {
  let session = createForensicSession('R-EX-001');
  session = addBookmark(session, { frameIndex: 1, label: 'Test' });
  const json = exportForensicSession(session);
  assert.ok(typeof json === 'string');
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'intrilex-forensic-session');
  assert.equal(parsed.version, FORENSIC_SCHEMA_VERSION);
  assert.equal(parsed.replayId, 'R-EX-001');
  assert.equal(parsed.bookmarks.length, 1);
});

test('Forensic: importForensicSession round-trips correctly', () => {
  let session = createForensicSession('R-EX-002');
  session = addBookmark(session, { frameIndex: 3, label: 'BM' });
  session = addAnnotation(session, { frameIndex: 3, text: 'Note' });
  const json = exportForensicSession(session);
  const imported = importForensicSession(json);
  assert.equal(imported.replayId, 'R-EX-002');
  assert.equal(imported.bookmarks.length, 1);
  assert.equal(imported.bookmarks[0].label, 'BM');
  assert.equal(imported.annotations.length, 1);
  assert.equal(imported.annotations[0].text, 'Note');
});

test('Forensic: importForensicSession rejects invalid format', () => {
  assert.throws(() => importForensicSession(JSON.stringify({ format: 'wrong' })), { message: 'FORENSIC_INVALID_FORMAT' });
});

// ═══════════════════════════════════════════════════════════════
// PUZZLE GENERATION
// ═══════════════════════════════════════════════════════════════

test('PuzzleGen: derivePuzzleFromReplay creates valid puzzle', () => {
  const replay = makeMockReplay();
  const puzzle = derivePuzzleFromReplay({
    certifiedReplay: replay,
    frameIndex: 2,
    perspectivePlayerId: 'P1',
  });
  assert.equal(puzzle.schemaVersion, PUZZLE_SCHEMA_VERSION);
  assert.ok(puzzle.id.includes('REPLAY'));
  assert.ok(puzzle.id.includes('F2'));
  assert.equal(puzzle.perspectivePlayerId, 'P1');
  assert.equal(puzzle.setupCommands.length, 2);
  assert.equal(puzzle.objective.type, PuzzleObjectiveType.WIN_THIS_TURN);
  assert.equal(puzzle.opponentPolicy.kind, 'first-legal');
  assert.equal(puzzle.metadata.source, 'match');
  assert.ok(puzzle.metadata.tags.includes('replay-derived'));
});

test('PuzzleGen: derivePuzzleFromReplay respects custom objective', () => {
  const replay = makeMockReplay();
  const puzzle = derivePuzzleFromReplay({
    certifiedReplay: replay,
    frameIndex: 3,
    perspectivePlayerId: 'P2',
    objectiveType: PuzzleObjectiveType.WIN_WITHIN_TURNS,
    maxTurns: 5,
  });
  assert.equal(puzzle.objective.type, PuzzleObjectiveType.WIN_WITHIN_TURNS);
  assert.equal(puzzle.objective.maxTurns, 5);
});

test('PuzzleGen: derivePuzzleFromReplay respects SURVIVE_TURNS', () => {
  const replay = makeMockReplay();
  const puzzle = derivePuzzleFromReplay({
    certifiedReplay: replay,
    frameIndex: 1,
    perspectivePlayerId: 'P1',
    objectiveType: PuzzleObjectiveType.SURVIVE_TURNS,
    surviveTurns: 4,
  });
  assert.equal(puzzle.objective.type, PuzzleObjectiveType.SURVIVE_TURNS);
  assert.equal(puzzle.objective.turns, 4);
});

test('PuzzleGen: derivePuzzleFromReplay rejects invalid replay', () => {
  assert.throws(() => derivePuzzleFromReplay({ certifiedReplay: null, frameIndex: 1, perspectivePlayerId: 'P1' }), { message: 'PUZZLE_GEN_INVALID_REPLAY' });
  assert.throws(() => derivePuzzleFromReplay({ certifiedReplay: {}, frameIndex: 1, perspectivePlayerId: 'P1' }), { message: 'PUZZLE_GEN_INVALID_REPLAY' });
});

test('PuzzleGen: derivePuzzleFromReplay rejects invalid frame index', () => {
  const replay = makeMockReplay();
  assert.throws(() => derivePuzzleFromReplay({ certifiedReplay: replay, frameIndex: 0, perspectivePlayerId: 'P1' }), { message: 'PUZZLE_GEN_INVALID_FRAME_INDEX' });
  assert.throws(() => derivePuzzleFromReplay({ certifiedReplay: replay, frameIndex: -1, perspectivePlayerId: 'P1' }), { message: 'PUZZLE_GEN_INVALID_FRAME_INDEX' });
});

test('PuzzleGen: suggestObjectiveType returns WIN_THIS_TURN when close to goal', () => {
  const state = {
    players: {
      P1: { securedPoints: 15, goal: 21 },
      P2: { securedPoints: 5, goal: 21 },
    },
  };
  assert.equal(suggestObjectiveType(state, 'P1'), PuzzleObjectiveType.WIN_THIS_TURN);
});

test('PuzzleGen: suggestObjectiveType returns SURVIVE_TURNS when opponent close', () => {
  const state = {
    players: {
      P1: { securedPoints: 5, goal: 21 },
      P2: { securedPoints: 18, goal: 21 },
    },
  };
  assert.equal(suggestObjectiveType(state, 'P1'), PuzzleObjectiveType.SURVIVE_TURNS);
});

test('PuzzleGen: suggestObjectiveType returns WIN_WITHIN_TURNS as default', () => {
  const state = {
    players: {
      P1: { securedPoints: 5, goal: 21 },
      P2: { securedPoints: 5, goal: 21 },
    },
  };
  assert.equal(suggestObjectiveType(state, 'P1'), PuzzleObjectiveType.WIN_WITHIN_TURNS);
});

test('PuzzleGen: suggestObjectiveType handles missing state', () => {
  assert.equal(suggestObjectiveType(null, 'P1'), PuzzleObjectiveType.WIN_WITHIN_TURNS);
  assert.equal(suggestObjectiveType({}, 'P1'), PuzzleObjectiveType.WIN_WITHIN_TURNS);
});

test('PuzzleGen: derivePuzzlesFromFrames batch generates', () => {
  const replay = makeMockReplay();
  const puzzles = derivePuzzlesFromFrames(replay, [1, 2, 3], 'P1');
  assert.equal(puzzles.length, 3);
  assert.ok(puzzles.every(p => p.schemaVersion === PUZZLE_SCHEMA_VERSION));
  assert.ok(puzzles.every(p => p.metadata.tags.includes('replay-derived')));
});

test('PuzzleGen: derivePuzzlesFromFrames handles empty input', () => {
  const replay = makeMockReplay();
  const puzzles = derivePuzzlesFromFrames(replay, [], 'P1');
  assert.deepEqual(puzzles, []);
});

// ═══════════════════════════════════════════════════════════════
// SOURCE INSPECTION: Persistence and branch reconstructor
// ═══════════════════════════════════════════════════════════════

const forensicPersistenceSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/forensic/forensic-persistence.mjs'), 'utf8');
const branchReconstructorSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/forensic/branch-reconstructor.mjs'), 'utf8');

test('Forensic persistence: exports saveForensicSession', () => {
  assert.ok(forensicPersistenceSrc.includes('export async function saveForensicSession'));
});

test('Forensic persistence: exports loadForensicSession', () => {
  assert.ok(forensicPersistenceSrc.includes('export async function loadForensicSession'));
});

test('Forensic persistence: exports deleteForensicSession', () => {
  assert.ok(forensicPersistenceSrc.includes('export async function deleteForensicSession'));
});

test('Forensic persistence: exports listForensicSessionIds', () => {
  assert.ok(forensicPersistenceSrc.includes('export async function listForensicSessionIds'));
});

test('Forensic persistence: has localStorage fallback', () => {
  assert.ok(forensicPersistenceSrc.includes('localStorage'));
  assert.ok(forensicPersistenceSrc.includes('intrilex:forensic:'));
});

test('Forensic persistence: uses separate database', () => {
  assert.ok(forensicPersistenceSrc.includes('intrilex-forensic'));
  assert.ok(forensicPersistenceSrc.includes('openForensicDB'));
});

test('Branch reconstructor: exports reconstructBranchFrames', () => {
  assert.ok(branchReconstructorSrc.includes('export async function reconstructBranchFrames'));
});

test('Branch reconstructor: lazy-loads engine', () => {
  assert.ok(branchReconstructorSrc.includes("import('../engine/browser-entry.js')"));
});

test('Branch reconstructor: replays original commands then alternate', () => {
  assert.ok(branchReconstructorSrc.includes('originalCommands'));
  assert.ok(branchReconstructorSrc.includes('alternateCommands'));
  assert.ok(branchReconstructorSrc.includes('isBranch: true'));
});

// ═══════════════════════════════════════════════════════════════
// EDGE CASES — Length limits and truncation
// ═══════════════════════════════════════════════════════════════

import {
  MAX_ANNOTATION_LENGTH,
  MAX_BOOKMARK_LABEL_LENGTH,
  MAX_BOOKMARK_NOTE_LENGTH,
  MAX_BRANCH_LABEL_LENGTH,
} from '../apps/lab-web/src/forensic/forensic-model.mjs';

test('Forensic: addBookmark truncates long labels', () => {
  const session = createForensicSession('R-TRUNC-001');
  const longLabel = 'A'.repeat(MAX_BOOKMARK_LABEL_LENGTH + 100);
  const updated = addBookmark(session, { frameIndex: 1, label: longLabel });
  assert.equal(updated.bookmarks[0].label.length, MAX_BOOKMARK_LABEL_LENGTH);
});

test('Forensic: addBookmark truncates long notes', () => {
  const session = createForensicSession('R-TRUNC-002');
  const longNote = 'B'.repeat(MAX_BOOKMARK_NOTE_LENGTH + 100);
  const updated = addBookmark(session, { frameIndex: 1, note: longNote });
  assert.equal(updated.bookmarks[0].note.length, MAX_BOOKMARK_NOTE_LENGTH);
});

test('Forensic: addAnnotation truncates long text', () => {
  const session = createForensicSession('R-TRUNC-003');
  const longText = 'C'.repeat(MAX_ANNOTATION_LENGTH + 100);
  const updated = addAnnotation(session, { frameIndex: 1, text: longText });
  assert.equal(updated.annotations[0].text.length, MAX_ANNOTATION_LENGTH);
});

test('Forensic: addBranch truncates long labels', () => {
  const session = createForensicSession('R-TRUNC-004');
  const longLabel = 'D'.repeat(MAX_BRANCH_LABEL_LENGTH + 100);
  const updated = addBranch(session, { parentFrameIndex: 1, alternateCommands: [], label: longLabel });
  assert.equal(updated.branches[0].label.length, MAX_BRANCH_LABEL_LENGTH);
});

test('Forensic: addBookmark handles non-string label gracefully', () => {
  const session = createForensicSession('R-TRUNC-005');
  // @ts-ignore — testing runtime coercion
  const updated = addBookmark(session, { frameIndex: 1, label: 12345 });
  assert.equal(updated.bookmarks[0].label, '12345');
});

test('Forensic: addAnnotation rejects whitespace-only text', () => {
  const session = createForensicSession('R-TRUNC-006');
  assert.throws(() => addAnnotation(session, { frameIndex: 1, text: '   ' }), { message: 'FORENSIC_INVALID_ANNOTATION_TEXT' });
});

// ═══════════════════════════════════════════════════════════════
// EDGE CASES — Immutability
// ═══════════════════════════════════════════════════════════════

test('Forensic: addAnnotation is immutable', () => {
  const session = createForensicSession('R-IMM-001');
  addAnnotation(session, { frameIndex: 1, text: 'Test' });
  assert.equal(session.annotations.length, 0, 'Original session should not be mutated');
});

test('Forensic: addBranch is immutable', () => {
  const session = createForensicSession('R-IMM-002');
  addBranch(session, { parentFrameIndex: 1, alternateCommands: [{ type: 'DRAW' }] });
  assert.equal(session.branches.length, 0, 'Original session should not be mutated');
});

test('Forensic: addComparison is immutable', () => {
  const session = createForensicSession('R-IMM-003');
  addComparison(session, { label: 'Test', entries: [{ replayId: 'R1', frameIndex: 0 }, { replayId: 'R2', frameIndex: 0 }] });
  assert.equal(session.comparisons.length, 0, 'Original session should not be mutated');
});

test('Forensic: removeBookmark is immutable', () => {
  let session = createForensicSession('R-IMM-004');
  session = addBookmark(session, { frameIndex: 1 });
  const original = session;
  session = removeBookmark(session, session.bookmarks[0].id);
  assert.equal(original.bookmarks.length, 1, 'Original session should not be mutated by remove');
});

// ═══════════════════════════════════════════════════════════════
// EDGE CASES — Export/import with edge data
// ═══════════════════════════════════════════════════════════════

test('Forensic: export empty session produces valid JSON', () => {
  const session = createForensicSession('R-EXP-003');
  const json = exportForensicSession(session);
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'intrilex-forensic-session');
  assert.equal(parsed.bookmarks.length, 0);
  assert.equal(parsed.branches.length, 0);
});

test('Forensic: import rejects malformed JSON', () => {
  assert.throws(() => importForensicSession('not json'), { message: /Unexpected|JSON/ });
});

test('Forensic: import rejects session with missing arrays', () => {
  const badJson = JSON.stringify({
    format: 'intrilex-forensic-session',
    version: FORENSIC_SCHEMA_VERSION,
    replayId: 'R-BAD-001',
    // Missing bookmarks, branches, annotations, comparisons
  });
  assert.throws(() => importForensicSession(badJson), /FORENSIC_IMPORT_INVALID/);
});

// ═══════════════════════════════════════════════════════════════
// PUZZLE GENERATION — Edge cases
// ═══════════════════════════════════════════════════════════════

test('PuzzleGen: derivePuzzleFromReplay with empty commands array', () => {
  const replay = { ...makeMockReplay(), commands: [] };
  // Frame 1 with empty commands produces empty setupCommands (initial state puzzle).
  // This is technically valid — the puzzle starts from the initial state.
  const puzzle = derivePuzzleFromReplay({
    certifiedReplay: replay,
    frameIndex: 1,
    perspectivePlayerId: 'P1',
  });
  assert.equal(puzzle.setupCommands.length, 0);
  // Frame 0 is rejected by the frameIndex < 1 check
  assert.throws(() => derivePuzzleFromReplay({
    certifiedReplay: replay,
    frameIndex: 0,
    perspectivePlayerId: 'P1',
  }), { message: 'PUZZLE_GEN_INVALID_FRAME_INDEX' });
});

test('PuzzleGen: derivePuzzleFromReplay with AI opponent policy', () => {
  const replay = makeMockReplay();
  const puzzle = derivePuzzleFromReplay({
    certifiedReplay: replay,
    frameIndex: 2,
    perspectivePlayerId: 'P1',
    opponentPolicyKind: 'ai',
    aiPolicyId: 'score-rush',
  });
  assert.equal(puzzle.opponentPolicy.kind, 'ai');
  assert.equal(puzzle.opponentPolicy.aiPolicyId, 'score-rush');
});

test('PuzzleGen: derivePuzzleFromReplay with scripted opponent', () => {
  const replay = makeMockReplay();
  const puzzle = derivePuzzleFromReplay({
    certifiedReplay: replay,
    frameIndex: 2,
    perspectivePlayerId: 'P1',
    opponentPolicyKind: 'scripted',
  });
  assert.equal(puzzle.opponentPolicy.kind, 'scripted');
  assert.deepEqual(puzzle.opponentPolicy.scriptedActionIds, []);
});

test('PuzzleGen: puzzle ID is deterministic for same replay+frame', () => {
  const replay = makeMockReplay();
  const puzzle1 = derivePuzzleFromReplay({ certifiedReplay: replay, frameIndex: 2, perspectivePlayerId: 'P1' });
  const puzzle2 = derivePuzzleFromReplay({ certifiedReplay: replay, frameIndex: 2, perspectivePlayerId: 'P1' });
  assert.equal(puzzle1.id, puzzle2.id);
});

test('PuzzleGen: puzzle ID differs for different frames', () => {
  const replay = makeMockReplay();
  const puzzle1 = derivePuzzleFromReplay({ certifiedReplay: replay, frameIndex: 1, perspectivePlayerId: 'P1' });
  const puzzle2 = derivePuzzleFromReplay({ certifiedReplay: replay, frameIndex: 2, perspectivePlayerId: 'P1' });
  assert.notEqual(puzzle1.id, puzzle2.id);
});

test('PuzzleGen: setupCommands is correct prefix', () => {
  const replay = makeMockReplay();
  // Frame 3 → setupCommands = commands[0..2] (first 3 commands)
  const puzzle = derivePuzzleFromReplay({ certifiedReplay: replay, frameIndex: 3, perspectivePlayerId: 'P1' });
  assert.equal(puzzle.setupCommands.length, 3);
  assert.deepEqual(puzzle.setupCommands[0], replay.commands[0]);
  assert.deepEqual(puzzle.setupCommands[2], replay.commands[2]);
});

// ═══════════════════════════════════════════════════════════════
// VIEWER INTEGRATION — Source inspection
// ═══════════════════════════════════════════════════════════════

const forensicViewerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/forensic/forensic-viewer.mjs'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');
const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');

test('Viewer: exports initForensicViewer', () => {
  assert.ok(forensicViewerSrc.includes('export async function initForensicViewer'));
});

test('Viewer: exports renderForensicSidebar', () => {
  assert.ok(forensicViewerSrc.includes('export function renderForensicSidebar'));
});

test('Viewer: exports handleForensicAction', () => {
  assert.ok(forensicViewerSrc.includes('export async function handleForensicAction'));
});

test('Viewer: exports renderForensicWorkspace', () => {
  assert.ok(forensicViewerSrc.includes('export async function renderForensicWorkspace'));
});

test('Viewer: exports setCurrentFrame', () => {
  assert.ok(forensicViewerSrc.includes('export function setCurrentFrame'));
});

test('Viewer: handleForensicAction handles all action types', () => {
  const actions = ['add-bookmark', 'remove-bookmark', 'jump-bookmark', 'add-annotation',
    'remove-annotation', 'create-branch', 'remove-branch', 'generate-puzzle',
    'export-session', 'clear-session'];
  for (const action of actions) {
    assert.ok(forensicViewerSrc.includes(`case '${action}'`), `Missing case for action: ${action}`);
  }
});

test('Viewer: renderForensicSidebar escapes user content', () => {
  assert.ok(forensicViewerSrc.includes('esc('));
  assert.ok(forensicViewerSrc.includes('forensic-bookmark-label'));
});

test('Viewer: open-session loads replay from IndexedDB', () => {
  // open-session routes the local IndexedDB record through the shared
  // replay resolver (kind 'local') — persistence lookup and frame
  // reconstruction happen inside the resolver, same as every other source.
  assert.ok(forensicViewerSrc.includes("import('../data-loader.js')"));
  assert.ok(forensicViewerSrc.includes('openReplay'));
  assert.ok(forensicViewerSrc.includes("kind: 'local'"));
});

test('Viewer: open-session falls back to replay library on error', () => {
  assert.ok(forensicViewerSrc.includes("#/play/replays"));
});

test('App: imports forensic viewer functions', () => {
  assert.ok(appSrc.includes('renderForensicWorkspace'));
  assert.ok(appSrc.includes('initForensicViewer'));
  assert.ok(appSrc.includes('renderForensicSidebar'));
  assert.ok(appSrc.includes('handleForensicAction'));
  assert.ok(appSrc.includes('setCurrentFrame'));
});

test('App: renderWatch includes forensic sidebar', () => {
  assert.ok(appSrc.includes('renderForensicSidebar'));
  assert.ok(appSrc.includes('watch-layout-forensic'));
  assert.ok(appSrc.includes('wireForensicSidebar'));
});

test('App: exposes state on window for forensic viewer', () => {
  assert.ok(appSrc.includes('window.__intrilexState'));
});

test('App: stepTo syncs forensic frame index', () => {
  assert.ok(appSrc.includes('setCurrentFrame(state.frame)'));
});

test('App: /forensic route in renderers map', () => {
  assert.ok(appSrc.includes("'/forensic': renderForensic"));
});

test('App: /forensic route in renderLandingMode', () => {
  assert.ok(appSrc.includes("r === '/forensic'"));
});

test('Router: /forensic in WORKSPACES', () => {
  assert.ok(routerSrc.includes("'/forensic','🔬','Forensic'"));
});

test('Router: /forensic in LANDING_MODES', () => {
  assert.ok(routerSrc.includes("'/forensic'"));
});

test('Router: /forensic in SUBTITLES', () => {
  assert.ok(routerSrc.includes("'/forensic':"));
});

// ═══════════════════════════════════════════════════════════════
// PHASE 6 — Forensic UI depth: comparisons, timeline indicators,
// branch visualization, puzzle integration
// ═══════════════════════════════════════════════════════════════

test('Phase6: viewer exports comparison action handlers', () => {
  assert.ok(forensicViewerSrc.includes("case 'add-comparison-frame'"));
  assert.ok(forensicViewerSrc.includes("case 'view-comparison'"));
  assert.ok(forensicViewerSrc.includes("case 'remove-comparison'"));
});

test('Phase6: sidebar renders comparison section', () => {
  assert.ok(forensicViewerSrc.includes('forensic-comparison-section'));
  assert.ok(forensicViewerSrc.includes('forensic-comparison-list'));
  assert.ok(forensicViewerSrc.includes('forensic-add-comparison-frame'));
});

test('Phase6: sidebar renders comparison items with labels and entry counts', () => {
  assert.ok(forensicViewerSrc.includes('forensic-comparison-label'));
  assert.ok(forensicViewerSrc.includes('forensic-comparison-entries'));
  assert.ok(forensicViewerSrc.includes('forensic-view-comparison'));
  assert.ok(forensicViewerSrc.includes('forensic-delete-comparison'));
});

test('Phase6: viewer stores activeComparison in state', () => {
  assert.ok(forensicViewerSrc.includes('activeComparison'));
});

test('Phase6: viewer tracks comparisonFrameCount', () => {
  assert.ok(forensicViewerSrc.includes('comparisonFrameCount'));
});

test('Phase6: app.js adds bookmark indicators to timeline', () => {
  assert.ok(appSrc.includes('has-bookmark'));
  assert.ok(appSrc.includes('has-annotation'));
  assert.ok(appSrc.includes('has-branch'));
  assert.ok(appSrc.includes('forensicFrameSummary'));
});

test('Phase6: app.js renders branch previews below board', () => {
  assert.ok(appSrc.includes('forensic-branch-preview'));
  assert.ok(appSrc.includes('forensic-branch-previews'));
  assert.ok(appSrc.includes('forensicBranchesAtFrame'));
});

test('Phase6: app.js shows bookmark count badge on timeline header', () => {
  assert.ok(appSrc.includes('forensic-timeline-badge'));
});

test('Phase6: app.js passes frameState to generate-puzzle', () => {
  assert.ok(appSrc.includes("data.frameState = currentState()"));
});

test('Phase6: app.js handles comparison actions in wireForensicSidebar', () => {
  assert.ok(appSrc.includes("view-comparison"));
  assert.ok(appSrc.includes("remove-comparison"));
  assert.ok(appSrc.includes("data.comparisonId"));
});

test('Phase6: puzzle-app picks up forensic-generated puzzle', () => {
  const puzzleAppSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/puzzle/puzzle-app.mjs'), 'utf8');
  assert.ok(puzzleAppSrc.includes('_forensicGeneratedPuzzle'),
    'puzzle-app should check for forensic-generated puzzle');
  assert.ok(puzzleAppSrc.includes('forensicPuzzle'),
    'puzzle-app should load the forensic puzzle');
});

test('Phase6: CSS has comparison section styles', () => {
  const forensicCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(forensicCssSrc.includes('forensic-comparison-actions'));
  assert.ok(forensicCssSrc.includes('forensic-comparison-list'));
  assert.ok(forensicCssSrc.includes('forensic-comparison-overlay'));
  assert.ok(forensicCssSrc.includes('forensic-comparison-grid'));
});

test('Phase6: CSS has timeline bookmark indicator styles', () => {
  const forensicCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(forensicCssSrc.includes('.timeline-item.has-bookmark'));
  assert.ok(forensicCssSrc.includes('.timeline-item.has-annotation'));
  assert.ok(forensicCssSrc.includes('.timeline-item.has-branch'));
  assert.ok(forensicCssSrc.includes('forensic-timeline-badge'));
});

test('Phase6: CSS has branch preview styles', () => {
  const forensicCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(forensicCssSrc.includes('forensic-branch-preview'));
  assert.ok(forensicCssSrc.includes('forensic-branch-previews'));
});

// ── Phase 6 model tests: comparison creation from bookmarks ──

test('Phase6: addComparison with bookmark entries', () => {
  let session = createForensicSession('R-P6-CMP-001');
  session = addBookmark(session, { frameIndex: 5, label: 'Key turn' });
  session = addBookmark(session, { frameIndex: 12, label: 'Endgame' });
  session = addComparison(session, {
    label: 'Key turn vs Endgame',
    entries: [
      { replayId: 'R-P6-CMP-001', frameIndex: 5, label: 'Key turn' },
      { replayId: 'R-P6-CMP-001', frameIndex: 12, label: 'Endgame' },
    ],
  });
  assert.equal(session.comparisons.length, 1);
  assert.equal(session.comparisons[0].entries.length, 2);
  assert.equal(session.comparisons[0].entries[0].frameIndex, 5);
  assert.equal(session.comparisons[0].entries[1].frameIndex, 12);
});

test('Phase6: removeComparison clears the comparison', () => {
  let session = createForensicSession('R-P6-CMP-002');
  session = addComparison(session, {
    label: 'Test comparison',
    entries: [
      { replayId: 'R-P6-CMP-002', frameIndex: 1 },
      { replayId: 'R-P6-CMP-002', frameIndex: 2 },
    ],
  });
  const comparisonId = session.comparisons[0].id;
  session = removeComparison(session, comparisonId);
  assert.equal(session.comparisons.length, 0);
});

test('Phase6: addComparison rejects entries with missing replayId', () => {
  const session = createForensicSession('R-P6-CMP-003');
  assert.throws(() => addComparison(session, {
    label: 'Bad comparison',
    entries: [
      { frameIndex: 1 },
      { replayId: 'R-P6-CMP-003', frameIndex: 2 },
    ],
  }), { message: 'FORENSIC_INVALID_COMPARISON_ENTRY' });
});

test('Phase6: addComparison rejects single entry (needs 2+)', () => {
  const session = createForensicSession('R-P6-CMP-004');
  assert.throws(() => addComparison(session, {
    label: 'Single entry',
    entries: [{ replayId: 'R-P6-CMP-004', frameIndex: 1 }],
  }), { message: 'FORENSIC_INVALID_COMPARISON_ENTRIES' });
});

// ═══════════════════════════════════════════════════════════════
// PHASE 6 POLISH — Comparison overlay, edge cases, wiring
// ═══════════════════════════════════════════════════════════════

test('Phase6Polish: viewer exports renderForensicComparisonOverlay', () => {
  assert.ok(forensicViewerSrc.includes('export function renderForensicComparisonOverlay'),
    'Viewer should export renderForensicComparisonOverlay');
});

test('Phase6Polish: overlay renders side-by-side grid with frame data', () => {
  assert.ok(forensicViewerSrc.includes('forensic-comparison-overlay'));
  assert.ok(forensicViewerSrc.includes('forensic-comparison-panel'));
  assert.ok(forensicViewerSrc.includes('forensic-comparison-grid'));
  assert.ok(forensicViewerSrc.includes('forensic-comparison-cell'));
  assert.ok(forensicViewerSrc.includes('forensic-comparison-cell-header'));
  assert.ok(forensicViewerSrc.includes('forensic-comparison-cell-body'));
});

test('Phase6Polish: overlay shows frame state data (turn, phase, pile counts)', () => {
  assert.ok(forensicViewerSrc.includes('frameState'));
  assert.ok(forensicViewerSrc.includes('Turn'));
  assert.ok(forensicViewerSrc.includes('Phase'));
  assert.ok(forensicViewerSrc.includes('Draw pile'));
  assert.ok(forensicViewerSrc.includes('Discard'));
});

test('Phase6Polish: overlay has close button with data-testid', () => {
  assert.ok(forensicViewerSrc.includes('forensic-close-comparison'));
  assert.ok(forensicViewerSrc.includes('close-comparison'));
});

test('Phase6Polish: viewer handles close-comparison action', () => {
  assert.ok(forensicViewerSrc.includes("case 'close-comparison'"));
});

test('Phase6Polish: viewer updates comparisonFrameCount on add-bookmark', () => {
  assert.ok(forensicViewerSrc.includes('comparisonFrameCount: sortedBookmarks(updated).length'),
    'add-bookmark should update comparisonFrameCount');
});

test('Phase6Polish: viewer updates comparisonFrameCount on remove-bookmark', () => {
  // Check that remove-bookmark also updates comparisonFrameCount
  const removeBookmarkBlock = forensicViewerSrc.match(/case 'remove-bookmark':\s*\{[\s\S]*?\}/);
  assert.ok(removeBookmarkBlock, 'Should find remove-bookmark case block');
  assert.ok(removeBookmarkBlock[0].includes('comparisonFrameCount'),
    'remove-bookmark should update comparisonFrameCount');
});

test('Phase6Polish: viewer resets comparisonFrameCount on clear-session', () => {
  const clearSessionBlock = forensicViewerSrc.match(/case 'clear-session':\s*\{[\s\S]*?\}/);
  assert.ok(clearSessionBlock, 'Should find clear-session case block');
  assert.ok(clearSessionBlock[0].includes('comparisonFrameCount: 0'),
    'clear-session should reset comparisonFrameCount to 0');
  assert.ok(clearSessionBlock[0].includes('activeComparison: null'),
    'clear-session should reset activeComparison to null');
});

test('Phase6Polish: app.js imports renderForensicComparisonOverlay', () => {
  assert.ok(appSrc.includes('renderForensicComparisonOverlay'),
    'app.js should import renderForensicComparisonOverlay');
});

test('Phase6Polish: app.js renders comparison overlay after watch layout', () => {
  assert.ok(appSrc.includes('renderForensicComparisonOverlay()'),
    'app.js should call renderForensicComparisonOverlay()');
});

test('Phase6Polish: app.js wires overlay close button', () => {
  assert.ok(appSrc.includes('wireForensicOverlay'),
    'app.js should have wireForensicOverlay function');
  assert.ok(appSrc.includes('forensic-comparison-overlay'),
    'wireForensicOverlay should query the overlay element');
  assert.ok(appSrc.includes("close-comparison"),
    'wireForensicOverlay should handle close-comparison action');
});

test('Phase6Polish: app.js overlay supports backdrop click and Escape key', () => {
  assert.ok(appSrc.includes('e.target === overlay'),
    'Overlay should close on backdrop click');
  assert.ok(appSrc.includes("e.key === 'Escape'"),
    'Overlay should close on Escape key');
});

test('Phase6Polish: overlay has ARIA dialog attributes', () => {
  assert.ok(forensicViewerSrc.includes('role="dialog"'));
  assert.ok(forensicViewerSrc.includes('aria-modal="true"'));
  assert.ok(forensicViewerSrc.includes('aria-label='));
});

test('Phase6Polish: overlay handles missing frame data gracefully', () => {
  // The overlay should use ?? '?' fallbacks for missing frame state
  assert.ok(forensicViewerSrc.includes("?? '?'"),
    'Overlay should handle missing frame data with ? fallback');
});

test('Phase6Polish: CSS has overlay close button styles', () => {
  const forensicCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(forensicCssSrc.includes('forensic-comparison-close'));
  assert.ok(forensicCssSrc.includes('forensic-comparison-cell'));
  assert.ok(forensicCssSrc.includes('forensic-comparison-cell-label'));
  assert.ok(forensicCssSrc.includes('forensic-comparison-cell-frame'));
});
