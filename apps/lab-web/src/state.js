// ═══════════════════════════════════════════════════════════════
// state.js — Shared application state, DOM refs, and helpers.
// All workspace renderers import from here.
// ═══════════════════════════════════════════════════════════════

// ── Global error handlers ────────────────────────────────────────
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  const el = document.querySelector('#app') ?? document.body;
  const banner = document.createElement('div');
  banner.className = 'notice danger';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:12px;';
  banner.innerHTML = `<strong>Application error:</strong> ${esc(event.reason?.message ?? String(event.reason ?? 'unknown'))}`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
});
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error ?? event.message);
});

// ── DOM references ────────────────────────────────────────────────
export const app = document.querySelector('#app');
export const shell = document.querySelector('.observatory-shell');
export const landingContainer = document.querySelector('#landing-app');
export const fxLayer = document.querySelector('#fx-layer');
export const pageTitle = document.querySelector('#page-title');
export const pageSubtitle = document.querySelector('#page-subtitle');

// ── Persisted settings ───────────────────────────────────────────
// User preferences that survive page reloads. Stored under the
// `intrilex:settings` localStorage key as a single JSON blob so we
// don't litter localStorage with one key per setting.
const SETTINGS_KEY = 'intrilex:settings';
const PERSISTABLE_SETTINGS = ['reducedMotion', 'reducedSensory', 'fx', 'layout', 'visibility', 'rulesIllustrated', 'haptics', 'highContrast', 'seasonalThemes'];
const SETTINGS_DEFAULTS = { reducedMotion: false, reducedSensory: false, fx: true, layout: 'observatory', visibility: 'public', rulesIllustrated: true, haptics: true, highContrast: false, seasonalThemes: true };

function loadPersistedSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* corrupt or missing — ignore */ }
  const merged = { ...SETTINGS_DEFAULTS, ...saved };
  // Apply body classes for visual settings
  if (merged.reducedMotion) document.body.classList.add('reduced-motion');
  if (merged.reducedSensory) document.body.classList.add('reduced-sensory');
  if (!merged.fx) document.body.classList.add('fx-off');
  if (merged.highContrast) document.body.classList.add('high-contrast');
  return merged;
}

function persistSetting(key, value) {
  if (!PERSISTABLE_SETTINGS.includes(key)) return;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* ignore */ }
  saved[key] = value;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch { /* storage full or unavailable — ignore */ }
}

// ── Application state ────────────────────────────────────────────
const _persisted = loadPersistedSettings();
export const state = {
  index:null, autonomyIndex:null, corpusAnalytics:null, aggregate:null, observatory:null, capabilities:null,
  replay:null, authorized:null, replayKind:'corpus', fixtureId:'CT-001', frame:0, visibility:_persisted.visibility, viewer:'P1',
  _replayLoadedFor:null,
  playing:false, timer:null, speed:1, layout:_persisted.layout, showOrchestration:false, reducedMotion:_persisted.reducedMotion, reducedSensory:_persisted.reducedSensory, fx:_persisted.fx, rulesIllustrated:_persisted.rulesIllustrated, haptics:_persisted.haptics, highContrast:_persisted.highContrast, seasonalThemes:_persisted.seasonalThemes,
  selectedTimelineIndex:null, selectedMechanic:null, selectedSynergy:null, selectedPolicy:null, comparePolicyRight:null,
  filters:{profile:'all',evidence:'all'}, campaignWorker:null, campaignWorkers:[],
  lastCampaignResult:null, historyPage:0, historyFilterTerm:'', historyFilterReason:'all', historyFilterPolicy:'all',
  traceIndex:null, traceFilterPolicy:'all', traceSelectedId:null,
  branchReplayId:null, branchCheckpoint:0, branchAltAction:null, branchRolloutCount:32, branchContP1:'score-rush', branchContP2:'control', branchResult:null, branchResultB:null, branchComparison:null, branchRunning:false,
  branchLegalActions:null, branchSelectedActionId:null, branchLegalActionsLoading:false, branchLegalActionsError:null,
  branchAllActionsResult:null, branchAllActionsRunning:false,
  diagBaseline:null, diagCandidate:null, lastDiagResult:null,
  selectedRank:null, rankPower:null, rankAuthority:null, swapMatrix:null,
  variantAnalytics:null, variantProfileFilter:'all',
  rankAnatomyRegistry:null, anatomyTab:'overall', originFilter:'all', _rankAnatomyModule:null,
  mechanicsSortColumn:null, mechanicsSortPhase:0,
  synergiesSortColumn:null, synergiesSortPhase:0,
  // Phase 3: cross-workspace linking + interactive filtering
  mechanicsRankFilter:'all', mechanicsEvidenceFilter:'all', mechanicsMinSelections:0,
  synergiesMechanicFilter:'all', synergiesDirectionFilter:'all', synergiesMinCohort:0,
  // Phase 6: workspace section tab navigation (within-workspace UI only)
  diagActiveSection:'diagnostics', tracesActiveSection:'traces', compareActiveSection:'compare',
  // Observatory Depth II — Phase 1: motif flow
  motifNodeFilter:null, motifOutcomeFilter:'all',
  // Observatory Depth II — Phase 2: action distribution tab
  actionsDistributionTab:'overview',
  // Observatory Depth II — Phase 3: anomaly explorer
  anomalyTypeFilter:'all', anomalySeverityFilter:'all',
  // Observatory Depth II — Phase 5: match detail inspector
  historySelectedMatch:null,
  // Observatory Depth II — Phase 6: enhanced cross-workspace linking
  historyFilterMatchIds:null,
  tournament:null, tournamentSelectedPolicies:null, tournamentBestOf:1, tournamentRunning:false
};

// Re-exported so workspace modules can persist settings without importing
// the private persistSetting function by name from this module's internals.
export { persistSetting };

// ── Helper functions ─────────────────────────────────────────────
export const esc = (value='') => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt = value => new Intl.NumberFormat().format(Number(value??0));
export const pct = value => Number.isFinite(Number(value)) ? `${(Number(value)*100).toFixed(1)}%` : '—';
export const short = value => value ? `${String(value).slice(0,10)}…${String(value).slice(-6)}` : '—';
export const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

export function definitionList(entries) {
  return `<dl class="definition-list">${entries.filter(([,value])=>value!=null&&value!=='').map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${typeof value === 'string' ? esc(value) : value}</dd></div>`).join('')}</dl>`;
}

// ── Fetch helpers ────────────────────────────────────────────────
export const data = async (url, fallback=null) => { try { const response=await fetch(url); if(!response.ok) throw new Error(`${response.status} ${url}`); const ct=response.headers.get('content-type')||''; if(ct.includes('text/html')) throw new Error(`HTML response (not JSON) for ${url}`); return await response.json(); } catch(error){ if(fallback!==null)return fallback; throw error; } };
export const text = async (url, fallback='') => { try { const response=await fetch(url); if(!response.ok) throw new Error(`${response.status} ${url}`); return await response.text(); } catch(error){ console.warn('text fetch failed:',url,error.message); return fallback; } };
export function parseNdjsonSafe(raw){const lines=raw.trim()?raw.trim().split('\n'):[];const out=[];for(const line of lines){try{out.push(JSON.parse(line));}catch{console.warn('parseNdjsonSafe: skipping malformed line:',line.slice(0,80));}}return out;}

export function showLoading(){app.innerHTML='<div class="loading-state"><span class="loading-spinner" aria-hidden="true"></span><strong>Loading Observatory…</strong><small>Fetching deterministic evidence data</small></div>';}

// ── Toast notifications (Phase 2) ────────────────────────────────
const TOAST_ICONS = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };
export function showToast(message, options = {}) {
  const stack = document.querySelector('#toast-stack');
  if (!stack) { console.warn('Toast stack not found:', message); return; }
  const type = options.type ?? 'info';
  const title = options.title ?? '';
  const duration = options.duration ?? 4000;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-icon" aria-hidden="true">${TOAST_ICONS[type] ?? 'ℹ'}</span><div class="toast-body">${title ? `<strong>${esc(title)}</strong>` : ''}<small>${esc(message)}</small></div><button class="toast-close" aria-label="Dismiss notification">×</button>`;
  stack.appendChild(el);
  const dismiss = () => {
    el.classList.add('toast-leave');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  if (duration > 0) setTimeout(dismiss, duration);
  return dismiss;
}

// ── State management ─────────────────────────────────────────────
// Variant analytics fallback: delegates to browser-analytics.js buildVariantAnalytics.
// The real implementation lives there; this wrapper keeps the import surface stable
// for data-loader.js without a throwing stub that masks the fallback path.
let _buildVariantAnalytics = null;
export async function computeVariantAnalyticsFromSummaries(summaries) {
  if (!summaries || summaries.length === 0) return null;
  if (!_buildVariantAnalytics) {
    const mod = await import('./browser-analytics.js');
    _buildVariantAnalytics = mod.buildVariantAnalytics;
  }
  return _buildVariantAnalytics({ summaries });
}
