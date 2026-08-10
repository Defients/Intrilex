// ═══════════════════════════════════════════════════════════════
// ai-personality.js — HYBIX archetype personality data and banter
// Provides descriptions, play style traits, and contextual banter
// messages for each AI archetype.
// ═══════════════════════════════════════════════════════════════

/**
 * Personality data for each HYBIX archetype.
 * Used by the new match setup screen and the opponent band.
 */
export const ARCHETYPE_PERSONALITIES = Object.freeze({
  rusher: {
    description: 'Aggressive tempo player that scores early and often, sacrificing defense for speed.',
    playStyle: 'Aggressive tempo — scores early, sacrifices defense',
    traits: ['aggressive', 'fast', 'risk-taking'],
  },
  defender: {
    description: 'Reactive strategist that counters opponent plays and builds late-game advantage.',
    playStyle: 'Reactive — counters opponent plays, builds late-game advantage',
    traits: ['reactive', 'patient', 'counter-focused'],
  },
  trickster: {
    description: 'Misdirection specialist that manipulates the swap bar and leverages effect-heavy plays.',
    playStyle: 'Misdirection — swap bar manipulation, effect-heavy',
    traits: ['cunning', 'unpredictable', 'effect-focused'],
  },
  sniper: {
    description: 'Precision remover that targets key cards and maximizes resource efficiency.',
    playStyle: 'Precision — targets key cards, resource-efficient',
    traits: ['precise', 'efficient', 'targeting'],
  },
  support: {
    description: 'Utility-focused controller that manipulates the stack and protects own cards.',
    playStyle: 'Utility — stack manipulation, protects own cards',
    traits: ['supportive', 'protective', 'stack-focused'],
  },
  tank: {
    description: 'Endurance grinder that relies on high-defense plays and grinds out value over long games.',
    playStyle: 'Endurance — high-defense, grinds out value over long games',
    traits: ['defensive', 'endurance', 'grinding'],
  },
  baseline: {
    description: 'Balanced generalist that adapts to the game state without a strong preference.',
    playStyle: 'Balanced — adapts to game state',
    traits: ['balanced', 'adaptive'],
  },
});

/**
 * Get personality data for an archetype.
 * @param {string} archetype - The archetype name (rusher, defender, etc.)
 * @returns {object} { description, playStyle, traits }
 */
export function getArchetypePersonality(archetype) {
  return ARCHETYPE_PERSONALITIES[archetype] ?? ARCHETYPE_PERSONALITIES.baseline;
}

/**
 * Banter message pools by archetype and event trigger.
 * Each pool is an array of personality-flavored messages.
 */
const BANTER_POOLS = {
  rusher: {
    score: ['Speed is everything!', 'Too slow to stop me.', 'Points on the board!', 'Catch me if you can!', 'First strike advantage!', 'No time to react!'],
    counter: ['Ha, nice try!', 'Not fast enough.', 'I saw that coming.', 'Too slow!', 'Predictable trajectory.'],
    super: ['Full throttle!', 'No holding back!', 'Overwhelming force!', 'Maximum velocity!', 'No brakes!'],
    win: ['Speed wins every time!', 'Was there ever any doubt?', 'GG — too fast for you.', 'Victory at maximum speed!', 'You couldn\'t keep up.'],
    loss: ['Impossible... I was faster!', 'Next time I\'ll be even quicker.', 'You got lucky — speed doesn\'t lie.', 'I underestimated your tempo.'],
    'early-game': ['Let\'s set the pace early.', 'First blood matters.', 'I\'m coming out swinging!'],
    'mid-game': ['The pressure is building.', 'Can you feel the tempo shifting?', 'Full acceleration mode.'],
    'late-game': ['Final push!', 'No time left to recover!', 'Sprinting to the finish!'],
    'close-game': ['Every point counts now!', 'Don\'t blink!', 'This is where speed decides everything.'],
    dominating: ['The gap is widening!', 'You can\'t close this distance!', 'Speed gap is insurmountable!'],
    comeback: ['I let you get ahead — mistake corrected!', 'Thought you had me? Think again!', 'The rush isn\'t over yet!'],
  },
  defender: {
    score: ['Patiently building.', 'Every point is fortified.', 'Slow and steady.', 'A foundation of stone.', 'Methodical progress.'],
    counter: ['Not so fast.', 'I expected that.', 'Predictable.', 'Blocked and logged.', 'Your aggression is noted.'],
    super: ['The walls rise up!', 'Fortress activated.', 'Defense becomes offense.', 'The bastion strikes!', 'Impenetrable!'],
    win: ['Patience always wins.', 'Your aggression was your undoing.', 'GG — well defended.', 'The fortress held.', 'Time was always on my side.'],
    loss: ['My defenses crumbled...', 'I\'ll rebuild stronger next time.', 'Even walls can fall.', 'I misjudged the siege.'],
    'early-game': ['Let them come. I\'ll be ready.', 'Building the foundation.', 'Patience is a weapon.'],
    'mid-game': ['The walls are thickening.', 'They\'re wearing themselves down.', 'Steady as she goes.'],
    'late-game': ['The endgame favors the prepared.', 'My fortress endures.', 'Time to close the gates.'],
    'close-game': ['One mistake and it\'s over for either of us.', 'The fortress is tested.', 'Nerve is everything now.'],
    dominating: ['The gap is insurmountable.', 'They cannot breach these walls.', 'This position is fortified.'],
    comeback: ['You thought you\'d broken through?', 'The walls rebuild!', 'Defense becomes offense — now!'],
  },
  trickster: {
    score: ['Did you see that coming?', 'Misdirection scores again!', 'While you were looking elsewhere...', 'Smoke and mirrors!', 'The hand is quicker than the eye.'],
    counter: ['Tricked you!', 'Wrong move!', 'Just as I planned.', 'You fell for it!', 'Classic misdirection.'],
    super: 'Now you see it, now you don\'t!',
    win: ['The trick was on you all along!', 'Misdirection wins!', 'GG — outsmarted.', 'You never saw it coming.', 'The illusion was perfect.'],
    loss: ['You saw through my tricks...', 'Clever. Very clever.', 'The mirror cracked.', 'Even illusions fail eventually.'],
    'early-game': ['Setting the stage...', 'Pay attention to the wrong hand.', 'The game begins.'],
    'mid-game': ['Which move is real?', 'You\'re second-guessing now, aren\'t you?', 'The web is spinning.'],
    'late-game': ['The final trick awaits.', 'You think you know what\'s coming?', 'One last illusion.'],
    'close-game': ['One wrong read decides it all.', 'Can you spot the real threat?', 'The sleight is ready.'],
    dominating: ['You\'re chasing shadows!', 'Every move is a mirage!', 'You can\'t trust what you see.'],
    comeback: ['The trick was just a setup!', 'You let your guard down!', 'The real illusion was the comeback!'],
  },
  sniper: {
    score: ['Precision strike!', 'Right on target.', 'Calculated and executed.', 'Surgical.', 'Bullseye.'],
    counter: ['Eliminated.', 'Target neutralized.', 'Clean removal.', 'Threat assessed and removed.', 'Efficient.'],
    super: ['One shot, one kill.', 'Perfect precision!', 'Bullseye!', 'Lethal accuracy!'],
    win: ['Precision beats brute force.', 'Every shot counted.', 'GG — clean victory.', 'Calculated victory.', 'No wasted moves.'],
    loss: ['My aim was off...', 'I\'ll recalibrate next time.', 'You dodged the critical shot.', 'Miscalculated.'],
    'early-game': ['Assessing the field.', 'Identifying priority targets.', 'Patience before the shot.'],
    'mid-game': ['The target is in sight.', 'Range calculated.', 'Steady aim.'],
    'late-game': ['The final shot is loaded.', 'One clean hit wins this.', 'No room for error.'],
    'close-game': ['One shot decides it all.', 'The target is clear.', 'Hold steady.'],
    dominating: ['The range is mine.', 'Every target eliminated.', 'You can\'t hide from precision.'],
    comeback: ['I was just adjusting my scope.', 'The real target was the comeback!', 'You walked right into the crosshairs!'],
  },
  support: {
    score: ['Teamwork makes the dream work.', 'Supported into position.', 'Steady progress.', 'Every piece contributes.', 'Coordinated advance.'],
    counter: ['Protected!', 'Shielded from harm.', 'Not on my watch.', 'Defense in depth.', 'Covered.'],
    super: ['Full support deployed!', 'The stack is mine!', 'Reinforcements!', 'Maximum utility!'],
    win: ['Utility wins the day!', 'Every piece in its place.', 'GG — well supported.', 'The foundation held.', 'Coordinated victory.'],
    loss: ['My support wasn\'t enough...', 'I\'ll adapt my strategy.', 'The formation broke.', 'I needed more coverage.'],
    'early-game': ['Setting up the network.', 'Establishing support lines.', 'Building the infrastructure.'],
    'mid-game': ['The network is strong.', 'Every connection matters.', 'Coordinated pressure.'],
    'late-game': ['Full deployment.', 'The support network is complete.', 'Every resource allocated.'],
    'close-game': ['One slip in support decides it.', 'The formation is tested.', 'Hold the line.'],
    dominating: ['The network is unbreakable.', 'Full coverage achieved.', 'You can\'t penetrate the support grid.'],
    comeback: ['The support was just repositioning!', 'Reinforcements arrived!', 'The network adapts and recovers!'],
  },
  tank: {
    score: ['Grinding forward.', 'One step at a time.', 'Unstoppable progress.', 'Slow but inevitable.', 'Each point is earned.'],
    counter: ['I absorb and endure.', 'You can\'t break through.', 'Armor holds.', 'Minimal damage.', 'Shrug it off.'],
    super: ['Unbreakable!', 'The fortress strikes!', 'Endurance pays off!', 'Maximum armor!'],
    win: ['Endurance always wins.', 'You ran out of steam.', 'GG — outlasted.', 'The grind paid off.', 'Persistence is power.'],
    loss: ['Even the tank falls...', 'I\'ll reinforce my defenses.', 'The armor cracked.', 'I needed more endurance.'],
    'early-game': ['Let them waste resources.', 'I\'m just getting started.', 'The armor is thickening.'],
    'mid-game': ['The grind is working.', 'They\'re running low.', 'Steady pressure.'],
    'late-game': ['Endurance decides this.', 'I can outlast anyone.', 'The final grind.'],
    'close-game': ['One breach and it\'s over.', 'The armor is holding — barely.', 'Nerve and endurance.'],
    dominating: ['The gap is too wide to close.', 'I\'ve outlasted everything.', 'Endurance is victory.'],
    comeback: ['You thought I was worn down?', 'The tank has reserves!', 'Armor repaired — advancing again!'],
  },
  baseline: {
    score: ['Good play.', 'Points secured.', 'Solid move.', 'Steady.', 'Effective.'],
    counter: ['Nice counter.', 'Good response.', 'Well played.', 'Noted.', 'Solid defense.'],
    super: ['Big move!', 'Going all in!', 'Time to shine!', 'Major play!'],
    win: ['GG!', 'Well played.', 'Good game.', 'Solid match.', 'Clean win.'],
    loss: ['GG!', 'Well played.', 'Better luck next time.', 'Good match.', 'I\'ll learn from this.'],
    'early-game': ['Let\'s see how this develops.', 'Standard opening.', 'Feeling out the board.'],
    'mid-game': 'The game is taking shape.',
    'late-game': 'Time to close this out.',
    'close-game': 'Every decision matters now.',
    dominating: 'The advantage is clear.',
    comeback: 'The game isn\'t over yet!',
  },
};

/**
 * Get a contextual AI banter message for a game event.
 * Supports context-aware variants: early-game, mid-game, late-game,
 * close-game, dominating, comeback.
 * @param {object} event - The game event { type, controllerId }
 * @param {string} archetype - The AI archetype name
 * @param {string} policyId - The AI policy ID (for fallback)
 * @param {object} context - Optional { gamePhase, scoreDiff, isComeback }
 * @returns {string|null} A banter message, or null if no message for this event
 */
export function getAiBanter(event, archetype, policyId, context = {}) {
  if (!event || !event.type) return null;
  const pool = BANTER_POOLS[archetype] ?? BANTER_POOLS.baseline;

  let trigger = null;
  const eventType = event.type.toLowerCase();

  if (eventType.includes('score') || eventType.includes('point')) {
    trigger = 'score';
  } else if (eventType.includes('counter') || eventType.includes('disrupt') || eventType.includes('interrupt')) {
    trigger = 'counter';
  } else if (eventType.includes('super') || eventType.includes('ultra')) {
    trigger = 'super';
  }

  if (!trigger) return null;

  // Check for context-aware variant first
  const phase = context.gamePhase;
  const scoreDiff = context.scoreDiff ?? 0;
  const isComeback = context.isComeback ?? false;

  if (isComeback && pool['comeback']) {
    const arr = Array.isArray(pool['comeback']) ? pool['comeback'] : [pool['comeback']];
    if (arr.length > 0) return arr[Math.floor(Math.random() * arr.length)];
  }

  if (scoreDiff >= 10 && pool['dominating']) {
    const arr = Array.isArray(pool['dominating']) ? pool['dominating'] : [pool['dominating']];
    if (arr.length > 0) return arr[Math.floor(Math.random() * arr.length)];
  }

  if (Math.abs(scoreDiff) <= 3 && scoreDiff !== 0 && pool['close-game']) {
    const arr = Array.isArray(pool['close-game']) ? pool['close-game'] : [pool['close-game']];
    if (arr.length > 0) return arr[Math.floor(Math.random() * arr.length)];
  }

  if (phase && pool[phase]) {
    const arr = Array.isArray(pool[phase]) ? pool[phase] : [pool[phase]];
    if (arr.length > 0) return arr[Math.floor(Math.random() * arr.length)];
  }

  const messages = pool[trigger];
  if (!messages) return null;
  const arr = Array.isArray(messages) ? messages : [messages];
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get a win/loss banter message for the terminal screen.
 * @param {string} archetype - The AI archetype name
 * @param {boolean} isAiWinner - Whether the AI won
 * @returns {string} A banter message
 */
export function getTerminalBanter(archetype, isAiWinner) {
  const pool = BANTER_POOLS[archetype] ?? BANTER_POOLS.baseline;
  const trigger = isAiWinner ? 'win' : 'loss';
  const messages = pool[trigger] ?? BANTER_POOLS.baseline[trigger];
  const arr = Array.isArray(messages) ? messages : [messages];
  return arr[Math.floor(Math.random() * arr.length)];
}
