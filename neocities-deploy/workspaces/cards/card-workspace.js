// ═══════════════════════════════════════════════════════════════
// workspaces/cards/card-workspace.js — Card Observatory renderer.
//
// /cards is a normal Simulation Lab workspace (sibling of Ranks and
// Mechanics): it renders into #app inside the shell, reads shared
// dataset context, and re-renders through the rerender bus.
//
// Layout: toolbar + deck-matrix atlas on the left, a tabbed Card
// Dossier (Identity / Authority / Evidence / Connections) on the
// right. All card/evidence normalization lives in card-model.js —
// this file owns presentation and event wiring only.
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, fmt, pct } from '../../state.js?v=8951e2c35a42';
import { rerender } from '../../rerender.js?v=8951e2c35a42';
import { labDatasetBanner } from '../observatory.js?v=8951e2c35a42';
import { obsContextStrip, metricStrip, emptyEvidenceState, dossierSection } from '../observatory-ui.js?v=8951e2c35a42';
import { renderCardFace } from '../../card-face-renderer.js?v=8951e2c35a42';
import { renderAdvancedCardRulesView } from '../../play/advanced-card-rules/advanced-card-rules-view.mjs?v=8951e2c35a42';
import { radarChart } from '../../chart-toolkit.js?v=8951e2c35a42';
import { CARD_FACE_REGISTRY_META } from '../../card-face-data.js?v=8951e2c35a42';
import * as M from './card-model.js?v=8951e2c35a42';

// Lazy Advanced Card Rules modal — same pattern as app.js card clicks.
let _acrController = null;
const getAcrController = () => (_acrController ??= import('../../play/advanced-card-rules/advanced-card-rules-controller.mjs?v=8951e2c35a42'));

const TIMING_GLYPHS = { instant: '⏱', interrupt: '✋', effect: '▶', quick: '⚡', passive: '∞', super: '⭐', scoring: '◉', anchor: '⚓' };

const STATUS_TEXT = {
  available: 'evidence available',
  insufficient: 'insufficient evidence',
  unavailable: 'no recorded evidence',
  'integrity-failure': 'legacy telemetry — no legal-opportunity denominator',
  'no-dataset': 'no simulation dataset',
};

// ── Deep-link state ──────────────────────────────────────────────

/** Read the ?card= deep-link once per render and adopt it into state. */
function adoptDeepLink() {
  const q = location.hash.split('?')[1];
  if (!q) return;
  const params = new URLSearchParams(q);
  const card = params.get('card');
  if (card) {
    const found = M.canonicalCard(card);
    if (found) state.selectedCard = found.identity;
  }
  const tab = params.get('tab');
  if (tab && ['identity', 'authority', 'evidence', 'connections'].includes(tab)) state.cardDossierTab = tab;
}

/** Write the selected card back to the URL without triggering a render. */
function syncDeepLink() {
  const base = '#/cards';
  const id = state.selectedCard;
  const url = id ? `${base}?card=${encodeURIComponent(id)}` : base;
  try { history.replaceState(null, '', url); } catch { /* file:// contexts */ }
}

function filtersFromState() {
  return {
    search: state.cardSearch, suit: state.cardSuitFilter, rank: state.cardRankFilter,
    timing: state.cardTimingFilter, evidence: state.cardEvidenceFilter,
    confidence: state.cardConfidenceFilter,
  };
}

function activeFilterCount() {
  const f = filtersFromState();
  return (f.search ? 1 : 0) + ['suit', 'rank', 'timing', 'evidence', 'confidence'].filter(k => f[k] && f[k] !== 'all').length;
}

// ── Summary strip ────────────────────────────────────────────────

function summaryStrip(models, va) {
  const s = M.atlasSummary(models, va);
  const cards = [
    { label: 'Canonical identities', value: s.total, sub: `Rules v${s.rulesVersion}`, tone: 'lead' },
  ];
  if (!s.hasDataset) {
    cards.push({ label: 'Simulation dataset', value: '—', sub: 'canonical atlas + rules remain available', tone: 'alert' });
  } else {
    cards.push(
      { label: 'Usable evidence', value: s.usable, sub: 'of 54 mapped cards', tone: s.usable ? 'positive' : 'alert' },
      { label: 'Insufficient / missing', value: s.insufficient + s.missing, sub: `${s.integrityFailures} integrity-flagged`, tone: s.insufficient + s.missing ? 'alert' : null },
      { label: 'Most-selected variant', value: s.mostSelected ? fmt(s.mostSelected.selections) : '—', sub: s.mostSelected?.label ?? 'no selections recorded' },
      { label: 'Strongest win rate', value: s.strongest ? pct(s.strongest.win) : '—', sub: s.strongest?.label ?? 'no qualified outcome record', tone: s.strongest ? 'positive' : null },
    );
  }
  return metricStrip(cards);
}

// ── Toolbar ──────────────────────────────────────────────────────

function toolbarHTML(visibleCount, totalCount) {
  const sel = (id, label, val, options) =>
    `<select id="${id}" aria-label="${esc(label)}">${options.map(o => `<option value="${esc(o.value)}"${o.value === val ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const suitOpts = [
    { value: 'all', label: 'All suits' },
    ...M.SUIT_ORDER.map(s => ({ value: s, label: s })),
    { value: 'joker', label: 'Jokers' },
  ];
  const rankOpts = [
    { value: 'all', label: 'All ranks' },
    ...M.DECK_RANKS.map(r => ({ value: r, label: r })),
    { value: 'joker', label: 'Jokers' },
  ];
  const n = activeFilterCount();
  return `<div class="ix-filter-toolbar card-toolbar" role="search" aria-label="Card atlas filters">
    <label class="card-search-field" for="card-search">Search <input type="search" id="card-search" value="${esc(state.cardSearch ?? '')}" placeholder="identity, name, mechanic…" autocomplete="off" spellcheck="false"></label>
    ${sel('card-suit-filter', 'Suit filter', state.cardSuitFilter ?? 'all', suitOpts)}
    ${sel('card-rank-filter', 'Rank filter', state.cardRankFilter ?? 'all', rankOpts)}
    ${sel('card-timing-filter', 'Timing class filter', state.cardTimingFilter ?? 'all', M.TIMING_FILTERS)}
    ${sel('card-evidence-filter', 'Evidence scope filter', state.cardEvidenceFilter ?? 'all', M.EVIDENCE_FILTERS)}
    ${sel('card-confidence-filter', 'Confidence filter', state.cardConfidenceFilter ?? 'all', M.CONFIDENCE_FILTERS)}
    ${sel('card-sort', 'Sort order', state.cardSort ?? 'deck', M.SORT_MODES)}
    <div class="obs-seg" role="group" aria-label="Atlas view mode">
      <button type="button" class="obs-seg-btn${state.cardView !== 'list' ? ' active' : ''}" data-card-view="atlas" aria-pressed="${state.cardView !== 'list'}">Atlas</button>
      <button type="button" class="obs-seg-btn${state.cardView === 'list' ? ' active' : ''}" data-card-view="list" aria-pressed="${state.cardView === 'list'}">List</button>
    </div>
    <button type="button" id="card-clear-filters" class="ghost-button"${n ? '' : ' disabled'}>Clear filters${n ? ` (${n})` : ''}</button>
    <span class="card-result-count" role="status">${visibleCount} of ${totalCount}</span>
  </div>`;
}

// ── Atlas matrix ─────────────────────────────────────────────────

function scopeChip(m) {
  const scope = m.entity?.scope;
  if (m.evidence?.status === M.EVIDENCE_STATUS.NO_DATASET) {
    return '<span class="cell-scope scope-none" title="No simulation dataset loaded">—</span>';
  }
  if (m.evidence?.status === M.EVIDENCE_STATUS.UNAVAILABLE) {
    return '<span class="cell-scope scope-none" title="No recorded evidence for this entity">Ø</span>';
  }
  const chip = scope === M.EVIDENCE_SCOPE.SHARED_NORMAL ? ['SH', 'scope-shared', 'Shared normal evidence — ♣/♦/♥']
    : scope === M.EVIDENCE_SCOPE.RANK_LEVEL ? ['RK', 'scope-rank', 'Rank-level evidence']
    : ['EX', 'scope-exact', m.entity?.scopeLabel ?? 'Exact evidence'];
  return `<span class="cell-scope ${chip[1]}" title="${esc(chip[2])}">${chip[0]}</span>`;
}

function cardCellHTML(m, { selected, tabbable }) {
  const timings = m.timings.slice(0, 3)
    .map(t => `<i class="cell-timing" title="${esc(t)}">${TIMING_GLYPHS[t] ?? '·'}</i>`).join('');
  const statusText = STATUS_TEXT[m.evidence?.status] ?? '';
  const conf = m.evidence?.status === 'available' ? ` · confidence ${m.evidence.confidence}` : '';
  return `<div class="card-cell-wrap" role="gridcell" aria-selected="${selected}"><button type="button"
    class="card-cell tcg-suit-${m.suitId} is-${m.evidence?.status ?? 'unavailable'}${selected ? ' is-selected' : ''}"
    style="--card-accent:${esc(m.suitAccent)}" data-card="${esc(m.identity)}"
    tabindex="${tabbable ? '0' : '-1'}"
    aria-label="${esc(`${m.identity} — ${m.title}. ${m.entity?.scopeLabel ?? ''} — ${statusText}${conf}`)}">
    <span class="card-cell-art" style="background-image:linear-gradient(180deg,transparent 52%,rgba(4,6,10,.94) 96%),url('${esc(m.art.path)}');background-position:${esc(m.art.position)}" aria-hidden="true"></span>
    <span class="card-cell-id"><b>${esc(m.identity)}</b>${timings}</span>
    <span class="card-cell-name">${esc(m.title)}</span>
    <span class="card-cell-foot">${scopeChip(m)}<span class="cell-pr">${m.pr != null ? `${m.pr}pt` : ''}</span></span>
  </button></div>`;
}

function emptyCellHTML(rank, suit) {
  return `<div class="card-cell-wrap is-empty" role="gridcell" aria-disabled="true"><span class="card-cell-empty">${esc(`${rank}${suit ?? ''}`)}</span></div>`;
}

function atlasMatrixHTML(rows, filteredSet, selectedId) {
  // Roving tabindex: the selected card owns tabindex=0 when it is
  // visible; otherwise the first visible cell does.
  const firstId = firstVisibleIdentity(rows);
  const tabbableId = selectedId && filteredSet.has(selectedId) ? selectedId : firstId;
  const cell = (m) => cardCellHTML(m, { selected: m.identity === selectedId, tabbable: m.identity === tabbableId });
  const header = `<div class="card-atlas-row card-atlas-head" role="row"><span class="card-atlas-rank" role="columnheader" aria-label="Rank">Rank</span>${M.SUIT_ORDER.map(s => `<span class="card-atlas-suit" role="columnheader">${s}</span>`).join('')}</div>`;
  const body = rows.map(row => {
    if (row.joker) {
      const cells = [
        ...row.cells.map(c => c.model ? cell(c.model) : emptyCellHTML('', null)),
        emptyCellHTML('', null), emptyCellHTML('', null),
      ];
      return `<div class="card-atlas-row card-atlas-jokers" role="row"><span class="card-atlas-rank" role="rowheader">${esc(row.label)}</span>${cells.join('')}</div>`;
    }
    const cells = row.cells.map(c => c.model ? cell(c.model) : emptyCellHTML(row.rank, c.suit));
    return `<div class="card-atlas-row" role="row"><span class="card-atlas-rank" role="rowheader" title="${esc(row.label)}">${esc(row.rank)}</span>${cells.join('')}</div>`;
  }).join('');
  return `<div class="card-atlas" role="grid" aria-label="Card atlas — deck matrix. Arrow keys move between cards; Enter opens the dossier." data-testid="card-atlas">${header}${body}</div>`;
}

function firstVisibleIdentity(rows) {
  for (const row of rows) for (const c of row.cells) if (c.model) return c.model.identity;
  return null;
}

// ── List view ────────────────────────────────────────────────────

function listViewHTML(models, selectedId) {
  const rows = models.map(m => {
    const e = m.evidence;
    const met = e?.metrics;
    return `<tr class="clickable-row card-list-row${m.identity === selectedId ? ' is-selected' : ''}" data-card="${esc(m.identity)}" tabindex="0" aria-label="Open dossier for ${esc(m.identity)}">
      <td><b>${esc(m.identity)}</b> <small>${esc(m.title)}</small></td>
      <td>${esc(m.suitLabel)}</td><td>${m.pr ?? '—'}</td>
      <td>${m.timings.slice(0, 3).map(t => `<i class="cell-timing" title="${esc(t)}">${TIMING_GLYPHS[t] ?? '·'}</i>`).join('')}</td>
      <td>${esc(m.entity?.scopeLabel ?? '—')}</td>
      <td>${met ? fmt(met.variantOpportunityCount) : '—'}</td>
      <td>${met ? fmt(met.variantSelectionCount) : '—'}</td>
      <td>${Number.isFinite(met?.variantPlayRate) ? pct(met.variantPlayRate) : '—'}</td>
      <td>${e?.status === 'available' ? `<span class="badge badge-${e.confidence === 'HIGH' ? 'supported' : e.confidence === 'MEDIUM' ? 'info' : 'warning'}">${esc(e.confidence)}</span>` : `<span class="badge badge-muted">${esc(e?.status === 'integrity-failure' ? 'LEGACY' : e?.status === 'no-dataset' ? 'NO DATA' : '—')}</span>`}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap card-list-wrap"><table class="data-table card-list" data-testid="card-list"><thead><tr><th>Card</th><th>Suit</th><th>PR</th><th>Timing</th><th>Evidence scope</th><th>Opportunities</th><th>Selected</th><th>Pick rate</th><th>Confidence</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ── Card Dossier ─────────────────────────────────────────────────

const DOSSIER_TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'authority', label: 'Authority' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'connections', label: 'Connections' },
];

function dossierHTML(m, va) {
  const tab = DOSSIER_TABS.some(t => t.id === state.cardDossierTab) ? state.cardDossierTab : 'identity';
  const inCompare = (state.cardCompare ?? []).includes(m.identity);
  const tabs = DOSSIER_TABS.map(t =>
    `<button type="button" role="tab" id="card-tab-${t.id}" aria-selected="${t.id === tab}" aria-controls="card-panel-${t.id}" class="card-dossier-tab${t.id === tab ? ' active' : ''}" data-card-tab="${t.id}" tabindex="${t.id === tab ? '0' : '-1'}">${t.label}</button>`).join('');
  return `<div class="card-dossier tcg-suit-${m.suitId}" style="--card-accent:${esc(m.suitAccent)}" data-testid="card-dossier">
    <header class="card-dossier-head">
      <span class="card-dossier-art" style="background-image:url('${esc(m.art.path)}');background-position:${esc(m.art.position)}" role="img" aria-label="${esc(m.art.alt)}"></span>
      <div class="card-dossier-title">
        <p class="eyebrow">CARD DOSSIER · ${esc(m.entity?.scopeLabel ?? 'canonical')}</p>
        <h3 id="card-dossier-heading">${esc(m.identity)} — ${esc(m.title)}</h3>
        ${m.subtitle && m.subtitle !== m.title ? `<p class="card-dossier-sub">${esc(m.subtitle)}</p>` : ''}
        ${m.motto ? `<p class="card-dossier-motto">${esc(m.motto)}</p>` : ''}
      </div>
      <div class="card-dossier-actions">
        <button type="button" class="secondary-button" data-card-compare="${esc(m.identity)}" aria-pressed="${inCompare}">${inCompare ? '− Compare' : '+ Compare'}</button>
        <button type="button" class="icon-button" data-card-deselect aria-label="Close dossier">×</button>
      </div>
    </header>
    <div class="card-dossier-tabs" role="tablist" aria-label="Card dossier sections">${tabs}</div>
    <div class="card-dossier-body" role="tabpanel" id="card-panel-${tab}" aria-labelledby="card-tab-${tab}" tabindex="0">
      ${dossierTabBody(m, va, tab)}
    </div>
  </div>`;
}

function dossierTabBody(m, va, tab) {
  if (tab === 'identity') return identityTab(m);
  if (tab === 'authority') return authorityTab(m);
  if (tab === 'evidence') return evidenceTab(m, va);
  return connectionsTab(m, va);
}

// ── Tab A: Identity ──────────────────────────────────────────────

function identityTab(m) {
  const facts = [
    ['Identity', m.identity],
    ['Rank', `${m.rankLabel} (${m.rank})`],
    ['Suit', m.suit ? `${m.suitLabel} ${m.suit}` : 'Joker'],
    ['Family', m.family],
    ['PR value', m.pr != null ? `${m.pr} points` : null],
    ['ER value', m.er != null ? `${m.er}` : null],
    ['Timing classes', m.timings.length ? m.timings.join(' · ') : null],
    ['Authority', `${m.authority} · registry v${CARD_FACE_REGISTRY_META.version}`],
  ].filter(([, v]) => v != null);
  const factRows = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  const badges = m.badges.length ? `<div class="card-badges">${m.badges.map(b => `<span class="badge badge-info">${esc(b)}</span>`).join('')}</div>` : '';
  return `<div class="card-identity-tab">
    <div class="card-face-stage">${renderCardFace(m.identity, { view: 'board' })}</div>
    <div class="card-identity-facts">
      ${badges}
      <dl class="definition-list card-facts">${factRows}</dl>
      <p class="card-legality-note" data-testid="card-legality-note">Legality is always decided by the engine at play time. This dossier is a canonical reference — what the card is and what it may do under the rules.</p>
    </div>
  </div>`;
}

// ── Tab B: Authority (canonical rules — Advanced Card Rules data) ─

function authorityTab(m) {
  const rules = renderAdvancedCardRulesView(m.identity);
  return `<div class="card-authority-tab">
    <div class="card-authority-head">
      <p>Canonical capability dossier from Advanced Card Rules — the single rules authority. Nothing here is paraphrased.</p>
      <button type="button" class="ix-cross-link" data-card-rules-modal="${esc(m.identity)}">Open full rules view</button>
    </div>
    ${rules || '<p class="empty-state">No canonical rules dossier for this identity.</p>'}
  </div>`;
}

// ── Tab C: Evidence ──────────────────────────────────────────────

function entityScopeForTier(tier) {
  return tier === 'suit' || tier === 'spade' ? 'Exact suit variant'
    : tier === 'normal' ? 'Shared normal evidence — ♣/♦/♥'
    : tier === 'super' ? 'Super-variant evidence'
    : tier === 'super-aggregate' ? 'Combined Super evidence'
    : 'Rank-level evidence';
}

function evidenceTab(m, va) {
  if (!va) {
    return emptyEvidenceState('No simulation dataset', 'Canonical identity and rules remain available, but no variant analytics artifact is loaded. Card evidence appears when Observatory data is present.', '◌');
  }
  const family = M.rankFamilyEntities(m, va);
  const activeKey = family.some(e => e.key === state.cardEntityKey) ? state.cardEntityKey : m.entity?.variantKey;
  const ev = M.evidenceForEntity(activeKey, va);
  const activeEntity = family.find(e => e.key === activeKey);
  const tier = activeEntity?.tier ?? M.entityTierForKey(activeKey);
  const mapped = activeKey === m.entity?.variantKey;

  const switcher = family.length > 1 ? `<div class="card-entity-switcher" role="group" aria-label="Evidence entity">${family.map(e =>
    `<button type="button" class="card-entity-btn${e.key === activeKey ? ' active' : ''}" data-card-entity="${esc(e.key)}" aria-pressed="${e.key === activeKey}" title="${esc(e.displayName)} — ${esc(STATUS_TEXT[e.evidence.status] ?? '')}">
      <span class="entity-dot is-${e.evidence.status}" aria-hidden="true"></span>${esc(shortEntityLabel(e))}${e.mapped ? ' <i>◈</i>' : ''}
    </button>`).join('')}</div>` : '';

  const scopeTitle = mapped ? (m.entity?.scopeLabel ?? entityScopeForTier(tier)) : entityScopeForTier(tier);
  const scopeLine = `<div class="card-scope-banner scope-${tier}">
    <b>${esc(scopeTitle)}</b>
    <span>${mapped ? esc(m.entity?.disclosure ?? '') : `Viewing ${esc(activeEntity?.displayName ?? activeKey)} — a related analytical entity, not evidence measured for ${esc(m.identity)} itself.`}</span>
  </div>`;

  return `<div class="card-evidence-tab">
    ${switcher}
    ${scopeLine}
    ${evidenceStatusBlock(m, ev, activeEntity)}
    ${comboEvidenceBlock(m)}
  </div>`;
}

// ── Combo participation (⚡ Combo Atlas cross-link) ───────────────
// Canonical Combo component intelligence: a card may look ordinary in
// ordinary usage while being a disproportionately strong committed
// Combo component. Reads state.observatory.combo — the shared Combo
// Atlas analytics block — and reports only observed participation;
// missing telemetry renders as unavailable, never as zero.

function comboEvidenceBlock(m) {
  const combo = state.observatory?.combo;
  if (!combo) return '';
  const coverage = combo.coverage?.lifecycleStatus;
  const cards = combo.components?.cards ?? [];
  const ranks = combo.components?.ranks ?? [];
  const cardRow = cards.find((c) => c.identity === m.identity) ?? null;
  const rankRow = ranks.find((r) => r.rank === m.rank) ?? null;
  if (!cardRow && !rankRow) {
    // In a telemetry-covered dataset, absence means the card was never
    // committed to an observed Combo — that is a finding, not a gap.
    if (coverage === 'covered' && (combo.totals?.declarations ?? 0) > 0) {
      return dossierSection('⚡ Combo participation', `<p class="card-evidence-note">${esc(m.identity)} was not committed to any observed Combo in this dataset.</p>`, { cls: 'card-combo-section' });
    }
    return '';
  }
  const stat = (label, value, sub) => `<div class="obs-stat"><small>${esc(label)}</small><b>${value}</b>${sub ? `<span class="obs-stat-sub">${sub}</span>` : ''}</div>`;
  const totalParticipations = cards.reduce((s, c) => s + (c.declarations ?? 0), 0);
  const stats = [];
  if (cardRow) {
    stats.push(stat('Combo participation', fmt(cardRow.declarations), totalParticipations ? `${pct(cardRow.declarations / totalParticipations)} of card-level participations` : null));
    stats.push(stat('Resolve rate when involved', cardRow.declarations > 0 ? pct(cardRow.resolved / cardRow.declarations) : '—', `${fmt(cardRow.resolved)} resolved`));
  } else {
    stats.push(stat('Combo participation', 'rank-level', 'no exact-card telemetry — see rank aggregate'));
  }
  if (rankRow) stats.push(stat(`Rank ${esc(m.rank)} participation`, fmt(rankRow.declarations), `${fmt(rankRow.resolved)} resolved · ${fmt(rankRow.countered)} countered`));
  return dossierSection('⚡ Combo participation',
    `<div class="obs-stat-grid card-evidence-grid">${stats.join('')}</div>
     <p class="card-evidence-note">Canonical Combo (§8) component evidence from the Combo Atlas pipeline. ${cardRow ? 'Exact-card participation measured from committed-card telemetry.' : 'Rank-level aggregate — this exact card identity was not measured separately.'} Broken-by-4♥ is unavailable in this engine build.</p>`,
    { cls: 'card-combo-section' });
}

function shortEntityLabel(e) {
  const t = e.tier;
  if (t === 'rank') return 'Rank overall';
  if (t === 'normal') return 'Normal ♣♦♥';
  if (t === 'spade') return '♠ variant';
  if (t === 'suit') return e.displayName?.slice(0, 14) ?? e.key;
  if (t === 'super-aggregate') return 'All Supers';
  return e.displayName?.slice(0, 16) ?? e.key;
}

function evidenceStatusBlock(m, ev, activeEntity) {
  const name = activeEntity?.displayName ?? ev.key;
  if (ev.status === M.EVIDENCE_STATUS.UNAVAILABLE) {
    const fb = ev.rankFallback
      ? `<p class="card-evidence-note">The rank-overall entity (${esc(ev.rankFallback.key)}) does carry aggregate telemetry (${esc(ev.rankFallback.confidence)} confidence) — select it in the entity switcher to inspect.</p>` : '';
    return `${emptyEvidenceState('No recorded evidence', `No observations exist for ${name}. Absence is not a zero — this entity was never measured in the active dataset.`, 'Ø')}${fb}`;
  }
  if (ev.status === M.EVIDENCE_STATUS.INTEGRITY_FAILURE) {
    return `<div class="notice warning card-evidence-note"><strong>Legacy telemetry limitation.</strong> ${esc(name)} has ${fmt(ev.metrics.variantSelectionCount)} recorded selections but no legal-opportunity denominator — pick rate is unknowable and is not shown as 0%.</div>`;
  }
  const met = ev.metrics;
  const stat = (label, value, sub) => `<div class="obs-stat"><small>${esc(label)}</small><b>${value}</b>${sub ? `<span class="obs-stat-sub">${sub}</span>` : ''}</div>`;
  const stats = [
    stat('Legal opportunities', fmt(met.variantOpportunityCount), `${esc(ev.confidence)} confidence`),
    stat('Selections', fmt(met.variantSelectionCount), `pick rate ${Number.isFinite(met.variantPlayRate) ? pct(met.variantPlayRate) : '—'}`),
    Number.isFinite(met.variantWinRate) ? stat('Observed win rate', pct(met.variantWinRate), `${fmt(met.variantVictoryContributionCount ?? 0)} win / ${fmt(met.variantDefeatExposureCount ?? 0)} loss records`) : null,
    Number.isFinite(met.variantAverageValueWhenActivated) ? stat('Avg value when activated', met.variantAverageValueWhenActivated.toFixed(3)) : null,
    Number.isFinite(met.variantSecuredPointContribution) ? stat('Secured points', met.variantSecuredPointContribution.toFixed(1), 'cumulative, all selections') : null,
    Number.isFinite(met.variantBoardPresenceContribution) ? stat('Board presence', met.variantBoardPresenceContribution.toFixed(1)) : null,
    Number.isFinite(met.variantTempoImpact) ? stat('Tempo impact', met.variantTempoImpact.toFixed(1)) : null,
    Number.isFinite(met.variantGoalContribution) ? stat('Goal contribution', met.variantGoalContribution.toFixed(1)) : null,
    (met.variantSuccessCount + met.variantFailureCount) > 0 ? stat('Success rate', pct(met.variantSuccessRate), `${fmt(met.variantSuccessCount)}✓ / ${fmt(met.variantFailureCount)}✗ resolutions`) : null,
  ].filter(Boolean).join('');
  const radar = ev.power?.axes ? radarChart({
    axes: [
      { label: 'Selection', value: ev.power.axes.selectionPower, rawText: `rate ${pct(ev.power.raw?.selectionRate)}` },
      { label: 'Victory', value: ev.power.axes.victoryPower, rawText: `rate ${pct(ev.power.raw?.victoryRate)}` },
      { label: 'Score', value: ev.power.axes.scorePower, rawText: `${(ev.power.raw?.scorePerSelection ?? 0).toFixed(2)}/sel` },
      { label: 'Board', value: ev.power.axes.boardPower, rawText: `${(ev.power.raw?.boardPerSelection ?? 0).toFixed(2)}/sel` },
      { label: 'Tempo', value: ev.power.axes.tempoPower, rawText: `${(ev.power.raw?.tempoPerSelection ?? 0).toFixed(2)}/sel` },
      { label: 'Value', value: ev.power.axes.valuePower, rawText: `${(ev.power.raw?.avgValue ?? 0).toFixed(3)}` },
    ],
    max: 1, size: 230, color: '#5ad7e8', ariaLabel: `Observed power profile for ${name} — cohort-normalized`,
  }) : '';
  const insufficientNote = ev.status === M.EVIDENCE_STATUS.INSUFFICIENT
    ? `<div class="notice warning card-evidence-note"><strong>Insufficient sample.</strong> ${esc(name)} has ${fmt(met.variantOpportunityCount)} legal opportunities — below the confidence floor. Values shown are descriptive only.</div>` : '';
  return `<div class="card-evidence-profile">
    ${insufficientNote}
    <div class="obs-stat-grid card-evidence-grid">${stats}</div>
    ${radar ? dossierSection('Observed power profile', `${radar}<p class="card-evidence-note">Axes normalized 0–1 across variant entities in the active dataset. Cohort-relative and observational — not causal and not exact-card evidence unless the scope banner says so.</p>`, { cls: 'card-power-section' }) : ''}
  </div>`;
}

// ── Tab D: Connections ───────────────────────────────────────────

function connectionsTab(m, va) {
  const siblings = M.suitSiblings(m, va).filter(s => s.identity !== m.identity);
  const family = M.rankFamilyEntities(m, va);
  const links = M.relationshipsFor(m);

  const siblingChips = siblings.length ? dossierSection('Suit siblings', `<div class="card-sibling-row">${siblings.map(s =>
    `<button type="button" class="card-sibling-chip tcg-suit-${s.suitId}" data-card="${esc(s.identity)}" style="--card-accent:${esc(s.suitAccent)}" aria-label="Open dossier for ${esc(s.identity)}"><b>${esc(s.identity)}</b><small>${esc(s.title)}</small></button>`).join('')}</div>`, { note: 'same rank, different canonical effect' }) : '';

  const entityRows = family.map(e => {
    const ev = e.evidence;
    return `<tr class="${e.mapped ? 'is-mapped' : ''} clickable-row" data-card-entity-link="${esc(e.key)}" tabindex="0">
      <td>${esc(e.displayName)}${e.mapped ? ' <span class="badge badge-info">mapped</span>' : ''}</td>
      <td>${esc(entityScopeForTier(e.tier))}</td>
      <td>${ev.metrics ? fmt(ev.metrics.variantOpportunityCount) : '—'}</td>
      <td>${ev.metrics ? fmt(ev.metrics.variantSelectionCount) : '—'}</td>
      <td><span class="badge badge-${ev.status === 'available' ? (ev.confidence === 'HIGH' ? 'supported' : 'info') : 'muted'}">${esc(ev.status === 'available' ? ev.confidence : STATUS_TEXT[ev.status] ?? '—')}</span></td>
    </tr>`;
  }).join('');
  const familyTable = family.length ? dossierSection('Analytical entities for this rank',
    `<div class="table-wrap"><table class="data-table"><thead><tr><th>Entity</th><th>Scope</th><th>Opportunities</th><th>Selected</th><th>Status</th></tr></thead><tbody>${entityRows}</tbody></table></div>`,
    { note: 'physical card ≠ analytical entity — the mapped row is the honest scope for this card' }) : '';

  const linkButtons = links.map(l => `<button type="button" class="ix-cross-link" data-card-xref="${esc(l.id)}" data-rank="${esc(m.rank)}" data-suit="${esc(m.suit ?? '')}">${esc(l.label)}</button>`).join('');
  const crossLinks = dossierSection('Investigate further', `<div class="card-xref-row">${linkButtons}<a class="ix-cross-link" href="#/rules">Rulebook</a></div>`, { note: 'deep links into sibling workspaces' });

  const rulesRefs = dossierSection('Canonical references',
    `<ul class="card-ref-list"><li>Card registry v${esc(CARD_FACE_REGISTRY_META.version)} · rules v${esc(CARD_FACE_REGISTRY_META.rulesVersion)}</li><li>Advanced Card Rules dossier — Authority tab</li></ul>`);

  return `<div class="card-connections-tab">${siblingChips}${familyTable}${crossLinks}${rulesRefs}</div>`;
}

// ── Comparison ───────────────────────────────────────────────────

function compareTrayHTML() {
  const list = state.cardCompare ?? [];
  if (!list.length) return '';
  const chips = list.map(id =>
    `<span class="filter-chip card-compare-chip"><b>${esc(id)}</b><button type="button" data-card-compare-remove="${esc(id)}" aria-label="Remove ${esc(id)} from comparison">×</button></span>`).join('');
  return `<div class="card-compare-tray" role="group" aria-label="Card comparison tray">
    ${chips}
    <button type="button" class="secondary-button" id="card-compare-open"${list.length >= 2 ? '' : ' disabled'}>Compare ${list.length} card${list.length === 1 ? '' : 's'}</button>
    <button type="button" class="ghost-button" id="card-compare-clear">Clear</button>
  </div>`;
}

function comparePanelHTML(va) {
  const rows = M.compareData(state.cardCompare ?? [], va);
  if (rows.length < 2) return '';
  const head = `<tr><th scope="col">Attribute</th>${rows.map(r => `<th scope="col">${esc(r.identity)}<br><small>${esc(r.title)}</small></th>`).join('')}</tr>`;
  const row = (label, acc) => `<tr><th scope="row">${esc(label)}</th>${rows.map(r => `<td>${acc(r)}</td>`).join('')}</tr>`;
  const body = [
    row('Rank / Suit', r => `${esc(r.rank)} · ${esc(r.suitLabel)}`),
    row('PR value', r => r.pr ?? '—'),
    row('ER value', r => r.er ?? '—'),
    row('Timing', r => esc(r.timings.join(', ') || '—')),
    row('Evidence scope', r => esc(r.scope)),
    row('Confidence', r => esc(r.confidence ?? '—')),
    row('Legal opportunities', r => r.opportunities != null ? fmt(r.opportunities) : '—'),
    row('Selections', r => r.selections != null ? fmt(r.selections) : '—'),
    row('Pick rate when legal', r => r.pickRate != null ? pct(r.pickRate) : '—'),
    row('Observed win rate', r => r.winRate != null ? pct(r.winRate) : '—'),
    row('Secured points', r => r.secured != null ? r.secured.toFixed(1) : '—'),
    row('Value power (0–1)', r => r.valuePower != null ? r.valuePower.toFixed(3) : '—'),
  ].join('');
  return `<section class="panel card-compare-panel" data-testid="card-compare-panel">
    <div class="panel-header"><div><h3>Card comparison</h3><p>${rows.length} cards — evidence columns report each card's own scope</p></div>
    <button type="button" class="ghost-button" id="card-compare-close">Close comparison</button></div>
    <div class="panel-body"><div class="table-wrap"><table class="data-table card-compare-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>
  </section>`;
}

// ── Main renderer ────────────────────────────────────────────────

export function renderCards() {
  adoptDeepLink();
  const va = state.variantAnalytics ?? null;
  const models = M.buildDeck(va);
  const filters = filtersFromState();
  const filtered = M.filterModels(models, filters);
  const filteredSet = new Set(filtered.map(m => m.identity));
  // Keep the selected card even when filters hide it — the atlas dims
  // the cell but the dossier remains open (filter ≠ deselect).
  const selectedId = state.selectedCard ?? null;
  const selected = models.find(m => m.identity === selectedId) ?? null;

  const rows = M.deckMatrix(models, m => filteredSet.has(m.identity));
  const listModels = M.sortModels(filtered, state.cardSort ?? 'deck');
  const dossier = selected ? dossierHTML(selected, va)
    : `<div class="card-dossier-empty panel"><div class="panel-body">${emptyEvidenceState('Select a card', 'Choose a card in the atlas to open its dossier — canonical identity, rules authority, simulation evidence, and connections.', '🃏')}</div></div>`;

  app.innerHTML = `<div class="cards-workspace" data-testid="cards-workspace">
    <section class="panel cards-head-panel">
      <div class="panel-header"><div><h2>Card Observatory</h2><p>Canonical identity, rules authority, simulation evidence, and system connections for every card.</p></div></div>
      <div class="panel-body">${labDatasetBanner()}${obsContextStrip(state.observatory)}${summaryStrip(models, va)}${compareTrayHTML()}</div>
    </section>
    ${state.cardCompareOpen ? comparePanelHTML(va) : ''}
    <div class="cards-layout">
      <section class="panel cards-atlas-panel">
        <div class="panel-header"><div><h3>Card Atlas</h3><p>Deck matrix — rank rows × suit columns, evidence scope per cell.</p></div></div>
        <div class="panel-body">
          ${toolbarHTML(filtered.length, models.length)}
          ${state.cardView === 'list' ? listViewHTML(listModels, selectedId) : atlasMatrixHTML(rows, filteredSet, selectedId)}
        </div>
      </section>
      <div class="cards-dossier-slot">${dossier}</div>
    </div>
  </div>`;

  bindCards();
}

// ── Event wiring ─────────────────────────────────────────────────

function bindCards() {
  const bind = (id, fn, ev = 'change') => { const el = document.querySelector(id); if (el) el.addEventListener(ev, fn); };

  // Search input — preserve focus + caret across the re-render.
  bind('#card-search', e => {
    const pos = e.target.selectionStart;
    state.cardSearch = e.target.value;
    rerender();
    const el = document.querySelector('#card-search');
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  }, 'input');
  bind('#card-suit-filter', e => { state.cardSuitFilter = e.target.value; rerender(); });
  bind('#card-rank-filter', e => { state.cardRankFilter = e.target.value; rerender(); });
  bind('#card-timing-filter', e => { state.cardTimingFilter = e.target.value; rerender(); });
  bind('#card-evidence-filter', e => { state.cardEvidenceFilter = e.target.value; rerender(); });
  bind('#card-confidence-filter', e => { state.cardConfidenceFilter = e.target.value; rerender(); });
  bind('#card-sort', e => { state.cardSort = e.target.value; rerender(); });
  bind('#card-clear-filters', () => {
    Object.assign(state, { cardSearch: '', cardSuitFilter: 'all', cardRankFilter: 'all', cardTimingFilter: 'all', cardEvidenceFilter: 'all', cardConfidenceFilter: 'all', cardSort: 'deck' });
    rerender();
  }, 'click');

  document.querySelectorAll('[data-card-view]').forEach(b => b.onclick = () => { state.cardView = b.dataset.cardView; rerender(); });

  // Card selection — atlas cells, list rows, sibling chips.
  const selectCard = (id) => {
    state.selectedCard = id;
    state.cardEntityKey = null; // reset entity switcher to the mapped entity
    syncDeepLink();
    rerender();
    // Move focus to the dossier so keyboard/AT users land on the new
    // content rather than losing focus when the DOM is rebuilt.
    const heading = document.querySelector('#card-dossier-heading');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: false }); }
  };
  document.querySelectorAll('[data-card]').forEach(el => {
    const isRow = el.tagName === 'TR';
    el.addEventListener('click', () => selectCard(el.dataset.card));
    if (isRow) el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(el.dataset.card); } });
  });

  // Grid arrow-key navigation (roving tabindex lives in markup).
  const atlas = document.querySelector('.card-atlas');
  if (atlas) atlas.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const cells = [...atlas.querySelectorAll('.card-cell[data-card]')];
    const idx = cells.indexOf(document.activeElement);
    if (idx < 0) return;
    e.preventDefault();
    const cur = document.activeElement.closest('.card-atlas-row');
    const rowEls = [...atlas.querySelectorAll('.card-atlas-row')];
    const ri = rowEls.indexOf(cur);
    const rowCells = [...cur.querySelectorAll('.card-cell[data-card]')];
    const ci = rowCells.indexOf(document.activeElement);
    let target = null;
    if (e.key === 'ArrowRight') target = rowCells[ci + 1] ?? null;
    if (e.key === 'ArrowLeft') target = rowCells[ci - 1] ?? null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      for (let r = ri + dir; r >= 0 && r < rowEls.length; r += dir) {
        const rc = [...rowEls[r].querySelectorAll('.card-cell[data-card]')];
        if (rc.length) { target = rc[Math.min(ci, rc.length - 1)]; break; }
      }
    }
    if (target) { cells.forEach(c => c.tabIndex = -1); target.tabIndex = 0; target.focus(); }
  });

  // Dossier controls.
  const deselect = document.querySelector('[data-card-deselect]');
  if (deselect) deselect.onclick = () => { state.selectedCard = null; syncDeepLink(); rerender(); };
  document.querySelectorAll('[data-card-tab]').forEach(b => {
    b.onclick = () => { state.cardDossierTab = b.dataset.cardTab; rerender(); };
    b.onkeydown = e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const tabs = [...document.querySelectorAll('[data-card-tab]')];
      const i = tabs.indexOf(b);
      const ni = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      tabs[ni].click(); tabs[ni].focus();
    };
  });
  document.querySelectorAll('[data-card-entity]').forEach(b => b.onclick = () => { state.cardEntityKey = b.dataset.cardEntity; rerender(); });
  document.querySelectorAll('[data-card-entity-link]').forEach(row => {
    row.addEventListener('click', () => { state.cardEntityKey = row.dataset.cardEntityLink; state.cardDossierTab = 'evidence'; rerender(); });
    row.addEventListener('keydown', e => { if (e.key === 'Enter') { state.cardEntityKey = row.dataset.cardEntityLink; state.cardDossierTab = 'evidence'; rerender(); } });
  });
  document.querySelectorAll('[data-card-rules-modal]').forEach(b => b.onclick = () => {
    getAcrController().then(({ openAdvancedCardRules }) => openAdvancedCardRules(b.dataset.cardRulesModal))
      .catch(err => console.error('[cards] rules view failed:', err));
  });

  // Comparison.
  document.querySelectorAll('[data-card-compare]').forEach(b => b.onclick = () => {
    const id = b.dataset.cardCompare;
    const list = state.cardCompare ??= [];
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else if (list.length < 4) list.push(id);
    rerender();
  });
  document.querySelectorAll('[data-card-compare-remove]').forEach(b => b.onclick = () => {
    state.cardCompare = (state.cardCompare ?? []).filter(x => x !== b.dataset.cardCompareRemove);
    if ((state.cardCompare?.length ?? 0) < 2) state.cardCompareOpen = false;
    rerender();
  });
  bind('#card-compare-open', () => { state.cardCompareOpen = true; rerender(); }, 'click');
  bind('#card-compare-close', () => { state.cardCompareOpen = false; rerender(); }, 'click');
  bind('#card-compare-clear', () => { state.cardCompare = []; state.cardCompareOpen = false; rerender(); }, 'click');

  // Cross-workspace links — set the target workspace's filter state,
  // then navigate. Each lands in a real filtered view.
  document.querySelectorAll('[data-card-xref]').forEach(b => b.onclick = () => {
    const id = b.dataset.cardXref;
    const rank = b.dataset.rank;
    if (id === 'rank') {
      state.selectedRank = rank === '10' && b.dataset.suit
        ? `10:${{ '♣': 'club', '♦': 'diamond', '♥': 'heart', '♠': 'spade' }[b.dataset.suit]}` : rank;
      location.hash = '#/ranks';
    } else if (id === 'mechanics') {
      state.mechanicsRankFilter = rank;
      location.hash = '#/mechanics';
    } else if (id === 'strategy') {
      location.hash = `#/strategy?subject=rank:${rank}`;
    }
  });
}
