// ═══════════════════════════════════════════════════════════════
// advanced-card-rules-controller.mjs — Advanced Card Rules View
// controller.
//
// Owns the modal lifecycle: open/close, focus trap, focus return,
// Escape/backdrop dismissal, hidden-info protection, and derivation
// of the CURRENT MATCH section from the authoritative legal-action
// contract.
//
// It never mutates game state. Opening the view does not select a
// card, submit an action, advance a declaration, consume priority,
// or change hover legality.
// ═══════════════════════════════════════════════════════════════

import { renderAdvancedCardRulesView } from './advanced-card-rules-view.mjs';
import { actionsForCard } from '../authority/legal-action-adapter.js';

const DIALOG_ID = 'advanced-card-rules-dialog';
const CONTENT_ID = 'advanced-card-rules-content';
const TITLE_ID = 'advanced-card-rules-title';

/** @type {HTMLElement|null} */
let previouslyFocused = null;
/** @type {string|null} */
let openIdentity = null;
/** @type {((e:KeyboardEvent)=>void)|null} */
let keyHandler = null;
/** @type {((e:Event)=>void)|null} */
let backdropHandler = null;
/** @type {(() => void)|null} */
let onCloseCallback = null;

/**
 * Find a card in the authorized player view by entity id.
 * Walks every zone the player is authorized to inspect. Returns null
 * for face-down or absent cards — this is the hidden-info firewall.
 *
 * @param {object} snapshot - PlaySession.getSnapshot() output
 * @param {string} cardId
 * @returns {{ identity:string, faceDown:boolean, zone:string }|null}
 */
export function findAuthorizedCard(snapshot, cardId) {
  if (!snapshot || !cardId) return null;
  const pv = snapshot.playerView;
  if (!pv) return null;

  const zones = [
    ...(pv.own?.hand ?? []),
    ...(pv.own?.pointRow ?? pv.own?.pr ?? []),
    ...(pv.own?.enduringRow ?? pv.own?.er ?? []),
    ...(pv.opponent?.pointRow ?? pv.opponent?.pr ?? []),
    ...(pv.opponent?.enduringRow ?? pv.opponent?.er ?? []),
  ];
  // Swap bar cards (only face-up ones carry identity in the authorized view)
  const swap = pv.swapBar ?? pv.swap ?? [];
  for (const slot of swap) {
    if (slot && slot.card) zones.push(slot.card);
    else if (slot && slot.identity) zones.push(slot);
  }
  // Stack public source cards
  const stack = pv.stack ?? pv.resolutionStack ?? [];
  for (const item of stack) {
    for (const c of item?.sourceCards ?? []) zones.push(c);
    if (item?.targetCard) zones.push(item.targetCard);
  }

  for (const card of zones) {
    if (!card) continue;
    const id = card.entityId ?? card.id;
    if (id === cardId) {
      const faceDown = card.faceDown === true || !card.identity;
      return { identity: card.identity, faceDown, zone: card.zone ?? 'BOARD' };
    }
  }
  return null;
}

/**
 * Determine whether a card may be inspected in the Advanced View.
 * Face-down or absent cards are never inspectable (hidden-info firewall).
 *
 * @param {object} snapshot
 * @param {string} cardId
 * @returns {boolean}
 */
export function isCardInspectable(snapshot, cardId) {
  const found = findAuthorizedCard(snapshot, cardId);
  return !!found && !found.faceDown && !!found.identity;
}

/**
 * Build the CURRENT MATCH context from the authoritative legal-action
 * contract. Only facts derivable from the engine action data are shown.
 *
 * @param {object} snapshot
 * @param {string} cardId
 * @param {string} identity
 * @returns {object|null}
 */
export function buildCurrentMatchContext(snapshot, cardId, _identity) {
  if (!snapshot || !cardId) return null;
  const decision = snapshot.decision ?? snapshot;
  const rawActions = decision?.legalActions ?? decision?.authorizedActions ?? [];
  const contracts = rawActions.map(a => {
    // Build a lightweight contract without requiring a card registry.
    const sources = a.sourceHandles ?? a.sourceCardIds ?? [];
    return {
      optionId: a.actionId,
      displayLabel: a.label ?? a.shortLabel ?? a.description ?? 'Action',
      form: a.family ?? 'other',
      timingClass: a.timingClass ?? 'ACTION',
      isResponse: a.isResponse ?? false,
      isSuper: typeof a.mode === 'string' && a.mode.startsWith('super-'),
      sourceEntityIds: sources,
    };
  });
  const forCard = actionsForCard(contracts, cardId);
  const found = findAuthorizedCard(snapshot, cardId);
  return {
    cardId,
    zone: found?.zone ?? 'BOARD',
    actor: snapshot.playerView?.actorId ?? snapshot.human?.playerId ?? null,
    stateRevision: decision?.stateRevision ?? null,
    legalActions: forCard.map(a => ({
      optionId: a.optionId,
      displayLabel: a.displayLabel,
      form: a.form,
      timingClass: a.timingClass,
      isResponse: a.isResponse,
      isSuper: a.isSuper,
    })),
    legalTargetCount: null,
    available: forCard.length > 0,
  };
}

/**
 * Open the Advanced Card Rules View for an identity.
 *
 * @param {string} identity - Card identity (e.g. "7♥"). Must be authorized.
 * @param {{ currentMatch?: object|null, onClose?: () => void }} [options]
 * @returns {boolean} true if opened, false if refused (hidden-info / no dialog)
 */
export function openAdvancedCardRules(identity, options = {}) {
  if (!identity) return false;
  const dialog = document.getElementById(DIALOG_ID);
  if (!dialog) return false;
  const contentEl = document.getElementById(CONTENT_ID);
  const titleEl = document.getElementById(TITLE_ID);
  if (!contentEl) return false;

  // Hidden-info firewall: refuse to render if the identity looks concealed.
  // The caller is expected to have already verified inspectability via
  // isCardInspectable(); this is a defense-in-depth check on the identity.
  if (identity === 'FACE_DOWN' || identity === 'null' || !identity.trim()) return false;

  previouslyFocused = /** @type {HTMLElement|null} */ (document.activeElement);
  openIdentity = identity;
  onCloseCallback = options.onClose ?? null;

  const html = renderAdvancedCardRulesView(identity, { currentMatch: options.currentMatch ?? null });
  contentEl.innerHTML = html;
  if (titleEl) titleEl.textContent = identity;

  if (typeof dialog.showModal === 'function' && !dialog.open) {
    dialog.showModal();
  }
  dialog.setAttribute('aria-hidden', 'false');

  // Focus the dialog close button for keyboard users.
  const closeBtn = dialog.querySelector('[data-acr-close]');
  if (closeBtn) /** @type {HTMLElement} */ (closeBtn).focus();

  bindDialogEvents(dialog);
  return true;
}

/**
 * Close the Advanced Card Rules View and restore focus.
 * @returns {void}
 */
export function closeAdvancedCardRules() {
  const dialog = document.getElementById(DIALOG_ID);
  if (!dialog) return;
  unbindDialogEvents(dialog);
  const contentEl = document.getElementById(CONTENT_ID);
  if (contentEl) contentEl.innerHTML = '';
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  dialog.setAttribute('aria-hidden', 'true');
  openIdentity = null;
  const cb = onCloseCallback;
  onCloseCallback = null;
  // Restore focus to the element that opened the view.
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
  if (cb) cb();
}

/**
 * @returns {string|null} the currently open identity, or null.
 */
export function getOpenIdentity() {
  return openIdentity;
}

/**
 * Refresh the CURRENT MATCH section without reopening the modal.
 * Called when game state updates while the view is open (directive §15).
 *
 * @param {object} snapshot
 * @param {string} cardId
 * @returns {void}
 */
export function refreshCurrentMatch(snapshot, cardId) {
  if (!openIdentity) return;
  const dialog = document.getElementById(DIALOG_ID);
  if (!dialog) return;
  // If the inspected card is no longer inspectable, sanitize the view.
  if (cardId && !isCardInspectable(snapshot, cardId)) {
    closeAdvancedCardRules();
    return;
  }
  const ctx = cardId ? buildCurrentMatchContext(snapshot, cardId, openIdentity) : null;
  const sectionEl = dialog.querySelector('[data-acr-current-match]');
  if (!sectionEl) return;
  // Re-render just the current-match section body.
  const html = renderAdvancedCardRulesView(openIdentity, { currentMatch: ctx });
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const fresh = tmp.querySelector('[data-acr-current-match]');
  if (fresh) sectionEl.replaceWith(fresh);
}

// ── Event binding ───────────────────────────────────────────────

function bindDialogEvents(dialog) {
  unbindDialogEvents(dialog);

  keyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAdvancedCardRules();
      return;
    }
    // Focus trap: keep Tab within the dialog.
    if (e.key === 'Tab') {
      const focusable = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), summary'
      );
      if (focusable.length === 0) return;
      const first = /** @type {HTMLElement} */ (focusable[0]);
      const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  backdropHandler = (e) => {
    // Click on the backdrop (the dialog element itself) closes.
    if (e.target === dialog) {
      closeAdvancedCardRules();
    }
  };

  dialog.addEventListener('keydown', keyHandler);
  dialog.addEventListener('click', backdropHandler);

  const closeBtn = dialog.querySelector('[data-acr-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeAdvancedCardRules);

  // Ruling tag filter chips (directive §12)
  dialog.querySelectorAll('[data-acr-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      const pressed = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', pressed ? 'false' : 'true');
      filterRulingsByTag(dialog);
    });
  });
}

function unbindDialogEvents(dialog) {
  if (keyHandler) dialog.removeEventListener('keydown', keyHandler);
  if (backdropHandler) dialog.removeEventListener('click', backdropHandler);
  keyHandler = null;
  backdropHandler = null;
}

/**
 * Toggle visibility of rulings whose tags do not include the active tag.
 * When no filter is active, all rulings are shown.
 */
function filterRulingsByTag(dialog) {
  const activeTags = new Set();
  dialog.querySelectorAll('[data-acr-filter][aria-pressed="true"]').forEach(chip => {
    activeTags.add(/** @type {HTMLElement} */ (chip).dataset.acrFilter);
  });
  dialog.querySelectorAll('.acr-ruling').forEach(li => {
    const tags = new Set();
    li.querySelectorAll('.acr-tag').forEach(t => tags.add(t.textContent?.trim() ?? ''));
    const show = activeTags.size === 0 || [...activeTags].some(at => tags.has(at));
    li.style.display = show ? '' : 'none';
  });
}
