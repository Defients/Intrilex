// ═══════════════════════════════════════════════════════════════
// caster-workspace.js — Replay Caster browser workspace.
//
// Provides the "live broadcast" experience for completed AI-vs-AI
// matches with synchronized commentary. Uses a Web Worker to generate
// the match (reusing the tournament worker protocol), then loads the
// completed result into a CasterSession for playback + commentary.
//
// Authority: the match is ALWAYS generated in the worker BEFORE
// playback. Commentary never generates or resolves gameplay. No LLM
// output is sent to the engine. The Caster is purely observational.
//
// Safe rendering: all commentary text is rendered via textContent or
// esc() — never raw innerHTML with model output.
// ═══════════════════════════════════════════════════════════════

import { esc, state } from '../state.js?v=e09244683def';
import { policyOptions } from '../router.js?v=e09244683def';
import { listReplays, getReplay, isIndexedDBAvailable } from '../play/persistence.js?v=e09244683def';
import { reconstructReplayFrames } from '../replay-frames.js?v=e09244683def';
import { mountGameTable } from '../client/mount.tsx?v=e09244683def';

// Lazy-loaded @intrilex/replay-caster (browser-bundleable subset).
let casterModule = null;
async function getCaster() {
  if (!casterModule) {
    casterModule = await import('../replay-caster/browser-entry.js?v=e09244683def');
  }
  return casterModule;
}

// Investigation workflow functions (lazy-loaded with caster module).
let investigationFns = null;
async function getInvestigation() {
  if (!investigationFns) {
    const mod = await getCaster();
    investigationFns = {
      createInvestigation: mod.createInvestigation,
      transitionToInvestigating: mod.transitionToInvestigating,
      addBranch: mod.addBranch,
      addAnnotation: mod.addAnnotation,
      addComparison: mod.addComparison,
      checkInvalidation: mod.checkInvalidation,
      exportInvestigation: mod.exportInvestigation,
      getInvestigationSummary: mod.getInvestigationSummary,
      InvestigationStatus: mod.InvestigationStatus,
    };
  }
  return investigationFns;
}

// Current engine authority hash (from engine manifest, loaded once).
let _authorityHash = null;
async function getAuthorityHash() {
  if (_authorityHash !== null) return _authorityHash;
  try {
    const res = await fetch('config/engine-manifest.json');
    if (res.ok) {
      const manifest = await res.json();
      _authorityHash = manifest.authorityHash ?? null;
    }
  } catch { /* offline / dev — no manifest available */ }
  return _authorityHash;
}

// Lazy-loaded strictView from autonomy-runtime (for building authorized player views
// from raw engine state). Cached after first load.
let _strictViewFn = null;
async function getStrictView() {
  if (!_strictViewFn) {
    const mod = await import('../autonomy-runtime.js?v=e09244683def');
    _strictViewFn = mod.strictView;
  }
  return _strictViewFn;
}

// ── Frame state → Snapshot adapter ────────────────────────────────
//
// Converts a raw engine frame state (from CasterSession.frames[beat.frameIndex])
// into the snapshot shape expected by Astra's buildSemanticGame() (the React
// board). The adapter uses strictView() from autonomy-runtime to build the
// authorized player view (same function used by the play controller), so the
// snapshot's playerView matches exactly what Astra consumes in live play.
//
// The opponent's face-up hand (omniscient mode) is returned separately as
// `opponentHand` (Astra TableCard[]) so it can be passed via mountGameTable's
// opponentHand option, bypassing buildSemanticGame's privacy invariant
// (opponent hand is always empty in the semantic game).
//
// @param {object} frameState - Raw engine state from a replay frame
// @param {object} session - CasterSession instance
// @param {object} beat - Current playback beat
// @returns {{ snapshot: object, opponentHand: object[]|null }}

export async function frameStateToSnapshot(frameState, session, beat) {
  if (!frameState) return null;

  const omniscient = casterState.config.viewerMode === 'omniscient';
  const seatOrder = session.matchResult?.summary?.seatOrder || ['P1', 'P2'];
  const humanPlayerId = seatOrder[0] || 'P1';
  const opponentPlayerId = seatOrder[1] || 'P2';

  // Use strictView to build the authorized player view for the human player.
  // strictView's output shape ({actorId, own, opponents, revision, phase, ...})
  // is exactly Astra's playerView shape.
  const strictView = await getStrictView();
  const pv = strictView(frameState, humanPlayerId);

  const humanDisplayName = session.policyIds?.[0]?.replace(/-/g, ' ') || 'Seat 1';
  const opponentDisplayName = session.policyIds?.[1]?.replace(/-/g, ' ') || 'Seat 2';

  // Astra-format snapshot. status stays non-TERMINAL so the board renders
  // (even for MATCH_END beats — the Caster always shows the board).
  // decision is null → no legal actions → Astra shows a read-only table.
  const snapshot = {
    sessionId: session.matchId || `caster-${humanPlayerId}-${opponentPlayerId}`,
    status: 'AI_DECISION',
    playerView: pv,
    human: { playerId: humanPlayerId, displayName: humanDisplayName },
    opponent: { displayName: opponentDisplayName },
    match: { winner: null, terminationReason: null },
    decision: null,
    recentEvents: (beat?.visibleEvents ?? []).slice(-20).map(e => ({
      type: e.type,
      controllerId: e.controllerId ?? e.payload?.controllerId ?? null,
      payload: e.payload ?? null,
    })),
    handOrder: null,
    opponentHandReorderEpoch: 0,
  };

  // In omniscient mode, build face-up opponent hand cards (Astra TableCard[]).
  // In public mode, the opponent hand stays concealed (card backs only).
  let opponentHand = null;
  if (omniscient) {
    const oppPv = strictView(frameState, opponentPlayerId);
    opponentHand = (oppPv.own?.hand ?? []).map(cardViewToTableCard);
  }

  return { snapshot, opponentHand };
}

// Convert a strictView card object ({id, identity, controllerId, zone, pointValue, tapped, ...})
// into Astra's SemanticCard / TableCard format ({id, identity, label, markers}) so the React
// board can render it face-up in the opponent hand lane (Caster omniscient mode).
function cardViewToTableCard(card) {
  if (!card) return null;
  const identity = card.identity ?? null;
  const hidden = identity === null || identity === 'HIDDEN' || card.swapBarFaceDown || card.faceDown;
  const markers = [];
  if (card.tapped) markers.push('Tapped');
  if (card.aegis) markers.push('Aegis');
  if (card.providesGuard) markers.push('Guard');
  if (card.exileBound) markers.push('Exile-bound');
  if (hidden) markers.push('Face down');
  return {
    id: hidden ? `hidden:caster:opp:${card.id}` : card.id,
    identity: hidden ? null : identity,
    label: hidden ? 'Hidden card' : identity,
    markers,
  };
}

// ── Caster workspace state ────────────────────────────────────────
const casterState = {
  session: null,
  worker: null,
  loading: false,
  loadingMessage: '',
  error: null,
  commentaryText: '',
  commentaryHeadline: '',
  commentaryTone: '',
  commentaryError: null,
  commentaryLoading: false,
  waitWhatCapture: null,
  waitWhatVisible: false,
  waitWhatInvestigation: null,
  waitWhatInvalidated: false,
  waitWhatAnnotationText: '',
  waitWhatExportResult: null,
  config: {
    p1Policy: 'hybrix-baseline',
    p2Policy: 'hybrix-rusher',
    seed: 42,
    decisionLimit: 600,
    mode: 'BROADCAST',
    viewerMode: 'public',
    speed: 1
  },
  timer: null,
  ollamaEnabled: false,
  ollamaModel: '',
  ollamaStatus: null,
  savedReplays: [],
  replaysLoaded: false,
  gameplaySkin: 'dark',
  renderToken: 0,
  tacticalMount: null // Active Astra board mount controller (null when unmounted)
};

// ── Main render entry point ───────────────────────────────────────

export async function renderCaster(appEl) {
  // Ensure the module is loaded (for the browser entry).
  await getCaster();

  // Pre-load strictView so frameStateToSnapshot is fast on subsequent calls.
  await getStrictView();

  // Load saved replays from IndexedDB for the library section.
  await loadSavedReplays();

  if (casterState.error) {
    disposeTacticalMount();
    renderError(appEl, casterState.error);
    return;
  }

  if (casterState.loading) {
    disposeTacticalMount();
    renderLoading(appEl);
    return;
  }

  if (!casterState.session) {
    disposeTacticalMount();
    renderSetup(appEl);
    return;
  }

  renderTheatre(appEl);
}

// Release the Astra board mount (if any) before rendering a non-theatre screen.
function disposeTacticalMount() {
  if (casterState.tacticalMount) {
    try { casterState.tacticalMount.dispose(); } catch { /* ignore */ }
    casterState.tacticalMount = null;
  }
}

// ── Replay library section ────────────────────────────────────────

async function loadSavedReplays() {
  if (casterState.replaysLoaded) return;
  if (!isIndexedDBAvailable()) {
    casterState.replaysLoaded = true;
    return;
  }
  try {
    const replays = await listReplays();
    casterState.savedReplays = replays.filter(r => r.certifiedReplay?.initialState && Array.isArray(r.certifiedReplay?.commands));
  } catch { /* IDB unavailable */ }
  casterState.replaysLoaded = true;
}

function renderReplayLibrarySection() {
  if (!casterState.replaysLoaded || casterState.savedReplays.length === 0) return '';
  const items = casterState.savedReplays.slice(0, 20).map(r => {
    const label = `${r.replayId} · ${r.winner || '?'} · ${r.decisionCount ?? '?'} decisions`;
    return `<option value="${esc(r.replayId)}">${esc(label)}</option>`;
  }).join('');
  return `<div class="caster-setup-game-section">
    <h3>Or load from Replay Library</h3>
    <div class="caster-setup-row">
      <label>Saved replay<select id="caster-replay-select">
        <option value="">— Select a saved replay —</option>
        ${items}
      </select></label>
      <button id="caster-load-replay" class="secondary-button" disabled>Load &amp; Cast</button>
    </div>
  </div>`;
}

// ── Setup screen (match configuration) ────────────────────────────

function renderSetup(appEl) {
  const c = casterState.config;
  appEl.innerHTML = `<section class="caster-setup-game">
    <div class="caster-setup-game-header">
      <h2>🎙 Replay Caster</h2>
      <p>Watch a completed AI-vs-AI match unfold live with synchronized commentary.</p>
    </div>
    <div class="caster-setup-game-body">
      <div class="caster-setup-game-vs-card">
        <div class="caster-setup-game-vs-seat">
          <div class="caster-setup-game-vs-label">SEAT 1</div>
          <select id="caster-p1" class="caster-setup-game-select">${policyOptions(c.p1Policy)}</select>
        </div>
        <div class="caster-setup-game-vs-divider">VS</div>
        <div class="caster-setup-game-vs-seat">
          <div class="caster-setup-game-vs-label">SEAT 2</div>
          <select id="caster-p2" class="caster-setup-game-select">${policyOptions(c.p2Policy)}</select>
        </div>
      </div>
      <div class="caster-setup-game-section">
        <h3>Match Parameters</h3>
        <div class="caster-setup-row">
          <label>Seed<input type="number" id="caster-seed" value="${c.seed}" min="0" max="999999"></label>
          <label>Decision Limit<input type="number" id="caster-decision-limit" value="${c.decisionLimit}" min="50" max="5000"></label>
        </div>
      </div>
      <div class="caster-setup-game-section">
        <h3>Commentary Settings</h3>
        <div class="caster-setup-row">
          <label>Mode<select id="caster-mode">
            <option value="BROADCAST" ${c.mode === 'BROADCAST' ? 'selected' : ''}>Broadcast (play-by-play + colour)</option>
            <option value="DEV_OBSERVATORY" ${c.mode === 'DEV_OBSERVATORY' ? 'selected' : ''}>Dev Observatory (anomaly-focused)</option>
          </select></label>
          <label>Viewer Mode<select id="caster-viewer-mode">
            <option value="public" ${c.viewerMode === 'public' ? 'selected' : ''}>Public (no hidden cards)</option>
            <option value="omniscient" ${c.viewerMode === 'omniscient' ? 'selected' : ''}>Omniscient (dev trace access)</option>
          </select></label>
        </div>
        <div class="caster-setup-row">
          <label>Speed<select id="caster-speed">
            <option value="0.5" ${c.speed === 0.5 ? 'selected' : ''}>0.5×</option>
            <option value="1" ${c.speed === 1 ? 'selected' : ''}>1×</option>
            <option value="1.5" ${c.speed === 1.5 ? 'selected' : ''}>1.5×</option>
            <option value="2" ${c.speed === 2 ? 'selected' : ''}>2×</option>
          </select></label>
          <label class="caster-ollama-toggle">
            <input type="checkbox" id="caster-ollama-enabled" ${casterState.ollamaEnabled ? 'checked' : ''}>
            Use Ollama commentator (optional, local)
          </label>
        </div>
        <div class="caster-ollama-config" id="caster-ollama-config" style="${casterState.ollamaEnabled ? '' : 'display:none'}">
          <label>Model<input type="text" id="caster-ollama-model" value="${esc(casterState.ollamaModel)}" placeholder="e.g. llama3.2"></label>
          <button id="caster-ollama-test" class="secondary-button">Test Connection</button>
          <span id="caster-ollama-status" class="caster-ollama-status">${casterState.ollamaStatus ? esc(casterState.ollamaStatus) : ''}</span>
        </div>
      </div>
      <div class="caster-setup-game-actions">
        <button id="caster-start" class="primary-button caster-setup-game-start">Generate &amp; Cast Match</button>
      </div>
      ${renderReplayLibrarySection()}
      <div class="caster-setup-note">
        <p>The match is fully generated before playback begins. Commentary never generates or resolves gameplay.
        Disabling Caster or Ollama does not change match results or hashes.</p>
      </div>
    </div>
  </section>`;

  // Wire up controls
  const $ = (id) => appEl.querySelector(`#${id}`);
  $('caster-p1').onchange = (e) => { c.p1Policy = e.target.value; };
  $('caster-p2').onchange = (e) => { c.p2Policy = e.target.value; };
  $('caster-seed').onchange = (e) => { c.seed = Number(e.target.value); };
  $('caster-decision-limit').onchange = (e) => { c.decisionLimit = Number(e.target.value); };
  $('caster-mode').onchange = (e) => { c.mode = e.target.value; };
  $('caster-viewer-mode').onchange = (e) => { c.viewerMode = e.target.value; };
  $('caster-speed').onchange = (e) => { c.speed = Number(e.target.value); };
  $('caster-ollama-enabled').onchange = (e) => {
    casterState.ollamaEnabled = e.target.checked;
    $('caster-ollama-config').style.display = e.target.checked ? '' : 'none';
  };
  $('caster-ollama-model').onchange = (e) => { casterState.ollamaModel = e.target.value; };
  $('caster-ollama-test').onclick = () => testOllama(appEl);
  $('caster-start').onclick = () => startMatch(appEl);

  // Replay library wiring
  const replaySelect = $('caster-replay-select');
  const replayLoadBtn = $('caster-load-replay');
  if (replaySelect && replayLoadBtn) {
    replaySelect.onchange = (e) => { replayLoadBtn.disabled = !e.target.value; };
    replayLoadBtn.onclick = () => {
      const replayId = replaySelect.value;
      if (replayId) loadSavedReplayIntoCaster(appEl, replayId);
    };
  }
}

// ── Loading screen ────────────────────────────────────────────────

function renderLoading(appEl) {
  appEl.innerHTML = `<section class="caster-setup-game">
    <div class="caster-setup-game-header">
      <h2>🎙 Replay Caster — Generating Match…</h2>
    </div>
    <div class="caster-setup-game-body">
      <div class="caster-setup-game-loading">
        <span class="loading-spinner" aria-hidden="true"></span>
        <strong>${esc(casterState.loadingMessage || 'Running match in worker…')}</strong>
        <small>The completed match will be replayed with live-style pacing.</small>
      </div>
    </div>
  </section>`;
}

// ── Error screen ──────────────────────────────────────────────────

function renderError(appEl, error) {
  appEl.innerHTML = `<section class="caster-setup-game">
    <div class="caster-setup-game-header">
      <h2>🎙 Replay Caster — Error</h2>
    </div>
    <div class="caster-setup-game-body">
      <div class="notice danger"><strong>Match generation failed.</strong><pre>${esc(String(error))}</pre></div>
      <button id="caster-back-setup" class="secondary-button">← Back to Setup</button>
    </div>
  </section>`;
  appEl.querySelector('#caster-back-setup').onclick = () => {
    casterState.error = null;
    renderSetup(appEl);
  };
}

// ── Theatre (main playback view) ──────────────────────────────────
//
// Renders the authentic game board using Astra (mountGameTable) with a custom
// right rail containing commentary (top) and replay transport controls (bottom).
// The board is read-only — no card interactions, no action bar. In omniscient
// mode the opponent's hand is rendered face-up via the opponentHand option.

async function renderTheatre(appEl) {
  const session = casterState.session;
  const beat = session.currentBeat;
  if (!beat) {
    appEl.innerHTML = '<div class="notice">No beat available.</div>';
    return;
  }

  const beats = session.beats;
  const idx = session.index;
  const total = beats.length - 1;
  const ps = beat.publicSummary || {};
  const policyIds = session.policyIds || [];

  // Render token: prevents stale async renders from overwriting newer content
  const myToken = ++casterState.renderToken;

  // Build snapshot from current beat's frame state
  const frame = session.frames?.[beat.frameIndex ?? 0];
  const frameState = frame?.state ?? frame?.omniscientState ?? null;
  if (!frameState) {
    if (myToken === casterState.renderToken) {
      appEl.innerHTML = '<div class="notice">No frame state available for this beat.</div>';
    }
    return;
  }

  let snapshot, opponentHand;
  try {
    const adapted = await frameStateToSnapshot(frameState, session, beat);
    snapshot = adapted.snapshot;
    opponentHand = adapted.opponentHand;
  } catch (err) {
    if (myToken === casterState.renderToken) {
      appEl.innerHTML = `<div class="notice danger"><strong>Failed to build game view.</strong><pre>${esc(String(err?.message || err))}</pre></div>`;
    }
    return;
  }

  // Guard: if a newer render was triggered while we were building the snapshot, abort
  if (myToken !== casterState.renderToken) return;

  // ── Build custom right rail HTML (commentary + transport controls) ──
  const railHtml = buildCasterRightRail(session, beat, idx, total, ps, policyIds);

  // ── Mount or update the Astra board ──
  // The Caster owns a persistent header (exit control) above the Astra host.
  // Astra renders the board + sidebar; the sidebar actions area is replaced
  // by the Caster rail (commentary + transport + WAIT WHAT) via railHtml.
  // In omniscient mode the opponent hand is shown face-up via opponentHand.
  const gameplaySkin = casterState.gameplaySkin || 'dark';
  const viewerLabel = casterState.config.viewerMode === 'omniscient' ? 'OMNISCIENT' : 'PUBLIC';

  if (!casterState.tacticalMount) {
    // First theatre render: lay out the persistent header + board host, then mount Astra.
    appEl.innerHTML = `<header class="caster-theatre-header" data-caster="1">
      <button class="caster-exit-button secondary-button" data-action="exit-caster" aria-label="Back to Observatory">← Observatory</button>
      <span class="caster-theatre-mode">${viewerLabel} · Caster</span>
    </header>
    <div class="caster-board-host" data-testid="caster-board-host"></div>`;

    // Wire header exit button (persistent — wired once at mount).
    const exitBtn = appEl.querySelector('[data-action="exit-caster"]');
    if (exitBtn) {
      exitBtn.onclick = () => {
        stopTimer();
        if (casterState.worker) { casterState.worker.terminate(); casterState.worker = null; }
        casterState.session = null;
        casterState.commentaryText = '';
        casterState.waitWhatCapture = null;
        casterState.waitWhatVisible = false;
        casterState.waitWhatInvestigation = null;
        casterState.waitWhatInvalidated = false;
        casterState.tacticalMount?.dispose();
        casterState.tacticalMount = null;
        renderSetup(appEl);
      };
    }

    const boardHost = appEl.querySelector('.caster-board-host');
    try {
      casterState.tacticalMount = mountGameTable(boardHost, snapshot, {
        submit: async () => ({ accepted: false }), // Caster is read-only — never submits.
        skin: gameplaySkin,
        opponentHand: opponentHand ?? undefined,
        railHtml,
      });
    } catch (err) {
      appEl.innerHTML = `<div class="notice danger"><strong>Failed to render the Astra board.</strong><pre>${esc(String(err?.message || err))}</pre></div>`;
      return;
    }
  } else {
    // Subsequent beat changes: update Astra in place with the new snapshot + rail.
    casterState.tacticalMount.update(snapshot, false, undefined, opponentHand ?? undefined, railHtml);
  }

  // ── Safe text rendering for commentary (avoid innerHTML with model output) ──
  // Astra re-renders the rail via flushSync in update(), so the commentary
  // elements are present in the DOM by the time we reach here.
  if (casterState.commentaryText) {
    const headlineEl = appEl.querySelector('[data-testid="caster-commentary-headline"]');
    const bodyEl = appEl.querySelector('[data-testid="caster-commentary-body"]');
    if (headlineEl) headlineEl.textContent = casterState.commentaryHeadline || '';
    if (bodyEl) bodyEl.textContent = casterState.commentaryText || '';
  }

  // ── Wire up controls within the right rail ──
  wireCasterRightRail(appEl, session, idx, total);

  // ── Wire WAIT WHAT panel if visible ──
  if (casterState.waitWhatVisible && casterState.waitWhatCapture) {
    appEl.querySelectorAll('.caster-ww-jump').forEach(btn => {
      btn.onclick = () => {
        const beatId = btn.dataset.beatId;
        if (beatId && session.jumpToBeat(beatId)) {
          casterState.waitWhatVisible = false;
          onBeatChange(appEl);
        }
      };
    });
    const closeWw = appEl.querySelector('#caster-ww-close');
    if (closeWw) closeWw.onclick = () => {
      casterState.waitWhatVisible = false;
      casterState.waitWhatInvestigation = null;
      casterState.waitWhatExportResult = null;
      renderTheatre(appEl);
    };

    // Render WAIT WHAT commentary text safely
    if (casterState.waitWhatCapture?.commentary) {
      const wwTextEl = appEl.querySelector('#caster-ww-commentary-text');
      if (wwTextEl) wwTextEl.textContent = casterState.waitWhatCapture.commentary;
    }

    // Wire annotation form
    wireWaitWhatAnnotation(appEl);

    // Wire export buttons
    wireWaitWhatExport(appEl);

    // Wire branch navigation
    appEl.querySelectorAll('.caster-ww-branch-btn').forEach(btn => {
      btn.onclick = () => {
        const actionId = btn.dataset.actionId;
        // Store the investigation context in state for the branches workspace
        state.branchContext = state.branchContext || {};
        state.branchContext.waitWhatInvestigation = casterState.waitWhatInvestigation;
        state.branchContext.waitWhatActionId = actionId;
        state.branchContext.waitWhatCaptureId = casterState.waitWhatCapture?.captureId;
        // Navigate to #/branches
        window.location.hash = '#/branches';
      };
    });
  }
}

// ── Build the custom right rail HTML ───────────────────────────────
//
// Replaces the Actions + Chat right rail with:
//   Top section (larger): Commentary display + WAIT WHAT
//   Bottom section (smaller): Replay transport controls + timeline

function buildCasterRightRail(session, beat, idx, total, ps, policyIds) {
  const isFinished = beat.beatKind === 'MATCH_END';
  const winner = ps.winner;

  // ── Commentary section (top, larger) ──
  const commentaryErr = casterState.commentaryError
    ? `<div class="caster-commentary-error" data-testid="caster-commentary-error">Commentary unavailable: ${esc(casterState.commentaryError)}</div>`
    : '';

  const commentaryLoading = casterState.commentaryLoading
    ? '<div class="caster-commentary-loading">Generating commentary…</div>'
    : '';

  const commentaryBlock = casterState.commentaryText
    ? `<div class="caster-commentary" data-testid="caster-commentary">
        <div class="caster-commentary-headline" data-testid="caster-commentary-headline"></div>
        <div class="caster-commentary-body" data-testid="caster-commentary-body"></div>
        <div class="caster-commentary-meta"><span class="caster-tone">${esc(casterState.commentaryTone || '')}</span></div>
      </div>`
    : '<div class="caster-commentary caster-commentary-silent">—</div>';

  // WAIT WHAT panel
  const ww = casterState.waitWhatVisible && casterState.waitWhatCapture
    ? renderWaitWhatPanel(casterState.waitWhatCapture, casterState.waitWhatInvestigation, casterState.waitWhatInvalidated)
    : '';

  // ── Transport controls section (bottom, smaller) ──

  // Timeline dots
  const timelineItems = session.beats.map((b, i) => {
    const isCurrent = i === idx;
    const label = beatLabel(b);
    const cls = b.beatKind === 'MATCH_END' ? 'caster-tl-end' :
                b.beatKind === 'MATCH_START' ? 'caster-tl-start' :
                b.beatKind === 'TURN_START' ? 'caster-tl-turn' :
                b.beatKind === 'RESPONSE' ? 'caster-tl-response' : 'caster-tl-decision';
    return `<button class="caster-tl-item ${cls} ${isCurrent ? 'current' : ''}" data-idx="${i}" title="${esc(label)}"><span class="caster-tl-dot"></span></button>`;
  }).join('');

  return `<div class="rd-right-rail-bottom-inner caster-right-rail" data-caster-rail="1">
    <div class="caster-rail-commentary-section">
      <div class="caster-rail-section-header">COMMENTARY ${isFinished && winner ? '· MATCH COMPLETE' : ''}</div>
      ${commentaryBlock}
      ${commentaryLoading}
      ${commentaryErr}
      <div class="caster-actions">
        <button id="caster-wait-what" class="caster-wait-what-btn" data-testid="caster-wait-what">WAIT WHAT?</button>
      </div>
      ${ww}
    </div>
    <div class="caster-rail-transport-section">
      <div class="caster-rail-section-header">REPLAY CONTROLS</div>
      <div class="caster-controls">
        <div class="transport" role="group" aria-label="Playback transport">
          <button id="caster-prev" ${idx <= 0 ? 'disabled' : ''} title="Previous beat" aria-label="Previous beat">◀</button>
          <button id="caster-play" aria-label="${session.director.playing ? 'Pause' : 'Play'}">${session.director.playing ? '⏸' : '▶'}</button>
          <button id="caster-next" ${idx >= total ? 'disabled' : ''} title="Next beat" aria-label="Next beat">▶</button>
          <button id="caster-end" ${idx >= total ? 'disabled' : ''} title="Skip to end" aria-label="Skip to end">⏭</button>
        </div>
        <div class="progress">
          <input type="range" id="caster-slider" aria-label="Beat slider" min="0" max="${total}" value="${idx}">
          <span data-testid="caster-progress">${idx}/${total}</span>
        </div>
        <div class="speed-control">
          <label>Speed<select id="caster-speed-ctrl">
            <option value="0.5" ${session.director.speed === 0.5 ? 'selected' : ''}>0.5×</option>
            <option value="1" ${session.director.speed === 1 ? 'selected' : ''}>1×</option>
            <option value="1.5" ${session.director.speed === 1.5 ? 'selected' : ''}>1.5×</option>
            <option value="2" ${session.director.speed === 2 ? 'selected' : ''}>2×</option>
          </select></label>
        </div>
        <div class="caster-current-beat" data-testid="caster-current-beat">
          <span class="caster-beat-kind">${esc(beat.beatKind)}</span>
          ${beat.seat ? `<span class="caster-beat-seat">Seat ${beat.seat}</span>` : ''}
          ${beat.turn != null ? `<span class="caster-beat-turn">Turn ${beat.turn}</span>` : ''}
          ${ps.scoreDelta ? `<span class="caster-beat-delta">+${ps.scoreDelta} pts</span>` : ''}
        </div>
      </div>
      <div class="caster-timeline" data-testid="caster-timeline">
        <div class="caster-timeline-items">${timelineItems}</div>
      </div>
      <div class="caster-rail-footer">
        <button id="caster-back-setup" class="secondary-button">← New Match</button>
      </div>
    </div>
  </div>`;
}

// ── Wire up right rail transport controls ──────────────────────────

function wireCasterRightRail(appEl, session, idx, total) {
  const $ = (id) => appEl.querySelector(`#${id}`);

  const prevBtn = $('caster-prev');
  if (prevBtn) prevBtn.onclick = () => { session.stepBackward(); onBeatChange(appEl); };

  const playBtn = $('caster-play');
  if (playBtn) playBtn.onclick = () => { session.toggle(); startTimer(appEl); renderTheatre(appEl); };

  const nextBtn = $('caster-next');
  if (nextBtn) nextBtn.onclick = () => { session.stepForward(); onBeatChange(appEl); };

  const endBtn = $('caster-end');
  if (endBtn) endBtn.onclick = () => { session.skipToEnd(); onBeatChange(appEl); };

  const slider = $('caster-slider');
  if (slider) slider.oninput = (e) => { session.director.stepTo(Number(e.target.value)); onBeatChange(appEl); };

  const speedCtrl = $('caster-speed-ctrl');
  if (speedCtrl) speedCtrl.onchange = (e) => { session.setSpeed(Number(e.target.value)); };

  appEl.querySelectorAll('.caster-tl-item').forEach(btn => {
    btn.onclick = () => { session.director.stepTo(Number(btn.dataset.idx)); onBeatChange(appEl); };
  });

  const waitWhatBtn = $('caster-wait-what');
  if (waitWhatBtn) waitWhatBtn.onclick = async () => {
    const capture = session.waitWhat();
    casterState.waitWhatCapture = capture;
    casterState.waitWhatVisible = true;
    // Create an investigation from the capture
    const { createInvestigation } = await getInvestigation();
    const authHash = await getAuthorityHash();
    casterState.waitWhatInvestigation = createInvestigation(capture, authHash);
    casterState.waitWhatInvalidated = false;
    casterState.waitWhatAnnotationText = '';
    casterState.waitWhatAnnotationSeverity = '';
    casterState.waitWhatExportResult = null;
    renderTheatre(appEl);
  };

  const backSetupBtn = $('caster-back-setup');
  if (backSetupBtn) backSetupBtn.onclick = () => {
    stopTimer();
    if (casterState.worker) { casterState.worker.terminate(); casterState.worker = null; }
    casterState.session = null;
    casterState.commentaryText = '';
    casterState.waitWhatCapture = null;
    casterState.waitWhatVisible = false;
    casterState.waitWhatInvestigation = null;
    casterState.waitWhatInvalidated = false;
    casterState.waitWhatExportResult = null;
    if (casterState.tacticalMount) {
      try { casterState.tacticalMount.dispose(); } catch { /* ignore */ }
      casterState.tacticalMount = null;
    }
    renderSetup(appEl);
  };
}

// ── WAIT WHAT panel ───────────────────────────────────────────────

function renderWaitWhatPanel(capture, investigation, invalidated) {
  const beforeItems = (capture.contextBefore || []).map(b =>
    `<li><button class="caster-ww-jump" data-beat-id="${esc(b.beatId)}">${esc(beatLabel(b))}</button></li>`
  ).join('');
  const afterItems = (capture.contextAfter || []).map(b =>
    `<li><button class="caster-ww-jump" data-beat-id="${esc(b.beatId)}">${esc(beatLabel(b))} ${b.redacted ? '🔒' : ''}</button></li>`
  ).join('');
  const diags = (capture.diagnostics || []).map(d =>
    `<li><strong>${esc(d.verdict)}</strong>: ${esc(d.observed)} <small>(${esc(d.category)})</small></li>`
  ).join('');

  // Legal alternatives from the capture
  const legalCount = capture.legalOptions?.[0]?.count;
  const legalAlternativesHtml = legalCount != null && legalCount > 1
    ? `<div class="caster-ww-alternatives" data-testid="caster-ww-alternatives">
        <h4>Legal Alternatives (${legalCount} options)</h4>
        <p class="caster-ww-alternatives-hint">${legalCount} legal actions were available at this decision point. Use the Branches workspace to explore counterfactual outcomes.</p>
        <button class="caster-ww-branch-btn secondary-button" data-action-id="runner-up" data-testid="caster-ww-branch-btn">Branch Runner-Up Action →</button>
      </div>`
    : '';

  // Investigation status and authority hash
  const invStatus = investigation?.status || 'BOOKMARKED';
  const authHash = investigation?.authorityHashAtCreation;
  const invalidationBanner = invalidated
    ? `<div class="caster-ww-invalidation notice danger" data-testid="caster-ww-invalidation">
        <strong>⚠ Investigation Invalidated</strong>
        <p>The engine authority hash has changed since this investigation was created. Branches and comparisons may be stale.</p>
      </div>`
    : '';

  // Annotation form
  const annotationText = casterState.waitWhatAnnotationText || '';
  const annotationSeverity = casterState.waitWhatAnnotationSeverity || '';
  const existingAnnotations = (investigation?.annotations || []).map(a =>
    `<li><strong>${esc(a.beatId || 'general')}</strong>: ${esc(a.text)}</li>`
  ).join('');

  const annotationFormHtml = `<div class="caster-ww-annotation-form" data-testid="caster-ww-annotation-form">
    <h4>Annotate</h4>
    <textarea id="caster-ww-annotation-text" placeholder="What caught your attention?" rows="2">${esc(annotationText)}</textarea>
    <select id="caster-ww-annotation-severity">
      <option value="" ${annotationSeverity === '' ? 'selected' : ''}>— Severity —</option>
      <option value="confirmed-defect" ${annotationSeverity === 'confirmed-defect' ? 'selected' : ''}>Confirmed defect</option>
      <option value="policy-oddity" ${annotationSeverity === 'policy-oddity' ? 'selected' : ''}>Policy oddity</option>
      <option value="legal-but-surprising" ${annotationSeverity === 'legal-but-surprising' ? 'selected' : ''}>Legal but surprising</option>
      <option value="insufficient-evidence" ${annotationSeverity === 'insufficient-evidence' ? 'selected' : ''}>Insufficient evidence</option>
    </select>
    <button id="caster-ww-annotation-save" class="secondary-button" data-testid="caster-ww-annotation-save">Save Annotation</button>
    ${existingAnnotations ? `<ul class="caster-ww-annotations-list">${existingAnnotations}</ul>` : ''}
  </div>`;

  // Export buttons
  const exportResultHtml = casterState.waitWhatExportResult
    ? `<div class="caster-ww-export-result notice" data-testid="caster-ww-export-result">
        <strong>Exported as ${esc(casterState.waitWhatExportResult.format)}</strong>
        <p>Investigation envelope downloaded.</p>
      </div>`
    : '';
  const exportButtonsHtml = `<div class="caster-ww-export" data-testid="caster-ww-export">
    <h4>Export Investigation</h4>
    <button id="caster-ww-export-json" class="secondary-button" data-testid="caster-ww-export-json">Export JSON</button>
    <button id="caster-ww-export-md" class="secondary-button" data-testid="caster-ww-export-md">Export Markdown</button>
    ${exportResultHtml}
  </div>`;

  return `<div class="caster-wait-what" data-testid="caster-wait-what-panel">
    <div class="caster-ww-header">
      <h3>WAIT WHAT — Investigation Envelope</h3>
      <button id="caster-ww-close" class="secondary-button">✕</button>
    </div>
    <div class="caster-ww-body">
      ${invalidationBanner}
      <div class="caster-ww-meta">
        <p><strong>Capture:</strong> ${esc(capture.captureId)}</p>
        <p><strong>Investigation:</strong> ${esc(investigation?.investigationId || '—')} · <strong>Status:</strong> ${esc(invStatus)}</p>
        <p><strong>Beat:</strong> ${esc(capture.casterBeatId || '—')} · <strong>Decision:</strong> ${esc(capture.decisionId || '—')}</p>
        <p><strong>Checkpoint:</strong> <code>${esc(capture.checkpointHash?.slice(0, 16) || '—')}</code></p>
        <p><strong>Viewer mode:</strong> ${esc(capture.viewerMode)} ${capture.redacted ? '· future redacted' : ''}</p>
        ${authHash ? `<p><strong>Authority hash:</strong> <code>${esc(authHash.slice(0, 16))}</code></p>` : ''}
      </div>
      ${diags ? `<div class="caster-ww-diagnostics"><h4>Diagnostics</h4><ul>${diags}</ul></div>` : ''}
      <div class="caster-ww-context">
        <div class="caster-ww-before"><h4>Before</h4><ul>${beforeItems || '<li>—</li>'}</ul></div>
        <div class="caster-ww-after"><h4>After</h4><ul>${afterItems || '<li>—</li>'}</ul></div>
      </div>
      ${legalAlternativesHtml}
      <div class="caster-ww-commentary">
        ${capture.commentary ? `<p><strong>Commentary:</strong> <span id="caster-ww-commentary-text"></span></p>` : '<p><em>No commentary for this beat.</em></p>'}
      </div>
      ${annotationFormHtml}
      ${exportButtonsHtml}
    </div>
  </div>`;
}

// ── WAIT WHAT annotation wiring ──────────────────────────────────

async function wireWaitWhatAnnotation(appEl) {
  const textArea = appEl.querySelector('#caster-ww-annotation-text');
  const severitySelect = appEl.querySelector('#caster-ww-annotation-severity');
  const saveBtn = appEl.querySelector('#caster-ww-annotation-save');
  if (!textArea || !saveBtn) return;

  textArea.oninput = (e) => { casterState.waitWhatAnnotationText = e.target.value; };
  if (severitySelect) {
    severitySelect.onchange = (e) => { casterState.waitWhatAnnotationSeverity = e.target.value; };
  }

  saveBtn.onclick = async () => {
    const text = casterState.waitWhatAnnotationText.trim();
    if (!text || !casterState.waitWhatInvestigation) return;
    const { addAnnotation } = await getInvestigation();
    const severityPrefix = casterState.waitWhatAnnotationSeverity
      ? `[${casterState.waitWhatAnnotationSeverity}] `
      : '';
    casterState.waitWhatInvestigation = addAnnotation(casterState.waitWhatInvestigation, {
      text: severityPrefix + text,
      beatId: casterState.waitWhatCapture?.casterBeatId ?? null,
    });
    casterState.waitWhatAnnotationText = '';
    casterState.waitWhatAnnotationSeverity = '';
    renderTheatre(appEl);
  };
}

// ── WAIT WHAT export wiring ──────────────────────────────────────

async function wireWaitWhatExport(appEl) {
  const jsonBtn = appEl.querySelector('#caster-ww-export-json');
  const mdBtn = appEl.querySelector('#caster-ww-export-md');
  if (!casterState.waitWhatInvestigation) return;

  if (jsonBtn) jsonBtn.onclick = async () => {
    const { exportInvestigation } = await getInvestigation();
    const { investigation, exportData, exportFormat } = exportInvestigation(casterState.waitWhatInvestigation, 'json');
    casterState.waitWhatInvestigation = investigation;
    casterState.waitWhatExportResult = { format: exportFormat };
    downloadInvestigation(exportData, 'json');
    renderTheatre(appEl);
  };

  if (mdBtn) mdBtn.onclick = async () => {
    const { exportInvestigation } = await getInvestigation();
    const { investigation, exportData, exportFormat } = exportInvestigation(casterState.waitWhatInvestigation, 'markdown');
    casterState.waitWhatInvestigation = investigation;
    casterState.waitWhatExportResult = { format: exportFormat };
    downloadInvestigation(exportData, 'md');
    renderTheatre(appEl);
  };
}

function downloadInvestigation(data, ext) {
  try {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: ext === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investigation-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { /* download not available */ }
}

// ── Beat change handler ───────────────────────────────────────────

async function onBeatChange(appEl) {
  const session = casterState.session;
  if (!session) return;

  // Show loading state and re-render the theatre immediately
  // (updates beat display, slider, timeline, clears old commentary)
  casterState.commentaryLoading = true;
  casterState.commentaryError = null;
  renderTheatre(appEl);

  try {
    const result = await session.generateCommentaryForCurrentBeat({
      onToken: (chunk) => {
        // Incremental streaming update — append to commentary body text.
        // Only update the DOM textContent (safe, no re-render needed).
        const bodyEl = appEl.querySelector('[data-testid="caster-commentary-body"]');
        if (bodyEl) {
          const current = bodyEl.textContent || '';
          bodyEl.textContent = current + chunk;
        }
        // Track streaming text so the final render preserves it.
        casterState.commentaryText = (casterState.commentaryText || '') + chunk;
      }
    });
    casterState.commentaryLoading = false;
    if (result.skipped) {
      casterState.commentaryText = '';
      casterState.commentaryHeadline = '';
      casterState.commentaryTone = '';
    } else if (result.ok && result.record) {
      casterState.commentaryText = result.record.commentary || '';
      casterState.commentaryHeadline = result.record.headline || '';
      casterState.commentaryTone = result.record.tone || '';
      casterState.commentaryError = null;
    } else {
      casterState.commentaryText = '';
      casterState.commentaryHeadline = '';
      casterState.commentaryTone = '';
      casterState.commentaryError = result.error || 'Unknown error';
    }
  } catch (err) {
    casterState.commentaryLoading = false;
    casterState.commentaryText = '';
    casterState.commentaryError = err?.message || String(err);
  }

  // Re-render with final commentary state (safe text rendering)
  renderTheatre(appEl);

  // Check WAIT WHAT investigation invalidation
  if (casterState.waitWhatVisible && casterState.waitWhatInvestigation) {
    const { checkInvalidation } = await getInvestigation();
    const authHash = await getAuthorityHash();
    const checked = checkInvalidation(casterState.waitWhatInvestigation, authHash);
    if (checked.status === 'INVALIDATED' && !casterState.waitWhatInvalidated) {
      casterState.waitWhatInvestigation = checked;
      casterState.waitWhatInvalidated = true;
      renderTheatre(appEl);
    }
  }

  // Render WAIT WHAT commentary text safely
  if (casterState.waitWhatVisible && casterState.waitWhatCapture?.commentary) {
    const wwTextEl = appEl.querySelector('#caster-ww-commentary-text');
    if (wwTextEl) wwTextEl.textContent = casterState.waitWhatCapture.commentary;
  }
}

// ── Playback timer ────────────────────────────────────────────────

function startTimer(appEl) {
  stopTimer();
  casterState.timer = setInterval(() => {
    const session = casterState.session;
    if (!session) { stopTimer(); return; }
    const advanced = session.tick();
    if (advanced) {
      onBeatChange(appEl);
    } else if (!session.director.playing) {
      stopTimer();
      renderTheatre(appEl);
    }
  }, 100);
}

function stopTimer() {
  if (casterState.timer) {
    clearInterval(casterState.timer);
    casterState.timer = null;
  }
}

// ── Match generation (via Web Worker) ─────────────────────────────

async function buildProvider() {
  const { DeterministicCommentaryProvider, OllamaCommentaryProvider } = await getCaster();
  if (casterState.ollamaEnabled && casterState.ollamaModel) {
    const client = await getBrowserOllamaClient();
    return new OllamaCommentaryProvider({
      model: casterState.ollamaModel,
      client,
      temperature: 0.4,
      stream: true
    });
  }
  return new DeterministicCommentaryProvider();
}

async function buildAndLoadSession(appEl, matchResult, frames) {
  const { CasterSession, COMMENTARY_MODE, VIEWER_MODE } = await getCaster();
  const c = casterState.config;
  const provider = await buildProvider();
  const session = new CasterSession({
    provider,
    mode: c.mode === 'DEV_OBSERVATORY' ? COMMENTARY_MODE.DEV_OBSERVATORY : COMMENTARY_MODE.BROADCAST,
    viewerMode: c.viewerMode === 'omniscient' ? VIEWER_MODE.OMNISCIENT : VIEWER_MODE.PUBLIC,
    settings: { model: casterState.ollamaModel || null, density: 'normal' }
  });
  session.loadCompletedMatch(matchResult, frames);
  session.setSpeed(c.speed);
  casterState.session = session;
  casterState.loading = false;
  await renderTheatre(appEl);
  await onBeatChange(appEl);
}

async function startMatch(appEl) {
  const c = casterState.config;
  casterState.loading = true;
  casterState.loadingMessage = 'Running match in worker…';
  casterState.error = null;
  renderLoading(appEl);

  try {
    // Run the match in a Web Worker (reuses the tournament worker protocol).
    const matchResult = await runMatchInWorker({
      seed: c.seed,
      policyIds: [c.p1Policy, c.p2Policy],
      decisionLimit: c.decisionLimit,
      profileId: 'core-advanced-authority'
    });

    // Reconstruct frames in the main thread using the browser engine.
    const frames = await reconstructReplayFrames(matchResult.replay);

    await buildAndLoadSession(appEl, matchResult, frames);
  } catch (err) {
    casterState.loading = false;
    casterState.error = err?.message || String(err);
    renderError(appEl, casterState.error);
  }
}

// ── Load a saved replay from IndexedDB ────────────────────────────

async function loadSavedReplayIntoCaster(appEl, replayId) {
  casterState.loading = true;
  casterState.loadingMessage = `Loading replay ${replayId}…`;
  casterState.error = null;
  renderLoading(appEl);

  try {
    const record = await getReplay(replayId);
    if (!record || !record.certifiedReplay) {
      throw new Error('Replay not found or missing certified replay data');
    }

    // Reconstruct frames from the certified replay.
    const frames = await reconstructReplayFrames(record.certifiedReplay);
    if (frames.length === 0) {
      throw new Error('Could not reconstruct frames from certified replay');
    }

    // Build a matchResult shape that loadCompletedMatch expects.
    // Certified replays store initialState + commands but not a full
    // summary. We derive a minimal summary from the replay record.
    const certified = record.certifiedReplay;
    const matchResult = {
      summary: {
        matchId: record.sessionId || replayId,
        seed: record.seed ?? certified.seed ?? null,
        profileId: record.profileId || 'core-advanced-authority',
        seatOrder: ['P1', 'P2'],
        policyIds: record.aiPolicyId ? [record.humanPlayerId || 'human', record.aiPolicyId] : ['unknown', 'unknown'],
        winner: record.winner || null,
        terminationReason: record.terminationReason || null,
        finalStateHash: certified.finalStateHash ?? null,
        matchResultHash: certified.integrityHash ?? certified.contentHash ?? null,
        finalScores: certified.finalScores ?? {},
        completedFullTurns: record.fullTurnSequence ?? null
      },
      decisions: [],
      replay: certified,
      decisionTraces: null
    };

    await buildAndLoadSession(appEl, matchResult, frames);
  } catch (err) {
    casterState.loading = false;
    casterState.error = err?.message || String(err);
    renderError(appEl, casterState.error);
  }
}

function runMatchInWorker(config) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('worker.js', { type: 'module' });
    casterState.worker = worker;
    worker.onmessage = (e) => {
      const x = e.data;
      if (x.type === 'autonomy-match-result') {
        worker.terminate();
        casterState.worker = null;
        if (x.ok) resolve(x.result);
        else reject(new Error(x.error || 'worker error'));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      casterState.worker = null;
      reject(new Error(e.message || 'worker error'));
    };
    worker.postMessage({
      type: 'run-autonomy-match',
      config: { ...config, recordReplay: true },
      enableTraces: true
    });
  });
}

// ── Minimal browser Ollama client ─────────────────────────────────
// The analytics-ai OllamaClient lives in a package .mjs that is only
// copied to dist/analytics-ai/ at build time — it is not importable
// from this esbuild-bundled module. Instead, we create a minimal
// self-contained client that implements the same chat/testConnection
// interface the OllamaCommentaryProvider expects.
//
// The endpoint is read from the same localStorage key the Analytics AI
// settings panel uses ('intrilex-analytics-ai-settings'), so the user's
// configured endpoint is shared between both workspaces.

const OLLAMA_SETTINGS_KEY = 'intrilex-analytics-ai-settings';
const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

function getStoredOllamaEndpoint() {
  try {
    const raw = localStorage.getItem(OLLAMA_SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.endpoint === 'string' && s.endpoint.trim()) return s.endpoint.trim();
    }
  } catch { /* ignore */ }
  return DEFAULT_OLLAMA_ENDPOINT;
}

class BrowserOllamaClient {
  constructor({ endpoint, timeoutMs = 60000 } = {}) {
    this.endpoint = (endpoint || getStoredOllamaEndpoint()).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async _request(path, opts = {}) {
    const url = `${this.endpoint}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('ollama-timeout')), this.timeoutMs);
    if (opts.signal) {
      if (opts.signal.aborted) { clearTimeout(timer); throw Object.assign(new Error('cancelled'), { category: 'CANCELLED' }); }
      opts.signal.addEventListener('abort', () => controller.abort(new Error('cancelled-by-caller')), { once: true });
    }
    try {
      const response = await fetch(url, {
        method: opts.method || 'GET',
        headers: opts.headers || (opts.body ? { 'content-type': 'application/json' } : undefined),
        body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
        signal: controller.signal
      });
      return response;
    } catch (err) {
      const aborted = controller.signal.aborted;
      const reason = controller.signal.reason?.message || '';
      if (aborted && reason === 'cancelled-by-caller') {
        throw Object.assign(new Error('Request cancelled by caller'), { category: 'CANCELLED' });
      }
      if (aborted || /timeout/i.test(reason)) {
        throw Object.assign(new Error(`Request timed out after ${this.timeoutMs}ms`), { category: 'TIMEOUT' });
      }
      throw Object.assign(new Error(`Cannot reach Ollama at ${this.endpoint}: ${err?.message || err}`), { category: 'UNREACHABLE' });
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection({ signal } = {}) {
    try {
      const res = await this._request('/api/version', { signal });
      if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, endpoint: this.endpoint };
      let version = null;
      try { version = await res.json(); } catch { /* ignore */ }
      return { ok: true, status: res.status, version, endpoint: this.endpoint };
    } catch (err) {
      return { ok: false, status: null, error: err?.category || 'UNKNOWN', message: err?.message, endpoint: this.endpoint };
    }
  }

  async chat({ model, messages, options = {}, stream = false, onToken, signal } = {}) {
    if (!model) throw Object.assign(new Error('No model selected'), { category: 'MODEL_NOT_FOUND' });
    const body = { model, messages, stream, options: { temperature: options.temperature ?? 0.4, num_predict: options.num_predict ?? 512, ...options } };
    const res = await this._request('/api/chat', { method: 'POST', body, signal });
    if (res.status === 404) {
      throw Object.assign(new Error(`Model "${model}" not found on Ollama server`), { category: 'MODEL_NOT_FOUND' });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw Object.assign(new Error(`Ollama chat failed: HTTP ${res.status} ${text.slice(0, 200)}`), { category: 'HTTP_ERROR' });
    }
    if (!stream) {
      let data = null;
      try { data = await res.json(); } catch {
        throw Object.assign(new Error('Malformed JSON response from Ollama'), { category: 'MALFORMED_RESPONSE' });
      }
      const text = data?.message?.content ?? data?.response ?? '';
      return { text, done: true, rawChunks: [] };
    }
    // Streaming: read NDJSON lines
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    const rawChunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          rawChunks.push(chunk);
          if (chunk.message?.content) text += chunk.message.content;
          if (typeof onToken === 'function') onToken(chunk.message?.content || '');
        } catch { /* skip malformed line */ }
      }
    }
    return { text, done: true, rawChunks };
  }
}

async function getBrowserOllamaClient() {
  return new BrowserOllamaClient({});
}

async function testOllama(appEl) {
  const statusEl = appEl.querySelector('#caster-ollama-status');
  if (statusEl) statusEl.textContent = 'Testing…';
  try {
    const { OllamaCommentaryProvider } = await getCaster();
    const client = await getBrowserOllamaClient();
    const provider = new OllamaCommentaryProvider({ model: casterState.ollamaModel || 'test', client });
    const result = await provider.testConnection();
    if (result.ok) {
      casterState.ollamaStatus = 'Connected ✓';
    } else {
      casterState.ollamaStatus = `Failed: ${result.error || result.message || 'unreachable'}`;
    }
  } catch (err) {
    casterState.ollamaStatus = `Error: ${err.message}`;
  }
  if (statusEl) statusEl.textContent = casterState.ollamaStatus;
}

// ── Helpers ───────────────────────────────────────────────────────

function beatLabel(beat) {
  if (!beat) return '—';
  if (beat.beatKind === 'MATCH_START') return 'Match Start';
  if (beat.beatKind === 'MATCH_END') return 'Match End';
  if (beat.beatKind === 'TURN_START') return `Turn ${beat.turn ?? '?'}`;
  if (beat.beatKind === 'RESPONSE') return `Response · Seat ${beat.seat ?? '?'}`;
  const family = beat.action?.family;
  return family ? `${family} · Seat ${beat.seat ?? '?'}` : `Decision · Seat ${beat.seat ?? '?'}`;
}

// ── Cleanup (called on route change) ──────────────────────────────
//
// Preserves the session so the user can return to the Caster and resume
// playback where they left off. Only stops the timer and terminates any
// in-flight worker. The session, commentary cache, commentary history,
// and playback position all survive the route change.

export function cleanupCaster() {
  stopTimer();
  if (casterState.worker) {
    casterState.worker.terminate();
    casterState.worker = null;
  }
  // Dispose the Astra board mount (if active) to release its React root.
  if (casterState.tacticalMount) {
    try { casterState.tacticalMount.dispose(); } catch { /* ignore */ }
    casterState.tacticalMount = null;
  }
  // Pause playback but preserve the session for resume.
  if (casterState.session) {
    try { casterState.session.pause(); } catch { /* ignore */ }
  }
  casterState.waitWhatVisible = false;
  casterState.waitWhatInvestigation = null;
  casterState.waitWhatInvalidated = false;
  casterState.waitWhatExportResult = null;
}
