import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, hashCanonical, sanitizeCsvCell } from '@intrilex/shared';
import { wilsonInterval, summarizeNumbers } from '@intrilex/statistics';

test('canonicalization sorts object keys',()=>assert.equal(canonicalize({b:1,a:[2,1]}),'{"a":[2,1],"b":1}'));
test('canonical hash is key-order independent',()=>assert.equal(hashCanonical({a:1,b:2}),hashCanonical({b:2,a:1})));
test('CSV formula injection is neutralized',()=>assert.equal(sanitizeCsvCell('=2+2'),"'=2+2"));
test('CSV quotes are escaped',()=>assert.equal(sanitizeCsvCell('a,"b"'),'"a,""b"""'));
test('Wilson interval handles empty sample',()=>assert.deepEqual(wilsonInterval(0,0),[0,0]));
test('Wilson interval contains observed rate',()=>{const [l,u]=wilsonInterval(56,100);assert.ok(l<.56&&u>.56)});
test('number summary is deterministic',()=>assert.deepEqual(summarizeNumbers([3,1,2]),{count:3,mean:2,median:2,min:1,max:3,p05:1.1,p25:1.5,p75:2.5,p95:2.9,standardDeviation:1}));
