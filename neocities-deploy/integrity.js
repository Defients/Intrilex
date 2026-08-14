// ═══════════════════════════════════════════════════════════════
// integrity.js — Integrity dialog (release authority verification)
// ═══════════════════════════════════════════════════════════════

import { state,  fmt,  short,  definitionList } from './state.js?v=73b458295383';
import { LAB_VERSION, ENGINE_VERSION, RULES_VERSION } from './version.js?v=73b458295383';
import { populateDialogHeading } from './seo-metadata.js?v=73b458295383';

export function showIntegrity() {
  populateDialogHeading('integrity-dialog', 'RELEASE AUTHORITY', 'Integrity and capability');
  const c = state.capabilities, a = state.aggregate, o = state.observatory;
  const labVersion = c.labVersion ?? c.engine?.labVersion ?? LAB_VERSION;
  const hasCapabilityHash = !!c.capabilityHash;
  const hasObservatoryHash = !!o.observatoryHash;
  const hasCampaignHash = !!a.canonicalResultHash;
  const hashCount = [hasCapabilityHash, hasObservatoryHash, hasCampaignHash].filter(Boolean).length;
  const abortCount = Number(a.abortCount ?? 0);
  let statusLabel, statusClass, statusDetail;
  if (hashCount < 3) {
    statusLabel = 'NOT_VERIFIED'; statusClass = 'danger';
    statusDetail = `${hashCount}/3 artifact hashes present — cannot verify integrity`;
  } else if (abortCount > 0) {
    statusLabel = 'PARTIAL'; statusClass = 'warning';
    statusDetail = `All hashes present but ${abortCount} abort(s) — evidence incomplete`;
  } else {
    statusLabel = 'PASS'; statusClass = 'supported';
    statusDetail = 'All artifact hashes present, zero aborts — integrity verified';
  }
  document.querySelector('#integrity-content').innerHTML = `${definitionList([
    ['Lab', `${labVersion} Decision Intelligence`],
    ['Engine', c.engine?.version ?? ENGINE_VERSION],
    ['Rules', c.engine?.rulesVersion ?? RULES_VERSION],
    ['Profile', c.defaultSimulationProfile],
    ['Campaign', `${fmt(a.matchCount)} matches · ${a.abortCount} aborts`],
    ['Campaign hash', short(a.canonicalResultHash)],
    ['Observatory hash', short(o.observatoryHash)],
    ['Capability hash', short(c.capabilityHash)],
    ['Integrity status', `<span class="status-badge ${statusClass}">${statusLabel}</span>`],
    ['Status detail', statusDetail]
  ])}<div class="notice"><strong>Authority:</strong> every canonical transition remains inside <code>IntrilexEngine.execute</code>. Analytics, telemetry, layouts, and FX observe accepted results only.</div>`;
  document.querySelector('#integrity-dialog').showModal();
}
