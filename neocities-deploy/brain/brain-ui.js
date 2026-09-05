// ═══════════════════════════════════════════════════════════════
// brain-ui.js — DOM overlay: layer switcher, search, tooltip, detail panel
// ═══════════════════════════════════════════════════════════════
import { LAYER_IDS } from './brain-data.js?v=75c53031ef21';

const LAYER_LABELS = [
  { id: LAYER_IDS.MECHANICS, label: 'Mechanics' },
  { id: LAYER_IDS.WORKSPACES, label: 'Workspaces' },
  { id: LAYER_IDS.CARDS, label: 'Cards' },
  { id: LAYER_IDS.COMBINED, label: 'All' },
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const safeColor = (value) => /^#[0-9a-f]{3,8}$/i.test(String(value ?? ''))
  ? String(value)
  : '#8ea5b2';

/** @typedef {{id:string,label:string,category:string,color:string,route?:string,data?:{route?:string,description?:string}}} OverlayNode */

/**
 * Build the DOM overlay (layer switcher, search, tooltip, detail panel,
 * cluster controls, help hint) inside a container.
 * @param {HTMLElement} container
 * @param {object} handlers
 * @param {(layer:string)=>void} handlers.onLayerChange
 * @param {(query:string)=>void} handlers.onSearch
 * @param {(category:string,collapsed:boolean)=>void} handlers.onToggleCluster
 * @returns {{root:HTMLElement,tooltip:HTMLElement,detailPanel:HTMLElement,clusterControls:HTMLElement,searchInput:HTMLInputElement,destroy:()=>void,showTooltip:(text:string,x:number,y:number)=>void,hideTooltip:()=>void,showDetail:(node:OverlayNode,connectedNodes?:OverlayNode[])=>void,hideDetail:()=>void,setLayer:(layerId:string)=>void,setCategories:(categories:string[])=>void,setNodes:(nodes:OverlayNode[])=>void}}
 */
export function buildOverlay(container, handlers) {
  const root = document.createElement('div');
  root.className = 'brain-overlay';
  root.innerHTML = `
    <div class="brain-layer-switcher" role="tablist" aria-label="Mind map layers">
      ${LAYER_LABELS.map((l, i) => `<button class="brain-layer-btn${i === 0 ? ' active' : ''}" data-layer="${escapeHtml(l.id)}" role="tab" aria-selected="${i === 0}">${escapeHtml(l.label)}</button>`).join('')}
    </div>
    <div class="brain-search-wrap">
      <input type="search" class="brain-search" placeholder="Filter nodes…  (press /)" aria-label="Filter mind map nodes" autocomplete="off" spellcheck="false" />
    </div>
    <div class="brain-tooltip" role="tooltip" hidden></div>
    <aside class="brain-detail-panel" aria-label="Node details" hidden></aside>
    <div class="brain-cluster-controls" aria-label="Cluster collapse controls"></div>
    <details class="brain-node-access">
      <summary>Keyboard node list</summary>
      <div class="brain-node-access-list" role="list" aria-label="Nodes in the selected layer"></div>
    </details>
    <div class="brain-help-hint" aria-hidden="true">Drag to orbit · Scroll to zoom · Click nodes for details</div>
  `;
  container.appendChild(root);

  const layerBtns = /** @type {NodeListOf<HTMLButtonElement>} */ (root.querySelectorAll('.brain-layer-btn'));
  const searchInput = /** @type {HTMLInputElement} */ (root.querySelector('.brain-search'));
  const tooltip = /** @type {HTMLElement} */ (root.querySelector('.brain-tooltip'));
  const detailPanel = /** @type {HTMLElement} */ (root.querySelector('.brain-detail-panel'));
  const clusterControls = /** @type {HTMLElement} */ (root.querySelector('.brain-cluster-controls'));
  const nodeAccessList = /** @type {HTMLElement} */ (root.querySelector('.brain-node-access-list'));

  layerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      layerBtns.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      handlers.onLayerChange(btn.dataset.layer ?? LAYER_IDS.MECHANICS);
    });
  });

  searchInput.addEventListener('input', () => handlers.onSearch(searchInput.value));

  /** @param {string} text @param {number} x @param {number} y */
  function showTooltip(text, x, y) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = `${x + 14}px`;
    tooltip.style.top = `${y + 14}px`;
  }
  function hideTooltip() { tooltip.hidden = true; }

  /** @param {OverlayNode} node @param {OverlayNode[]} [connectedNodes] */
  function showDetail(node, connectedNodes) {
    const route = node.route ?? node.data?.route;
    const exploreLink = route ? `<a class="brain-detail-explore" href="#${escapeHtml(route)}">Explore in workspace →</a>` : '';
    const connected = (connectedNodes ?? []).slice(0, 12)
      .map((n) => `<button class="brain-detail-connected" data-node-id="${escapeHtml(n.id)}">${escapeHtml(n.label)}</button>`).join('');
    detailPanel.innerHTML = `
      <div class="brain-detail-header">
        <span class="brain-detail-badge" style="background:${safeColor(node.color)}"></span>
        <h3 class="brain-detail-title">${escapeHtml(node.label)}</h3>
        <button class="brain-detail-close" aria-label="Close details">&times;</button>
      </div>
      <p class="brain-detail-category">${escapeHtml(node.category)}</p>
      ${node.data?.description ? `<p class="brain-detail-desc">${escapeHtml(node.data.description)}</p>` : ''}
      ${exploreLink}
      ${connected ? `<div class="brain-detail-connected-wrap"><h4>Connected</h4><div class="brain-detail-connected-list">${connected}</div></div>` : ''}
    `;
    detailPanel.hidden = false;
    detailPanel.classList.add('open');
    detailPanel.querySelector('.brain-detail-close')?.addEventListener('click', hideDetail);
    const connectedButtons = /** @type {NodeListOf<HTMLButtonElement>} */ (detailPanel.querySelectorAll('.brain-detail-connected'));
    connectedButtons.forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.nodeId;
        detailPanel.dispatchEvent(new CustomEvent('brain:select', { detail: { id } }));
      });
    });
  }
  function hideDetail() {
    detailPanel.hidden = true;
    detailPanel.classList.remove('open');
    detailPanel.innerHTML = '';
  }

  /** @param {string} layerId */
  function setLayer(layerId) {
    layerBtns.forEach((b) => {
      const active = b.dataset.layer === layerId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }

  /** @param {string[]} categories */
  function setCategories(categories) {
    clusterControls.innerHTML = categories.map((c) =>
      `<button class="brain-cluster-btn" data-category="${escapeHtml(c)}" aria-pressed="false">${escapeHtml(c)}</button>`).join('');
    const clusterButtons = /** @type {NodeListOf<HTMLButtonElement>} */ (clusterControls.querySelectorAll('.brain-cluster-btn'));
    clusterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!pressed));
        handlers.onToggleCluster(btn.dataset.category ?? '', !pressed);
      });
    });
  }

  /** @param {OverlayNode[]} nodes */
  function setNodes(nodes) {
    nodeAccessList.replaceChildren(...nodes.map((node) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'brain-node-access-btn';
      button.textContent = `${node.label} — ${node.category}`;
      button.addEventListener('click', () => {
        detailPanel.dispatchEvent(new CustomEvent('brain:select', { detail: { id: node.id } }));
      });
      return button;
    }));
  }

  function destroy() { root.remove(); }

  return { root, tooltip, detailPanel, clusterControls, searchInput,
    showTooltip, hideTooltip, showDetail, hideDetail, setLayer, setCategories, setNodes, destroy };
}
