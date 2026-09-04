// ═══════════════════════════════════════════════════════════════
// router.js — Workspace definitions, routing, navigation rendering
// ═══════════════════════════════════════════════════════════════

import { esc } from './state.js';

export const WORKSPACES = [
  // Play lane
  ['/play','🎮','Play','Local, ranked, and online'],
  ['/play/academy','🎓','Academy','Interactive lessons'],
  ['/puzzles','🧩','Puzzles','Progressive ladder'],
  ['/tournaments','🏆','Tournaments','AI bracket play'],
  ['/seasons','📅','Seasons','Ranked play and leaderboards'],
  // Learn lane
  ['/rules','📖','Rules','Complete rulebook'],
  ['/cards','🃏','Cards','Card reference'],
  // Lab lane
  ['/watch','◈','Watch','Match theatre'],
  ['/caster','🎙','Caster','Live replay broadcast'],
  ['/replays','▶','Replays','Verification'],
  ['/history','☰','History','Match ledger'],
  ['/mechanics','⌁','Mechanics','Atlas'],
  ['/synergies','⟷','Synergies','Relationships'],
  ['/ranks','★','Ranks','Power observatory'],
  ['/compare','⇄','Compare','Matched cohorts'],
  ['/traces','◇','Traces','Decision intelligence'],
  ['/branches','⎇','Branches','Counterfactual lab'],
  ['/diagnostics','⚙','Diagnostics','Policy behavior'],
  ['/tournament','🏆','Tournament','AI bracket'],
  ['/evidence','◎','Evidence','Integrity'],
  ['/intelligence','✦','Analytics AI','Ollama interpretation'],
  // Account lane
  ['/release-notes','✧','Release Notes','What\'s new'],
  ['/profile','👤','Profile','Player profile'],
  ['/achievements','🏆','Achievements','56 launch achievements'],
  ['/settings','⚙','Settings','Display, network, and account'],
  ['/auth','⊕','Sign In','Account authentication']
];

export const TITLES = Object.fromEntries(WORKSPACES.map(([route,,label]) => [route,label]));

export const SUBTITLES = {
  // Play lane
  '/play':'Game hub — local play vs AI, online Direct Duel, resume saves, and new match setup.',
  '/play/academy':'5 sequential interactive lessons covering core mechanics, responses, counters, and royal cards.',
  '/puzzles':'Progressive puzzle ladder with localStorage progress tracking and increasing difficulty.',
  '/tournaments':'AI-vs-AI bracket tournaments with AB/BA seat-swap fairness and post-tournament analytics.',
  '/seasons':'Ranked play with Glicko-2 ratings, seasons, placements, and public leaderboards.',
  // Learn lane
  '/rules':'The complete player rulebook with stylized typography, sticky table of contents, and collapsible parts.',
  '/cards':'Inspect all 54 canonical card faces in Board, Lite, and Full Zoom modes.',
  // Lab lane
  '/watch':'Canonical match truth with semantic stepping and causal evidence.',
  '/caster':'Watch a completed AI-vs-AI match unfold live with synchronized Ollama commentary. An observability instrument disguised as a broadcast experience.',
  '/replays':'Verify, search, compare, and investigate retained match evidence.',
  '/mechanics':'Opportunity, usage, impact, uncertainty, and replay evidence by mechanic.',
  '/synergies':'Stratified synergy, anti-synergy, motifs, and counterexamples.',
  '/ranks':'Cohort-relative rank power profiles, counterfactual decision value, and balance watchlist.',
  '/compare':'Policy, seat, campaign, and matched-cohort differences without canon mixing.',
  '/history':'Per-match ledger with full telemetry, sortable columns, and detail inspector.',
  '/evidence':'Evidence epoch, policy-strength tiers, admissibility disclosure, formula registry, provenance, and release integrity.',
  '/release-notes':'What\'s new in each version — changelog with version summaries and release details.',
  '/intelligence':'Optional local-LLM analytics interpretation grounded in the active simulation dataset. Deterministic warnings are computed locally; LLM interpretations are clearly labelled.',
  '/traces':'Per-decision traces with score decomposition, reason codes, and rule audit.',
  '/branches':'Policy-conditioned counterfactual estimates from command checkpoints.',
  '/diagnostics':'Decision margins, self-counter rates, response conservation, timing, and win rates.',
  '/tournament':'Single-elimination AI-vs-AI bracket with deterministic matches and champion crowning.',
  '/profile':'Player profile — identity, ranked, achievements, showcase, customization, and privacy.',
  '/achievements':'56 launch achievements with deterministic detection, career tracking, and hidden discoveries.',
  '/settings':'Display, accessibility, network, account, and data settings.',
  '/auth':'Sign in with Discord or Google, or continue as a guest to play online.'
};

export const LEGAL_MODES = new Set(['/privacy', '/terms']);

export const LANDING_MODES = new Set(['/', '/dev', '/play', '/play/new', '/play/match', '/play/replays', '/play/academy', '/puzzles', '/seasons', '/meta', '/tournaments', '/rules', '/cards', '/privacy', '/terms', '/auth', '/players', '/dev/puzzles', '/caster']);

export const isPlayRoute = (r) => r === '/play' || r.startsWith('/play/');

export function route() {
  const r = location.hash.replace(/^#/,'').split('?')[0] || '/';
  if (r === '/sim') return '/watch';
  if (LANDING_MODES.has(r) || isPlayRoute(r)) return r;
  // Public player profile: #/player/@handle or #/player/PLY_…
  // Normalized to '/player' so app.js dispatches to renderProfile,
  // which reads location.hash directly to extract the handle/id.
  if (r === '/player' || r.startsWith('/player/')) return '/player';
  return TITLES[r] ? r : '/watch';
}

export function renderNavigation() {
  // Three-lane product organization: PLAY, LEARN, LAB
  // PLAY and LEARN routes link to landing/play pages; LAB routes are observatory workspaces.
  // Profile/Settings/Auth remain in a System section at the bottom.
  const SECTIONS = [
    { label: 'Play', routes: ['/play', '/play/academy', '/puzzles', '/tournaments', '/seasons'] },
    { label: 'Learn', routes: ['/rules', '/cards'] },
    { label: 'Lab', routes: ['/watch', '/caster', '/replays', '/history', '/mechanics', '/synergies', '/ranks', '/compare', '/traces', '/branches', '/diagnostics', '/tournament', '/evidence', '/intelligence'] },
    { label: 'Account', routes: ['/profile', '/achievements', '/release-notes', '/settings', '/auth'] },
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
