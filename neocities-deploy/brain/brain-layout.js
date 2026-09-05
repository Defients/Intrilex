// ═══════════════════════════════════════════════════════════════
// brain-layout.js — Force-directed 3D layout (pure math, no Three.js)
// ═══════════════════════════════════════════════════════════════
// Velocity-based force simulation using Verlet-ish integration.
// Pure functions operating on plain {x,y,z} position arrays so they
// can be unit-tested in Node without a scene graph.

/** @typedef {{x:number,y:number,z:number}} Vec3 */
/** @typedef {{repulsion:number,springLength:number,springStrength:number,centering:number,damping:number,maxVelocity:number,maxIterations:number,epsilon:number}} LayoutOptions */

/** @type {Readonly<LayoutOptions>} */
export const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
  repulsion: 320,       // Coulomb-like constant
  springLength: 18,     // rest length for edge springs
  springStrength: 0.04, // Hooke constant
  centering: 0.012,     // pull toward origin
  damping: 0.85,        // velocity decay per step
  maxVelocity: 12,      // velocity clamp
  maxIterations: 200,   // settle cap
  epsilon: 0.05,        // kinetic-energy settle threshold
});

/**
 * Create initial positions on a sphere (Fibonacci lattice) so the
 * simulation starts from a well-distributed, non-degenerate state.
 * @param {number} count
 * @param {number} [radius=40]
 * @returns {Vec3[]}
 */
export function initialSpherePositions(count, radius = 40) {
  const pts = [];
  const n = Math.max(1, count);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push({
      x: Math.cos(theta) * r * radius,
      y: y * radius,
      z: Math.sin(theta) * r * radius,
    });
  }
  return pts;
}

const dist = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Run a single force-simulation step, mutating velocities and positions.
 * @param {Vec3[]} pos - Positions (mutated in place)
 * @param {Vec3[]} vel - Velocities (mutated in place)
 * @param {Array<{source:number,target:number,weight?:number}>} edges - Index-based edges
 * @param {Partial<typeof DEFAULT_LAYOUT_OPTIONS>} [opts]
 * @returns {number} total kinetic energy after the step
 */
export function stepLayout(pos, vel, edges, opts = {}) {
  const o = { ...DEFAULT_LAYOUT_OPTIONS, ...opts };
  const n = pos.length;
  const forces = pos.map(() => ({ x: 0, y: 0, z: 0 }));

  // Repulsion (all pairs — O(n²), acceptable for ≤200 nodes).
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x;
      let dy = pos[i].y - pos[j].y;
      let dz = pos[i].z - pos[j].z;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.01) { d2 = 0.01; dx = 0.1; dy = 0.1; dz = 0.1; }
      const d = Math.sqrt(d2);
      const f = o.repulsion / d2;
      const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
      forces[i].x += fx; forces[i].y += fy; forces[i].z += fz;
      forces[j].x -= fx; forces[j].y -= fy; forces[j].z -= fz;
    }
  }

  // Attraction (springs along edges).
  for (const e of edges) {
    const a = pos[e.source], b = pos[e.target];
    if (!a || !b) continue;
    const d = Math.max(0.01, dist(a, b));
    const rest = o.springLength * (e.weight ?? 1);
    const f = o.springStrength * (d - rest);
    const dx = (b.x - a.x) / d, dy = (b.y - a.y) / d, dz = (b.z - a.z) / d;
    forces[e.source].x += dx * f; forces[e.source].y += dy * f; forces[e.source].z += dz * f;
    forces[e.target].x -= dx * f; forces[e.target].y -= dy * f; forces[e.target].z -= dz * f;
  }

  // Centering + integration.
  let energy = 0;
  for (let i = 0; i < n; i++) {
    forces[i].x -= pos[i].x * o.centering;
    forces[i].y -= pos[i].y * o.centering;
    forces[i].z -= pos[i].z * o.centering;
    vel[i].x = (vel[i].x + forces[i].x) * o.damping;
    vel[i].y = (vel[i].y + forces[i].y) * o.damping;
    vel[i].z = (vel[i].z + forces[i].z) * o.damping;
    const sp = Math.sqrt(vel[i].x ** 2 + vel[i].y ** 2 + vel[i].z ** 2);
    if (sp > o.maxVelocity) {
      const k = o.maxVelocity / sp;
      vel[i].x *= k; vel[i].y *= k; vel[i].z *= k;
    }
    pos[i].x += vel[i].x; pos[i].y += vel[i].y; pos[i].z += vel[i].z;
    energy += sp * sp;
  }
  return energy;
}

/**
 * Run the simulation to convergence (or maxIterations), then freeze.
 * @param {Vec3[]} pos
 * @param {Array<{source:number,target:number,weight?:number}>} edges
 * @param {Partial<typeof DEFAULT_LAYOUT_OPTIONS>} [opts]
 * @returns {{iterations:number,energy:number}}
 */
export function settleLayout(pos, edges, opts = {}) {
  const o = { ...DEFAULT_LAYOUT_OPTIONS, ...opts };
  const vel = pos.map(() => ({ x: 0, y: 0, z: 0 }));
  let energy = Infinity;
  let iterations = 0;
  while (iterations < o.maxIterations && energy > o.epsilon) {
    energy = stepLayout(pos, vel, edges, o);
    iterations++;
  }
  return { iterations, energy };
}

/**
 * Apply a gentle pull toward a target Z-plane (for combined-layer separation).
 * @param {Vec3[]} pos
 * @param {number[]} targetZ - per-node target Z
 * @param {number} [strength=0.1]
 */
export function applyZLayering(pos, targetZ, strength = 0.1) {
  for (let i = 0; i < pos.length; i++) {
    if (Number.isFinite(targetZ[i])) {
      pos[i].z += (targetZ[i] - pos[i].z) * strength;
    }
  }
}

/**
 * Relax positions around a single dragged node (local relaxation).
 * Cheaper than a full re-settle: a few iterations only moving neighbors.
 * @param {Vec3[]} pos
 * @param {Vec3[]} vel
 * @param {Array<{source:number,target:number}>} edges
 * @param {number} pinnedIndex - node being dragged (kept fixed)
 * @param {number} [iterations=8]
 */
export function relaxAround(pos, vel, edges, pinnedIndex, iterations = 8) {
  const o = { ...DEFAULT_LAYOUT_OPTIONS, damping: 0.7 };
  const pinned = { ...pos[pinnedIndex] };
  for (let it = 0; it < iterations; it++) {
    stepLayout(pos, vel, edges, o);
    pos[pinnedIndex].x = pinned.x;
    pos[pinnedIndex].y = pinned.y;
    pos[pinnedIndex].z = pinned.z;
    vel[pinnedIndex].x = 0; vel[pinnedIndex].y = 0; vel[pinnedIndex].z = 0;
  }
}
