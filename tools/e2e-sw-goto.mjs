/**
 * tools/e2e-sw-goto.mjs — the Scripture Web's go-to keeps clear of the chrome, reads cleanly on a
 * phone, sizes its chips by the compact rule, and keeps the keyboard's place after an edge chip
 * (the navigation stream's review, 2026-10-18; spec 4.5, r3-04).
 *
 * WHY. jsdom lays nothing out, so goto.test.jsx pins gotoBoxPlace on numbers; this walk reads the
 * real layout those numbers stand for. The review measured, at 1600x900, a 640 px box centred over
 * the canvas area at x 480-1120 against a control row starting at about x 1050: it hid the search
 * button that opens it and half of "Scripture", and 1366, 1440 and 1536 were worse.
 *
 *   G1  PC (1366x768, 1600x900, 1920x1080): the open box's rect meets neither .sw-controls nor
 *       .sw-title, and lies inside the root
 *   G2  compact (the phone, 891x411, a root 500 px tall or less): the box covers the title and
 *       the control row by the spec's own geometry, so both are hidden while it is open (no ghost
 *       text behind the query) and back when it closes; the Back button stays
 *   G3  after Enter on John 3:16, the edge chips sit at the frame's gutter (24 PC, 16 compact) in
 *       the spec's size (15 / 13 px); a tap on one leaves the keyboard on the web (the root) or in
 *       the panel, never on the page's body
 *   G4  opened from its search button (a real click, which focuses it), a place chosen leaves the
 *       keyboard on the web or in the panel it opened, never on the button: after a book the web's
 *       Enter takes the centre line rather than reopening the box, and once the panels are closed
 *       with Escape the keyboard is on the web (the review of 2026-10-18 found the button)
 *
 * The page's controls are found by a function handed to puppeteer (findLabel), never a string
 * rebuilt in the page: the app's CSP has no 'unsafe-eval'. Page errors are printed as they come,
 * and a boot that times out is retried once, loudly, in a fresh context.
 *
 * EXIT: 0 pass, 1 fail, 2 nothing-to-check (the screen never drew), 3 harness.
 * Run from the repo root:  node tools/e2e-sw-goto.mjs [--out DIR] [--frames pc1366,pc1600,pc1920,phone]
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveOwnTree } from './e2e-read-serve.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', null);
const FRAMES = {
  pc1366: { w: 1366, h: 768, dpr: 1, mobile: false },
  pc1600: { w: 1600, h: 900, dpr: 1, mobile: false },
  pc1920: { w: 1920, h: 1080, dpr: 1, mobile: false },
  phone: { w: 891, h: 411, dpr: 2.625, mobile: true },
};
const WANT = arg('frames', Object.keys(FRAMES).join(',')).split(',');
const NAV_MS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const note = (s) => console.log('  ' + s);

/** The visible button or link whose name (its aria-label, else its text) starts with l, or null.
 * Puppeteer is handed it as a function. It was a string the page rebuilt with `new Function`,
 * which the app's CSP (script-src without 'unsafe-eval') refuses outside puppeteer's own call:
 * every poll after the first threw, so a control not there at once never turned up and the boot
 * timed out until the retry (review 2026-10-18). */
const findLabel = (l) => [...document.querySelectorAll('button,[role=button],a')]
  .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0) || null;
async function clickLabel(page, label) {
  const h = await page.waitForFunction(findLabel, { timeout: NAV_MS }, label);
  try { await h.evaluate((b) => b.click()); } finally { await h.dispose(); }
}
async function clickIfPresent(page, label) {
  const h = await page.evaluateHandle(findLabel, label);
  try {
    const el = h.asElement();
    if (!el) return false;
    await el.evaluate((b) => b.click());
    return true;
  } finally { await h.dispose(); }
}

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; }, { timeout: NAV_MS });
  await clickLabel(page, 'Continue');
  await clickLabel(page, 'Begin Reading');
  await sleep(500);
  await clickIfPresent(page, 'Maybe later');
  await sleep(200);
  await clickLabel(page, 'Personal Study');
  await sleep(400);
  await clickLabel(page, 'Scripture Web');
  await page.waitForFunction(() => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), { timeout: NAV_MS });
  if (await page.$('.sw-fallback')) return false;
  await page.waitForFunction(() => !document.querySelector('.sw-loading'), { timeout: NAV_MS });
  await sleep(600);
  await clickIfPresent(page, 'Got it');
  await sleep(200);
  return true;
}

/** The box, the chrome and the chips, in the viewport's CSS px. */
const READ = () => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
  const root = document.querySelector('.sw-root');
  const vis = (sel) => { const el = root.querySelector(sel); return el ? getComputedStyle(el).visibility : null; };
  const edges = [...root.querySelectorAll('.sw-goto-edge')].map((el) => ({
    side: el.classList.contains('sw-goto-edge-left') ? 'left' : 'right', box: box(el), font: getComputedStyle(el).fontSize, text: el.textContent,
  }));
  const a = document.activeElement;
  return {
    root: box(root), goto: box(root.querySelector('.sw-goto')), controls: box(root.querySelector('.sw-controls')),
    title: box(root.querySelector('.sw-title')), back: box(root.querySelector('.sw-topbar .sw-btn')),
    vis: { title: vis('.sw-title'), controls: vis('.sw-controls'), back: vis('.sw-topbar .sw-btn') },
    compact: !!root.querySelector('.sw-goto.is-compact'), edges,
    panel: !!root.querySelector('.sw-sheet, .sw-choice, .sw-list'),
    active: a === document.body ? 'body' : a === root ? 'root' : a && a.closest('.sw-sheet, .sw-panel, .sw-choice') ? 'panel' : (a && (a.className || a.tagName)),
  };
};
const meets = (p, q) => !!(p && q && p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b);

async function walk(page, url, name) {
  const f = FRAMES[name];
  await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
  if (!(await boot(page, url))) return 'nothing';
  const shot = async (tag) => { if (OUT) await page.screenshot({ path: resolve(OUT, `${name}-${tag}.png`) }); };
  await page.click('.sw-goto-btn');
  await page.waitForSelector('.sw-goto', { timeout: NAV_MS });
  await page.type('.sw-goto-input', 'John 3:1');
  await sleep(300);
  const open = await page.evaluate(READ);
  await shot('typing');
  const tag = `${name} ${f.w}x${f.h}`;
  if (!open.goto) { fails.push(`${tag}: the box did not open`); return 'ran'; }
  note(`${tag}: box ${Math.round(open.goto.l)}-${Math.round(open.goto.r)} x, top ${Math.round(open.goto.t)}; controls from x ${open.controls && Math.round(open.controls.l)}; title to x ${open.title && Math.round(open.title.r)}; compact ${open.compact}`);
  if (open.goto.l < open.root.l - 0.5 || open.goto.r > open.root.r + 0.5) fails.push(`${tag} G1: the box runs off the root`);
  if (!open.compact) {
    if (meets(open.goto, open.controls)) fails.push(`${tag} G1: the box covers the control row`);
    if (meets(open.goto, open.title)) fails.push(`${tag} G1: the box covers the title`);
  } else {
    if (open.vis.title !== 'hidden' || open.vis.controls !== 'hidden') fails.push(`${tag} G2: the chrome under the compact box shows through (title ${open.vis.title}, controls ${open.vis.controls})`);
    if (open.vis.back !== 'visible') fails.push(`${tag} G2: the Back button went with the chrome`);
  }
  await page.type('.sw-goto-input', '6');
  await sleep(200);
  await page.keyboard.press('Enter');
  await sleep(1800);
  const landed = await page.evaluate(READ);
  await shot('landed');
  if (open.compact && (landed.vis.title !== 'visible' || landed.vis.controls !== 'visible')) fails.push(`${tag} G2: the chrome did not come back when the box closed`);
  note(`${tag}: after Enter on John 3:16 (box opened by its button) the keyboard is on ${landed.active}`);
  if (landed.active !== 'root' && landed.active !== 'panel') fails.push(`${tag} G4: after a go-to to a verse the keyboard is on ${landed.active}`);
  // the box is closed now: the frame's compactness is the open box's
  const gutter = open.compact ? 16 : 24, font = open.compact ? '13px' : '15px';
  if (!landed.edges.length) note(`${tag} G3: no edge chip (no lit thread leaves this frame); the chip arm is skipped`);
  for (const e of landed.edges) {
    note(`${tag}: edge ${e.side} "${e.text}" at x ${Math.round(e.box.l)}-${Math.round(e.box.r)}, ${e.font}`);
    if (e.font !== font) fails.push(`${tag} G3: the ${e.side} edge chip is ${e.font}, wanted ${font}`);
    if (e.side === 'left' && Math.abs(e.box.l - landed.root.l - gutter) > 1) fails.push(`${tag} G3: the left edge chip sits ${Math.round(e.box.l - landed.root.l)} px in, wanted ${gutter}`);
  }
  const chip = landed.edges.find((e) => e.side === 'right') || landed.edges[0];
  if (chip) {
    await page.click(`.sw-goto-edge-${chip.side}`);
    await sleep(1500);
    const after = await page.evaluate(READ);
    await shot('followed');
    note(`${tag}: after Follow the keyboard is on ${after.active}`);
    if (after.active !== 'root' && after.active !== 'panel') fails.push(`${tag} G3: after an edge chip's Follow the keyboard is on ${after.active}`);
  }
  // G4: the box opened by its button again, a book this time (no panel of its own to take focus)
  await page.click('.sw-goto-btn');
  await page.waitForSelector('.sw-goto-input', { timeout: NAV_MS });
  await page.type('.sw-goto-input', 'Romans');
  await sleep(300);
  await page.keyboard.press('Enter');
  await sleep(1500);
  const book = await page.evaluate(READ);
  await shot('book');
  note(`${tag}: after Enter on Romans (box opened by its button) the keyboard is on ${book.active}`);
  if (book.active !== 'root') fails.push(`${tag} G4: after a go-to to a book the keyboard is on ${book.active}, not the web`);
  await page.keyboard.press('Enter');
  await sleep(500);
  const centre = await page.evaluate(READ);
  if (centre.goto) fails.push(`${tag} G4: Enter after the go-to reopened the box (the keyboard was on its button)`);
  for (let k = 0; k < 4; k++) {
    if (!(await page.evaluate(READ)).panel) break;
    await page.keyboard.press('Escape');
    await sleep(400);
  }
  const home = await page.evaluate(READ);
  note(`${tag}: panels closed with Escape, the keyboard is on ${home.active}`);
  if (home.panel) fails.push(`${tag} G4: Escape did not close the panels`);
  else if (home.active !== 'root') fails.push(`${tag} G4: with the panels closed the keyboard is on ${home.active}, not the web`);
  return 'ran';
}

let server = null, browser = null, ran = 0;
try {
  const own = await serveOwnTree();
  server = own.server;
  if (OUT) mkdirSync(OUT, { recursive: true });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 240000 });
  for (const name of WANT) {
    if (!FRAMES[name]) { console.error('[e2e-sw-goto] no frame ' + name); process.exitCode = 3; continue; }
    // one more go in a fresh context when the boot times out (a loaded machine, not the go-to)
    for (let attempt = 1; ; attempt++) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`  PAGEERROR ${name}: ${String((e && e.message) || e).split('\n')[0]}`));
      const before = fails.length;
      try {
        if ((await walk(page, own.url, name)) === 'ran') ran++;
        break;
      } catch (e) {
        fails.length = before;
        if (attempt >= 2 || !(e && e.name === 'TimeoutError')) throw e;
        console.log(`  RETRY ${name}: timed out (${e.message.split('\n')[0]}); once more in a fresh context (a loaded machine, or a fault: read any PAGEERROR lines above)`);
      } finally { await ctx.close().catch(() => {}); }
    }
  }
} catch (e) {
  console.error('[e2e-sw-goto] harness: ' + (e && e.stack || e));
  process.exitCode = 3;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
}
if (process.exitCode !== 3) {
  if (!ran) { console.log('[e2e-sw-goto] NOTHING TO CHECK: the web never drew'); process.exitCode = 2; }
  else if (fails.length) { console.log('[e2e-sw-goto] FAIL\n' + fails.map((s) => '  ' + s).join('\n')); process.exitCode = 1; }
  else console.log(`[e2e-sw-goto] PASS (${ran} frame${ran === 1 ? '' : 's'})`);
}
