// ═══════════════════════════════════════════════════════════════
// router.js — Workspace definitions, routing, navigation rendering
// ═══════════════════════════════════════════════════════════════

import { esc, state, fmt } from './state.js';
import { STRATEGY_NAMES } from '../../../packages/simulation-runtime/src/strategy-contracts.mjs';

export const WORKSPACES = [
  // Play lane
  ['/play','🎮','Play','Local, ranked, and online'],
  ['/play/academy','🎓','Academy','Interactive lessons'],
  ['/play/first-contact','🛰','First Contact','Learn by playing a real match'],
  ['/puzzles','🧩','Puzzles','Progressive ladder'],
  ['/tournaments','🏆','Tournaments','AI bracket play'],
  ['/seasons','📅','Seasons','Ranked play and leaderboards'],
  // Learn lane
  ['/rules','📖','Rules','Complete rulebook'],
  ['/cards','🃏','Cards','Card reference'],
  [STRATEGY_NAMES.route,'◈',STRATEGY_NAMES.workspace,'Field Manual'],
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
  ['/forensic','🔬','Forensic','Replay forensics'],
  ['/diagnostics','⚙','Diagnostics','Policy behavior'],
  ['/evolution','🧬','Evolution Lab','Experiments and heuristic evolution'],
  ['/mutation','⚖','Mutation Chamber','A/B rule experiments'],
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

/**
 * Natural-concept search keywords per route — the questions an analyst
 * actually types ("counterfactual", "why did it choose this", "best
 * cards") rather than only technical workspace names. Shared by the
 * command palette and the rail workspace filter.
 */
export const WORKSPACE_KEYWORDS = {
  '/watch': 'replay match theatre observe canonical state stepping',
  '/caster': 'live broadcast commentary replay',
  '/replays': 'replay vault library verify search',
  '/history': 'ledger results outcomes matches',
  '/mechanics': 'rules systems atlas keywords opportunity usage impact',
  '/synergies': 'relationships pairs combos interactions counterexamples',
  '/ranks': 'best cards power rankings tier strongest',
  '/compare': 'cohorts a/b versus matched differences',
  '/traces': 'why did it choose this decision reasoning trace',
  '/branches': 'counterfactual what if alternate branch divergence',
  '/forensic': 'annotate bookmark puzzle forensics',
  '/diagnostics': 'health telemetry policy behavior margins',
  '/evidence': 'evidence provenance verify integrity audit',
  '/evolution': 'experiment generations lineage evolution',
  '/mutation': 'rule mutation a/b experiment baseline mutant impact regression balance hypothesis',
  '/tournament': 'bracket tournament champion elimination',
  '/intelligence': 'ai llm analytics interpretation synthesis',
  '/rules': 'rulebook how to play learn',
  '/cards': 'card reference database faces'
};

export const SUBTITLES = {
  '/strategy':'Field Manual — practical strategy, timing, context and controlled evidence.',
  // Play lane
  '/play':'Game hub — local play vs AI, online Direct Duel, resume saves, and new match setup.',
  '/play/academy':'5 sequential interactive lessons covering core mechanics, responses, counters, and royal cards.',
  '/play/first-contact':'A real, controlled Intrilex match that teaches you by letting you play.',
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
  '/forensic':'Bookmark, branch, annotate, and compare replays. Generate puzzles from key positions.',
  '/diagnostics':'Decision margins, self-counter rates, response conservation, timing, and win rates.',
  '/evolution':'Deterministic research arena — paired games, frozen evaluation suites, immutable checkpoints, and experimental local heuristic evolution.',
  '/mutation':'Surgical A/B rules experimentation — one scoped rule parameter changes; matched-seed control vs mutant arms measure the systemic consequences.',
  '/tournament':'Single-elimination AI-vs-AI bracket with deterministic matches and champion crowning.',
  '/profile':'Player profile — identity, ranked, achievements, showcase, customization, and privacy.',
  '/achievements':'56 launch achievements with deterministic detection, career tracking, and hidden discoveries.',
  '/settings':'Display, accessibility, network, account, and data settings.',
  '/auth':'Sign in with Discord or Google, or continue as a guest to play online.'
};

// CosmoTech instrument designations — each Lab workspace is a distinct
// instrument inside one research facility. Shown in the global header
// eyebrow; the accent system reads the same identity via data-workspace.
export const INSTRUMENTS = {
  '/watch': 'OBS-01 · MATCH THEATRE',
  '/caster': 'OBS-02 · BROADCAST DECK',
  '/replays': 'OBS-03 · VERIFICATION VAULT',
  '/history': 'OBS-04 · MATCH LEDGER',
  '/mechanics': 'OBS-05 · MECHANIC ATLAS',
  '/synergies': 'OBS-06 · RELATIONSHIP MATRIX',
  '/ranks': 'OBS-07 · POWER OBSERVATORY',
  '/compare': 'OBS-08 · COHORT COMPARATOR',
  '/traces': 'OBS-09 · DECISION TRACER',
  '/branches': 'OBS-10 · DIVERGENCE CHAMBER',
  '/diagnostics': 'OBS-11 · SYSTEMS TELEMETRY',
  '/evolution': 'OBS-12 · LINEAGE REACTOR',
  '/mutation': 'OBS-17 · MUTATION CHAMBER',
  '/tournament': 'OBS-13 · BRACKET ENGINE',
  '/evidence': 'OBS-14 · EVIDENCE ARCHIVE',
  '/intelligence': 'OBS-15 · ANALYTICS LENS',
  '/forensic': 'OBS-16 · REPLAY FORENSICS',
  '/strategy': 'FIELD-00 · FIELD MANUAL',
  '/release-notes': 'LOG-00 · RELEASE LOG',
  '/profile': 'ID-00 · PLAYER DOSSIER',
  '/player': 'ID-00 · PLAYER DOSSIER',
  '/achievements': 'ID-01 · ACHIEVEMENT LEDGER',
  '/settings': 'SYS-00 · SYSTEM CONFIG',
  '/auth': 'AUTH-00 · ACCESS GATE'
};

export const LEGAL_MODES = new Set(['/privacy', '/terms']);

export const LANDING_MODES = new Set(['/', '/dev', '/play', '/play/new', '/play/match', '/play/replays', '/play/academy', '/play/first-contact', '/puzzles', '/seasons', '/meta', '/tournaments', '/rules', '/cards', '/privacy', '/terms', '/auth', '/players', '/dev/puzzles', '/caster', '/forensic']);

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
  // Lab nav — observatory tools and reference material only.
  // Player-facing features (Play, Academy, Puzzles, Tournaments, Seasons)
  // are accessed from the landing page and play hub.
  // Account features (Profile, Achievements, Settings, Auth) are in the
  // account dropdown on the landing page. Release Notes is on the landing rail.
  const SECTIONS = [
    { label: 'Learn', routes: ['/rules', '/cards', STRATEGY_NAMES.route] },
    { label: 'Observe', routes: ['/watch', '/caster', '/replays', '/history'] },
    { label: 'Analyze', routes: ['/mechanics', '/synergies', '/ranks', '/compare', '/traces', '/branches', '/diagnostics'] },
    { label: 'Experiment', routes: ['/evolution', '/mutation', '/tournament'] },
    { label: 'Evidence', routes: ['/evidence', '/intelligence'] },
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
        return `<a class="workspace-link" href="#${r}" data-route="${r}" data-search="${esc((label + ' ' + sub + ' ' + section.label + ' ' + (WORKSPACE_KEYWORDS[r] ?? '')).toLowerCase())}"><span class="workspace-icon" aria-hidden="true">${icon}</span><span>${label}</span><small>${sub}</small></a>`;
      }).join('');
      return `<div class="nav-section" data-section-label="${section.label}"><div class="nav-section-label">${section.label}</div>${links}</div>`;
    }).join(''),
  ].join('');

  // Wire up search filter
  const searchInput = nav.querySelector('#nav-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => filterWorkspaces(searchInput.value));
  }
  updateRailContext();
}

/**
 * Refresh the rail's persistent dataset-orientation strip (match count,
 * corpus origin, visibility mode). Called after nav render and whenever
 * the active dataset is replaced (campaign run, reset, authorized load).
 */
export function updateRailContext() {
  const el = document.querySelector('#rail-context');
  if (!el) return;
  const o = state.observatory ?? {};
  const n = state.aggregate?.matchCount ?? (Array.isArray(o.summaries) ? o.summaries.length : null);
  const origin = o.datasetOrigin === 'EVOLUTION_LAB' ? 'Lab dataset' : 'Certified corpus';
  const vis = ({ public: 'Public', player: 'Player', judge: 'Omniscient' })[state.visibility] ?? 'Public';
  el.innerHTML = `<span class="rail-context-row"><b>${n != null ? fmt(n) : '—'}</b><small>matches</small></span><span class="rail-context-meta">${esc(origin)} · ${esc(vis)} view</span>`;
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
  return [...['score-rush-tactical','control-tactical','tempo-tactical','value-tactical'].map(id=>opt(id,'Tactical v3')),...baseline.map(id=>opt(id,'Frozen v2')),...hybrix.map(id=>opt(id,'HYBRIX'))].join('');
}
