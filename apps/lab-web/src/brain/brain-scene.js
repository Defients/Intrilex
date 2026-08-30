// ═══════════════════════════════════════════════════════════════
// brain-scene.js — Three.js scene setup: camera, lights, renderer, fog
// ═══════════════════════════════════════════════════════════════
// Three.js is imported dynamically here so esbuild places it in a lazy
// chunk, keeping it out of the initial homepage bundle.

import * as THREE from 'three';

/**
 * Create the Three.js scene graph primitives.
 * @param {HTMLElement} container
 * @returns {{scene:THREE.Scene,camera:THREE.PerspectiveCamera,renderer:THREE.WebGLRenderer,resize:() => void,dispose:() => void}}
 */
export function createScene(container) {
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 480;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05080e, 0.008); // matches --bg-0

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 0, 120);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D mind map of Intrilex mechanics, workspaces, and card interactions');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  // Lighting: ambient + cyan/magenta accent point lights.
  const ambient = new THREE.AmbientLight(0x404040, 0.5);
  scene.add(ambient);
  const cyanLight = new THREE.PointLight(0x5ad7e8, 1, 200);
  cyanLight.position.set(60, 40, 80);
  scene.add(cyanLight);
  const magentaLight = new THREE.PointLight(0xee6cb7, 0.6, 200);
  magentaLight.position.set(-60, -40, 80);
  scene.add(magentaLight);

  /** Resize the renderer to the container's current size. */
  function resize() {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 480;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  /** Dispose all GPU resources owned by the scene graph. */
  function dispose() {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose?.();
          m.dispose?.();
        }
      }
    });
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  return { scene, camera, renderer, resize, dispose };
}
