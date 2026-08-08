// ═══════════════════════════════════════════════════════════════
// decision-evidence.js — Decision evidence for replay inspection
//
// Provides structured evidence for each decision point in a match:
//   - What was the game state at the decision?
//   - What legal actions were available?
//   - What was chosen?
//   - What was the outcome?
//   - What Rank Anatomy concepts are relevant?
//
// Evidence is derived from the engine journal, never invented.
// ═══════════════════════════════════════════════════════════════

/**
 * Build decision evidence from a session's decision journal.
 *
 * @param {object} session - The play session
 * @param {object} options - { includeRankAnatomy }
 * @returns {object[]} Array of decision evidence entries
 */
export function buildDecisionEvidence(session, options = {}) {
  const journal = session?.decisionJournal ?? [];
  return journal.map((entry, index) => buildSingleDecisionEvidence(entry, index, options));
}

/**
 * Build evidence for a single decision.
 */
function buildSingleDecisionEvidence(entry, index, options) {
  const evidence = {
    index: index + 1,
    decisionId: entry.decisionId ?? `decision-${index + 1}`,
    timestamp: entry.timestamp ?? null,
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorId === 'P1' ? 'Player 1' : entry.actorId === 'P2' ? 'Player 2' : (entry.actorId ?? 'Unknown'),
    kind: entry.kind ?? 'UNKNOWN',
    kindLabel: decisionKindLabel(entry.kind),
    phase: entry.phase ?? null,
    turn: entry.fullTurnSequence ?? null,
    miniTurn: entry.miniTurnSequence ?? null,
    legalActionCount: entry.legalActions?.length ?? 0,
    legalActionFamilies: [...new Set((entry.legalActions ?? []).map(a => a.family))],
    chosenActionId: entry.chosenActionId ?? null,
    chosenActionFamily: entry.chosenActionFamily ?? null,
    chosenActionLabel: entry.chosenActionLabel ?? null,
    outcome: entry.outcome ?? null,
    stateRevision: entry.stateRevision ?? null,
    frameHash: entry.frameHash ?? null,
  };

  // Add legal action summaries (without revealing private info)
  if (entry.legalActions && options.includeLegalActions !== false) {
    evidence.legalActions = entry.legalActions.map(a => ({
      actionId: a.actionId,
      family: a.family,
      label: a.shortLabel ?? a.family,
      isResponse: a.isResponse ?? false,
      isDecline: a.isDecline ?? false,
      isSuper: a.isSuper ?? false,
      timingClass: a.timingClass ?? null,
    }));
  }

  // Add Rank Anatomy links if requested
  if (options.includeRankAnatomy) {
    evidence.rankAnatomyLinks = buildRankAnatomyLinks(evidence);
  }

  return evidence;
}

/**
 * Build Rank Anatomy links for a decision.
 * Links to relevant rank concepts based on the action family and kind.
 */
function buildRankAnatomyLinks(evidence) {
  const links = [];
  const family = evidence.chosenActionFamily;

  // Map action families to Rank Anatomy concepts
  const familyToConcept = {
    'score': 'point-progression',
    'scuttle': 'removal-interaction',
    'effect': 'card-effect',
    'effect-three': 'card-effect',
    'effect-jack': 'attachment',
    'effect-queen': 'protection',
    'effect-king': 'enduring-presence',
    'effect-ace': 'one-shot-removal',
    'swap-bar': 'shared-resource',
    'draw': 'resource-accumulation',
    'pass': 'tempo-management',
    'super': 'combined-declaration',
    'counter': 'stack-interaction',
  };

  const concept = familyToConcept[family];
  if (concept) {
    links.push({
      conceptId: concept,
      label: concept.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      url: `#/ranks/${concept}`,
    });
  }

  // Add stack-related link if there was a stack interaction
  if (evidence.kind === 'RESPONSE' || evidence.kind === 'COUNTER') {
    links.push({
      conceptId: 'stack-resolution',
      label: 'Stack Resolution',
      url: '#/ranks/stack-resolution',
    });
  }

  // Add priority-related link
  if (evidence.kind === 'PROACTIVE' || evidence.kind === 'REACTIVE') {
    links.push({
      conceptId: 'priority-windows',
      label: 'Priority Windows',
      url: '#/ranks/priority-windows',
    });
  }

  return links;
}

/**
 * Get a human-readable label for a decision kind.
 */
function decisionKindLabel(kind) {
  const labels = {
    'PROACTIVE': 'Proactive',
    'REACTIVE': 'Reactive',
    'RESPONSE': 'Response',
    'COUNTER': 'Counter',
    'FORCED': 'Forced',
    'AUTOMATIC': 'Automatic',
    'UNKNOWN': 'Unknown',
  };
  return labels[kind] ?? kind ?? 'Unknown';
}

/**
 * Build a checkpoint list for replay navigation.
 * Checkpoints are at each decision point.
 *
 * @param {object} session - The play session
 * @returns {object[]} Array of checkpoint entries
 */
export function buildCheckpoints(session) {
  const journal = session?.decisionJournal ?? [];
  return journal.map((entry, index) => ({
    checkpointId: `cp-${index + 1}`,
    decisionIndex: index,
    timestamp: entry.timestamp ?? null,
    actorId: entry.actorId,
    actorLabel: entry.actorId === 'P1' ? 'Player 1' : entry.actorId === 'P2' ? 'Player 2' : 'Unknown',
    kind: entry.kind,
    kindLabel: decisionKindLabel(entry.kind),
    turn: entry.fullTurnSequence ?? null,
    miniTurn: entry.miniTurnSequence ?? null,
    chosenActionLabel: entry.chosenActionLabel ?? null,
    stateRevision: entry.stateRevision ?? null,
  }));
}

/**
 * Build a match summary for the History list.
 *
 * @param {object} session - The play session
 * @returns {object} Match summary
 */
export function buildMatchSummary(session) {
  const setup = session?.setup ?? {};
  const match = session?.match ?? {};
  const journal = session?.decisionJournal ?? [];

  return {
    sessionId: session?.sessionId ?? null,
    profileId: setup.profileId,
    seed: setup.seed,
    aiPolicyId: setup.aiPolicyId,
    aiArchetype: setup.aiArchetype,
    aiDifficulty: setup.aiDifficulty,
    mode: setup.mode,
    startedAt: session?.startedAt ?? null,
    completedAt: session?.completedAt ?? null,
    winner: match.winner ?? null,
    terminationReason: match.terminationReason ?? null,
    fullTurns: match.fullTurnSequence ?? 0,
    decisionCount: journal.length,
    humanDecisionCount: journal.filter(d => d.actorId === setup.humanPlayerId).length,
    aiDecisionCount: journal.filter(d => d.actorId !== setup.humanPlayerId).length,
  };
}

/**
 * Build a History entry for the Observatory.
 * History entries are public summaries — no private information.
 *
 * @param {object} session - The play session
 * @returns {object} History entry
 */
export function buildHistoryEntry(session) {
  const summary = buildMatchSummary(session);
  return {
    ...summary,
    type: 'match-history',
    version: 1,
    // No private information — no card IDs, no hand contents
    // Only structural metadata
  };
}

/**
 * Build a trace entry for the Observatory.
 * Trace entries show the decision sequence without private info.
 *
 * @param {object} session - The play session
 * @returns {object} Trace entry
 */
export function buildTraceEntry(session) {
  const checkpoints = buildCheckpoints(session);
  return {
    sessionId: session?.sessionId,
    type: 'decision-trace',
    version: 1,
    checkpointCount: checkpoints.length,
    checkpoints: checkpoints.map(c => ({
      index: c.decisionIndex,
      actor: c.actorLabel,
      kind: c.kindLabel,
      turn: c.turn,
      action: c.chosenActionLabel,
    })),
  };
}
