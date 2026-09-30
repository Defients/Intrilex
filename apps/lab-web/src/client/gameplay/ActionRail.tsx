import { useEffect, useRef } from 'react';
import type { SemanticGame } from '../game-model.js';
import { actionPreview, compatibleVariants, effectiveSelection, optionLabel, parameterOptions, resolvedAction, selectOption } from './action-family.js';
import type { ActionEntry, ActionFamily, Selection } from './action-family.js';

export type ComposerState = { boundary: string; familyId: string; selection: Selection; activeKey: string };
export type ComposerProps = {
  game: SemanticGame;
  entries: readonly ActionEntry[];
  family?: ActionFamily;
  composer: ComposerState | null;
  blocked: boolean;
  open: (family: ActionFamily) => void;
  change: (state: ComposerState | null) => void;
  choose: (actionId: string) => void;
  confirm: (actionId: string) => void;
};

export function ActionRail({ game, entries, family, composer, blocked, open, change, choose, confirm }: ComposerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnFamily = useRef<string | null>(null);
  useEffect(() => {
    if (family) {
      if (!returnFocus.current) {
        returnFocus.current = document.activeElement as HTMLElement;
        returnFamily.current = returnFocus.current?.getAttribute('data-hc-family-id') ?? null;
      }
      panel.current?.focus();
    } else {
      const target = returnFocus.current?.isConnected ? returnFocus.current :
        Array.from(document.querySelectorAll<HTMLElement>('[data-hc-family-id]')).find(element => element.getAttribute('data-hc-family-id') === returnFamily.current);
      target?.focus({ preventScroll: true });
      returnFocus.current = null; returnFamily.current = null;
    }
  }, [family?.id]);
  if (family && composer) {
    const resolved = resolvedAction(family, composer.selection);
    const effective = effectiveSelection(family, composer.selection);
    return <div className="hc-composer" ref={panel} tabIndex={-1} aria-label={`${family.title} Action Composer`} data-testid="action-composer"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); change(null); } }}>
      <button type="button" className="hc-back" onClick={() => change(null)}>‹ Legal Actions</button>
      <h3>{family.icon} {family.title}</h3>
      {family.parameters.map(parameter => {
        const picked = effective[parameter.key];
        const options = parameterOptions(family, parameter, composer.selection);
        const canPickEmpty = parameter.multiple && compatibleVariants(family, composer.selection, parameter.key).some(a => (parameter.value(a) as readonly string[]).length === 0);
        return <fieldset key={parameter.key} className="hc-parameter" data-active={composer.activeKey === parameter.key}>
          <legend><button type="button" aria-pressed={composer.activeKey === parameter.key} onClick={() => change({ ...composer, activeKey: parameter.key })}>{parameter.label}</button></legend>
          <div className="hc-options">
            {options.map(value => <button type="button" key={value} disabled={blocked} data-testid="composer-option"
              aria-pressed={Array.isArray(picked) ? picked.includes(value) : picked === value}
              onFocus={() => { if (composer.activeKey !== parameter.key) change({ ...composer, activeKey: parameter.key }); }}
              onClick={() => change({ ...composer, activeKey: parameter.key, selection: selectOption(family, composer.selection, parameter.key, value) })}>
              {optionLabel(game, family, parameter, value)}
            </button>)}
            {canPickEmpty && <button type="button" disabled={blocked} aria-pressed={Array.isArray(picked) && picked.length === 0}
              onClick={() => change({ ...composer, activeKey: parameter.key, selection: { ...composer.selection, [parameter.key]: [] } })}>No cards</button>}
          </div>
        </fieldset>;
      })}
      <p className="hc-preview" aria-live="polite">{resolved ? actionPreview(game, resolved) : `${compatibleVariants(family, composer.selection).length} legal variants remain. Choose the complete card set and options.`}</p>
      <button type="button" className="hc-confirm" disabled={blocked || !resolved} data-testid="composer-confirm" onClick={() => resolved && confirm(resolved.id)}>Confirm</button>
    </div>;
  }
  return <div className="hc-action-list" data-testid="legal-actions">
    {entries.map(entry => entry.kind === 'family'
      ? <button type="button" key={entry.family.id} className="hc-family" disabled={blocked} data-testid="action-family" data-family={entry.family.variants[0].family} data-hc-family-id={entry.family.id}
        onClick={event => { returnFocus.current = event.currentTarget; returnFamily.current = entry.family.id; open(entry.family); }}><span aria-hidden="true">{entry.family.icon}</span><span>{entry.family.title}</span><small>{entry.family.variants.length} ›</small></button>
      : <button type="button" key={entry.action.id} disabled={blocked} className="hc-action" data-family={entry.action.family} data-action-id={entry.action.id} onClick={() => choose(entry.action.id)}>{actionPreview(game, entry.action)}<small>{entry.action.timing}</small></button>)}
    {!entries.length && <p className="hc-empty">{game.status === 'completed' ? 'Match complete.' : 'Waiting for the next decision.'}</p>}
  </div>;
}
