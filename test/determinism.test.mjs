import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashCanonical } from '@intrilex/shared';
test('replay index canonical hash is valid',async()=>{const x=JSON.parse(await readFile('sample-data/replay-index.json','utf8'));const {indexHash,...core}=x;assert.equal(hashCanonical(core),indexHash);});
test('aggregate hash is valid',async()=>{const x=JSON.parse(await readFile('sample-data/corpus-analytics.json','utf8'));const {aggregateHash,...core}=x;assert.equal(hashCanonical(core),aggregateHash);});
test('representative public artifact hash is valid',async()=>{const x=JSON.parse(await readFile('sample-data/replays/public/CT-120.json','utf8'));const {artifactHash,...core}=x;assert.equal(hashCanonical(core),artifactHash);});
test('representative authorized artifact hash is valid',async()=>{const x=JSON.parse(await readFile('sample-data/replays/authorized/CT-120.json','utf8'));const {artifactHash,...core}=x;assert.equal(hashCanonical(core),artifactHash);});
