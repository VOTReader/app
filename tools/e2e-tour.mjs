/**
 * e2e-tour — "Show me around" walked end to end in a real browser, at a phone
 * and a tablet size, in both themes.
 *
 *   node tools/e2e-tour.mjs                 # serves its own tree on an ephemeral port
 *   node tools/e2e-tour.mjs --shots DIR     # also write a screenshot per stop
 *
 * What it proves, at every stop, on a FRESH profile (About → Begin Reading → Home):
 *   - the strip offers the tour on Home and nowhere else; Maybe later hides it
 *     for the session; Don't show this again hides it for good (survives reload);
 *   - Show me around opens the welcome card as a labelled modal dialog, with
 *     Skip and Back on the card, Back disabled only on the first card;
 *   - each teaching stop finds its control on the REAL screen: the ring wraps
 *     the control's box, the card does not cover it, the control gains
 *     aria-describedby, and the stop's screen is the one the step promised;
 *   - Tab stays inside the card; Escape means Skip;
 *   - Next on the closing card ends the tour, records the flag, and the strip
 *     does not return; Settings › Help › Show me around starts it again;
 *   - no console errors, no page errors, no horizontal overflow.
 *
 * HERMETIC: nothing is streamed. The Listen pills are pressed (that is what the
 * tour does) and the player is left to fail its fetch quietly; the assertion is
 * that the tour moved on, not that audio played.
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
let served = 0;   // requests this server answered: a green is evidence only if it is > 0 (the Verifier's second half)
function startServer() {
  const server = http.createServer((req, res) => {
    served++;
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
const SCALE = parseFloat((process.argv[process.argv.indexOf('--scale') + 1]) || '1') || 1;   // --scale 1.8: Text Size, through the app's own state
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL ' + m); };
const ok = (m) => console.log('  ok  ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STOPS = ['welcome', 'letters', 'listen', 'bible', 'journal', 'backup', 'done'];
const EXPECT_SCREEN = { letters: 'home', listen: 'vot-one-letter', bible: 'bible-ch', journal: 'journal-home', backup: 'settings' };

async function run(browser, { width, height, label, light }) {
  console.log(`\n== ${label} ${width}x${height} ${light ? 'light' : 'dark'}`);
  // A fresh profile per size: the phone run's durable flags must not leak into the tablet run.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  // Nothing is streamed: audio and the release CDN answer 404 fast instead of hanging the walk.
  await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(u)) r.respond({ status: 404, body: '' }); else r.continue(); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  await sleep(600);
  if (light) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Switch to light theme/.test(x.getAttribute('aria-label') || '')); b && b.click(); }); await sleep(300); }

  const clickLabel = async (label) => {
    await page.waitForFunction((l) => [...document.querySelectorAll('button,[role=button]')].some((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0), { timeout: 10000 }, label);
    await page.evaluate((l) => { const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0); b.click(); }, label);
    await sleep(400);
  };
  const facts = () => page.evaluate(() => {
    const card = document.querySelector('.tour-card');
    const ring = document.querySelector('.tour-ring');
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const st = window.TourController ? window.TourController.getState() : null;
    const target = st && st.step && st.step.target && window.TourController.findTarget(st.step);
    return {
      active: !!(st && st.active), step: st && st.step ? st.step.id : null, ready: st && st.ready,
      screen: (document.querySelector('[data-screen]') || {}).dataset ? document.querySelector('[data-screen]').dataset.screen : null,
      title: document.title,
      dialog: !!(card && card.getAttribute('role') === 'dialog' && card.getAttribute('aria-modal') === 'true'),
      labelled: !!(card && document.getElementById(card.getAttribute('aria-labelledby') || '')),
      card: box(card), ring: box(ring), target: box(target),
      described: !!(target && target.getAttribute('aria-describedby')),
      dims: document.querySelectorAll('.tour-dim').length,
      skip: !!(card && [...card.querySelectorAll('button')].find((b) => /leave the tour/i.test(b.getAttribute('aria-label') || ''))),
      back: card ? (() => { const b = [...card.querySelectorAll('button')].find((b) => /previous stop/i.test(b.getAttribute('aria-label') || '')); return b ? (b.disabled ? 'disabled' : 'enabled') : 'missing'; })() : 'missing',
      primary: card ? (card.querySelector('.tour-btn.primary') || {}).textContent : null,
      prompt: !!document.querySelector('.tour-prompt'),
      focusInside: !!(card && card.contains(document.activeElement)),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      tourDone: !!(window.TourDoneFlagStore && window.TourDoneFlagStore.is()),
      pressed: !!(st && st.pressed),
      text: card ? (card.querySelector('.tour-text') || {}).textContent : null,
      vh: window.innerHeight,
    };
  });
  const shot = async (name) => { if (shotsDir) await page.screenshot({ path: resolve(shotsDir, `${label}-${light ? 'light' : 'dark'}-${name}.png`) }); };

  // About → Home; the strip appears on Home only.
  await clickLabel('Continue'); await clickLabel('Begin Reading');
  if (SCALE !== 1) {
    // Text Size as the reader would have it: through the app's state (the boot writer restores it on reload).
    await page.evaluate((sc) => { const st = window.StateStore.get(); window.StateStore.set({ ...st, settings: { ...(st.settings || {}), fontScale: String(sc) } }); document.documentElement.style.setProperty('--font-scale', String(sc)); }, SCALE);
    await sleep(400);
  }
  await sleep(500);
  let f = await facts();
  if (!f.prompt) fail('the strip did not appear on Home after About');
  else ok('the strip offers the tour on Home');
  await shot('00-prompt');
  await clickLabel('Prophetic Letters'); await sleep(400);
  if ((await facts()).prompt) fail('the strip is showing off Home'); else ok('the strip is Home-only');
  await clickLabel('Back to Home'); await sleep(400);
  await clickLabel('Maybe later'); await sleep(200);
  if ((await facts()).prompt) fail('Maybe later did not hide the strip'); else ok('Maybe later hides the strip');
  // A reload brings it back (session-only), then Don't show this again ends it for good.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.tour-prompt') || document.querySelector('.about-continue'), { timeout: 30000 });
  await sleep(500);
  if (!(await facts()).prompt) fail('the strip did not return after a reload following Maybe later'); else ok('Maybe later is session-only');
  await clickLabel('Don'); await sleep(300);
  if ((await facts()).prompt) fail("Don't show this again did not hide the strip");
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  await sleep(900);
  f = await facts();
  if (f.prompt || !f.tourDone) fail("Don't show this again did not survive a reload"); else ok("Don't show this again is durable");

  // Start from Settings › Help.
  await clickLabel('App Configuration'); await sleep(500);
  await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); h && h.scrollIntoView({ block: 'center' }); h && h.click(); });
  await sleep(400);
  await clickLabel('Show me around');
  await page.waitForFunction(() => document.querySelector('.tour-card'), { timeout: 20000 });
  await sleep(500);

  for (const id of STOPS) {
    f = await facts();
    if (f.step !== id) { fail(`expected stop ${id}, the tour is at ${f.step} (${f.title})`); break; }
    if (!f.dialog || !f.labelled) fail(`${id}: the card is not a labelled modal dialog`);
    if (!f.skip) fail(`${id}: Skip is not on the card`);
    if (f.back !== (id === 'welcome' ? 'disabled' : 'enabled')) fail(`${id}: Back is ${f.back}`);
    if (!f.focusInside) fail(`${id}: focus is not inside the card`);
    if (f.overflowX) fail(`${id}: the page scrolls sideways`);
    const want = EXPECT_SCREEN[id];
    if (want && !new RegExp(want === 'home' ? 'VOTReader' : want === 'vot-one-letter' ? 'Chosen by God' : want === 'bible-ch' ? 'John' : want === 'journal-home' ? 'Journal' : 'Settings').test(f.title)) fail(`${id}: expected the ${want} screen, title is "${f.title}"`);
    if (['letters', 'listen', 'bible', 'journal', 'backup'].includes(id)) {
      // The target may arrive a frame or two after the screen; give the ring a moment.
      for (let i = 0; i < 20 && !(await facts()).ring; i++) await sleep(150);
      f = await facts();
      if (!f.ring || !f.target) fail(`${id}: no ring on the control (target ${f.target ? 'found' : 'missing'})`);
      else {
        const pad = 8;
        if (!(f.ring.l <= f.target.l - pad + 1 && f.ring.t <= f.target.t - pad + 1 && f.ring.r >= f.target.r + pad - 1 && f.ring.b >= f.target.b + pad - 1)) fail(`${id}: the ring does not wrap the control`);
        // The card never covers the control: at a large text size it is capped to the room beside the
        // ring and scrolls inside itself (device run 2026-09-04). The one exception is a ring so tall
        // that not even the card's 160 px floor fits beside it; then the card wins.
        const roomForFloor = f.target.b - f.target.t + 16 + 160 + 60 <= f.vh;
        if (f.card && roomForFloor && !(f.card.b <= f.target.t + 1 || f.card.t >= f.target.b - 1)) fail(`${id}: the card covers the control`);
        if (f.ring.t < 0 || f.ring.b > f.vh + 1) fail(`${id}: the ring is off screen (${Math.round(f.ring.t)}..${Math.round(f.ring.b)} of ${f.vh})`);
        if (!f.described) fail(`${id}: the control is not described by the card`);
        if (f.dims !== 4) fail(`${id}: ${f.dims} dim panes, expected 4`);
        ok(`${id}: ringed on ${f.title}`);
      }
    } else ok(`${id}: card on ${f.title}`);
    // The whole card (Skip, Next) is on screen at every stop, whatever the ring's size or place.
    if (f.card && (f.card.t < 0 || f.card.b > f.vh + 1)) fail(`${id}: the card is off screen (${Math.round(f.card.t)}..${Math.round(f.card.b)} of ${f.vh})`);
    await shot(`${STOPS.indexOf(id)}-${id}`);
    if (id === 'listen' || id === 'bible') {
      // A Listen stop stays after the press, with the words to look for; the second Next moves on.
      await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });
      await sleep(600);
      f = await facts();
      if (f.step !== id || !f.pressed) fail(`${id}: the tour did not stay after pressing Listen (at ${f.step}, pressed ${f.pressed})`);
      else if (!/Hear it\?/.test(f.text || '')) fail(`${id}: after the press the card does not say what to look for ("${f.text}")`);
      else ok(`${id}: pressed Listen and stayed, the card says what to look for`);
      if (f.card && (f.card.t < 0 || f.card.b > f.vh + 1)) fail(`${id}: the card is off screen after the press`);
      await shot(`${STOPS.indexOf(id)}-${id}-pressed`);
    }
    if (id === 'listen') {
      // Tab stays inside the card; the reader can press Next with the keyboard.
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      if (!(await facts()).focusInside) fail('listen: Tab left the card');
    }
    await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });
    await sleep(id === 'letters' || id === 'listen' || id === 'bible' || id === 'journal' || id === 'backup' || id === 'welcome' ? 1400 : 400);
  }
  f = await facts();
  if (f.active) fail('the tour is still active after Done');
  if (!f.tourDone) fail('Done did not record the flag');
  if (f.prompt) fail('the strip came back after the tour');
  ok('Done ends the tour; the strip stays away');

  // Escape means Skip (through the registry), from a fresh start.
  await clickLabel('App Configuration'); await sleep(400);
  await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); h && h.scrollIntoView({ block: 'center' }); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });
  await sleep(300);
  await clickLabel('Show me around');
  await page.waitForFunction(() => document.querySelector('.tour-card'), { timeout: 20000 });
  await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });   // → letters
  await sleep(600);
  await page.keyboard.press('Escape'); await sleep(300);
  f = await facts();
  if (f.active) fail('Escape did not skip the tour'); else ok('Escape means Skip');
  await page.close();
  await context.close();
  return errors;
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const errs = [];
  errs.push(...await run(browser, { width: 360, height: 800, label: 'phone' }));
  errs.push(...await run(browser, { width: 800, height: 1280, label: 'tablet', light: true }));
  const real = errs.filter((e) => !/ERR_FAILED|Failed to load resource|404|net::/.test(e));
  if (real.length) fail('browser errors:\n  ' + real.slice(0, 8).join('\n  '));
} finally { await browser.close(); server.close(); }
if (served === 0) failures.push('the harness served nothing: the browser loaded some other origin');
console.log(`served ${served} requests from ${BASE}`);
if (failures.length) { console.log(`\n${failures.length} FAILED`); process.exit(1); }
console.log('\ne2e-tour PASS');
