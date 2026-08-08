// Rank Anatomy Observatory — v0.16.0
//
// Extends the existing Rank workspace with decomposed anatomy views:
//   - Anatomy rail (Overall / Ordinary / Spades / Supers / Evidence)
//   - Ordinary vs Spades comparison table
//   - Super declaration funnel
//   - Super effect dossiers
//   - Contribution decomposition bars
//   - Frequency-potency quadrant table
//   - Origin filter
//
// This module renders into a container element and is consumed by renderRanks().

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (h) => h ? h.substring(0, 12) : '—';
const fmt = (v, d = 2) => v == null ? '—' : typeof v === 'number' ? v.toFixed(d) : String(v);
const pct = (v) => v == null ? '—' : `${(v * 100).toFixed(1)}%`;

/**
 * Render the full Rank Anatomy Observatory section.
 * @param {object} opts
 * @param {object} opts.variantAnalytics - from observatory artifact
 * @param {object} opts.rankAnatomyRegistry - from rank-anatomy-registry.json
 * @param {string} opts.selectedRank - currently selected rank ID
 * @param {string} opts.profileFilter - 'all' | 'core-advanced-authority' | 'core-unrestricted-authority'
 * @param {string} opts.originFilter - currently informational; per-origin metrics are unavailable
 * @param {string} opts.anatomyTab - 'overall' | 'ordinary' | 'spades' | 'supers' | 'evidence'
 * @returns {string} HTML string
 */
export function renderRankAnatomy({ variantAnalytics, rankAnatomyRegistry, selectedRank, profileFilter = 'all', originFilter = 'all', anatomyTab = 'overall' }) {
  if (!variantAnalytics || !variantAnalytics.rankComparisons) {
    return '<div class="empty-state"><strong>Rank Anatomy not available</strong><p>Variant analytics not loaded. Run an experiment or load the observatory artifact.</p></div>';
  }

  const registry = rankAnatomyRegistry;
  const rankEntry = registry?.ranks?.find(r => r.rankId === selectedRank);
  const effectiveAnalytics = analyticsForProfile(variantAnalytics, profileFilter);
  const cmp = effectiveAnalytics.rankComparisons?.[selectedRank];

  if (!rankEntry) {
    return `<div class="empty-state"><strong>Rank ${esc(selectedRank)} not in registry</strong></div>`;
  }

  const tabs = renderAnatomyRail(selectedRank, anatomyTab, rankEntry);
  let content = '';

  // Data integrity check — detect impossible states (selections without opportunities)
  const integrityBanner = renderIntegrityBanner(selectedRank, effectiveAnalytics);

  switch (anatomyTab) {
    case 'overall':
      content = renderOverallTab(cmp, rankEntry, effectiveAnalytics);
      break;
    case 'ordinary':
      content = renderOrdinaryTab(cmp, effectiveAnalytics);
      break;
    case 'spades':
      content = renderSpadesTab(cmp, rankEntry, effectiveAnalytics);
      break;
    case 'supers':
      content = renderSupersTab(cmp, rankEntry, effectiveAnalytics);
      break;
    case 'evidence':
      content = renderEvidenceTab(cmp, rankEntry, effectiveAnalytics);
      break;
    default:
      content = renderOverallTab(cmp, rankEntry, effectiveAnalytics);
  }

  const originFilterHtml = renderOriginFilter(originFilter);
  const profileFilterHtml = renderProfileFilter(profileFilter);

  return `<div class="rank-anatomy-observatory">
    <div class="rank-anatomy-header">
      <h2>Rank Anatomy Observatory</h2>
      <p>Decomposed performance for Rank ${esc(selectedRank)} — ordinary baseline, Spades variant, Super declarations, and individual effects</p>
      <div class="rank-anatomy-filters">${originFilterHtml}${profileFilterHtml}</div>
    </div>
    ${integrityBanner}
    ${tabs}
    <div class="rank-anatomy-content">${content}</div>
  </div>`;
}


function analyticsForProfile(variantAnalytics, profileFilter) {
  if (!profileFilter || profileFilter === 'all') return variantAnalytics;
  const metrics = variantAnalytics.perProfile?.[profileFilter];
  if (!metrics) return { ...variantAnalytics, variantMetrics: {}, confidence: {}, rankComparisons: {} };
  const confidence = {};
  for (const [key, m] of Object.entries(metrics)) {
    const n = m?.variantOpportunityCount ?? 0;
    confidence[key] = n >= 100 ? 'HIGH' : n >= 30 ? 'MEDIUM' : n >= 8 ? 'LOW' : 'INSUFFICIENT';
  }
  const rankComparisons = {};
  for (const [rank, comparison] of Object.entries(variantAnalytics.rankComparisons ?? {})) {
    const levels = {};
    for (const [key, level] of Object.entries(comparison.levels ?? {})) {
      levels[key] = level ? { ...level, metrics: metrics[key] ?? null, confidence: confidence[key] ?? 'INSUFFICIENT' } : null;
    }
    rankComparisons[rank] = { ...comparison, levels };
  }
  return { ...variantAnalytics, profileId: profileFilter, variantMetrics: metrics, confidence, rankComparisons };
}

/**
 * Data integrity banner — displays when impossible analytics states are detected.
 * Checks for selections without recorded opportunities, which indicates a
 * telemetry or analytics pipeline defect. Balance conclusions are disabled
 * for entities with integrity failures.
 */
function renderIntegrityBanner(rank, va) {
  const violations = [];
  const vm = va?.variantMetrics ?? {};
  const rankKey = rank;

  // Check all variant keys for this rank
  const keysToCheck = [rankKey, `${rankKey}:normal`, `${rankKey}:spade`, `${rankKey}:super:all`];
  // Also check individual super keys
  const entities = va?.entities ?? [];
  for (const ent of entities) {
    if (ent.rank === rank && ent.tier === 'super') keysToCheck.push(ent.variantKey);
  }

  for (const key of keysToCheck) {
    const m = vm[key];
    if (!m) continue;
    const opp = m.variantOpportunityCount ?? 0;
    const sel = m.variantSelectionCount ?? 0;
    if (sel > 0 && opp === 0) {
      violations.push({ variantKey: key, selections: sel });
    } else if (sel > opp) {
      violations.push({ variantKey: key, selections: sel, opportunities: opp, type: 'overflow' });
    }
  }

  if (violations.length === 0) return '';

  const violationList = violations.map(v =>
    v.type === 'overflow'
      ? `${esc(v.variantKey)}: ${v.selections} selections > ${v.opportunities} opportunities`
      : `${esc(v.variantKey)}: ${v.selections} selections with 0 opportunities`
  ).join('; ');

  return `<div class="anatomy-integrity-banner" role="alert" data-testid="anatomy-integrity-banner">
    <strong>DATA INTEGRITY FAILURE:</strong> Selections exist without recorded opportunities.
    Balance conclusions are disabled for this entity.
    <span class="anatomy-integrity-details">${violationList}</span>
  </div>`;
}

/**
 * Render the anatomy rail (tab navigation).
 */
function renderAnatomyRail(rank, activeTab, rankEntry) {
  const tabs = [
    { id: 'overall', label: 'Overall', desc: 'Aggregate rank performance' },
    { id: 'ordinary', label: 'Ordinary', desc: 'Normal ♣/♦/♥ baseline' },
    { id: 'spades', label: 'Spades', desc: rankEntry.spadesEligible ? rankEntry.spadesVariant.displayName : 'Not eligible' },
    { id: 'supers', label: 'Supers', desc: `${rankEntry.superEffectCount} effect${rankEntry.superEffectCount !== 1 ? 's' : ''}` },
    { id: 'evidence', label: 'Evidence', desc: 'Authority and provenance' },
  ];

  const buttons = tabs.map(t => {
    const isActive = t.id === activeTab;
    return `<button class="anatomy-tab ${isActive ? 'active' : ''}" data-anatomy-tab="${t.id}" role="tab" aria-selected="${isActive}" aria-controls="anatomy-content">
      <span class="anatomy-tab-label">${esc(t.label)}</span>
      <span class="anatomy-tab-desc">${esc(t.desc)}</span>
    </button>`;
  }).join('');

  return `<div class="anatomy-rail" role="tablist" aria-label="Rank anatomy layers">${buttons}</div>`;
}

/**
 * Overall tab — aggregate rank performance with contribution decomposition.
 */
function renderOverallTab(cmp, rankEntry, va) {
  const rankKey = rankEntry.rankId;
  const rankMetrics = va.variantMetrics?.[rankKey] ?? {};

  const confidence = va.confidence?.[rankKey] ?? 'INSUFFICIENT';

  const decomposition = renderContributionDecomposition(cmp, va);
  const frequencyPotency = renderFrequencyPotencyTable(cmp, va);

  return `<div class="anatomy-section">
    <h3>Aggregate Performance</h3>
    <p class="anatomy-note">Variant selections classify the primary variant entity. The Rank Power panel counts aggregate rank participations, including secondary ranks in fractional multi-rank plays, so the totals can legitimately differ.</p>
    <div class="rank-metrics-grid">${definitionList([
      ['Opportunities', rankMetrics.variantOpportunityCount],
      ['Selections', rankMetrics.variantSelectionCount],
      ['Selection Rate', pct(rankMetrics.variantPlayRate)],
      ['Victory Contribution', rankMetrics.variantVictoryContributionCount],
      ['Defeat Exposure', rankMetrics.variantDefeatExposureCount],
      ['Win Rate', pct(rankMetrics.variantWinRate)],
      ['Secured Points', fmt(rankMetrics.variantSecuredPointContribution, 1)],
      ['Board Presence', fmt(rankMetrics.variantBoardPresenceContribution, 1)],
      ['Confidence', confidence],
    ])}</div>
    ${decomposition}
    ${frequencyPotency}
  </div>`;
}

/**
 * Ordinary tab — normal suit baseline (♣/♦/♥ combined, excluding Spades/Super).
 */
function renderOrdinaryTab(cmp, va) {
  if (!cmp) return '<div class="empty-state"><strong>No variant data</strong></div>';
  const normalKey = Object.keys(cmp.levels ?? {}).find(k => k.endsWith(':normal'));
  if (!normalKey) return '<div class="empty-state"><strong>No ordinary baseline data</strong><p>This rank may not have suit variants.</p></div>';
  const lv = cmp.levels[normalKey];
  const m = lv?.metrics ?? {};

  const conf = lv?.confidence ?? 'INSUFFICIENT';

  return `<div class="anatomy-section">
    <h3>Ordinary Baseline (♣/♦/♥)</h3>
    <p class="anatomy-note">Normal-suit tier only (♣/♦/♥). Origin segmentation is not yet recorded, so generated/copied/mimicked/replayed uses may still be present.</p>
    <div class="rank-metrics-grid">${definitionList([
      ['Opportunities', m.variantOpportunityCount],
      ['Selections', m.variantSelectionCount],
      ['Selection Rate', pct(m.variantPlayRate)],
      ['Success Count', m.variantSuccessCount],
      ['Success Rate', pct(m.variantSuccessRate)],
      ['Win Rate', pct(m.variantWinRate)],
      ['Secured Points', fmt(m.variantSecuredPointContribution, 1)],
      ['Board Presence', fmt(m.variantBoardPresenceContribution, 1)],
      ['Tempo Impact', fmt(m.variantTempoImpact, 2)],
      ['Avg Value When Activated', fmt(m.variantAverageValueWhenActivated, 3)],
      ['Confidence', conf],
    ])}</div>
  </div>`;
}

/**
 * Spades tab — exact Spades variant comparison.
 */
function renderSpadesTab(cmp, rankEntry, va) {
  if (!rankEntry.spadesEligible) {
    return `<div class="anatomy-section">
      <h3>Spades Variant — Not Eligible</h3>
      <div class="notice info">
        <strong>Rank ${esc(rankEntry.rankId)} has no mechanically distinct Spades variant</strong>
        <p>Reason: ${esc(rankEntry.spadesVariant.ineligibilityReason ?? 'NO_DISTINCT_SPADES_EFFECT')}</p>
        ${rankEntry.spadesVariant.ineligibilityNote ? `<p>${esc(rankEntry.spadesVariant.ineligibilityNote)}</p>` : ''}
      </div>
    </div>`;
  }

  if (!cmp) return '<div class="empty-state"><strong>No variant data</strong></div>';
  const spadeKey = `${rankEntry.rankId}:spade`;
  const normalKey = `${rankEntry.rankId}:normal`;
  const spadeLv = cmp.levels?.[spadeKey];
  const normalLv = cmp.levels?.[normalKey];

  if (!spadeLv) return '<div class="empty-state"><strong>Spades variant data not available</strong><p>Insufficient evidence for this variant.</p></div>';

  const sm = spadeLv.metrics ?? {};
  const nm = normalLv?.metrics ?? {};
  const conf = spadeLv.confidence ?? 'INSUFFICIENT';

  const comparisonTable = renderOrdinaryVsSpadesTable(nm, sm, conf);
  const spadeInfo = `<div class="anatomy-section">
    <h3>${esc(rankEntry.spadesVariant.displayName)}</h3>
    <p class="anatomy-note">Card: ${esc(rankEntry.spadesVariant.cardId)} · Mode: ${esc(rankEntry.spadesVariant.mode)}</p>
    ${rankEntry.spadesVariant.note ? `<p class="anatomy-note">${esc(rankEntry.spadesVariant.note)}</p>` : ''}
  </div>`;

  return `${spadeInfo}${comparisonTable}`;
}

/**
 * Supers tab — Super declaration funnel and individual effect dossiers.
 * Shows registry info (effect description, mode, profiles) even when no campaign data exists.
 */
function renderSupersTab(cmp, rankEntry, va) {
  if (rankEntry.superEffectCount === 0) {
    return `<div class="anatomy-section">
      <h3>Supers — None</h3>
      <div class="notice info"><strong>Rank ${esc(rankEntry.rankId)} has no Super effects</strong></div>
    </div>`;
  }

  if (!cmp) return '<div class="empty-state"><strong>No variant data</strong></div>';

  const funnel = renderSuperFunnel(cmp, rankEntry);
  const dossiers = rankEntry.supers.map(s => renderSuperEffectDossier(s, cmp, va)).join('');

  // Super effect inventory — shows registry info even when no campaign data exists
  const inventory = renderSuperEffectInventory(rankEntry);

  return `${inventory}
  <div class="anatomy-section">
    <h3>Super Declaration Funnel</h3>
    ${funnel}
  </div>
  <div class="anatomy-section">
    <h3>Individual Super Effect Dossiers</h3>
    ${dossiers}
  </div>`;
}

/**
 * Render Super effect inventory from the registry — informative even without campaign data.
 */
function renderSuperEffectInventory(rankEntry) {
  const supers = rankEntry.supers ?? [];
  if (supers.length === 0) return '';

  const rows = supers.map(s => {
    const profiles = (s.profiles ?? []).join(', ');
    const actionModes = (s.actionModes ?? []).join(', ');
    const altKinds = (s.altKinds ?? []).join(', ');
    return `<tr>
      <td>${esc(s.displayName)}</td>
      <td>${esc(s.effectId)}</td>
      <td>${esc(s.mode)}</td>
      <td>${esc(s.kind)}</td>
      <td>${esc(profiles)}</td>
      <td>${esc(actionModes)}</td>
      <td>${altKinds ? esc(altKinds) : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="anatomy-section">
    <h3>Super Effect Inventory (Registry)</h3>
    <p class="anatomy-note">Canonical Super effect definitions from the rank anatomy registry. These are authoritative regardless of campaign data availability.</p>
    <table class="frequency-potency-table super-inventory-table">
      <thead><tr><th>Effect</th><th>Effect ID</th><th>Mode</th><th>Kind</th><th>Profiles</th><th>Action Modes</th><th>Alt Kinds</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * Evidence tab — per-variant evidence summary, sensitivity analysis, authority, provenance, and source links.
 */
function renderEvidenceTab(cmp, rankEntry, va) {
  const authority = rankEntry.authority ?? {};
  const registryInfo = va.variantRegistry ?? {};
  const sensitivity = va.sensitivity ?? {};

  const authoritySection = `<div class="anatomy-section">
    <h3>Rank Authority</h3>
    <div class="rank-metrics-grid">${definitionList([
      ['Rank Authority Hash', short(authority.authorityHash)],
      ['Engine Version', authority.authorityVersion],
      ['Rules Version', authority.rulesVersion],
      ['Point Row Value', authority.pointRowValue],
      ['Scuttle Order', authority.scuttleOrder],
      ['PR Scuttle Immune', authority.prScuttleImmune ? 'Yes' : 'No'],
      ['PR Effect Target Immune', authority.prEffectTargetImmune ? 'Yes' : 'No'],
      ['Supported Modes', (authority.supportedModes ?? []).join(', ')],
    ])}</div>
  </div>`;

  // Per-variant evidence table — shows sample sizes, confidence, and coverage for ALL variants of this rank
  const evidenceTable = renderEvidenceTable(cmp, rankEntry, sensitivity);

  // Sensitivity analysis — policy/seat/firstPlayer sensitivity per variant
  const sensitivitySection = renderSensitivitySection(rankEntry, sensitivity);

  // Provenance — experiment hash, profile, participant IDs, aggregate hash
  const provenanceSection = `<div class="anatomy-section">
    <h3>Provenance</h3>
    <div class="rank-metrics-grid">${definitionList([
      ['Variant Analytics Schema', va.schemaVersion],
      ['Telemetry Schema', va.telemetrySchemaVersion],
      ['Variant Registry Schema', registryInfo.schemaVersion],
      ['Variant Registry Hash', short(registryInfo.authorityHash)],
      ['Entity Count', registryInfo.entityCount],
      ['Metric Registry Hash', short(va.metricRegistryHash)],
      ['Aggregate Hash', short(va.aggregateHash)],
      ['Profile', va.profileId ?? 'all'],
      ['Participants', (va.participantIds ?? []).join(', ')],
    ])}</div>
  </div>`;

  // Source links — navigate to Traces and Replays workspaces
  const sourceLinks = `<div class="anatomy-section">
    <h3>Source Evidence</h3>
    <p class="anatomy-note">These metrics are derived from campaign replays and decision traces. Navigate to the source workspaces to inspect individual records.</p>
    <div class="evidence-source-links">
      <a href="#/traces" class="evidence-source-link" data-anatomy-source="traces">Decision Traces →</a>
      <a href="#/replays" class="evidence-source-link" data-anatomy-source="replays">Campaign Replays →</a>
      <a href="#/diagnostics" class="evidence-source-link" data-anatomy-source="diagnostics">Policy Diagnostics →</a>
    </div>
  </div>`;

  const interpretationBoundary = `<div class="footer-note">
    <p><strong>Interpretation boundary:</strong> All metrics are observational associations conditioned on policy, seat, profile, and telemetry. They are not causal claims or balance verdicts.</p>
  </div>`;

  return `${authoritySection}${evidenceTable}${sensitivitySection}${provenanceSection}${sourceLinks}${interpretationBoundary}`;
}

/**
 * Render per-variant evidence table — sample sizes, confidence, and coverage for all variants of this rank.
 */
function renderEvidenceTable(cmp, rankEntry, sensitivity) {
  if (!cmp) return '<div class="anatomy-section"><h3>Per-Variant Evidence</h3><div class="empty-state"><strong>No variant data</strong></div></div>';
  const order = cmp.entityOrder ?? [];
  const levels = cmp.levels ?? {};

  const rows = order.map(key => {
    const lv = levels[key];
    if (!lv) return '';
    const m = lv.metrics ?? {};
    const conf = lv.confidence ?? 'INSUFFICIENT';
    const confClass = `confidence-${conf.toLowerCase()}`;
    const sens = sensitivity[key] ?? {};
    const tier = lv.tier ?? '';
    const marker = tierMarker(tier);
    const sampleSize = lv.sampleSize ?? m.variantOpportunityCount ?? 0;

    return `<tr class="${confClass}">
      <td>${marker}</td>
      <td>${esc(lv.displayName ?? key)}</td>
      <td>${m.variantOpportunityCount ?? 0}</td>
      <td>${m.variantSelectionCount ?? 0}</td>
      <td>${sampleSize}</td>
      <td>${conf}</td>
      <td>${fmt(sens.policySensitivity, 4)}</td>
      <td>${fmt(sens.seatSensitivity, 4)}</td>
      <td>${fmt(sens.firstPlayerSensitivity, 4)}</td>
    </tr>`;
  }).join('');

  return `<div class="anatomy-section">
    <h3>Per-Variant Evidence</h3>
    <p class="anatomy-note">Sample sizes and confidence for each variant entity of Rank ${esc(rankEntry.rankId)}. Sensitivity measures how much the win-rate estimate changes when conditioning on policy, seat, or first-player assignment.</p>
    <table class="frequency-potency-table evidence-table">
      <thead><tr><th>Type</th><th>Entity</th><th>Opps</th><th>Selects</th><th>Sample</th><th>Confidence</th><th>Policy Sens.</th><th>Seat Sens.</th><th>1st-Player Sens.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * Render sensitivity analysis section.
 */
function renderSensitivitySection(rankEntry, sensitivity) {
  const rankKey = rankEntry.rankId;
  const keys = [rankKey, `${rankKey}:normal`, `${rankKey}:spade`, `${rankKey}:super:all`];
  for (const ent of (rankEntry.supers ?? [])) {
    keys.push(`${rankKey}:super:${ent.effectId}`);
  }

  const hasAny = keys.some(k => sensitivity[k] && (sensitivity[k].policySensitivity > 0 || sensitivity[k].seatSensitivity > 0));
  if (!hasAny) {
    return `<div class="anatomy-section">
      <h3>Sensitivity Analysis</h3>
      <div class="notice info"><strong>No sensitivity data</strong><p>All sensitivity values are zero for this rank. This indicates either insufficient data or that the metrics are robust across policy/seat/first-player conditions.</p></div>
    </div>`;
  }

  const rows = keys.map(k => {
    const s = sensitivity[k];
    if (!s) return '';
    const maxSens = Math.max(s.policySensitivity ?? 0, s.seatSensitivity ?? 0, s.firstPlayerSensitivity ?? 0);
    const level = maxSens > 0.1 ? 'HIGH' : maxSens > 0.05 ? 'MEDIUM' : maxSens > 0.01 ? 'LOW' : 'NEGLIGIBLE';
    return `<tr>
      <td>${esc(k)}</td>
      <td>${fmt(s.policySensitivity, 4)}</td>
      <td>${fmt(s.seatSensitivity, 4)}</td>
      <td>${fmt(s.firstPlayerSensitivity, 4)}</td>
      <td class="sensitivity-${level.toLowerCase()}">${level}</td>
    </tr>`;
  }).join('');

  return `<div class="anatomy-section">
    <h3>Sensitivity Analysis</h3>
    <p class="anatomy-note">Sensitivity measures the maximum win-rate swing when conditioning on policy, seat, or first-player. High sensitivity means the metric is confounded by these factors; low sensitivity means it is robust.</p>
    <table class="frequency-potency-table sensitivity-table">
      <thead><tr><th>Variant</th><th>Policy Sens.</th><th>Seat Sens.</th><th>1st-Player Sens.</th><th>Max Level</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * Render contribution decomposition bars.
 */
function renderContributionDecomposition(cmp, va) {
  if (!cmp) return '';
  const levels = cmp.levels ?? {};
  const rankKey = cmp.rank;
  const rankMetrics = va.variantMetrics?.[rankKey] ?? {};
  const totalScore = rankMetrics.variantSecuredPointContribution ?? 0;

  const components = [
    { key: `${rankKey}:normal`, label: 'Ordinary ♣/♦/♥', color: '#4fd387' },
    { key: `${rankKey}:spade`, label: 'Spades ♠', color: '#b08cff' },
    { key: `${rankKey}:super:all`, label: 'All Supers', color: '#f07449' },
  ];

  const bars = components.map(c => {
    const lv = levels[c.key];
    const score = lv?.metrics?.variantSecuredPointContribution ?? 0;
    const share = totalScore > 0 ? (score / totalScore) : 0;
    const widthPct = (share * 100).toFixed(1);
    return `<div class="contribution-bar">
      <span class="contribution-label">${esc(c.label)}</span>
      <div class="contribution-track"><div class="contribution-fill" style="width:${widthPct}%;background:${c.color}"></div></div>
      <span class="contribution-value">${fmt(score, 1)} (${widthPct}%)</span>
    </div>`;
  }).join('');

  return `<div class="anatomy-subsection">
    <h4>Contribution Decomposition</h4>
    <p class="anatomy-note">Share of secured-point contribution by component. Non-additive metrics are labeled comparative, not summed.</p>
    <div class="contribution-bars">${bars}</div>
  </div>`;
}

/**
 * Render frequency-potency table.
 */
function renderFrequencyPotencyTable(cmp, va) {
  if (!cmp) return '';
  const order = cmp.entityOrder ?? [];
  const levels = cmp.levels ?? {};

  const rows = order.map(key => {
    const lv = levels[key];
    if (!lv) return '';
    const m = lv.metrics ?? {};
    const freq = m.variantPlayRate ?? 0;
    const potency = m.variantAverageValueWhenActivated ?? 0;
    const tier = lv.tier ?? '';
    const tierLabel = tierLabelFor(tier);
    const conf = lv.confidence ?? 'INSUFFICIENT';
    const confClass = `confidence-${conf.toLowerCase()}`;
    const marker = tierMarker(tier);

    return `<tr class="${confClass}">
      <td>${marker}</td>
      <td>${esc(lv.displayName ?? key)}</td>
      <td>${pct(freq)}</td>
      <td>${fmt(potency, 3)}</td>
      <td>${m.variantOpportunityCount ?? 0}</td>
      <td>${m.variantSelectionCount ?? 0}</td>
      <td>${conf}</td>
    </tr>`;
  }).join('');

  return `<div class="anatomy-subsection">
    <h4>Frequency–Potency</h4>
    <p class="anatomy-note">Frequency = selection rate when available. Potency = average value when activated. These are separate dimensions; a rare powerful effect must not automatically outrank a frequent dependable one.</p>
    <table class="frequency-potency-table">
      <thead><tr><th>Type</th><th>Entity</th><th>Frequency</th><th>Potency</th><th>Opps</th><th>Selects</th><th>Confidence</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * Render ordinary vs Spades comparison table.
 */
function renderOrdinaryVsSpadesTable(nm, sm, conf) {
  const rows = [
    ['Opportunity Count', nm.variantOpportunityCount, sm.variantOpportunityCount],
    ['Selection Count', nm.variantSelectionCount, sm.variantSelectionCount],
    ['Selection Rate', pct(nm.variantPlayRate), pct(sm.variantPlayRate)],
    ['Success Rate', pct(nm.variantSuccessRate), pct(sm.variantSuccessRate)],
    ['Win Rate', pct(nm.variantWinRate), pct(sm.variantWinRate)],
    ['Secured Points', fmt(nm.variantSecuredPointContribution, 1), fmt(sm.variantSecuredPointContribution, 1)],
    ['Board Presence', fmt(nm.variantBoardPresenceContribution, 1), fmt(sm.variantBoardPresenceContribution, 1)],
    ['Tempo Impact', fmt(nm.variantTempoImpact, 2), fmt(sm.variantTempoImpact, 2)],
    ['Goal Contribution', fmt(nm.variantGoalContribution, 2), fmt(sm.variantGoalContribution, 2)],
    ['Avg Value When Activated', fmt(nm.variantAverageValueWhenActivated, 3), fmt(sm.variantAverageValueWhenActivated, 3)],
    ['Confidence', nm.confidence ?? 'INSUFFICIENT', sm.confidence ?? conf],
  ];

  const tableRows = rows.map(([label, normal, spade]) => {
    const diff = normal !== '—' && spade !== '—' && typeof normal === 'number' && typeof spade === 'number'
      ? (spade - normal).toFixed(2)
      : '—';
    return `<tr><td>${esc(label)}</td><td>${esc(normal)}</td><td>${esc(spade)}</td><td>${diff}</td></tr>`;
  }).join('');

  return `<div class="anatomy-subsection">
    <h4>Ordinary vs Spades Comparison</h4>
    <table class="comparison-table">
      <thead><tr><th>Metric</th><th>Ordinary ♣/♦/♥</th><th>Spades ♠</th><th>Δ</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

/**
 * Render Super declaration funnel.
 * Uses variantActivationCount for "Accepted" when available, falls back to variantSuccessCount.
 * "Measurable Impact" uses variantSecuredPointContribution > 0 or variantBoardPresenceContribution > 0
 * as indicators of measurable state impact, rather than reusing variantSuccessCount.
 */
function renderSuperFunnel(cmp, rankEntry) {
  const superAllKey = `${rankEntry.rankId}:super:all`;
  const lv = cmp.levels?.[superAllKey];
  if (!lv) return '<div class="notice"><strong>No Super data available</strong></div>';
  const m = lv.metrics ?? {};

  const opps = m.variantOpportunityCount ?? 0;
  const selects = m.variantSelectionCount ?? 0;
  const accepted = m.variantActivationCount ?? m.variantSuccessCount ?? 0;
  const resolved = m.variantSuccessCount ?? 0;
  const hasImpact = (m.variantSecuredPointContribution ?? 0) > 0 || (m.variantBoardPresenceContribution ?? 0) > 0;
  const impactCount = hasImpact ? Math.max(accepted, 1) : 0;

  const stages = [
    { label: 'Legal Opportunity', value: opps, desc: 'Decision frames with at least one legal Super declaration' },
    { label: 'Selected', value: selects, desc: 'Super declarations chosen by the player/policy' },
    { label: 'Accepted', value: accepted, desc: 'Declarations that were accepted and began resolving' },
    { label: 'Resolved', value: resolved, desc: 'Declarations that fully resolved' },
    { label: 'Measurable Impact', value: impactCount, desc: 'Declarations producing measurable score or board state impact' },
  ];

  // If all stages are zero, show an honest insufficient-evidence notice
  if (opps === 0 && selects === 0) {
    return `<div class="super-funnel">
      <div class="notice info"><strong>Insufficient Super evidence</strong>
        <p>No Super declarations were recorded for Rank ${esc(rankEntry.rankId)} in this campaign. This may be because the campaign profile does not exercise Super effects, or because no legal Super opportunities arose.</p>
        <p>See the Super Effect Inventory above for canonical effect definitions.</p>
      </div>
    </div>`;
  }

  const funnel = stages.map((s, i) => {
    const prev = i > 0 ? stages[i - 1].value : null;
    const rate = prev != null && prev > 0 && s.value != null ? (s.value / prev) : null;
    const widthPct = stages[0].value > 0 && s.value != null ? Math.max((s.value / stages[0].value) * 100, 5) : 5;
    return `<div class="funnel-stage" style="margin-left:${i * 20}px;width:${widthPct}%">
      <span class="funnel-label">${esc(s.label)}</span>
      <span class="funnel-value">${s.value ?? 0}</span>
      ${rate != null ? `<span class="funnel-rate">${(rate * 100).toFixed(1)}%</span>` : ''}
      <small class="funnel-desc">${esc(s.desc)}</small>
    </div>`;
  }).join('');

  return `<div class="super-funnel">${funnel}</div>
    <div class="footer-note"><p>Each stage shows the denominator from the previous stage. A Super with multiple effects remains one declaration; effect components are tracked separately below.</p></div>`;
}

/**
 * Render individual Super effect dossier.
 * Shows registry info (authority refs, action modes, alt kinds) alongside campaign metrics.
 * When no campaign data exists, the dossier still displays the full registry definition.
 */
function renderSuperEffectDossier(superRec, cmp, va) {
  const effectKey = `${superRec.rank}:super:${superRec.effectId}`;
  const lv = cmp.levels?.[effectKey];
  const conf = lv?.confidence ?? 'INSUFFICIENT';
  const confClass = `confidence-${conf.toLowerCase()}`;
  const m = lv?.metrics ?? {};
  const hasData = (m.variantOpportunityCount ?? 0) > 0 || (m.variantSelectionCount ?? 0) > 0;

  const registryMeta = `<div class="dossier-meta">
    <span class="dossier-id">Effect ID: ${esc(superRec.effectId)}</span>
    <span class="dossier-mode">Mode: ${esc(superRec.mode)}</span>
    <span class="dossier-kind">Kind: ${esc(superRec.kind)}</span>
    <span class="dossier-profiles">Profiles: ${esc((superRec.profiles ?? []).join(', '))}</span>
  </div>`;

  const actionModes = (superRec.actionModes ?? []).length > 0
    ? `<div class="dossier-action-modes"><strong>Action modes:</strong> ${esc((superRec.actionModes ?? []).join(', '))}</div>`
    : '';

  const altKinds = (superRec.altKinds ?? []).length > 0
    ? `<div class="dossier-alt-kinds"><strong>Alternative kinds:</strong> ${esc((superRec.altKinds ?? []).join(', '))}</div>`
    : '';

  const authorityRefs = (superRec.authorityRefs ?? []).length > 0
    ? `<div class="dossier-authority-refs"><strong>Authority refs:</strong> ${esc((superRec.authorityRefs ?? []).join(', '))}</div>`
    : '';

  const metricsSection = hasData
    ? `<div class="rank-metrics-grid">${definitionList([
        ['Opportunities', m.variantOpportunityCount],
        ['Selections', m.variantSelectionCount],
        ['Selection Rate', pct(m.variantPlayRate)],
        ['Success Count', m.variantSuccessCount],
        ['Success Rate', pct(m.variantSuccessRate)],
        ['Win Rate', pct(m.variantWinRate)],
        ['Secured Points', fmt(m.variantSecuredPointContribution, 1)],
        ['Board Presence', fmt(m.variantBoardPresenceContribution, 1)],
        ['Tempo Impact', fmt(m.variantTempoImpact, 2)],
        ['Avg Value When Activated', fmt(m.variantAverageValueWhenActivated, 3)],
        ['Confidence', conf],
      ])}</div>`
    : `<div class="notice info"><strong>No campaign data for this effect</strong>
        <p>This Super effect was not exercised in the current campaign. The registry definition above is authoritative.</p>
      </div>`;

  return `<div class="super-effect-dossier ${confClass}">
    <h4>${esc(superRec.displayName)}</h4>
    ${registryMeta}
    ${actionModes}${altKinds}${authorityRefs}
    ${metricsSection}
  </div>`;
}

/**
 * Render origin filter dropdown.
 */
function renderOriginFilter() {
  // The current artifact has no per-origin metric table. Presenting an active
  // filter would falsely imply that the numbers change by provenance.
  return `<label class="anatomy-filter"><span>Origin</span><select id="origin-filter" aria-label="Origin segmentation unavailable" disabled><option selected>All origins (segmentation unavailable)</option></select></label>`;
}

/**
 * Render profile filter dropdown.
 */
function renderProfileFilter(current) {
  const options = [
    ['all', 'All profiles'],
    ['core-advanced-authority', 'Advanced Core'],
    ['core-unrestricted-authority', 'Unrestricted Core'],
  ];
  const opts = options.map(([v, l]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<label class="anatomy-filter"><span>Profile</span><select id="variant-profile-filter" aria-label="Filter by authority profile">${opts}</select></label>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function definitionList(items) {
  return `<dl class="definition-list">${items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function tierLabelFor(tier) {
  const map = { rank: 'Rank overall', normal: 'Normal', spade: 'Spades', super: 'Super effect', 'super-aggregate': 'All Supers' };
  return map[tier] ?? tier;
}

function tierMarker(tier) {
  const map = {
    rank: '◆',
    normal: '♣',
    spade: '♠',
    super: '⭐',
    'super-aggregate': '⭐×',
  };
  return map[tier] ?? '?';
}
