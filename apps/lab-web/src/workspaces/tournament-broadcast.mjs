// ═══════════════════════════════════════════════════════════════
// tournament-broadcast.mjs — V3: Tournament broadcast view
//
// A caster-grade broadcast layout for tournament finals. Uses the
// existing spectator neutral projection + replay frames to create
// a broadcast overlay with:
//   - Player nameplates with ratings/tiers
//   - Live score and round indicator
//   - Event feed (key plays, scoring, scuttles)
//   - Match progress bar
//
// This is a pure rendering module — it takes a broadcast state object
// and produces HTML. The actual data comes from the spectator
// projection and tournament match state.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} BroadcastState
 * @property {object} tournament - Tournament metadata
 * @property {object} match - Current match state
 * @property {object} playerA - Player A info (name, rating, tier)
 * @property {object} playerB - Player B info (name, rating, tier)
 * @property {number} round - Current round
 * @property {number} totalRounds - Total rounds in the bracket
 * @property {Array} eventFeed - Recent events
 * @property {number} spectatorCount - Number of spectators
 */

/**
 * Render the tournament broadcast overlay.
 * @param {BroadcastState} state
 * @returns {string}
 */
export function renderTournamentBroadcast(state) {
  if (!state || !state.tournament || !state.match) return '';

  const t = state.tournament;
  const m = state.match;
  const pA = state.playerA ?? {};
  const pB = state.playerB ?? {};
  const round = state.round ?? 1;
  const totalRounds = state.totalRounds ?? 1;
  const events = state.eventFeed ?? [];
  const spectators = state.spectatorCount ?? 0;

  const scoreA = m.scoreA ?? pA.score ?? 0;
  const scoreB = m.scoreB ?? pB.score ?? 0;

  const nameA = pA.displayName ?? 'Player A';
  const nameB = pB.displayName ?? 'Player B';
  const tierA = pA.tier ?? 'UNRANKED';
  const tierB = pB.tier ?? 'UNRANKED';
  const ratingA = pA.rating ?? '?';
  const ratingB = pB.rating ?? '?';

  // Event feed (last 5 events)
  const feedHtml = events.slice(-5).map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
    return `<div class="broadcast-event" data-testid="broadcast-event">
      <span class="broadcast-event-time">${time}</span>
      <span class="broadcast-event-text">${e.text ?? ''}</span>
    </div>`;
  }).join('');

  // Match progress bar
  const progressPct = totalRounds > 0 ? Math.round((round / totalRounds) * 100) : 0;

  return `<div class="tournament-broadcast" data-testid="tournament-broadcast">
    <div class="broadcast-header">
      <div class="broadcast-tournament-name" data-testid="broadcast-tournament-name">${t.name ?? 'Tournament'}</div>
      <div class="broadcast-round" data-testid="broadcast-round">Round ${round} of ${totalRounds}</div>
      <div class="broadcast-spectators" data-testid="broadcast-spectators">👁 ${spectators} watching</div>
    </div>
    <div class="broadcast-nameplates">
      <div class="broadcast-nameplate broadcast-nameplate-a ${scoreA > scoreB ? 'broadcast-nameplate-leading' : ''}" data-testid="broadcast-nameplate-a">
        <div class="broadcast-player-name">${nameA}</div>
        <div class="broadcast-player-tier">${tierA}</div>
        <div class="broadcast-player-rating">${ratingA}</div>
        <div class="broadcast-player-score" data-testid="broadcast-score-a">${scoreA}</div>
      </div>
      <div class="broadcast-vs">VS</div>
      <div class="broadcast-nameplate broadcast-nameplate-b ${scoreB > scoreA ? 'broadcast-nameplate-leading' : ''}" data-testid="broadcast-nameplate-b">
        <div class="broadcast-player-name">${nameB}</div>
        <div class="broadcast-player-tier">${tierB}</div>
        <div class="broadcast-player-rating">${ratingB}</div>
        <div class="broadcast-player-score" data-testid="broadcast-score-b">${scoreB}</div>
      </div>
    </div>
    <div class="broadcast-progress">
      <div class="broadcast-progress-bar" style="width:${progressPct}%" data-testid="broadcast-progress-bar"></div>
    </div>
    <div class="broadcast-event-feed" data-testid="broadcast-event-feed">
      ${feedHtml}
    </div>
  </div>`;
}

/**
 * Build a broadcast event from a match event.
 * Filters for "interesting" events (scoring, scuttles, effects, game end).
 * @param {object} matchEvent - A match event from the spectator projection
 * @returns {{ text: string, timestamp: string }|null}
 */
export function buildBroadcastEvent(matchEvent) {
  if (!matchEvent) return null;
  const type = matchEvent.type ?? matchEvent.action ?? '';
  const player = matchEvent.playerId === 'P1' ? 'Player 1' : 'Player 2';

  if (type.includes('score') || type.includes('play-for-points')) {
    const card = matchEvent.payload?.card ?? '';
    return { text: `${player} scores with ${card}`, timestamp: matchEvent.timestamp ?? new Date().toISOString() };
  }
  if (type.includes('scuttle')) {
    const card = matchEvent.payload?.card ?? '';
    return { text: `${player} scuttles with ${card}`, timestamp: matchEvent.timestamp ?? new Date().toISOString() };
  }
  if (type.includes('effect')) {
    const card = matchEvent.payload?.card ?? '';
    return { text: `${player} plays effect: ${card}`, timestamp: matchEvent.timestamp ?? new Date().toISOString() };
  }
  if (type.includes('game_end') || type.includes('match_end')) {
    return { text: `Game ended`, timestamp: matchEvent.timestamp ?? new Date().toISOString() };
  }
  return null;
}
