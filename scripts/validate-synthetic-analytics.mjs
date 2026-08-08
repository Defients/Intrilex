import { analyzeSynergies } from '@intrilex/analytics';
import { benjaminiHochberg } from '@intrilex/statistics';
import { hashCanonical } from '@intrilex/shared';

function row(id,{a=false,b=false,win=0,stratum='S',policy='control'}={}){
  return {matchId:id,matchResultHash:hashCanonical(id),profileId:'core-advanced-authority',policyIds:[policy,'value'],seatOrder:['P1','P2'],terminationReason:'NORMAL_VICTORY',winningSeat:win?1:2,winner:win?'P1':'P2',mechanicCounts:{...(a?{A:1}:{}),...(b?{B:1}:{}),stratumMarker:stratum.length}};
}
function build(effect){
  const rows=[];let id=0;
  for(const stratum of ['S1','S2']){
    for(let i=0;i<80;i++){
      const kind=i%4,a=kind===0||kind===1,b=kind===0||kind===2;
      let p=0.5;
      if(effect==='positive'&&a&&b)p=0.8;
      if(effect==='negative'&&a&&b)p=0.2;
      if(effect==='null')p=0.5;
      const win=((i*17+(stratum==='S1'?3:7))%100)<p*100?1:0;
      rows.push(row(`M${id++}`,{a,b,win,stratum,policy:stratum==='S1'?'control':'tempo'}));
    }
  }
  return rows;
}
function pair(rows){return analyzeSynergies(rows,{minimumJoint:4,maxMechanics:3}).find(x=>x.id==='A::B');}
const nullResult=pair(build('null'));
const positive=pair(build('positive'));
const negative=pair(build('negative'));
if(!nullResult||Math.abs(nullResult.effect)>0.15)throw new Error(`NULL_SYNERGY_FALSE_POSITIVE:${nullResult?.effect}`);
if(!positive||positive.effect<=0.15)throw new Error(`POSITIVE_SYNERGY_NOT_DETECTED:${positive?.effect}`);
if(!negative||negative.effect>=-0.15)throw new Error(`NEGATIVE_SYNERGY_NOT_DETECTED:${negative?.effect}`);
const low=pair([row('L1',{a:true,b:true,win:1}),row('L2',{a:true,b:false,win:0}),row('L3',{a:false,b:true,win:0}),row('L4',{a:true,b:true,win:1})]);
if(low!==undefined)throw new Error('LOW_SAMPLE_PAIR_WAS_NOT_SUPPRESSED');
const adjusted=benjaminiHochberg([{id:'a',pValue:.001},{id:'b',pValue:.02},{id:'c',pValue:.7}]);
if(!(adjusted[0].qValue<=adjusted[1].qValue&&adjusted[1].qValue<=adjusted[2].qValue))throw new Error('BH_ORDER_INVALID');
const first=hashCanonical({nullResult,positive,negative,adjusted}),second=hashCanonical({nullResult:pair(build('null')),positive:pair(build('positive')),negative:pair(build('negative')),adjusted:benjaminiHochberg([{id:'a',pValue:.001},{id:'b',pValue:.02},{id:'c',pValue:.7}])});
if(first!==second)throw new Error('SYNTHETIC_ANALYTICS_NONDETERMINISTIC');
console.log(JSON.stringify({status:'PASS',nullEffect:nullResult.effect,positiveEffect:positive.effect,negativeEffect:negative.effect,bh:adjusted.map(x=>x.qValue),hash:first},null,2));
