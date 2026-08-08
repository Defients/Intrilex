// ═══════════════════════════════════════════════════════════════
// app.js — Application orchestrator. Imports all modules, dispatches
// routing to workspace renderers, and owns the Watch workspace.
// ═══════════════════════════════════════════════════════════════

import { renderCardFace} from './card-face-renderer.js';
import { getCardDefinition } from './card-face-data.js';
import { renderRulesPage } from './rulebook-renderer.js';
import { RULES_VERSION, ENGINE_VERSION } from './version.js';
import { state,        app,        shell,        landingContainer,        fxLayer,        pageTitle,        pageSubtitle,        esc,        clamp,        showToast} from './state.js';
import { TITLES,   SUBTITLES,   LANDING_MODES,   isPlayRoute,   route} from './router.js';
import { boot,   loadReplay} from './data-loader.js';
import {} from './experiment-controls.js';
import {} from './integrity.js';
import { renderRanks } from './workspaces/ranks.js';
import { renderDiagnostics } from './workspaces/diagnostics.js';
import { renderBranches} from './workspaces/branches.js';
import { renderEvidence } from './workspaces/evidence.js';
import { renderIntelligence } from './workspaces/intelligence.js';
import { renderTournament } from './workspaces/tournament.js';
import { renderProfile } from './workspaces/profile.js';
import { renderCompare, renderMechanics, renderSynergies, renderHistory, renderReplays, renderTraces, renderCardFaces } from './workspaces/observatory.js';
import { installGlobalErrorBoundary, withErrorBoundary } from './error-boundary.js';
import { shouldShowTour, startTour } from './onboarding-tour.js';

// Install global error boundary at module load time
installGlobalErrorBoundary();

// ═══════════════════════════════════════════════════════════════
// MAIN RENDER DISPATCH
// ═══════════════════════════════════════════════════════════════
export function render() {
  const r = route();
  if (isPlayRoute(r)) {
    shell.style.display = 'none';
    if (landingContainer) landingContainer.style.display = 'block';
    document.title = 'Intrilex — Play';
    renderPlayMode(r);
    return;
  }
  if (LANDING_MODES.has(r)) {
    shell.style.display = 'none';
    if (landingContainer) landingContainer.style.display = 'block';
    document.title = r === '/' ? 'Intrilex — Play · Rules · Sim' : r === '/rules' ? 'Intrilex — Rules' : 'Intrilex';
    renderLandingMode(r);
    return;
  }
  shell.style.display = '';
  if (landingContainer) landingContainer.style.display = 'none';
  if (!state.replay) { loadReplay(state.fixtureId).then(render); return; }
  pageTitle.textContent = TITLES[r];
  pageSubtitle.textContent = SUBTITLES[r];
  const breadcrumbCurrent = document.querySelector('#breadcrumb-current');
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = TITLES[r] ?? 'Observatory';
  document.querySelectorAll('.workspace-link').forEach(link => link.classList.toggle('active', link.dataset.route === r));
  document.querySelector('#global-visibility').value = state.visibility;
  document.querySelector('#layout-preset').value = state.layout;
  shell.dataset.preset = state.layout;
  renderFilters();
  stopTransientFx();
  const renderers = {
    '/watch': renderWatch, '/replays': renderReplays, '/history': renderHistory,
    '/mechanics': renderMechanics, '/cards': renderCardFaces, '/synergies': renderSynergies,
    '/ranks': renderRanks, '/compare': renderCompare, '/traces': renderTraces,
    '/branches': renderBranches, '/diagnostics': renderDiagnostics, '/tournament': renderTournament, '/evidence': renderEvidence, '/profile': renderProfile, '/intelligence': renderIntelligence
  };
  try { (renderers[r] ?? renderEvidence)(); }
  catch (error) {
    console.error(`[render] Workspace error for ${r}:`, error);
    app.innerHTML = `<div class="notice danger"><strong>Workspace error.</strong><p>Failed to render ${esc(r)}.</p><pre>${esc(error.stack ?? error.message)}</pre></div>`;
  }
  // Trigger onboarding tour on first observatory visit
  if (shouldShowTour()) {
    // Defer to next frame so the workspace DOM is fully painted
    requestAnimationFrame(() => startTour());
  }
}

function renderLandingMode(r) {
  if (!landingContainer) return;
  if (r === '/') renderLanding();
  else if (r === '/rules') renderRules();
}

// ═══════════════════════════════════════════════════════════════
// PLAY MODULE — lazy-loaded
// ═══════════════════════════════════════════════════════════════
let _playModule = null;
let _boardCssLoaded = false;
async function renderPlayMode(r) {
  if (!landingContainer) return;
  if (!_playModule) {
    _playModule = await import('./play/play-app.js');
    // Load base play CSS (tokens, hub, setup, tutorial, network lobby, terminal) — needed for all play routes
    if (!document.querySelector('link[data-play-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'play/play-v3.css';
      link.dataset.playCss = '1';
      document.head.appendChild(link);
    }
  }
  // Load ranked-duel.css (competitive board layout) only for match routes
  // This defers ~88KB of CSS until the user actually enters a match
  if ((r === '/play/match' || r === '/play/online/match') && !_boardCssLoaded) {
    _boardCssLoaded = true;
    const rdLink = document.createElement('link');
    rdLink.rel = 'stylesheet';
    rdLink.href = 'play/ranked-duel.css?v=' + Date.now();
    rdLink.dataset.playCss = '1';
    document.head.appendChild(rdLink);
  }
  landingContainer.innerHTML = '<div id="play-root" class="play-root" tabindex="-1"></div>';
  const playRoot = landingContainer.querySelector('#play-root');
  const safeHandle = withErrorBoundary(_playModule.handlePlayRoute, playRoot, `play route ${r}`);
  await safeHandle(r, playRoot);
}

// ═══════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════
function renderLanding() {
  landingContainer.innerHTML = `<div class="landing-app">
    <div class="landing-aurora" aria-hidden="true"></div>
    <div class="landing-grid-bg" aria-hidden="true"></div>
    <a class="skip skip-link" href="#landing-main">Skip to content</a>
    <main id="landing-main" class="landing-hero" tabindex="-1">
      <p class="landing-eyebrow">DETERMINISTIC CARD ENGINE · v${RULES_VERSION}</p>
      <h1 class="landing-title">INTRILEX</h1>
      <p class="landing-tagline">A tactical card game of public score, disruption, and exactly-when spending. Build, counter, and time your way to the Goal.</p>
      <div class="landing-cards">
        <a class="landing-card play" href="#/play">
          <span class="landing-card-icon" aria-hidden="true">▶</span>
          <span class="landing-card-body"><strong>Play</strong><small>Play vs AI, run the First Contact tutorial, or browse your replay library.</small></span>
          <span class="landing-card-cta">Play now →</span>
        </a>
        <a class="landing-card rules" href="#/rules">
          <span class="landing-card-icon" aria-hidden="true">§</span>
          <span class="landing-card-body"><strong>Rules</strong><small>The complete player rulebook — all ten parts, every card, every ruling.</small></span>
          <span class="landing-card-cta">Read the rules →</span>
        </a>
        <a class="landing-card sim" href="#/sim">
          <span class="landing-card-icon" aria-hidden="true">◈</span>
          <span class="landing-card-body"><strong>Sim</strong><small>The rank intelligence observatory — watch, trace, and investigate deterministic matches.</small></span>
          <span class="landing-card-cta">Open observatory →</span>
        </a>
      </div>
    </main>
    <footer class="landing-footer">
      <span class="landing-footer-brand"><span class="brand-glyph" aria-hidden="true">IX</span> INTRILEX</span>
      <span>Engine ${ENGINE_VERSION} · Rules ${RULES_VERSION} · Pass/Priority hotfix</span>
      <span class="landing-footer-stamp"><span class="live-dot" aria-hidden="true"></span> Deterministic · hash-verified</span>
    </footer>
  </div>`;
}

function renderRules() {
  landingContainer.innerHTML = `<div class="landing-app rules-app">
    <a class="skip skip-link" href="#rules-main">Skip to content</a>
    <a class="back-button" href="#/" aria-label="Back to landing">← Back</a>
    <main id="rules-main" class="rules-main" tabindex="-1"></main>
  </div>`;
  renderRulesPage(landingContainer.querySelector('#rules-main'));
}

// ═══════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════
function renderFilters() {
  const chips = [];
  if (state.filters.profile !== 'all') chips.push(['Profile', state.filters.profile, () => state.filters.profile = 'all']);
  if (state.selectedMechanic) chips.push(['Mechanic', state.selectedMechanic, () => state.selectedMechanic = null]);
  if (state.selectedPolicy) chips.push(['Policy', state.selectedPolicy, () => state.selectedPolicy = null]);
  if (state.filters.evidence !== 'all') chips.push(['Evidence', state.filters.evidence, () => state.filters.evidence = 'all']);
  document.querySelector('#global-filter-bar').innerHTML = `<span class="eyebrow">COHORT</span>${chips.length ? `<span class="filter-count-badge" aria-label="${chips.length} active filters">${chips.length}</span>` : ''}${chips.length ? chips.map(([k, v], i) => `<span class="filter-chip"><b>${esc(k)}</b>${esc(v)}<button data-remove-filter="${i}" aria-label="Remove ${esc(k)} filter: ${esc(v)}">×</button></span>`).join('') : '<span class="footer-note">All compatible v' + RULES_VERSION + ' / Engine ' + ENGINE_VERSION + ' observations</span>'}<button id="clear-filters" class="ghost-button" ${chips.length ? '' : 'disabled'}>Clear</button>`;
  document.querySelectorAll('[data-remove-filter]').forEach(button => button.addEventListener('click', () => { chips[Number(button.dataset.removeFilter)][2](); render(); }));
  document.querySelector('#clear-filters').addEventListener('click', () => { state.selectedMechanic = null; state.selectedPolicy = null; state.filters = { profile: 'all', policy: 'all', outcome: 'all', evidence: 'all', search: '' }; render(); });
}

// ═══════════════════════════════════════════════════════════════
// WATCH WORKSPACE — playback engine (tightly coupled, stays inline)
// ═══════════════════════════════════════════════════════════════
function currentFrame() { return state.visibility === 'public' ? state.replay.frames[state.frame] : state.authorized?.frames[state.frame]; }
function currentState() { const frame = currentFrame(); if (!frame) return {}; if (state.visibility === 'public') return frame.state; if (state.visibility === 'player') return frame.playerViews?.[state.viewer] ?? {}; return frame.omniscientState ?? {}; }
export function stop() { state.playing = false; if (state.timer) clearInterval(state.timer); state.timer = null; }
export function togglePlay() { if (state.playing) { stop(); render(); return; } state.playing = true; state.timer = setInterval(() => { if (state.frame >= state.replay.frames.length - 1) { stop(); render(); return; } stepTo(state.frame + 1); }, Math.max(65, 700 / state.speed)); render(); }
function stepTo(index) { state.frame = clamp(index, 0, state.replay.frames.length - 1); state.selectedTimelineIndex = null; triggerFxForFrame(); render(); }
function commandAt(index) { return state.replay.commands?.[Math.max(0, index - 1)] ?? null; }
function commandAction(command) { return command?.action ?? command?.payload?.action ?? null; }
function frameEventTypes(frame) { return (frame?.events ?? (frame?.eventTypes ?? []).map(type => ({ type }))).map(event => event.type); }
function semanticForCommand(command, frame) {
  const action = commandAction(command), kind = String(action?.kind ?? command?.type ?? '').toLowerCase(), semantic = action?.semantic, types = frameEventTypes(frame);
  if (types.some(type => /RESPONSE_WINDOW_CLOSED/.test(type))) return 'engine-orchestration-summary';
  if (semantic === 'AUTOMATIC_PRIORITY_ADVANCE' || types.some(type => /AUTOMATIC_PRIORITY_ADVANCE/.test(type))) return 'engine-orchestration';
  if (semantic === 'DECLINE_RESPONSE' || types.some(type => /RESPONSE_DECLINED/.test(type)) || kind.includes('pass-priority')) return 'response-decline';
  if (kind.includes('private-choice') || kind.includes('hidden_choice')) return 'private-choice';
  if (/counter|disrupt|instant|quick|interrupt/.test(kind)) return 'free-response-play';
  if (/phase|complete-turn|begin-/.test(kind)) return 'phase-transition';
  if (types.some(t => /TRIGGER|VOLTAGE/.test(t))) return 'trigger';
  return 'mini-turn-action';
}
function semanticLabel(command, frame) {
  const cls = semanticForCommand(command, frame), action = commandAction(command), types = frameEventTypes(frame);
  if (types.some(type => /RESPONSE_WINDOW_CLOSED/.test(type))) return 'Response window closed — no responses';
  if (cls === 'engine-orchestration') return 'Response priority advanced automatically';
  if (cls === 'response-decline') return `${command?.actorId ?? 'Player'} declined a legal response`;
  if (types.some(type => /EXHAUSTED_PASS/.test(type))) return `${command?.actorId ?? 'Player'} took the forced Exhausted Pass`;
  const key = String(action?.kind ?? command?.type ?? 'Initial state').replace(/^(core|autonomy)-/, '').replaceAll('-', ' ');
  return key.replace(/\b\w/g, c => c.toUpperCase());
}
function visibleTimeline() {
  const items = state.replay.frames.map((frame, index) => ({ index, frame, command: index ? state.replay.commands[index - 1] : null, class: semanticForCommand(index ? state.replay.commands[index - 1] : null, frame) }));
  return items.filter(item => state.showOrchestration || item.class !== 'engine-orchestration');
}
function triggerFxForFrame() { if (!state.fx || state.reducedMotion || state.reducedSensory) return; const types = frameEventTypes(state.replay.frames[state.frame]); let cls = ''; if (types.some(t => /ULTRA/.test(t))) cls = 'fx-ultra'; else if (types.some(t => /COUNTER/.test(t))) cls = 'fx-counter'; else if (types.some(t => /SCORE|GOAL/.test(t))) cls = 'fx-score'; else if (types.some(t => /REJECT|INVARIANT/.test(t))) cls = 'fx-error'; if (cls) { fxLayer.className = `fx-layer ${cls}`; setTimeout(() => fxLayer.className = 'fx-layer', 650); } }
function stopTransientFx() { if (!state.fx) fxLayer.className = 'fx-layer'; }
function cardPoint(card) { if (Number.isFinite(card?.state?.pointValue)) return card.state.pointValue; const rank = String(card?.identity ?? '').replace(/[♣♦♥♠]/gu, ''); return Number(rank) || ({ A: 4, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 }[rank] ?? 0); }
function secured(s, player) { return (player?.pr ?? []).reduce((sum, id) => { const c = s.cards?.[id]; return sum + (c?.state?.tapped ? 0 : cardPoint(c)); }, 0); }
function markerList(card) { return [card?.state?.tapped ? 'TAP' : '', card?.state?.aegis || card?.state?.aegisExpiresAt ? 'AEGIS' : '', card?.state?.providesGuard ? 'GUARD' : '', card?.state?.anchorValue !== undefined ? 'ANCHOR' : '', card?.state?.exileBound ? 'EXILE' : '', card?.state?.jackHostId ? 'ATTACH' : ''].filter(Boolean); }
function cardToken(s, id) {
  const card = s.cards?.[id] ?? {}, drawPileHidden = (card.zone === 'DP' || card.zone === 'dp') && state.visibility !== 'judge', hidden = drawPileHidden || !card.identity || card.identity === 'HIDDEN', identity = hidden ? '◆' : card.identity, markers = hidden ? [] : markerList(card), match = String(identity).match(/^(10|[A2-9JQK])([♣♦♥♠])$/u), rank = match?.[1] ?? identity, suit = match?.[2] ?? '', suitClass = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' }[suit] ?? 'neutral', red = /[♦♥]|RJ/.test(card.identity ?? '');
  return `<button class="card-token ${hidden ? 'hidden' : ''} ${red ? 'red' : ''} suit-${suitClass}" data-card="${esc(id)}" data-identity="${hidden ? 'HIDDEN' : esc(card.identity ?? 'HIDDEN')}" ${hidden ? 'data-private-label="Private card — not visible in this view"' : ''} aria-label="${hidden ? 'Hidden card, private — not visible in this view' : `Card ${card.identity}`}${markers.length ? `, ${markers.join(', ')}` : ''}"><b class="token-rank">${esc(rank)}</b>${suit ? `<span class="token-suit" aria-hidden="true">${esc(suit)}</span>` : ''}<small>${esc(hidden ? 'private' : id)}</small><span class="card-markers">${markers.map(x => `<span class="card-marker">${x}</span>`).join('')}</span></button>`;
}
function zone(s, title, ids = [], className = '') { return `<section class="zone ${className}"><h4>${esc(title)} · ${ids.length}</h4><div class="cards">${ids.length ? ids.map(id => cardToken(s, id)).join('') : '<span class="footer-note">Empty</span>'}</div></section>`; }
function playerBoard(s, player, id) {
  if (!player) return '';
  const points = secured(s, player);
  return `<div class="player-board"><div class="player-header"><span class="player-seat">${esc(id)}</span><span class="player-score">${points} pts · Goal ${player.goal ?? 0}</span></div><div class="player-zones">${zone(s, 'Point Row', player.pr ?? [], 'pr')}${zone(s, 'Effect Row', player.er ?? [], 'er')}${zone(s, 'Hand', player.hand ?? [], 'hand')}</div></div>`;
}
function renderWatch() {
  if (!state.replay || !state.replay.frames) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">◈</span><strong>No replay loaded.</strong><p>Select a replay from the Replays workspace or run a campaign.</p><a class="primary-button empty-action" href="#/replays">Browse replays</a></div>'; return; }
  const frame = currentFrame(), s = currentState(), timeline = visibleTimeline(), total = state.replay.frames.length - 1;
  const players = s.turnOrder ?? Object.keys(s.players ?? {});
  const currentCmd = commandAt(state.frame);
  const currentLabel = state.frame === 0 ? 'Initial state' : semanticLabel(currentCmd, frame);
  const currentClass = state.frame === 0 ? '' : semanticForCommand(currentCmd, frame);
  app.innerHTML = `<div class="watch-layout">
    <div class="watch-controls">
      <div class="transport" role="group" aria-label="Playback transport"><button id="step-prev" ${state.frame === 0 ? 'disabled' : ''} title="Previous frame" aria-label="Previous frame">◀</button><button id="play-toggle" aria-label="${state.playing ? 'Pause' : 'Play'}">${state.playing ? '⏸' : '▶'}</button><button id="step-next" ${state.frame >= total ? 'disabled' : ''} title="Next frame" aria-label="Next frame">▶</button><button id="step-end" ${state.frame >= total ? 'disabled' : ''} title="Skip to end" aria-label="Skip to end">⏭</button></div>
      <div class="progress"><input type="range" id="frame-slider" aria-label="Replay frame slider" min="0" max="${total}" value="${state.frame}"><span>${state.frame}/${total}</span></div>
      <div class="speed-control"><label>Speed<select id="play-speed"><option value="1" ${state.speed === 1 ? 'selected' : ''}>1×</option><option value="2" ${state.speed === 2 ? 'selected' : ''}>2×</option><option value="4" ${state.speed === 4 ? 'selected' : ''}>4×</option><option value="8" ${state.speed === 8 ? 'selected' : ''}>8×</option></select></label></div>
      <div class="current-action ${currentClass}"><span class="action-label">${esc(currentLabel)}</span></div>
    </div>
    <div class="watch-board">${players.map(id => playerBoard(s, s.players?.[id], id)).join('')}</div>
    <div class="watch-timeline"><div class="timeline-header">Timeline</div><div class="timeline-items">${timeline.map(item => {
      const isCurrent = item.index === state.frame;
      const label = item.index === 0 ? 'Start' : semanticLabel(item.command, item.frame);
      return `<button class="timeline-item ${item.class} ${isCurrent ? 'current' : ''}" data-frame="${item.index}" title="${esc(label)}" aria-current="${isCurrent ? 'true' : 'false'}"><span class="timeline-dot" aria-hidden="true"></span><span class="timeline-label">${esc(label)}</span></button>`;
    }).join('')}</div></div>
  </div>`;
  document.querySelector('#play-toggle').onclick = togglePlay;
  document.querySelector('#step-prev').onclick = () => stepTo(state.frame - 1);
  document.querySelector('#step-next').onclick = () => stepTo(state.frame + 1);
  document.querySelector('#step-end').onclick = () => stepTo(total);
  document.querySelector('#frame-slider').oninput = e => stepTo(Number(e.target.value));
  document.querySelector('#play-speed').onchange = e => { state.speed = Number(e.target.value); };
  document.querySelectorAll('.timeline-item').forEach(btn => btn.onclick = () => stepTo(Number(btn.dataset.frame)));
  document.querySelectorAll('.card-token').forEach(btn => btn.onclick = () => {
    const identity = btn.dataset.identity;
    if (identity && identity !== 'HIDDEN') {
      const def = getCardDefinition(identity);
      if (def) {
        const dialog = document.querySelector('#card-face-dialog');
        document.querySelector('#card-face-dialog-title').textContent = identity;
        document.querySelector('#card-face-dialog-content').innerHTML = renderCardFace(identity, 'full');
        dialog.showModal();
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// EXTRACT — analysis export
// ═══════════════════════════════════════════════════════════════
export async function showExtract(format) {
  if (!state._extractModule) {
    app.innerHTML = '<div class="notice warning"><strong>Extract module not loaded.</strong></div>';
    return;
  }
  try {
    const result = await state._extractModule.extractAnalysis(state.observatory, format);
    await navigator.clipboard.writeText(result);
    app.innerHTML = `<div class="notice supported"><strong>Analysis copied to clipboard.</strong><p>${format === 'json' ? 'JSON' : 'Markdown'} extract is now in your clipboard.</p></div>`;
    showToast(`${format === 'json' ? 'JSON' : 'Markdown'} extract copied to clipboard`, { type: 'success', title: 'Analysis copied' });
    setTimeout(() => render(), 3000);
  } catch (err) {
    app.innerHTML = `<div class="notice danger"><strong>Extract failed:</strong> ${esc(err.message)}</div>`;
    showToast(err.message ?? 'Extract failed', { type: 'error', title: 'Extract failed' });
  }
}

// ═══════════════════════════════════════════════════════════════
// BOOT — entry point
// ═══════════════════════════════════════════════════════════════

// Set up hashchange listener BEFORE boot, so play routes (which return
// early from boot without calling bindGlobal) still respond to navigation.
window.addEventListener('hashchange', () => { render(); });

boot().then(() => {
  render();
});
