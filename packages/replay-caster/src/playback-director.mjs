// ═══════════════════════════════════════════════════════════════
// playback-director.mjs — Deterministic playback scheduler.
//
// Traverses a completed Caster Beat sequence with live-style pacing.
// Controls speed, pause/resume, and step navigation through semantic
// units. Completely independent of Ollama availability — commentary
// generation never gates playback progression.
//
// Determinism invariant: playback timing is PRESENTATION ONLY. It never
// alters canonical replay data, hashes, or policy decisions. The
// director holds a reference to the immutable beat array; it never
// mutates beats.
// ═══════════════════════════════════════════════════════════════

import { BEAT_KIND } from './schemas.mjs';

export const SUPPORTED_SPEEDS = Object.freeze([0.5, 1, 1.5, 2]);

// Base milliseconds per beat at 1x. Tuned for a readable "live" cadence.
const BASE_INTERVAL_MS = 1400;

/**
 * @param {object} opts
 * @param {Array} opts.beats - immutable CasterBeat array
 * @param {function} [opts.onTick] - called with (beat, index) when the
 *   current beat changes (used by the UI to re-render + trigger
 *   commentary). Never awaited; commentary generation is decoupled.
 * @param {function} [opts.now] - clock function (defaults to Date.now)
 */
export class PlaybackDirector {
  constructor({ beats, onTick, now } = {}) {
    if (!Array.isArray(beats)) throw new Error('PlaybackDirector requires a beats array');
    this._beats = beats;
    this._onTick = typeof onTick === 'function' ? onTick : null;
    this._now = typeof now === 'function' ? now : () => Date.now();
    this._index = 0;
    this._speed = 1;
    this._playing = false;
    this._lastTickAt = null;
    this._accumulatorMs = 0;
  }

  get beats() { return this._beats; }
  get index() { return this._index; }
  get speed() { return this._speed; }
  get playing() { return this._playing; }
  get count() { return this._beats.length; }
  get atEnd() { return this._index >= this._beats.length - 1; }
  get atStart() { return this._index <= 0; }

  /** Current beat (or null if empty). */
  currentBeat() { return this._beats[this._index] ?? null; }

  /** Current command checkpoint hash (after-hash of the current beat). */
  currentCheckpoint() {
    const b = this.currentBeat();
    return b ? (b.checkpointHashAfter ?? b.checkpointHashBefore) : null;
  }

  /** Set playback speed. Must be one of SUPPORTED_SPEEDS. */
  setSpeed(speed) {
    const s = Number(speed);
    if (!SUPPORTED_SPEEDS.includes(s)) throw new Error(`Unsupported speed: ${speed}. Supported: ${SUPPORTED_SPEEDS.join(', ')}`);
    this._speed = s;
    // Reset cadence accumulator so the new speed applies cleanly.
    this._accumulatorMs = 0;
    this._lastTickAt = this._playing ? this._now() : null;
  }

  /** Begin playback. No-op if already playing or at end. */
  play() {
    if (this._playing) return;
    if (this.atEnd) this._index = 0; // restart from beginning
    this._playing = true;
    this._lastTickAt = this._now();
    this._accumulatorMs = 0;
  }

  /** Pause playback. */
  pause() {
    this._playing = false;
    this._lastTickAt = null;
  }

  /** Toggle play/pause. */
  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  /** Jump to a specific beat index (clamped). */
  stepTo(index) {
    this._index = clamp(Math.trunc(index), 0, this._beats.length - 1);
    this._accumulatorMs = 0;
    if (this._playing) this._lastTickAt = this._now();
    this._emit();
  }

  /** Step forward one beat. Returns false if at end. */
  stepForward() {
    if (this.atEnd) return false;
    this.stepTo(this._index + 1);
    return true;
  }

  /** Step backward one beat. Returns false if at start. */
  stepBackward() {
    if (this.atStart) return false;
    this.stepTo(this._index - 1);
    return true;
  }

  /** Skip to the next major beat (DECISION/RESPONSE/MATCH_END). */
  nextMajorBeat() {
    for (let i = this._index + 1; i < this._beats.length; i += 1) {
      const k = this._beats[i].beatKind;
      if (k === BEAT_KIND.DECISION || k === BEAT_KIND.RESPONSE || k === BEAT_KIND.MATCH_END) {
        this.stepTo(i);
        return true;
      }
    }
    this.stepTo(this._beats.length - 1);
    return false;
  }

  /** Skip to the previous major beat. */
  prevMajorBeat() {
    for (let i = this._index - 1; i >= 0; i -= 1) {
      const k = this._beats[i].beatKind;
      if (k === BEAT_KIND.DECISION || k === BEAT_KIND.RESPONSE || k === BEAT_KIND.MATCH_START) {
        this.stepTo(i);
        return true;
      }
    }
    this.stepTo(0);
    return false;
  }

  /** Skip to the end (MATCH_END). */
  skipToEnd() { this.stepTo(this._beats.length - 1); }

  /**
   * Advance playback by elapsed wall-clock time. Called by the UI's
   * timer (e.g. requestAnimationFrame or setInterval). When enough
   * time has accumulated for the current speed, advance one beat.
   *
   * This is the ONLY method that auto-advances during playback. It is
   * deterministic with respect to the beat sequence: given the same
   * sequence of tick calls, it produces the same beat progression.
   *
   * @returns {boolean} true if a beat advance occurred this tick.
   */
  tick() {
    if (!this._playing || this.atEnd) {
      if (this._playing && this.atEnd) { this.pause(); }
      return false;
    }
    const now = this._now();
    const elapsed = this._lastTickAt != null ? now - this._lastTickAt : 0;
    this._lastTickAt = now;
    this._accumulatorMs += elapsed;
    const interval = beatInterval(this._speed, this.currentBeat());
    if (this._accumulatorMs >= interval) {
      this._accumulatorMs -= interval;
      this.stepForward();
      return true;
    }
    return false;
  }

  /** Estimated playback time (seconds) at the current index/speed. */
  playbackTimeSeconds() {
    let total = 0;
    for (let i = 0; i < this._index && i < this._beats.length; i += 1) {
      // Use 1x interval for a stable time estimate independent of current speed.
      total += beatInterval(1, this._beats[i]);
    }
    return total / 1000;
  }

  _emit() {
    if (this._onTick) {
      try { this._onTick(this.currentBeat(), this._index); }
      catch { /* onTick errors must never corrupt playback */ }
    }
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/**
 * Per-beat interval. Structural beats (MATCH_START/END, TURN_START)
 * are briefer; terminal beats linger slightly so the audience can
 * absorb the result. Speed scales the base.
 */
function beatInterval(speed, beat) {
  let base = BASE_INTERVAL_MS;
  if (beat) {
    if (beat.beatKind === BEAT_KIND.MATCH_START) base = 600;
    else if (beat.beatKind === BEAT_KIND.TURN_START) base = 500;
    else if (beat.beatKind === BEAT_KIND.MATCH_END) base = 2200;
  }
  return base / speed;
}
