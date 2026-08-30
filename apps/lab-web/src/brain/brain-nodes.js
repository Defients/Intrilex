// ═══════════════════════════════════════════════════════════════
// brain-nodes.js — Node meshes + sprite labels
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { weightToRadius } from './brain-data.js';

/**
 * Create a canvas-texture sprite label that always faces the camera.
 * @param {string} text
 * @param {string} color
 * @returns {THREE.Sprite}
 */
export function createLabelSprite(text, color = '#e8f0f4') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pad = 8;
  ctx.font = 'bold 28px Inter, sans-serif';
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width + pad * 2);
  canvas.height = 40;
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.fillStyle = 'rgba(8,16,26,0.78)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 24, canvas.height / 24, 1);
  sprite.visible = false; // hidden by default; shown on hover/selection/zoom
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Build a node mesh from a graph node definition.
 * @param {{id:string,label:string,color:string,weight:number,data?:object}} def
 * @returns {THREE.Mesh & {__brainId:string,__brainDef:object,__label:THREE.Sprite,__baseScale:number,__emissive:number}}
 */
export function createNodeMesh(def) {
  const radius = weightToRadius(def.weight);
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  const color = new THREE.Color(def.color);
  const material = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.__brainId = def.id;
  mesh.__brainDef = def;
  mesh.__baseScale = 1;
  mesh.__emissive = 0.3;

  const label = createLabelSprite(def.label, def.color);
  mesh.add(label);
  mesh.__label = label;

  // Selection ring (hidden until selected).
  const ringGeo = new THREE.RingGeometry(radius * 1.6, radius * 1.9, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.visible = false;
  mesh.__ring = ring;
  mesh.add(ring);

  return mesh;
}

/**
 * Apply hover styling to a node mesh.
 * @param {THREE.Mesh} mesh
 * @param {boolean} hovered
 */
export function setHoverState(mesh, hovered) {
  if (!mesh) return;
  mesh.__baseScale = hovered ? 1.15 : 1;
  mesh.scale.setScalar(mesh.__baseScale);
  if (mesh.material) mesh.material.emissiveIntensity = hovered ? 0.6 : mesh.__emissive;
  if (mesh.__label) mesh.__label.visible = hovered;
}

/**
 * Apply selection styling to a node mesh.
 * @param {THREE.Mesh} mesh
 * @param {boolean} selected
 */
export function setSelectedState(mesh, selected) {
  if (!mesh) return;
  mesh.__baseScale = selected ? 1.3 : 1;
  mesh.scale.setScalar(mesh.__baseScale);
  mesh.__emissive = selected ? 0.7 : 0.3;
  if (mesh.material) mesh.material.emissiveIntensity = mesh.__emissive;
  if (mesh.__label) mesh.__label.visible = selected;
  if (mesh.__ring) {
    mesh.__ring.visible = selected;
    if (mesh.__ring.material) mesh.__ring.material.opacity = selected ? 0.8 : 0;
  }
}

/**
 * Dim a node (for search/cluster filtering).
 * @param {THREE.Mesh} mesh
 * @param {boolean} dimmed
 */
export function setDimState(mesh, dimmed) {
  if (!mesh || !mesh.material) return;
  mesh.material.opacity = dimmed ? 0.18 : 1;
  mesh.material.transparent = dimmed;
  if (mesh.__label) mesh.__label.visible = !dimmed && (mesh.__label.visible || false);
}
