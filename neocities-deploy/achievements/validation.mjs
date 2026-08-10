// ═══════════════════════════════════════════════════════════════
// validation.mjs — Catalog validation assertions
// Validates: count, rarity distribution, hidden count, AP totals,
// unique IDs, valid prerequisites, no duplicate definitions.
// ═══════════════════════════════════════════════════════════════

import { getCatalog, getCatalogById, getAllIds } from './catalog.mjs';
import {
  RARITY,
  CATEGORY,
  PROGRESS_TYPE,
  LAUNCH_CONSTRAINTS,
  HIDDEN_ACHIEVEMENT_IDS,
  AP_BY_RARITY,
  CARD_MASTERY_ACHIEVEMENT_IDS,
} from './constants.mjs';

/**
 * Validate the achievement catalog against all launch constraints.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateCatalog() {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];
  const catalog = getCatalog();
  const byId = getCatalogById();

  // ── Count ──
  if (catalog.length !== LAUNCH_CONSTRAINTS.TOTAL_ACHIEVEMENTS) {
    errors.push(`Expected ${LAUNCH_CONSTRAINTS.TOTAL_ACHIEVEMENTS} achievements, got ${catalog.length}`);
  }

  // ── Unique IDs ──
  const ids = getAllIds();
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    const seen = new Set();
    const dupes = [];
    for (const id of ids) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    errors.push(`Duplicate achievement IDs: ${dupes.join(', ')}`);
  }

  // ── Rarity distribution ──
  /** @type {Record<string, number>} */
  const rarityCounts = { COMMON: 0, CLEVER: 0, RARE: 0, INTRILEX: 0 };
  for (const def of catalog) {
    if (!Object.values(RARITY).includes(/** @type {any} */ (def.rarity))) {
      errors.push(`Achievement ${def.id} has invalid rarity: ${def.rarity}`);
    } else {
      rarityCounts[def.rarity] = (rarityCounts[def.rarity] ?? 0) + 1;
    }
  }
  if (rarityCounts.COMMON !== LAUNCH_CONSTRAINTS.COMMON_COUNT) {
    errors.push(`Expected ${LAUNCH_CONSTRAINTS.COMMON_COUNT} COMMON, got ${rarityCounts.COMMON}`);
  }
  if (rarityCounts.CLEVER !== LAUNCH_CONSTRAINTS.CLEVER_COUNT) {
    errors.push(`Expected ${LAUNCH_CONSTRAINTS.CLEVER_COUNT} CLEVER, got ${rarityCounts.CLEVER}`);
  }
  if (rarityCounts.RARE !== LAUNCH_CONSTRAINTS.RARE_COUNT) {
    errors.push(`Expected ${LAUNCH_CONSTRAINTS.RARE_COUNT} RARE, got ${rarityCounts.RARE}`);
  }
  if (rarityCounts.INTRILEX !== LAUNCH_CONSTRAINTS.INTRILEX_COUNT) {
    errors.push(`Expected ${LAUNCH_CONSTRAINTS.INTRILEX_COUNT} INTRILEX, got ${rarityCounts.INTRILEX}`);
  }

  // ── Hidden count ──
  const hiddenDefs = catalog.filter(d => d.hidden);
  if (hiddenDefs.length !== LAUNCH_CONSTRAINTS.HIDDEN_COUNT) {
    errors.push(`Expected ${LAUNCH_CONSTRAINTS.HIDDEN_COUNT} hidden, got ${hiddenDefs.length}`);
  }
  const hiddenIds = hiddenDefs.map(d => d.id).sort();
  const expectedHidden = [...HIDDEN_ACHIEVEMENT_IDS].sort();
  if (hiddenIds.join(',') !== expectedHidden.join(',')) {
    errors.push(`Hidden IDs mismatch: got [${hiddenIds.join(',')}], expected [${expectedHidden.join(',')}]`);
  }

  // ── AP totals ──
  let totalAP = 0;
  for (const def of catalog) {
    const expectedAP = AP_BY_RARITY[/** @type {keyof typeof AP_BY_RARITY} */ (def.rarity)];
    if (def.achievementPoints !== expectedAP) {
      errors.push(`Achievement ${def.id} has AP ${def.achievementPoints}, expected ${expectedAP} for ${def.rarity}`);
    }
    totalAP += def.achievementPoints;
  }
  if (totalAP !== LAUNCH_CONSTRAINTS.TOTAL_AP) {
    errors.push(`Total AP ${totalAP} != expected ${LAUNCH_CONSTRAINTS.TOTAL_AP}`);
  }

  // ── Valid categories ──
  /** @type {string[]} */
  const validCategories = Object.values(CATEGORY);
  for (const def of catalog) {
    if (!validCategories.includes(def.category)) {
      errors.push(`Achievement ${def.id} has invalid category: ${def.category}`);
    }
  }

  // ── Valid progress types ──
  /** @type {string[]} */
  const validProgressTypes = Object.values(PROGRESS_TYPE);
  for (const def of catalog) {
    if (!validProgressTypes.includes(def.progressType)) {
      errors.push(`Achievement ${def.id} has invalid progressType: ${def.progressType}`);
    }
    if (def.progressType === PROGRESS_TYPE.COUNTER && typeof def.progressTarget !== 'number') {
      errors.push(`Achievement ${def.id} is COUNTER but has no progressTarget`);
    }
  }

  // ── Valid prerequisites ──
  for (const def of catalog) {
    if (def.prerequisiteAchievementIds) {
      for (const prereqId of def.prerequisiteAchievementIds) {
        if (!byId.has(prereqId)) {
          errors.push(`Achievement ${def.id} has invalid prerequisite: ${prereqId}`);
        }
      }
    }
  }

  // ── Card Savant prerequisite set ──
  const cardSavant = byId.get('card-savant');
  if (cardSavant && cardSavant.prerequisiteAchievementIds) {
    const prereqSet = new Set(cardSavant.prerequisiteAchievementIds);
    const expectedSet = new Set(CARD_MASTERY_ACHIEVEMENT_IDS);
    if (prereqSet.size !== expectedSet.size) {
      errors.push(`Card Savant prerequisite count ${prereqSet.size} != expected ${expectedSet.size}`);
    }
    for (const id of expectedSet) {
      if (!prereqSet.has(id)) {
        errors.push(`Card Savant missing prerequisite: ${id}`);
      }
    }
  }

  // ── Required fields present ──
  for (const def of catalog) {
    if (!def.id || !def.name || !def.description) {
      errors.push(`Achievement missing required field: ${def.id ?? 'unknown'}`);
    }
    if (!def.iconKey) {
      errors.push(`Achievement ${def.id} missing iconKey`);
    }
    if (!def.introducedProductVersion || !def.introducedRulesVersion) {
      errors.push(`Achievement ${def.id} missing version fields`);
    }
    if (!def.schemaVersion || !def.catalogVersion) {
      errors.push(`Achievement ${def.id} missing schema/catalog version`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Assert the catalog is valid. Throws on failure.
 * @returns {void}
 */
export function assertCatalogValid() {
  const result = validateCatalog();
  if (!result.valid) {
    throw new Error(`Achievement catalog validation failed:\n${result.errors.join('\n')}`);
  }
}
