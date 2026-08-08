import { createHash } from 'node:crypto';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'H:/myProjects/Intrilex-dev2';
const EXCLUDE = new Set(['node_modules', '.git', 'dist', '_baseline-extract', '_release-staging']);
const EXCLUDE_FILES = new Set(['Intrilex(6).zip', 'Intrilex(7).zip', '.DS_Store', 'Thumbs.db']);

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(root, full).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && !EXCLUDE_FILES.has(entry.name)) {
      const stat = statSync(full);
      files.push({ path: rel, size: stat.size });
    }
  }
}

const files = [];
walk(root, files);
files.sort((a, b) => a.path.localeCompare(b.path));
const inventory = files.map(f => f.path + '\t' + f.size).join('\n');
const hash = createHash('sha256').update(inventory).digest('hex');
console.log('TREE_INVENTORY_FILE_COUNT:', files.length);
console.log('TREE_INVENTORY_SHA256:', hash);
writeFileSync(join(root, 'reports/_phase0_tree_inventory.txt'), inventory);
writeFileSync(join(root, 'reports/_phase0_tree_hash.txt'), hash + '\n');
