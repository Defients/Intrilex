// ═══════════════════════════════════════════════════════════════
// brain-interaction.js — Raycaster + custom orbit/pan/zoom controls
// ═══════════════════════════════════════════════════════════════
import * as THREE from 'three';

/**
 * Attach interaction handlers to the renderer canvas.
 * Returns a controller with update() (called each frame for damping),
 * dispose(), and callbacks for hover/click/drag.
 *
 * Camera controls:
 *  - Left drag: orbit (azimuth + polar)
 *  - Right drag: pan
 *  - Scroll/pinch: dolly zoom
 *  - Touch: one-finger orbit, two-finger pan+zoom
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Scene} scene
 * @param {object} callbacks
 * @param {(node:THREE.Mesh|null)=>void} [callbacks.onHover]
 * @param {(node:THREE.Mesh|null)=>void} [callbacks.onClick]
 * @param {(node:THREE.Mesh,x:number,y:number,z:number)=>void} [callbacks.onDrag]
 * @param {() => THREE.Mesh[]} [callbacks.getNodes]
 */
export function attachInteraction(renderer, camera, scene, callbacks = {}) {
  const dom = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Spherical orbit state.
  const target = new THREE.Vector3(0, 0, 0);
  let radius = camera.position.distanceTo(target);
  let azimuth = Math.atan2(camera.position.x, camera.position.z);
  let polar = Math.acos(Math.max(-1, Math.min(1, camera.position.y / radius || 0)));

  // Damping targets.
  let tAzimuth = azimuth, tPolar = polar, tRadius = radius;
  const panOffset = new THREE.Vector3();
  const tPan = new THREE.Vector3();

  let isDragging = false;
  let isDraggingNode = false;
  let draggedNode = null;
  let draggedPlane = new THREE.Plane();
  let lastX = 0, lastY = 0;
  let downX = 0, downY = 0, dragDistance = 0;
  let pointers = new Map(); // active pointer ids → {x,y}
  let lastPinchDist = 0;

  function setPointer(e) {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickNode() {
    const nodes = callbacks.getNodes ? callbacks.getNodes() : [];
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(nodes, false);
    return hits.length ? hits[0].object : null;
  }

  function onPointerDown(e) {
    dom.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setPointer(e);
    const node = pickNode();
    downX = e.clientX; downY = e.clientY; dragDistance = 0;
    if (node && pointers.size === 1) {
      isDraggingNode = true;
      draggedNode = node;
      // Drag plane: parallel to camera's view, through the node.
      const camNormal = new THREE.Vector3();
      camera.getWorldDirection(camNormal);
      draggedPlane.setFromNormalAndCoplanarPoint(camNormal, node.position);
    } else {
      isDragging = true;
      lastX = e.clientX; lastY = e.clientY;
    }
  }

  function onPointerMove(e) {
    dragDistance = Math.max(dragDistance, Math.hypot(e.clientX - downX, e.clientY - downY));
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-finger pinch zoom.
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist) {
        tRadius = THREE.MathUtils.clamp(tRadius * (lastPinchDist / dist), 30, 400);
      }
      lastPinchDist = dist;
      return;
    }

    setPointer(e);

    if (isDraggingNode && draggedNode) {
      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(draggedPlane, hit)) {
        draggedNode.position.copy(hit);
        callbacks.onDrag?.(draggedNode, hit.x, hit.y, hit.z);
      }
      return;
    }

    if (isDragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (e.buttons === 2 || e.shiftKey) {
        // Pan.
        const panScale = tRadius * 0.0015;
        tPan.x -= dx * panScale;
        tPan.y += dy * panScale;
      } else {
        // Orbit.
        tAzimuth -= dx * 0.005;
        tPolar = THREE.MathUtils.clamp(tPolar - dy * 0.005, 0.1, Math.PI - 0.1);
      }
      return;
    }

    // Hover.
    const node = pickNode();
    callbacks.onHover?.(node);
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (isDraggingNode) {
      const clickedNode = draggedNode;
      isDraggingNode = false;
      draggedNode = null;
      if (dragDistance <= 5) callbacks.onClick?.(clickedNode);
    } else if (isDragging) {
      isDragging = false;
      if (dragDistance <= 5) {
        setPointer(e);
        callbacks.onClick?.(pickNode());
      }
    } else {
      // Click without drag → select node or clear.
      setPointer(e);
      const node = pickNode();
      callbacks.onClick?.(node);
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    tRadius = THREE.MathUtils.clamp(tRadius * factor, 30, 400);
  }

  function onContextMenu(e) { e.preventDefault(); }

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);
  dom.addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('contextmenu', onContextMenu);

  /** Per-frame damping toward target spherical coords. */
  function update() {
    azimuth += (tAzimuth - azimuth) * 0.12;
    polar += (tPolar - polar) * 0.12;
    radius += (tRadius - radius) * 0.12;
    panOffset.lerp(tPan, 0.12);

    const sinP = Math.sin(polar);
    camera.position.set(
      target.x + panOffset.x + radius * sinP * Math.sin(azimuth),
      target.y + panOffset.y + radius * Math.cos(polar),
      target.z + radius * sinP * Math.cos(azimuth),
    );
    camera.lookAt(target.x + panOffset.x, target.y + panOffset.y, target.z);
  }

  function dispose() {
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('pointercancel', onPointerUp);
    dom.removeEventListener('wheel', onWheel);
    dom.removeEventListener('contextmenu', onContextMenu);
    pointers.clear();
  }

  return { update, dispose };
}
