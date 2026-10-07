// combo-telemetry.mjs — First-class canonical Combo telemetry.
//
// Canonical definition (rulebook §8): a Combo is ONE declared multi-card play,
// enabled by an explicit effect, that commits source cards into a single atomic
// stack item. In the current Core engine the Combo classes are:
//   - 'super'  : ⭐ pair plays (two-score, two-hold, four-exchange, eight-
//                absolute-scuttle, jack-tempo, three-raid, five-recycle,
//                six-dig, seven-topdeck) + the ⭐A pair counter (family
//                'counter', mode 'super-ace'), gated by combo.supers.enabled
//   - 'ultra'  : 🌠 set plays (three-black-*, 2-black-2-red-draw/rummage) +
//                the 🌠3-red counter (family 'ultra', mode 'three-red-counter'),
//                gated by combo.ultras.enabled
//   - 'generic': the dormant Phase-10 'declare-combo' oracle. Never enumerated
//                today; classified here so future enabling recipes land in the
//                same pipeline.
// Explicitly NOT Combos (kept as distinct mechanics): royal-marriage,
// queens-court, rank10 (including 10♦ paired mimics that resolve a super
// sub-effect internally — their stack item is rank10-class), voltage,
// sudden-death, and the K♠ counter (king-spade — a counter authority, not a
// multi-card combo declaration).
//
// Lifecycle evidence comes only from authority events, never inference:
//   CORE_ACTION_DECLARED{stackClass:super|ultra} / CORE_SUPER_ACE_COUNTER_DECLARED
//     / CORE_ULTRA_THREE_RED_DECLARED / DEFINED_COMBO_DECLARED  → declared
//   CORE_ROOT_RESOLVED{stackItemId}                              → resolved
//   CORE_ROOT_FIZZLED{stackItemId,reasonCode}                    → fizzled
//     (the §8 pre-resolution revalidation failure)
//   CORE_COUNTER_RESOLVED{targetStackItemId,counterKind,...}     → countered
//     (or, when stackItemId is itself a combo counter item, resolved)
// 4♥ Combo Breaker is NOT implemented in this engine build: no breaker event
// or command exists. 'broken' is therefore reported as unavailable
// (capability flag), never inferred from generic failures.
//
// This module is isomorphic: it is mirrored verbatim into the browser bundle
// (dist/evolution/combo-telemetry.mjs) by scripts/build.mjs, so it may only
// import '@intrilex/shared'.

import { hashCanonical } from '@intrilex/shared';

export const COMBO_TELEMETRY_SCHEMA_VERSION = '1.0.0';

// ── Classification ────────────────────────────────────────────────────────

// Stack classes that ARE canonical Combo stack items.
export const COMBO_STACK_CLASSES = new Set(['super', 'ultra', 'combo']);

// Engine event types that mark the declaration of a Combo stack item.
const COMBO_DECLARE_EVENTS = new Set([
  'CORE_SUPER_ACE_COUNTER_DECLARED',
  'CORE_ULTRA_THREE_RED_DECLARED',
  'DEFINED_COMBO_DECLARED',
]);

const kindOf = (action) => action?.semantics?.effectKind ?? action?.advanced?.kind ?? action?.kind ?? null;

/**
 * Canonical Combo class of a legal/authorized action, or null.
 * Works on engine candidates ({family,mode,advanced.kind}), authorized views
 * ({family,mode,semantics.effectKind}), and reduced records ({family,mode}).
 */
export function comboClassOf(action) {
  if (!action) return null;
  const family = action.family ?? null;
  const mode = action.mode ?? null;
  const kind = kindOf(action);
  if (kind === 'declare-combo' || kind === 'core-declare-combo') return 'generic';
  if (family === 'super' || (typeof kind === 'string' && kind.startsWith('advanced-super-')) || kind === 'core-declare-super-ace-counter') return 'super';
  if (family === 'ultra' || (typeof kind === 'string' && kind.startsWith('advanced-ultra-')) || kind === 'core-declare-ultra-three-red') return 'ultra';
  if (family === 'counter' && mode === 'super-ace') return 'super';
  return null;
}

export const isComboAction = (action) => comboClassOf(action) !== null;

/**
 * Deterministic recipe identity from canonical declaration metadata.
 * four-exchange-{pr,er} share one recipe — the target row is a declaration
 * parameter, not a distinct recipe.
 */
export function comboRecipeId(action) {
  const cls = comboClassOf(action);
  if (!cls) return null;
  const mode = String(action.mode ?? '');
  const kind = kindOf(action);
  if (cls === 'generic') return 'combo:generic';
  if (mode === 'super-ace' || kind === 'core-declare-super-ace-counter') return 'super:ace-counter';
  if (mode === 'three-red-counter' || kind === 'core-declare-ultra-three-red') return 'ultra:three-red-counter';
  if (mode.startsWith('four-exchange-')) return 'super:four-exchange';
  return `${cls}:${mode || 'unknown'}`;
}

export const COMBO_RECIPE_LABELS = Object.freeze({
  'super:two-score': '⭐2 · Secure',
  'super:two-hold': '⭐2 · Hold',
  'super:three-raid': '⭐3 · Raid',
  'super:four-exchange': '⭐4 · Exchange',
  'super:five-recycle': '⭐5 · Recycle',
  'super:six-dig': '⭐6 · Dig',
  'super:seven-topdeck': '⭐7 · Topdeck',
  'super:eight-absolute-scuttle': '⭐8 · Absolute Scuttle',
  'super:jack-tempo': '⭐J · Tempo',
  'super:ace-counter': '⭐A · Counter',
  'ultra:three-red-counter': '🌠3R · Counter',
  'ultra:2-black-2-red-draw': '🌠2B2R · Draw',
  'ultra:2-black-2-red-rummage': '🌠2B2R · Rummage',
  'combo:generic': '⚡ Combo (recipe-defined)',
});

export function comboRecipeLabel(recipeId) {
  if (COMBO_RECIPE_LABELS[recipeId]) return COMBO_RECIPE_LABELS[recipeId];
  if (recipeId.startsWith('ultra:three-black-')) return `🌠3B · ${recipeId.slice('ultra:three-black-'.length)}`;
  return `⚡ ${recipeId}`;
}

// 'resolved'|'fizzled'|'countered'|'broken'|'pending'. 'broken' exists in the
// contract for the 4♥ Combo Breaker exception but is unreachable in this
// engine build — see capability.brokenObservable.
export const COMBO_LIFECYCLE = Object.freeze(['resolved', 'countered', 'fizzled', 'broken', 'pending']);

// ── Helpers ───────────────────────────────────────────────────────────────

const identityOf = (state, cardId) => state?.cards?.[cardId]?.identity ?? null;
const rankOf = (identity) => identity ? String(identity).replace(/[♣♦♥♠]/gu, '') : null;
const suitOf = (identity) => { const m = String(identity ?? '').match(/[♣♦♥♠]$/u); return m ? m[0] : null; };
const comboIdFor = (matchId, decisionIndex, stackItemId, actionId) =>
  `CB-${hashCanonical({ matchId, decisionIndex, stackItemId: stackItemId ?? null, actionId }).slice(0, 16)}`;

// ── Tracker ───────────────────────────────────────────────────────────────

/**
 * Per-match Combo tracker. Hook points inside the decision loop:
 *   .frame({ legalActions, actorId, state })              — legal opportunities
 *   .declared({ action, ..., events, stateBefore, state }) — selected declaration
 *   .observe(events, state)                               — lifecycle events
 *   .finish({ winner, terminationReason })                — sealed telemetry
 * scoreOf(state, playerId) is injected so the module stays engine-adapter-free
 * (the browser mirror cannot import @intrilex/engine-adapter).
 */
export function createComboTracker({ matchId, seatOrder, policyIds, scoreOf }) {
  const records = [];
  const byStackItem = new Map();
  const seats = seatOrder.map((playerId, index) => ({
    seat: index + 1, playerId, policyId: policyIds[index] ?? null,
    opportunityFrames: 0, actionOpportunityFrames: 0, responseOpportunityFrames: 0,
    opportunityContexts: { ahead: 0, tied: 0, behind: 0 },
    declarations: 0, recipes: {},
  }));

  const seatOf = (actorId) => seatOrder.indexOf(actorId);

  const openRecord = ({ stackItemId, actorId, comboClass, sourceCardIds, targetCardIds, targetStackItemId, state, evidence }) => {
    const seatIndex = seatOf(actorId);
    const identities = (sourceCardIds ?? []).map((id) => identityOf(state, id)).filter(Boolean);
    const record = {
      comboId: comboIdFor(matchId, null, stackItemId, stackItemId),
      matchId, stackItemId, actorId, seat: seatIndex >= 0 ? seatIndex + 1 : null,
      policyId: seatIndex >= 0 ? (policyIds[seatIndex] ?? null) : null,
      decisionOrdinal: null, fullTurn: state?.fullTurnSequence ?? null, phase: state?.phase ?? null,
      commandIndex: null, checkpointId: null, actionId: null,
      comboClass, recipeId: null, mode: null, timingClass: null,
      declarationContext: null, // 'action' | 'response'
      committedCardIds: [...(sourceCardIds ?? [])],
      committedCardCount: (sourceCardIds ?? []).length,
      componentIdentities: identities,
      componentRanks: [...new Set(identities.map(rankOf).filter(Boolean))],
      componentSuits: [...new Set(identities.map(suitOf).filter(Boolean))],
      initiatingCardId: null,
      targetCardIds: [...(targetCardIds ?? [])],
      targetStackItemId: targetStackItemId ?? null,
      status: 'declared',
      failureReason: null, counterKind: null, counterDestination: null, counteredByActorId: null,
      breakerCardId: null,
      scoreBefore: null, scoreAfter: null, scoreDelta: null, scoreDiffBefore: null,
      wonMatch: null,
      evidence: evidence ? [evidence] : [],
    };
    records.push(record);
    byStackItem.set(stackItemId, record);
    return record;
  };

  const settle = (record, status, state, extra = {}) => {
    if (record.status !== 'declared' && record.status !== 'pending') return; // terminal status already recorded
    record.status = status;
    Object.assign(record, extra);
    if (scoreOf && state && record.actorId) {
      record.scoreAfter = scoreOf(state, record.actorId);
      if (Number.isFinite(record.scoreBefore) && Number.isFinite(record.scoreAfter)) {
        record.scoreDelta = record.scoreAfter - record.scoreBefore;
      }
    }
  };

  return {
    /** Count one legal opportunity per combo recipe per decision frame. */
    frame({ legalActions, actorId, state }) {
      const seatIndex = seatOf(actorId);
      if (seatIndex < 0) return;
      const seen = new Map();
      for (const action of legalActions ?? []) {
        const recipeId = comboRecipeId(action);
        if (!recipeId) continue;
        const entry = seen.get(recipeId) ?? { count: 0, response: false, actionCtx: false };
        entry.count += 1;
        if (action.timingClass === 'ACTION') entry.actionCtx = true; else entry.response = true;
        seen.set(recipeId, entry);
      }
      if (!seen.size) return;
      const seat = seats[seatIndex];
      seat.opportunityFrames += 1;
      if ([...seen.values()].some((e) => e.actionCtx)) seat.actionOpportunityFrames += 1;
      if ([...seen.values()].some((e) => e.response)) seat.responseOpportunityFrames += 1;
      if (scoreOf && state) {
        const diff = (scoreOf(state, actorId) ?? 0) - (scoreOf(state, seatOrder[1 - seatIndex]) ?? 0);
        seat.opportunityContexts[diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'tied'] += 1;
      }
      for (const [recipeId, entry] of seen) {
        const r = seat.recipes[recipeId] ??= { recipeId, opportunities: 0, legalOptions: 0, declarations: 0, resolved: 0, countered: 0, fizzled: 0, broken: 0 };
        r.opportunities += 1;
        r.legalOptions += entry.count;
      }
    },

    /**
     * Record a selected Combo declaration. `events` must be the declaring
     * command's event batch so the authoritative stackItemId / committed cards
     * bind to the record. `stateBefore`/`scoreBefore` capture the pre-declare
     * state; `state` is post-execution (identities resolved from either).
     */
    declared({ action, actorId, seat, decisionIndex, fullTurn, phase, commandIndex, checkpointId, events, stateBefore, state, scoreBefore, scoreDiffBefore }) {
      const recipeId = comboRecipeId(action);
      if (!recipeId) return null;
      const comboClass = comboClassOf(action);
      let stackItemId = null, eventSources = null, targetStackItemId = null;
      for (const ev of events ?? []) {
        const p = ev?.payload ?? {};
        if (ev.type === 'CORE_ACTION_DECLARED' && COMBO_STACK_CLASSES.has(p.stackClass)) {
          stackItemId = p.stackItemId; eventSources = p.sourceCardIds; break;
        }
        if (ev.type === 'CORE_SUPER_ACE_COUNTER_DECLARED' || ev.type === 'CORE_ULTRA_THREE_RED_DECLARED' || ev.type === 'DEFINED_COMBO_DECLARED') {
          stackItemId = p.stackItemId; eventSources = p.sourceCardIds ?? (p.sourceCardId ? [p.sourceCardId] : null);
          targetStackItemId = p.targetStackItemId ?? null;
          break;
        }
      }
      const record = stackItemId && byStackItem.get(stackItemId)
        ? byStackItem.get(stackItemId)
        : openRecord({
            stackItemId: stackItemId ?? `unbound:${comboIdFor(matchId, decisionIndex, null, action?.actionId)}`,
            actorId, comboClass,
            sourceCardIds: eventSources ?? action?.sourceHandles ?? [],
            targetCardIds: action?.targetHandles ?? [],
            targetStackItemId,
            state: state ?? stateBefore,
            evidence: 'declaration-command',
          });
      // Enrich with decision context (record may have been opened by observe()
      // if the declare event batch was consumed first — never duplicate it).
      record.comboId = comboIdFor(matchId, decisionIndex, stackItemId, action?.actionId);
      record.recipeId = recipeId;
      record.mode = action?.mode ?? null;
      record.timingClass = action?.timingClass ?? null;
      record.declarationContext = action?.timingClass === 'ACTION' ? 'action' : 'response';
      record.decisionOrdinal = decisionIndex;
      record.fullTurn = fullTurn ?? record.fullTurn;
      record.phase = phase ?? record.phase;
      record.commandIndex = commandIndex;
      record.checkpointId = checkpointId;
      record.actionId = action?.actionId ?? null;
      record.actorId = actorId;
      record.seat = seat + 1;
      record.policyId = policyIds[seat] ?? null;
      if (Array.isArray(record.committedCardIds) && record.committedCardIds.length === 0) {
        const ids = action?.sourceHandles ?? [];
        const identities = ids.map((id) => identityOf(state ?? stateBefore, id)).filter(Boolean);
        record.committedCardIds = [...ids];
        record.committedCardCount = ids.length;
        record.componentIdentities = identities;
        record.componentRanks = [...new Set(identities.map(rankOf).filter(Boolean))];
        record.componentSuits = [...new Set(identities.map(suitOf).filter(Boolean))];
      }
      record.scoreBefore = scoreBefore ?? null;
      record.scoreDiffBefore = scoreDiffBefore ?? null;
      record.initiatingCardId = action?.advanced?.initiatorCardId ?? null;
      const seatEntry = seats[seat];
      if (seatEntry) {
        seatEntry.declarations += 1;
        const r = seatEntry.recipes[recipeId] ??= { recipeId, opportunities: 0, legalOptions: 0, declarations: 0, resolved: 0, countered: 0, fizzled: 0, broken: 0 };
        r.declarations += 1;
      }
      return record;
    },

    /** Consume an event batch; `state` is the post-transition state. */
    observe(events, state) {
      for (const ev of events ?? []) {
        const p = ev?.payload ?? {};
        const type = String(ev?.type ?? '');
        if (type === 'CORE_ACTION_DECLARED') {
          if (!COMBO_STACK_CLASSES.has(p.stackClass) || byStackItem.has(p.stackItemId)) continue;
          openRecord({ stackItemId: p.stackItemId, actorId: p.playerId ?? null, comboClass: p.stackClass, sourceCardIds: p.sourceCardIds, targetCardIds: p.targetCardIds, state, evidence: 'event:CORE_ACTION_DECLARED' });
        } else if (COMBO_DECLARE_EVENTS.has(type)) {
          if (byStackItem.has(p.stackItemId)) continue;
          const item = state?.stack?.find((it) => it.id === p.stackItemId);
          openRecord({
            stackItemId: p.stackItemId, actorId: p.playerId ?? item?.controllerId ?? null,
            comboClass: type === 'CORE_ULTRA_THREE_RED_DECLARED' ? 'ultra' : type === 'DEFINED_COMBO_DECLARED' ? 'generic' : 'super',
            sourceCardIds: p.sourceCardIds ?? (p.sourceCardId ? [p.sourceCardId] : []),
            targetCardIds: [], targetStackItemId: p.targetStackItemId ?? null,
            state, evidence: `event:${type}`,
          });
        } else if (type === 'CORE_ROOT_RESOLVED') {
          const record = byStackItem.get(p.stackItemId);
          if (record) { record.evidence.push('event:CORE_ROOT_RESOLVED'); settle(record, 'resolved', state); }
        } else if (type === 'CORE_ROOT_FIZZLED') {
          const record = byStackItem.get(p.stackItemId);
          if (record) { record.evidence.push('event:CORE_ROOT_FIZZLED'); settle(record, 'fizzled', state, { failureReason: p.reasonCode ?? null }); }
        } else if (type === 'CORE_COUNTER_RESOLVED') {
          const selfRecord = byStackItem.get(p.stackItemId);
          if (selfRecord) {
            selfRecord.evidence.push('event:CORE_COUNTER_RESOLVED:self');
            selfRecord.counteredTargetStackItemId = p.targetStackItemId ?? null;
            settle(selfRecord, 'resolved', state);
          }
          const targetRecord = byStackItem.get(p.targetStackItemId);
          if (targetRecord) {
            const counterItem = state?.stack?.find((it) => it.id === p.stackItemId);
            targetRecord.evidence.push('event:CORE_COUNTER_RESOLVED:target');
            settle(targetRecord, 'countered', state, {
              counterKind: p.counterKind ?? null,
              counterDestination: p.destination ?? null,
              counteredByActorId: counterItem?.controllerId ?? null,
            });
          }
        } else if (/COMBO_BREAKER/.test(type)) {
          // Forward support for a future 4♥ Combo Breaker implementation.
          const record = byStackItem.get(p.stackItemId ?? p.targetStackItemId);
          if (record) { record.evidence.push(`event:${type}`); settle(record, 'broken', state, { breakerCardId: p.sourceCardId ?? p.breakerCardId ?? null }); }
        }
      }
    },

    finish({ winner, terminationReason }) {
      const terminal = !['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(terminationReason);
      for (const record of records) {
        if (record.status === 'declared') record.status = 'pending';
        record.wonMatch = winner == null || winner === 'DRAW' ? null : record.actorId === winner;
        // Roll lifecycle into the owning seat's recipe row.
        if (record.seat != null && record.recipeId) {
          const r = seats[record.seat - 1]?.recipes?.[record.recipeId];
          if (r && ['resolved', 'countered', 'fizzled', 'broken'].includes(record.status)) r[record.status] += 1;
        }
      }
      const totals = { opportunities: 0, actionOpportunities: 0, responseOpportunities: 0, declarations: records.length, resolved: 0, countered: 0, fizzled: 0, broken: 0, pending: 0 };
      for (const seat of seats) {
        totals.opportunities += seat.opportunityFrames;
        totals.actionOpportunities += seat.actionOpportunityFrames;
        totals.responseOpportunities += seat.responseOpportunityFrames;
      }
      for (const record of records) totals[record.status === 'declared' ? 'pending' : record.status] = (totals[record.status] ?? 0) + 1;
      totals.uncountered = records.filter((r) => r.status !== 'countered' && r.status !== 'broken').length;
      return {
        schemaVersion: COMBO_TELEMETRY_SCHEMA_VERSION,
        capability: {
          lifecycleSource: 'authority-events',
          opportunitySource: 'legal-action-frames',
          brokenObservable: false,
          brokenReason: '4♥ Combo Breaker has no implementation in this engine build — broken is reported as unavailable, never inferred from counters or failures.',
          matchTerminatedEarly: terminal,
        },
        totals,
        seats: seats.map((seat) => ({
          seat: seat.seat, playerId: seat.playerId, policyId: seat.policyId,
          opportunityFrames: seat.opportunityFrames,
          actionOpportunityFrames: seat.actionOpportunityFrames,
          responseOpportunityFrames: seat.responseOpportunityFrames,
          opportunityContexts: { ...seat.opportunityContexts },
          declarations: seat.declarations,
          recipes: Object.fromEntries(Object.entries(seat.recipes).sort()),
        })),
        records,
      };
    },
  };
}
