import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {evolutionIdentity, runLabSeries, artifactEnvelope} from '../packages/simulation-runtime/src/evolution-lab.mjs';
import {arenaAnalytics, outcome} from '../apps/lab-web/src/evolution/evolution-analytics-model.mjs';

const {values}=parseArgs({options:{games:{type:'string',default:'400'},seed:{type:'string',default:'20261003'},output:{type:'string',default:'reports/local/evolution-tactics/heldout'},suite:{type:'string',default:'four-profiles'}}});
const gameCount=Number(values.games), seed=Number(values.seed), directory=path.resolve(values.output);
assert.ok(Number.isInteger(gameCount)&&gameCount>=2&&gameCount<=10000&&gameCount%2===0,'Use an even game count from 2 through 10000.');
assert.ok(Number.isInteger(seed)&&seed>0&&seed<=0xffffffff,'Use a nonzero uint32 seed.');
await mkdir(directory,{recursive:true});
const identity=await evolutionIdentity(), initialStates=new Map();
const report={generatedAt:new Date().toISOString(),identity,config:{gameCount,seed,mirrorSeats:true,workerCount:4,profileId:'core-advanced-authority'},
  method:'Same deals across matchups, both seat assignments per deal. Pair scores use half credit for draws and conservative 95% Hoeffding bounds. No policy tuning is performed by this command.',rows:[],status:'RUNNING'};
assert.ok(['four-profiles','tempo-value'].includes(values.suite),'Unknown benchmark suite.');
report.suite=values.suite;
const pairs=values.suite==='four-profiles'
  ? ['score-rush','control','tempo','value'].map(id=>[`${id}-tactical`,id])
  : [['tempo','value'],['tempo-tactical','tempo'],['tempo-tactical','value'],['value-tactical','tempo'],['value-tactical','value'],['tempo-tactical','control'],['value-tactical','control'],['tempo-tactical','value-tactical']];
try{
  for(const [botA,botB] of pairs){
    const {run}=await runLabSeries({...report.config,botA,botB},{identity});
    const model=arenaAnalytics(run);
    for(const r of run.records){if(initialStates.has(r.ordinal))assert.equal(r.initialStateHash,initialStates.get(r.ordinal));else initialStates.set(r.ordinal,r.initialStateHash);}
    const filename=`${botA}-vs-${botB}.json`;
    await writeFile(path.join(directory,filename),JSON.stringify(artifactEnvelope(run)));
    const row={botA,botB,artifact:filename,...model.summary,winsA:model.clean.filter(r=>outcome(r)==='A').length,winsB:model.clean.filter(r=>outcome(r)==='B').length,
      draws:model.clean.filter(r=>outcome(r)==='Draw').length,pairs:model.pairs,terminations:model.terminations};
    report.rows.push(row);console.log(`${botA} vs ${botB}: ${row.winsA}/${row.clean} wins; paired score ${(100*row.pairs.score).toFixed(2)}%; full turns ${row.meanTurns.toFixed(2)}; faults ${row.faults}`);
    await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));
    assert.equal(run.status,'COMPLETE');assert.equal(run.records.length,gameCount);if(!model.summary.faults)assert.equal(model.pairs.n,gameCount/2);
  }
  report.initialStatesMatch=true;assert.equal(report.rows.reduce((n,r)=>n+r.faults,0),0,'Benchmark recorded game faults; all matchups and their evidence have been saved.');report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;throw error;}
finally{await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));}
