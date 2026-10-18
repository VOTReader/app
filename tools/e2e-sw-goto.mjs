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

const finder = (l) => [...document.querySelectorAll('button,[role=button],a')]
  .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0);
async function clickLabel(page, label) {
  await page.waitForFunction((l, s) => !!(new Function('return ' + s)())(l), { timeout: NAV_MS }, label, finder.toString());
  await page.evaluate((l, s) => (new Function('return ' + s)())(l).click(), label, finder.toString());
}
const clickIfPresent = (page, label) => page.evaluate((l, s) => { const b = (new Function('return ' + s)())(l); if (!b) return false; b.click(); return true; }, label, finder.toString());

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
      const before = fails.length;
      try {
        if ((await walk(page, own.url, name)) === 'ran') ran++;
        break;
      } catch (e) {
        fails.length = before;
        if (attempt >= 2 || !(e && e.name === 'TimeoutError')) throw e;
        console.log(`  ${name}: timed out (${e.message.split('\n')[0]}); once more`);
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
