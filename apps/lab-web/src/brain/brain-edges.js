// ═══════════════════════════════════════════════════════════════
// brain-edges.js — Edge line segments between nodes
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'three';

/**
 * Build a single edge line from source to target position.
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @param {{color:string,opacity:number,dashed?:boolean}} opts
 * @returns {THREE.Line}
 */
export function createEdgeLine(a, b, opts) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    a.x, a.y, a.z, b.x, b.y, b.z,
  ], 3));
  const color = new THREE.Color(opts.color);
  if (opts.dashed) {
    const material = new THREE.LineDashedMaterial({ color, transparent: true, opacity: opts.opacity, dashSize: 3, gapSize: 2 });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    return line;
  }
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity });
  return new THREE.Line(geometry, material);
}

/**
 * Update an existing edge's endpoint positions (for drag/layout updates).
 * @param {THREE.Line} line
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 */
export function updateEdgeLine(line, a, b) {
  const pos = line.geometry.getAttribute('position');
  pos.setXYZ(0, a.x, a.y, a.z);
  pos.setXYZ(1, b.x, b.y, b.z);
  pos.needsUpdate = true;
  if (line.material.isLineDashedMaterial) line.computeLineDistances();
}

/**
 * Set edge highlight state (connected to selected node → bright; else dim).
 * @param {THREE.Line} line
 * @param {boolean} highlighted
 * @param {number} [baseOpacity]
 */
export function setEdgeHighlight(line, highlighted, baseOpacity) {
  if (!line || !line.material) return;
  line.material.opacity = highlighted ? Math.min(1, (baseOpacity ?? 0.4) * 2.2) : 0.08;
}

/**
 * Apply hover styling to an edge line. WebGL ignores `linewidth`, so we boost
 * opacity and emissive-like brightness instead. Restores the base opacity when
 * un-hovered.
 * @param {THREE.Line} line
 * @param {boolean} hovered
 * @param {number} [baseOpacity]
 */
export function setEdgeHover(line, hovered, baseOpacity) {
  if (!line || !line.material) return;
  if (hovered) {
    line.material.opacity = Math.min(1, (baseOpacity ?? line.material.opacity ?? 0.4) * 1.8 + 0.2);
  } else {
    line.material.opacity = baseOpacity ?? 0.4;
  }
}

/**
 * Create a particle that flows along an edge from source→target.
 * Returns a controller with update(t), dispose(), and the mesh to add to the
 * scene. Speed scales with edge weight. Particle color matches the edge color.
 * @param {{x:number,y:number,z:number}} a - Source position
 * @param {{x:number,y:number,z:number}} b - Target position
 * @param {{color:string,weight?:number}} opts
 * @returns {{mesh:THREE.Mesh,update:(t:number)=>void,dispose:()=>void}}
 */
export function createEdgeFlow(a, b, opts) {
  const color = new THREE.Color(opts.color);
  const radius = Math.max(0.12, 0.5);
  const geometry = new THREE.SphereGeometry(radius, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(a.x, a.y, a.z);

  const va = new THREE.Vector3(a.x, a.y, a.z);
  const vb = new THREE.Vector3(b.x, b.y, b.z);
  // Speed: 0.3 + weight * 0.1, clamped to [0.2, 1.2] cycles/sec.
  const weight = Number.isFinite(opts.weight) ? opts.weight : 1;
  const speed = Math.max(0.2, Math.min(1.2, 0.3 + weight * 0.1));

  function update(t) {
    // Loop the particle along the edge (mod 1).
    const phase = (t * speed) % 1;
    mesh.position.lerpVectors(va, vb, phase);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, update, dispose };
}
