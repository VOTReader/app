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
 * Labels that shorten a little are REPORTED; a label that loses more than a third of its
 * width or height is FAILED, whatever its selector — a general property, not a list.
 */
import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

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
    const setScale = () => page.evaluate((s) => { document.documentElement.style.setProperty('--font-scale', String(s)); }, scale);
    await setScale();
    const click = async (l) => { await page.evaluate((l) => { const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim().replace(/\s+/g, ' ')).startsWith(l) && b.getBoundingClientRect().width > 0); if (b) b.click(); }, l); await sleep(600); await setScale(); await sleep(150); };
    const measure = (name) => page.evaluate((name) => {
      const vw = window.innerWidth;
      const nav = document.querySelector('.top-nav');
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < window.innerHeight; };
      const label = (e) => (e.getAttribute('aria-label') || e.textContent.trim().replace(/\s+/g, ' ')).slice(0, 26);
      const els = [...document.querySelectorAll('button,[role=button],a,input,select,textarea')].filter(vis);
      const offRight = els.filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => `${label(e)} right=${Math.round(e.getBoundingClientRect().right)}`);
      // Any leaf that shortens its text (ellipsis or a line clamp): reported when it loses a little,
      // FAILED when it loses more than a third of its width or height — that is a label that stopped
      // doing its job, whatever the selector ("Matthew" rendering as "M a…" at 1.8 was one).
      const clipped = [...document.querySelectorAll('*')].filter((e) => { if (!vis(e) || e.children.length) return false; const cs = getComputedStyle(e); return (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 1); });
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
      if (shotsDir) await page.screenshot({ path: resolve(shotsDir, `${String(scale).replace('.', '_')}-${name}.png`) });
    };

    await stop('about');
    await click('Continue'); await click('Begin Reading');
    await stop('home');
    await click('Prophetic Letters'); await stop('volumes');
    await click('Volume One'); await stop('volume-index');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][1]; b && b.click(); }); await sleep(900); await setScale();
    await stop('letter');
    await click('Home'); await click('The Holy Bible'); await stop('scriptures');
    await click('Gospels'); await stop('gospels');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][0]; b && b.click(); }); await sleep(600); await setScale();
    await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][0]; b && b.click(); }); await sleep(900); await setScale();
    await stop('bible-chapter');
    await click('Home'); await click('Personal Study'); await stop('library');
    await page.evaluate(() => { const t = [...document.querySelectorAll('.library-tile')].find((t) => /My Notes/.test(t.textContent)); t && t.click(); }); await sleep(700); await setScale();
    await stop('notes-index');
    await click('Back'); await page.evaluate(() => { const t = [...document.querySelectorAll('.library-tile')].find((t) => /My Journal/.test(t.textContent)); t && t.click(); }); await sleep(700); await setScale();
    await stop('journal');
    await click('Home'); await click('App Configuration'); await sleep(300);
    await page.evaluate(() => { for (const h of document.querySelectorAll('.settings-group-head')) if (/Appearance|Your Data/.test(h.textContent)) h.click(); }); await sleep(500); await setScale();
    await stop('settings');
    await click('Search'); await stop('search');
    if (errors.length) fail(`${scale}: page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
if (failures.length) { console.log(`\n${failures.length} FAILED`); process.exit(1); }
console.log('\ne2e-textzoom PASS');
