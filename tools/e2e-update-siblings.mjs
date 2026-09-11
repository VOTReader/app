#!/usr/bin/env node
/* e2e-update-siblings — every document an update reloads shows the update toast
 * (w-toast-reload-flag, 2026-09-11).
 *
 *   node tools/e2e-update-siblings.mjs [--attempts N] [--shots DIR]
 *
 * The live 90 → 91 crossing (the Verifier's E1, four profiles): the reloaded document read
 * the OLD build in `vot-last-seen-build` before any of its scripts ran, and the NEW build
 * 540 ms later with no write of its own — another document of the origin had crossed first
 * and advanced the key, so this one took 'same' and stayed silent. The key is a PROFILE
 * fact; "this document was just reloaded for an update" is a DOCUMENT fact, and the toast
 * belongs to the document. Two REDs, one mechanism (no timeout anywhere):
 *
 *   RED 1  SIBLINGS. Two top-level documents of the origin on one profile, both controlled
 *          by worker A; a new worker B is deployed; both reload (the app's own
 *          controllerchange handler). BOTH must show "VOTReader was just updated.".
 *          Today one of them reads the key the other just wrote and takes 'same'.
 *   RED 2  EARLY CLAIM. B claims a document between its start and the moment sw-register
 *          listens (the page's own scripts are still parsing), so the controllerchange that
 *          announced the takeover had nobody to hear it: the page keeps running the OLD build
 *          under the NEW worker and its announcer, asking B, toasts on stale code. It must
 *          reload and its reloaded document must toast. Today neither. OFF BY DEFAULT
 *          (--attempts N turns it on): the window is a race the bench has not yet produced.
 *          CPU-throttling the third page 20x while a sibling triggers the update was tried
 *          (4 attempts, 2026-09-11): the claim's controllerchange was delivered 12-32 s after
 *          document start, AFTER bundle-b, because throttling delays the event's delivery
 *          behind the page's own long tasks as much as it delays the parse — the method cannot
 *          open the window. Each attempt is CLASSIFIED from a per-document instrument (a
 *          controllerchange seen before bundle-b evaluated) and a missed window is reported as
 *          missed, never as passed. The early-claim reload itself is pinned by
 *          sw-register.test.js and guarded here by the anti-loop control below.
 *
 * Controls, each named in the output: the fresh profile's boots show no toast; a plain
 * controlled boot's controller is the one captured at document start (the fix's early-claim
 * compare must read EQUAL there, or every boot would reload — the anti-loop control); one
 * document load per page per takeover.
 *
 * Serves the committed tree itself (real service worker, real caches, `Cache-Control:
 * no-store`); a deploy is service-worker.js served with CACHE_VERSION suffixed, exactly how a
 * real deploy differs from the worker a reader already has. Document loads are counted from
 * `domcontentloaded`, never `framenavigated` (the app's history.pushState fires that on every
 * screen change — Verifier, 2026-09-11). */
import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const ATTEMPTS = argv.includes('--attempts') ? Number(argv[argv.indexOf('--attempts') + 1]) : 0;
const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const TOAST = /just updated/i;

let swBump = '';
const served = { base: null, now: null };
function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (!filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); res.end('not found'); return; }
    let body = readFileSync(filePath);
    if (urlPath === '/service-worker.js') {
      const text = body.toString('utf8');
      const m = /CACHE_VERSION = '([^']+)'/.exec(text);
      if (m) {
        served.base = m[1];
        served.now = swBump ? m[1] + '-' + swBump : m[1];
        if (swBump) body = Buffer.from(text.replace(m[0], `CACHE_VERSION = '${served.now}'`), 'utf8');
      }
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
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

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
console.log(`browser ${await browser.version()}`);
try {
  const ctx = await browser.createBrowserContext();
  const errors = [];
  let docSeq = 0;
  /** A page with the per-document instrument and a document-load counter. */
  const openPage = async (name) => {
    const page = await ctx.newPage();
    page.loads = 0;
    page.docs = [];                                     // per-document events, from the instrument
    page.name = name;
    page.on('domcontentloaded', () => { page.loads++; });
    page.on('pageerror', (e) => errors.push(`${name} ${e && e.message ? e.message : String(e)}`));
    await page.exposeFunction('__benchLog', (ev) => { page.docs.push(ev); });
    // Installed before any script of EVERY document of this page: the controller at document
    // start, every controllerchange with whether bundle-b had evaluated by then
    // (update-toast.js publishes window.__votUpdateToastResume at module evaluation, the
    // same tick sw-register registers), and the update toast's first appearance.
    await page.evaluateOnNewDocument((seq) => {
      const w = /** @type {any} */ (window);
      const doc = { id: seq + ':' + Math.random().toString(36).slice(2, 7), t0: Date.now() };
      w.__benchDoc = doc;
      let ctrl0 = null;
      try { ctrl0 = (navigator.serviceWorker && navigator.serviceWorker.controller) || null; } catch (_e) { ctrl0 = null; }
      w.__benchCtrl0 = ctrl0;
      const log = (ev) => { try { w.__benchLog({ doc: doc.id, at: Date.now() - doc.t0, ...ev }); } catch (_e) { /* page gone */ } };
      log({ ev: 'start', controlled: !!ctrl0 });
      try {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          log({ ev: 'controllerchange', bundleB: typeof w.__votUpdateToastResume === 'function', tookOver: !!w.__votSwTookOver });
        });
      } catch (_e) { /* no serviceWorker */ }
      const seen = new Set();
      const iv = setInterval(() => {
        const e = document.getElementById('vot-toast-updated');
        if (e && e.classList.contains('show') && !seen.has(e.textContent)) { seen.add(e.textContent); log({ ev: 'toast', text: (e.textContent || '').trim() }); }
      }, 50);
      window.addEventListener('pagehide', () => clearInterval(iv));
    }, ++docSeq);
    return page;
  };
  const booted = (page) => page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  const toastNow = (page) => page.evaluate(() => { const e = document.querySelector('#vot-toast-updated'); return e && e.classList.contains('show') ? (e.textContent || '').trim() : null; });
  const waitToast = async (page, ms) => {
    const ok = await page.waitForFunction(() => { const e = document.querySelector('#vot-toast-updated'); return !!(e && e.classList.contains('show')); }, { timeout: ms }).then(() => true, () => false);
    if (ok) return toastNow(page);
    // The plain toast lasts 4 s: if it came and went before this read, the instrument saw it.
    const docId = await page.evaluate(() => (window.__benchDoc || {}).id || null).catch(() => null);
    const rec = docId ? page.docs.filter((d) => d.doc === docId && d.ev === 'toast').pop() : null;
    return rec ? rec.text : null;
  };
  const controlled = (page) => page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
  const lastSeen = (page) => page.evaluate(() => { try { return localStorage.getItem('vot-last-seen-build'); } catch (_e) { return 'err'; } });
  const triggerUpdate = (page) => page.evaluate(() => { navigator.serviceWorker.getRegistration().then((r) => r && r.update()); });
  const shot = async (page, name) => { if (shotsDir) await page.screenshot({ path: resolve(shotsDir, `${name}.png`) }).catch(() => {}); };

  // ── boots 1 and 2 on a fresh profile: page 1 becomes a CONTROLLED document of worker A ──
  const P1 = await openPage('P1');
  await P1.goto(BASE, { waitUntil: 'load' }); await booted(P1);
  await P1.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 30000 }).catch(() => {});
  await sleep(600);
  const t1 = await toastNow(P1);
  if (t1 !== null) fail(`boot 1 (fresh, uncontrolled) shows an update toast ${JSON.stringify(t1)}`);
  await P1.reload({ waitUntil: 'load' }); await booted(P1); await sleep(1200);
  const t2 = await toastNow(P1);
  if (t2 !== null) fail(`boot 2 (first controlled boot) shows an update toast ${JSON.stringify(t2)}`);
  if (!(await controlled(P1))) fail('boot 2 is not controlled — the bench cannot proceed');
  const key0 = await lastSeen(P1);
  note(`boots 1 and 2: no update toast on the fresh profile; worker ${served.base}; key ${JSON.stringify(key0)}`);
  // ANTI-LOOP CONTROL (the fix's early-claim compare): on a plain controlled boot the controller
  // captured inline at document start must be the SAME object as the one at registration.
  const same = await P1.evaluate(() => ({ has: '__votController0' in window, same: window.__votController0 === navigator.serviceWorker.controller, bench: window.__benchCtrl0 === navigator.serviceWorker.controller }));
  if (!same.bench) fail('control: navigator.serviceWorker.controller is not identity-stable across a document (bench capture) — an identity compare cannot be used');
  if (same.has && !same.same) fail('control: the app\'s inline capture differs from the controller at registration on a PLAIN boot — the early-claim compare would reload every boot');
  note(`control: controller identity stable across the document: bench ${same.bench}; app capture ${same.has ? (same.same ? 'EQUAL' : 'DIFFERENT') : 'absent on this tree'}`);
  const loadsBefore = P1.loads;
  await sleep(2500);
  if (P1.loads !== loadsBefore) fail(`control: page 1 loaded ${P1.loads - loadsBefore} more document(s) while idle — a reload loop`);

  // ── a SIBLING document of the origin, controlled by the same worker ──
  const P2 = await openPage('P2');
  await P2.goto(BASE, { waitUntil: 'load' }); await booted(P2); await sleep(1200);
  const t3 = await toastNow(P2);
  if (t3 !== null) fail(`the sibling's boot on the same build shows an update toast ${JSON.stringify(t3)}`);
  if (!(await controlled(P2))) fail('the sibling is not controlled');

  // ── RED 1: deploy B; both documents reload; BOTH must toast ──
  console.log('RED 1 — siblings: two controlled documents, one deploy');
  swBump = 'sib' + Date.now().toString(36);
  const l1 = P1.loads, l2 = P2.loads;
  const nav1 = P1.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).then(() => true, () => false);
  const nav2 = P2.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).then(() => true, () => false);
  const tD = Date.now();
  await triggerUpdate(P1);
  const [r1, r2] = await Promise.all([nav1, nav2]);
  note(`deploy ${served.base} -> ${served.now}: page 1 reloaded ${r1 ? Date.now() - tD + ' ms' : 'NEVER'}, page 2 reloaded ${r2 ? 'yes' : 'NEVER'}`);
  if (!r1) fail('RED 1: page 1 did not reload on the takeover');
  if (!r2) fail('RED 1: page 2 (the sibling) did not reload on the takeover');
  await Promise.all([booted(P1).catch(() => {}), booted(P2).catch(() => {})]);
  const [toast1, toast2] = await Promise.all([waitToast(P1, 8000), waitToast(P2, 8000)]);
  await shot(P1, 'red1-page1'); await shot(P2, 'red1-page2');
  note(`page 1 toast ${JSON.stringify(toast1)}; page 2 toast ${JSON.stringify(toast2)}; key now ${JSON.stringify(await lastSeen(P1))}`);
  if (!TOAST.test(toast1 || '')) fail(`RED 1: page 1 shows no update toast after its reload (${JSON.stringify(toast1)})`);
  if (!TOAST.test(toast2 || '')) fail(`RED 1: page 2 (the sibling) shows no update toast after its reload (${JSON.stringify(toast2)}) — it read the key its sibling had just written and took 'same'`);
  await sleep(1500);
  if (P1.loads - l1 !== 1) fail(`RED 1: page 1 loaded ${P1.loads - l1} documents for one takeover (want 1)`);
  if (P2.loads - l2 !== 1) fail(`RED 1: page 2 loaded ${P2.loads - l2} documents for one takeover (want 1)`);
  await P2.close();

  // ── RED 2: the early claim — attempted, classified per attempt ──
  if (ATTEMPTS > 0) console.log(`RED 2 — early claim: up to ${ATTEMPTS} attempts`);
  const delays = [150, 60, 350, 20, 700, 250, 100, 500];
  let produced = false;
  for (let i = 0; i < ATTEMPTS && !produced; i++) {
    const P3 = await openPage('P3');
    await P3.emulateCPUThrottling(20);
    swBump = 'early' + i + Date.now().toString(36).slice(-3);
    const navP1 = P1.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).then(() => true, () => false);
    const started = P3.goto(BASE, { waitUntil: 'load', timeout: 90000 }).then(() => 'load', (e) => 'goto: ' + (e && e.message ? e.message.split('\n')[0] : e));
    await sleep(delays[i % delays.length]);
    await triggerUpdate(P1);                          // the sibling's update() call installs B'; its claim reaches P3 mid-parse
    const how = await started;
    await navP1;                                      // page 1 reloads onto B' as usual (a helper here)
    await sleep(2500);
    const first = P3.docs.find((d) => d.ev === 'start');
    const firstId = first ? first.doc : null;
    const cc = P3.docs.find((d) => d.doc === firstId && d.ev === 'controllerchange');
    const docsSeen = [...new Set(P3.docs.map((d) => d.doc))].length;
    const cls = !first ? 'no document' : !first.controlled ? 'first document uncontrolled' : !cc ? 'no controllerchange in the first document (B\' claimed before it existed, or never)' : cc.bundleB ? `normal takeover (bundle-b had evaluated, ${cc.at} ms)` : `EARLY CLAIM produced (controllerchange at ${cc.at} ms, before bundle-b)`;
    note(`attempt ${i + 1}: delay ${delays[i % delays.length]} ms, goto ${how}, documents ${docsSeen}, ${cls}`);
    if (cc && !cc.bundleB) {
      produced = true;
      // The page must reload (a second document of P3) and that document must toast.
      const t0 = Date.now();
      while (Date.now() - t0 < 12000 && [...new Set(P3.docs.map((d) => d.doc))].length < 2) await sleep(200);
      const ids = [...new Set(P3.docs.map((d) => d.doc))];
      const firstToast = P3.docs.find((d) => d.doc === firstId && d.ev === 'toast');
      const secondId = ids.find((x) => x !== firstId) || null;
      const secondToast = secondId ? (P3.docs.find((d) => d.doc === secondId && d.ev === 'toast') || null) : null;
      let late = null;
      if (secondId && !secondToast) { late = await waitToast(P3, 8000); }
      await shot(P3, 'red2-page3');
      note(`early claim: the stale document ${firstToast ? 'toasted on OLD code (' + JSON.stringify(firstToast.text) + ')' : 'showed no toast'}; ${secondId ? 'it reloaded' : 'it NEVER reloaded'}; reloaded document toast ${JSON.stringify(secondToast ? secondToast.text : late)}`);
      if (!secondId) fail('RED 2: a page whose controller changed before sw-register listened never reloaded — it keeps running the OLD build under the NEW worker');
      else if (!TOAST.test((secondToast ? secondToast.text : late) || '')) fail('RED 2: the early-claimed page reloaded but its reloaded document shows no update toast');
      if (ids.length > 2) fail(`RED 2: page 3 loaded ${ids.length} documents (want 2: the stale one and its reload)`);
    }
    await P3.close().catch(() => {});
  }
  if (ATTEMPTS > 0 && !produced) note(`RED 2: the early claim was NOT produced in ${ATTEMPTS} attempts on this bench — not a pass, not a fail; see the classifications above`);
  console.log(`RED2 ${ATTEMPTS === 0 ? 'NOT ATTEMPTED (--attempts N to try)' : produced ? 'PRODUCED' : 'NOT PRODUCED'}`);

  if (errors.length) note(`page errors: ${errors.length}: ${errors.slice(0, 5).join(' | ')}`);
} finally {
  await browser.close().catch(() => {});
  server.close();
}
if (failures.length) { console.log(`FAILED ${failures.length}:`); for (const f of failures) console.log('  - ' + f); process.exit(1); }
console.log('PASS — every document an update reloads shows the toast');
