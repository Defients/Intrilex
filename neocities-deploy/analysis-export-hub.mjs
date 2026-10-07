// ═══════════════════════════════════════════════════════════════
// analysis-export-hub.mjs — global Analysis Export hub anchored to the
// sidebar authority stamp ("Engine x.y.z  [⇩]").
//
// The trigger opens a compact NON-modal panel (no focus trap, no backdrop
// scroll-lock) exposing the three canonical dossier formats plus a live
// Evidence Status readout. Both the status and the exports come from the
// same collected evidence state — the panel can never disagree with the
// document it produces.
// ═══════════════════════════════════════════════════════════════

import { esc, fmt } from './state.js';
import { invokeAppAction } from './rerender.js';

const DEEP_TRACKING_LABELS = {
  unavailable: 'unavailable',
  none: 'none',
  'enabled-no-evidence': 'enabled · no retained evidence',
  persisted: null, // resolved with the decision count
  'imported-unverified': 'imported / unverified',
  'historical-only': 'historical only',
};

function deepTrackingLabel(dt) {
  if (!dt || dt.state === 'persisted') {
    const n = dt?.decisionEvents ?? 0;
    return `${fmt(n)} decision${n === 1 ? '' : 's'}`;
  }
  const label = DEEP_TRACKING_LABELS[dt.state] ?? 'none';
  return (dt.state === 'imported-unverified' || dt.state === 'historical-only')
    ? `${label} (${fmt(dt.decisionEvents ?? 0)} events)` : label;
}

export function initAnalysisExportHub() {
  const trigger = document.querySelector('#analysis-export-trigger');
  const hub = document.querySelector('#analysis-export-hub');
  if (!trigger || !hub) return;
  const rows = hub.querySelector('#export-status-rows');
  const warnBox = hub.querySelector('#export-status-warnings');
  let statusToken = 0;

  const isOpen = () => !hub.hidden;

  // Anchor the panel just above the trigger (bottom-left sidebar footer).
  const positionHub = () => {
    const r = trigger.getBoundingClientRect();
    hub.style.left = `${Math.max(8, r.left)}px`;
    hub.style.bottom = `${Math.max(8, window.innerHeight - r.top + 8)}px`;
    hub.style.maxHeight = `${Math.max(200, r.top - 16)}px`;
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (!isOpen()) return;
    hub.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };

  const renderStatus = async () => {
    const token = ++statusToken;
    if (rows) rows.innerHTML = '<div class="export-status-row"><small>Status</small><b>reading evidence stores…</b></div>';
    try {
      const { dossierEvidenceStatus } = await import('./analysis-dossier-export.js');
      const s = await dossierEvidenceStatus();
      if (token !== statusToken || !isOpen()) return; // closed or superseded
      const row = (k, v) => `<div class="export-status-row"><small>${esc(k)}</small><b>${esc(v)}</b></div>`;
      if (rows) rows.innerHTML = [
        row('Source', s.sourceLabel ?? 'unknown'),
        row('Matches', s.matches == null ? 'unavailable' : fmt(s.matches)),
        row('Deep Tracking', deepTrackingLabel(s.deepTracking)),
        row('Lab runs', s.labRuns?.label ?? '0 attached'),
      ].join('');
      if (warnBox) {
        warnBox.hidden = !(s.warnings?.length);
        warnBox.innerHTML = (s.warnings ?? []).map(w => `<li>${esc(w)}</li>`).join('');
      }
    } catch (error) {
      if (token !== statusToken || !isOpen()) return;
      if (rows) rows.innerHTML = `<div class="export-status-row"><small>Status</small><b>unavailable — ${esc(error?.message ?? 'error')}</b></div>`;
    }
  };

  const open = () => {
    positionHub();
    hub.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    renderStatus();
    hub.querySelector('.export-choice')?.focus();
  };

  // The trigger lives inside <summary>: preventDefault keeps the details
  // element from toggling; the button itself owns the panel toggle.
  trigger.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen()) close({ restoreFocus: false });
    else open();
  });

  hub.querySelector('#analysis-export-close')?.addEventListener('click', () => close());

  // Escape closes from anywhere while open — the panel is non-modal so no
  // focus trap is needed; focus returns to the trigger.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); }
  });
  document.addEventListener('pointerdown', e => {
    if (!isOpen()) return;
    if (hub.contains(e.target) || trigger.contains(e.target)) return;
    close({ restoreFocus: false });
  });
  window.addEventListener('resize', () => { if (isOpen()) positionHub(); });

  // All three formats invoke the same canonical exporter the Evidence
  // workspace uses — no separate generation path. The button is disabled
  // while the export runs so rapid clicks cannot duplicate downloads.
  for (const btn of hub.querySelectorAll('[data-export-format]')) {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('busy');
      try {
        await invokeAppAction('exportAnalysisDossier', btn.dataset.exportFormat);
      } finally {
        btn.disabled = false;
        btn.classList.remove('busy');
      }
    });
  }
}
