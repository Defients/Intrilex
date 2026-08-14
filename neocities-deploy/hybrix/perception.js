/**
 * HYBRIX AI — Perception Layer
 *
 * Imperfect-by-design sensor system. Filters raw world state through
 * vision cones, range limits, occlusion, reaction delays, and noise.
 * Tags entities with probabilistic threat & opportunity scores.
 *
 * ASSUMPTIONS:
 * - Real-time action at ~60 FPS (tick-based)
 * - World state provides: entities with position, health, faction
 * - Geometry provides occlusion queries (or null if not available)
 * - For turn-based games, reaction delay is measured in turns, not ms
 */

import { DeterministicPolicyRng } from "./browser-policy-sdk.js?v=42162e3d88b3";

/**
 * Create a perception system for a single bot.
 * @param {string} botId - Unique bot identifier
 * @param {object} config - Perception config section
 * @param {number} seed - Deterministic seed for noise
 */
export function createPerception(botId, config, seed) {
  const rng = new DeterministicPolicyRng(seed);
  const stimulusQueue = [];
  const perceivedHistory = [];

  function perceive(worldState, botState, difficultyReactionMultiplier = 1.0) {
    const cfg = config;
    const tick = worldState.tick ?? 0;
    const rawEntities = worldState.entities ?? [];
    const bot = botState;
    const tickRateHz = cfg._tickRateHz ?? 60;

    const effectiveReactionDelay = cfg.reactionDelayMs * difficultyReactionMultiplier;
    const jitter = 1 + (rng.nextUint32() / 0xFFFFFFFF - 0.5) * 2 * cfg.reactionDelayJitter;
    const delayedRelease = tick + Math.ceil(effectiveReactionDelay * jitter / (1000 / tickRateHz));

    const visible = [];

    for (const entity of rawEntities) {
      if (entity.id === bot.id) continue;
      if (visible.length >= cfg.maxPerceivedEntities) break;

      const dx = (entity.position?.x ?? 0) - (bot.position?.x ?? 0);
      const dy = (entity.position?.y ?? 0) - (bot.position?.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy);

      const inVisionRange = dist <= cfg.visionRange;
      const inSoundRange = dist <= cfg.soundRange;

      if (!inVisionRange && !inSoundRange) continue;

      let sensedVia = null;
      let perceivedPos = { x: entity.position?.x ?? 0, y: entity.position?.y ?? 0 };

      if (inVisionRange) {
        const angleToEntity = Math.atan2(dy, dx);
        const facingAngle = bot.facing ?? 0;
        let angleDiff = Math.abs(angleToEntity - facingAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const coneRad = (cfg.visionConeAngleDeg * Math.PI) / 180;

        if (angleDiff <= coneRad / 2) {
          const occluded = worldState.geometry
            ? isOccluded(bot.position, entity.position, worldState.geometry)
            : false;

          if (occluded) {
            if (inSoundRange) {
              sensedVia = 'sound';
              perceivedPos = addNoise(entity.position, cfg.soundNoise, rng);
            } else {
              continue;
            }
          } else {
            sensedVia = 'vision';
          }
        } else if (inSoundRange) {
          sensedVia = 'sound';
          perceivedPos = addNoise(entity.position, cfg.soundNoise, rng);
        } else {
          continue;
        }
      } else if (inSoundRange) {
        sensedVia = 'sound';
        perceivedPos = addNoise(entity.position, cfg.soundNoise, rng);
      }

      if (!sensedVia) continue;

      if (cfg.fogOfWar && entity.hidden && sensedVia !== 'vision') {
        continue;
      }

      if (rng.nextUint32() / 0xFFFFFFFF < cfg.missChance) {
        continue;
      }

      const perceivedEntity = {
        id: entity.id,
        faction: entity.faction ?? 'neutral',
        position: perceivedPos,
        health: sensedVia === 'vision' ? (entity.health ?? 100) : null,
        sensedVia,
        distance: dist,
        tick
      };

      perceivedEntity.threatScore = computeThreatScore(perceivedEntity, bot, cfg);
      perceivedEntity.opportunityScore = computeOpportunityScore(perceivedEntity, bot, cfg);

      stimulusQueue.push({ entity: perceivedEntity, releaseTick: delayedRelease });
    }

    if (rng.nextUint32() / 0xFFFFFFFF < cfg.falsePositiveChance) {
      const fakeAngle = rng.nextUint32() / 0xFFFFFFFF * Math.PI * 2;
      const fakeDist = cfg.visionRange * (0.3 + rng.nextUint32() / 0xFFFFFFFF * 0.5);
      stimulusQueue.push({
        entity: {
          id: `phantom-${tick}-${rng.nextUint32()}`,
          faction: 'unknown',
          position: {
            x: (bot.position?.x ?? 0) + Math.cos(fakeAngle) * fakeDist,
            y: (bot.position?.y ?? 0) + Math.sin(fakeAngle) * fakeDist
          },
          health: null,
          sensedVia: 'sound',
          distance: fakeDist,
          tick,
          threatScore: cfg.threatThreshold + 0.1,
          opportunityScore: 0,
          isPhantom: true
        },
        releaseTick: delayedRelease
      });
    }

    const released = [];
    for (let i = stimulusQueue.length - 1; i >= 0; i--) {
      if (stimulusQueue[i].releaseTick <= tick) {
        released.push(stimulusQueue[i].entity);
        stimulusQueue.splice(i, 1);
      }
    }

    const merged = mergePerceived(released, perceivedHistory, tick);

    perceivedHistory.push(merged);
    if (perceivedHistory.length > 5) perceivedHistory.shift();

    const threats = merged.entities.filter(e => e.threatScore >= cfg.threatThreshold);
    const opportunities = merged.entities.filter(e => e.opportunityScore >= cfg.opportunityThreshold);

    return Object.freeze({
      botId,
      tick,
      entities: merged.entities,
      threats,
      opportunities,
      uncertainty: cfg.baseUncertainty,
      pendingStimuliCount: stimulusQueue.length
    });
  }

  function reset() {
    stimulusQueue.length = 0;
    perceivedHistory.length = 0;
  }

  return { perceive, reset, botId };
}

function addNoise(position, noiseFraction, rng) {
  const nx = (rng.nextUint32() / 0xFFFFFFFF - 0.5) * 2 * noiseFraction;
  const ny = (rng.nextUint32() / 0xFFFFFFFF - 0.5) * 2 * noiseFraction;
  return {
    x: (position?.x ?? 0) * (1 + nx),
    y: (position?.y ?? 0) * (1 + ny)
  };
}

function isOccluded(from, to, geometry) {
  if (!geometry?.walls) return false;
  for (const wall of geometry.walls) {
    if (segmentsIntersect(from, to, wall.start, wall.end)) return true;
  }
  return false;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function computeThreatScore(entity, bot, config) {
  if (entity.faction === bot.faction) return 0;
  if (entity.isPhantom) return entity.threatScore;

  let score = 0;
  const distFactor = Math.max(0, 1 - entity.distance / config.visionRange);
  score += distFactor * 0.5;

  if (entity.health != null) {
    score += (entity.health / 100) * 0.2;
  }

  score += entity.sensedVia === 'vision' ? 0.2 : 0.1;
  score -= config.baseUncertainty * 0.1;

  return Math.max(0, Math.min(1, score));
}

function computeOpportunityScore(entity, bot, config) {
  let score = 0;
  if (entity.health != null && entity.health < 30) {
    score += (1 - entity.health / 100) * 0.4;
  }
  const distFactor = Math.max(0, 1 - entity.distance / config.visionRange);
  score += distFactor * 0.3;

  if (entity.sensedVia === 'sound') {
    score += 0.15;
  }

  score -= config.baseUncertainty * 0.1;

  return Math.max(0, Math.min(1, score));
}

function mergePerceived(newlyReleased, history, currentTick) {
  const seen = new Map();

  const lastSnapshot = history[history.length - 1];
  if (lastSnapshot) {
    for (const ent of lastSnapshot.entities) {
      if (currentTick - ent.tick <= 3) {
        seen.set(ent.id, ent);
      }
    }
  }

  for (const ent of newlyReleased) {
    seen.set(ent.id, ent);
  }

  return { entities: [...seen.values()] };
}
