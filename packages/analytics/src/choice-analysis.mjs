// ═══════════════════════════════════════════════════════════════
// choice-analysis.mjs — browser-safe conditional choice-set analysis.
//
// Answers two questions marginal rates cannot:
//   1. When entity/mechanic A was selected, which alternatives were
//      simultaneously legal? (conditional opportunity accounting)
//   2. Within a recurring choice context, how deterministic is the
//      policy/profile's selection? (choice entropy / diversity)
//
// This is measurement only — it never randomizes or alters behavior.
// Deterministic Profile preference is reported as decision behavior,
// never as balance evidence.
// ═══════════════════════════════════════════════════════════════

// Action→mechanic-tag derivation, identical to runtime.mjs mechanicTags /
// primaryMechanicTag so choice analysis and telemetry agree by construction.
const NON_MECHANIC_FAMILIES = new Set(['phase', 'response-decline', 'private-choice']);
const NON_MECHANIC_MODES = new Set(['enter-action', 'decline', 'points', 'ordinary', 'top', 'forced-mini-turn', '♣', '♦', '♥', '♠']);
const TIMING_FAMILIES = new Set(['instant', 'quick', 'interrupt']);

export function actionMechanicTags(action) {
  const tags = new Set();
  if (!NON_MECHANIC_FAMILIES.has(action?.family) && !TIMING_FAMILIES.has(action?.family)) tags.add(action.family);
  if (action?.mode && !NON_MECHANIC_MODES.has(action.mode) && action.mode !== action.family) tags.add(action.mode);
  return [...tags].sort();
}

export function actionPrimaryMechanic(action) {
  if (NON_MECHANIC_FAMILIES.has(action?.family)) return null;
  if (action?.mode && !NON_MECHANIC_MODES.has(action.mode) && action.mode !== action.family) return action.mode;
  if (TIMING_FAMILIES.has(action?.family)) return null;
  return action?.family ?? null;
}

/**
 * Stable identity for one option inside a choice set: the action's primary
 * mechanic tag when it carries one, else a family:mode signature. Multiple
 * legal actions can share an option id (e.g. the same mechanic on different
 * cards) — that is correct: the option is the mechanic, not the card.
 */
function optionId(action) {
  return actionPrimaryMechanic(action) ?? `${action?.family ?? 'unknown'}:${action?.mode ?? 'none'}`;
}

/** Sorted unique offered-option list; joined form is the context fingerprint. */
export function choiceSetFingerprint(legalActions = []) {
  const options = [...new Set(legalActions.map(optionId))].sort();
  return { options, fingerprint: options.join('|') };
}

/**
 * Extract per-decision choice records from match summaries.
 * Each summary must carry rankDecisions entries with `action` and
 * `legalActions`; policy is resolved through participants/seatOrder.
 */
export function decisionChoices(summaries = []) {
  const decisions = [];
  for (const summary of summaries) {
    const policyOfSeat = {};
    if (Array.isArray(summary.participants) && summary.participants.length) {
      for (const p of summary.participants) policyOfSeat[p.seat] = p.policyId;
    } else {
      const seatOrder = summary.seatOrder ?? [];
      (summary.policyIds ?? []).forEach((pid, i) => { policyOfSeat[i + 1] = pid; });
      for (const seat of Object.keys(policyOfSeat)) {
        policyOfSeat[seatOrder[Number(seat) - 1]] = policyOfSeat[seat];
      }
    }
    for (const rd of summary.rankDecisions ?? []) {
      if (!Array.isArray(rd.legalActions) || !rd.legalActions.length) continue;
      const seat = Number(String(rd.participantId ?? '').replace(/^P/, '')) || rd.seat || null;
      const selected = rd.action ? { family: rd.action.family, mode: rd.action.mode, kind: rd.action.kind } : null;
      decisions.push({
        matchId: summary.matchId,
        decisionIndex: rd.decisionIndex,
        participantId: rd.participantId,
        seat,
        profileId: summary.profileId ?? null,
        policyId: policyOfSeat[seat] ?? null,
        selectedOption: selected ? optionId(selected) : null,
        selectedTags: selected ? actionMechanicTags(selected) : [],
        legalActions: rd.legalActions,
      });
    }
  }
  return decisions;
}

function entropyBits(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return null;
  let h = 0;
  for (const n of Object.values(counts)) {
    const p = n / total;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

function contextAggregate() {
  return {
    frameCount: 0,
    optionSelections: {},
    perPolicy: {},
  };
}

function recordInto(ctx, option, policyId) {
  ctx.frameCount += 1;
  if (option != null) ctx.optionSelections[option] = (ctx.optionSelections[option] ?? 0) + 1;
  if (policyId != null) {
    const p = (ctx.perPolicy[policyId] ??= contextAggregate());
    recordInto(p, option, null);
  }
}

function summarizeContext(ctx, options) {
  const selections = ctx.optionSelections;
  const total = ctx.frameCount;
  const distinct = Object.keys(selections).length;
  const dominantEntry = Object.entries(selections).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [null, 0];
  const h = entropyBits(selections);
  const maxH = Math.log2(Math.max(2, options.length));
  return {
    offeredOptions: options,
    frameCount: total,
    optionSelections: selections,
    distinctOptionsSelected: distinct,
    offeredCount: options.length,
    // Entropy over the *selected-option* distribution in this exact context.
    choiceEntropyBits: h,
    normalizedEntropy: h == null ? null : h / maxH,
    dominantOption: dominantEntry[0],
    dominantShare: total ? dominantEntry[1] / total : null,
    legalOptionCoverage: options.length ? distinct / options.length : null,
    evidence: total >= 5 ? 'OBSERVED' : 'INSUFFICIENT_DATA',
  };
}

/**
 * Build conditional choice-set analysis from decision records.
 * @param {Array} decisions - from decisionChoices()
 * @param {{ minFrames?: number, maxContexts?: number }} [options]
 */
export function buildChoiceAnalysis(decisions = [], { minFrames = 5, maxContexts = 100 } = {}) {
  const contexts = new Map();
  const entity = new Map(); // entity -> { offered, selected, pair: Map }
  const coverage = { decisionsSeen: decisions.length, decisionsWithLegalActions: 0, decisionsUsable: 0, multiOptionDecisions: 0 };

  for (const d of decisions) {
    if (!Array.isArray(d.legalActions) || !d.legalActions.length) continue;
    coverage.decisionsWithLegalActions += 1;
    const { options, fingerprint } = choiceSetFingerprint(d.legalActions);
    if (!options.length || d.selectedOption == null) continue;
    coverage.decisionsUsable += 1;
    if (options.length > 1) coverage.multiOptionDecisions += 1;

    const key = fingerprint;
    const ctx = contexts.get(key) ?? contextAggregate();
    contexts.set(key, ctx);
    recordInto(ctx, d.selectedOption, d.policyId);

    // Entity-level conditional accounting: an entity is "on offer" when its
    // tag appears among the offered options; it is "selected" when the chosen
    // action carries the tag.
    const offered = new Set(d.legalActions.flatMap((a) => actionMechanicTags(a)));
    const selectedTags = new Set(d.selectedTags ?? []);
    for (const e of offered) {
      const rec = entity.get(e) ?? { offered: 0, selected: 0, pair: new Map() };
      entity.set(e, rec);
      rec.offered += 1;
      if (selectedTags.has(e)) rec.selected += 1;
      for (const other of offered) {
        if (other === e) continue;
        const pair = rec.pair.get(other) ?? { jointFrames: 0, eSelected: 0, otherSelected: 0, neither: 0 };
        rec.pair.set(other, pair);
        pair.jointFrames += 1;
        if (selectedTags.has(e)) pair.eSelected += 1;
        else if (selectedTags.has(other)) pair.otherSelected += 1;
        else pair.neither += 1;
      }
    }
  }

  const contextRows = [...contexts.entries()]
    .map(([fingerprint, ctx]) => ({ contextId: fingerprint, ...summarizeContext(ctx, fingerprint.split('|')) }))
    .sort((a, b) => b.frameCount - a.frameCount || a.contextId.localeCompare(b.contextId));

  const entities = {};
  for (const [e, rec] of [...entity.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const pairwise = [...rec.pair.entries()]
      .filter(([, p]) => p.jointFrames >= 1)
      .map(([other, p]) => ({
        versus: other,
        jointFrames: p.jointFrames,
        entitySelected: p.eSelected,
        otherSelected: p.otherSelected,
        neitherSelected: p.neither,
        conditionalShare: p.eSelected + p.otherSelected > 0 ? p.eSelected / (p.eSelected + p.otherSelected) : null,
      }))
      .sort((a, b) => b.jointFrames - a.jointFrames || a.versus.localeCompare(b.versus));
    entities[e] = {
      offeredCount: rec.offered,
      selectedCount: rec.selected,
      conditionalRate: rec.offered ? rec.selected / rec.offered : null,
      pairwise,
    };
  }

  const perPolicy = {};
  for (const row of contextRows) {
    const ctx = contexts.get(row.contextId);
    for (const [policyId, p] of Object.entries(ctx.perPolicy)) {
      const list = (perPolicy[policyId] ??= []);
      list.push({ contextId: row.contextId, ...summarizeContext(p, row.offeredOptions) });
    }
  }
  for (const list of Object.values(perPolicy)) list.sort((a, b) => b.frameCount - a.frameCount || a.contextId.localeCompare(b.contextId));

  return {
    schemaVersion: '1.0.0',
    coverage,
    contexts: contextRows.filter((r) => r.frameCount >= minFrames).slice(0, maxContexts),
    contextCount: contextRows.length,
    entities,
    perPolicy,
    contractNote:
      'Conditional choice analysis: opportunities are frames where the option was simultaneously legal. ' +
      'Entropy measures selection diversity within an identical offered set only — different choice sets are never pooled. ' +
      'Deterministic selection is decision behavior, not balance evidence.',
  };
}
