import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from '@intrilex/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const writeReports = process.env.INTRILEX_WRITE_REPORTS !== '0';

async function treeSnapshot(relativeRoot) {
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
  return { files, fileCount: Object.keys(files).length, treeHash: hashCanonical(files) };
}

function publicSnapshot(snapshot) {
  return { fileCount: snapshot.fileCount, treeHash: snapshot.treeHash };
}

function changedFiles(first, second) {
  return [...new Set([...Object.keys(first.files), ...Object.keys(second.files)])]
    .filter(file => first.files[file] !== second.files[file])
    .sort();
}

function build(label) {
  const result = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, INTRILEX_SKIP_AUTONOMY_REPLAY_REGEN: '1' } });
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status}`);
}

build('build-1');
const first = { dist: await treeSnapshot('apps/lab-web/dist'), sampleData: await treeSnapshot('sample-data') };
build('build-2');
const second = { dist: await treeSnapshot('apps/lab-web/dist'), sampleData: await treeSnapshot('sample-data') };
const identical = first.dist.treeHash === second.dist.treeHash && first.sampleData.treeHash === second.sampleData.treeHash;
const report = {
  schemaVersion: '1.1',
  status: identical ? 'PASS' : 'FAIL',
  buildRuns: 2,
  first: { dist: publicSnapshot(first.dist), sampleData: publicSnapshot(first.sampleData) },
  second: { dist: publicSnapshot(second.dist), sampleData: publicSnapshot(second.sampleData) },
  changedFiles: {
    dist: changedFiles(first.dist, second.dist),
    sampleData: changedFiles(first.sampleData, second.sampleData),
  },
  identical,
};
if (writeReports) await writeFile(path.join(root, 'reports/build-determinism.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`BUILD DETERMINISM ${report.status}: dist=${second.dist.treeHash}; sample=${second.sampleData.treeHash}`);
if (!identical) process.exit(1);
