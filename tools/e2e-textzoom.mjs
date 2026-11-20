/**
 * e2e-textzoom — does the layout hold at a large text size with the chrome px-pinned?
 * (a11y-ux-6, the visible half.) Android's Display > Font size now reaches the app
 * through --font-scale only, so the top of Android's slider is --font-scale 2.0 and
 * the Orchestrator's bar is "readable at 180 percent".
 *
 *   node tools/e2e-textzoom.mjs                 # serves its own tree on an ephemeral port
 *   node tools/e2e-textzoom.mjs --shots DIR     # a screenshot per screen and scale
 *
 * At 360x800, for --font-scale 1, 1.8 and 2.0, on the screens a reader meets first
 * (About, Home, Volumes, a volume index, a letter, Gospels, a Bible chapter, Library,
 * My Notes, My Journal, Settings with two groups open, Search), it asserts:
 *   - nothing interactive sits past the right edge (a two-column grid that did not
 *     fold clips its right column under overflow:hidden — unreadable, not scrollable);
 *   - the document does not scroll sideways;
 *   - the top nav is the same height it was at 1.0 (within 8 px — the tabs pill and
 *     the reading dot are rem, and grow a little by design); the Search bar's field
 *     is content chrome and is allowed to grow;
 *   - no two visible controls overlap;
 *   - no page errors.
 * Labels that shorten a little are REPORTED against a committed baseline
 * (tools/e2e-textzoom.baseline.json): a report the baseline does not know FAILS, a known one
 * passes, and a baseline entry that no longer appears is printed so the ledger can shrink.
 * Re-baselining is deliberate: `--write-baseline`, reviewed in the same commit. A label that
 * loses more than a third of its width or height is FAILED outright, whatever its selector.
 */
import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { throughFirstRun } from './first-run.mjs';   // About → Begin Reading → Letter 1 → Home, in one place
import { installFailureReport } from './e2e-walk-lib.mjs';

installFailureReport('e2e-textzoom');

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;

/* The harness serves its own tree on an ephemeral port. A shared fixed port (8097) let
   several preview servers bind at once with allow_reuse_address, and a green here could be
   about another worktree's build — proven on e2e:read, 2026-09-04. Nothing needs starting. */
const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (!filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}
const server = await startServer();
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const SCALES = [1, 1.8, 2.0];
const NAV_TOLERANCE = 8;
const BASELINE = resolve(HERE, 'e2e-textzoom.baseline.json');
const writeBaseline = argv.includes('--write-baseline');
const known = existsSync(BASELINE) ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8'))) : new Set();
const reported = new Set();

const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const navAt1 = {};
try {
  for (const scale of SCALES) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on('request', (r) => { if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) r.respond({ status: 404, body: '' }); else r.continue(); });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
    await sleep(700);
    // The app sets the root class vot-large-text with the scale from 1.8 up (use-settings LARGE_TEXT_SCALE); so does the walk.
    const setScale = () => page.evaluate((s) => { document.documentElement.style.setProperty('--font-scale', String(s)); document.documentElement.classList.toggle('vot-large-text', s >= 1.8); }, scale);
    await setScale();
    const click = async (l) => { await page.evaluate((l) => { const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim().replace(/\s+/g, ' ')).startsWith(l) && b.getBoundingClientRect().width > 0); if (b) b.click(); }, l); await sleep(600); await setScale(); await sleep(150); };
    // The three-tab layout (Read, Listen, Library; Settings is the gear): a tab by its label, else the reader's Home.
    const tab = async (l) => { const hit = await page.evaluate((l) => { const t = [...document.querySelectorAll('.tabbar-tab')].find((b) => b.textContent.trim() === l); if (t) t.click(); return !!t; }, l); if (!hit && l === 'Read') await click('Home'); else { await sleep(600); await setScale(); await sleep(150); } };
    const libTile = async (id) => { await page.evaluate((id) => { const t = [...document.querySelectorAll('.lib-row')].find((r) => r.querySelector('.ui-row-title').textContent.toLowerCase() === id); t && t.click(); }, id); await sleep(700); await setScale(); };
    const measure = (name) => page.evaluate((name) => {
      const vw = window.innerWidth;
      const nav = document.querySelector('.top-nav');
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < window.innerHeight; };
      const label = (e) => (e.getAttribute('aria-label') || e.textContent.trim().replace(/\s+/g, ' ')).slice(0, 26);
      const els = [...document.querySelectorAll('button,[role=button],a,input,select,textarea')].filter(vis);
      // A control inside a sideways strip (a book's chapter-number strip) passes the edge by design: it scrolls into view.
      // A strip is a box laid out as one line (flex without wrap, or nowrap text) that scrolls sideways and not
      // down. overflow-x alone is not enough: a box with only overflow-y: auto computes overflow-x to auto too
      // (27 sheets, panels and lists), and those stay checked. The six strips in app.css are all one-line boxes.
      const inScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (!/auto|scroll/.test(cs.overflowX)) continue; const oneLine = (/flex/.test(cs.display) && cs.flexWrap === 'nowrap') || cs.whiteSpace === 'nowrap'; if (oneLine && p.scrollWidth > p.clientWidth + 1 && p.scrollHeight <= p.clientHeight + 1) return true; } return false; };
      const offRight = els.filter((e) => e.getBoundingClientRect().right > vw + 1 && !inScroller(e)).map((e) => `${label(e)} right=${Math.round(e.getBoundingClientRect().right)}`);
      // Any leaf that shortens its text (ellipsis or a line clamp), or a box whose children are all inline (a row's
      // meta line holding a minutes chip: '2% read · ~3 min l…' at 2.0 hid there, 11-15): reported when it loses a little,
      // FAILED when it loses more than a third of its width or height — that is a label that stopped
      // doing its job, whatever the selector ("Matthew" rendering as "M a…" at 1.8 was one).
      const inlineOnly = (e) => [...e.children].every((c) => getComputedStyle(c).display.startsWith('inline'));
      const clipped = [...document.querySelectorAll('*')].filter((e) => { if (!vis(e) || (e.children.length && !inlineOnly(e))) return false; const cs = getComputedStyle(e); return (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 1); });
      const ellipsed = clipped.map((e) => e.textContent.trim().slice(0, 30));
      // Width: a label that cannot show two thirds of itself has stopped doing its job. Height: a
      // line clamp is a design choice for long titles, so it fails only when the column is under
      // 4em — narrower than a word — which is the crush, not the clamp.
      const crushed = clipped.filter((e) => e.scrollWidth > e.clientWidth * 1.5 || (e.scrollHeight > e.clientHeight * 1.5 && e.clientWidth < 4 * parseFloat(getComputedStyle(e).fontSize))).map((e) => `${e.textContent.trim().slice(0, 24)} ${e.clientWidth}x${e.clientHeight} of ${e.scrollWidth}x${e.scrollHeight}`);
      const boxes = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        // The tab bar is fixed over the page's foot and the page scrolls under it (its end padding lets the last row
        // clear it), so a row passing beneath the bar is not two controls overlapping. Everything else still counts.
        // The top bar is the same at the head (POL3: volume-index at 1.8 opens scrolled to the reader's letter, and Play
        // All sits half under the bar): a page control counts against a bar control only where the page one shows, so
        // what is covered at the middle of the overlap must not be the bar.
        // At the tab bar only a row of the scrolling page passes: a fixed control (the audio bar, a FAB, a toast, the
        // find pill) over or under a tab is two controls overlapping wherever it is drawn.
        const barOf = (e) => e.closest('.tabbar, .top-nav');
        if (!!barOf(a.e) !== !!barOf(b.e)) {
          const bar = barOf(a.e) || barOf(b.e);
          const other = bar.contains(a.e) ? b.e : a.e;
          if (bar.classList.contains('tabbar') && !other.closest('.screen-scroll')) {
            const ix0 = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy0 = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (ix0 > 6 && iy0 > 6) overlaps.push(`${label(a.e)} × ${label(b.e)}`);
            continue;
          }
          const top = document.elementFromPoint((Math.max(a.r.left, b.r.left) + Math.min(a.r.right, b.r.right)) / 2, (Math.max(a.r.top, b.r.top) + Math.min(a.r.bottom, b.r.bottom)) / 2);
          if (top && bar.contains(top)) continue;
        }
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 6 && iy > 6) overlaps.push(`${label(a.e)} × ${label(b.e)}`);
      }
      return { screen: name, title: document.title, nav: nav ? Math.round(nav.getBoundingClientRect().height * 10) / 10 : null, overflowX: document.documentElement.scrollWidth - vw, offRight, ellipsed, crushed, overlaps };
    }, name);
    const stop = async (name) => {
      await setScale(); await sleep(200);
      const m = await measure(name);
      console.log(`${String(scale).padEnd(4)} ${name.padEnd(13)} nav=${m.nav} offRight=${m.offRight.length} overflowX=${m.overflowX} ellipsed=${m.ellipsed.length} overlaps=${m.overlaps.length}${m.ellipsed.length ? '  (' + m.ellipsed.slice(0, 3).join(' | ') + ')' : ''}`);
      if (scale === 1) navAt1[name] = m.nav;
      else if (m.nav != null && navAt1[name] != null && name !== 'search' && Math.abs(m.nav - navAt1[name]) > NAV_TOLERANCE) fail(`${scale} ${name}: the nav moved ${navAt1[name]} → ${m.nav} px`);
      if (m.offRight.length) fail(`${scale} ${name}: past the right edge: ${m.offRight.join(', ')}`);
      if (m.overflowX > 0) fail(`${scale} ${name}: the page scrolls sideways by ${m.overflowX} px`);
      if (m.overlaps.length) fail(`${scale} ${name}: overlapping controls: ${m.overlaps.join(', ')}`);
      if (m.crushed.length) fail(`${scale} ${name}: text crushed past a third: ${m.crushed.join(', ')}`);
      for (const t of m.ellipsed) reported.add(`${scale}|${name}|${t}`);
      if (shotsDir) await page.screenshot({ path: resolve(shotsDir, `${String(scale).replace('.', '_')}-${name}.png`) });
    };

    await stop('about');
    await throughFirstRun(page);
    await stop('home');
    await click('Prophetic Letters'); await stop('volumes');
    await click('Volume One'); await stop('volume-index');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.ui-group .sty-row')][1]; b && b.click(); }); await sleep(900); await setScale();
    await stop('letter');
    await tab('Read'); await click('The Holy Bible'); await stop('scriptures');
    await click('Gospels'); await stop('gospels');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.ui-group .sty-row')][0]; b && b.click(); }); await sleep(600); await setScale();
    await page.evaluate(() => { const b = [...document.querySelectorAll('.ui-group .sty-row')][0]; b && b.click(); }); await sleep(900); await setScale();
    await stop('bible-chapter');
    // Back to the book's contents with a chapter part read, so its Next card ('Continue', 'Chapter 1 · N% read · ~M min
    // left', the longest meta a contents row carries) is measured too: at 2.0 on 360 it was cut, 11-15.
    // The progress is seeded through the app's own store under the chapter's own track key (the live tracker's dwell
    // timing made it land at some scales and not others): 3 of 10 parts read, the state that prints that meta.
    await page.evaluate(() => { const m = window.__readTrackerMeta; if (m && m.key && typeof ReadingStatsStore !== 'undefined') ReadingStatsStore.recordProgress(m.key, 10, [0, 1, 2]); }); await sleep(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label^="Back to"]')].filter((x) => x.checkVisibility()).pop(); b && b.click(); }); await sleep(900); await setScale();
    await page.evaluate(() => { const e = [...document.querySelectorAll('.screen-scroll')].filter((x) => x.checkVisibility()).pop(); if (e) e.scrollTop = 0; }); await sleep(300);
    const nextCard = await page.evaluate(() => { const n = document.querySelector('.sty-next'); return n ? n.textContent : ''; });
    if (!/% read/.test(nextCard)) fail(`${scale} bible-next: no Next card with progress after reading part of a chapter (${nextCard || 'none'})`);
    await stop('bible-next');
    await tab('Read'); await tab('Library'); await stop('library');
    await libTile('notes');
    await stop('notes-index');
    await click('Back'); await libTile('journal');
    await stop('journal');
    await tab('Read'); await click('Quick settings'); await click('Settings'); await sleep(300);   // GEAR1: the gear opens Quick settings
    await page.evaluate(() => { for (const h of document.querySelectorAll('.settings-group-head')) if (/Appearance|Your Data/.test(h.textContent)) h.click(); }); await sleep(500); await setScale();
    await stop('settings');
    await click('Search'); await stop('search');
    if (errors.length) fail(`${scale}: page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
// The soft set is a ledger, not a scroll-away: new entries fail, cleared entries are named.
const fresh = [...reported].filter((k) => !known.has(k)).sort();
const cleared = [...known].filter((k) => !reported.has(k)).sort();
if (writeBaseline) { writeFileSync(BASELINE, JSON.stringify([...reported].sort(), null, 2) + '\n'); console.log(`baseline written: ${reported.size} known reports -> ${BASELINE}`); }
else {
  if (cleared.length) console.log(`cleared since the baseline (remove them from ${BASELINE}):\n  ` + cleared.join('\n  '));
  if (fresh.length) fail(`${fresh.length} shortened label(s) the baseline does not know (review, then --write-baseline in the same commit):\n  ` + fresh.join('\n  '));
}
if (failures.length) { console.log(`\n${failures.length} FAILED`); process.exit(1); }
console.log('\ne2e-textzoom PASS');
