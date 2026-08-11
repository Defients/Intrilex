// ═══════════════════════════════════════════════════════════════
// rulebook-renderer.js — lightweight markdown renderer + rules page
// Vanilla JS only. Handles the markdown subset used by the rulebook:
// ATX headers, pipe tables, ordered/unordered lists, bold/italic,
// inline code, fenced code blocks, blockquotes, horizontal rules,
// and paragraphs. Also builds a TOC and wraps # PART sections in
// collapsible <details> elements.
// ═══════════════════════════════════════════════════════════════

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

import { RULES_VERSION } from './version.js';

// Inline formatting: bold, italic, inline code. Order matters — code first
// so its contents are not formatted, then bold (longer **), then italic (*).
function renderInline(text) {
  // Protect inline code spans first by extracting placeholders.
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\uE000CODE${codeSpans.length - 1}\uE000`;
  });
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

// Wrap each # PART section (and the leading front matter before the
// first PART) in a collapsible <details> element. PART sections default
// open; front matter is left as a plain block.
function renderCollapsibleParts(mdText) {
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let current = [];
  let partTitle = null;

  const flush = (open) => {
    if (!current.length) return;
    const body = renderMarkdown(current.join('\n'));
    if (partTitle) {
      const slug = slugify(partTitle);
      blocks.push(`<details class="rules-part" ${open ? 'open' : ''}><summary class="rules-part-summary">${esc(partTitle)}</summary><div class="rules-part-body" id="${slug}">${body}</div></details>`);
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

// Render the full rules page into the container: sticky TOC sidebar +
// scrollable content with collapsible parts.
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

  const toc = buildToc(mdText);
  const parts = toc.filter(item => item.level === 1);
  const sections = toc.filter(item => item.level === 2);

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

  const contentHtml = renderCollapsibleParts(mdText);

  container.innerHTML = `
    <div class="reading-progress" id="rules-reading-progress" aria-hidden="true"></div>
    <div class="rules-page">
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
    </div>`;

  // Smooth-scroll for TOC links (handles both part and section targets).
  container.querySelectorAll('.rules-toc a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // prevent the enclosing <summary> from toggling the TOC group
      const slug = link.getAttribute('href').slice(1);
      const target = container.querySelector(`#${CSS.escape(slug)}`);
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

  // Reading progress indicator + TOC active section tracking
  const progressEl = container.querySelector('#rules-reading-progress');
  const tocLinks = container.querySelectorAll('.rules-toc-nav a[href^="#"]');
  const updateProgress = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    if (progressEl) progressEl.style.width = `${pct}%`;
    // Track active section
    let activeSlug = null;
    for (const link of tocLinks) {
      const slug = link.getAttribute('href').slice(1);
      const el = container.querySelector(`#${CSS.escape(slug)}`);
      if (el && el.getBoundingClientRect().top <= 80) activeSlug = slug;
    }
    tocLinks.forEach(link => {
      const slug = link.getAttribute('href').slice(1);
      link.classList.toggle('active', slug === activeSlug);
    });
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}
