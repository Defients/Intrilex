// ═══════════════════════════════════════════════════════════════
// caster-workspace.js — Replay Caster browser workspace (V2).
//
// Explicit three-stage broadcast experience:
//
//     SETUP → PREPARE BROADCAST → CAST / PLAYBACK
//
// Provides the "live broadcast" presentation for COMPLETED AI-vs-AI
// matches with pre-generated commentary. A Web Worker generates the
// match (reusing the tournament worker protocol); the completed result
// is verified, reconstructed into frames, assembled into a CasterSession
// (beats + cumulative event index), and commentary for every
// commentary-worthy beat is generated BEFORE playback begins.
//
// Authority: the match is ALWAYS fully generated before playback.
// Commentary never generates or resolves gameplay. No LLM output is
// sent to the engine. Commentary output is never part of replay
// identity or hashes. Privacy-redacted replay artifacts never get
// hand identities fabricated — per-seat hand toggles are purely
// presentational over authorized evidence only.
//
// Safe rendering: all commentary text is rendered via textContent or
// esc() — never raw innerHTML with model output.
// ═══════════════════════════════════════════════════════════════

import { esc } from '../state.js';
import { policyOptions } from '../router.js';
import { listReplays, getReplay, isIndexedDBAvailable } from '../play/persistence.js';
import { ensureReplayFrames } from '../replay-frames.js';
import { mountGameTable } from '../client/mount.tsx';

// Lazy-loaded @intrilex/replay-caster (browser-bundleable subset).
let casterModule = null;
async function getCaster() {
  if (!casterModule) {
    casterModule = await import('../replay-caster/browser-entry.js');
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
    const mod = await import('../autonomy-runtime.js');
    _strictViewFn = mod.strictView;
  }
  return _strictViewFn;
}

// ── Caster phase model ────────────────────────────────────────────
// Explicit stage machine: no ambiguous boolean soup. `error` is an
// orthogonal fatal surface (match source / reconstruction failures).

const CASTER_PHASE = Object.freeze({
  SETUP: 'setup',
  PREPARING: 'preparing',
  PLAYBACK: 'playback'
});

const PREP_STAGES = [
  { id: 'match', label: 'Simulating Match' },
  { id: 'replay', label: 'Verifying & Reconstructing Frames' },
  { id: 'timeline', label: 'Building Timeline' },
  { id: 'commentary', label: 'Preparing Commentary' },
  { id: 'finalize', label: 'Finalizing Broadcast' }
];
const PREP_STAGE_ORDER = PREP_STAGES.map(s => s.id);

const CASTER_SETTINGS_KEY = 'intrilex-caster-settings';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Frame state → Snapshot adapter ────────────────────────────────
//
// Converts a raw engine frame state (from CasterSession.frames[beat.frameIndex])
// into a NEUTRAL SPECTATOR snapshot for Astra's buildSemanticGame().
//
// The Caster is a third-party observer — neither seat is "You". The
// adapter composes strictView() projections for BOTH seats and emits a
// single playerView whose `own`/`opponents` entries describe the two
// seats symmetrically, with `snapshot.human.playerId === null` (no
// participant identity). Combined with mountGameTable's
// viewRole:'spectator' option, the semantic layer renders neutral
// "Seat 1"/"Seat 2" labels and both hands:
//   - PUBLIC mode: hand identities are stripped; only public counts
//     and card-backs are shown.
//   - OMNISCIENT mode: both hands are face-up (explicitly authorized
//     replay inspection), and pending private choices are visible.
//
// The Game Log (`snapshot.recentEvents`) is fed from the session's
// CUMULATIVE event stream — all viewer-visible replay events from the
// beginning of the match through the current playback position. It
// truncates when scrubbing backward and restores when moving forward,
// with no last-N cap.
//
// @param {object} frameState - Raw engine state from a replay frame
// @param {object} session - CasterSession instance
// @param {object} beat - Current playback beat
// @returns {{ snapshot: object }}

export async function frameStateToSnapshot(frameState, session, beat) {
  if (!frameState) return null;

  const omniscient = session.viewerMode === 'omniscient';
  const seatOrder = session.matchResult?.summary?.seatOrder || ['P1', 'P2'];
  const seat1 = seatOrder[0] || 'P1';
  const seat2 = seatOrder[1] || 'P2';

  const strictView = await getStrictView();
  const pv1 = strictView(frameState, seat1);
  const pv2 = strictView(frameState, seat2);

  const seat1Name = session.policyIds?.[0]?.replace(/-/g, ' ') || 'Seat 1';
  const seat2Name = session.policyIds?.[1]?.replace(/-/g, ' ') || 'Seat 2';

  // In public mode, hand card ids are excluded from the knownCards
  // registry as defense-in-depth (the semantic layer also strips them,
  // but the raw snapshot should not carry hidden identities either).
  const hiddenIds = omniscient ? null : new Set([
    ...(frameState.players?.[seat1]?.hand ?? []),
    ...(frameState.players?.[seat2]?.hand ?? [])
  ]);
  const knownCards = omniscient
    ? { ...(pv1.knownCards ?? {}), ...(pv2.knownCards ?? {}) }
    : Object.fromEntries(Object.entries(pv1.knownCards ?? {}).filter(([id]) => !hiddenIds.has(id)));

  // Neutral spectator view: `actorId` remains as a schema anchor (seat 1)
  // but carries no viewer-identity semantics — the semantic model treats
  // own/opponents as "Seat 1"/"Seat 2" under viewRole 'spectator'.
  const seat1Entry = pv1.own ?? {};
  const seat2Public = pv1.opponents?.[0] ?? {};
  // strictView passes the raw priority object ({open, order, index});
  // the semantic model reads priority.ownerId — derive the current
  // holder so the spectator board shows whose priority it is.
  const rawPriority = frameState.priority;
  const priorityOwnerId = Array.isArray(rawPriority?.order) && Number.isInteger(rawPriority?.index)
    ? (rawPriority.order[rawPriority.index] ?? null)
    : null;
  const view = {
    ...pv1,
    actorId: seat1,
    priority: rawPriority ? { ...pv1.priority, ownerId: priorityOwnerId } : pv1.priority,
    own: {
      ...seat1Entry,
      hand: omniscient ? (seat1Entry.hand ?? []) : [],
      handCount: Array.isArray(seat1Entry.hand) ? seat1Entry.hand.length : 0,
      limits: omniscient ? (seat1Entry.limits ?? {}) : {}
    },
    opponents: [{
      ...seat2Public,
      playerId: seat2,
      hand: omniscient ? (pv2.own?.hand ?? []) : [],
      handCount: Array.isArray(pv2.own?.hand) ? pv2.own.hand.length : (seat2Public.handCount ?? 0),
      limits: omniscient ? (pv2.own?.limits ?? {}) : {}
    }],
    // Private choice details are actor-scoped in strictView; under
    // omniscient the chooser's own projection supplies them.
    pendingChoice: omniscient ? (pv1.pendingChoice ?? pv2.pendingChoice ?? null) : null,
    knownCards,
    legacyKnownCards: knownCards
  };

  // Cumulative Game Log evidence: every viewer-visible replay event
  // from frame 0 through the current beat's frame. Falls back to the
  // beat's own visibleEvents for sessions that predate the event index.
  const eventStream = typeof session.eventsThroughBeat === 'function'
    ? session.eventsThroughBeat(session.index)
    : (beat?.visibleEvents ?? []);

  const snapshot = {
    sessionId: session.matchId || `caster-${seat1}-${seat2}`,
    status: 'SPECTATING',
    playerView: view,
    human: { playerId: null, displayName: seat1Name },
    opponent: { displayName: seat2Name },
    match: { winner: null, terminationReason: null },
    decision: null,
    recentEvents: eventStream.map(e => ({
      type: e.type,
      controllerId: e.controllerId ?? e.payload?.controllerId ?? null,
      payload: e.payload ?? null,
    })),
    handOrder: null,
    opponentHandReorderEpoch: 0,
  };

  return { snapshot };
}

// ── Caster workspace state ────────────────────────────────────────
const casterState = {
  phase: CASTER_PHASE.SETUP,
  session: null,
  prep: null,          // live preparation record (plan/stages/metrics/error/context)
  prepAbort: null,     // AbortController for the whole preparation pipeline
  worker: null,
  loading: false,
  loadingMessage: '',
  error: null,
  commentaryText: '',
  commentaryHeadline: '',
  commentaryTone: '',
  commentaryMeta: '',
  commentaryError: null,
  commentaryLoading: false,
  timelineObserver: null, // ResizeObserver for the canvas timeline strip
  // Per-seat hand visibility — presentational only, reset per cast.
  hands: { seat1: true, seat2: true },
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
    speed: 1
  },
  settingsLoaded: false,
  timer: null,
  keyHandler: null,
  ollamaEnabled: false,
  ollamaModel: '',
  ollamaStatus: null,
  savedReplays: [],
  replaysLoaded: false,
  gameplaySkin: 'dark',
  renderToken: 0,
  lifecycleToken: 0,
  commentaryToken: 0,
  activeContainer: null,
  cancelWorker: null,
  tacticalMount: null // Active Astra board mount controller (null when unmounted)
};

// ── Settings persistence ──────────────────────────────────────────
// Persists deliberate user choices (matchup, commentary config, speed).
// Never persists: replay cursor, prep state, errors, overlays. Hand
// visibility resets to visible for every new cast.

function loadCasterSettings() {
  if (casterState.settingsLoaded) return;
  casterState.settingsLoaded = true;
  try {
    const raw = localStorage.getItem(CASTER_SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return;
    if (typeof s.p1Policy === 'string') casterState.config.p1Policy = s.p1Policy;
    if (typeof s.p2Policy === 'string') casterState.config.p2Policy = s.p2Policy;
    if (Number.isFinite(s.seed)) casterState.config.seed = s.seed;
    if (Number.isFinite(s.decisionLimit)) casterState.config.decisionLimit = s.decisionLimit;
    if (typeof s.mode === 'string') casterState.config.mode = s.mode;
    if (Number.isFinite(s.speed)) casterState.config.speed = s.speed;
    if (typeof s.ollamaEnabled === 'boolean') casterState.ollamaEnabled = s.ollamaEnabled;
    if (typeof s.ollamaModel === 'string') casterState.ollamaModel = s.ollamaModel;
  } catch { /* storage unavailable or corrupt — keep defaults */ }
}

function saveCasterSettings() {
  try {
    localStorage.setItem(CASTER_SETTINGS_KEY, JSON.stringify({
      p1Policy: casterState.config.p1Policy,
      p2Policy: casterState.config.p2Policy,
      seed: casterState.config.seed,
      decisionLimit: casterState.config.decisionLimit,
      mode: casterState.config.mode,
      speed: casterState.config.speed,
      ollamaEnabled: casterState.ollamaEnabled,
      ollamaModel: casterState.ollamaModel
    }));
  } catch { /* storage unavailable */ }
}

// ── Main render entry point ───────────────────────────────────────

export async function renderCaster(appEl) {
  // Ordinary shell/auth refreshes on the same route retain pending commentary.
  // Route departure or a different container establishes a new ownership epoch.
  if (casterState.activeContainer !== appEl) casterState.lifecycleToken += 1;
  const lifecycle = casterState.lifecycleToken;
  casterState.activeContainer = appEl;
  loadCasterSettings();
  // Ensure the module is loaded (for the browser entry).
  await getCaster();

  // Pre-load strictView so frameStateToSnapshot is fast on subsequent calls.
  await getStrictView();

  // Load saved replays from IndexedDB for the library section.
  await loadSavedReplays();
  if (!isActiveCaster(appEl, lifecycle)) return;

  if (casterState.error) {
    disposeTacticalMount();
    detachKeyboard();
    renderError(appEl, casterState.error);
    return;
  }

  if (casterState.prep || casterState.loading) {
    disposeTacticalMount();
    detachKeyboard();
    if (casterState.prep) renderPreparation(appEl);
    else renderLoading(appEl);
    return;
  }

  if (!casterState.session) {
    disposeTacticalMount();
    detachKeyboard();
    renderSetup(appEl);
    return;
  }

  renderTheatre(appEl);
}

function isActiveCaster(appEl, lifecycle = casterState.lifecycleToken) {
  return casterState.activeContainer === appEl && appEl.isConnected && lifecycle === casterState.lifecycleToken;
}

function invalidateCommentary() {
  casterState.commentaryToken += 1;
  casterState.session?.cancelCommentary();
  casterState.commentaryLoading = false;
}

function stopWorker() {
  casterState.cancelWorker?.();
  casterState.cancelWorker = null;
  if (casterState.worker) casterState.worker.terminate();
  casterState.worker = null;
}

// Release the Astra board mount (if any) before rendering a non-theatre screen.
function disposeTacticalMount() {
  if (casterState.tacticalMount) {
    try { casterState.tacticalMount.dispose(); } catch { /* ignore */ }
    casterState.tacticalMount = null;
  }
}

function detachKeyboard() {
  if (casterState.keyHandler) {
    try { document.removeEventListener('keydown', casterState.keyHandler); } catch { /* ignore */ }
    casterState.keyHandler = null;
  }
}

function resetWaitWhat() {
  casterState.waitWhatCapture = null;
  casterState.waitWhatVisible = false;
  casterState.waitWhatInvestigation = null;
  casterState.waitWhatInvalidated = false;
  casterState.waitWhatAnnotationText = '';
  casterState.waitWhatAnnotationSeverity = '';
  casterState.waitWhatExportResult = null;
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
  if (!casterState.replaysLoaded) return '';
  if (!casterState.savedReplays.length) {
    return `<div class="caster-setup-game-section caster-library">
      <h3>Replay Library</h3>
      <p class="caster-library-empty">No saved replays yet. Completed matches can be saved from the Play workspace.</p>
    </div>`;
  }
  const cards = casterState.savedReplays.slice(0, 12).map(r => {
    const meta = [
      r.seed != null ? `Seed ${r.seed}` : null,
      r.decisionCount != null ? `${r.decisionCount} decisions` : null,
      r.winner ? `Winner ${r.winner}` : null
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="caster-replay-card" data-replay-id="${esc(r.replayId)}">
      <strong>${esc(r.replayId)}</strong>
      <span>${esc(meta || 'Saved replay')}</span>
      <em>Cast this replay</em>
    </button>`;
  }).join('');
  return `<div class="caster-setup-game-section caster-library">
    <h3>Replay Library</h3>
    <div class="caster-replay-cards" data-testid="caster-replay-cards">${cards}</div>
  </div>`;
}

// ── Setup screen (broadcast configuration) ────────────────────────

function renderSetup(appEl) {
  const c = casterState.config;
  appEl.innerHTML = `<section class="caster-setup-game">
    <div class="caster-setup-game-header">
      <a href="#/" class="caster-back-link secondary-button" data-testid="caster-back-lab">← Back to Lab</a>
      <h2>REPLAY CASTER</h2>
      <p class="caster-setup-tag">Build a completed AI-vs-AI broadcast.</p>
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
      <div class="caster-setup-grid">
        <div class="caster-setup-game-section">
          <h3>Match Config</h3>
          <div class="caster-setup-row">
            <label>Seed<input type="number" id="caster-seed" value="${c.seed}" min="0" max="999999"></label>
            <label>Decision Limit<input type="number" id="caster-decision-limit" value="${c.decisionLimit}" min="50" max="5000"></label>
          </div>
        </div>
        <div class="caster-setup-game-section">
          <h3>Commentary</h3>
          <div class="caster-setup-row">
            <label>Mode<select id="caster-mode">
              <option value="BROADCAST" ${c.mode === 'BROADCAST' ? 'selected' : ''}>Broadcast (play-by-play + colour)</option>
              <option value="DEV_OBSERVATORY" ${c.mode === 'DEV_OBSERVATORY' ? 'selected' : ''}>Dev Observatory (anomaly-focused)</option>
            </select></label>
            <label>Default Speed<select id="caster-speed">
              <option value="0.5" ${c.speed === 0.5 ? 'selected' : ''}>0.5×</option>
              <option value="1" ${c.speed === 1 ? 'selected' : ''}>1×</option>
              <option value="1.5" ${c.speed === 1.5 ? 'selected' : ''}>1.5×</option>
              <option value="2" ${c.speed === 2 ? 'selected' : ''}>2×</option>
            </select></label>
          </div>
          <div class="caster-setup-row">
            <label class="caster-ollama-toggle">
              <input type="checkbox" id="caster-ollama-enabled" ${casterState.ollamaEnabled ? 'checked' : ''}>
              Ollama commentator (optional, local)
            </label>
          </div>
          <div class="caster-ollama-config" id="caster-ollama-config" style="${casterState.ollamaEnabled ? '' : 'display:none'}">
            <label>Model<input type="text" id="caster-ollama-model" value="${esc(casterState.ollamaModel)}" placeholder="e.g. llama3.2"></label>
            <button id="caster-ollama-test" class="secondary-button">Test Connection</button>
            <span id="caster-ollama-status" class="caster-ollama-status">${casterState.ollamaStatus ? esc(casterState.ollamaStatus) : ''}</span>
          </div>
          <p class="caster-commentary-source" data-testid="caster-commentary-source">Commentary source: <strong>${esc(commentarySourceLabel())}</strong></p>
        </div>
      </div>
      <div class="caster-setup-game-actions">
        <button id="caster-start" class="primary-button caster-setup-game-start">PREPARE BROADCAST</button>
      </div>
      <div class="caster-setup-or"><span>or cast a completed replay</span></div>
      ${renderReplayLibrarySection()}
      <div class="caster-setup-note">
        <p>The match is fully generated and verified before playback begins. Commentary is prepared
        ahead of time and never generates or resolves gameplay. Disabling commentary or Ollama
        does not change match results or hashes.</p>
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
  $('caster-speed').onchange = (e) => { c.speed = Number(e.target.value); };
  $('caster-ollama-enabled').onchange = (e) => {
    casterState.ollamaEnabled = e.target.checked;
    $('caster-ollama-config').style.display = e.target.checked ? '' : 'none';
  };
  $('caster-ollama-model').onchange = (e) => { casterState.ollamaModel = e.target.value; };
  $('caster-ollama-test').onclick = () => testOllama(appEl);
  $('caster-start').onclick = () => startPreparation(appEl, { kind: 'match' });

  // Replay library wiring — each card starts a replay preparation.
  appEl.querySelectorAll('.caster-replay-card').forEach(btn => {
    btn.onclick = () => {
      const replayId = btn.dataset.replayId;
      if (replayId) startPreparation(appEl, { kind: 'replay', replayId });
    };
  });
}

// ── Loading fallback (transient, prep record not yet built) ───────

function renderLoading(appEl) {
  appEl.innerHTML = `<section class="caster-setup-game">
    <div class="caster-setup-game-header">
      <a href="#/" class="caster-back-link secondary-button">← Back to Lab</a>
      <h2>REPLAY CASTER</h2>
    </div>
    <div class="caster-setup-game-body">
      <div class="caster-setup-game-loading">
        <span class="loading-spinner" aria-hidden="true"></span>
        <strong>${esc(casterState.loadingMessage || 'Preparing broadcast…')}</strong>
      </div>
    </div>
  </section>`;
}

// ── Preparation screen (staged broadcast pipeline) ────────────────
//
// Every stage reports REAL status: queued / running / complete /
// warning / failed. Metrics are only shown once the underlying work
// actually produced them — nothing here is faked.

function renderPreparation(appEl) {
  const prep = casterState.prep;
  if (!prep) { renderSetup(appEl); return; }
  const plan = prep.plan;

  const stageIcon = (status) => status === 'complete' ? '✓'
    : status === 'failed' ? '✕'
    : status === 'warning' ? '!'
    : status === 'running' ? '●' : '○';

  const stageRows = PREP_STAGES.map(def => {
    const st = prep.stages[def.id] ?? { status: 'queued', detail: '' };
    const label = def.id === 'match' && plan.kind === 'replay' ? 'Loading Saved Replay' : def.label;
    return `<li class="caster-prep-stage is-${st.status}" data-stage="${def.id}" aria-label="${esc(label)} — ${esc(st.status)}">
      <span class="caster-prep-stage-icon" aria-hidden="true">${stageIcon(st.status)}</span>
      <span class="caster-prep-stage-label">${esc(label)}</span>
      <span class="caster-prep-stage-detail">${esc(st.detail || '')}</span>
    </li>`;
  }).join('');

  const metrics = prep.metrics;
  const chips = [
    metrics.seed != null ? `Seed ${metrics.seed}` : null,
    metrics.commands != null ? `${metrics.commands} decisions` : null,
    metrics.frames != null ? `${metrics.frames} replay frames` : null,
    metrics.integrity ? `integrity: ${integrityLabel(metrics.integrity)}` : null,
    metrics.beats != null ? `${metrics.beats} cast beats` : null,
    metrics.decisionBeats != null ? `${metrics.decisionBeats} decision beats` : null,
    metrics.events != null ? `${metrics.events} replay events` : null,
    metrics.commentaryMoments != null ? `${metrics.commentaryMoments} commentary moments` : null,
    metrics.providerLabel ? esc(metrics.providerLabel) : null
  ].filter(Boolean).map(text => `<span class="caster-prep-chip">${text}</span>`).join('');

  // ── Failure surfaces ──
  let failureBlock = '';
  if (prep.commentaryFailure) {
    const f = prep.commentaryFailure;
    failureBlock = `<div class="caster-prep-failure notice danger" data-testid="caster-prep-failure" role="alert">
      <strong>Commentary preparation stopped at ${f.completed}/${f.total} beats.</strong>
      <p>${esc(f.provider === 'ollama' ? `Ollama${f.model ? ` ${f.model}` : ''} is unavailable: ${f.message}` : f.message)}</p>
      <div class="caster-prep-failure-actions">
        <button id="caster-prep-retry" class="secondary-button">Retry</button>
        ${f.provider === 'ollama' ? '<button id="caster-prep-deterministic" class="secondary-button">Continue with deterministic commentary</button>' : ''}
        <button id="caster-prep-back" class="secondary-button">Back to Setup</button>
      </div>
    </div>`;
  } else if (prep.error) {
    failureBlock = `<div class="caster-prep-failure notice danger" data-testid="caster-prep-failure" role="alert">
      <strong>Preparation failed — ${esc(prep.error.stage)}.</strong>
      <p>${esc(prep.error.message)}</p>
      <div class="caster-prep-failure-actions">
        <button id="caster-prep-retry" class="secondary-button">Retry</button>
        <button id="caster-prep-back" class="secondary-button">Back to Setup</button>
      </div>
    </div>`;
  }

  appEl.innerHTML = `<section class="caster-setup-game caster-prep" data-testid="caster-prep">
    <div class="caster-setup-game-header">
      <a href="#/" class="caster-back-link secondary-button">← Back to Lab</a>
      <h2>REPLAY CASTER</h2>
      <p class="caster-setup-tag">Preparing broadcast — the completed match is being assembled for playback.</p>
    </div>
    <div class="caster-setup-game-body">
      <ol class="caster-prep-stages" data-testid="caster-prep-stages" aria-label="Broadcast preparation stages">${stageRows}</ol>
      ${chips ? `<div class="caster-prep-metrics" data-testid="caster-prep-metrics">${chips}</div>` : ''}
      ${failureBlock}
      <div class="caster-prep-actions">
        ${failureBlock ? '' : '<button id="caster-prep-cancel" class="secondary-button">Cancel</button>'}
      </div>
    </div>
  </section>`;

  const $ = (id) => appEl.querySelector(`#${id}`);
  const cancel = $('caster-prep-cancel');
  if (cancel) cancel.onclick = () => cancelPreparation(appEl);
  const back = $('caster-prep-back');
  if (back) back.onclick = () => cancelPreparation(appEl);
  const retry = $('caster-prep-retry');
  if (retry) retry.onclick = () => {
    if (prep.commentaryFailure) resumeCommentaryPrep(appEl, false);
    else startPreparation(appEl, prep.plan);
  };
  const deterministic = $('caster-prep-deterministic');
  if (deterministic) deterministic.onclick = () => resumeCommentaryPrep(appEl, true);
}

function integrityLabel(integrity) {
  switch (integrity) {
    case 'reconstructed-verified': return 'verified';
    case 'reconstructed': return 'reconstructed';
    case 'embedded': return 'embedded frames';
    case 'partial': return 'partial (evidence incomplete)';
    case 'diverged': return 'diverged';
    case 'unreconstructable': return 'not reconstructable';
    default: return String(integrity);
  }
}

// ── Error screen ──────────────────────────────────────────────────

function renderError(appEl, error) {
  appEl.innerHTML = `<section class="caster-setup-game">
    <div class="caster-setup-game-header">
      <a href="#/" class="caster-back-link secondary-button">← Back to Lab</a>
      <h2>REPLAY CASTER — Error</h2>
    </div>
    <div class="caster-setup-game-body">
      <div class="notice danger"><strong>Broadcast preparation failed.</strong><pre>${esc(String(error))}</pre></div>
      <button id="caster-back-setup" class="secondary-button">← Back to Setup</button>
    </div>
  </section>`;
  appEl.querySelector('#caster-back-setup').onclick = () => {
    casterState.error = null;
    renderSetup(appEl);
  };
}

// ── Broadcast preparation pipeline ────────────────────────────────
//
// startPreparation() owns the full teardown of any previous cast, then
// runPreparation() walks the stage sequence. Every async step checks
// liveness (container + lifecycle token + prep identity + abort signal)
// before committing state — no stale callback can write into a later
// screen or a newer cast.

function startPreparation(appEl, plan) {
  // Tear down any previous cast before preparing a new broadcast.
  stopTimer();
  invalidateCommentary();
  stopWorker();
  disposeTacticalMount();
  detachKeyboard();
  resetWaitWhat();
  casterState.session = null;
  casterState.commentaryText = '';
  casterState.commentaryHeadline = '';
  casterState.commentaryTone = '';
  casterState.commentaryMeta = '';
  casterState.commentaryError = null;
  casterState.commentaryLoading = false;
  casterState.hands = { seat1: true, seat2: true };
  casterState.error = null;
  casterState.prepAbort?.abort();

  const abort = new AbortController();
  casterState.prepAbort = abort;
  casterState.prep = {
    plan,
    stages: Object.fromEntries(PREP_STAGE_ORDER.map(id => [id, { status: 'queued', detail: '' }])),
    metrics: { seed: casterState.config.seed },
    error: null,
    commentaryFailure: null,
    context: {}
  };
  casterState.phase = CASTER_PHASE.PREPARING;
  casterState.loading = true;
  casterState.loadingMessage = 'Preparing broadcast…';
  saveCasterSettings();
  renderPreparation(appEl);
  void runPreparation(appEl, plan, abort.signal);
}

async function runPreparation(appEl, plan, signal) {
  const lifecycle = casterState.lifecycleToken;
  const prep = casterState.prep;
  if (!prep) return;
  const live = () => isActiveCaster(appEl, lifecycle) && casterState.prep === prep && !signal.aborted;
  const setStage = (id, status, detail) => {
    const st = prep.stages[id];
    if (st) { st.status = status; if (detail !== undefined) st.detail = detail; }
    if (live()) renderPreparation(appEl);
  };
  const stageError = (id, message) => Object.assign(new Error(message), { prepStage: id });
  try {
    // ── Stage 1: match source (worker simulation or saved replay) ──
    setStage('match', 'running');
    let matchResult;
    if (plan.kind === 'replay') {
      const record = await getReplay(plan.replayId);
      if (!live()) return;
      if (!record?.certifiedReplay) throw stageError('match', 'Replay not found or missing certified replay data');
      prep.context.record = record;
      matchResult = replayRecordToMatchResult(record, plan.replayId);
    } else {
      const c = casterState.config;
      matchResult = await runMatchInWorker({
        seed: c.seed,
        policyIds: [c.p1Policy, c.p2Policy],
        decisionLimit: c.decisionLimit,
        profileId: 'core-advanced-authority'
      });
      if (!live()) return;
    }
    const replay = matchResult?.replay;
    if (!replay?.initialState) throw stageError('replay', 'Match result carries no certified replay envelope');
    prep.context.matchResult = matchResult;
    prep.metrics.seed = matchResult.summary?.seed ?? casterState.config.seed;
    prep.metrics.commands = Array.isArray(replay.commands) ? replay.commands.length : null;
    setStage('match', 'complete', prep.metrics.commands != null ? `${prep.metrics.commands} decisions` : 'match loaded');

    // ── Stage 2: replay verification + frame reconstruction ──
    setStage('replay', 'running');
    await ensureReplayFrames(replay);
    if (!live()) return;
    const frames = Array.isArray(replay.frames) ? replay.frames : [];
    if (!frames.length) {
      throw stageError('replay', replay._frameAnalysis?.reason || 'Could not reconstruct frames from the replay');
    }
    prep.context.frames = frames;
    prep.metrics.frames = frames.length;
    const integrity = replay._frameIntegrity ?? 'embedded';
    prep.metrics.integrity = integrity;
    if (integrity === 'diverged') {
      throw stageError('replay', 'Reconstructed trajectory diverges from the recorded final state hash');
    }
    setStage('replay', integrity === 'partial' ? 'warning' : 'complete',
      `${frames.length} frames · ${integrityLabel(integrity)}`);

    // ── Stage 3: timeline (beats + cumulative event index) ──
    setStage('timeline', 'running');
    const session = await buildCasterSession(matchResult, frames);
    if (!live()) return;
    prep.context.session = session;
    prep.metrics.beats = session.beats.length;
    prep.metrics.decisionBeats = session.beats.filter(b => b.beatKind === 'DECISION').length;
    prep.metrics.events = session.eventCount;
    setStage('timeline', 'complete',
      `${session.beats.length} cast beats · ${session.eventCount} replay events`);

    // ── Stage 4: commentary (pre-generated for the whole replay) ──
    const outcome = await runCommentaryStage(appEl, prep, signal, live, setStage);
    if (outcome !== 'complete') return; // 'failed' leaves recovery UI live; 'stopped' → dead

    // ── Stage 5: finalize ──
    setStage('finalize', 'running');
    prep.context.envelope = session.envelope();
    prep.metrics.providerLabel = commentarySourceLabel();
    setStage('finalize', 'complete', 'Broadcast ready');
    await delay(240);
    if (!live()) return;
    enterPlayback(appEl);
  } catch (err) {
    if (!live() || signal.aborted) return;
    if (err?.message === 'Match generation cancelled') return;
    const stageId = err?.prepStage ?? PREP_STAGE_ORDER.find(id => prep.stages[id]?.status === 'running') ?? 'match';
    if (prep.stages[stageId]) prep.stages[stageId].status = 'failed';
    prep.error = { stage: stageId, message: err?.message || String(err) };
    renderPreparation(appEl);
  }
}

// Build the CasterSession over verified frames. Omniscient only when
// the replay actually authorizes hand identities — privacy-redacted
// artifacts stay public (never fabricate identities). OMNISCIENT here is
// a REQUEST: CasterSession resolves authorization from the frame evidence
// BEFORE constructing any viewer-scoped derived state (beats, event
// index, commentary inputs), so a missing/redacted replay fails closed.
async function buildCasterSession(matchResult, frames) {
  const { CasterSession, COMMENTARY_MODE, VIEWER_MODE } = await getCaster();
  const c = casterState.config;
  const provider = await buildProvider();
  const session = new CasterSession({
    provider,
    mode: c.mode === 'DEV_OBSERVATORY' ? COMMENTARY_MODE.DEV_OBSERVATORY : COMMENTARY_MODE.BROADCAST,
    viewerMode: VIEWER_MODE.OMNISCIENT,
    settings: { model: casterState.ollamaModel || null, density: 'normal' }
  });
  session.loadCompletedMatch(matchResult, frames);
  session.setSpeed(c.speed);
  // Defense in depth: the session already resolved viewerMode from
  // evidence; this pin makes the PUBLIC outcome explicit at the boundary.
  if (!session.handsAuthorized) session.setViewerMode(VIEWER_MODE.PUBLIC);
  return session;
}

// Stage 4 in isolation — shared by the main pipeline and the
// failure-recovery path (retry / deterministic fallback).
async function runCommentaryStage(appEl, prep, signal, live, setStage) {
  const session = prep.context.session;
  if (!session) return 'failed';
  prep.commentaryFailure = null;
  prep.error = null;
  setStage('commentary', 'running', 'Planning commentary moments…');
  let paint = 0;
  const result = await session.prepareCommentary({
    signal,
    onProgress: (p) => {
      const moments = p.generated + p.cached;
      prep.metrics.commentaryMoments = moments;
      const st = prep.stages.commentary;
      if (st) st.detail = `${moments} commentary moments · ${p.completed}/${p.total} beats`;
      if ((paint += 1) % 4 === 0 && live()) renderPreparation(appEl);
    }
  });
  if (!live() || result.cancelled) return 'stopped';
  if (!result.ok) {
    prep.commentaryFailure = {
      code: result.error?.code ?? 'COMMENTARY_FAILED',
      message: result.error?.message ?? 'Commentary generation failed',
      provider: result.error?.provider ?? session.providerName,
      model: result.error?.model ?? null,
      completed: result.completed ?? 0,
      total: result.total ?? session.beats.length
    };
    setStage('commentary', 'failed', `Stopped at beat ${result.completed}/${result.total}`);
    return 'failed';
  }
  prep.metrics.commentaryMoments = result.generated + result.cached;
  prep.metrics.commentarySkipped = result.skipped;
  setStage('commentary', 'complete',
    `${result.generated + result.cached} moments ready${result.skipped ? ` · ${result.skipped} silent beats` : ''}`);
  return 'complete';
}

// Recovery after a commentary-stage failure. `deterministic` swaps the
// provider (clearing incompatible prepared/cache/history state) so the
// broadcast never carries mixed or misleading provenance.
async function resumeCommentaryPrep(appEl, deterministic) {
  const prep = casterState.prep;
  const session = prep?.context?.session;
  if (!prep || !session) return;
  const signal = casterState.prepAbort?.signal;
  const lifecycle = casterState.lifecycleToken;
  const live = () => isActiveCaster(appEl, lifecycle) && casterState.prep === prep && !signal?.aborted;
  const setStage = (id, status, detail) => {
    const st = prep.stages[id];
    if (st) { st.status = status; if (detail !== undefined) st.detail = detail; }
    if (live()) renderPreparation(appEl);
  };
  if (deterministic) {
    const { DeterministicCommentaryProvider } = await getCaster();
    if (!live()) return;
    // Honest provenance: the UI label and the provider change together.
    casterState.ollamaEnabled = false;
    session.setProvider(new DeterministicCommentaryProvider());
  }
  const outcome = await runCommentaryStage(appEl, prep, signal, live, setStage);
  if (outcome !== 'complete') return;
  setStage('finalize', 'running');
  session.envelope();
  prep.metrics.providerLabel = commentarySourceLabel();
  setStage('finalize', 'complete', 'Broadcast ready');
  await delay(240);
  if (!live()) return;
  enterPlayback(appEl);
}

function cancelPreparation(appEl) {
  casterState.prepAbort?.abort();
  casterState.prepAbort = null;
  stopWorker();
  casterState.prep?.context?.session?.cancelCommentary();
  casterState.prep = null;
  casterState.loading = false;
  casterState.loadingMessage = '';
  casterState.phase = CASTER_PHASE.SETUP;
  if (appEl && isActiveCaster(appEl)) renderSetup(appEl);
}

// Transition PREPARING → PLAYBACK once every stage is complete.
function enterPlayback(appEl) {
  const prep = casterState.prep;
  const session = prep?.context?.session;
  if (!session) { cancelPreparation(appEl); return; }
  casterState.session = session;
  casterState.prep = null;
  casterState.prepAbort = null;
  casterState.phase = CASTER_PHASE.PLAYBACK;
  casterState.loading = false;
  casterState.loadingMessage = '';
  // Fresh presentation state for the new broadcast.
  casterState.commentaryText = '';
  casterState.commentaryHeadline = '';
  casterState.commentaryTone = '';
  casterState.commentaryMeta = '';
  casterState.commentaryError = null;
  casterState.commentaryLoading = false;
  casterState.hands = { seat1: true, seat2: true };
  resetWaitWhat();
  renderTheatre(appEl);
  void onBeatChange(appEl);
}

// Leave playback → SETUP without stale state ("New Cast").
function resetToSetup(appEl) {
  stopTimer();
  invalidateCommentary();
  casterState.renderToken += 1;
  stopWorker();
  detachKeyboard();
  disconnectTimelineObserver();
  disposeTacticalMount();
  casterState.session = null;
  casterState.phase = CASTER_PHASE.SETUP;
  casterState.commentaryText = '';
  casterState.commentaryHeadline = '';
  casterState.commentaryTone = '';
  casterState.commentaryMeta = '';
  casterState.commentaryError = null;
  casterState.commentaryLoading = false;
  casterState.hands = { seat1: true, seat2: true };
  resetWaitWhat();
  renderSetup(appEl);
}

// Build the matchResult shape loadCompletedMatch() expects from a
// saved replay record (certified replays store initialState + commands,
// not a full summary — derive a minimal honest summary).
function replayRecordToMatchResult(record, replayId) {
  const certified = record.certifiedReplay;
  return {
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
}

// ── Theatre (main playback view) ──────────────────────────────────
//
// Renders the authentic game board using Astra (mountGameTable) with a custom
// right rail containing commentary (top) and replay transport controls (bottom).
// The board is read-only — no card interactions, no action bar.

async function renderTheatre(appEl) {
  const session = casterState.session;
  if (!session || !isActiveCaster(appEl)) return;
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

  let snapshot;
  try {
    const adapted = await frameStateToSnapshot(frameState, session, beat);
    snapshot = adapted.snapshot;
  } catch (err) {
    if (myToken === casterState.renderToken) {
      appEl.innerHTML = `<div class="notice danger"><strong>Failed to build game view.</strong><pre>${esc(String(err?.message || err))}</pre></div>`;
    }
    return;
  }

  // Guard: if a newer render was triggered while we were building the snapshot, abort
  if (myToken !== casterState.renderToken || !isActiveCaster(appEl) || session !== casterState.session) return;

  // ── Build custom right rail HTML (commentary + transport controls) ──
  const railHtml = buildCasterRightRail(session, beat, idx, total, ps, policyIds);
  const handControls = buildHandControls(appEl, session);

  // ── Mount or update the Astra board ──
  const gameplaySkin = casterState.gameplaySkin || 'dark';
  const omniscient = session.viewerMode === 'omniscient';

  if (!casterState.tacticalMount) {
    // First theatre render: lay out the persistent broadcast header + board host, then mount Astra.
    appEl.innerHTML = `<header class="caster-theatre-header" data-caster="1">
      <a class="caster-exit-button secondary-button" href="#/" data-testid="caster-back-lab">← Lab</a>
      <span class="caster-theatre-brand">INTRILEX <b>REPLAY CASTER</b><span class="pill caster-pill-readonly">Read only · Recorded match</span></span>
      <span class="caster-theatre-meta" data-testid="caster-theatre-meta"></span>
      <button class="caster-exit-button secondary-button" data-action="exit-caster" aria-label="New Cast">New Cast</button>
    </header>
    <div class="caster-board-host" data-testid="caster-board-host"></div>`;

    // Wire header New Cast button (persistent — wired once at mount).
    const exitBtn = appEl.querySelector('[data-action="exit-caster"]');
    if (exitBtn) exitBtn.onclick = () => resetToSetup(appEl);
    attachKeyboard(appEl);

    const boardHost = appEl.querySelector('.caster-board-host');
    try {
      casterState.tacticalMount = mountGameTable(boardHost, snapshot, {
        submit: async () => ({ accepted: false }), // Caster is read-only — never submits.
        skin: gameplaySkin,
        // Neutral spectator presentation: no seat is "You". Visibility
        // policy is separate — 'public' conceals hand identities,
        // 'omniscient' authorizes face-up hands for replay analysis.
        viewRole: 'spectator',
        visibility: omniscient ? 'omniscient' : 'public',
        railHtml,
        handControls,
      });
    } catch (err) {
      appEl.innerHTML = `<div class="notice danger"><strong>Failed to render the Astra board.</strong><pre>${esc(String(err?.message || err))}</pre></div>`;
      return;
    }
  } else {
    // Subsequent beat changes: update Astra in place with the new snapshot + rail.
    casterState.tacticalMount.update(snapshot, false, undefined, undefined, railHtml, undefined, handControls);
  }

  updateTheatreHeader(appEl, session, idx, total);

  // ── Safe text rendering for commentary (avoid innerHTML with model output) ──
  // Astra re-renders the rail via flushSync in update(), so the commentary
  // elements are present in the DOM by the time we reach here.
  const headlineEl = appEl.querySelector('[data-testid="caster-commentary-headline"]');
  const bodyEl = appEl.querySelector('[data-testid="caster-commentary-body"]');
  const metaEl = appEl.querySelector('[data-testid="caster-commentary-meta"]');
  if (headlineEl) headlineEl.textContent = casterState.commentaryHeadline || '';
  if (bodyEl) bodyEl.textContent = casterState.commentaryText || '';
  if (metaEl) metaEl.textContent = [casterState.commentaryMeta, casterState.commentaryTone].filter(Boolean).join(' · ');

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
  }
}

function updateTheatreHeader(appEl, session, idx, total) {
  const meta = appEl.querySelector('[data-testid="caster-theatre-meta"]');
  if (!meta) return;
  const seed = session.matchResult?.summary?.seed;
  meta.textContent = `${seatDisplayName(session, 0)} vs ${seatDisplayName(session, 1)}`
    + `${seed != null ? ` · Seed ${seed}` : ''} · Beat ${idx + 1}/${total + 1}`;
}

// Per-seat hand visibility controls — PRESENTATIONAL toggles only.
// They never mutate replay state, match state, engine behavior, or
// hashes; hiding a seat swaps authorized cards for concealed
// placeholders inside the canonical board.
function buildHandControls(appEl, session) {
  const unavailable = session.handsAuthorized
    ? null
    : 'Card identities unavailable in this replay';
  return {
    seat1: {
      visible: !unavailable && casterState.hands.seat1,
      onToggle: unavailable ? undefined : () => toggleHand('seat1', appEl)
    },
    seat2: {
      visible: !unavailable && casterState.hands.seat2,
      onToggle: unavailable ? undefined : () => toggleHand('seat2', appEl)
    },
    unavailable
  };
}

function toggleHand(seat, appEl) {
  if (!casterState.session?.handsAuthorized) return;
  casterState.hands[seat] = !casterState.hands[seat];
  renderTheatre(appEl);
}

// ── Keyboard playback controls ────────────────────────────────────
// Space=play/pause · ←/→=beat · Shift+←/→=major beat · Home/End=edges.
// Never hijacks keys while the user is typing in a field.

function attachKeyboard(appEl) {
  detachKeyboard();
  const handler = (event) => {
    const t = event.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const session = casterState.session;
    if (!session || casterState.phase !== CASTER_PHASE.PLAYBACK || !isActiveCaster(appEl)) return;
    const go = (fn) => { event.preventDefault(); fn(); void onBeatChange(appEl); };
    switch (event.key) {
      case ' ': {
        event.preventDefault();
        const before = session.currentBeat;
        session.toggle();
        if (session.director.playing) startTimer(appEl); else stopTimer();
        if (session.currentBeat !== before) void onBeatChange(appEl); else renderTheatre(appEl);
        break;
      }
      case 'ArrowLeft': go(() => event.shiftKey ? session.prevMajorBeat() : session.stepBackward()); break;
      case 'ArrowRight': go(() => event.shiftKey ? session.nextMajorBeat() : session.stepForward()); break;
      case 'Home': go(() => session.director.stepTo(0)); break;
      case 'End': go(() => session.skipToEnd()); break;
      default: break;
    }
  };
  document.addEventListener('keydown', handler);
  casterState.keyHandler = handler;
}

// ── Build the custom right rail HTML ───────────────────────────────
//
// Replaces the Actions + Chat right rail with:
//   Top section: COMMENTARY (prepared) + investigation + match-end card
//   Bottom section: REPLAY CONTROLS (transport + timeline)

// Commentary source label — honestly reflects what powers the rail:
// "Deterministic (rules-based)" when no local model is configured, or
// "Ollama · <model>" when Ollama is enabled. Never implies a model is
// in use when it is not.
function commentarySourceLabel() {
  const session = casterState.session ?? casterState.prep?.context?.session;
  const provider = session?.providerName ?? (casterState.ollamaEnabled && casterState.ollamaModel ? 'ollama' : 'deterministic');
  if (provider === 'ollama') {
    const model = session ? (session.providerModel ?? casterState.ollamaModel) : casterState.ollamaModel;
    return `Ollama · ${model || 'model not set'}`;
  }
  return 'Deterministic (rules-based)';
}

// Provenance label for a single prepared record.
function providerLabelFor(generatedBy) {
  if (!generatedBy) return '';
  if (generatedBy.provider === 'ollama') return `Ollama · ${generatedBy.model || 'model not set'}`;
  return 'Deterministic';
}

function seatDisplayName(session, seatIndex) {
  const id = session.policyIds?.[seatIndex];
  return id ? seatName(id) : `Seat ${seatIndex + 1}`;
}

function seatName(policyId) {
  return String(policyId || '').replaceAll('-', ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

// Scalable timeline categories — important moments stay visually
// distinct; ordinary turn noise is subdued.
function timelineCategory(beat) {
  if (beat.beatKind === 'MATCH_START') return 'start';
  if (beat.beatKind === 'MATCH_END') return 'end';
  if (beat.beatKind === 'TURN_START') return 'turn';
  if (beat.beatKind === 'RESPONSE') return 'response';
  if ((beat.importance ?? 0) >= 0.7) return 'major';
  return 'decision';
}

// Match-end broadcast conclusion — winner, scores, stats, actions.
function buildMatchEndCard(session, ps) {
  const seatOrder = session.matchResult?.summary?.seatOrder ?? ['P1', 'P2'];
  const scores = ps.finalScores ?? ps.scores ?? {};
  const s1 = scores[seatOrder[0]] ?? '—';
  const s2 = scores[seatOrder[1]] ?? '—';
  const winner = ps.winner;
  const winnerIdx = winner ? seatOrder.indexOf(winner) : -1;
  const winnerName = winnerIdx >= 0 ? seatDisplayName(session, winnerIdx) : (winner ? seatName(winner) : '—');
  const turns = ps.completedFullTurns ?? session.matchResult?.summary?.completedFullTurns ?? null;
  const decisions = Array.isArray(session.matchResult?.decisions) ? session.matchResult.decisions.length : null;
  const seed = session.matchResult?.summary?.seed ?? null;
  const meta = [
    turns != null ? `${turns} turns` : null,
    decisions != null ? `${decisions} decisions` : null,
    seed != null ? `Seed ${seed}` : null
  ].filter(Boolean).join(' · ');
  return `<div class="caster-match-end" data-testid="caster-match-end">
    <div class="caster-match-end-title">MATCH COMPLETE</div>
    <div class="caster-match-end-scores">
      <div class="caster-end-seat"><span>${esc(seatDisplayName(session, 0))}</span><b>${esc(s1)}</b></div>
      <div class="caster-end-vs">vs</div>
      <div class="caster-end-seat"><span>${esc(seatDisplayName(session, 1))}</span><b>${esc(s2)}</b></div>
    </div>
    <div class="caster-match-end-winner">${winner ? `Winner: ${esc(winnerName)}` : 'Match drawn'}</div>
    ${meta ? `<div class="caster-match-end-meta">${esc(meta)}</div>` : ''}
    <div class="caster-match-end-actions">
      <button id="caster-replay" class="secondary-button">↺ Replay</button>
      <button id="caster-new-cast" class="secondary-button">New Cast</button>
      <a class="secondary-button" href="#/">Back to Lab</a>
    </div>
  </div>`;
}

function buildCasterRightRail(session, beat, idx, total, ps, _policyIds) {
  const isFinished = beat.beatKind === 'MATCH_END';

  // ── Commentary section (top, larger) ──
  const commentaryErr = casterState.commentaryError
    ? `<div class="caster-commentary-error" data-testid="caster-commentary-error">Commentary unavailable: ${esc(casterState.commentaryError)}</div>`
    : '';

  const commentaryLoading = casterState.commentaryLoading
    ? '<div class="caster-commentary-loading">Preparing commentary…</div>'
    : '';

  const hasCommentary = Boolean(casterState.commentaryText || casterState.commentaryHeadline);
  const commentaryBlock = `<div class="caster-commentary ${hasCommentary ? '' : 'caster-commentary-silent'}" data-testid="caster-commentary">
      <div class="caster-commentary-headline" data-testid="caster-commentary-headline"></div>
      <div class="caster-commentary-body" data-testid="caster-commentary-body"></div>
      <div class="caster-commentary-meta" data-testid="caster-commentary-meta"></div>
      ${hasCommentary ? '' : '<div class="caster-commentary-quiet">No commentary for this beat.</div>'}
    </div>`;

  const endCard = isFinished ? buildMatchEndCard(session, ps) : '';

  // WAIT WHAT panel
  const ww = casterState.waitWhatVisible && casterState.waitWhatCapture
    ? renderWaitWhatPanel(casterState.waitWhatCapture, casterState.waitWhatInvestigation, casterState.waitWhatInvalidated)
    : '';

  // ── Transport controls section (bottom, smaller) ──

  // Scalable timeline — a canvas density strip. Beats are bucketed
  // into pixel columns so the strip stays readable at 20 or 2000+
  // beats (the most significant category in each column wins the
  // paint). Hover shows a beat tooltip; drag previews the playhead
  // and commits the seek on release; the range input above remains
  // the precise accessible control.
  const position = `Beat ${idx + 1}/${total + 1}`;
  const timelineLegend = [
    ['start', 'Start / End'], ['major', 'Major'], ['response', 'Response'],
    ['turn', 'Turn'], ['decision', 'Decision']
  ].map(([k, label]) => `<span class="caster-tl-key"><i class="caster-tl-key-dot caster-tl-key-${k}"></i>${label}</span>`).join('');

  return `<div class="rd-right-rail-bottom-inner caster-right-rail" data-caster-rail="1">
    <div class="caster-rail-commentary-section">
      <div class="caster-rail-section-header">COMMENTARY · ${esc(commentarySourceLabel())} ${isFinished ? '· MATCH COMPLETE' : ''}</div>
      ${endCard}
      ${commentaryBlock}
      ${commentaryLoading}
      ${commentaryErr}
      <div class="caster-actions">
        <button id="caster-wait-what" class="caster-wait-what-btn" data-testid="caster-wait-what" title="Capture this moment for investigation">Investigate this moment</button>
      </div>
      ${ww}
    </div>
    <div class="caster-rail-transport-section">
      <div class="caster-rail-section-header">REPLAY CONTROLS</div>
      <div class="caster-controls">
        <div class="transport" role="group" aria-label="Playback transport">
          <button id="caster-home" ${idx <= 0 ? 'disabled' : ''} title="Jump to start" aria-label="Jump to start">⏮</button>
          <button id="caster-prev-major" ${idx <= 0 ? 'disabled' : ''} title="Previous major beat (Shift+←)" aria-label="Previous major beat">⇤</button>
          <button id="caster-prev" ${idx <= 0 ? 'disabled' : ''} title="Previous beat" aria-label="Previous beat">◀</button>
          <button id="caster-play" aria-label="${session.director.playing ? 'Pause' : 'Play'}">${session.director.playing ? '⏸' : '▶'}</button>
          <button id="caster-next" ${idx >= total ? 'disabled' : ''} title="Next beat" aria-label="Next beat">▶</button>
          <button id="caster-next-major" ${idx >= total ? 'disabled' : ''} title="Next major beat (Shift+→)" aria-label="Next major beat">⇥</button>
          <button id="caster-end" ${idx >= total ? 'disabled' : ''} title="Skip to end" aria-label="Skip to end">⏭</button>
        </div>
        <div class="progress">
          <input type="range" id="caster-slider" aria-label="Beat slider" min="0" max="${total}" value="${idx}">
          <span data-testid="caster-progress">${position}</span>
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
        <canvas class="caster-tl-canvas" data-testid="caster-timeline-canvas" role="slider" tabindex="0"
          aria-label="Match timeline" aria-valuemin="0" aria-valuemax="${total}"
          aria-valuenow="${idx}" aria-valuetext="${esc(position)}"></canvas>
        <div class="caster-tl-tooltip" data-testid="caster-timeline-tooltip" hidden></div>
        <div class="caster-timeline-legend" aria-hidden="true">${timelineLegend}</div>
      </div>
      <div class="caster-rail-footer">
        <button id="caster-back-setup" class="secondary-button">← New Cast</button>
      </div>
    </div>
  </div>`;
}

// ── Wire up right rail transport controls ──────────────────────────

function wireCasterRightRail(appEl, session, idx, _total) {
  const $ = (id) => appEl.querySelector(`#${id}`);

  const step = (fn) => { fn(); void onBeatChange(appEl); };

  const homeBtn = $('caster-home');
  if (homeBtn) homeBtn.onclick = () => step(() => session.director.stepTo(0));

  const prevMajorBtn = $('caster-prev-major');
  if (prevMajorBtn) prevMajorBtn.onclick = () => step(() => session.prevMajorBeat());

  const prevBtn = $('caster-prev');
  if (prevBtn) prevBtn.onclick = () => step(() => session.stepBackward());

  const playBtn = $('caster-play');
  if (playBtn) playBtn.onclick = () => {
    const before = session.currentBeat;
    session.toggle();
    if (session.director.playing) startTimer(appEl); else stopTimer();
    if (session.currentBeat !== before) onBeatChange(appEl); else renderTheatre(appEl);
  };

  const nextBtn = $('caster-next');
  if (nextBtn) nextBtn.onclick = () => step(() => session.stepForward());

  const nextMajorBtn = $('caster-next-major');
  if (nextMajorBtn) nextMajorBtn.onclick = () => step(() => session.nextMajorBeat());

  const endBtn = $('caster-end');
  if (endBtn) endBtn.onclick = () => step(() => session.skipToEnd());

  const slider = $('caster-slider');
  if (slider) slider.oninput = (e) => { session.director.stepTo(Number(e.target.value)); onBeatChange(appEl); };

  const speedCtrl = $('caster-speed-ctrl');
  if (speedCtrl) speedCtrl.onchange = (e) => { session.setSpeed(Number(e.target.value)); };

  wireTimeline(appEl, session, idx);

  // Match-end actions
  const replayBtn = $('caster-replay');
  if (replayBtn) replayBtn.onclick = () => {
    session.pause();
    stopTimer();
    session.director.stepTo(0);
    onBeatChange(appEl);
  };
  const newCastBtn = $('caster-new-cast');
  if (newCastBtn) newCastBtn.onclick = () => resetToSetup(appEl);

  const waitWhatBtn = $('caster-wait-what');
  if (waitWhatBtn) waitWhatBtn.onclick = async () => {
    session.pause();
    stopTimer();
    const capture = session.waitWhat();
    if (!capture) return;
    const lifecycle = casterState.lifecycleToken;
    casterState.waitWhatCapture = capture;
    casterState.waitWhatVisible = true;
    // Create an investigation from the capture
    const { createInvestigation } = await getInvestigation();
    const authHash = await getAuthorityHash();
    if (!isActiveCaster(appEl, lifecycle) || casterState.session !== session || casterState.waitWhatCapture !== capture || !casterState.waitWhatVisible) return;
    casterState.waitWhatInvestigation = createInvestigation(capture, authHash);
    casterState.waitWhatInvalidated = false;
    casterState.waitWhatAnnotationText = '';
    casterState.waitWhatAnnotationSeverity = '';
    casterState.waitWhatExportResult = null;
    renderTheatre(appEl);
  };

  const backSetupBtn = $('caster-back-setup');
  if (backSetupBtn) backSetupBtn.onclick = () => resetToSetup(appEl);
}

// ── Canvas timeline ───────────────────────────────────────────────
// Beats are bucketed into pixel columns; when several beats share a
// column the most significant category paints it, so major moments
// survive at any match length. Segment heights mirror category weight.

const TIMELINE_PRIORITY = { end: 0, start: 0, major: 1, response: 2, decision: 3, turn: 4 };
const TIMELINE_HEIGHT = { start: 1, end: 1, major: 0.85, response: 0.7, decision: 0.55, turn: 0.35 };

function disconnectTimelineObserver() {
  if (casterState.timelineObserver) {
    try { casterState.timelineObserver.disconnect(); } catch { /* ignore */ }
    casterState.timelineObserver = null;
  }
}

function drawTimeline(canvas, beats, current, preview = null) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!(cssW > 0) || !(cssH > 0)) return;
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const pxW = Math.round(cssW * dpr);
  const pxH = Math.round(cssH * dpr);
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const N = beats.length;
  if (!N) return;

  // Palette comes from CSS custom properties on .caster-timeline so
  // the strip follows the same tokens as the legend dots.
  const computed = window.getComputedStyle(canvas);
  const colorFor = (cat) => computed.getPropertyValue(`--caster-tl-${cat}`).trim() || 'rgba(148, 163, 184, 0.4)';

  for (let px = 0; px < cssW; px += 1) {
    const lo = Math.min(N - 1, Math.floor((px / cssW) * N));
    const hi = Math.min(N, Math.max(lo + 1, Math.floor(((px + 1) / cssW) * N)));
    let cat = timelineCategory(beats[lo]);
    for (let i = lo + 1; i < hi; i += 1) {
      const c = timelineCategory(beats[i]);
      if ((TIMELINE_PRIORITY[c] ?? 9) < (TIMELINE_PRIORITY[cat] ?? 9)) cat = c;
    }
    const segH = Math.max(2, Math.round((TIMELINE_HEIGHT[cat] ?? 0.5) * cssH));
    ctx.fillStyle = colorFor(cat);
    ctx.fillRect(px, cssH - segH, 1, segH);
  }

  // Elapsed-region tint: everything at or before the current beat.
  if (current != null && current >= 0) {
    ctx.fillStyle = 'rgba(108, 204, 255, 0.10)';
    ctx.fillRect(0, 0, ((current + 1) / N) * cssW, cssH);
  }

  const markerAt = (beatIdx, fill, wpx) => {
    if (beatIdx == null || beatIdx < 0) return;
    const x = Math.min(cssW - wpx, Math.max(0, ((beatIdx + 0.5) / N) * cssW - wpx / 2));
    ctx.fillStyle = fill;
    ctx.fillRect(x, 0, wpx, cssH);
  };
  markerAt(preview, 'rgba(255, 255, 255, 0.45)', 1.5);
  markerAt(current, '#ffffff', 2);
}

// Pointer wiring for the canvas strip. The rail DOM is replaced on
// every beat change, so mid-drag re-renders would kill pointer
// capture — instead the drag paints a local playhead preview and the
// seek commits once on release. Click = press + release = seek.
function wireTimeline(appEl, session, idx) {
  const canvas = appEl.querySelector('.caster-tl-canvas');
  const tip = appEl.querySelector('.caster-tl-tooltip');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const beats = session.beats;
  const N = beats.length;
  if (!N) return;

  disconnectTimelineObserver();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!canvas.isConnected) { ro.disconnect(); return; }
      drawTimeline(canvas, beats, session.index, null);
    });
    ro.observe(canvas);
    casterState.timelineObserver = ro;
  }

  drawTimeline(canvas, beats, idx, null);

  const indexAt = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0)) return null;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    return Math.min(N - 1, Math.floor((x / rect.width) * N));
  };

  let preview = null;
  canvas.addEventListener('pointerdown', (e) => {
    const i = indexAt(e.clientX);
    if (i == null) return;
    preview = i;
    canvas.setPointerCapture?.(e.pointerId);
    drawTimeline(canvas, beats, idx, preview);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const i = indexAt(e.clientX);
    if (i == null) return;
    if (preview != null) {
      preview = i;
      drawTimeline(canvas, beats, idx, preview);
    }
    if (tip) {
      const rect = canvas.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = `Beat ${i + 1}/${N} · ${beatLabel(beats[i])}`;
      tip.style.left = `${Math.min(Math.max(e.clientX - rect.left, 0), rect.width)}px`;
    }
  });
  const commit = () => {
    if (preview == null) return;
    const target = preview;
    preview = null;
    if (tip) tip.hidden = true;
    session.director.stepTo(target);
    onBeatChange(appEl);
  };
  canvas.addEventListener('pointerup', commit);
  canvas.addEventListener('pointercancel', () => {
    preview = null;
    if (tip) tip.hidden = true;
  });
  canvas.addEventListener('mouseleave', () => {
    if (preview == null && tip) tip.hidden = true;
  });
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
        <p class="caster-ww-alternatives-hint">${legalCount} legal actions were recorded at this decision. This capture does not include a verified alternative action for the Branch Lab. Export the investigation to preserve this exact replay position.</p>
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
      <h3>INVESTIGATION — ${esc(capture.captureId)}</h3>
      <button id="caster-ww-close" class="secondary-button" aria-label="Close investigation">✕</button>
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
    const current = casterState.waitWhatInvestigation;
    const lifecycle = casterState.lifecycleToken;
    const { addAnnotation } = await getInvestigation();
    if (!isActiveCaster(appEl, lifecycle) || current !== casterState.waitWhatInvestigation) return;
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
    const current = casterState.waitWhatInvestigation;
    const lifecycle = casterState.lifecycleToken;
    const { exportInvestigation } = await getInvestigation();
    if (!isActiveCaster(appEl, lifecycle) || current !== casterState.waitWhatInvestigation) return;
    const { investigation, exportData, exportFormat } = exportInvestigation(casterState.waitWhatInvestigation, 'json');
    casterState.waitWhatInvestigation = investigation;
    casterState.waitWhatExportResult = { format: exportFormat };
    downloadInvestigation(exportData, 'json');
    renderTheatre(appEl);
  };

  if (mdBtn) mdBtn.onclick = async () => {
    const current = casterState.waitWhatInvestigation;
    const lifecycle = casterState.lifecycleToken;
    const { exportInvestigation } = await getInvestigation();
    if (!isActiveCaster(appEl, lifecycle) || current !== casterState.waitWhatInvestigation) return;
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
//
// Prepared broadcasts resolve commentary SYNCHRONOUSLY from
// session.preparedFor() — playback never waits on a provider. The live
// generation path remains as a fallback for sessions that were never
// prepared (e.g. direct CasterSession callers), and mirrors its results
// into the prepared index.

async function onBeatChange(appEl) {
  const session = casterState.session;
  if (!session || !isActiveCaster(appEl)) return;
  const request = ++casterState.commentaryToken;
  const lifecycle = casterState.lifecycleToken;
  const beat = session.currentBeat;
  const isCurrent = () => isActiveCaster(appEl, lifecycle) && session === casterState.session
    && request === casterState.commentaryToken && session.currentBeat === beat;

  // Prepared path — instant, no provider call.
  const prepared = typeof session.preparedFor === 'function' ? session.preparedFor(session.index) : null;
  if (prepared) {
    casterState.commentaryLoading = false;
    casterState.commentaryError = prepared.status === 'failed'
      ? (prepared.error?.message ?? 'Commentary unavailable')
      : null;
    if (prepared.status === 'ready' && prepared.record) {
      casterState.commentaryText = prepared.record.commentary || '';
      casterState.commentaryHeadline = prepared.record.headline || '';
      casterState.commentaryTone = prepared.record.tone || '';
      casterState.commentaryMeta = providerLabelFor(prepared.generatedBy);
    } else {
      casterState.commentaryText = '';
      casterState.commentaryHeadline = '';
      casterState.commentaryTone = '';
      casterState.commentaryMeta = '';
    }
    renderTheatre(appEl);
    await refreshWaitWhatInvalidation(appEl, isCurrent);
    return;
  }

  // Live fallback — unprepared session (legacy/direct callers).
  // Show loading state and re-render the theatre immediately.
  casterState.commentaryLoading = true;
  casterState.commentaryError = null;
  casterState.commentaryText = '';
  casterState.commentaryHeadline = '';
  casterState.commentaryTone = '';
  casterState.commentaryMeta = '';
  renderTheatre(appEl);

  try {
    const result = await session.generateCommentaryForCurrentBeat({
      onToken: (chunk) => {
        if (!isCurrent()) return;
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
    if (!isCurrent()) return;
    casterState.commentaryLoading = false;
    if (result.skipped) {
      casterState.commentaryText = '';
      casterState.commentaryHeadline = '';
      casterState.commentaryTone = '';
      casterState.commentaryMeta = '';
    } else if (result.ok && result.record) {
      casterState.commentaryText = result.record.commentary || '';
      casterState.commentaryHeadline = result.record.headline || '';
      casterState.commentaryTone = result.record.tone || '';
      casterState.commentaryMeta = providerLabelFor({ provider: session.providerName, model: session.providerModel });
      casterState.commentaryError = null;
    } else {
      casterState.commentaryText = '';
      casterState.commentaryHeadline = '';
      casterState.commentaryTone = '';
      casterState.commentaryMeta = '';
      casterState.commentaryError = result.error || 'Unknown error';
    }
  } catch (err) {
    if (!isCurrent()) return;
    casterState.commentaryLoading = false;
    casterState.commentaryText = '';
    casterState.commentaryError = err?.message || String(err);
  }

  // Re-render with final commentary state (safe text rendering)
  renderTheatre(appEl);

  await refreshWaitWhatInvalidation(appEl, isCurrent);
}

// Check WAIT WHAT investigation invalidation + render its commentary
// text safely after a beat change settles.
async function refreshWaitWhatInvalidation(appEl, isCurrent) {
  if (casterState.waitWhatVisible && casterState.waitWhatInvestigation) {
    const { checkInvalidation } = await getInvestigation();
    const authHash = await getAuthorityHash();
    if (!isCurrent() || !casterState.waitWhatVisible || !casterState.waitWhatInvestigation) return;
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

function runMatchInWorker(config) {
  stopWorker();
  return new Promise((resolve, reject) => {
    const worker = new Worker('worker.js', { type: 'module' });
    casterState.worker = worker;
    const finish = () => {
      worker.terminate();
      if (casterState.worker === worker) {
        casterState.worker = null;
        casterState.cancelWorker = null;
      }
    };
    casterState.cancelWorker = () => { finish(); reject(new Error('Match generation cancelled')); };
    worker.onmessage = (e) => {
      const x = e.data;
      if (x.type === 'autonomy-match-result') {
        finish();
        if (x.ok) resolve(x.result);
        else reject(new Error(x.error || 'worker error'));
      }
    };
    worker.onerror = (e) => {
      finish();
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
  if (beat.redacted) return 'Future beat (hidden)';
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
// Cancels every in-flight async surface (preparation pipeline, match
// worker, pending commentary, keyboard handler) so no stale callback
// can write into the next route. The PLAYBACK session itself survives
// — returning to Caster resumes where the user left off. A PREPARING
// broadcast is cancelled outright (its partial state is useless).

export function cleanupCaster() {
  casterState.lifecycleToken += 1;
  casterState.renderToken += 1;
  casterState.activeContainer = null;
  // Cancel any in-flight preparation first — it may own the worker.
  if (casterState.prepAbort) {
    casterState.prepAbort.abort();
    casterState.prepAbort = null;
    casterState.prep?.context?.session?.cancelCommentary();
    casterState.prep = null;
    if (casterState.phase === CASTER_PHASE.PREPARING) casterState.phase = CASTER_PHASE.SETUP;
  }
  invalidateCommentary();
  casterState.loading = false;
  stopTimer();
  stopWorker();
  detachKeyboard();
  disconnectTimelineObserver();
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
