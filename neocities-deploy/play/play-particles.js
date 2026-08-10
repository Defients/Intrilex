// ═══════════════════════════════════════════════════════════════
// play-particles.js — Canvas overlay particle system for the Play module.
// Suit-colored bursts, stack sparkles, victory confetti, ambient particles.
// Respects prefers-reduced-motion. Pauses when tab not visible.
// ═══════════════════════════════════════════════════════════════

const MAX_PARTICLES = 200;

// Detect mobile/low-power devices for performance scaling
const _isMobile = typeof window !== 'undefined' && (
  window.matchMedia?.('(max-width: 768px)')?.matches ||
  window.matchMedia?.('(pointer: coarse)')?.matches ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator?.userAgent ?? '')
);
const _reducedMotion = typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
// Mobile: fewer particles, slower ambient rate; Reduced motion: disable entirely
const _effectiveMax = _reducedMotion ? 0 : (_isMobile ? 80 : MAX_PARTICLES);
const _ambientInterval = _isMobile ? 1200 : 500;

// Suit → color mapping for particle bursts
const SUIT_COLOR = {
  '♠': '#5ad7e8',
  '♥': '#f05d78',
  '♦': '#f0c74a',
  '♣': '#4fd387',
};

const DEFAULT_COLOR = '#5ad7e8';

export class ParticleSystem {
  constructor() {
    this._canvas = null;
    this._ctx = null;
    this._particles = [];
    this._raf = null;
    this._enabled = true;
    this._mounted = false;
    this._resizeObserver = null;
    this._ambientTimer = null;
  }

  /**
   * Attach the canvas overlay to a container element.
   * @param {HTMLElement} containerEl - The .tcg-board element
   */
  mount(containerEl) {
    if (this._mounted) this.unmount();
    if (!containerEl) return;

    // Check prefers-reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._enabled = false;
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'play-particle-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:999;';
    containerEl.appendChild(canvas);
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._mounted = true;

    this._resize();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(containerEl);

    this._loop();
    this._startAmbient();
  }

  /**
   * Remove the canvas and stop all animation.
   */
  unmount() {
    this._stopAmbient();
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
    this._particles = [];
    this._mounted = false;
  }

  /**
   * Enable or disable particle emission (for prefers-reduced-motion).
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) {
      this._particles = [];
      if (this._ctx && this._canvas) {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      }
      this._stopAmbient();
    } else if (this._mounted) {
      this._startAmbient();
    }
  }

  /**
   * Emit a burst of particles at (x, y) relative to canvas.
   * @param {number} x - X coordinate (canvas-relative, CSS pixels)
   * @param {number} y - Y coordinate (canvas-relative, CSS pixels)
   * @param {object} [opts] - { color, count, speed, gravity, size, lifeMs, shape }
   */
  burst(x, y, opts = {}) {
    if (!this._enabled || !this._ctx) return;
    const color = opts.color ?? DEFAULT_COLOR;
    const count = Math.min(opts.count ?? 12, _effectiveMax - this._particles.length);
    const speed = opts.speed ?? 3;
    const gravity = opts.gravity ?? 0.15;
    const size = opts.size ?? 4;
    const lifeMs = opts.lifeMs ?? 800;
    const shape = opts.shape ?? 'circle';

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const v = speed * (0.6 + Math.random() * 0.8);
      this._particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        gravity,
        size: size * (0.7 + Math.random() * 0.6),
        color,
        life: 0,
        maxLife: lifeMs * (0.7 + Math.random() * 0.6),
        shape,
      });
    }
  }

  /**
   * Emit small sparkles at (x, y) — for stack resolution.
   * @param {number} x
   * @param {number} y
   * @param {number} [count]
   */
  sparkle(x, y, count = 8) {
    this.burst(x, y, {
      color: '#5ad7e8',
      count,
      speed: 2,
      gravity: 0.05,
      size: 3,
      lifeMs: 600,
      shape: 'spark',
    });
  }

  /**
   * Victory confetti rain from the top of the canvas.
   * @param {number} durationMs - Duration of confetti emission
   */
  confetti(durationMs = 3000) {
    if (!this._enabled || !this._ctx || !this._canvas) return;
    const colors = ['#f05d78', '#5ad7e8', '#f0c74a', '#4fd387', '#b08cff', '#d8b25c'];
    const w = this._canvas.width / (window.devicePixelRatio || 1);
    const startTime = performance.now();

    const emit = () => {
      if (!this._enabled || !this._ctx) return;
      const elapsed = performance.now() - startTime;
      if (elapsed > durationMs) return;

      const count = Math.min(3, _effectiveMax - this._particles.length);
      for (let i = 0; i < count; i++) {
        this._particles.push({
          x: Math.random() * w,
          y: -10,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 2 + 1,
          gravity: 0.1,
          size: 5 + Math.random() * 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 0,
          maxLife: 3000 + Math.random() * 1000,
          shape: 'rect',
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
        });
      }
      setTimeout(emit, 60);
    };
    emit();
  }

  /**
   * Subtle ambient floating particles — anchored to the bottom of the YOUR ACTION frame.
   * Particles spawn across the full width at the bottom edge and drift upward/outward.
   * @private
   */
  _startAmbient() {
    this._stopAmbient();
    if (!this._enabled) return;
    this._ambientTimer = setInterval(() => {
      if (!this._enabled || !this._ctx || !this._canvas) return;
      if (document.hidden) return;
      if (this._particles.length >= _effectiveMax - 5) return;
      const w = this._canvas.width / (window.devicePixelRatio || 1);
      const h = this._canvas.height / (window.devicePixelRatio || 1);
      this._particles.push({
        x: Math.random() * w,
        y: h - 2,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.4 - Math.random() * 0.5,
        gravity: 0,
        size: 2 + Math.random() * 2,
        color: 'rgba(90, 215, 232, 0.45)',
        life: 0,
        maxLife: 4000 + Math.random() * 2000,
        shape: 'circle',
      });
    }, _ambientInterval);
  }

  _stopAmbient() {
    if (this._ambientTimer) {
      clearInterval(this._ambientTimer);
      this._ambientTimer = null;
    }
  }

  /**
   * Clean up all resources.
   */
  destroy() {
    this.unmount();
  }

  // ── Internal ──

  _resize() {
    if (!this._canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const parent = this._canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this._canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this._canvas.style.width = rect.width + 'px';
    this._canvas.style.height = rect.height + 'px';
    this._canvas.width = Math.round(rect.width * dpr);
    this._canvas.height = Math.round(rect.height * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _loop() {
    if (!this._mounted) return;
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _tick(timestamp) {
    if (!this._mounted || !this._ctx || !this._canvas) return;

    if (document.hidden) {
      this._raf = requestAnimationFrame((t) => this._tick(t));
      return;
    }

    const ctx = this._ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this._canvas.width / dpr;
    const h = this._canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    const dt = 16; // approx ms per frame
    const alive = [];

    for (const p of this._particles) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      if (p.y > h + 50 || p.x < -50 || p.x > w + 50) continue;

      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      if (p.rotation !== undefined) p.rotation += p.rotationSpeed;

      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio < 0.1 ? lifeRatio * 10 : 1 - ((lifeRatio - 0.1) / 0.9);

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.rotation) ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else if (p.shape === 'spark') {
        this._drawSpark(ctx, p.x, p.y, p.size, alpha);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      alive.push(p);
    }

    ctx.globalAlpha = 1;
    this._particles = alive;
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _drawSpark(ctx, x, y, size, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    const s = size;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.5);
    ctx.lineTo(s * 0.4, -s * 0.4);
    ctx.lineTo(s * 1.5, 0);
    ctx.lineTo(s * 0.4, s * 0.4);
    ctx.lineTo(0, s * 1.5);
    ctx.lineTo(-s * 0.4, s * 0.4);
    ctx.lineTo(-s * 1.5, 0);
    ctx.lineTo(-s * 0.4, -s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Get the suit color for particle effects.
 * @param {string} suit - Suit symbol (♠♥♦♣) or null
 * @returns {string} CSS color string
 */
export function getSuitParticleColor(suit) {
  return SUIT_COLOR[suit] ?? DEFAULT_COLOR;
}
