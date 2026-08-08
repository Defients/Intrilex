import { readFile } from 'node:fs/promises';
const src = await readFile('apps/lab-web/dist/state.js', 'utf8');
const replaced = src.replace(
  /export const data = async \(url, fallback=null\) => \{[\s\S]*?\};\nexport const text = async \(url, fallback=''\) => \{[\s\S]*?\};/,
  `export const data = async (url, fallback) => { const value=globalThis.__INTRILEX_DATA[url]; if(value===undefined){if(fallback!==undefined)return fallback;throw new Error(\`MISSING_TEST_DATA \${url}\`);} return structuredClone(value); };\nexport const text = async (url, fallback='') => globalThis.__INTRILEX_TEXT[url] ?? fallback;`
);
console.log('Has __INTRILEX_DATA:', replaced.includes('__INTRILEX_DATA'));
// Find the injected line
const lines = replaced.split('\n');
const dataLine = lines.find(l => l.includes('__INTRILEX_DATA'));
console.log('Injected data line:', dataLine?.substring(0, 200));
