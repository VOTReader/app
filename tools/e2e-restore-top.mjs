/* e2e-restore-top — restore-anchor-top-of-letter-1: does a position saved at the TOP of a
   letter come back at the top when the header is taller at boot than it was when saved?

   The saved record carries a content anchor: { y: 0, anchorKey: <first paragraph>,
   anchorOff: -(everything above it: the hero, meta) }. The restore prefers the anchor,
   so it lands at anchorTop(boot) + anchorOff(saved). If the header above the first
   paragraph is taller at boot than it was at capture, the reader lands that many px
   DOWN a page they left at the top (one Verifier rehearsal arm read 99 px).

   Serves the committed tree, boots a fresh profile in headless Chrome, opens Volume
   One letter 2 at text size 1.3 (the update walk's profile), scrolls down and back to
   0 so a record WITH an anchor is flushed, confirms that record in IndexedDB, then
   reloads under three arms and reads, per frame from document start, the first
   paragraph's content-top and the scroller's position:

     A  natural boot — the header is whatever a returning profile gets (fonts from
        the worker's cache: font-display swap still paints the fallback first);
     B  fonts held back — the hero's woff2 files are evicted from the worker's core
        cache before the reload and their network fetch delayed 3 s, so the restore
        certainly settles under the fallback face (the "fonts not yet loaded"
        hypothesis pushed to its limit);
     C  the header made 99 px taller for the first 3 s of the document (a boot-only
        style on .hero-title) — the MECHANISM arm: deterministic, direction fixed.

   For each arm: the record found at boot, the header-height series (runs of equal
   first-paragraph top with their time ranges), where the restore landed (scrollTop
   at the instant body.scroll-restoring is removed), and scrollTop at +6 s.
   REPRODUCED when a y = 0 record lands or settles more than 2 px down.

   Exit 0 = no arm reproduced; 1 = reproduced (a FAIL line names the arm and the px);
   2 = not drivable (a precondition). --shots <dir> writes screenshots. */

import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const onlyArms = argv.includes('--arms') ? argv[argv.indexOf('--arms') + 1].split('') : ['A', 'B', 'C'];
const TALLER_PX = 99;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
let fontDelayMs = 0;
function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (!filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); res.end('not found'); return; }
    const send = () => { res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(filePath)); };
    // Arm B: the worker's cache miss for the hero font reaches the network here, late.
    if (fontDelayMs && /\/fonts\/cinzel-decorative-.*\.woff2$/.test(urlPath)) setTimeout(send, fontDelayMs); else send();
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const server = await startServer();
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL ' + m); };
const note = (m) => console.log('  ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exitCode = 0;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=d3d11'] });
console.log(`browser ${await browser.version()}  arms ${onlyArms.join('')}  taller ${TALLER_PX} px`);
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${page.url().split('/').pop()} ${e && e.message ? e.message : 'thrown value: ' + String(e)}`));
  // Boot instruments, installed before any page script of every document.
  await page.evaluateOnNewDocument((tallerPx) => {
    const w = /** @type {any} */ (window);
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;   // about:blank has no storage to read
    w.__e2eArm = sessionStorage.getItem('e2e-arm') || '-';
    // Arm C: a boot-only style — the hero is tallerPx taller until +3 s, like a header
    // whose settled height differs from its first-paint height.
    if (w.__e2eArm === 'C') {
      // At document start there is no <html> yet (the first run of this arm appended to null and
      // took every instrument below down with it): poll for the root, then inject. The style is
      // in place long before the app's first layout (bundles take ~50 ms to arrive).
      const inject = () => {
        try {
          const root = document.head || document.documentElement;
          if (!root) { setTimeout(inject, 0); return; }
          const s = document.createElement('style'); s.id = 'e2e-tall'; s.textContent = `.hero-title{padding-top:${tallerPx}px}`;
          root.appendChild(s); w.__e2eTallInjectedAt = Math.round(performance.now());
          setTimeout(() => { const el = document.getElementById('e2e-tall'); if (el) el.remove(); w.__e2eTallRemovedAt = Math.round(performance.now()); }, 3000);
        } catch (e) { w.__e2eTallErr = String(e && e.message || e); }
      };
      inject();
    }
    // The saved record as the boot FINDS it (a readonly get at document start, before the
    // app's first readwrite) — never CREATE the database from here.
    w.__e2eBootIdb = { done: false };
    try { indexedDB.databases().then((list) => {
      if (!list.some((d) => d.name === 'votreader')) { w.__e2eBootIdb = { done: true, found: false, note: 'no database yet' }; return; }
      const rq = indexedDB.open('votreader');
      rq.onerror = () => { w.__e2eBootIdb = { done: true, err: 'open failed' }; };
      rq.onsuccess = () => {
        const db = rq.result; db.onversionchange = () => db.close();
        try {
          const g = db.transaction('vot-state', 'readonly').objectStore('vot-state').getAll();
          g.onsuccess = () => {
            const rec = (g.result || []).find((v) => v && typeof v === 'object' && Array.isArray(v.tabs)) || null;
            const i = rec && typeof rec.activeTabIdx === 'number' ? rec.activeTabIdx : 0;
            w.__e2eBootIdb = { done: true, found: !!rec, scrollPositions: rec && rec.tabs[i] && rec.tabs[i].scrollPositions || null };
            db.close();
          };
          g.onerror = () => { w.__e2eBootIdb = { done: true, err: 'getAll failed' }; db.close(); };
        } catch (e) { w.__e2eBootIdb = { done: true, err: String(e && e.message || e) }; db.close(); }
      };
    }).catch((e) => { w.__e2eBootIdb = { done: true, err: String(e && e.message || e) }; }); } catch (e) { w.__e2eBootIdb = { done: true, err: String(e && e.message || e) }; }
    // Where the RESTORE landed: scrollTop at the instant body.scroll-restoring is removed.
    w.__e2eRestoreLanded = null; w.__e2eRestoreEdges = [];
    const scroller = () => document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll');
    try {
      let had = false, last = false;
      new MutationObserver((records) => {
        const b = document.body; if (!b) return;
        if (!records.some((r) => r.target === b)) return;
        const has = b.classList.contains('scroll-restoring');
        if (has === last) return;
        last = has;
        const el = scroller(); const y = el ? Math.round(el.scrollTop) : null;
        w.__e2eRestoreEdges.push({ on: has, y, at: Math.round(performance.now()) });
        if (has) had = true; else if (had && !w.__e2eRestoreLanded) w.__e2eRestoreLanded = { y, at: Math.round(performance.now()) };
      }).observe(document, { attributes: true, attributeFilter: ['class'], subtree: true });
    } catch (e) { w.__e2eObsErr = String(e && e.message || e); }
    // Per-frame: the first paragraph's content-top (the header's height, in effect), the
    // scroller's position, the hero font's status — for 6 s from document start.
    w.__e2eSeries = [];
    const tick = () => {
      const el = scroller();
      const p = el && el.querySelector('[data-hl-key]');
      if (el && p) {
        const cr = el.getBoundingClientRect();
        const top = Math.round(p.getBoundingClientRect().top - cr.top + el.scrollTop);
        const hero = el.querySelector('.hero');
        w.__e2eSeries.push({ t: Math.round(performance.now()), top, st: Math.round(el.scrollTop), hero: hero ? Math.round(hero.getBoundingClientRect().height) : null, font: document.fonts && document.fonts.check('16px "Cinzel Decorative"'), restoring: document.body.classList.contains('scroll-restoring') });
      }
      if (performance.now() < 6000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, TALLER_PX);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) r.respond({ status: 404, body: '' }); // no audio needed here
    else r.continue();
  });
  const booted = () => page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  const click = async (label) => {
    const ok = await page.evaluate((label) => {
      const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\s+/g, ' ').startsWith(label));
      if (b) b.click(); return !!b;
    }, label);
    if (!ok) throw new Error('no control labelled ' + JSON.stringify(label));
    await sleep(500);
  };
  const shot = async (name) => { if (shotsDir) await page.screenshot({ path: resolve(shotsDir, name + '.png') }); };
  const declineTour = async () => {
    const hit = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /^Maybe later$/.test(b.textContent.trim())); if (b) b.click(); return !!b; });
    if (hit) await sleep(400);
    return hit;
  };
  // The app's CSP forbids eval inside the page, so every scroller read is its own evaluate.
  const SCROLLER = '.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll';
  const scrollTo = (y) => page.evaluate((sel, y) => { const el = document.querySelector(sel); if (!el) return null; el.scrollTop = y; el.dispatchEvent(new Event('scroll')); return Math.round(el.scrollTop); }, SCROLLER, y);
  const scrollTopNow = () => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? Math.round(el.scrollTop) : null; }, SCROLLER);

  // ── boot: fresh profile, text size 1.3 (the update walk's profile) ──
  await page.goto(BASE, { waitUntil: 'load' });
  await booted(); await sleep(700);
  await click('Continue'); await click('Begin Reading');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 90000 });
  await page.reload({ waitUntil: 'load' }); await booted(); await sleep(700);
  note(`boot: tour offer ${await declineTour() ? 'declined' : 'not shown'}; controlled`);
  await page.evaluate(() => { const gear = document.querySelector('[aria-label="Settings"]'); const tile = gear || [...document.querySelectorAll('button,[role=button]')].find((b) => /Settings/.test(b.textContent)); if (!tile) throw new Error('no way into Settings'); /** @type {HTMLElement} */ (tile).click(); });
  await sleep(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /Appearance/.test(b.textContent)); if (b) b.click(); });
  await sleep(400);
  const setSlider = await page.evaluate(() => {
    const el = /** @type {HTMLInputElement|null} */ (document.querySelector('input[type=range][aria-label="Text size"]'));
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '1.3');
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (!setSlider) { fail('precondition: no "Text size" slider'); exitCode = 2; throw new Error('precondition'); }
  await sleep(400);
  await click('Back');

  // ── the letter, a record captured at the TOP with an anchor ──
  await click('Prophetic Letters'); await click('Volume One');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][1]; if (b) b.click(); });
  await page.waitForSelector('.hero-title', { timeout: 15000 }); await sleep(1500);
  const title = await page.evaluate(() => (document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll').querySelector('.hero-title') || { textContent: '' }).textContent.trim());
  const settled = await page.evaluate((sel) => { const el = document.querySelector(sel); const p = el.querySelector('[data-hl-key]'); const cr = el.getBoundingClientRect(); const hero = el.querySelector('.hero'); return { firstKey: p && p.getAttribute('data-hl-key'), top: p ? Math.round(p.getBoundingClientRect().top - cr.top + el.scrollTop) : null, hero: hero ? Math.round(hero.getBoundingClientRect().height) : null, font: document.fonts.check('16px "Cinzel Decorative"') }; }, SCROLLER);
  note(`letter ${JSON.stringify(title)} settled: first paragraph ${JSON.stringify(settled.firstKey)} at content-top ${settled.top}, hero ${settled.hero} px, Cinzel Decorative loaded=${settled.font}`);
  await scrollTo(900);
  await sleep(500);
  await scrollTo(0);
  await sleep(400);
  // Wait for the record to reach IndexedDB (the store's own cadence), reading it back the
  // way the boot instrument does: a y = 0 record WITH an anchor is the precondition.
  const readRecord = () => page.evaluate(() => new Promise((res) => {
    const rq = indexedDB.open('votreader');
    rq.onerror = () => res({ err: 'open failed' });
    rq.onsuccess = () => {
      const db = rq.result; db.onversionchange = () => db.close();
      try {
        const g = db.transaction('vot-state', 'readonly').objectStore('vot-state').getAll();
        g.onsuccess = () => { const rec = (g.result || []).find((v) => v && typeof v === 'object' && Array.isArray(v.tabs)) || null; const i = rec && typeof rec.activeTabIdx === 'number' ? rec.activeTabIdx : 0; res({ scrollPositions: rec && rec.tabs[i] && rec.tabs[i].scrollPositions || null }); db.close(); };
        g.onerror = () => { res({ err: 'getAll failed' }); db.close(); };
      } catch (e) { res({ err: String(e && e.message || e) }); db.close(); }
    };
  }));
  const recordFor = (sp) => { if (!sp) return null; const k = Object.keys(sp).find((k) => /chosen-by-god|letter-/.test(k) && sp[k] && typeof sp[k] === 'object' && sp[k].anchorKey); return k ? { key: k, ...sp[k] } : null; };
  let saved = null;
  for (let i = 0; i < 40 && !saved; i++) { const r = await readRecord(); const rec = recordFor(r.scrollPositions); if (rec && rec.y === 0) saved = rec; else await sleep(500); }
  if (!saved) { const r = await readRecord(); fail(`precondition: no y = 0 record with an anchor reached IndexedDB within 20 s: ${JSON.stringify(r).slice(0, 300)}`); exitCode = 2; throw new Error('precondition'); }
  note(`saved record: ${JSON.stringify(saved)}  (anchorOff bakes in the header: ${-saved.anchorOff} px above the first paragraph)`);
  await shot('0-captured');

  // ── the arms ──
  const runs = (series) => {
    const out = []; let cur = null;
    for (const s of series) {
      const sig = `top=${s.top} font=${s.font ? 1 : 0}`;
      if (!cur || cur.sig !== sig) { cur = { sig, from: s.t, to: s.t, n: 1, st0: s.st, st1: s.st }; out.push(cur); } else { cur.to = s.t; cur.n += 1; cur.st1 = s.st; }
    }
    return out.map((r) => `${r.sig} @${r.from}-${r.to}ms(${r.n}f) st ${r.st0}${r.st1 !== r.st0 ? '→' + r.st1 : ''}`).join(' | ');
  };
  const evictHeroFonts = () => page.evaluate(async () => {
    const names = await caches.keys(); let removed = 0;
    for (const n of names) { const c = await caches.open(n); for (const req of await c.keys()) if (/cinzel-decorative-.*\.woff2$/.test(req.url) && await c.delete(req)) removed += 1; }
    return removed;
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  for (const arm of onlyArms) {
    note(`--- arm ${arm}: ${arm === 'A' ? 'natural boot' : arm === 'B' ? `hero fonts evicted from the worker's cache and delayed 3 s on the network` : `the hero ${TALLER_PX} px taller for the first 3 s`}`);
    fontDelayMs = arm === 'B' ? 3000 : 0;
    if (arm === 'B') {
      // Evict the woff2 from the worker's Cache Storage AND bypass the renderer's memory/HTTP cache,
      // or the reload paints Cinzel Decorative from memory and there is no fallback phase at all
      // (the first run of this arm: font loaded at the first sample).
      note(`B evicted ${await evictHeroFonts()} font entries from Cache Storage`);
      await cdp.send('Network.clearBrowserCache');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    } else {
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    }
    await page.evaluate((a) => sessionStorage.setItem('e2e-arm', a), arm);
    // Every arm starts from the same saved record: the reload must not re-flush a moved position.
    const before = await scrollTopNow();
    if (before !== 0) { await scrollTo(0); await sleep(1500); }
    await page.reload({ waitUntil: 'load' });
    await booted();
    await page.waitForFunction(() => window.__e2eBootIdb && window.__e2eBootIdb.done, { timeout: 15000 }).catch(() => null);
    await sleep(6500);
    const r = await page.evaluate(() => ({ arm: window.__e2eArm, boot: window.__e2eBootIdb, landed: window.__e2eRestoreLanded, edges: window.__e2eRestoreEdges || [], series: window.__e2eSeries || [], tallInjectedAt: window.__e2eTallInjectedAt || null, tallRemovedAt: window.__e2eTallRemovedAt || null, tallErr: window.__e2eTallErr || null, obsErr: window.__e2eObsErr || null }));
    if (!r.series.length) note(`${arm}: NO per-frame samples (instrument missing or the paragraph never rendered); tallErr=${r.tallErr} obsErr=${r.obsErr}`);
    const bootRec = recordFor(r.boot && r.boot.scrollPositions);
    const final = await scrollTopNow();
    const fontsNow = await page.evaluate(() => document.fonts.check('16px "Cinzel Decorative"'));
    const tops = [...new Set(r.series.map((s) => s.top))];
    const settledTop = r.series.length ? r.series[r.series.length - 1].top : null;
    const bootTop = r.series.length ? r.series[0].top : null;
    note(`${arm} boot found record ${JSON.stringify(bootRec)}`);
    note(`${arm} header series: ${runs(r.series) || '(no samples: the paragraph never rendered inside 6 s)'}`);
    note(`${arm} first-paragraph top at first sample ${bootTop}, at +6 s ${settledTop} (distinct values ${JSON.stringify(tops)}); hero-font loaded now=${fontsNow}${r.tallInjectedAt != null ? '; C style injected at ' + r.tallInjectedAt + ' ms, removed at ' + r.tallRemovedAt + ' ms' : ''}`);
    note(`${arm} restore edges ${JSON.stringify(r.edges)}; landed ${JSON.stringify(r.landed)}; scrollTop at +6.5 s = ${final}`);
    await shot(`arm-${arm}`);
    if (!bootRec || bootRec.y !== 0) { fail(`${arm}: precondition — the boot did not find the y = 0 record (${JSON.stringify(bootRec)})`); continue; }
    // An arm whose lever did not move says nothing — say so rather than read it as "not reproduced".
    const heroFirst = r.series.length ? r.series[0].hero : null, heroLast = r.series.length ? r.series[r.series.length - 1].hero : null;
    if (arm === 'C' && !(heroFirst != null && heroLast != null && heroFirst - heroLast >= TALLER_PX - 5)) { fail(`C: INSTRUMENT — the boot-only style did not make the hero taller (first sample ${heroFirst}, settled ${heroLast}); arm C says nothing`); exitCode = 2; continue; }
    if (arm === 'B' && r.series.length && r.series[0].font) note('B: the hero font was already loaded at the first sample — the fallback phase was not observed; arm B is a second natural boot');
    const landedY = r.landed ? r.landed.y : null;
    if ((landedY != null && landedY > 2) || final > 2) fail(`${arm} REPRODUCED: a y = 0 record landed at ${landedY} px and sits at ${final} px after 6.5 s (first-paragraph top ${bootTop} at boot vs ${settledTop} settled; saved anchorOff ${saved.anchorOff})`);
    else note(`${arm}: came back at the top (landed ${landedY}, final ${final})`);
  }
  if (errors.length) note(`page errors: ${JSON.stringify(errors)}`); else note('no page errors');
} catch (e) {
  if (exitCode !== 2) { fail('bench could not be driven: ' + (e && e.stack || e)); exitCode = 2; }
} finally {
  await browser.close().catch(() => {});
  server.close();
}
if (failures.length) { console.log(`\n${failures.length} FAIL`); process.exit(exitCode || 1); }
console.log('\nPASS e2e-restore-top — no arm reproduced');
