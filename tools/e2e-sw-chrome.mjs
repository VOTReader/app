/**
 * tools/e2e-sw-chrome.mjs — the Scripture Web chrome fits the glass, and the
 * pills speak one grammar (design-perf, 2026-09-10, sw-chrome-fit).
 *
 * WHY. One minute after the trim went live, Corbin's Pixel (portrait glass,
 * the web CSS-rotated into landscape) showed the right-anchored pill cluster,
 * the CC-BY credit and the hide-all button cut off by the screen's edge, and
 * three pill fills: translucent gold (the active segment), solid black (the
 * density <select>, painted --bg3), and see-through (everything else).
 *
 * The cut is the rotated root's long side: `.sw-root.sw-rotated { width: 100vh }`,
 * and on mobile Chrome 100vh is the LARGE viewport (URL bar hidden) — taller
 * than the visible one by the bar while it shows. Headless Chrome has no
 * browser controls, so that discrepancy CANNOT be produced here (measured:
 * innerHeight, visualViewport.height, 100vh, 100dvh and 100svh all read the
 * same number under every CDP metrics override tried). The law is pinned by
 * app-css.test.js (the dynamic unit, with the old one as its fallback); THIS
 * walk guards what headless can see, and it is red on the tree the phone
 * showed for the fills, not for the cut:
 *
 *   F1  every .sw-controls child, .sw-hide-all and .sw-credit lies fully inside
 *       the root's own box (the glass, in headless) at 426x952 rotated, 320x640
 *       rotated and 1920x1080; the cluster's right edge is within CORNER px of
 *       the root's right edge and its top within CORNER px of the root's top
 *       (it hugs the corner with one margin)
 *   F2  ONE PILL GRAMMAR: every pill in the strip (.sw-btn, .sw-seg, .sw-select)
 *       and .sw-hide-all has the SAME computed background-color and the same
 *       border-color when not active; an active pill (.is-on) has the one
 *       active fill. Main: the <select> is rgb(--bg3) solid while the rest are
 *       transparent.
 *   F3  every pill's text clears 4.5:1 against the pill's own fill composited
 *       on black (the darkest ground; the web behind is brighter, which is why
 *   F3w the same text over the WORST ground the phone gives it: the web pans
 *       under the fixed strip, so each resting pill's ground is read from
 *       screenshotted pixels (the pill's inner edge strip, 3..8 CSS px inside
 *       the border, where no glyph is drawn) at the boot camera and, after
 *       three asserted zoom steps, at every pan position (a drag at overview
 *       is a tap on a clamped camera), and the ink must clear 3:1 (label grade)
 *       over the brightest pixel found. A pill under which nothing bright
 *       ever passed says so; that pill is not proven either way.
 *       the fill carries a scrim), computed from the same computed styles
 *
 * EXIT: 0 pass, 1 fail, 2 nothing-to-check (the screen never drew), 3 harness.
 * Run from the repo root on a clean tree:  node tools/e2e-sw-chrome.mjs [--out DIR]
 */
import puppeteer from 'puppeteer';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveOwnTree } from './e2e-read-serve.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const num = (k, d) => { const v = process.env[k]; return v === undefined ? d : Number(v); };
const OUT = arg('out', null);
const FRAMES = {
  phone: { w: 426, h: 952, dpr: 2, mobile: true },
  small: { w: 320, h: 640, dpr: 2, mobile: true },
  desktop: { w: 1920, h: 1080, dpr: 2, mobile: false },
};
const WANT = arg('frames', 'phone,small,desktop').split(',');
const NAV_MS = 30000;
const CORNER = num('SWCHROME_CORNER', 16);       // px from the root's right/top edges
const MIN_TEXT_CR = num('SWCHROME_TEXT_CR', 4.5);
const MIN_LABEL_CR = num('SWCHROME_LABEL_CR', 3);   // F3w: worst ground under a panning web, label grade
const PAN_STEPS = num('SWCHROME_PAN_STEPS', 10);
const ZOOM_TARGET = 1.8 ** 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], notes = [];
let nothingToCheck = null;
const note = (s) => { notes.push(s); console.log('  ' + s); };

const dirty = execSync('git status --porcelain').toString().trim();
if (dirty) { console.error('[e2e-sw-chrome] REFUSING: dirty tree\n' + dirty); process.exit(3); }
const HEAD = execSync('git rev-parse --short HEAD').toString().trim();

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
  await clickLabel(page, 'The Whole Counsel');
  await page.waitForFunction(() => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), { timeout: NAV_MS });
  if (await page.$('.sw-fallback')) return false;
  await page.waitForFunction(() => !document.querySelector('.sw-loading'), { timeout: NAV_MS });
  await sleep(600);
  return true;
}

/** Everything F1-F3 read, in one round trip, in the ROOT's own CSS space. */
const READ = () => {
  const root = document.querySelector('.sw-root');
  const rr = root.getBoundingClientRect();
  const rotated = root.classList.contains('sw-rotated');
  // The rotated root is transformed; getBoundingClientRect returns viewport
  // boxes, which for a 90° rotation about the root are still exact rectangles,
  // so containment in the root's box is the containment we want either way.
  const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const inside = (b) => b.l >= rr.left - 0.5 && b.t >= rr.top - 0.5 && b.r <= rr.right + 0.5 && b.b <= rr.bottom + 0.5;
  const strip = root.querySelector('.sw-controls');
  const items = [...strip.children].map((el) => ({ name: (el.getAttribute('aria-label') || el.className || el.tagName).slice(0, 40), box: box(el) }));
  for (const sel of ['.sw-hide-all', '.sw-credit']) { const el = root.querySelector(sel); if (el) items.push({ name: sel, box: box(el) }); }
  const sb = box(strip);
  // the strip's corner distances are measured in the root's own axes: when
  // rotated, the root's "right" edge is the viewport's bottom, its "top" the right
  const cornerRight = rotated ? rr.bottom - sb.b : rr.right - sb.r;
  const cornerTop = rotated ? rr.right - sb.r : sb.t - rr.top;
  const pills = [...root.querySelectorAll('.sw-controls .sw-btn, .sw-controls .sw-seg, .sw-controls .sw-select, .sw-hide-all')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      const cs = getComputedStyle(el);
      const textEl = el.classList.contains('sw-seg') ? el.querySelector('.sw-seg-btn:not(.is-on)') || el : el;
      return { name: (el.getAttribute('aria-label') || el.textContent.trim() || el.className).slice(0, 28), on: el.classList.contains('is-on'),
        bg: cs.backgroundColor, border: cs.borderColor, color: getComputedStyle(textEl).color, box: box(el) };
    });
  return { rotated, root: { w: rr.width, h: rr.height }, items: items.map((i) => ({ ...i, inside: inside(i.box) })), cornerRight, cornerTop, pills };
};

/** sRGB contrast of `fg` over `bg` composited on black, both 'rgb(a)(...)' strings. */
function contrast(fg, bg) {
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return [0, 0, 0, 1]; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const over = (c, a, under) => c.map((v, i) => v * a + under[i] * (1 - a));
  const b = parse(bg), f = parse(fg);
  const ground = over(b.slice(0, 3), b[3], [0, 0, 0]);
  const ink = over(f.slice(0, 3), f[3], ground);
  const L1 = lum(ink), L2 = lum(ground);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/** sRGB contrast of an 'rgb(a)(...)' ink over a measured ground pixel [r,g,b]. */
function contrastOn(fg, ground) {
  const m = /rgba?\(([^)]+)\)/.exec(fg || ''); const p = m ? m[1].split(',').map(Number) : [0, 0, 0];
  const a = p.length > 3 ? p[3] : 1;
  const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ink = p.slice(0, 3).map((v, i) => v * a + ground[i] * (1 - a));
  const L1 = lum(ink), L2 = lum(ground);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/** F3w ground read: screenshot the viewport, decode it in a FRESH in-page canvas
 * (never the app's, which a readback would demote), and return, per pill box, the
 * brightest pixel in its inner left strip (x in [l+3, l+8), y in [t+3, b-3)); the
 * strip is inline padding on a flat pill and block padding on a rotated one, so
 * no glyph reaches it either way. */
async function brightestGround(page, boxes, dpr) {
  const b64 = await page.screenshot({ encoding: 'base64' });
  return page.evaluate(async (b64, boxes, dpr) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const lum = (r, gg, b) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    // a witness that the web moved: a checksum of the centre 120x120 device px
    let sum = 0; const cx = (c.width / 2) | 0, cy = (c.height / 2) | 0;
    for (let y = cy - 60; y < cy + 60; y++) for (let x = cx - 60; x < cx + 60; x++) { const i = (y * c.width + x) * 4; sum = (sum * 31 + d[i] + d[i + 1] + d[i + 2]) | 0; }
    const grounds = boxes.map((r) => {
      let best = null, bl = -1;
      for (let x = Math.ceil((r.l + 3) * dpr); x < (r.l + 8) * dpr; x++) for (let y = Math.ceil((r.t + 3) * dpr); y < (r.b - 3) * dpr; y++) {
        const i = (y * c.width + x) * 4; const l = lum(d[i], d[i + 1], d[i + 2]);
        if (l > bl) { bl = l; best = [d[i], d[i + 1], d[i + 2]]; }
      }
      return best;
    });
    return { grounds, sum };
  }, b64, boxes, dpr);
}

const readPpv = (page) => page.evaluate(() => { const w = document.querySelector('.sw-root'); return w ? Number(w.getAttribute('data-ppv-css')) : NaN; });
async function zoom3(page, tag) {
  const p0 = await readPpv(page);
  if (!(p0 > 0)) { note(`${tag} F3w: the screen publishes no data-ppv-css; the zoomed arm is skipped`); return false; }
  const c = await page.evaluate(() => { const b = document.querySelector('.sw-canvas-ui').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(c.x, c.y);
  let ratio = 1;
  for (let i = 0; i < 24 && ratio < ZOOM_TARGET * 0.97; i++) { await page.mouse.wheel({ deltaY: -280 }); await sleep(250); ratio = (await readPpv(page)) / p0; }
  await sleep(500);
  if (ratio < ZOOM_TARGET * 0.9) { fails.push(`${tag} F3w the zoom did not take: ${ratio.toFixed(2)}x, wanted ${ZOOM_TARGET.toFixed(2)}x`); return false; }
  return true;
}

/** F3w: pan the web under the strip PAN_STEPS times (a slow circle of drags),
 * reading every pill's brightest ground after each; keep the worst per pill. */
async function worstGround(page, pills, dpr, worst, state, tag, steps) {
  const c = await page.evaluate(() => { const b = document.querySelector('.sw-canvas-ui').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; });
  for (let k = 0; k <= steps; k++) {
    if (k > 0) {
      const ang = (k / PAN_STEPS) * Math.PI * 2, amp = Math.min(c.w, c.h) * 0.3;
      await page.mouse.move(c.x, c.y); await page.mouse.down();
      for (let s = 1; s <= 8; s++) await page.mouse.move(c.x + Math.cos(ang) * amp * s / 8, c.y + Math.sin(ang) * amp * s / 8);
      await page.mouse.up(); await sleep(350);
    }
    // the ground is only the web's if the web is what sits under the pointer: a
    // sheet or chooser over the canvas (a clamped drag reads as a tap) is a fault
    const under = await page.evaluate((c) => { const e = document.elementFromPoint(c.x, c.y); return e ? e.tagName + '.' + e.className : 'nothing'; }, c);
    if (!/sw-canvas/.test(under)) { fails.push(`${tag} F3w ${state} step ${k}: ${under} covers the canvas centre; the ground under the pills is not the web's`); return; }
    const { grounds: g, sum } = await brightestGround(page, pills.map((p) => p.box), dpr);
    if (k > 0 && sum === worst.lastSum) worst.stillPans = (worst.stillPans || 0) + 1;
    worst.lastSum = sum;
    pills.forEach((p, i) => {
      if (!g[i]) return;
      const cr = contrastOn(p.color, g[i]);
      const w = worst.get(p.name) || { cr: Infinity };
      if (cr < w.cr) worst.set(p.name, { cr, ground: g[i], state, step: k });
    });
  }
}

async function walk(page, url, fname) {
  const f = FRAMES[fname];
  const tag = `[${fname} ${f.w}x${f.h}]`;
  await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
  if (!(await boot(page, url))) { nothingToCheck = `${tag} the web could not be drawn (.sw-fallback)`; return; }
  if (OUT) await page.screenshot({ path: resolve(OUT, `${fname}.png`) });
  const r = await page.evaluate(READ);
  note(`${tag} rotated=${r.rotated} root ${Math.round(r.root.w)}x${Math.round(r.root.h)}; strip corner right ${r.cornerRight.toFixed(1)} top ${r.cornerTop.toFixed(1)}; ${r.items.length} chrome rects, ${r.items.filter((i) => !i.inside).length} outside`);
  for (const i of r.items) if (!i.inside) fails.push(`${tag} F1 ${i.name} is outside the root's box: ${JSON.stringify(i.box)} vs root ${JSON.stringify(r.root)}`);
  if (r.cornerRight > CORNER || r.cornerRight < 0) fails.push(`${tag} F1 the strip's right edge is ${r.cornerRight.toFixed(1)} px from the root's right edge (want 0..${CORNER})`);
  if (r.cornerTop > CORNER || r.cornerTop < 0) fails.push(`${tag} F1 the strip's top edge is ${r.cornerTop.toFixed(1)} px from the root's top edge (want 0..${CORNER})`);
  const off = r.pills.filter((p) => !p.on);
  const bgs = [...new Set(off.map((p) => p.bg))], borders = [...new Set(off.map((p) => p.border))];
  note(`${tag} pills: ${r.pills.map((p) => `${p.name}${p.on ? '*' : ''}=${p.bg}`).join(' | ')}`);
  if (bgs.length > 1) fails.push(`${tag} F2 the resting pills paint ${bgs.length} different fills: ${off.map((p) => p.name + '=' + p.bg).join(', ')}`);
  if (borders.length > 1) fails.push(`${tag} F2 the resting pills draw ${borders.length} different borders: ${off.map((p) => p.name + '=' + p.border).join(', ')}`);
  for (const p of r.pills) {
    const cr = contrast(p.color, p.bg);
    if (cr < MIN_TEXT_CR) fails.push(`${tag} F3 ${p.name}: text ${p.color} on fill ${p.bg} over black is ${cr.toFixed(2)}:1 < ${MIN_TEXT_CR}`);
  }
  // F3w: the worst ground the phone gives each resting pill, from pixels
  const worst = new Map();
  const resting = r.pills.filter((p) => !p.on);
  // at overview the camera is clamped (the canon fits the screen), so a drag
  // would read as a tap: the boot ground is the overview ground, no drags
  await worstGround(page, resting, f.dpr, worst, 'overview', tag, 0);
  if (await zoom3(page, tag)) await worstGround(page, resting, f.dpr, worst, '3 zoom steps', tag, PAN_STEPS);
  if (worst.stillPans) fails.push(`${tag} F3w ${worst.stillPans} of ${PAN_STEPS} drags left the web's centre pixels unchanged: the pan did not take, the grounds are not the worst`);
  for (const p of resting) {
    const w = worst.get(p.name);
    if (!w) { note(`${tag} F3w ${p.name}: no ground read`); continue; }
    const seen = w.ground.reduce((a, v) => a + v, 0) / 3;
    note(`${tag} F3w ${p.name}: ink ${p.color} over worst ground rgb(${w.ground.join(',')}) = ${w.cr.toFixed(2)}:1 (${w.state}, pan step ${w.step})${seen < 20 ? '; NOTHING BRIGHT PASSED UNDER IT, not proven' : ''}`);
    if (w.cr < MIN_LABEL_CR) fails.push(`${tag} F3w ${p.name}: ink ${p.color} over the worst ground rgb(${w.ground.join(',')}) is ${w.cr.toFixed(2)}:1 < ${MIN_LABEL_CR} (${w.state}, pan step ${w.step})`);
  }
}

let browser = null, server = null, harnessFault = null;
try {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const own = await serveOwnTree();
  server = own.server;
  console.log(`[e2e-sw-chrome] tree ${HEAD} serving ${own.url}`);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 240000 });
  for (const fname of WANT) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    try { await walk(page, own.url, fname); } finally { await ctx.close().catch(() => {}); }
  }
} catch (e) {
  harnessFault = e && e.stack ? e.stack : String(e);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
}
if (OUT) writeFileSync(resolve(OUT, 'e2e-sw-chrome.json'), JSON.stringify({ HEAD, notes, fails, nothingToCheck, harnessFault }, null, 2));
if (harnessFault) { console.error('[e2e-sw-chrome] HARNESS FAULT: ' + harnessFault); process.exit(3); }
if (fails.length) {
  if (nothingToCheck) console.error('[e2e-sw-chrome] ALSO INCOMPLETE: ' + nothingToCheck);
  console.error('[e2e-sw-chrome] ' + fails.length + ' FAILED:\n  ' + fails.join('\n  '));
  console.error('[e2e-sw-chrome] RESULT FAIL (' + fails.length + ') tree ' + HEAD);
  process.exit(1);
}
if (nothingToCheck) { console.error('[e2e-sw-chrome] ' + nothingToCheck); console.error('[e2e-sw-chrome] RESULT NOTHING-TO-CHECK'); process.exit(2); }
console.log('[e2e-sw-chrome] RESULT PASS tree ' + HEAD);
process.exit(0);
