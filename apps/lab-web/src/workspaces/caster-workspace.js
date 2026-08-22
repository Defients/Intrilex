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

import { esc } from '../state.js';
import { policyOptions } from '../router.js';
import { listReplays, getReplay, isIndexedDBAvailable } from '../play/persistence.js';
import { reconstructReplayFrames } from '../replay-frames.js';

// Lazy-loaded @intrilex/replay-caster (browser-bundleable subset).
let casterModule = null;
async function getCaster() {
  if (!casterModule) {
    casterModule = await import('../replay-caster/browser-entry.js');
  }
  return casterModule;
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
  replaysLoaded: false
};

// ── Main render entry point ───────────────────────────────────────

export async function renderCaster(appEl) {
  // Ensure the module is loaded (for the browser entry).
  await getCaster();

  // Load saved replays from IndexedDB for the library section.
  await loadSavedReplays();

  if (casterState.error) {
    renderError(appEl, casterState.error);
    return;
  }

  if (casterState.loading) {
    renderLoading(appEl);
    return;
  }

  if (!casterState.session) {
    renderSetup(appEl);
    return;
  }

  renderTheatre(appEl);
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
  return `<div class="caster-setup-section">
    <h3>Or load from Replay Library</h3>
    <div class="caster-setup-row">
      <label>Saved replay<select id="caster-replay-select">
        <option value="">— Select a saved replay —</option>
        ${items}
      </select></label>
      <button id="caster-load-replay" class="secondary-button" disabled>Load & Cast</button>
    </div>
  </div>`;
}

// ── Setup screen (match configuration) ────────────────────────────

function renderSetup(appEl) {
  const c = casterState.config;
  appEl.innerHTML = `<section class="panel">
    <div class="panel-header"><div><h2>Replay Caster</h2><p>Watch a completed AI-vs-AI match unfold live with synchronized commentary.</p></div></div>
    <div class="panel-body">
      <div class="caster-setup">
        <div class="caster-setup-section">
          <h3>Match Configuration</h3>
          <div class="caster-setup-row">
            <label>Policy A (Seat 1)<select id="caster-p1">${policyOptions(c.p1Policy)}</select></label>
            <label>Policy B (Seat 2)<select id="caster-p2">${policyOptions(c.p2Policy)}</select></label>
          </div>
          <div class="caster-setup-row">
            <label>Seed<input type="number" id="caster-seed" value="${c.seed}" min="0" max="999999"></label>
            <label>Decision Limit<input type="number" id="caster-decision-limit" value="${c.decisionLimit}" min="50" max="5000"></label>
          </div>
        </div>
        <div class="caster-setup-section">
          <h3>Commentary</h3>
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
        <div class="caster-setup-actions">
          <button id="caster-start" class="primary-button">Generate & Cast Match</button>
        </div>
        ${renderReplayLibrarySection()}
        <div class="caster-setup-note">
          <p>The match is fully generated before playback begins. Commentary never generates or resolves gameplay.
          Disabling Caster or Ollama does not change match results or hashes.</p>
        </div>
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
  appEl.innerHTML = `<section class="panel">
    <div class="panel-header"><div><h2>Replay Caster — Generating Match…</h2></div></div>
    <div class="panel-body">
      <div class="loading-state">
        <span class="loading-spinner" aria-hidden="true"></span>
        <strong>${esc(casterState.loadingMessage || 'Running match in worker…')}</strong>
        <small>The completed match will be replayed with live-style pacing.</small>
      </div>
    </div>
  </section>`;
}

// ── Error screen ──────────────────────────────────────────────────

function renderError(appEl, error) {
  appEl.innerHTML = `<section class="panel">
    <div class="panel-header"><div><h2>Replay Caster — Error</h2></div></div>
    <div class="panel-body">
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

function renderTheatre(appEl) {
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
  const scores = ps.scores || {};
  const goals = ps.goals || {};
  const seatOrder = session.matchResult?.summary?.seatOrder || ['P1', 'P2'];
  const policyIds = session.policyIds || [];
  const isFinished = beat.beatKind === 'MATCH_END';
  const winner = ps.winner;

  // Score bars
  const scoreBars = seatOrder.map((id, i) => {
    const score = scores[id] ?? 0;
    const goal = goals[id] ?? 21;
    const pct = Math.min(100, (score / goal) * 100);
    const policyLabel = policyIds[i] ? policyIds[i].replace(/-/g, ' ') : id;
    return `<div class="caster-score-bar">
      <div class="caster-score-label"><span class="caster-seat">Seat ${i + 1}</span> <span class="caster-policy">${esc(policyLabel)}</span></div>
      <div class="caster-score-track"><div class="caster-score-fill" style="width:${pct}%"></div></div>
      <div class="caster-score-value">${score} / ${goal}</div>
    </div>`;
  }).join('');

  // Timeline
  const timelineItems = beats.map((b, i) => {
    const isCurrent = i === idx;
    const label = beatLabel(b);
    const cls = b.beatKind === 'MATCH_END' ? 'caster-tl-end' :
                b.beatKind === 'MATCH_START' ? 'caster-tl-start' :
                b.beatKind === 'TURN_START' ? 'caster-tl-turn' :
                b.beatKind === 'RESPONSE' ? 'caster-tl-response' : 'caster-tl-decision';
    return `<button class="caster-tl-item ${cls} ${isCurrent ? 'current' : ''}" data-idx="${i}" title="${esc(label)}"><span class="caster-tl-dot"></span></button>`;
  }).join('');

  // WAIT WHAT panel
  const ww = casterState.waitWhatVisible && casterState.waitWhatCapture
    ? renderWaitWhatPanel(casterState.waitWhatCapture)
    : '';

  // Commentary error
  const commentaryErr = casterState.commentaryError
    ? `<div class="caster-commentary-error" data-testid="caster-commentary-error">Commentary unavailable: ${esc(casterState.commentaryError)}</div>`
    : '';

  // Commentary loading
  const commentaryLoading = casterState.commentaryLoading
    ? '<div class="caster-commentary-loading">Generating commentary…</div>'
    : '';

  // Commentary display (safe text rendering via textContent after innerHTML)
  const commentaryBlock = casterState.commentaryText
    ? `<div class="caster-commentary" data-testid="caster-commentary">
        <div class="caster-commentary-headline" data-testid="caster-commentary-headline"></div>
        <div class="caster-commentary-body" data-testid="caster-commentary-body"></div>
        <div class="caster-commentary-meta"><span class="caster-tone">${esc(casterState.commentaryTone || '')}</span></div>
      </div>`
    : '<div class="caster-commentary caster-commentary-silent">—</div>';

  appEl.innerHTML = `<section class="panel caster-panel">
    <div class="panel-header">
      <div><h2>Replay Caster ${isFinished && winner ? '— Match Complete' : ''}</h2>
      <p>${esc(policyIds[0]?.replace(/-/g, ' ') || 'Policy A')} vs ${esc(policyIds[1]?.replace(/-/g, ' ') || 'Policy B')} · ${total} beats · ${session.beats.length} total</p></div>
      <div class="toolbar">
        <button id="caster-back-setup" class="secondary-button">← New Match</button>
      </div>
    </div>
    <div class="panel-body">
      <div class="caster-theatre">
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
        <div class="caster-scores" data-testid="caster-scores">${scoreBars}</div>
        ${commentaryBlock}
        ${commentaryLoading}
        ${commentaryErr}
        <div class="caster-actions">
          <button id="caster-wait-what" class="caster-wait-what-btn" data-testid="caster-wait-what">WAIT WHAT?</button>
        </div>
        ${ww}
        <div class="caster-timeline" data-testid="caster-timeline">
          <div class="caster-timeline-label">Timeline</div>
          <div class="caster-timeline-items">${timelineItems}</div>
        </div>
      </div>
    </div>
  </section>`;

  // ── Safe text rendering for commentary (avoid innerHTML with model output) ──
  if (casterState.commentaryText) {
    const headlineEl = appEl.querySelector('[data-testid="caster-commentary-headline"]');
    const bodyEl = appEl.querySelector('[data-testid="caster-commentary-body"]');
    if (headlineEl) headlineEl.textContent = casterState.commentaryHeadline || '';
    if (bodyEl) bodyEl.textContent = casterState.commentaryText || '';
  }

  // ── Wire up controls ──
  const $ = (id) => appEl.querySelector(`#${id}`);
  $('caster-back-setup').onclick = () => {
    stopTimer();
    if (casterState.worker) { casterState.worker.terminate(); casterState.worker = null; }
    casterState.session = null;
    casterState.commentaryText = '';
    casterState.waitWhatCapture = null;
    casterState.waitWhatVisible = false;
    renderSetup(appEl);
  };
  $('caster-prev').onclick = () => { session.stepBackward(); onBeatChange(appEl); };
  $('caster-play').onclick = () => { session.toggle(); startTimer(appEl); renderTheatre(appEl); };
  $('caster-next').onclick = () => { session.stepForward(); onBeatChange(appEl); };
  $('caster-end').onclick = () => { session.skipToEnd(); onBeatChange(appEl); };
  $('caster-slider').oninput = (e) => { session.director.stepTo(Number(e.target.value)); onBeatChange(appEl); };
  $('caster-speed-ctrl').onchange = (e) => { session.setSpeed(Number(e.target.value)); };
  appEl.querySelectorAll('.caster-tl-item').forEach(btn => {
    btn.onclick = () => { session.director.stepTo(Number(btn.dataset.idx)); onBeatChange(appEl); };
  });
  $('caster-wait-what').onclick = () => {
    const capture = session.waitWhat();
    casterState.waitWhatCapture = capture;
    casterState.waitWhatVisible = true;
    renderTheatre(appEl);
  };

  // If WAIT WHAT panel is visible, wire its jump buttons
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
    if (closeWw) closeWw.onclick = () => { casterState.waitWhatVisible = false; renderTheatre(appEl); };
  }
}

// ── WAIT WHAT panel ───────────────────────────────────────────────

function renderWaitWhatPanel(capture) {
  const beforeItems = (capture.contextBefore || []).map(b =>
    `<li><button class="caster-ww-jump" data-beat-id="${esc(b.beatId)}">${esc(beatLabel(b))}</button></li>`
  ).join('');
  const afterItems = (capture.contextAfter || []).map(b =>
    `<li><button class="caster-ww-jump" data-beat-id="${esc(b.beatId)}">${esc(beatLabel(b))} ${b.redacted ? '🔒' : ''}</button></li>`
  ).join('');
  const diags = (capture.diagnostics || []).map(d =>
    `<li><strong>${esc(d.verdict)}</strong>: ${esc(d.observed)} <small>(${esc(d.category)})</small></li>`
  ).join('');

  return `<div class="caster-wait-what" data-testid="caster-wait-what-panel">
    <div class="caster-ww-header">
      <h3>WAIT WHAT — Investigation Envelope</h3>
      <button id="caster-ww-close" class="secondary-button">✕</button>
    </div>
    <div class="caster-ww-body">
      <div class="caster-ww-meta">
        <p><strong>Capture:</strong> ${esc(capture.captureId)}</p>
        <p><strong>Beat:</strong> ${esc(capture.casterBeatId || '—')} · <strong>Decision:</strong> ${esc(capture.decisionId || '—')}</p>
        <p><strong>Checkpoint:</strong> <code>${esc(capture.checkpointHash?.slice(0, 16) || '—')}</code></p>
        <p><strong>Viewer mode:</strong> ${esc(capture.viewerMode)} ${capture.redacted ? '· future redacted' : ''}</p>
      </div>
      ${diags ? `<div class="caster-ww-diagnostics"><h4>Diagnostics</h4><ul>${diags}</ul></div>` : ''}
      <div class="caster-ww-context">
        <div class="caster-ww-before"><h4>Before</h4><ul>${beforeItems || '<li>—</li>'}</ul></div>
        <div class="caster-ww-after"><h4>After</h4><ul>${afterItems || '<li>—</li>'}</ul></div>
      </div>
      <div class="caster-ww-commentary">
        ${capture.commentary ? `<p><strong>Commentary:</strong> <span id="caster-ww-commentary-text"></span></p>` : '<p><em>No commentary for this beat.</em></p>'}
      </div>
    </div>
  </div>`;
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
  renderTheatre(appEl);
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
  // Pause playback but preserve the session for resume.
  if (casterState.session) {
    try { casterState.session.pause(); } catch { /* ignore */ }
  }
  casterState.waitWhatVisible = false;
}
