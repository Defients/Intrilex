// ═══════════════════════════════════════════════════════════════
// workspaces/release-notes.js — /release-notes workspace: changelog
// Fetches data/changelog.md and renders it as release notes.
// Reuses the lightweight markdown renderer from rulebook-renderer.js.
// ═══════════════════════════════════════════════════════════════

import { app as _app, esc } from '../state.js?v=e2bd7e8507fa';
import { renderMarkdown, slugify } from '../rulebook-renderer.js?v=e2bd7e8507fa';
import { LAB_VERSION, ENGINE_VERSION, RULES_VERSION } from '../version.js?v=e2bd7e8507fa';

let _container = _app;

/**
 * Render the release-notes workspace.
 * Fetches data/changelog.md and renders it with a version-summary header.
 * @param {HTMLElement} [container] — target element (defaults to observatory #app)
 */
export async function renderReleaseNotes(container) {
  const c = container || _app;
  _container = c;
  c.innerHTML = `<div class="rules-loading"><span class="loading-spinner" aria-hidden="true"></span><strong>Loading release notes…</strong><small>Fetching the changelog</small></div>`;

  let mdText;
  try {
    const response = await fetch('data/changelog.md');
    if (!response.ok) throw new Error(`${response.status}`);
    mdText = await response.text();
  } catch (error) {
    c.innerHTML = `<div class="notice danger"><strong>Changelog not found.</strong><p>Could not load data/changelog.md.</p><pre>${esc(error.message)}</pre></div>`;
    return;
  }

  // Build a list of version entries (## v… headers) for a quick-nav sidebar.
  const versionEntries = [];
  const lines = mdText.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const m = line.match(/^##\s+(v[\d.]+[^\n]*)$/);
    if (m) versionEntries.push(m[1].trim());
  }

  // Render the markdown. The changelog uses ## for version headers and
  // ### for section headers within each version, so it renders cleanly
  // with the existing renderer.
  const body = renderMarkdown(mdText);

  // Version summary cards at the top.
  const summaryCards = `<div class="release-notes-summary">
    <div class="release-notes-stat"><small>Lab version</small><strong>${esc(LAB_VERSION)}</strong></div>
    <div class="release-notes-stat"><small>Engine</small><strong>${esc(ENGINE_VERSION)}</strong></div>
    <div class="release-notes-stat"><small>Rules</small><strong>${esc(RULES_VERSION)}</strong></div>
    <div class="release-notes-stat"><small>Releases</small><strong>${versionEntries.length}</strong></div>
  </div>`;

  // Quick-nav sidebar listing each version, clickable to scroll.
  const nav = versionEntries.length
    ? `<nav class="release-notes-nav" aria-label="Release navigation">
        <h3>Releases</h3>
        <ul>${versionEntries.map((v) => {
          const slug = slugify(v);
          return `<li><a href="#${slug}" data-version-slug="${slug}">${esc(v)}</a></li>`;
        }).join('')}</ul>
      </nav>`
    : '';

  c.innerHTML = `${summaryCards}
    <div class="release-notes-panel">
      <div class="release-notes-panel-header">
        <h2>Release notes</h2>
        <p>What's new in each version of Intrilex Simulation Lab</p>
      </div>
      <div class="release-notes-body">
        ${nav}
        <div class="release-notes-content">${body}</div>
      </div>
    </div>`;

  // Wire up quick-nav: smooth-scroll to the version header.
  c.querySelectorAll('.release-notes-nav a[data-version-slug]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = link.dataset.versionSlug;
      const target = c.querySelector(`#${CSS.escape(slug)}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Highlight the target briefly.
        target.classList.add('release-notes-highlight');
        setTimeout(() => target.classList.remove('release-notes-highlight'), 2000);
      }
    });
  });
}
