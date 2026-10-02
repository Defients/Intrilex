// ═══════════════════════════════════════════════════════════════
// v1.0.0-behavioral-play-journey.test.mjs
//
// Behavioral tests for the v1.0.0 play journey:
//   1. Save integrity lifecycle (source-reading for constants)
//   2. Action presenter behavior (classifyDecisionKind, presentAction)
//   3. Evidence-honest labels (computeUncertaintyLabel, buildSampleSizeDisclaimer)
//   4. WAIT WHAT investigation lifecycle (createInvestigation, addAnnotation, etc.)
//   5. Human tournament lifecycle notice (source-reading)
//   6. Caster WAIT WHAT UI wiring (source-reading)
//   7. Evidence-honest UI wiring (source-reading for profile.js and meta-report.js)
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'apps', 'lab-web', 'src');

function readSrc(relPath) {
  return readFileSync(join(srcDir, relPath), 'utf8');
}

function srcUrl(relPath) {
  return pathToFileURL(join(srcDir, relPath)).href;
}

// ── Top-level dynamic imports ────────────────────────────────────
const actionPresenter = await import(srcUrl('play/action-presenter.js'));
const evidenceHonest = await import('@intrilex/statistics/evidence-honest');
const investigationWorkflow = await import(pathToFileURL(join(root, 'packages', 'replay-caster', 'src', 'investigation-workflow.mjs')).href);

// ── 1. Save integrity lifecycle ──────────────────────────────────

describe('Save integrity constants (source-reading)', () => {
  const src = readSrc('play/save-integrity.js');

  test('PRODUCT_VERSION is 1.0.0', () => {
    assert.match(src, /PRODUCT_VERSION\s*=\s*['"]1\.0\.0['"]/);
  });

  test('ENGINE_VERSION is defined and non-empty', () => {
    assert.match(src, /ENGINE_VERSION\s*=\s*['"][^'"]+['"]/);
  });

  test('RULES_VERSION is defined and non-empty', () => {
    assert.match(src, /RULES_VERSION\s*=\s*['"][^'"]+['"]/);
  });

  test('SUPPORTED_PROFILES is a Set', () => {
    assert.match(src, /SUPPORTED_PROFILES\s*=\s*new Set\(/);
  });

  test('SAVE_FORMAT_VERSION is defined', () => {
    assert.match(src, /SAVE_FORMAT_VERSION\s*=\s*\d+/);
  });

  test('canMigrateSave function is exported', () => {
    assert.match(src, /export function canMigrateSave/);
  });

  test('SAVE_REASON_CODES includes INCOMPATIBLE_ENGINE_VERSION', () => {
    assert.match(src, /INCOMPATIBLE_ENGINE_VERSION/);
  });

  test('SAVE_REASON_CODES includes INCOMPATIBLE_RULES_VERSION', () => {
    assert.match(src, /INCOMPATIBLE_RULES_VERSION/);
  });

  test('SAVE_REASON_CODES includes INCOMPATIBLE_PRODUCT_VERSION', () => {
    assert.match(src, /INCOMPATIBLE_PRODUCT_VERSION/);
  });
});

// ── 2. Action presenter behavior ─────────────────────────────────

describe('Action presenter behavior', () => {
  const { classifyDecisionKind, presentAction, familyLabel } = actionPresenter;

  test('classifyDecisionKind returns UNKNOWN for null/undefined', () => {
    assert.equal(classifyDecisionKind(null), 'UNKNOWN');
    assert.equal(classifyDecisionKind(undefined), 'UNKNOWN');
  });

  test('classifyDecisionKind returns RESPONSE for response-decline', () => {
    assert.equal(classifyDecisionKind({ family: 'response-decline' }), 'RESPONSE');
  });

  test('classifyDecisionKind returns PHASE for phase family', () => {
    assert.equal(classifyDecisionKind({ family: 'phase' }), 'PHASE');
  });

  test('classifyDecisionKind returns PRIVATE_CHOICE for private-choice', () => {
    assert.equal(classifyDecisionKind({ family: 'private-choice' }), 'PRIVATE_CHOICE');
  });

  test('classifyDecisionKind returns EXHAUSTED_PASS for exhausted-pass', () => {
    assert.equal(classifyDecisionKind({ family: 'exhausted-pass' }), 'EXHAUSTED_PASS');
  });

  test('classifyDecisionKind returns RESPONSE for counter/disrupt/interrupt/instant/quick', () => {
    for (const family of ['counter', 'disrupt', 'interrupt', 'instant', 'quick']) {
      assert.equal(classifyDecisionKind({ family }), 'RESPONSE');
    }
  });

  test('classifyDecisionKind returns ACTION for draw/score families', () => {
    assert.equal(classifyDecisionKind({ family: 'draw' }), 'ACTION');
    assert.equal(classifyDecisionKind({ family: 'score' }), 'ACTION');
  });

  test('classifyDecisionKind returns RESPONSE for INSTANT timingClass', () => {
    assert.equal(classifyDecisionKind({ family: 'unknown', timingClass: 'INSTANT' }), 'RESPONSE');
    assert.equal(classifyDecisionKind({ family: 'unknown', timingClass: 'QUICK' }), 'RESPONSE');
    assert.equal(classifyDecisionKind({ family: 'unknown', timingClass: 'INTERRUPT' }), 'RESPONSE');
  });

  test('familyLabel returns known label for draw', () => {
    assert.equal(familyLabel('draw'), 'Draw');
  });

  test('familyLabel returns known label for score', () => {
    assert.equal(familyLabel('score'), 'Play for Points');
  });

  test('familyLabel returns null for unknown family', () => {
    assert.equal(familyLabel('nonexistent-family'), null);
  });

  test('presentAction is a function', () => {
    assert.equal(typeof presentAction, 'function');
  });

  test('presentAction returns object with displayLabel for draw', () => {
    const result = presentAction({ family: 'draw', mode: 'top' });
    assert.ok(result, 'presentAction should return a result');
    assert.ok(typeof result.displayLabel === 'string' || typeof result.label === 'string',
      'should have a displayLabel or label string');
  });

  test('presentAction handles counter family', () => {
    const result = presentAction({ family: 'counter', mode: 'ace-base' });
    assert.ok(result);
  });

  test('presentAction handles scuttle family', () => {
    const result = presentAction({ family: 'scuttle', mode: 'ordinary' });
    assert.ok(result);
  });
});

// ── 3. Evidence-honest labels ────────────────────────────────────

describe('Evidence-honest labels', () => {
  const { computeUncertaintyLabel, buildSampleSizeDisclaimer, CONFIDENCE_LEVEL } = evidenceHonest;

  test('computeUncertaintyLabel returns INSUFFICIENT_DATA for 0 samples', () => {
    const result = computeUncertaintyLabel({ sampleSize: 0 });
    assert.equal(result.level, CONFIDENCE_LEVEL.INSUFFICIENT_DATA);
    assert.equal(result.confidence, 0);
    assert.ok(result.humanReadable);
  });

  test('computeUncertaintyLabel returns VERY_LOW_CONFIDENCE for < 10 samples', () => {
    const result = computeUncertaintyLabel({ sampleSize: 5 });
    assert.equal(result.level, CONFIDENCE_LEVEL.VERY_LOW_CONFIDENCE);
  });

  test('computeUncertaintyLabel returns LOW_CONFIDENCE for 10-29 samples', () => {
    const result = computeUncertaintyLabel({ sampleSize: 20 });
    assert.equal(result.level, CONFIDENCE_LEVEL.LOW_CONFIDENCE);
  });

  test('computeUncertaintyLabel returns MODERATE_CONFIDENCE for 30-99 samples', () => {
    const result = computeUncertaintyLabel({ sampleSize: 50 });
    assert.equal(result.level, CONFIDENCE_LEVEL.MODERATE_CONFIDENCE);
  });

  test('computeUncertaintyLabel returns HIGH_CONFIDENCE for >= 100 samples', () => {
    const result = computeUncertaintyLabel({ sampleSize: 100 });
    assert.equal(result.level, CONFIDENCE_LEVEL.HIGH_CONFIDENCE);
  });

  test('computeUncertaintyLabel returns INSUFFICIENT_DATA for null/undefined input', () => {
    assert.equal(computeUncertaintyLabel(null).level, CONFIDENCE_LEVEL.INSUFFICIENT_DATA);
    assert.equal(computeUncertaintyLabel(undefined).level, CONFIDENCE_LEVEL.INSUFFICIENT_DATA);
  });

  test('computeUncertaintyLabel label matches level', () => {
    const result = computeUncertaintyLabel({ sampleSize: 50 });
    assert.equal(result.label, result.level);
  });

  test('computeUncertaintyLabel accepts games field as sample size', () => {
    const result = computeUncertaintyLabel({ games: 50 });
    assert.equal(result.level, CONFIDENCE_LEVEL.MODERATE_CONFIDENCE);
  });

  test('buildSampleSizeDisclaimer returns shouldDisplay=true when below threshold', () => {
    const result = buildSampleSizeDisclaimer({ sampleSize: 5 }, 'win-rate');
    assert.equal(result.shouldDisplay, true);
    assert.ok(result.disclaimerText);
    assert.equal(result.threshold, 30);
  });

  test('buildSampleSizeDisclaimer returns shouldDisplay=false when at/above threshold', () => {
    const result = buildSampleSizeDisclaimer({ sampleSize: 30 }, 'win-rate');
    assert.equal(result.shouldDisplay, false);
    assert.equal(result.disclaimerText, '');
  });

  test('buildSampleSizeDisclaimer handles 0 samples with special message', () => {
    const result = buildSampleSizeDisclaimer({ sampleSize: 0 }, 'win-rate');
    assert.equal(result.shouldDisplay, true);
    assert.match(result.disclaimerText, /No data yet/);
  });

  test('buildSampleSizeDisclaimer uses context-specific thresholds', () => {
    assert.equal(buildSampleSizeDisclaimer({ sampleSize: 4 }, 'head-to-head').threshold, 5);
    assert.equal(buildSampleSizeDisclaimer({ sampleSize: 9 }, 'rating-trend').threshold, 10);
    assert.equal(buildSampleSizeDisclaimer({ sampleSize: 49 }, 'mechanic-usage').threshold, 50);
  });
});

// ── 4. WAIT WHAT investigation lifecycle ─────────────────────────

describe('WAIT WHAT investigation lifecycle', () => {
  const {
    createInvestigation,
    addAnnotation,
    addBranch,
    exportInvestigation,
    checkInvalidation,
    InvestigationStatus,
  } = investigationWorkflow;

  // Minimal valid capture envelope for testing
  const testCapture = {
    captureId: 'WW-test-001',
    casterBeatId: 'beat-1',
    decisionId: 'dec-1',
    checkpointHash: 'abc123def456',
    viewerMode: 'public',
    contextBefore: [],
    contextAfter: [],
    diagnostics: [],
    commentary: 'Test commentary',
    legalOptions: [],
  };

  test('createInvestigation returns BOOKMARKED status', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    assert.equal(inv.status, InvestigationStatus.BOOKMARKED);
    assert.ok(inv.investigationId);
    assert.equal(inv.authorityHashAtCreation, 'auth-hash-001');
    assert.deepEqual(inv.branches, []);
    assert.deepEqual(inv.annotations, []);
    assert.deepEqual(inv.comparisons, []);
  });

  test('createInvestigation captures the capture envelope', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    assert.ok(inv.capture);
    assert.equal(inv.capture.captureId, 'WW-test-001');
  });

  test('createInvestigation handles null authority hash', () => {
    const inv = createInvestigation(testCapture, null);
    assert.equal(inv.authorityHashAtCreation, null);
  });

  test('addAnnotation appends annotation and returns new investigation', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    const annotated = addAnnotation(inv, { text: 'Interesting decision', beatId: 'beat-1' });
    assert.notEqual(annotated, inv, 'should return a new object');
    assert.equal(annotated.annotations.length, 1);
    assert.equal(annotated.annotations[0].text, 'Interesting decision');
    assert.equal(inv.annotations.length, 0, 'original should be unchanged');
  });

  test('addBranch appends branch and transitions to BRANCHED', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    const branched = addBranch(inv, {
      label: 'Runner-up',
      alternativeActionId: 'alt-1',
      notes: 'What if we did this instead?',
    });
    assert.equal(branched.status, InvestigationStatus.BRANCHED);
    assert.equal(branched.branches.length, 1);
    assert.equal(inv.branches.length, 0, 'original should be unchanged');
  });

  test('exportInvestigation transitions to EXPORTED and returns export data', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    const result = exportInvestigation(inv, 'json');
    assert.ok(result.investigation);
    assert.equal(result.investigation.status, InvestigationStatus.EXPORTED);
    assert.ok(result.exportData);
    assert.equal(result.exportFormat, 'json');
  });

  test('exportInvestigation supports markdown format', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    const result = exportInvestigation(inv, 'markdown');
    assert.equal(result.exportFormat, 'markdown');
    assert.ok(result.exportData);
  });

  test('checkInvalidation returns INVALIDATED when authority hash differs', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    const checked = checkInvalidation(inv, 'different-hash-999');
    assert.equal(checked.status, InvestigationStatus.INVALIDATED);
  });

  test('checkInvalidation preserves investigation when authority hash matches', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    const checked = checkInvalidation(inv, 'auth-hash-001');
    assert.notEqual(checked.status, InvestigationStatus.INVALIDATED);
  });

  test('checkInvalidation handles null authority hash', () => {
    const inv = createInvestigation(testCapture, null);
    const checked = checkInvalidation(inv, 'some-hash');
    // When no authority hash was captured at creation, the investigation
    // may still be invalidated by checkInvalidation. This test verifies
    // the function handles the null case without throwing.
    assert.ok(checked.status, 'should return a valid status');
  });

  test('investigation is immutable — addAnnotation does not mutate original', () => {
    const inv = createInvestigation(testCapture, 'auth-hash-001');
    const originalAnnotations = inv.annotations.length;
    addAnnotation(inv, { text: 'test', beatId: null });
    assert.equal(inv.annotations.length, originalAnnotations);
  });
});

// ── 5. Human tournament lifecycle notice (source-reading) ────────

describe('Human tournament lifecycle notice (source-reading)', () => {
  const src = readSrc('workspaces/human-tournaments.js');

  test('renderLifecycleNotice function is defined', () => {
    assert.match(src, /function renderLifecycleNotice\(\)/);
  });

  test('lifecycle notice has data-testid ht-lifecycle-notice', () => {
    assert.match(src, /data-testid="ht-lifecycle-notice"/);
  });

  test('lifecycle notice mentions Partial Availability', () => {
    assert.match(src, /Partial Availability/);
  });

  test('lifecycle notice lists available features (Registration & seeding)', () => {
    assert.match(src, /Registration & seeding/);
  });

  test('lifecycle notice lists available features (Bracket display)', () => {
    assert.match(src, /Bracket display/);
  });

  test('lifecycle notice lists coming-soon features (Check-in windows)', () => {
    assert.match(src, /Check-in windows/);
  });

  test('lifecycle notice lists coming-soon features (Match scheduling)', () => {
    assert.match(src, /Match scheduling/);
  });

  test('lifecycle notice lists coming-soon features (Disconnect rulings)', () => {
    assert.match(src, /Disconnect rulings/);
  });

  test('lifecycle notice lists coming-soon features (Admin correction)', () => {
    assert.match(src, /Admin correction/);
  });

  test('lifecycle notice lists coming-soon features (Resumption after restart)', () => {
    assert.match(src, /Resumption after restart/);
  });

  test('lifecycle notice includes Coming soon tags', () => {
    assert.match(src, /Coming soon/);
  });

  test('renderContent integrates lifecycle notice for tournament list', () => {
    assert.match(src, /renderLifecycleNotice\(\) \+ renderTournamentList/);
  });

  test('renderContent integrates lifecycle notice for tournament detail', () => {
    assert.match(src, /renderLifecycleNotice\(\) \+ renderTournamentDetail/);
  });

  test('back button in wireDetailButtons includes lifecycle notice', () => {
    assert.match(src, /renderLifecycleNotice\(\) \+ renderContent/);
  });

  test('lifecycle documentation comment is present at top of file', () => {
    assert.match(src, /Lifecycle Completeness/);
  });
});

// ── 6. Caster WAIT WHAT UI wiring (source-reading) ───────────────

describe('Caster WAIT WHAT UI wiring (source-reading)', () => {
  const src = readSrc('workspaces/caster-workspace.js');

  test('imports HTML escaping from state.js', () => {
    assert.match(src, /import.*\besc\b.*from.*state\.js/);
  });

  test('getInvestigation function is defined', () => {
    assert.match(src, /async function getInvestigation/);
  });

  test('getAuthorityHash function is defined', () => {
    assert.match(src, /async function getAuthorityHash/);
  });

  test('casterState includes waitWhatInvestigation', () => {
    assert.match(src, /waitWhatInvestigation/);
  });

  test('casterState includes waitWhatInvalidated', () => {
    assert.match(src, /waitWhatInvalidated/);
  });

  test('casterState includes waitWhatExportResult', () => {
    assert.match(src, /waitWhatExportResult/);
  });

  test('WAIT WHAT button handler is async and creates investigation', () => {
    assert.match(src, /waitWhatBtn\.onclick = async/);
    assert.match(src, /createInvestigation/);
  });

  test('renderWaitWhatPanel accepts investigation and invalidated params', () => {
    assert.match(src, /function renderWaitWhatPanel\(capture,\s*investigation,\s*invalidated\)/);
  });

  test('renderWaitWhatPanel includes investigation ID in output', () => {
    assert.match(src, /investigation\?\.investigationId/);
  });

  test('renderWaitWhatPanel includes authority hash in output', () => {
    assert.match(src, /authorityHashAtCreation/);
    assert.match(src, /Authority hash/);
  });

  test('renderWaitWhatPanel includes invalidation banner', () => {
    assert.match(src, /caster-ww-invalidation/);
    assert.match(src, /Investigation Invalidated/);
  });

  test('renderWaitWhatPanel includes annotation form', () => {
    assert.match(src, /caster-ww-annotation-form/);
    assert.match(src, /caster-ww-annotation-text/);
    assert.match(src, /caster-ww-annotation-severity/);
    assert.match(src, /caster-ww-annotation-save/);
  });

  test('renderWaitWhatPanel includes export buttons', () => {
    assert.match(src, /caster-ww-export-json/);
    assert.match(src, /caster-ww-export-md/);
  });

  test('renderWaitWhatPanel includes legal alternatives section', () => {
    assert.match(src, /caster-ww-alternatives/);
    assert.match(src, /does not include a verified alternative action/);
  });

  test('wireWaitWhatAnnotation function is defined', () => {
    assert.match(src, /async function wireWaitWhatAnnotation/);
  });

  test('wireWaitWhatExport function is defined', () => {
    assert.match(src, /async function wireWaitWhatExport/);
  });

  test('downloadInvestigation function is defined', () => {
    assert.match(src, /function downloadInvestigation/);
  });

  test('onBeatChange checks investigation invalidation', () => {
    assert.match(src, /checkInvalidation/);
    assert.match(src, /waitWhatInvalidated/);
  });

  test('buildCasterRightRail passes investigation to renderWaitWhatPanel', () => {
    assert.match(src, /renderWaitWhatPanel\(casterState\.waitWhatCapture,\s*casterState\.waitWhatInvestigation,\s*casterState\.waitWhatInvalidated\)/);
  });

  test('cleanupCaster resets investigation state', () => {
    assert.match(src, /casterState\.waitWhatInvestigation = null/);
    assert.match(src, /casterState\.waitWhatInvalidated = false/);
    assert.match(src, /casterState\.waitWhatExportResult = null/);
  });

  test('investigation does not promise a runner-up without an executable replay anchor', () => {
    assert.doesNotMatch(src, /data-action-id="runner-up"/);
    assert.doesNotMatch(src, /state\.branchContext/);
    assert.match(src, /Export the investigation to preserve this exact replay position/);
  });
});

// ── 7. Evidence-honest UI wiring (source-reading) ────────────────

describe('Evidence-honest UI wiring in profile.js (source-reading)', () => {
  const src = readSrc('workspaces/profile.js');

  test('imports computeUncertaintyLabel and buildSampleSizeDisclaimer', () => {
    assert.match(src, /computeUncertaintyLabel/);
    assert.match(src, /buildSampleSizeDisclaimer/);
    assert.match(src, /evidence-honest/);
  });

  test('computes uncertainty from coverageCount or ranked games', () => {
    assert.match(src, /computeUncertaintyLabel.*sampleSize.*coverageCount/);
  });

  test('builds disclaimer for win-rate context', () => {
    assert.match(src, /buildSampleSizeDisclaimer[\s\S]*win-rate/);
  });

  test('renders confidence badge with data-testid', () => {
    assert.match(src, /profile-fingerprint-confidence/);
    assert.match(src, /data-testid="profile-fingerprint-confidence"/);
  });

  test('renders disclaimer with data-testid when shouldDisplay', () => {
    assert.match(src, /profile-fingerprint-disclaimer/);
    assert.match(src, /data-testid="profile-fingerprint-disclaimer"/);
  });

  test('confidence badge is appended to coverage label', () => {
    assert.match(src, /\$\{confidenceBadge\}/);
  });

  test('disclaimerHtml is rendered in fingerprint section', () => {
    assert.match(src, /\$\{disclaimerHtml\}/);
  });
});

describe('Evidence-honest UI wiring in meta-report.js (source-reading)', () => {
  const src = readSrc('workspaces/meta-report.js');

  test('imports computeUncertaintyLabel from evidence-honest', () => {
    assert.match(src, /computeUncertaintyLabel/);
    assert.match(src, /evidence-honest/);
  });

  test('computes uncertainty from totalPlayers', () => {
    assert.match(src, /computeUncertaintyLabel.*sampleSize.*r\.totalPlayers/);
  });

  test('renders confidence badge with data-testid', () => {
    assert.match(src, /meta-confidence-badge/);
    assert.match(src, /data-testid="meta-confidence-badge"/);
  });

  test('renders disclaimer for INSUFFICIENT_DATA or VERY_LOW_CONFIDENCE', () => {
    assert.match(src, /meta-disclaimer/);
    assert.match(src, /data-testid="meta-disclaimer"/);
    assert.match(src, /INSUFFICIENT_DATA|VERY_LOW_CONFIDENCE/);
  });

  test('confidence badge is rendered in meta-summary', () => {
    assert.match(src, /\$\{confidenceBadge\}/);
  });

  test('disclaimerHtml is rendered between summary and stat cards', () => {
    assert.match(src, /\$\{disclaimerHtml\}/);
  });
});
