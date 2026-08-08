import { readFile } from 'node:fs/promises';
const dist = 'apps/lab-web/dist';
const dataLoaderSource = await readFile(dist + '/data-loader.js', 'utf8');
const appRx = /from\s+["']\.\/([^"']+\.js)["']/g;
const deps = [...dataLoaderSource.matchAll(appRx)].map(m => m[1]);
console.log('data-loader deps:', deps);
// Check if data-loader imports data from state.js
const stateImport = dataLoaderSource.match(/from\s+['"]\.\/state\.js['"]/);
console.log('data-loader imports state.js:', !!stateImport);
// Check what data-loader imports from state.js
const stateImportLine = dataLoaderSource.split('\n').find(l => l.includes("from './state.js'") || l.includes('from "./state.js"'));
console.log('state.js import line:', stateImportLine?.substring(0, 100));
