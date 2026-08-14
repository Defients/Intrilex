// ═══════════════════════════════════════════════════════════════
// action-explanation.js — Three-layer guidance system
//
// Layer 1 — Immediate: visible by default (what can be done, what's waiting, what passing means)
// Layer 2 — Why: on demand (legality reason, costs, timing, targets, consequence preview)
// Layer 3 — Deeper: optional (Rank Anatomy context, mechanics links, evidence)
//
// Guidance is accurate, optional, and non-authoritative.
// It never claims a move is objectively best.
// It never exposes AI chain-of-thought.
// ═══════════════════════════════════════════════════════════════

import { reasonShortText,  reasonDetailedText,  reasonRuleRef } from '../authority/reason-code-registry.js?v=42162e3d88b3';
import { classifyActionForm,  isSuperDeclaration,  isSpadesVariant } from '../authority/legal-action-adapter.js?v=42162e3d88b3';

/**
 * Guidance modes.
 */
export const GuidanceMode = Object.freeze({
  OFF: 'OFF',
  ESSENTIAL: 'ESSENTIAL',
  GUIDED: 'GUIDED',
  DETAILED: 'DETAILED',
});

/**
 * Build the Layer 1 (Immediate) explanation for the current state.
 * Visible by default. Concise.
 *
 * @param {object} priorityContext - From priority-projection.derivePriorityContext()
 * @param {object[]} legalActions - Array of legal-action contracts
 * @param {string} guidanceMode - Current guidance mode
 * @returns {object} { title, body, passInfo }
 */
export function buildImmediateExplanation(priorityContext, legalActions, guidanceMode = GuidanceMode.GUIDED) {
  if (guidanceMode === GuidanceMode.OFF) return { title: '', body: '', passInfo: '' };
  if (!priorityContext) return { title: '', body: '', passInfo: '' };

  const { isHumanPriority, windowType, stackDepth, canPass, nextOnPass } = priorityContext;

  if (!isHumanPriority) {
    return {
      title: 'Opponent is deciding',
      body: stackDepth > 0
        ? 'A declaration is on the stack. The opponent may respond.'
        : 'The opponent is choosing their next move.',
      passInfo: '',
    };
  }

  const windowLabel = windowTypeLabel(windowType);
  const actionCount = legalActions?.length ?? 0;

  let title = `Your Priority — ${windowLabel}`;
  let body = '';

  if (actionCount === 0) {
    body = 'You have no legal actions. The engine will force an Exhausted Pass.';
  } else if (actionCount === 1) {
    const action = legalActions[0];
    body = `You have 1 legal action: ${action.displayLabel}.`;
  } else {
    // Summarize by category
    const categories = summarizeActionCategories(legalActions);
    body = `You have ${actionCount} legal actions:\n${categories}`;
  }

  let passInfo = '';
  if (canPass && nextOnPass) {
    passInfo = nextOnPass;
  }

  return { title, body, passInfo };
}

/**
 * Build the Layer 2 (Why) explanation for a specific action.
 * On demand. Shows legality reason, costs, timing, targets, preview.
 *
 * @param {object} contract - The legal-action contract
 * @param {object} cardRegistry - Map of cardId → { identity, rank, suit }
 * @param {string} guidanceMode - Current guidance mode
 * @returns {object} { label, timing, costs, targets, preview, ruleRef }
 */
export function buildWhyExplanation(contract, cardRegistry, guidanceMode = GuidanceMode.GUIDED) {
  if (guidanceMode === GuidanceMode.OFF) return null;

  const form = contract.form ?? classifyActionForm(contract);
  const isSuper = isSuperDeclaration(contract);
  const isSpade = isSpadesVariant(contract, cardRegistry);

  const costs = contract.costs ?? [];
  const targets = contract.targets ?? {};
  const preview = contract.preview ?? {};

  const parts = {
    label: contract.displayLabel ?? 'Unknown action',
    timing: formatTiming(contract.timingClass, form),
    costs: costs.map(c => c.description),
    targets: formatTargets(targets, cardRegistry),
    preview: formatPreview(preview, form, isSuper),
    ruleRef: getRuleRefForForm(form, isSuper, isSpade),
  };

  return parts;
}

/**
 * Build the Layer 3 (Deeper) explanation for a specific action.
 * Optional. Shows Rank Anatomy context, mechanics links, evidence.
 *
 * @param {object} contract - The legal-action contract
 * @param {object} cardRegistry - Map of cardId → { identity, rank, suit }
 * @param {object} rankAnatomyData - Rank Anatomy registry data (optional)
 * @returns {object} { rankAnatomyLinks, mechanicsLinks, evidenceLinks }
 */
export function buildDeeperExplanation(contract, cardRegistry, rankAnatomyData = null) {
  const form = contract.form ?? classifyActionForm(contract);
  const ranks = contract.rankIds ?? [];
  const isSpade = contract.isSpadesVariant ?? false;
  const isSuper = contract.isSuper ?? false;
  const superEffectId = contract.superEffectId ?? null;

  const rankAnatomyLinks = [];

  for (const rank of ranks) {
    if (form === 'score' || form === 'effect') {
      // Ordinary action
      rankAnatomyLinks.push({
        rank,
        form: 'ordinary',
        label: `Rank ${rank} / Ordinary`,
        url: `#/ranks?rank=${rank}&tab=ordinary`,
      });
    }

    if (isSpade) {
      rankAnatomyLinks.push({
        rank,
        form: 'spades',
        label: `Rank ${rank} / Spades`,
        url: `#/ranks?rank=${rank}&tab=spades`,
      });
    }

    if (isSuper) {
      rankAnatomyLinks.push({
        rank,
        form: 'super',
        superEffectId,
        label: `Rank ${rank} / Supers / ${superEffectId ?? 'all'}`,
        url: `#/ranks?rank=${rank}&tab=supers&effect=${superEffectId ?? ''}`,
      });
    }
  }

  return {
    rankAnatomyLinks,
    mechanicsLinks: [], // Populated when mechanics atlas data is available
    evidenceLinks: [],  // Populated when evidence data is available
  };
}

/**
 * Build an explanation for why an action is unavailable (disabled).
 *
 * @param {string} reasonCode - The stable reason code
 * @param {string} guidanceMode - Current guidance mode
 * @returns {object} { shortText, detailedText, ruleRef }
 */
export function buildUnavailableExplanation(reasonCode, guidanceMode = GuidanceMode.GUIDED) {
  if (guidanceMode === GuidanceMode.OFF) return { shortText: '', detailedText: '', ruleRef: '' };

  const short = reasonShortText(reasonCode);
  if (guidanceMode === GuidanceMode.ESSENTIAL) {
    return { shortText: short, detailedText: '', ruleRef: '' };
  }

  return {
    shortText: short,
    detailedText: reasonDetailedText(reasonCode),
    ruleRef: reasonRuleRef(reasonCode),
  };
}

/**
 * Build a post-action explanation after resolution.
 *
 * @param {object} action - The action that was taken
 * @param {object[]} events - The events that resulted from the action
 * @param {object} priorityContext - The new priority context after resolution
 * @returns {object} { whatHappened, whyLegal, whatChanged, whereToInspect }
 */
export function buildPostActionExplanation(action, events, priorityContext) {
  const eventCount = events?.length ?? 0;
  const form = classifyActionForm(action);

  let whatHappened = '';
  if (eventCount === 0) {
    whatHappened = 'The action was accepted but produced no visible events.';
  } else {
    const eventTypes = events.map(e => e.type).filter(Boolean);
    whatHappened = `The action resolved with ${eventCount} event(s): ${eventTypes.join(', ')}.`;
  }

  const whyLegal = 'The action was legal because it was enumerated by the engine from the current game state.';

  let whatChanged = '';
  if (priorityContext) {
    if (priorityContext.isHumanPriority) {
      whatChanged = 'Priority has returned to you.';
    } else if (priorityContext.isOpponentPriority) {
      whatChanged = 'The opponent now has priority.';
    } else if (priorityContext.holder === 'system') {
      whatChanged = 'The engine is processing. Please wait.';
    }
  }

  const whereToInspect = [
    { label: 'Open in Replay', url: '#/watch' },
    { label: 'Open in Rank Anatomy', url: form === 'super' ? '#/ranks?tab=supers' : '#/ranks' },
  ];

  return { whatHappened, whyLegal, whatChanged, whereToInspect };
}

// ─── Helpers ──────────────────────────────────────────────────────

function windowTypeLabel(windowType) {
  const labels = {
    proactive: 'Proactive Window',
    response: 'Response Window',
    interrupt: 'Interrupt Window',
    resolution: 'Resolution',
    transition: 'Phase Transition',
  };
  return labels[windowType] ?? 'Unknown Window';
}

function summarizeActionCategories(actions) {
  const categories = {};
  for (const a of actions) {
    const form = a.form ?? 'other';
    categories[form] = (categories[form] ?? 0) + 1;
  }
  return Object.entries(categories)
    .map(([form, count]) => `• ${count} ${form} action${count > 1 ? 's' : ''}`)
    .join('\n');
}

function formatTiming(timingClass, form) {
  const timingLabels = {
    'ACTION': 'Action (Full Turn commitment)',
    'QUICK': 'Quick',
    'INSTANT': 'Instant',
    'INTERRUPT': 'Interrupt',
    'SETUP': 'Setup',
  };
  const label = timingLabels[timingClass] ?? timingClass ?? '';
  if (form === 'super') return `${label} — Super declaration`;
  return label;
}

function formatTargets(targets, cardRegistry) {
  if (!targets.required) return 'No target required.';
  const ids = targets.legalTargetIds ?? [];
  if (ids.length === 0) return 'Target required but none available.';
  const descriptions = ids.map(id => {
    const card = cardRegistry?.[id];
    return card?.identity ?? id;
  });
  return `Target${ids.length > 1 ? 's' : ''}: ${descriptions.join(', ')}`;
}

function formatPreview(preview, form, isSuper) {
  const parts = [];
  if (preview.opensResponseWindow) parts.push('Opens a response window.');
  if (preview.isFullTurnCommitment) parts.push('Uses your Action Phase for this Full Turn.');
  if (preview.resolutionUncertain) parts.push('Resolution is not guaranteed.');
  if (isSuper) {
    parts.push('Super declaration — consumes multiple components.');
    if (preview.superEffectId) parts.push(`Effect: ${preview.superEffectId}.`);
  }
  return parts.length > 0 ? parts.join(' ') : 'No preview available.';
}

function getRuleRefForForm(form, isSuper, isSpade) {
  if (isSuper) return 'Super rules — two same-rank cards required for declaration.';
  if (isSpade) return 'Spades rules — Spades cards have mechanically distinct play forms.';
  if (form === 'score') return 'Scoring rules — cards played to Point Row for points.';
  if (form === 'response') return 'Response rules — reactive actions in response windows.';
  if (form === 'pass') return 'Pass rules — Exhausted Pass or Response Decline.';
  return '';
}
