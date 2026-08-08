// ═══════════════════════════════════════════════════════════════
// workspaces/observatory.js — Consolidated workspace renderers:
//   Compare, Mechanics, Synergies, History, Replays, Traces, CardFaces
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, fmt, pct, short, definitionList } from '../state.js';
import { renderCardFace} from '../card-face-renderer.js';
import { listAuthoritativeCards} from '../card-face-data.js';

const CARD_FAMILIES = [['ace', 'Ace'], ['two', 'Two'], ['three', 'Three'], ['four', 'Four'], ['five', 'Five'], ['six', 'Six'], ['seven', 'Seven'], ['eight', 'Eight'], ['nine', 'Nine'], ['ten', 'Ten'], ['jack', 'Jack'], ['queen', 'Queen'], ['king', 'King'], ['joker', 'Jokers']];

// ── /compare ──────────────────────────────────────────────────────
export function renderCompare() {
  const o = state.observatory;
  const policies = o.policies ?? [];
  const selectedPolicy = state.selectedPolicy ?? policies[0]?.policyId;
  const rightPolicy = state.comparePolicyRight ?? policies.find(p => p.policyId !== selectedPolicy)?.policyId ?? selectedPolicy;
  const policyMap = Object.fromEntries(policies.map(p => [p.policyId, p]));
  const left = policyMap[selectedPolicy], right = policyMap[rightPolicy];
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Policy Comparison</h2><p>Side-by-side policy metrics with uncertainty quantification</p></div><div class="toolbar"><select id="compare-left">${policies.map(p => `<option value="${esc(p.policyId)}" ${p.policyId === selectedPolicy ? 'selected' : ''}>${esc(p.policyId)}</option>`).join('')}</select><span>vs</span><select id="compare-right">${policies.map(p => `<option value="${esc(p.policyId)}" ${p.policyId === rightPolicy ? 'selected' : ''}>${esc(p.policyId)}</option>`).join('')}</select></div></div><div class="panel-body"><div class="grid two">${[left, right].map(p => p ? `<div>${definitionList([['Policy', p.policyId], ['Matches', p.matchCount], ['Win rate', pct(p.winRate)], ['Win rate 95% CI', p.winWilson95 ? `${pct(p.winWilson95[0])} to ${pct(p.winWilson95[1])}` : '—'], ['Avg score margin', p.avgScoreMargin?.toFixed(1)], ['Exhausted pass rate', pct(p.exhaustedPassRate)], ['Response play rate', pct(p.responsePlayRate)]])}</div>` : '<div class="notice warning">No data</div>').join('')}</div></div></section>`;
  document.querySelector('#compare-left').onchange = e => { state.selectedPolicy = e.target.value; import('../app.js').then(m => m.render()); };
  document.querySelector('#compare-right').onchange = e => { state.comparePolicyRight = e.target.value; import('../app.js').then(m => m.render()); };
}

// ── /mechanics ────────────────────────────────────────────────────
const EVIDENCE_GRADE_RANK = { ROBUST: 4, SUPPORTED: 3, EXPLORATORY: 2, INSUFFICIENT: 1, strong: 4, moderate: 3, weak: 2, insufficient: 1 };
const MECHANIC_COLUMNS = [
  { key: 'mechanic', label: 'Mechanic', sort: m => m.displayName ?? m.mechanic, type: 'string' },
  { key: 'dimension', label: 'Dimension', sort: m => m.dimension ?? 'canonical-mechanic', type: 'string' },
  { key: 'selections', label: 'Selections', sort: m => m.selectionCount ?? 0, type: 'number' },
  { key: 'opportunities', label: 'Legal Opps', sort: m => m.legalOpportunityCount ?? 0, type: 'number' },
  { key: 'pickrate', label: 'Pick rate (legal)', sort: m => m.pickRateWhenLegal ?? -1, type: 'number' },
  { key: 'prevalence', label: 'Part. prev.', sort: m => m.participantPrevalence ?? m.matchUsageRate ?? 0, type: 'number' },
  { key: 'matchprev', label: 'Match prev.', sort: m => m.matchPrevalence ?? 0, type: 'number' },
  { key: 'winassoc', label: 'Win assoc.', sort: m => m.rawWinAssociation ?? m.outcomeAssociation ?? 0, type: 'number' },
  { key: 'adjwinassoc', label: 'Adj. win assoc.', sort: m => m.adjustedWinAssociation ?? 0, type: 'number' },
  { key: 'impact', label: 'Point impact', sort: m => m.actorPointImpact?.mean ?? m.immediatePointImpact?.mean ?? 0, type: 'number' },
  { key: 'evidence', label: 'Evidence', sort: m => EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0, type: 'number' },
];

const DIMENSION_FILTERS = [
  { value: 'all', label: 'All dimensions' },
  { value: 'canonical-mechanic', label: 'Canonical Mechanics' },
  { value: 'action-family', label: 'Action Families' },
  { value: 'action-mode', label: 'Action Modes' },
  { value: 'rank-effect', label: 'Rank Effects' },
  { value: 'diagnostic', label: 'Diagnostics' },
];

function renderPickRateCell(m) {
  const st = m.pickRateStatus;
  if (!st) return m.pickRateWhenLegal != null ? pct(m.pickRateWhenLegal) : 'N/A';
  if (st.status === 'available') return `<span title="${st.numerator}/${st.denominator}">${pct(st.value)}</span>`;
  if (st.status === 'zero-opportunities') return `<span class="metric-na" title="${esc(st.detail ?? '')}">0 opps</span>`;
  if (st.status === 'missing-telemetry') return `<span class="metric-na" title="${esc(st.detail ?? '')}">no telemetry</span>`;
  return 'N/A';
}

function renderWinAssocCell(m, field, statusField) {
  const st = m[statusField];
  if (m[field] != null) return `${(m[field] * 100).toFixed(1)} pp`;
  if (st?.status === 'insufficient-sample') return `<span class="metric-na" title="${esc(st.detail ?? '')}">insuff.</span>`;
  if (st?.status === 'model-failed') return `<span class="metric-na" title="${esc(st.detail ?? '')}">model fail</span>`;
  return '—';
}

function renderPointImpactCell(m) {
  const st = m.pointImpactStatus;
  if (m.actorPointImpact?.mean != null) return m.actorPointImpact.mean.toFixed(1);
  if (st?.status === 'available' && st.value === 0) return `<span title="Valid zero impact">0.0</span>`;
  if (st?.status === 'not-applicable') return `<span class="metric-na" title="${esc(st.detail ?? '')}">n/a</span>`;
  return '—';
}

function renderCampaignHealthBanner(o) {
  const h = o.campaignHealth;
  if (!h) return '';
  const legacy = o.legacySchema;
  const warnings = [];
  if (legacy) warnings.push(`<div class="notice warning"><strong>Legacy campaign:</strong> pick-rate and adjusted-outcome metrics require a rerun with opportunity telemetry enabled.</div>`);
  const oppGap = h.trackedEntities - h.entitiesWithOpportunityData;
  if (!legacy && oppGap > 0) warnings.push(`<div class="notice info"><strong>Opportunity telemetry incomplete:</strong> ${oppGap} of ${h.trackedEntities} entities lack legal-window records.</div>`);
  if (h.eligibleSynergyPairs > 0) warnings.push(`<div class="notice info">${h.successfullyModeledSynergyPairs} of ${h.eligibleSynergyPairs} eligible synergy pairs were successfully modeled.</div>`);
  if (h.unmappedDiagnostics > 0) warnings.push(`<div class="notice info">${h.unmappedDiagnostics} unmapped diagnostic tags — not displayed in canonical view.</div>`);
  const stats = `Tracked: ${h.trackedEntities} · Canonical: ${h.canonicalMechanics} · With pick rate: ${h.entitiesWithValidPickRate} · With adj. assoc.: ${h.entitiesWithAdjustedAssociation} · With point impact: ${h.entitiesWithPointImpact} · Synergy pairs: ${h.eligibleSynergyPairs}`;
  return `<div class="campaign-health">${warnings.join('')}<div class="health-stats">${esc(stats)}</div></div>`;
}

// Fold card-specific four-guess-{rank}-{suit} variants into one "four-guess" row.
// They are the same voltage-guess action differing only by guessed card target.
function aggregateFourGuess(mechanics) {
  const variants = mechanics.filter(m => /^four-guess-/.test(m.mechanic));
  if (variants.length < 2) return mechanics;
  const others = mechanics.filter(m => !/^four-guess-/.test(m.mechanic));
  const totalSelections = variants.reduce((s, m) => s + (m.selectionCount ?? 0), 0);
  const totalSample = variants.reduce((s, m) => s + (m.sampleSize ?? 0), 0);
  const opportunityCount = variants[0]?.analysisUnitOpportunityCount ?? variants[0]?.matchOpportunityCount ?? 0;
  const matchOpportunityCount = variants[0]?.matchOpportunityCount ?? 0;
  const usageRate = opportunityCount > 0 ? totalSelections / opportunityCount : 0;
  const weightedAssoc = totalSample > 0
    ? variants.reduce((s, m) => s + (m.outcomeAssociation ?? 0) * (m.sampleSize ?? 0), 0) / totalSample
    : null;
  const gradeRank = { ROBUST: 4, SUPPORTED: 3, EXPLORATORY: 2, INSUFFICIENT: 1, strong: 4, moderate: 3, weak: 2, insufficient: 1 };
  const bestGrade = variants.reduce((best, m) =>
    (gradeRank[m.evidenceGrade] ?? 0) > (gradeRank[best] ?? 0) ? m.evidenceGrade : best, 'INSUFFICIENT');
  const aggregated = {
    mechanic: 'four-guess',
    displayName: 'four-guess (all variants)',
    category: variants[0]?.category ?? 'unknown',
    selectionCount: totalSelections,
    sampleSize: totalSample,
    matchOpportunityCount,
    analysisUnitOpportunityCount: opportunityCount,
    usageUnit: variants[0]?.usageUnit ?? 'match',
    matchUsageRate: usageRate,
    matchUsageWilson95: null,
    outcomeAssociation: weightedAssoc,
    outcomeAssociation95: null,
    immediatePointImpact: null,
    evidenceGrade: bestGrade,
    status: 'measured',
    registryVerified: variants.every(m => m.registryVerified),
    _aggregated: true,
    _variants: [...variants].sort((a, b) => (b.selectionCount ?? 0) - (a.selectionCount ?? 0)),
  };
  return [...others, aggregated];
}

export function renderMechanics() {
  const o = state.observatory;
  const raw = o.mechanics ?? [];
  const mechanics = aggregateFourGuess(raw);
  const selectedMechanic = state.selectedMechanic;
  if (selectedMechanic) {
    const m = mechanics.find(x => x.mechanic === selectedMechanic)
      ?? raw.find(x => x.mechanic === selectedMechanic);
    if (m) return m._aggregated ? renderAggregatedMechanicDetail(m) : renderMechanicDetail(m);
  }
  // Dimension filter — default to canonical-mechanic for the primary view
  const dimensionFilter = state.mechanicsDimensionFilter ?? 'canonical-mechanic';
  const filtered = dimensionFilter === 'all' ? mechanics : mechanics.filter(m => (m.dimension ?? 'canonical-mechanic') === dimensionFilter);
  const original = [...filtered].sort((a, b) => (b.selectionCount ?? 0) - (a.selectionCount ?? 0));
  const sortCol = state.mechanicsSortColumn;
  const sortPhase = state.mechanicsSortPhase ?? 0;
  let sorted = original;
  if (sortPhase !== 0 && sortCol) {
    const col = MECHANIC_COLUMNS.find(c => c.key === sortCol);
    if (col) {
      sorted = [...original].sort((a, b) => {
        const va = col.sort(a), vb = col.sort(b);
        if (col.type === 'number') return sortPhase === 1 ? vb - va : va - vb;
        return sortPhase === 1 ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
      });
    }
  }
  const headerHtml = MECHANIC_COLUMNS.map(col => {
    const isActive = col.key === sortCol && sortPhase !== 0;
    const arrow = isActive ? (sortPhase === 1 ? ' <span class="sort-arrow" aria-hidden="true">▼</span>' : ' <span class="sort-arrow" aria-hidden="true">▲</span>') : '';
    const sortAttr = isActive ? (sortPhase === 1 ? 'aria-sort="descending"' : 'aria-sort="ascending"') : 'aria-sort="none"';
    return `<th data-sort-column="${col.key}" ${sortAttr} tabindex="0" role="button">${col.label}${arrow}</th>`;
  }).join('');
  const filterHtml = `<div class="toolbar"><label for="dimension-filter">Dimension:</label><select id="dimension-filter">${DIMENSION_FILTERS.map(f => `<option value="${f.value}" ${f.value === dimensionFilter ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>`;
  const healthHtml = renderCampaignHealthBanner(o);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Mechanics Atlas</h2><p>Prevalence, pick rate, win association, and evidence by mechanic — ${filtered.length} of ${mechanics.length} entities</p></div>${filterHtml}</div><div class="panel-body">${healthHtml}<div class="table-wrap"><table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${sorted.map(m => `<tr class="clickable-row" data-mechanic="${esc(m.mechanic)}"><td><b>${esc(m.displayName ?? m.mechanic)}</b></td><td>${esc(m.dimension ?? 'canonical-mechanic')}</td><td>${fmt(m.selectionCount ?? 0)}</td><td>${fmt(m.legalOpportunityCount ?? 0)}</td><td>${renderPickRateCell(m)}</td><td>${pct(m.participantPrevalence ?? m.matchUsageRate)}</td><td>${pct(m.matchPrevalence ?? 0)}</td><td>${renderWinAssocCell(m, 'rawWinAssociation', 'rawWinAssociationStatus')}</td><td>${renderWinAssocCell(m, 'adjustedWinAssociation', 'adjustedWinAssociationStatus')}</td><td>${renderPointImpactCell(m)}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('')}</tbody></table></div></div></section>`;
  document.querySelector('#dimension-filter').onchange = e => { state.mechanicsDimensionFilter = e.target.value; import('../app.js').then(m => m.render()); };
  document.querySelectorAll('[data-sort-column]').forEach(th => {
    const handler = () => {
      const col = th.dataset.sortColumn;
      if (state.mechanicsSortColumn === col) { state.mechanicsSortPhase = (state.mechanicsSortPhase + 1) % 3; }
      else { state.mechanicsSortColumn = col; state.mechanicsSortPhase = 1; }
      import('../app.js').then(m => m.render());
    };
    th.onclick = handler;
    th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } };
  });
  document.querySelectorAll('[data-mechanic]').forEach(row => row.onclick = () => { state.selectedMechanic = row.dataset.mechanic; import('../app.js').then(m => m.render()); });
}

function renderMechanicDetail(m) {
  const evidenceClass = (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : 'warning';
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="mechanics-back">← Back to atlas</button><h2>${esc(m.displayName ?? m.mechanic)}</h2><p>${esc(m.category ?? '')} · ${esc(m.dimension ?? 'canonical-mechanic')}</p></div><span class="status-badge ${evidenceClass}">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${definitionList([['Selections', m.selectionCount], ['Legal opportunities', m.legalOpportunityCount ?? 'N/A'], ['Pick rate when legal', m.pickRateWhenLegal != null ? pct(m.pickRateWhenLegal) : 'N/A'], ['Participant prevalence', pct(m.participantPrevalence ?? m.matchUsageRate)], ['Participant prevalence 95% CI', (m.participantPrevalenceWilson95 ?? m.matchUsageWilson95) ? `${pct((m.participantPrevalenceWilson95 ?? m.matchUsageWilson95)[0])} to ${pct((m.participantPrevalenceWilson95 ?? m.matchUsageWilson95)[1])}` : '—'], ['Match prevalence', pct(m.matchPrevalence)], ['Raw win association', m.rawWinAssociation != null ? `${(m.rawWinAssociation * 100).toFixed(1)} pp` : '—'], ['Adjusted win association', m.adjustedWinAssociation != null ? `${(m.adjustedWinAssociation * 100).toFixed(1)} pp` : '—'], ['Actor point impact mean', (m.actorPointImpact ?? m.immediatePointImpact)?.mean?.toFixed(2) ?? '—'], ['Actor point impact median', (m.actorPointImpact ?? m.immediatePointImpact)?.median?.toFixed(2) ?? '—'], ['Sample size', m.sampleSize], ['P-value', m.pValue?.toFixed(4)], ['Registry verified', m.registryVerified ? 'Yes' : 'No']])}${m.limitations ? `<div class="notice info" style="margin-top:12px"><strong>Limitations:</strong><ul>${m.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}</div></section>`;
  document.querySelector('#mechanics-back').onclick = () => { state.selectedMechanic = null; import('../app.js').then(m => m.render()); };
}

function renderAggregatedMechanicDetail(m) {
  const variants = m._variants ?? [];
  const rows = variants.map(v => `<tr class="clickable-row" data-mechanic="${esc(v.mechanic)}"><td class="mono">${esc(v.mechanic)}</td><td>${fmt(v.selectionCount ?? 0)}</td><td>${pct(v.matchUsageRate)}</td><td>${v.outcomeAssociation != null ? `${(v.outcomeAssociation * 100).toFixed(1)} pp` : '—'}</td><td>${v.sampleSize ?? '—'}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[v.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[v.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(v.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('');
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="mechanics-back">← Back to atlas</button><h2>${esc(m.displayName ?? m.mechanic)}</h2><p>${esc(m.category ?? '')} · aggregated from ${variants.length} card-specific variants</p></div><span class="status-badge ${(EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${definitionList([['Variants', variants.length], ['Total selections', fmt(m.selectionCount)], ['Aggregated prevalence', pct(m.matchUsageRate)], ['Win rate association (sample-weighted)', m.outcomeAssociation != null ? `${(m.outcomeAssociation * 100).toFixed(1)} pp` : '—'], ['Total sample size', fmt(m.sampleSize)], ['Registry verified', m.registryVerified ? 'Yes' : 'No']])}<h3 style="margin-top:16px">Card-specific variants</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Variant</th><th>Selections</th><th>Prevalence</th><th>Win rate</th><th>Sample</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
  document.querySelector('#mechanics-back').onclick = () => { state.selectedMechanic = null; import('../app.js').then(m => m.render()); };
  document.querySelectorAll('[data-mechanic]').forEach(row => row.onclick = () => { state.selectedMechanic = row.dataset.mechanic; import('../app.js').then(m => m.render()); });
}

// ── /synergies ────────────────────────────────────────────────────
const SYNERGY_COLUMNS = [
  { key: 'pair', label: 'Pair', sort: s => s.displayName ?? s.id, type: 'string' },
  { key: 'effect', label: 'OR interaction', sort: s => s.effect ?? 0, type: 'number' },
  { key: 'marginal', label: 'Marginal effect', sort: s => s.marginalInteraction ?? s.rawEffect ?? 0, type: 'number' },
  { key: 'ci', label: '95% CI (OR)', sort: s => s.interval?.[0] ?? 0, type: 'number' },
  { key: 'cohorts', label: 'Cohorts (N/B/A/AB)', sort: s => s.effectiveN ?? s.sampleSize ?? 0, type: 'number' },
  { key: 'pvalue', label: 'P-value', sort: s => s.pValue ?? 1, type: 'number' },
  { key: 'qvalue', label: 'Q-value (BH)', sort: s => s.qValue ?? 1, type: 'number' },
  { key: 'evidence', label: 'Evidence', sort: s => EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0, type: 'number' },
];

export function renderSynergies() {
  const o = state.observatory;
  const synergies = o.synergies ?? [];
  const motifs = o.motifs ?? [];
  const selectedSynergy = state.selectedSynergy;
  if (selectedSynergy) {
    const s = synergies.find(x => x.id === selectedSynergy);
    if (s) return renderSynergyDetail(s);
  }
  const original = [...synergies].sort((a, b) => Math.abs(b.estimate ?? 0) - Math.abs(a.estimate ?? 0));
  const sortCol = state.synergiesSortColumn;
  const sortPhase = state.synergiesSortPhase ?? 0;
  let sorted = original;
  if (sortPhase !== 0 && sortCol) {
    const col = SYNERGY_COLUMNS.find(c => c.key === sortCol);
    if (col) {
      sorted = [...original].sort((a, b) => {
        const va = col.sort(a), vb = col.sort(b);
        if (col.type === 'number') return sortPhase === 1 ? vb - va : va - vb;
        return sortPhase === 1 ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
      });
    }
  }
  const headerHtml = SYNERGY_COLUMNS.map(col => {
    const isActive = col.key === sortCol && sortPhase !== 0;
    const arrow = isActive ? (sortPhase === 1 ? ' <span class="sort-arrow" aria-hidden="true">▼</span>' : ' <span class="sort-arrow" aria-hidden="true">▲</span>') : '';
    const sortAttr = isActive ? (sortPhase === 1 ? 'aria-sort="descending"' : 'aria-sort="ascending"') : 'aria-sort="none"';
    return `<th data-sort-column="${col.key}" ${sortAttr} tabindex="0" role="button">${col.label}${arrow}</th>`;
  }).join('');
  const healthHtml = renderCampaignHealthBanner(o);
  const emptyMsg = synergies.length === 0
    ? `<div class="notice warning" style="margin-bottom:12px"><strong>No eligible synergy pairs.</strong> No pairs met the minimum cohort thresholds (Both ≥ 20, single cohorts ≥ 10, total N ≥ 50). Run a larger campaign or lower thresholds to see pairs.</div>`
    : '';
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Synergy Observatory</h2><p>Four-cohort logistic A×B interaction (odds-ratio scale) — ${synergies.length} pairs</p></div></div><div class="panel-body">${healthHtml}${emptyMsg}<div class="table-wrap"><table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${sorted.map(s => `<tr class="clickable-row" data-synergy="${esc(s.id)}"><td><b>${esc(s.displayName ?? s.id)}</b></td><td>${s.effect != null ? `${s.effect.toFixed(3)}` : '—'}</td><td>${s.marginalInteraction != null ? `${(s.marginalInteraction * 100).toFixed(1)} pp` : '—'}</td><td>${s.interval?.[0] != null ? `${s.interval[0].toFixed(3)} to ${s.interval[1].toFixed(3)}` : '—'}</td><td>${s.neitherN ?? '—'}/${s.aOnlyN ?? '—'}/${s.bOnlyN ?? '—'}/${s.bothN ?? '—'}</td><td>${s.pValue?.toFixed(4) ?? '—'}</td><td>${s.qValue?.toFixed(4) ?? '—'}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(s.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('')}</tbody></table></div>${motifs.length ? `<h3 style="margin-top:16px">Motifs (${motifs.length})</h3><div class="grid two">${motifs.map(m => `<div class="notice info"><strong>${esc(m.motif)}</strong><p>${m.count} occurrence(s) across ${m.matchIds?.length ?? 0} match(es).</p></div>`).join('')}</div>` : ''}</div></section>`;
  document.querySelectorAll('[data-sort-column]').forEach(th => {
    const handler = () => {
      const col = th.dataset.sortColumn;
      if (state.synergiesSortColumn === col) { state.synergiesSortPhase = (state.synergiesSortPhase + 1) % 3; }
      else { state.synergiesSortColumn = col; state.synergiesSortPhase = 1; }
      import('../app.js').then(m => m.render());
    };
    th.onclick = handler;
    th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } };
  });
  document.querySelectorAll('[data-synergy]').forEach(row => row.onclick = () => { state.selectedSynergy = row.dataset.synergy; import('../app.js').then(m => m.render()); });
}

function renderSynergyDetail(s) {
  const evidenceClass = (EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 3 ? 'supported' : 'warning';
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="synergy-back">← Back to observatory</button><h2>${esc(s.displayName ?? s.id)}</h2><p>${esc(s.relationshipClass ?? '')} · ${esc(s.direction ?? 'bidirectional')}</p></div><span class="status-badge ${evidenceClass}">${esc(s.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${definitionList([['Interaction (odds-ratio)', s.effect != null ? s.effect.toFixed(4) : '—'], ['Log-estimate', s.logEstimate != null ? s.logEstimate.toFixed(4) : '—'], ['Marginal interaction', s.marginalInteraction != null ? `${(s.marginalInteraction * 100).toFixed(2)} pp` : '—'], ['95% CI (OR)', s.interval?.[0] != null ? `${s.interval[0].toFixed(4)} to ${s.interval[1].toFixed(4)}` : '—'], ['Standard error', s.standardError != null ? s.standardError.toFixed(4) : '—'], ['P-value', s.pValue?.toFixed(6) ?? '—'], ['Q-value', s.qValue?.toFixed(6) ?? '—'], ['Neither cohort', s.neitherN ?? '—'], ['A-only cohort', s.aOnlyN ?? '—'], ['B-only cohort', s.bOnlyN ?? '—'], ['Both cohort', s.bothN ?? '—'], ['Effective N', s.effectiveN ?? '—'], ['Cohort balance', s.cohortBalance != null ? s.cohortBalance.toFixed(3) : '—'], ['Separation detected', s.separation ? 'Yes (corrected)' : 'No'], ['Strata pooled', s.strataCount ?? '—'], ['Status', s.status ?? '—']])}${s.limitations ? `<div class="notice info" style="margin-top:12px"><strong>Limitations:</strong><ul>${s.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}</div></section>`;
  document.querySelector('#synergy-back').onclick = () => { state.selectedSynergy = null; import('../app.js').then(m => m.render()); };
}

// ── /history ──────────────────────────────────────────────────────
export function renderHistory() {
  const summaries = state.observatory?.summaries ?? [];
  if (!summaries.length) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">☰</span><strong>No match history.</strong><p>Run a campaign to populate the match ledger.</p></div>'; return; }
  const page = state.historyPage ?? 0;
  const perPage = 50;
  const term = (state.historyFilterTerm ?? '').toLowerCase();
  const reason = state.historyFilterReason ?? 'all';
  const policy = state.historyFilterPolicy ?? 'all';
  let filtered = summaries;
  if (term) filtered = filtered.filter(s => (s.matchId ?? '').toLowerCase().includes(term) || String(s.matchOrdinal ?? '').includes(term));
  if (reason !== 'all') filtered = filtered.filter(s => s.terminationReason === reason);
  if (policy !== 'all') filtered = filtered.filter(s => (s.policyIds ?? []).includes(policy));
  const totalPages = Math.ceil(filtered.length / perPage);
  const pageItems = filtered.slice(page * perPage, (page + 1) * perPage);
  const reasons = [...new Set(summaries.map(s => s.terminationReason))].sort();
  const allPolicies = [...new Set(summaries.flatMap(s => s.policyIds ?? []))].sort();
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Match History</h2><p>${filtered.length} matches · page ${page + 1}/${Math.max(1, totalPages)}</p></div><div class="toolbar"><input id="history-search" type="search" placeholder="Search match ID or ordinal…" value="${esc(state.historyFilterTerm)}"><select id="history-reason"><option value="all">All outcomes</option>${reasons.map(r => `<option value="${esc(r)}" ${r === reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select><select id="history-policy"><option value="all">All policies</option>${allPolicies.map(p => `<option value="${esc(p)}" ${p === policy ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Ordinal</th><th>Match ID</th><th>Outcome</th><th>Winner</th><th>Score</th><th>Turns</th><th>Policies</th></tr></thead><tbody>${pageItems.map(s => `<tr class="clickable-row" data-match-id="${esc(s.matchId)}"><td>${s.matchOrdinal ?? '—'}</td><td class="mono">${short(s.matchId)}</td><td>${esc(s.terminationReason ?? '—')}</td><td>${esc(s.winner ?? '—')}</td><td>${s.scoreMargin?.toFixed(0) ?? '—'}</td><td>${s.completedFullTurns ?? '—'}</td><td>${esc((s.policyIds ?? []).join(', '))}</td></tr>`).join('')}</tbody></table></div>${totalPages > 1 ? `<div class="pagination"><button id="history-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button><span>Page ${page + 1} of ${totalPages}</span><button id="history-next" ${page >= totalPages - 1 ? 'disabled' : ''}>Next →</button></div>` : ''}</div></section>`;
  document.querySelector('#history-search')?.addEventListener('input', e => { state.historyFilterTerm = e.target.value; state.historyPage = 0; import('../app.js').then(m => m.render()); });
  document.querySelector('#history-reason')?.addEventListener('change', e => { state.historyFilterReason = e.target.value; state.historyPage = 0; import('../app.js').then(m => m.render()); });
  document.querySelector('#history-policy')?.addEventListener('change', e => { state.historyFilterPolicy = e.target.value; state.historyPage = 0; import('../app.js').then(m => m.render()); });
  document.querySelector('#history-prev')?.addEventListener('click', () => { if (page > 0) { state.historyPage = page - 1; import('../app.js').then(m => m.render()); } });
  document.querySelector('#history-next')?.addEventListener('click', () => { if (page < totalPages - 1) { state.historyPage = page + 1; import('../app.js').then(m => m.render()); } });
  document.querySelectorAll('[data-match-id]').forEach(row => row.onclick = () => { state.fixtureId = row.dataset.matchId; state.replayKind = 'autonomy'; state.replay = null; state.frame = 0; location.hash = '#/watch'; });
}

// ── /replays ──────────────────────────────────────────────────────
export function renderReplays() {
  const isAutonomy = !!state.autonomyIndex;
  const index = isAutonomy ? state.autonomyIndex : state.index;
  const records = index?.records ?? [];
  if (!records.length) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">▶</span><strong>No replay records.</strong><p>Run a campaign to generate certified replays.</p></div>'; return; }
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Replay Library</h2><p>${records.length} certified replays — click to load in Watch</p></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Fixture</th><th>Commands</th><th>Events</th><th>Outcome</th></tr></thead><tbody>${records.map(r => `<tr class="clickable-row" data-fixture="${esc(r.fixtureId)}"><td class="mono">${esc(r.fixtureId)}</td><td>${r.commandCount ?? '—'}</td><td>${r.eventCount ?? '—'}</td><td>${esc(r.outcome ?? r.terminationReason ?? '—')}</td></tr>`).join('')}</tbody></table></div></div></section>`;
  document.querySelectorAll('[data-fixture]').forEach(row => row.onclick = () => { state.fixtureId = row.dataset.fixture; state.replayKind = isAutonomy ? 'autonomy' : 'corpus'; state.replay = null; import('../app.js').then(m => m.render()); });
}

// ── /traces ───────────────────────────────────────────────────────
export function renderTraces() {
  const idx = state.traceIndex;
  if (!idx || !idx.records) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">◇</span><strong>No decision traces.</strong><p>Run a campaign with decision traces enabled.</p></div>'; return; }
  const records = idx.records ?? [];
  const filterPolicy = state.traceFilterPolicy ?? 'all';


  const policies = [...new Set(records.map(r => r.policyId).filter(Boolean))].sort();
  let filtered = records;
  if (filterPolicy !== 'all') filtered = filtered.filter(r => r.policyId === filterPolicy);
  const selectedId = state.traceSelectedId;
  if (selectedId) {
    const r = records.find(x => x.matchId === selectedId);
    if (r) {
      app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="traces-back">← Back to index</button><h2>Decision traces: ${esc(r.matchId)}</h2><p>Policy: ${esc(r.policyId ?? '—')} · ${r.traceCount ?? 0} traces</p></div></div><div class="panel-body"><div class="notice">Trace detail loading from shard files. Full trace inspection available after campaign run.</div></div></section>`;
      document.querySelector('#traces-back').onclick = () => { state.traceSelectedId = null; import('../app.js').then(m => m.render()); };
      return;
    }
  }
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Decision Traces</h2><p>${filtered.length} match trace records</p></div><div class="toolbar"><select id="trace-filter-policy"><option value="all">All policies</option>${policies.map(p => `<option value="${esc(p)}" ${p === filterPolicy ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Match ID</th><th>Policy</th><th>Traces</th><th>Seat</th></tr></thead><tbody>${filtered.map(r => `<tr class="clickable-row" data-match-id="${esc(r.matchId)}"><td class="mono">${short(r.matchId)}</td><td>${esc(r.policyId ?? '—')}</td><td>${r.traceCount ?? '—'}</td><td>${r.seat ?? '—'}</td></tr>`).join('')}</tbody></table></div></div></section>`;
  document.querySelector('#trace-filter-policy')?.addEventListener('change', e => { state.traceFilterPolicy = e.target.value; import('../app.js').then(m => m.render()); });
  document.querySelectorAll('[data-match-id]').forEach(row => row.onclick = () => { state.traceSelectedId = row.dataset.matchId; import('../app.js').then(m => m.render()); });
}

// ── /cards ────────────────────────────────────────────────────────
export function renderCardFaces() {
  const view = state.cardFaceView ?? 'board';
  const family = state.cardFaceFamily ?? 'ace';
  const selected = state.cardFaceSelected ?? 'A♣';
  const cards = listAuthoritativeCards();
  const familyCards = cards.filter(c => c.family === family);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Card Face Renderer</h2><p>Deterministic Board, Lite, and Full Zoom faces — ${cards.length} canonical cards</p></div><div class="toolbar"><select id="card-view"><option value="board" ${view === 'board' ? 'selected' : ''}>Board</option><option value="lite" ${view === 'lite' ? 'selected' : ''}>Lite</option><option value="full" ${view === 'full' ? 'selected' : ''}>Full Zoom</option></select><select id="card-family">${CARD_FAMILIES.map(([id, label]) => `<option value="${id}" ${id === family ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><div class="panel-body"><div class="ix-gallery">${familyCards.map(c => `<button class="ix-gallery-item ${c.identity === selected ? 'selected' : ''}" data-card-id="${esc(c.identity)}" aria-label="Select ${esc(c.identity)}">${renderCardFace(c.identity, view)}</button>`).join('')}</div></div></section>`;
  document.querySelector('#card-view').onchange = e => { state.cardFaceView = e.target.value; import('../app.js').then(m => m.render()); };
  document.querySelector('#card-family').onchange = e => { state.cardFaceFamily = e.target.value; import('../app.js').then(m => m.render()); };
  document.querySelectorAll('[data-card-id]').forEach(btn => btn.onclick = () => { state.cardFaceSelected = btn.dataset.cardId; import('../app.js').then(m => m.render()); });
}
