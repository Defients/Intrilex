// ═══════════════════════════════════════════════════════════════
// local-profile.mjs — Local player profile with rating, badges,
// and verified match statistics. Stored only on local device.
//
// Rating scope: LOCAL_AI — not server-verified, not online rank.
// Updates are idempotent — keyed by session ID + terminal hash.
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'intrilex-local-profile-v1';
const SCHEMA_VERSION = '1.1.0';

const DEFAULT_PROFILE = {
  schemaVersion: SCHEMA_VERSION,
  displayName: 'You',
  rating: { scope: 'LOCAL_AI', value: 1200, provisional: true, ratedMatches: 0 },
  badges: [],
  record: { wins: 0, losses: 0, draws: 0 },
  verifiedResults: [],
  streakData: { currentStreak: 0, bestStreak: 0, lastResult: null },
  ratingHistory: [],
  archetypeBreakdown: {},
};

// ── Badge definitions ──────────────────────────────────────────

const BADGE_DEFINITIONS = [
  { id: 'first-duel', name: 'First Duel', description: 'Complete your first verified duel', icon: 'shield', check: (p) => p.verifiedResults.length >= 1 },
  { id: 'first-victory', name: 'First Victory', description: 'Win your first verified duel', icon: 'trophy', check: (p) => p.record.wins >= 1 },
  { id: 'field-tested', name: 'Field Tested', description: 'Complete 10 verified duels', icon: 'star', check: (p) => p.verifiedResults.length >= 10 },
  { id: 'duelist', name: 'Duelist', description: 'Complete 25 verified duels', icon: 'crown', check: (p) => p.verifiedResults.length >= 25 },
  { id: 'streak-3', name: 'Streak \u00d73', description: 'Win 3 consecutive verified duels', icon: 'flame', check: (p) => p.streakData.bestStreak >= 3 },
  { id: 'supercharged', name: 'Supercharged', description: 'Declare your first Super', icon: 'bolt', check: (p) => p.badges.some(b => b.id === 'supercharged') },
  { id: 'unshaken', name: 'Unshaken', description: 'Win after trailing in Secured Points', icon: 'heart', check: (p) => p.badges.some(b => b.id === 'unshaken') },
  { id: 'tournament-champion', name: 'Tournament Champion', description: 'Win a tournament', icon: 'medal', check: (p) => p.badges.some(b => b.id === 'tournament-champion') },
  { id: 'bracket-buster', name: 'Bracket Buster', description: 'Win a tournament as the lowest seed', icon: 'sword', check: (p) => p.badges.some(b => b.id === 'bracket-buster') },
  { id: 'tactician', name: 'Tactician', description: 'Win 5 matches against hard/nightmare AI', icon: 'brain', check: (p) => {
    const hardWins = p.verifiedResults.filter(r => (r.aiDifficulty === 'hard' || r.aiDifficulty === 'nightmare') && r.outcome === 'win').length;
    return hardWins >= 5;
  }},
];

// ── Public API ─────────────────────────────────────────────────

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw);
    return migrateProfile(parsed);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function isStorageAvailable() {
  try {
    const key = '__intrilex_storage_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a verified terminal result. Idempotent — same session+hash won't count twice.
 * @param {object} profile — Current profile (mutated and returned)
 * @param {object} result — { sessionId, terminalHash, outcome: 'win'|'loss'|'draw', aiPolicyId, matchStats }
 * @returns {object} { profile, ratingDelta, newBadges }
 */
export function recordVerifiedResult(profile, result) {
  if (!result || !result.sessionId || !result.terminalHash) {
    return { profile, ratingDelta: 0, newBadges: [], error: 'INVALID_RESULT' };
  }

  // Idempotency check
  const alreadyRecorded = profile.verifiedResults.some(
    r => r.sessionId === result.sessionId && r.terminalHash === result.terminalHash
  );
  if (alreadyRecorded) {
    return { profile, ratingDelta: 0, newBadges: [], skipped: true };
  }

  // Record the result
  const resultEntry = {
    sessionId: result.sessionId,
    terminalHash: result.terminalHash,
    outcome: result.outcome,
    timestamp: new Date().toISOString(),
    aiPolicyId: result.aiPolicyId ?? 'unknown',
    aiDifficulty: result.aiDifficulty ?? 'normal',
    aiArchetype: result.aiArchetype ?? null,
    profileId: result.profileId ?? null,
    matchStats: result.matchStats ?? null,
    ratingDelta: 0, // filled after computing
  };
  profile.verifiedResults.push(resultEntry);

  // Update record
  if (result.outcome === 'win') profile.record.wins++;
  else if (result.outcome === 'loss') profile.record.losses++;
  else if (result.outcome === 'draw') profile.record.draws++;

  // Update streak
  if (result.outcome === 'win') {
    profile.streakData.currentStreak = (profile.streakData.lastResult === 'win' ? profile.streakData.currentStreak : 0) + 1;
    profile.streakData.bestStreak = Math.max(profile.streakData.bestStreak, profile.streakData.currentStreak);
  } else {
    profile.streakData.currentStreak = 0;
  }
  profile.streakData.lastResult = result.outcome;

  // Update rating (Elo-style)
  const ratingDelta = computeRatingDelta(profile.rating, result.outcome, result.aiPolicyId);
  profile.rating.value = Math.max(0, Math.min(3000, Math.round(profile.rating.value + ratingDelta)));
  profile.rating.ratedMatches++;
  if (profile.rating.ratedMatches >= 10) profile.rating.provisional = false;

  // Fill in the rating delta on the result entry
  resultEntry.ratingDelta = Math.round(ratingDelta);

  // Track rating history
  if (!profile.ratingHistory) profile.ratingHistory = [];
  profile.ratingHistory.push({
    timestamp: resultEntry.timestamp,
    rating: profile.rating.value,
    delta: resultEntry.ratingDelta,
    opponent: result.aiPolicyId ?? 'unknown',
    outcome: result.outcome,
  });
  // Keep last 100 entries
  if (profile.ratingHistory.length > 100) profile.ratingHistory = profile.ratingHistory.slice(-100);

  // Track archetype breakdown
  if (!profile.archetypeBreakdown) profile.archetypeBreakdown = {};
  const archetype = result.aiArchetype ?? extractArchetype(result.aiPolicyId);
  if (archetype) {
    if (!profile.archetypeBreakdown[archetype]) profile.archetypeBreakdown[archetype] = { wins: 0, losses: 0, draws: 0 };
    if (result.outcome === 'win') profile.archetypeBreakdown[archetype].wins++;
    else if (result.outcome === 'loss') profile.archetypeBreakdown[archetype].losses++;
    else profile.archetypeBreakdown[archetype].draws++;
  }

  // Derive new badges
  const newBadges = deriveNewBadges(profile);
  profile.badges = [...new Set([...profile.badges.map(b => b.id), ...newBadges.map(b => b.id)])]
    .map(id => BADGE_DEFINITIONS.find(d => d.id === id) ?? { id, name: id });

  saveProfile(profile);
  return { profile, ratingDelta, newBadges };
}

// ── Rating computation ─────────────────────────────────────────

function computeRatingDelta(rating, outcome, aiPolicyId) {
  // AI rating from policy catalog (simplified — can be extended)
  const aiRating = getAiRating(aiPolicyId);
  const expected = 1 / (1 + Math.pow(10, (aiRating - rating.value) / 400));
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const K = rating.ratedMatches < 10 ? 40 : 24;
  return K * (score - expected);
}

function getAiRating(policyId) {
  // Complete AI ratings for all 19+ policies
  const ratings = {
    // Baseline policies
    'random-legal': 800,
    'score-rush': 1100,
    'control': 1300,
    'tempo': 1400,
    'value': 1350,
    // HYBIX normal difficulty
    'hybrix-rusher': 1250,
    'hybrix-defender': 1350,
    'hybrix-trickster': 1300,
    'hybrix-sniper': 1400,
    'hybrix-support': 1280,
    'hybrix-tank': 1320,
    'hybrix-baseline': 1200,
    // HYBIX hard difficulty (+200 from base)
    'hybrix-rusher-hard': 1450,
    'hybrix-defender-hard': 1550,
    'hybrix-trickster-hard': 1500,
    'hybrix-sniper-hard': 1600,
    // HYBIX easy difficulty (-200 from base)
    'hybrix-rusher-easy': 1050,
    'hybrix-defender-easy': 1150,
    // HYBIX nightmare difficulty (+400 from base)
    'hybrix-rusher-nightmare': 1650,
    'hybrix-defender-nightmare': 1750,
  };
  return ratings[policyId] ?? 1200;
}

/**
 * Extract archetype name from a policy ID.
 */
function extractArchetype(policyId) {
  if (!policyId) return null;
  if (policyId.startsWith('hybrix-')) {
    return policyId.replace('hybrix-', '').replace(/-(hard|easy|nightmare|normal)$/, '');
  }
  return policyId;
}

// ── Badge derivation ───────────────────────────────────────────

function deriveNewBadges(profile) {
  return BADGE_DEFINITIONS.filter(def => {
    if (profile.badges.some(b => b.id === def.id)) return false;
    try { return def.check(profile); } catch { return false; }
  });
}

// ── Migration ──────────────────────────────────────────────────

function migrateProfile(profile) {
  if (!profile.schemaVersion) {
    return { ...DEFAULT_PROFILE };
  }
  if (!profile.rating) profile.rating = { ...DEFAULT_PROFILE.rating };
  if (!profile.badges) profile.badges = [];
  if (!profile.record) profile.record = { ...DEFAULT_PROFILE.record };
  if (!profile.verifiedResults) profile.verifiedResults = [];
  if (!profile.streakData) profile.streakData = { ...DEFAULT_PROFILE.streakData };
  if (!profile.ratingHistory) profile.ratingHistory = [];
  if (!profile.archetypeBreakdown) profile.archetypeBreakdown = {};
  // Enrich older verified results with missing fields
  for (const r of profile.verifiedResults) {
    if (!r.aiDifficulty) r.aiDifficulty = extractDifficulty(r.aiPolicyId);
    if (!r.aiArchetype) r.aiArchetype = extractArchetype(r.aiPolicyId);
    if (r.ratingDelta === undefined) r.ratingDelta = 0;
  }
  return profile;
}

/**
 * Extract difficulty from a policy ID.
 */
function extractDifficulty(policyId) {
  if (!policyId) return 'normal';
  if (policyId.endsWith('-hard')) return 'hard';
  if (policyId.endsWith('-easy')) return 'easy';
  if (policyId.endsWith('-nightmare')) return 'nightmare';
  return 'normal';
}
