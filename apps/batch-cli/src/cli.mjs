#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCertifiedReplay, verifyCertifiedReplay, simulationCapabilities, DEFAULT_SIMULATION_PROFILE, ENGINE_VERSION } from '@intrilex/engine-adapter';
import { POLICY_CATALOG } from '@intrilex/simulation-runtime/policy-catalog';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { campaignAggregate, runCampaign } from '@intrilex/simulation-runtime/campaign';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cliPackage = JSON.parse(await readFile(path.join(root, 'apps/batch-cli/package.json'), 'utf8'));
const cliVersion = cliPackage.version;
const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);
const option = (name, fallback) => { const i=args.indexOf(name); return i>=0 ? args[i+1] : fallback; };
const integer = (name, fallback) => { const value=Number(option(name,fallback)); if(!Number.isInteger(value)||value<=0)throw new Error(`${name} must be a positive integer`); return value; };
const policyId = (name, fallback) => { const value=option(name,fallback); if(!POLICY_CATALOG.some(policy=>policy.policyId===value))throw new Error(`Unknown policy ${value}`); return value; };
const capabilities = simulationCapabilities();
const supportedProfiles = new Set(capabilities.filter(item=>item.status==='SUPPORTED').map(item=>item.profileId));
const profileId = () => { const value=option('--profile',DEFAULT_SIMULATION_PROFILE); if(!supportedProfiles.has(value))throw new Error(`Unsupported autonomous profile ${value}`); return value; };
const completeReasons = new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);

async function verifyCorpus() {
  const dir = path.join(root, 'vendor/intrilex-engine-4.1.0/replays');
  const files = (await readdir(dir)).filter(name=>name.endsWith('.certified.replay.json')&&!name.includes('.public.certified.')).sort();
  let commands=0,events=0;
  for(const name of files){const replay=await loadCertifiedReplay(path.join(dir,name));const result=verifyCertifiedReplay(replay);commands+=replay.commands.length;events+=result.events.length;}
  console.log(JSON.stringify({status:'PASS',certifiedReplayCount:files.length,commandCount:commands,eventCount:events},null,2));
}

async function runMatch(){
  const seed=integer('--seed',1),p1=policyId('--p1','score-rush'),p2=policyId('--p2','control'),profile=profileId(),output=option('--replay',null);
  const result=runPolicyMatch({ordinal:0,seed,profileId:profile,seatOrder:['P1','P2'],policyIds:[p1,p2],includeReplay:Boolean(output)});
  if(output){const target=path.resolve(output);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(result.replay,null,2)+'\n');}
  const status=completeReasons.has(result.summary.terminationReason)?'PASS':'FAIL';
  console.log(JSON.stringify({status,engineVersion:ENGINE_VERSION,profileId:profile,summary:result.summary,replayPath:output?path.resolve(output):null},null,2));
  if(status!=='PASS')process.exitCode=1;
}

async function runCampaignCommand(){
  const matches=integer('--matches',100),workers=integer('--workers',1),p1=policyId('--p1','score-rush'),p2=policyId('--p2','control'),profile=profileId();
  const campaign=await runCampaign({profileId:profile,matchCount:matches,policyPairs:[[p1,p2]],decisionLimit:1000,workerCount:workers});
  const aggregate=campaignAggregate(campaign);
  console.log(JSON.stringify({status:aggregate.abortCount===0?'PASS':'FAIL',experimentHash:campaign.experimentHash,canonicalResultHash:campaign.canonicalResultHash,aggregate},null,2));
  if(aggregate.abortCount!==0)process.exitCode=1;
}

if(command==='verify-corpus')await verifyCorpus();
else if(command==='match')await runMatch();
else if(command==='campaign')await runCampaignCommand();
else if(command==='capabilities')console.log(JSON.stringify({engineVersion:ENGINE_VERSION,defaultProfile:DEFAULT_SIMULATION_PROFILE,profiles:capabilities},null,2));
else console.log(`Intrilex Simulation Lab v${cliVersion} — Rank Intelligence CLI\n\nCommands:\n  verify-corpus\n  capabilities\n  match --profile core-advanced-authority --seed 123 --p1 score-rush --p2 control [--replay file]\n  campaign --profile core-advanced-authority --matches 100 --workers 4 --p1 value --p2 control`);
