const SUITS = {
  '♣': { id: 'clubs', name: 'Clubs', symbol: '♣', accent: '#4fd387', accent2: '#123d2f', shape: 'botanical' },
  '♦': { id: 'diamonds', name: 'Diamonds', symbol: '♦', accent: '#f07449', accent2: '#4a211a', shape: 'faceted' },
  '♥': { id: 'hearts', name: 'Hearts', symbol: '♥', accent: '#f05d78', accent2: '#4a1724', shape: 'pulse' },
  '♠': { id: 'spades', name: 'Spades', symbol: '♠', accent: '#b08cff', accent2: '#271a48', shape: 'blade' }
};

const RANK_NAMES = { A:'Ace',2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',7:'Seven',8:'Eight',9:'Nine',10:'Ten',J:'Jack',Q:'Queen',K:'King',RJ:'Red Joker',BJ:'Black Joker' };
const POINTS = { A:4,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:3,Q:2,K:8,RJ:5,BJ:11 };

const mechanic = (id, icon, title, timing, summary, full = summary, restrictions = []) => ({ id, icon, title, timing, summary, full, restrictions });

const sharedKing = [
  mechanic('counter-single','⟐','Counter Single','Instant',
    'Counter one pending single-card Anchor Play or Goal-Mod Play.',
    'Counter one pending single-card Anchor Play or Goal-Mod Play. A regular King cannot counter Royal Marriage, another multi-card Anchor or Goal-Mod play, or a triggered ability that is not a card play.'),
  mechanic('anchor','⚓','King Anchor','Anchor mode',
    'Place this King in ER as an Anchor.',
    'Place this King in ER as an Anchor. It remains in ER, provides its printed Anchor value, and can be protected and interacted with normally.'),
  mechanic('royal-marriage','◎','Royal Marriage','Action · multi-card',
    'Play this King with the Queen of the same suit; both enter ER.',
    'Declare this King plus the Queen of the same suit as one multi-card Anchor Play. Both enter ER. The Queen enters with Aegis until its controller’s recorded next Start Phase. Regular King cannot counter the Marriage; K♠ and ⭐A may counter when legal; Base Ace may counter when Royal Shield does not prevent it.')
];

function king(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedKing];
  if (spade) {
    abilities.splice(1,0, mechanic('counter-multi','▥','Counter Multi-Play','Instant',
      'Counter one eligible multi-card play and bypass protection on that play as specified.',
      'Counter one eligible multi-card play, including Supers, Combos, Royal Marriage, paired 10♦, or another defined multi-card stack item. K♠ bypasses protection on the play it is countering as specified, but K♠ itself may be countered normally.',
      ['Cannot counter Ultras.','Cannot counter Sudden Death.','Cannot counter anything whose text says only another counter may interact with it.']));
    abilities.splice(2,0, mechanic('wild-sovereignty','🛠','Wild Sovereignty','Effect',
      'When legally played for Effect, copy one Spade 🛠 Base effect of rank 3–7. K♠ is Exiled after that Wild use.',
      'Whenever K♠ may legally be played for Effect, its controller may declare Wild Sovereignty and choose exactly one Spade 🛠 Base effect from ranks 3, 4, 5, 6, or 7. K♠ functions as the chosen card’s complete Spade 🛠 Base effect for that play, including its instructions, modes, targets, costs, and restrictions. K♠ remains K♠ for all identity checks and never assumes the copied card’s rank, Points, Super, scoring, Voltage, or non-Base identity. Wild Sovereignty is always a single-card Effect play using only K♠; it cannot combine with a 2 or become part of a Super recipe. Choosing 4♠ Total Clear requires discarding exactly one other card from hand as a mandatory declaration cost that is not refunded if countered. K♠ is Wild-Exile-Bound: when the play leaves the stack it is sent to Exile instead of its normal destination.',
      ['Cannot combine with a 2.','Cannot copy more than one Spade Base effect per declaration.','4♠ Total Clear requires discarding one other card; the cost is not refunded.','K♠ is Exiled after its Wild use, even if the play is countered or fizzles.']));
  }
  return {
    identity:`K${suitSymbol}`, rank:'K', suit:suitSymbol, family:'king', title:'King',
    subtitle:'Specialized Counter / Royal Authority', motto:'Counter · Anchor · Unite',
    prValue:8, erValue:spade?9:7, authority:'canonical', art:`assets/card-art/k${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['K♠ multi-play authority','Wild Sovereignty','ER Anchor 9'] : ['Single-card counter','ER Anchor 7'],
    abilities,
    notes:[
      'Every King may be scored into PR for 8 Points.',
      `This King may enter ER as an Anchor worth ${spade?9:7}.`,
      'Royal Marriage is a specific multi-card Anchor Play, not a generic effect tier.',
      ...(spade ? ['K♠ Wild Sovereignty copies one Spade Base effect of rank 3–7 and is Exiled after that Wild use.'] : [])
    ]
  };
}

const tenShared = {
  family:'ten', title:'Ten', subtitle:'Exile-Grade Spike', motto:'Precision · Voltage · Consequence',
  prValue:10, erValue:null, authority:'canonical', art:'assets/card-art/ten.webp',
  rules:[
    'Limit: one Rank-10 effect play per player per Full Turn.',
    'Royal Shield does not protect Rank-10 effect plays.',
    'When a Rank-10 effect begins resolving, it gains the permanent Exile-Bound marker for the remainder of the match.'
  ]
};

const TENS = {
  '10♣': {
    ...tenShared, identity:'10♣', rank:'10', suit:'♣', art:'assets/card-art/10c.webp', badges:['Score stability','Aegis entry'],
    abilities:[mechanic('foundation','◫','Foundation','Scoring trigger',
      'When scored, enter PR with Aegis. If pre-entry Secured PR was 0, optionally score one legal hand card.',
      'When scored for Points, 10♣ enters PR with Aegis until its controller’s recorded next Start Phase. Immediately before it enters PR, record that player’s Secured PR Points. If the recorded total was 0, queue an optional trigger to score one legal card from hand into PR without spending a Mini-Turn. The bonus card is Points-only, can release Nine-conditioned taps, and creates its normal scoring trigger; it cannot be used as an effect, Scuttle source, Combo, Super, Ultra, cost, or Royal Marriage component for this instruction.')]
  },
  '10♦': {
    ...tenShared, identity:'10♦', rank:'10', suit:'♦', art:'assets/card-art/10d.webp', badges:['Adaptive copy','Always Rank 10'],
    abilities:[
      mechanic('mimic','◐','Mimic','Effect',
        'Played alone: mimic one ⭐ effect from ranks 3–7.',
        'Played alone, mimic one ⭐ effect from ranks 3–7. The play always remains a Rank-10 play for limits, Royal Shield, identity, and Exile-Bound.'),
      mechanic('mimic-pair','2','Paired Mimic','Multi-card Rank-10 play',
        'With any 2: mimic one ⭐ effect from ranks 3–8, Ace, or Jack.',
        'Commit 10♦ and any 2 as one multi-card Rank-10 play. Mimic one ⭐ effect from ranks 3–8, Ace, or Jack. Excluded: ⭐2, Rank 10, Jokers, and the undefined ⭐9. Copy the chosen effect’s instructions, legal targets, timing keyword, effect-specific bypasses, and restrictions; do not copy its rank, suit, Points, immunity, ownership, source-card count, or identity.')
    ]
  },
  '10♥': {
    ...tenShared, identity:'10♥', rank:'10', suit:'♥', art:'assets/card-art/10h.webp', badges:['Turn advantage','Hard cap respected'],
    abilities:[mechanic('tempo-spike','⧖','Tempo Spike','Effect',
      'Gain +2 Mini-Turns this Full Turn, still capped at 3 total. Then draw 1.',
      'Gain +2 Mini-Turns this Full Turn, still respecting the 3-Mini-Turn hard cap. Then draw 1.')]
  },
  '10♠': {
    ...tenShared, identity:'10♠', rank:'10', suit:'♠', art:'assets/card-art/10s.webp', badges:['Printed skip consequence','Two legal modes'],
    abilities:[
      mechanic('stack-theft','↻','Stack Theft','Interrupt',
        'Take control of one pending single effect play; after it finishes or fizzles, both players gain a pending Full-Turn skip.',
        'Target one pending single effect play, excluding Ultras and Sudden Death activations. If Stack Theft resolves, change that stack item’s controller to you; preserve its sources, chosen mode, paid costs, tier, and declaration history; you may keep or replace any or all targets with new legal targets; then resolve it under your control. After it finishes or fizzles, both you and the original caster gain one pending Full-Turn skip. If 10♠ itself is countered, its controller still gains one pending Full-Turn skip; the original caster gains none and the original effect remains under its original controller.',
        ['The skip consequence is printed on Stack Theft; Interrupt itself has no default skip.','Cannot target Ultras.','Cannot target Sudden Death activations.']),
      mechanic('exile-recovery','⊘','Exile Recovery','Effect',
        'Recover one card from Exile into hand as Revealed-Until-Start.',
        'Recover one card from Exile into your hand as Revealed-Until-Start. This is a Rank-10 effect play and consumes the once-per-Full-Turn Rank-10 limit.')
    ]
  }
};

// ─── ACE — Counter Authority ──────────────────────────────────────────────
const sharedAce = [
  mechanic('base-counter','⟐','Base Counter','Instant',
    'Counter one pending ordinary effect play or counter.',
    'Counter one pending ordinary effect play or counter. Base Ace cannot counter A♠, Ultras, Sudden Death activations, a play protected from Base Ace by Royal Shield, or anything whose text explicitly excludes Base Ace. A legal Base Ace may counter an eligible multi-card effect unless a narrower rule says otherwise.'),
  mechanic('purge','✕','Purge','Effect',
    'Scrap one Aegised card, or bounce one Vulnerable enemy Anchor if nothing has Aegis.',
    'Choose one: Scrap one card that currently has Aegis (bypasses that Aegis for the Scrap, does not require Vulnerable); or if no card has Aegis, bounce one Vulnerable enemy Anchor from ER to its owner\'s hand.'),
  mechanic('anchor-counter','⚓','Anchor Counter','Anchor mode',
    'Place Ace in ER; sacrifice it later to counter one eligible play with Base Ace authority.',
    'Place Ace in ER as an Anchor. During a later response window, you may sacrifice it to counter one eligible opponent play using Base Ace authority. It cannot counter Ultras, Sudden Death, A♠, or a Royal Shield-protected play unless another effect explicitly expands it. If its counter succeeds, take one negated source card into your hand as Revealed-Until-Start and send other negated source cards to their normal destinations. The Anchor remains in ER until sacrificed or removed.')
];
function ace(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedAce];
  if (spade) abilities.splice(1,0, mechanic('exile-counter','✦','Exile Counter','Instant',
    'Counter one eligible pending ordinary play; countered cards go to Exile.',
    'Counter one eligible pending ordinary play. A♠ cannot counter an Ultra or Sudden Death activation. Base Ace and Anchor Ace cannot counter A♠; only ⭐A may counter A♠. Cards countered by A♠ go to Exile instead of GY. Royal Shield does not prohibit A♠ unless another rule explicitly says so.'));
  return {
    identity:`A${suitSymbol}`, rank:'A', suit:suitSymbol, family:'ace', title:'Ace',
    subtitle:'Counter Authority', motto:'Counter · Purge · Anchor',
    prValue:4, erValue:null, authority:'canonical', art:`assets/card-art/a${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['A♠ exile counter','PR Scuttle immune'] : ['Base Ace counter','PR Scuttle immune'],
    abilities,
    notes:[
      'When scored for Points, Aces cannot be Scuttled or Jacked.',
      spade ? 'A♠ uses expanded Exile Counter authority.' : 'A physical A♣/A♦/A♥ using the generic counter ability is a Base Ace counter.'
    ]
  };
}

// ─── TWO — Wild Catalyst ──────────────────────────────────────────────────
const sharedTwo = [
  mechanic('quick-score-discard','⇄','Score + Discard','Quick',
    'Score this 2 into PR for 2 Points; chosen opponent discards 1 card.',
    'Score this 2 into PR for 2 Points. Then the chosen opponent discards 1 card of their choice. Limit: only one 2 Quick you control pending at a time; after one of your 2 Quicks resolves, you cannot declare another 2 Quick during that FT; a countered 2 Quick does not consume the resolved-use limit.'),
  mechanic('solo-wild','★','Solo Wild Copy','Effect',
    'Copy one same-suit rank 3–7 Base (🛠) effect; wild for effect only.',
    'A single 2 may be played alone as a wild copy of one same-suit rank 3–7 card\'s Base (🛠) effect. The 2 must match the suit of the chosen rank 3–7 card. The 2 adopts the chosen rank\'s Base effect only; Super effects still require a second same-rank card. This costs 1 Mini-Turn and the 2 goes to GY after resolution. This is wild for effect only — the 2 cannot be scored as the chosen rank for Points. Suit-specific enhanced Base modes (3♠, 4♠, 6♠, 7♠) require the 2 to be 2♠.'),
  mechanic('commandeer','⇶','⭐2 Commandeer','Super',
    'Take control of one opponent OTT card; bypasses Guard and rank protection, not Aegis.',
    'Take control of one opponent OTT card. ⭐2 bypasses Guard and ordinary rank-based control protection; does not bypass Aegis; cannot legally target an Aegised card; counts as affecting and changing control. After control changes, revalidate every Attachment involving that card. The taken card receives a new Tap State that replaces any prior Tap State and expires at the new controller\'s recorded next Start Phase. Choose: Score it (move to PR untapped, remove Tap State) or Hold it (leave in row tapped).')
];
function two(suitSymbol) {
  return {
    identity:`2${suitSymbol}`, rank:'2', suit:suitSymbol, family:'two', title:'Two',
    subtitle:'Wild Catalyst', motto:'Score · Copy · Commandeer',
    prValue:2, erValue:null, authority:'canonical', art:`assets/card-art/2${SUITS[suitSymbol].id[0]}.webp`,
    badges:['Wild catalyst for ranks 3–7','Solo Wild copy'],
    abilities:[...sharedTwo],
    notes:[
      'A 2 may act as the second card for the ⭐ Super effect of a rank 3–7 card only when both cards share the same suit.',
      'This does not create ⭐2; two actual 2s are required for ⭐2.'
    ]
  };
}

// ─── THREE — Hand Raid / Bounce ───────────────────────────────────────────
const sharedThree = [
  mechanic('hand-raid','⇄','Hand Raid','Effect',
    'Choose one: opponent presents up to 3 cards (take 1); opponent discards up to 2; or bounce 1 Vulnerable OTT card.',
    'Choose one: An opponent presents up to 3 cards from their hand, you take 1 as Revealed-Until-Start and return the rest; or that opponent discards up to 2 cards of their choice; or bounce 1 Vulnerable OTT card to the top of DP. If the opponent has fewer cards than requested, they present or discard as many as possible.'),
  mechanic('instant-bounce','↶','Instant Bounce','Instant',
    'Bounce 1 Vulnerable OTT card to the top or bottom of DP.',
    'Bounce 1 Vulnerable OTT card to the top or bottom of DP, chosen by the caster. The target is revalidated when resolving. It becomes Locked only when the Bounce begins resolving.')
];
function three(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedThree];
  if (spade) abilities.splice(0,1, mechanic('spade-enhancement','★','3♠ Enhancement','Effect',
    'Opponent presents up to 2 cards; take 1 and score it or play it for effect.',
    'For a hand-presentation mode, have the opponent present up to 2 cards instead of 3. Choose 1 presented card: score it for Points; or declare it as a separate effect play under your control. Return every other presented card. A generated effect play opens its normal response window.'));
  abilities.push(mechanic('super-raid','⇶','⭐3 Super Raid','Super',
    'Opponent presents up to 3 cards (take up to 2) or opponent discards until 2 cards remain.',
    'Choose one: opponent presents up to 3 cards, take up to 2 into your hand as Revealed-Until-Start and return the rest; or opponent discards until only 2 cards remain in their hand.'));
  return {
    identity:`3${suitSymbol}`, rank:'3', suit:suitSymbol, family:'three', title:'Three',
    subtitle:'Hand Raid / Bounce', motto:'Raid · Bounce · Disrupt',
    prValue:3, erValue:null, authority:'canonical', art:`assets/card-art/3${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['3♠ enhanced raid','Generated effect opens response window'] : ['Hand raid','Instant bounce'],
    abilities,
    notes:['Generated effect plays open their own response window.']
  };
}

// ─── FOUR — Clears / Exchanges ────────────────────────────────────────────
const sharedFour = [
  mechanic('row-clear','⌫','Row Clear','Effect',
    'Clear every opponent PR card or every opponent Anchor in ER that this effect can legally affect.',
    'Choose one: clear every opponent PR card that this effect can legally affect; or clear every opponent Anchor in ER that this effect can legally affect. This is a zone-wide, independent-card effect: Guard does not apply; Aegised cards are skipped; applicable rank or state immunity is honored; if no card can be affected, the effect resolves with no board impact. Q♠ survives the ordinary ER clear.'),
  mechanic('natural','⬆','Natural','Quick',
    'Look at top 4 cards of DP, reorder them, optionally draw 1.',
    'Look at the top 4 cards of DP, reorder them, then optionally draw 1 of them from the top.')
];
function four(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedFour];
  if (spade) abilities.splice(0,1, mechanic('total-clear','⌫','4♠ Total Clear','Effect',
    'Clear every OTT card from every player\'s PR and ER to GY.',
    'Clear every OTT card from every player\'s PR and ER to GY. 4♠ is a structural Hard Bypass: bypasses Guard, Aegis, Q♠ special protection, and ordinary rank targeting and clear immunity. Destination replacements such as Exile-Bound still apply.'));
  abilities.push(mechanic('row-exchange','⇶','⭐4 Row Exchange','Super',
    'Exchange your PR or ER with one opponent\'s PR or ER.',
    'Choose one: exchange your PR with one opponent\'s PR; or exchange your ER with one opponent\'s ER. Row Exchange is structural: it does not target cards individually; existing Guard, Aegis, and rank target immunity do not stop the exchange; Attachments are revalidated after the exchange. After the exchange, every card in each exchanged row gains new Aegis until its current controller\'s recorded next Start Phase. Nines do not gain Aegis.'));
  return {
    identity:`4${suitSymbol}`, rank:'4', suit:suitSymbol, family:'four', title:'Four',
    subtitle:'Clears / Exchanges', motto:'Clear · Reorder · Exchange',
    prValue:4, erValue:null, authority:'canonical', art:`assets/card-art/4${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['4♠ Total Clear','PR effect-target immune'] : ['Row Clear','PR effect-target immune'],
    abilities,
    notes:['If scored for Points, cannot be targeted by Effects. May still be Scuttled and affected by legal zone-wide, global, or structural operations.']
  };
}

// ─── FIVE — Recycle / Rummage ─────────────────────────────────────────────
const sharedFive = [
  mechanic('recycle','↺','Recycle Line','Effect',
    'Mill up to 2 from DP, rummage 1 from GY, draw bottom of GY.',
    'Mill up to 2 cards from the top of DP to GY. Then: rummage 1 legal card from GY into your hand as Revealed-Until-Start; draw the bottom card of GY, if one remains.'),
  mechanic('super-recycle','⇶','⭐5 Super Recycle','Super',
    'Mill up to 3 from DP, play one milled card for Points or effect.',
    'Mill up to 3 cards from DP to GY. Choose one of the cards milled by this effect and play it immediately for Points or for effect, respecting all timing, target, and per-FT limits. If no card was milled, no card can be played.')
];
const FIVE_SUIT_RUMMAGE = {
  '♣':'Access the newest 2 Exile cards.',
  '♦':'Access every card except the newest 2 and oldest 2 (requires 5+ cards in Exile).',
  '♥':'Access the oldest 2 Exile cards.',
  '♠':'Access any Exile card.'
};
function five(suitSymbol) {
  return {
    identity:`5${suitSymbol}`, rank:'5', suit:suitSymbol, family:'five', title:'Five',
    subtitle:'Recycle / Rummage', motto:'Mill · Rummage · Replay',
    prValue:5, erValue:null, authority:'canonical', art:`assets/card-art/5${SUITS[suitSymbol].id[0]}.webp`,
    badges:['PR Scuttle immune','Suit-specific Exile access'],
    abilities:[...sharedFive],
    notes:[
      'If scored for Points, immune to ordinary Scuttle.',
      `Exile access: ${FIVE_SUIT_RUMMAGE[suitSymbol]}`,
      'If the access set becomes empty before resolution, that rummage step fizzles.'
    ]
  };
}

// ─── SIX — Deep Dig ───────────────────────────────────────────────────────
const sharedSix = [
  mechanic('dig','⬇','Dig','Effect',
    'Draw 3 privately; keep 2 and return 1, or keep all 3 and discard 1 from hand.',
    'Draw 3 privately. Choose one: keep 2 and return 1 to the top or bottom of DP; or keep all 3 and discard 1 card from your hand to GY. If fewer than 3 cards can be drawn, resolve using the cards actually drawn.'),
  mechanic('swap-bar-peek','◉','Swap Bar Peek','Quick',
    'Privately look at up to 2 face-down Swap Bar cards; take 1 or play it for effect.',
    'Requirement: at least one face-down Swap Bar card exists. Privately look at up to two face-down Swap Bar cards. Choose one looked-at card: take it into hand as Revealed-Until-Start; or play it immediately for effect only. This is effect access, not a Swap Bar Use: no exchange is required, no replenishment occurs, it does not consume your once-per-FT Swap Bar Use.')
];
function six(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedSix];
  if (spade) abilities.splice(0,1, mechanic('deep-draw','⬇','6♠ Deep Draw','Effect',
    'Discard 1–2 cards, draw up to 6; keep 3 or 4 depending on discard.',
    'You must have at least 1 other card in hand to declare this effect. Discard 1 or 2 cards, then draw up to 6 privately. If you discarded 1, keep up to 3 drawn cards. If you discarded 2, keep up to 4 drawn cards. Return every other drawn card to DP in any order. If DP contains fewer cards, do as much as possible.'));
  abilities.push(mechanic('super-dig','⇶','⭐6 Super Dig','Super',
    'Draw up to 7 privately, keep up to 4, return the rest to DP and/or GY.',
    'Draw up to 7 privately. Keep up to 4. Return every remaining drawn card to DP and/or GY in any distribution you choose.'));
  return {
    identity:`6${suitSymbol}`, rank:'6', suit:suitSymbol, family:'six', title:'Six',
    subtitle:'Deep Dig', motto:'Dig · Peek · Draw',
    prValue:6, erValue:null, authority:'canonical', art:`assets/card-art/6${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['6♠ Deep Draw','Requires 1+ other hand card'] : ['Dig','Swap Bar Peek'],
    abilities,
    notes:['6♠ requires at least one other hand card at declaration.']
  };
}

// ─── SEVEN — Topdeck Casting ───────────────────────────────────────────────
const sharedSeven = [
  mechanic('topdeck-cast','⬆','Topdeck Cast','Effect',
    'Reveal up to top 2 of DP; add 1 to hand, play the other for effect.',
    'Reveal up to the top 2 cards of DP. With two cards, add 1 to your hand as Revealed-Until-Start and play the other immediately for effect. With one card, choose to add it to hand as Revealed-Until-Start or play it for effect. With no card, resolve with no effect. The generated effect play creates its normal response window.'),
  mechanic('scoring-trigger','⚡','Scoring Trigger','Scoring trigger',
    'When scored: reveal top 2 of DP, take 1 to hand, return the rest.',
    'When scored for Points: reveal up to the top 2 cards of DP; take 1 revealed card into hand as Revealed-Until-Start; return every other revealed card to the top in any order. This trigger uses the stack.')
];
function seven(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedSeven];
  if (spade) abilities.splice(0,1, mechanic('spade-topdeck','⬆','7♠ Topdeck','Effect',
    'Reveal up to top 3 of DP; assign 1 to hand, 1 to effect, return the rest.',
    'Reveal up to the top 3 cards of DP. Assign as many different available cards as possible: up to 1 to hand as Revealed-Until-Start; up to 1 to play for effect; return every remaining revealed card to the top in any order.'));
  abilities.push(mechanic('sequential-topdeck','⇶','⭐7 Sequential Topdeck','Super',
    'Reveal top 2 of DP, play each for effect one at a time with response windows.',
    'Reveal up to the top 2 cards of DP and choose their order. For each revealed card, one at a time: suspend ⭐7, declare that card as a separate effect play, open a normal response window, resolve that play and every trigger it generates, then resume ⭐7 and continue. Both cards are played for effect only. If one has no legal effect declaration, Scrap it and continue.'));
  return {
    identity:`7${suitSymbol}`, rank:'7', suit:suitSymbol, family:'seven', title:'Seven',
    subtitle:'Topdeck Casting', motto:'Reveal · Cast · Sequence',
    prValue:7, erValue:null, authority:'canonical', art:`assets/card-art/7${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['7♠ 3-card reveal','Suspended child plays'] : ['Topdeck casting','Scoring trigger'],
    abilities,
    notes:['⭐7 uses suspended child plays.']
  };
}

// ─── EIGHT — Aegis Engine / Scuttle Control ───────────────────────────────
const sharedEight = [
  mechanic('aegis-field','◇','Aegis Field','Quick',
    'Grant Aegis to all your OTT cards until your next Start Phase.',
    'Grant Aegis to all your OTT cards until your recorded next Start Phase. New Aegis replaces old Aegis. Nines do not gain Aegis.'),
  mechanic('scuttle-counter','⟐','Scuttle Counter','Instant',
    'Counter one pending Scuttle attempt.',
    'Counter one pending Scuttle attempt. The countered Scuttle source card goes to GY. The target remains where it is.'),
  mechanic('scuttle-bonus','+','Scuttle Bonus','Passive',
    'After resolving an ordinary Scuttle with an 8, draw 1 from top or bottom of GY.',
    'After you successfully resolve an ordinary Scuttle using an 8 as the Scuttle source, draw 1 from the top or bottom of GY.')
];
function eight(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedEight];
  if (spade) abilities.splice(1,0, mechanic('free-scuttle','⌫','8♠ Free Scuttle','Instant',
    'Declare a Scuttle without spending a Mini-Turn; ignore rank and suit requirements.',
    'Declare a Scuttle without spending a Mini-Turn and ignore rank and suit requirements. It still respects: Aegis; ordinary Scuttle immunity; ownership and PR-target requirements.'));
  abilities.push(mechanic('absolute-scuttle','⇶','⭐8 Absolute Scuttle','Super',
    'Scuttle any enemy PR card, ignoring rank, suit, and ordinary Scuttle immunity.',
    'Scuttle any enemy PR card, ignoring rank, suit, and ordinary Scuttle immunity. Aegis still blocks ⭐8 unless another effect explicitly bypasses it.'));
  return {
    identity:`8${suitSymbol}`, rank:'8', suit:suitSymbol, family:'eight', title:'Eight',
    subtitle:'Aegis Engine / Scuttle Control', motto:'Protect · Counter · Scuttle',
    prValue:8, erValue:null, authority:'canonical', art:`assets/card-art/8${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['8♠ Free Scuttle','PR effect-target immune'] : ['Aegis Field','Scuttle Counter'],
    abilities,
    notes:['While scored in PR, cannot be targeted by Effects except 4♠ and ⭐2. This does not grant Scuttle immunity; ordinary Scuttle rules still apply.']
  };
}

// ─── NINE — Tap / Goal Warfare ────────────────────────────────────────────
const sharedNine = [
  mechanic('tap','⊙','Tap','Instant',
    'Tap one opponent PR card; untaps when its controller next scores for Points.',
    'Tap one opponent PR card. Replace that card\'s current Tap State with: Untap when its current controller next scores a card for Points. When that controller scores: the new Points card enters PR, every card they control with this Nine condition untaps simultaneously, recalculate Secured PR Points, and place or queue the newly scored card\'s trigger. Cards tapped under another condition do not untap.'),
  mechanic('goal-shift','⌖','Goal Shift','Instant',
    'Increase one opponent\'s Goal by 3, or by 5 then you discard 1.',
    'Choose one: increase one opponent\'s Goal by 3; or increase one opponent\'s Goal by 5, then you discard 1 card.'),
  mechanic('anchor','⚓','Nine Anchor','Anchor mode',
    'Place Nine in ER; reveal one opponent\'s hand, that opponent discards 1.',
    'Place Nine in ER. Reveal one opponent\'s hand; that opponent discards 1 card of their choice. You may control only one active Nine Anchor at a time. When a new Nine Anchor enters under your control, Scrap your previous Nine Anchor before the new one becomes active.')
];
function nine(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedNine];
  if (spade) abilities.splice(1,1, mechanic('spade-goal-shift','⌖','9♠ Goal Shift','Instant',
    '+5 Goal Shift: may also reduce your own Goal by 2.',
    'When using the +5 Goal Shift mode, you may also reduce your own Goal by 2.'));
  return {
    identity:`9${suitSymbol}`, rank:'9', suit:suitSymbol, family:'nine', title:'Nine',
    subtitle:'Tap / Goal Warfare', motto:'Tap · Shift · Anchor',
    prValue:9, erValue:null, authority:'canonical', art:`assets/card-art/9${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['9♠ dual Goal Shift','Can never receive Aegis'] : ['Tap','Goal Shift','Can never receive Aegis'],
    abilities,
    notes:['Nines can never receive Aegis.']
  };
}

// ─── JACK — Disrupt / Attach ───────────────────────────────────────────────
const sharedJack = [
  mechanic('disrupt','⚡','Disrupt','Instant',
    'Respond to opponent\'s Action; record it as disrupted and draw 1.',
    'Respond to an opponent\'s Mini-Turn Action declaration. If J resolves: record the triggering Action type as disrupted for that acting player for the rest of the current FT; draw 1. The triggering Action is not countered and continues normally. For the rest of that FT, the affected player cannot repeat a disrupted Action type if at least one different Action is currently legal. Disrupt applies to the seven Mini-Turn Action types, not to Free plays, counters, triggered abilities, or module reactions.'),
  mechanic('jack-pr','🔗','Jack PR Attachment','Anchor · Attachment',
    'Attach to one Vulnerable opponent PR card; you control it, it gains +1 Point.',
    'Attach to one Vulnerable opponent PR card. While attached: you control the host card; the host remains in PR and counts toward your Secured PR Points; it gains +1 Point; it is Jacked. If the host leaves PR or the Attachment otherwise becomes invalid, sever the Jack.'),
  mechanic('tempo-force','⇶','⭐J Tempo Force','Super',
    'Gain +2 Mini-Turns this FT, still capped at 3.',
    'Gain +2 Mini-Turns this Full Turn, still capped at 3.')
];
function jack(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedJack];
  if (spade) abilities.splice(1,1, mechanic('jack-er','🔗','J♠ Jack ER Attachment','Anchor · Attachment',
    'Attach to one Vulnerable enemy Anchor in ER; you control it.',
    'Attach to one Vulnerable enemy Anchor in ER. While attached: you control that Anchor; it remains in ER; its active text, Anchor value, Guard, and Start triggers benefit you; changing control does not make it leave and re-enter ER; entry abilities do not trigger again; it cannot be Jacked again. Eligible hosts include face-up Queens, Kings, Ace Anchors, Nine Anchors, and other cards explicitly functioning as Anchors. If J♠ leaves or the relationship becomes invalid, sever it.'));
  return {
    identity:`J${suitSymbol}`, rank:'J', suit:suitSymbol, family:'jack', title:'Jack',
    subtitle:'Disrupt / Attach', motto:'Disrupt · Control · Tempo',
    prValue:3, erValue:null, authority:'canonical', art:`assets/card-art/j${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['J♠ ER Attachment','Disrupt'] : ['PR Attachment','Disrupt'],
    abilities,
    notes:['Attachment validity is rechecked after relevant state changes.','A severed Jack never sits in ER as an inactive Anchor.']
  };
}

// ─── QUEEN — Protection Engine ─────────────────────────────────────────────
const sharedQueen = [
  mechanic('quick-aegis','◇','Quick Aegis','Quick',
    'Grant Aegis to one friendly OTT card until your next Start Phase.',
    'Grant Aegis to one friendly OTT card until your controller\'s recorded next Start Phase. Limit: 1 resolved Q Quick per FT; a pending Q Quick prevents another from being declared; Nines cannot receive Aegis.'),
  mechanic('guard-anchor','⚓','Queen Anchor · Guard','Anchor mode',
    'Place Queen in ER as an Anchor; provides Guard while untapped.',
    'A Queen in ER is an Anchor worth 0 Points and provides Guard while untapped. A Queen enters ER with Aegis until its controller\'s recorded next Start Phase. This is part of entry: it does not use the stack, it cannot be separately responded to, opponents may still respond to the play before the Queen enters, and control changes without re-entry do not retrigger it.')
];
function queen(suitSymbol) {
  const spade = suitSymbol === '♠';
  const abilities = [...sharedQueen];
  if (spade) abilities.push(mechanic('spade-protection','◆','Q♠ Special Protection','Passive',
    'While OTT, Q♠ is immune to non-total multi-target clears.',
    'While OTT, Q♠ is immune to non-total multi-target clears. It is still affected by: 4♠ Total Clear; ⭐2 where legal; K♠ where applicable; any effect explicitly bypassing Q♠. All Guard and Royal Shield rules otherwise remain unchanged.'));
  return {
    identity:`Q${suitSymbol}`, rank:'Q', suit:suitSymbol, family:'queen', title:'Queen',
    subtitle:'Protection Engine', motto:'Guard · Aegis · Shield',
    prValue:2, erValue:0, authority:'canonical', art:`assets/card-art/q${SUITS[suitSymbol].id[0]}.webp`,
    badges: spade ? ['Q♠ clear immunity','Guard provider'] : ['Guard provider','Protected ER entry'],
    abilities,
    notes:[
      'A Queen scored into PR is worth 2 Points.',
      'A Queen in ER provides Guard while untapped.',
      'Royal Shield: when declaring a protected play, compare Queen counts immediately.'
    ]
  };
}

// ─── JOKERS ───────────────────────────────────────────────────────────────
const RED_JOKER = {
  identity:'RJ', rank:'RJ', suit:null, family:'joker', title:'Red Joker',
  subtitle:'Regime Change', motto:'Swap · Reset · Attack',
  prValue:5, erValue:null, authority:'canonical', art:'assets/card-art/rj.webp',
  badges:['PR Scuttle immune','PR Jack immune','4 effect modes'],
  abilities:[
    mechanic('hand-swap','⇄','Hand Swap','Effect',
      'Exchange complete hands with one opponent.',
      'Exchange complete hands with one opponent. When a card leaves a hand during a hand swap or reset, remove its Revealed-Until-Start marker. Cards entering the new hand are hidden unless this effect explicitly reveals them.'),
    mechanic('self-reset','↺','Self Reset','Effect',
      'Discard your hand, then draw a new hand with 3 more cards than you discarded.',
      'Discard your hand, then draw a new hand containing 3 more cards than you discarded.'),
    mechanic('opponent-attack','⚔','Opponent Attack','Effect',
      'Chosen opponent discards their hand, then redraws 2 fewer cards (minimum 0).',
      'Chosen opponent discards their hand, then redraws 2 fewer cards than they discarded, minimum 0.'),
    mechanic('shuffle-reset','↻','Shuffle Reset','Effect',
      'Shuffle DP and GY together into a new DP, then draw 2. Only ⭐A may counter this mode.',
      'Shuffle DP and GY together into a new DP, then draw 2. Only ⭐A may counter this mode.')
  ],
  notes:['When played for effect, choose one of the four modes.','Cannot be Scuttled or Jacked while scored for Points.']
};

const BLACK_JOKER = {
  identity:'BJ', rank:'BJ', suit:null, family:'joker', title:'Black Joker',
  subtitle:'Lockdown', motto:'Lock · Recycle · Dominate',
  prValue:11, erValue:null, authority:'canonical', art:'assets/card-art/bj.webp',
  badges:['Highest single-card PR (11)','Board Lock Quick','Exile Recycle rider','⭐A counter only'],
  abilities:[
    mechanic('board-lock','🔒','Board Lock','Quick Effect',
      'Quick during your own FT; costs no Mini-Turn. Set Board Lock Counter to 2. Only ⭐A may directly counter.',
      'Board Lock is a Quick Effect. During your own Full Turn, at a legal Quick timing window, you may declare Board Lock without spending a Mini-Turn. Board Lock may be declared only while the stack is empty, no trigger is waiting to enter the stack, no child play is suspended, and no unresolved Trap declaration window remains pending. Board Lock cannot be declared during another player\'s Full Turn, during an atomic resolution, while Board Lock is already active, or while another rule prohibits non-counter Effect plays. When Board Lock resolves: set Board Lock Counter to 2; record the current Full Turn as the activation Full Turn; apply Board Lock\'s restrictions immediately. While active: no player may declare a non-counter Effect play (including Play for Effect, Draw & Cast, Quick, Instant, Interrupt, or Special Interrupt effects that are not counters, generated child card plays for non-counter effects, Supers/Combos/Ultras whose primary object is a non-counter Effect, or another Board Lock declaration); no player may Scuttle; no player may place a Trap; Trap triggers are suppressed. Players may still Draw, use legal Swap Bar Actions, Play for Points, take a forced Exhausted Pass, declare legal counters, and resolve non-Trap triggered abilities including scoring triggers, Start abilities, Voltage abilities, and ER abilities. Do not reduce the counter at the end of the activation FT. At the end of each following completed FT, reduce it by 1. Board Lock ends at 0. Skipped turn slots do not tick it. Only ⭐A authority may directly counter Board Lock; this includes a physical ⭐A, 10♦ legally mimicking ⭐A, and a 3 Red Ultra resolving as ⭐A. Base Ace, Anchor Ace, A♠, ordinary King, and K♠ cannot directly counter Board Lock. The normal ⭐A Two-Queen Defense applies.',
      ['Cannot be declared during another player\'s Full Turn.','Cannot be declared while the stack is non-empty.','Cannot be declared while Board Lock is already active.','Costs no Mini-Turn.','Only ⭐A authority may directly counter Board Lock.','Does not retroactively cancel plays declared before it resolved.']),
    mechanic('exile-recycle','↻','Exile Recycle','Scoring rider',
      'When BJ is scored for Points, move up to 2 cards from Exile to DP.',
      'When BJ is successfully scored for Points, you may move up to 2 cards from Exile to DP, placing each on the top or bottom. If this places at least one card into an empty DP while Exhausted is active, Exhausted ends immediately. If Exile is empty, the rider does nothing. Exile Recycle is optional, is a triggered ability, does not cost a Mini-Turn, is not an Effect play, and remains legal during Board Lock.')
  ],
  notes:['Board Lock is a Quick Effect that costs no Mini-Turn.','Only ⭐A authority may directly counter Board Lock.','Board Lock does not retroactively cancel plays declared before it resolved.','Cannot be Scuttled or Jacked while scored for Points.']
};

const AUTHORITATIVE = Object.fromEntries([
  ...Object.keys(SUITS).map(symbol=>king(symbol)),
  ...Object.keys(SUITS).map(symbol=>ace(symbol)),
  ...Object.keys(SUITS).map(symbol=>two(symbol)),
  ...Object.keys(SUITS).map(symbol=>three(symbol)),
  ...Object.keys(SUITS).map(symbol=>four(symbol)),
  ...Object.keys(SUITS).map(symbol=>five(symbol)),
  ...Object.keys(SUITS).map(symbol=>six(symbol)),
  ...Object.keys(SUITS).map(symbol=>seven(symbol)),
  ...Object.keys(SUITS).map(symbol=>eight(symbol)),
  ...Object.keys(SUITS).map(symbol=>nine(symbol)),
  ...Object.keys(SUITS).map(symbol=>jack(symbol)),
  ...Object.keys(SUITS).map(symbol=>queen(symbol)),
  ...Object.values(TENS),
  RED_JOKER,
  BLACK_JOKER
].map(card=>[card.identity,card]));

export function parseCardIdentity(identity='') {
  const value=String(identity).trim();
  if(value==='RJ'||value==='BJ') return { identity:value,rank:value,suit:null };
  const match=value.match(/^(10|[A2-9JQK])([♣♦♥♠])$/u);
  if(!match) return { identity:value,rank:value||'?',suit:null };
  return { identity:value,rank:match[1],suit:match[2] };
}

export function genericCardDefinition(identity) {
  const parsed=parseCardIdentity(identity),suit=parsed.suit;
  return {
    identity:parsed.identity, rank:parsed.rank, suit, family:'generic',
    title:RANK_NAMES[parsed.rank]??parsed.rank, subtitle:'Canonical face scaffold', motto:'Timing · Authority · Choice',
    prValue:POINTS[parsed.rank]??0, erValue:null, authority:'scaffold', art:null,
    badges:['Board-renderable','Rules registry pending'], abilities:[], notes:[
      'This exact card can be rendered by the deterministic face system.',
      'Its full suit-specific rules have not yet been entered into Card Face Registry v1.'
    ]
  };
}

export function getCardDefinition(identity) { return AUTHORITATIVE[identity] ?? genericCardDefinition(identity); }
export function listAuthoritativeCards() { return Object.values(AUTHORITATIVE); }
export function getSuit(symbol) { return SUITS[symbol] ?? { id:'neutral',name:'Neutral',symbol:'◆',accent:'#d8b25c',accent2:'#302719',shape:'neutral' }; }
export function rankName(rank) { return RANK_NAMES[rank]??rank; }
export function pointValue(rank) { return POINTS[rank]??0; }
export const CARD_FACE_REGISTRY_META = Object.freeze({
  version:'1.1.0', rulesVersion:'4.3.1', exactCards:54, authoritativeCards:Object.keys(AUTHORITATIVE).length,
  authoritativeFamilies:['Ace','Two','Three','Four','Five','Six','Seven','Eight','Nine','Jack','Queen','King','Ten','Joker'], views:['board','lite','zoom']
});
