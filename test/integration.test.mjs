import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadCertifiedReplay, verifyCertifiedReplay } from '@intrilex/engine-adapter';
const root=path.resolve('.');
test('all 121 certified authorized replays verify',async()=>{const dir=path.join(root,'vendor/intrilex-engine-4.1.0/replays');if(!existsSync(dir)){test.skip('vendor/intrilex-engine-4.1.0 not present — skipping corpus verification');return;}const files=(await readdir(dir)).filter(n=>n.endsWith('.certified.replay.json')&&!n.includes('.public.certified.'));assert.equal(files.length,121);for(const n of files)verifyCertifiedReplay(await loadCertifiedReplay(path.join(dir,n)));});
test('generated replay index covers corpus',async()=>{const x=JSON.parse(await readFile('sample-data/replay-index.json','utf8'));assert.equal(x.replayCount,x.records.length);assert.ok(x.replayCount>=121,'replay index must cover at least 121 corpus replays');});
test('corpus analytics never claims match balance',async()=>{const x=JSON.parse(await readFile('sample-data/corpus-analytics.json','utf8'));assert.match(x.interpretationBoundary,/not autonomous matches/i);});

test('batch CLI advertises and runs the Advanced Core default profile', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const capabilitiesRun = await run(process.execPath, ['apps/batch-cli/src/cli.mjs', 'capabilities'], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  const capabilities = JSON.parse(capabilitiesRun.stdout);
  assert.equal(capabilities.engineVersion, '4.2.6');
  assert.equal(capabilities.defaultProfile, 'core-advanced-authority');
  assert.ok(capabilities.profiles.some((profile) => profile.profileId === 'core-advanced-authority' && profile.status === 'SUPPORTED'));

  const matchRun = await run(process.execPath, ['apps/batch-cli/src/cli.mjs', 'match', '--seed', '123', '--p1', 'score-rush', '--p2', 'control'], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
  const match = JSON.parse(matchRun.stdout);
  assert.equal(match.status, 'PASS');
  assert.equal(match.engineVersion, '4.2.6');
  assert.equal(match.profileId, 'core-advanced-authority');
  assert.ok(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(match.summary.terminationReason));
});

