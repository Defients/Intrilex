// ═══════════════════════════════════════════════════════════════
// season-countdown.mjs — P11: Season end countdown + reward preview
//
// Pure functions that compute season countdown information and
// preview seasonal rewards from the existing cosmetic catalogs.
//
// Uses the season's endDate to compute days/hours remaining.
// Reward previews use the entitlement catalog system (titles,
// frames, card backs) that already exists in the profile domain.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SeasonCountdown
 * @property {boolean} active - Whether the season is currently active
 * @property {number} daysRemaining - Days until season ends (0 if ended)
 * @property {number} hoursRemaining - Hours remaining (sub-day)
 * @property {string} endDate - ISO date string
 * @property {string|null} countdownLabel - Human-readable countdown
 * @property {object|null} rewardPreview - Preview of seasonal rewards
 */

/**
 * Compute a season countdown from the current date and season end date.
 * @param {string|Date} endDate - When the season ends
 * @param {Date} [now] - Current date (defaults to new Date())
 * @returns {SeasonCountdown}
 */
export function computeSeasonCountdown(endDate, now = new Date()) {
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  if (isNaN(end.getTime())) {
    return {
      active: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      endDate: '',
      countdownLabel: null,
      rewardPreview: null,
    };
  }

  const msRemaining = end.getTime() - now.getTime();
  if (msRemaining <= 0) {
    return {
      active: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      endDate: end.toISOString(),
      countdownLabel: 'Season ended',
      rewardPreview: null,
    };
  }

  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  let countdownLabel;
  if (daysRemaining > 0) {
    countdownLabel = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
  } else if (hoursRemaining > 0) {
    countdownLabel = `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''} remaining`;
  } else {
    countdownLabel = 'Ending soon';
  }

  return {
    active: true,
    daysRemaining,
    hoursRemaining,
    endDate: end.toISOString(),
    countdownLabel,
    rewardPreview: getSeasonRewardPreview(daysRemaining),
  };
}

/**
 * Get a preview of seasonal rewards based on the time remaining.
 * Rewards are cosmetic titles, frames, and card backs from the
 * existing entitlement catalogs.
 * @param {number} daysRemaining
 * @returns {object|null}
 */
function getSeasonRewardPreview(daysRemaining) {
  // Reward tiers based on season participation
  const rewards = {
    titles: [
      { id: 'season-participant', name: 'Season Participant', description: 'Played during the season' },
      { id: 'season-top-100', name: 'Top 100', description: 'Finished in the top 100' },
      { id: 'season-champion', name: 'Season Champion', description: 'Finished #1 on the ladder' },
    ],
    frames: [
      { id: 'season-frame-bronze', name: 'Bronze Frame', description: 'Reached Bronze tier or higher' },
      { id: 'season-frame-silver', name: 'Silver Frame', description: 'Reached Silver tier or higher' },
      { id: 'season-frame-gold', name: 'Gold Frame', description: 'Reached Gold tier or higher' },
    ],
    cardBacks: [
      { id: 'season-cardback', name: 'Seasonal Card Back', description: 'Exclusive to this season' },
    ],
  };

  return {
    titles: rewards.titles,
    frames: rewards.frames,
    cardBacks: rewards.cardBacks,
    note: 'Rewards are awarded at season end based on final rank.',
  };
}

/**
 * Render a season countdown as HTML.
 * @param {SeasonCountdown} countdown
 * @returns {string}
 */
export function renderSeasonCountdown(countdown) {
  if (!countdown || !countdown.active) return '';
  const rewards = countdown.rewardPreview;
  const rewardHtml = rewards
    ? `<div class="season-rewards-preview" data-testid="season-rewards-preview">
        <h4>Season Rewards</h4>
        <p class="season-rewards-note">${rewards.note}</p>
        <div class="season-rewards-titles">
          ${rewards.titles.map(t => `<span class="season-reward-item" data-testid="season-reward-title">${t.name}</span>`).join('')}
        </div>
      </div>`
    : '';
  return `<div class="season-countdown" data-testid="season-countdown">
    <span class="season-countdown-label" data-testid="season-countdown-label">${countdown.countdownLabel}</span>
    ${rewardHtml}
  </div>`;
}
