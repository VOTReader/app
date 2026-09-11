/* e2e-study-audio — a study chapter's recording, end to end (ruling (4), 2026-09-11).
   Serves the committed tree, boots a fresh profile in headless Chrome, and walks:

     1. Home › Studies › Purity › chapter 1 — the Listen pill is on the study
        chapter (pre-fix: none; the six Purity recordings ship in AUDIO_MANIFEST as
        study:purity-chN but LetterView gated the pill on !studyMode).
     2. A real tap on the pill — the request that follows is for THAT chapter's
        asset (the manifest's Drive id, answered here with a local WAV), and the
        bar reports playing with an advancing clock.
     3. Home, then the desk's "Open the text of …" — lands back on the same study
        chapter with playback still running (the opener is pure navigation).
     4. Home, reload (the lazy study corpus is NOT resident in the new document —
        asserted), Listening Library › the chapter's row › "Open text for …" —
        the screen changes at once (Loading… is the route's own surface) and the
        chapter arrives, under a "‹ Back to Listening Library" pill. This is the
        no-await design of the routing arm, walked on the real corpus load.

   Exit 0 = every assertion held; 1 = a FAIL line above says which; 2 = the walk
   could not be driven (a precondition). --shots <dir> writes screenshots.
   Nothing is fetched from anywhere: the recording's URL is intercepted. */

import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const STUDY = 'Purity';
const CHAPTER_KEY = 'study:purity-ch1';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
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
/* A 60 s, 8 kHz, 8-bit mono PCM WAV (a quiet tone): "playing" has a real clock behind it. */
function makeWav(seconds) {
  const rate = 8000, n = rate * seconds;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(12 * Math.sin((2 * Math.PI * 220 * i) / rate));
  return buf;
}
const WAV = makeWav(60);

const server = await startServer();
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL ' + m); };
const note = (m) => console.log('  ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exitCode = 0;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=d3d11'] });
console.log(`browser ${await browser.version()}`);
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${page.url().split('/').pop()} ${e && e.message ? e.message : 'thrown value: ' + String(e)}`));
  // Every 'playing' / 'pause' on any Audio element with its clock, in every document.
  await page.evaluateOnNewDocument(() => {
    const w = /** @type {any} */ (window);
    w.__e2eAudioEvents = [];
    if (typeof w.Audio !== 'function') return;
    const Orig = w.Audio;
    const Wrapped = function (...args) {
      const el = new Orig(...args);
      for (const type of ['playing', 'pause']) el.addEventListener(type, () => { w.__e2eAudioEvents.push({ type, t: el.currentTime, at: Math.round(performance.now()) }); });
      w.__e2eAudioEl = el;
      return el;
    };
    Wrapped.prototype = Orig.prototype;
    w.Audio = Wrapped;
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const audioRequests = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) {
      audioRequests.push(r.url());
      const m = /bytes=(\d+)-(\d*)/.exec(r.headers().range || '');
      if (m) {
        const from = Number(m[1]), to = m[2] ? Math.min(Number(m[2]), WAV.length - 1) : WAV.length - 1;
        r.respond({ status: 206, contentType: 'audio/wav', body: WAV.subarray(from, to + 1),
          headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${from}-${to}/${WAV.length}`, 'Cache-Control': 'no-store' } });
      } else {
        r.respond({ status: 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }, body: WAV });
      }
    } else r.continue();
  });
  const booted = () => page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  const controls = () => page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean));
  // A control whose aria-label or text STARTS with `label`, or (contains: true) contains it.
  const click = async (label, opts = {}) => {
    const ok = await page.evaluate((label, contains) => {
      const norm = (b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\s+/g, ' ');
      const b = [...document.querySelectorAll('button,[role=button]')].find((b) => contains ? norm(b).includes(label) : norm(b).startsWith(label));
      if (b) b.click();
      return !!b;
    }, label, !!opts.contains);
    if (!ok) throw new Error('no control labelled ' + JSON.stringify(label) + '; on screen: ' + (await controls()).join(' | '));
    await sleep(opts.settle == null ? 500 : opts.settle);
  };
  const shot = async (name) => { if (shotsDir) await page.screenshot({ path: resolve(shotsDir, name + '.png') }); };
  const declineTour = async () => {
    const hit = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /^Maybe later$/.test(b.textContent.trim())); if (b) b.click(); return !!b; });
    if (hit) await sleep(400);
    return hit;
  };
  const heroTitle = () => page.evaluate(() => { const s = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll'); const h = s && s.querySelector('.hero-title'); return h ? h.textContent.trim() : null; });
  const goHome = async () => { await click('Home', { settle: 600 }); };
  const openStudyChapter = async () => {
    await click('Studies', { contains: true, settle: 800 });
    // StudiesHome lists the studies as chapter cards; the corpus is lazy, so wait for the card.
    await page.waitForFunction((s) => [...document.querySelectorAll('.chapter-card-btn')].some((b) => b.textContent.includes(s)), { timeout: 30000 }, STUDY);
    await page.evaluate((s) => { [...document.querySelectorAll('.chapter-card-btn')].find((b) => b.textContent.includes(s)).click(); }, STUDY);
    await sleep(600);
    await page.waitForSelector('.chapter-card-btn', { timeout: 15000 });
    await page.evaluate(() => { document.querySelector('.chapter-card-btn').click(); });
    await page.waitForFunction(() => { const s = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll'); return !!(s && s.querySelector('.hero-title')); }, { timeout: 15000 });
    await sleep(700);
  };

  // ── boot: a fresh profile ──
  await page.goto(BASE, { waitUntil: 'load' });
  await booted(); await sleep(700);
  await click('Continue'); await click('Begin Reading');
  await sleep(600);
  note(`boot: tour offer ${await declineTour() ? 'declined' : 'not shown'}`);

  // ── 1. the study chapter carries the pill ──
  await openStudyChapter();
  const title1 = await heroTitle();
  const assetId = await page.evaluate((k) => (typeof AUDIO_MANIFEST !== 'undefined' && AUDIO_MANIFEST[k] && AUDIO_MANIFEST[k][0]) ? AUDIO_MANIFEST[k][0][0] : null, CHAPTER_KEY);
  note(`study chapter open: ${JSON.stringify(title1)}; manifest ${CHAPTER_KEY} -> asset ${assetId}`);
  if (!assetId) { fail(`precondition: AUDIO_MANIFEST has no ${CHAPTER_KEY} (the walk is about a recording that ships)`); exitCode = 2; throw new Error('precondition'); }
  const pill = await page.$('.hero-play-row button');
  await shot('1-study-chapter');
  if (!pill) fail('1: no Listen pill on the study chapter (.hero-play-row button)');
  else note('1: the Listen pill is on the study chapter');

  // ── 2. a real tap: the chapter's own asset is requested and plays ──
  if (pill) {
    await pill.click();
    await page.waitForSelector('.audio-bar', { timeout: 15000 }).catch(() => null);
    await page.waitForFunction(() => window.__e2eAudioEvents.some((e) => e.type === 'playing'), { timeout: 15000 }).catch(() => null);
    await sleep(1200);
    const ev = await page.evaluate(() => window.__e2eAudioEvents.slice());
    const bar = await page.evaluate(() => { const b = document.querySelector('.audio-bar'); return b ? b.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) : null; });
    const t = await page.evaluate(() => window.__e2eAudioEl ? window.__e2eAudioEl.currentTime : null);
    const hit = audioRequests.find((u) => u.includes(assetId));
    note(`2: bar ${JSON.stringify(bar)}; audio events ${JSON.stringify(ev.map((e) => e.type + '@' + e.t.toFixed(2)))}; clock ${t}; requests ${audioRequests.length}`);
    if (!hit) fail(`2: no request for the chapter's asset ${assetId}; requests: ${JSON.stringify(audioRequests)}`);
    if (!ev.some((e) => e.type === 'playing')) fail('2: the recording never reported playing');
    if (!(t > 0.5)) fail(`2: the clock did not advance (${t})`);
    if (!bar) fail('2: no audio bar after the tap');
    await shot('2-playing');
  }

  // ── 3. away, then the desk's "Open the text" — back on the chapter, still playing ──
  await goHome();
  await click('Open listening controls', { settle: 800 });
  const opener = (await controls()).find((c) => c.startsWith('Open the text of'));
  note(`3: desk opener ${JSON.stringify(opener || null)}`);
  if (!opener) fail('3: the desk has no "Open the text of …" control for the study recording (hasTextDestination)');
  else {
    await click('Open the text of', { settle: 900 });
    const title3 = await heroTitle();
    const paused = await page.evaluate(() => window.__e2eAudioEl ? window.__e2eAudioEl.paused : null);
    note(`3: landed on ${JSON.stringify(title3)}; paused=${paused}`);
    if (title3 !== title1) fail(`3: the desk opener landed on ${JSON.stringify(title3)}, not the chapter ${JSON.stringify(title1)}`);
    if (paused !== false) fail(`3: playback did not continue across the jump (paused=${paused})`);
    await shot('3-desk-open-text');
  }

  // ── 4. a new document: the corpus is not resident; the Library's "Open text" must not wait for it ──
  await goHome();
  await page.reload({ waitUntil: 'load' });
  await booted(); await sleep(900);
  await declineTour();
  const resident = await page.evaluate(() => typeof BIBLE_STUDIES !== 'undefined');
  note(`4: after reload the study corpus is ${resident ? 'RESIDENT (the walk cannot see the no-await path)' : 'not resident'}`);
  if (resident) fail('4: precondition — BIBLE_STUDIES is already loaded on Home after a reload; the no-await arm cannot be measured here');
  await click('Listening Library', { contains: true, settle: 900 });
  const rowOpener = (await controls()).find((c) => c.startsWith('Open text for'));
  note(`4: library row opener ${JSON.stringify(rowOpener || null)}`);
  if (!rowOpener) fail('4: the Listening Library row has no "Open text for …" control for the study recording');
  else {
    await shot('4-library');
    const t0 = Date.now();
    await click('Open text for', { settle: 0 });
    // Poll fast: the route's own Loading… surface is what a reader sees while 4.4 MB parses.
    let sawLoading = false, arrived = null;
    while (Date.now() - t0 < 30000) {
      const s = await page.evaluate(() => ({ loading: !!document.querySelector('.sc-sheet-loading'), title: (() => { const s = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll'); const h = s && s.querySelector('.hero-title'); return h ? h.textContent.trim() : null; })() }));
      if (s.loading) sawLoading = true;
      if (s.title) { arrived = s.title; break; }
      await sleep(15);
    }
    const dt = Date.now() - t0;
    const pill4 = await page.$('.hero-play-row button');
    const back = await page.evaluate(() => { const e = document.querySelector('.back-hint-title'); return e ? e.textContent.trim() : null; });
    note(`4: chapter ${JSON.stringify(arrived)} after ${dt} ms; Loading… surface ${sawLoading ? 'seen' : 'not seen (the corpus arrived within one poll)'}; back pill ${JSON.stringify(back)}; pill ${pill4 ? 'present' : 'ABSENT'}`);
    if (arrived !== title1) fail(`4: the Library opener landed on ${JSON.stringify(arrived)}, not the chapter ${JSON.stringify(title1)}`);
    if (back !== 'Listening Library') fail(`4: back pill reads ${JSON.stringify(back)}, expected "Listening Library"`);
    if (!pill4) fail('4: no Listen pill on the chapter reached from the Library');
    await shot('4-from-library');
  }

  if (errors.length) fail(`page errors: ${JSON.stringify(errors)}`);
  else note('no page errors');
} catch (e) {
  if (exitCode !== 2) { fail('walk could not be driven: ' + (e && e.stack || e)); exitCode = 2; }
} finally {
  await browser.close().catch(() => {});
  server.close();
}
if (failures.length) { console.log(`\n${failures.length} FAIL`); process.exit(exitCode || 1); }
console.log('\nPASS e2e-study-audio');
