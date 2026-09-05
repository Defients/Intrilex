// ═══════════════════════════════════════════════════════════════
// workspaces/profile.js — Player Profile workspace
//
// The permanent presentation layer for player identity. Aggregates:
//   - Account identity (display name, handle, avatar, joined date)
//   - Ranked (tier, division, IR, position, peak, season history)
//   - Achievements (earned count, AP, featured showcase)
//   - Match history (safe public summaries)
//   - Customization (title, frame, card back, showcase)
//   - Privacy (per-field visibility)
//
// Two modes:
//   SELF    — #/profile — owner's full profile + edit/customize/privacy
//   PUBLIC  — #/player/@handle — privacy-filtered public projection
//
// Profile OWNS only profile-owned state. Ranked/achievements/matches
// are consumed from their authoritative domains (section 4).
//
// Local vs Online separation (section 21-22): Local AI stats are
// shown in a clearly-labeled LOCAL PLAY section and NEVER merged
// with Online Ranked IR/record.
// ═══════════════════════════════════════════════════════════════

import { app, esc, pct, state } from '../state.js?v=75c53031ef21';
import { loadProfile, isStorageAvailable } from '../play/local-profile.mjs?v=75c53031ef21';
import { getAchievementRuntime, getDefinition } from '../play/achievements/achievement-runtime.js?v=75c53031ef21';
import { ratingToTierDivision, RankTier } from "../account-domain/rank-tier.mjs";
import { renderRankGlyph, rankLabel } from '../play/rank/rank-glyph.js?v=75c53031ef21';
import {
  fetchSelfProfile,
  fetchPublicProfile,
  updateDisplayName,
  changeHandle,
  updatePrivacy,
  setDirectoryVisible,
  equipTitle,
  equipProfileFrame,
  equipCardBack,
  buildLocalSelfProfile,
  Visibility,
  ShowcaseItemType,
  DEFAULT_PRIVACY,
  getTitleDefinition,
  getFrameDefinition,
  getBadgeDefinition,
} from '../play/profile/profile-data.js?v=75c53031ef21';
import { isSupabaseConfigured } from '../play/network/supabase-client.js?v=75c53031ef21';
import { getReplay, listMatchStats, listReplays } from '../play/persistence.js?v=75c53031ef21';
import { downloadReplay } from '../play/replay-library.js?v=75c53031ef21';
import { buildStrategicFingerprint } from "../account-domain/strategic-fingerprint.mjs";
import { buildEnrichedStats } from "../account-domain/match-stats-aggregator.mjs";
import { renderMasterySection, computeUsageFromReplays } from "../decision-intelligence/mastery-tracks.mjs";
import { generateReplayLesson, renderLessonStep, getLessonSummary } from "../decision-intelligence/replay-lesson.mjs";
import { getAuthState, getProfile as getAuthProfile } from '../play/network/auth-controller.js?v=75c53031ef21';
import {
  fetchRelationshipStatus,
  followPlayer,
  unfollowPlayer,
  setRival,
  unsetRival,
} from '../play/players/relationships-data.js?v=75c53031ef21';

const BADGE_ICONS = {
  shield: '🛡', trophy: '🏆', star: '⭐', crown: '👑', flame: '🔥',
  bolt: '⚡', heart: '❤', medal: '🏅', sword: '⚔', brain: '🧠',
};

// ── Profile workspace state ─────────────────────────────────────
/** @type {{ mode: 'self'|'public', handleOrId: string|null, tab: string, loading: boolean, error: string|null, selfProfile: any, publicProfile: any, localProfile: any, editMode: boolean, customizeMode: boolean, privacyMode: boolean, relationshipStatus: any, relationshipLoading: boolean, isOwnPublicProfile: boolean }} */
const _ws = {
  mode: 'self',
  handleOrId: null,
  tab: 'overview',
  loading: false,
  error: null,
  selfProfile: null,
  publicProfile: null,
  localProfile: null,
  editMode: false,
  customizeMode: false,
  privacyMode: false,
  /** Caller's relationship status to the viewed public profile (null = not loaded / not applicable). */
  relationshipStatus: null,
  relationshipLoading: false,
  /** True when viewing your own profile via the public route (hide relationship buttons). */
  isOwnPublicProfile: false,
  /** @type {Map<string, string>} Cached tab HTML keyed by `${profileKey}:${tabName}` */
  _tabCache: new Map(),
};

/**
 * Monotonic request ID — incremented on every renderProfile() call.
 * Stale async completions compare against this and bail if a newer
 * render has started. Prevents race conditions when navigating
 * quickly between profiles (e.g. @user1 → @user2).
 */
let _renderRequestId = 0;

/**
 * Active render container — defaults to the observatory #app element,
 * but can be overridden by passing a container to renderProfile().
 * This allows the profile to render inside the landing page context.
 */
let _container = app;

/**
 * Remove any open modal overlays from the DOM. Called at the start
 * of every renderProfile() to prevent memory leaks and zombie
 * interactions when navigating away while a modal is open.
 */
function cleanupModals() {
  document.querySelectorAll('.profile-modal-overlay').forEach(el => el.remove());
}

/**
 * Render the Profile workspace. Called by the router.
 * Detects self (#/profile) vs public (#/player/@handle) from the hash.
 * @returns {Promise<void>}
 */
export async function renderProfile(container = app) {
  _container = container;
  // Cancel any in-flight render and clean up modals from prior render
  const requestId = ++_renderRequestId;
  cleanupModals();

  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('/player/')) {
    const path = hash.replace('/player/', '');
    // Strip leading @ from handle
    _ws.mode = 'public';
    _ws.handleOrId = path.startsWith('@') ? path.slice(1) : path;
  } else {
    _ws.mode = 'self';
    _ws.handleOrId = null;
  }
  // Reset per-render state (stale data from prior profile is cleared)
  _ws.tab = 'overview';
  _ws.editMode = false;
  _ws.customizeMode = false;
  _ws.privacyMode = false;
  _ws.error = null;
  _ws.loading = true;
  _ws.selfProfile = null;
  _ws.publicProfile = null;
  _ws.relationshipStatus = null;
  _ws.relationshipLoading = false;
  _ws.isOwnPublicProfile = false;
  _ws._tabCache.clear(); // invalidate tab cache for new profile
  _ws.localProfile = isStorageAvailable() ? loadProfile() : null;

  renderSkeleton();
  await loadProfileData();
  // Bail if a newer render has started while we were awaiting
  if (requestId !== _renderRequestId) return;
  _ws.loading = false;
  renderCurrent();
}

// ── Data loading ────────────────────────────────────────────────

async function loadProfileData() {
  if (_ws.mode === 'public') {
    if (!isSupabaseConfigured()) {
      _ws.error = 'Online profiles require Supabase. Local-only mode cannot view other players.';
      return;
    }
    try {
      const result = await fetchPublicProfile(_ws.handleOrId);
      if (result.error) {
        _ws.error = result.error;
        return;
      }
      if (!result.profile) {
        _ws.error = 'PLAYER_NOT_FOUND';
        return;
      }
      _ws.publicProfile = result.profile;
      // Determine whether the viewer is looking at their own profile via
      // the public route. If so, hide the relationship action buttons.
      const myPid = getAuthProfile()?.publicPlayerId ?? null;
      _ws.isOwnPublicProfile = !!myPid && myPid === result.profile.identity?.publicPlayerId;
      // Fetch the viewer's relationship status to this profile (only when
      // authenticated and not viewing self). Used to render the correct
      // Follow/Rival button state. Failures degrade gracefully — the
      // profile still renders, just without relationship state.
      if (getAuthState() === 'AUTHENTICATED' && !_ws.isOwnPublicProfile) {
        _ws.relationshipLoading = true;
        try {
          _ws.relationshipStatus = await fetchRelationshipStatus(result.profile.identity.publicPlayerId);
        } catch (err) {
          console.warn('[profile] fetchRelationshipStatus failed:', err?.message ?? err);
          _ws.relationshipStatus = null;
        } finally {
          _ws.relationshipLoading = false;
        }
      }
    } catch (err) {
      _ws.error = err?.message ?? 'Could not reach the profile server.';
    }
    return;
  }

  // Self mode
  if (isSupabaseConfigured()) {
    try {
      const result = await fetchSelfProfile();
      if (result.error) {
        _ws.error = result.error;
        return;
      }
      _ws.selfProfile = result.profile;
    } catch (err) {
      // Network/CSP error — fall back to local profile only
      console.warn('[profile] fetchSelfProfile failed:', err?.message ?? err);
    }
  }
  // localProfile was already loaded at the start of renderProfile();
  // no need to re-read from storage here.

  // Epoch 7: Load match stats from IndexedDB for fingerprint enrichment
  if (isStorageAvailable()) {
    try {
      const stats = await listMatchStats(100);
      _ws.localProfile = _ws.localProfile || {};
      _ws.localProfile.replayStats = stats;
      // G2: Load replays and compute mechanic usage for mastery tracks
      const replays = await listReplays();
      _ws.localProfile.mechanicUsage = computeUsageFromReplays(replays);
    } catch (err) {
      console.warn('[profile] listMatchStats failed:', err?.message ?? err);
      _ws.localProfile = _ws.localProfile || {};
      _ws.localProfile.replayStats = [];
      _ws.localProfile.mechanicUsage = {};
    }
  }
}

// ── Skeleton ────────────────────────────────────────────────────

function renderSkeleton() {
  _container.innerHTML = `<section class="panel" style="max-width:1200px;margin:0 auto;padding:20px">
    <div class="loading-state" data-testid="profile-skeleton">
      <span class="loading-spinner" aria-hidden="true"></span>
      <strong>Loading Profile…</strong>
      <small>Fetching player identity</small>
    </div>
  </section>`;
}

// ── Main render dispatch ────────────────────────────────────────

function renderCurrent() {
  if (_ws.error) {
    renderError(_ws.error);
    return;
  }
  if (_ws.mode === 'public') {
    renderPublicProfile(_ws.publicProfile);
  } else {
    renderSelfProfile(_ws.selfProfile, _ws.localProfile);
  }
}

function renderError(error) {
  if (error === 'PLAYER_NOT_FOUND' || error === 'INVALID_PROFILE') {
    _container.innerHTML = `<section class="panel" style="max-width:800px;margin:0 auto;padding:40px 20px;text-align:center">
      <div data-testid="profile-not-found">
        <h2 style="font-size:24px;color:var(--text-dim);letter-spacing:2px;text-transform:uppercase">Player Not Found</h2>
        <p style="color:var(--text-dim);margin:12px 0 24px">No public profile exists for this identifier.</p>
        <a href="#/ranks" class="btn">Back to Leaderboard</a>
      </div>
    </section>`;
    return;
  }
  _container.innerHTML = `<section class="panel" style="max-width:800px;margin:0 auto;padding:40px 20px;text-align:center">
    <div data-testid="profile-error">
      <h2 style="font-size:20px;color:var(--danger,#e55)">Couldn't load this profile.</h2>
      <p style="color:var(--text-dim);margin:12px 0 24px">${esc(error)}</p>
      <button class="btn" onclick="location.reload()">Retry</button>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════
// SELF PROFILE
// ═══════════════════════════════════════════════════════════════

function renderSelfProfile(selfProfile, localProfile) {
  // If Supabase not configured or no self profile, build from local data
  let profile = selfProfile;
  if (!profile) {
    const achRuntime = getAchievementRuntime();
    let achSummary = null;
    try {
      const s = achRuntime.getSummary();
      achSummary = { earnedCount: s.earned, totalCount: s.total, achievementPoints: s.ap, maxAp: s.maxAp };
    } catch { /* runtime not initialized */ }
    const earnedAch = new Set();
    const earnedBadges = new Set();
    try {
      const gallery = achRuntime.getGalleryData({ filter: 'earned' });
      for (const g of gallery) earnedAch.add(g.id);
    } catch { /* ignore */ }
    if (localProfile) {
      for (const b of localProfile.badges) earnedBadges.add(b.id);
    }
    profile = buildLocalSelfProfile(localProfile ?? {}, achSummary, earnedAch, earnedBadges);
  }

  // Guard against malformed profile data (e.g. empty local profile)
  if (!profile?.identity) {
    renderError('INVALID_PROFILE');
    return;
  }

  const isOffline = !isSupabaseConfigured();
  const authState = getAuthState();
  const isGuest = authState === 'ANONYMOUS' || profile.identity.accountType === 'GUEST';

  _container.innerHTML = `<div class="profile-workspace" data-testid="profile-self">
    ${isOffline ? renderOfflineBanner() : ''}
    ${isGuest && !isOffline ? renderGuestBanner() : ''}
    ${renderHero(profile, true)}
    ${renderTabNav(_ws.tab, true)}
    <div class="profile-tab-content" id="${TAB_CONTENT_ID}" role="tabpanel" data-testid="profile-tab-content">
      ${renderTab(_ws.tab, profile, true)}
    </div>
  </div>`;
  wireTabNav(true);
  wireHeroActions(profile);
}

function renderOfflineBanner() {
  return `<div class="notice profile-banner profile-banner--offline" data-testid="profile-offline-banner">
    <strong>Offline mode.</strong> Showing device-local profile data. Online Ranked identity and customization require Supabase.
  </div>`;
}

function renderGuestBanner() {
  return `<div class="notice profile-banner profile-banner--guest">
    <strong>Guest account.</strong> Link a Discord or Google account to enable Ranked, leaderboard placement, and profile customization.
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC PROFILE
// ═══════════════════════════════════════════════════════════════

function renderPublicProfile(profile) {
  if (!profile?.identity) {
    renderError('PLAYER_NOT_FOUND');
    return;
  }
  _container.innerHTML = `<div class="profile-workspace" data-testid="profile-public">
    ${renderHero(profile, false)}
    ${renderTabNav(_ws.tab, false)}
    <div class="profile-tab-content" id="${TAB_CONTENT_ID}" role="tabpanel" data-testid="profile-tab-content">
      ${renderTab(_ws.tab, profile, false)}
    </div>
  </div>`;
  wireTabNav(false);
  wireRelationshipActions(profile);
}

// ═══════════════════════════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════════════════════════

function renderHero(profile, isSelf) {
  const id = profile.identity;
  const ranked = profile.ranked;
  const loadout = id.loadout ?? {};
  const titleDef = getTitleDefinition(loadout.titleId ?? 'none');
  const frameDef = getFrameDefinition(loadout.profileFrameId ?? 'none');
  const frameClass = frameDef?.cssClass ?? 'frame-none';
  const titleText = titleDef && titleDef.name ? titleDef.name : '';
  const joinedDate = id.joinedAt ? formatJoinedDate(id.joinedAt) : '';
  const avatarHtml = renderAvatar(id.avatarUrl, id.displayName, 96);
  const rankedHero = ranked && ranked.available ? renderRankedHero(ranked) : renderUnrankedHero(ranked);

  const editButtons = isSelf ? `
    <div class="profile-hero-actions">
      <button class="btn btn-sm" data-action="edit" data-testid="profile-edit-btn">Edit Profile</button>
      <button class="btn btn-sm" data-action="customize" data-testid="profile-customize-btn">Customize</button>
      <button class="btn btn-sm" data-action="privacy" data-testid="profile-privacy-btn">Privacy</button>
    </div>` : '';

  // Relationship action buttons (public profile only, authenticated viewer,
  // not viewing self). Render a placeholder while loading and the real
  // buttons once the status is known. When not authenticated, show a
  // sign-in prompt instead.
  const relationshipButtons = (!isSelf && !_ws.isOwnPublicProfile) ? renderRelationshipButtons() : '';

  return `<section class="panel profile-hero ${frameClass}" data-testid="profile-hero">
    <div class="profile-hero-body">
      <div class="profile-hero-avatar">${avatarHtml}</div>
      <div class="profile-hero-identity">
        <h2 data-testid="profile-display-name">${esc(id.displayName)}</h2>
        ${id.handle ? `<div class="profile-hero-handle" data-testid="profile-handle">@${esc(id.handle)}</div>` : ''}
        ${titleText ? `<div class="profile-hero-title" data-testid="profile-title">${esc(titleText)}</div>` : ''}
        ${joinedDate ? `<div class="profile-hero-joined">Joined ${esc(joinedDate)}</div>` : ''}
        ${id.accountType === 'GUEST' ? `<div class="profile-hero-guest"><span class="badge-tag">Guest</span></div>` : ''}
        ${editButtons}
        ${relationshipButtons}
      </div>
      <div class="profile-hero-ranked">
        ${rankedHero}
      </div>
    </div>
  </section>`;
}

/**
 * Render the Follow/Rival action buttons for a public profile, based on
 * the loaded relationship status. Shows a loading placeholder while the
 * status is being fetched, a sign-in prompt when not authenticated, and
 * the appropriate toggle buttons once the status is known.
 * @returns {string}
 */
function renderRelationshipButtons() {
  if (!isSupabaseConfigured()) return ''; // no online relationships in local mode
  const authState = getAuthState();
  if (authState !== 'AUTHENTICATED') {
    return `<div class="profile-hero-actions profile-relationship-actions" data-testid="profile-relationship-actions">
      <a class="btn btn-sm" href="#/auth" data-testid="profile-signin-to-follow">Sign in to Follow</a>
    </div>`;
  }
  if (_ws.relationshipLoading) {
    return `<div class="profile-hero-actions profile-relationship-actions" data-testid="profile-relationship-actions" aria-busy="true">
      <span class="profile-relationship-loading" data-testid="profile-relationship-loading">Loading…</span>
    </div>`;
  }
  const s = _ws.relationshipStatus;
  if (!s) return ''; // status fetch failed — degrade silently
  const following = s.following;
  const rivaling = s.rivaling;
  const followBtn = following
    ? `<button class="btn btn-sm profile-rel-btn profile-rel-btn-active" data-action="unfollow" data-testid="profile-unfollow-btn" aria-pressed="true">✓ Following</button>`
    : `<button class="btn btn-sm profile-rel-btn" data-action="follow" data-testid="profile-follow-btn" aria-pressed="false">+ Follow</button>`;
  const rivalBtn = rivaling
    ? `<button class="btn btn-sm profile-rel-btn profile-rel-btn-rival-active" data-action="unset-rival" data-testid="profile-unset-rival-btn" aria-pressed="true">⚡ Rival</button>`
    : `<button class="btn btn-sm profile-rel-btn profile-rel-btn-rival" data-action="set-rival" data-testid="profile-set-rival-btn" aria-pressed="false">+ Rival</button>`;
  const mutualTag = s.isMutualRival
    ? `<span class="profile-mutual-rival-tag" data-testid="profile-mutual-rival-tag" title="You both rival each other">⇌ Mutual Rival</span>`
    : '';
  // C3i: Challenge button — creates a private duel invite for this player
  const challengeBtn = s.blocking
    ? '' // Don't show challenge button if you've blocked them
    : `<button class="btn btn-sm profile-rel-btn profile-rel-btn-challenge" data-action="challenge" data-testid="profile-challenge-btn" aria-label="Challenge to a duel">⚔ Challenge</button>`;
  return `<div class="profile-hero-actions profile-relationship-actions" data-testid="profile-relationship-actions">
    ${followBtn}${rivalBtn}${challengeBtn}${mutualTag}
  </div>`;
}

/**
 * Wire the Follow/Rival action buttons in the public profile hero.
 * Each action calls the relationships data layer, updates the in-memory
 * status, and re-renders just the hero (not the whole profile) so the
 * tab cache and scroll position are preserved.
 * @param {object} profile - The public profile being viewed.
 */
function wireRelationshipActions(profile) {
  if (!profile?.identity) return;
  if (!isSupabaseConfigured()) return;
  const pid = profile.identity.publicPlayerId;
  const actions = _container.querySelectorAll('[data-action="follow"],[data-action="unfollow"],[data-action="set-rival"],[data-action="unset-rival"],[data-action="challenge"]');
  for (const btn of actions) {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      btn.disabled = true;
      try {
        if (action === 'follow') {
          const res = await followPlayer(pid);
          if (res.ok && _ws.relationshipStatus) _ws.relationshipStatus.following = true;
        } else if (action === 'unfollow') {
          const res = await unfollowPlayer(pid);
          if (res.ok && _ws.relationshipStatus) {
            _ws.relationshipStatus.following = false;
            // Unfollowing also clears rival (rival implies follow).
            _ws.relationshipStatus.rivaling = false;
          }
        } else if (action === 'set-rival') {
          const res = await setRival(pid);
          if (res.ok && _ws.relationshipStatus) {
            _ws.relationshipStatus.rivaling = true;
            _ws.relationshipStatus.following = true; // rival implies follow
          }
        } else if (action === 'unset-rival') {
          const res = await unsetRival(pid);
          if (res.ok && _ws.relationshipStatus) _ws.relationshipStatus.rivaling = false;
        } else if (action === 'challenge') {
          // C3i: Challenge flow — navigate to play with a pre-filled invite
          // The challenge creates a private duel; the invite code is shared
          // via the profile page (copied to clipboard or shown in a dialog).
          const targetAccountId = profile?.identity?.accountId;
          const targetName = profile?.identity?.displayName ?? 'this player';
          // Navigate to the play page with challenge context
          window.location.hash = `#/play?challenge=${encodeURIComponent(targetName)}`;
          if (targetAccountId) {
            sessionStorage.setItem('intrilex:challenge-target', JSON.stringify({
              accountId: targetAccountId,
              displayName: targetName,
              publicPlayerId: pid,
            }));
          }
          return; // Don't re-render the profile hero — we're navigating away
        }
      } catch (err) {
        console.warn('[profile] relationship action failed:', err?.message ?? err);
      } finally {
        btn.disabled = false;
        // Re-render the hero in place (preserves tab content + scroll).
        const hero = _container.querySelector('[data-testid="profile-hero"]');
        if (hero) {
          const updated = renderHero(profile, false);
          // renderHero returns a full <section>; replace the existing one.
          const tmp = document.createElement('div');
          tmp.innerHTML = updated;
          const newHero = tmp.firstElementChild;
          if (newHero) hero.replaceWith(newHero);
          wireRelationshipActions(profile);
        }
      }
    });
  }
}

function renderRankedHero(ranked) {
  const glyph = ranked.isPlacement
    ? renderRankGlyph({ tier: RankTier.UNRANKED, size: 96, decorative: false })
    : renderRankGlyph({
        tier: ranked.tier,
        division: ranked.division,
        size: 96,
        showDivision: true,
        decorative: false,
        leaderboardPosition: ranked.isApex && ranked.leaderboardPosition ? `#${ranked.leaderboardPosition}` : null,
      });
  const rankLine = ranked.isPlacement
    ? 'UNRANKED'
    : ranked.isApex && ranked.leaderboardPosition
      ? `${rankLabel(ranked.tier, ranked.division)} #${ranked.leaderboardPosition}`
      : rankLabel(ranked.tier, ranked.division);
  const irText = ranked.isPlacement ? `${ranked.placementsPlayed} / ${ranked.placementsRequired} Placements` : `${ranked.rating} IR`;
  const positionText = !ranked.isPlacement && ranked.leaderboardPosition ? `Season Rank #${ranked.leaderboardPosition}` : '';
  const peakText = !ranked.isPlacement && ranked.peakRating != null && ranked.peakTier
    ? `Peak: ${rankLabel(ranked.peakTier, ranked.peakDivision)} · ${ranked.peakRating}`
    : '';

  return `<div class="profile-ranked-hero" data-testid="profile-ranked-hero">
    ${glyph}
    <div class="profile-ranked-hero-info">
      <div class="profile-ranked-hero-label" data-testid="profile-rank-label">${esc(rankLine)}</div>
      <div class="profile-ranked-hero-ir" data-testid="profile-ir">${esc(irText)}</div>
      ${positionText ? `<div class="profile-ranked-hero-position" data-testid="profile-position">${esc(positionText)}</div>` : ''}
      ${peakText ? `<div class="profile-ranked-hero-peak" data-testid="profile-peak">${esc(peakText)}</div>` : ''}
    </div>
  </div>`;
}

function renderUnrankedHero(ranked) {
  const placementText = ranked && ranked.isPlacement
    ? `${ranked.placementsPlayed} / ${ranked.placementsRequired} Placements`
    : 'Complete placements to enter the Ranked ladder.';
  return `<div class="profile-ranked-hero" data-testid="profile-ranked-hero">
    ${renderRankGlyph({ tier: RankTier.UNRANKED, size: 96, decorative: false })}
    <div class="profile-ranked-hero-info">
      <div class="profile-ranked-hero-label profile-ranked-hero-label--unranked">NO RANKED HISTORY</div>
      <div class="profile-ranked-hero-placement">${esc(placementText)}</div>
    </div>
  </div>`;
}

function renderAvatar(avatarUrl, displayName, size) {
  const initials = (displayName || 'P').slice(0, 2).toUpperCase();
  if (avatarUrl && avatarUrl.startsWith('https://')) {
    return `<img src="${esc(avatarUrl)}" alt="${esc(displayName)} avatar" width="${size}" height="${size}" class="profile-avatar-img" loading="lazy" decoding="async" />`;
  }
  return `<div class="profile-avatar-default" style="width:${size}px;height:${size}px;font-size:${Math.floor(size*0.4)}px;color:#8a9ba8" aria-label="${esc(displayName)} avatar">${esc(initials)}</div>`;
}

function formatJoinedDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch { return ''; }
}

// ═══════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════

const TABS = ['overview', 'ranked', 'achievements', 'matches'];
const TAB_LABELS = { overview: 'Overview', ranked: 'Ranked', achievements: 'Achievements', matches: 'Matches' };
const TAB_CONTENT_ID = 'profile-tab-content';

/**
 * Cache key for tab content — includes the profile identity so that
 * switching to a different profile automatically invalidates the cache.
 * @returns {string}
 */
function tabCacheKey() {
  const isSelf = _ws.mode === 'self';
  const profile = isSelf ? _ws.selfProfile : _ws.publicProfile;
  const idKey = profile?.identity?.publicPlayerId ?? _ws.handleOrId ?? 'self';
  return `${isSelf ? 'self' : 'pub'}:${idKey}`;
}

/**
 * Get cached tab HTML if available and still valid.
 * @param {string} tab
 * @returns {string|null}
 */
function getCachedTab(tab) {
  const key = `${tabCacheKey()}:${tab}`;
  return _ws._tabCache.get(key) ?? null;
}

/**
 * Store rendered tab HTML in the cache.
 * @param {string} tab
 * @param {string} html
 */
function setCachedTab(tab, html) {
  const key = `${tabCacheKey()}:${tab}`;
  _ws._tabCache.set(key, html);
}

/**
 * Invalidate the entire tab cache. Called after mutations (edit,
 * customize, privacy save) that change the underlying profile data.
 */
function invalidateTabCache() {
  _ws._tabCache.clear();
}

function renderTabNav(active, _isSelf) {
  const tabs = TABS.map(t => {
    const isActive = t === active;
    const activeClass = isActive ? ' active' : '';
    // WAI-ARIA tabs pattern: active tab has tabindex=0, others tabindex=-1
    return `<button class="profile-tab-btn${activeClass}" data-tab="${t}" data-testid="profile-tab-${t}" role="tab" aria-selected="${isActive}" aria-controls="${TAB_CONTENT_ID}" tabindex="${isActive ? 0 : -1}">${TAB_LABELS[t]}</button>`;
  }).join('');
  return `<div class="profile-tab-nav" role="tablist" style="display:flex;gap:4px;border-bottom:1px solid var(--border,rgba(255,255,255,0.1));margin-bottom:16px;flex-wrap:wrap">
    ${tabs}
  </div>`;
}

/**
 * Activate a tab by name: update button states, tabindex, and content.
 * Uses cached HTML if available; renders and caches otherwise.
 * @param {string} newTab
 * @param {NodeListOf<HTMLElement>} buttons
 */
function activateTab(newTab, buttons) {
  _ws.tab = newTab;
  buttons.forEach(b => {
    const isActive = b.dataset.tab === newTab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
    b.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  // Render or reuse tab content
  const contentEl = _container.querySelector(`#${TAB_CONTENT_ID}`);
  if (contentEl) {
    const cached = getCachedTab(newTab);
    if (cached !== null) {
      contentEl.innerHTML = cached;
    } else {
      const isSelf = _ws.mode === 'self';
      const profile = isSelf ? _ws.selfProfile : _ws.publicProfile;
      const html = renderTab(newTab, profile ?? _ws.localProfile, isSelf);
      setCachedTab(newTab, html);
      contentEl.innerHTML = html;
    }
  }
  // Move focus to the newly activated tab button (WAI-ARIA pattern)
  const activeBtn = _container.querySelector(`.profile-tab-btn[data-tab="${newTab}"]`);
  if (activeBtn) /** @type {HTMLElement} */ (activeBtn).focus();
}

function wireTabNav(_isSelf) {
  const buttons = _container.querySelectorAll('.profile-tab-btn');
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const newTab = btn.dataset.tab;
      if (newTab === _ws.tab) return;
      activateTab(newTab, buttons);
    });
  }

  // WAI-ARIA tabs pattern: keyboard arrow navigation
  const tablist = _container.querySelector('.profile-tab-nav');
  if (tablist) {
    tablist.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      const currentIdx = TABS.indexOf(_ws.tab);
      if (currentIdx < 0) return;
      let newIdx = -1;
      if (e.key === 'ArrowRight') newIdx = (currentIdx + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') newIdx = (currentIdx - 1 + TABS.length) % TABS.length;
      else if (e.key === 'Home') newIdx = 0;
      else if (e.key === 'End') newIdx = TABS.length - 1;
      if (newIdx >= 0) {
        e.preventDefault();
        activateTab(TABS[newIdx], buttons);
      }
    });
  }
}

function renderTab(tab, profile, isSelf) {
  switch (tab) {
    case 'overview': return renderOverviewTab(profile, isSelf);
    case 'ranked': return renderRankedTab(profile, isSelf);
    case 'achievements': return renderAchievementsTab(profile, isSelf);
    case 'matches': return renderMatchesTab(profile, isSelf);
    default: return renderOverviewTab(profile, isSelf);
  }
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════

function renderOverviewTab(profile, isSelf) {
  const ranked = profile.ranked;
  const achievements = profile.achievements;
  const showcase = profile.showcase ?? [];
  const recentMatches = profile.recentMatches ?? [];
  const seasonHistory = profile.seasonHistory ?? [];

  const rankedRecord = ranked && ranked.available ? renderRankedRecordCard(ranked) : '';
  const achievementSummary = achievements ? renderAchievementSummaryCard(achievements, isSelf) : renderPrivateCard('Achievements');
  const showcaseHtml = renderShowcaseSection(showcase, isSelf);
  const recentHtml = recentMatches.length > 0 ? renderRecentMatches(recentMatches.slice(0, 5), isSelf) : '';
  const seasonHtml = seasonHistory.length > 0 ? renderSeasonHistoryMini(seasonHistory) : '';
  const localSection = isSelf && _ws.localProfile ? renderLocalPlaySection(_ws.localProfile) : '';
  // G2: Mastery tracks from mechanic usage data computed from local replays
  const usageByMechanic = _ws.localProfile?.mechanicUsage ?? {};
  const masteryHtml = isSelf && Object.keys(usageByMechanic).length > 0 ? renderMasterySection(usageByMechanic) : '';

  return `<div class="profile-overview" data-testid="profile-overview">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px">
      ${rankedRecord}
      ${achievementSummary}
    </div>
    ${showcaseHtml}
    ${masteryHtml}
    ${recentHtml}
    ${seasonHtml}
    ${localSection}
  </div>`;
}

function renderRankedRecordCard(ranked) {
  if (!ranked || !ranked.available) {
    return `<div class="stat-card-group" data-testid="profile-ranked-record">
      <h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Ranked Record</h3>
      <p style="color:var(--text-dim);margin:0">No ranked history.</p>
    </div>`;
  }
  const games = ranked.games || (ranked.wins + ranked.losses + ranked.draws);
  const winRate = ranked.winRate != null ? pct(ranked.winRate) : '—';
  return `<div class="stat-card-group" data-testid="profile-ranked-record">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Ranked Record</h3>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
      <div><span style="font-size:24px;color:var(--accent,#00c8dc)">${ranked.wins}</span><br><small style="color:var(--text-dim)">Wins</small></div>
      <div><span style="font-size:24px;color:var(--danger,#e55)">${ranked.losses}</span><br><small style="color:var(--text-dim)">Losses</small></div>
      <div><span style="font-size:20px;color:var(--text-dim)">${ranked.draws}</span><br><small style="color:var(--text-dim)">Draws</small></div>
      <div><span style="font-size:20px;color:var(--text,#e0f0ff)">${winRate}</span><br><small style="color:var(--text-dim)">Win Rate (${games} games)</small></div>
    </div>
  </div>`;
}

function renderAchievementSummaryCard(achievements, _isSelf) {
  const apPct = achievements.maxAp > 0 ? pct((achievements.achievementPoints ?? 0) / achievements.maxAp) : '0%';
  return `<div class="stat-card-group" data-testid="profile-achievement-summary">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Achievements</h3>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
      <div><span style="font-size:24px;color:var(--text,#e0f0ff)">${achievements.earnedCount ?? 0}/${achievements.totalCount ?? 56}</span><br><small style="color:var(--text-dim)">Unlocked</small></div>
      <div><span style="font-size:20px;color:var(--accent,#00c8dc)">${achievements.achievementPoints ?? 0}</span><br><small style="color:var(--text-dim)">AP (${apPct} of ${achievements.maxAp ?? 1320})</small></div>
    </div>
    <p style="margin:12px 0 0"><a href="#/achievements" style="color:var(--accent,#00c8dc)">View all achievements →</a></p>
  </div>`;
}

function renderPrivateCard(label) {
  return `<div class="stat-card-group" data-testid="profile-${label.toLowerCase()}-private">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">${esc(label)}</h3>
    <p style="color:var(--text-dim);margin:0;font-style:italic">Private</p>
  </div>`;
}

function renderShowcaseSection(showcase, isSelf) {
  if (!showcase || showcase.length === 0) {
    if (isSelf) {
      return `<section class="panel" style="margin-bottom:16px" data-testid="profile-showcase"><div class="panel-body">
        <h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Showcase</h3>
        <p style="color:var(--text-dim);margin:0">No featured items yet. Use Customize to feature achievements and badges.</p>
      </div></section>`;
    }
    return '';
  }
  const slots = showcase.map(s => renderShowcaseSlot(s)).join('');
  return `<section class="panel" style="margin-bottom:16px" data-testid="profile-showcase"><div class="panel-body">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Showcase</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">${slots}</div>
  </div></section>`;
}

function renderShowcaseSlot(slot) {
  if (slot.type === ShowcaseItemType.ACHIEVEMENT) {
    const def = getDefinition(slot.itemId);
    if (!def) return '';
    // Don't leak hidden achievement names if locked
    const name = def.hidden ? 'Secret Unlock' : def.name;
    const desc = def.hidden ? 'Hidden achievement' : def.description;
    return `<div class="showcase-item showcase-achievement" data-testid="profile-showcase-${slot.type}-${slot.itemId}" title="${esc(desc)}">
      <div style="font-size:24px;margin-bottom:4px">${esc(raritySymbol(def.rarity))}</div>
      <div style="font-weight:500;color:var(--text,#e0f0ff)">${esc(name)}</div>
      <small style="color:var(--text-dim)">${esc(desc)}</small>
    </div>`;
  }
  // Badge
  const def = getBadgeDefinition(slot.itemId);
  if (!def) return '';
  const icon = BADGE_ICONS[def.icon] ?? '🔹';
  return `<div class="showcase-item showcase-badge" data-testid="profile-showcase-${slot.type}-${slot.itemId}" title="${esc(def.description)}">
    <div style="font-size:24px;margin-bottom:4px">${icon}</div>
    <div style="font-weight:500;color:var(--text,#e0f0ff)">${esc(def.name)}</div>
    <small style="color:var(--text-dim)">${esc(def.description)}</small>
  </div>`;
}

function raritySymbol(rarity) {
  const symbols = { COMMON: '●', CLEVER: '◆', RARE: '✦', INTRILEX: '✧' };
  return symbols[rarity] ?? '●';
}

function renderRecentMatches(matches, _isSelf) {
  const items = matches.map(m => renderMatchItem(m, _isSelf)).join('');
  return `<section class="panel" style="margin-bottom:16px" data-testid="profile-recent-matches"><div class="panel-body">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Recent Ranked Matches</h3>
    <div style="display:flex;flex-direction:column;gap:8px">${items}</div>
    <p style="margin:12px 0 0"><button class="btn btn-sm" data-action="goto-matches" style="color:var(--accent,#00c8dc)">View all matches →</button></p>
  </div></section>`;
}

function renderMatchItem(m, isSelf) {
  const resultClass = m.result === 'WIN' ? 'color:var(--accent,#00c8dc)' : m.result === 'LOSS' ? 'color:var(--danger,#e55)' : 'color:var(--text-dim)';
  const delta = m.ratingDelta != null ? (m.ratingDelta >= 0 ? `+${m.ratingDelta}` : `${m.ratingDelta}`) : '';
  const deltaClass = m.ratingDelta > 0 ? 'color:var(--accent,#00c8dc)' : m.ratingDelta < 0 ? 'color:var(--danger,#e55)' : '';
  const date = m.timestamp ? formatMatchDate(m.timestamp) : '';
  const opponent = m.opponentDisplayName || m.opponentHandle || 'Opponent';
  // Replay download button — only for the profile owner. Replays are fetched
  // from local IndexedDB (saved during the terminal screen via
  // createNetworkReplayRecord + saveReplay). If not saved locally, the button
  // shows a tooltip explaining the replay is unavailable.
  const replayBtn = isSelf && m.matchId
    ? `<button class="btn btn-sm profile-match-replay-btn" data-action="download-match-replay" data-match-id="${esc(m.matchId)}" title="Download certified replay" aria-label="Download replay for match ${esc(m.matchId)}" style="font-size:11px;padding:2px 8px;margin-left:8px;color:var(--text-dim);border-color:rgba(255,255,255,0.1)">⬇ Replay</button>`
    : '';
  // Epoch 7: Branch button — explore alternate lines from this match's replay
  const branchBtn = isSelf && m.matchId
    ? `<button class="btn btn-sm profile-match-branch-btn" data-action="branch-match-replay" data-match-id="${esc(m.matchId)}" title="Explore alternate lines from this match" aria-label="Branch replay for match ${esc(m.matchId)}" style="font-size:11px;padding:2px 8px;margin-left:4px;color:var(--text-dim);border-color:rgba(255,255,255,0.1)">⎇ Branch</button>`
    : '';
  // L6: Replay lesson button — guided replay commentary
  const lessonBtn = isSelf && m.matchId
    ? `<button class="btn btn-sm profile-match-lesson-btn" data-action="view-replay-lesson" data-match-id="${esc(m.matchId)}" title="View guided replay lesson" aria-label="View lesson for match ${esc(m.matchId)}" style="font-size:11px;padding:2px 8px;margin-left:4px;color:var(--text-dim);border-color:rgba(255,255,255,0.1)">📖 Lesson</button>`
    : '';
  return `<div class="match-item" data-testid="profile-match-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px">
    <div>
      <span style="${resultClass};font-weight:500">${esc(m.result)}</span>
      <span style="color:var(--text-dim);margin-left:8px">vs ${esc(opponent)}</span>
    </div>
    <div style="text-align:right;display:flex;align-items:center;gap:4px">
      <div>
        ${delta ? `<span style="${deltaClass};font-weight:500">${esc(delta)} IR</span><br>` : ''}
        <small style="color:var(--text-dim)">${esc(date)}</small>
      </div>
      ${replayBtn}
      ${branchBtn}
      ${lessonBtn}
    </div>
  </div>`;
}

function formatMatchDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

function renderSeasonHistoryMini(seasons) {
  const items = seasons.map(s => {
    const label = rankLabel(s.finalTier, s.finalDivision);
    return `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <span style="color:var(--text,#e0f0ff)">${esc(s.name)}</span>
      <span style="color:var(--text-dim);margin-left:8px">${esc(label)} · ${s.finalRating} IR</span>
      ${s.finalPosition ? `<span style="color:var(--text-dim);margin-left:8px">#${s.finalPosition}</span>` : ''}
    </div>`;
  }).join('');
  return `<section class="panel" style="margin-bottom:16px" data-testid="profile-season-history-mini"><div class="panel-body">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Season History</h3>
    ${items}
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════
// LOCAL PLAY SECTION (self only, section 21-22)
// ═══════════════════════════════════════════════════════════════

function renderLocalPlaySection(localProfile) {
  const r = localProfile.rating;
  const rec = localProfile.record;
  const totalGames = rec.wins + rec.losses + rec.draws;
  const winRate = totalGames > 0 ? pct(rec.wins / totalGames) : '—';
  const assignment = ratingToTierDivision(r.value, { ratedMatches: r.ratedMatches });
  const rankLine = assignment.isPlacement ? 'UNRANKED (Local)' : `${rankLabel(assignment.tier, assignment.division)} (Local)`;

  return `<section class="panel" style="margin-bottom:16px;border:1px dashed rgba(255,200,0,0.2)" data-testid="profile-local-play"><div class="panel-body">
    <h3 style="margin:0 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,200,0,0.8)">Local Play</h3>
    <p style="color:var(--text-dim);margin:0 0 12px;font-size:12px">Device-local AI practice statistics. Not online Ranked. Not shared publicly.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
      <div><span style="font-size:20px;color:var(--text,#e0f0ff)">${r.value}</span><br><small style="color:var(--text-dim)">Local AI Rating ${r.provisional ? '(Provisional)' : ''}</small></div>
      <div><span style="font-size:20px;color:var(--accent,#00c8dc)">${rec.wins}</span><br><small style="color:var(--text-dim)">Local Wins</small></div>
      <div><span style="font-size:20px;color:var(--danger,#e55)">${rec.losses}</span><br><small style="color:var(--text-dim)">Local Losses</small></div>
      <div><span style="font-size:20px;color:var(--text,#e0f0ff)">${winRate}</span><br><small style="color:var(--text-dim)">Win Rate (${totalGames} games)</small></div>
    </div>
    <p style="margin:12px 0 0;color:var(--text-dim);font-size:12px">${esc(rankLine)}</p>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════
// RANKED TAB
// ═══════════════════════════════════════════════════════════════

function renderRankedTab(profile, isSelf) {
  const ranked = profile.ranked;
  if (!ranked || !ranked.available) {
    return `<div data-testid="profile-ranked-empty" style="text-align:center;padding:40px 20px">
      <h3 style="color:var(--text-dim);text-transform:uppercase;letter-spacing:2px">No Ranked History</h3>
      <p style="color:var(--text-dim);margin:12px 0">Complete placements to enter the Ranked ladder.</p>
    </div>`;
  }

  const seasonHistory = profile.seasonHistory ?? [];
  const ratingHistory = isSelf && _ws.localProfile?.ratingHistory ? _ws.localProfile.ratingHistory : [];

  return `<div class="profile-ranked-tab" data-testid="profile-ranked-tab">
    ${renderRankedDetailCard(ranked)}
    ${renderStrategicFingerprintCard(ranked, isSelf)}
    ${ratingHistory.length >= 2 ? renderRatingHistoryChart(ratingHistory) : ''}
    ${seasonHistory.length > 0 ? renderSeasonHistoryFull(seasonHistory) : ''}
  </div>`;
}

/**
 * Render the strategic fingerprint card from ranked stats.
 * Shows the player's playstyle archetype and top traits.
 * @param {Object} ranked - The ranked profile data
 * @returns {string}
 */
function renderStrategicFingerprintCard(ranked, isSelf) {
  if (!ranked || ranked.isPlacement || ranked.games === 0) return '';
  // Build enriched stats from ranked DTO + any available local replay data.
  // When match-level data is available (from IndexedDB replays), we use
  // real averages for turns, IR margin, draw pile, and goal progress.
  // Otherwise we fall back to sensible defaults.
  const localReplays = isSelf && _ws.localProfile?.replayStats ? _ws.localProfile.replayStats : [];
  const playerPublicId = _ws.profile?.player?.publicPlayerId ?? '';
  let stats, fingerprint;
  try {
    stats = buildEnrichedStats(ranked, localReplays, playerPublicId);
    fingerprint = buildStrategicFingerprint(stats);
  } catch (err) {
    console.warn('[profile] fingerprint generation failed:', err?.message ?? err);
    return '';
  }
  if (fingerprint.traits.length === 0) return '';

  // Coverage indicator: how many match-level records are available
  const coverageCount = localReplays.length;
  const coverageLabel = coverageCount > 0
    ? `Based on ${coverageCount} match${coverageCount === 1 ? '' : 's'}`
    : 'Estimated from ranked record';

  const traitBadges = fingerprint.traits.slice(0, 4).map(t => {
    const pctScore = Math.round(t.score * 100);
    return `<span class="profile-fingerprint-trait" data-testid="profile-fingerprint-trait" title="${esc(t.description)}">
      <span class="profile-fingerprint-icon" aria-hidden="true">${t.icon}</span>
      <span class="profile-fingerprint-label">${esc(t.label)}</span>
      <span class="profile-fingerprint-score">${pctScore}%</span>
    </span>`;
  }).join('');

  return `<section class="panel" style="margin-bottom:16px" data-testid="profile-fingerprint">
    <div class="panel-body">
      <h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Strategic Fingerprint</h3>
      <div class="profile-fingerprint-archetype">
        <span class="profile-fingerprint-archetype-icon" aria-hidden="true">${esc(fingerprint.archetypeIcon)}</span>
        <div>
          <div class="profile-fingerprint-archetype-name" data-testid="profile-fingerprint-archetype">${esc(fingerprint.primaryArchetype)}</div>
          <div class="profile-fingerprint-summary">${esc(fingerprint.summary)}</div>
        </div>
      </div>
      <div class="profile-fingerprint-traits">${traitBadges}</div>
      <div class="profile-fingerprint-coverage" data-testid="profile-fingerprint-coverage">${esc(coverageLabel)}</div>
    </div>
  </section>`;
}

function renderRankedDetailCard(ranked) {
  const rankLine = ranked.isPlacement
    ? 'UNRANKED'
    : ranked.isApex && ranked.leaderboardPosition
      ? `${rankLabel(ranked.tier, ranked.division)} #${ranked.leaderboardPosition}`
      : rankLabel(ranked.tier, ranked.division);
  const games = ranked.games || (ranked.wins + ranked.losses + ranked.draws);
  const winRate = ranked.winRate != null ? pct(ranked.winRate) : '—';
  const peakLine = ranked.peakRating != null && ranked.peakTier
    ? `${rankLabel(ranked.peakTier, ranked.peakDivision)} · ${ranked.peakRating} IR`
    : '—';
  // Leaderboard link — shows when the player has a leaderboard position
  const leaderboardLink = !ranked.isPlacement && ranked.leaderboardPosition
    ? `<a href="#/leaderboard" class="profile-leaderboard-link" data-testid="profile-leaderboard-link">View on Leaderboard →</a>`
    : '';

  return `<section class="panel" style="margin-bottom:16px" data-testid="profile-ranked-detail"><div class="panel-body">
    <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
      ${renderRankGlyph({ tier: ranked.tier, division: ranked.division, size: 128, showDivision: true, decorative: false,
        leaderboardPosition: ranked.isApex && ranked.leaderboardPosition ? `#${ranked.leaderboardPosition}` : null })}
      <div>
        <h3 style="margin:0;font-size:24px;color:var(--text,#e0f0ff)" data-testid="profile-ranked-tier">${esc(rankLine)}</h3>
        <div style="color:var(--text-dim);margin:4px 0">${ranked.rating} IR</div>
        ${ranked.leaderboardPosition ? `<div style="color:var(--accent,#00c8dc)">Season Rank #${ranked.leaderboardPosition}</div>` : ''}
        ${leaderboardLink}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
      <div><span style="font-size:20px;color:var(--accent,#00c8dc)">${ranked.wins}</span><br><small style="color:var(--text-dim)">Wins</small></div>
      <div><span style="font-size:20px;color:var(--danger,#e55)">${ranked.losses}</span><br><small style="color:var(--text-dim)">Losses</small></div>
      <div><span style="font-size:20px;color:var(--text-dim)">${ranked.draws}</span><br><small style="color:var(--text-dim)">Draws</small></div>
      <div><span style="font-size:20px;color:var(--text,#e0f0ff)">${winRate}</span><br><small style="color:var(--text-dim)">Win Rate</small></div>
      <div><span style="font-size:20px;color:var(--text,#e0f0ff)">${games}</span><br><small style="color:var(--text-dim)">Games</small></div>
      <div><span style="font-size:16px;color:var(--text,#e0f0ff)">${esc(peakLine)}</span><br><small style="color:var(--text-dim)">Season Peak</small></div>
    </div>
  </div></section>`;
}

function renderRatingHistoryChart(history) {
  const values = history.map(h => h.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 100;
  const height = 30;
  const pointData = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return { x, y, v, i };
  });
  const points = pointData.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  // Interactive hover circles with native <title> tooltips.
  // Uses nearly-invisible hit areas that brighten on hover via CSS.
  // No JS wiring needed — works with tab cache.
  const hoverDots = pointData.map(p => {
    const matchNum = p.i + 1;
    const tooltipText = `Match ${matchNum}: ${p.v} IR`;
    return `<circle class="rating-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.5" fill="var(--accent,#00c8dc)" vector-effect="non-scaling-stroke"><title>${esc(tooltipText)}</title></circle>`;
  }).join('');

  return `<section class="panel" style="margin-bottom:16px" data-testid="profile-rating-chart"><div class="panel-body">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Rating History</h3>
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:80px;display:block" aria-label="Rating over time chart" role="img">
      <style>.rating-dot{opacity:0;cursor:pointer}.rating-dot:hover{opacity:1}</style>
      <polyline points="${points}" fill="none" stroke="var(--accent,#00c8dc)" stroke-width="0.5" vector-effect="non-scaling-stroke" />
      ${hoverDots}
    </svg>
    <div style="display:flex;justify-content:space-between;margin-top:4px"><small class="mono">${min}</small><small class="mono">${max}</small></div>
    <small style="color:var(--text-dim)">${history.length} rated matches tracked · hover the line for per-match ratings</small>
  </div></section>`;
}

function renderSeasonHistoryFull(seasons) {
  const items = seasons.map(s => {
    const finalLabel = rankLabel(s.finalTier, s.finalDivision);
    const peakLabel = rankLabel(s.peakTier, s.peakDivision);
    return `<div style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.05)" data-testid="profile-season-${esc(s.seasonId)}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="color:var(--text,#e0f0ff)">${esc(s.name)}</strong>
        <span style="color:var(--text-dim);font-size:12px">${esc(s.status)}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;font-size:13px">
        <div><small style="color:var(--text-dim)">Final:</small><br>${esc(finalLabel)} · ${s.finalRating} IR</div>
        <div><small style="color:var(--text-dim)">Peak:</small><br>${esc(peakLabel)} · ${s.peakRating} IR</div>
        <div><small style="color:var(--text-dim)">Record:</small><br>${s.wins}–${s.losses}${s.draws ? `–${s.draws}` : ''}</div>
        ${s.finalPosition ? `<div><small style="color:var(--text-dim)">Position:</small><br>#${s.finalPosition}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<section class="panel" style="margin-bottom:16px" data-testid="profile-season-history-full"><div class="panel-body">
    <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Season History</h3>
    ${items}
    <a href="#/seasons" class="profile-leaderboard-link" data-testid="profile-season-archive-link" style="margin-top:12px">View All Seasons →</a>
  </div></section>`;
}

// ═══════════════════════════════════════════════════════════════
// ACHIEVEMENTS TAB
// ═══════════════════════════════════════════════════════════════

function renderAchievementsTab(profile, isSelf) {
  const achievements = profile.achievements;
  if (!achievements) {
    return `<div data-testid="profile-achievements-private" style="text-align:center;padding:40px 20px">
      <h3 style="color:var(--text-dim);text-transform:uppercase;letter-spacing:2px">Achievements</h3>
      <p style="color:var(--text-dim);margin:12px 0;font-style:italic">Private</p>
    </div>`;
  }
  if (achievements.earnedCount === 0) {
    return `<div data-testid="profile-achievements-empty" style="text-align:center;padding:40px 20px">
      <h3 style="color:var(--text-dim);text-transform:uppercase;letter-spacing:2px">No achievements earned yet.</h3>
      ${isSelf ? '<p style="color:var(--text-dim);margin:12px 0">Play Intrilex to begin your collection.</p>' : ''}
      <p style="margin:12px 0"><a href="#/achievements" style="color:var(--accent,#00c8dc)">Browse all achievements →</a></p>
    </div>`;
  }
  const apPct = achievements.maxAp > 0 ? pct((achievements.achievementPoints ?? 0) / achievements.maxAp) : '0%';
  const showcase = (profile.showcase ?? []).filter(s => s.type === ShowcaseItemType.ACHIEVEMENT);

  return `<div class="profile-achievements-tab" data-testid="profile-achievements-tab">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:16px">
      <div class="stat-card"><span class="stat-value" style="font-size:1.8em">${achievements.earnedCount ?? 0}/${achievements.totalCount ?? 56}</span><span class="stat-label">Unlocked</span></div>
      <div class="stat-card"><span class="stat-value" style="font-size:1.8em;color:var(--accent,#00c8dc)">${achievements.achievementPoints ?? 0}</span><span class="stat-label">AP (${apPct} of ${achievements.maxAp ?? 1320})</span></div>
    </div>
    ${showcase.length > 0 ? `<section class="panel" style="margin-bottom:16px"><div class="panel-body">
      <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Featured</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
        ${showcase.map(s => renderShowcaseSlot(s)).join('')}
      </div>
    </div></section>` : ''}
    <p style="text-align:center"><a href="#/achievements" style="color:var(--accent,#00c8dc)">View full achievement browser →</a></p>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// MATCHES TAB
// ═══════════════════════════════════════════════════════════════

function renderMatchesTab(profile, isSelf) {
  const matches = profile.recentMatches;
  if (!matches) {
    return `<div data-testid="profile-matches-private" style="text-align:center;padding:40px 20px">
      <h3 style="color:var(--text-dim);text-transform:uppercase;letter-spacing:2px">Match History</h3>
      <p style="color:var(--text-dim);margin:12px 0;font-style:italic">Private</p>
    </div>`;
  }
  if (matches.length === 0) {
    return `<div data-testid="profile-matches-empty" style="text-align:center;padding:40px 20px">
      <h3 style="color:var(--text-dim);text-transform:uppercase;letter-spacing:2px">No Matches Yet</h3>
      ${isSelf ? '<p style="color:var(--text-dim);margin:12px 0">Play Ranked matches to build your history.</p>' : ''}
    </div>`;
  }
  const items = matches.map(m => renderMatchItem(m, isSelf)).join('');
  return `<div class="profile-matches-tab" data-testid="profile-matches-tab">
    <section class="panel"><div class="panel-body">
      <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">Match History</h3>
      <div style="display:flex;flex-direction:column;gap:8px">${items}</div>
    </div></section>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// HERO ACTIONS (Edit / Customize / Privacy)
// ═══════════════════════════════════════════════════════════════

/**
 * Open a modal overlay with proper a11y: focus trap, Escape to close,
 * and focus restoration to the triggering element on close.
 *
 * @param {{ ariaLabel: string, content: string, onMount: (overlay: HTMLDivElement) => void, onClose: () => void }} opts
 * @param {HTMLElement} triggerEl - Element that opened the modal (for focus restoration)
 */
function openModal(opts, triggerEl) {
  const previouslyFocused = triggerEl ?? document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'profile-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', opts.ariaLabel);
  overlay.innerHTML = opts.content;
  document.body.appendChild(overlay);

  // Focus trap: keep Tab/Shift+Tab within the modal
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const trapKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = overlay.querySelectorAll(focusableSelector);
    if (focusable.length === 0) return;
    const first = /** @type {HTMLElement} */ (focusable[0]);
    const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  overlay.addEventListener('keydown', trapKey);

  function closeModal() {
    overlay.removeEventListener('keydown', trapKey);
    overlay.remove();
    // Restore focus to the triggering element
    if (previouslyFocused && /** @type {HTMLElement} */ (previouslyFocused).focus) {
      /** @type {HTMLElement} */ (previouslyFocused).focus();
    }
    opts.onClose();
  }

  // Expose closeModal on the overlay so mounted content can close it
  /** @type {any} */ (overlay)._closeModal = closeModal;

  // Focus first focusable element in the modal
  const firstFocusable = overlay.querySelector(focusableSelector);
  if (firstFocusable) /** @type {HTMLElement} */ (firstFocusable).focus();

  opts.onMount(overlay);
}

/**
 * Set a submit button to a loading state and return a function to restore it.
 * Prevents double-submission during async operations.
 * @param {HTMLButtonElement} btn
 * @returns {() => void} restore function
 */
function setButtonLoading(btn) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  btn.style.opacity = '0.6';
  return () => {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = '';
  };
}

function wireHeroActions(profile) {
  const editBtn = _container.querySelector('[data-action="edit"]');
  const customizeBtn = _container.querySelector('[data-action="customize"]');
  const privacyBtn = _container.querySelector('[data-action="privacy"]');
  const matchesLink = _container.querySelector('[data-action="goto-matches"]');

  if (editBtn) editBtn.addEventListener('click', () => { _ws.editMode = true; renderEditPanel(profile, editBtn); });
  if (customizeBtn) customizeBtn.addEventListener('click', () => { _ws.customizeMode = true; renderCustomizePanel(profile, customizeBtn); });
  if (privacyBtn) privacyBtn.addEventListener('click', () => { _ws.privacyMode = true; renderPrivacyPanel(profile, privacyBtn); });
  if (matchesLink) matchesLink.addEventListener('click', () => { _ws.tab = 'matches'; renderCurrent(); });
  wireMatchReplayButtons();
  wireMatchBranchButtons();
  wireMatchLessonButtons();
}

/**
 * Bind replay download buttons on match items. Fetches the certified replay
 * from local IndexedDB (saved during the terminal screen) and triggers a file
 * download. If the replay wasn't saved locally, shows an inline message.
 */
function wireMatchReplayButtons() {
  const btns = _container.querySelectorAll('[data-action="download-match-replay"]');
  btns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = btn.getAttribute('data-match-id');
      if (!matchId) return;
      const replayId = `R-${matchId}`;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Loading…';
      btn.style.opacity = '0.6';
      try {
        const record = await getReplay(replayId);
        if (!record || !record.certifiedReplay) {
          btn.textContent = 'Not saved';
          btn.style.color = 'var(--text-dim)';
          btn.title = 'Replay was not saved locally. Download replays from the match terminal immediately after each game.';
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
            btn.style.opacity = '';
            btn.style.color = '';
            btn.title = 'Download certified replay';
          }, 3000);
          return;
        }
        downloadReplay(record, 'private');
        btn.textContent = 'Downloaded ✓';
        btn.style.color = 'var(--accent,#00c8dc)';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalText;
          btn.style.opacity = '';
          btn.style.color = '';
        }, 2000);
      } catch (err) {
        btn.textContent = 'Error';
        btn.style.color = 'var(--danger,#e55)';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalText;
          btn.style.opacity = '';
          btn.style.color = '';
        }, 3000);
      }
    });
  });
}

/**
 * Epoch 7: Bind branch buttons on match items. Loads the replay from
 * local IndexedDB, validates it with the replay-branching domain module,
 * and navigates to /branches with the player replay context.
 */
function wireMatchBranchButtons() {
  const btns = _container.querySelectorAll('[data-action="branch-match-replay"]');
  btns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = btn.getAttribute('data-match-id');
      if (!matchId) return;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const replayId = `R-${matchId}`;
        const record = await getReplay(replayId);
        if (!record || !record.certifiedReplay) {
          btn.textContent = 'No replay';
          btn.style.color = 'var(--text-dim)';
          btn.title = 'Replay was not saved locally. Download replays from the match terminal immediately after each game.';
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
            btn.style.color = '';
          }, 3000);
          return;
        }
        // Import the replay-branching domain module
        const { buildReplayBranchSummary } = await import('@intrilex/account-domain/replay-branching');
        const replay = record.certifiedReplay;
        const summary = buildReplayBranchSummary({
          replayId,
          contentHash: replay.contentHash ?? record.contentHash ?? '',
          commands: replay.commands ?? [],
        });
        if (!summary.supported) {
          btn.textContent = 'Unsupported';
          btn.style.color = 'var(--text-dim)';
          btn.title = `Replay branching not supported: ${summary.unsupportedReason}`;
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
            btn.style.color = '';
          }, 3000);
          return;
        }
        // Store the branch context and navigate to /branches
        if (!state.branchContext) state.branchContext = {};
        state.branchContext.playerReplay = {
          replayId,
          matchId,
          contentHash: summary.contentHash,
          commands: replay.commands,
          checkpoints: summary.checkpoints,
          source: 'player',
        };
        // Navigate to /branches
        location.hash = '#/branches';
      } catch {
        btn.textContent = 'Error';
        btn.style.color = 'var(--danger,#e55)';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalText;
          btn.style.color = '';
        }, 3000);
      }
    });
  });
}

/**
 * L6: Bind replay lesson buttons on match items. Loads the replay from
 * local IndexedDB, generates a guided lesson, and displays it in a modal.
 */
function wireMatchLessonButtons() {
  const btns = _container.querySelectorAll('[data-action="view-replay-lesson"]');
  btns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = btn.getAttribute('data-match-id');
      if (!matchId) return;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const replayId = `R-${matchId}`;
        const record = await getReplay(replayId);
        if (!record || !record.replay) {
          btn.textContent = 'No replay';
          btn.style.color = 'var(--text-dim)';
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
            btn.style.color = '';
          }, 3000);
          return;
        }
        const replay = record.replay;
        const steps = generateReplayLesson(replay);
        if (steps.length === 0) {
          btn.textContent = 'Unavailable';
          btn.style.color = 'var(--text-dim)';
          btn.title = 'This replay cannot be converted to a lesson. It may be from an older version or lack command data.';
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
            btn.style.color = '';
          }, 3000);
          return;
        }
        const summary = getLessonSummary(steps);
        const stepsHtml = steps.map(renderLessonStep).join('');
        const overlay = document.createElement('div');
        overlay.className = 'profile-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000';
        overlay.innerHTML = `<div style="background:var(--bg,#0d1117);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;max-width:640px;width:90%;max-height:80vh;overflow-y:auto;padding:24px" data-testid="replay-lesson-modal">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;font-size:18px;color:var(--text,#e0f0ff)">Replay Lesson — ${esc(matchId)}</h3>
            <button class="btn btn-sm" data-action="close-lesson-modal" style="color:var(--text-dim)">✕</button>
          </div>
          <p style="margin:0 0 16px;color:var(--text-dim);font-size:13px">${summary.commentedSteps} commented steps across ${summary.mechanics.length} mechanics</p>
          <div style="display:flex;flex-direction:column;gap:8px">${stepsHtml}</div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('[data-action="close-lesson-modal"]')?.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        btn.disabled = false;
        btn.textContent = originalText;
      } catch {
        btn.textContent = 'Error';
        btn.style.color = 'var(--danger,#e55)';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalText;
          btn.style.color = '';
        }, 3000);
      }
    });
  });
}

// ── Edit Profile panel ──────────────────────────────────────────

function renderEditPanel(profile, triggerEl) {
  const id = profile.identity;
  const content = `<div class="profile-modal" style="background:var(--bg,#0d1117);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;max-width:480px;width:100%;padding:24px" data-testid="profile-edit-modal">
    <h3 style="margin:0 0 16px;font-size:18px;color:var(--text,#e0f0ff)">Edit Profile</h3>
    <form id="profile-edit-form" style="display:flex;flex-direction:column;gap:16px">
      <label style="display:flex;flex-direction:column;gap:4px">
        <span style="color:var(--text-dim);font-size:13px">Display Name</span>
        <input type="text" id="edit-display-name" value="${esc(id.displayName)}" maxlength="32" required
          style="padding:8px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:14px"
          aria-label="Display name" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px">
        <span style="color:var(--text-dim);font-size:13px">Handle (3-24 chars, letters/numbers/underscore)</span>
        <input type="text" id="edit-handle" value="${esc(id.handle ?? '')}" maxlength="24" pattern="[a-zA-Z0-9_]+"
          style="padding:8px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:14px"
          aria-label="Handle" />
      </label>
      <div id="profile-edit-error" role="alert" aria-live="polite" style="color:var(--danger,#e55);font-size:13px;min-height:18px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-sm" data-action="cancel-edit">Cancel</button>
        <button type="submit" class="btn btn-sm" data-action="save-edit" style="background:var(--accent,#00c8dc);color:var(--bg)">Save</button>
      </div>
    </form>
  </div>`;

  openModal({
    ariaLabel: 'Edit Profile',
    content,
    onClose: () => { _ws.editMode = false; },
    onMount: (overlay) => {
      overlay.querySelector('[data-action="cancel-edit"]').addEventListener('click', () => {
        /** @type {any} */ (overlay)._closeModal();
      });
      overlay.querySelector('#profile-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = /** @type {HTMLInputElement} */ (overlay.querySelector('#edit-display-name')).value.trim();
        const handle = /** @type {HTMLInputElement} */ (overlay.querySelector('#edit-handle')).value.trim();
        const errEl = /** @type {HTMLElement} */ (overlay.querySelector('#profile-edit-error'));
        errEl.textContent = '';

        const saveBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-action="save-edit"]'));
        const restoreBtn = setButtonLoading(saveBtn);

        if (name && name !== id.displayName) {
          const r = await updateDisplayName(name);
          if (!r.ok) { restoreBtn(); errEl.textContent = r.error ?? 'Failed to update display name'; return; }
        }
        if (handle && handle !== (id.handle ?? '')) {
          const r = await changeHandle(handle);
          if (!r.ok) { restoreBtn(); errEl.textContent = r.error ?? 'Failed to change handle'; return; }
        }
        /** @type {any} */ (overlay)._closeModal();
        // Reload profile
        invalidateTabCache();
        _ws.selfProfile = null;
        await loadProfileData();
        renderCurrent();
      });
    },
  }, triggerEl);
}

// ── Customize panel ─────────────────────────────────────────────

function renderCustomizePanel(profile, triggerEl) {
  const id = profile.identity;
  const loadout = id.loadout ?? {};
  const ownedCosmetics = profile.ownedCosmetics ?? { titles: [], frames: [], cardBacks: [], badges: [] };

  const content = `<div class="profile-modal" style="background:var(--bg,#0d1117);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;max-width:640px;width:100%;padding:24px;max-height:80vh;overflow:auto" data-testid="profile-customize-modal">
    <h3 style="margin:0 0 16px;font-size:18px;color:var(--text,#e0f0ff)">Customize</h3>
    <div style="display:flex;flex-direction:column;gap:20px">
      ${renderCustomizeSection('Title', 'title', ownedCosmetics.titles, loadout.titleId ?? 'none', 'name', 'id')}
      ${renderCustomizeSection('Profile Frame', 'frame', ownedCosmetics.frames, loadout.profileFrameId ?? 'none', 'name', 'id')}
      ${renderCustomizeSection('Card Back', 'cardback', ownedCosmetics.cardBacks, loadout.cardBackId ?? 'default', 'name', 'id')}
    </div>
    <div id="profile-customize-error" role="alert" aria-live="polite" style="color:var(--danger,#e55);font-size:13px;min-height:18px;margin-top:16px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button type="button" class="btn btn-sm" data-action="cancel-customize">Close</button>
    </div>
  </div>`;

  openModal({
    ariaLabel: 'Customize Profile',
    content,
    onClose: () => { _ws.customizeMode = false; },
    onMount: (overlay) => {
      overlay.querySelector('[data-action="cancel-customize"]').addEventListener('click', () => {
        /** @type {any} */ (overlay)._closeModal();
      });
      // Wire equip buttons
      overlay.querySelectorAll('[data-equip]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const equip = btn.dataset.equip;
          const itemId = btn.dataset.itemId;
          const errEl = /** @type {HTMLElement} */ (overlay.querySelector('#profile-customize-error'));
          errEl.textContent = '';
          const restoreBtn = setButtonLoading(/** @type {HTMLButtonElement} */ (btn));
          /** @type {Promise<{ok: boolean, error?: string}>} */
          let result;
          if (equip === 'title') result = await equipTitle(itemId);
          else if (equip === 'frame') result = await equipProfileFrame(itemId);
          else if (equip === 'cardback') result = await equipCardBack(itemId);
          else { restoreBtn(); return; }
          if (!result.ok) {
            restoreBtn();
            errEl.textContent = result.error ?? 'Failed to equip';
            return;
          }
          /** @type {any} */ (overlay)._closeModal();
          invalidateTabCache();
          _ws.selfProfile = null;
          await loadProfileData();
          renderCurrent();
        });
      });
    },
  }, triggerEl);
}

function renderCustomizeSection(label, kind, items, equippedId, nameField, idField) {
  const cards = items.map(item => {
    const equipped = item[idField] === equippedId;
    const owned = true; // items list is already filtered to owned
    const hiddenHint = item.hidden && !owned ? ' (Secret Unlock)' : '';
    return `<div style="padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="color:var(--text,#e0f0ff)">${esc(item[nameField])}${esc(hiddenHint)}</div>
        <small style="color:var(--text-dim)">${esc(item.description ?? '')}</small>
      </div>
      ${equipped
        ? '<span style="color:var(--accent,#00c8dc);font-size:12px">Equipped</span>'
        : `<button class="btn btn-sm" data-equip="${kind}" data-item-id="${esc(item[idField])}">Equip</button>`}
    </div>`;
  }).join('');
  // Show a hint when only defaults are owned (no achievement-gated cosmetics)
  const hasEarned = items.some(i => i.achievementId != null);
  const hint = hasEarned ? '' : `<small style="color:var(--text-dim);display:block;margin-top:6px;font-style:italic">Earn achievements to unlock more ${esc(label.toLowerCase())}.</small>`;
  return `<div>
    <h4 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim)">${esc(label)}</h4>
    <div style="display:flex;flex-direction:column;gap:6px">${cards}</div>
    ${hint}
  </div>`;
}

// ── Privacy panel ───────────────────────────────────────────────

function renderPrivacyPanel(profile, triggerEl) {
  const privacy = profile.privacy ?? DEFAULT_PRIVACY;
  const directoryVisible = profile.directoryVisible === true;
  const content = `<div class="profile-modal" style="background:var(--bg,#0d1117);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;max-width:480px;width:100%;padding:24px" data-testid="profile-privacy-modal">
    <h3 style="margin:0 0 16px;font-size:18px;color:var(--text,#e0f0ff)">Privacy Settings</h3>
    <form id="profile-privacy-form" style="display:flex;flex-direction:column;gap:16px">
      ${renderPrivacyToggle('Match History', 'matchHistory', privacy.matchHistory, 'Show your match history publicly')}
      ${renderPrivacyToggle('Achievements', 'achievements', privacy.achievements, 'Show your achievement list publicly')}
      ${renderPrivacyToggle('Online Status', 'onlineStatus', privacy.onlineStatus, 'Show when you are online')}
      ${renderPrivacyToggle('Local Stats', 'localStats', privacy.localStats, 'Show local AI practice statistics')}
      <div style="border-top:1px solid var(--border,rgba(255,255,255,0.1));padding-top:16px;margin-top:4px">
        <label style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <div style="color:var(--text,#e0f0ff);font-size:14px">Player Directory</div>
            <small style="color:var(--text-dim)">Let other players find and view your profile in the Player Directory.</small>
          </div>
          <input type="checkbox" id="privacy-directory-visible" ${directoryVisible ? 'checked' : ''}
            aria-label="Show my profile in the Player Directory"
            data-testid="privacy-directory-visible" style="width:18px;height:18px;accent-color:var(--accent,#00c8dc);cursor:pointer" />
        </label>
      </div>
      <div id="profile-privacy-error" role="alert" aria-live="polite" style="color:var(--danger,#e55);font-size:13px;min-height:18px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-sm" data-action="cancel-privacy">Cancel</button>
        <button type="submit" class="btn btn-sm" data-action="save-privacy" style="background:var(--accent,#00c8dc);color:var(--bg)">Save</button>
      </div>
    </form>
  </div>`;

  openModal({
    ariaLabel: 'Privacy Settings',
    content,
    onClose: () => { _ws.privacyMode = false; },
    onMount: (overlay) => {
      overlay.querySelector('[data-action="cancel-privacy"]').addEventListener('click', () => {
        /** @type {any} */ (overlay)._closeModal();
      });
      overlay.querySelector('#profile-privacy-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const get = (/** @type {string} */ k) => {
          const select = overlay.querySelector(`#privacy-${k}`);
          return select ? select.value : 'PRIVATE';
        };
        const settings = {
          matchHistory: get('matchHistory'),
          achievements: get('achievements'),
          onlineStatus: get('onlineStatus'),
          localStats: get('localStats'),
        };
        const dirCheckbox = /** @type {HTMLInputElement|null} */ (overlay.querySelector('#privacy-directory-visible'));
        const wantDirectory = dirCheckbox ? dirCheckbox.checked : false;
        const errEl = /** @type {HTMLElement} */ (overlay.querySelector('#profile-privacy-error'));
        errEl.textContent = '';
        const saveBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('[data-action="save-privacy"]'));
        const restoreBtn = setButtonLoading(saveBtn);
        const r = await updatePrivacy(settings);
        if (!r.ok) { restoreBtn(); errEl.textContent = r.error ?? 'Failed to save privacy settings'; return; }
        // Persist directory visibility separately so the four visibility
        // fields can never accidentally reset the directory flag.
        if (wantDirectory !== directoryVisible) {
          const dr = await setDirectoryVisible(wantDirectory);
          if (!dr.ok) { restoreBtn(); errEl.textContent = dr.error ?? 'Failed to update directory visibility'; return; }
        }
        /** @type {any} */ (overlay)._closeModal();
        invalidateTabCache();
        _ws.selfProfile = null;
        await loadProfileData();
        renderCurrent();
      });
    },
  }, triggerEl);
}

function renderPrivacyToggle(label, key, value, description) {
  const publicSel = value === Visibility.PUBLIC ? 'selected' : '';
  const privateSel = value === Visibility.PRIVATE ? 'selected' : '';
  return `<label style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
    <div>
      <div style="color:var(--text,#e0f0ff);font-size:14px">${esc(label)}</div>
      <small style="color:var(--text-dim)">${esc(description)}</small>
    </div>
    <select id="privacy-${key}" aria-label="${esc(label)}" style="padding:4px 8px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:4px;color:var(--text)">
      <option value="PUBLIC" ${publicSel}>Public</option>
      <option value="PRIVATE" ${privateSel}>Private</option>
    </select>
  </label>`;
}
