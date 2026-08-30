// ═══════════════════════════════════════════════════════════════
// brain-ui.js — DOM overlay: layer switcher, search, tooltip, detail panel
// ═══════════════════════════════════════════════════════════════
import { LAYER_IDS } from './brain-data.js';

const LAYER_LABELS = [
  { id: LAYER_IDS.MECHANICS, label: 'Mechanics' },
  { id: LAYER_IDS.WORKSPACES, label: 'Workspaces' },
  { id: LAYER_IDS.CARDS, label: 'Cards' },
  { id: LAYER_IDS.COMBINED, label: 'All' },
];

/**
 * Build the DOM overlay (layer switcher, search, tooltip, detail panel,
 * cluster controls, help hint) inside a container.
 * @param {HTMLElement} container
 * @param {object} handlers
 * @param {(layer:string)=>void} handlers.onLayerChange
 * @param {(query:string)=>void} handlers.onSearch
 * @param {(category:string,collapsed:boolean)=>void} handlers.onToggleCluster
 * @returns {{root:HTMLElement,tooltip:HTMLElement,detailPanel:HTMLElement,destroy:()=>void,showTooltip:*,hideTooltip:*,showDetail:*,hideDetail:*,setLayer:*,setCategories:*}}
 */
export function buildOverlay(container, handlers) {
  const root = document.createElement('div');
  root.className = 'brain-overlay';
  root.innerHTML = `
    <div class="brain-layer-switcher" role="tablist" aria-label="Mind map layers">
      ${LAYER_LABELS.map((l, i) => `<button class="brain-layer-btn${i === 0 ? ' active' : ''}" data-layer="${l.id}" role="tab" aria-selected="${i === 0}">${l.label}</button>`).join('')}
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

  const layerBtns = root.querySelectorAll('.brain-layer-btn');
  const searchInput = root.querySelector('.brain-search');
  const tooltip = root.querySelector('.brain-tooltip');
  const detailPanel = root.querySelector('.brain-detail-panel');
  const clusterControls = root.querySelector('.brain-cluster-controls');
  const nodeAccessList = root.querySelector('.brain-node-access-list');

  layerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      layerBtns.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      handlers.onLayerChange(btn.dataset.layer);
    });
  });

  searchInput.addEventListener('input', () => handlers.onSearch(searchInput.value));

  function showTooltip(text, x, y) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = `${x + 14}px`;
    tooltip.style.top = `${y + 14}px`;
  }
  function hideTooltip() { tooltip.hidden = true; }

  function showDetail(node, connectedNodes) {
    const route = node.route ?? node.data?.route;
    const exploreLink = route ? `<a class="brain-detail-explore" href="#${route}">Explore in workspace →</a>` : '';
    const connected = (connectedNodes ?? []).slice(0, 12)
      .map((n) => `<button class="brain-detail-connected" data-node-id="${n.id}">${n.label}</button>`).join('');
    detailPanel.innerHTML = `
      <div class="brain-detail-header">
        <span class="brain-detail-badge" style="background:${node.color}"></span>
        <h3 class="brain-detail-title">${node.label}</h3>
        <button class="brain-detail-close" aria-label="Close details">&times;</button>
      </div>
      <p class="brain-detail-category">${node.category}</p>
      ${node.data?.description ? `<p class="brain-detail-desc">${node.data.description}</p>` : ''}
      ${exploreLink}
      ${connected ? `<div class="brain-detail-connected-wrap"><h4>Connected</h4><div class="brain-detail-connected-list">${connected}</div></div>` : ''}
    `;
    detailPanel.hidden = false;
    detailPanel.classList.add('open');
    detailPanel.querySelector('.brain-detail-close')?.addEventListener('click', hideDetail);
    detailPanel.querySelectorAll('.brain-detail-connected').forEach((b) => {
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

  function setLayer(layerId) {
    layerBtns.forEach((b) => {
      const active = b.dataset.layer === layerId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }

  function setCategories(categories) {
    clusterControls.innerHTML = categories.map((c) =>
      `<button class="brain-cluster-btn" data-category="${c}" aria-pressed="false">${c}</button>`).join('');
    clusterControls.querySelectorAll('.brain-cluster-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!pressed));
        handlers.onToggleCluster(btn.dataset.category, !pressed);
      });
    });
  }

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
