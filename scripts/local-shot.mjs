// Temporary local screenshot harness — validates homepage geometry.
// Not part of the test suite; delete or keep ignored.
/* eslint-disable no-undef -- page.evaluate callbacks run in browser context */
import { chromium } from '../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/index.mjs';

const sizes = [
  [1920, 1080], [1600, 900], [1440, 900], [1280, 800], [1024, 800], [430, 932],
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => errors.push('nav: ' + e.message));
  await page.waitForTimeout(2200);
  const m = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
    scrollW: document.documentElement.scrollWidth,
    pulseHidden: document.querySelector('.home-pulse')?.hidden,
    pulseMetrics: document.querySelectorAll('.home-metric').length,
    panels: [...document.querySelectorAll('.home-panel')].map(p => p.className.replace('home-panel home-', '')).join(','),
    newsItems: document.querySelectorAll('.home-news-item').length,
    exploreItems: document.querySelectorAll('.home-explore-item').length,
    heroH: Math.round(document.querySelector('.home-hero')?.getBoundingClientRect().height ?? -1),
    topbarH: Math.round(document.querySelector('.home-topbar')?.getBoundingClientRect().height ?? -1),
    fanW: Math.round(document.querySelector('.home-card-fan')?.getBoundingClientRect().width ?? -1),
    fanCardTop: Math.round(document.querySelector('.home-fan-card.c3')?.getBoundingClientRect().top ?? -1),
    topbarBottom: Math.round(document.querySelector('.home-topbar')?.getBoundingClientRect().bottom ?? -1),
    gridH: Math.round(document.querySelector('.home-grid')?.getBoundingClientRect().height ?? -1),
    footerTop: Math.round(document.querySelector('.landing-footer')?.getBoundingClientRect().top ?? -1),
    modeBtnH: Math.round(document.querySelector('.home-mode-btn')?.getBoundingClientRect().height ?? -1),
  }));
  console.log(`${w}x${h}`, JSON.stringify(m));
  if (errors.length) console.log(`  ERRORS: ${errors.slice(0, 5).join(' | ')}`);
  await page.screenshot({ path: `reports/local/home-${w}x${h}.png` });
  await page.close();
}

// Pulse-preview: inject live metrics to see the strip rendered.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const pulse = document.querySelector('.home-pulse');
    const host = pulse?.querySelector('[data-home-pulse-metrics]');
    if (!pulse || !host) return;
    host.innerHTML = [
      ['ONLINE', '128'], ['DUELS', '31'], ['TODAY', '842'],
      ['TOP RATING', '1847'], ['AVG QUEUE', '0:18'],
    ].map(([l, v]) => `<span class="home-metric"><b>${v}</b><i>${l}</i></span>`).join('');
    pulse.hidden = false;
  });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    pulseH: Math.round(document.querySelector('.home-pulse')?.getBoundingClientRect().height ?? -1),
    heroH: Math.round(document.querySelector('.home-hero')?.getBoundingClientRect().height ?? -1),
  }));
  console.log('pulse-preview', JSON.stringify(m));
  await page.screenshot({ path: 'reports/local/home-pulse-preview.png' });
  await page.close();
}

// Drawer check at <=1100: open the nav toggle and confirm drawer position.
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
  await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.click('.home-nav-toggle').catch(e => console.log('drawer click fail:', e.message));
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const d = document.querySelector('.home-nav-drawer');
    const r = d?.getBoundingClientRect();
    const links = d ? [...d.querySelectorAll('a')].map(a => a.textContent.trim()) : [];
    return { drawerOpen: !!d && getComputedStyle(d).display !== 'none' && !d.hidden, top: Math.round(r?.top ?? -1), links };
  });
  console.log('drawer', JSON.stringify(m));
  await page.screenshot({ path: 'reports/local/home-drawer-1024.png' });
  await page.close();
}
await browser.close();
console.log('done');
