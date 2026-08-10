// ═══════════════════════════════════════════════════════════════
// workspaces/ranks.js — /ranks workspace: rank power observatory
// ═══════════════════════════════════════════════════════════════

import { state,   app,   esc,   short,   definitionList } from '../state.js';

function displayRankGlyph(rank) {
  if (rank.startsWith('10:')) {
    const suit = { '10:club': '♣', '10:diamond': '♦', '10:heart': '♥', '10:spade': '♠' }[rank];
    return suit ? `10${suit}` : rank;
  }
  return rank;
}

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
    .map(([rank, profile]) => ({ rank, rpi: profile.rpi ?? 0, confidence: profile.confidence ?? 'INSUFFICIENT' }))
    .sort((a, b) => b.rpi - a.rpi);
  const selectedRank = state.selectedRank ?? ladder[0]?.rank ?? 'A';
  const profile = ranks[selectedRank] ?? {};
  const axes = profile.axes ?? {};
  // Current server-side schema uses ORV/observedRankValue. Keep legacy CDV
  // aliases only as a compatibility fallback for older browser artifacts.
  const observedRankValueAxis = axes.observedRankValue ?? axes.decisionValue ?? null;
  const observedRankValueRaw = profile.raw?.observedRankValue ?? profile.raw?.decisionValue ?? null;
  const orv = profile.orv ?? profile.cdv ?? null;
  const confidenceClass = `confidence-${(profile.confidence ?? 'INSUFFICIENT').toLowerCase()}`;
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

  app.innerHTML = `<div class="grid two"><section class="panel"><div class="panel-header"><div><h2>Rank power ladder</h2><p>Cohort-relative Observed RPI across ${ladder.length} rank ladder entries</p></div><span>${ladder.length} entries</span></div><div class="panel-body"><div class="rank-ladder">${ladder.map(entry => {
    const glyph = displayRankGlyph(entry.rank);
    const rpct = (entry.rpi * 100).toFixed(1);
    const isSelected = entry.rank === selectedRank;
    const confClass = `confidence-${(entry.confidence ?? 'INSUFFICIENT').toLowerCase()}`;
    return `<button class="rank-row ${isSelected ? 'selected' : ''} ${confClass}" data-rank="${entry.rank}"><span class="rank-glyph">${glyph}</span><div class="rank-bar-container"><div class="rank-bar-fill" style="width:${rpct}%"></div></div><span class="rank-rpi">${rpct}</span></button>`;
  }).join('')}</div></div></section><section class="panel"><div class="panel-header"><div><h2>Selected rank: ${displayRankGlyph(selectedRank)}</h2><p>Six-axis power profile and decision value</p></div><span class="${confidenceClass}">${profile.confidence ?? 'INSUFFICIENT'}</span></div><div class="panel-body"><div class="rank-profile">${rankAxisBar('Selection', axes.selectionPower, profile.raw?.selectionRate != null ? `${(profile.raw.selectionRate * 100).toFixed(1)}% participation rate` : null, profile.axisStatus?.selectionPower)}${rankAxisBar('Victory', axes.victoryPower, profile.raw?.victoryRate != null ? `${(profile.raw.victoryRate * 100).toFixed(1)}% victory rate` : null, profile.axisStatus?.victoryPower)}${rankAxisBar('Score', axes.scorePower, profile.raw?.scorePerSelection != null ? `${profile.raw.scorePerSelection.toFixed(2)} pts/observed action` : null, profile.axisStatus?.scorePower)}${rankAxisBar('Board', axes.boardPower, profile.raw?.boardPerSelection != null ? `${profile.raw.boardPerSelection.toFixed(4)} board/observed action` : null, profile.axisStatus?.boardPower)}${rankAxisBar('Response', axes.responsePower, profile.raw?.responseRate != null ? `${(profile.raw.responseRate * 100).toFixed(1)}% response rate` : null, profile.axisStatus?.responsePower)}${rankAxisBar('Observed Rank Value', observedRankValueAxis, observedRankValueRaw != null && Number.isFinite(observedRankValueRaw) ? observedRankValueRaw.toFixed(3) : null, profile.axisStatus?.observedRankValue)}</div><div class="rank-metrics-grid">${definitionList([['RPI', profile.rpi?.toFixed(4)], ['Decision Power', profile.decisionPower?.toFixed(4)], ['Rank Participations', profile.metrics?.selectionCount], ['Opportunities', profile.metrics?.opportunityCount], ['Victories', profile.metrics?.victoryContributionCount], ['Defeats', profile.metrics?.defeatExposureCount], ['Secured Points', profile.metrics?.securedPointContribution?.toFixed(1)], ['Board Presence', profile.metrics?.boardPresenceContribution?.toFixed(1)], ['Causal Delta Coverage', profile.metrics?.causalCoverage != null ? `${(profile.metrics.causalCoverage * 100).toFixed(1)}%` : '—']])}</div>${orv ? `<div class="rank-cdv"><h3>Observed Rank Value</h3>${definitionList([['Average ORV', orv.averageDecisionValue?.toFixed(4)], ['Rank comparisons', orv.swapCount], ['Observations', orv.sampleSize ?? orv.observationalSampleCount ?? orv.totalRollouts], ['ORV Confidence', orv.confidence]])}<p class="footer-note">Descriptive cohort association; not a paired counterfactual.</p></div>` : '<div class="notice"><strong>No observed rank value</strong>There is not enough cohort evidence to estimate ORV for this rank.</div>'}</div></section></div>${anatomyHtml}<div class="grid two" style="margin-top:16px"><section class="panel"><div class="panel-header"><div><h2>Balance watchlist</h2><p>Ranks flagged for potential balance review (HIGH confidence only)</p></div></div><div class="panel-body">${rankWatchlistSection(watch)}</div></section><section class="panel"><div class="panel-header"><div><h2>Rank authority</h2><p>Engine-derived canonical rank definitions</p></div></div><div class="panel-body">${rankAuthoritySection()}</div></section></div>${rankSwapMatrixSection()}`;

  document.querySelectorAll('[data-rank]').forEach(button => button.onclick = () => { state.selectedRank = button.dataset.rank; state.anatomyTab = 'overall'; import('../app.js').then(m => m.render()); });
  const profileFilter = document.querySelector('#variant-profile-filter');
  if (profileFilter) profileFilter.onchange = () => { state.variantProfileFilter = profileFilter.value; import('../app.js').then(m => m.render()); };
  const originFilter = document.querySelector('#origin-filter');
  if (originFilter) originFilter.onchange = () => { state.originFilter = originFilter.value; import('../app.js').then(m => m.render()); };
  document.querySelectorAll('[data-anatomy-tab]').forEach(button => button.onclick = () => { state.anatomyTab = button.dataset.anatomyTab; import('../app.js').then(m => m.render()); });
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

function rankWatchlistSection(watch) {
  const sections = [['Overpowered', watch.overpowered, 'danger'], ['Underpowered', watch.underpowered, 'warning'], ['Dominant selection', watch.dominant, 'warning'], ['Negligible selection', watch.negligible, 'info']];
  const hasAny = sections.some(([, items]) => items && items.length > 0);
  if (!hasAny) return watch.suppressed ? `<div class="notice warning"><strong>Balance flags suppressed</strong>${esc(watch.suppressionReason ?? 'Mandatory causal axes are not fully observed.')}</div>` : '<div class="empty-state"><strong>No balance flags</strong>No ranks triggered watchlist thresholds with HIGH confidence.</div>';
  return sections.map(([label, items, cls]) => items && items.length ? `<div class="notice ${cls}"><strong>${esc(label)}</strong><ul>${items.map(item => `<li><button data-rank="${esc(item.rank)}" class="rank-flag-button">${esc(displayRankGlyph(item.rank))}</button> — ${esc(item.reason ?? '')}</li>`).join('')}</ul></div>` : '').join('');
}

function rankAuthoritySection() {
  const authority = state.rankAuthority;
  if (!authority) return '<div class="empty-state"><strong>Rank authority not loaded</strong>The canonical rank authority artifact is not available.</div>';
  return `<div class="rank-authority-grid">${authority.ranks.map(r => `<div class="rank-authority-card" data-rank="${esc(r.rankId)}"><span class="rank-glyph">${esc(r.rankId)}</span><div><b>PR ${r.prPoints}</b> · Scuttle ${r.scuttleOrder}</div><small>${r.modes.length} modes</small></div>`).join('')}</div><div class="footer-note">Authority hash: ${short(authority.authorityHash)} · Engine ${esc(authority.engineVersion)} · Rules ${esc(authority.rulesVersion)}</div>`;
}

function rankSwapMatrixSection() {
  const matrix = state.swapMatrix;
  if (!matrix || Object.keys(matrix).length === 0) return '<div class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Rank swap matrix</h2><p>Observed Rank Value differentials between rank pairs</p></div></div><div class="panel-body"><div class="empty-state"><strong>Swap matrix not available</strong>Run an experiment with rank attribution to populate the observational ORV matrix.</div></div></div>';
  // Expand canonical 15-rank order to include per-suit 10 entries when present.
  const baseOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'RJ', 'BJ'];
  const rankOrder = baseOrder.flatMap(r => r === '10' ? ['10:club', '10:diamond', '10:heart', '10:spade'] : [r]).filter(r => matrix[r] !== undefined || Object.values(matrix).some(row => row[r] !== undefined));
  const n = rankOrder.length;
  const maxAbs = Math.max(...rankOrder.flatMap(r => rankOrder.map(c => { const cell = matrix[r]?.[c]; return cell ? Math.abs(cell.decisionValue ?? 0) : 0; })), 0.001);
  function cellColor(dv) { const intensity = Math.min(Math.abs(dv) / maxAbs, 1); const alpha = 0.15 + intensity * 0.7; if (dv >= 0) return `rgba(79,211,135,${alpha})`; return `rgba(240,93,120,${alpha})`; }
  const headerCells = rankOrder.map(r => `<th class="swap-header" title="Alternative rank ${displayRankGlyph(r)}">${displayRankGlyph(r)}</th>`).join('');
  const rows = rankOrder.map(selectedRank => {
    const cells = rankOrder.map(altRank => {
      if (selectedRank === altRank) return '<td class="swap-cell swap-diagonal" title="Self-swap (no data)"></td>';
      const cell = matrix[selectedRank]?.[altRank];
      if (!cell) return '<td class="swap-cell swap-empty" title="No data"></td>';
      const dv = cell.decisionValue ?? 0;
      const conf = cell.confidence ?? 'INSUFFICIENT';
      return `<td class="swap-cell swap-conf-${conf.toLowerCase()}" style="background:${cellColor(dv)}" title="Selected ${displayRankGlyph(selectedRank)} vs Alternative ${displayRankGlyph(altRank)}&#10;Decision value: ${dv.toFixed(4)}&#10;Win rate delta: ${(cell.winRateDelta ?? 0).toFixed(4)}&#10;Score margin delta: ${(cell.scoreMarginDelta ?? 0).toFixed(4)}&#10;Observations: ${cell.observationalSampleCount ?? cell.sampleSize ?? cell.rolloutCount ?? 0}&#10;Confidence: ${conf}" data-swap-from="${selectedRank}" data-swap-to="${altRank}">${dv >= 0 ? '+' : ''}${dv.toFixed(3)}</td>`;
    }).join('');
    return `<tr><th class="swap-row-header" title="Selected rank ${displayRankGlyph(selectedRank)}">${displayRankGlyph(selectedRank)}</th>${cells}</tr>`;
  }).join('');
  return `<div class="panel" style="margin-top:16px"><div class="panel-header"><div><h2>Rank swap matrix</h2><p>Observed Rank Value differentials — green = selected rank associated with stronger outcomes, red = alternative stronger</p></div><span>${n} × ${n}</span></div><div class="panel-body"><div class="swap-matrix-wrapper"><table class="swap-matrix"><thead><tr><th class="swap-corner"></th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div><div class="swap-legend"><span class="swap-legend-item"><span class="swap-legend-swatch" style="background:rgba(79,211,135,0.7)"></span>Selected stronger</span><span class="swap-legend-item"><span class="swap-legend-swatch" style="background:rgba(240,93,120,0.7)"></span>Alternative stronger</span><span class="swap-legend-item"><span class="swap-legend-swatch swap-diagonal-swatch"></span>Self-swap</span><span class="swap-legend-item"><span class="swap-legend-swatch swap-empty-swatch"></span>No data</span></div><div class="footer-note">Observational cohort proxy from aggregate rank metrics. Positive values indicate association, not causal superiority. Hover for details.</div></div></div>`;
}
