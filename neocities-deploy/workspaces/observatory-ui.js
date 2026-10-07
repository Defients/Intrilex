// ═══════════════════════════════════════════════════════════════
// workspaces/observatory-ui.js — shared Observatory presentation
// primitives. Extracted from the Ranks design grammar: summary
// strips, evidence badges, inspector dossiers, chart panels, and a
// compact provenance context strip. Presentation only — no
// statistical derivation happens here.
// ═══════════════════════════════════════════════════════════════

import { esc, fmt, short } from '../state.js?v=943d1ec6c237';

export const EVIDENCE_GRADE_RANK = { ROBUST: 4, SUPPORTED: 3, EXPLORATORY: 2, INSUFFICIENT: 1, strong: 4, moderate: 3, weak: 2, insufficient: 1 };

/** Map an evidence grade (or legacy strength label) to a badge tone class. */
export function evidenceTone(grade) {
  const rank = EVIDENCE_GRADE_RANK[grade] ?? 0;
  if (rank >= 3) return 'supported';
  if (rank >= 2) return 'info';
  return 'warning';
}

/**
 * Compact evidence-grade pill. Optionally scoped (e.g. 'association
 * evidence grade') so the badge is never misread as a balance verdict.
 */
export function evidenceBadge(grade, { scope, reasons } = {}) {
  const g = grade ?? 'INSUFFICIENT';
  const tip = [scope, ...(reasons ?? [])].filter(Boolean).join(' · ');
  return `<span class="badge badge-${evidenceTone(g)}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(g)}</span>`;
}

/**
 * Compact dataset/provenance context strip — answers "what data am I
 * looking at?" on every Observatory page without opening Evidence.
 * Renders only fields that are actually present.
 */
export function obsContextStrip(o) {
  if (!o) return '';
  const h = o.campaignHealth ?? {};
  const chips = [
    o.origin === 'EVOLUTION_LAB' ? 'Dataset: evolution lab (pooled matrices)' : 'Dataset: certified campaign',
    Number.isFinite(o.summaryCount) ? `${fmt(o.summaryCount)} matches` : null,
    o.profileId ? `Profile ${o.profileId}` : null,
    o.evidenceEpoch ? `Epoch ${o.evidenceEpoch}` : null,
    o.engineVersion || o.rulesVersion ? `Engine ${o.engineVersion ?? '—'} · Rules ${o.rulesVersion ?? '—'}` : null,
    o.observatoryHash ? `Analytics ${short(o.observatoryHash)}` : null,
    (h.incompleteABBA ?? 0) > 0 ? `${fmt(h.incompleteABBA)} unpaired AB/BA runs` : null,
  ].filter(Boolean);
  if (!chips.length) return '';
  return `<div class="obs-context" role="note" aria-label="Dataset and provenance context">${chips.map(c => `<span class="obs-context-chip">${esc(c)}</span>`).join('')}<a class="obs-context-link" href="#/evidence">Provenance & capability →</a></div>`;
}

/**
 * Ranks-style summary stat strip. Cards: {label, value|valueHtml,
 * sub|subHtml, tone ('lead'|'alert'|'positive'|'negative'), title}.
 */
export function metricStrip(cards) {
  const items = (cards ?? []).filter(Boolean);
  if (!items.length) return '';
  return `<div class="obs-stat-grid" role="list">${items.map(c => `<div class="obs-stat${c.tone ? ` obs-stat-${c.tone}` : ''}" role="listitem"${c.title ? ` title="${esc(c.title)}"` : ''}><small>${esc(c.label)}</small><b>${c.valueHtml ?? esc(String(c.value))}</b>${c.sub || c.subHtml ? `<span class="obs-stat-sub">${c.subHtml ?? esc(String(c.sub))}</span>` : ''}</div>`).join('')}</div>`;
}

/**
 * Standard Observatory chart panel — collapsible <details> with an icon
 * header, chart body, and an optional accessible table alternative that
 * pairs with bindChartToggle.
 */
export function chartPanel({ id, icon = '▤', title, note, open = true, body = '', tableAlt, testid, aside } = {}) {
  return `<details class="ix-chart-container"${id ? ` id="${esc(id)}"` : ''}${testid ? ` data-testid="${esc(testid)}"` : ''}${open ? ' open' : ''}><summary><span class="ix-chart-heading"><span class="ix-chart-icon" aria-hidden="true">${esc(icon)}</span>${esc(title)}</span>${note ? `<small>${esc(note)}</small>` : ''}${aside ?? ''}</summary>${body}${tableAlt ? `<button class="chart-alt-toggle" data-chart-toggle aria-expanded="false">View as table</button><div data-chart-table hidden>${tableAlt}</div>` : ''}</details>`;
}

/** A titled section inside an entity/match dossier. */
export function dossierSection(title, body, { note, cls = '' } = {}) {
  if (!body) return '';
  return `<section class="dossier-section ${cls}"><div class="dossier-section-head"><h4>${esc(title)}</h4>${note ? `<small>${esc(note)}</small>` : ''}</div>${body}</section>`;
}

/** Honest empty state for missing/insufficient evidence. */
export function emptyEvidenceState(title, msg, icon = '◌') {
  return `<div class="obs-empty-evidence" role="note"><span class="obs-empty-icon" aria-hidden="true">${esc(icon)}</span><strong>${esc(title)}</strong><p>${esc(msg)}</p></div>`;
}

/**
 * Inline micro bar for compact distributions (pick rates, cohort shares,
 * entropy). Value fraction is descriptive — caller supplies semantics.
 */
export function miniBar(value, { max = 1, color = 'var(--cyan)', label, cls = '' } = {}) {
  const v = Number(value);
  const m = Number(max);
  const w = Number.isFinite(v) && m > 0 ? Math.min(1, Math.max(0, v / m)) : 0;
  return `<span class="obs-minibar ${cls}" role="img" aria-label="${esc(label ?? `${(w * 100).toFixed(0)}%`)}"><span class="obs-minibar-fill" style="width:${(w * 100).toFixed(1)}%;background:${esc(color)}"></span></span>`;
}

/** Segmented display-mode control (matrix display, scatter axis, etc.). */
export function segmentControl({ id, options, active, label } = {}) {
  const opts = (options ?? []).filter(Boolean);
  if (!opts.length || !id) return '';
  return `<div class="obs-seg" role="group"${label ? ` aria-label="${esc(label)}"` : ''}>${label ? `<span class="obs-seg-label">${esc(label)}</span>` : ''}${opts.map(o => `<button type="button" class="obs-seg-btn${o.value === active ? ' active' : ''}" data-seg-id="${esc(id)}" data-seg-value="${esc(o.value)}" aria-pressed="${o.value === active}">${esc(o.label)}</button>`).join('')}</div>`;
}

/** Status chip for control-room modules: PASS / LIMITED / UNAVAILABLE / FAIL. */
export function statusChip(status) {
  const s = String(status ?? 'UNAVAILABLE').toUpperCase();
  const tone = s === 'PASS' ? 'supported' : s === 'FAIL' ? 'alert' : s === 'LIMITED' ? 'info' : 'muted';
  return `<span class="badge badge-${tone} obs-status-chip">${esc(s)}</span>`;
}

/**
 * Compact descriptive pipeline flow (MATCHES → OBSERVATIONS → …). Each
 * step is a real count from analytics; excluded/limited steps show
 * sub-counts. Purely presentational.
 */
export function pipelineFlow(steps) {
  const list = (steps ?? []).filter(Boolean);
  if (!list.length) return '';
  return `<div class="obs-flow" role="list" aria-label="Evidence pipeline">${list.map((s, i) => `${i > 0 ? '<span class="obs-flow-arrow" aria-hidden="true">→</span>' : ''}<div class="obs-flow-step${s.limited ? ' limited' : ''}" role="listitem"><b>${esc(String(s.value))}</b><small>${esc(s.label)}</small>${s.sub ? `<em>${esc(s.sub)}</em>` : ''}</div>`).join('')}</div>`;
}
