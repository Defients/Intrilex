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
