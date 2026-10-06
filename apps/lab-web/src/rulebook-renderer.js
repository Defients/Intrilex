// ═══════════════════════════════════════════════════════════════
// rulebook-renderer.js — lightweight markdown renderer + rules page
// Vanilla JS only. Handles the markdown subset used by the rulebook:
// ATX headers, pipe tables, ordered/unordered lists, bold/italic,
// inline code, fenced code blocks, blockquotes, horizontal rules,
// and paragraphs. Also builds a TOC and wraps # PART sections in
// collapsible <details> elements.
//
// Illustrated mode (default ON) injects inline-SVG decorative part
// headers, themed PART backgrounds, mechanic diagrams, callout boxes,
// and icon-embellished lists. A persisted toggle (rulesIllustrated)
// switches back to the original strict-text view.
// ═══════════════════════════════════════════════════════════════

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

import { RULES_VERSION } from './version.js';
import { persistSetting, state } from './state.js';

// ── View mode state (persisted, default 'illustrated') ────────────
// Tri-state: 'illustrated' | 'text' | 'showcase'. Backward-compatible
// with the legacy rulesIllustrated boolean: if rulesViewMode is unset,
// rulesIllustrated===false maps to 'text', otherwise 'illustrated'.
let RULES_VIEW_MODE = state.rulesViewMode || (state.rulesIllustrated === false ? 'text' : 'illustrated');
// Derived boolean kept for the existing enhanceContent()/renderCollapsibleParts() path.
let RULES_ILLUSTRATED = RULES_VIEW_MODE === 'illustrated';

// Inline formatting: bold, italic, inline code. Order matters — code first
// so its contents are not formatted, then bold (longer **), then italic (*).
// HTML entities in text content are escaped BEFORE formatting so literal
// <, >, & in rulebook text (e.g. "A < 2 < 3") are displayed as text, not
// interpreted as markup by the browser.
function renderInline(text) {
  // Protect inline code spans first by extracting placeholders.
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\uE000CODE${codeSpans.length - 1}\uE000`;
  });
  // Escape HTML entities in the remaining text.
  text = esc(text);
  // Bold (**text**) before italic (*text*) to avoid greedy overlap.
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Restore code spans (escaped).
  text = text.replace(/\uE000CODE(\d+)\uE000/g, (_, i) => `<code>${esc(codeSpans[Number(i)])}</code>`);
  return text;
}

// Parse a pipe-delimited table row into cell contents.
function parseTableRow(line) {
  return line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(line) && /\|/.test(line) && /-/.test(line);
}

// Convert markdown text to an HTML string. Block-level parser walks
// line-by-line, grouping contiguous lines into blocks.
export function renderMarkdown(mdText) {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;

  const flushParagraph = (buffer) => {
    if (buffer.length) html.push(`<p>${renderInline(buffer.join(' '))}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // closing fence
      html.push(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    // ATX headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const slug = slugify(text);
      html.push(`<h${level} id="${slug}">${renderInline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      html.push('<hr>');
      i++;
      continue;
    }

    // Blockquote (consecutive lines)
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
      continue;
    }

    // Table: header row + separator + body rows
    if (/\|/.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${header.map(cell => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      html.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      html.push(`<ul>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      html.push(`<ol>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    // Blank line — paragraph break
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: gather contiguous non-blank, non-block lines
    const buffer = [];
    while (i < lines.length
      && lines[i].trim() !== ''
      && !/^#{1,6}\s+/.test(lines[i])
      && !/^```/.test(lines[i])
      && !/^>\s?/.test(lines[i])
      && !/^\s*[-*+]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !/^\s*---+\s*$/.test(lines[i])
      && !(/^\s*\|/.test(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      buffer.push(lines[i].trim());
      i++;
    }
    flushParagraph(buffer);
  }

  return html.join('\n');
}

export function slugify(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'section';
}

// Build a table of contents from the markdown: # PART entries become
// top-level groups; ## entries become nested links.
function buildToc(mdText) {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const toc = [];
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*#*$/);
    if (h1) { toc.push({ level: 1, text: h1[1], slug: slugify(h1[1]) }); continue; }
    const h2 = line.match(/^##\s+(.+?)\s*#*$/);
    if (h2) { toc.push({ level: 2, text: h2[1], slug: slugify(h2[1]) }); continue; }
  }
  return toc;
}

// ═══════════════════════════════════════════════════════════════
// ILLUSTRATED MODE — PART themes, SVG headers, mechanic diagrams
// ═══════════════════════════════════════════════════════════════

// Extract the roman numeral key from a PART title (e.g. "PART III — …" → "III").
function extractPartKey(partTitle) {
  const m = String(partTitle).match(/^PART\s+([IVXLCDM]+)\b/i);
  return m ? m[1].toUpperCase() : null;
}

// 10-part theme map: accent color + CSS rgb triplet + display metadata + icon id.
const PART_THEMES = {
  I:     { icon: 'compass',   accentColor: 'var(--cyan)',    accentRgb: '90,215,232',  title: 'The Game in One Pass',              subtitle: 'Foundation' },
  II:    { icon: 'stack',     accentColor: 'var(--amber)',   accentRgb: '241,189,93',  title: 'How Plays Resolve',                 subtitle: 'Flow' },
  III:   { icon: 'shield',    accentColor: 'var(--violet)',  accentRgb: '167,139,250', title: 'Scoring, Protection, Table States', subtitle: 'Shield' },
  IV:    { icon: 'swap',      accentColor: 'var(--green)',   accentRgb: '104,211,145', title: 'Swap Bar and Scuttle',              subtitle: 'Exchange' },
  V:     { icon: 'power',     accentColor: 'var(--magenta)', accentRgb: '238,108,183', title: 'Advanced Core Systems',             subtitle: 'Power' },
  VI:    { icon: 'codex',     accentColor: 'var(--blue)',    accentRgb: '91,156,240',  title: 'Complete Card Codex',               subtitle: 'Codex' },
  VII:   { icon: 'beacon',    accentColor: 'var(--amber)',   accentRgb: '241,189,93',  title: 'First Contact',                     subtitle: 'Learning' },
  VIII:  { icon: 'hexagon',   accentColor: 'var(--cyan)',    accentRgb: '90,215,232',  title: 'Optional Game Modes',               subtitle: 'Expansion' },
  IX:    { icon: 'gavel',     accentColor: 'var(--violet)',  accentRgb: '167,139,250', title: 'Rulings, Tournament, Reference',    subtitle: 'Authority' },
  X:     { icon: 'checklist', accentColor: 'var(--green)',   accentRgb: '104,211,145', title: 'Player Checklist',                  subtitle: 'Completion' },
};

// Small inline-SVG icon set (24×24 viewBox) used in part summaries + headers.
const PART_ICON_PATHS = {
  compass:   '<circle cx="12" cy="12" r="9"/><polygon points="12,7 14,12 12,17 10,12" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  stack:     '<rect x="4" y="14" width="16" height="5" rx="1"/><rect x="6" y="9" width="12" height="5" rx="1"/><rect x="8" y="4" width="8" height="5" rx="1"/>',
  shield:    '<path d="M12 2 L20 5 V12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 V5 Z"/><path d="M9 11 H15 M9 14 H13" stroke="currentColor" fill="none"/>',
  swap:      '<path d="M5 8 H17 M14 5 L17 8 L14 11" fill="none"/><path d="M19 16 H7 M10 13 L7 16 L10 19" fill="none"/>',
  power:     '<path d="M13 2 L5 13 H11 L9 22 L19 10 H13 Z" fill="currentColor" stroke="none"/>',
  codex:     '<path d="M4 5 C8 4 11 5 12 6 C13 5 16 4 20 5 V19 C16 18 13 19 12 20 C11 19 8 18 4 19 Z"/><path d="M12 6 V20" fill="none"/>',
  beacon:    '<path d="M9 22 H15 L14 18 H10 Z" fill="currentColor" stroke="none"/><path d="M10 18 L10 10 L14 10 L14 18"/><path d="M8 10 L16 10"/><path d="M12 4 L12 7"/><circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none"/>',
  hexagon:   '<path d="M12 3 L19 7 V13 L12 17 L5 13 V7 Z"/><path d="M12 9 L15 10.5 V13.5 L12 15 L9 13.5 V10.5 Z" fill="currentColor" stroke="none"/>',
  gavel:     '<rect x="3" y="14" width="14" height="3" rx="1" transform="rotate(-30 10 15)"/><rect x="13" y="3" width="6" height="6" rx="1" transform="rotate(-30 16 6)"/><path d="M4 21 H12" fill="none"/>',
  checklist: '<rect x="4" y="4" width="16" height="18" rx="2"/><path d="M7 9 L9 11 L13 7" fill="none"/><path d="M7 16 L9 18 L13 14" fill="none"/>',
};

// Return a small inline-SVG icon string for a part icon id.
function partIconSvg(iconId, size = 22) {
  const inner = PART_ICON_PATHS[iconId] || PART_ICON_PATHS.compass;
  return `<svg class="part-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Generate the decorative SVG banner for a PART. Each part gets a unique
// abstract illustration on the right plus the roman numeral + titles.
function generatePartHeader(partKey, partTitle) {
  const theme = PART_THEMES[partKey];
  if (!theme) return '';
  const rgb = theme.accentRgb;
  // Unique decorative motif per part icon id.
  const motif = PART_HEADER_MOTIFS[theme.icon] || PART_HEADER_MOTIFS.compass;
  const roman = esc(partKey);
  const title = esc(theme.title);
  const subtitle = esc(theme.subtitle);
  const ariaLabel = esc(`${partTitle}`);
  return `<svg class="rules-part-header-svg" viewBox="0 0 680 96" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${ariaLabel}">
    <rect class="part-header-bg" x="0" y="0" width="680" height="96" rx="12" fill="rgba(${rgb},.06)"/>
    <rect x="0" y="0" width="6" height="96" rx="3" fill="rgba(${rgb},.55)"/>
    <text class="part-header-roman" x="28" y="52" font-size="34" fill="rgba(${rgb},.9)">${roman}</text>
    <text class="part-header-title" x="28" y="74" font-size="13" fill="var(--text-bright)">${title}</text>
    <text class="part-header-subtitle" x="28" y="88" font-size="10" fill="var(--muted-bright)">${subtitle}</text>
    <g transform="translate(560,8)" stroke="rgba(${rgb},.7)" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${motif}</g>
  </svg>`;
}

// Per-icon abstract motifs drawn in a ~96×80 area (translated to top-right).
const PART_HEADER_MOTIFS = {
  compass:   '<circle cx="48" cy="40" r="30"/><circle cx="48" cy="40" r="20"/><circle cx="48" cy="40" r="10"/><line x1="48" y1="10" x2="48" y2="70"/><line x1="18" y1="40" x2="78" y2="40"/>',
  stack:     '<rect x="20" y="50" width="56" height="18" rx="3"/><rect x="28" y="34" width="40" height="18" rx="3"/><rect x="36" y="18" width="24" height="18" rx="3"/><path d="M48 8 V18"/>',
  shield:    '<path d="M48 8 L74 16 V40 C74 56 62 66 48 72 C34 66 22 56 22 40 V16 Z"/><path d="M36 38 H60 M36 46 H52"/>',
  swap:      '<path d="M22 28 H66 L58 20 M66 28 L58 36"/><path d="M74 52 H30 L38 44 M30 52 L38 60"/>',
  power:     '<path d="M52 8 L30 44 H46 L40 72 L66 36 H50 Z" fill="rgba(238,108,183,.25)" stroke="rgba(238,108,183,.7)"/>',
  codex:     '<path d="M20 18 C32 14 42 16 48 20 C54 16 64 14 76 18 V60 C64 56 54 58 48 62 C42 58 32 56 20 60 Z"/><line x1="48" y1="20" x2="48" y2="62"/>',
  beacon:    '<path d="M40 70 H56 L54 58 H42 Z" fill="rgba(241,189,93,.2)"/><path d="M42 58 V32 H54 V58"/><path d="M38 32 H58"/><path d="M48 18 V28"/><circle cx="48" cy="14" r="4" fill="rgba(241,189,93,.4)"/>',
  hexagon:   '<path d="M48 12 L70 24 V40 L48 52 L26 40 V24 Z"/><path d="M48 26 L60 32 V40 L48 46 L36 40 V32 Z" fill="rgba(90,215,232,.2)"/>',
  gavel:     '<rect x="20" y="50" width="44" height="10" rx="3" transform="rotate(-30 42 55)"/><rect x="52" y="14" width="18" height="18" rx="3" transform="rotate(-30 61 23)"/><line x1="20" y1="70" x2="48" y2="70"/>',
  checklist: '<rect x="22" y="14" width="52" height="58" rx="4"/><path d="M30 26 L36 32 L46 22" fill="none"/><path d="M30 44 L36 50 L46 40" fill="none"/><path d="M30 62 L36 68 L46 58" fill="none"/>',
};

// ═══════════════════════════════════════════════════════════════
// MECHANIC DIAGRAMS — inline SVG for key sections
// ═══════════════════════════════════════════════════════════════

// Shared arrow marker definition injected once per diagram.
const DIAGRAM_ARROW_DEFS = `<defs><marker id="diagramArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L7 4 L0 8 Z" fill="var(--cyan)"/></marker></defs>`;

function wrapDiagram(svgInner, caption) {
  return `<figure class="rules-diagram" role="img" aria-label="${esc(caption)}">${DIAGRAM_ARROW_DEFS}${svgInner}<figcaption class="rules-diagram-caption">${esc(caption)}</figcaption></figure>`;
}

// §2 Setup — two-player table layout with all zones.
function diagramTableLayout() {
  const svg = `<svg viewBox="0 0 680 220" role="img" aria-label="Two-player table layout">
    <rect class="diagram-zone" x="20" y="14" width="120" height="44" rx="6"/>
    <text class="diagram-node-text" x="80" y="34">DP</text><text class="diagram-sub" x="80" y="48">Draw Pile</text>
    <rect class="diagram-zone" x="160" y="14" width="120" height="44" rx="6"/>
    <text class="diagram-node-text" x="220" y="34">Hand</text><text class="diagram-sub" x="220" y="48">private</text>
    <rect class="diagram-zone-accent" x="300" y="14" width="120" height="44" rx="6"/>
    <text class="diagram-node-text" x="360" y="34">PR</text><text class="diagram-sub" x="360" y="48">Point Row</text>
    <rect class="diagram-zone" x="440" y="14" width="120" height="44" rx="6"/>
    <text class="diagram-node-text" x="500" y="34">ER</text><text class="diagram-sub" x="500" y="48">Enduring Row</text>
    <rect class="diagram-zone" x="580" y="14" width="80" height="44" rx="6"/>
    <text class="diagram-node-text" x="620" y="34">Swap</text><text class="diagram-sub" x="620" y="48">Bar</text>
    <line class="diagram-arrow" x1="80" y1="62" x2="80" y2="92"/>
    <line class="diagram-arrow" x1="360" y1="62" x2="360" y2="92"/>
    <rect class="diagram-zone" x="20" y="96" width="640" height="34" rx="6"/>
    <text class="diagram-node-text" x="340" y="118">OTT — On The Table (all PR + ER)</text>
    <rect class="diagram-zone" x="120" y="150" width="180" height="44" rx="6"/>
    <text class="diagram-node-text" x="210" y="170">GY</text><text class="diagram-sub" x="210" y="184">Graveyard · shared</text>
    <rect class="diagram-zone" x="380" y="150" width="180" height="44" rx="6"/>
    <text class="diagram-node-text" x="470" y="170">Exile</text><text class="diagram-sub" x="470" y="184">removed · shared</text>
  </svg>`;
  return wrapDiagram(svg, 'Figure 1 — Standard two-player table zones');
}

// §4 Full Turn — three-phase flow.
function diagramTurnPhases() {
  const svg = `<svg viewBox="0 0 680 150" role="img" aria-label="Full turn phases">
    <rect class="diagram-node" x="30" y="50" width="150" height="50" rx="8"/>
    <text class="diagram-node-text" x="105" y="72">Start Phase</text><text class="diagram-sub" x="105" y="88">reset · maintenance</text>
    <line class="diagram-arrow" x1="180" y1="75" x2="240" y2="75"/>
    <rect class="diagram-node" x="245" y="50" width="170" height="50" rx="8"/>
    <text class="diagram-node-text" x="330" y="72">Action Phase</text><text class="diagram-sub" x="330" y="88">1–3 Mini-Turns</text>
    <line class="diagram-arrow" x1="415" y1="75" x2="475" y2="75"/>
    <rect class="diagram-node" x="480" y="50" width="170" height="50" rx="8"/>
    <text class="diagram-node-text" x="565" y="72">End Phase</text><text class="diagram-sub" x="565" y="88">victory · timers</text>
    <path class="diagram-arrow" d="M565 100 Q340 140 105 100" fill="none"/>
    <text class="diagram-sub" x="340" y="138" text-anchor="middle">pass turn → opponent</text>
  </svg>`;
  return wrapDiagram(svg, 'Figure 2 — Full Turn phase flow');
}

// §6 Stack & Priority — LIFO resolution.
function diagramStackResolution() {
  const svg = `<svg viewBox="0 0 680 200" role="img" aria-label="Stack resolution flow">
    <rect class="diagram-node" x="40" y="20" width="140" height="40" rx="8"/>
    <text class="diagram-node-text" x="110" y="44">Declare play</text>
    <line class="diagram-arrow" x1="180" y1="40" x2="240" y2="40"/>
    <rect class="diagram-node" x="245" y="20" width="150" height="40" rx="8"/>
    <text class="diagram-node-text" x="320" y="44">Response window</text>
    <line class="diagram-arrow" x1="395" y1="40" x2="455" y2="40"/>
    <rect class="diagram-node" x="460" y="20" width="180" height="40" rx="8"/>
    <text class="diagram-node-text" x="550" y="44">Both pass → resolve</text>
    <rect class="diagram-zone-accent" x="120" y="90" width="200" height="34" rx="6"/>
    <text class="diagram-node-text" x="220" y="112">Stack item 1 (oldest)</text>
    <rect class="diagram-zone-accent" x="160" y="128" width="200" height="34" rx="6"/>
    <text class="diagram-node-text" x="260" y="150">Stack item 2 (newest)</text>
    <line class="diagram-arrow" x1="360" y1="145" x2="430" y2="145"/>
    <text class="diagram-sub" x="395" y="138">LIFO</text>
    <rect class="diagram-node" x="435" y="125" width="170" height="40" rx="8"/>
    <text class="diagram-node-text" x="520" y="149">Resolve newest first</text>
  </svg>`;
  return wrapDiagram(svg, 'Figure 3 — Stack resolution (LIFO) with response windows');
}

// §3 The Table — card zone relationships.
function diagramCardZones() {
  const svg = `<svg viewBox="0 0 680 180" role="img" aria-label="Card zone map">
    <rect class="diagram-zone" x="30" y="20" width="110" height="40" rx="6"/>
    <text class="diagram-node-text" x="85" y="44">DP</text>
    <line class="diagram-arrow" x1="140" y1="40" x2="200" y2="40"/>
    <rect class="diagram-zone" x="205" y="20" width="110" height="40" rx="6"/>
    <text class="diagram-node-text" x="260" y="44">Hand</text>
    <line class="diagram-arrow" x1="315" y1="40" x2="375" y2="40"/>
    <rect class="diagram-zone-accent" x="380" y="20" width="110" height="40" rx="6"/>
    <text class="diagram-node-text" x="435" y="44">PR</text>
    <line class="diagram-arrow" x1="490" y1="40" x2="550" y2="40"/>
    <rect class="diagram-zone" x="555" y="20" width="95" height="40" rx="6"/>
    <text class="diagram-node-text" x="602" y="44">GY</text>
    <rect class="diagram-zone" x="380" y="80" width="110" height="40" rx="6"/>
    <text class="diagram-node-text" x="435" y="104">ER</text>
    <line class="diagram-arrow" x1="435" y1="120" x2="435" y2="140"/>
    <rect class="diagram-zone" x="380" y="142" width="110" height="34" rx="6"/>
    <text class="diagram-node-text" x="435" y="164">Exile</text>
    <text class="diagram-sub" x="85" y="120">draw</text>
    <text class="diagram-sub" x="260" y="120">play / effect</text>
    <text class="diagram-sub" x="602" y="120">spent</text>
  </svg>`;
  return wrapDiagram(svg, 'Figure 4 — Card zone flow: DP → Hand → PR/ER → GY/Exile');
}

// §8 Secured PR Points — scoring flow.
function diagramScoringFlow() {
  const svg = `<svg viewBox="0 0 680 170" role="img" aria-label="Scoring flow">
    <rect class="diagram-zone-accent" x="30" y="50" width="120" height="50" rx="8"/>
    <text class="diagram-node-text" x="90" y="72">PR cards</text><text class="diagram-sub" x="90" y="88">public</text>
    <line class="diagram-arrow" x1="150" y1="75" x2="210" y2="75"/>
    <rect class="diagram-node" x="215" y="50" width="150" height="50" rx="8"/>
    <text class="diagram-node-text" x="290" y="72">Sum Points</text><text class="diagram-sub" x="290" y="88">± modifiers</text>
    <line class="diagram-arrow" x1="365" y1="75" x2="425" y2="75"/>
    <rect class="diagram-node" x="430" y="50" width="130" height="50" rx="8"/>
    <text class="diagram-node-text" x="495" y="72">Secured PR</text><text class="diagram-sub" x="495" y="88">Points total</text>
    <line class="diagram-arrow" x1="560" y1="75" x2="620" y2="75"/>
    <rect class="diagram-zone-accent" x="625" y="50" width="40" height="50" rx="8"/>
    <text class="diagram-node-text" x="645" y="80">≥</text>
    <rect class="diagram-node" x="430" y="120" width="130" height="40" rx="8"/>
    <text class="diagram-node-text" x="495" y="145">Goal (default 21)</text>
    <line class="diagram-arrow" x1="495" y1="100" x2="495" y2="120"/>
  </svg>`;
  return wrapDiagram(svg, 'Figure 5 — Secured PR Points vs Goal at End Phase');
}

// §7 Counters — counter authority hierarchy.
function diagramCounterMatrix() {
  const svg = `<svg viewBox="0 0 680 200" role="img" aria-label="Counter authority matrix">
    <rect class="diagram-zone-accent" x="240" y="14" width="200" height="40" rx="8"/>
    <text class="diagram-node-text" x="340" y="38">K♠ — Universal Counter</text>
    <line class="diagram-arrow" x1="340" y1="54" x2="140" y2="100"/>
    <line class="diagram-arrow" x1="340" y1="54" x2="340" y2="100"/>
    <line class="diagram-arrow" x1="340" y1="54" x2="540" y2="100"/>
    <rect class="diagram-node" x="50" y="104" width="180" height="40" rx="8"/>
    <text class="diagram-node-text" x="140" y="128">Ace-family counters</text>
    <rect class="diagram-node" x="250" y="104" width="180" height="40" rx="8"/>
    <text class="diagram-node-text" x="340" y="128">Single-card Kings</text>
    <rect class="diagram-node" x="450" y="104" width="180" height="40" rx="8"/>
    <text class="diagram-node-text" x="540" y="128">Ordinary effects</text>
    <text class="diagram-sub" x="140" y="160">Effect-class only</text>
    <text class="diagram-sub" x="340" y="160">Anchor-class only</text>
    <text class="diagram-sub" x="540" y="160">subject to specificity</text>
  </svg>`;
  return wrapDiagram(svg, 'Figure 6 — Counter authority hierarchy');
}

// §22 Exhausted — countdown visualization.
function diagramExhaustedCountdown() {
  const svg = `<svg viewBox="0 0 680 160" role="img" aria-label="Exhausted countdown">
    <circle cx="120" cy="80" r="50" class="diagram-zone-accent"/>
    <text class="diagram-node-text" x="120" y="78" font-size="22">3</text><text class="diagram-sub" x="120" y="96">DP empty</text>
    <line class="diagram-arrow" x1="175" y1="80" x2="245" y2="80"/>
    <circle cx="300" cy="80" r="50" class="diagram-zone"/>
    <text class="diagram-node-text" x="300" y="78" font-size="22">2</text><text class="diagram-sub" x="300" y="96">turn passes</text>
    <line class="diagram-arrow" x1="355" y1="80" x2="425" y2="80"/>
    <circle cx="480" cy="80" r="50" class="diagram-zone"/>
    <text class="diagram-node-text" x="480" y="78" font-size="22">1</text><text class="diagram-sub" x="480" y="96">turn passes</text>
    <line class="diagram-arrow" x1="535" y1="80" x2="600" y2="80"/>
    <rect class="diagram-node" x="605" y="55" width="60" height="50" rx="8"/>
    <text class="diagram-node-text" x="635" y="84" font-size="14">0</text><text class="diagram-sub" x="635" y="98">tiebreak</text>
  </svg>`;
  return wrapDiagram(svg, 'Figure 7 — Exhausted countdown (3 → 0 then tiebreaker)');
}

// §21 Effect Tiers — Base → Super → Ultra progression.
function diagramEffectTiers() {
  const svg = `<svg viewBox="0 0 680 160" role="img" aria-label="Effect tiers progression">
    <rect class="diagram-node" x="30" y="55" width="160" height="50" rx="8"/>
    <text class="diagram-node-text" x="110" y="78">Base Effect</text><text class="diagram-sub" x="110" y="94">single card</text>
    <line class="diagram-arrow" x1="190" y1="80" x2="250" y2="80"/>
    <rect class="diagram-node" x="255" y="55" width="160" height="50" rx="8"/>
    <text class="diagram-node-text" x="335" y="78">Super Effect</text><text class="diagram-sub" x="335" y="94">2-card combo</text>
    <line class="diagram-arrow" x1="415" y1="80" x2="475" y2="80"/>
    <rect class="diagram-zone-accent" x="480" y="55" width="170" height="50" rx="8"/>
    <text class="diagram-node-text" x="565" y="78">Ultra Effect</text><text class="diagram-sub" x="565" y="94">3+ card · 1/FT</text>
    <text class="diagram-sub" x="110" y="130">printed text</text>
    <text class="diagram-sub" x="335" y="130">combo recipe</text>
    <text class="diagram-sub" x="565" y="130">one Ultra per FT</text>
  </svg>`;
  return wrapDiagram(svg, 'Figure 8 — Effect tiers: Base → Super → Ultra');
}

// Map of section slugs → diagram generator functions.
const MECHANIC_DIAGRAM_SLUGS = {
  '2-setup-standard-two-player-core': diagramTableLayout,
  '4-your-full-turn': diagramTurnPhases,
  '6-the-stack-and-priority': diagramStackResolution,
  '3-the-table': diagramCardZones,
  '8-secured-pr-points': diagramScoringFlow,
  '7-counters': diagramCounterMatrix,
  '22-exhausted-canonical-10': diagramExhaustedCountdown,
  '21-effect-tiers-and-ultras-canonical-9': diagramEffectTiers,
};

// Return the inline-SVG mechanic diagram for a section slug, or '' if none.
function generateMechanicDiagram(sectionSlug) {
  const gen = MECHANIC_DIAGRAM_SLUGS[sectionSlug];
  return gen ? gen() : '';
}

// Decorative section divider SVG (rendered between major sections).
const SECTION_DIVIDER_SVG = `<svg class="rules-section-divider" viewBox="0 0 520 24" aria-hidden="true">
  <line x1="40" y1="12" x2="230" y2="12"/>
  <circle class="divider-dot" cx="260" cy="12" r="3"/>
  <path d="M250 12 L260 4 L270 12 L260 20 Z"/>
  <line x1="290" y1="12" x2="480" y2="12"/>
</svg>`;

// ═══════════════════════════════════════════════════════════════
// CONTENT ENHANCER — callouts, key-rule boxes, diagram injection
// ═══════════════════════════════════════════════════════════════

// Post-process rendered HTML to inject illustrated-mode decorations.
// In text mode (mode === false) the HTML is returned unchanged so the
// original strict-text view is preserved.
function enhanceContent(html, mode) {
  if (!mode) return html;

  // 1. Blockquotes → styled "Designer's Note" callouts.
  let out = html.replace(/<blockquote>/g, '<blockquote class="rules-callout"><span class="rules-callout-label">Designer\'s Note</span>');

  // 2. Key-rule highlight boxes: paragraphs that lead with the Golden Rule
  //    or contain a strong "Golden Rule" / key principle marker.
  out = out.replace(/<p>(<strong>Golden Rule<\/strong>[\s\S]*?)<\/p>/g, '<div class="rules-key-rule"><span class="rules-key-rule-label">Key Rule</span><p>$1</p></div>');
  out = out.replace(/<p>(When two rules appear to conflict[\s\S]*?)<\/p>/g, '<div class="rules-key-rule"><span class="rules-key-rule-label">Key Rule</span><p>$1</p></div>');

  // 3. Inject mechanic diagrams after the matching <h2 id="slug">…</h2>.
  for (const slug of Object.keys(MECHANIC_DIAGRAM_SLUGS)) {
    const diagram = generateMechanicDiagram(slug);
    if (!diagram) continue;
    // Insert the diagram immediately after the closing </h2> of the section.
    const headerRe = new RegExp(`(<h2 id="${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?<\\/h2>)`);
    out = out.replace(headerRe, `$1${diagram}`);
  }

  // 4. Insert a decorative divider before each <h2> (except the first in the block).
  out = out.replace(/(<h2\s)/g, `${SECTION_DIVIDER_SVG}$1`);
  // Remove a leading divider if the block happens to start with one.
  out = out.replace(/^<svg class="rules-section-divider"[\s\S]*?<\/svg>(<h2\s)/, '$1');

  return out;
}

// Wrap each # PART section (and the leading front matter before the
// first PART) in a collapsible <details> element. PART sections default
// open; front matter is left as a plain block. In illustrated mode the
// SVG header banner is injected into the summary and a data-part-theme
// attribute is added for per-part accent theming.
function renderCollapsibleParts(mdText) {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = [];
  let partTitle = null;

  const flush = (open) => {
    if (!current.length) return;
    const body = enhanceContent(renderMarkdown(current.join('\n')), RULES_ILLUSTRATED);
    if (partTitle) {
      const slug = slugify(partTitle);
      const partKey = extractPartKey(partTitle);
      const theme = partKey ? PART_THEMES[partKey] : null;
      const themeAttr = theme ? ` data-part-theme="${esc(partKey)}" style="--part-accent:${theme.accentColor};--part-accent-rgb:${theme.accentRgb}"` : '';
      const headerSvg = (theme && RULES_ILLUSTRATED) ? generatePartHeader(partKey, partTitle) : '';
      const summaryIcon = (theme && RULES_ILLUSTRATED) ? partIconSvg(theme.icon) : '';
      blocks.push(`<details class="rules-part"${themeAttr} ${open ? 'open' : ''}><summary class="rules-part-summary">${summaryIcon}${esc(partTitle)}</summary><div class="rules-part-body" id="${slug}">${headerSvg}${body}</div></details>`);
    } else {
      blocks.push(`<div class="rules-frontmatter">${body}</div>`);
    }
    current = [];
  };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*#*$/);
    if (h1 && /^PART/i.test(h1[1])) {
      flush(true);
      partTitle = h1[1];
    } else {
      current.push(line);
    }
  }
  flush(true);
  return blocks.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// SHOWCASE MODE — continuous scroll, heavy SVG decoration, mini-nav
// ═══════════════════════════════════════════════════════════════

// Large hero banner SVG for the top of the showcase page (~680×200).
// Extracts the rulebook title from the first `# ` line.
function generateShowcaseHero(mdText) {
  const firstH1 = mdText.match(/^#\s+(.+?)\s*#*$/m);
  const title = firstH1 ? firstH1[1] : 'Intrilex';
  const t = esc(title);
  const v = esc(RULES_VERSION);
  return `<svg class="showcase-hero-svg" viewBox="0 0 680 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${t}">
    <defs>
      <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(90,215,232,.12)"/>
        <stop offset="50%" stop-color="rgba(167,139,250,.08)"/>
        <stop offset="100%" stop-color="rgba(12,24,34,.6)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="680" height="200" rx="16" fill="url(#heroGrad)"/>
    <g stroke="rgba(90,215,232,.18)" fill="none" stroke-width="1.2">
      <path d="M540 100 A120 120 0 0 1 660 100"/>
      <path d="M520 100 A140 140 0 0 1 660 100"/>
      <path d="M500 100 A160 160 0 0 1 660 100"/>
      <path d="M480 100 A180 180 0 0 1 660 100"/>
    </g>
    <g font-size="22" text-anchor="middle" fill="rgba(90,215,232,.5)">
      <text x="430" y="70">&#9824;</text>
      <text x="460" y="110">&#9829;</text>
      <text x="490" y="70">&#9830;</text>
      <text x="520" y="110">&#9827;</text>
    </g>
    <text x="32" y="78" font-family="Georgia,serif" font-size="30" font-weight="700" fill="var(--text-bright)">${t}</text>
    <rect x="32" y="96" width="64" height="22" rx="11" fill="rgba(90,215,232,.18)" stroke="rgba(90,215,232,.4)"/>
    <text x="64" y="111" font-family="Inter,sans-serif" font-size="11" font-weight="600" text-anchor="middle" fill="var(--cyan)">v${v}</text>
    <text x="32" y="140" font-family="Inter,sans-serif" font-size="12" fill="var(--muted-bright)">Complete Player Rulebook</text>
    <text x="32" y="160" font-family="Inter,sans-serif" font-size="10" fill="var(--muted)">10 parts · one continuous scroll</text>
  </svg>`;
}

// Full-bleed per-part header for showcase mode (~680×160). Larger and
// more elaborate than the illustrated-mode generatePartHeader().
function generateShowcasePartHeader(partKey, partTitle) {
  const theme = PART_THEMES[partKey];
  if (!theme) return '';
  const rgb = theme.accentRgb;
  const motif = PART_HEADER_MOTIFS[theme.icon] || PART_HEADER_MOTIFS.compass;
  const roman = esc(partKey);
  const title = esc(theme.title);
  const subtitle = esc(theme.subtitle);
  const ariaLabel = esc(partTitle);
  return `<svg class="showcase-part-header-svg" viewBox="0 0 680 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${ariaLabel}">
    <defs>
      <linearGradient id="partGrad${roman}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(${rgb},.14)"/>
        <stop offset="60%" stop-color="rgba(${rgb},.04)"/>
        <stop offset="100%" stop-color="rgba(12,24,34,.5)"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="680" height="160" rx="16" fill="url(#partGrad${roman})"/>
    <rect x="0" y="0" width="8" height="160" rx="4" fill="rgba(${rgb},.6)"/>
    <text x="36" y="72" font-family="Georgia,serif" font-size="52" font-weight="700" fill="rgba(${rgb},.85)">${roman}</text>
    <text x="36" y="104" font-family="Inter,sans-serif" font-size="18" font-weight="700" fill="var(--text-bright)">${title}</text>
    <text x="36" y="126" font-family="Inter,sans-serif" font-size="12" font-weight="500" fill="var(--muted-bright)">${subtitle}</text>
    <g transform="translate(540,30) scale(1.4)" stroke="rgba(${rgb},.6)" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${motif}</g>
  </svg>`;
}

// Placeholder "card frame" SVG (~120×170) for codex sections (Part VI).
// Stylized playing-card border with rank corners + suit center glyph.
function generateShowcaseCardFrame(rankLabel, suitGlyph, accentRgb) {
  const r = esc(rankLabel);
  const s = esc(suitGlyph);
  const rgb = accentRgb || '91,156,240';
  return `<svg class="showcase-card-frame-svg" viewBox="0 0 120 170" role="img" aria-label="${r}${s}">
    <rect x="6" y="6" width="108" height="158" rx="10" fill="rgba(12,24,34,.7)" stroke="rgba(${rgb},.5)" stroke-width="1.5"/>
    <rect x="10" y="10" width="100" height="150" rx="8" fill="none" stroke="rgba(${rgb},.2)" stroke-width="1"/>
    <text x="16" y="26" font-family="Georgia,serif" font-size="14" font-weight="700" fill="rgba(${rgb},.9)">${r}</text>
    <text x="16" y="40" font-family="Georgia,serif" font-size="12" fill="rgba(${rgb},.8)">${s}</text>
    <text x="60" y="92" font-family="Georgia,serif" font-size="40" text-anchor="middle" fill="rgba(${rgb},.7)">${s}</text>
    <text x="104" y="154" font-family="Georgia,serif" font-size="14" font-weight="700" text-anchor="end" fill="rgba(${rgb},.9)" transform="rotate(180 104 148)">${r}</text>
    <path d="M10 10 L18 10 L10 18 Z" fill="rgba(${rgb},.3)"/>
    <path d="M110 160 L102 160 L110 152 Z" fill="rgba(${rgb},.3)"/>
  </svg>`;
}

// Build a gallery of card-frame placeholders for the codex (Part VI).
function generateShowcaseCardGallery(partKey) {
  const theme = PART_THEMES[partKey];
  if (!theme) return '';
  const rgb = theme.accentRgb;
  const ranks = ['A', 'K', 'Q', 'J', '10'];
  const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const cards = [];
  for (const s of suits) {
    for (const r of ranks) {
      cards.push(generateShowcaseCardFrame(r, s, rgb));
    }
  }
  return `<div class="showcase-card-gallery" aria-label="Card codex placeholder gallery">${cards.join('')}</div>`;
}

// Wrap the first letter of a paragraph in a decorative drop-cap span.
// Skips leading HTML tags (e.g. <strong>) so the drop-cap wraps the
// first actual text character, not a markup delimiter. Also skips
// leading HTML entities like &lt; so the drop-cap doesn't split them.
function applyDropCap(html) {
  return html.replace(/<p>([\s\S]*?)<\/p>/, (m, inner) => {
    let trimmed = inner.replace(/^\s+/, '');
    if (!trimmed) return m;
    // Capture any leading opening tags (e.g. <strong>, <em>) so we
    // can re-insert them before the drop-cap span.
    const leadingTags = [];
    let tagMatch;
    while ((tagMatch = trimmed.match(/^<([a-zA-Z][^>]*)>/))) {
      leadingTags.push(tagMatch[0]);
      trimmed = trimmed.slice(tagMatch[0].length);
    }
    if (!trimmed) return m;
    // Skip leading HTML entities (&lt; &amp; etc.) — don't split them.
    const entityMatch = trimmed.match(/^&[a-zA-Z]+;/);
    if (entityMatch) return m; // leave entity-bearing starts alone
    const first = trimmed[0];
    if (!first || first === '<') return m; // safety: no text char to cap
    const rest = trimmed.slice(1);
    const prefix = leadingTags.join('');
    return `<p>${prefix}<span class="showcase-drop-cap">${esc(first)}</span>${rest}</p>`;
  });
}

// ── Showcase keyword highlighting ──────────────────────────────────────
// Categorized game terms → colored spans. Longest-first ordering within
// the combined regex prevents partial matches (e.g. "Point Row (PR)" wins
// over "Point Row" and "PR"). Letter-boundary lookarounds avoid matching
// inside longer words.
const SHOWCASE_KEYWORDS = [
  // Zones & table areas — cyan
  ['kw-zone', ['Point Row (PR)', 'Enduring Row (ER)', 'Draw Pile (DP)',
    'Secured PR Points', 'Point Row', 'Enduring Row', 'Draw Pile',
    'Graveyard', 'Swap Bar', 'Exile', 'OTT', 'PR', 'ER', 'DP', 'GY']],
  // Phases & turn structure — amber
  ['kw-phase', ['Action-Phase skip', 'Full Turn (FT)',
    'Action Phase', 'Start Phase', 'End Phase', 'Full Turn',
    'Mini-Turn', 'FT']],
  // Mechanics & systems — magenta
  ['kw-mechanic', ['Wild Sovereignty', "Queen's Court", 'Royal Marriage',
    'Sudden Death', 'Time Bomb', 'Tournament Seed', 'BattleRealm',
    'Multiplayer', 'First Contact', 'Board Lock', 'Exhausted',
    'Multi-card', 'Anchor Play', 'Anchor', 'Attachment', 'Voltage',
    'Scuttle', 'Aegis', 'Untap', 'untap', 'Tapped', 'tapped',
    'Tap', 'Combo', 'Ultra', 'Trap', 'Deffy']],
  // Timing keywords — green italic
  ['kw-timing', ['Special Interrupt', 'Interrupt', 'interrupt',
    'Instant', 'Quick', 'quick', 'Free play']],
  // Actions & scoring — blue
  ['kw-action', ['Face-Down Swap', 'Face-Up Swap', 'Draw & Cast',
    'Exhausted Pass', 'Play for Points', 'Play for Effect',
    'Goal', 'Points', 'Draw', 'draw']],
  // Jokers — violet
  ['kw-rank', ['Red Joker', 'Black Joker']],
];

const _kwMap = new Map();
for (const [cls, terms] of SHOWCASE_KEYWORDS) {
  for (const t of terms) _kwMap.set(t, cls);
}
const _kwTerms = [..._kwMap.keys()].sort((a, b) => b.length - a.length);
const _kwAlternation = _kwTerms
  .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const KEYWORD_RE = new RegExp(`(?<![a-zA-Z])(${_kwAlternation})(?![a-zA-Z])`, 'g');

// Card-rank notation: A♠, 10♥, 2♣, J♦, etc.
const CARD_RANK_RE = /(?<![a-zA-Z0-9])(([AKQJ]|10|[2-9])[♠♥♦♣])(?![a-zA-Z0-9])/g;

// Highlight game terms and card-rank notation in rendered HTML text nodes.
// Skips content inside <code>, <pre>, and <a> tags to avoid breaking code
// snippets, preformatted blocks, and anchor links.
// Tag detection requires `<` followed by a letter or `/` — this prevents
// literal `<` in text (e.g. "A < 2 < 3") from being treated as a tag
// delimiter and consuming subsequent markup.
function highlightKeywords(html) {
  const parts = html.split(/(<\/?[a-zA-Z][^>]*>)/g);
  let inCode = false, inPre = false, inAnchor = false, inSvg = false;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const tag = parts[i];
      if (/^<code[\s>]/i.test(tag)) inCode = true;
      if (/^<\/code>/i.test(tag)) inCode = false;
      if (/^<pre[\s>]/i.test(tag)) inPre = true;
      if (/^<\/pre>/i.test(tag)) inPre = false;
      if (/^<a[\s>]/i.test(tag)) inAnchor = true;
      if (/^<\/a>/i.test(tag)) inAnchor = false;
      if (/^<svg[\s>]/i.test(tag)) inSvg = true;
      if (/^<\/svg>/i.test(tag)) inSvg = false;
      continue;
    }
    if (inCode || inPre || inAnchor || inSvg) continue;
    // Card ranks first (longer, more specific pattern).
    parts[i] = parts[i].replace(CARD_RANK_RE,
      '<span class="kw kw-rank">$1</span>');
    // Then game-term keywords.
    parts[i] = parts[i].replace(KEYWORD_RE, (m) => {
      const cls = _kwMap.get(m);
      return cls ? `<span class="kw ${cls}">${m}</span>` : m;
    });
  }
  return parts.join('');
}

// Ornamental section divider for showcase mode (larger, part-accent colored).
function showcaseDivider(rgb) {
  const c = rgb || '90,215,232';
  return `<svg class="showcase-divider" viewBox="0 0 520 32" aria-hidden="true">
    <line x1="40" y1="16" x2="220" y2="16" stroke="rgba(${c},.4)" stroke-width="1.5"/>
    <path d="M240 16 L260 4 L280 16 L260 28 Z" fill="rgba(${c},.5)" stroke="rgba(${c},.6)" stroke-width="1"/>
    <circle cx="260" cy="16" r="3" fill="rgba(${c},.8)"/>
    <line x1="300" y1="16" x2="480" y2="16" stroke="rgba(${c},.4)" stroke-width="1.5"/>
  </svg>`;
}

// Post-process rendered HTML with showcase-specific decorations.
function enhanceShowcaseContent(html, partKey) {
  const theme = partKey ? PART_THEMES[partKey] : null;
  const rgb = theme ? theme.accentRgb : '90,215,232';

  // 1. Blockquotes → large pull-quote callouts with ornamental quote mark.
  let out = html.replace(/<blockquote>/g, `<blockquote class="showcase-pullquote"><span class="showcase-pullquote-mark" aria-hidden="true">&ldquo;</span>`);

  // 2. Key-rule highlight boxes (gradient banners).
  out = out.replace(/<p>(<strong>Golden Rule<\/strong>[\s\S]*?)<\/p>/g, `<div class="showcase-key-rule"><span class="showcase-key-rule-label">Key Rule</span><p>$1</p></div>`);
  out = out.replace(/<p>(When two rules appear to conflict[\s\S]*?)<\/p>/g, `<div class="showcase-key-rule"><span class="showcase-key-rule-label">Key Rule</span><p>$1</p></div>`);

  // 3. Inject mechanic diagrams after matching <h2> headers.
  for (const slug of Object.keys(MECHANIC_DIAGRAM_SLUGS)) {
    const diagram = generateMechanicDiagram(slug);
    if (!diagram) continue;
    const headerRe = new RegExp(`(<h2 id="${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?<\\/h2>)`);
    out = out.replace(headerRe, `$1${diagram}`);
  }

  // 4. Insert ornamental dividers before each <h2> (except leading).
  out = out.replace(/(<h2\s)/g, `${showcaseDivider(rgb)}$1`);
  out = out.replace(/^<svg class="showcase-divider"[\s\S]*?<\/svg>(<h2\s)/, '$1');

  // 5. Style tables with showcase class.
  out = out.replace(/<table>/g, '<table class="showcase-table">');

  // 6. Inject card-frame gallery before Part VI codex tables.
  if (partKey === 'VI') {
    const gallery = generateShowcaseCardGallery(partKey);
    out = out.replace(/(<table class="showcase-table")/, `${gallery}$1`);
  }

  // 7. Drop-cap on the first paragraph of the block.
  out = applyDropCap(out);

  // 8. Keyword highlighting — colored spans for game terms & card ranks.
  //     Run last so earlier regex-based enhancements see unmodified text.
  out = highlightKeywords(out);

  return out;
}

// Render all PARTs as one continuous expanded scroll (no <details>).
// Each part is a <section> with a full-bleed SVG header + showcase
// decorations. Front matter gets a hero banner.
function renderShowcaseParts(mdText) {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = [];
  let partTitle = null;
  let partKey = null;
  let _isFirstBlock = true;

  const flush = () => {
    if (!current.length) return;
    const body = enhanceShowcaseContent(renderMarkdown(current.join('\n')), partKey);
    if (partTitle) {
      const slug = slugify(partTitle);
      const theme = partKey ? PART_THEMES[partKey] : null;
      const themeAttr = theme ? ` data-part-theme="${esc(partKey)}" style="--part-accent:${theme.accentColor};--part-accent-rgb:${theme.accentRgb}"` : '';
      const headerSvg = theme ? generateShowcasePartHeader(partKey, partTitle) : '';
      blocks.push(`<section class="showcase-part"${themeAttr} id="${slug}">${headerSvg}<div class="showcase-part-body">${body}</div></section>`);
    } else {
      const hero = generateShowcaseHero(mdText);
      blocks.push(`<div class="showcase-frontmatter">${hero}<div class="showcase-frontmatter-body">${body}</div></div>`);
    }
    current = [];
    _isFirstBlock = false;
  };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*#*$/);
    if (h1 && /^PART/i.test(h1[1])) {
      flush();
      partTitle = h1[1];
      partKey = extractPartKey(partTitle);
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// VERBOSE MODE — text-to-speech friendly prose rendering
// Expands abbreviations, spells out card notation, converts tables
// and terse bullet lists into flowing spoken-English sentences.
// Pairs with the Read Aloud control (Web Speech API) so the entire
// rulebook can be listened to as an audiobook for learning.
// ═══════════════════════════════════════════════════════════════

// Roman numeral → spoken ordinal word (for PART headers).
const ROMAN_TO_WORD = {
  I: 'One', II: 'Two', III: 'Three', IV: 'Four', V: 'Five',
  VI: 'Six', VII: 'Seven', VIII: 'Eight', IX: 'Nine', X: 'Ten',
};

// Suit glyph → spoken suit name.
const SUIT_WORDS = { '\u2660': 'Spades', '\u2665': 'Hearts', '\u2666': 'Diamonds', '\u2663': 'Clubs' };

// Rank label → spoken rank word.
const RANK_WORDS = {
  A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack',
  '10': 'Ten', '9': 'Nine', '8': 'Eight', '7': 'Seven', '6': 'Six',
  '5': 'Five', '4': 'Four', '3': 'Three', '2': 'Two',
};

// Game-term abbreviations → full spoken form. Applied to standalone
// tokens only (word-boundary guarded) so "PR" expands but "PRO" does not.
// Longer keys first to avoid partial overlaps.
const ABBREV = [
  ['Secured PR Points', 'Secured Point Row Points'],
  ['Point Row (PR)', 'Point Row'],
  ['Enduring Row (ER)', 'Enduring Row'],
  ['Draw Pile (DP)', 'Draw Pile'],
  ['Action-Phase skip', 'Action Phase skip'],
  ['Full Turn (FT)', 'Full Turn'],
  ['PR', 'Point Row'],
  ['ER', 'Enduring Row'],
  ['DP', 'Draw Pile'],
  ['GY', 'Graveyard'],
  ['OTT', 'On The Table'],
  ['FT', 'Full Turn'],
  ['Aegis', 'Aegis'],
  ['Scuttle', 'Scuttle'],
];
const _abbrevTerms = ABBREV.map(([k]) => k).sort((a, b) => b.length - a.length);
const _abbrevEscaped = _abbrevTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const _abbrevRe = new RegExp(`(?<![A-Za-z])(${_abbrevEscaped})(?![A-Za-z])`, 'g');

// Symbol → spoken-word substitutions. Applied after card-notation and
// abbreviation expansion so the spelled-out text contains no glyphs that
// a TTS engine would mispronounce or skip.
const SYMBOL_WORDS = [
  ['\u2192', ' then '],     // →
  ['\u2194', ' and back to '], // ↔
  ['\u2265', ' is at least '], // ≥
  ['\u2264', ' is at most '],  // ≤
  ['\u00b1', ' plus or minus '], // ±
  ['\u00d7', ' by '],        // ×
  ['\u2020', ' tapped '],    // †
  ['\u2021', ' double-tapped '], // ‡
  ['\u00b7', ', '],          // ·
  ['\u2014', ', '],          // —
  ['\u2013', ', '],          // –
  ['\u2026', '... '],        // …
  ['\u2660', ' spades'], ['\u2665', ' hearts'], ['\u2666', ' diamonds'], ['\u2663', ' clubs'],
  ['\u2605', ' star '],      // ★
  ['\u25c6', ' diamond '],   // ◆
  ['\u25cf', ' dot '],       // ●
  ['&', ' and '],
];

// Card-notation regex: A♠, 10♥, 2♣, J♦, K♠, Q♦. "Red Joker" and
// "Black Joker" are already spoken-friendly plain words, so they need
// no expansion and are intentionally not matched here.
const _cardRankAlt = 'A|K|Q|J|10|[2-9]';
const CARD_NOTATION_RE = new RegExp(
  `(?<![A-Za-z0-9])(${_cardRankAlt})[\u2660\u2665\u2666\u2663](?![A-Za-z0-9])`,
  'g'
);

// Expand a card-notation match (e.g. "A♠") into spoken words ("Ace of Spades").
function expandCardNotation(match) {
  const rank = match.replace(/[\u2660\u2665\u2666\u2663]/, '');
  const suit = match.slice(-1);
  const rankWord = RANK_WORDS[rank] || rank;
  const suitWord = SUIT_WORDS[suit] || '';
  return `${rankWord} of ${suitWord}`;
}

// Convert inline markdown text to verbose spoken-friendly plain text.
// Strips bold/italic/code markers and expands all notation. Returns a
// string with no HTML (safe to wrap in any element).
function verboseInline(text) {
  let t = String(text);
  // Protect inline code spans — spell them out literally.
  const codeSpans = [];
  t = t.replace(/`([^`]+)`/g, (_, code) => { codeSpans.push(code); return `\uE000C${codeSpans.length - 1}\uE000`; });
  // Strip bold/italic markers.
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2');
  // Card notation (before symbol pass so suit glyphs are consumed here).
  t = t.replace(CARD_NOTATION_RE, (_, m) => expandCardNotation(m));
  // Abbreviations.
  t = t.replace(_abbrevRe, (m) => {
    const entry = ABBREV.find(([k]) => k === m);
    return entry ? entry[1] : m;
  });
  // Symbols → words.
  for (const [sym, word] of SYMBOL_WORDS) t = t.split(sym).join(word);
  // Restore code spans literally.
  t = t.replace(/\uE000C(\d+)\uE000/g, (_, i) => codeSpans[Number(i)]);
  // Collapse whitespace.
  return t.replace(/\s+/g, ' ').trim();
}

// Ordinal word list for converting numbered list items to prose.
const ORDINAL_WORDS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth',
  'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];

// Convert a markdown block (lines) into verbose prose HTML. Handles the
// same block types as renderMarkdown but emits spoken-friendly prose.
function renderVerboseBlock(mdText) {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;

  const flushParagraph = (buffer) => {
    if (buffer.length) {
      const prose = verboseInline(buffer.join(' '));
      html.push(`<p>${esc(prose)}</p>`);
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block → <pre> (kept verbatim; rare in rulebook).
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      html.push(`<pre class="verbose-code"><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    // ATX headers → spoken heading.
    const headerMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = verboseInline(headerMatch[2]);
      const slug = slugify(headerMatch[2]);
      // Prepend "Section:" for h2+ to give the listener a verbal cue.
      const spoken = level >= 2 ? `<span class="verbose-heading-cue">Section. </span>${esc(text)}` : esc(text);
      html.push(`<h${level} id="${slug}" class="verbose-heading">${spoken}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule → section break marker.
    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      html.push('<p class="verbose-break" aria-hidden="true">— section break —</p>');
      i++;
      continue;
    }

    // Blockquote → callout prose.
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const prose = verboseInline(quote.join(' '));
      html.push(`<p class="verbose-callout"><span class="verbose-callout-cue">Note. </span>${esc(prose)}</p>`);
      continue;
    }

    // Table → prose sentences. Each row becomes "Column: value" sentences.
    if (/\|/.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      // Lead-in sentence using the header nouns.
      const headerWords = header.map(verboseInline);
      const leadIn = `The ${headerWords.join(', ')} are as follows.`;
      html.push(`<p>${esc(leadIn)}</p>`);
      for (const row of rows) {
        const parts = [];
        for (let c = 0; c < header.length; c++) {
          const h = headerWords[c] || header[c];
          const v = verboseInline(row[c] || '');
          parts.push(`${h}: ${v}`);
        }
        const rowSentence = parts.join('. ') + '.';
        html.push('<p class="verbose-table-row">' + esc(rowSentence) + '</p>');
      }
      continue;
    }

    // Unordered list → prose with "Item:" lead-ins joined by semicolons.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      const spoken = items.map((it, idx) => {
        const lead = idx === 0 ? 'First, ' : (idx === items.length - 1 && items.length > 1 ? 'and finally, ' : '');
        return `${lead}${verboseInline(it)}`;
      });
      html.push(`<p>${esc(spoken.join('; '))}.</p>`);
      continue;
    }

    // Ordered list → prose with ordinal lead-ins.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      const spoken = items.map((it, idx) => {
        const ord = ORDINAL_WORDS[idx] || `Step ${idx + 1}`;
        return `${ord}, ${verboseInline(it)}`;
      });
      html.push(`<p>${esc(spoken.join('; '))}.</p>`);
      continue;
    }

    // Blank line — paragraph break.
    if (line.trim() === '') { i++; continue; }

    // Paragraph: gather contiguous non-block lines.
    const buffer = [];
    while (i < lines.length
      && lines[i].trim() !== ''
      && !/^#{1,6}\s+/.test(lines[i])
      && !/^```/.test(lines[i])
      && !/^>\s?/.test(lines[i])
      && !/^\s*[-*+]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !/^\s*---+\s*$/.test(lines[i])
      && !(/^\s*\|/.test(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      buffer.push(lines[i].trim());
      i++;
    }
    flushParagraph(buffer);
  }

  return html.join('\n');
}

// Render all PARTs as verbose prose sections. Each PART header is
// announced with its spoken ordinal ("Part One: …"). Front matter is
// rendered as a lead-in block.
function renderVerboseParts(mdText) {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = [];
  let partTitle = null;
  let partKey = null;

  const flush = () => {
    if (!current.length) return;
    const body = renderVerboseBlock(current.join('\n'));
    if (partTitle) {
      const slug = slugify(partTitle);
      const theme = partKey ? PART_THEMES[partKey] : null;
      const themeAttr = theme ? ` data-part-theme="${esc(partKey)}" style="--part-accent:${theme.accentColor};--part-accent-rgb:${theme.accentRgb}"` : '';
      const spokenOrd = partKey ? (ROMAN_TO_WORD[partKey] || partKey) : '';
      const spokenTitle = verboseInline(partTitle.replace(/^PART\s+[IVXLCDM]+\s*—\s*/i, ''));
      const header = spokenOrd
        ? `<h1 id="${slug}" class="verbose-part-heading"><span class="verbose-part-cue">Part ${spokenOrd}. </span>${esc(spokenTitle)}</h1>`
        : `<h1 id="${slug}" class="verbose-part-heading">${esc(verboseInline(partTitle))}</h1>`;
      blocks.push(`<section class="verbose-part"${themeAttr}>${header}<div class="verbose-part-body">${body}</div></section>`);
    } else {
      blocks.push(`<div class="verbose-frontmatter">${body}</div>`);
    }
    current = [];
  };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*#*$/);
    if (h1 && /^PART/i.test(h1[1])) {
      flush();
      partTitle = h1[1];
      partKey = extractPartKey(partTitle);
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// READ ALOUD — Web Speech API integration for verbose mode
// ═══════════════════════════════════════════════════════════════

// Speak the text content of the verbose rules container. Returns a
// controller object with pause/resume/stop and boundary tracking so the
// currently-spoken paragraph can be highlighted. `opts.rateGetter` is a
// function called per chunk so live rate changes take effect mid-session.
function startReadAloud(container, opts = {}) {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const rateGetter = opts.rateGetter || (() => 0.95);

  // Collect speakable paragraphs in document order.
  const paras = [...container.querySelectorAll('.verbose-part-body p, .verbose-part-heading, .verbose-frontmatter p')];
  const chunks = paras.map(p => ({ el: p, text: p.textContent.replace(/\s+/g, ' ').trim() }))
    .filter(c => c.text.length > 0);

  let idx = 0;
  let paused = false;
  let stopped = false;
  const onBoundaryCbs = new Set();
  const onDoneCbs = new Set();

  const clearHighlights = () => paras.forEach(p => p.classList.remove('verbose-speaking'));

  const speakNext = () => {
    if (stopped) return;
    if (idx >= chunks.length) {
      clearHighlights();
      onDoneCbs.forEach(cb => { try { cb(); } catch { /* ignore */ } });
      return;
    }
    const chunk = chunks[idx];
    const utter = new window.SpeechSynthesisUtterance(chunk.text);
    utter.rate = rateGetter();
    utter.onstart = () => {
      clearHighlights();
      chunk.el.classList.add('verbose-speaking');
      chunk.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onBoundaryCbs.forEach(cb => { try { cb(idx, chunk); } catch { /* ignore */ } });
    };
    utter.onend = () => {
      chunk.el.classList.remove('verbose-speaking');
      idx++;
      // Queue the next chunk on the next tick to avoid deep recursion.
      setTimeout(speakNext, 0);
    };
    utter.onerror = () => {
      chunk.el.classList.remove('verbose-speaking');
      idx++;
      setTimeout(speakNext, 0);
    };
    synth.speak(utter);
  };

  synth.cancel(); // clear any prior utterance
  speakNext();

  return {
    pause() { if (!paused && !stopped) { synth.pause(); paused = true; } },
    resume() { if (paused && !stopped) { synth.resume(); paused = false; } },
    stop() { stopped = true; synth.cancel(); clearHighlights(); },
    isPaused() { return paused; },
    isStopped() { return stopped; },
    progress() { return { index: idx, total: chunks.length }; },
    onBoundary(cb) { onBoundaryCbs.add(cb); return () => onBoundaryCbs.delete(cb); },
    onDone(cb) { onDoneCbs.add(cb); return () => onDoneCbs.delete(cb); },
  };
}

// Render the full rules page into the container: sticky TOC sidebar +
// scrollable content with collapsible parts. Includes an Illustrated /
// Text toggle (persisted) that re-renders content without a full reload.
export async function renderRulesPage(container) {
  container.innerHTML = `<div class="rules-loading"><span class="loading-spinner" aria-hidden="true"></span><strong>Loading rulebook…</strong><small>Fetching the complete player rulebook</small></div>`;

  let mdText;
  try {
    const response = await fetch('data/rulebook.md');
    if (!response.ok) throw new Error(`${response.status}`);
    mdText = await response.text();
  } catch (error) {
    container.innerHTML = `<div class="notice danger"><strong>Rulebook not found.</strong><p>Could not load data/rulebook.md.</p><pre>${esc(error.message)}</pre></div>`;
    return;
  }

  // Apply the view-mode body class up-front so CSS shows/hides decorations.
  const applyBodyClass = () => {
    document.body.classList.remove('rules-illustrated', 'rules-showcase', 'rules-verbose');
    if (RULES_VIEW_MODE === 'illustrated') document.body.classList.add('rules-illustrated');
    else if (RULES_VIEW_MODE === 'showcase') document.body.classList.add('rules-showcase');
    else if (RULES_VIEW_MODE === 'verbose') document.body.classList.add('rules-verbose');
    // text mode: neither class applied
  };
  applyBodyClass();

  // Read-aloud controller lives in the outer scope so any re-render or
  // navigation can cancel an in-flight speech session.
  let readAloudController = null;
  const stopReadAloud = () => {
    if (readAloudController) { readAloudController.stop(); readAloudController = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const toc = buildToc(mdText);

  // TOC: parts as collapsible groups with nested section links.
  const tocGroups = [];
  let currentPart = null;
  let currentSections = [];
  for (const item of toc) {
    if (item.level === 1) {
      if (currentPart) tocGroups.push({ part: currentPart, sections: currentSections });
      currentPart = item;
      currentSections = [];
    } else if (item.level === 2) {
      currentSections.push(item);
    }
  }
  if (currentPart) tocGroups.push({ part: currentPart, sections: currentSections });

  const tocHtml = tocGroups.map(group => `
    <details class="rules-toc-group" open>
      <summary><a href="#${group.part.slug}">${esc(group.part.text)}</a></summary>
      <ul class="rules-toc-sub">
        ${group.sections.map(s => `<li><a href="#${s.slug}">${esc(s.text)}</a></li>`).join('')}
      </ul>
    </details>`).join('');

  // Inner render: builds the page HTML and wires interactions. Called
  // once on load and again whenever the illustrated toggle changes.
  const render = () => {
    applyBodyClass();
    stopReadAloud();
    const isShowcase = RULES_VIEW_MODE === 'showcase';
    const isVerbose = RULES_VIEW_MODE === 'verbose';
    const contentHtml = isShowcase ? renderShowcaseParts(mdText)
      : isVerbose ? renderVerboseParts(mdText)
      : renderCollapsibleParts(mdText);
    const pressed = (mode) => RULES_VIEW_MODE === mode ? 'true' : 'false';
    const showcasePageClass = isShowcase ? ' rules-showcase-page' : '';
    const verbosePageClass = isVerbose ? ' rules-verbose-page' : '';

    container.innerHTML = `
    <div class="reading-progress" id="rules-reading-progress" aria-hidden="true"></div>
    <div class="rules-toolbar" role="toolbar" aria-label="Rulebook controls">
      <div class="rules-illustrated-toggle" role="group" aria-label="Rules view mode">
        <button type="button" class="rules-toggle-btn" id="rules-toggle-illustrated" aria-pressed="${pressed('illustrated')}">
          <svg class="rules-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17 L9 12 L14 16 L21 11"/></svg>
          Illustrated
        </button>
        <button type="button" class="rules-toggle-btn" id="rules-toggle-text" aria-pressed="${pressed('text')}">
          <svg class="rules-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>
          Text
        </button>
        <button type="button" class="rules-toggle-btn" id="rules-toggle-showcase" aria-pressed="${pressed('showcase')}">
          <svg class="rules-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 L13.5 9 L20 10.5 L13.5 12 L12 18 L10.5 12 L4 10.5 L10.5 9 Z"/><path d="M19 16 L19.7 18.5 L22 19 L19.7 19.5 L19 22 L18.3 19.5 L16 19 L18.3 18.5 Z"/></svg>
          Showcase
        </button>
        <button type="button" class="rules-toggle-btn" id="rules-toggle-verbose" aria-pressed="${pressed('verbose')}">
          <svg class="rules-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 10 V14 H7 L13 19 V5 L7 10 Z"/><path d="M16 8 C18 10 18 14 16 16" fill="none"/><path d="M18.5 5.5 C22 8.5 22 15.5 18.5 18.5" fill="none"/></svg>
          Verbose
        </button>
      </div>
      ${isVerbose ? `<div class="rules-readaloud-bar" role="group" aria-label="Read aloud controls">
        <button type="button" class="rules-readaloud-btn" id="rules-readaloud-play" aria-label="Read aloud">
          <svg class="rules-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 10 V14 H7 L13 19 V5 L7 10 Z"/><path d="M16 8 C18 10 18 14 16 16"/></svg>
          <span class="rules-readaloud-label">Read Aloud</span>
        </button>
        <button type="button" class="rules-readaloud-btn" id="rules-readaloud-pause" aria-label="Pause reading" disabled>
          <svg class="rules-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="7" y="5" width="3" height="14"/><rect x="14" y="5" width="3" height="14"/></svg>
          <span class="rules-readaloud-label">Pause</span>
        </button>
        <button type="button" class="rules-readaloud-btn" id="rules-readaloud-stop" aria-label="Stop reading" disabled>
          <svg class="rules-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="6" y="6" width="12" height="12"/></svg>
          <span class="rules-readaloud-label">Stop</span>
        </button>
        <label class="rules-readaloud-rate">
          <span>Speed</span>
          <input type="range" id="rules-readaloud-rate" min="0.5" max="1.5" step="0.05" value="0.95" aria-label="Reading speed">
        </label>
        <span class="rules-readaloud-status" id="rules-readaloud-status" aria-live="polite"></span>
      </div>` : ''}
    </div>
    <div class="rules-page${showcasePageClass}${verbosePageClass}">
      <aside class="rules-toc" aria-label="Rulebook table of contents">
        <div class="rules-toc-header">
          <p class="eyebrow">CONTENTS</p>
          <h2>Rulebook</h2>
          <p class="rules-toc-meta">v${RULES_VERSION} · 10 parts</p>
        </div>
        <nav class="rules-toc-nav">${tocHtml}</nav>
      </aside>
      <main class="rules-content" id="rules-content">
        ${contentHtml}
      </main>
    </div>${isShowcase ? '<nav class="showcase-mini-nav" id="showcase-mini-nav" aria-label="Showcase part navigation"></nav>' : ''}`;

    wireInteractions(container);
  };

  // Wire TOC smooth-scroll, reading progress, active-section tracking,
  // and the illustrated/text toggle buttons.
  const wireInteractions = (root) => {
    // Smooth-scroll for TOC links (handles both part and section targets).
    root.querySelectorAll('.rules-toc a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // prevent the enclosing <summary> from toggling the TOC group
        const slug = link.getAttribute('href').slice(1);
        const target = root.querySelector(`#${CSS.escape(slug)}`);
        if (target) {
          // Open the enclosing <details> if collapsed.
          const details = target.closest('details.rules-part');
          if (details && !details.open) details.open = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Offset for sticky header if any.
          setTimeout(() => {
            const y = target.getBoundingClientRect().top + window.scrollY - 16;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }, 50);
        }
      });
    });

    // Illustrated / Text / Showcase / Verbose quad-state toggle.
    const btnIllustrated = root.querySelector('#rules-toggle-illustrated');
    const btnText = root.querySelector('#rules-toggle-text');
    const btnShowcase = root.querySelector('#rules-toggle-showcase');
    const btnVerbose = root.querySelector('#rules-toggle-verbose');
    const toggleTo = (mode) => {
      if (mode === RULES_VIEW_MODE) return;
      stopReadAloud();
      RULES_VIEW_MODE = mode;
      RULES_ILLUSTRATED = mode === 'illustrated';
      state.rulesViewMode = mode;
      state.rulesIllustrated = mode === 'illustrated';
      persistSetting('rulesViewMode', mode);
      persistSetting('rulesIllustrated', mode === 'illustrated');
      // Preserve scroll position across re-render.
      const scrollY = window.scrollY;
      render();
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    };
    if (btnIllustrated) btnIllustrated.addEventListener('click', () => toggleTo('illustrated'));
    if (btnText) btnText.addEventListener('click', () => toggleTo('text'));
    if (btnShowcase) btnShowcase.addEventListener('click', () => toggleTo('showcase'));
    if (btnVerbose) btnVerbose.addEventListener('click', () => toggleTo('verbose'));

    // Read Aloud controls (verbose mode only).
    const btnPlay = root.querySelector('#rules-readaloud-play');
    const btnPause = root.querySelector('#rules-readaloud-pause');
    const btnStop = root.querySelector('#rules-readaloud-stop');
    const rateInput = root.querySelector('#rules-readaloud-rate');
    const statusEl = root.querySelector('#rules-readaloud-status');
    if (btnPlay) {
      const updateButtons = () => {
        const active = readAloudController && !readAloudController.isStopped();
        const paused = active && readAloudController.isPaused();
        btnPlay.disabled = active && !paused;
        btnPause.disabled = !active;
        btnStop.disabled = !active;
        if (paused) btnPause.querySelector('.rules-readaloud-label').textContent = 'Resume';
        else btnPause.querySelector('.rules-readaloud-label').textContent = 'Pause';
      };
      btnPlay.addEventListener('click', () => {
        if (readAloudController && readAloudController.isPaused()) {
          readAloudController.resume();
        } else {
          stopReadAloud();
          const content = root.querySelector('#rules-content');
          if (!content || !window.speechSynthesis) {
            if (statusEl) statusEl.textContent = 'Speech not supported in this browser.';
            return;
          }
          readAloudController = startReadAloud(content, {
            rateGetter: () => rateInput ? Number(rateInput.value) : 0.95,
          });
          if (!readAloudController) {
            if (statusEl) statusEl.textContent = 'Speech not supported in this browser.';
            return;
          }
          readAloudController.onDone(() => {
            readAloudController = null;
            updateButtons();
            if (statusEl) statusEl.textContent = 'Finished.';
          });
        }
        updateButtons();
      });
      if (btnPause) btnPause.addEventListener('click', () => {
        if (!readAloudController) return;
        if (readAloudController.isPaused()) readAloudController.resume();
        else readAloudController.pause();
        updateButtons();
      });
      if (btnStop) btnStop.addEventListener('click', () => {
        stopReadAloud();
        updateButtons();
        if (statusEl) statusEl.textContent = '';
      });
      if (rateInput) rateInput.addEventListener('input', () => {
        // Rate applies to the next utterance; live update is unreliable
        // across engines, so we store it for the controller's next chunk.
        if (statusEl) statusEl.textContent = `Speed: ${rateInput.value}× (applies to next sentence)`;
      });
      updateButtons();
    }

    // Showcase floating mini-nav with scroll-spy (built only in showcase mode).
    const miniNav = root.querySelector('#showcase-mini-nav');
    if (miniNav) {
      const partSections = root.querySelectorAll('.showcase-part[id]');
      const dots = [];
      partSections.forEach((sec) => {
        const slug = sec.id;
        const partKey = sec.getAttribute('data-part-theme') || '';
        const theme = PART_THEMES[partKey] || {};
        const label = theme.title || slug;
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'showcase-mini-nav-dot';
        dot.setAttribute('data-target', slug);
        dot.setAttribute('aria-label', label);
        dot.title = label;
        dot.addEventListener('click', () => {
          const target = root.querySelector(`#${CSS.escape(slug)}`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        miniNav.appendChild(dot);
        dots.push({ dot, slug });
      });
      // Scroll-spy for mini-nav dots will be driven by updateProgress below.
      miniNav._dots = dots;
    }

    // Reading progress indicator + TOC active section tracking
    const progressEl = root.querySelector('#rules-reading-progress');
    const tocLinks = root.querySelectorAll('.rules-toc-nav a[href^="#"]');
    const miniNavDots = miniNav ? miniNav._dots : null;
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
      if (progressEl) progressEl.style.width = `${pct}%`;
      // Track active section
      let activeSlug = null;
      for (const link of tocLinks) {
        const slug = link.getAttribute('href').slice(1);
        const el = root.querySelector(`#${CSS.escape(slug)}`);
        if (el && el.getBoundingClientRect().top <= 80) activeSlug = slug;
      }
      tocLinks.forEach(link => {
        const slug = link.getAttribute('href').slice(1);
        link.classList.toggle('active', slug === activeSlug);
      });
      // Scroll-spy for showcase mini-nav dots.
      if (miniNavDots) {
        let activePartSlug = null;
        for (const { slug } of miniNavDots) {
          const el = root.querySelector(`#${CSS.escape(slug)}`);
          if (el && el.getBoundingClientRect().top <= 120) activePartSlug = slug;
        }
        miniNavDots.forEach(({ dot, slug }) => {
          dot.classList.toggle('active', slug === activePartSlug);
        });
      }
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  };

  render();
}
