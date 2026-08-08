import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const publicRoots=['sample-data/replays/public','sample-data/autonomy/lab-replays/public'];

test('public CT-120 artifact contains no authorized hidden identities',async()=>{const pub=await readFile('sample-data/replays/public/CT-120.json','utf8');const auth=JSON.parse(await readFile('sample-data/replays/authorized/CT-120.json','utf8'));const hidden=new Set();for(const frame of auth.frames){for(const card of Object.values(frame.omniscientState.cards??{})){if(card.identity&&card.zone.endsWith('_HAND'))hidden.add(card.identity);}}for(const identity of hidden)assert.equal(pub.includes(`"${identity}"`),false,`leaked ${identity}`);});

test('all Lab public artifacts use replay-scoped opaque handles and exclude raw RNG/seed state',async()=>{
  for(const root of publicRoots){
    const files=(await readdir(root)).filter(name=>name.endsWith('.json')).sort();
    assert.ok(files.length>0,root);let artifactsWithCards=0;
    for(const file of files){
      const text=await readFile(`${root}/${file}`,'utf8');
      assert.doesNotMatch(text,/"C-\d{3}"/,`${root}/${file}`);
      assert.doesNotMatch(text,/"(?:rng|seed|setupSeed|rngTraceHash|integrityHash)"\s*:/i,`${root}/${file}`);
      if(/"cards":\{"/.test(text)){artifactsWithCards+=1;assert.match(text,/(?:PUB-[0-9a-f]{16}|OPAQUE-HIDDEN-CARD-\d{3})/,`${root}/${file}`);}
    }
    assert.ok(artifactsWithCards>0,`${root} has no card-bearing proof artifacts`);
  }
});

test('opaque card handles differ between replay scopes',async()=>{
  const files=(await readdir('sample-data/replays/public')).filter(name=>name.endsWith('.json')).sort().slice(0,2);
  const handles=[];
  for(const file of files){const artifact=JSON.parse(await readFile(`sample-data/replays/public/${file}`,'utf8'));handles.push(Object.keys(artifact.frames[0].state.cards??{})[0]);}
  assert.equal(handles.length,2);assert.notEqual(handles[0],handles[1]);
});

test('public artifacts contain no raw command instructions',async()=>{const pub=await readFile('sample-data/replays/public/CT-073.json','utf8');assert.doesNotMatch(pub,/"instructions"|"replacementInstructions"/);});

test('public initial load does not fetch authorized data',async()=>{const js=await readFile('apps/lab-web/src/app.js','utf8');const loadBlock=js.slice(js.indexOf('async function boot'),js.indexOf('async function loadReplay'));assert.doesNotMatch(loadBlock,/authorized/);});
