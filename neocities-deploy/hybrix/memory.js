/**
 * HYBRIX AI — Memory & Adaptation (Lightweight, Safe)
 *
 * Short-term ring-buffer memory with pattern recognition and
 * adaptive parameter nudges. All learning is capped, decayed,
 * and resettable.
 *
 * Constraints:
 * - Learning capped by difficulty (adaptationRate)
 * - No permanent runaway adaptation (nudge clamps)
 * - All learning resettable / debuggable
 */

export function createMemory(botId, config, seed) {
  const capacity = (config.windowSeconds ?? 15) * (config.tickRate ?? 60);
  const buffer = [];
  const patterns = [];
  let nudges = { accuracy: 0, aggression: 0, spacing: 0 };
  let totalEvents = 0;

  function record(event) {
    const entry = {
      timestamp: event.timestamp ?? Date.now(),
      tick: event.tick ?? 0,
      type: event.type,
      actor: event.actor,
      target: event.target,
      position: event.position,
      outcome: event.outcome,
      weight: 1.0
    };
    buffer.push(entry);
    if (buffer.length > capacity) buffer.shift();
    totalEvents++;
  }

  function recognizePatterns() {
    const detected = [];
    const recent = buffer.filter(e => e.weight > 0.1);

    // Pattern: repeated tactic detection
    const tacticMap = new Map();
    for (const event of recent) {
      const key = `${event.type}:${event.position?.quadrant ?? 'unknown'}`;
      if (!tacticMap.has(key)) tacticMap.set(key, []);
      tacticMap.get(key).push(event);
    }

    const threshold = config.patternRepeatThreshold ?? 3;
    for (const [tactic, events] of tacticMap) {
      if (events.length >= threshold) {
        const confidence = Math.min(events.length / (threshold * 2), config.patternConfidenceCap ?? 1.0);
        detected.push({
          type: 'REPEATED_TACTIC',
          tactic,
          count: events.length,
          confidence,
          counterStrategy: deriveCounter(tactic),
          lastSeen: events[events.length - 1].tick
        });
      }
    }

    // Pattern: aggression profiling
    const attackEvents = recent.filter(e => e.type === 'ATTACK' || e.type === 'SCUTTLE' || e.type === 'COUNTER');
    const aggressionRate = recent.length > 0 ? attackEvents.length / recent.length : 0.5;
    detected.push({
      type: 'AGGRESSION_PROFILE',
      value: aggressionRate,
      confidence: Math.min(recent.length / 10, 1.0),
      classification: aggressionRate > 0.7 ? 'aggressive' : aggressionRate < 0.3 ? 'passive' : 'balanced'
    });

    // Pattern: response tendency
    const responseEvents = recent.filter(e => e.type === 'COUNTER' || e.type === 'RESPONSE_DECLINE');
    const declineRate = responseEvents.length > 0
      ? responseEvents.filter(e => e.type === 'RESPONSE_DECLINE').length / responseEvents.length
      : 0.5;
    detected.push({
      type: 'RESPONSE_TENDENCY',
      declineRate,
      confidence: Math.min(responseEvents.length / 5, 1.0),
      classification: declineRate > 0.7 ? 'conservative' : declineRate < 0.3 ? 'responsive' : 'balanced'
    });

    // Cap stored patterns
    patterns.length = 0;
    patterns.push(...detected.slice(0, config.maxPatterns ?? 10));
    return patterns;
  }

  function getAdaptiveNudges(difficultyAdaptationRate = 1.0) {
    const currentPatterns = recognizePatterns();
    const clamps = config.nudgeClamps ?? { accuracy: [-0.3, 0.3], aggression: [-0.3, 0.3], spacing: [-0.2, 0.2] };

    let accuracyNudge = 0;
    let aggressionNudge = 0;
    let spacingNudge = 0;

    for (const pattern of currentPatterns) {
      if (pattern.type === 'REPEATED_TACTIC' && pattern.confidence > 0.5) {
        accuracyNudge += 0.1 * pattern.confidence;
        spacingNudge += deriveSpacingAdjustment(pattern.tactic);
      }

      if (pattern.type === 'AGGRESSION_PROFILE') {
        if (pattern.classification === 'aggressive') {
          aggressionNudge -= 0.1 * pattern.confidence;
        } else if (pattern.classification === 'passive') {
          aggressionNudge += 0.1 * pattern.confidence;
        }
      }

      if (pattern.type === 'RESPONSE_TENDENCY') {
        if (pattern.classification === 'conservative') {
          aggressionNudge += 0.05 * pattern.confidence;
        }
      }
    }

    // Apply difficulty cap
    accuracyNudge *= difficultyAdaptationRate;
    aggressionNudge *= difficultyAdaptationRate;
    spacingNudge *= difficultyAdaptationRate;

    // Clamp to prevent runaway
    nudges = {
      accuracy: clamp(accuracyNudge, clamps.accuracy[0], clamps.accuracy[1]),
      aggression: clamp(aggressionNudge, clamps.aggression[0], clamps.aggression[1]),
      spacing: clamp(spacingNudge, clamps.spacing[0], clamps.spacing[1])
    };

    return nudges;
  }

  function decay() {
    const factor = config.decayFactor ?? 0.95;
    for (const entry of buffer) {
      entry.weight *= factor;
    }
  }

  function reset() {
    buffer.length = 0;
    patterns.length = 0;
    nudges = { accuracy: 0, aggression: 0, spacing: 0 };
    totalEvents = 0;
  }

  function getSnapshot() {
    return {
      botId,
      bufferSize: buffer.length,
      totalEvents,
      patterns: [...patterns],
      nudges: { ...nudges }
    };
  }

  return { record, recognizePatterns, getAdaptiveNudges, decay, reset, getSnapshot, botId };
}

function deriveCounter(tactic) {
  if (tactic.includes('ATTACK')) return 'DEFEND_OR_COUNTER';
  if (tactic.includes('DEFEND')) return 'FLANK_OR_RUSH';
  if (tactic.includes('DRAW')) return 'AGGRESSIVE_PLAY';
  return 'ADAPTIVE';
}

function deriveSpacingAdjustment(tactic) {
  if (tactic.includes('ATTACK')) return -0.05;
  if (tactic.includes('DEFEND')) return 0.05;
  return 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
