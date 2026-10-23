#!/usr/bin/env node
/* e2e-update-waits — a new build never reloads a page the reader is using (up1, Corbin 2026-10-23: "VOTReader has
 * been flashing 'VOTReader was just updated' at me all day long").
 *
 *   node tools/e2e-update-waits.mjs
 *
 * Serves its own committed tree on an ephemeral port with the real service worker, boots until the page is
 * CONTROLLED, then publishes a new build the way a deploy does (service-worker.js served with a bumped
 * CACHE_VERSION; the assets and their integrity map as committed, so the install verifies) and asks the
 * registration to update. Three arms on one page:
 *
 *   1  HERE. The reader has touched the page; the new worker installs and WAITS; 15 s later the same document is
 *      still up (a marker set on window survives) and the old worker still controls it.
 *   2  AWAY WHILE LISTENING. The page goes hidden, the clock moves 11 minutes, the page comes back, with the media
 *      session reading 'playing': still no reload.
 *   3  AWAY, NOTHING PLAYING. The same, paused: the page asks the waiting worker to take over, it does, and the page
 *      reloads onto the new build (the marker is gone, nothing is left waiting, the new worker controls the page).
 *
 * Visibility is driven in-page (document.visibilityState is overridden and visibilitychange dispatched) and the
 * page's clock by shifting Date.now: sw-register.js reads exactly those. Exit 0 pass, 1 fail. */
import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const AWAY_MS = 11 * 60 * 1000;

let swBump = '';
const served = { old: null, new: null };
const server = await new Promise((r) => {
  const s = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (!filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); res.end('not found'); return; }
    let body = readFileSync(filePath);
    if (urlPath === '/service-worker.js') {
      const text = body.toString('utf8');
      const m = /CACHE_VERSION = '([^']+)'/.exec(text);
      if (m) {
        served.old = m[1];
        if (swBump) { served.new = m[1] + '-' + swBump; body = Buffer.from(text.replace(m[0], `CACHE_VERSION = '${served.new}'`), 'utf8'); }
      }
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
/** Hidden, the clock moved AWAY_MS on, visible again: what a reader back from 11 minutes away looks like to the page. */
const awayAndBack = (page) => page.evaluate((away) => {
  const set = (v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  set('hidden');
  const now = Date.now.bind(Date);   // already moved by an earlier call: the moves add up
  Date.now = () => now() + away;
  set('visible');
}, AWAY_MS);

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

  // ── 1 HERE ──
  // The reader has started (a touch ends the boot window, in which a new build may still take over at once).
  await page.evaluate(() => { /** @type {any} */ (window).__e2eMark = 'same document'; window.dispatchEvent(new Event('pointerdown')); });
  swBump = 'up1' + Date.now().toString(36);
  let navigated = false;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigated = true; });
  await page.evaluate(() => { navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); });
  const t0 = Date.now();
  let st = await waitingState(page);
  while (!st.waiting && Date.now() - t0 < 90000) { await sleep(500); st = await waitingState(page); }
  if (!st.waiting) throw new Error(`the new build (${served.new}) never reached waiting in 90 s (installing=${st.installing})`);
  note(`new build ${served.new} installed in ${Date.now() - t0} ms and is waiting`);
  await sleep(15000);
  const mark1 = await page.evaluate(() => /** @type {any} */ (window).__e2eMark);
  if (navigated || mark1 !== 'same document') fail('1 the page reloaded while the reader was here');
  const v1 = await controllerVersion(page);
  if (v1 !== v0) fail(`1 the page is controlled by ${v1}, not the build it opened on (${v0})`);
  if (!(await waitingState(page)).waiting) fail('1 the new build is no longer waiting');
  if (!failures.length) note('1 here: no reload for 15 s, the old build still serves, the new one waits');

  // ── 2 AWAY WHILE LISTENING ──
  await page.evaluate(() => { navigator.mediaSession.playbackState = 'playing'; });
  await awayAndBack(page);
  await sleep(5000);
  if (navigated || (await page.evaluate(() => /** @type {any} */ (window).__e2eMark)) !== 'same document') fail('2 the page reloaded while a recording played');
  else note('2 away 11 min while listening: no reload');

  // ── 3 AWAY, NOTHING PLAYING ──
  await page.evaluate(() => { navigator.mediaSession.playbackState = 'paused'; });
  const nav = page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).then(() => true, () => false);
  await awayAndBack(page);
  if (!(await nav)) fail('3 back after 11 min with nothing playing: the new build did not take over within 30 s');
  else {
    await page.evaluate(() => navigator.serviceWorker.ready);
    const v3 = await controllerVersion(page);
    const mark3 = await page.evaluate(() => /** @type {any} */ (window).__e2eMark);
    const left = await waitingState(page);
    if (mark3 !== undefined) fail('3 the page did not reload onto the new build');
    if (v3 !== served.new) fail(`3 after the takeover the page is controlled by ${v3}, want ${served.new}`);
    if (left.waiting) fail('3 a build is still waiting after the takeover');
    if (!failures.some((f) => f.startsWith('3'))) note(`3 away 11 min, nothing playing: reloaded onto ${v3}`);
  }
} catch (e) {
  fail('walk: ' + ((e && e.message) || e));
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `FAIL e2e-update-waits: ${failures.length} problem(s)` : 'PASS e2e-update-waits: a new build waits while the reader is here and takes over after 10+ min away');
process.exit(failures.length ? 1 : 0);
