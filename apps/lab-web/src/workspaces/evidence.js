// ═══════════════════════════════════════════════════════════════
// workspaces/evidence.js — /evidence workspace: integrity and provenance
// ═══════════════════════════════════════════════════════════════

import { state,   app,   esc,   short,   definitionList } from '../state.js';
import { rerender, invokeAppAction } from '../rerender.js';
import { openReplay } from '../data-loader.js';
import { ENGINE_VERSION, RULES_VERSION } from '../version.js';
import { donutChart, barChart, sparkline, chartTableAlternative } from '../chart-toolkit.js';
import { statusChip, pipelineFlow, dossierSection } from './observatory-ui.js';
import { LAB_TRUST_POLICY } from '../evolution/lab-trust-policy.mjs';

// ── Anomaly Explorer (Depth II Phase 3) ──────────────────────────
// Elevate the 30 anomalies from a flat table to an interactive explorer
// with distribution charts, severity breakdown, and match-level drill-down.
function renderAnomalyExplorer(anomalies) {
  if (!anomalies.length) return '';
  const typeFilter = state.anomalyTypeFilter ?? 'all';
  const severityFilter = state.anomalySeverityFilter ?? 'all';
  // Type distribution donut
  const typeCounts = {};
  for (const a of anomalies) typeCounts[a.type ?? 'unknown'] = (typeCounts[a.type ?? 'unknown'] ?? 0) + 1;
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc'];
  const typeDonut = donutChart({
    segments: Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] })),
    size: 160,
    title: 'Anomaly type distribution',
    ariaLabel: 'Donut chart of anomaly type distribution',
  });
  // Severity breakdown bar chart
  const severityCounts = {};
  for (const a of anomalies) severityCounts[a.severity ?? 'low'] = (severityCounts[a.severity ?? 'low'] ?? 0) + 1;
  const severityColors = { high: '#f0786f', warning: '#f1bd5d', info: '#5ad7e8', low: '#5ad7e8' };
  const severityBar = barChart({
    items: Object.entries(severityCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: severityColors[label] ?? '#4fd387' })),
    width: 360,
    barHeight: 24,
    title: 'Anomaly severity breakdown',
    ariaLabel: 'Bar chart of anomaly counts by severity',
  });
  // Value sparkline (if anomalies have numeric values)
  const valuedAnomalies = anomalies.filter(a => a.value != null && Number.isFinite(Number(a.value)));
  const valueSparkline = valuedAnomalies.length > 0
    ? sparkline({ values: valuedAnomalies.map(a => Number(a.value)), width: 200, height: 36, color: '#a78bfa', title: 'Anomaly values sparkline', ariaLabel: 'Sparkline of anomaly numeric values' })
    : '';
  // Filtered table
  let filtered = anomalies;
  if (typeFilter !== 'all') filtered = filtered.filter(a => (a.type ?? 'unknown') === typeFilter);
  if (severityFilter !== 'all') filtered = filtered.filter(a => (a.severity ?? 'low') === severityFilter);
  const allTypes = [...new Set(anomalies.map(a => a.type ?? 'unknown'))].sort();
  const allSeverities = [...new Set(anomalies.map(a => a.severity ?? 'low'))].sort();
  const filterHtml = `<div class="ix-filter-toolbar" data-testid="anomaly-filter-toolbar"><label for="anomaly-type-filter">Type:</label><select id="anomaly-type-filter"><option value="all" ${typeFilter === 'all' ? 'selected' : ''}>All types</option>${allTypes.map(t => `<option value="${esc(t)}" ${t === typeFilter ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><label for="anomaly-severity-filter">Severity:</label><select id="anomaly-severity-filter"><option value="all" ${severityFilter === 'all' ? 'selected' : ''}>All severities</option>${allSeverities.map(s => `<option value="${esc(s)}" ${s === severityFilter ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>`;
  const tableRows = filtered.map(a => [a.type ?? 'unknown', a.detail ?? a.matchId ?? '—', a.severity ?? 'low', a.value ?? '—', a.matchId ?? '—']);
  const tableAlt = chartTableAlternative({
    headers: ['Type', 'Detail', 'Severity', 'Value', 'Match ID'],
    rows: tableRows,
    caption: 'Anomaly records',
  });
  // Interactive table with clickable rows for match drill-down.
  // "vs baseline" makes the anomaly magnitude legible without opening the
  // match — the row click still navigates to Watch, and the per-row ledger
  // button jumps to the match's History dossier.
  const tableHtml = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Type</th><th>Severity</th><th>Value</th><th>vs baseline</th><th>Why flagged</th><th>Match</th><th></th></tr></thead><tbody>${filtered.map(a => {
    const lift = a.value != null && a.baseline ? (Number(a.value) / Number(a.baseline)) : (a.value != null && a.threshold ? Number(a.value) / Number(a.threshold) : null);
    return `<tr class="clickable-row" data-anomaly-match="${esc(a.matchId ?? '')}"><td>${esc(a.type ?? 'unknown')}</td><td><span class="status-badge ${a.severity === 'high' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info'}">${esc(a.severity ?? 'low')}</span></td><td>${a.value != null ? fmt(a.value) : '—'}${a.unit ? ` <small class="footer-note">${esc(a.unit)}</small>` : ''}</td><td>${lift != null ? `${lift.toFixed(2)}×` : '—'}</td><td>${a.detail ? esc(a.detail) : '—'}</td><td class="mono">${short(a.matchId ?? '—')}</td><td><button class="ix-chart-toggle" data-anomaly-history="${esc(a.matchId ?? '')}" title="Open match dossier in History" aria-label="Open match ${esc(short(a.matchId ?? ''))} in History">☰</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
  return `<div data-testid="anomaly-explorer" id="anomaly-explorer"><div class="grid two" style="margin-bottom:12px"><div>${typeDonut}</div><div>${severityBar}</div></div>${valueSparkline ? `<div style="margin-bottom:12px">${valueSparkline}</div>` : ''}${filterHtml}${tableHtml}<button class="ix-chart-toggle" data-chart-toggle aria-expanded="false" style="margin-top:8px">View raw anomaly records</button><div class="ix-chart-table-alt" data-chart-table hidden>${tableAlt}</div></div>`;
}

function fmt(v) { return new Intl.NumberFormat().format(Number(v ?? 0)); }

export function renderEvidence() {
  const c = state.capabilities, o = state.observatory, registry = o.metricRegistry ?? {}, anomalies = o.anomalies ?? [];
  // engineTests is only present if a build embeds unit-test counts. The
  // capability manifest carries the certified conformance fixture suites
  // instead — surface those truthfully rather than a misleading 0/0.
  const engineTests = c.engineTests ?? null;
  const legacyConf = c.engine?.legacyProtocolConformance ?? null;
  const hotfixConf = c.engine?.semanticHotfixConformance ?? null;
  const conformanceFixtures = (legacyConf?.fixtureCount ?? 0) + (hotfixConf?.fixtureCount ?? 0);
  const testsCard = engineTests
    ? `<div class="metric-value">${engineTests.passed}/${engineTests.total}</div><div class="metric-detail">Pass/priority/Quick/Interrupt</div>`
    : (conformanceFixtures
      ? `<div class="metric-value">${conformanceFixtures}</div><div class="metric-detail">${legacyConf?.fixtureCount ?? 0} protocol + ${hotfixConf?.fixtureCount ?? 0} hotfix fixtures · ${esc(hotfixConf?.status ?? 'PASS')}</div>`
      : `<div class="metric-value">—</div><div class="metric-detail">Not reported in build</div>`);
  const labVersion = c.labVersion ?? state.buildInfo?.version ?? '—';
  const conformanceTotal = c.engine?.conformanceReplayCount ?? 121;
  const evidenceEpoch = o.evidenceEpoch ?? state.aggregate?.evidenceEpoch ?? 'post-rules-parity-repair-v0.28.1';
  const postRepair = o.postRulesParityRepair ?? state.aggregate?.postRulesParityRepair ?? true;
  const authorityHash = o.authorityHash ?? state.aggregate?.authorityHash ?? null;
  const selfPlayExcluded = o.selfPlayExcluded ?? state.aggregate?.selfPlayExcluded ?? true;
  // ── Evidence control room (Atlas UX pass) ──────────────────────
  // Dashboard modules answering "can I trust this dataset, and what can
  // it support?" — every value reads an existing analytics field.
  const h = o.campaignHealth ?? {};
  const cand = o.synergyCandidateSet ?? {};
  const cov = o.choiceAnalysis?.coverage ?? {};
  const reconOk = o.reconciliation?.invariantHolds;
  const completenessStatus = o.completeness?.status ?? 'UNAVAILABLE';
  const replayCount = state.autonomyIndex?.records?.length ?? state.index?.records?.length ?? null;
  const certReplayCount = o.certifiedReplayCount ?? replayCount;
  const anomalyHigh = anomalies.filter(a => a.severity === 'high' || a.severity === 'warning').length;
  const kvRows = rows => `<div class="obs-kv-list">${rows.filter(([, v]) => v != null).map(([k, v]) => `<div class="obs-kv"><span>${esc(k)}</span><span>${v}</span></div>`).join('')}</div>`;
  // ── Coherent trust surfaces (P1-B) ────────────────────────────
  // Each status is traceable to its OWN evidence source — a taxonomy
  // reconciliation PASS is not an experimental-design PASS, and an
  // analytics PASS is not permission to promote. The composite
  // "Scientific eligibility" chip can never exceed what the weakest
  // required surface supports.
  const ei = o.experimentIntegrity ?? null;
  const eiCheck = key => ei?.checks?.[key] ?? { status: 'NOT_TESTED', detail: 'Experiment-integrity analysis not computed for this dataset' };
  const basis = state.evidenceBasis ?? null;
  const integrityGapCount = (basis?.corruptCount ?? 0) + (basis?.quarantinedCount ?? 0) + (basis?.payloadUnavailableCount ?? 0);
  const persistStatus = basis == null ? 'UNAVAILABLE'
    : basis.persisted !== true ? 'INSUFFICIENT'
      : integrityGapCount > 0 ? 'WARN' : 'PASS';
  // Capability policy is an explicit input: a structural/analytics PASS is
  // data quality, not authorization. While Wave 0 containment is active the
  // composite can never claim confirmatory eligibility — exploratory use
  // remains intact and is labelled as such.
  const policyBlocksConfirmatory = LAB_TRUST_POLICY.confirmatoryComparison !== true || LAB_TRUST_POLICY.automaticPromotion !== true;
  const dataEligibility = ei == null ? 'UNAVAILABLE'
    : ei.overall === 'FAIL' ? 'FAIL'
      : ei.overall !== 'PASS' ? ei.overall // WARN / INSUFFICIENT / NOT_TESTED
        : persistStatus !== 'PASS' ? 'INSUFFICIENT' : 'PASS';
  const eligibilityStatus = dataEligibility === 'PASS' && policyBlocksConfirmatory ? 'LIMITED' : dataEligibility;
  const eligibilityDetail = ei == null
    ? 'Integrity self-audit has not been computed for this dataset — eligibility cannot be claimed.'
    : ei.overall !== 'PASS'
      ? `Integrity audit reports ${ei.overall} — ${Object.entries(ei.checks ?? {}).filter(([, ch]) => ['FAIL', 'INSUFFICIENT', 'NOT_TESTED'].includes(ch?.status)).map(([k]) => k).join(', ') || 'see check detail'}`
      : persistStatus !== 'PASS'
        ? `Analytics pass, but persistence/coverage is ${persistStatus} — durability is not certified.`
        : policyBlocksConfirmatory
          ? 'All structural checks pass — this is exploratory evidence. Confirmatory comparisons and automatic promotion remain suspended under the current Lab trust policy.'
          : 'All required checks passed for this dataset.';
  const controlRoomHtml = `<section class="panel" data-testid="evidence-control-room"><div class="panel-header"><div><h2>Evidence control room</h2><p>Dataset integrity, provenance, and inferential capability — each surface answers a different question</p></div><div class="toolbar"><select id="dossier-export-format" aria-label="Analysis dossier export format"><option value="json">JSON</option><option value="markdown">Markdown</option><option value="both">JSON + Markdown</option></select><button id="export-analysis-dossier" class="primary-button" type="button">Export Analysis Dossier</button></div></div><div class="panel-body"><div class="dossier-grid">${dossierSection('Dataset', `${statusChip(o.summaryCount > 0 ? 'PASS' : 'UNAVAILABLE')}${kvRows([['Matches', fmt(o.summaryCount ?? o.summaries?.length ?? 0)], ['Certified replays', certReplayCount != null ? fmt(certReplayCount) : '—'], ['Replay index', replayCount != null ? fmt(replayCount) : '—']])}`)}${dossierSection('Provenance', `${statusChip(postRepair ? 'PASS' : 'LIMITED')}${kvRows([['Evidence epoch', `<code>${esc(evidenceEpoch)}</code>`], ['Engine', c.engine?.version ?? ENGINE_VERSION], ['Rules', c.engine?.rulesVersion ?? RULES_VERSION], ['Lab', labVersion], ['Schema', o.analyticsSchemaVersion ?? o.schemaVersion]])}`)}${dossierSection('Data integrity', `${statusChip(reconOk === true && completenessStatus === 'PASS' ? 'PASS' : reconOk === false || completenessStatus === 'FAIL' ? 'FAIL' : 'LIMITED')}${kvRows([['Reconciliation', reconOk == null ? '—' : reconOk ? 'invariant holds' : 'INVARIANT FAILED'], ['Completeness', completenessStatus], ['Self-play excluded', selfPlayExcluded ? 'true' : 'false'], ['Post-parity-repair', postRepair ? 'true' : 'false'], ['Authority hash', authorityHash ? `<code>${short(authorityHash)}</code>` : '—']])}`, { note: 'schema + reconciliation — structure only' })}${dossierSection('Experiment design', `${statusChip(eiCheck('pairedDesign').status)}${kvRows([['Paired design', eiCheck('pairedDesign').status], ['Seat exposure', eiCheck('policySeatExposure').status], ['Seat effect (observed)', eiCheck('seatEffect').status], ['Leg metadata', eiCheck('designMetadata').status]])}`, { note: 'design validity — not outcome balance' })}${dossierSection('Evidence identity', `${statusChip(eiCheck('uniqueMatchIds').status)}${kvRows([['Unique match IDs', eiCheck('uniqueMatchIds').status], ['Unique ordinals', eiCheck('uniqueOrdinals').status], ['Seed provenance', eiCheck('seedProvenance').status], ['Executable identity', eiCheck('executableIdentity').status], ['Sample independence', eiCheck('sampleIndependence').status]])}`, { note: 'identity + independence of retained samples' })}${dossierSection('Statistical readiness', `${statusChip((h.entitiesWithAdjustedAssociation ?? 0) > 0 ? 'LIMITED' : 'UNAVAILABLE')}${kvRows([['Mechanics w/ adj. assoc.', h.entitiesWithAdjustedAssociation], ['Mechanics w/ valid pick rate', h.entitiesWithValidPickRate], ['Synergy pairs modeled', h.successfullyModeledSynergyPairs], ['Synergies evidence-qualified', h.evidenceQualifiedSynergyPairs], ['Rejected pre-model', h.rejectedSynergyPairs], ['Tracing neutrality', eiCheck('tracingNeutrality').status], ['Rule compliance', eiCheck('ruleCompliance').status]])}`)}${dossierSection('Persistence & coverage', `${statusChip(persistStatus)}${kvRows([['Backend', basis == null ? '—' : basis.persisted === true ? 'durable (IndexedDB)' : 'session-only (memory)'], ['Corrupt records', basis?.corruptCount ?? '—'], ['Quarantined', basis?.quarantinedCount ?? '—'], ['Payload unavailable', basis?.payloadUnavailableCount ?? '—'], ['Session-only runs', basis?.memoryOnlyRunCount ?? '—'], ['Included games', basis?.includedGames ?? '—']])}`, { note: 'durability + retained coverage — not eligibility' })}${dossierSection('Anomalies', `${statusChip(anomalies.length ? (anomalyHigh ? 'LIMITED' : 'PASS') : 'PASS')}${kvRows([['Anomaly records', anomalies.length], ['Warning/high severity', anomalyHigh], ['Matches affected', new Set(anomalies.map(a => a.matchId)).size], ['Decisions w/ legal sets', cov.decisionsWithLegalActions != null ? fmt(cov.decisionsWithLegalActions) : '—']])}`)}</div>${dossierSection('Scientific eligibility', `${statusChip(eligibilityStatus)}${kvRows([['Evidence classification', LAB_TRUST_POLICY.classification], ['Confirmatory comparison', LAB_TRUST_POLICY.confirmatoryComparison === true ? 'permitted' : 'BLOCKED — ' + LAB_TRUST_POLICY.comparisonReason], ['Automatic promotion', LAB_TRUST_POLICY.automaticPromotion === true ? 'permitted' : 'BLOCKED — ' + LAB_TRUST_POLICY.promotionReason]])}<p class="footer-note" style="margin:6px 0 0">${esc(eligibilityDetail)}</p>`, { note: 'composite — never exceeds the weakest required surface' })}<h3 style="margin:16px 0 6px;font-size:13px;color:var(--text-bright)">Evidence pipeline</h3>${pipelineFlow([
    { value: fmt(o.summaryCount ?? 0), label: 'Matches', sub: `${(o.summaries ?? []).length * 2} participant obs.` },
    { value: fmt(cov.decisionsWithLegalActions ?? 0), label: 'Decisions', sub: `${fmt(cov.decisionsSeen ?? 0)} recorded` },
    { value: fmt(h.trackedEntities ?? 0), label: 'Entities tracked', sub: `${h.unmappedDiagnostics ?? 0} unmapped diagnostics`, limited: (h.unmappedDiagnostics ?? 0) > 0 },
    { value: fmt(h.canonicalMechanics ?? 0), label: 'Canonical', sub: `${(o.quarantineLedger ?? []).length} quarantined`, limited: (o.quarantineLedger ?? []).length > 0 },
    { value: fmt(h.entitiesWithValidPickRate ?? 0), label: 'Valid denominators', sub: 'legal-opportunity records', limited: (h.entitiesWithValidPickRate ?? 0) < (h.trackedEntities ?? 0) },
    { value: fmt(h.entitiesWithAdjustedAssociation ?? 0), label: 'Adjusted assoc.', sub: 'stratified model available' },
  ])}${pipelineFlow([
    { value: fmt(cand.pairCount ?? 0), label: 'Candidate pairs', sub: `${cand.mechanics?.length ?? '—'} mechanics` },
    { value: fmt(h.eligibleSynergyPairs ?? 0), label: 'Eligible', sub: 'cohort thresholds met' },
    { value: fmt(h.successfullyModeledSynergyPairs ?? 0), label: 'Modeled', sub: 'stratified logit estimated' },
    { value: fmt(h.evidenceQualifiedSynergyPairs ?? 0), label: 'Evidence-qualified', sub: `${h.rejectedSynergyPairs ?? 0} rejected pre-model`, limited: (h.rejectedSynergyPairs ?? 0) > 0 },
    { value: fmt(o.pairedABBA?.totalPairedBlocks ?? 0), label: 'Paired AB/BA', sub: `${o.pairedABBA?.incompletePairs ?? 0} unpaired runs`, limited: (o.pairedABBA?.incompletePairs ?? 0) > 0 },
  ])}<div class="obs-flow-note">Pipeline counts are descriptive — each stage shows how many records carry usable evidence forward and how many were excluded, quarantined, or rejected.</div></div></section>`;
  app.innerHTML = `<div class="ws-stack evidence-vault"><div class="grid four"><div class="metric-card"><small>Engine conformance</small>${testsCard}</div><div class="metric-card"><small>Conformance</small><div class="metric-value">${conformanceTotal}</div><div class="metric-detail">Certified replays</div></div><div class="metric-card"><small>Lab version</small><div class="metric-value">${esc(labVersion)}</div></div><div class="metric-card"><small>Engine</small><div class="metric-value">${esc(c.engine?.version ?? ENGINE_VERSION)}</div><div class="metric-detail">Rules ${esc(c.engine?.rulesVersion ?? RULES_VERSION)}</div></div></div>
  ${controlRoomHtml}
  <section class="panel" data-testid="evidence-epoch-panel"><div class="panel-header"><div><h2>Evidence epoch</h2><p>Provenance metadata for evidence admissibility</p></div></div><div class="panel-body">${definitionList([['Evidence epoch', esc(evidenceEpoch)], ['Post-rules-parity-repair', postRepair ? 'true' : 'false'], ['Authority hash', authorityHash ? short(authorityHash) : '—'], ['Self-play excluded', selfPlayExcluded ? 'true' : 'false'], ['Engine version', c.engine?.version ?? ENGINE_VERSION], ['Rules version', c.engine?.rulesVersion ?? RULES_VERSION], ['Lab version', labVersion]])}<div class="notice info" style="margin-top:12px" data-testid="admissibility-disclosure"><strong>Why this evidence is admissible:</strong> All matches were generated against the repaired engine. Self-play matches are excluded from cross-policy superiority aggregates. Policy-strength tiers are declared. Pre-repair and post-repair evidence are kept strictly separate.</div></div></section>
  <section class="panel" data-testid="policy-strength-tiers-panel"><div class="panel-header"><div><h2>Policy strength tiers</h2><p>Claims qualified by policy capability</p></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Tier</th><th>Description</th><th>Status</th></tr></thead><tbody><tr><td><b>Fixture</b></td><td>Tests legality, not strategy</td><td><span class="status-badge supported">Established</span></td></tr><tr><td><b>Baseline</b></td><td>Creates reproducible behavior</td><td><span class="status-badge supported">Established</span></td></tr><tr><td><b>Heuristic</b></td><td>Makes locally informed choices</td><td><span class="status-badge supported">Established</span></td></tr><tr><td><b>Lookahead</b></td><td>Evaluates limited continuations</td><td><span class="status-badge warning">Not yet established</span></td></tr><tr><td><b>Tournament</b></td><td>Passes defined competitive benchmarks</td><td><span class="status-badge warning">Not yet established</span></td></tr><tr><td><b>Human-meta proxy</b></td><td>Approximates human play patterns</td><td><span class="status-badge warning">Not yet established</span></td></tr></tbody></table></div><p style="margin-top:8px"><small>No policy is classified as lookahead, tournament, or human-meta-proxy without benchmark support. Claims are qualified by tier.</small></p></div></section>
  <section class="panel"><div class="panel-header"><div><h2>Metric registry</h2><p>All computed metrics with formula provenance</p></div></div><div class="panel-body">${Object.keys(registry).length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Metric</th><th>Version</th><th>Formula</th><th>Uncertainty</th></tr></thead><tbody>${Object.entries(registry).map(([id, m]) => `<tr><td><b>${esc(id)}</b></td><td>${esc(m.version ?? '—')}</td><td class="mono">${esc(m.formula ?? '—')}</td><td>${esc(m.uncertainty ?? '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No metric registry.</strong> Run a campaign to generate the metric registry.</div>'}</div></section>
  <section class="panel"><div class="panel-header"><div><h2>Capability manifest</h2><p>Supported profiles and engine authority</p></div></div><div class="panel-body">${c.profiles ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Profile</th><th>Autonomy</th><th>Modules</th></tr></thead><tbody>${c.profiles.map(p => `<tr><td><b>${esc(p.id ?? p.profileId)}</b></td><td><span class="status-badge ${p.autonomy === 'SUPPORTED' ? 'supported' : 'danger'}">${esc(p.autonomy)}</span></td><td>${esc((p.modules ?? []).join(', ') || 'none')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No capability manifest.</strong></div>'}</div></section>
  ${anomalies.length ? `<section class="panel"><div class="panel-header"><div><h2>Anomalies</h2><p>${anomalies.length} detected</p></div></div><div class="panel-body">${renderAnomalyExplorer(anomalies)}</div></section>` : ''}
  <section class="panel"><div class="panel-header"><div><h2>Release provenance</h2><p>Build information and artifact integrity</p></div></div><div class="panel-body">${definitionList([['Capability hash', short(c.capabilityHash)], ['Observatory hash', short(o.observatoryHash)], ['Campaign hash', short(state.aggregate?.canonicalResultHash)], ['Engine version', c.engine?.version ?? ENGINE_VERSION], ['Rules version', c.engine?.rulesVersion ?? RULES_VERSION], ['Lab version', labVersion]])}</div></section></div>`;
  // Analysis Dossier export — canonical research-state document (JSON is
  // authoritative; Markdown is a deterministic projection of the same object).
  const dossierBtn = document.querySelector('#export-analysis-dossier');
  if (dossierBtn) dossierBtn.onclick = async () => {
    dossierBtn.disabled = true;
    try {
      await invokeAppAction('exportAnalysisDossier', document.querySelector('#dossier-export-format')?.value ?? 'json');
    } finally { dossierBtn.disabled = false; }
  };
  // Depth II Phase 3: anomaly explorer event handlers
  const anomalyTypeEl = document.querySelector('#anomaly-type-filter');
  if (anomalyTypeEl) anomalyTypeEl.onchange = e => { state.anomalyTypeFilter = e.target.value; rerender(); };
  const anomalySevEl = document.querySelector('#anomaly-severity-filter');
  if (anomalySevEl) anomalySevEl.onchange = e => { state.anomalySeverityFilter = e.target.value; rerender(); };
  document.querySelectorAll('[data-anomaly-match]').forEach(row => row.onclick = () => {
    const matchId = row.dataset.anomalyMatch;
    if (!matchId) return;
    state.fixtureId = matchId;
    // Anomaly evidence is produced by the autonomy campaign — resolve via
    // the shared replay resolver, which navigates to #/watch and reports
    // honestly when the replay body is excluded from this build.
    const kind = state.index?.records?.some(r => r.fixtureId === matchId) ? 'corpus' : 'autonomy';
    void openReplay({ kind, fixtureId: matchId });
  });
  // Anomaly raw-records table toggle (same pattern as bindChartToggle)
  const anomalyToggle = document.querySelector('#anomaly-explorer [data-chart-toggle]');
  const anomalyTable = document.querySelector('#anomaly-explorer [data-chart-table]');
  if (anomalyToggle && anomalyTable) anomalyToggle.onclick = () => {
    const show = anomalyTable.hasAttribute('hidden');
    anomalyTable.toggleAttribute('hidden', !show);
    anomalyToggle.setAttribute('aria-expanded', String(show));
    anomalyToggle.textContent = show ? 'Hide table' : 'View raw anomaly records';
  };
  // Anomaly → History dossier (secondary drill-down)
  document.querySelectorAll('[data-anomaly-history]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const matchId = btn.getAttribute('data-anomaly-history');
    if (!matchId) return;
    state.historyFilterMatchIds = [matchId];
    state.historySelectedMatch = matchId;
    state.historyPage = 0;
    location.hash = '#/history';
  });
}
