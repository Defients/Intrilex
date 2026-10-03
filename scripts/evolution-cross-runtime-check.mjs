import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { hashCanonical } from '@intrilex/shared';
import { evolutionIdentity,runLabSeries } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { parseResearchImport } from '../packages/simulation-runtime/src/evolution-research.mjs';
import { trainProject,semanticTrainingResult } from '../packages/simulation-runtime/src/evolution-training.mjs';

const source=process.argv[2]??'reports/local/evolution-browser/adaptive.json';
const browser=parseResearchImport(await readFile(source,'utf8'),await evolutionIdentity()),node=structuredClone(browser);
node.checkpoints=node.checkpoints.filter(cp=>node.experiment.scientific.startingCheckpointIds.includes(cp.checkpointId));
node.generations=[];node.evaluations=[];node.faults=[];node.regressions=[];node.experiment.runIds=[];node.experiment.evaluationIds=[];node.experiment.status='IDLE';node.experiment.operational.workerCount=1;
await trainProject(node,runLabSeries);
assert.equal(node.experiment.status,'COMPLETE',JSON.stringify(node.faults));
const actual=semanticTrainingResult(node),expected=semanticTrainingResult(browser);
assert.deepEqual(actual,expected);
const report={status:'PASS',browserSource:source,nodeWorkers:1,semanticHash:hashCanonical(actual),generationCount:node.generations.length,checkpointCount:node.checkpoints.length};
await writeFile('reports/local/evolution-cross-runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
