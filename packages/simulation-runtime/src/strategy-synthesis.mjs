// ═══════════════════════════════════════════════════════════════
// strategy-synthesis.mjs — STRATEGIC_FINDING_V1 deterministic synthesis.
//
// A Strategy Claim says "this measured relationship exists."
// A Strategic Finding says "these measured signals together form an
// interesting strategic pattern." Findings combine timing, usage,
// outcome association, semantic use, matchup/policy variation and
// sample adequacy — they never invent data and never upgrade
// observational evidence into causal advice.
//
// Trust classes:
//   OBSERVED_PATTERN   — deterministic summary of descriptive or
//                        associational evidence.
//   WORKING_HYPOTHESIS — a plausible strategy question suggested by
//                        two or more observed signals.
//   CONTROLLED_ADVICE  — re-stated only from an existing admissible
//                        controlled Strategy Claim; this layer can
//                        never manufacture one.
// ═══════════════════════════════════════════════════════════════
import { strategyDigest } from './strategy-contracts.mjs';

export const STRATEGIC_FINDING_CONTRACT = 'STRATEGIC_FINDING_V1';
export const STRATEGY_SYNTHESIS_CONTRACT = 'STRATEGY_SYNTHESIS_V1';
export const FINDING_TRUST = Object.freeze({
  OBSERVED_PATTERN: 'OBSERVED_PATTERN',
  WORKING_HYPOTHESIS: 'WORKING_HYPOTHESIS',
  CONTROLLED_ADVICE: 'CONTROLLED_ADVICE'
});
export const FINDING_TYPES = Object.freeze({
  TIMING_SHIFT: 'TIMING_SHIFT',
  LATE_COMMITMENT_PATTERN: 'LATE_COMMITMENT_PATTERN',
  EARLY_COMMITMENT_PATTERN: 'EARLY_COMMITMENT_PATTERN',
  RESOURCE_TO_SCORE_TRANSITION: 'RESOURCE_TO_SCORE_TRANSITION',
  HIGH_USAGE_POSITIVE_ASSOCIATION: 'HIGH_USAGE_POSITIVE_ASSOCIATION',
  HIGH_USAGE_NEGATIVE_ASSOCIATION: 'HIGH_USAGE_NEGATIVE_ASSOCIATION',
  LOW_USAGE_POSITIVE_SIGNAL: 'LOW_USAGE_POSITIVE_SIGNAL',
  LOW_USAGE_NEGATIVE_SIGNAL: 'LOW_USAGE_NEGATIVE_SIGNAL',
  POLICY_DISAGREEMENT: 'POLICY_DISAGREEMENT',
  MATCHUP_SENSITIVITY: 'MATCHUP_SENSITIVITY',
  SEMANTIC_MODE_CONCENTRATION: 'SEMANTIC_MODE_CONCENTRATION',
  SEMANTIC_MODE_SPLIT: 'SEMANTIC_MODE_SPLIT',
  COMMON_DEFAULT_ACTION: 'COMMON_DEFAULT_ACTION',
  RARE_OPTION: 'RARE_OPTION',
  COMBINATION_UNDERUSED: 'COMBINATION_UNDERUSED',
  COMBINATION_FREQUENT: 'COMBINATION_FREQUENT',
  CONTROL_SIGNAL: 'CONTROL_SIGNAL',
  MOTIF_PATTERN: 'MOTIF_PATTERN',
  SAMPLE_TOO_THIN: 'SAMPLE_TOO_THIN',
  NO_CLEAR_PATTERN: 'NO_CLEAR_PATTERN'
});

// Documented deterministic thresholds. They are presentation gates —
// they decide what is worth saying, never what the evidence means.
export const SYNTHESIS_THRESHOLDS = Object.freeze({
  // Timing trends: a bucket can drive a headline only when it saw
  // enough opportunities. Thin end-buckets may be described but are
  // always flagged as unstable.
  TIMING_BUCKET_MIN: 5,          // bucket eligible to enter the trend
  TIMING_BUCKET_SOLID: 10,       // bucket counts as a stable endpoint
  TIMING_MIN_TOTAL: 25,          // total eligible opportunities for any trend
  TIMING_SPREAD: 0.25,           // max-min eligible rate for "varies by phase"
  TIMING_DIRECTION: 0.20,        // first→last eligible delta for rising/falling
  // Usage / association
  HIGH_USAGE_RATE: 0.40,
  DEFAULT_ACTION_RATE: 0.85,
  RARE_OPTION_RATE: 0.10,
  RARE_OPTION_MIN_OPPORTUNITIES: 30,
  ASSOCIATION_STRONG: 0.10,      // |pp association| for a notable signal
  ASSOCIATION_RARE: 0.15,        // |pp| needed before a rarely used option signals
  ASSOCIATION_MIN_SIDE: 6,       // min selected AND skipped for a robust assoc
  // Split comparisons (policy / matchup)
  SPLIT_MIN_OPPORTUNITIES: 10,   // per compared group
  SPLIT_MIN_DELTA: 0.20,         // |rate difference| to call a difference
  // Semantic use decomposition
  SEMANTIC_CONCENTRATION: 0.70,
  SEMANTIC_SPLIT_MIN: 0.25,
  SEMANTIC_MIN_OPPORTUNITIES: 10,
  // Combinations
  COMBINATION_MIN_OPPORTUNITIES: 12,
  COMBINATION_FREQUENT_RATE: 0.50,
  COMBINATION_UNDERUSED_RATE: 0.15,
  // Motifs: a sequence is guide-worthy only across independent games
  MOTIF_MIN_GAMES: 2,
  MOTIF_MIN_OCCURRENCES: 3,
  // Thin evidence: below this, dramatic numbers are flagged, not headlined
  THIN_SUBJECT_OPPORTUNITIES: 15
});

// Canonical display order for identical-signal deduplication. mechanic:/
// mode:/timing: tags describe the same action and routinely aggregate to
// an identical opportunity set; the friendliest alias wins.
const CANONICAL_PREFERENCE = ['combination', 'family', 'rank', 'card', 'suit', 'timing', 'mechanic', 'mode'];
const subjectKind = subject => String(subject ?? '').split(':')[0];

/** Fingerprint of the underlying opportunity set — identical signals dedup. */
function signalSignature(aggregate) {
  const t = aggregate?.total ?? {};
  const timing = (aggregate?.timing ?? []).map(b => `${b.opportunities ?? 0}:${b.selected ?? 0}`).join(',');
  return `${t.decisions ?? 0}|${t.opportunities ?? 0}|${t.selected ?? 0}|${timing}`;
}

/**
 * Collapse alias subjects (family:/mechanic:/mode:/timing:/combination:
 * carrying the same opportunities) to one canonical representative.
 * Returns { canonical, aliases } where canonical keeps the preferred
 * subject key and aliases records every absorbed subject.
 */
export function canonicalizeSubjects(subjectData) {
  const groups = new Map();
  for (const d of subjectData) {
    const signature = signalSignature(d.aggregate);
    const group = groups.get(signature) ?? [];
    group.push(d);
    groups.set(signature, group);
  }
  const canonical = [], aliases = new Map();
  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) =>
      CANONICAL_PREFERENCE.indexOf(subjectKind(a.subject)) - CANONICAL_PREFERENCE.indexOf(subjectKind(b.subject))
      || a.subject.localeCompare(b.subject));
    const head = ranked[0];
    canonical.push({ ...head, canonicalSubject: head.subject, aliases: group.map(g => g.subject) });
    aliases.set(head.subject, group.map(g => g.subject));
  }
  return { canonical, aliases };
}

const pp = n => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)} pp`;
const pct0 = n => `${(n * 100).toFixed(1)}%`;
const bucketLabel = b => b.charAt(0) + b.slice(1).toLowerCase();

/**
 * Deterministic timing-trend analysis for one subject.
 * Returns shape INSUFFICIENT when too few buckets carry enough
 * opportunities — 2/2 = 100% never drives a headline.
 */
export function timingTrend(aggregate) {
  const rows = (aggregate?.timing ?? []).filter(t => t.opportunities >= SYNTHESIS_THRESHOLDS.TIMING_BUCKET_MIN && t.selectionRate !== null);
  const thin = rows.filter(t => t.opportunities < SYNTHESIS_THRESHOLDS.TIMING_BUCKET_SOLID);
  const total = rows.reduce((n, t) => n + t.opportunities, 0);
  if (rows.length < 2 || total < SYNTHESIS_THRESHOLDS.TIMING_MIN_TOTAL)
    return { shape: 'INSUFFICIENT', eligible: rows.map(t => t.bucket), thin: thin.map(t => t.bucket), totalOpportunities: total };
  const first = rows[0], last = rows.at(-1);
  const rates = rows.map(t => t.selectionRate);
  const peak = rows[rates.indexOf(Math.max(...rates))], trough = rows[rates.indexOf(Math.min(...rates))];
  const spread = peak.selectionRate - trough.selectionRate;
  const delta = last.selectionRate - first.selectionRate;
  const result = {
    shape: 'FLAT', eligible: rows.map(t => t.bucket), thin: thin.map(t => t.bucket), totalOpportunities: total,
    first: { bucket: first.bucket, rate: first.selectionRate, opportunities: first.opportunities, selected: first.selected },
    last: { bucket: last.bucket, rate: last.selectionRate, opportunities: last.opportunities, selected: last.selected },
    peak: { bucket: peak.bucket, rate: peak.selectionRate, opportunities: peak.opportunities },
    trough: { bucket: trough.bucket, rate: trough.selectionRate, opportunities: trough.opportunities },
    spread, delta, thinTail: last.opportunities < SYNTHESIS_THRESHOLDS.TIMING_BUCKET_SOLID
  };
  if (spread < SYNTHESIS_THRESHOLDS.TIMING_SPREAD) return result;
  const rising = delta >= SYNTHESIS_THRESHOLDS.TIMING_DIRECTION;
  const falling = delta <= -SYNTHESIS_THRESHOLDS.TIMING_DIRECTION;
  // An interior extreme with endpoints on the same side is a peak/trough,
  // not a directional shift.
  if (rising && peak.bucket === last.bucket) result.shape = 'INCREASING';
  else if (falling && trough.bucket === last.bucket) result.shape = 'DECREASING';
  else if (rising) result.shape = 'RISING_LATE';
  else if (falling) result.shape = 'FALLING_LATE';
  else if (peak.bucket !== first.bucket && peak.bucket !== last.bucket) result.shape = 'PEAKED';
  else if (trough.bucket !== first.bucket && trough.bucket !== last.bucket) result.shape = 'TROUGHED';
  else result.shape = 'MIXED';
  return result;
}

const joinList = items => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** Sample-aware one-sentence description of a timing trend. */
export function timingTrendSentence(name, trend) {
  if (trend.shape === 'INSUFFICIENT') return null;
  const { first, last } = trend;
  const range = `${pct0(first.rate)} of ${first.opportunities} ${bucketLabel(first.bucket)} opportunities → ${pct0(last.rate)} of ${last.opportunities} ${bucketLabel(last.bucket)}`;
  const thinNote = trend.thin.length ? ` The ${joinList(trend.thin.map(bucketLabel))} bucket${trend.thin.length === 1 ? ' is' : 's are'} thin, so the exact percentage is unstable.` : '';
  const verbs = { INCREASING: 'rose', RISING_LATE: 'rose late', DECREASING: 'fell', FALLING_LATE: 'fell late' };
  if (trend.shape === 'FLAT') return null;
  if (verbs[trend.shape]) return `${name} usage ${verbs[trend.shape]} across game maturity — ${range}.${thinNote}`;
  if (trend.shape === 'PEAKED') return `${name} usage peaked in ${bucketLabel(trend.peak.bucket)} (${pct0(trend.peak.rate)} of ${trend.peak.opportunities}) rather than at either end — ${range}.${thinNote}`;
  if (trend.shape === 'TROUGHED') return `${name} usage dipped in ${bucketLabel(trend.trough.bucket)} (${pct0(trend.trough.rate)} of ${trend.trough.opportunities}) — ${range}.${thinNote}`;
  return `${name} usage varied by phase without a clean direction — ${range}.${thinNote}`;
}

/**
 * Real per-group differences inside one subject. dimension is 'byPolicy'
 * or 'byMatchup'. Returns the strongest qualifying pair, or null when no
 * adequately sampled difference exists — metadata ("seen against N
 * policies") is never a finding.
 */
export function splitDifference(aggregate, dimension) {
  const cells = aggregate?.[dimension];
  if (!cells) return null;
  const groups = Object.entries(cells)
    .map(([id, c]) => ({ id, opportunities: c.opportunities ?? 0, selected: c.selected ?? 0, rate: c.opportunities ? c.selected / c.opportunities : null }))
    .filter(g => g.rate !== null);
  const adequate = groups.filter(g => g.opportunities >= SYNTHESIS_THRESHOLDS.SPLIT_MIN_OPPORTUNITIES);
  let best = null;
  for (const a of adequate) for (const b of adequate) {
    if (a.id >= b.id) continue;
    const delta = a.rate - b.rate;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { high: delta >= 0 ? a : b, low: delta >= 0 ? b : a, delta: Math.abs(delta) };
  }
  if (best && best.delta >= SYNTHESIS_THRESHOLDS.SPLIT_MIN_DELTA) return { ...best, thin: false, groups };
  // A large-looking gap on thin cells is SAMPLE_TOO_THIN material.
  const thinGroups = groups.filter(g => g.opportunities > 0);
  let suspicious = null;
  for (const a of thinGroups) for (const b of thinGroups) {
    if (a.id >= b.id) continue;
    const delta = Math.abs(a.rate - b.rate);
    if (delta >= SYNTHESIS_THRESHOLDS.SPLIT_MIN_DELTA && (!suspicious || delta > suspicious.delta))
      suspicious = { high: a.rate >= b.rate ? a : b, low: a.rate >= b.rate ? b : a, delta };
  }
  if (suspicious) return { ...suspicious, thin: true, groups };
  return null;
}

/**
 * True matchup difference: the SAME policy behaving differently across
 * opponents. With mirror self-play each policy sees exactly one opponent,
 * so aggregate byMatchup deltas are confounded — this returns null there,
 * correctly refusing to relabel a policy difference as matchup evidence.
 */
export function withinPolicyMatchupDifference(aggregate) {
  const nested = aggregate?.byPolicyMatchup;
  if (!nested) return null;
  let best = null;
  for (const [policyId, cells] of Object.entries(nested)) {
    const groups = Object.entries(cells)
      .map(([id, c]) => ({ id, opportunities: c.opportunities ?? 0, selected: c.selected ?? 0, rate: c.opportunities ? c.selected / c.opportunities : null }))
      .filter(g => g.rate !== null && g.opportunities >= SYNTHESIS_THRESHOLDS.SPLIT_MIN_OPPORTUNITIES);
    for (const a of groups) for (const b of groups) {
      if (a.id >= b.id) continue;
      const delta = a.rate - b.rate;
      if (Math.abs(delta) >= SYNTHESIS_THRESHOLDS.SPLIT_MIN_DELTA && (!best || Math.abs(delta) > Math.abs(best.delta)))
        best = { policyId, high: delta >= 0 ? a : b, low: delta >= 0 ? b : a, delta: Math.abs(delta) };
    }
  }
  return best;
}

const ACTIONABLE = c => !['INSUFFICIENT', 'EXPERIMENTAL'].includes(c.confidence) && c.recommendation && c.recommendation !== 'UNKNOWN';

function makeFinding(scope, fields) {
  const { type, subjects, trustClass, headline, summaryData = {}, sample = {}, observations = [], interpretation = '', limitations = [], nextTest = '', sourceClaimIds = [], salience = 0 } = fields;
  const findingId = `SF-${strategyDigest({ type, subjects, headline, fingerprint: scope.fingerprint, eraId: scope.eraId }).slice(0, 16)}`;
  return {
    contract: STRATEGIC_FINDING_CONTRACT, findingId, type, subjects, trustClass, headline, summaryData,
    sample, salience, observations, interpretation, limitations, nextTest,
    sourceClaimIds, sourceAggregateKeys: subjects,
    eraId: scope.eraId, rulesProfile: scope.rulesProfile, fingerprint: scope.fingerprint
  };
}

/**
 * STRATEGY_SYNTHESIS_V1 — derive Strategic Findings from per-subject
 * aggregates and claims. Input entries use the guide's subjectData shape:
 * { subject, name, aggregate, assoc, leads, controlled }.
 */
export function synthesizeStrategyFindings(subjectData, { claims = [], motifs = [], fingerprint = null, rulesProfile = null, eraId = null, humanName = s => s } = {}) {
  const scope = { fingerprint, rulesProfile, eraId };
  const T = SYNTHESIS_THRESHOLDS;
  const { canonical } = canonicalizeSubjects(subjectData);
  const bySubject = new Map(canonical.map(d => [d.subject, d]));
  const findings = [];

  // Corpus baseline for semantic splits: scoring vs non-scoring use is
  // the universal per-card choice, so a card only "does a second job"
  // when its non-score selection share clears the corpus baseline.
  // rank: subjects partition card identity, so they alone build the baseline.
  let scoreSel = 0, nonScoreSel = 0;
  for (const d of canonical) {
    if (!/^rank:/.test(d.subject) || !d.aggregate?.semantics) continue;
    for (const [category, cell] of Object.entries(d.aggregate.semantics)) {
      if (category === 'SCORE_USE') scoreSel += cell.selected ?? 0;
      else nonScoreSel += cell.selected ?? 0;
    }
  }
  const semanticTotal = scoreSel + nonScoreSel;
  const nonScoreBaseline = semanticTotal ? nonScoreSel / semanticTotal : null;

  const salienceFor = ({ signal, opportunities, games = 0, cross = 0 }) => {
    const sampleFactor = Math.min(1, Math.sqrt((opportunities ?? 0) / 60));
    const gameFactor = Math.min(1, Math.sqrt((games ?? 0) / 30));
    return Number(((0.45 * signal + 0.35 * sampleFactor + 0.20 * gameFactor + cross).toFixed(4)));
  };

  for (const d of canonical) {
    const { subject, aggregate } = d;
    const name = d.name ?? humanName(subject);
    const c = aggregate?.total ?? {};
    const kind = subjectKind(subject);
    // mechanic:/mode: are sub-descriptors inside a family — their findings
    // are covered by the family or rank lens; emitting them doubles noise.
    if (kind === 'mechanic' || kind === 'mode') continue;
    const cardish = ['rank', 'card'].includes(kind);
    const trends = timingTrend(aggregate);
    const assoc = d.assoc ?? (c.selectedOutcomeAssociation !== null && c.skippedOutcomeAssociation !== null ? c.selectedOutcomeAssociation - c.skippedOutcomeAssociation : null);
    const thinSubject = (c.opportunities ?? 0) < T.THIN_SUBJECT_OPPORTUNITIES;
    const assocThin = assoc !== null && Math.min(c.selected ?? 0, c.skipped ?? 0) < T.ASSOCIATION_MIN_SIDE;
    const controlledAdvice = (d.controlled ?? []).filter(ACTIONABLE);
    // A subject selected on ~every opportunity is structural bookkeeping
    // (phase entries, forced acknowledgements), not a strategic choice.
    // Observational findings on it can only be noise.
    const structural = (c.selectionRate ?? 0) >= 0.98 && kind !== 'rank' && kind !== 'card';
    const emittedStart = findings.length;

    // ── Timing patterns ────────────────────────────────────────────
    if (!structural && !['INSUFFICIENT', 'FLAT', 'MIXED'].includes(trends.shape) && trends.spread >= T.TIMING_SPREAD) {
      const rising = ['INCREASING', 'RISING_LATE'].includes(trends.shape);
      const falling = ['DECREASING', 'FALLING_LATE'].includes(trends.shape);
      const type = cardish && rising ? FINDING_TYPES.LATE_COMMITMENT_PATTERN
        : cardish && falling ? FINDING_TYPES.EARLY_COMMITMENT_PATTERN
        : FINDING_TYPES.TIMING_SHIFT;
      const sentence = timingTrendSentence(name, trends);
      const thinFactor = trends.thin.length ? 0.8 : 1;
      findings.push(makeFinding(scope, {
        type, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
        headline: cardish && rising ? `${name} looks like a later-game commitment`
          : cardish && falling ? `${name} is reached for earlier, not later`
          : `${name} usage ${rising ? 'rises' : falling ? 'falls' : 'shifts'} across game maturity`,
        summaryData: { first: trends.first, last: trends.last, peak: trends.peak, trough: trends.trough, spread: trends.spread, delta: trends.delta, thin: trends.thin },
        sample: { opportunities: trends.totalOpportunities, games: aggregate?.games ?? null, decisions: c.decisions ?? null },
        observations: [sentence].filter(Boolean),
        interpretation: rising
          ? 'The observed policies reached for this later — it looks more like a timing question than a raw "is it good?" question.'
          : falling ? 'The observed policies reached for this earlier and let go of it as games matured.'
          : 'Usage clusters around one phase rather than being spread evenly.',
        limitations: [
          'Observational only — it shows when these policies acted, not when acting is correct.',
          ...(trends.thin.length ? [`The ${trends.thin.map(bucketLabel).join('/')} bucket(s) are thin; the endpoint rate is unstable.`] : [])
        ],
        nextTest: `Compare acting on ${name} early versus preserving it for later in matched contexts.`,
        salience: Number((salienceFor({ signal: trends.spread, opportunities: trends.totalOpportunities, games: aggregate?.games }) * thinFactor).toFixed(4))
      }));
    }

    // ── Usage / association patterns ───────────────────────────────
    const rate = c.selectionRate;
    if (!structural && rate !== null && rate !== undefined) {
      if (!thinSubject && !assocThin && assoc !== null && Math.abs(assoc) >= T.ASSOCIATION_STRONG && rate >= T.HIGH_USAGE_RATE) {
        findings.push(makeFinding(scope, {
          type: assoc > 0 ? FINDING_TYPES.HIGH_USAGE_POSITIVE_ASSOCIATION : FINDING_TYPES.HIGH_USAGE_NEGATIVE_ASSOCIATION,
          subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
          headline: `${name} is used often and carries a ${assoc > 0 ? 'positive' : 'negative'} observational signal`,
          summaryData: { selectionRate: rate, association: assoc },
          sample: { opportunities: c.opportunities, games: aggregate?.games ?? null, decisions: c.decisions ?? null },
          observations: [`Selected on ${pct0(rate)} of ${c.opportunities} opportunities; selected decisions averaged ${pp(assoc)} vs skipped.`],
          interpretation: assoc > 0 ? 'Frequent and associated with better outcomes in this data — worth controlled attention.' : 'Frequent and associated with worse outcomes in this data — the habit may be expensive.',
          limitations: ['Association is not causation; context and policy quality can explain the gap.'],
          nextTest: `Test ${name} against its strongest legal alternatives in matched opening contexts.`,
          salience: salienceFor({ signal: Math.min(1, Math.abs(assoc) / 0.4) * 0.8 + 0.2 * Math.min(1, rate), opportunities: c.opportunities, games: aggregate?.games })
        }));
      }
      if (!thinSubject && !assocThin && assoc !== null && Math.abs(assoc) >= T.ASSOCIATION_RARE && rate <= T.RARE_OPTION_RATE && (c.opportunities ?? 0) >= T.RARE_OPTION_MIN_OPPORTUNITIES) {
        findings.push(makeFinding(scope, {
          type: assoc > 0 ? FINDING_TYPES.LOW_USAGE_POSITIVE_SIGNAL : FINDING_TYPES.LOW_USAGE_NEGATIVE_SIGNAL,
          subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
          headline: `${name} is rarely chosen — and its rare uses carry a ${assoc > 0 ? 'positive' : 'negative'} signal`,
          summaryData: { selectionRate: rate, association: assoc },
          sample: { opportunities: c.opportunities, games: aggregate?.games ?? null, decisions: c.decisions ?? null },
          observations: [`Only ${pct0(rate)} of ${c.opportunities} opportunities selected; those rare selections averaged ${pp(assoc)}.`],
          interpretation: 'Rare use makes the association fragile — it is a question, not a verdict.',
          limitations: ['Few selections means the association can swing on a handful of games.'],
          nextTest: `Give ${name} a controlled contrast where it is legal and plausible.`,
          salience: salienceFor({ signal: Math.min(1, Math.abs(assoc) / 0.4) * 0.7, opportunities: c.opportunities, games: aggregate?.games })
        }));
      }
      if (rate >= T.DEFAULT_ACTION_RATE && (c.opportunities ?? 0) >= T.RARE_OPTION_MIN_OPPORTUNITIES) {
        findings.push(makeFinding(scope, {
          type: FINDING_TYPES.COMMON_DEFAULT_ACTION, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
          headline: `${name} is close to a default action for these policies`,
          summaryData: { selectionRate: rate },
          sample: { opportunities: c.opportunities, games: aggregate?.games ?? null, decisions: c.decisions ?? null },
          observations: [`Selected on ${pct0(rate)} of ${c.opportunities} opportunities.`],
          interpretation: 'When a choice is nearly automatic, the interesting question is what the exceptions look like.',
          limitations: ['Default behavior says nothing about whether declining would be better.'],
          nextTest: `Compare declining ${name} in the contexts where it is legal but rarely declined.`,
          salience: salienceFor({ signal: 0.4, opportunities: c.opportunities, games: aggregate?.games })
        }));
      }
      if (rate <= T.RARE_OPTION_RATE && (c.opportunities ?? 0) >= T.RARE_OPTION_MIN_OPPORTUNITIES && (assoc === null || Math.abs(assoc) < T.ASSOCIATION_RARE)) {
        findings.push(makeFinding(scope, {
          type: FINDING_TYPES.RARE_OPTION, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
          headline: `${name} is available but almost never taken`,
          summaryData: { selectionRate: rate },
          sample: { opportunities: c.opportunities, games: aggregate?.games ?? null, decisions: c.decisions ?? null },
          observations: [`Legal ${c.opportunities} times, selected ${pct0(rate)}.`],
          interpretation: 'Either it is weak, or these policies have not found its use — both are worth knowing.',
          limitations: ['Rare selection cannot prove the option is bad.'],
          nextTest: `Force-test ${name} in matched contexts to learn what it actually does.`,
          salience: salienceFor({ signal: 0.3, opportunities: c.opportunities, games: aggregate?.games })
        }));
      }
    }

    // ── Semantic mode decomposition (rank/card/suit subjects) ──────
    const semantics = aggregate?.semantics;
    if (!structural && semantics) {
      // Mode shares are measured on SELECTIONS — which jobs the card was
      // actually used for — not offers, since every card is routinely
      // offered several legal uses it never takes.
      const usable = Object.entries(semantics).filter(([, cell]) => (cell.selected ?? 0) > 0);
      const totalSelected = usable.reduce((n, [, cell]) => n + cell.selected, 0);
      const shares = usable.map(([category, cell]) => ({ category, share: totalSelected ? cell.selected / totalSelected : 0, ...cell })).sort((a, b) => b.share - a.share);
      const totalSem = usable.reduce((n, [, cell]) => n + cell.opportunities, 0);
      if (totalSelected >= T.SEMANTIC_MIN_OPPORTUNITIES && shares.length && shares[0].share >= T.SEMANTIC_CONCENTRATION) {
        findings.push(makeFinding(scope, {
          type: FINDING_TYPES.SEMANTIC_MODE_CONCENTRATION, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
          headline: `${name} shows up almost entirely as ${shares[0].category.replaceAll('_', ' ').toLowerCase()}`,
          summaryData: { dominant: shares[0].category, share: shares[0].share, breakdown: shares.map(s => ({ category: s.category, share: s.share })) },
          sample: { opportunities: totalSem, games: aggregate?.games ?? null },
          observations: [`${pct0(shares[0].share)} of ${name} selections were ${shares[0].category.replaceAll('_', ' ').toLowerCase()} uses (${shares[0].selected}/${shares[0].opportunities} offered).`],
          interpretation: 'The interesting question is not whether to use it, but whether the one dominant use is right.',
          limitations: ['Overlapping categories are accounting lenses, not additive counts.'],
          nextTest: `Test the dominant ${name} use in matched contexts.`,
          salience: salienceFor({ signal: 0.45, opportunities: totalSem, games: aggregate?.games })
        }));
      } else if (nonScoreBaseline !== null && totalSelected >= T.SEMANTIC_MIN_OPPORTUNITIES) {
        // Distinctive = non-scoring use well above the corpus norm; the
        // plain score-vs-use split is the game's universal choice.
        const nonScore = shares.filter(s => s.category !== 'SCORE_USE');
        const nonScoreShare = totalSelected ? nonScore.reduce((n, s) => n + s.selected, 0) / totalSelected : 0;
        const dominantJob = nonScore[0];
        if (dominantJob && dominantJob.selected >= 5 && nonScoreShare >= nonScoreBaseline + 0.25) {
          findings.push(makeFinding(scope, {
            type: FINDING_TYPES.SEMANTIC_MODE_SPLIT, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
            headline: `${name} is not just points — ${dominantJob.category.replaceAll('_', ' ').toLowerCase()} is a real job for it`,
            summaryData: { dominant: dominantJob.category, selected: dominantJob.selected, nonScoreShare, corpusBaseline: nonScoreBaseline, breakdown: shares.map(s => ({ category: s.category, share: s.share })) },
            sample: { opportunities: totalSem, games: aggregate?.games ?? null },
            observations: [`${pct0(nonScoreShare)} of ${name} selections were non-scoring uses vs ${pct0(nonScoreBaseline)} across all ranks — mostly ${dominantJob.category.replaceAll('_', ' ').toLowerCase()} (${dominantJob.selected}/${dominantJob.opportunities} offered).`],
            interpretation: 'Scoring it is the default move everywhere; this one earns its keep another way unusually often.',
            limitations: ['Overlapping categories are accounting lenses, not additive counts.', 'The split alone does not say which use is right.'],
            nextTest: `Test ${name}'s ${dominantJob.category.replaceAll('_', ' ').toLowerCase()} use against scoring it in matched contexts.`,
            salience: salienceFor({ signal: 0.5, opportunities: totalSem, games: aggregate?.games })
          }));
        }
      }
    }

    // ── Policy / matchup splits ────────────────────────────────────
    const policyDiff = structural ? null : splitDifference(aggregate, 'byPolicy');
    if (policyDiff && !policyDiff.thin) {
      findings.push(makeFinding(scope, {
        type: FINDING_TYPES.POLICY_DISAGREEMENT, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
        headline: `Policies disagree on ${name}`,
        summaryData: { dimension: 'policy', high: policyDiff.high, low: policyDiff.low, delta: policyDiff.delta },
        sample: { opportunities: policyDiff.high.opportunities + policyDiff.low.opportunities, games: aggregate?.games ?? null },
        observations: [`${policyDiff.high.id} selected ${name} ${pct0(policyDiff.high.rate)} of ${policyDiff.high.opportunities} opportunities; ${policyDiff.low.id} selected ${name} ${pct0(policyDiff.low.rate)} of ${policyDiff.low.opportunities}.`],
        interpretation: 'Two trained behaviors diverge on the same choice — someone is leaving something on the table, or the choice is genuinely contextual.',
        limitations: ['A behavior difference is not proof of which policy is right.', 'Same-era, compatible-rules evidence only.'],
        nextTest: `Test ${name} in the contexts where the policies diverge.`,
        salience: salienceFor({ signal: policyDiff.delta, opportunities: Math.min(policyDiff.high.opportunities, policyDiff.low.opportunities) * 2, games: aggregate?.games, cross: 0.05 })
      }));
    }
    const matchupDiff = structural ? null : withinPolicyMatchupDifference(aggregate);
    if (matchupDiff) {
      findings.push(makeFinding(scope, {
        type: FINDING_TYPES.MATCHUP_SENSITIVITY, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
        headline: `${name} may be matchup-sensitive`,
        summaryData: { dimension: 'matchup', policyId: matchupDiff.policyId, high: matchupDiff.high, low: matchupDiff.low, delta: matchupDiff.delta },
        sample: { opportunities: matchupDiff.high.opportunities + matchupDiff.low.opportunities, games: aggregate?.games ?? null },
        observations: [`${matchupDiff.policyId} used ${name} ${pct0(matchupDiff.high.rate)} against ${matchupDiff.high.id} (${matchupDiff.high.selected}/${matchupDiff.high.opportunities}) but ${pct0(matchupDiff.low.rate)} against ${matchupDiff.low.id} (${matchupDiff.low.selected}/${matchupDiff.low.opportunities}).`],
        interpretation: 'The same policy plays this differently depending on the opponent — a plausible matchup effect worth isolating.',
        limitations: ['A within-policy opponent split is still observational; contexts are not identical across opponents.'],
        nextTest: `Hold the position fixed and vary the opponent policy to isolate the matchup effect.`,
        salience: salienceFor({ signal: matchupDiff.delta, opportunities: Math.min(matchupDiff.high.opportunities, matchupDiff.low.opportunities) * 2, games: aggregate?.games, cross: 0.05 })
      }));
    }

    // ── Thin evidence: flag dramatic-looking numbers honestly ──────
    if (!structural && thinSubject && (c.opportunities ?? 0) > 0 && (assoc === null || Math.abs(assoc) >= 0.15 || (policyDiff?.thin ?? false) || (matchupDiff?.thin ?? false) || (rate !== null && rate >= 0.5))) {
      findings.push(makeFinding(scope, {
        type: FINDING_TYPES.SAMPLE_TOO_THIN, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
        headline: `${name} looks interesting but the sample is thin`,
        summaryData: { opportunities: c.opportunities, selectionRate: rate ?? null, association: assoc },
        sample: { opportunities: c.opportunities, games: aggregate?.games ?? null, decisions: c.decisions ?? null },
        observations: [`Only ${c.opportunities} legal opportunities recorded${assoc !== null ? `; the ${pp(assoc)} association swings on ${Math.min(c.selected, c.skipped)} smaller-side outcomes` : ''}.`],
        interpretation: 'Interesting but unstable — a few games could flip this number completely.',
        limitations: ['Too thin for any conclusion; reported so nobody mistakes it for signal.'],
        nextTest: `Collect more evidence before ${name} gets a headline.`,
        salience: salienceFor({ signal: 0.35, opportunities: c.opportunities, games: aggregate?.games }) * 0.4
      }));
    }

    // ── Combinations ───────────────────────────────────────────────
    if (!structural && kind === 'combination' && rate !== null && (c.opportunities ?? 0) >= T.COMBINATION_MIN_OPPORTUNITIES) {
      if (rate <= T.COMBINATION_UNDERUSED_RATE) {
        findings.push(makeFinding(scope, {
          type: FINDING_TYPES.COMBINATION_UNDERUSED, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
          headline: `${name} comes up but is rarely committed`,
          summaryData: { selectionRate: rate },
          sample: { opportunities: c.opportunities, games: aggregate?.games ?? null },
          observations: [`Available ${c.opportunities} times, committed ${pct0(rate)}.`],
          interpretation: 'The combination may be hard to assemble, rarely correct, or simply ignored by these policies.',
          limitations: ['Cannot distinguish "weak combo" from "unseen combo" observationally.'],
          nextTest: `Force-evaluate ${name} in positions where it is legal.`,
          salience: salienceFor({ signal: 0.35, opportunities: c.opportunities, games: aggregate?.games })
        }));
      } else if (rate >= T.COMBINATION_FREQUENT_RATE) {
        findings.push(makeFinding(scope, {
          type: FINDING_TYPES.COMBINATION_FREQUENT, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
          headline: `${name} is a real part of how these games get played`,
          summaryData: { selectionRate: rate },
          sample: { opportunities: c.opportunities, games: aggregate?.games ?? null },
          observations: [`Committed on ${pct0(rate)} of ${c.opportunities} opportunities.`],
          interpretation: 'This combination is central to the observed style of play.',
          limitations: ['Frequent commitment is not proof the commitment wins.'],
          nextTest: `Test committing ${name} against simpler lines.`,
          salience: salienceFor({ signal: 0.5, opportunities: c.opportunities, games: aggregate?.games })
        }));
      }
    }

    // ── Controlled advice (re-stated, never manufactured) ──────────
    for (const claim of controlledAdvice) {
      findings.push(makeFinding(scope, {
        type: FINDING_TYPES.CONTROL_SIGNAL, subjects: [subject], trustClass: FINDING_TRUST.CONTROLLED_ADVICE,
        headline: `Controlled advice exists for ${name}`,
        summaryData: { confidence: claim.confidence, recommendation: claim.recommendation, estimatedMagnitude: claim.estimatedMagnitude },
        sample: { opportunities: claim.opportunityCount ?? null, games: claim.sampleSize ?? null },
        observations: ['A controlled study earned player-actionable confidence in its exact tested context.'],
        interpretation: 'This is the only kind of finding that can sound like advice — and only inside its tested context.',
        limitations: ['Applies only to the exact authorized opening context and frozen continuation policies.'],
        nextTest: 'Replicate in additional matched contexts before generalizing.',
        sourceClaimIds: [claim.artifactId],
        salience: 3 + salienceFor({ signal: 1, opportunities: claim.opportunityCount ?? 10, games: claim.sampleSize ?? 0 })
      }));
    }

    // ── Nothing stood out — one honest marker for compression ──────
    if (findings.length === emittedStart && !structural && cardish && (c.opportunities ?? 0) >= T.THIN_SUBJECT_OPPORTUNITIES) {
      findings.push(makeFinding(scope, {
        type: FINDING_TYPES.NO_CLEAR_PATTERN, subjects: [subject], trustClass: FINDING_TRUST.OBSERVED_PATTERN,
        headline: `${name} shows no strong pattern yet`,
        summaryData: { selectionRate: rate ?? null, association: assoc },
        sample: { opportunities: c.opportunities, games: aggregate?.games ?? null },
        observations: [`Usage and outcome association are near baseline across ${c.opportunities} opportunities.`],
        interpretation: 'Nothing distinctive enough to prioritize — more evidence may change that.',
        limitations: ['Absence of a pattern in this corpus is not proof none exists.'],
        nextTest: `Collect more evidence before ${name} gets a headline.`,
        salience: 0.1
      }));
    }
  }

  // ── Cross-subject: resource → scoring transition ─────────────────
  const score = bySubject.get('family:score'), draw = bySubject.get('family:draw');
  if (score && draw) {
    const scoreTrend = timingTrend(score.aggregate), drawTrend = timingTrend(draw.aggregate);
    const scoreRises = ['INCREASING', 'RISING_LATE'].includes(scoreTrend.shape);
    if (scoreRises && scoreTrend.spread >= T.TIMING_SPREAD && !['INSUFFICIENT'].includes(drawTrend.shape ?? 'INSUFFICIENT') && drawTrend.eligible?.length >= 2) {
      const drawNote = drawTrend.delta >= T.TIMING_DIRECTION
        ? `draws also rise late (${pct0(drawTrend.first.rate)} → ${pct0(drawTrend.last.rate)}), but scoring dominates the shift`
        : drawTrend.delta <= -T.TIMING_DIRECTION
          ? `draws fade as scoring takes over (${pct0(drawTrend.first.rate)} → ${pct0(drawTrend.last.rate)})`
          : `draws stay secondary (${pct0(drawTrend.first.rate)} → ${pct0(drawTrend.last.rate)})`;
      findings.push(makeFinding(scope, {
        type: FINDING_TYPES.RESOURCE_TO_SCORE_TRANSITION, subjects: ['family:score', 'family:draw'], trustClass: FINDING_TRUST.WORKING_HYPOTHESIS,
        headline: 'Games shift from setup toward scoring pressure as they mature',
        summaryData: { score: { first: scoreTrend.first, last: scoreTrend.last, delta: scoreTrend.delta }, draw: { first: drawTrend.first, last: drawTrend.last, delta: drawTrend.delta } },
        sample: { opportunities: (scoreTrend.totalOpportunities ?? 0) + (drawTrend.totalOpportunities ?? 0), games: Math.max(score.aggregate?.games ?? 0, draw.aggregate?.games ?? 0) },
        observations: [
          `Scoring: ${pct0(scoreTrend.first.rate)} of ${scoreTrend.first.opportunities} ${bucketLabel(scoreTrend.first.bucket)} opportunities → ${pct0(scoreTrend.last.rate)} of ${scoreTrend.last.opportunities} ${bucketLabel(scoreTrend.last.bucket)}.`,
          `Draws: ${pct0(drawTrend.first.rate)} of ${drawTrend.first.opportunities} ${bucketLabel(drawTrend.first.bucket)} → ${pct0(drawTrend.last.rate)} of ${drawTrend.last.opportunities} ${bucketLabel(drawTrend.last.bucket)} — ${drawNote}.`
        ],
        interpretation: 'One plausible read: policies bank resources early and convert them into scoring pressure later.',
        limitations: ['A working hypothesis — phase is confounded with score position; nothing here says the transition is optimal.', ...(scoreTrend.thin.length ? [`Score ${scoreTrend.thin.map(bucketLabel).join('/')} bucket(s) are thin.`] : [])],
        nextTest: 'Compare converting to scoring early versus continuing to build resources in matched midgame contexts.',
        salience: salienceFor({ signal: Math.min(1, scoreTrend.spread + Math.max(0, scoreTrend.delta)) * 0.9 + 0.1, opportunities: scoreTrend.totalOpportunities, games: score.aggregate?.games, cross: 0.15 })
      }));
    }
  }

  // The score/draw transition folds their individual timing findings —
  // one strategic statement, not three bullets saying the same thing.
  if (findings.some(f => f.type === FINDING_TYPES.RESOURCE_TO_SCORE_TRANSITION))
    for (const s of ['family:score', 'family:draw']) {
      const i = findings.findIndex(f => f.type === FINDING_TYPES.TIMING_SHIFT && f.subjects.length === 1 && f.subjects[0] === s);
      if (i >= 0) findings.splice(i, 1);
    }

  // ── Motifs: only multi-game sequences are strategic candidates ───
  for (const m of (motifs ?? [])) {
    if ((m.gameCount ?? 0) < T.MOTIF_MIN_GAMES || (m.occurrences ?? 0) < T.MOTIF_MIN_OCCURRENCES) continue;
    const label = m.sequence.join(' → ');
    findings.push(makeFinding(scope, {
      type: FINDING_TYPES.MOTIF_PATTERN, subjects: m.sequence, trustClass: FINDING_TRUST.OBSERVED_PATTERN,
      headline: `Policies often run "${label}" in close succession`,
      summaryData: { occurrences: m.occurrences, games: m.gameCount, outcomeScore: m.gameCount ? m.outcomeScoreSum / m.gameCount : null },
      sample: { opportunities: m.occurrences, games: m.gameCount },
      observations: [`Seen ${m.occurrences} times across ${m.gameCount} distinct games.`],
      interpretation: 'A recurring habit — possibly a real pattern, possibly just how these policies sequence things.',
      limitations: ['Associational; overlapping windows are correlated and order alone proves nothing.'],
      nextTest: 'Check whether the recurring sequence shows up across policies or belongs to one style.',
      salience: salienceFor({ signal: 0.4, opportunities: m.occurrences, games: m.gameCount })
    }));
  }

  // ── Finding-family dominance: one finding per family per subject ─
  const familyOf = f => `${f.subjects.join('+')}|${({
    [FINDING_TYPES.TIMING_SHIFT]: 'timing', [FINDING_TYPES.LATE_COMMITMENT_PATTERN]: 'timing',
    [FINDING_TYPES.EARLY_COMMITMENT_PATTERN]: 'timing',
    [FINDING_TYPES.HIGH_USAGE_POSITIVE_ASSOCIATION]: 'assoc', [FINDING_TYPES.HIGH_USAGE_NEGATIVE_ASSOCIATION]: 'assoc',
    [FINDING_TYPES.LOW_USAGE_POSITIVE_SIGNAL]: 'assoc', [FINDING_TYPES.LOW_USAGE_NEGATIVE_SIGNAL]: 'assoc',
    [FINDING_TYPES.COMMON_DEFAULT_ACTION]: 'usage', [FINDING_TYPES.RARE_OPTION]: 'usage',
    [FINDING_TYPES.SEMANTIC_MODE_CONCENTRATION]: 'semantic', [FINDING_TYPES.SEMANTIC_MODE_SPLIT]: 'semantic',
    [FINDING_TYPES.POLICY_DISAGREEMENT]: 'policy', [FINDING_TYPES.MATCHUP_SENSITIVITY]: 'matchup',
    [FINDING_TYPES.COMBINATION_UNDERUSED]: 'combo', [FINDING_TYPES.COMBINATION_FREQUENT]: 'combo',
    [FINDING_TYPES.CONTROL_SIGNAL]: 'control', [FINDING_TYPES.MOTIF_PATTERN]: 'motif', [FINDING_TYPES.SAMPLE_TOO_THIN]: 'thin'
  })[f.type] ?? f.type}`;
  const dominant = new Map();
  for (const f of findings) {
    const key = familyOf(f);
    const prev = dominant.get(key);
    if (!prev || f.salience > prev.salience) dominant.set(key, f);
  }
  const deduped = [...dominant.values()];

  // ── Ranking: distinct headlines first, controlled advice always on top ─
  const seenHeadline = new Set();
  const ranked = deduped
    .sort((a, b) => b.salience - a.salience || a.findingId.localeCompare(b.findingId))
    .filter(f => { if (seenHeadline.has(f.headline)) return false; seenHeadline.add(f.headline); return true; });
  const topFindings = ranked.filter(f => f.trustClass === FINDING_TRUST.CONTROLLED_ADVICE)
    .concat(ranked.filter(f => f.trustClass !== FINDING_TRUST.CONTROLLED_ADVICE))
    .slice(0, 8);

  // ── Grouped unknowns: semantic buckets, never per-subject spam ───
  const noControlled = canonical.filter(d => !(d.controlled ?? []).length);
  const byKind = new Map();
  for (const d of noControlled) {
    const kind = subjectKind(d.subject);
    const list = byKind.get(kind) ?? [];
    list.push(d);
    byKind.set(kind, list);
  }
  const unknowns = [];
  const names = list => list.slice(0, 4).map(d => d.name ?? humanName(d.subject)).join(', ') + (list.length > 4 ? ` and ${list.length - 4} more` : '');
  if ((byKind.get('rank') ?? []).length || (byKind.get('card') ?? []).length)
    unknowns.push({ kind: 'CARD_USE_PRESERVE', summary: `No card has controlled use-versus-preserve evidence${(byKind.get('rank') ?? []).length ? ` — including ${names(byKind.get('rank'))}` : ''}.`, subjects: [...(byKind.get('rank') ?? []), ...(byKind.get('card') ?? [])].map(d => d.subject) });
  if ((byKind.get('family') ?? []).length)
    unknowns.push({ kind: 'FAMILY_CONTRAST', summary: `No controlled contrast exists for action families (${names(byKind.get('family'))}) — only descriptive rates.`, subjects: byKind.get('family').map(d => d.subject) });
  if ((byKind.get('combination') ?? []).length)
    unknowns.push({ kind: 'COMBINATION_CONTRAST', summary: `No combination has a controlled commit-versus-simpler-line comparison (${names(byKind.get('combination'))}).`, subjects: byKind.get('combination').map(d => d.subject) });
  const otherKinds = ['suit', 'timing', 'mechanic', 'mode'].flatMap(k => byKind.get(k) ?? []);
  if (otherKinds.length)
    unknowns.push({ kind: 'DESCRIPTOR_SCOPE', summary: 'Timing tags, mechanic modes and suit lenses describe actions; they have no controlled evidence of their own.', subjects: otherKinds.map(d => d.subject) });
  const thinSubjects = canonical.filter(d => (d.aggregate?.total?.opportunities ?? 0) > 0 && (d.aggregate?.total?.opportunities ?? 0) < T.THIN_SUBJECT_OPPORTUNITIES);
  if (thinSubjects.length)
    unknowns.push({ kind: 'THIN_SAMPLE', summary: `Several subjects are too thin for stable conclusions — ${names(thinSubjects)} (fewer than ${T.THIN_SUBJECT_OPPORTUNITIES} opportunities each).`, subjects: thinSubjects.map(d => d.subject) });
  if (deduped.some(f => f.type === FINDING_TYPES.MATCHUP_SENSITIVITY) || canonical.some(d => (d.aggregate?.matchups?.length ?? 0) >= 2))
    unknowns.push({ kind: 'MATCHUP_COVERAGE', summary: 'Matchup-sensitive patterns need more independent opponent coverage before they can be trusted — within-policy opponent splits are rare in this corpus.', subjects: deduped.filter(f => f.type === FINDING_TYPES.MATCHUP_SENSITIVITY).flatMap(f => f.subjects) });

  // ── Research questions: dedup by canonical subject + lead kind ───
  const researchQuestions = [];
  const seenQ = new Set();
  for (const d of canonical) {
    const kind = subjectKind(d.subject);
    // ~always-selected structural tags cannot be meaningfully "tested".
    if ((d.aggregate?.total?.selectionRate ?? 0) >= 0.98 && kind !== 'rank' && kind !== 'card') continue;
    for (const lead of d.leads ?? []) {
      if (lead.kind === 'INSUFFICIENT') continue;
      const key = `${d.canonicalSubject ?? d.subject}|${lead.kind}`;
      if (seenQ.has(key)) continue;
      seenQ.add(key);
      researchQuestions.push({ subject: d.subject, kind: lead.kind, detail: lead.detail, salience: salienceFor({ signal: 0.5, opportunities: d.aggregate?.total?.opportunities ?? 0, games: d.aggregate?.games ?? 0 }) });
    }
  }
  researchQuestions.sort((a, b) => b.salience - a.salience);

  return {
    contract: STRATEGY_SYNTHESIS_CONTRACT,
    fingerprint, rulesProfile, eraId,
    canonicalSubjects: canonical.map(d => ({ subject: d.subject, canonicalSubject: d.canonicalSubject ?? d.subject, aliases: d.aliases ?? [d.subject] })),
    duplicateSubjects: canonical.filter(d => (d.aliases ?? []).length > 1).map(d => ({ canonical: d.subject, aliases: d.aliases })),
    findings: ranked,
    topFindings,
    timingTrends: Object.fromEntries(canonical.map(d => [d.subject, timingTrend(d.aggregate)])),
    policyDifferences: ranked.filter(f => f.type === FINDING_TYPES.POLICY_DISAGREEMENT),
    matchupDifferences: ranked.filter(f => f.type === FINDING_TYPES.MATCHUP_SENSITIVITY),
    controlledAdvice: ranked.filter(f => f.trustClass === FINDING_TRUST.CONTROLLED_ADVICE),
    unknowns,
    researchQuestions: researchQuestions.slice(0, 10),
    claimsCount: claims.length,
    thresholds: SYNTHESIS_THRESHOLDS
  };
}
