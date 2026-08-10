// ═══════════════════════════════════════════════════════════════
// router.js — Workspace definitions, routing, navigation rendering
// ═══════════════════════════════════════════════════════════════

import { esc } from './state.js';

export const WORKSPACES = [
  ['/watch','◈','Watch','Match theatre'],
  ['/replays','▶','Replays','Verification'],
  ['/history','☰','History','Match ledger'],
  ['/mechanics','⌁','Mechanics','Atlas'],
  ['/cards','▣','Card Faces','Renderer v1'],
  ['/synergies','⟷','Synergies','Relationships'],
  ['/ranks','★','Ranks','Power observatory'],
  ['/compare','⇄','Compare','Matched cohorts'],
  ['/traces','◇','Traces','Decision intelligence'],
  ['/branches','⎇','Branches','Counterfactual lab'],
  ['/diagnostics','⚙','Diagnostics','Policy behavior'],
  ['/tournament','🏆','Tournament','AI bracket'],
  ['/evidence','◎','Evidence','Integrity'],
  ['/profile','👤','Profile','Player record'],
  ['/intelligence','✦','Analytics AI','Ollama interpretation'],
  ['/achievements','🏆','Achievements','56 launch achievements']
];

export const TITLES = Object.fromEntries(WORKSPACES.map(([route,,label]) => [route,label]));

export const SUBTITLES = {
  '/watch':'Canonical match truth with semantic stepping and causal evidence.',
  '/replays':'Verify, search, compare, and investigate retained match evidence.',
  '/mechanics':'Opportunity, usage, impact, uncertainty, and replay evidence by mechanic.',
  '/cards':'Deterministic Board, Lite, and Full Zoom faces backed by canonical card data.',
  '/synergies':'Stratified synergy, anti-synergy, motifs, and counterexamples.',
  '/ranks':'Cohort-relative rank power profiles, counterfactual decision value, and balance watchlist.',
  '/compare':'Policy, seat, campaign, and matched-cohort differences without canon mixing.',
  '/history':'Per-match ledger with full telemetry, sortable columns, and detail inspector.',
  '/evidence':'Formula registry, provenance, capabilities, anomalies, and release integrity.',
  '/intelligence':'Optional local-LLM analytics interpretation grounded in the active simulation dataset. Deterministic warnings are computed locally; LLM interpretations are clearly labelled.',
  '/traces':'Per-decision traces with score decomposition, reason codes, and rule audit.',
  '/branches':'Policy-conditioned counterfactual estimates from command checkpoints.',
  '/diagnostics':'Decision margins, self-counter rates, response conservation, timing, and win rates.',
  '/tournament':'Single-elimination AI-vs-AI bracket with deterministic matches and champion crowning.',
  '/profile':'Local player profile with rating, badges, match history, and archetype breakdown.',
  '/achievements':'56 launch achievements with deterministic detection, career tracking, and hidden discoveries.'
};

export const LANDING_MODES = new Set(['/', '/play', '/play/new', '/play/tutorial', '/play/match', '/play/replays', '/rules']);

export const isPlayRoute = (r) => r === '/play' || r.startsWith('/play/');

export function route() {
  const r = location.hash.replace(/^#/,'').split('?')[0] || '/';
  if (r === '/sim') return '/watch';
  if (LANDING_MODES.has(r) || isPlayRoute(r)) return r;
  return TITLES[r] ? r : '/watch';
}

export function renderNavigation() {
  // Group workspaces into sections for visual hierarchy
  const SECTIONS = [
    { label: 'Analysis', routes: ['/watch', '/replays', '/history', '/mechanics', '/cards', '/synergies'] },
    { label: 'Investigation', routes: ['/ranks', '/compare', '/traces', '/branches', '/diagnostics', '/tournament'] },
    { label: 'System', routes: ['/evidence', '/profile', '/achievements', '/intelligence'] },
  ];
  const wsMap = Object.fromEntries(WORKSPACES.map(([r, ...rest]) => [r, rest]));
  const nav = document.querySelector('#workspace-nav');
  if (!nav) return;
  nav.innerHTML = [
    '<div class="nav-search-wrap">',
    '<input type="search" id="nav-search" class="nav-search" placeholder="Filter workspaces…  (press /)" ',
    'aria-label="Filter workspaces" autocomplete="off" spellcheck="false" />',
    '</div>',
    SECTIONS.map(section => {
      const links = section.routes.filter(r => wsMap[r]).map(r => {
        const [icon, label, sub] = wsMap[r];
        return `<a class="workspace-link" href="#${r}" data-route="${r}" data-search="${esc((label + ' ' + sub + ' ' + section.label).toLowerCase())}"><span class="workspace-icon" aria-hidden="true">${icon}</span><span>${label}</span><small>${sub}</small></a>`;
      }).join('');
      return `<div class="nav-section" data-section-label="${section.label}"><div class="nav-section-label">${section.label}</div>${links}</div>`;
    }).join(''),
  ].join('');

  // Wire up search filter
  const searchInput = nav.querySelector('#nav-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => filterWorkspaces(searchInput.value));
  }
}

/**
 * Filter workspace links by search query.
 * Matches against the data-search attribute (label + subtitle + section).
 * Empty query shows all workspaces.
 */
export function filterWorkspaces(query) {
  const q = (query || '').trim().toLowerCase();
  const nav = document.querySelector('#workspace-nav');
  if (!nav) return;
  const sections = nav.querySelectorAll('.nav-section');
  for (const section of sections) {
    const links = section.querySelectorAll('.workspace-link');
    let visibleCount = 0;
    for (const link of links) {
      const haystack = link.dataset.search || '';
      const match = !q || haystack.includes(q);
      link.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    }
    section.style.display = visibleCount > 0 ? '' : 'none';
  }
}

export function policyOptions(selected) {
  const baseline = ['random-legal','score-rush','control','tempo','value'];
  const hybrix = ['hybrix-rusher','hybrix-defender','hybrix-trickster','hybrix-sniper','hybrix-support','hybrix-tank','hybrix-baseline','hybrix-rusher-hard','hybrix-defender-hard','hybrix-trickster-hard','hybrix-sniper-hard','hybrix-rusher-easy','hybrix-defender-easy','hybrix-rusher-nightmare','hybrix-defender-nightmare'];
  const fmt = id => id.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const opt = (id,g) => `<option value="${id}" ${id===selected?'selected':''}>${g?g+' · ':''}${fmt(id)}</option>`;
  return [...baseline.map(id=>opt(id,'Baseline')),...hybrix.map(id=>opt(id,'HYBRIX'))].join('');
}
