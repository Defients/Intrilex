// ═══════════════════════════════════════════════════════════════
// workspaces/ranks.js — /ranks workspace: rank power observatory
// ═══════════════════════════════════════════════════════════════

import { state,   app,   esc,   short,   definitionList } from '../state.js';
import { rerender } from '../rerender.js';
import { labDatasetBanner } from './observatory.js';
import { radarChart } from '../chart-toolkit.js';

const SUIT_GLYPHS = { '10:club': '♣', '10:diamond': '♦', '10:heart': '♥', '10:spade': '♠' };

function displayRankGlyph(rank) {
  const suit = SUIT_GLYPHS[rank];
  return suit ? `10${suit}` : rank;
}

// Visual family grouping for glyph tiles and radar accents.
// Suit colors mirror .card-token.suit-*; court/joker/ace get distinct accents.
function rankFamily(rank) {
  const suit = SUIT_GLYPHS[rank];
  if (suit) return `suit-${rank.split(':')[1]}`;
  if (rank === 'A') return 'family-ace';
  if (rank === 'RJ' || rank === 'BJ') return 'family-joker';
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 'family-royal';
  return 'family-number';
}

const FAMILY_ACCENT = {
  'suit-club': '#68d391', 'suit-diamond': '#ee8f6b', 'suit-heart': '#ee6cb7', 'suit-spade': '#a78bfa',
  'family-ace': '#5ad7e8', 'family-royal': '#f1bd5d', 'family-joker': '#ee6cb7', 'family-number': '#5b9cf0',
};

function baseRankForAnatomy(rank) {
  if (rank.startsWith('10:')) return '10';
  return rank;
}

export function renderRanks() {
  const rankPower = state.rankPower;
  if (!rankPower || !rankPower.ranks) {
    app.innerHTML = '<div class="empty-state"><strong>Rank power data not available</strong><p>Run a campaign with rank attribution enabled to populate the rank power observatory.</p></div>';
    return;
  }
  const ranks = rankPower.ranks ?? {};
  const watch = rankPower.watchlist ?? { overpowered: [], underpowered: [], dominant: [], negligible: [] };
  const ladder = Object.entries(ranks)
    .map(([rank, profile]) => ({ rank, rpi: profile.rpi ?? 0, confidence: profile.confidence ?? 'INSUFFICIENT', opportunities: profile.metrics?.opportunityCount ?? 0, balanceQualified: profile.balanceQualified, integrityStatus: profile.integrity?.status ?? null, qualificationReasons: profile.balanceQualification?.reasons ?? [] }))
    .sort((a, b) => b.rpi - a.rpi);
  const selectedRank = state.selectedRank ?? ladder[0]?.rank ?? 'A';
  const profile = ranks[selectedRank] ?? {};
  const axes = profile.axes ?? {};
  // Current server-side schema uses ORV/observedRankValue. Keep legacy CDV
  // aliases only as a compatibility fallback for older browser artifacts.
  const observedRankValueAxis = axes.observedRankValue ?? axes.decisionValue ?? null;
  const observedRankValueRaw = profile.raw?.observedRankValue ?? profile.raw?.decisionValue ?? null;
  const orv = profile.orv ?? profile.cdv ?? null;
  const confidence = profile.confidence ?? 'INSUFFICIENT';
  const confidenceClass = `confidence-${confidence.toLowerCase()}`;
  const selectedPosition = ladder.findIndex(e => e.rank === selectedRank) + 1;
  const anatomySelectedRank = baseRankForAnatomy(selectedRank);
  const anatomyHtml = state._rankAnatomyModule && state.rankAnatomyRegistry
    ? state._rankAnatomyModule.renderRankAnatomy({
        variantAnalytics: state.variantAnalytics,
        rankAnatomyRegistry: state.rankAnatomyRegistry,
        selectedRank: anatomySelectedRank, profileFilter: state.variantProfileFilter ?? 'all',
        originFilter: state.originFilter ?? 'all',
        anatomyTab: state.anatomyTab ?? 'overall'
      })
    : '';

  app.innerHTML = `<div class="ranks-observatory">${rankSummaryStrip(ladder, watch)}<div class="ranks-layout"><section class="panel ranks-ladder-panel"><div class="panel-header"><div><h2><span class="panel-icon" aria-hidden="true">★</span>Rank power ladder</h2><p>Cohort-relative Observed RPI across ${ladder.length} rank ladder entries</p></div><span class="panel-chip">${ladder.length} entries</span></div><div class="panel-body">${labDatasetBanner()}<ol class="rank-ladder">${ladder.map((entry, i) => rankLadderRow(entry, i, selectedRank)).join('')}</ol></div></section><section class="panel ranks-detail-panel"><div class="panel-header"><div><h2><span class="panel-icon" aria-hidden="true">◈</span>Rank dossier</h2><p>Six-axis power profile, cohort metrics, and observed value</p></div><div class="toolbar"><span class="confidence-pill ${confidenceClass}">${esc(confidence)}</span></div></div><div class="panel-body">${rankIdentityHeader(selectedRank, selectedPosition, ladder.length, profile)}<div class="rank-detail-grid">${rankPowerRadar(profile, axes, observedRankValueAxis, observedRankValueRaw, rankFamily(selectedRank))}<div class="rank-profile">${rankAxisBar('Selection', axes.selectionPower, profile.raw?.selectionRate != null ? `${(profile.raw.selectionRate * 100).toFixed(1)}% participation` : null, profile.axisStatus?.selectionPower)}${rankAxisBar('Victory', axes.victoryPower, profile.raw?.victoryRate != null ? `${(profile.raw.victoryRate * 100).toFixed(1)}% victory` : null, profile.axisStatus?.victoryPower)}${rankAxisBar('Score', axes.scorePower, profile.raw?.scorePerSelection != null ? `${profile.raw.scorePerSelection.toFixed(2)} pts/action` : null, profile.axisStatus?.scorePower)}${rankAxisBar('Board', axes.boardPower, profile.raw?.boardPerSelection != null ? `${profile.raw.boardPerSelection.toFixed(4)} board/action` : null, profile.axisStatus?.boardPower)}${rankAxisBar('Response', axes.responsePower, profile.raw?.responseRate != null ? `${(profile.raw.responseRate * 100).toFixed(1)}% response` : null, profile.axisStatus?.responsePower)}${rankAxisBar('Observed Rank Value', observedRankValueAxis, observedRankValueRaw != null && Number.isFinite(observedRankValueRaw) ? observedRankValueRaw.toFixed(3) : null, profile.axisStatus?.observedRankValue)}</div></div><h4 class="rank-subhead">Cohort metrics</h4><div class="rank-metrics-grid">${definitionList([['RPI', profile.rpi?.toFixed(4)], ['Decision Power', profile.decisionPower?.toFixed(4)], ['Rank Participations', profile.metrics?.selectionCount], ['Opportunities', profile.metrics?.opportunityCount], ['Victories', profile.metrics?.victoryContributionCount], ['Defeats', profile.metrics?.defeatExposureCount], ['Secured Points', profile.metrics?.securedPointContribution?.toFixed(1)], ['Board Presence', profile.metrics?.boardPresenceContribution?.toFixed(1)], ['Causal Delta Coverage', profile.metrics?.causalCoverage != null ? `${(profile.metrics.causalCoverage * 100).toFixed(1)}%` : '—']])}</div>${orv ? `<div class="rank-cdv"><div class="rank-cdv-head"><h3><span class="panel-icon" aria-hidden="true">◎</span>Observed Rank Value</h3><span class="confidence-pill confidence-${String(orv.confidence ?? 'insufficient').toLowerCase()}">${esc(orv.confidence ?? '—')}</span></div>${definitionList([['Average ORV', orv.averageDecisionValue?.toFixed(4)], ['Rank comparisons', orv.swapCount], ['Observations', orv.sampleSize ?? orv.observationalSampleCount ?? orv.totalRollouts]])}<p class="footer-note">Descriptive cohort association; not a paired counterfactual.</p></div>` : '<div class="notice"><strong>No observed rank value</strong>There is not enough cohort evidence to estimate ORV for this rank.</div>'}</div></section></div>${anatomyHtml}<div class="grid two"><section class="panel"><div class="panel-header"><div><h2><span class="panel-icon" aria-hidden="true">⚑</span>Balance watchlist</h2><p>Ranks flagged for potential balance review (HIGH confidence only)</p></div></div><div class="panel-body">${rankWatchlistSection(watch)}</div></section><section class="panel"><div class="panel-header"><div><h2><span class="panel-icon" aria-hidden="true">⬡</span>Rank authority</h2><p>Engine-derived canonical rank definitions</p></div></div><div class="panel-body">${rankAuthoritySection()}</div></section></div>${rankSwapMatrixSection()}</div>`;

  document.querySelectorAll('[data-rank]').forEach(button => button.onclick = () => {
    let rank = button.dataset.rank;
    // Canonical authority ids may not exist in the per-suit-expanded ladder
    // (e.g. '10' → '10:club'); resolve to the strongest matching entry.
    if (!ranks[rank]) rank = ladder.find(e => e.rank.startsWith(`${rank}:`))?.rank ?? rank;
    state.selectedRank = rank;
    state.anatomyTab = 'overall';
    rerender();
  });
  const profileFilter = document.querySelector('#variant-profile-filter');
  if (profileFilter) profileFilter.onchange = () => { state.variantProfileFilter = profileFilter.value; rerender(); };
  const originFilter = document.querySelector('#origin-filter');
  if (originFilter) originFilter.onchange = () => { state.originFilter = originFilter.value; rerender(); };
  document.querySelectorAll('[data-anatomy-tab]').forEach(button => button.onclick = () => { state.anatomyTab = button.dataset.anatomyTab; rerender(); });
  // Phase 3A: Rank → Mechanics cross-workspace navigation
  const viewMechanicsBtn = document.querySelector('#rank-view-mechanics');
  if (viewMechanicsBtn) viewMechanicsBtn.onclick = () => {
    state.mechanicsRankFilter = selectedRank;
    state.selectedMechanic = null;
    location.hash = '#/mechanics';
  };
  bindSwapMatrixHighlight();
}

// ── Summary strip ──────────────────────────────────────────────
function rankSummaryStrip(ladder, watch) {
  if (!ladder.length) return '';
  const top = ladder[0];
  const mid = ladder[Math.floor(ladder.length / 2)];
  const spread = ladder.length > 1 ? top.rpi - ladder[ladder.length - 1].rpi : 0;
  const highConf = ladder.filter(e => e.confidence === 'HIGH').length;
  const flagCount = ['overpowered', 'underpowered', 'dominant', 'negligible']
    .reduce((sum, k) => sum + (watch[k]?.length ?? 0), 0);
  // Descriptive RPI order is not a balance conclusion. When qualification
  // metadata is present, the lead tile names the strongest balance-qualified
  // entry and states plainly when the descriptive leader is disqualified.
  const hasQualification = ladder.some(e => e.balanceQualified !== undefined);
  const qualifiedTop = hasQualification ? ladder.find(e => e.balanceQualified) : top;
  const integrityFailures = ladder.filter(e => e.integrityStatus === 'FAIL');
  const lead = qualifiedTop
    ? `<small>${hasQualification ? 'Strongest balance-qualified' : 'Strongest rank (descriptive)'}</small><div class="rank-stat-leadline"><span class="rank-glyph rank-tile ${rankFamily(qualifiedTop.rank)}">${esc(displayRankGlyph(qualifiedTop.rank))}</span><b>${(qualifiedTop.rpi * 100).toFixed(1)}</b></div><span class="rank-stat-sub">RPI${hasQualification && qualifiedTop !== top ? ` · descriptive leader ${esc(displayRankGlyph(top.rank))} not balance-qualified` : ''}</span>`
    : `<small>Strongest balance-qualified</small><b>none</b><span class="rank-stat-sub">descriptive leader ${esc(displayRankGlyph(top.rank))} (${(top.rpi * 100).toFixed(1)}) is not balance-qualified</span>`;
  return `<div class="rank-summary">
    <div class="rank-stat rank-stat-lead" data-testid="rank-summary-lead" title="Balance-qualified = integrity PASS (no selections without opportunities, child variants included) + HIGH opportunity-frequency confidence + all mandatory axes observed. Descriptive RPI ordering never implies balance.">${lead}</div>
    <div class="rank-stat"><small>Median RPI</small><b>${(mid.rpi * 100).toFixed(1)}</b><span class="rank-stat-sub">cohort midpoint (descriptive)</span></div>
    <div class="rank-stat"><small>Power spread</small><b>${(spread * 100).toFixed(1)}</b><span class="rank-stat-sub">top − bottom RPI</span></div>
    <div class="rank-stat" title="Frequency confidence counts recorded opportunities only. HIGH frequency confidence does not imply balance-inference confidence."><small>High frequency confidence</small><b>${highConf}<i>/${ladder.length}</i></b><span class="rank-stat-sub">opportunity count ≥ 200</span></div>
    <div class="rank-stat ${flagCount || integrityFailures.length ? 'rank-stat-alert' : ''}"><small>Balance flags</small><b>${flagCount}</b><span class="rank-stat-sub">${integrityFailures.length ? `${integrityFailures.length} entr${integrityFailures.length === 1 ? 'y' : 'ies'} disqualified by integrity failure` : flagCount ? 'active watchlist entries' : 'watchlist clear'}</span></div>
  </div>`;
}

// ── Ladder row ─────────────────────────────────────────────────
function rankLadderRow(entry, index, selectedRank) {
  const glyph = displayRankGlyph(entry.rank);
  const rpct = (entry.rpi * 100).toFixed(1);
  const conf = entry.confidence ?? 'INSUFFICIENT';
  const confClass = `confidence-${conf.toLowerCase()}`;
  const isSelected = entry.rank === selectedRank;
  const podium = index < 3 ? ` podium-${index + 1}` : '';
  const qualText = entry.integrityStatus === 'FAIL' ? ' · INTEGRITY FAILURE — not balance-qualified' : entry.balanceQualified === false ? ' · descriptive only (not balance-qualified)' : '';
  return `<li><button class="rank-row ${isSelected ? 'selected' : ''} ${confClass}${entry.integrityStatus === 'FAIL' ? ' rank-row-integrity-fail' : ''}" data-rank="${esc(entry.rank)}" ${isSelected ? 'aria-current="true"' : ''} title="${esc(glyph)} — RPI ${rpct} · ${conf} frequency confidence${qualText}">
    <span class="rank-pos${podium}">${index + 1}</span>
    <span class="rank-glyph rank-tile ${rankFamily(entry.rank)}">${esc(glyph)}</span>
    <span class="rank-row-track"><span class="rank-bar-container"><span class="rank-bar-fill" style="width:${rpct}%"></span></span></span>
    <span class="rank-rpi">${rpct}</span>
    <span class="rank-conf-dot" title="${conf} frequency confidence" aria-hidden="true"></span>${entry.integrityStatus === 'FAIL' ? '<span class="rank-integrity-flag" title="Selections without recorded opportunities — excluded from balance conclusions">!</span>' : ''}
  </button></li>`;
}

// ── Detail header ──────────────────────────────────────────────
function rankIdentityHeader(selectedRank, position, total, profile) {
  const glyph = displayRankGlyph(selectedRank);
  const dp = Number.isFinite(profile.decisionPower) ? profile.decisionPower.toFixed(3) : '—';
  const posText = position > 0 ? `Ladder position #${position} of ${total}` : 'Not on the power ladder';
  return `<div class="rank-identity">
    <span class="rank-glyph rank-tile rank-tile-lg ${rankFamily(selectedRank)}">${esc(glyph)}</span>
    <div class="rank-identity-copy"><h3>Rank ${esc(glyph)}</h3><p>${posText} · decision power ${dp}</p></div>
    <button id="rank-view-mechanics" class="ix-cross-link" data-testid="rank-view-mechanics" title="View mechanics for this rank" aria-label="View mechanics for this rank in the Mechanics Atlas">⌁ View mechanics for this rank</button>
  </div>`;
}

// ── Radar ──────────────────────────────────────────────────────
function rankPowerRadar(profile, axes, observedRankValueAxis, observedRankValueRaw, family = 'family-number') {
  // Build the 6-axis radar for the selected rank. Axes that are not observable
  // (status === 'not-observable' / 'insufficient') are clamped to 0 so the
  // polygon still renders but visually flags the missing dimension.
  const axisStatus = profile.axisStatus ?? {};
  const safe = (val, key) => {
    const st = axisStatus[key];
    if (st === 'not-observable' || st === 'insufficient') return 0;
    return Number.isFinite(Number(val)) ? Number(val) : 0;
  };
  const radarAxes = [
    { label: 'Selection', value: safe(axes.selectionPower, 'selectionPower'), rawText: profile.raw?.selectionRate != null ? `${(profile.raw.selectionRate * 100).toFixed(1)}%` : null },
    { label: 'Victory', value: safe(axes.victoryPower, 'victoryPower'), rawText: profile.raw?.victoryRate != null ? `${(profile.raw.victoryRate * 100).toFixed(1)}%` : null },
    { label: 'Score', value: safe(axes.scorePower, 'scorePower'), rawText: profile.raw?.scorePerSelection != null ? profile.raw.scorePerSelection.toFixed(2) : null },
    { label: 'Board', value: safe(axes.boardPower, 'boardPower'), rawText: profile.raw?.boardPerSelection != null ? profile.raw.boardPerSelection.toFixed(4) : null },
    { label: 'Response', value: safe(axes.responsePower, 'responsePower'), rawText: profile.raw?.responseRate != null ? `${(profile.raw.responseRate * 100).toFixed(1)}%` : null },
    { label: 'Observed Rank Value', value: safe(observedRankValueAxis, 'observedRankValue'), rawText: observedRankValueRaw != null && Number.isFinite(observedRankValueRaw) ? observedRankValueRaw.toFixed(3) : null },
  ];
  const svg = radarChart({
    axes: radarAxes,
    max: 1,
    size: 280,
    color: FAMILY_ACCENT[family] ?? '#4fd387',
    title: `Rank power radar for ${displayRankGlyph(profile.rank ?? '')}`,
    ariaLabel: `Six-axis rank power radar chart for the selected rank`,
  });
  return `<div class="ix-chart-container rank-radar" data-testid="rank-power-radar"><div class="ix-chart-header"><h4>Power profile radar</h4></div>${svg}</div>`;
}

function rankAxisBar(label, normalized, rawText, status = 'observed') {
  if (!Number.isFinite(normalized) || status === 'not-observable' || status === 'insufficient') {
    const reason = status === 'insufficient' ? 'partial causal coverage' : 'not observable';
    return `<div class="rank-axis-bar axis-unavailable"><span class="axis-label">${label}</span><div class="axis-track"></div><span class="axis-value">— <small>${reason}</small></span></div>`;
  }
  const clamped = Math.min(Math.max(normalized, 0), 1);
  const rpct = (clamped * 100).toFixed(1);
  const statusText = status === 'degenerate' ? 'no cohort separation' : rawText;
  return `<div class="rank-axis-bar"><span class="axis-label">${label}</span><div class="axis-track"><div class="axis-fill" style="width:${rpct}%"></div></div><span class="axis-value">${rpct}${statusText ? ` <small>${statusText}</small>` : ''}</span></div>`;
}

// ── Balance watchlist ──────────────────────────────────────────
function rankWatchlistSection(watch) {
  const sections = [
    ['Overpowered', watch.overpowered, 'danger', '▲'],
    ['Underpowered', watch.underpowered, 'warning', '▽'],
    ['Dominant selection', watch.dominant, 'warning', '◆'],
    ['Negligible selection', watch.negligible, 'info', '○'],
  ];
  const hasAny = sections.some(([, items]) => items && items.length > 0);
  if (!hasAny) return watch.suppressed
    ? `<div class="notice warning"><strong>Balance flags suppressed</strong>${esc(watch.suppressionReason ?? 'Mandatory causal axes are not fully observed.')}</div>`
    : '<div class="empty-state"><strong>No balance flags</strong><p>No ranks triggered watchlist thresholds with HIGH confidence.</p></div>';
  return `<div class="watch-groups">${sections.map(([label, items, cls, icon]) => items && items.length
    ? `<div class="watch-group watch-${cls}"><div class="watch-group-head"><span class="watch-icon" aria-hidden="true">${icon}</span><strong>${esc(label)}</strong><span class="watch-count">${items.length}</span></div><ul class="watch-flags">${items.map(item => `<li><button data-rank="${esc(item.rank)}" class="rank-flag-button" title="Inspect ${esc(displayRankGlyph(item.rank))}"><span class="rank-glyph rank-tile rank-tile-sm ${rankFamily(item.rank)}">${esc(displayRankGlyph(item.rank))}</span></button><span class="watch-reason">${esc(item.reason ?? '')}</span></li>`).join('')}</ul></div>`
    : '').join('')}</div>`;
}

// ── Rank authority ─────────────────────────────────────────────
function rankAuthoritySection() {
  const authority = state.rankAuthority;
  if (!authority) return '<div class="empty-state"><strong>Rank authority not loaded</strong>The canonical rank authority artifact is not available.</div>';
  return `<div class="rank-authority-grid">${authority.ranks.map(r => {
    const notes = (r.notes ?? []).join(' ');
    return `<button class="rank-authority-card" data-rank="${esc(r.rankId)}" title="${esc(notes || `${r.displayName ?? r.rankId} — ${r.modes.length} modes`)}"><span class="rank-glyph rank-tile ${rankFamily(r.rankId)}">${esc(displayRankGlyph(r.displayName ?? r.rankId))}</span><b>PR ${r.prPoints}</b><small>Scuttle ${r.scuttleOrder} · ${r.modes.length} modes</small></button>`;
  }).join('')}</div><div class="footer-note">Authority hash: ${short(authority.authorityHash)} · Engine ${esc(authority.engineVersion)} · Rules ${esc(authority.rulesVersion)}</div>`;
}

// ── Swap matrix ────────────────────────────────────────────────
function rankSwapMatrixSection() {
  const matrix = state.swapMatrix;
  if (!matrix || Object.keys(matrix).length === 0) return '<div class="panel ranks-matrix-panel"><div class="panel-header"><div><h2><span class="panel-icon" aria-hidden="true">▦</span>Rank swap matrix</h2><p>Observed Rank Value differentials between rank pairs</p></div></div><div class="panel-body"><div class="empty-state"><strong>Swap matrix not available</strong>Run an experiment with rank attribution to populate the observational ORV matrix.</div></div></div>';
  // Expand canonical 15-rank order to include per-suit 10 entries when present.
  const baseOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'RJ', 'BJ'];
  const rankOrder = baseOrder.flatMap(r => r === '10' ? ['10:club', '10:diamond', '10:heart', '10:spade'] : [r]).filter(r => matrix[r] !== undefined || Object.values(matrix).some(row => row[r] !== undefined));
  const n = rankOrder.length;
  const maxAbs = Math.max(...rankOrder.flatMap(r => rankOrder.map(c => { const cell = matrix[r]?.[c]; return cell ? Math.abs(cell.decisionValue ?? 0) : 0; })), 0.001);
  function cellColor(dv) { const intensity = Math.min(Math.abs(dv) / maxAbs, 1); const alpha = 0.15 + intensity * 0.7; if (dv >= 0) return `rgba(79,211,135,${alpha})`; return `rgba(240,93,120,${alpha})`; }
  const headerCells = rankOrder.map(r => `<th class="swap-header" title="Alternative rank ${displayRankGlyph(r)}"><span class="swap-header-label ${rankFamily(r)}">${displayRankGlyph(r)}</span></th>`).join('');
  const rows = rankOrder.map(selectedRank => {
    const cells = rankOrder.map(altRank => {
      if (selectedRank === altRank) return '<td class="swap-cell swap-diagonal" title="Self-swap (no data)"></td>';
      const cell = matrix[selectedRank]?.[altRank];
      if (!cell) return '<td class="swap-cell swap-empty" title="No data"></td>';
      const dv = cell.decisionValue ?? 0;
      const conf = cell.confidence ?? 'INSUFFICIENT';
      return `<td class="swap-cell swap-conf-${conf.toLowerCase()}" style="background:${cellColor(dv)}" title="Selected ${displayRankGlyph(selectedRank)} vs Alternative ${displayRankGlyph(altRank)}&#10;Decision value: ${dv.toFixed(4)}&#10;Win rate delta: ${(cell.winRateDelta ?? 0).toFixed(4)}&#10;Score margin delta: ${(cell.scoreMarginDelta ?? 0).toFixed(4)}&#10;Observations: ${cell.observationalSampleCount ?? cell.sampleSize ?? cell.rolloutCount ?? 0}&#10;Confidence: ${conf}" data-swap-from="${selectedRank}" data-swap-to="${altRank}">${dv >= 0 ? '+' : ''}${dv.toFixed(3)}</td>`;
    }).join('');
    return `<tr><th class="swap-row-header" title="Selected rank ${displayRankGlyph(selectedRank)}"><span class="swap-header-label ${rankFamily(selectedRank)}">${displayRankGlyph(selectedRank)}</span></th>${cells}</tr>`;
  }).join('');
  return `<div class="panel ranks-matrix-panel"><div class="panel-header"><div><h2><span class="panel-icon" aria-hidden="true">▦</span>Rank swap matrix</h2><p>Observed Rank Value differentials — green = selected rank associated with stronger outcomes, red = alternative stronger</p></div><span class="panel-chip">${n} × ${n}</span></div><div class="panel-body"><div class="swap-matrix-wrapper"><table class="swap-matrix"><thead><tr><th class="swap-corner"></th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div><div class="swap-legend"><span class="swap-legend-scale"><span class="swap-scale-label">Alternative stronger</span><span class="swap-gradient-bar" aria-hidden="true"></span><span class="swap-scale-label">Selected stronger</span></span><span class="swap-legend-item"><span class="swap-legend-swatch swap-diagonal-swatch"></span>Self-swap</span><span class="swap-legend-item"><span class="swap-legend-swatch swap-empty-swatch"></span>No data</span></div><div class="footer-note">Observational cohort proxy from aggregate rank metrics. Positive values indicate association, not causal superiority. Hover for details.</div></div></div>`;
}

// Highlight the row/column headers of the hovered swap cell.
function bindSwapMatrixHighlight() {
  const matrixEl = document.querySelector('.swap-matrix');
  if (!matrixEl) return;
  const headers = matrixEl.querySelectorAll('.swap-header');
  const clear = () => matrixEl.querySelectorAll('.swap-hl').forEach(el => el.classList.remove('swap-hl'));
  matrixEl.addEventListener('mouseover', e => {
    clear();
    const cell = e.target.closest('td.swap-cell');
    if (!cell || !cell.dataset.swapFrom) return;
    cell.closest('tr')?.querySelector('.swap-row-header')?.classList.add('swap-hl');
    headers[cell.cellIndex - 1]?.classList.add('swap-hl');
  });
  matrixEl.addEventListener('mouseleave', clear);
}
