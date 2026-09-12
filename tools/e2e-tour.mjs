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
import { TOUR_STEPS } from '../app/src/main/assets/src/utils/tour-steps.js';

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const STRIP_ONLY = argv.includes('--strip-only');   // the strip's geometry legs alone (seconds, no tour walk)

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

/* The stops come from the tour itself (tour-steps.js is pure, so node can import it): a stop
   added to the app is a stop this walk drives, with no list here to forget. The walk went red
   on 2026-09-10 the first time a stop was added without it — "expected stop done, the tour is
   at settings" — and then hung on a label behind the still-open card. The COUNT is pinned by
   tour-steps.test; this instrument's job is each stop on the real screen. */
const STOPS = TOUR_STEPS.map((s) => s.id);
const RINGED = TOUR_STEPS.filter((s) => s.target).map((s) => s.id);            // every stop that rings a control
const EXPECT_SCREEN = Object.fromEntries(TOUR_STEPS.filter((s) => s.target).map((s) => [s.id, s.screen]));

/* THE STRIP'S GEOMETRY (journey F1.1 + F1.2, 2026-09-12). The "New here?" strip must be as tall as
   its words — a strip capped shorter scrolls INSIDE itself with no scrollbar on touch, and "Don't
   show this again" is cut off or off the frame (every landscape phone at Text Size 1; a portrait
   phone at Text Size 3) — and neither of its two buttons may break a word ("SHOW ME / AROUND" on
   320 and 360) — nor overflow the strip sideways, which is where two unbreakable labels go when
   the row cannot wrap (bite C, 2026-09-12: the leg was green over a 23 px overflow until it read
   the row's scrollWidth — and green again over a 33 px spill off the START, which scrollWidth
   cannot see, until it read every button's box and ink against the row on both sides;
   verifier-2's finding). Read as geometry, not as CSS: a rule can be present and still not bind. */
async function stripGeometry(page, note) {
  // The web font decides where a label wraps; read after it has arrived (capped: a font that never
  // comes must not hang the leg, and the read then says so through the wrap count).
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]));
  const g = await page.evaluate(() => {
    const p = document.querySelector('.tour-prompt'); if (!p) return null;
    const r = p.getBoundingClientRect();
    const never = p.querySelector('.tour-never'); const nr = never ? never.getBoundingClientRect() : null;
    const row = p.querySelector('.tour-row');
    const btns = [...p.querySelectorAll('.tour-btn')];
    const prim = btns.find((b) => b.classList.contains('primary')); const later = btns.find((b) => !b.classList.contains('primary'));
    // Line boxes of the label's text: one rect per line the words occupy.
    const inkRects = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].filter((x) => x.width > 0); };
    const lines = (el) => inkRects(el).length;
    // The ink's extent against the row, on BOTH sides. scrollWidth sees only what spills off the
    // END: with `justify-content: flex-end` two unbreakable buttons spill off the START, and a
    // 360 phone showed the primary's box at -33..165 with its ink at -16 px — off the screen's
    // left edge — while scrollWidth read 0 (verifier-2, 2026-09-12).
    const rr = row ? row.getBoundingClientRect() : null;
    const ink = btns.flatMap(inkRects);
    const inkLeft = ink.length ? Math.min(...ink.map((x) => x.left)) : null;
    const inkRight = ink.length ? Math.max(...ink.map((x) => x.right)) : null;
    const boxLeft = btns.length ? Math.min(...btns.map((b) => b.getBoundingClientRect().left)) : null;
    const boxRight = btns.length ? Math.max(...btns.map((b) => b.getBoundingClientRect().right)) : null;
    return {
      vh: innerHeight, vw: innerWidth, box: Math.round(r.height), bottom: Math.round(r.bottom),
      scrollsInside: p.scrollHeight > p.clientHeight + 1, scrollH: p.scrollHeight, clientH: p.clientHeight,
      neverBottom: nr ? Math.round(nr.bottom) : null,
      neverInside: !!nr && nr.top >= r.top - 1 && nr.bottom <= r.bottom + 1 && nr.bottom <= innerHeight + 1,
      primaryLines: prim ? lines(prim) : 0, laterLines: later ? lines(later) : 0,
      // Two labels that never wrap can instead push the row past the strip's edge: the row's
      // scrollWidth is the one number that sees it (a rect-inside check would too; this is cheaper).
      rowOverflow: row ? Math.max(0, row.scrollWidth - row.clientWidth) : 0,
      spillStart: rr && boxLeft !== null ? Math.max(0, Math.round(rr.left - Math.min(boxLeft, inkLeft))) : 0,
      spillEnd: rr && boxRight !== null ? Math.max(0, Math.round(Math.max(boxRight, inkRight) - rr.right)) : 0,
      inkLeft: inkLeft === null ? null : Math.round(inkLeft), inkRight: inkRight === null ? null : Math.round(inkRight),
      rowLeft: rr ? Math.round(rr.left) : null, rowRight: rr ? Math.round(rr.right) : null,
      fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim() || '1',
    };
  });
  if (!g) { fail(`${note}: no strip to measure`); return; }
  const where = `${note} (${g.vw}x${g.vh}, text ${g.fontScale}x)`;
  let bad = false;
  if (g.scrollsInside) { bad = true; fail(`${where}: the strip scrolls inside itself — ${g.scrollH} px of words in a ${g.clientH} px box`); }
  if (!g.neverInside) { bad = true; fail(`${where}: "Don't show this again" is outside the strip or the frame (bottom ${g.neverBottom}, strip bottom ${g.bottom}, frame ${g.vh})`); }
  if (g.primaryLines !== 1 || g.laterLines !== 1) { bad = true; fail(`${where}: a button label wraps (Show me around ${g.primaryLines} lines, Maybe later ${g.laterLines})`); }
  if (g.rowOverflow > 1 || g.spillStart > 1 || g.spillEnd > 1) { bad = true; fail(`${where}: a button spills out of the row — ${g.spillStart} px off the start, ${g.spillEnd} px off the end (ink ${g.inkLeft}..${g.inkRight} in a row ${g.rowLeft}..${g.rowRight}; scrollWidth overflow ${g.rowOverflow})`); }
  if (!bad) ok(`${where}: strip ${g.box} px, never-link inside at ${g.neverBottom}/${g.vh}, both labels one line`);
}

/* Strip only, no tour: About → Home, then the strip at Text Size 1 / 1.8 / 3 through the inline
   --font-scale (the strip's type reads it through the --fs-* tokens; the tour's own walk above sets
   the size through the app's state, which is the slower and fuller instrument). A landscape phone
   is not a frame the tour walk drives, and this is the frame the cap cut the strip on. */
async function stripOnly(browser, { width, height, label, scales }) {
  console.log(`\n== ${label} ${width}x${height} strip only`);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(u)) r.respond({ status: 404, body: '' }); else r.continue(); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  await sleep(600);
  const click = async (l) => {
    await page.waitForFunction((l) => [...document.querySelectorAll('button,[role=button]')].some((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0), { timeout: 30000 }, l);
    await page.evaluate((l) => { const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0); b.click(); }, l);
    await sleep(400);
  };
  await click('Continue'); await click('Begin Reading');
  await page.waitForFunction(() => document.querySelector('.tour-prompt'), { timeout: 15000 });
  await sleep(500);
  for (const s of scales) {
    await page.evaluate((v) => document.documentElement.style.setProperty('--font-scale', String(v)), s);
    await sleep(300);
    await stripGeometry(page, `${label} strip`);
    if (shotsDir) await page.screenshot({ path: resolve(shotsDir, `${label}-strip-x${s}.png`) });
  }
  await page.close();
  await context.close();
  return errors;
}
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
      dimBoxes: [...document.querySelectorAll('.tour-dim')].map(box),
      docked: !!(card && card.classList.contains('docked')),
      bar: box(document.querySelector('.audio-bar')),
      column: box(document.querySelector('.letter-body, .chapter-body')),
      scrollerTop: (() => { const c = document.querySelector('.letter-body, .chapter-body'); const s = c && c.closest('.screen-scroll'); return s ? Math.max(0, s.getBoundingClientRect().top) : 0; })(),
      fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
      scrollPad: (() => { const c = document.querySelector('.letter-body, .chapter-body'); const s = c && c.closest('.screen-scroll'); return s ? parseFloat(getComputedStyle(s).scrollPaddingBottom) || 0 : null; })(),
      skip: !!(card && [...card.querySelectorAll('button')].find((b) => /leave the tour/i.test(b.getAttribute('aria-label') || ''))),
      back: card ? (() => { const b = [...card.querySelectorAll('button')].find((b) => /previous stop/i.test(b.getAttribute('aria-label') || '')); return b ? (b.disabled ? 'disabled' : 'enabled') : 'missing'; })() : 'missing',
      primary: card ? (card.querySelector('.tour-btn.primary') || {}).textContent : null,
      prompt: !!document.querySelector('.tour-prompt'),
      focusInside: !!(card && card.contains(document.activeElement)),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      tourDone: !!(window.TourDoneFlagStore && window.TourDoneFlagStore.is()),
      pressed: !!(st && st.pressed),
      // THE DEMONSTRATION. `demo` is every element wearing the marker; `demoOn` is the subset
      // that also carries the real highlight's wash AND is on screen, so "it painted" cannot be
      // satisfied by a class on the pager's parked copy of the page.
      demo: document.querySelectorAll('.tour-hl-demo').length,
      demoOn: [...document.querySelectorAll('.letter-para.tour-hl-demo.hl-mark')].filter((p) => {
        const r = p.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
      }).length,
      // Segments in the annotation store. The tour must not add one, at any exit.
      annCount: (() => {
        try {
          const all = window.AnnotationStore && window.AnnotationStore.all ? window.AnnotationStore.all() : null;
          return all ? Object.values(all).reduce((n, a) => n + (a ? a.length : 0), 0) : -1;
        } catch (_e) { return -1; }
      })(),
      text: card ? (card.querySelector('.tour-text') || {}).textContent : null,
      vh: window.innerHeight,
    };
  });
  const shot = async (name) => { if (shotsDir) await page.screenshot({ path: resolve(shotsDir, `${label}-${light ? 'light' : 'dark'}-${name}.png`) }); };

  // About → Home; the strip appears on Home only.
  await clickLabel('Continue'); await clickLabel('Begin Reading');
  if (SCALE !== 1) {
    // Text Size as the reader sets it: the Settings slider, so the change goes through React and
    // usePersistedState writes it. Until 2026-09-04 this wrote StateStore directly, and the next
    // effect tick from the hook wrote the old settings back: every "1.8" walk here had run at 1
    // (the var read 1.8 for 400 ms, then hydration and the hook put 1 back). The stops re-check.
    await clickLabel('App Configuration'); await sleep(500);
    await page.evaluate(() => { const head = [...document.querySelectorAll('.settings-group-head')].find((h) => /Appearance/.test(h.textContent)); if (head && head.getAttribute('aria-expanded') !== 'true') head.click(); });
    await sleep(400);
    const slid = await page.evaluate((sc) => {
      const head = [...document.querySelectorAll('.settings-group-head')].find((h) => /Appearance/.test(h.textContent));
      const el = document.querySelector('.txtsize-slider'); if (!el) return 'no slider (Appearance group ' + (head ? head.getAttribute('aria-expanded') : 'missing') + '; on "' + document.title + '", heads: ' + [...document.querySelectorAll('.settings-group-head')].map((h) => h.textContent.trim().slice(0, 20)).join(' | ') + ')';
      el.scrollIntoView({ block: 'center' });
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(sc)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    }, SCALE);
    await sleep(700);
    const got = await page.evaluate(() => ({ store: String((window.StateStore.get().settings || {}).fontScale), css: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim() }));
    if (slid !== 'ok' || got.store !== String(SCALE) || got.css !== String(SCALE)) fail(`text size ${SCALE} did not take (${slid}; store ${got.store}, --font-scale ${got.css || 'unset'})`); else ok(`text size ${SCALE}x through the slider (store ${got.store}, --font-scale ${got.css})`);
    await clickLabel('Home'); await sleep(500);
  }
  await sleep(500);
  let f = await facts();
  if (!f.prompt) fail('the strip did not appear on Home after About');
  else ok('the strip offers the tour on Home');
  if (f.prompt) await stripGeometry(page, `${label} strip`);
  await shot('00-prompt');
  await clickLabel('Prophetic Letters'); await sleep(400);
  if ((await facts()).prompt) fail('the strip is showing off Home'); else ok('the strip is Home-only');
  await clickLabel('Back to Home'); await sleep(400);
  await clickLabel('Maybe later'); await sleep(200);
  if ((await facts()).prompt) fail('Maybe later did not hide the strip'); else ok('Maybe later hides the strip');
  // A reload brings it back (session-only), then Don't show this again ends it for good.
  await page.reload({ waitUntil: 'load' });
  if (SCALE !== 1) { await sleep(600); console.log(`  --font-scale after reload: ${(await facts()).fontScale} (store ${await page.evaluate(() => String((window.StateStore.get().settings || {}).fontScale))})`); }
  await page.waitForFunction(() => document.querySelector('.tour-prompt') || document.querySelector('.about-continue'), { timeout: 30000 });
  await sleep(500);
  if (!(await facts()).prompt) fail('the strip did not return after a reload following Maybe later'); else ok('Maybe later is session-only');
  await clickLabel('Don'); await sleep(300);
  if ((await facts()).prompt) fail("Don't show this again did not hide the strip");
  await page.reload({ waitUntil: 'load' });
  if (SCALE !== 1) { await sleep(600); console.log(`  --font-scale after reload: ${(await facts()).fontScale} (store ${await page.evaluate(() => String((window.StateStore.get().settings || {}).fontScale))})`); }
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
    if (RINGED.includes(id)) {
      /* Wait for the ring to EXIST and then to STOP MOVING, and the second half is not a
         nicety. The overlay re-scrolls an off-screen target for up to RESCROLL_WINDOW_MS,
         so a small control is settled on the frame its ring appears and a TALL one is not:
         the highlight stop rings a 583 px paragraph, and read on its first frame the ring
         sat at -5..562 of 800 while its settled position is 134..733. Measuring the first
         frame reported "the ring is off screen" about a ring that was on its way to being
         perfectly placed. Bounded at 4.5 s (past the 2.5 s window), and every assertion
         below still runs on whatever this loop ends on -- a ring that never settles fails,
         it does not wait forever. */
      let ringSig = null;
      for (let i = 0; i < 30; i++) {
        const g = await facts();
        const cur = g.ring ? `${Math.round(g.ring.t)}:${Math.round(g.ring.b)}` : null;
        if (cur && cur === ringSig) break;
        ringSig = cur;
        await sleep(150);
      }
      f = await facts();
      if (!f.ring || !f.target) fail(`${id}: no ring on the control (target ${f.target ? 'found' : 'missing'})`);
      else {
        const pad = 8;
        /* A TEXT TARGET IS NOT A CONTROL, and two of the assertions here are about controls.
           The highlight stop rings a PARAGRAPH — 551 to 583 px of a 360x800 phone, measured —
           and the reading column's scroller starts at 67, so "the whole ring is on screen with
           the card clear of it" is arithmetically impossible and says nothing about whether the
           stop works. What matters for a paragraph is that the reader can SEE the colour and
           reach the text to long-press it, which is asserted below instead — not skipped. */
        const textTarget = id === 'highlight';
        if (!(f.ring.l <= f.target.l - pad + 1 && f.ring.t <= f.target.t - pad + 1 && f.ring.r >= f.target.r + pad - 1 && f.ring.b >= f.target.b + pad - 1)) fail(`${id}: the ring does not wrap the control`);
        // The card never covers the control: at a large text size it is capped to the room beside the
        // ring and scrolls inside itself (device run 2026-09-04). The one exception is a ring so tall
        // that not even the card's 160 px floor fits beside it; then the card wins.
        const roomForFloor = f.target.b - f.target.t + 16 + 160 + 60 <= f.vh;
        if (f.card && roomForFloor && !textTarget && !(f.card.b <= f.target.t + 1 || f.card.t >= f.target.b - 1)) fail(`${id}: the card covers the control`);
        // Listen stops dock: the card sits on the bottom edge (above the player bar when it is up),
        // never beside the ring, so the text column above it is the reader's (Corbin's walk, 2026-09-04).
        if (id === 'listen' || id === 'bible' || id === 'highlight') {
          if (!f.docked) fail(`${id}: the card is not docked`);
          const floor = f.bar ? f.bar.t : f.vh;
          if (f.card && Math.abs(f.card.b - (floor - 12)) > 2) fail(`${id}: the docked card's bottom is at ${Math.round(f.card.b)}, expected ${Math.round(floor - 12)}`);
          // The rule the 36 % preference exists to serve: at least DOCK_OPEN_FRAC of the screen stays
          // open above the docked card. Asserting the fraction itself was wrong on a short screen —
          // 36 % of 640 is 230 px where the Listen words need 270, so the card scrolled and its own
          // button row covered the last sentence (2026-09-06). The card may now take what it needs up
          // to this line, and this is the line.
          if (f.card && f.card.t < Math.floor(f.vh * 0.55) - 1) fail(`${id}: the docked card leaves only ${Math.round(f.card.t)} px of ${f.vh} open above it, under 55 %`);
        } else if (f.docked) fail(`${id}: docked, but it is not a stop that shows something on the text`);
        if (!textTarget && (f.ring.t < 0 || f.ring.b > f.vh + 1)) fail(`${id}: the ring is off screen (${Math.round(f.ring.t)}..${Math.round(f.ring.b)} of ${f.vh})`);
        if (textTarget) {
          /* What a paragraph target owes the reader, in place of the two control assertions:
             a band of it visible between the top of the reading column and the docked card,
             big enough to see a colour on and to put a finger on. 120 px is about three lines
             at 1x and one at 1.8x. Reported with its numbers either way, so a green here is a
             measurement and not an absence. */
          const openTop = Math.max(f.target.t, f.scrollerTop);
          const openBot = Math.min(f.target.b, f.card ? f.card.t : f.vh);
          const band = Math.round(openBot - openTop);
          if (band < 120) fail(`${id}: only ${band} px of the paragraph is between the column top (${Math.round(f.scrollerTop)}) and the card (${Math.round(f.card ? f.card.t : f.vh)}) — the reader cannot see or reach it`);
          else ok(`${id}: ${band} px of the paragraph is open between the column top and the card (paragraph ${Math.round(f.target.b - f.target.t)} px)`);
        }
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
      // Once Listen is pressed the words are the ring: no ring, and no dim pane between the top of
      // the reading column's scroller and the card, so wherever read-along lights a line it is the
      // brightest thing on the screen. The card still sits above the player bar.
      if (f.ring) fail(`${id}: a ring is still drawn after the press`);
      if (f.dims !== 4) fail(`${id}: ${f.dims} dim panes after the press, expected 4`);
      if (f.card) {
        const floor = f.bar ? f.bar.t : f.vh;
        if (Math.abs(f.card.b - (floor - 12)) > 2) fail(`${id}: after the press the docked card's bottom is at ${Math.round(f.card.b)}, expected ${Math.round(floor - 12)}`);
        const covered = f.dimBoxes.filter((d) => d.w > 0 && d.h > 0 && d.t < f.card.t - 1 && d.b > f.scrollerTop + 1);
        if (covered.length) fail(`${id}: a dim pane covers the reading column between ${Math.round(f.scrollerTop)} and the card at ${Math.round(f.card.t)}: ${covered.map((d) => `${Math.round(d.t)}..${Math.round(d.b)}`).join(', ')}`);
        if (Math.abs((f.scrollPad || 0) - (f.vh - f.card.t)) > 2) fail(`${id}: the scroller's scroll-padding-bottom is ${f.scrollPad}, the docked card covers ${Math.round(f.vh - f.card.t)} (read-along's band would run under it)`);
        // The docked card's contract (TourOverlay DOCK_OPEN_FRAC): its top at or below 55 % of the screen.
        if (f.column && f.card.t < f.vh * 0.55 - 1) fail(`${id}: the card's top at ${Math.round(f.card.t)} leaves ${Math.round(100 * f.card.t / f.vh)} % of the screen open above it, expected 55 %`);
        else ok(`${id}: the reading column is open from ${Math.round(f.scrollerTop)} to the card at ${Math.round(f.card.t)} (${Math.round(100 * (f.card.t - f.scrollerTop) / (f.vh - f.scrollerTop))} % of it), card ${Math.round(f.card.b - f.card.t)} px, scroll-padding ${Math.round(f.scrollPad || 0)}, text ${f.fontScale || '1'}x, no ring`);
        if (String(f.fontScale || '1') !== String(SCALE)) fail(`${id}: --font-scale is ${f.fontScale || 'unset'} at this stop, the walk asked for ${SCALE}`);
      }
      await shot(`${STOPS.indexOf(id)}-${id}-pressed`);
    }
    if (id === 'highlight') {
      /* THE DEMONSTRATION, and the whole of what makes it safe. Next paints the real
         highlight's colour on the ringed paragraph and the tour STAYS, the same shape as a
         Listen press. Exactly one paragraph wears it and that one is on screen: a count of one
         is what separates "it painted the paragraph the reader is looking at" from "it painted
         every paragraph in the document", which every other assertion here would accept. */
      const annBefore = (await facts()).annCount;
      if (annBefore < 0) fail('highlight: the annotation store could not be read, so nothing below is evidence about it');
      await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });
      await sleep(600);
      f = await facts();
      if (f.step !== id || !f.pressed) fail(`highlight: the tour did not stay after the demonstration (at ${f.step}, pressed ${f.pressed})`);
      if (f.demoOn !== 1) fail(`highlight: ${f.demoOn} paragraphs carry the wash on screen, expected exactly 1 (marker total ${f.demo})`);
      else if (!/See the colour/.test(f.text || '')) fail(`highlight: after the demonstration the card does not say what to look for ("${f.text}")`);
      else ok('highlight: one paragraph on screen wears the real highlight, and the card names it');
      if (f.annCount !== annBefore) fail(`highlight: the demonstration wrote to the annotation store (${annBefore} \u2192 ${f.annCount})`);
      if (f.card && (f.card.t < 0 || f.card.b > f.vh + 1)) fail('highlight: the card is off screen after the demonstration');
      // Once the colour is on, the paragraph is the ring: the gold ring goes and the dims leave
      // the reading column open, so the thing the reader was told to look at is the brightest
      // thing on the screen. Same contract as a pressed Listen stop, same reason.
      if (f.ring) fail('highlight: a ring is still drawn after the demonstration');
      if (f.dims !== 4) fail(`highlight: ${f.dims} dim panes after the demonstration, expected 4`);
      if (f.card) {
        const covered = f.dimBoxes.filter((d) => d.w > 0 && d.h > 0 && d.t < f.card.t - 1 && d.b > f.scrollerTop + 1);
        if (covered.length) fail(`highlight: a dim pane covers the reading column between ${Math.round(f.scrollerTop)} and the card at ${Math.round(f.card.t)}`);
      }
      await shot(`${STOPS.indexOf(id)}-${id}-painted`);
    }
    if (id === 'listen') {
      // Tab stays inside the card; the reader can press Next with the keyboard.
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      if (!(await facts()).focusInside) fail('listen: Tab left the card');
    }
    await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });
    await sleep(id === 'done' ? 400 : 1400);   // every stop but the closing card navigates or rings
    if (id === 'highlight') {
      // The colour goes with the stop. Asserted on the way out rather than at the end of the
      // walk, because by then the letter screen is gone and its absence would prove nothing.
      const g = await facts();
      if (g.demo !== 0) fail(`highlight: ${g.demo} elements still carry the demonstration after moving on`);
      else ok('highlight: the colour left with the stop');
    }
  }
  f = await facts();
  if (f.annCount > 0) fail(`the whole tour left ${f.annCount} annotation(s) in the store; a tour must teach highlighting without saving one`);
  else if (f.annCount === 0) ok('the whole tour wrote not one annotation');
  else fail('the annotation store could not be read at the end of the walk');
  if (f.demo !== 0) fail(`${f.demo} elements still carry the demonstration after Done`);
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

  /* LEAVING FROM THE DEMONSTRATION ITSELF. The walk above proves the tour that RUNS TO THE END
     saves nothing; a reader who leaves while the colour is on the page is the other half, and
     it is the half where an undo would have to run. Skip, not Escape, because Skip is the
     button on the card and Escape is already covered above. */
  await clickLabel('App Configuration'); await sleep(400);
  await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); h && h.scrollIntoView({ block: 'center' }); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });
  await sleep(300);
  await clickLabel('Show me around');
  await page.waitForFunction(() => document.querySelector('.tour-card'), { timeout: 20000 });
  {
    let at = null;
    // By id, never by a count: the stops that stay take two presses each.
    for (let i = 0; i < 14; i++) {
      at = (await facts()).step;
      if (at === 'highlight') break;
      await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });
      await sleep(1200);
    }
    if (at !== 'highlight') fail(`the Skip arm never reached the highlight stop (stopped at ${at})`);
    else {
      const before = (await facts()).annCount;
      await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });   // paint
      await sleep(600);
      const painted = await facts();
      if (painted.demoOn !== 1) fail(`the Skip arm did not paint anything to leave behind (demoOn ${painted.demoOn})`);
      await page.evaluate(() => { const b = [...document.querySelectorAll('.tour-card button')].find((x) => /leave the tour/i.test(x.getAttribute('aria-label') || '')); b && b.click(); });
      await sleep(500);
      const after = await facts();
      if (after.active) fail('Skip from the highlight stop did not end the tour');
      if (after.demo !== 0) fail(`Skip from the highlight stop left ${after.demo} element(s) wearing the demonstration`);
      if (after.annCount !== before) fail(`Skip from the highlight stop changed the annotation store (${before} \u2192 ${after.annCount})`);
      if (!after.active && after.demo === 0 && after.annCount === before) ok('Skip from the demonstration: the colour goes, the store is untouched');
    }
  }

  await page.close();
  await context.close();
  return errors;
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const errs = [];
  // 320x640 first: every tour defect anyone has measured came from that frame, and neither the
  // 36 % cap nor the 55 % floor binds at 800 tall, so a two-viewport run could not see the rule
  // it was judging (the Verifier, 2026-09-10).
  if (!STRIP_ONLY) {
    errs.push(...await run(browser, { width: 320, height: 640, label: 'small-phone' }));
    errs.push(...await run(browser, { width: 360, height: 800, label: 'phone' }));
    errs.push(...await run(browser, { width: 800, height: 1280, label: 'tablet', light: true }));
  }
  // The strip at the sizes and the frame the tour walks do not reach (F1.1 measured on both).
  errs.push(...await stripOnly(browser, { width: 800, height: 360, label: 'landscape-phone', scales: [1, 1.8, 3] }));
  errs.push(...await stripOnly(browser, { width: 360, height: 800, label: 'phone', scales: [1, 1.8, 3] }));
  const real = errs.filter((e) => !/ERR_FAILED|Failed to load resource|404|net::/.test(e));
  if (real.length) fail('browser errors:\n  ' + real.slice(0, 8).join('\n  '));
} finally { await browser.close(); server.close(); }
if (served === 0) failures.push('the harness served nothing: the browser loaded some other origin');
console.log(`served ${served} requests from ${BASE}`);
if (failures.length) { console.log(`\n${failures.length} FAILED`); process.exit(1); }
console.log('\ne2e-tour PASS');
