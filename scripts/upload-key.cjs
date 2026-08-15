const Neocities = require('neocities');
const fs = require('fs');
const path = require('path');

const api = new Neocities('Intrilex', 'TylerPU92~!');
const DEPLOY = 'neocities-deploy';

// Key files that changed in this build
const files = [
  'index.html',
  'app.e2bd7e8507fa.js',
  'styles.d9ab18868b13.css',
  'app.js',
  '__intrilex-config.44c0dc2e83da.js',
];

// Also find the new play-app chunk and the chunk with the rewritten import
const allFiles = fs.readdirSync(DEPLOY);
const newPlayChunk = allFiles.find(f => f.startsWith('chunk-play-app-') && fs.statSync(path.join(DEPLOY, f)).size > 200000);
if (newPlayChunk) files.push(newPlayChunk);

// Find the chunk that has the rewritten import (MCIS7QG2 or equivalent)
const mcisChunk = allFiles.find(f => f === 'chunk-chunk-MCIS7QG2.js');
if (mcisChunk) files.push(mcisChunk);

// Also upload the CSS files in play/
const playCss = ['play/play-v3.css', 'play/ranked-duel.css'];
for (const f of playCss) {
  if (fs.existsSync(path.join(DEPLOY, f))) files.push(f);
}

console.log('Uploading', files.length, 'files:');
files.forEach(f => console.log('  ' + f));

let done = 0, ok = 0, fail = 0;
files.forEach(f => {
  const localPath = path.join(DEPLOY, f);
  if (!fs.existsSync(localPath)) {
    console.log('SKIP (not found):', f);
    done++;
    if (done === files.length) { console.log('Done:', ok, 'ok,', fail, 'failed'); process.exit(0); }
    return;
  }
  api.upload([{ name: f, path: localPath }], (res) => {
    if (res.result === 'success') { ok++; console.log('OK:', f); }
    else { fail++; console.log('FAIL:', f, res.message); }
    done++;
    if (done === files.length) { console.log('Done:', ok, 'ok,', fail, 'failed'); process.exit(0); }
  });
});
