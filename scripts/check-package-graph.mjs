#!/usr/bin/env node
/**
 * Package-graph cycle checker.
 * Reads all workspace package.json files and verifies the dependency
 * graph is acyclic. Exits non-zero if any cycle is found.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');

async function readPackageJson(dir) {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function collectWorkspacePackages() {
  const packages = new Map();
  const wsRoots = ['packages', 'apps'];
  for (const wsRoot of wsRoots) {
    try {
      const entries = await readdir(join(root, wsRoot), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pkg = await readPackageJson(join(root, wsRoot, entry.name));
        if (pkg && pkg.name) {
          packages.set(pkg.name, {
            name: pkg.name,
            dir: join(root, wsRoot, entry.name),
            deps: Object.keys(pkg.dependencies ?? {}).filter(d => d.startsWith('@intrilex/'))
          });
        }
      }
    } catch {}
  }
  const rootPkg = await readPackageJson(root);
  if (rootPkg && rootPkg.name) {
    packages.set(rootPkg.name, {
      name: rootPkg.name,
      dir: root,
      deps: Object.keys(rootPkg.dependencies ?? {}).filter(d => d.startsWith('@intrilex/'))
    });
  }
  return packages;
}

function detectCycles(packages) {
  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function dfs(node, path) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    const pkg = packages.get(node);
    if (pkg) {
      for (const dep of pkg.deps) {
        if (packages.has(dep)) {
          dfs(dep, [...path, node]);
        }
      }
    }
    stack.delete(node);
  }

  for (const [name] of packages) {
    if (!visited.has(name)) dfs(name, []);
  }
  return cycles;
}

const packages = await collectWorkspacePackages();
const cycles = detectCycles(packages);

if (cycles.length > 0) {
  console.error('PACKAGE_GRAPH_CYCLE_DETECTED');
  for (const cycle of cycles) {
    console.error(`  Cycle: ${cycle.join(' -> ')}`);
  }
  process.exit(1);
} else {
  const pkgList = [...packages.keys()].sort();
  console.log(`PACKAGE_GRAPH_ACYCLIC: ${pkgList.length} packages, zero cycles`);
  for (const name of pkgList) {
    const pkg = packages.get(name);
    console.log(`  ${name} -> [${pkg.deps.join(', ') || 'none'}]`);
  }
  process.exit(0);
}
