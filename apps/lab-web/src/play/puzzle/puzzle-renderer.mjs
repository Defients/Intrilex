// puzzle-renderer.mjs - Pure-function dev UI renderer for Puzzle Mode v0.1.0.
//
// Receives a PuzzleRuntime snapshot (authorized, no commands, no hidden info)
// and renders HTML. Visual polish is intentionally secondary; correctness and
// observability come first. Reuses the canonical card component for board
// rendering so the puzzle board is the same board used in real play.

import { renderTcgCard } from '../play-card-component.js';
import { actionLabel, shortActionLabel, familyLabel, decisionKindLabel } from '../action-presenter.js';
import { PuzzleRuntimeStatus, PuzzleObjectiveType } from './puzzle-types.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function objectiveLabel(obj) {
  if (!obj) return '';
  if (obj.type === PuzzleObjectiveType.WIN_THIS_TURN) return 'Win this turn';
  if (obj.type === PuzzleObjectiveType.WIN_WITHIN_TURNS) return `Win within ${obj.maxTurns} turn${obj.maxTurns === 1 ? '' : 's'}`;
  if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS) return `Survive ${obj.turns} turn${obj.turns === 1 ? '' : 's'}`;
  return obj.type;
}

function objectiveProgress(snap) {
  if (!snap || !snap.objective) return '';
  const obj = snap.objective;
  const elapsed = (snap.match?.fullTurnSequence ?? 0) - (snap.match?.startingFullTurnSequence ?? 0);
  if (obj.type === PuzzleObjectiveType.WIN_THIS_TURN) {
    return `Turn ${snap.match?.fullTurnSequence ?? '?'} (must win before it advances)`;
  }
  if (obj.type === PuzzleObjectiveType.WIN_WITHIN_TURNS) {
    return `Turns elapsed: ${elapsed} / ${obj.maxTurns}`;
  }
  if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
    return `Turns survived: ${elapsed} / ${obj.turns}`;
  }
  return '';
}

function statusBadge(status) {
  const map = {
    [PuzzleRuntimeStatus.UNLOADED]: ['UNLOADED', 'puzzle-status--idle'],
    [PuzzleRuntimeStatus.READY]: ['READY', 'puzzle-status--ready'],
    [PuzzleRuntimeStatus.PLAYING]: ['PLAYING', 'puzzle-status--playing'],
    [PuzzleRuntimeStatus.WON]: ['WON', 'puzzle-status--won'],
    [PuzzleRuntimeStatus.FAILED]: ['FAILED', 'puzzle-status--failed'],
    [PuzzleRuntimeStatus.ERROR]: ['ERROR', 'puzzle-status--error'],
  };
  const [label, cls] = map[status] ?? [String(status), 'puzzle-status--idle'];
  return `<span class="puzzle-status-badge ${cls}">${esc(label)}</span>`;
}

function renderCardList(cards, opts = {}) {
  if (!cards || cards.length === 0) return `<div class="puzzle-card-row puzzle-card-row--empty">${esc(opts.empty ?? 'empty')}</div>`;
  return `<div class="puzzle-card-row">${cards.map((c) => renderTcgCard(c, { zoneClass: opts.zoneClass })).join('')}</div>`;
}

function renderBoard(snap) {
  const pv = snap.playerView;
  if (!pv) return '<div class="puzzle-board-empty">No view available.</div>';
  const own = pv.own ?? {};
  const opp = pv.opponents?.[0] ?? {};
  const humanScore = own.securedPoints ?? 0;
  const oppScore = opp.securedPoints ?? 0;
  const goal = own.goal ?? 21;
  return `<div class="puzzle-board">
    <div class="puzzle-board-side puzzle-board-side--opponent">
      <div class="puzzle-side-header">
        <span class="puzzle-side-name">Opponent (${esc(opp.playerId ?? 'P2')})</span>
        <span class="puzzle-side-score">${oppScore} / ${goal}</span>
        <span class="puzzle-side-hand">Hand: ${esc(opp.handCount ?? '?')}</span>
      </div>
      <div class="puzzle-zone-label">Effect Row</div>
      ${renderCardList(opp.er, { zoneClass: 'zone-er' })}
      <div class="puzzle-zone-label">Point Row</div>
      ${renderCardList(opp.pr, { zoneClass: 'zone-pr' })}
    </div>
    <div class="puzzle-board-side puzzle-board-side--self">
      <div class="puzzle-side-header">
        <span class="puzzle-side-name">You (${esc(snap.perspectivePlayerId)})</span>
        <span class="puzzle-side-score">${humanScore} / ${goal}</span>
      </div>
      <div class="puzzle-zone-label">Point Row</div>
      ${renderCardList(own.pr, { zoneClass: 'zone-pr' })}
      <div class="puzzle-zone-label">Effect Row</div>
      ${renderCardList(own.er, { zoneClass: 'zone-er' })}
      <div class="puzzle-zone-label">Hand</div>
      ${renderCardList(own.hand, { zoneClass: 'zone-hand' })}
    </div>
  </div>`;
}

function renderActions(snap) {
  const decision = snap.decision;
  if (!decision) return '<div class="puzzle-actions-empty">No active decision.</div>';
  if (!decision.isHuman) {
    return `<div class="puzzle-actions puzzle-actions--opponent"><p>Opponent turn (${esc(decision.actorId)}). Auto-resolving via canonical engine + opponent policy.</p></div>`;
  }
  const actions = decision.legalActions ?? [];
  if (actions.length === 0) return '<div class="puzzle-actions-empty">No legal actions.</div>';
  const items = actions.map((a) => {
    const label = actionLabel(a) || shortActionLabel(a) || a.actionId;
    const fam = familyLabel(a.family) ?? a.family;
    const kind = decisionKindLabel(decision.kind) ?? '';
    return `<button class="puzzle-action" data-puzzle-action="${esc(a.actionId)}" type="button">
      <span class="puzzle-action-label">${esc(label)}</span>
      <span class="puzzle-action-meta">${esc(fam)}${kind ? ' &middot; ' + esc(kind) : ''}</span>
    </button>`;
  }).join('');
  return `<div class="puzzle-actions" role="group" aria-label="Legal actions">${items}</div>`;
}

function renderDiagnostics(snap, diagnostics, solverResult) {
  const d = diagnostics ?? {};
  const rows = [
    ['Puzzle ID', d.puzzleId ?? '-'],
    ['Schema', d.schemaVersion ?? '-'],
    ['Status', d.status ?? '-'],
    ['Valid', String(d.valid ?? '-')],
    ['Active player', d.activePlayerId ?? '-'],
    ['Phase', d.phase ?? '-'],
    ['Turn', `${d.fullTurnSequence ?? '-'} (start ${d.startingFullTurnSequence ?? '-'})`],
    ['Perspective', d.perspectivePlayerId ?? '-'],
    ['Objective', d.objective ? objectiveLabel(d.objective) : '-'],
    ['Legal actions', String(d.legalActionCount ?? 0)],
    ['Seed', String(d.seed ?? '-')],
    ['State fingerprint', (d.stateFingerprint ?? '').slice(0, 16)],
    ['Initial fingerprint', (d.initialStateFingerprint ?? '').slice(0, 16)],
    ['Attempt actions', String(d.attemptActions ?? 0)],
    ['Attempt result', d.attemptResult ?? '-'],
  ];
  if (d.error) rows.push(['Error', `${d.error.code ?? 'ERROR'}: ${esc(d.error.message ?? '')}`]);
  if (solverResult) {
    rows.push(['Solver status', solverResult.status]);
    rows.push(['Solver proven', String(solverResult.proven)]);
    rows.push(['Solver nodes', String(solverResult.nodesExplored)]);
    rows.push(['Solver depth', String(solverResult.depth)]);
    rows.push(['Solver elapsed (ms)', String(solverResult.elapsedMs)]);
    rows.push(['Solver line length', String(solverResult.actions?.length ?? 0)]);
  }
  const issues = (d.validationIssues ?? []).map((i) => `<li class="puzzle-issue puzzle-issue--${i.severity}"><code>${esc(i.code)}</code> ${esc(i.message)}${i.path ? ` <span class="puzzle-issue-path">@${esc(i.path)}</span>` : ''}</li>`).join('');
  return `<details class="puzzle-diagnostics">
    <summary>Diagnostics</summary>
    <table class="puzzle-diag-table">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`).join('')}</table>
    ${issues ? `<ul class="puzzle-issues">${issues}</ul>` : ''}
  </details>`;
}

function renderSolverPanel(snap, solverResult, analyzing) {
  if (analyzing) return `<div class="puzzle-solver"><h3>Analysis</h3><p>Analyzing... (bounded canonical search)</p></div>`;
  if (!solverResult) {
    return `<div class="puzzle-solver"><h3>Analysis</h3><p>Click "Analyze" to run a bounded canonical legal-action search.</p><p class="puzzle-solver-note">Proof semantics: PROVEN_WIN means the perspective can force the objective regardless of opponent. BEST_FOUND means a line was found but optimality is not proven.</p></div>`;
  }
  const line = (solverResult.actions ?? []).map((c, i) => `<li>${i + 1}. <code>${esc(c.action?.kind ?? c.kind ?? 'command')}</code> (${esc(c.actorId ?? '?')})</li>`).join('');
  return `<div class="puzzle-solver">
    <h3>Analysis</h3>
    <table class="puzzle-diag-table">
      <tr><th>Status</th><td><strong>${esc(solverResult.status)}</strong></td></tr>
      <tr><th>Proven</th><td>${esc(String(solverResult.proven))}</td></tr>
      <tr><th>Nodes</th><td>${esc(String(solverResult.nodesExplored))}</td></tr>
      <tr><th>Depth</th><td>${esc(String(solverResult.depth))}</td></tr>
      <tr><th>Elapsed</th><td>${esc(String(solverResult.elapsedMs))} ms</td></tr>
    </table>
    ${line ? `<details><summary>Discovered line (${solverResult.actions.length} actions)</summary><ol class="puzzle-solver-line">${line}</ol></details>` : ''}
  </div>`;
}

/**
 * Render the full Puzzle Mode dev surface.
 * @param {object} snap - PuzzleRuntime.getSnapshot() output
 * @param {object} opts - { fixtures, currentId, diagnostics, solverResult, analyzing }
 * @returns {string} HTML
 */
export function renderPuzzleWorkspace(snap, opts = {}) {
  const fixtures = opts.fixtures ?? [];
  const currentId = opts.currentId ?? null;
  const diagnostics = opts.diagnostics ?? null;
  const solverResult = opts.solverResult ?? null;
  const analyzing = Boolean(opts.analyzing);

  if (!snap || snap.status === PuzzleRuntimeStatus.UNLOADED) {
    const list = fixtures.map((f) => `<option value="${esc(f.id)}"${f.id === currentId ? ' selected' : ''}>${esc(f.id)} &mdash; ${esc(f.title)}</option>`).join('');
    return `<div class="puzzle-workspace">
      <header class="puzzle-header"><h1>Puzzle Mode v0.1.0</h1><span class="puzzle-dev-tag">developer experimental</span></header>
      <p class="puzzle-intro">A puzzle is a constrained canonical Intrilex game state plus an objective. Every action passes through the real engine.</p>
      <div class="puzzle-selector">
        <label for="puzzle-select">Puzzle</label>
        <select id="puzzle-select">${list || '<option>(no fixtures)</option>'}</select>
        <button id="puzzle-load" type="button">Load</button>
      </div>
      ${snap?.error ? `<div class="puzzle-error">${esc(snap.error.code ?? 'ERROR')}: ${esc(snap.error.message ?? '')}</div>` : ''}
      ${renderDiagnostics(snap, diagnostics, solverResult)}
    </div>`;
  }

  const status = snap.status;
  const resultBanner = status === PuzzleRuntimeStatus.WON
    ? `<div class="puzzle-banner puzzle-banner--won">Solved. Objective achieved through canonical play.</div>`
    : status === PuzzleRuntimeStatus.FAILED
      ? `<div class="puzzle-banner puzzle-banner--failed">Failed. ${esc(snap.attempt?.failureReason ?? 'Objective not met')}. Restart to try again.</div>`
      : status === PuzzleRuntimeStatus.ERROR
        ? `<div class="puzzle-banner puzzle-banner--error">Error: ${esc(snap.error?.code ?? '')} &mdash; ${esc(snap.error?.message ?? '')}</div>`
        : '';

  const list = fixtures.map((f) => `<option value="${esc(f.id)}"${f.id === currentId ? ' selected' : ''}>${esc(f.id)} &mdash; ${esc(f.title)}</option>`).join('');

  return `<div class="puzzle-workspace">
    <header class="puzzle-header"><h1>Puzzle Mode v0.1.0</h1><span class="puzzle-dev-tag">developer experimental</span></header>
    <div class="puzzle-selector">
      <label for="puzzle-select">Puzzle</label>
      <select id="puzzle-select">${list}</select>
      <button id="puzzle-load" type="button">Load</button>
      <button id="puzzle-restart" type="button">Restart</button>
      <button id="puzzle-analyze" type="button" ${status === PuzzleRuntimeStatus.PLAYING || status === PuzzleRuntimeStatus.READY ? '' : 'disabled'}>Analyze</button>
    </div>
    <div class="puzzle-objective">
      <h2>${esc(snap.title ?? '')}</h2>
      <p class="puzzle-objective-text"><strong>Objective:</strong> ${esc(objectiveLabel(snap.objective))}</p>
      <p class="puzzle-objective-progress">${esc(objectiveProgress(snap))}</p>
      ${snap.description ? `<p class="puzzle-objective-desc">${esc(snap.description)}</p>` : ''}
      <p class="puzzle-status-line">${statusBadge(status)} ${snap.decision ? (snap.decision.isHuman ? 'Your move' : `Opponent (${esc(snap.decision.actorId)}) resolving`) : ''}</p>
    </div>
    ${resultBanner}
    ${renderBoard(snap)}
    ${renderActions(snap)}
    ${renderSolverPanel(snap, solverResult, analyzing)}
    ${renderDiagnostics(snap, diagnostics, solverResult)}
  </div>`;
}

export { objectiveLabel };
