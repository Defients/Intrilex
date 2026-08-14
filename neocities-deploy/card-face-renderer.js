import { CARD_FACE_REGISTRY_META, getCardDefinition, getSuit, listAuthoritativeCards } from './card-face-data.js?v=e2bd7e8507fa';
import { getCardArtAlt, getCardArtBoardPosition } from './card-art-registry.js?v=e2bd7e8507fa';

const escapeHtml=(value='')=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const slug=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// ── Semantic term registry ──────────────────────────────────────────
// Deterministic, case-sensitive, word-boundary wrapping applied AFTER
// escapeHtml. Only <span> wrappers are inserted — no source characters,
// punctuation, or wording are ever altered. Applied to rules prose only
// (ability.full, ability.summary, restrictions, card.rules, card.notes),
// never to titles, timing chips, badges, or footer text.
// Types: card | keyword | state | zone | mode | action
const TERM_ENTRIES=[
  // card references (with suit/star symbols)
  ['⭐A','card'],['⭐2','card'],['⭐3','card'],['⭐4','card'],['⭐5','card'],
  ['⭐6','card'],['⭐7','card'],['⭐8','card'],['⭐J','card'],['⭐9','card'],
  ['A♠','card'],['A♣','card'],['A♦','card'],['A♥','card'],
  ['K♠','card'],['K♣','card'],['K♦','card'],['K♥','card'],
  ['Q♠','card'],['J♠','card'],
  ['2♠','card'],['3♠','card'],['4♠','card'],['6♠','card'],['7♠','card'],
  ['8♠','card'],['9♠','card'],
  ['10♣','card'],['10♦','card'],['10♥','card'],['10♠','card'],
  // keywords (named mechanics / concepts)
  ['Royal Shield','keyword'],['Base Ace','keyword'],['Anchor Ace','keyword'],
  ['Royal Marriage','keyword'],['Anchor Play','keyword'],['Goal-Mod Play','keyword'],
  ['Secured PR Points','keyword'],['Secured PR','keyword'],
  ['Board Lock Counter','keyword'],['Board Lock','keyword'],
  ['Two-Queen Defense','keyword'],
  ['Swap Bar Action','keyword'],['Swap Bar Use','keyword'],
  ['Full Turn','keyword'],['Start Phase','keyword'],['Mini-Turn','keyword'],
  ['Anchor value','keyword'],['Tap State','keyword'],
  ['Exhausted Pass','keyword'],['Exhausted','keyword'],
  ['Goal Shift','keyword'],['Rank-10','keyword'],
  ['response window','keyword'],
  ['Points','keyword'],['Voltage','keyword'],
  ['Anchor','keyword'],['Trap','keyword'],
  ['Attachment','keyword'],['Attachments','keyword'],
  // modes (play modes / timing keywords)
  ['Special Interrupt','mode'],['Quick Effect','mode'],
  ['Sudden Death','mode'],['Super recipe','mode'],['Free plays','mode'],
  ['Scoring trigger','mode'],['Scoring rider','mode'],['Anchor mode','mode'],
  ['Ultras','mode'],['Ultra','mode'],['Combos','mode'],['Combo','mode'],
  ['Super','mode'],['Quick','mode'],['Instant','mode'],['Effect','mode'],
  ['Interrupt','mode'],['Passive','mode'],['Base','mode'],
  // states (persistent markers / conditions)
  ['Wild-Exile-Bound','state'],['Exile-Bound','state'],
  ['Revealed-Until-Start','state'],
  ['Vulnerable','state'],['Aegis','state'],['Guard','state'],
  ['Locked','state'],['Jacked','state'],['Tapped','state'],['tapped','state'],
  ['untapped','state'],['Secured','state'],
  // zones (board zones)
  ['Swap Bar','zone'],['Exile','zone'],
  ['PR','zone'],['ER','zone'],['GY','zone'],['DP','zone'],['OTT','zone'],
  ['hand','zone'],['hands','zone'],
  // actions (distinctive game verbs, exact inflected forms)
  ['Counter','action'],['countered','action'],['countering','action'],['counters','action'],['counter','action'],
  ['Scuttle','action'],['Scuttled','action'],['scuttle','action'],
  ['Scrap','action'],
  ['Bounce','action'],['bounce','action'],
  ['Jack','action'],['jack','action'],
  ['Mimic','action'],['mimicking','action'],['mimic','action'],
  ['Mill','action'],['milled','action'],
  ['Rummage','action'],['rummage','action'],
  ['Tap','action'],['taps','action'],['tap','action'],
  ['Untap','action'],['untaps','action'],['untap','action'],
  ['Attach','action'],['attached','action'],
  ['severed','action'],['sever','action'],
  ['Disrupt','action'],['disrupted','action'],['disrupt','action'],
  ['bypassing','action'],['bypasses','action'],['Bypass','action'],['bypass','action'],
  ['sacrificed','action'],['sacrifice','action'],
  ['Recover','action'],
  ['Suspended','action'],['suspended','action'],['suspend','action'],
  ['resume','action'],
];
const _escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const _sortedTerms=[...new Map(TERM_ENTRIES)].sort((a,b)=>b[0].length-a[0].length);
const _termType=new Map(_sortedTerms);
const _termRe=new RegExp(`(?<![A-Za-z0-9])(${_sortedTerms.map(e=>_escapeRegex(e[0])).join('|')})(?![A-Za-z0-9])`,'gu');
function themeTerms(text){
  const s=String(text??'');
  if(!s) return s;
  return s.replace(_termRe,m=>`<span class="ix-term ix-term-${_termType.get(m)}">${m}</span>`);
}

function cardVars(card){
  const suit=getSuit(card.suit);
  const art=card.art?`url("${card.art}")`:'none';
  const pos=getCardArtBoardPosition(card.identity);
  return `--card-accent:${suit.accent};--card-accent-2:${suit.accent2};--card-art:${art};--card-art-position:${pos}`;
}
function classNames(card,view){const suit=getSuit(card.suit);return`ix-card-face ix-view-${view} ix-suit-${suit.id} ix-family-${card.family} ix-authority-${card.authority}`;}
function stateMarkers(runtimeState={}){
  const markers=[];
  if(runtimeState.tapped)markers.push(['↻','Tapped']);
  if(runtimeState.aegis||runtimeState.aegisExpiresAt)markers.push(['⬡','Aegis']);
  if(runtimeState.providesGuard)markers.push(['◒','Guard']);
  if(runtimeState.exileBound)markers.push(['⊘','Exile-Bound']);
  if(runtimeState.anchorValue!==undefined)markers.push(['⚓',`Anchor ${runtimeState.anchorValue}`]);
  if(runtimeState.jackHostId)markers.push(['⛓','Attached']);
  return markers;
}
function renderStateStrip(runtimeState){const markers=stateMarkers(runtimeState);if(!markers.length)return'';return`<div class="ix-state-strip" aria-label="Current card state">${markers.map(([icon,label])=>`<span><b aria-hidden="true">${icon}</b>${escapeHtml(label)}</span>`).join('')}</div>`;}
function valuePanel(card){return`<div class="ix-values" aria-label="Card values"><span><small>PR</small><b>${escapeHtml(card.prValue)}</b></span>${card.erValue!==null&&card.erValue!==undefined?`<span><small>ER</small><b>${escapeHtml(card.erValue)}</b></span>`:''}</div>`;}
function identityHeader(card,compact=false){const suit=getSuit(card.suit);return`<header class="ix-card-header"><div class="ix-card-index"><b>${escapeHtml(card.rank)}</b>${card.suit?`<span aria-label="${escapeHtml(suit.name)}">${escapeHtml(suit.symbol)}</span>`:''}</div><div class="ix-card-title"><span>${compact?escapeHtml(card.identity):escapeHtml(card.title)}</span>${compact?'':`<small>${escapeHtml(card.subtitle)}</small>`}</div><div class="ix-authority-mark" title="${card.authority==='canonical'?'Canonical v'+CARD_FACE_REGISTRY_META.rulesVersion+' rules':'Renderable scaffold; detailed rules pending'}">${card.authority==='canonical'?'✓':'◇'}</div></header>`;}
function portrait(card){const suit=getSuit(card.suit);const alt=getCardArtAlt(card.identity);return`<div class="ix-card-art" role="img" aria-label="${escapeHtml(alt)}"><span class="ix-suit-watermark" aria-hidden="true">${escapeHtml(suit.symbol)}</span>${card.art?'':`<span class="ix-generic-sigil" aria-hidden="true">${escapeHtml(card.rank)}</span>`}</div>`;}
function timingLabel(timing=''){return timing?`<span class="ix-timing">${escapeHtml(timing)}</span>`:'';}
function mechanicTile(ability,{withSummary=false}={}){return`<article class="ix-mechanic ix-mechanic-${slug(ability.id)}"><div class="ix-mechanic-icon" aria-hidden="true">${escapeHtml(ability.icon)}</div><div class="ix-mechanic-copy"><h4>${escapeHtml(ability.title)}</h4>${timingLabel(ability.timing)}${withSummary?`<p>${themeTerms(escapeHtml(ability.summary))}</p>`:''}</div>${ability.restrictions?.length?`<div class="ix-restriction-dots" aria-label="${ability.restrictions.length} restrictions">${ability.restrictions.map(()=>'<i></i>').join('')}</div>`:''}</article>`;}
function badges(card){return`<div class="ix-card-badges">${card.badges.map(b=>`<span>${escapeHtml(b)}</span>`).join('')}</div>`;}
function boardView(card,runtimeState){return`<article class="${classNames(card,'board')}" style='${cardVars(card)}' data-card-identity="${escapeHtml(card.identity)}" aria-label="${escapeHtml(card.identity)} Board Face"><div class="ix-card-frame">${identityHeader(card)}${portrait(card)}${valuePanel(card)}${renderStateStrip(runtimeState)}<section class="ix-board-mechanics">${card.abilities.slice(0,4).map(a=>mechanicTile(a)).join('')||`<div class="ix-registry-pending"><b>Face scaffold ready</b><span>Detailed rules registry pending</span></div>`}</section><footer>${escapeHtml(card.motto)}</footer></div></article>`;}
function liteView(card,runtimeState){return`<article class="${classNames(card,'lite')}" style='${cardVars(card)}' data-card-identity="${escapeHtml(card.identity)}" aria-label="${escapeHtml(card.identity)} Lite Reference"><div class="ix-card-frame">${identityHeader(card,true)}<div class="ix-lite-summary">${portrait(card)}<div>${valuePanel(card)}${badges(card)}${renderStateStrip(runtimeState)}</div></div><section class="ix-lite-mechanics">${card.abilities.map(a=>mechanicTile(a,{withSummary:true})).join('')||`<div class="ix-registry-pending"><b>Detailed rules pending</b><p>The renderer can display this exact card, but its canonical ability data has not been entered yet.</p></div>`}</section><footer>${escapeHtml(card.motto)} · Rules ${CARD_FACE_REGISTRY_META.rulesVersion}</footer></div></article>`;}
function zoomAbility(ability,index){return`<article class="ix-zoom-ability"><div class="ix-zoom-number">${index+1}</div><div><header><span class="ix-mechanic-icon" aria-hidden="true">${escapeHtml(ability.icon)}</span><h3>${escapeHtml(ability.title)}</h3>${timingLabel(ability.timing)}</header><p>${themeTerms(escapeHtml(ability.full))}</p>${ability.restrictions?.length?`<ul class="ix-restrictions">${ability.restrictions.map(r=>`<li>${themeTerms(escapeHtml(r))}</li>`).join('')}</ul>`:''}</div></article>`;}
function zoomView(card,runtimeState){const sharedRules=card.rules??[];return`<article class="${classNames(card,'zoom')}" style='${cardVars(card)}' data-card-identity="${escapeHtml(card.identity)}" aria-label="${escapeHtml(card.identity)} Full Zoom Dossier"><div class="ix-card-frame">${identityHeader(card)}<div class="ix-zoom-hero">${portrait(card)}<div class="ix-zoom-facts">${valuePanel(card)}${badges(card)}${renderStateStrip(runtimeState)}<dl><div><dt>Card</dt><dd>${escapeHtml(card.identity)}</dd></div><div><dt>Rules authority</dt><dd>${card.authority==='canonical'?'v'+CARD_FACE_REGISTRY_META.rulesVersion+' canonical':'Registry pending'}</dd></div><div><dt>Family</dt><dd>${escapeHtml(card.title)}</dd></div></dl></div></div>${sharedRules.length?`<section class="ix-shared-rules"><h2>Rank-10 authority</h2>${sharedRules.map(rule=>`<p>${themeTerms(escapeHtml(rule))}</p>`).join('')}</section>`:''}<section class="ix-zoom-abilities">${card.abilities.map(zoomAbility).join('')||`<div class="ix-registry-pending"><b>Canonical detail not yet registered</b><p>Board rendering remains available. Full rules will appear here after this exact rank family is entered into the registry.</p></div>`}</section>${card.notes?.length?`<section class="ix-card-notes"><h2>Rulings and reminders</h2><ul>${card.notes.map(n=>`<li>${themeTerms(escapeHtml(n))}</li>`).join('')}</ul></section>`:''}<footer><span>${escapeHtml(card.motto)}</span><span>Card Face Renderer ${CARD_FACE_REGISTRY_META.version} · Rules ${CARD_FACE_REGISTRY_META.rulesVersion}</span></footer></div></article>`;}

export function renderCardFace(identity,options={}){
  const opts=typeof options==='string'?{view:options}:options;
  let {view='board',runtimeState={}}=opts;
  if(view==='full')view='zoom';
  const card=getCardDefinition(identity);
  if(view==='zoom')return zoomView(card,runtimeState);
  if(view==='lite')return liteView(card,runtimeState);
  return boardView(card,runtimeState);
}
export function renderCardGallery({family='all',view='board',selected='K♣'}={}){
  const cards=listAuthoritativeCards().filter(card=>family==='all'||card.family===family);
  return`<div class="ix-gallery" data-view="${escapeHtml(view)}">${cards.map(card=>`<button class="ix-gallery-item ${card.identity===selected?'selected':''}" data-face-card="${escapeHtml(card.identity)}" aria-label="Inspect ${escapeHtml(card.identity)}">${renderCardFace(card.identity,{view:'board'})}</button>`).join('')}</div>`;
}
export function cardFaceRegistryMeta(){return CARD_FACE_REGISTRY_META;}
