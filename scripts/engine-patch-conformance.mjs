import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const upstream=path.join(root,'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix');
const result=spawnSync(process.execPath,['dist/src/cli.js','conformance'],{cwd:upstream,stdio:'inherit'});
process.exit(result.status??1);

