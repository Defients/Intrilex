// ═══════════════════════════════════════════════════════════════
// workspaces/tournament.js — /tournament workspace: AI tournament mode
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, pct, short, definitionList, showToast, clamp } from '../state.js';
import { rerender } from '../rerender.js';
import { createTournament, recordMatchResult, getNextMatch, getTournamentSummary, getTournamentAnalytics } from './tournament-scheduler.js';
import { isIndexedDBAvailable, saveTournament, loadTournament, listTournaments, deleteTournament } from '../play/persistence.js';
import { donutChart, barChart, sparkline, chartTableAlternative } from '../chart-toolkit.js';

const ALL_POLICIES = [
  'random-legal','score-rush','control','tempo','value',
  'hybrix-rusher','hybrix-defender','hybrix-trickster','hybrix-sniper',
  'hybrix-support','hybrix-tank','hybrix-baseline',
  'hybrix-rusher-hard','hybrix-defender-hard','hybrix-trickster-hard','hybrix-sniper-hard',
  'hybrix-rusher-easy','hybrix-defender-easy',
  'hybrix-rusher-nightmare','hybrix-defender-nightmare'
];

const POLICY_LABEL = id => id.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());

export async function renderTournament() {
  if (state.tournamentLiveView?.active) { renderLiveViewer(); return; }
  const tournament = state.tournament;
  if (!tournament) { await renderTournamentSetup(); return; }
  renderTournamentBracket(tournament);
}

// ── Setup screen ────────────────────────────────────────────────

async function renderTournamentSetup() {
  const selected = state.tournamentSelectedPolicies ?? ['score-rush','control','tempo','value','hybrix-rusher','hybrix-defender','hybrix-trickster','hybrix-sniper'];
  const bestOf = state.tournamentBestOf ?? 1;

  // Check for saved tournaments
  let savedTournaments = [];
  if (isIndexedDBAvailable()) {
    try { savedTournaments = await listTournaments(); } catch { /* ignore */ }
  }

  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Tournament Mode</h2><p>Single-elimination AI-vs-AI bracket. Select 2–16 policies, run matches, crown a champion. Third-place match for brackets with 4+ policies.</p></div></div><div class="panel-body">
    ${savedTournaments.length > 0 ? `<div class="notice" style="margin-bottom:12px"><strong>Saved tournaments:</strong> ${savedTournaments.map(t => `<button class="ghost-button tournament-resume-btn" data-tournament-id="${esc(t.tournamentId)}" style="margin:2px">${esc(POLICY_LABEL(t.champion || 'In Progress'))} (${t.policyCount}p, Bo${t.bestOf})</button>`).join(' ')}</div>` : ''}
    <div class="experiment-grid">
      <div class="tournament-policy-grid">
        <h3>Select Policies (${selected.length} selected)</h3>
        <div class="tournament-policy-list">
          ${ALL_POLICIES.map(id => `<label class="tournament-policy-checkbox"><input type="checkbox" value="${esc(id)}" ${selected.includes(id) ? 'checked' : ''}><span>${esc(POLICY_LABEL(id))}</span></label>`).join('')}
        </div>
      </div>
      <div class="inline-fields">
        <label>Best of<select id="tournament-bestof"><option value="1" ${bestOf === 1 ? 'selected' : ''}>1 (single game)</option><option value="3" ${bestOf === 3 ? 'selected' : ''}>3</option><option value="5" ${bestOf === 5 ? 'selected' : ''}>5</option><option value="7" ${bestOf === 7 ? 'selected' : ''}>7</option></select></label>
        <button id="tournament-start" class="primary-button" aria-label="Start tournament with selected policies" ${selected.length < 2 ? 'disabled' : ''}>Start Tournament</button>
      </div>
    </div>
    <div class="notice"><strong>Format:</strong> Single-elimination bracket. Policies are seeded by selection order. BYEs fill remaining slots to the next power of 2. Best-of > 1 uses AB/BA seat-swap for fairness. Each match runs deterministically with a shared seed.</div>
  </div></section>`;

  document.querySelectorAll('.tournament-resume-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.tournamentId;
      try {
        const saved = await loadTournament(id);
        if (saved) {
          state.tournament = saved;
          state.tournamentRunning = false;
          state.tournamentAutoPlaying = false;
          rerender();
        }
      } catch (err) {
        showToast(err.message, { type: 'error', title: 'Failed to load tournament' });
      }
    };
  });
  document.querySelectorAll('.tournament-policy-checkbox input').forEach(cb => {
    cb.onchange = () => {
      const checked = [...document.querySelectorAll('.tournament-policy-checkbox input:checked')].map(el => el.value);
      state.tournamentSelectedPolicies = checked;
      document.querySelector('#tournament-start').disabled = checked.length < 2;
      document.querySelector('.tournament-policy-grid h3').textContent = `Select Policies (${checked.length} selected)`;
    };
  });
  document.querySelector('#tournament-bestof').onchange = e => { state.tournamentBestOf = Number(e.target.value); };
  document.querySelector('#tournament-start').onclick = async () => {
    const policies = state.tournamentSelectedPolicies ?? selected;
    const bo = Number(document.querySelector('#tournament-bestof').value);
    try {
      state.tournament = createTournament(policies, { bestOf: bo });
      state.tournament.tournamentId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      state.tournamentRunning = false;
      state.tournamentAutoPlaying = false;
      // Persist tournament
      if (isIndexedDBAvailable()) {
        try { await saveTournament(state.tournament); } catch { /* non-fatal */ }
      }
      rerender();
    } catch (err) {
      app.innerHTML = `<div class="notice danger"><strong>Error:</strong> ${esc(err.message)}</div>`;
    }
  };
}

// ── Bracket screen ──────────────────────────────────────────────

function renderTournamentBracket(tournament) {
  const summary = getTournamentSummary(tournament);
  const nextMatch = getNextMatch(tournament);
  const isRunning = state.tournamentRunning ?? false;
  const isAutoPlaying = state.tournamentAutoPlaying ?? false;
  const isComplete = tournament.status === 'completed';

  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Tournament ${isComplete ? '— Complete' : ''}</h2><p>${tournament.policyCount} policies · Best of ${tournament.bestOf} · ${summary.completedMatches}/${summary.totalMatches} matches completed</p></div><div class="toolbar">
    ${nextMatch && !isRunning ? `<button id="tournament-play-next" class="primary-button" aria-label="Play next tournament match">Play Next Match</button>` : ''}
    ${nextMatch && !isRunning ? `<button id="tournament-watch-live" class="secondary-button" aria-label="Watch the next match play out live">Watch Live</button>` : ''}
    ${nextMatch && !isRunning ? `<button id="tournament-auto-play" class="secondary-button" aria-label="Auto-play all remaining matches">Run All</button>` : ''}
    ${isRunning ? `<button id="tournament-stop" class="secondary-button" aria-label="Stop auto-play">Stop</button>` : ''}
    ${isRunning && !isAutoPlaying ? `<button id="tournament-running" class="primary-button" disabled aria-busy="true">Running…</button>` : ''}
    ${isComplete ? `<button id="tournament-export" class="secondary-button" aria-label="Export tournament data">Export</button>` : ''}
    <button id="tournament-reset" class="secondary-button" aria-label="Start a new tournament">New Tournament</button>
  </div></div><div class="panel-body">
    ${renderProgress(summary)}
    ${isComplete ? renderChampion(tournament) : ''}
    ${renderBracketRounds(tournament)}
    ${tournament.thirdPlaceMatch ? renderThirdPlaceMatch(tournament) : ''}
    ${isComplete ? renderTournamentAnalytics(tournament) : ''}
    ${renderStandings(summary)}
  </div></section>`;

  document.querySelector('#tournament-reset').onclick = async () => {
    // Delete saved tournament from IndexedDB
    if (isIndexedDBAvailable() && tournament.tournamentId) {
      try { await deleteTournament(tournament.tournamentId); } catch { /* non-fatal */ }
    }
    state.tournament = null;
    state.tournamentRunning = false;
    state.tournamentAutoPlaying = false;
    rerender();
  };
  const playBtn = document.querySelector('#tournament-play-next');
  if (playBtn) playBtn.onclick = () => playNextMatch(tournament);
  const watchBtn = document.querySelector('#tournament-watch-live');
  if (watchBtn) watchBtn.onclick = () => watchLiveMatch(tournament);
  const autoBtn = document.querySelector('#tournament-auto-play');
  if (autoBtn) autoBtn.onclick = () => autoPlayTournament(tournament);
  const stopBtn = document.querySelector('#tournament-stop');
  if (stopBtn) stopBtn.onclick = () => { state.tournamentAutoPlaying = false; };
  const exportBtn = document.querySelector('#tournament-export');
  if (exportBtn) exportBtn.onclick = () => exportTournament(tournament);
  // Chart "View as table" toggles inside the analytics panel
  ['#tournament-donut-chart', '#tournament-bar-chart'].forEach(sel => {
    const container = document.querySelector(sel);
    if (!container) return;
    const btn = container.querySelector('[data-chart-toggle]');
    const table = container.querySelector('[data-chart-table]');
    if (!btn || !table) return;
    btn.onclick = () => {
      const hidden = table.hasAttribute('hidden');
      if (hidden) { table.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); btn.textContent = 'Hide table'; }
      else { table.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'View as table'; }
    };
  });
  // Tournament → Compare cross-workspace navigation (Phase 3A)
  document.querySelectorAll('[data-compare-policy]').forEach(row => row.onclick = () => {
    state.selectedPolicy = row.dataset.comparePolicy;
    location.hash = '#/compare';
  });
}

function renderProgress(summary) {
  const pctVal = Math.round(summary.progress * 100);
  return `<div class="campaign-progress" ${summary.status === 'completed' ? 'hidden' : ''}><div class="campaign-progress-bar"><div class="campaign-progress-bar-fill" style="width:${pctVal}%"></div></div><small>${pctVal}% complete</small></div>`;
}

function renderChampion(tournament) {
  const champion = tournament.champion;
  const runnerUp = tournament.runnerUp;
  const thirdPlace = tournament.thirdPlace;
  return `<div class="panel" style="margin-bottom:16px;border-color:var(--accent)"><div class="panel-body" style="text-align:center;padding:24px"><div style="font-size:2em" aria-hidden="true">🏆</div><h2 style="margin:8px 0 4px">Champion: ${esc(POLICY_LABEL(champion))}</h2><small class="mono">${esc(champion)}</small>${runnerUp ? `<div style="margin-top:8px"><span style="color:var(--text-dim)">Runner-up:</span> ${esc(POLICY_LABEL(runnerUp))}</div>` : ''}${thirdPlace ? `<div><span style="color:var(--text-dim)">Third place:</span> ${esc(POLICY_LABEL(thirdPlace))}</div>` : ''}</div></div>`;
}

function renderBracketRounds(tournament) {
  return `<div class="tournament-bracket">${tournament.rounds.map(round => renderRound(round, tournament)).join('')}</div>`;
}

function renderThirdPlaceMatch(tournament) {
  const tpm = tournament.thirdPlaceMatch;
  if (!tpm) return '';
  const s1Class = tpm.winner === tpm.seat1Policy ? 'winner' : tpm.winner && tpm.winner !== tpm.seat1Policy ? 'loser' : '';
  const s2Class = tpm.winner === tpm.seat2Policy ? 'winner' : tpm.winner && tpm.winner !== tpm.seat2Policy ? 'loser' : '';
  const statusText = tpm.status === 'completed' ? `Winner: ${esc(POLICY_LABEL(tpm.winner))}` : tpm.status === 'ready' ? 'Ready' : 'Waiting for semifinals';
  const isNext = getNextMatch(tournament)?.matchId === tpm.matchId;
  const gameCount = tpm.games.length;
  return `<div class="tournament-bracket" style="margin-top:16px"><div class="tournament-round"><div class="tournament-round-label">Third Place</div><div class="tournament-match ${isNext ? 'next' : ''} ${tpm.status === 'completed' ? 'completed' : ''}" style="border-color:var(--text-dim)"><div class="tournament-match-header">Consolation${gameCount > 0 ? ` · ${gameCount} game${gameCount > 1 ? 's' : ''}` : ''}</div><div class="tournament-slot ${s1Class}">${tpm.seat1Policy ? esc(POLICY_LABEL(tpm.seat1Policy)) : '<span class="tournament-tbd">TBD</span>'}</div><div class="tournament-slot ${s2Class}">${tpm.seat2Policy ? esc(POLICY_LABEL(tpm.seat2Policy)) : '<span class="tournament-tbd">TBD</span>'}</div><small class="tournament-match-status ${tpm.status === 'completed' ? 'completed' : tpm.status === 'ready' ? 'ready' : ''}">${esc(statusText)}</small></div></div></div>`;
}

function renderRound(round, tournament) {
  const matches = round.matches.map(m => renderMatch(m, tournament)).join('');
  return `<div class="tournament-round"><div class="tournament-round-label">${esc(round.roundLabel)}</div>${matches}</div>`;
}

function renderMatch(match, tournament) {
  if (match.isBye && match.status === 'completed') {
    return `<div class="tournament-match bye"><div class="tournament-match-header">${esc(match.matchId)}</div><div class="tournament-slot winner">${esc(POLICY_LABEL(match.seat1Policy || match.seat2Policy))}</div><div class="tournament-slot bye">BYE</div><small class="tournament-match-status">BYE</small></div>`;
  }
  const s1Class = match.winner === match.seat1Policy ? 'winner' : match.winner && match.winner !== match.seat1Policy ? 'loser' : '';
  const s2Class = match.winner === match.seat2Policy ? 'winner' : match.winner && match.winner !== match.seat2Policy ? 'loser' : '';
  const statusText = match.status === 'completed' ? `Winner: ${esc(POLICY_LABEL(match.winner))}` : match.status === 'ready' ? 'Ready' : match.seat1Policy && match.seat2Policy ? 'Ready' : 'Waiting';
  const isNext = getNextMatch(tournament)?.matchId === match.matchId;
  const gameCount = match.games.length;
  return `<div class="tournament-match ${isNext ? 'next' : ''} ${match.status === 'completed' ? 'completed' : ''}">
    <div class="tournament-match-header">${esc(match.matchId)}${gameCount > 0 ? ` · ${gameCount} game${gameCount > 1 ? 's' : ''}` : ''}</div>
    <div class="tournament-slot ${s1Class}">${match.seat1Policy ? esc(POLICY_LABEL(match.seat1Policy)) : '<span class="tournament-tbd">TBD</span>'}</div>
    <div class="tournament-slot ${s2Class}">${match.seat2Policy ? esc(POLICY_LABEL(match.seat2Policy)) : '<span class="tournament-tbd">TBD</span>'}</div>
    <small class="tournament-match-status ${match.status === 'completed' ? 'completed' : match.status === 'ready' || (match.seat1Policy && match.seat2Policy) ? 'ready' : ''}">${esc(statusText)}</small>
  </div>`;
}

function renderTournamentAnalytics(tournament) {
  const a = getTournamentAnalytics(tournament);
  const policyEntries = Object.entries(a.policyPerformance).sort(([,x],[,y]) => y.matchWins - x.matchWins || y.wins - x.wins);
  // Donut chart of policy win distribution (match wins)
  const donutSegments = policyEntries
    .filter(([, s]) => s.matchWins > 0)
    .map(([id, s]) => ({ label: POLICY_LABEL(id), value: s.matchWins }));
  const donutSvg = donutSegments.length > 0
    ? donutChart({ segments: donutSegments, size: 180, title: 'Policy match-win distribution', ariaLabel: 'Donut chart of policy match-win distribution' })
    : '';
  // Bar chart of per-policy game win rates
  const barItems = policyEntries.map(([id, s]) => ({
    label: POLICY_LABEL(id),
    value: s.gamesPlayed > 0 ? s.wins / s.gamesPlayed : 0,
    color: s.wins >= s.losses ? '#4fd387' : '#f0786f',
  }));
  const barSvg = barItems.length > 0
    ? barChart({ items: barItems, maxValue: 1, width: 480, barHeight: 22, title: 'Per-policy game win rate', ariaLabel: 'Bar chart of per-policy game win rates' })
    : '';
  // Sparkline per policy showing cumulative wins across rounds.
  // Reconstruct cumulative wins from the bracket round structure.
  const sparkPerPolicy = policyEntries.map(([id, s]) => {
    // Build a cumulative win count by walking rounds in order.
    const cumulative = [];
    let running = 0;
    for (const round of tournament.rounds ?? []) {
      for (const m of round.matches ?? []) {
        if (m.status === 'completed' && m.winner === id) { running += 1; }
      }
      cumulative.push(running);
    }
    if (tournament.thirdPlaceMatch?.status === 'completed' && tournament.thirdPlaceMatch.winner === id) {
      running += 1;
      cumulative.push(running);
    }
    return { id, label: POLICY_LABEL(id), values: cumulative.length ? cumulative : [0] };
  });
  const sparkHtml = sparkPerPolicy.map(sp => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="min-width:140px;font-size:12px;color:var(--text-bright)">${esc(sp.label)}</span>${sparkline({ values: sp.values, width: 120, height: 28, color: '#4fd387', title: `Cumulative wins for ${sp.label}`, ariaLabel: `Sparkline of cumulative wins for ${sp.label}` })}</div>`).join('');
  const donutTable = donutSegments.length > 0 ? chartTableAlternative({ headers: ['Policy', 'Match wins'], rows: donutSegments.map(s => [s.label, s.value]), caption: 'Policy match-win distribution' }) : '';
  const barTable = barItems.length > 0 ? chartTableAlternative({ headers: ['Policy', 'Game win rate'], rows: barItems.map(b => [b.label, (b.value * 100).toFixed(1) + '%']), caption: 'Per-policy game win rates' }) : '';
  return `<section class="panel" style="margin-top:16px"><div class="panel-header"><h3>Tournament Analytics</h3></div><div class="panel-body">
    <div class="experiment-grid">
      <div class="stat-card"><span class="stat-value">${a.upsetIndex}</span><span class="stat-label">Upsets (${pct(a.upsetRate)})</span></div>
      <div class="stat-card"><span class="stat-value">${a.avgGamesPerMatch}</span><span class="stat-label">Avg Games/Match</span></div>
      <div class="stat-card"><span class="stat-value">${a.sweeps}</span><span class="stat-label">Sweeps (${pct(a.sweepRate)})</span></div>
      <div class="stat-card"><span class="stat-value">${pct(a.bracketEfficiency)}</span><span class="stat-label">Bracket Efficiency</span></div>
    </div>
    ${a.longestMatch.matchId ? `<div class="notice" style="margin-top:8px"><strong>Longest match:</strong> ${esc(a.longestMatch.matchId)} (${a.longestMatch.games} games)</div>` : ''}
    ${donutSvg ? `<details class="ix-chart-container" data-testid="tournament-donut-chart" open><summary class="ix-chart-header"><h4>Match-win distribution</h4></summary>${donutSvg}<button class="ix-chart-toggle" data-chart-toggle="tournament-donut" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="tournament-donut" hidden>${donutTable}</div></details>` : ''}
    ${barSvg ? `<details class="ix-chart-container" data-testid="tournament-bar-chart" open><summary class="ix-chart-header"><h4>Per-policy game win rate</h4></summary>${barSvg}<button class="ix-chart-toggle" data-chart-toggle="tournament-bar" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="tournament-bar" hidden>${barTable}</div></details>` : ''}
    ${sparkHtml ? `<details class="ix-chart-container" data-testid="tournament-sparklines" open><summary class="ix-chart-header"><h4>Cumulative wins by round</h4></summary>${sparkHtml}</details>` : ''}
    <div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>Policy</th><th>Match W</th><th>Match L</th><th>Game W</th><th>Game L</th><th>Game Rate</th></tr></thead><tbody>${policyEntries.map(([id, s]) => `<tr class="clickable-row" data-compare-policy="${esc(id)}"><td>${esc(POLICY_LABEL(id))}</td><td>${s.matchWins}</td><td>${s.matchLosses}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.gamesPlayed > 0 ? pct(s.wins / s.gamesPlayed) : '—'}</td></tr>`).join('')}</tbody></table></div>
  </div></section>`;
}

function renderStandings(summary) {
  const entries = Object.entries(summary.policyStats).sort((a, b) => b[1].wins - a[1].wins || b[1].gamesPlayed - a[1].gamesPlayed);
  if (!entries.length) return '';
  return `<section class="panel" style="margin-top:16px"><div class="panel-header"><h3>Standings</h3></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Policy</th><th>Wins</th><th>Losses</th><th>Games</th><th>Win Rate</th></tr></thead><tbody>${entries.map(([id, s]) => `<tr><td>${esc(POLICY_LABEL(id))}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.gamesPlayed}</td><td>${s.gamesPlayed > 0 ? pct(s.wins / s.gamesPlayed) : '—'}</td></tr>`).join('')}</tbody></table></div></div></section>`;
}

// ── Match execution ─────────────────────────────────────────────

async function playNextMatch(tournament) {
  if (state.tournamentRunning) return; // Guard against double-click
  const nextMatch = getNextMatch(tournament);
  if (!nextMatch) return;
  state.tournamentRunning = true;
  rerender();

  const worker = new Worker('worker.js', { type: 'module' });
  try {
    await runMatchGames(tournament, nextMatch, worker);

    state.tournamentRunning = false;
    // Persist after match
    if (isIndexedDBAvailable() && state.tournament?.tournamentId) {
      try { await saveTournament(state.tournament); } catch { /* non-fatal */ }
    }
    rerender();
  } catch (err) {
    state.tournamentRunning = false;
    state.tournamentAutoPlaying = false;
    showToast(err.message, { type: 'error', title: 'Tournament error' });
    rerender();
  } finally {
    worker.terminate();
  }
}

async function autoPlayTournament(tournament) {
  if (state.tournamentRunning) return;
  state.tournamentAutoPlaying = true;
  state.tournamentRunning = true;
  rerender();

  const worker = new Worker('worker.js', { type: 'module' });
  try {
    while (state.tournamentAutoPlaying) {
      const nextMatch = getNextMatch(state.tournament);
      if (!nextMatch) break;
      await runMatchGames(state.tournament, nextMatch, worker);
      // Persist after each match during auto-play
      if (isIndexedDBAvailable() && state.tournament?.tournamentId) {
        try { await saveTournament(state.tournament); } catch { /* non-fatal */ }
      }
      rerender();
    }
    state.tournamentAutoPlaying = false;
    state.tournamentRunning = false;
    // Final persist
    if (isIndexedDBAvailable() && state.tournament?.tournamentId) {
      try { await saveTournament(state.tournament); } catch { /* non-fatal */ }
    }
    rerender();
  } catch (err) {
    state.tournamentAutoPlaying = false;
    state.tournamentRunning = false;
    showToast(err.message, { type: 'error', title: 'Tournament auto-play error' });
    rerender();
  } finally {
    worker.terminate();
  }
}

async function runMatchGames(tournament, match, worker) {
  const bestOf = tournament.bestOf;
  const winsNeeded = Math.ceil(bestOf / 2);
  let seat1Wins = 0, seat2Wins = 0;
  const gameNum = match.games.length;

  for (let g = gameNum; g < bestOf && seat1Wins < winsNeeded && seat2Wins < winsNeeded; g += 1) {
    // AB/BA seat-swap: odd games swap P1/P2
    const seatSwapped = g % 2 === 1;
    const p1Policy = seatSwapped ? match.seat2Policy : match.seat1Policy;
    const p2Policy = seatSwapped ? match.seat1Policy : match.seat2Policy;
    const seed = hashSeed(tournament.bracketSize, match.roundIndex, match.matchIndex, g);
    const result = await new Promise((resolve) => {
      worker.onmessage = e => {
        const x = e.data;
        if (x.type === 'autonomy-match-result') resolve(x);
      };
      worker.onerror = e => resolve({ ok: false, error: e.message });
      worker.postMessage({
        type: 'run-autonomy-match',
        config: {
          seed,
          policyIds: [p1Policy, p2Policy],
          decisionLimit: 1800,
          profileId: 'core-advanced-authority'
        }
      });
    });

    if (!result.ok) throw new Error(result.error ?? 'worker error');
    const winner = result.result.summary.winner;
    const summary = result.result.summary;

    // Map P1/P2 back to seat policies (accounting for swap)
    const winningPolicy = winner === 'P1' ? p1Policy : winner === 'P2' ? p2Policy : null;
    if (!winningPolicy) throw new Error(`Invalid winner from worker: ${winner}`);
    if (winningPolicy === match.seat1Policy) seat1Wins += 1;
    else if (winningPolicy === match.seat2Policy) seat2Wins += 1;

    state.tournament = recordMatchResult(state.tournament, match.matchId, winningPolicy, summary);
    rerender();
  }
}

async function exportTournament(tournament) {
  const analytics = getTournamentAnalytics(tournament);
  const summary = getTournamentSummary(tournament);
  const exportData = {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    tournament: {
      tournamentId: tournament.tournamentId,
      policyCount: tournament.policyCount,
      bracketSize: tournament.bracketSize,
      bestOf: tournament.bestOf,
      createdAt: tournament.createdAt,
      champion: tournament.champion,
      runnerUp: tournament.runnerUp,
      thirdPlace: tournament.thirdPlace,
    },
    rounds: tournament.rounds.map(r => ({
      roundLabel: r.roundLabel,
      matches: r.matches.filter(m => !m.isBye).map(m => ({
        matchId: m.matchId,
        seat1: m.seat1Policy,
        seat2: m.seat2Policy,
        winner: m.winner,
        games: m.games.map(g => ({ winner: g.winner, seatSwapped: g.seatSwapped ?? false })),
      })),
    })),
    thirdPlaceMatch: tournament.thirdPlaceMatch ? {
      seat1: tournament.thirdPlaceMatch.seat1Policy,
      seat2: tournament.thirdPlaceMatch.seat2Policy,
      winner: tournament.thirdPlaceMatch.winner,
      games: tournament.thirdPlaceMatch.games.map(g => ({ winner: g.winner, seatSwapped: g.seatSwapped ?? false })),
    } : null,
    analytics,
    summary,
  };
  const json = JSON.stringify(exportData, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    showToast('Tournament exported to clipboard', { type: 'success', title: 'Export complete' });
  } catch {
    showToast('Clipboard unavailable — see console', { type: 'warning', title: 'Export' });
    console.log('[Tournament Export]', json);
  }
}

// Deterministic seed from tournament position
function hashSeed(bracketSize, roundIndex, matchIndex, gameIndex) {
  // Simple deterministic hash from bracket position
  let h = (bracketSize * 1000 + roundIndex * 100 + matchIndex * 10 + gameIndex + 1) >>> 0;
  // Mix it up a bit
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) >>> 0;
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) >>> 0;
  return h || 1;
}

// ═══════════════════════════════════════════════════════════════
// LIVE MATCH VIEWER — watch tournament games play out frame-by-frame
// ═══════════════════════════════════════════════════════════════

// ── Board rendering helpers (mirrors app.js Watch workspace) ────

function liveCardPoint(card) {
  if (Number.isFinite(card?.state?.pointValue)) return card.state.pointValue;
  const rank = String(card?.identity ?? '').replace(/[♣♦♥♠]/gu, '');
  return Number(rank) || ({ A: 4, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 }[rank] ?? 0);
}

function liveSecured(s, player) {
  return (player?.pr ?? []).reduce((sum, id) => {
    const c = s.cards?.[id];
    return sum + (c?.state?.tapped ? 0 : liveCardPoint(c));
  }, 0);
}

function liveMarkerList(card) {
  return [
    card?.state?.tapped ? 'TAP' : '',
    card?.state?.aegis || card?.state?.aegisExpiresAt ? 'AEGIS' : '',
    card?.state?.providesGuard ? 'GUARD' : '',
    card?.state?.anchorValue !== undefined ? 'ANCHOR' : '',
    card?.state?.exileBound ? 'EXILE' : '',
    card?.state?.jackHostId ? 'ATTACH' : '',
  ].filter(Boolean);
}

function liveCardToken(s, id) {
  const card = s.cards?.[id] ?? {};
  const hidden = !card.identity || card.identity === 'HIDDEN';
  const identity = hidden ? '◆' : card.identity;
  const markers = hidden ? [] : liveMarkerList(card);
  const match = String(identity).match(/^(10|[A2-9JQK])([♣♦♥♠])$/u);
  const rank = match?.[1] ?? identity;
  const suit = match?.[2] ?? '';
  const suitClass = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' }[suit] ?? 'neutral';
  const red = /[♦♥]|RJ/.test(card.identity ?? '');
  return `<span class="card-token ${hidden ? 'hidden' : ''} ${red ? 'red' : ''} suit-${suitClass}" data-card="${esc(id)}"><b class="token-rank">${esc(rank)}</b>${suit ? `<span class="token-suit" aria-hidden="true">${esc(suit)}</span>` : ''}<small>${esc(hidden ? 'private' : id)}</small><span class="card-markers">${markers.map(x => `<span class="card-marker">${x}</span>`).join('')}</span></span>`;
}

function liveZone(s, title, ids = [], className = '') {
  return `<section class="zone ${className}"><h4>${esc(title)} · ${ids.length}</h4><div class="cards">${ids.length ? ids.map(id => liveCardToken(s, id)).join('') : '<span class="footer-note">Empty</span>'}</div></section>`;
}

function livePlayerBoard(s, player, id, label) {
  if (!player) return '';
  const points = liveSecured(s, player);
  return `<div class="player-board"><div class="player-header"><span class="player-seat">${esc(label ?? id)}</span><span class="player-score">${points} pts · Goal ${player.goal ?? 0}</span></div><div class="player-zones">${liveZone(s, 'Point Row', player.pr ?? [], 'pr')}${liveZone(s, 'Effect Row', player.er ?? [], 'er')}${liveZone(s, 'Hand', player.hand ?? [], 'hand')}</div></div>`;
}

function liveSemanticLabel(command) {
  const kind = String(command?.action?.kind ?? command?.type ?? 'Initial state').replace(/^(core|autonomy)-/, '').replaceAll('-', ' ');
  return kind.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Frame reconstruction from replay ────────────────────────────

async function reconstructFrames(replay) {
  const { IntrilexEngine } = await import('../engine/browser-entry.js');
  const engine = new IntrilexEngine();
  let s = structuredClone(replay.initialState);
  const frames = [{ state: s, events: [], command: null, commandIndex: -1 }];
  for (const [index, command] of replay.commands.entries()) {
    const result = engine.execute(s, command);
    s = result.state;
    frames.push({ state: s, events: result.events, command, commandIndex: index, accepted: result.accepted });
  }
  return frames;
}

// ── Live viewer rendering ───────────────────────────────────────

function renderLiveViewer() {
  const lv = state.tournamentLiveView;
  if (!lv) return;

  // Loading state — frames being reconstructed or match being computed
  if (lv.loading) {
    app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Live Match — Computing…</h2><p>${esc(POLICY_LABEL(lv.p1Policy ?? '—'))} vs ${esc(POLICY_LABEL(lv.p2Policy ?? '—'))} · Game ${lv.gameNum} of ${lv.bestOf}</p></div><div class="toolbar"><button id="live-cancel" class="secondary-button">Cancel</button></div></div><div class="panel-body"><div class="loading-state"><span class="loading-spinner" aria-hidden="true"></span><strong>Running match in worker…</strong><small>Recording replay for live playback</small></div></div></section>`;
    const cancelBtn = document.querySelector('#live-cancel');
    if (cancelBtn) cancelBtn.onclick = () => cancelLiveMatch();
    return;
  }

  // No frames yet (shouldn't happen, but guard)
  if (!lv.frames || lv.frames.length === 0) {
    app.innerHTML = `<section class="panel"><div class="panel-body"><div class="notice">No replay data available.</div></div></section>`;
    return;
  }

  const frame = lv.frames[lv.currentFrame];
  const s = frame.state;
  const total = lv.frames.length - 1;
  const players = s.turnOrder ?? Object.keys(s.players ?? {});
  const currentCmd = frame.commandIndex >= 0 ? lv.frames[lv.currentFrame].command : null;
  const currentLabel = lv.currentFrame === 0 ? 'Initial state' : liveSemanticLabel(currentCmd);
  const isFinished = lv.currentFrame >= total;
  const p1Label = POLICY_LABEL(lv.p1Policy);
  const p2Label = POLICY_LABEL(lv.p2Policy);

  // Build event types for current frame
  const eventTypes = (frame.events ?? []).map(e => e.type);
  const hasScore = eventTypes.some(t => /SCORE|GOAL/.test(t));
  const hasCounter = eventTypes.some(t => /COUNTER/.test(t));
  const hasUltra = eventTypes.some(t => /ULTRA/.test(t));

  // Game score display
  const scoreDisplay = lv.gameResults
    ? `<span class="notice" style="margin-left:8px">Series: ${lv.seat1Wins}–${lv.seat2Wins}</span>` : '';

  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Live Match ${isFinished && lv.gameWinner ? '— ' + esc(POLICY_LABEL(lv.gameWinner)) + ' wins' : ''}</h2><p>${esc(p1Label)} vs ${esc(p2Label)} · Game ${lv.gameNum} of ${lv.bestOf}${scoreDisplay}</p></div><div class="toolbar">
    <button id="live-back" class="secondary-button" aria-label="Back to bracket">← Bracket</button>
  </div></div><div class="panel-body">
    <div class="watch-layout">
      <div class="watch-controls">
        <div class="transport" role="group" aria-label="Playback transport">
          <button id="live-step-prev" ${lv.currentFrame === 0 ? 'disabled' : ''} title="Previous frame" aria-label="Previous frame">◀</button>
          <button id="live-play-toggle" aria-label="${lv.playing ? 'Pause' : 'Play'}">${lv.playing ? '⏸' : '▶'}</button>
          <button id="live-step-next" ${lv.currentFrame >= total ? 'disabled' : ''} title="Next frame" aria-label="Next frame">▶</button>
          <button id="live-step-end" ${lv.currentFrame >= total ? 'disabled' : ''} title="Skip to end" aria-label="Skip to end">⏭</button>
        </div>
        <div class="progress"><input type="range" id="live-frame-slider" aria-label="Frame slider" min="0" max="${total}" value="${lv.currentFrame}"><span>${lv.currentFrame}/${total}</span></div>
        <div class="speed-control"><label>Speed<select id="live-play-speed"><option value="1" ${lv.speed === 1 ? 'selected' : ''}>1×</option><option value="2" ${lv.speed === 2 ? 'selected' : ''}>2×</option><option value="4" ${lv.speed === 4 ? 'selected' : ''}>4×</option><option value="8" ${lv.speed === 8 ? 'selected' : ''}>8×</option></select></label></div>
        <div class="current-action ${hasUltra ? 'fx-ultra' : hasCounter ? 'fx-counter' : hasScore ? 'fx-score' : ''}"><span class="action-label">${esc(currentLabel)}</span></div>
      </div>
      <div class="watch-board">${players.map((id, i) => {
        const label = i === 0 ? p1Label : p2Label;
        return livePlayerBoard(s, s.players?.[id], id, `${id} · ${label}`);
      }).join('')}</div>
      ${isFinished && lv.gameWinner ? `<div class="notice" style="margin-top:12px"><strong>Game ${lv.gameNum} winner: ${esc(POLICY_LABEL(lv.gameWinner))}</strong><button id="live-continue" class="primary-button" style="margin-left:12px">${lv.hasMoreGames ? 'Next Game →' : 'Record Result →'}</button></div>` : ''}
    </div>
  </div></section>`;

  // Wire up controls
  document.querySelector('#live-back').onclick = () => exitLiveViewer();
  document.querySelector('#live-play-toggle').onclick = () => toggleLivePlay();
  document.querySelector('#live-step-prev').onclick = () => liveStepTo(lv.currentFrame - 1);
  document.querySelector('#live-step-next').onclick = () => liveStepTo(lv.currentFrame + 1);
  document.querySelector('#live-step-end').onclick = () => liveStepTo(total);
  document.querySelector('#live-frame-slider').oninput = e => liveStepTo(Number(e.target.value));
  document.querySelector('#live-play-speed').onchange = e => { lv.speed = Number(e.target.value); };
  const continueBtn = document.querySelector('#live-continue');
  if (continueBtn) continueBtn.onclick = () => continueAfterGame();
}

function liveStepTo(index) {
  const lv = state.tournamentLiveView;
  if (!lv || !lv.frames) return;
  lv.currentFrame = clamp(index, 0, lv.frames.length - 1);
  if (lv.currentFrame >= lv.frames.length - 1 && lv.gameWinner) {
    lv.awaitingContinue = true;
  }
  renderLiveViewer();
}

function toggleLivePlay() {
  const lv = state.tournamentLiveView;
  if (!lv || !lv.frames) return;
  if (lv.playing) {
    stopLivePlayback();
  } else {
    lv.playing = true;
    lv.timer = setInterval(() => {
      if (lv.currentFrame >= lv.frames.length - 1) {
        stopLivePlayback();
        lv.awaitingContinue = true;
        renderLiveViewer();
        return;
      }
      lv.currentFrame += 1;
      renderLiveViewer();
    }, Math.max(65, 700 / lv.speed));
  }
  renderLiveViewer();
}

function stopLivePlayback() {
  const lv = state.tournamentLiveView;
  if (!lv) return;
  lv.playing = false;
  if (lv.timer) { clearInterval(lv.timer); lv.timer = null; }
}

// ── Live match execution flow ───────────────────────────────────

async function watchLiveMatch(tournament) {
  if (state.tournamentRunning) return;
  const nextMatch = getNextMatch(tournament);
  if (!nextMatch) return;
  state.tournamentRunning = true;
  state.tournamentLiveView = {
    active: true,
    loading: true,
    frames: null,
    currentFrame: 0,
    playing: false,
    speed: 2,
    timer: null,
    bestOf: tournament.bestOf,
    gameNum: 0,
    seat1Wins: 0,
    seat2Wins: 0,
    gameWinner: null,
    gameSummary: null,
    awaitingContinue: false,
    hasMoreGames: false,
    p1Policy: null,
    p2Policy: null,
    matchId: nextMatch.matchId,
    cancelled: false,
  };
  rerender();

  const worker = new Worker('worker.js', { type: 'module' });
  try {
    await runLiveMatchGames(tournament, nextMatch, worker);
    state.tournamentRunning = false;
    stopLivePlayback();
    state.tournamentLiveView = null;
    if (isIndexedDBAvailable() && state.tournament?.tournamentId) {
      try { await saveTournament(state.tournament); } catch { /* non-fatal */ }
    }
    rerender();
  } catch (err) {
    state.tournamentRunning = false;
    state.tournamentAutoPlaying = false;
    stopLivePlayback();
    state.tournamentLiveView = null;
    showToast(err.message, { type: 'error', title: 'Tournament live error' });
    rerender();
  } finally {
    worker.terminate();
  }
}

async function runLiveMatchGames(tournament, match, worker) {
  const bestOf = tournament.bestOf;
  const winsNeeded = Math.ceil(bestOf / 2);
  let seat1Wins = 0, seat2Wins = 0;
  const startGameNum = match.games.length;
  const lv = state.tournamentLiveView;

  for (let g = startGameNum; g < bestOf && seat1Wins < winsNeeded && seat2Wins < winsNeeded; g += 1) {
    if (lv.cancelled) return;
    const seatSwapped = g % 2 === 1;
    const p1Policy = seatSwapped ? match.seat2Policy : match.seat1Policy;
    const p2Policy = seatSwapped ? match.seat1Policy : match.seat2Policy;
    const seed = hashSeed(tournament.bracketSize, match.roundIndex, match.matchIndex, g);

    // Show loading state for this game
    lv.loading = true;
    lv.gameNum = g + 1;
    lv.p1Policy = p1Policy;
    lv.p2Policy = p2Policy;
    lv.gameWinner = null;
    lv.gameSummary = null;
    lv.awaitingContinue = false;
    rerender();

    // Run match with replay recording
    const result = await new Promise((resolve) => {
      worker.onmessage = e => {
        const x = e.data;
        if (x.type === 'autonomy-match-result') resolve(x);
      };
      worker.onerror = e => resolve({ ok: false, error: e.message });
      worker.postMessage({
        type: 'run-autonomy-match',
        config: {
          seed,
          policyIds: [p1Policy, p2Policy],
          decisionLimit: 1800,
          profileId: 'core-advanced-authority',
          recordReplay: true,
        },
      });
    });

    if (lv.cancelled) return;
    if (!result.ok) throw new Error(result.error ?? 'worker error');
    const summary = result.result.summary;
    const replay = result.result.replay;

    // Determine winner
    const winner = summary.winner;
    const winningPolicy = winner === 'P1' ? p1Policy : winner === 'P2' ? p2Policy : null;
    if (!winningPolicy) throw new Error(`Invalid winner from worker: ${winner}`);

    // Reconstruct frames
    const frames = await reconstructFrames(replay);
    if (lv.cancelled) return;

    // Set up viewer for this game
    lv.loading = false;
    lv.frames = frames;
    lv.currentFrame = 0;
    lv.gameWinner = winningPolicy;
    lv.gameSummary = summary;
    lv.seat1Wins = seat1Wins + (winningPolicy === match.seat1Policy ? 1 : 0);
    lv.seat2Wins = seat2Wins + (winningPolicy === match.seat2Policy ? 1 : 0);
    lv.hasMoreGames = (lv.seat1Wins < winsNeeded) && (lv.seat2Wins < winsNeeded) && (g + 1 < bestOf);
    lv.awaitingContinue = false;
    lv.playing = false;
    rerender();

    // Auto-start playback
    toggleLivePlay();

    // Wait for user to continue after watching
    await new Promise(resolve => {
      lv.continueResolve = resolve;
    });

    stopLivePlayback();

    // Record the result
    if (winningPolicy === match.seat1Policy) seat1Wins += 1;
    else if (winningPolicy === match.seat2Policy) seat2Wins += 1;
    state.tournament = recordMatchResult(state.tournament, match.matchId, winningPolicy, summary);
  }
}

function continueAfterGame() {
  const lv = state.tournamentLiveView;
  if (!lv || !lv.continueResolve) return;
  stopLivePlayback();
  const resolve = lv.continueResolve;
  lv.continueResolve = null;
  lv.awaitingContinue = false;
  resolve();
}

function cancelLiveMatch() {
  const lv = state.tournamentLiveView;
  if (!lv) return;
  lv.cancelled = true;
  stopLivePlayback();
  if (lv.continueResolve) {
    const resolve = lv.continueResolve;
    lv.continueResolve = null;
    resolve();
  }
}

function exitLiveViewer() {
  cancelLiveMatch();
}
