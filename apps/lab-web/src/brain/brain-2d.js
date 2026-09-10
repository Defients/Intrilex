// ═══════════════════════════════════════════════════════════════
// brain-2d.js — A-05: Lightweight 2D SVG brain (default visualization)
//
// This module renders the mind map as a 2D SVG without loading Three.js.
// It imports only brain-data.js (self-contained, no deps) and
// brain-fallback.js (self-contained, no deps), plus shared modules that
// are already in the initial bundle (MECHANIC_REGISTRY, card-face-data,
// router, state). This keeps the 561KB Three.js chunk unloaded unless
// the user explicitly switches to 3D.
//
// The "Switch to 3D" button dispatches a CustomEvent that the host
// (app.js) listens for and responds to by loading brain-controller.js.
// ═══════════════════════════════════════════════════════════════

import { MECHANIC_REGISTRY } from '../mechanic-registry-browser.js';
import { listAuthoritativeCards } from '../card-face-data.js';
import { WORKSPACES } from '../router.js';
import { state } from '../state.js';
import {
  buildMechanicsLayer, buildWorkspaceLayer, buildCardLayer, buildCombinedLayer,
  LAYER_IDS,
} from './brain-data.js';
import { renderFallback } from './brain-fallback.js';

const SECTIONS = [
  { label: 'Analysis', routes: ['/watch', '/caster', '/replays', '/history', '/mechanics', '/synergies'] },
  { label: 'Investigation', routes: ['/ranks', '/compare', '/traces', '/branches', '/diagnostics', '/tournament'] },
  { label: 'System', routes: ['/evidence', '/intelligence'] },
];

/**
 * Initialize the 2D SVG brain inside a container element.
 * @param {HTMLElement} container
 * @returns {{ destroy: () => void } | null}
 */
export function init2dBrain(container) {
  if (!container || !container.isConnected) return null;
  container.innerHTML = '';

  const mechanics = Object.values(MECHANIC_REGISTRY).map((m) => ({
    mechanicId: m.mechanicId, displayName: m.displayName, category: m.category, description: m.description,
  }));
  const cards = listAuthoritativeCards();
  const observatory = state.observatory ?? {};

  const layers = {
    [LAYER_IDS.MECHANICS]: buildMechanicsLayer(mechanics, observatory),
    [LAYER_IDS.WORKSPACES]: buildWorkspaceLayer(
      /** @type {Array<[string,string,string,string]>} */ (WORKSPACES), SECTIONS),
    [LAYER_IDS.CARDS]: buildCardLayer(cards),
  };
  layers[LAYER_IDS.COMBINED] = buildCombinedLayer(
    layers[LAYER_IDS.MECHANICS], layers[LAYER_IDS.WORKSPACES], layers[LAYER_IDS.CARDS]);

  const fallbackNodes = layers[LAYER_IDS.COMBINED].nodes.slice(0, 60).map((n) => ({
    id: n.id, label: n.label, color: n.color, route: n.route ?? n.data?.route,
  }));
  renderFallback(container, fallbackNodes, [], { showToggle: true });

  return {
    destroy() { container.innerHTML = ''; },
  };
}
