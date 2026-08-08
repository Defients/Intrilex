import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const zipName = 'Intrilex_Engine_v4.1.5_First_Contact_Trigger_Closure.zip';
const zipPath = path.join(release, zipName);
const reportPath = path.join(release, 'extracted-verification-report.json');
const expected = (await readFile(`${zipPath}.sha256`, 'utf8')).trim().split(/\s+/)[0];
const actual = createHash('sha256').update(await readFile(zipPath)).digest('hex');
if (actual !== expected) throw new Error(`ZIP hash mismatch: ${actual} != ${expected}`);
const work = await mkdtemp(path.join(tmpdir(), 'intrilex-415-extracted-'));
function run(command, args, env = {}, timeout = 240000) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: work, encoding: 'utf8', env: { ...process.env, ...env }, timeout });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${output}`);
  return { command: [command, ...args].join(' '), durationMs: Date.now() - started, tail: output.trim().split('\n').slice(-6) };
}
try {
  const extractScript = `import zipfile,pathlib,sys\nz=zipfile.ZipFile(sys.argv[1]);root=pathlib.Path(sys.argv[2]).resolve()\nfor i in z.infolist():\n p=pathlib.PurePosixPath(i.filename)\n if p.is_absolute() or '..' in p.parts: raise SystemExit('unsafe:'+i.filename)\n if ((i.external_attr>>16)&0o170000)==0o120000: raise SystemExit('symlink:'+i.filename)\nz.extractall(root)`;
  const extraction = spawnSync('python3', ['-c', extractScript, zipPath, work], { encoding: 'utf8' });
  if (extraction.status !== 0) throw new Error(`safe extraction failed: ${extraction.stderr}`);
  const stages = [];
  stages.push(run('npm', ['ci','--offline','--ignore-scripts']));
  stages.push(run('npm', ['run','patch:manifest:verify']));
  stages.push(run('npm', ['test']));
  stages.push(run('npm', ['run','conformance']));
  stages.push(run('npm', ['run','test:browser-parity'], { INTRILEX_WRITE_REPORTS: '0' }, 300000));
  stages.push(run('node', ['--input-type=module','-e', `import fs from 'node:fs';const c=JSON.parse(fs.readFileSync('./reports/TRIGGER_CLOSURE_CERTIFICATION.json','utf8'));const s=JSON.parse(fs.readFileSync('./reports/trigger-closure-authority-stress-500.json','utf8'));if(c.verdict!=='PASS'||c.engineTests.passed!==150||c.conformance.passed!==121)throw new Error('certification mismatch');if(s.status!=='PASS'||s.matchCount!==500||s.engineRejections!==0||s.resultHash!=='d80896db1dadc0c5369b583ee84c60ea1475ad604d18f8f8f3bd27f95089de32')throw new Error('stress mismatch');if(s.triggerEvents.queued!==220||s.triggerEvents.resolved!==220||s.privateChoices['rank7-scoring-trigger']!==220)throw new Error('trigger coverage mismatch');console.log(JSON.stringify({verdict:c.verdict,matches:s.matchCount,resultHash:s.resultHash,triggers:s.triggerEvents.resolved}));`]));
  stages.push(run('node', ['--input-type=module','-e', `import {runRandomLegalMatch,hashCanonical} from './dist/src/index.js';const allowed=new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);let triggers=0;const rows=[];for(let i=0;i<25;i++){const seed=((0x41500000+Math.imul(i,0x9e3779b1))>>>0)||1;const r=runRandomLegalMatch({profileId:'first-contact-trigger-closure',playerIds:['P1','P2'],enabledModules:[],eventApprovedModules:[],seed,seatOrder:['P1','P2']},5000);if(!allowed.has(r.terminationReason))throw new Error(seed+':'+r.terminationReason);triggers+=r.events.filter(e=>e.type==='AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED').length;rows.push({seed,terminationReason:r.terminationReason,stateHash:hashCanonical(r.state),decisionHash:hashCanonical(r.decisions)});}if(triggers===0)throw new Error('no trigger exercised');console.log(JSON.stringify({matches:25,triggers,aggregateHash:hashCanonical(rows)}));`]));
  stages.push(run('npm', ['run','patch:manifest:verify']));
  const report = { schemaVersion:'1.0',status:'PASS',artifact:zipName,zipSha256:actual,extractedPathKind:'temporary-clean-directory',stages,generatedAt:new Date().toISOString() };
  await writeFile(reportPath, JSON.stringify(report,null,2)+'\n');
  console.log(`EXTRACTED VERIFICATION PASS: stages=${stages.length}; zip=${actual}`);
} finally { await rm(work,{recursive:true,force:true}); }
