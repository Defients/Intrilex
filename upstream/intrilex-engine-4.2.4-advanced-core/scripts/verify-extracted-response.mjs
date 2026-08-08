import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const zipName = 'Intrilex_Engine_v4.1.3_First_Contact_Response_Authority.zip';
const zipPath = path.join(release, zipName);
const reportPath = path.join(release, 'extracted-verification-report.json');
const expected = (await readFile(`${zipPath}.sha256`, 'utf8')).trim().split(/\s+/)[0];
const actual = createHash('sha256').update(await readFile(zipPath)).digest('hex');
if (actual !== expected) throw new Error(`ZIP hash mismatch: ${actual} != ${expected}`);
const work = await mkdtemp(path.join(tmpdir(), 'intrilex-413-extracted-'));
function run(command, args, env = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: work, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 240000 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${output}`);
  return { command: [command, ...args].join(' '), durationMs: Date.now() - started, tail: output.trim().split('\n').slice(-4) };
}
try {
  const extractScript = `import zipfile, pathlib, sys\nz=zipfile.ZipFile(sys.argv[1]); root=pathlib.Path(sys.argv[2]).resolve()\nfor i in z.infolist():\n p=pathlib.PurePosixPath(i.filename)\n if p.is_absolute() or '..' in p.parts: raise SystemExit('unsafe path:'+i.filename)\n mode=(i.external_attr>>16)&0o170000\n if mode==0o120000: raise SystemExit('symlink:'+i.filename)\nz.extractall(root)`;
  const extraction = spawnSync('python3', ['-c', extractScript, zipPath, work], { encoding: 'utf8' });
  if (extraction.status !== 0) throw new Error(`safe extraction failed: ${extraction.stderr}`);
  const stages = [];
  stages.push(run('npm', ['ci', '--offline', '--ignore-scripts']));
  stages.push(run('npm', ['run', 'patch:manifest:verify']));
  stages.push(run('npm', ['test']));
  stages.push(run('npm', ['run', 'conformance']));
  stages.push(run('npm', ['run', 'test:browser-parity'], { INTRILEX_WRITE_REPORTS: '0' }));
  stages.push(run('npm', ['run', 'patch:manifest:verify']));
  const matchProof = run('node', ['--input-type=module', '-e', `import {runRandomLegalMatch,hashCanonical} from './dist/src/index.js';const r=runRandomLegalMatch({profileId:'first-contact-response',playerIds:['P1','P2'],enabledModules:[],eventApprovedModules:[],seed:0x413c0de,seatOrder:['P1','P2']},1600);if(r.terminationReason!=='NORMAL_VICTORY')throw new Error(r.terminationReason);console.log(JSON.stringify({terminationReason:r.terminationReason,winner:r.state.winner,decisions:r.decisions.length,finalStateHash:hashCanonical(r.state)}));`]);
  stages.push(matchProof);
  const report = { schemaVersion: '1.0', status: 'PASS', artifact: zipName, zipSha256: actual, extractedPathKind: 'temporary-clean-directory', stages, generatedAt: new Date().toISOString() };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`EXTRACTED VERIFICATION PASS: stages=${stages.length}; zip=${actual}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
