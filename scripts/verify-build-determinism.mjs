import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from '@intrilex/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const writeReports = process.env.INTRILEX_WRITE_REPORTS !== '0';

async function treeHash(relativeRoot) {
  const base = path.join(root, relativeRoot);
  const files = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) {
        const relative = path.relative(base, target).replaceAll('\\', '/');
        files[relative] = createHash('sha256').update(await readFile(target)).digest('hex');
      } else throw new Error(`UNSUPPORTED_BUILD_ARTIFACT:${target}`);
    }
  }
  await walk(base);
  return { fileCount: Object.keys(files).length, treeHash: hashCanonical(files) };
}

function build(label) {
  const result = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, INTRILEX_SKIP_AUTONOMY_REPLAY_REGEN: '1' } });
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status}`);
}

build('build-1');
const first = { dist: await treeHash('apps/lab-web/dist'), sampleData: await treeHash('sample-data') };
build('build-2');
const second = { dist: await treeHash('apps/lab-web/dist'), sampleData: await treeHash('sample-data') };
const identical = first.dist.treeHash === second.dist.treeHash && first.sampleData.treeHash === second.sampleData.treeHash;
const report = { schemaVersion: '1.0', status: identical ? 'PASS' : 'FAIL', buildRuns: 2, first, second, identical };
if (writeReports) await writeFile(path.join(root, 'reports/build-determinism.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`BUILD DETERMINISM ${report.status}: dist=${second.dist.treeHash}; sample=${second.sampleData.treeHash}`);
if (!identical) process.exit(1);
