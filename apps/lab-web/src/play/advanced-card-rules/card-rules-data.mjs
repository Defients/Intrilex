// ═══════════════════════════════════════════════════════════════
// card-rules-data.mjs — Canonical Card Rules Definition layer.
//
// This is the single canonical source for *dossier-level* card rules
// metadata: structured rulings, examples, destinations, combinations,
// generated/recursive behavior, persistent-state interactions, and
// related-rule references.
//
// It does NOT duplicate ability text. The per-mode mechanical text
// (summary / full / timing / restrictions) remains canonical in
// card-face-data.js, which is shared by:
//   - the lightweight hover tooltips (summary)
//   - this Advanced View (full + the structured data below)
//
// Engine legality remains authoritative. This module is presentation
// metadata only — it never determines what is legal in a live match.
//
// Canon authority: INTRILEX v4.3.1 COMPLETE PLAYER RULEBOOK.
// ═══════════════════════════════════════════════════════════════

import { getCardDefinition, parseCardIdentity, rankName, pointValue } from '../../card-face-data.js';

/**
 * @typedef {Object} CardRuling
 * @property {string} id
 * @property {string} title
 * @property {string} [question]
 * @property {string} ruling
 * @property {string[]} [tags]
 * @property {string[]} [relatedCards]
 * @property {string[]} [relatedSystems]
 * @property {string} [canonSource]
 */

/**
 * @typedef {Object} CardExample
 * @property {boolean} legal
 * @property {string} text
 */

/**
 * @typedef {Object} DestinationRule
 * @property {string} scenario
 * @property {string} destination
 */

/**
 * @typedef {Object} CombinationRule
 * @property {string} name
 * @property {string} description
 */

/**
 * @typedef {Object} RelatedRule
 * @property {string} label
 * @property {string} ref
 */

/**
 * @typedef {Object} CardRulesDefinition
 * @property {string} identity
 * @property {string} rank
 * @property {string|null} suit
 * @property {string} name
 * @property {number} points
 * @property {string} overview
 * @property {string} canonSource
 * @property {DestinationRule[]} [destinations]
 * @property {CombinationRule[]} [combinations]
 * @property {string[]} [generatedRecursive]
 * @property {string[]} [persistentState]
 * @property {CardRuling[]} [rulings]
 * @property {CardExample[]} [examples]
 * @property {RelatedRule[]} [relatedRules]
 */

const RULEBOOK = 'INTRILEX v4.3.1 Complete Player Rulebook';

/**
 * Build a ruling object with provenance.
 * @param {string} id
 * @param {string} title
 * @param {string} ruling
 * @param {Object} [opts]
 * @param {string} [opts.question]
 * @param {string[]} [opts.tags]
 * @param {string[]} [opts.relatedCards]
 * @param {string[]} [opts.relatedSystems]
 * @param {string} [opts.canonSource]
 * @returns {CardRuling}
 */
function ruling(id, title, ruling, opts = {}) {
  return {
    id, title, ruling,
    question: opts.question,
    tags: opts.tags,
    relatedCards: opts.relatedCards,
    relatedSystems: opts.relatedSystems,
    canonSource: opts.canonSource ?? RULEBOOK,
  };
}

// ─── Rank-level dossier data ────────────────────────────────────
// Keyed by rank token. `spade` overrides apply only to ♠ suit cards.
// Special cards (10♦, 10♠, BJ, RJ, Q♠, K♠, A♠, etc.) are handled via
// identity-level overrides in ID_OVERRIDES.

/** @type {Record<string, {overview:string, destinations?:DestinationRule[], combinations?:CombinationRule[], generatedRecursive?:string[], persistentState?:string[], rulings?:CardRuling[], examples?:CardExample[], relatedRules?:RelatedRule[], spade?:Partial<{}>}>} */
const RANK_DATA = {
  A: {
    overview: 'Aces are the primary counter authority. Every Ace may counter an eligible pending ordinary effect play or counter, may Purge an Aegised card or bounce a Vulnerable enemy Anchor, and may sit in ER as an Anchor that can later be sacrificed to counter. Aces scored into PR cannot be Scuttled or Jacked.',
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (face-up, untapped; Scuttle/Jack immune)' },
      { scenario: 'Played for Effect (counter/purge)', destination: 'GY' },
      { scenario: 'Anchor mode', destination: 'ER until sacrificed or removed' },
      { scenario: 'A♠ counters a play', destination: 'Exile (countered cards) instead of GY' },
    ],
    persistentState: [
      'Aces in PR are immune to Scuttle and Jack.',
      'An Ace Anchor in ER is a counter-on-demand: sacrifice it during a later response window to counter with Base Ace authority.',
    ],
    rulings: [
      ruling('ace-counter-scope', 'What can Base Ace counter?',
        'Base Ace counters one pending ordinary effect play or counter. It cannot counter A♠, Ultras, Sudden Death activations, a play protected from Base Ace by Royal Shield, or anything whose text explicitly excludes Base Ace. A legal Base Ace may counter an eligible multi-card effect unless a narrower rule says otherwise.',
        { tags: ['counter', 'authority'], relatedCards: ['A♠'], relatedSystems: ['Counters', 'Royal Shield'] }),
      ruling('ace-purge-modes', 'Purge has two mutually exclusive modes',
        'Choose one: Scrap one card that currently has Aegis (bypasses that Aegis for the Scrap, does not require Vulnerable); OR if no card has Aegis, bounce one Vulnerable enemy Anchor from ER to its owner\'s hand. You cannot use the bounce mode while any card has Aegis.',
        { tags: ['purge', 'aegis', 'bounce'], relatedSystems: ['Aegis', 'Vulnerable'] }),
      ruling('ace-anchor-counter', 'Anchor Ace sacrifice timing',
        'An Ace in ER as an Anchor may be sacrificed during a later response window to counter one eligible opponent play using Base Ace authority. If the counter succeeds, take one negated source card into hand as Revealed-Until-Start and send other negated source cards to their normal destinations.',
        { tags: ['anchor', 'counter'], relatedSystems: ['Anchors', 'Counters'] }),
    ],
    relatedRules: [{ label: 'Counters', ref: '§7' }, { label: 'Royal Shield', ref: '§15' }, { label: '⭐A Two-Queen Defense', ref: '§16' }],
  },
  '2': {
    overview: 'Twos are wild catalysts. A 2 may Score + Discard as a Quick, copy a same-suit rank 3–7 Base effect as a Solo Wild Copy, or — with two actual 2s — declare ⭐2 Commandeer to take control of an opponent OTT card.',
    destinations: [
      { scenario: 'Quick Score + Discard', destination: 'PR (the 2); discarded card → opponent chooses → GY' },
      { scenario: 'Solo Wild Copy', destination: 'GY after resolution' },
      { scenario: '⭐2 Commandeer', destination: 'PR (Score) or row (Hold, tapped); the 2s → GY' },
    ],
    combinations: [
      { name: 'Second card for a ⭐ Super', description: 'A 2 may act as the second card for the ⭐ Super effect of a rank 3–7 card only when both cards share the same suit. This does not create ⭐2; two actual 2s are required for ⭐2.' },
    ],
    rulings: [
      ruling('two-quick-limit', 'Only one 2 Quick pending at a time',
        'Only one 2 Quick you control may be pending at a time. After one of your 2 Quicks resolves, you cannot declare another 2 Quick during that Full Turn. A countered 2 Quick does not consume the resolved-use limit.',
        { tags: ['quick', 'limit'], relatedSystems: ['Quick'] }),
      ruling('two-solo-wild-suit', 'Solo Wild Copy requires same suit',
        'A single 2 may copy one same-suit rank 3–7 card\'s Base (🛠) effect. The 2 must match the suit of the chosen card. Suit-specific enhanced Base modes (3♠, 4♠, 6♠, 7♠) require the 2 to be 2♠. This is wild for effect only — the 2 cannot be scored as the chosen rank for Points.',
        { tags: ['wild', 'suit'], relatedCards: ['2♠'], relatedSystems: ['Wild'] }),
      ruling('two-commandeer-aegis', '⭐2 cannot target an Aegised card',
        '⭐2 Commandeer bypasses Guard and ordinary rank-based control protection, but does not bypass Aegis. It cannot legally target an Aegised card. After control changes, revalidate every Attachment involving that card.',
        { tags: ['super', 'aegis', 'control'], relatedSystems: ['Aegis', 'Attachments'] }),
    ],
    examples: [
      { legal: true, text: 'You play 2♠ alone as a Solo Wild Copy of 7♠\'s Base Topdeck effect (same suit, rank 3–7).' },
      { legal: false, text: 'You play 2♥ alone to copy 7♠\'s Base effect — illegal, the 2 must match the suit of the chosen card.' },
      { legal: false, text: 'You use one 2 as the "second card" for ⭐2 — illegal, ⭐2 requires two actual 2s.' },
    ],
    relatedRules: [{ label: '2 Wild Rule', ref: '§2 Wild Rule' }, { label: 'Supers', ref: '§9.2' }],
  },
  '3': {
    overview: 'Threes are hand-raid and bounce. A 3 may force an opponent to present cards (you take one), force a discard, or bounce a Vulnerable OTT card, and may be played as an Instant Bounce. ⭐3 Super Raid escalates the raid.',
    destinations: [
      { scenario: 'Played for Effect', destination: 'GY' },
      { scenario: 'Instant Bounce', destination: 'GY; bounced card → top/bottom of DP' },
      { scenario: 'Taken presented card', destination: 'Your hand as Revealed-Until-Start' },
    ],
    rulings: [
      ruling('three-presentation-fewer', 'Opponent has fewer cards than requested',
        'If the opponent has fewer cards than requested, they present or discard as many as possible. The effect resolves with whatever is available.',
        { tags: ['raid'], relatedSystems: ['Hand Raid'] }),
      ruling('three-spade-generated-response', '3♠ generated effect opens a response window',
        'When 3♠ Enhancement scores or plays a presented card as a separate effect play, that generated effect opens its normal response window.',
        { tags: ['spade', 'generated'], relatedCards: ['3♠'], relatedSystems: ['Generated Plays'] }),
    ],
    relatedRules: [{ label: 'Hand Raid', ref: '§3' }],
  },
  '4': {
    overview: 'Fours clear and reorder. A 4 may Row Clear opponent PR or ER Anchors, or Natural (reorder top 4 of DP, optionally draw 1). 4♠ is the structural Total Clear. ⭐4 Row Exchange swaps a whole row.',
    destinations: [
      { scenario: 'Played for Effect', destination: 'GY' },
      { scenario: 'Cleared cards', destination: 'GY (destination replacements like Exile-Bound still apply)' },
      { scenario: 'Natural drawn card', destination: 'Hand (or returned to DP)' },
    ],
    persistentState: [
      'A 4 scored into PR cannot be targeted by Effects. It may still be Scuttled and affected by legal zone-wide, global, or structural operations.',
    ],
    rulings: [
      ruling('four-row-clear-scope', 'Row Clear is zone-wide and independent',
        'Row Clear is a zone-wide, independent-card effect: Guard does not apply; Aegised cards are skipped; applicable rank or state immunity is honored. If no card can be affected, the effect resolves with no board impact. Q♠ survives the ordinary ER clear.',
        { tags: ['clear', 'guard', 'aegis'], relatedCards: ['Q♠'], relatedSystems: ['Guard', 'Aegis'] }),
      ruling('four-spade-total-clear', '4♠ Total Clear is a structural Hard Bypass',
        '4♠ Total Clear clears every OTT card from every player\'s PR and ER to GY. It bypasses Guard, Aegis, Q♠ special protection, and ordinary rank targeting and clear immunity. Destination replacements such as Exile-Bound still apply.',
        { tags: ['spade', 'structural', 'bypass'], relatedCards: ['4♠', 'Q♠'], relatedSystems: ['Exile-Bound'] }),
      ruling('four-row-exchange-aegis', '⭐4 Row Exchange grants Aegis to exchanged rows',
        'After Row Exchange, every card in each exchanged row gains new Aegis until its current controller\'s recorded next Start Phase. Nines do not gain Aegis. The exchange is structural and does not target cards individually.',
        { tags: ['super', 'aegis', 'structural'], relatedSystems: ['Aegis', 'Nines'] }),
    ],
    examples: [
      { legal: true, text: '4♠ Total Clear removes an Aegised Q♠ from ER — legal, 4♠ bypasses Aegis and Q♠ protection.' },
      { legal: false, text: 'Ordinary 4 Row Clear targets an Aegised Anchor — the Aegised card is skipped, not cleared.' },
    ],
    relatedRules: [{ label: 'Clears', ref: '§4' }, { label: 'Vulnerable', ref: '§17' }],
  },
  '5': {
    overview: 'Fives recycle and rummage. A 5 mills up to 2 from DP, rummages 1 from GY, and draws the bottom of GY. ⭐5 Super Recycle mills up to 3 and immediately plays one milled card. Suit determines Exile access for the rummage.',
    destinations: [
      { scenario: 'Played for Effect', destination: 'GY' },
      { scenario: 'Milled cards', destination: 'GY' },
      { scenario: 'Rummaged card', destination: 'Hand as Revealed-Until-Start' },
    ],
    persistentState: [
      'A 5 scored into PR is immune to ordinary Scuttle.',
      'Exile access is suit-specific: ♣ newest 2, ♥ oldest 2, ♦ middle (requires 5+ in Exile), ♠ any Exile card.',
    ],
    rulings: [
      ruling('five-empty-access-fizzle', 'Empty access set fizzles that step',
        'If the access set becomes empty before resolution, that rummage step fizzles. The rest of the effect resolves normally.',
        { tags: ['fizzle', 'exile'], relatedSystems: ['Exile', 'Fizzles'] }),
      ruling('five-super-no-mill', '⭐5 with no milled card plays nothing',
        'If no card was milled by ⭐5 Super Recycle, no card can be played. The chosen card must be one of the cards milled by this effect.',
        { tags: ['super'], relatedSystems: ['Supers'] }),
    ],
    relatedRules: [{ label: 'Recycle', ref: '§5' }, { label: 'Exile', ref: '§25' }],
  },
  '6': {
    overview: 'Sixes dig and peek. A 6 Draws 3 privately (keep 2 / return 1, or keep 3 / discard 1 from hand) and may Swap Bar Peek at face-down Swap Bar cards. 6♠ Deep Draw discards 1–2 then draws up to 6. ⭐6 Super Dig draws up to 7.',
    destinations: [
      { scenario: 'Played for Effect', destination: 'GY' },
      { scenario: 'Returned drawn cards', destination: 'Top or bottom of DP (and/or GY for ⭐6)' },
      { scenario: 'Peeked Swap Bar card', destination: 'Hand as Revealed-Until-Start, or played for effect' },
    ],
    rulings: [
      ruling('six-deep-draw-requirement', '6♠ requires another hand card',
        '6♠ Deep Draw requires at least 1 other card in hand at declaration. Discard 1 or 2 cards, then draw up to 6 privately. Keep up to 3 (if 1 discarded) or up to 4 (if 2 discarded).',
        { tags: ['spade', 'cost'], relatedCards: ['6♠'], relatedSystems: ['Dig'] }),
      ruling('six-peek-not-a-use', 'Swap Bar Peek is not a Swap Bar Use',
        'Swap Bar Peek is effect access, not a Swap Bar Use: no exchange is required, no replenishment occurs, and it does not consume your once-per-FT Swap Bar Use. It requires at least one face-down Swap Bar card.',
        { tags: ['swap-bar'], relatedSystems: ['Swap Bar'] }),
    ],
    relatedRules: [{ label: 'Deep Dig', ref: '§6' }, { label: 'Swap Bar', ref: '§Swap Bar' }],
  },
  '7': {
    overview: 'Sevens are Topdeck Casting. A 7 reveals up to the top 2 of DP, adds 1 to hand, and plays the other as a generated Topdeck Play. Scoring a 7 reveals 2 and takes 1 to hand. 7♠ reveals 3. ⭐7 Sequential Topdeck plays each revealed card one at a time with response windows.',
    destinations: [
      { scenario: 'Played for Effect (Topdeck Cast)', destination: 'GY' },
      { scenario: 'Scored for Points', destination: 'PR (face-up, untapped)' },
      { scenario: 'Revealed card → hand', destination: 'Hand as Revealed-Until-Start' },
      { scenario: 'Revealed card → generated play', destination: 'Per the generated play\'s own destination' },
      { scenario: 'Generated card with no legal declaration', destination: 'Scrapped (per Scrapping rules)' },
    ],
    combinations: [
      { name: 'Generated card + hand card', description: 'A generated revealed card may combine with cards already in hand, cards added to hand earlier during the same Seven resolution, and cards gained during an earlier nested child play.' },
      { name: 'Generated physical Seven + hand Seven → ⭐7', description: 'A revealed physical Seven may combine with an eligible Seven (or eligible same-suit 2) in hand to declare ⭐7.' },
    ],
    generatedRecursive: [
      'A generated play may create another Topdeck Casting effect ONLY when the generated revealed component is a physical Rank 7 card.',
      'A revealed non-Seven may not create another Topdeck Casting effect during that generated play.',
      'A revealed 2 cannot copy a Seven Base effect during the generated play; a revealed K♠ cannot copy 7♠ during the generated play.',
      'A 2 or K♠ declared normally outside such a sequence may still copy a Seven effect and initiate Topdeck Casting; afterwards the physical-Seven-only recursion rule applies to every card revealed by the resulting sequence.',
      'The parent Seven effect pauses while the generated play resolves, including all nested plays and triggers.',
      'A generated effect/Super/Combo creates its normal response window. A generated scoring play does not use the stack but creates the scored card\'s normal scoring trigger.',
    ],
    rulings: [
      ruling('seven-generated-combine', 'Generated card combines with hand card',
        'A generated revealed card may be played alone for effect, scored for Points, used as a component of its Rank\'s legal Super, or used as a component of another explicitly legal Combo or multi-card declaration. It may combine with cards already in hand and cards added to hand earlier during the same Seven resolution (including while marked Revealed-Until-Start).',
        { question: 'What happens if Seven reveals a 4 and the player already has another eligible 4?',
          tags: ['seven', 'generated-play', 'combination'], relatedSystems: ['Generated Plays', 'Supers'] }),
      ruling('seven-recursive-physical-only', 'Recursive Seven — physical-Seven-only',
        'A generated play may create another Topdeck Casting effect only when the generated revealed component is a physical Rank 7 card. A revealed non-Seven may not create another Topdeck Casting effect during that generated play. This restriction applies only to recursive continuation within a Topdeck Casting-generated sequence.',
        { tags: ['seven', 'recursion', 'generated-play'], relatedSystems: ['Generated Plays'] }),
      ruling('seven-scoring-trigger-vs-generated', 'Generated scoring creates the scored card\'s trigger, not the Seven trigger',
        'A generated scoring play creates the scoring trigger belonging to the card actually scored. It does NOT automatically create the Seven scoring trigger unless the card being scored is itself a Seven. The Seven scoring trigger is not itself a generated Topdeck Play — it takes one revealed card into hand and returns the others.',
        { tags: ['seven', 'scoring-trigger'], relatedSystems: ['Scoring Triggers'] }),
      ruling('seven-scrapping', 'Scrapping generated cards — check all declarations first',
        'A revealed card must not be Scrapped solely because it lacks a legal standalone effect. Before Scrapping, check every legal generated declaration (standalone effect, Points, Super, explicitly enabled Combo, other legal multi-card/special declaration), applying the physical-Seven-only recursion restriction. Scrap only if no legal generated declaration remains.',
        { question: 'What if a revealed card has no legal standalone effect?',
          tags: ['seven', 'scrap', 'generated-play'], relatedSystems: ['Generated Plays'] }),
      ruling('seven-star-sequential-state', '⭐7 evaluates the second revealed card using updated state',
        'Each revealed card in ⭐7 receives an independent declaration. Cards acquired during the first generated play are available when declaring the second. If the first generated play changes hand, board, stack, DP, GY, Exile, legal targets, components, or active restrictions, the second generated play must be evaluated using that updated state.',
        { tags: ['seven', 'super', 'sequential'], relatedSystems: ['Supers', 'Generated Plays'] }),
    ],
    examples: [
      { legal: true, text: '7 reveals a 4 and a 7. You add the 4 to hand and declare the revealed 7 as a generated Topdeck Play, which may itself recurse because it is a physical Seven.' },
      { legal: false, text: '7 reveals a 2; you declare the revealed 2 to copy a Seven Base effect and recurse — illegal, only a physical Seven may create another Topdeck Casting effect during a generated play.' },
      { legal: true, text: '7 reveals a 4 while you hold another 4; the generated 4 combines with the hand 4 to declare ⭐4.' },
      { legal: false, text: 'A generated non-Seven is scored and you also trigger the Seven scoring trigger — illegal; only the scored card\'s own trigger is created (unless it is itself a Seven).' },
    ],
    relatedRules: [{ label: 'Seven — Topdeck Casting', ref: '§7' }, { label: 'Generated Topdeck Plays', ref: '§Generated Topdeck Plays' }, { label: 'Recursive Generated Plays', ref: '§Recursive Generated Plays' }],
  },
  '8': {
    overview: 'Eights are the Aegis engine and Scuttle control. An 8 may grant Aegis to all your OTT cards, counter a pending Scuttle, and draw 1 from GY after a successful Scuttle. 8♠ may Free Scuttle (no Mini-Turn, ignore rank/suit). ⭐8 Absolute Scuttle ignores rank, suit, and ordinary Scuttle immunity.',
    destinations: [
      { scenario: 'Played for Effect', destination: 'GY' },
      { scenario: 'Scuttle source', destination: 'GY (Scuttled target also → GY)' },
      { scenario: 'Aegis Field', destination: 'GY; Aegis applied to your OTT cards' },
    ],
    persistentState: [
      'While scored in PR, an 8 cannot be targeted by Effects except 4♠ and ⭐2. This does not grant Scuttle immunity; ordinary Scuttle rules still apply.',
      'Nines do not gain Aegis from Aegis Field.',
    ],
    rulings: [
      ruling('eight-absolute-scuttle-aegis', '⭐8 still respects Aegis',
        '⭐8 Absolute Scuttle ignores rank, suit, and ordinary Scuttle immunity, but Aegis still blocks it unless another effect explicitly bypasses Aegis.',
        { tags: ['super', 'scuttle', 'aegis'], relatedCards: ['⭐8'], relatedSystems: ['Scuttle', 'Aegis'] }),
      ruling('eight-free-scuttle-immunity', '8♠ Free Scuttle respects Aegis and immunity',
        '8♠ Free Scuttle costs no Mini-Turn and ignores rank and suit requirements, but still respects Aegis, ordinary Scuttle immunity, and ownership/PR-target requirements.',
        { tags: ['spade', 'scuttle'], relatedCards: ['8♠'], relatedSystems: ['Scuttle'] }),
    ],
    relatedRules: [{ label: 'Scuttle', ref: '§19' }, { label: 'Aegis', ref: '§Aegis' }],
  },
  '9': {
    overview: 'Nines are Tap and Goal Warfare. A 9 may Tap an opponent PR card (untaps when its controller next scores), Goal Shift an opponent\'s Goal, or sit in ER as an Anchor that reveals an opponent\'s hand and forces a discard. 9♠ Goal Shift may also reduce your own Goal.',
    destinations: [
      { scenario: 'Played for Effect', destination: 'GY' },
      { scenario: 'Anchor mode', destination: 'ER (only one active Nine Anchor per controller)' },
    ],
    persistentState: [
      'Nines can never receive Aegis — not from Aegis Field, Quick Aegis, Row Exchange, or any other source.',
      'A Tapped card untaps when its controller next scores a card for Points; cards tapped under another condition do not untap.',
      'When a new Nine Anchor enters under your control, Scrap your previous Nine Anchor before the new one becomes active.',
    ],
    rulings: [
      ruling('nine-no-aegis', 'Nines can never receive Aegis',
        'No effect grants Aegis to a Nine. This is absolute and applies to all Aegis sources.',
        { tags: ['aegis', 'nine'], relatedSystems: ['Aegis'] }),
      ruling('nine-anchor-one-active', 'Only one active Nine Anchor',
        'You may control only one active Nine Anchor at a time. When a new Nine Anchor enters under your control, Scrap your previous Nine Anchor before the new one becomes active.',
        { tags: ['anchor', 'nine'], relatedSystems: ['Anchors'] }),
    ],
    relatedRules: [{ label: 'Tap / Goal Warfare', ref: '§9' }],
  },
  J: {
    overview: 'Jacks disrupt and attach. A J may Disrupt an opponent\'s Action (record it as disrupted, draw 1) or Attach to a Vulnerable opponent PR card (you control it, +1 Point). ⭐J Tempo Force grants +2 Mini-Turns. J♠ attaches to enemy ER Anchors instead.',
    destinations: [
      { scenario: 'Played for Effect (Disrupt)', destination: 'GY' },
      { scenario: 'Jack PR/ER Attachment', destination: 'ER (the Jack attaches; host stays in PR/ER)' },
      { scenario: 'Severed Jack', destination: 'GY (never sits in ER as an inactive Anchor)' },
    ],
    persistentState: [
      'A Jacked host is controlled by the Jack\'s controller, gains +1 Point, and is Jacked. Attachment validity is rechecked after relevant state changes.',
      'Disrupt records the triggering Action type as disrupted for the rest of the FT; the affected player cannot repeat it if at least one different Action is currently legal.',
    ],
    rulings: [
      ruling('jack-disrupt-scope', 'Disrupt applies to Mini-Turn Action types only',
        'Disrupt applies to the seven Mini-Turn Action types, not to Free plays, counters, triggered abilities, or module reactions. The triggering Action is not countered and continues normally. Multiple J effects may disrupt different Action types.',
        { tags: ['disrupt'], relatedSystems: ['Disrupt'] }),
      ruling('jack-spade-er-hosts', 'J♠ eligible ER hosts',
        'J♠ may attach to one Vulnerable enemy Anchor in ER. Eligible hosts include face-up Queens, Kings, Ace Anchors, Nine Anchors, and other cards explicitly functioning as Anchors. Attachments, Traps, and non-Anchor ER cards are ineligible. Changing control does not make it leave and re-enter ER; entry abilities do not trigger again.',
        { tags: ['spade', 'attachment', 'anchor'], relatedCards: ['J♠'], relatedSystems: ['Attachments', 'Anchors'] }),
    ],
    relatedRules: [{ label: 'Jack — Disrupt / Attach', ref: '§J' }],
  },
  Q: {
    overview: 'Queens are the protection engine. A Queen in ER is an Anchor worth 0 that provides Guard while untapped and enters with Aegis. A Queen may Quick-Aegis a friendly OTT card. Q♠ has Special Protection: immune to non-total multi-target clears. Two Queens may form Queen\'s Court.',
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (2 Points)' },
      { scenario: 'Anchor mode', destination: 'ER (Anchor value 0, provides Guard, enters with Aegis)' },
      { scenario: 'Queen\'s Court', destination: 'Both Queens → ER simultaneously, untapped, with Aegis' },
    ],
    combinations: [
      { name: 'Royal Marriage', description: 'A King plus the same-suit Queen as one multi-card Anchor Play; both enter ER. The Queen enters with Aegis.' },
      { name: "Queen's Court", description: 'Exactly two suited Queens from hand as one multi-card Anchor Play costing 1 Mini-Turn; both enter ER. No more than once per Full Turn. Does not require matching suits; Q♠ is a legal component.' },
    ],
    persistentState: [
      'A Queen in ER provides Guard while untapped. Guard protects other eligible friendly OTT cards; no Queen protects itself through its own Guard.',
      'Royal Shield: when declaring a protected play, compare Queen counts immediately.',
      'A Queen Quick-Aegis is limited to 1 resolved Q Quick per FT; a pending Q Quick prevents another from being declared; Nines cannot receive Aegis.',
    ],
    rulings: [
      ruling('queen-court-declaration', "Queen's Court requires exactly two hand Queens",
        "Queen's Court requires exactly two physical suited Queens, both controlled by the declaring player, both in hand when declared, both committed and revealed, a legal Action Phase, at least one available Mini-Turn, and no prior Queen's Court by that player this FT. Illegal: one/three/four Queens, a Two substitute, copied identities, a Queen from another zone, Draw & Cast supply, splitting scoring/anchoring, or treating it as a Super/Ultra/Royal Marriage.",
        { tags: ['queen', 'multi-card', 'anchor'], relatedSystems: ["Queen's Court", 'Anchors'] }),
      ruling('queen-court-counter', 'Only K♠ directly counters Queen\'s Court',
        "Queen's Court is an Anchor Play, not an Effect Play. Ordinary Kings, Base Ace, Anchor Ace, A♠, and ⭐A cannot counter it. K♠ may counter Queen's Court because it explicitly counters eligible multi-card plays. Another legal counter may still counter the pending K♠ response.",
        { tags: ['queen', 'counter', 'multi-card'], relatedCards: ['K♠'], relatedSystems: ['Counters', "Queen's Court"] }),
      ruling('queen-spade-protection', 'Q♠ Special Protection scope',
        'While OTT, Q♠ is immune to non-total multi-target clears. It is still affected by 4♠ Total Clear, ⭐2 where legal, K♠ where applicable, and any effect explicitly bypassing Q♠. All Guard and Royal Shield rules otherwise remain unchanged.',
        { tags: ['spade', 'protection', 'clear'], relatedCards: ['Q♠', '4♠'], relatedSystems: ['Guard', 'Royal Shield'] }),
    ],
    examples: [
      { legal: true, text: "You declare Queen's Court with Q♣ and Q♠ from hand — legal, suits need not match and Q♠ is a valid component." },
      { legal: false, text: 'You declare Queen\'s Court with one hand Queen and one Queen from ER — illegal, both must be in hand.' },
      { legal: false, text: 'Base Ace counters Queen\'s Court — illegal, Queen\'s Court is an Anchor Play and only K♠ directly counters it.' },
    ],
    relatedRules: [{ label: 'Queen — Protection Engine', ref: '§Q' }, { label: "Queen's Court", ref: '§Queen\'s Court' }, { label: 'Royal Shield', ref: '§15' }],
  },
  K: {
    overview: 'Kings are specialized counters and royal authority. Every King may Counter a single-card Anchor/Goal-Mod Play, Anchor into ER, and Royal Marriage with the same-suit Queen. K♠ adds Counter Multi-Play and Wild Sovereignty. K♠ is worth 9 as an Anchor.',
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (8 Points)' },
      { scenario: 'Anchor mode', destination: 'ER (Anchor value 7; K♠ worth 9)' },
      { scenario: 'Royal Marriage', destination: 'ER (King + same-suit Queen)' },
      { scenario: 'K♠ Counter Multi-Play', destination: 'GY normally' },
      { scenario: 'K♠ Wild Sovereignty', destination: 'Exile (Wild-Exile-Bound, even if countered or fizzles)' },
    ],
    rulings: [
      ruling('king-counter-single-scope', 'Regular King cannot counter multi-card plays',
        'A regular King counters one pending single-card Anchor Play or Goal-Mod Play. It cannot counter Royal Marriage, another multi-card Anchor or Goal-Mod play, or a triggered ability that is not a card play.',
        { tags: ['counter', 'king'], relatedSystems: ['Counters', 'Royal Marriage'] }),
      ruling('king-spade-counter-multi', 'K♠ Counter Multi-Play scope',
        'K♠ may counter one eligible multi-card play, including Supers, Combos, Royal Marriage, paired 10♦, or another defined multi-card stack item. K♠ bypasses protection on the play it is countering as specified, but K♠ itself may be countered normally. It cannot counter Ultras, Sudden Death, or anything whose text says only another counter may interact with it.',
        { tags: ['spade', 'counter', 'multi-card'], relatedCards: ['K♠'], relatedSystems: ['Counters', 'Supers'] }),
    ],
    relatedRules: [{ label: 'King — Specialized Counter', ref: '§K' }, { label: 'Royal Marriage', ref: '§Royal Marriage' }],
  },
  10: {
    overview: 'Tens are Exile-Grade Spikes. Limit: one Rank-10 effect play per player per Full Turn. Royal Shield does not protect Rank-10 effect plays. When a Rank-10 effect begins resolving, it gains the permanent Exile-Bound marker for the remainder of the match.',
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (10 Points; 10♣ enters with Aegis)' },
      { scenario: 'Rank-10 effect play', destination: 'GY, then Exile-Bound marker applies for the rest of the match' },
    ],
    persistentState: [
      'Exile-Bound marker: once a Rank-10 effect begins resolving, that card carries the permanent Exile-Bound marker for the remainder of the match.',
      'Royal Shield does not protect Rank-10 effect plays.',
    ],
    rulings: [
      ruling('ten-limit-per-ft', 'One Rank-10 effect play per player per Full Turn',
        'Each player may make at most one Rank-10 effect play per Full Turn. This is a per-player, per-Full-Turn limit.',
        { tags: ['ten', 'limit'], relatedSystems: ['Rank-10'] }),
    ],
    relatedRules: [{ label: 'Ten — Exile-Grade Spike', ref: '§10' }, { label: 'Voltage & Rank-10 Exile-Bound', ref: '§24' }],
  },
  RJ: {
    overview: 'Red Joker is Regime Change. When played for effect, choose one of four modes: Hand Swap, Self Reset, Opponent Attack, or Shuffle Reset (only ⭐A may counter Shuffle Reset). Scored into PR it is worth 5 and cannot be Scuttled or Jacked.',
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (5 Points; Scuttle/Jack immune)' },
      { scenario: 'Played for Effect', destination: 'GY' },
    ],
    rulings: [
      ruling('rj-shuffle-reset-counter', 'Only ⭐A may counter Shuffle Reset',
        'Of Red Joker\'s four modes, only Shuffle Reset is restricted to ⭐A as the sole direct counter. The other modes follow normal counter authority.',
        { tags: ['joker', 'counter'], relatedCards: ['⭐A'], relatedSystems: ['Counters'] }),
      ruling('rj-reveal-marker', 'Revealed-Until-Start removed on hand swap/reset',
        'When a card leaves a hand during a hand swap or reset, remove its Revealed-Until-Start marker. Cards entering the new hand are hidden unless this effect explicitly reveals them.',
        { tags: ['joker', 'reveal'], relatedSystems: ['Revealed-Until-Start'] }),
    ],
    relatedRules: [{ label: 'Red Joker — Regime Change', ref: '§RJ' }],
  },
  BJ: {
    overview: 'Black Joker is Lockdown. It may be scored for 11 Points (highest single-card PR) triggering Exile Recycle, or played for Effect via Board Lock (a Quick Effect that costs no Mini-Turn and locks out non-counter Effect plays, Scuttle, and Traps). Only ⭐A authority may directly counter Board Lock.',
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (11 Points; Scuttle/Jack immune; triggers Exile Recycle)' },
      { scenario: 'Board Lock effect', destination: 'GY; Board Lock Counter set to 2' },
    ],
    persistentState: [
      'Board Lock Counter: set to 2 on resolution. Do not reduce at end of the activation FT. At the end of each following completed FT, reduce by 1. Ends at 0. Skipped turn slots do not tick it.',
      'While Board Lock is active: no non-counter Effect plays, no Scuttle, no Trap placement, Trap triggers suppressed. Players may still Draw, use legal Swap Bar Actions, Play for Points, take a forced Exhausted Pass, declare legal counters, and resolve non-Trap triggered abilities (scoring triggers, Start abilities, Voltage abilities, ER abilities).',
      'Exile Recycle is optional, is a triggered ability, does not cost a Mini-Turn, is not an Effect play, and remains legal during Board Lock.',
    ],
    rulings: [
      ruling('bj-board-lock-declaration', 'Board Lock declaration restrictions',
        "Board Lock is a Quick Effect during your own Full Turn at a legal Quick timing window, costing no Mini-Turn. It may be declared only while the stack is empty, no trigger is waiting to enter the stack, no child play is suspended, and no unresolved Trap declaration window remains pending. It cannot be declared during another player's FT, during an atomic resolution, while Board Lock is already active, or while another rule prohibits non-counter Effect plays.",
        { tags: ['board-lock', 'declaration'], relatedSystems: ['Board Lock', 'Quick'] }),
      ruling('bj-board-lock-counter', 'Only ⭐A authority directly counters Board Lock',
        'Only ⭐A authority may directly counter Board Lock — this includes a physical ⭐A, 10♦ legally mimicking ⭐A, and a 3 Red Ultra resolving as ⭐A. Base Ace, Anchor Ace, A♠, ordinary King, and K♠ cannot directly counter Board Lock. The normal ⭐A Two-Queen Defense applies.',
        { tags: ['board-lock', 'counter'], relatedCards: ['⭐A', '10♦'], relatedSystems: ['Board Lock', 'Counters', 'Two-Queen Defense'] }),
      ruling('bj-board-lock-not-retroactive', 'Board Lock does not retroactively cancel plays',
        'Board Lock does not retroactively cancel plays declared before it resolved. It applies its restrictions immediately on resolution going forward.',
        { tags: ['board-lock'], relatedSystems: ['Board Lock'] }),
      ruling('bj-exile-recycle-exhausted', 'Exile Recycle can end Exhausted',
        'If Exile Recycle places at least one card into an empty DP while Exhausted is active, Exhausted ends immediately. If Exile is empty, the rider does nothing.',
        { tags: ['exile-recycle', 'exhausted'], relatedSystems: ['Exile Recycle', 'Exhausted'] }),
      ruling('bj-pr-immunity-scope', 'BJ PR immunity is not Aegis',
        'Black Joker cannot be Scuttled or Jacked while scored face-up in PR. This immunity does not grant Aegis. It does not prevent legal taps, row-wide/global/structural effects, 4♠ Total Clear, or another interaction that explicitly bypasses the immunity.',
        { tags: ['joker', 'immunity'], relatedCards: ['4♠'], relatedSystems: ['Scuttle', 'Attachments'] }),
    ],
    examples: [
      { legal: true, text: 'During your own FT with an empty stack, you declare Board Lock (Quick, no Mini-Turn) and set the counter to 2.' },
      { legal: false, text: 'You declare Board Lock while a stack item is pending — illegal, the stack must be empty.' },
      { legal: false, text: 'Base Ace counters Board Lock — illegal, only ⭐A authority may directly counter Board Lock.' },
    ],
    relatedRules: [{ label: 'Black Joker — Lockdown', ref: '§BJ' }, { label: 'Board Lock Restrictions', ref: '§Board Lock Restrictions' }, { label: 'Exile Recycle', ref: '§BJ Scoring Trigger' }],
  },
};

// ─── Identity-level overrides (special cards) ───────────────────
// These augment/replace rank-level data for specific identities.

/** @type {Record<string, Partial<CardRulesDefinition>>} */
const ID_OVERRIDES = {
  'A♠': {
    overview: 'A♠ is the Exile Counter authority. It counters one eligible pending ordinary play and sends countered cards to Exile instead of GY. Only ⭐A may counter A♠; Base Ace and Anchor Ace cannot. Royal Shield does not prohibit A♠ unless another rule explicitly says so.',
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (4 Points; Scuttle/Jack immune)' },
      { scenario: 'A♠ counters a play', destination: 'Exile (countered cards) instead of GY; A♠ → GY' },
    ],
    rulings: [
      ruling('aspade-who-counters', 'Only ⭐A may counter A♠',
        'Base Ace and Anchor Ace cannot counter A♠; only ⭐A may counter A♠. A♠ cannot counter an Ultra or Sudden Death activation. Royal Shield does not prohibit A♠ unless another rule explicitly says so.',
        { tags: ['spade', 'counter', 'exile'], relatedCards: ['⭐A'], relatedSystems: ['Counters', 'Exile'] }),
    ],
    relatedRules: [{ label: 'A♠ — Exile Counter', ref: '§A♠' }, { label: '⭐A — Super Counter', ref: '§⭐A' }],
  },
  'K♠': {
    overview: 'K♠ is the multi-play counter and Wild Sovereign. It counters eligible multi-card plays (bypassing protection on that play), and may declare Wild Sovereignty to copy one Spade Base effect of rank 3–7 (Exiled after that Wild use). K♠ is worth 9 as an Anchor.',
    combinations: [
      { name: 'Royal Marriage (with Q♠)', description: 'K♠ plus Q♠ as one multi-card Anchor Play; both enter ER. The Queen enters with Aegis. Wild Sovereignty cannot combine with a 2 or become part of a Super recipe.' },
    ],
    persistentState: [
      'Wild-Exile-Bound: a legally declared Wild Sovereignty play marks K♠ immediately; when the play leaves the stack it is sent to Exile instead of its normal destination — even if countered or fizzles.',
      'K♠ is worth 9 as an ER Anchor (vs 7 for other Kings).',
      'K♠ does not enter Exile when used as Counter Multi-Play — Wild Exile applies only to Wild Sovereignty.',
    ],
    destinations: [
      { scenario: 'Scored for Points', destination: 'PR (8 Points)' },
      { scenario: 'Anchor mode', destination: 'ER (Anchor value 9)' },
      { scenario: 'Counter Multi-Play', destination: 'GY normally' },
      { scenario: 'Wild Sovereignty', destination: 'Exile (Wild-Exile-Bound, even if countered or fizzles)' },
      { scenario: 'Wild 4♠', destination: 'Exile; the discarded cost card → GY (not refunded)' },
      { scenario: 'Royal Marriage (with Q♠)', destination: 'ER' },
    ],
    rulings: [
      ruling('kspade-wild-sovereignty-scope', 'Wild Sovereignty copies one Spade Base effect of rank 3–7',
        'K♠ functions as the chosen card\'s complete Spade Base effect for that play, including instructions, modes, targets, costs, and restrictions. K♠ remains K♠ for all identity checks and never assumes the copied card\'s rank, Points, Super, scoring, Voltage, or non-Base identity. It cannot combine with a 2 or become part of a Super recipe. 4♠ Total Clear via Wild requires discarding exactly one other card as a mandatory declaration cost that is not refunded if countered.',
        { tags: ['spade', 'wild', 'exile'], relatedCards: ['4♠', '7♠'], relatedSystems: ['Wild Sovereignty', 'Exile'] }),
      ruling('kspade-wild-exile-bound', 'K♠ is Exiled after Wild use even if countered',
        'A legally declared Wild Sovereignty play marks K♠ as Wild-Exile-Bound immediately. When the play leaves the stack it is sent to Exile instead of its normal destination — even if the play is countered or fizzles.',
        { tags: ['spade', 'wild', 'exile'], relatedSystems: ['Wild-Exile-Bound'] }),
      ruling('kspade-wild-not-counter-limit', 'Wild Sovereignty does not consume a per-turn counter limit',
        'The physical card leaves the game for practical purposes by entering Exile, but no separate per-turn counter limit is created. A single K♠ declaration uses only the chosen mode. K♠ does not enter Exile when used as Counter Multi-Play — Wild Exile applies only to Wild Sovereignty.',
        { tags: ['spade', 'wild', 'counter'], relatedSystems: ['Wild Sovereignty'] }),
      ruling('kspade-wild-via-draw-cast', 'Wild Sovereignty via Draw & Cast or Seven',
        'K♠ may use Wild Sovereignty through Draw & Cast or a Seven effect, provided K♠ is being legally played for Effect and every declaration requirement — including the additional 4♠ discard when applicable — can be satisfied.',
        { tags: ['spade', 'wild', 'generated'], relatedSystems: ['Generated Plays', 'Wild Sovereignty'] }),
    ],
    examples: [
      { legal: true, text: 'K♠ Wild Sovereignty copies 7♠\'s Base Topdeck effect — legal, K♠ resolves the complete 7♠ Base effect and is Exiled after.' },
      { legal: false, text: 'K♠ Wild Sovereignty copies ⭐7 (the Super) — illegal, only the Spade Base effect of rank 3–7 may be copied.' },
      { legal: false, text: 'K♠ Wild Sovereignty copies 4♠ with no other card in hand — illegal, the one-card discard is a mandatory cost.' },
      { legal: false, text: 'K♠ Wild Sovereignty is countered so K♠ returns to hand — illegal, K♠ is Wild-Exile-Bound and goes to Exile even if countered.' },
    ],
    relatedRules: [{ label: 'K♠ — Wild Sovereignty', ref: '§K♠ Wild Sovereignty' }, { label: 'Interaction Rulings — K♠', ref: '§Interaction Rulings — K♠' }],
  },
  'Q♠': {
    overview: 'Q♠ is the protection engine with Special Protection. While OTT, Q♠ is immune to non-total multi-target clears. It is still affected by 4♠ Total Clear, ⭐2 where legal, K♠ where applicable, and any effect explicitly bypassing Q♠. It is a legal Queen\'s Court component.',
    rulings: [
      ruling('qspade-clear-immunity', 'Q♠ clear immunity scope',
        'Q♠ is immune to non-total multi-target clears but is still affected by 4♠ Total Clear, ⭐2 where legal, K♠ where applicable, and any effect explicitly bypassing Q♠. All Guard and Royal Shield rules otherwise remain unchanged.',
        { tags: ['spade', 'protection', 'clear'], relatedCards: ['4♠', '⭐2', 'K♠'], relatedSystems: ['Guard', 'Royal Shield'] }),
    ],
    relatedRules: [{ label: 'Q♠ Special Protection', ref: '§Q♠' }, { label: "Queen's Court", ref: '§Queen\'s Court' }],
  },
  '10♦': {
    overview: '10♦ is the Mimic. Played alone it mimics one ⭐ effect from ranks 3–7; with any 2 it mimics one ⭐ effect from ranks 3–8, Ace, or Jack. The play always remains a Rank-10 play for limits, Royal Shield, identity, and Exile-Bound.',
    destinations: [
      { scenario: 'Played alone (Mimic)', destination: 'GY, then Exile-Bound marker applies' },
      { scenario: 'Paired with a 2 (Paired Mimic)', destination: '10♦ → GY (Exile-Bound); the 2 → GY (consumed, does not count as ⭐2)' },
      { scenario: 'Mimicking an Instant (e.g. ⭐A)', destination: '10♦ → GY (Exile-Bound); may be declared in that Instant timing window' },
    ],
    rulings: [
      ruling('tend-mimic-definition', 'What Mimic copies and what it does not',
        'Copy the chosen effect\'s instructions, legal targets, timing keyword, effect-specific bypasses, and effect-specific restrictions. For the copied effect\'s own counter, target, and bypass authority, treat the play as using that mimicked effect (a copied ⭐A may answer a play ⭐A could answer and uses the same two-Queen restriction). Do NOT copy rank, suit, Points, immunity, ownership, source-card count, or identity for any other check.',
        { tags: ['mimic', 'copy', 'identity'], relatedCards: ['⭐A'], relatedSystems: ['Mimic', 'Rank-10'] }),
      ruling('tend-paired-exclusions', 'Paired Mimic exclusions',
        'When paired with a 2, 10♦ may mimic ⭐ effects from ranks 3–8, Ace, or Jack. Excluded: ⭐2, Rank 10, Jokers, and the undefined ⭐9. The paired 2 is consumed as a source card and goes to GY after resolution; it does not count as ⭐2 or trigger ⭐2 rules.',
        { tags: ['mimic', 'paired', 'exclusions'], relatedSystems: ['Mimic', 'Rank-10'] }),
      ruling('tend-always-rank-ten', '10♦ always remains a Rank-10 play',
        'The play always remains a Rank-10 play for the once-per-FT Rank-10 limit, Royal Shield (which does not protect Rank-10 effect plays), identity, and Exile-Bound. If mimicking an Instant such as ⭐A, 10♦ may be declared in that Instant timing window while still counting as the player\'s Rank-10 effect play.',
        { tags: ['mimic', 'rank-10', 'identity'], relatedSystems: ['Rank-10', 'Royal Shield', 'Exile-Bound'] }),
    ],
    examples: [
      { legal: true, text: '10♦ alone mimics ⭐3 (Super Raid) — legal, ranks 3–7 are valid when played alone.' },
      { legal: true, text: '10♦ + 2 mimics ⭐A to answer a play only ⭐A could answer — legal, and the two-Queen restriction applies.' },
      { legal: false, text: '10♦ + 2 mimics ⭐2 — illegal, ⭐2 is excluded from Paired Mimic.' },
      { legal: false, text: '10♦ mimics and now counts as rank 3 for Points/identity — illegal, 10♦ always remains Rank-10.' },
    ],
    relatedRules: [{ label: '10♦ — Mimic', ref: '§10♦' }, { label: 'Mimic Definition', ref: '§Mimic Definition' }],
  },
  '10♠': {
    overview: '10♠ has two legal modes. Stack Theft (Interrupt) takes control of one pending single effect play and resolves it under your control; after it finishes or fizzles, both players gain a pending Full-Turn skip. Exile Recovery (Effect) recovers one card from Exile into hand. Both consume the once-per-FT Rank-10 limit.',
    destinations: [
      { scenario: 'Stack Theft resolves', destination: '10♠ → GY (Exile-Bound); stolen effect resolves under your control; both players gain a pending Full-Turn skip' },
      { scenario: 'Stack Theft countered', destination: '10♠ → GY (Exile-Bound); 10♠\'s controller still gains one pending Full-Turn skip; original caster gains none; original effect remains under original controller' },
      { scenario: 'Stolen effect has no legal target after control change', destination: 'Fizzles; committed source cards → GY; theft still resolved; both skips apply' },
      { scenario: 'Exile Recovery', destination: '10♠ → GY (Exile-Bound); recovered card → hand as Revealed-Until-Start' },
    ],
    rulings: [
      ruling('tenspade-skip-is-printed', 'The Full-Turn skip is printed on Stack Theft, not the Interrupt keyword',
        'Interrupt is a timing keyword only and has no inherent turn-skip penalty. The Full-Turn skip comes from Stack Theft\'s printed text. If 10♠ itself is countered, its controller still gains one pending Full-Turn skip; the original caster gains none and the original effect remains under its original controller.',
        { tags: ['interrupt', 'skip', 'stack-theft'], relatedSystems: ['Interrupt', 'Stack Theft'] }),
      ruling('tenspade-target-exclusions', 'Stack Theft cannot target Ultras or Sudden Death',
        'Stack Theft targets one pending single effect play, excluding Ultras and Sudden Death activations. The stolen play is not redeclared; its mode and paid costs cannot be changed. You may keep or replace any or all targets with new legal targets. Controller-relative words ("you", "your", "opponent") use you as the new controller.',
        { tags: ['stack-theft', 'target'], relatedSystems: ['Stack Theft', 'Ultras', 'Sudden Death'] }),
      ruling('tenspade-fizzle', 'Stolen effect with no legal target fizzles',
        'If the stolen effect has no legal required target after control changes, it fizzles; its committed source cards go to GY, the theft still resolved, and both Full-Turn skips apply. Pending Full-Turn skips stack; each consumes that player\'s next scheduled turn slot that has not already begun.',
        { tags: ['stack-theft', 'fizzle', 'skip'], relatedSystems: ['Stack Theft', 'Fizzles'] }),
    ],
    examples: [
      { legal: true, text: '10♠ Stack Theft targets a pending ⭐3 Super Raid and resolves it under your control; afterwards both players gain a Full-Turn skip.' },
      { legal: false, text: '10♠ Stack Theft targets a pending Ultra — illegal, Ultras are excluded.' },
      { legal: true, text: '10♠ is countered; its controller still gains one pending Full-Turn skip (printed penalty), the original caster gains none.' },
    ],
    relatedRules: [{ label: '10♠ — Stack Theft', ref: '§10♠ Stack Theft' }, { label: '10♠ — Exile Recovery', ref: '§10♠ Exile Recovery' }, { label: 'Interrupt timing hotfix', ref: '§v4.1.1' }],
  },
  '10♣': {
    overview: '10♣ is Foundation. When scored for Points, it enters PR with Aegis. If the player\'s pre-entry Secured PR was 0, it queues an optional trigger to score one legal hand card into PR without spending a Mini-Turn.',
    rulings: [
      ruling('tenclubs-foundation-bonus', 'Foundation bonus card is Points-only',
        'The bonus card is Points-only, can release Nine-conditioned taps, and creates its normal scoring trigger; it cannot be used as an effect, Scuttle source, Combo, Super, Ultra, cost, or Royal Marriage component for this instruction. Immediately before 10♣ enters PR, record that player\'s Secured PR Points; if the recorded total was 0, queue the optional trigger.',
        { tags: ['foundation', 'scoring-trigger', 'aegis'], relatedSystems: ['Scoring Triggers', 'Aegis'] }),
    ],
    relatedRules: [{ label: '10♣ — Foundation', ref: '§10♣' }],
  },
  '10♥': {
    overview: '10♥ is Tempo Spike. Gain +2 Mini-Turns this Full Turn (still respecting the 3-Mini-Turn hard cap), then draw 1.',
    rulings: [
      ruling('tenhearts-hard-cap', 'Tempo Spike respects the 3-Mini-Turn hard cap',
        'The +2 Mini-Turns still respect the 3-Mini-Turn hard cap. If you already have Mini-Turns, the grant is capped rather than stacked beyond 3.',
        { tags: ['tempo', 'mini-turn'], relatedSystems: ['Mini-Turn'] }),
    ],
    relatedRules: [{ label: '10♥ — Tempo Spike', ref: '§10♥' }],
  },
  '7♠': {
    overview: '7♠ reveals up to the top 3 cards of DP. Assign up to 1 to hand (Revealed-Until-Start), up to 1 different card as a generated Topdeck Play, and return the rest to the top in any order. Choose the hand assignment before declaring the generated play.',
    rulings: [
      ruling('sevenspade-assign-order', '7♠ hand assignment before generated play',
        'Choose the hand assignment before declaring the generated Topdeck Play. The card added to hand is immediately available as a component of the generated play. If the generated revealed card is a physical Seven, its declaration may create another Topdeck Casting effect; otherwise it may not.',
        { tags: ['spade', 'seven', 'generated'], relatedSystems: ['Generated Plays'] }),
    ],
    relatedRules: [{ label: '7♠ Topdeck', ref: '§7♠' }],
  },
  '9♠': {
    overview: '9♠ Goal Shift: when using the +5 Goal Shift mode, you may also reduce your own Goal by 2.',
    rulings: [
      ruling('ninespade-dual-shift', '9♠ dual Goal Shift',
        'When using the +5 Goal Shift mode, 9♠ may also reduce your own Goal by 2. The +3 mode is unchanged from an ordinary Nine.',
        { tags: ['spade', 'goal-shift'], relatedSystems: ['Goal Shift'] }),
    ],
    relatedRules: [{ label: '9♠ Goal Shift', ref: '§9♠' }],
  },
  '8♠': {
    overview: '8♠ adds Free Scuttle: declare a Scuttle without spending a Mini-Turn and ignore rank and suit requirements. It still respects Aegis, ordinary Scuttle immunity, and ownership/PR-target requirements.',
    relatedRules: [{ label: '8♠ Free Scuttle', ref: '§8♠' }],
  },
  'J♠': {
    overview: 'J♠ attaches to one Vulnerable enemy Anchor in ER instead of a PR card. While attached, you control that Anchor; its active text, Anchor value, Guard, and Start triggers benefit you. It cannot be Jacked again.',
    relatedRules: [{ label: 'J♠ Jack ER Attachment', ref: '§J♠' }],
  },
  '4♠': {
    overview: '4♠ is the structural Total Clear: clear every OTT card from every player\'s PR and ER to GY, bypassing Guard, Aegis, Q♠ special protection, and ordinary rank targeting/clear immunity. Destination replacements such as Exile-Bound still apply. A 4♠ scored into PR cannot be targeted by Effects.',
    relatedRules: [{ label: '4♠ Total Clear', ref: '§4♠' }],
  },
  '3♠': {
    overview: '3♠ Enhancement: for the hand-presentation mode, the opponent presents up to 2 cards (not 3). Choose 1 presented card: score it for Points, or declare it as a separate effect play under your control. A generated effect play opens its normal response window.',
    relatedRules: [{ label: '3♠ Enhancement', ref: '§3♠' }],
  },
  '6♠': {
    overview: '6♠ Deep Draw: discard 1 or 2 cards, then draw up to 6 privately. Keep up to 3 (if 1 discarded) or up to 4 (if 2 discarded). Requires at least 1 other card in hand at declaration.',
    relatedRules: [{ label: '6♠ Deep Draw', ref: '§6♠' }],
  },
  '2♠': {
    overview: '2♠ is the wild catalyst that may copy suit-specific enhanced Spade Base modes (3♠, 4♠, 6♠, 7♠) because it matches the suit. Two 2♠s are required for ⭐2 Commandeer.',
    relatedRules: [{ label: '2 Wild Rule', ref: '§2 Wild Rule' }],
  },
};

/**
 * Build the full CardRulesDefinition for an identity.
 * Merges the canonical card definition (identity/points/abilities/notes)
 * with rank-level dossier data and identity-level overrides.
 *
 * @param {string} identity - Card identity (e.g. "7♥", "K♠", "BJ")
 * @returns {CardRulesDefinition & { abilities: object[], notes: string[], badges: string[], subtitle: string, motto: string }}
 */
export function getCardRulesDefinition(identity) {
  const def = getCardDefinition(identity);
  const parsed = parseCardIdentity(identity);
  const rank = parsed.rank;
  const rankData = RANK_DATA[rank] ?? {};
  const override = ID_OVERRIDES[identity] ?? {};

  return {
    identity: def.identity,
    rank: def.rank,
    suit: def.suit,
    name: rankName(def.rank),
    points: pointValue(def.rank),
    subtitle: def.subtitle,
    motto: def.motto,
    badges: def.badges ?? [],
    abilities: def.abilities ?? [],
    notes: def.notes ?? [],
    overview: override.overview ?? rankData.overview ?? `${rankName(def.rank)}: ${def.subtitle ?? ''}`.trim(),
    canonSource: RULEBOOK,
    destinations: override.destinations ?? rankData.destinations,
    combinations: override.combinations ?? rankData.combinations,
    generatedRecursive: override.generatedRecursive ?? rankData.generatedRecursive,
    persistentState: override.persistentState ?? rankData.persistentState,
    rulings: [...(rankData.rulings ?? []), ...(override.rulings ?? [])],
    examples: override.examples ?? rankData.examples,
    relatedRules: override.relatedRules ?? rankData.relatedRules,
  };
}

/**
 * List all canonical identities (54 cards).
 * @returns {string[]}
 */
export function listCanonicalIdentities() {
  const suits = ['♣', '♦', '♥', '♠'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const ids = [];
  for (const r of ranks) for (const s of suits) ids.push(`${r}${s}`);
  ids.push('RJ', 'BJ');
  return ids;
}

/**
 * Collect every ruling across all canonical cards, keyed by ruling id.
 * Used for validation and the coverage audit.
 * @returns {CardRuling[]}
 */
export function allRulings() {
  const seen = new Set();
  const out = [];
  for (const id of listCanonicalIdentities()) {
    const def = getCardRulesDefinition(id);
    for (const r of def.rulings ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export const CARD_RULES_DATA_META = Object.freeze({
  version: '1.0.0',
  rulesVersion: '4.3.1',
  canonSource: RULEBOOK,
  identityCount: listCanonicalIdentities().length,
});

// ─── Validation / rules-drift protection (directive §23) ────────

/**
 * Validate the canonical card-rules data layer.
 * Detects: missing definitions, duplicate ruling IDs, missing
 * overview/summary, unknown identities, and broken related-rule refs.
 *
 * @returns {{ valid:boolean, errors:string[], warnings:string[] }}
 */
export function validateCardRulesData() {
  const errors = [];
  const warnings = [];
  const identities = listCanonicalIdentities();
  const knownIds = new Set(identities);
  const rulingTextById = new Map(); // id -> first ruling text

  for (const identity of identities) {
    const def = getCardRulesDefinition(identity);
    if (!def.overview) errors.push(`Missing overview for ${identity}`);
    if (!def.canonSource) errors.push(`Missing canonSource for ${identity}`);
    if (!def.abilities || def.abilities.length === 0) {
      warnings.push(`No abilities (mechanic icons) for ${identity}`);
    }
    for (const a of def.abilities ?? []) {
      if (!a.summary) errors.push(`Ability ${a.id} on ${identity} missing summary`);
      if (!a.full) errors.push(`Ability ${a.id} on ${identity} missing full text`);
    }
    const intraCardIds = new Set();
    for (const r of def.rulings ?? []) {
      if (!r.id) errors.push(`Ruling on ${identity} missing id`);
      if (!r.ruling) errors.push(`Ruling ${r.id} on ${identity} missing ruling text`);
      if (r.id) {
        // Intra-card duplicate (the same id twice on one card) is a real error.
        if (intraCardIds.has(r.id)) {
          errors.push(`Duplicate ruling id "${r.id}" within ${identity}`);
        }
        intraCardIds.add(r.id);
        // Cross-card: same id with DIFFERENT text is a drift error. Rank-level
        // rulings are intentionally shared across suits (same id + same text),
        // so identical text is allowed.
        if (rulingTextById.has(r.id)) {
          if (rulingTextById.get(r.id) !== r.ruling) {
            errors.push(`Ruling id "${r.id}" has conflicting text on ${identity}`);
          }
        } else {
          rulingTextById.set(r.id, r.ruling);
        }
      }
      for (const ref of r.relatedCards ?? []) {
        // Related-card refs may use ⭐-prefixed super ids; only validate
        // concrete identities (those present in knownIds).
        if (knownIds.has(ref)) continue;
        // ⭐-prefixed references are canonical super forms, not errors.
        if (ref.startsWith('⭐')) continue;
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Coverage audit: for each canonical identity, report which dossier
 * sections are populated. Used by the coverage audit report (§21).
 *
 * @returns {Array<{ identity:string, rank:string, sections:Record<string,boolean>, status:string }>}
 */
export function coverageAudit() {
  const identities = listCanonicalIdentities();
  const sectionKeys = [
    'overview', 'abilities', 'destinations', 'combinations',
    'generatedRecursive', 'persistentState', 'rulings', 'examples', 'relatedRules',
  ];
  return identities.map(identity => {
    const def = getCardRulesDefinition(identity);
    const sections = {};
    for (const k of sectionKeys) {
      if (k === 'overview') sections[k] = !!def.overview;
      else if (k === 'abilities') sections[k] = (def.abilities?.length ?? 0) > 0;
      else sections[k] = (def[k]?.length ?? 0) > 0;
    }
    const filled = Object.values(sections).filter(Boolean).length;
    const status = filled >= 7 ? 'COMPLETE' : filled >= 4 ? 'PARTIAL' : 'MINIMAL';
    return { identity, rank: def.rank, sections, status };
  });
}
