import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CARD_FACE_REGISTRY_META, getCardDefinition, listAuthoritativeCards } from '../apps/lab-web/src/card-face-data.js';
import { renderCardFace } from '../apps/lab-web/src/card-face-renderer.js';

test('Card Face Registry v1.1 exposes all 54 exact cards with canonical definitions',()=>{
  assert.equal(CARD_FACE_REGISTRY_META.version,'1.1.0');
  assert.equal(CARD_FACE_REGISTRY_META.rulesVersion,'4.3.1');
  assert.equal(CARD_FACE_REGISTRY_META.exactCards,54);
  assert.equal(listAuthoritativeCards().length,54);
  assert.deepEqual(CARD_FACE_REGISTRY_META.authoritativeFamilies,['Ace','Two','Three','Four','Five','Six','Seven','Eight','Nine','Jack','Queen','King','Ten','Joker']);
});

test('King faces are suit-specific and K spade preserves special authority',()=>{
  for(const identity of ['K♣','K♦','K♥']){
    const card=getCardDefinition(identity);
    assert.equal(card.prValue,8);
    assert.equal(card.erValue,7);
    assert.equal(card.abilities.length,3);
    assert.ok(!card.abilities.some(a=>a.id==='counter-multi'));
  }
  const spade=getCardDefinition('K♠');
  assert.equal(spade.erValue,9);
  assert.equal(spade.abilities.length,5);
  const multi=spade.abilities.find(a=>a.id==='counter-multi');
  assert.ok(multi);
  assert.match(multi.full,/Royal Marriage/);
  assert.deepEqual(multi.restrictions.slice(0,2),['Cannot counter Ultras.','Cannot counter Sudden Death.']);
  const wild=spade.abilities.find(a=>a.id==='wild-sovereignty');
  assert.ok(wild,'K♠ should have a Wild Sovereignty ability');
  assert.match(wild.full,/Spade .* Base effect/);
  assert.ok(wild.restrictions.some(r=>/Exiled/.test(r)));
});

test('Ace faces preserve counter authority and A♠ exile counter',()=>{
  for(const identity of ['A♣','A♦','A♥']){
    const card=getCardDefinition(identity);
    assert.equal(card.prValue,4);
    assert.equal(card.authority,'canonical');
    assert.ok(card.abilities.some(a=>a.id==='base-counter'));
    assert.ok(card.abilities.some(a=>a.id==='purge'));
    assert.ok(card.abilities.some(a=>a.id==='anchor-counter'));
    assert.ok(!card.abilities.some(a=>a.id==='exile-counter'));
  }
  const spade=getCardDefinition('A♠');
  assert.ok(spade.abilities.some(a=>a.id==='exile-counter'));
  const exile=spade.abilities.find(a=>a.id==='exile-counter');
  assert.match(exile.full,/go to Exile/);
});

test('Queen faces preserve Guard, Aegis, and Q♠ special protection',()=>{
  for(const identity of ['Q♣','Q♦','Q♥']){
    const card=getCardDefinition(identity);
    assert.equal(card.prValue,2);
    assert.equal(card.erValue,0);
    assert.ok(card.abilities.some(a=>a.id==='quick-aegis'));
    assert.ok(card.abilities.some(a=>a.id==='guard-anchor'));
    assert.ok(!card.abilities.some(a=>a.id==='spade-protection'));
  }
  const spade=getCardDefinition('Q♠');
  const prot=spade.abilities.find(a=>a.id==='spade-protection');
  assert.ok(prot);
  assert.match(prot.full,/immune to non-total multi-target clears/);
});

test('Jack faces preserve Disrupt, PR Attachment, and J♠ ER Attachment',()=>{
  for(const identity of ['J♣','J♦','J♥']){
    const card=getCardDefinition(identity);
    assert.equal(card.prValue,3);
    assert.ok(card.abilities.some(a=>a.id==='disrupt'));
    assert.ok(card.abilities.some(a=>a.id==='jack-pr'));
    assert.ok(card.abilities.some(a=>a.id==='tempo-force'));
    assert.ok(!card.abilities.some(a=>a.id==='jack-er'));
  }
  const spade=getCardDefinition('J♠');
  assert.ok(spade.abilities.some(a=>a.id==='jack-er'));
  const er=spade.abilities.find(a=>a.id==='jack-er');
  assert.match(er.full,/enemy Anchor in ER/);
});

test('Numeric ranks 2-9 have canonical definitions with suit-specific spade variants',()=>{
  for(const rank of ['2','3','4','5','6','7','8','9']){
    for(const suit of ['♣','♦','♥','♠']){
      const card=getCardDefinition(`${rank}${suit}`);
      assert.equal(card.authority,'canonical',`${rank}${suit} should be canonical`);
      assert.ok(card.abilities.length>=2,`${rank}${suit} should have at least 2 abilities`);
    }
  }
  // Verify spade-specific enhanced abilities
  assert.ok(getCardDefinition('3♠').abilities.some(a=>a.id==='spade-enhancement'));
  assert.ok(getCardDefinition('4♠').abilities.some(a=>a.id==='total-clear'));
  assert.ok(getCardDefinition('6♠').abilities.some(a=>a.id==='deep-draw'));
  assert.ok(getCardDefinition('7♠').abilities.some(a=>a.id==='spade-topdeck'));
  assert.ok(getCardDefinition('8♠').abilities.some(a=>a.id==='free-scuttle'));
  assert.ok(getCardDefinition('9♠').abilities.some(a=>a.id==='spade-goal-shift'));
});

test('Jokers have canonical definitions with correct PR values and effect modes',()=>{
  const rj=getCardDefinition('RJ');
  assert.equal(rj.prValue,5);
  assert.equal(rj.authority,'canonical');
  assert.equal(rj.abilities.length,4);
  assert.ok(rj.abilities.some(a=>a.id==='hand-swap'));
  assert.ok(rj.abilities.some(a=>a.id==='shuffle-reset'));
  const bj=getCardDefinition('BJ');
  assert.equal(bj.prValue,11);
  assert.equal(bj.authority,'canonical');
  assert.ok(bj.abilities.some(a=>a.id==='board-lock'));
  assert.ok(bj.abilities.some(a=>a.id==='exile-recycle'));
});

test('No card falls through to generic scaffold for any of the 54 exact identities',()=>{
  const allIdentities=['A♣','A♦','A♥','A♠','2♣','2♦','2♥','2♠','3♣','3♦','3♥','3♠','4♣','4♦','4♥','4♠','5♣','5♦','5♥','5♠','6♣','6♦','6♥','6♠','7♣','7♦','7♥','7♠','8♣','8♦','8♥','8♠','9♣','9♦','9♥','9♠','10♣','10♦','10♥','10♠','J♣','J♦','J♥','J♠','Q♣','Q♦','Q♥','Q♠','K♣','K♦','K♥','K♠','RJ','BJ'];
  for(const identity of allIdentities){
    const card=getCardDefinition(identity);
    assert.equal(card.authority,'canonical',`${identity} should be canonical, not scaffold`);
    assert.equal(card.abilities.length>0,true,`${identity} should have abilities`);
  }
});

test('Rank 10 rules preserve limit, Exile-Bound, and printed Stack Theft skip consequence',()=>{
  const tenSpade=getCardDefinition('10♠');
  assert.ok(tenSpade.rules.some(rule=>/one Rank-10 effect play/.test(rule)));
  assert.ok(tenSpade.rules.some(rule=>/Exile-Bound/.test(rule)));
  const theft=tenSpade.abilities.find(a=>a.id==='stack-theft');
  assert.match(theft.full,/both you and the original caster gain one pending Full-Turn skip/);
  assert.match(theft.restrictions[0],/Interrupt itself has no default skip/);
});

test('renderer emits Board, Lite, and Full Zoom deterministic views',()=>{
  const board=renderCardFace('K♣',{view:'board'});
  const lite=renderCardFace('K♦',{view:'lite'});
  const zoom=renderCardFace('10♠',{view:'zoom'});
  assert.match(board,/ix-view-board/);
  assert.match(board,/data-card-identity="K♣"/);
  assert.match(lite,/ix-view-lite/);
  assert.match(lite,/Counter Single/);
  assert.match(zoom,/ix-view-zoom/);
  assert.match(zoom,/Stack Theft/);
  assert.match(zoom,/Rules 4\.3\.1/);
});

test('lab app integrates Card Faces workspace and replay card inspector',async()=>{
  const appJs=await readFile('apps/lab-web/src/app.js','utf8');
  const routerJs=await readFile('apps/lab-web/src/router.js','utf8');
  const observatoryJs=await readFile('apps/lab-web/src/workspaces/observatory.js','utf8');
  const html=await readFile('apps/lab-web/src/index.html','utf8');
  const css=(await Promise.all(['tokens-base','feature-components','pages-polish'].map(f=>readFile(`apps/lab-web/src/css/${f}.css`,'utf8')))).join('\n');
  assert.match(routerJs,/\['\/cards','▣','Card Faces','Renderer v1'\]/);
  assert.match(observatoryJs,/function renderCardFaces\(/);
  assert.match(appJs,/renderCardFace\(identity, 'full'\)/);
  assert.match(appJs,/#card-face-dialog/);
  assert.match(html,/id="card-face-dialog"/);
  assert.match(css,/Intrilex Card Face Renderer v1/);
  assert.match(css,/\.ix-view-board/);
  assert.match(css,/\.ix-view-lite/);
  assert.match(css,/\.ix-view-zoom/);
});

test('family switcher exposes all 14 rank families in rank order',async()=>{
  const js=await readFile('apps/lab-web/src/workspaces/observatory.js','utf8');
  const expectedFamilies=['ace','two','three','four','five','six','seven','eight','nine','ten','jack','queen','king','joker'];
  for(const family of expectedFamilies){
    assert.match(js,new RegExp(`\\['${family}',\\s*'`),`Family "${family}" should appear in CARD_FAMILIES`);
  }
  assert.match(js,/listAuthoritativeCards\(\)/);
  assert.match(js,/cards\.filter\(c => c\.family === family\)/);
});

test('cardFaceFamilyFor returns correct family for any identity',()=>{
  // cardFaceFamilyFor was decomposed: family is now a direct property on card
  // definitions exposed via getCardDefinition. Verify the identity→family mapping.
  const expectations={
    'A♣':'ace','A♠':'ace','2♣':'two','3♦':'three','4♥':'four','5♠':'five',
    '6♣':'six','7♦':'seven','8♥':'eight','9♠':'nine','10♣':'ten','10♠':'ten',
    'J♣':'jack','J♠':'jack','Q♦':'queen','Q♠':'queen','K♥':'king','K♠':'king',
    'RJ':'joker','BJ':'joker'
  };
  for(const [identity,expectedFamily] of Object.entries(expectations)){
    const card=getCardDefinition(identity);
    assert.equal(card.family,expectedFamily,`${identity} should map to family "${expectedFamily}"`);
  }
});

test('all 54 cards have art paths pointing to suit-specific files',()=>{
  const allIdentities=['A♣','A♦','A♥','A♠','2♣','2♦','2♥','2♠','3♣','3♦','3♥','3♠','4♣','4♦','4♥','4♠','5♣','5♦','5♥','5♠','6♣','6♦','6♥','6♠','7♣','7♦','7♥','7♠','8♣','8♦','8♥','8♠','9♣','9♦','9♥','9♠','10♣','10♦','10♥','10♠','J♣','J♦','J♥','J♠','Q♣','Q♦','Q♥','Q♠','K♣','K♦','K♥','K♠','RJ','BJ'];
  for(const identity of allIdentities){
    const card=getCardDefinition(identity);
    assert.ok(card.art,`${identity} should have an art path`);
    assert.match(card.art,/^assets\/card-art\/.+\.webp$/,`${identity} art path should be a .webp file`);
  }
});
