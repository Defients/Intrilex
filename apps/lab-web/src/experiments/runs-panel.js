// ═══════════════════════════════════════════════════════════════
// runs-panel.js — Runs management surface inside the Experiment dialog
//
// Presents the Experiment → Run → Analysis Set model:
//   Evidence strip  — how many games/runs currently support the analysis
//   Manage Runs     — per-run include/exclude, lifecycle, provenance,
//                     compatibility badges, guarded delete
//
// Rendering is string-template + delegated events, matching the rest of
// lab-web. All curation goes through experiment-controller.mjs — this file
// never touches the store or state.observatory directly.
// ═══════════════════════════════════════════════════════════════

import { esc, fmt, pct, short, showToast } from '../state.js';
import {
  experimentsReady, getExperiment, runsWithCompatibility, getEvidenceBasis,
  setRunIncluded, setRunExcluded, markRunInvalidated, markRunArchived,
  markRunRestored, markRunPinned, deleteRun, isolateRun, includeAllCompatible,
  previewRunSelection, allRunIds,
} from './experiment-controller.mjs';
import {
  EXCLUSION_REASONS, COMPATIBILITY, RUN_STATUS, RUN_LIFECYCLE, BUNDLED_RUN_ID,
} from '../../../../packages/simulation-runtime/src/experiment-domain.mjs';

const REASON_LABELS = {
  'configuration-mismatch': 'Configuration mismatch',
  'engine-defect': 'Known engine defect',
  'corrupted-incomplete': 'Corrupted / incomplete run',
  'superseded-ruleset': 'Superseded ruleset',
  'exploratory': 'Exploratory run',
  'duplicate': 'Duplicate / redundant evidence',
  'other': 'Other',
};

// Panel-local UI state (survives re-renders, not reloads — intentional)
const panel = { open: false, filter: 'all', expanded: null, excluding: null, invalidating: null, confirmDelete: null, previewAll: false };

const runLabel = run => run.runId === BUNDLED_RUN_ID ? 'CORPUS' : `#${String(run.ordinal).padStart(3, '0')}`;
const matchupLabel = run => {
  const ids = run.config?.policyIds;
  if (Array.isArray(ids) && ids.length === 2) return `${ids[0]} vs ${ids[1]}`;
  return run.config?.profileId ?? '—';
};
const headlineLabel = run => {
  const pr = run.metrics?.policyResults;
  const ids = run.config?.policyIds;
  if (pr && Array.isArray(ids) && ids.length === 2 && pr[ids[0]] && pr[ids[1]]) {
    return `${pct(pr[ids[0]].winRate)} / ${pct(pr[ids[1]].winRate)}`;
  }
  return run.metrics?.seat1WinRate != null ? `seat 1 ${pct(run.metrics.seat1WinRate)}` : '—';
};
const compatBadge = ({ compatibility, baseline }) => {
  if (baseline) return '<span class="run-badge run-baseline" title="Compatibility baseline — newest included run">Baseline</span>';
  if (compatibility.status === COMPATIBILITY.INCOMPATIBLE) return '<span class="run-badge run-incompatible" title="Material difference vs the analysis baseline">Incompatible</span>';
  if (compatibility.status === COMPATIBILITY.TREATMENT_CHANGE) return '<span class="run-badge run-treatment" title="Treatment/config differs from baseline — aggregatable, disclosed">Config Δ</span>';
  return '<span class="run-badge run-compatible">Current</span>';
};
const statusBadges = (run, row) => {
  const out = [];
  if (run.status === RUN_STATUS.FAILED) out.push('<span class="run-badge run-failed">Failed</span>');
  if (run.status === RUN_STATUS.CANCELLED) out.push('<span class="run-badge run-failed">Cancelled</span>');
  if (run.lifecycle?.state === RUN_LIFECYCLE.INVALIDATED) out.push('<span class="run-badge run-invalidated">Invalidated</span>');
  if (run.lifecycle?.state === RUN_LIFECYCLE.ARCHIVED) out.push('<span class="run-badge run-archived">Archived</span>');
  if (run.lifecycle?.pinned) out.push('<span class="run-badge run-pinned">Pinned</span>');
  if (run.origin === 'bundled') out.push('<span class="run-badge run-bundled">Bundled</span>');
  if (row?.persistence === 'session-record') out.push('<span class="run-badge run-session" title="Run record could not be saved to browser storage — retained for this session only, it will be lost on reload">Not saved</span>');
  else if (run.payloadKind === 'session') out.push('<span class="run-badge run-session" title="Evidence retained for this session only — storage limit">Session only</span>');
  if (run.corrupt) out.push(`<span class="run-badge run-failed" title="Record failed integrity validation (${esc(run.corruptCode ?? 'RUN_HASH_MISMATCH')}) — quarantined, cannot contribute">Integrity failed</span>`);
  if (run.lifecycle?.integrity?.state === 'quarantined') out.push(`<span class="run-badge run-failed" title="${esc(run.lifecycle.integrity.note || 'Evidence payload failed integrity verification')} — cannot contribute">Quarantined</span>`);
  if (run.lifecycle?.integrity?.state === 'payload-unavailable') out.push(`<span class="run-badge run-failed" title="${esc(run.lifecycle.integrity.note || 'Evidence payload no longer available')} — cannot contribute">No payload</span>`);
  return out.join('');
};

/** Integrity-failed runs stay inspectable but can never be toggled into an
 * analysis set — no verified evidence exists to analyze. */
const runIntegrityBlocked = run => run.corrupt === true || run.lifecycle?.integrity?.state === 'quarantined' || run.lifecycle?.integrity?.state === 'payload-unavailable';

function exclusionBlock(exclusion) {
  if (!exclusion) return '';
  return `<div class="run-exclusion-note"><b>Excluded</b> — ${esc(REASON_LABELS[exclusion.reason] ?? exclusion.reason)}${exclusion.note ? `<br><small>${esc(exclusion.note)}</small>` : ''}${exclusion.auto ? '<br><small>auto</small>' : ''}</div>`;
}

function detailBlock(row) {
  const { run, compatibility, exclusion, included } = row;
  const c = run.config ?? {}, p = run.provenance ?? {};
  const rows = [
    ['Run ID', `<code>${esc(run.runId)}</code>`],
    ['Created', run.createdAt ? new Date(run.createdAt).toLocaleString() : '—'],
    ['Status', run.status],
    ['Games', fmt(run.metrics?.matchCount ?? 0)],
    ['Matchup', matchupLabel(run)],
    ['Profile', c.profileId ?? '—'],
    ['Preset', c.presetId ?? '—'],
    ['Seeds', c.seedStrategy ? `${c.seedStrategy}${c.ordinalStart != null ? ` · ordinals ${c.ordinalStart}–${(c.ordinalEnd ?? c.ordinalStart) - 1}` : ''}` : '—'],
    ['Workers', c.workers ?? '—'],
    ['Deep trace', c.strategicTrace ? 'yes' : 'no'],
    ['Rules', p.rulesVersion ?? '—'],
    ['Engine', p.engineVersion ?? '—'],
    ['Lab', p.labVersion ?? '—'],
    ['Canonical hash', short(p.canonicalResultHash)],
    ['Run hash', short(run.runHash)],
  ];
  if (run.error) rows.push(['Error', `<span class="danger">${esc(run.error)}</span>`]);
  if (run.retentionNote) rows.push(['Retention', esc(run.retentionNote)]);
  rows.push(['Payload hash', short(run.payloadHash)]);
  if (run.corrupt) rows.push(['Integrity', `<span class="danger">Record failed integrity validation — ${esc(run.corruptCode ?? 'RUN_HASH_MISMATCH')}. Quarantined; it cannot contribute to any analysis.</span>`]);
  if (run.lifecycle?.integrity?.state) rows.push(['Integrity', `<span class="danger">${esc(run.lifecycle.integrity.note ?? run.lifecycle.integrity.state)}</span>`]);
  const compatDiffs = compatibility.diffs.length
    ? `<div class="run-compat-diffs"><b>Differs from baseline:</b><ul>${compatibility.diffs.map(d => `<li>${esc(d.field)}: ${esc(JSON.stringify(d.baseline))} → ${esc(JSON.stringify(d.actual))} <small>(${d.level})</small></li>`).join('')}</ul></div>`
    : '';
  const integrityBlocked = runIntegrityBlocked(run);
  const canInclude = run.status === RUN_STATUS.COMPLETED && run.lifecycle?.state !== RUN_LIFECYCLE.INVALIDATED && !integrityBlocked;
  const actions = [
    !included && canInclude ? `<button class="secondary-button" data-run-action="include" data-run="${esc(run.runId)}">${compatibility.status === COMPATIBILITY.INCOMPATIBLE ? 'Include anyway' : 'Include'}</button>` : '',
    !included && integrityBlocked && run.status === RUN_STATUS.COMPLETED ? `<span class="run-integrity-note" title="Failed-integrity records can never enter an analysis set — no verified evidence exists to analyze.">Cannot include — integrity ${esc(run.corruptCode ?? run.lifecycle?.integrity?.code ?? 'failed')}</span>` : '',
    included ? `<button class="secondary-button" data-run-action="exclude" data-run="${esc(run.runId)}">Exclude…</button>` : '',
    included && run.status === RUN_STATUS.COMPLETED && !integrityBlocked ? `<button class="ghost-button" data-run-action="isolate" data-run="${esc(run.runId)}" title="Analyze only this run">Isolate</button>` : '',
    run.status === RUN_STATUS.COMPLETED && run.lifecycle?.state === 'active' ? `<button class="ghost-button" data-run-action="invalidate" data-run="${esc(run.runId)}">Invalidate…</button>` : '',
    run.lifecycle?.state === RUN_LIFECYCLE.INVALIDATED ? `<button class="secondary-button" data-run-action="restore" data-run="${esc(run.runId)}">Restore (clear invalidation)</button>` : '',
    run.lifecycle?.state === RUN_LIFECYCLE.ARCHIVED ? `<button class="secondary-button" data-run-action="unarchive" data-run="${esc(run.runId)}">Unarchive</button>` : `<button class="ghost-button" data-run-action="archive" data-run="${esc(run.runId)}">Archive</button>`,
    `<button class="ghost-button" data-run-action="pin" data-run="${esc(run.runId)}">${run.lifecycle?.pinned ? 'Unpin' : 'Pin'}</button>`,
    run.runId !== BUNDLED_RUN_ID ? `<button class="ghost-button danger" data-run-action="delete" data-run="${esc(run.runId)}">${panel.confirmDelete === run.runId ? 'Confirm delete — evidence is removed permanently' : 'Delete run'}</button>` : '',
  ].filter(Boolean).join(' ');
  const exForm = panel.excluding === run.runId ? exclusionForm(run, 'exclude') : '';
  const invForm = panel.invalidating === run.runId ? exclusionForm(run, 'invalidate') : '';
  return `<div class="run-detail"><dl class="definition-list run-provenance">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${typeof v === 'string' && v.startsWith('<') ? v : esc(String(v))}</dd></div>`).join('')}</dl>
    ${compatDiffs}${exclusionBlock(exclusion)}${exForm}${invForm}
    <div class="run-actions">${actions}</div></div>`;
}

function exclusionForm(run, mode) {
  const isInvalidate = mode === 'invalidate';
  return `<form class="run-exclusion-form" data-run-form="${mode}" data-run="${esc(run.runId)}">
    <b>${isInvalidate ? 'Invalidate run — marks evidence defective' : 'Exclude run from analysis'}</b>
    <label>Reason <select name="reason">${EXCLUSION_REASONS.map(r => `<option value="${r}">${esc(REASON_LABELS[r] ?? r)}</option>`).join('')}</select></label>
    <label>Note <input name="note" type="text" maxlength="240" placeholder="Optional — why this run should not count" /></label>
    <div class="run-actions"><button type="submit" class="secondary-button">${isInvalidate ? 'Invalidate' : 'Exclude'}</button><button type="button" class="ghost-button" data-run-action="cancel-form">Cancel</button></div>
  </form>`;
}

function rowHtml(row) {
  const { run, included } = row;
  const expanded = panel.expanded === run.runId;
  const canToggle = run.status === RUN_STATUS.COMPLETED && run.lifecycle?.state !== RUN_LIFECYCLE.INVALIDATED && !runIntegrityBlocked(run);
  const checkbox = canToggle
    ? `<input type="checkbox" class="run-include-toggle" data-run="${esc(run.runId)}" ${included ? 'checked' : ''} aria-label="Include ${esc(runLabel(run))} in analysis" />`
    : '<span class="run-toggle-locked" aria-hidden="true">—</span>';
  const cls = ['run-row'];
  if (!included) cls.push('run-excluded');
  if (run.lifecycle?.state === RUN_LIFECYCLE.INVALIDATED) cls.push('run-invalidated-row');
  if (run.lifecycle?.state === RUN_LIFECYCLE.ARCHIVED) cls.push('run-archived-row');
  return `<div class="${cls.join(' ')}" data-run-row="${esc(run.runId)}">
    <div class="run-row-main">
      ${checkbox}
      <button class="run-row-label" data-run-action="expand" data-run="${esc(run.runId)}" aria-expanded="${expanded}">
        <b>${esc(runLabel(run))}</b>
        <span>${fmt(run.metrics?.matchCount ?? 0)} games</span>
        <span class="run-matchup">${esc(matchupLabel(run))}</span>
        <span class="run-headline">${esc(headlineLabel(run))}</span>
        <span class="run-badges">${compatBadge(row)}${statusBadges(run, row)}</span>
        <span class="run-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
      </button>
    </div>
    ${expanded ? detailBlock(row) : ''}
  </div>`;
}

/** Evidence strip shown above the run controls — the "what am I analyzing"
 * disclosure. Kept honest: excluded counts and fallback are always shown. */
export function renderEvidenceStrip() {
  const host = document.querySelector('#exp-evidence');
  if (!host) return;
  if (!experimentsReady()) { host.innerHTML = ''; return; }
  const basis = getEvidenceBasis();
  const experiment = getExperiment();
  const warnings = basis.warnings.length;
  if (basis.fallback === 'certified-baseline') {
    host.innerHTML = `<div class="exp-evidence"><div class="exp-evidence-main"><span class="exp-evidence-label">Evidence</span><b>Certified baseline</b><small>${basis.totalRuns ? `${basis.totalRuns} stored run${basis.totalRuns === 1 ? '' : 's'} — none included` : 'bundled corpus · no session runs yet'}</small></div><button class="secondary-button" id="exp-runs-toggle" type="button">${panel.open ? 'Hide runs' : 'Manage runs'}${basis.totalRuns ? ` (${basis.totalRuns})` : ''}</button></div>`;
  } else {
    const excluded = basis.excludedRunCount ? ` · ${basis.excludedRunCount} excluded` : '';
    // Retention honesty: session-only evidence is part of the analysis basis
    // and must be disclosed wherever the basis is stated — never implied durable.
    const sessionRuns = (basis.memoryOnlyRunCount ?? 0) + (basis.sessionPayloadRunCount ?? 0);
    const sessionNote = sessionRuns
      ? `<small class="exp-evidence-warn">⚠ ${sessionRuns} run${sessionRuns === 1 ? '' : 's'} retained for this session only${basis.memoryOnlyRunCount ? ' — reload loses them' : ''}</small>` : '';
    host.innerHTML = `<div class="exp-evidence"><div class="exp-evidence-main"><span class="exp-evidence-label">Evidence</span><b>${fmt(basis.includedGames)} games</b><small>${basis.includedRunCount}/${basis.totalRuns} runs included${excluded} · ${esc(experiment?.name ?? '')}</small>${sessionNote}${warnings ? `<small class="exp-evidence-warn">⚠ ${warnings} run${warnings === 1 ? '' : 's'} differ from baseline</small>` : ''}</div><button class="secondary-button" id="exp-runs-toggle" type="button">${panel.open ? 'Hide runs' : 'Manage runs'} (${basis.totalRuns})</button></div>`;
  }
  host.querySelector('#exp-runs-toggle')?.addEventListener('click', toggleRunsPanel);
}

export function toggleRunsPanel() {
  panel.open = !panel.open;
  renderEvidenceStrip();
  renderRunsPanel();
}

function _visibleRows(rows) {
  const f = panel.filter;
  return rows.filter(row => {
    const { run, included } = row;
    if (f === 'included') return included;
    if (f === 'excluded') return !included && run.lifecycle?.state === 'active' && run.status === RUN_STATUS.COMPLETED;
    if (f === 'warnings') return row.compatibility.status !== COMPATIBILITY.COMPATIBLE;
    if (f === 'invalidated') return run.lifecycle?.state === RUN_LIFECYCLE.INVALIDATED;
    if (f === 'integrity') return runIntegrityBlocked(run);
    if (f === 'archived') return run.lifecycle?.state === RUN_LIFECYCLE.ARCHIVED;
    if (f === 'all') return run.lifecycle?.state !== RUN_LIFECYCLE.ARCHIVED;
    return true;
  });
}

export function renderRunsPanel() {
  const host = document.querySelector('#exp-runs');
  if (!host) return;
  if (!panel.open || !experimentsReady()) { host.hidden = true; host.innerHTML = ''; document.querySelector('#experiment-dialog')?.classList.remove('runs-open'); return; }
  document.querySelector('#experiment-dialog')?.classList.add('runs-open');
  const rows = runsWithCompatibility();
  const basis = getEvidenceBasis();
  const visible = _visibleRows(rows);
  const preview = panel.previewAll ? previewRunSelection(allRunIds()) : null;
  host.hidden = false;
  host.innerHTML = `<div class="runs-panel">
    <div class="runs-head">
      <div class="runs-head-left"><b>Runs</b><small>${basis.includedRunCount}/${basis.totalRuns} included · ${fmt(basis.includedGames)} games in analysis</small>${(basis.corruptCount + basis.quarantinedCount + basis.payloadUnavailableCount) ? `<small class="exp-evidence-warn">⚠ ${fmt(basis.corruptCount + basis.quarantinedCount + basis.payloadUnavailableCount)} run${basis.corruptCount + basis.quarantinedCount + basis.payloadUnavailableCount === 1 ? '' : 's'} quarantined or missing evidence — never contributes</small>` : ''}</div>
      <div class="runs-head-right">
        <select id="exp-runs-filter" aria-label="Filter runs">
          ${[['all', 'All active'], ['included', 'Included'], ['excluded', 'Excluded'], ['warnings', 'Compatibility warnings'], ['integrity', 'Integrity failures'], ['invalidated', 'Invalidated'], ['archived', 'Archived']].map(([v, l]) => `<option value="${v}" ${panel.filter === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="ghost-button" id="exp-runs-include-compat" type="button" title="Include every run compatible with the baseline">Include all compatible</button>
        <button class="ghost-button" id="exp-runs-preview" type="button" aria-pressed="${panel.previewAll}">${panel.previewAll ? 'Hide preview' : 'Preview all runs'}</button>
      </div>
    </div>
    ${preview ? `<div class="runs-preview"><b>Preview — all ${preview.runCount} completed runs:</b> ${fmt(preview.games)} games · seat 1 ${pct(preview.seat1WinRate)}${basis.excludedRunCount ? ` (${fmt(preview.games - basis.includedGames)} more games than current selection)` : ''}</div>` : ''}
    <div class="runs-list" role="list">${visible.length ? visible.map(rowHtml).join('') : '<div class="empty-state"><strong>No runs match this filter</strong>Run a batch or change the filter.</div>'}</div>
    <p class="runs-foot">Runs are immutable evidence. Exclusion removes a run from analysis — it never deletes it. ${(() => {
      if (!basis.persisted) return '<b>Storage unavailable: runs persist for this session only.</b>';
      const sessionRuns = (basis.memoryOnlyRunCount ?? 0) + (basis.sessionPayloadRunCount ?? 0);
      if (!sessionRuns) return '';
      return `<b>${sessionRuns} run${sessionRuns === 1 ? '' : 's'} retained for this session only${basis.memoryOnlyRunCount ? ' — reload loses unsaved records' : ' — reload loses their evidence payloads'}.</b>`;
    })()}</p>
  </div>`;

  host.querySelector('#exp-runs-filter')?.addEventListener('change', e => { panel.filter = e.target.value; renderRunsPanel(); });
  host.querySelector('#exp-runs-include-compat')?.addEventListener('click', async () => { await _guarded(includeAllCompatible(), 'Compatible runs included'); });
  host.querySelector('#exp-runs-preview')?.addEventListener('click', () => { panel.previewAll = !panel.previewAll; renderRunsPanel(); });
  host.querySelectorAll('[data-run-action]').forEach(el => el.addEventListener('click', _onRunAction));
  host.querySelectorAll('.run-include-toggle').forEach(el => el.addEventListener('change', _onIncludeToggle));
  host.querySelectorAll('form[data-run-form]').forEach(f => f.addEventListener('submit', _onRunFormSubmit));
}

async function _onIncludeToggle(e) {
  const checkbox = e.currentTarget;
  const runId = checkbox.dataset.run;
  if (checkbox.checked) {
    await _guarded((async () => {
      const result = await setRunIncluded(runId, { force: false });
      if (result?.requiresForce) {
        // Never silently include a materially different run — expand its
        // provenance so the explicit "Include anyway" button is visible.
        panel.expanded = runId;
        checkbox.checked = false;
      }
      return result;
    })(), null);
    return;
  }
  panel.excluding = runId;
  panel.invalidating = null;
  panel.expanded = runId;
  checkbox.checked = true; // stays included until the reason form confirms
  renderRunsPanel();
}

async function _guarded(promise, okMessage) {
  try {
    const result = await promise;
    if (result?.requiresForce) {
      showToast('Run differs materially from the baseline — use “Include anyway” in the run details.', { type: 'warning', title: 'Incompatible run' });
    } else if (okMessage) {
      showToast(okMessage, { type: 'success', title: 'Runs' });
    }
  } catch (error) {
    showToast(error?.message ?? 'Action failed', { type: 'error', title: 'Runs' });
  } finally {
    panel.confirmDelete = null;
    renderRunsPanel();
    renderEvidenceStrip();
  }
}

async function _onRunAction(e) {
  const action = e.currentTarget.dataset.runAction;
  const runId = e.currentTarget.dataset.run;
  if (action === 'expand') {
    panel.expanded = panel.expanded === runId ? null : runId;
    panel.excluding = null; panel.invalidating = null; panel.confirmDelete = null;
    renderRunsPanel();
    return;
  }
  if (action === 'cancel-form') { panel.excluding = null; panel.invalidating = null; renderRunsPanel(); return; }
  if (action === 'exclude') { panel.excluding = runId; panel.invalidating = null; renderRunsPanel(); return; }
  if (action === 'invalidate') { panel.invalidating = runId; panel.excluding = null; renderRunsPanel(); return; }
  if (action === 'include') {
    await _guarded((async () => {
      const first = await setRunIncluded(runId, { force: false });
      if (first?.requiresForce) return setRunIncluded(runId, { force: true });
      return first;
    })(), null);
    return;
  }
  if (action === 'isolate') { await _guarded(isolateRun(runId), 'Analyzing this run only'); return; }
  if (action === 'restore') { await _guarded(markRunRestored(runId), 'Run restored'); return; }
  if (action === 'archive') { await _guarded(markRunArchived(runId, true), 'Run archived'); return; }
  if (action === 'unarchive') { await _guarded(markRunArchived(runId, false), 'Run unarchived'); return; }
  if (action === 'pin') {
    const run = runsWithCompatibility().find(r => r.run.runId === runId)?.run;
    await _guarded(markRunPinned(runId, !(run?.lifecycle?.pinned)), run?.lifecycle?.pinned ? 'Unpinned' : 'Pinned');
    return;
  }
  if (action === 'delete') {
    if (panel.confirmDelete !== runId) { panel.confirmDelete = runId; renderRunsPanel(); return; }
    await _guarded(deleteRun(runId), 'Run deleted');
  }
}

async function _onRunFormSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const runId = form.dataset.run;
  const mode = form.dataset.runForm;
  const reason = form.elements.reason?.value ?? 'other';
  const note = form.elements.note?.value ?? '';
  panel.excluding = null; panel.invalidating = null;
  if (mode === 'invalidate') await _guarded(markRunInvalidated(runId, { reason, note }), 'Run invalidated');
  else await _guarded(setRunExcluded(runId, { reason, note }), 'Run excluded');
}
