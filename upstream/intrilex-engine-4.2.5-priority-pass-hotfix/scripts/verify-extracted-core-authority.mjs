import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const zipName = 'Intrilex_Engine_v4.2.0_Core_Foundation_Authority.zip';
const zipPath = path.join(release, zipName);
const reportPath = path.join(release, 'extracted-verification-report.json');
const expected = (await readFile(`${zipPath}.sha256`, 'utf8')).trim().split(/\s+/)[0];
const actual = createHash('sha256').update(await readFile(zipPath)).digest('hex');
if (actual !== expected) throw new Error(`ZIP hash mismatch: ${actual} != ${expected}`);

const immutableWork = await mkdtemp(path.join(tmpdir(), 'intrilex-420-immutable-'));
const executionWork = await mkdtemp(path.join(tmpdir(), 'intrilex-420-execution-'));

function extract(destination) {
  const code = `import zipfile,pathlib,sys\nz=zipfile.ZipFile(sys.argv[1]);r=pathlib.Path(sys.argv[2]).resolve()\nfor i in z.infolist():\n p=pathlib.PurePosixPath(i.filename)\n if p.is_absolute() or '..' in p.parts: raise SystemExit('unsafe:'+i.filename)\n if ((i.external_attr>>16)&0o170000)==0o120000: raise SystemExit('symlink:'+i.filename)\nz.extractall(r)`;
  const result = spawnSync('python3', ['-c', code, zipPath, destination], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`safe extraction failed: ${result.stderr}`);
}

function run(cwd, command, args, timeout = 300000) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, INTRILEX_WRITE_REPORTS: '0' },
    timeout
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${output}`);
  return {
    command: [command, ...args].join(' '),
    executionTree: cwd === immutableWork ? 'immutable' : 'disposable',
    durationMs: Date.now() - started,
    tail: output.trim().split('\n').slice(-8)
  };
}

try {
  extract(immutableWork);
  extract(executionWork);
  const stages = [];
  stages.push(run(immutableWork, 'node', ['scripts/core-integrity.mjs', 'verify']));
  stages.push(run(executionWork, 'npm', ['ci', '--offline', '--ignore-scripts']));
  stages.push(run(executionWork, 'node', ['scripts/core-integrity.mjs', 'verify']));
  stages.push(run(executionWork, 'npm', ['test']));
  stages.push(run(executionWork, 'npm', ['run', 'conformance']));
  stages.push(run(executionWork, 'npm', ['run', 'test:browser-parity'], 360000));
  stages.push(run(executionWork, 'node', ['--input-type=module', '-e', `
    import fs from 'node:fs';
    const c=JSON.parse(fs.readFileSync('./reports/CORE_AUTHORITY_CERTIFICATION.json','utf8'));
    const s=JSON.parse(fs.readFileSync('./reports/core-authority-stress-500.json','utf8'));
    if(c.verdict!=='PASS'||c.engineTests.passed!==155||c.conformance.passed!==121) throw new Error('cert mismatch');
    if(s.status!=='PASS'||s.matchCount!==500||s.terminations.NORMAL_VICTORY!==500||s.resultHash!=='08729e33c3b625a5f24824d8fdcb11d73e79f40434e538b574ac12b09d57a62e') throw new Error('stress mismatch');
    console.log(JSON.stringify({verdict:c.verdict,matches:s.matchCount,resultHash:s.resultHash}));
  `]));
  stages.push(run(executionWork, 'node', ['--input-type=module', '-e', `
    import {runCoreRandomLegalMatch,hashCanonical} from './dist/src/index.js';
    const rows=[];
    for(let i=0;i<25;i++){
      const seed=((0x42000000+Math.imul(i,0x9e3779b1))>>>0)||1;
      const r=runCoreRandomLegalMatch({profileId:'core-foundation-authority',playerIds:['P1','P2'],enabledModules:[],eventApprovedModules:[],seed,seatOrder:['P1','P2']},1000);
      if(r.terminationReason!=='NORMAL_VICTORY') throw new Error(seed+':'+r.terminationReason);
      rows.push({seed,winner:r.state.winner,stateHash:hashCanonical(r.state),decisionHash:hashCanonical(r.decisions)});
    }
    console.log(JSON.stringify({matches:25,aggregateHash:hashCanonical(rows)}));
  `]));
  stages.push(run(immutableWork, 'node', ['scripts/core-integrity.mjs', 'verify']));

  const report = {
    schemaVersion: '1.0',
    status: 'PASS',
    artifact: zipName,
    zipSha256: actual,
    sourceIntegrityStrategy: 'separate immutable and disposable execution extractions',
    stages,
    generatedAt: new Date().toISOString()
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`EXTRACTED VERIFICATION PASS: stages=${stages.length}; zip=${actual}`);
} finally {
  await rm(immutableWork, { recursive: true, force: true });
  await rm(executionWork, { recursive: true, force: true });
}
