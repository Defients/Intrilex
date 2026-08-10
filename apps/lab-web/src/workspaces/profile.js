// ═══════════════════════════════════════════════════════════════
// workspaces/profile.js — /profile workspace: Player record
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, pct } from '../state.js';
import { loadProfile, isStorageAvailable, BADGE_DEFINITIONS } from '../play/local-profile.mjs';
import { getAchievementRuntime } from '../play/achievements/achievement-runtime.js';
import { getDefinition } from '../play/achievements/achievement-runtime.js';

const BADGE_ICONS = {
  shield: '🛡', trophy: '🏆', star: '⭐', crown: '👑', flame: '🔥',
  bolt: '⚡', heart: '❤', medal: '🏅', sword: '⚔', brain: '🧠',
};

export function renderProfile() {
  if (!isStorageAvailable()) {
    app.innerHTML = `<section class="panel"><div class="panel-body"><div class="notice danger">Local storage is not available in this environment. Profile data cannot be loaded.</div></div></section>`;
    return;
  }

  const profile = loadProfile();
  const r = profile.rating;
  const rec = profile.record;
  const streak = profile.streakData;
  const totalGames = rec.wins + rec.losses + rec.draws;
  const winRate = totalGames > 0 ? rec.wins / totalGames : 0;

  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Player Profile</h2><p>Local rating, badges, and verified match history. All data stored on your device only.</p></div></div><div class="panel-body">
    ${renderRatingCard(r, winRate, totalGames)}
    ${renderStreakCard(streak)}
    ${renderRatingChart(profile.ratingHistory)}
    ${renderAchievementSummary()}
    ${renderBadgeGallery(profile)}
    ${renderArchetypeBreakdown(profile.archetypeBreakdown)}
    ${renderMatchHistory(profile.verifiedResults)}
  </div></section>`;
}

function renderRatingCard(rating, winRate, totalGames) {
  const provisionalBadge = rating.provisional ? '<span class="badge-tag" style="background:var(--text-dim);color:var(--bg)">Provisional</span>' : '';
  return `<div class="experiment-grid" style="margin-bottom:16px">
    <div class="stat-card"><span class="stat-value" style="font-size:1.8em">${rating.value}</span><span class="stat-label">Rating ${provisionalBadge}</span></div>
    <div class="stat-card"><span class="stat-value">${rating.ratedMatches}</span><span class="stat-label">Rated Matches</span></div>
    <div class="stat-card"><span class="stat-value">${pct(winRate)}</span><span class="stat-label">Win Rate (${totalGames} games)</span></div>
  </div>`;
}

function renderStreakCard(streak) {
  if (!streak || (!streak.currentStreak && !streak.bestStreak)) return '';
  return `<div class="experiment-grid" style="margin-bottom:16px">
    <div class="stat-card"><span class="stat-value">${streak.currentStreak}</span><span class="stat-label">Current Streak</span></div>
    <div class="stat-card"><span class="stat-value">${streak.bestStreak}</span><span class="stat-label">Best Streak</span></div>
    <div class="stat-card"><span class="stat-value">${streak.lastResult ? esc(streak.lastResult.toUpperCase()) : '—'}</span><span class="stat-label">Last Result</span></div>
  </div>`;
}

function renderAchievementSummary() {
  try {
    const runtime = getAchievementRuntime();
    const summary = runtime.getSummary();
    if (summary.earned === 0) {
      return `<div class="achievement-profile-summary" style="margin-bottom:16px">
        <h3 style="margin:0 0 8px 0">Achievements</h3>
        <p style="color:var(--text-dim);margin:0">No achievements earned yet. <a href="#/achievements">View all ${summary.total} achievements</a></p>
      </div>`;
    }
    const latestDef = summary.latestUnlock ? getDefinition(summary.latestUnlock) : null;
    const latestName = latestDef ? esc(latestDef.name) : '';
    const apPct = summary.maxAp > 0 ? pct(summary.ap / summary.maxAp) : '0%';
    return `<div class="achievement-profile-summary" style="margin-bottom:16px">
      <div class="experiment-grid">
        <div class="stat-card"><span class="stat-value">${summary.earned}/${summary.total}</span><span class="stat-label">Achievements Earned</span></div>
        <div class="stat-card"><span class="stat-value">${summary.ap}</span><span class="stat-label">Achievement Points (${apPct} of ${summary.maxAp})</span></div>
        <div class="stat-card"><span class="stat-value" style="font-size:1.2em">${latestName || '—'}</span><span class="stat-label">Latest Unlock</span></div>
      </div>
      <p style="margin:8px 0 0 0"><a href="#/achievements">View all achievements</a></p>
    </div>`;
  } catch {
    return ''; // achievement system not available
  }
}

function renderRatingChart(history) {
  if (!history || history.length < 2) return '';
  const values = history.map(h => h.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 100;
  const height = 30;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  return `<section class="panel" style="margin-bottom:16px"><div class="panel-header"><h3>Rating History</h3></div><div class="panel-body">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:80px;display:block">
      <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="0.5" vector-effect="non-scaling-stroke" />
    </svg>
    <div style="display:flex;justify-content:space-between;margin-top:4px"><small class="mono">${min}</small><small class="mono">${max}</small></div>
    <small style="color:var(--text-dim)">${history.length} rated matches tracked</small>
  </div></section>`;
}

function renderBadgeGallery(profile) {
  const earnedIds = new Set(profile.badges.map(b => b.id));
  const totalDuels = profile.verifiedResults.length;
  const hardWins = profile.verifiedResults.filter(r => (r.aiDifficulty === 'hard' || r.aiDifficulty === 'nightmare') && r.outcome === 'win').length;

  const progressHints = {
    'first-duel': () => `${totalDuels}/1`,
    'field-tested': () => `${totalDuels}/10`,
    'duelist': () => `${totalDuels}/25`,
    'streak-3': () => `${profile.streakData?.bestStreak ?? 0}/3`,
    'tactician': () => `${hardWins}/5`,
  };

  const badges = BADGE_DEFINITIONS.map(def => {
    const earned = earnedIds.has(def.id);
    const unavailable = def.available === false;
    const icon = BADGE_ICONS[def.icon] ?? '🔹';
    const progress = !earned && !unavailable && progressHints[def.id] ? progressHints[def.id]() : null;
    const cls = earned ? 'earned' : unavailable ? 'unavailable' : 'locked';
    const filter = earned ? 'none' : 'grayscale(1) opacity(0.4)';
    const status = earned ? 'Earned' : unavailable ? 'Coming soon' : (progress ? esc(progress) : esc(def.description));
    return `<div class="badge-card ${cls}" title="${esc(def.description)}">
      <span class="badge-icon" style="font-size:1.5em;filter:${filter}">${icon}</span>
      <span class="badge-name">${esc(def.name)}</span>
      <small class="badge-progress">${status}</small>
    </div>`;
  }).join('');

  return `<section class="panel" style="margin-bottom:16px"><div class="panel-header"><h3>Badges (${earnedIds.size}/${BADGE_DEFINITIONS.length})</h3></div><div class="panel-body"><div class="badge-gallery" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">${badges}</div></div></section>`;
}

function renderArchetypeBreakdown(breakdown) {
  if (!breakdown || Object.keys(breakdown).length === 0) return '';
  const entries = Object.entries(breakdown).sort((a, b) => {
    const aTotal = a[1].wins + a[1].losses + a[1].draws;
    const bTotal = b[1].wins + b[1].losses + b[1].draws;
    return bTotal - aTotal;
  });
  return `<section class="panel" style="margin-bottom:16px"><div class="panel-header"><h3>Archetype Record</h3></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Archetype</th><th>Wins</th><th>Losses</th><th>Draws</th><th>Win Rate</th></tr></thead><tbody>${entries.map(([arch, s]) => {
    const total = s.wins + s.losses + s.draws;
    return `<tr><td>${esc(arch)}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.draws}</td><td>${total > 0 ? pct(s.wins / total) : '—'}</td></tr>`;
  }).join('')}</tbody></table></div></div></section>`;
}

function renderMatchHistory(results) {
  if (!results || results.length === 0) {
    return `<section class="panel"><div class="panel-header"><h3>Match History</h3></div><div class="panel-body"><p style="color:var(--text-dim)">No verified matches yet. Play a match to start building your record.</p></div></section>`;
  }
  const recent = [...results].reverse().slice(0, 20);
  return `<section class="panel"><div class="panel-header"><h3>Match History (last ${recent.length})</h3></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Opponent</th><th>Difficulty</th><th>Result</th><th>Rating Delta</th></tr></thead><tbody>${recent.map(r => {
    const date = r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '—';
    const opponent = r.aiPolicyId ? esc(r.aiPolicyId.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase())) : '—';
    const diff = r.aiDifficulty ? esc(r.aiDifficulty) : '—';
    const resultClass = r.outcome === 'win' ? 'style="color:var(--accent)"' : r.outcome === 'loss' ? 'style="color:var(--danger, #e55)"' : '';
    const delta = r.ratingDelta !== undefined ? (r.ratingDelta >= 0 ? `+${r.ratingDelta}` : `${r.ratingDelta}`) : '—';
    const deltaClass = r.ratingDelta > 0 ? 'style="color:var(--accent)"' : r.ratingDelta < 0 ? 'style="color:var(--danger, #e55)"' : '';
    return `<tr><td><small>${date}</small></td><td>${opponent}</td><td>${diff}</td><td ${resultClass}>${esc((r.outcome ?? '—').toUpperCase())}</td><td ${deltaClass}>${delta}</td></tr>`;
  }).join('')}</tbody></table></div></div></section>`;
}
