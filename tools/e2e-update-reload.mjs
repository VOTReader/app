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
 * Two arms, in one browser context:
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
 *
 * Autoplay is measured under Chrome's DEFAULT policy — no --autoplay-policy flag — with a
 * real gesture on the page before the reload, exactly the reader's situation. Whether the
 * browser allows the resume or refuses it is printed as a fact, and arm 2 passes either
 * way as long as the tap path works when it must.
 *
 * The recording is a 60 s WAV the harness synthesises and serves in place of every
 * release mp3 (with Range answers, or Chrome treats it as unseekable and a seek restarts
 * it), so the walk is offline and the clock is real: the app's resume rule refuses
 * positions under 30 s, so the reader is put at ~40 s.
 *
 * Two instrument lessons, paid for on this walk's RED (2026-09-10), both of which read
 * as "the restore lost the position" until measured:
 *   - a driver click on the hero Listen pill scrolls the pill into view FIRST and so
 *     undid the 900 px scroll the walk was about to assert — start the recording
 *     before scrolling, never after;
 *   - "the tall .screen-scroll" is an inert pager PEEK clone of a neighbouring letter,
 *     not the live scroller; the live one is
 *     .screen-layout > .pager-viewport > .screen-scroll, and the app's own __scrollEl
 *     is that element (probed by identity, not assumed). */
import http from 'node:http';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const withAudio = !argv.includes('--no-audio');
const CLOCK_TOL_FRAME = 0.05;   // arm A: one frame at 60 Hz between the read and the write
const CLOCK_TOL = 1.0;          // arm B: the idle path, whole-second snapshot refreshed on the event
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

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=d3d11'] });
console.log(`browser ${await browser.version()}  audio=${withAudio ? 'on' : 'off'}`);
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
    await booted(); await sleep(1500);
    note(`${arm} after the reload: tour offer ${await declineTour() ? 'SHOWN (declined)' : 'not shown'}`);
    await page.waitForFunction(() => window.AudioPlayer && window.AudioPlayer.getState().queue.length > 0, { timeout: 10000 }).catch(() => {});
    return readPage();
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
  if (A1.title !== title0) fail(`A the reader came back on ${JSON.stringify(A1.title) || 'a different screen'}, not ${JSON.stringify(title0)}`);
  if (A1.y !== A0.y) fail(`A scroll came back at ${A1.y} px against ${A0.y} px written in the takeover's own tick (exact is the bar)`);
  if (A1.fs !== fs0) fail(`A text size came back as --font-scale=${A1.fs}, was ${fs0}`);
  if (withAudio && A0.key) {
    if (A1.key !== A0.key) fail(`A the player holds ${JSON.stringify(A1.key)}, the reader was listening to ${JSON.stringify(A0.key)}`);
    // The clock the bar came back to. Playing: the element has advanced since the seek, so the
    // fair reading is the store's restored value (what the seek was told); paused: the same.
    const clockA = A1.storeT;
    if (clockA === null || Math.abs(clockA - A0.t) > CLOCK_TOL_FRAME) fail(`A the bar came back at ${clockA} s against ${A0.t.toFixed(3)} s read in the takeover's tick (tolerance ${CLOCK_TOL_FRAME} s, one frame)`);
    else note(`A clock: ${clockA} s against ${A0.t.toFixed(3)} s — within one frame; autoplay after the reload: ${A1.status === 'playing' ? 'ALLOWED' : 'refused (status ' + A1.status + ')'}`);
    if (A1.toastShown) note('A note: a toast is showing with no new build — ' + JSON.stringify(A1.toast));
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
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
  const reloadedB = await navB;
  note(`B before: letter ${JSON.stringify(B0.title)} scrollTop=${B0.y} ${B0.status} key ${B0.key} at ${B0.t === null ? 'n/a' : B0.t.toFixed(1)} s; worker ${served.old} -> ${served.new}`);
  if (!reloadedB) fail(`B the page did not reload within 90 s of the new worker (served ${served.old} -> ${served.new})`);
  else note(`B the new worker took over and the page reloaded ${Date.now() - tB} ms after update() was asked`);
  if (B0.reloadBtn) fail('B a "Reload" prompt was rendered before the takeover — the reload is meant to be instant and unprompted');
  const B1 = await afterReload('B');
  await shot('B-after');
  note(`B after:  letter ${JSON.stringify(B1.title)} scrollTop=${B1.y} --font-scale=${B1.fs} ${B1.status} key ${B1.key} store=${B1.storeT} clock=${B1.t === null ? 'n/a' : B1.t.toFixed(1)} toast=${JSON.stringify(B1.toast)} shown=${B1.toastShown}`);
  if (B1.title !== B0.title) fail(`B the reader came back on ${JSON.stringify(B1.title) || 'a different screen'}, not ${JSON.stringify(B0.title)}`);
  if (B1.y !== B0.y) fail(`B scroll came back at ${B1.y} px against ${B0.y} px`);
  if (B1.fs !== fs0) fail(`B text size came back as --font-scale=${B1.fs}, was ${fs0}`);
  if (!B1.toastShown || !/just updated/i.test(B1.toast)) fail(`B no "just updated" toast after a real new build (toast ${JSON.stringify(B1.toast)}, shown=${B1.toastShown})`);
  if (withAudio && B0.key) {
    if (B1.key !== B0.key) fail(`B the player holds ${JSON.stringify(B1.key)}, the reader was listening to ${JSON.stringify(B0.key)}`);
    let playing = B1.status === 'playing';
    if (!playing) {
      const tapOffered = /tap to continue listening/i.test(B1.toast);
      note(`B autoplay after the real update: refused (status ${B1.status}); toast offers the tap: ${tapOffered}`);
      if (!tapOffered) fail(`B the reader came back silent with no way to continue from the toast (toast ${JSON.stringify(B1.toast)})`);
      else {
        await page.click('#vot-toast-updated');
        await page.waitForFunction(() => window.AudioPlayer.getState().status === 'playing' && window.AudioPlayer.getPreciseTime() > 0, { timeout: 15000 }).catch(() => {});
        playing = (await readPage()).status === 'playing';
        if (!playing) fail('B tapping the toast did not resume playback');
        else note('B one tap on the toast resumed playback');
      }
    } else note('B autoplay after the real update: ALLOWED by this browser (plain "just updated" toast)');
    if (playing) {
      const p1 = await readPage(); await sleep(1500); const p2 = await readPage();
      note(`B resumed at ${p1.t.toFixed(1)} s (store ${p1.storeT}; the reader was at ${B0.t.toFixed(1)} s), advancing to ${p2.t.toFixed(1)} s`);
      if (Math.abs(p1.storeT - B0.t) > CLOCK_TOL && Math.abs(p1.t - B0.t) > CLOCK_TOL + 3) fail(`B resumed at ${p1.t.toFixed(1)} s (store ${p1.storeT}), the reader was at ${B0.t.toFixed(1)} s (tolerance ${CLOCK_TOL} s)`);
      if (p2.t <= p1.t) fail('B the clock is not advancing after the resume');
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
