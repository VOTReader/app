#!/usr/bin/env node
/* e2e-update-reload — the reader comes back exactly where they were after the update's
 * self-reload (Corbin, 2026-09-10: "reload should be seamless, instant, with a toast
 * indicating what happened, and should otherwise land reader back exactly where they
 * were before the update").
 *
 *   node tools/e2e-update-reload.mjs [--shots DIR] [--no-audio]
 *
 * Serves its own committed tree on an ephemeral port (real service worker, real caches),
 * boots twice so the page is CONTROLLED (sw-register captures hadController before it
 * registers), then puts a reader mid-letter at a scroll offset with a changed text size
 * and a recording playing after a real click, and fires `controllerchange` on
 * navigator.serviceWorker — the event the new worker's claim() fires — so the REAL
 * doReload path runs: takeover flag, the `vot:before-update-reload` write, location.reload().
 * Three arms, in one browser context:
 *
 *   A  SAME FRAME. The scroll and the takeover happen in one tick with no idle wait, so
 *      nothing debounced can have landed: what comes back is what the synchronous write
 *      before reload() carried. Asserted EXACT: the same letter, scrollTop equal, the
 *      audio clock within one frame (CLOCK_TOL_FRAME) of the read taken in that tick,
 *      text size equal. A synthetic controllerchange drives it (no new build, so no
 *      toast is expected here — that is arm B's).
 *   B  A REAL UPDATE. The harness serves service-worker.js with a bumped CACHE_VERSION
 *      and asks the registration to update: the new worker installs, skips waiting,
 *      claims, and the app's own controllerchange handler reloads. After it: the same
 *      letter and scroll, "VOTReader was just updated." on screen, and the recording
 *      either PLAYING at its clock or the toast reading "… Tap to continue listening."
 *      whose one tap resumes it there. No "Reload" button is ever rendered.
 *   C  A CLOSE WITH NO RELOAD EVENT (audio-clock-close-gap-1). The tab is closed mid-listen at
 *      a moment the periodic snapshot is provably >= 2.5 s stale, and a new tab in the same
 *      profile boots: the bar comes back on the same recording within 1 s of the clock read
 *      just before the close, PAUSED (a close is not an update; no play() is attempted).
 *
 * Autoplay is measured twice: under Chrome's DEFAULT policy (desktop; this machine allows the
 * resume after a real gesture before the reload) and, with --autoplay-refused, under
 * user-gesture-required — the phone's path (mobile Chrome refuses play() with no gesture after
 * a reload; every live returning-profile sample reads RESUMED ON TAP). The three outcomes,
 * pre-registered for the live AFTER sample (2026-09-11):
 *   ALLOWED            the recording is PLAYING at the flushed clock (first 'playing' within
 *                      1/60 s of the record) and the one toast reads exactly
 *                      "VOTReader was just updated.";
 *   REFUSED            the player is PAUSED at exactly the flushed clock, the ONE toast reads
 *                      exactly "VOTReader was just updated. Tap to continue listening." and
 *                      the plain text is not also on the page;
 *   REFUSED, THEN TAP  one tap on that toast starts playback within 1/60 s of the flushed
 *                      clock and the toast goes.
 * In both policies the restore's LANDING is exact and the same letter and text size come back.
 *
 * The recording is a 60 s WAV the harness synthesises and serves in place of every
 * release mp3 (with Range answers, or Chrome treats it as unseekable and a seek restarts
 * it), so the walk is offline and the clock is real: the app's resume rule refuses
 * positions under 30 s, so the reader is put at ~40 s.
 *
 * THE CLOCK IS READ AT THE INSTANT SOUND RESUMES, never later: an Audio wrapper installed
 * before any page script logs every 'playing' with its currentTime, and the bar (one frame,
 * CLOCK_TOL_FRAME) is applied to the FIRST one after the boot. A store read a second later
 * has advanced by a second and says nothing about where playback started (2026-09-11: a
 * reading of 43.05 s against 41.008 s was that mistake, not a defect).
 *
 * What the boot FOUND is printed for both arms: the state record and the clock record in
 * sessionStorage (the path the restore stands on since 2026-09-11: an IDB put issued one
 * call before reload() is not owed its completion, so nothing is built on it), and the IDB
 * record as evidence of whether that put landed this time. THE 612 WAS THE INSTRUMENT: the
 * first version of this walk read scrollTop 1.5 s after boot and reported 612 px against
 * 900 as the restore losing the position; measured with the landing observer below, the
 * restore had landed at 900 exactly (on the IDB-only tree too, 2 runs x 2 arms) and the
 * read-along follow had then moved the page to the spoken sentence. The IDB put landed in
 * every arm measured tonight (12 of 12); the record stands on the ruling, not on that.
 *
 * Instrument lessons, paid for on this walk's RED (2026-09-10/11), each of which read as
 * "the restore lost the position" until measured:
 *   - a driver click on the hero Listen pill scrolls the pill into view FIRST and so
 *     undid the 900 px scroll the walk was about to assert — start the recording
 *     before scrolling, never after;
 *   - "the tall .screen-scroll" is an inert pager PEEK clone of a neighbouring letter,
 *     not the live scroller; the live one is
 *     .screen-layout > .pager-viewport > .screen-scroll, and the app's own __scrollEl
 *     is that element (probed by identity, not assumed);
 *   - an evaluate that AWAITS registration.update() dies with the document ("Execution
 *     context was destroyed"): the new worker claims and the app reloads before update()
 *     resolves. Fire the takeover and return; await nothing in that frame;
 *   - never indexedDB.open() a name that may not exist yet from a probe: it would create
 *     the database at version 1 under the app's feet. Ask indexedDB.databases() first. */
import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const withAudio = !argv.includes('--no-audio');
// --autoplay-refused: Chrome's user-gesture-required policy — the phone's real path (mobile
// Chrome refuses play() with no gesture after a reload; the Verifier's live returning-profile
// samples all read RESUMED ON TAP). Same walk, and arm B then asserts the REFUSED shape.
const refused = argv.includes('--autoplay-refused');
const CLOCK_TOL_FRAME = 1 / 60; // one frame at 60 Hz: the bar for the clock coming back, both arms (Corbin: "exactly")
const RESUME_AT = 40;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
/* Arm B's new build: when set, service-worker.js is served with CACHE_VERSION suffixed,
   which is exactly how a real deploy differs from the worker a reader already has (the
   version is a hash over the bundles; the assets and their integrity map stay as
   committed, so the new worker's install verifies and completes). */
let swBump = '';
const served = { old: null, new: null };
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
        served.old = m[1];
        if (swBump) { served.new = m[1] + '-' + swBump; body = Buffer.from(text.replace(m[0], `CACHE_VERSION = '${served.new}'`), 'utf8'); }
      }
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/* A 60 s, 8 kHz, 8-bit mono PCM WAV: a quiet 220 Hz tone, so "playing" has a real
   clock behind it and nothing is downloaded from anywhere. */
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

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=d3d11', ...(refused ? ['--autoplay-policy=user-gesture-required'] : [])] });
console.log(`browser ${await browser.version()}  audio=${withAudio ? 'on' : 'off'}  autoplay policy: ${refused ? 'user-gesture-required (the phone)' : 'Chrome default'}`);
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  // Stamped with the clock and the document, so an error can be placed in an arm; a
  // thrown PRIMITIVE (an unhandled rejection with no reason) arrives as the value itself.
  page.on('pageerror', (e) => errors.push(`${new Date().toISOString().slice(11, 23)} ${page.url().split('/').pop()} ${e && e.message ? e.message : 'thrown value: ' + String(e)}`));
  // Boot-time instruments, installed before any page script of every document:
  //  - the two reload records as the boot FINDS them (the state record and the audio
  //    clock record in sessionStorage), read before the app consumes either;
  //  - the vot-state IDB record as the boot finds it (a readonly get issued at document
  //    start runs before the app's first readwrite), so the handoff can say whether the
  //    IDB put issued one call before reload() landed at all;
  //  - every 'playing' / 'seeked' / 'pause' on any Audio element with its currentTime,
  //    so the clock the listener actually came back to is read at the instant playback
  //    resumed, not after it has advanced.
  await page.evaluateOnNewDocument(() => {
    const w = /** @type {any} */ (window);
    const boot = { at: Math.round(performance.now()), stateRec: null, audioRec: null, err: null };
    try {
      const s = sessionStorage.getItem('vot-state-resume-after-update');
      if (s != null) { const r = JSON.parse(s); const i = r.state && typeof r.state.activeTabIdx === 'number' ? r.state.activeTabIdx : 0; const t = r.state && Array.isArray(r.state.tabs) ? r.state.tabs[i] : null; boot.stateRec = { at: r.at, bytes: s.length, screen: t && t.screen, scrollPositions: t && t.scrollPositions || null }; }
      const a = sessionStorage.getItem('vot-audio-resume-after-update');
      if (a != null) boot.audioRec = JSON.parse(a);
    } catch (e) { boot.err = String(e && e.message || e); }
    w.__e2eBoot = boot;
    w.__e2eBootIdb = { done: false };
    // Only on the app's own origin: on about:blank (the page's first document) a denied
    // indexedDB.databases() is reported by Chrome as "Uncaught (in promise)" with an
    // UNDEFINED value even when its rejection is caught — measured 2026-09-11 — and that
    // read as a page error of the app's.
    if (location.protocol !== 'http:' && location.protocol !== 'https:') { w.__e2eBootIdb = { done: true, note: 'not the app origin' }; return; }
    // Never CREATE the database from here (an open() on a name that does not exist
    // yet would make it at version 1 under the app's feet): ask first, and close on
    // versionchange so an app upgrade is never blocked by this probe.
    try { indexedDB.databases().then((list) => {
      if (!list.some((d) => d.name === 'votreader')) { w.__e2eBootIdb = { done: true, found: false, note: 'no database yet' }; return; }
      const rq = indexedDB.open('votreader');
      rq.onerror = () => { w.__e2eBootIdb = { done: true, err: 'open failed' }; };
      rq.onsuccess = () => {
        const db = rq.result;
        db.onversionchange = () => db.close();
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
    }).catch((e) => { w.__e2eBootIdb = { done: true, err: String(e && e.message || e) }; }); } catch (e) { w.__e2eBootIdb = { done: true, err: String(e && e.message || e) }; }  // about:blank and opaque origins throw synchronously
    // Where the RESTORE landed: scrollTop at the instant body.scroll-restoring is removed
    // (the last write of use-scroll-memory's startRestore, by construction). Anything the
    // scroller does after that is another writer — the read-along follow, first of all.
    w.__e2eRestoreLanded = null;
    w.__e2eRestoreEdges = [];     // every add/remove of the flag, with the scroller's position
    w.__e2eObsErr = null;
    try {
      let had = false, last = false;
      // Observed on the DOCUMENT node: at document start there may be no <html> yet, and
      // an observer on a null root throws — silently, inside a probe, which is how the first
      // run of this instrument reported "the restore never ran" about a restore that did.
      new MutationObserver((records) => {
        const b = document.body; if (!b) return;
        if (!records.some((r) => r.target === b)) return;
        const has = b.classList.contains('scroll-restoring');
        if (has === last) return;
        last = has;
        const el = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll');
        const y = el ? Math.round(el.scrollTop) : null;
        w.__e2eRestoreEdges.push({ on: has, y, at: Math.round(performance.now()) });
        if (has) had = true;
        else if (had && !w.__e2eRestoreLanded) w.__e2eRestoreLanded = { y, at: Math.round(performance.now()) };
      }).observe(document, { attributes: true, attributeFilter: ['class'], subtree: true });
    } catch (e) { w.__e2eObsErr = String(e && e.message || e); }
    w.__e2eAudioEvents = [];
    if (typeof w.Audio !== "function") return;   // not a document with media (about:blank)
    const Orig = w.Audio;
    const Wrapped = function (...args) {
      const el = new Orig(...args);
      for (const type of ['playing', 'seeked', 'pause']) el.addEventListener(type, () => { w.__e2eAudioEvents.push({ type, t: el.currentTime, at: Math.round(performance.now()) }); });
      return el;
    };
    Wrapped.prototype = Orig.prototype;
    w.Audio = Wrapped;
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) {
      // Honour Range requests: without 206 answers Chrome treats the recording as
      // unseekable and a seek restarts it from 0, which is not the reader's situation.
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
  const click = async (label) => {
    const ok = await page.evaluate((label) => {
      const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\s+/g, ' ').startsWith(label));
      if (b) b.click();
      return !!b;
    }, label);
    if (!ok) {
      const seen = await page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean).slice(0, 40));
      throw new Error('no control labelled ' + JSON.stringify(label) + '; on screen: ' + seen.join(' | '));
    }
    await sleep(500);
  };
  const shot = async (name) => { if (shotsDir) await page.screenshot({ path: resolve(shotsDir, name + '.png') }); };
  // The tour offer ("Show me around / Maybe later") sits over Home on the first visit
  // after onboarding; a reader who is mid-letter never sees it, and the walk declines it.
  const declineTour = async () => {
    const hit = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /^Maybe later$/.test(b.textContent.trim())); if (b) b.click(); return !!b; });
    if (hit) await sleep(400);
    return hit;
  };

  // ── boot 1: first run, the worker installs and claims ──
  await page.goto(BASE, { waitUntil: 'load' });
  await booted(); await sleep(700);
  await click('Continue'); await click('Begin Reading');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 90000 });
  note('worker controls the page after boot 1');
  // ── boot 2: a CONTROLLED page, the state every later update finds ──
  await page.reload({ waitUntil: 'load' });
  await booted(); await sleep(700);
  const controlledAtBoot = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
  if (!controlledAtBoot) fail('precondition: the page is not controlled at boot 2 — the update path cannot be driven');
  note(`boot 2: tour offer ${await declineTour() ? 'declined' : 'not shown'}`);
  note('renderer: ' + await page.evaluate(() => {
    try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 'no WebGL';
      const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { return 'error: ' + e.message; }
  }));

  // ── text size 1.3 through the Settings slider (a persisted setting, changed the reader's way) ──
  await page.evaluate(() => {
    const gear = document.querySelector('[aria-label="Settings"]');
    const tile = gear || [...document.querySelectorAll('button,[role=button]')].find((b) => /Settings/.test(b.textContent));
    if (!tile) throw new Error('no way into Settings from here');
    /** @type {HTMLElement} */ (tile).click();
  });
  await sleep(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /Appearance/.test(b.textContent)); if (b) b.click(); });
  await sleep(400);
  const setSlider = await page.evaluate(() => {
    const el = /** @type {HTMLInputElement|null} */ (document.querySelector('input[type=range][aria-label="Text size"]'));
    if (!el) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '1.3');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (!setSlider) fail('precondition: no "Text size" slider under Settings › Appearance');
  await sleep(400);
  const fs0 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
  note(`text size set: --font-scale=${fs0}`);
  await click('Back');

  // ── a letter, scrolled ──
  await click('Prophetic Letters'); await click('Volume One');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][1]; if (b) b.click(); });
  await page.waitForSelector('.hero-title', { timeout: 15000 }); await sleep(900);
  const title0 = await page.evaluate(() => (document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll').querySelector('.hero-title') || { textContent: '' }).textContent.trim());
  // The LIVE reading scroller: the one under .screen-layout's pager viewport. The
  // swipe pager also mounts inert clones of the neighbouring letters, each with its own
  // .screen-scroll, and a query for "a tall .screen-scroll" lands on a clone.
  await page.evaluate(() => {
    window.__e2eScroller = () => document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll');
  });
  // ── a recording playing, started by a real tap on the hero pill, parked at ~40 s.
  // Started BEFORE the scroll: the pill sits in the hero, and a driver click scrolls its
  // target into view, which would undo the scroll the walk is about to assert. ──
  // The player's element is a detached new Audio(); everything is read through the
  // app's own window.AudioPlayer (getState / getPreciseTime / seek), never the DOM.
  let track0 = null, t0 = null;
  if (withAudio) {
    const pill = await page.$('.hero-play-pill');
    if (!pill) fail('precondition: no Listen pill on the letter');
    else {
      await pill.click();
      await page.waitForFunction(() => { const s = window.AudioPlayer && window.AudioPlayer.getState(); return !!s && s.status === 'playing' && window.AudioPlayer.getPreciseTime() > 0.5; }, { timeout: 20000 });
      await page.evaluate((t) => { window.AudioPlayer.seek(t); }, RESUME_AT);
      note('after seek: ' + JSON.stringify(await page.evaluate(() => { const s = window.AudioPlayer.getState(); return { status: s.status, time: s.time, duration: s.duration, precise: window.AudioPlayer.getPreciseTime() }; })));
      await page.waitForFunction((t) => window.AudioPlayer.getPreciseTime() > t + 1, { timeout: 15000 }, RESUME_AT);
      const st = await page.evaluate(() => { const s = window.AudioPlayer.getState(); const tr = s.queue[s.qi] || {}; return { key: tr.key, title: tr.title, status: s.status, t: window.AudioPlayer.getPreciseTime() }; });
      track0 = st.key; t0 = st.t;
      note(`before: ${st.status} ${JSON.stringify(st.title)} (key ${st.key}) at ${t0.toFixed(1)} s`);
    }
  }
  // Helpers shared by both arms.
  const LIVE = () => document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll');
  const readPage = () => page.evaluate(() => {
    const el = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll');
    const h = el && el.querySelector('.hero-title');
    const P = window.AudioPlayer; const s = P && P.getState(); const tr = s && s.queue[s.qi] || {};
    return {
      title: h ? h.textContent.trim() : '', y: el ? Math.round(el.scrollTop) : null,
      fs: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
      toast: (document.querySelector('#vot-toast-updated') || { textContent: '' }).textContent.trim(),
      toastShown: !!(document.querySelector('#vot-toast-updated') && document.querySelector('#vot-toast-updated').classList.contains('show')),
      reloadBtn: !!document.querySelector('#vot-toast-update button'),
      key: tr.key || null, status: s ? s.status : null, storeT: s ? s.time : null, t: P ? P.getPreciseTime() : null,
      boot: window.__e2eBoot || null, bootIdb: window.__e2eBootIdb || null, audioEvents: window.__e2eAudioEvents || [],
      landed: window.__e2eRestoreLanded || null,
      // The read-along's lit sentence against the follow's band (ReadAlongHighlight._follow:
      // 25 %–60 % of the visible scroller, target 35 %): where a listener's page is MEANT to
      // sit while the recording plays.
      lit: (() => {
        try {
          const hl = CSS.highlights && CSS.highlights.get('vot-reading'); if (!hl || !el) return null;
          const range = [...hl][0]; if (!range) return null;
          const box = el.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(el).scrollPaddingBottom) || 0;
          const vis = box.height - pad; const r = range.getBoundingClientRect();
          const top = Math.round(r.top - box.top), bandTop = Math.round(vis * 0.25), bandBot = Math.round(vis * 0.6);
          return { top, bandTop, bandBot, inBand: top >= bandTop - 2 && top <= bandBot + 2, text: range.toString().slice(0, 40) };
        } catch (_e) { return null; }
      })(),
    };
  });
  const wheelTo = async (deltaY) => {
    const box = await page.evaluate(() => { const el = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (!box) return false;
    await page.mouse.move(box.x, box.y); await page.mouse.wheel({ deltaY });
    return true;
  };
  const ensurePlaying = async () => {
    const st = await readPage();
    if (st.status === 'playing') return true;
    // A real gesture on the bar's Play: the resume after arm A may have been refused.
    const btn = await page.$('.audio-bar button[aria-label="Play"]');
    if (!btn) return false;
    await btn.click();
    await page.waitForFunction(() => window.AudioPlayer.getState().status === 'playing' && window.AudioPlayer.getPreciseTime() > 0, { timeout: 15000 }).catch(() => {});
    return (await readPage()).status === 'playing';
  };
  const afterReload = async (arm) => {
    await booted();
    // Where the scroller sits over the first seconds after boot: the restore lands, and
    // then anything else that writes scrollTop shows as a later move in this trace.
    await page.evaluate(() => { const w = /** @type {any} */ (window); w.__e2eScrollTrace = []; const t0 = performance.now(); const iv = setInterval(() => { const el = document.querySelector(".screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll"); w.__e2eScrollTrace.push({ at: Math.round(performance.now() - t0), y: el ? Math.round(el.scrollTop) : null, max: el ? el.scrollHeight - el.clientHeight : null, restoring: document.body.classList.contains("scroll-restoring") }); if (performance.now() - t0 > 4000) clearInterval(iv); }, 100); });
    await sleep(1500);
    note(`${arm} after the reload: tour offer ${await declineTour() ? 'SHOWN (declined)' : 'not shown'}`);
    await page.waitForFunction(() => window.AudioPlayer && window.AudioPlayer.getState().queue.length > 0, { timeout: 10000 }).catch(() => {});
    await page.waitForFunction(() => window.__e2eBootIdb && window.__e2eBootIdb.done, { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => (window.__e2eScrollTrace || []).length >= 30, { timeout: 6000 }).catch(() => {});
    const trace = await page.evaluate(() => window.__e2eScrollTrace || []);
    // Compress the trace to its changes of y (and the restoring flag's edges).
    const steps = trace.filter((s, i) => i === 0 || s.y !== trace[i - 1].y || s.restoring !== trace[i - 1].restoring).map((s) => `${s.at}ms:${s.y}/${s.max}${s.restoring ? 'R' : ''}`);
    note(`${arm} scrollTop after boot (ms:y/max, R = restoring): ${steps.join(' ')}`);
    const edges = await page.evaluate(() => ({ edges: window.__e2eRestoreEdges || [], err: window.__e2eObsErr }));
    note(`${arm} scroll-restoring flag edges (ms:on/off@y): ${edges.edges.map((e) => `${e.at}ms:${e.on ? 'ON' : 'off'}@${e.y}`).join(' ') || 'none seen'}${edges.err ? ' — observer error ' + edges.err : ''}`);
    return readPage();
  };
  // What the boot FOUND, before the app touched anything: the two sessionStorage records
  // written on the reload event, and the IDB record — which says whether the put issued
  // one call before reload() ever landed. The IDB line is evidence for the handoff, not
  // a gate: the sessionStorage record is the path the restore stands on.
  const fmtRec = (r) => (r ? `{y:${r.y}, anchorKey:${JSON.stringify(r.anchorKey)}, anchorOff:${r.anchorOff}}` : 'none');
  const bootReport = (arm, P, yWritten) => {
    const b = P.boot || {}, idb = P.bootIdb || {};
    const pick = (m) => { if (!m) return null; const ks = Object.keys(m); const k = ks.find((k) => m[k] && m[k].y === yWritten) || ks[ks.length - 1]; return k ? { key: k, ...m[k] } : null; };
    const sRec = b.stateRec ? pick(b.stateRec.scrollPositions) : null;
    const iRec = idb.found ? pick(idb.scrollPositions) : null;
    note(`${arm} boot found: sessionStorage state record ${b.stateRec ? `${b.stateRec.bytes} B, screen ${b.stateRec.screen}, scroll ${fmtRec(sRec)}${sRec ? ' (' + sRec.key + ')' : ''}` : 'ABSENT'}; audio record ${b.audioRec ? `time ${b.audioRec.time} url …${String(b.audioRec.url).slice(-22)}` : 'ABSENT'}${b.err ? '; err ' + b.err : ''}`);
    note(`${arm} boot found: IDB vot-state ${idb.done ? (idb.found ? `scroll ${fmtRec(iRec)}${iRec ? ' (' + iRec.key + ')' : ''}` : 'no record' + (idb.note ? ' — ' + idb.note : '')) + (idb.err ? '; err ' + idb.err : '') : 'read did not finish'} — the put before reload() ${iRec && iRec.y === yWritten ? 'LANDED' : 'did NOT land'} (evidence, not a gate)`);
    return { sRec, iRec, audioRec: b.audioRec || null };
  };
  const fmtEvents = (ev) => ev.map((e) => `${e.type}@${e.t.toFixed(3)}s+${e.at}ms`).join(' ');
  // The clock the listener came back to: the currentTime of the FIRST 'playing' the
  // audio element fired after the boot — the instant sound resumed, not a later read.
  const firstPlaying = (P) => (P.audioEvents || []).find((e) => e.type === 'playing') || null;
  // THE SCROLL, in two parts. (1) The restore's LANDING — scrollTop the instant
  // body.scroll-restoring came off — must equal the position written before the reload,
  // exactly. (2) Where the page sits a few seconds later is the scroller's fifth writer's
  // business while a recording plays: the read-along follow keeps the spoken sentence in
  // its band, and it did so before the reload too (a wheel yield is a 4 s ref, not state).
  // So a later position is accepted only when the recording is playing AND the lit
  // sentence is in the band; otherwise the page moved for a reason this walk cannot name.
  const assertScroll = (arm, yWritten, P) => {
    const landed = P.landed;
    if (!landed || landed.y === null) fail(`${arm} the restore never ran (body.scroll-restoring never came off) — page at ${P.y} px against ${yWritten} px`);
    else if (landed.y !== yWritten) fail(`${arm} the restore landed at ${landed.y} px against ${yWritten} px written before the reload (exact is the bar; landed ${landed.at} ms after document start)`);
    else note(`${arm} the restore landed at ${landed.y} px = the ${yWritten} px written before the reload, ${landed.at} ms after document start`);
    if (P.y === yWritten) return;
    const lit = P.lit;
    if (P.status === 'playing' && lit && lit.inBand) note(`${arm} the page now sits at ${P.y} px: the read-along follow moved it to the spoken sentence ("${lit.text}…", top at ${lit.top} px, band ${lit.bandTop}–${lit.bandBot}) — the same writer that follows the voice before a reload`);
    else fail(`${arm} the page moved from ${yWritten} px to ${P.y} px after the restore for no reason this walk can name (status ${P.status}, lit sentence ${lit ? `top ${lit.top} px, band ${lit.bandTop}–${lit.bandBot}, inBand=${lit.inBand}` : 'none'})`);
  };
  void LIVE;

  // ════════ ARM A — same frame ════════
  // A scroll and the takeover in ONE tick. The wheel is not usable here (its scroll
  // event lands on a later frame), so the scroller is written directly and the
  // takeover fired in the same evaluate; nothing debounced can have run in between.
  const navAP = page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).then(() => true, () => false);
  // The reload is synchronous inside the handler, so the evaluate's own return can lose
  // the race with the navigation; the pre-state is stashed in sessionStorage (this tab,
  // survives the reload) and read back if the return did not make it.
  let A0 = null;
  try {
    A0 = await page.evaluate((y) => {
      const el = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll');
      el.scrollTop = y; el.dispatchEvent(new Event('scroll'));
      const P = window.AudioPlayer; const s = P.getState(); const tr = s.queue[s.qi] || {};
      const out = { y: Math.round(el.scrollTop), t: P.getPreciseTime(), key: tr.key || null, status: s.status, reloadBtn: !!document.querySelector('#vot-toast-update button') };
      sessionStorage.setItem('__e2eA0', JSON.stringify(out));
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
      return out;
    }, 900);
  } catch (_e) { A0 = null; }
  const navA = await navAP;
  if (!A0) { try { A0 = JSON.parse(await page.evaluate(() => sessionStorage.getItem('__e2eA0'))); } catch (_e) { A0 = null; } }
  if (!A0) { fail('A the pre-reload state could not be read at all'); A0 = { y: -1, t: -1, key: null, status: null, reloadBtn: false }; }
  note(`A before: letter ${JSON.stringify(title0)} scrollTop=${A0.y} ${A0.status} key ${A0.key} at ${A0.t.toFixed(3)} s --font-scale=${fs0}`);
  if (!navA) fail('A the page did not reload within 30 s of controllerchange');
  if (A0.reloadBtn) fail('A a "Reload" prompt was rendered before the takeover');
  await shot('A-before');
  const A1 = await afterReload('A');
  await shot('A-after');
  note(`A after:  letter ${JSON.stringify(A1.title)} scrollTop=${A1.y} --font-scale=${A1.fs} ${A1.status} key ${A1.key} store=${A1.storeT} clock=${A1.t === null ? 'n/a' : A1.t.toFixed(3)} toast=${JSON.stringify(A1.toast)} shown=${A1.toastShown}`);
  const bootA = bootReport('A', A1, A0.y);
  if (A1.title !== title0) fail(`A the reader came back on ${JSON.stringify(A1.title) || 'a different screen'}, not ${JSON.stringify(title0)}`);
  assertScroll('A', A0.y, A1);
  if (A1.fs !== fs0) fail(`A text size came back as --font-scale=${A1.fs}, was ${fs0}`);
  if (withAudio && A0.key) {
    if (A1.key !== A0.key) fail(`A the player holds ${JSON.stringify(A1.key)}, the reader was listening to ${JSON.stringify(A0.key)}`);
    // The record written on the event must carry the clock read in the same tick …
    const recT = bootA.audioRec ? bootA.audioRec.time : null;
    if (recT === null || Math.abs(recT - A0.t) > CLOCK_TOL_FRAME) fail(`A the clock record carries ${recT} s against ${A0.t.toFixed(3)} s read in the takeover's tick (tolerance ${CLOCK_TOL_FRAME} s, one frame)`);
    // … and sound must come back AT that clock: the first 'playing' after the boot,
    // whether the browser allowed the resume or the reader tapped the toast for it.
    let fp = firstPlaying(A1);
    if (refused && (fp || A1.status === 'playing')) fail(`A playback started with no gesture under the user-gesture-required policy (${fmtEvents(A1.audioEvents)}) — the policy flag did not take, nothing below is about the phone's path`);
    if (!fp && A1.status !== 'playing') {
      // Paused AT the flushed clock, not at the periodic snapshot's whole second.
      if (A1.storeT !== recT) fail(`A the player came back paused at ${A1.storeT} s, not at the ${recT} s the event wrote`);
      else note(`A the player came back paused at exactly the ${recT} s the event wrote`);
      // No new build in this arm, so the toast that carries the tap is arm B's; here a
      // refusal is answered with the bar's own Play, which resumes from the same record.
      note(`A autoplay after the reload: refused (status ${A1.status}); resuming from the bar's Play (the toast's tap is arm B's)`);
      if (!(await ensurePlaying())) fail('A the bar\'s Play did not resume playback after the reload');
      fp = firstPlaying(await readPage());
    } else note('A autoplay after the reload: ALLOWED by this browser');
    note(`A audio events since the boot: ${fmtEvents(A1.audioEvents)}`);
    if (!fp) fail('A sound never came back (no \'playing\' event after the boot)');
    else if (Math.abs(fp.t - A0.t) > CLOCK_TOL_FRAME) fail(`A sound came back at ${fp.t.toFixed(3)} s against ${A0.t.toFixed(3)} s read in the takeover's tick (tolerance ${CLOCK_TOL_FRAME} s, one frame)`);
    else note(`A clock: sound came back at ${fp.t.toFixed(3)} s against ${A0.t.toFixed(3)} s — ${((fp.t - A0.t) * 1000).toFixed(1)} ms, within one frame`);
    if (A1.toastShown && !/tap to continue/i.test(A1.toast)) note('A note: a toast is showing with no new build — ' + JSON.stringify(A1.toast));
  }

  // ════════ ARM B — a real update ════════
  // Same reader, a little later: playing again (a gesture if the browser refused arm A's
  // resume), scrolled by the wheel to a new place and left idle, and then the server
  // publishes a new worker and the app is asked to look for it.
  if (withAudio) { if (!(await ensurePlaying())) fail('B precondition: could not get the recording playing again before the real update'); }
  await wheelTo(400); await sleep(1200);
  const B0 = await readPage();
  swBump = 'walk' + Date.now().toString(36);
  const navB = page.waitForNavigation({ waitUntil: 'load', timeout: 90000 }).then(() => true, () => false);
  const tB = Date.now();
  // Fire and return: update() resolves only once the new worker is installed, by which
  // time it has claimed and the app has reloaded — an evaluate still awaiting it dies
  // with the document ("Execution context was destroyed"). Nothing is awaited in-page.
  await page.evaluate(() => { navigator.serviceWorker.getRegistration().then((r) => r && r.update()); });
  const reloadedB = await navB;
  note(`B before: letter ${JSON.stringify(B0.title)} scrollTop=${B0.y} ${B0.status} key ${B0.key} at ${B0.t === null ? 'n/a' : B0.t.toFixed(1)} s; worker ${served.old} -> ${served.new}`);
  if (!reloadedB) fail(`B the page did not reload within 90 s of the new worker (served ${served.old} -> ${served.new})`);
  else note(`B the new worker took over and the page reloaded ${Date.now() - tB} ms after update() was asked`);
  if (B0.reloadBtn) fail('B a "Reload" prompt was rendered before the takeover — the reload is meant to be instant and unprompted');
  const B1 = await afterReload('B');
  await shot('B-after');
  note(`B after:  letter ${JSON.stringify(B1.title)} scrollTop=${B1.y} --font-scale=${B1.fs} ${B1.status} key ${B1.key} store=${B1.storeT} clock=${B1.t === null ? 'n/a' : B1.t.toFixed(1)} toast=${JSON.stringify(B1.toast)} shown=${B1.toastShown}`);
  const bootB = bootReport('B', B1, B0.y);
  if (B1.title !== B0.title) fail(`B the reader came back on ${JSON.stringify(B1.title) || 'a different screen'}, not ${JSON.stringify(B0.title)}`);
  assertScroll('B', B0.y, B1);
  if (B1.fs !== fs0) fail(`B text size came back as --font-scale=${B1.fs}, was ${fs0}`);
  if (!B1.toastShown || !/just updated/i.test(B1.toast)) fail(`B no "just updated" toast after a real new build (toast ${JSON.stringify(B1.toast)}, shown=${B1.toastShown})`);
  // Exactly ONE update toast on the page, whichever text it carries: the listening offer
  // re-uses the plain toast's element (one element per id), so the plain one is never ALSO shown.
  const toastCount = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /just updated/i.test(e.textContent || '')).length);
  if (toastCount !== 1) fail(`B ${toastCount} elements read "just updated" — want exactly one toast`);
  if (withAudio && B0.key) {
    if (B1.key !== B0.key) fail(`B the player holds ${JSON.stringify(B1.key)}, the reader was listening to ${JSON.stringify(B0.key)}`);
    // The pre-reload read here is seconds before the event (the worker decides when),
    // so the exact clock is the one the EVENT wrote: the record must sit between the
    // read and the reload, and sound must come back at the record, within one frame.
    const recT = bootB.audioRec ? bootB.audioRec.time : null;
    const elapsedMax = (Date.now() - tB) / 1000 + 2;   // read → event, generously
    if (recT === null) fail('B the clock record was not written on the reload event');
    else if (recT < B0.t - CLOCK_TOL_FRAME || recT > B0.t + elapsedMax) fail(`B the clock record carries ${recT} s, outside [${B0.t.toFixed(3)}, ${(B0.t + elapsedMax).toFixed(1)}] s — not the clock at the event`);
    let fp = firstPlaying(B1);
    if (refused && (fp || B1.status === 'playing')) fail(`B playback started with no gesture under the user-gesture-required policy (${fmtEvents(B1.audioEvents)}) — the policy flag did not take`);
    if (!fp && B1.status !== 'playing') {
      // THE REFUSED SHAPE (the phone's): paused AT the flushed clock; the ONE toast reads
      // the listening offer, exactly; one tap resumes at that clock; the toast then goes.
      const LISTEN = 'VOTReader was just updated. Tap to continue listening.';
      note(`B autoplay after the real update: refused (status ${B1.status}); toast ${JSON.stringify(B1.toast)}`);
      if (B1.storeT !== recT) fail(`B the player came back paused at ${B1.storeT} s, not at the ${recT} s the event wrote`);
      else note(`B the player came back paused at exactly the ${recT} s the event wrote`);
      if (B1.toast !== LISTEN) fail(`B the toast reads ${JSON.stringify(B1.toast)}, want exactly ${JSON.stringify(LISTEN)}`);
      if (!/tap to continue listening/i.test(B1.toast)) fail(`B the reader came back silent with no way to continue from the toast (toast ${JSON.stringify(B1.toast)})`);
      else {
        await page.click('#vot-toast-updated');
        await page.waitForFunction(() => (window.__e2eAudioEvents || []).some((e) => e.type === 'playing'), { timeout: 15000 }).catch(() => {});
        const after = await readPage();
        fp = firstPlaying(after);
        if (after.status !== 'playing') fail('B tapping the toast did not resume playback');
        else note('B one tap on the toast resumed playback');
        if (after.toastShown) fail(`B the toast is still showing after the tap (${JSON.stringify(after.toast)})`);
        else note('B the toast went with the tap');
      }
    } else {
      note('B autoplay after the real update: ALLOWED by this browser (plain "just updated" toast)');
      if (B1.toast !== 'VOTReader was just updated.') fail(`B with playback allowed the toast reads ${JSON.stringify(B1.toast)}, want exactly "VOTReader was just updated."`);
    }
    note(`B audio events since the boot: ${fmtEvents((await readPage()).audioEvents)}`);
    if (!fp) fail('B sound never came back (no \'playing\' event after the boot)');
    else if (recT !== null && Math.abs(fp.t - recT) > CLOCK_TOL_FRAME) fail(`B sound came back at ${fp.t.toFixed(3)} s against the ${recT} s the event wrote (tolerance ${CLOCK_TOL_FRAME} s, one frame; the reader was at ${B0.t.toFixed(3)} s when last read)`);
    else if (recT !== null) note(`B clock: sound came back at ${fp.t.toFixed(3)} s against the ${recT} s the event wrote — ${((fp.t - recT) * 1000).toFixed(1)} ms, within one frame (the reader was at ${B0.t.toFixed(3)} s when last read)`);
    if (fp) {
      const p1 = await readPage(); await sleep(1500); const p2 = await readPage();
      if (p2.t <= p1.t) fail('B the clock is not advancing after the resume');
      else note(`B advancing: ${p1.t.toFixed(1)} s → ${p2.t.toFixed(1)} s`);
    }
  }
  // ════════ ARM C — a CLOSE with no reload event ════════
  // The tab closed mid-listen (or the WebView destroyed): nothing fires vot:before-update-reload,
  // so the next boot finds whatever the durable snapshot held. The close is taken at a moment the
  // periodic snapshot is provably STALE (>= 2.5 s behind the live clock — it recurs every 5 s of
  // playback), so a tree without a flush on pagehide cannot pass by closing right after a snapshot.
  // Same browser context: the profile's localStorage survives a tab close; the reopened page's
  // restored bar is read paused, before any tap, and must not have started on its own.
  if (withAudio) {
    const Cpre = await readPage();
    if (Cpre.status !== 'playing') fail(`C precondition: the reader is not playing before the close (${Cpre.status})`);
    else {
      const stale = await page.waitForFunction(() => {
        const s = JSON.parse(localStorage.getItem('vot-audio-pos') || 'null');
        return !!s && window.AudioPlayer.getPreciseTime() - Number(s.time) >= 2.5;
      }, { timeout: 15000 }).then(() => true, () => false);
      const C0 = await readPage();
      const snapBefore = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('vot-audio-pos') || 'null'); return s ? Number(s.time) : null; });
      note(`C before: playing key ${C0.key} at ${C0.t.toFixed(3)} s; the periodic snapshot holds ${snapBefore} s`);
      if (!stale) fail('C precondition: the periodic snapshot never read >= 2.5 s stale within 15 s — the cadence changed, or the clock is not advancing');
      const closedAt = Date.now();
      await page.close();
      const page2 = await ctx.newPage();
      await page2.goto(BASE, { waitUntil: 'load' });
      await page2.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
      await sleep(1500);
      const C1 = await page2.evaluate(() => { const P = window.AudioPlayer; const s = P && P.getState(); const tr = s && s.queue[s.qi] || {}; return { key: tr.key || null, status: s ? s.status : null, storeT: s ? s.time : null }; });
      note(`C after the close + reopen: ${C1.status} key ${C1.key} store=${C1.storeT} (reopened ${Date.now() - closedAt} ms after the close)`);
      if (C1.key !== C0.key) fail(`C the bar came back with ${JSON.stringify(C1.key)}, the reader was listening to ${JSON.stringify(C0.key)}`);
      else if (C1.storeT === null || Math.abs(C1.storeT - C0.t) > 1) fail(`C the bar came back at ${C1.storeT} s, ${(C0.t - (C1.storeT || 0)).toFixed(1)} s behind the ${C0.t.toFixed(3)} s read just before the close (tolerance 1 s; the periodic snapshot held ${snapBefore} s)`);
      else note(`C clock: the bar came back at ${C1.storeT} s against ${C0.t.toFixed(3)} s read just before the close — ${((C1.storeT - C0.t) * 1000).toFixed(0)} ms, within 1 s`);
      if (C1.status === 'playing') fail('C the bar came back PLAYING after a plain reopen — a close is not an update; nothing asked for sound');
      await page2.close().catch(() => {});
    }
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nPASS — the reader came back where they were');
process.exit(failures.length ? 1 : 0);
