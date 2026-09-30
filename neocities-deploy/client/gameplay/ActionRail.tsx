import { useEffect, useRef } from 'react';
import type { SemanticAction, SemanticGame } from '../game-model.js';
import { compatibleVariants, effectiveSelection, needsCompositionConfirmation, optionLabel, parameterOptions, referenceLabel, resolvedAction, selectOption, visibleCards } from './action-family.js';
import type { ActionEntry, ActionFamily, Selection } from './action-family.js';
import { SuitText, TabletopCard } from './TabletopCard.js';

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

/** Style the existing copy and authorized references without changing the move. */
function MoveCopy({ game, action }: { game: SemanticGame; action: SemanticAction }) {
  const [title, ...description] = action.label.split(' — ');
  return <span className="hc-move-text">
    <strong className="hc-move-name">{title}</strong>{description.length > 0 && <> — <em className="hc-move-effect">{description.join(' — ')}</em></>}
    {action.swapSlot !== undefined && <> · <span className="hc-move-slot">Slot {action.swapSlot + 1}</span></>}
    {action.sources.length > 0 && <> · <span className="hc-move-ref"><SuitText text={action.sources.map(id => referenceLabel(game, id)).join(' + ')} /></span></>}
    {action.targets.length > 0 && action.swapSlot === undefined && <> · <span className="hc-move-target">→ <span className="hc-move-ref"><SuitText text={action.targets.map(id => referenceLabel(game, id)).join(' + ')} /></span></span></>}
  </span>;
}

function FamilyTitle({ title }: { title: string }) {
  const [name, ...detail] = title.split(' · ');
  return <span className="hc-family-title"><strong>{name}</strong>{detail.length > 0 && <> <span className="hc-title-divider">·</span> <em>{detail.join(' · ')}</em></>}</span>;
}

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
    const needsConfirmation = needsCompositionConfirmation(family);
    function pickOption(key: string, selection: Selection) {
      const action = resolvedAction(family!, selection);
      if (!needsConfirmation && action) choose(action.id);
      else change({ ...composer!, activeKey: key, selection });
    }
    return <div className="hc-composer" data-family={family.variants[0].family} ref={panel} tabIndex={-1} aria-label={`${family.title} Action Composer`} data-testid="action-composer"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); change(null); } }}>
      <div className="fc-composer-top"><button type="button" className="hc-back link-btn" onClick={() => change(null)}>‹ Possible Moves</button><span className="fc-fam-count">{family.variants.length} variants</span></div>
      <div className="fc-composer-head"><span className="fc-composer-ic" aria-hidden="true">{family.icon}</span><span className="fc-composer-title"><FamilyTitle title={family.title} /><small>{needsConfirmation ? 'Choose cards and options, then confirm the declaration.' : 'Choose an option to play it.'}</small></span></div>
      {family.parameters.map(parameter => {
        const picked = effective[parameter.key];
        const options = parameterOptions(family, parameter, composer.selection);
        const canPickEmpty = parameter.multiple && compatibleVariants(family, composer.selection, parameter.key).some(a => (parameter.value(a) as readonly string[]).length === 0);
        return <fieldset key={parameter.key} className="hc-parameter" data-active={composer.activeKey === parameter.key}>
          <legend><button type="button" aria-pressed={composer.activeKey === parameter.key} onClick={() => change({ ...composer, activeKey: parameter.key })}>{parameter.label}</button></legend>
          <div className="hc-options">
            {options.map(value => {
              const card = ['card', 'cards', 'target'].includes(parameter.kind) ? visibleCards(game).find(card => card.id === value) : undefined;
              return <button type="button" key={value} className={`fc-opt ${card ? 'fc-opt-card' : ''}`} disabled={blocked} data-testid="composer-option"
              aria-pressed={Array.isArray(picked) ? picked.includes(value) : picked === value}
              onFocus={() => { if (composer.activeKey !== parameter.key) change({ ...composer, activeKey: parameter.key }); }}
              onClick={() => pickOption(parameter.key, selectOption(family, composer.selection, parameter.key, value))}>
              {card && <span aria-hidden="true"><TabletopCard card={card} size="sm" /></span>}<span><SuitText text={optionLabel(game, family, parameter, value)} /></span>
            </button>;
            })}
            {canPickEmpty && <button type="button" disabled={blocked} aria-pressed={Array.isArray(picked) && picked.length === 0}
              onClick={() => pickOption(parameter.key, { ...composer.selection, [parameter.key]: [] })}>No cards</button>}
          </div>
        </fieldset>;
      })}
      <p className="hc-preview" aria-live="polite">{resolved ? <MoveCopy game={game} action={resolved} /> : <><strong>{compatibleVariants(family, composer.selection).length} legal variants remain.</strong> <em>Choose the complete card set and options.</em></>}</p>
      {needsConfirmation && <button type="button" className="hc-confirm" disabled={blocked || !resolved} data-testid="composer-confirm" onClick={() => resolved && confirm(resolved.id)}>Confirm</button>}
    </div>;
  }
  return <div className="hc-action-list" data-testid="legal-actions">
    {entries.map(entry => entry.kind === 'family'
      ? <button type="button" key={entry.family.id} className="hc-family" disabled={blocked} data-testid="action-family" data-family={entry.family.variants[0].family} data-hc-family-id={entry.family.id}
        onClick={event => { returnFocus.current = event.currentTarget; returnFamily.current = entry.family.id; open(entry.family); }}><span className="hc-family-icon" aria-hidden="true">{entry.family.icon}</span><FamilyTitle title={entry.family.title} /><small className="hc-family-count"><b>{entry.family.variants.length}</b><span aria-hidden="true">›</span></small></button>
      : <button type="button" key={entry.action.id} disabled={blocked} className="hc-action" data-family={entry.action.family} data-action-id={entry.action.id} onClick={() => choose(entry.action.id)}><MoveCopy game={game} action={entry.action} /><small className="hc-move-meta"><span className="hc-timing" data-timing={entry.action.timingClass ?? entry.action.timing.toLowerCase()}>{entry.action.timing}</span><span className="hc-move-go" aria-hidden="true">›</span></small></button>)}
    {!entries.length && <p className="hc-empty">{game.status === 'completed' ? 'Match complete.' : 'Waiting for the next decision.'}</p>}
  </div>;
}
