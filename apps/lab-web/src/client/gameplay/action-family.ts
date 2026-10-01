import { familyLabel, modeLabel } from '../../play/action-presenter.js';
import type { SemanticAction, SemanticGame } from '../game-model.js';

/** Donor: browserTabletop presentation.ts. This module selects original action IDs only. */
export type ParameterValue = string | readonly string[];
export type Selection = Readonly<Record<string, ParameterValue | undefined>>;
export type Parameter = Readonly<{
  key: string;
  label: string;
  kind: 'card' | 'cards' | 'target' | 'slot' | 'mode' | 'variant' | 'copy' | 'cost';
  multiple: boolean;
  /**
   * Progressive disclosure stage. A staged parameter renders only once
   * every earlier-stage parameter is resolved (picked or collapsed to a
   * single compatible value). Unstaged parameters render immediately —
   * preserving the flat layout for ordinary families.
   */
  stage?: number;
  value: (action: SemanticAction) => ParameterValue;
}>;
export type ActionFamily = Readonly<{
  id: string;
  title: string;
  icon: string;
  variants: readonly SemanticAction[];
  parameters: readonly Parameter[];
}>;
export type ActionEntry = { kind: 'action'; action: SemanticAction } | { kind: 'family'; family: ActionFamily };
const NONE = '@none';
const ICONS: Record<string, string> = { 'swap-bar': '⇅', scuttle: '⚔', counter: '✕', ultra: '❖', voltage: '⚡', 'private-choice': '◈', score: '▲', draw: '▽' };
const asArray = (value: ParameterValue | undefined): readonly string[] => Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
const equalSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));
const tuple = (family: ActionFamily, action: SemanticAction) => JSON.stringify(family.parameters.map(p => {
  const value = p.value(action);
  return p.multiple && Array.isArray(value) ? [...value].sort() : value;
}));

function parameters(variants: readonly SemanticAction[]): Parameter[] {
  const first = variants[0];
  const result: Parameter[] = [];
  const add = (key: string, label: string, kind: Parameter['kind'], multiple: boolean, value: Parameter['value'], stage?: number) => {
    // Constants belong to the action preview; only actual decisions need controls.
    if (new Set(variants.map(a => JSON.stringify(value(a)))).size > 1) result.push({ key, label, kind, multiple, value, ...(stage !== undefined ? { stage } : {}) });
  };
  // Copy-effect families (Wild Sovereignty, Solo Wild) carry a public
  // `composition` decomposition from the authority boundary. Their player
  // decision tree is: which base effect is copied → which sub-effect/mode
  // → which target → which cost card. Staging keeps the composer asking
  // one question at a time instead of dumping raw variant declarations.
  const hasCopy = variants.length > 0 && variants.every(a => a.composition !== undefined);
  if (hasCopy) {
    add('sources', 'Wild card', 'card', false, a => a.sources[0] ?? NONE, 0);
    add('copy', first.family === 'wild-sovereignty' ? 'Copy a Spade effect' : 'Copy base effect', 'copy', false,
      a => a.composition?.copy ?? NONE, 0);
    add('mode', 'Effect', 'mode', false, a => a.mode ?? NONE, 1);
    const multiple = variants.some(a => a.targets.length > 1);
    add('targets', multiple ? 'Targets / cost cards' : 'Target', multiple ? 'cards' : 'target', multiple,
      a => multiple ? a.targets : a.targets[0] ?? NONE, 2);
    add('cost', 'Discard cost', 'cost', false,
      a => (a.composition?.costs?.length ? [...a.composition.costs].sort().join('|') : NONE), 3);
    return result;
  }
  if (first.family === 'swap-bar' && variants.every(a => a.swapSlot !== undefined)) {
    add('slot', 'Take from the Swap Bar', 'slot', false, a => String(a.swapSlot));
    add('sources', 'Give from your hand', 'card', false, a => a.sources[0] ?? NONE);
  } else {
    const orderedSources = first.family === 'ultra' && variants.some(a => a.mode?.startsWith('three-black'));
    if (orderedSources) {
      // Canonical role order is meaningful. Never sort these component arrays.
      for (let i = 0; i < Math.max(...variants.map(a => a.sources.length)); i++) {
        add(`source:${i}`, `Component ${i + 1}`, 'card', false, a => a.sources[i] ?? NONE);
      }
    } else {
      const multiple = variants.some(a => a.sources.length > 1);
      add('sources', multiple ? 'Source cards / components' : 'Source card', multiple ? 'cards' : 'card', multiple,
        a => multiple ? a.sources : a.sources[0] ?? NONE);
    }
    const orderedTargets = first.family === 'private-choice' && variants.some(a => a.mode === 'rank7-hand-and-effect' || a.mode === 'rank7-hand-and-score');
    if (orderedTargets) {
      add('target:0', 'Take into hand', 'target', false, a => a.targets[0] ?? NONE);
      add('target:1', 'Generated play', 'target', false, a => a.targets[1] ?? NONE);
    } else {
      const multiple = variants.some(a => a.targets.length > 1);
      add('targets', first.family === 'private-choice' ? 'Choice cards' : multiple ? 'Targets / cost cards' : 'Target', multiple ? 'cards' : 'target', multiple,
        a => multiple ? a.targets : a.targets[0] ?? NONE);
    }
  }
  add('mode', 'Mode / effect', 'mode', false, a => a.mode ?? NONE);
  return result;
}

/** Group by structured semantics. Copy edits never change family membership. */
export function buildActionEntries(actions: readonly SemanticAction[]): ActionEntry[] {
  const buckets = new Map<string, SemanticAction[]>();
  for (const action of actions) {
    const perCard = (action.family.startsWith('effect-') || ['anchor', 'anchor-guard', 'anchor-private-choice', 'rank10', 'solo-wild'].includes(action.family)) && action.sources.length === 1;
    const id = JSON.stringify([action.family, action.timingClass ?? action.timing, action.family === 'unknown' ? action.id : perCard ? action.sources[0] : null]);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(action); else buckets.set(id, [action]);
  }
  return [...buckets].map(([id, variants]): ActionEntry => {
    if (variants.length === 1) return { kind: 'action', action: variants[0] };
    const family: ActionFamily = {
      id, title: familyLabel(variants[0].family) ?? 'Legal choices', icon: ICONS[variants[0].family] ?? '✦',
      variants, parameters: parameters(variants),
    };
    const tuples = new Set(variants.map(a => tuple(family, a)));
    if (tuples.size !== variants.length || !family.parameters.length) {
      // A lossy upstream description must never silently choose the first ID.
      // Exact variants remain explicit, with sources/targets in canonical order.
      return { kind: 'family', family: { ...family, parameters: [...family.parameters, {
        key: 'variant', label: 'Exact declaration', kind: 'variant', multiple: false, value: a => a.id,
      }] } };
    }
    return { kind: 'family', family };
  });
}

function matches(parameter: Parameter, action: SemanticAction, picked: ParameterValue | undefined, exact = false): boolean {
  if (picked === undefined) return !exact;
  const value = parameter.value(action);
  if (parameter.multiple) {
    if (!Array.isArray(picked) || !Array.isArray(value)) return false;
    return exact ? equalSet(value, picked) : picked.every(x => value.includes(x));
  }
  return typeof picked === 'string' && value === picked;
}

export function compatibleVariants(family: ActionFamily, selection: Selection, exceptKey?: string): readonly SemanticAction[] {
  return family.variants.filter(a => family.parameters.every(p => p.key === exceptKey || matches(p, a, selection[p.key])));
}

export function parameterOptions(family: ActionFamily, parameter: Parameter, selection: Selection): readonly string[] {
  const candidates = compatibleVariants(family, selection, parameter.multiple ? undefined : parameter.key);
  const values = new Set<string>();
  for (const action of candidates) for (const value of asArray(parameter.value(action))) values.add(value);
  return [...values];
}

/**
 * For a staged parameter, downstream selections must not shrink the
 * options an upstream control shows — switching the copied effect while a
 * mode is picked is legal; reconcileSelection drops the stale mode. So a
 * staged parameter's own choices are computed against only same-or-earlier
 * stage picks. Unstaged parameters keep the classic every-pick-applies
 * semantics.
 */
export function upstreamSelection(family: ActionFamily, parameter: Parameter, selection: Selection): Selection {
  if (parameter.stage === undefined) return selection;
  const result: Record<string, ParameterValue> = {};
  for (const p of family.parameters) {
    const value = selection[p.key];
    if (value !== undefined && (p.stage === undefined || p.stage <= parameter.stage!)) result[p.key] = value;
  }
  return result;
}

export function effectiveSelection(family: ActionFamily, selection: Selection): Selection {
  const result = { ...selection };
  for (const parameter of family.parameters) {
    if (result[parameter.key] !== undefined || parameter.multiple) continue;
    const options = parameterOptions(family, parameter, result);
    if (options.length === 1) result[parameter.key] = options[0];
  }
  return result;
}

/** Exact sets only: a one-card subset cannot resolve a two-card declaration. */
export function resolvedAction(family: ActionFamily, selection: Selection): SemanticAction | undefined {
  const effective = effectiveSelection(family, selection);
  const exact = family.variants.filter(a => family.parameters.every(p => matches(p, a, effective[p.key], true)));
  return exact.length === 1 ? exact[0] : undefined;
}

/** A single final option is a complete move; editable multi-part sets need a commit. */
export function needsCompositionConfirmation(family: ActionFamily): boolean {
  return family.parameters.length > 1 || family.parameters.some(parameter => parameter.multiple);
}

export function reconcileSelection(family: ActionFamily, selection: Selection): Selection {
  const result: Record<string, ParameterValue> = {};
  for (const parameter of family.parameters) {
    const value = selection[parameter.key];
    if (value !== undefined && compatibleVariants(family, { ...result, [parameter.key]: value }).length) result[parameter.key] = value;
  }
  return result;
}

export function selectOption(family: ActionFamily, selection: Selection, key: string, value: string): Selection {
  const parameter = family.parameters.find(p => p.key === key);
  if (!parameter) return selection;
  const previous = selection[key];
  const alreadyPicked = asArray(previous).includes(value);
  if (!alreadyPicked && !parameterOptions(family, parameter, upstreamSelection(family, parameter, selection)).includes(value)) return selection;
  const next = { ...selection };
  if (parameter.multiple) {
    next[key] = alreadyPicked ? asArray(previous).filter(x => x !== value) : [...asArray(previous), value];
  } else if (alreadyPicked) delete next[key]; else next[key] = value;
  return reconcileSelection(family, next);
}

export function visibleCards(game: SemanticGame) {
  return [...game.self.hand, ...game.self.points, ...game.self.enduring, ...game.opponent.points, ...game.opponent.enduring,
    ...game.swap, ...(game.discardTop ? [game.discardTop] : []), ...(game.choice?.cards ?? [])];
}

export function referenceLabel(game: SemanticGame, id: string): string {
  if (id === NONE) return 'None';
  const card = visibleCards(game).find(c => c.id === id);
  if (card) return card.identity ?? 'Face-down card';
  const pending = game.stack.find(item => item.id === id);
  return pending ? `${pending.label} · ${pending.controllerId === game.self.id ? game.self.name : game.opponent.name}` : 'Authorized card / target';
}

export function actionPreview(game: SemanticGame, action: SemanticAction): string {
  const details = [action.label];
  if (action.swapSlot !== undefined) details.push(`Slot ${action.swapSlot + 1}`);
  if (action.sources.length) details.push(action.sources.map(id => referenceLabel(game, id)).join(' + '));
  if (action.targets.length && action.swapSlot === undefined) details.push(`→ ${action.targets.map(id => referenceLabel(game, id)).join(' + ')}`);
  return details.join(' · ');
}

export function optionLabel(game: SemanticGame, family: ActionFamily, parameter: Parameter, value: string): string {
  if (parameter.kind === 'slot') return `Slot ${Number(value) + 1} · ${game.swap[Number(value)]?.identity ?? 'Face down'}`;
  if (parameter.kind === 'mode') return value === NONE ? 'Default' : modeLabel(family.variants[0].family, value) ?? 'Mode';
  if (parameter.kind === 'copy') {
    if (value === NONE) return 'No copied effect';
    // The copied card shares the wild card's suit: derive the glyph from
    // the source card's identity rather than hardcoding one per family.
    const suit = family.variants.map(a => referenceLabel(game, a.sources[0] ?? '')).join(' ').match(/[♠♥♦♣]/)?.[0] ?? '';
    return `${value}${suit}`;
  }
  if (parameter.kind === 'cost') {
    return value === NONE ? 'No discard' : value.split('|').map(id => referenceLabel(game, id)).join(' + ');
  }
  if (parameter.kind === 'variant') {
    const index = family.variants.findIndex(a => a.id === value);
    return `${index + 1}. ${actionPreview(game, family.variants[index])}`;
  }
  return referenceLabel(game, value);
}

/**
 * Progressive disclosure for staged families: a staged parameter renders
 * only when every earlier-stage parameter is already resolved (picked or
 * collapsed to a single compatible value via effectiveSelection), and it
 * still offers a real choice within the current compatible set.
 */
export function parameterVisible(family: ActionFamily, parameter: Parameter, selection: Selection): boolean {
  if (parameter.stage === undefined) return true;
  const effective = effectiveSelection(family, selection);
  const earlierResolved = family.parameters.every(p =>
    p === parameter || p.stage === undefined || p.stage >= parameter.stage! || effective[p.key] !== undefined);
  if (!earlierResolved) return false;
  // A staged parameter collapsed to a single option needs no control —
  // effectiveSelection already pins it. Omit the meaningless step.
  // Options are counted against upstream picks only, so a resolved
  // upstream control (e.g. Copy effect) keeps its full choice list for
  // the player to switch between.
  return parameterOptions(family, parameter, upstreamSelection(family, parameter, selection)).length > 1;
}

/** Highlights and picks share exactly the Composer's options, never a second rule system. */
export function boardOptions(game: SemanticGame, family: ActionFamily, selection: Selection, activeKey: string): readonly { entityId: string; value: string }[] {
  const parameter = family.parameters.find(p => p.key === activeKey);
  if (!parameter || ['mode', 'variant', 'copy'].includes(parameter.kind)) return [];
  return parameterOptions(family, parameter, upstreamSelection(family, parameter, selection)).filter(value => value !== NONE).flatMap(value => {
    if (parameter.kind === 'slot') return [{ value, entityId: game.swap[Number(value)]?.id ?? '' }];
    // Cost options encode a declared set of own-hand card IDs.
    if (parameter.kind === 'cost') return value.split('|').map(entityId => ({ value, entityId }));
    return [{ value, entityId: value }];
  }).filter(option => option.entityId !== '');
}

export function decisionBoundary(game: SemanticGame): string {
  return JSON.stringify([game.sessionId, game.self.id, game.revision, game.frameHash]);
}
