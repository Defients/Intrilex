// Splice the redesigned New Match stylesheet into play-v3.css.
// Replaces, bottom-up so earlier indices stay valid:
//   c) 2068-2077  old 768px setup rules (superseded by the new block)
//   b) 1569-1576  .academy-entry-link (superseded by .quick-mode-card)
//   a) 201-325    the whole old .play-setup block
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssPath = path.join(root, 'apps/lab-web/src/play/play-v3.css');
const newCssPath = path.join(root, '.nm-new-css.tmp');

const raw = readFileSync(cssPath, 'utf8');
const hadCrlf = raw.includes('\r\n');
const lines = raw.split(/\r?\n/);
const newBlock = readFileSync(newCssPath, 'utf8').replace(/\r?\n$/, '').split(/\r?\n/);

const assertLine = (n, mustInclude, label) => {
  if (!lines[n - 1].includes(mustInclude)) {
    throw new Error(`Line ${n} does not include ${JSON.stringify(mustInclude)} (${label}): ${JSON.stringify(lines[n - 1])}`);
  }
};

assertLine(201, 'Play setup', 'block start');
assertLine(324, '.setup-actions .primary-button { width: 100% }', 'block end rule');
assertLine(325, '}', 'block end brace');
assertLine(1569, 'Academy entry link', 'academy entry start');
assertLine(1576, '.academy-entry-arrow', 'academy entry end');
assertLine(2068, 'Setup screen mobile', 'mobile rules start');
assertLine(2077, '.setup-actions .secondary-button', 'mobile rules end');

const splice = (startLine, endLine, replacement) => {
  lines.splice(startLine - 1, endLine - startLine + 1, ...replacement);
};

splice(2068, 2077, []);
splice(1569, 1576, []);
splice(201, 325, newBlock);

const out = lines.join(hadCrlf ? '\r\n' : '\n');
writeFileSync(cssPath, out, 'utf8');
console.log(`play-v3.css spliced: ${raw.split(/\r?\n/).length} -> ${lines.length} lines (crlf=${hadCrlf}, newBlock=${newBlock.length})`);
