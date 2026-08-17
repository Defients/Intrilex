// ═══════════════════════════════════════════════════════════════
// ranked-duel-terminal.mjs — Terminal, error, and keyboard help renderers.
// Extracted from ranked-duel-renderer.mjs for modularity.
// ═══════════════════════════════════════════════════════════════

import { getTerminalBanter } from './ai-personality.js';
import { loadProfile } from './local-profile.mjs';
import { ratingToTierDivision, compareRank } from "../account-domain/rank-tier.mjs";
import { renderRankGlyph, rankLabel } from './rank/rank-glyph.js';
import { generateTeachingMoment, generateBeginnerTrapTip, renderTeachingMoment } from "../decision-intelligence/teaching-moments.mjs";

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Format a phase string for display.
 */
export function formatPhase(phase) {
  if (!phase) return '';
  return String(phase).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format a termination reason for display.
 */
export function formatTerminationReason(reason) {
  if (!reason) return 'Unknown';
  return String(reason).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Render the terminal match screen.
 */
export function renderTerminal(vm, opts) {
  const winner = vm.match.winner ?? null;
  const humanId = vm.human?.playerId ?? null;
  const isDraw = winner === null || winner === undefined || vm.match.terminationReason === 'CANONICAL_DRAW';
  const outcome = isDraw ? 'draw' : winner === humanId ? 'win' : 'loss';
  const outcomeLabel = outcome === 'win' ? 'VICTORY' : outcome === 'loss' ? 'DEFEAT' : 'DRAW';
  const resultIcon = outcome === 'win' ? '🏆' : outcome === 'loss' ? '💀' : '🤝';

  // v0.19.0: AI banter on terminal
  const archetype = vm.opponent?.archetype ?? '';
  const banter = getTerminalBanter(archetype, outcome === 'loss');

  return `<div class="play-terminal ${outcome}" data-testid="play-terminal">
    <div class="terminal-result-banner ${outcome}">
      <span class="terminal-result-icon" aria-hidden="true">${resultIcon}</span>
      <h2>Match Complete</h2>
      <p class="terminal-result" data-testid="terminal-result">${outcomeLabel === 'VICTORY' ? 'You won!' : outcomeLabel === 'DEFEAT' ? 'You lost.' : 'Draw.'}</p>
      <p class="terminal-banter" data-testid="terminal-banter">${esc(banter)}</p>
    </div>
    <dl class="terminal-details">
      <dt>Winner</dt><dd data-testid="terminal-winner">${esc(outcome === 'win' ? 'You' : outcome === 'loss' ? 'AI' : 'Draw')}</dd>
      <dt>Termination</dt><dd>${esc(formatTerminationReason(vm.match.terminationReason || 'UNKNOWN'))}</dd>
      <dt>Full Turns</dt><dd>${vm.match.fullTurnSequence ?? 0}</dd>
    </dl>
    ${renderRankResultBlock(opts)}
    ${opts.achievementSummaryHtml || ''}
    ${renderIntelligenceCard(vm, opts)}
    ${renderTeachingMoment(generateTeachingMoment(vm) || generateBeginnerTrapTip(vm))}
    <div class="terminal-actions">
      <button class="primary-button" data-testid="watch-replay" data-action="watch-replay">Watch replay</button>
      ${opts.isNetworkMatch ? '<button class="secondary-button" data-testid="download-replay" data-action="download-replay">Download certified replay</button>' : ''}
      ${opts.isNetworkMatch ? '<button class="secondary-button" data-testid="network-rematch" data-action="network-rematch">Request rematch</button>' : ''}
      ${opts.isNetworkMatch ? '' : '<button class="secondary-button" data-testid="rematch-same-seed" data-action="rematch">Rematch same seed</button>'}
      ${opts.isNetworkMatch ? '' : '<button class="secondary-button" data-testid="new-seed" data-action="new-seed">New seed</button>'}
      <a class="secondary-button" data-testid="open-rank-anatomy" href="#/ranks">Open Rank Anatomy</a>
      <a class="secondary-button" data-testid="open-history" href="#/history">Open History</a>
      <a class="secondary-button" data-testid="open-achievements" href="#/achievements">View Achievements</a>
      ${opts.academyLessonId ? '<a class="primary-button" data-testid="back-to-academy" href="#/play/academy">Back to Academy</a>' : '<button class="secondary-button" data-testid="return-to-hub" data-action="return-to-hub">Return to Play hub</button>'}
      ${opts.academyLessonId && opts.academyRecap ? '<button class="primary-button" data-testid="view-academy-recap" data-action="view-academy-recap">View lesson recap</button>' : ''}
    </div>
  </div>`;
}

/**
 * Render the error screen.
 */
export function renderError(vm, opts) {
  return `<div class="play-error" data-testid="play-error" role="alert">
    <h2>Session Error</h2>
    <p>${esc(vm.error?.reason || vm.error || 'Unknown error')}</p>
    <button class="secondary-button" data-action="return-to-hub">Return to Play hub</button>
  </div>`;
}

/**
 * Render a post-match intelligence card with deterministic stats derived
 * from the authoritative final game state. All values are computed from
 * the view model — no replay reconstruction required.
 * @param {object} vm - The view model
 * @param {object} opts - Terminal render options
 * @returns {string} HTML
 */
function renderIntelligenceCard(vm, opts) {
  if (!vm || !vm.match) return '';
  const human = vm.human ?? {};
  const opponent = vm.opponent ?? {};
  const zones = vm.zones ?? {};
  const match = vm.match ?? {};

  const turns = match.fullTurnSequence ?? 0;
  const humanIR = human.secured ?? 0;
  const oppIR = opponent.secured ?? 0;
  const irMargin = humanIR - oppIR;
  const humanGoal = human.goal ?? 21;
  const oppGoal = opponent.goal ?? 21;
  const humanGoalPct = humanGoal > 0 ? Math.min(100, Math.round((humanIR / humanGoal) * 100)) : 0;
  const oppGoalPct = oppGoal > 0 ? Math.min(100, Math.round((oppIR / oppGoal) * 100)) : 0;
  const drawRemaining = zones.drawPile?.count ?? zones.drawPile?.length ?? 0;
  const discardCount = zones.discard?.count ?? zones.discard?.length ?? 0;
  const termination = formatTerminationReason(match.terminationReason || 'UNKNOWN');

  const marginLabel = irMargin > 0 ? `+${irMargin}` : String(irMargin);
  const marginClass = irMargin > 0 ? 'intel-margin-positive' : irMargin < 0 ? 'intel-margin-negative' : 'intel-margin-neutral';

  const isNetwork = opts.isNetworkMatch === true;
  const opponentLabel = isNetwork ? 'Opponent' : 'AI';

  return `<div class="intel-card" data-testid="match-intelligence-card">
    <h3 class="intel-title">Match Intelligence</h3>
    <div class="intel-grid">
      <div class="intel-stat" data-testid="intel-turns">
        <span class="intel-stat-label">Turns</span>
        <span class="intel-stat-value">${turns}</span>
      </div>
      <div class="intel-stat" data-testid="intel-margin">
        <span class="intel-stat-label">IR Margin</span>
        <span class="intel-stat-value ${marginClass}">${esc(marginLabel)}</span>
      </div>
      <div class="intel-stat" data-testid="intel-draw-remaining">
        <span class="intel-stat-label">Draw Pile</span>
        <span class="intel-stat-value">${drawRemaining}</span>
      </div>
      <div class="intel-stat" data-testid="intel-discard">
        <span class="intel-stat-label">Cards Played</span>
        <span class="intel-stat-value">${discardCount}</span>
      </div>
    </div>
    <div class="intel-goal-bars">
      <div class="intel-goal-bar-row">
        <span class="intel-goal-bar-label">You</span>
        <div class="intel-goal-bar-track"><div class="intel-goal-bar-fill intel-goal-bar-human" style="width:${humanGoalPct}%"></div></div>
        <span class="intel-goal-bar-value">${humanIR}/${humanGoal}</span>
      </div>
      <div class="intel-goal-bar-row">
        <span class="intel-goal-bar-label">${esc(opponentLabel)}</span>
        <div class="intel-goal-bar-track"><div class="intel-goal-bar-fill intel-goal-bar-opponent" style="width:${oppGoalPct}%"></div></div>
        <span class="intel-goal-bar-value">${oppIR}/${oppGoal}</span>
      </div>
    </div>
    <p class="intel-termination" data-testid="intel-termination">Ended: ${esc(termination)}</p>
  </div>`;
}

/**
 * Render the rank result block on the terminal screen.
 *
 * Shows the player's tier glyph + rating delta. When `opts.rankResult` is
 * supplied (authoritative result from the play controller / server), a full
 * before→after result is rendered, including a promotion swap when the tier
 * changed. Promotion glyphs are only shown after the authoritative result is
 * known — never predicted on the client.
 *
 * When no rankResult is available (e.g. simulation, spectator), a
 * simple current-rank glyph is rendered from the local profile, or nothing if
 * the player is unranked/has no profile.
 *
 * @param {object} opts - Terminal render options.
 * @returns {string} HTML
 */
function renderRankResultBlock(opts) {
  const rr = opts.rankResult;
  if (rr && typeof rr === 'object') {
    const ratedBefore = Math.max((rr.ratedMatchesBefore ?? 1) - 1, 0);
    const ratedAfter = rr.ratedMatchesAfter ?? (rr.ratedMatchesBefore ?? 1);
    const before = ratingToTierDivision(rr.ratingBefore, { ratedMatches: ratedBefore });
    const after = ratingToTierDivision(rr.ratingAfter, { ratedMatches: ratedAfter });
    const delta = Math.round((rr.ratingAfter ?? 0) - (rr.ratingBefore ?? 0));
    const deltaSign = delta > 0 ? '+' : '';
    const deltaClass = delta > 0 ? 'rank-result-delta-up' : delta < 0 ? 'rank-result-delta-down' : '';
    // Detect rank changes by combined tier+division ordinal (not just tier).
    const rankCmp = compareRank(after, before);
    const promoted = rankCmp > 0;
    const demoted = rankCmp < 0;
    const beforeGlyph = renderRankGlyph({ tier: before.tier, division: before.division, size: 96, showDivision: true, decorative: true, className: 'rank-result-before-glyph' });
    const afterGlyph = renderRankGlyph({ tier: after.tier, division: after.division, size: 96, showDivision: true, decorative: false, className: 'rank-result-after-glyph' });
    const arrow = (promoted || demoted) ? `<span class="rank-result-arrow" aria-hidden="true">→</span>` : '';
    const banner = promoted ? '<p class="rank-result-banner rank-up" data-testid="rank-result-banner">RANK UP</p>'
      : demoted ? '<p class="rank-result-banner rank-down" data-testid="rank-result-banner">RANK DOWN</p>'
      : '';
    const ratingBeforeStr = rr.ratingBefore != null ? String(rr.ratingBefore) : '—';
    const ratingAfterStr = rr.ratingAfter != null ? String(rr.ratingAfter) : '—';
    return `<div class="rank-result-block" data-testid="rank-result-block">
      ${banner}
      <div class="rank-result-glyphs">
        ${(promoted || demoted) ? `${beforeGlyph}${arrow}${afterGlyph}` : afterGlyph}
      </div>
      <p class="rank-result-tier" data-testid="rank-result-tier">${esc(rankLabel(after.tier, after.division))}</p>
      <p class="rank-result-rating ${deltaClass}" data-testid="rank-result-rating">${ratingBeforeStr} → ${ratingAfterStr} IR <span class="rank-result-delta">${deltaSign}${delta}</span></p>
    </div>`;
  }
  // Fallback: show current rank glyph from local profile (no delta).
  try {
    const profile = loadProfile();
    if (!profile?.rating) return '';
    const a = ratingToTierDivision(profile.rating.value, { ratedMatches: profile.rating.ratedMatches });
    if (a.isPlacement) {
      return `<div class="rank-result-block" data-testid="rank-result-block">
        ${renderRankGlyph({ tier: a.tier, division: a.division, size: 96, showDivision: false, decorative: false })}
        <p class="rank-result-tier">${esc(rankLabel(a.tier, a.division))}</p>
        <p class="rank-result-placement">${a.placementsPlayed} / ${a.placementsRequired} Placements</p>
      </div>`;
    }
    return `<div class="rank-result-block" data-testid="rank-result-block">
      ${renderRankGlyph({ tier: a.tier, division: a.division, size: 96, showDivision: true, decorative: false })}
      <p class="rank-result-tier">${esc(rankLabel(a.tier, a.division))}</p>
      <p class="rank-result-rating">${profile.rating.value} IR</p>
    </div>`;
  } catch {
    return '';
  }
}

/**
 * Render keyboard help overlay (v0.17.0 port).
 */
export function renderKeyboardHelp() {
  return `<div class="keyboard-help-overlay" data-testid="keyboard-help" role="dialog" aria-label="Keyboard shortcuts">
    <h3>Keyboard Shortcuts</h3>
    <dl class="keyboard-help-list">
      <dt><kbd>P</kbd></dt><dd>Pass priority / Decline response</dd>
      <dt><kbd>I</kbd></dt><dd>Open card inspector for selected card</dd>
      <dt><kbd>A</kbd></dt><dd>Open Advanced Card Rules for selected/inspected card</dd>
      <dt><kbd>R</kbd></dt><dd>Toggle stack details</dd>
      <dt><kbd>?</kbd></dt><dd>Toggle this help</dd>
      <dt><kbd>Esc</kbd></dt><dd>Close Advanced View, cancel selection, or close inspector</dd>
      <dt><kbd>Enter</kbd></dt><dd>Confirm selected action</dd>
    </dl>
    <button class="keyboard-help-close" data-testid="keyboard-help-close" aria-label="Close keyboard help">Close</button>
  </div>`;
}

/**
 * Render a rules/help overlay with quick reference for the current game phase.
 * @param {object} [snapshot] — optional game snapshot for phase-aware help
 * @returns {string} HTML
 */
export function renderRulesHelp(snapshot) {
  const phase = snapshot?.decision?.kind ?? 'ACTION';
  const phaseLabel = phase === 'RESPOND' ? 'Response Phase' : 'Action Phase';
  return `<div class="keyboard-help-overlay" data-testid="rules-help" role="dialog" aria-label="Rules and help">
    <h3>Quick Rules — ${phaseLabel}</h3>
    <dl class="keyboard-help-list">
      <dt>Goal</dt><dd>Reduce your opponent's Influence (IR) to 0, or have the higher IR when the Draw Pile is empty.</dd>
      <dt>Draw</dt><dd>Take a card from the Draw Pile each turn. If empty, you must pass.</dd>
      <dt>Score</dt><dd>Play a card to your Point Row for its rank value in IR.</dd>
      <dt>Effects</dt><dd>Play cards for their rank effects (7=Scuttle, 6=Anchor, 5=Swap, 4=Peek, 3=Copy, J=Attach, Q=Ultra).</dd>
      <dt>Respond</dt><dd>When the opponent acts, you may counter or decline (pass priority).</dd>
      <dt>Confirm</dt><dd>Select an action, then click Confirm (or press Enter) to submit it.</dd>
    </dl>
    <p class="keyboard-help-hint">For the full rulebook, visit the <a href="#/rules">Rules page</a>.</p>
    <button class="keyboard-help-close" data-testid="rules-help-close" aria-label="Close rules help">Close</button>
  </div>`;
}

/**
 * Render a match stats overlay showing the current game state summary.
 * @param {object} snapshot — game snapshot with player data
 * @returns {string} HTML
 */
export function renderMatchStats(snapshot) {
  if (!snapshot) return '';
  const human = snapshot.human ?? {};
  const opponent = snapshot.opponent ?? {};
  const match = snapshot.match ?? {};
  const recentEvents = snapshot.recentEvents ?? [];
  return `<div class="keyboard-help-overlay" data-testid="match-stats" role="dialog" aria-label="Match statistics">
    <h3>Match Statistics</h3>
    <dl class="keyboard-help-list">
      <dt>Your IR</dt><dd>${human.ir ?? human.influence ?? '—'}</dd>
      <dt>Opponent IR</dt><dd>${opponent.ir ?? opponent.influence ?? '—'}</dd>
      <dt>Turn</dt><dd>${match.turn ?? '—'}</dd>
      <dt>Phase</dt><dd>${snapshot.decision?.kind ?? '—'}</dd>
      <dt>Recent Events</dt><dd>${recentEvents.length} event(s) this session</dd>
    </dl>
    <button class="keyboard-help-close" data-testid="match-stats-close" aria-label="Close match stats">Close</button>
  </div>`;
}
