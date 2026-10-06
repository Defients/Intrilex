// Pure (no imports) Observatory integrity contracts shared by canonical
// analytics and the browser Observatory (copied verbatim to
// apps/lab-web/dist/shared-analytics/ by scripts/build.mjs).

// ── Tag relations ──────────────────────────────────────────────
// Runtime mechanic tagging emits BOTH action.family and action.mode from a
// single action, so a mode tag is a same-event child of its family tag, and a
// family with a single observed mode produces two identical rows. These
// relations are derived from the `family:mode` decision keys the runtime
// records, plus exact per-unit usage identity.

/**
 * @param {Array<Record<string, any>>} summaries
 * @param {Array<{ mechanicCounts?: Record<string, number> }>} units
 * @param {string[]} tags
 * @param {{ isRegistered?: (tag: string) => boolean, minAliasSupport?: number }} [options]
 */
export function deriveTagRelations(summaries, units, tags, { isRegistered = () => false, minAliasSupport = 10 } = {}) {
  const tagSet = new Set(tags);
  /** @type {Record<string, string[]>} */
  const childrenOf = {};
  /** @type {Record<string, string[]>} */
  const parentsOf = {};
  for (const s of summaries) {
    for (const key of Object.keys(s.decisionModeCounts ?? {})) {
      const i = key.indexOf(':');
      if (i <= 0) continue;
      const family = key.slice(0, i), mode = key.slice(i + 1);
      if (!mode || family === mode || !tagSet.has(family) || !tagSet.has(mode)) continue;
      if (!(childrenOf[family] ??= []).includes(mode)) childrenOf[family].push(mode);
      if (!(parentsOf[mode] ??= []).includes(family)) parentsOf[mode].push(family);
    }
  }
  for (const list of [...Object.values(childrenOf), ...Object.values(parentsOf)]) list.sort();
  // Identical usage on a handful of records is coincidence, not aliasing:
  // unrelated tags only alias with ≥ minAliasSupport using records, while a
  // structural family/mode pair aliases at any support.
  /** @type {Map<string, string[]>} */
  const bySignature = new Map();
  for (const tag of tags) {
    let used = 0;
    const sig = units.map((u) => { const n = Number(u.mechanicCounts?.[tag] ?? 0); if (n) used += 1; return n; }).join(',');
    if (!used) continue;
    if (used < minAliasSupport && !childrenOf[tag] && !parentsOf[tag]) continue;
    if (!bySignature.has(sig)) bySignature.set(sig, []);
    /** @type {string[]} */ (bySignature.get(sig)).push(tag);
  }
  /** @type {Record<string, string>} */
  const aliasOf = {};
  /** @type {Array<{ representative: string, members: string[] }>} */
  const aliasGroups = [];
  for (const all of bySignature.values()) {
    // A low-support member only aliases with its own structural relative.
    const members = all.filter((t) => all.some((o) => o !== t && pairDependency({ childrenOf, aliasOf: {} }, t, o) === 'SAME_EVENT_DEPENDENT') || units.filter((u) => Number(u.mechanicCounts?.[t] ?? 0)).length >= minAliasSupport);
    if (members.length < 2) continue;
    const sorted = [...members].sort();
    const representative = sorted.find((t) => (childrenOf[t] ?? []).some((c) => members.includes(c)))
      ?? sorted.find((t) => isRegistered(t)) ?? sorted[0];
    for (const t of sorted) if (t !== representative) aliasOf[t] = representative;
    aliasGroups.push({ representative, members: sorted });
  }
  aliasGroups.sort((a, b) => a.representative.localeCompare(b.representative));
  return { childrenOf, parentsOf, aliasOf, aliasGroups };
}

/**
 * Why a pair must not be modeled as an independent A×B synergy, or null.
 * @param {ReturnType<typeof deriveTagRelations>} relations @param {string} a @param {string} b
 */
export function pairDependency(relations, a, b) {
  if ((relations.childrenOf[a] ?? []).includes(b) || (relations.childrenOf[b] ?? []).includes(a)) return 'SAME_EVENT_DEPENDENT';
  if ((relations.aliasOf[a] ?? a) === (relations.aliasOf[b] ?? b)) return 'IDENTICAL_USAGE';
  return null;
}

// Dimensions whose rows are inferential hypotheses (enter BH). Action-family,
// action-mode and diagnostic rows are descriptive only.
export const INFERENTIAL_DIMENSIONS = Object.freeze(['canonical-mechanic', 'rank-effect']);

/**
 * @param {{ dimension?: string, rawWinAssociationStatus?: { status?: string }, pValue?: number | null }} row
 * @param {string | null} aliasOf
 * @returns {{ eligible: boolean, reasonCode: string | null, detail: string | null }}
 */
export function mechanicInferentialEligibility(row, aliasOf) {
  if (aliasOf) return { eligible: false, reasonCode: 'ALIAS_OF', detail: `identical per-participant usage to '${aliasOf}' — counted once in the hypothesis family` };
  if (!INFERENTIAL_DIMENSIONS.includes(String(row.dimension))) return { eligible: false, reasonCode: 'DESCRIPTIVE_ONLY_DIMENSION', detail: `'${row.dimension}' tags are descriptive, not inferential hypotheses` };
  if (row.rawWinAssociationStatus?.status !== 'available') return { eligible: false, reasonCode: 'INSUFFICIENT_DECISIVE', detail: 'fewer than 10 decisive records in a cohort' };
  if (!Number.isFinite(row.pValue)) return { eligible: false, reasonCode: 'MISSING_PVALUE', detail: 'no finite p-value' };
  return { eligible: true, reasonCode: null, detail: null };
}

// ── Synergy cell semantics ─────────────────────────────────────
// A blank matrix cell is never NEUTRAL. Every candidate pair maps to exactly
// one of these states.
export const SYNERGY_CELL_STATUS = Object.freeze({
  MODELED_POSITIVE: 'MODELED_POSITIVE',
  MODELED_NEGATIVE: 'MODELED_NEGATIVE',
  MODELED_INCONCLUSIVE: 'MODELED_INCONCLUSIVE',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NOT_IDENTIFIABLE: 'NOT_IDENTIFIABLE',
  FAILED: 'FAILED',
  NOT_EVALUATED: 'NOT_EVALUATED',
});
const REASON_TO_CELL = Object.freeze({
  INSUFFICIENT_BOTH: 'INSUFFICIENT_DATA', INSUFFICIENT_SINGLE: 'INSUFFICIENT_DATA', INSUFFICIENT_NEITHER: 'INSUFFICIENT_DATA', INSUFFICIENT_N: 'INSUFFICIENT_DATA',
  PARENT_CHILD_OR_ALIAS: 'NOT_IDENTIFIABLE', SAME_EVENT_DEPENDENT: 'NOT_IDENTIFIABLE', IDENTICAL_USAGE: 'NOT_IDENTIFIABLE', NO_WITHIN_STRATUM_VARIATION: 'NOT_IDENTIFIABLE',
  SEPARATION: 'FAILED', SINGULAR_MODEL: 'FAILED',
});
/** @param {{ modelStatus?: string, status?: string, modelDirection?: string, reasonCode?: string }} row */
export function synergyCellStatus(row) {
  if (row?.modelStatus === 'modeled') {
    if (row.status === 'positive') return 'MODELED_POSITIVE';
    if (row.status === 'negative') return 'MODELED_NEGATIVE';
    return 'MODELED_INCONCLUSIVE';
  }
  return /** @type {Record<string, string>} */ (REASON_TO_CELL)[String(row?.reasonCode)] ?? 'FAILED';
}

// ── Rank balance qualification ─────────────────────────────────

/** @param {string} rankKey @param {Record<string, any>} variantMetrics */
function variantKeysForRank(rankKey, variantMetrics) {
  if (rankKey.startsWith('10:')) return [rankKey];
  return Object.keys(variantMetrics).filter((k) => k === rankKey || k.startsWith(`${rankKey}:`));
}

/**
 * Integrity of one rank-power entry plus every variant beneath it.
 * selections > 0 with 0 recorded opportunities (or selections > opportunities)
 * is an opportunity-accounting failure, never a valid rate.
 * @param {string} rankKey @param {Record<string, any>} entry @param {Record<string, any>} variantMetrics
 */
export function rankIntegrity(rankKey, entry, variantMetrics = {}) {
  /** @type {Array<{ code: string, key: string, detail: string }>} */
  const violations = [];
  const check = (/** @type {string} */ key, /** @type {number} */ sel, /** @type {number} */ opp) => {
    if (sel > 0 && opp === 0) violations.push({ code: 'SELECTIONS_WITHOUT_OPPORTUNITIES', key, detail: `${key}: ${sel} selections with 0 recorded opportunities` });
    else if (sel > opp) violations.push({ code: 'SELECTIONS_EXCEED_OPPORTUNITIES', key, detail: `${key}: ${sel} selections > ${opp} opportunities` });
  };
  check(rankKey, Number(entry?.metrics?.selectionCount ?? 0), Number(entry?.metrics?.opportunityCount ?? 0));
  for (const key of variantKeysForRank(rankKey, variantMetrics)) {
    const m = variantMetrics[key];
    if (m) check(key, Number(m.variantSelectionCount ?? 0), Number(m.variantOpportunityCount ?? 0));
  }
  const unique = [...new Map(violations.map((v) => [`${v.code}|${v.key}`, v])).values()];
  return { status: unique.length ? 'FAIL' : 'PASS', violations: unique };
}

const MANDATORY_AXES = ['selectionPower', 'victoryPower', 'scorePower', 'boardPower'];

/**
 * Annotates a rank-power model with integrity + balance qualification and
 * removes disqualified ranks from the balance watchlist. Descriptive RPI stays
 * visible; only qualified entries may support balance conclusions.
 * @param {Record<string, any> | null | undefined} rankPower
 * @param {Record<string, any> | null | undefined} variantAnalytics
 */
export function applyRankBalanceQualification(rankPower, variantAnalytics) {
  if (!rankPower?.ranks) return rankPower;
  const variantMetrics = variantAnalytics?.variantMetrics ?? {};
  /** @type {Record<string, any>} */
  const ranks = {};
  for (const [key, entry] of Object.entries(rankPower.ranks)) {
    const integrity = rankIntegrity(key, entry, variantMetrics);
    /** @type {Array<{ code: string, detail: string }>} */
    const reasons = integrity.violations.map((v) => ({ code: `INTEGRITY_${v.code}`, detail: v.detail }));
    if (!Number.isFinite(entry.rpi)) reasons.push({ code: 'RPI_UNAVAILABLE', detail: 'fewer than 3 observed power axes' });
    if (entry.confidence !== 'HIGH') reasons.push({ code: 'FREQUENCY_CONFIDENCE_BELOW_HIGH', detail: `opportunity-frequency confidence is ${entry.confidence ?? 'INSUFFICIENT'}` });
    const unobserved = MANDATORY_AXES.filter((a) => entry.axisStatus?.[a] !== 'observed');
    if (unobserved.length) reasons.push({ code: 'MANDATORY_AXIS_UNOBSERVED', detail: `not observed: ${unobserved.join(', ')}` });
    ranks[key] = { ...entry, integrity, balanceQualified: reasons.length === 0, balanceQualification: { qualified: reasons.length === 0, reasons } };
  }
  const qualified = (/** @type {string} */ r) => ranks[r]?.balanceQualified === true;
  const watch = rankPower.watchlist ?? {};
  /** @type {Record<string, any>} */
  const watchlist = { ...watch, integritySuppressed: [] };
  for (const group of ['overpowered', 'underpowered', 'dominant', 'negligible']) {
    const items = /** @type {Array<{ rank: string }>} */ (watch[group] ?? []);
    watchlist[group] = items.filter((item) => qualified(item.rank));
    for (const item of items) if (!qualified(item.rank)) watchlist.integritySuppressed.push({ group, rank: item.rank, reasons: ranks[item.rank]?.balanceQualification?.reasons ?? [] });
  }
  const ladder = (rankPower.ladder ?? []).map((/** @type {Record<string, any>} */ e) => ({ ...e, balanceQualified: qualified(e.rank), integrityStatus: ranks[e.rank]?.integrity?.status ?? 'UNKNOWN' }));
  const integrityFailures = Object.keys(ranks).filter((r) => ranks[r].integrity.status === 'FAIL').sort();
  return {
    ...rankPower, ranks, ladder, watchlist,
    balanceQualification: {
      qualifiedCount: Object.keys(ranks).filter(qualified).length,
      entryCount: Object.keys(ranks).length,
      integrityFailures,
      descriptiveLeader: ladder.find((/** @type {Record<string, any>} */ e) => Number.isFinite(e.rpi))?.rank ?? null,
      qualifiedLeader: ladder.find((/** @type {Record<string, any>} */ e) => e.balanceQualified)?.rank ?? null,
      contract: 'Descriptive RPI ordering is always shown; balance conclusions require integrity PASS (no selections without opportunities, child variants included), HIGH opportunity-frequency confidence, an observed RPI and all mandatory axes observed.',
    },
  };
}
