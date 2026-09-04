// Assembles index.html from atlas-data.json + inline template parts.
// Run: node scripts/assemble-atlas.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = readFileSync(join(root, 'reports', 'balance-check', 'atlas-data.min.json'), 'utf8');

const css = readFileSync(join(root, 'scripts', 'atlas-parts', 'atlas.css'), 'utf8');
const htmlBody = readFileSync(join(root, 'scripts', 'atlas-parts', 'atlas-body.html'), 'utf8');
const js = readFileSync(join(root, 'scripts', 'atlas-parts', 'atlas-app.js'), 'utf8');

const out = `<!DOCTYPE html>
<html lang="en" data-theme="corrupture">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>INTRILEX // CORRUPTURE EFFECT ATLAS — What The Game Became</title>
<meta name="description" content="Corrupture Effect Atlas: 75 primitives, 101 intended routes, 75 executable. Six definitions of power. A veteran strategic autopsy of Intrilex.">
<style>
${css}
</style>
</head>
<body>
${htmlBody}
<script id="atlas-data" type="application/json">
${data}
</script>
<script>
${js}
</script>
</body>
</html>`;

writeFileSync(join(root, 'index.html'), out, 'utf8');
console.log('Wrote index.html', (out.length / 1024).toFixed(1) + 'KB');
