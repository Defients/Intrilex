// ═══════════════════════════════════════════════════════════════
// play-sound.js — Web Audio API sound engine for the Play module.
// All tones are synthesized — no audio assets required.
// Respects prefers-reduced-motion (no positional panning).
// ═══════════════════════════════════════════════════════════════

import { getPreference, setPreference } from './persistence.js?v=73b458295383';

// Suit → frequency mapping for card-play tones
const SUIT_FREQ = {
  '♠': 220,
  '♥': 330,
  '♦': 440,
  '♣': 277,
};

const DEFAULT_FREQ = 300;

export class SoundEngine {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._initialized = false;
    this._masterGain = null;
  }

  /**
   * Create the AudioContext. Must be called from a user gesture
   * to satisfy browser autoplay policies.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // Restore mute preference
    try {
      const saved = await getPreference('soundMuted');
      if (saved !== null) this._muted = saved;
    } catch { /* ignore */ }

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this._ctx = new Ctx();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._muted ? 0 : 1;
      this._masterGain.connect(this._ctx.destination);
    } catch {
      this._ctx = null;
    }
  }

  /**
   * Set mute state. Persists to IndexedDB.
   */
  async setMuted(muted) {
    this._muted = muted;
    if (this._masterGain && this._ctx) {
      this._masterGain.gain.setTargetAtTime(muted ? 0 : 1, this._ctx.currentTime, 0.05);
    }
    try { await setPreference('soundMuted', muted); } catch { /* ignore */ }
  }

  isMuted() {
    return this._muted;
  }

  /**
   * Resume a suspended AudioContext (e.g. when tab becomes visible).
   */
  async resume() {
    if (this._ctx && this._ctx.state === 'suspended') {
      try { await this._ctx.resume(); } catch { /* ignore */ }
    }
  }

  /**
   * Suspend the AudioContext (e.g. when tab is hidden).
   */
  async suspend() {
    if (this._ctx && this._ctx.state === 'running') {
      try { await this._ctx.suspend(); } catch { /* ignore */ }
    }
  }

  /**
   * Close the AudioContext and clean up.
   */
  destroy() {
    if (this._ctx) {
      try { this._ctx.close(); } catch { /* ignore */ }
      this._ctx = null;
      this._masterGain = null;
    }
    this._initialized = false;
  }

  // ── Tone primitives ──

  /**
   * Play a single oscillator tone.
   * @param {number} freq - Frequency in Hz
   * @param {string} type - Oscillator type: 'sine', 'square', 'triangle', 'sawtooth'
   * @param {number} duration - Duration in seconds
   * @param {number} gain - Peak gain (0-1)
   * @param {number} delay - Start delay in seconds
   */
  _tone(freq, type, duration, gain, delay = 0) {
    if (!this._ctx || this._muted) return;
    const ctx = this._ctx;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this._masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /**
   * Play a frequency sweep tone.
   */
  _sweep(fromFreq, toFreq, type, duration, gain) {
    if (!this._ctx || this._muted) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, now);
    osc.frequency.linearRampToValueAtTime(toFreq, now + duration);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this._masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // ── Game event sounds ──

  /**
   * Card play sound — short tone with suit-colored frequency.
   * @param {string} suit - Suit symbol (♠♥♦♣) or null
   */
  playCardPlay(suit) {
    const freq = SUIT_FREQ[suit] ?? DEFAULT_FREQ;
    this._tone(freq, 'sine', 0.2, 0.15);
  }

  /**
   * Card draw sound — frequency sweep upward.
   */
  playCardDraw() {
    this._sweep(200, 400, 'triangle', 0.15, 0.1);
  }

  /**
   * Stack resolution sound — shimmer of overlapping tones.
   */
  playStackResolve() {
    this._tone(523, 'sine', 0.3, 0.08, 0);
    this._tone(659, 'sine', 0.3, 0.08, 0.04);
    this._tone(784, 'sine', 0.3, 0.08, 0.08);
  }

  /**
   * AI action sound — short low blip.
   */
  playAiAction() {
    this._tone(150, 'square', 0.08, 0.06);
  }

  /**
   * Victory sound — ascending arpeggio C5-E5-G5-C6.
   */
  playVictory() {
    this._tone(523, 'sine', 0.15, 0.12, 0);
    this._tone(659, 'sine', 0.15, 0.12, 0.15);
    this._tone(784, 'sine', 0.15, 0.12, 0.3);
    this._tone(1047, 'sine', 0.3, 0.12, 0.45);
  }

  /**
   * Defeat sound — descending tones C4-A3-F3-D3.
   */
  playDefeat() {
    this._tone(262, 'triangle', 0.2, 0.1, 0);
    this._tone(220, 'triangle', 0.2, 0.1, 0.2);
    this._tone(175, 'triangle', 0.2, 0.1, 0.4);
    this._tone(147, 'triangle', 0.4, 0.1, 0.6);
  }
}
