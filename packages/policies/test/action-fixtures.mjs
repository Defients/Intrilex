import { createSimulationState,createSimulationDecisionFrame,executeSimulationAction } from '../../engine-adapter/src/adapter.mjs';

// Explicit test-only board construction. Production policies never receive or
// mutate these omniscient states. Every candidate is still filtered by authority.
export function actionFixture({profileId='core-advanced-authority',hand=[],enemyHand,enemyPr=[],enemyEr=[],ownPr=[],ownEr=[],exile=[],graveyard=[],deckTop=[],start=false,voltage=false,exhausted=false,after,seed=1337}={}) {
  let state=createSimulationState({profileId,playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],seed});
  state=createSimulationDecisionFrame(state).state;
  function move(identity,playerId,row) {
    const id=Object.keys(state.cards).find(id=>state.cards[id].identity===identity);
    if(!id)throw new Error(`Missing fixture card ${identity}`);
    for(const zone of Object.values(state.zones))if(Array.isArray(zone)){const i=zone.indexOf(id);if(i>=0)zone.splice(i,1);}
    for(const p of Object.values(state.players))for(const r of ['hand','pr','er']){const i=p[r].indexOf(id);if(i>=0)p[r].splice(i,1);}
    const card=state.cards[id];card.state={};
    if(playerId){card.zone=`${playerId}_${row==='hand'?'HAND':row.toUpperCase()}`;card.controllerId=playerId;state.players[playerId][row].push(id);
      if(row==='pr')card.state.pointValue=/^\d/.test(identity)?Number(identity.slice(0,-1)):{A:4,J:3,Q:2,K:8,RJ:5,BJ:11}[identity.replace(/[♣♦♥♠]/gu,'')];
      if(row==='er'){card.state.playedForEffect=true;if(identity.startsWith('K'))card.state.anchorValue=identity.endsWith('♠')?9:7;if(identity.startsWith('Q'))card.state.providesGuard=true;}
    }else{card.zone=row==='exile'?'EXILE':row==='graveyard'?'GY':'DP';card.controllerId=card.controllerId ?? 'P1';state.zones[row==='graveyard'?'gy':row==='exile'?'exile':'dp'].push(id);}
    return id;
  }
  for(const id of [...state.players.P1.hand])move(state.cards[id].identity,null,'dp');
  for(const identity of hand)move(identity,'P1','hand');
  if(enemyHand){for(const id of [...state.players.P2.hand])move(state.cards[id].identity,null,'dp');for(const identity of enemyHand)move(identity,'P2','hand');}
  for(const [list,p,row]of [[enemyPr,'P2','pr'],[enemyEr,'P2','er'],[ownPr,'P1','pr'],[ownEr,'P1','er']])for(const identity of list)move(identity,p,row);
  for(const identity of exile)move(identity,null,'exile');for(const identity of graveyard)move(identity,null,'graveyard');
  const top=deckTop.map(identity=>move(identity,null,'dp'));state.zones.dp=[...top,...state.zones.dp.filter(id=>!top.includes(id))];
  if(voltage)state.metadata.phase8.voltageSnapshots.P1={rank3:3,rank4:4,rank5:5};
  if(!start){const frame=createSimulationDecisionFrame(state);state=executeSimulationAction(frame.state,frame.resolve(frame.policyActions.find(a=>a.family==='phase').actionId)).state;}
  if(exhausted){for(const id of [...state.zones.dp,...state.zones.swapBar])move(state.cards[id].identity,null,'graveyard');state.metadata.coreAuthority.exhausted={remaining:3,startedFullTurnSequence:state.fullTurnSequence};}
  for(const step of after ? Array.isArray(after) ? after : [after] : []){const frame=createSimulationDecisionFrame(state),action=frame.policyActions.find(a=>a.family===step.family&&a.mode===step.mode&&(!step.where||step.where(a,frame.state)));if(!action)throw new Error(`Fixture action unavailable: ${step.family}:${step.mode}`);state=executeSimulationAction(frame.state,frame.resolve(action.actionId)).state;}
  return state;
}

export const ACTION_FIXTURES = Object.freeze([
  {name:'start-swap',hand:['3♣','A♠','K♣'],start:true},
  {name:'base-removal',hand:['A♣','3♣','4♠','J♠'],enemyPr:['10♥','9♦'],enemyEr:['K♦'],ownPr:['5♣']},
  {name:'resources',hand:['5♣','6♣','7♣','4♦','9♣'],graveyard:['A♦','10♠']},
  {name:'defense',hand:['Q♣','Q♦','K♣','BJ','8♣'],ownPr:['10♥']},
  {name:'super-control',hand:['2♣','2♦','4♣','4♦','8♣','8♦','J♣','J♦'],enemyPr:['10♥','9♠'],ownPr:['3♥']},
  {name:'rank-ten',hand:['10♣','10♦','10♥','10♠','2♣'],enemyPr:['9♠'],exile:['K♦','3♥']},
  {name:'ultra-black',hand:['3♣','5♠','10♣','2♦','6♥'],enemyPr:['10♥','9♦']},
  {name:'copied-effect',hand:['2♠','K♠','3♣'],enemyPr:['10♥','9♦'],ownPr:['5♣']},
  {name:'jokers',hand:['RJ','BJ','2♣'],enemyPr:['10♥'],ownPr:['5♦'],exile:['A♠'],graveyard:['3♥']},
  {name:'goal-shift',hand:['9♠','9♣','5♣'],ownPr:['10♥','9♦'],enemyPr:['10♣','8♥']},
  {name:'voltage',hand:['3♣','A♠'],start:true,voltage:true,graveyard:['2♣']},
  {name:'unrestricted',profileId:'core-unrestricted-authority',hand:['3♣','3♦','5♣','5♦','6♣','6♦','7♣','7♦'],enemyPr:['10♥'],graveyard:['A♠'],exile:['K♦']},
  {name:'response-stack',hand:['K♣'],enemyHand:['A♣','A♦','K♠','10♠','J♣','8♠','9♣'],ownPr:['10♥','9♦'],after:{family:'anchor',mode:'king'}},
  {name:'private-discard',hand:['3♣'],enemyHand:['10♥','A♠','2♦'],after:{family:'effect-private-choice',mode:'three-force-discard'}},
  {name:'private-six',hand:['6♣','2♦'],enemyHand:[],after:{family:'effect-private-choice',mode:'six-dig'}},
  {name:'private-seven',hand:['7♣'],enemyHand:[],after:{family:'effect-private-choice',mode:'seven-topdeck'}},
  {name:'private-natural-four',hand:['4♣'],enemyHand:[],after:{family:'effect-private-choice',mode:'natural-four'}},
  {name:'foundation-profile',profileId:'core-foundation-authority',hand:['3♣','10♥']},
  {name:'effect-profile',profileId:'core-effect-declaration-authority',hand:['3♣','4♣','K♦'],enemyPr:['10♥']},
  {name:'response-profile',profileId:'core-response-authority',hand:['Q♣','8♣'],ownPr:['10♥']},
  {name:'choice-profile',profileId:'core-private-choice-authority',hand:['5♣','6♣','7♣']},
  {name:'sudden-death',profileId:'core-unrestricted-authority',hand:['RJ','BJ'],enemyPr:['10♥'],ownPr:['9♦','8♣']},
  {name:'exhausted',hand:[],enemyHand:['3♣'],exhausted:true},
  {name:'effect-board-lock',profileId:'core-effect-declaration-authority',hand:['BJ'],ownPr:['10♥']},
  {name:'seven-generated-super',hand:['7♣','2♦'],enemyHand:[],enemyPr:['10♥'],deckTop:['2♣','3♠'],after:[{family:'effect-private-choice',mode:'seven-topdeck'},{family:'private-choice',mode:'rank7-hand-and-effect',where:(a,s)=>s.cards[a.targetHandles[1]].identity==='2♣'}]},
  {name:'private-present',hand:['3♣'],enemyHand:['10♥','A♠','2♦'],after:{family:'effect-private-choice',mode:'three-present-take'}},
  {name:'private-five',hand:['5♣'],enemyHand:[],graveyard:['A♠','10♦'],after:{family:'effect-private-choice',mode:'five-recycle'}},
  {name:'response-points',hand:['10♣'],enemyHand:['A♣','A♦','A♠','K♠','10♠','J♣','3♥','5♦'],enemyEr:['A♥'],after:{family:'score',mode:'points'}},
  {name:'response-effect',hand:['3♣'],enemyHand:['A♣','A♦','A♠','K♠','10♠','J♣','3♥','5♦'],enemyPr:['10♥'],enemyEr:['A♥'],after:{family:'effect-three',mode:'bounce-top'}},
  {name:'response-scuttle',hand:['10♣'],enemyHand:['8♣','A♣','A♦','A♠','9♣'],enemyPr:['8♥'],after:{family:'scuttle',mode:'ordinary'}},
  {name:'private-take',hand:['3♣'],enemyHand:['10♣','5♦','2♦'],after:[{family:'effect-private-choice',mode:'three-present-take'},{family:'private-choice',mode:'rank3-present',where:a=>a.targetHandles.length===3}]},
  {name:'private-nine-discard',hand:['9♣'],enemyHand:['10♥','5♦','2♦'],after:{family:'anchor-private-choice',mode:'nine'}},
  {name:'seven-generated-foundation',hand:['7♣','9♠'],enemyHand:[],ownPr:['3♥'],deckTop:['10♣','4♦'],after:[{family:'effect-private-choice',mode:'seven-topdeck'},{family:'private-choice',mode:'rank7-hand-and-effect',where:(a,s)=>s.cards[a.targetHandles[1]].identity==='10♣'}]},
  {name:'seven-generated-clear',hand:['7♣'],enemyHand:[],enemyPr:['10♥'],deckTop:['4♣','3♠'],after:[{family:'effect-private-choice',mode:'seven-topdeck'},{family:'private-choice',mode:'rank7-hand-and-effect',where:(a,s)=>s.cards[a.targetHandles[1]].identity==='4♣'}]},
  {name:'response-court',hand:['Q♣','Q♦'],enemyHand:['K♠','A♣'],ownPr:['10♥'],after:{family:'queens-court',mode:'queens-court'}},
]);
