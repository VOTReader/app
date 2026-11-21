#!/usr/bin/env node
/* e2e-update-pushes: a new build takes over the moment it has installed, whatever the reader is doing (Corbin
 * 2026-11-20: "Make sure updates are actually pushing ... there's no reason users should be outdated", and of a
 * build that would wait for a reader mid-session or for a recording: "neither of those should make the update
 * wait. Clearly we're having issues pushing updates.").
 *
 *   node tools/e2e-update-pushes.mjs
 *
 * Until that day this file was e2e-update-waits (up1, 2026-10-23): a new build waited for the next open or for 10+
 * minutes away, so every open ran the build the PREVIOUS open had downloaded.
 *
 * Serves its own committed tree on an ephemeral port with the real service worker, boots until the page is
 * CONTROLLED, then publishes a new build the way a deploy does (service-worker.js served with a bumped
 * CACHE_VERSION; the assets and their integrity map as committed, so the install verifies) and asks the
 * registration to update. In arms 1 to 4 the page must reload onto the build just published (a marker set on
 * window is gone, the new worker controls the page, nothing is left waiting); arms 5 and 6 are the one thing that
 * still holds a RELOAD, a note being typed (update-hold.js), which never holds the takeover:
 *
 *   1  MID-READ. The reader is partway down a letter, has touched the page, and its clock says three hours have
 *      passed. After the reload they are on the same letter at the same place (Corbin 2026-09-10: "land reader back
 *      exactly where they were before the update").
 *   2  LISTENING. The media session reads 'playing'.
 *   3  OUT OF SIGHT. The page is hidden.
 *   4  THE SECOND DOOR. The published worker does not skip waiting by itself (what a build of the up1 weeks did,
 *      and what a failed skipWaiting leaves): the page sees it installed and asks, and it takes over.
 *   5  TWO TABS, ONE HOLDING A NOTE. The free tab reloads at once. The tab with the note open keeps its document,
 *      is already under the new worker and knows it (the takeover flag); when the note is saved it reloads.
 *   6  A HELD PAGE ASKS FOR A LAZY CORPUS. Bundle names carry no hash, so after the takeover every lazy byte would
 *      be the NEW build's inside a page still running the OLD one. The loader refuses and reloads the page instead
 *      (index.html, service-worker-1); the words of the note are kept by note-draft.js, not by this hold.
 *
 * Visibility is driven in-page (document.visibilityState is overridden and visibilitychange dispatched) and the
 * page's clock by shifting Date.now. /semantic/ answers 404: the meaning search's 55 MB first download would keep
 * the old worker busy, and the browser activates a new worker only once the old one has no request in flight
 * (measured 2026-11-20: 37 s instead of 2). Exit 0 pass, 1 fail. */
import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { failureReport, installFailureReport } from './e2e-walk-lib.mjs';

installFailureReport('e2e-update-pushes');

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const TAKEOVER_MS = 90000;

let swBump = '';
let swWaits = false;   // arm 4: the published worker leaves the takeover to the page
const served = { old: null, new: null };
const server = await new Promise((r) => {
  const s = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (urlPath.startsWith('/semantic/') || !filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); res.end('not found'); return; }
    let body = readFileSync(filePath);
    if (urlPath === '/service-worker.js') {
      let text = body.toString('utf8').replace(/\r\n/g, '\n');
      const m = /CACHE_VERSION = '([^']+)'/.exec(text);
      if (m) {
        served.old = m[1];
        if (swBump) { served.new = m[1] + '-' + swBump; text = text.replace(m[0], `CACHE_VERSION = '${served.new}'`); }
      }
      if (swWaits) {
        if (!text.includes('    await takeOver();\n')) { res.writeHead(500); res.end('service-worker.js no longer calls takeOver() at the end of its install: arm 4 needs a new handle'); return; }
        text = text.replace('    await takeOver();\n', '');
      }
      body = Buffer.from(text, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  s.listen(0, '127.0.0.1', () => r(s));
});
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL ' + m); };
const note = (m) => console.log('  ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The CACHE_VERSION of the worker controlling the page, asked the way update-toast.js asks. */
const controllerVersion = (page) => page.evaluate(() => new Promise((res) => {
  const c = navigator.serviceWorker.controller;
  if (!c) { res(null); return; }
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => res((e.data && e.data.cacheVersion) || null);
  c.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  setTimeout(() => res(null), 3000);
}));
const waitingState = (page) => page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { waiting: !!(r && r.waiting), installing: !!(r && r.installing) };
});
const setVisibility = (page, v) => page.evaluate((state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}, v);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => note('pageerror: ' + (e && e.message)));
  await page.goto(BASE, { waitUntil: 'load' });
  for (let i = 0; i < 3 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)); i++) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await sleep(500);
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: 'load' });
  }
  const v0 = await controllerVersion(page);
  if (!v0) throw new Error('the page never came under the service worker');
  note(`controlled by ${v0}`);

  /**
   * One arm: the app is up and the reader in it, `before` sets the scene, a build is published, and the page must
   * reload onto it by itself.
   * @param {string} n  the arm's number and name
   * @param {string} tag  goes into the published CACHE_VERSION
   * @param {() => Promise<void>} before
   * @param {boolean} [waits]  the published worker leaves the takeover to the page (arm 4)
   */
  const arm = async (n, tag, before, waits = false) => {
    await page.waitForFunction(() => !!document.body && document.body.innerText.length > 200, { timeout: 30000 });
    await sleep(2000);
    await page.evaluate(() => { /** @type {any} */ (window).__e2eMark = 'same document'; window.dispatchEvent(new Event('pointerdown')); });
    await before();
    const nav = page.waitForNavigation({ waitUntil: 'load', timeout: TAKEOVER_MS }).then(() => true, () => false);
    const t = Date.now();
    swWaits = waits;
    swBump = tag + Date.now().toString(36);
    await page.evaluate(() => { navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); });
    if (!(await nav)) {
      const st = await waitingState(page).catch(() => ({ waiting: false, installing: false }));
      fail(`${n}: the build published (${served.new}) did not take over within ${TAKEOVER_MS / 1000} s (waiting=${st.waiting}, installing=${st.installing})`);
      return;
    }
    const took = Date.now() - t;
    await page.evaluate(() => navigator.serviceWorker.ready);
    const v = await controllerVersion(page);
    const before0 = failures.length;
    if (await page.evaluate(() => /** @type {any} */ (window).__e2eMark !== undefined)) fail(`${n}: the page did not reload`);
    if (v !== served.new || !String(v).includes('-' + tag)) fail(`${n}: after the takeover the page is controlled by ${v}, want ${served.new} (this arm's -${tag})`);
    if ((await waitingState(page)).waiting) fail(`${n}: a build is still waiting after the takeover`);
    if (failures.length === before0) note(`${n}: reloaded onto ${v} ${took} ms after it was published`);
  };

  // The reader's place: the letter on screen and how far down its column they are.
  const place = () => page.evaluate(() => {
    const col = Array.from(document.querySelectorAll('.screen-scroll')).find((c) => !c.closest('[inert], .pager-peek') && c.scrollHeight > c.clientHeight + 400);
    return { title: document.title, y: col ? Math.round(col.scrollTop) : null };
  });
  const clickText = (re) => page.evaluate((src) => { const rx = new RegExp(src); const b = [...document.querySelectorAll('button,[role=button]')].find((x) => rx.test(x.textContent || '')); if (b) b.click(); return !!b; }, re.source);
  let before1 = null;
  await arm('1 mid-read', 'read', async () => {
    // A first run's welcome is answered, then a letter is opened by its link and read partway down.
    for (const re of [/Continue/, /Begin Reading/]) { if (await clickText(re)) await sleep(800); }
    await page.goto(BASE + '?p=' + encodeURIComponent('letter:christmas:3'), { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('[data-hl-key]').length > 3, { timeout: 30000 });
    await sleep(2500);
    await page.evaluate(() => {
      const col = Array.from(document.querySelectorAll('.screen-scroll')).find((c) => !c.closest('[inert], .pager-peek') && c.scrollHeight > c.clientHeight + 400);
      if (col) col.scrollTop += 900;
    });
    await sleep(2000);
    before1 = await place();
    await page.evaluate(() => { /** @type {any} */ (window).__e2eMark = 'same document'; window.dispatchEvent(new Event('pointerdown')); const now = Date.now.bind(Date); Date.now = () => now() + 3 * 60 * 60 * 1000; });
  });
  if (!before1 || before1.y === null || before1.y < 500) fail(`1 mid-read: the bench never got a reader partway down a letter (${JSON.stringify(before1)})`);
  else {
    let after1 = await place().catch(() => null);
    for (let i = 0; i < 16 && !(after1 && after1.title === before1.title && after1.y !== null && Math.abs(after1.y - before1.y) <= 6); i++) { await sleep(500); after1 = await place().catch(() => null); }
    if (!after1 || after1.title !== before1.title) fail(`1 mid-read: the reader was on ${JSON.stringify(before1.title)} and came back on ${JSON.stringify(after1 && after1.title)}`);
    else if (after1.y === null || Math.abs(after1.y - before1.y) > 6) fail(`1 mid-read: the reader was ${before1.y} px down ${JSON.stringify(before1.title)} and came back at ${after1.y} px`);
    else note(`1 mid-read: back on ${JSON.stringify(after1.title)} at ${after1.y} px (was ${before1.y} px)`);
  }
  await arm('2 listening', 'play', () => page.evaluate(() => { navigator.mediaSession.playbackState = 'playing'; }));
  await arm('3 out of sight', 'away', () => setVisibility(page, 'hidden'));
  await arm('4 the second door (the worker leaves it to the page)', 'door', async () => {}, true);

  // ── 5 TWO TABS, ONE HOLDING A NOTE ──
  const appUp = (pg) => pg.waitForFunction(() => !!document.body && document.body.innerText.length > 200 && typeof (/** @type {any} */ (window)).holdUpdateReload === 'function', { timeout: 30000 });
  const hold = (pg) => pg.evaluate(() => { const w = /** @type {any} */ (window); w.__e2eMark = 'same document'; w.__e2eRelease = w.holdUpdateReload('note'); });
  const heldState = (pg) => pg.evaluate(() => { const w = /** @type {any} */ (window); return { mark: w.__e2eMark, took: !!w.__votSwTookOver }; }).catch(() => null);
  const held = await browser.newPage();
  await held.goto(BASE, { waitUntil: 'load' });
  await appUp(held);
  await sleep(2000);
  await hold(held);
  await page.bringToFront();
  await arm('5 two tabs, the free one', 'tabs', async () => {});
  await sleep(2500);
  const h5 = await heldState(held);
  const hv5 = await controllerVersion(held).catch(() => null);
  if (!h5 || h5.mark !== 'same document') fail('5 the tab holding a note was reloaded under it');
  else if (hv5 !== served.new) fail(`5 the takeover waited for the tab holding a note (it is controlled by ${hv5}, the build published is ${served.new})`);
  else if (!h5.took) fail('5 the held tab was taken over without its takeover flag: a lazy load there would mix two builds');
  else {
    note('5 the tab holding a note: same document, already under the new worker, takeover flag set');
    const navH = held.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).then(() => true, () => false);
    const tH = Date.now();
    await held.evaluate(() => (/** @type {any} */ (window)).__e2eRelease());
    if (!(await navH)) fail('5 the held tab did not reload within 20 s of the note being saved');
    else {
      await held.evaluate(() => navigator.serviceWorker.ready);
      const v = await controllerVersion(held);
      if (v !== served.new) fail(`5 after its reload the held tab is controlled by ${v}, want ${served.new}`);
      else note(`5 the note saved: the held tab reloaded onto ${v} ${Date.now() - tH} ms later`);
    }
  }
  await held.close();

  // ── 6 A HELD PAGE ASKS FOR A LAZY CORPUS ──
  // A page loads its three lazy corpora by itself 2 to 8 s after it opens (probed 2026-11-20), so a reader with a
  // note open has normally nothing left to lazy-load. To put the question at all, this tab's Matthew corpus is kept
  // from loading until the arm asks for it: the page's own early ask gets a promise that never settles.
  const lazy = await browser.newPage();
  await lazy.evaluateOnNewDocument(() => {
    const w = /** @type {any} */ (window);
    let real = null;
    Object.defineProperty(w, '__loadMatthewCorpus', { configurable: true, set: (f) => { real = f; }, get: () => (w.__e2eAskNow && real ? real : () => new Promise(() => {})) });
  });
  await lazy.goto(BASE, { waitUntil: 'load' });
  await appUp(lazy);
  await sleep(9000);   // past the page's own loading of the other corpora
  const had = await lazy.evaluate(() => [...document.querySelectorAll('script[src]')].some((x) => /bundle-a-matthew/.test(x.getAttribute('src') || '')));
  if (had) fail('6 the bench did not keep the Matthew corpus from loading: nothing lazy is left to ask for');
  await hold(lazy);
  swWaits = false;
  swBump = 'lazy' + Date.now().toString(36);
  await lazy.evaluate(() => { navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); });
  const t6 = Date.now();
  let v6 = await controllerVersion(lazy).catch(() => null);
  while (v6 !== served.new && Date.now() - t6 < TAKEOVER_MS) { await sleep(400); v6 = await controllerVersion(lazy).catch(() => null); }
  const h6 = await heldState(lazy);
  if (v6 !== served.new) fail(`6 the build published (${served.new}) did not take over the held page within ${TAKEOVER_MS / 1000} s`);
  else if (!h6 || h6.mark !== 'same document' || !h6.took) fail(`6 the held page after the takeover: ${JSON.stringify(h6)} (want the same document with the takeover flag)`);
  else if (!had) {
    const nav6 = lazy.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).then(() => true, () => false);
    const asked = await lazy.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__e2eAskNow = true;
      if (typeof w.__loadMatthewCorpus !== 'function') return 'no loader';
      w.__loadMatthewCorpus().catch(() => {});
      return [...document.querySelectorAll('script[src]')].some((x) => /bundle-a-matthew/.test(x.getAttribute('src') || '')) ? 'APPENDED' : 'refused';
    }).catch(() => 'reloading');   // the reload may take the document before the answer comes back
    if (asked === 'no loader') fail('6 index.html no longer has window.__loadMatthewCorpus: this arm needs a new lazy corpus to ask for');
    else if (asked === 'APPENDED') fail('6 the held page appended a lazy bundle after the takeover: the new build\'s code inside the old page');
    else if (!(await nav6)) fail('6 the held page asked for a lazy corpus after the takeover and did not reload within 20 s');
    else {
      await lazy.evaluate(() => navigator.serviceWorker.ready);
      const v = await controllerVersion(lazy);
      if (v !== served.new) fail(`6 after the reload the page is controlled by ${v}, want ${served.new}`);
      else note(`6 a held page asked for a lazy corpus after the takeover: nothing appended, reloaded onto ${v}`);
    }
  }
  await lazy.close();
} catch (e) {
  fail('walk: ' + failureReport(e, 'e2e-update-pushes'));
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `FAIL e2e-update-pushes: ${failures.length} problem(s)` : 'PASS e2e-update-pushes: a new build takes over the moment it has installed: mid-read, while listening, out of sight, and when the page has to ask; a note being typed holds only its own tab\'s reload');
process.exit(failures.length ? 1 : 0);
