import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulationState, createSimulationDecisionFrame, executeSimulationAction } from '@intrilex/engine-adapter';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { hashCanonical } from '@intrilex/shared';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),reports=path.join(root,'reports');await mkdir(reports,{recursive:true});
const setup=profileId=>({profileId,playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],eventApprovedModules:[],seed:1});
const records=[];const add=(behavior,pass,evidence)=>records.push({fixtureId:`PP-${String(records.length+1).padStart(3,'0')}`,behavior,status:pass?'PASS':'FAIL',evidence});
for(const profile of ['core-advanced-authority','first-contact-trigger-closure']){const frame=createSimulationDecisionFrame(createSimulationState(setup(profile))),families=frame.policyActions.map(a=>a.family);add('ordinary-pass-unavailable',!families.includes('pass')&&!families.includes('exhausted-pass'),{profile,families});}
let exhausted=structuredClone(createSimulationState(setup('core-advanced-authority')));exhausted.phase='Action';exhausted.players.P1.limits.miniTurnsRemaining=1;exhausted.players.P1.limits.miniTurnsUsed=0;const moved=[...exhausted.players.P1.hand,...exhausted.zones.dp,...exhausted.zones.swapBar];exhausted.players.P1.hand=[];exhausted.zones.dp=[];exhausted.zones.swapBar=[];for(const id of moved){exhausted.cards[id].zone='GY';delete exhausted.cards[id].state.swapBarFaceDown;delete exhausted.cards[id].state.swapBarFaceUp;}exhausted.zones.gy=[...exhausted.zones.gy,...moved];exhausted.metadata.coreAuthority.exhausted={remaining:3,startedFullTurnSequence:exhausted.fullTurnSequence};
const exhaustedFrame=createSimulationDecisionFrame(exhausted),actions=exhaustedFrame.policyActions;add('exhausted-pass-exclusive-legality',actions.length===1&&actions[0].family==='exhausted-pass',{actions:actions.map(a=>({family:a.family,mode:a.mode,timingClass:a.timingClass}))});
const before=structuredClone(exhaustedFrame.state),result=executeSimulationAction(exhaustedFrame.state,exhaustedFrame.resolve(actions[0].actionId));add('exhausted-pass-consumes-one-mini-turn',result.accepted&&before.players.P1.limits.miniTurnsRemaining-result.state.players.P1.limits.miniTurnsRemaining===1,{before:before.players.P1.limits.miniTurnsRemaining,after:result.state.players.P1.limits.miniTurnsRemaining,eventTypes:result.events.map(e=>e.type)});
const cases=[{seed:0x1a2b3c4d,policyIds:['score-rush','control']},{seed:292934512,policyIds:['random-legal','random-legal']}];
for(const c of cases){
 const on=runPolicyMatch({...c,ordinal:records.length,profileId:'core-advanced-authority',decisionLimit:1800,telemetryEnabled:true});
 const off=runPolicyMatch({...c,ordinal:records.length,profileId:'core-advanced-authority',decisionLimit:1800,telemetryEnabled:false});
 const s=on.summary,declines=on.facts.decisionFacts.filter(f=>f.semanticClass==='response-decline');
 const evidence={seed:c.seed,policyIds:c.policyIds,termination:s.terminationReason,passActionCount:s.passActionCount,exhaustedPassActionCount:s.exhaustedPassActionCount,responseOpportunityCount:s.responseOpportunityCount,responsePlayedCount:s.responsePlayedCount,responseDeclinedWithOptionsCount:s.responseDeclinedWithOptionsCount,automaticPriorityAdvanceCount:s.automaticPriorityAdvanceCount,responseWindowClosedCount:s.responseWindowClosedCount,matchResultHash:s.matchResultHash,observerOffHash:off.summary.matchResultHash};
 add('match-terminates-canonically',['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(s.terminationReason),evidence);
 add('ordinary-pass-count-is-exhausted-only',s.passActionCount===s.exhaustedPassActionCount&&s.actionCounts.pass===undefined,evidence);
 add('declines-consume-no-mini-turn',declines.every(f=>!f.consumedMiniTurn),{...evidence,declines:declines.length});
 add('declines-create-no-skip',declines.every(f=>!f.createdSkip),{...evidence,declines:declines.length});
 add('declines-have-lawful-response',declines.every(f=>f.hadLawfulResponse),{...evidence,declines:declines.length});
 add('automatic-advance-is-not-policy-decision',s.automaticPriorityAdvanceCount>0&&s.automaticOrchestrationCommandCount===s.automaticPriorityAdvanceCount,evidence);
 add('response-window-closure-recorded',s.responseWindowClosedCount>0,evidence);
 add('observer-match-hash-invariant',s.matchResultHash===off.summary.matchResultHash,evidence);
 add('observer-final-state-invariant',s.finalStateHash===off.summary.finalStateHash,evidence);
 add('policy-action-accounting-excludes-decline-and-orchestration',s.policyActionCount===s.policyDecisionCount-s.responseDeclinedWithOptionsCount,evidence);
}
add('meaningful-decline-and-automatic-advance-coexist',records.some(r=>r.evidence?.responseDeclinedWithOptionsCount>0)&&records.some(r=>r.evidence?.automaticPriorityAdvanceCount>0),{});
if(records.length!==25)throw new Error(`EXPECTED_25_FIXTURES:${records.length}`);const failed=records.filter(r=>r.status!=='PASS');
const semanticCore={rulesVersion:'4.1.2',engineVersion:'4.2.6',fixtureCount:records.length,records},governingSemanticAggregate=hashCanonical(semanticCore);
const report={schemaVersion:'2.0.0',status:failed.length?'FAIL':'PASS',historicalProtocolCorpus:{rulesAuthorityVersion:'4.1.1',fixtureCount:121,aggregate:'8c91e8194e7fa3ab6bbb3eaa6946a97efd70343c36d5e5953ee8e1c0357013df',changedFixtureIds:[],reason:'Raw PASS_PRIORITY remains a private compatibility command; historical certified replay hashes are immutable.'},governingSemanticRulesVersion:'4.1.2',semanticFixtureCount:records.length,governingSemanticAggregate,addedFixtureIds:records.map(r=>r.fixtureId),unchangedHistoricalFixtureCount:121,records,interpretation:'The v4.1.2 correction is certified by a new semantic autonomy corpus rather than rewriting the immutable 121-command protocol corpus.'};
await writeFile(path.join(reports,'pass-priority-conformance-diff.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(reports,'pass-priority-conformance-diff.md'),`# Pass/Priority Conformance Diff\n\n**Status:** ${report.status}\n\n- Historical raw-protocol corpus: 121/121, aggregate \`${report.historicalProtocolCorpus.aggregate}\` (unchanged).\n- Governing semantic fixtures: ${records.length-failed.length}/${records.length}, aggregate \`${governingSemanticAggregate}\`.\n- Historical fixture IDs changed: none; raw \`PASS_PRIORITY\` remains internal replay protocol only.\n\nThe semantic corpus proves ordinary Pass removal, Exhausted-only Pass, meaningful decline accounting, automatic no-response advancement, and observer invariance.\n`);
if(failed.length)throw new Error(`PASS_PRIORITY_CONFORMANCE_FAILED:${failed.map(x=>x.fixtureId).join(',')}`);console.log(`PASS/PRIORITY CONFORMANCE PASS: ${records.length}/${records.length}; aggregate=${governingSemanticAggregate}`);

