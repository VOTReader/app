/**
 * tools/e2e-myweb.mjs — the My Web browser walk (design-perf, 2026-09-10).
 *
 * WHY. `e2e-scriptureweb.mjs` (scripture-web-walk-r2, not on main) never
 * enters My Web. The visual system in
 * sessions/2026-09-10-orchestrator/myweb-visual-design.md makes five claims
 * about PIXELS and one about TIME, and a unit test over the ink law cannot see
 * either: the law can be right and the screen can still draw one path (R1's
 * defect on main) or cover the web with a panel (R3). This walk reaches My Web
 * the way a reader does (Home -> Personal Study -> The Whole Counsel -> My
 * web), makes five links THROUGH THE REAL UI (words selected in Genesis 1,
 * Link, a reference typed into the picker, Enter), and reads the 2D canvas.
 *
 * ARMS (each reported with its numbers whichever way it lands):
 *   R1a  context has structure: 0 links, context ON, overview — the context
 *        ink's p95 / p50 >= STRUCTURE (main: 10 / 10 = 1.0, a flat stain)
 *   R1b  zoom rewards: p50 at three zoom steps >= ZOOM_REWARD x p50 at
 *        overview, on the landscape and desktop frames (426x952 is printed:
 *        it is the portrait frame the screen tells the reader to turn, and its
 *        band at 5.8x is mostly corridor — 1.9 measured on the prototype)
 *   R2   a user link is unmistakable: 5 links, same frame, overview — the
 *        links-only ink (context toggled OFF, the control arm) has p95 >=
 *        LINK_CORE and the context-only ink (0 links) has p50 <= CONTEXT_P50
 *   R3   the empty panel leaves the web visible: at 800x360 the `.sw-empty`
 *        rect covers no more than PANEL_COVER of the band's rows (main: the
 *        panel spans the band)
 *   R5   frame time (rAF intervals over a 1.5 s pan, two runs, min-of-two
 *        p50) at overview and at three zoom steps <= the ceiling for the
 *        frame, TIMED BEFORE ANY PIXEL READ (a read-back canvas is demoted to
 *        software raster), with the ui canvas's clears/frame beside it (the
 *        draw clears before it paints, on every tree) so a ceiling cannot be
 *        met by not drawing; strokes/frame is printed as information (main
 *        strokes the context as ONE path, the branch per edge). Ceilings are
 *        measured numbers with their SHA.
 *   C    control: with 0 links and context OFF the band is empty (coverage <=
 *        CONTROL_MAX); a reading off a canvas that draws something else is
 *        not a reading of the context
 *
 * EXIT: 0 pass, 1 fail, 2 nothing-to-check (the screen never drew), 3 harness.
 * A named defect outranks nothing-to-check, decided at the exit and nowhere
 * else (the Verifier's rule from the scripture-web walk).
 *
 * ZOOM: the real "+" button when the tree has one; after sw-chrome-trim the
 * wheel over the canvas, three notches of -280 (gestures.js: exp(-dY·0.0021)
 * = 1.8 per notch, the button's factor).
 *
 * Run from the repo root on a clean tree:
 *   node tools/e2e-myweb.mjs [--frames phoneLand,phone,desktop] [--out DIR] [--perf]
 */
import puppeteer from 'puppeteer';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveOwnTree } from './e2e-read-serve.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const num = (k, d) => { const v = process.env[k]; return v === undefined ? d : Number(v); };
const OUT = arg('out', null);
const PERF = has('perf');
const FRAMES = {
  phoneLand: { w: 800, h: 360, dpr: 2, mobile: true, rewardArm: true },
  phone: { w: 426, h: 952, dpr: 2, mobile: true, rewardArm: false },
  desktop: { w: 1920, h: 1080, dpr: 2, mobile: false, rewardArm: true },
};
const WANT = arg('frames', 'phoneLand,phone,desktop').split(',');
const NAV_MS = 30000;
const NLINKS = 5;

/* THRESHOLDS. Every one has main's measured value beside it (baf0f9ea,
   headless Chrome @2, Radeon 890M, probe dp-myweb-visual.mjs v6). */
const STRUCTURE = num('MYWEB_STRUCTURE', 3);        // main 1.0; prototype 3.6-4.8
const ZOOM_REWARD = num('MYWEB_ZOOM_REWARD', 1.8);  // main 1.0; half-res prototype 2.03 (800x360), 2.7 (desktop): deviation from 2, note 3b
const LINK_CORE = num('MYWEB_LINK_CORE', 210);      // main 197-205 on the three frames; prototype 221-225
const CONTEXT_P50 = num('MYWEB_CONTEXT_P50', 60);   // main 10; prototype 16-49 (the arm is the PAIR with LINK_CORE)
const PANEL_COVER = num('MYWEB_PANEL_COVER', 0.45); // fraction of band rows; main ~1.0 at 800x360
const CONTROL_MAX = num('MYWEB_CONTROL_MAX', 0.04); // main 0.0036 (426x952), 0.0296 (800x360: rail ticks)
/* R5 ceilings: min-of-two p50 rAF ms during a 1.5 s pan, per frame, measured
   with NO getImageData before the timing (a read-back canvas is demoted to
   software raster and times the demotion). Main baf0f9ea, 2026-09-10, headless
   Chrome @2, Radeon 890M; rAF quantised at ~4.2 ms. */
const R5_OVERVIEW_MS = num('MYWEB_R5_OVERVIEW', 12.6);  // main 4.2 on every frame (the rAF floor); three quanta
const R5_ZOOM_MS = { phoneLand: num('MYWEB_R5_ZOOM_PHONELAND', 30), phone: num('MYWEB_R5_ZOOM_PHONE', 75), desktop: num('MYWEB_R5_ZOOM_DESKTOP', 130) };  // main's worst read x 1.2: 24.9 / 62.5 / 108.4 (main tripped a best-read x 1.2 ceiling on its own dry run)
const R5_MIN_CLEARS = num('MYWEB_R5_MIN_CLEARS', 0.8);   // ui-canvas clearRect per rAF frame; main and the prototypes read ~1.0

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], notes = [];
let nothingToCheck = null;
const note = (s) => { notes.push(s); console.log('  ' + s); };

const dirty = execSync('git status --porcelain').toString().trim();
if (dirty) { console.error('[e2e-myweb] REFUSING: dirty tree\n' + dirty); process.exit(3); }
const HEAD = execSync('git rev-parse --short HEAD').toString().trim();

const finder = (l, r) => {
  const m = r ? new RegExp(r) : null;
  const t = (b) => (b.getAttribute('aria-label') || b.textContent.trim());
  return [...document.querySelectorAll('button,[role=button],a')]
    .find((b) => (m ? m.test(t(b)) : t(b).startsWith(l)) && b.getBoundingClientRect().width > 0);
};
async function clickLabel(page, label, ms = NAV_MS) {
  const re = label instanceof RegExp ? label.source : null;
  const src = finder.toString();
  try {
    await page.waitForFunction((l, r, s) => !!(new Function('return ' + s)())(l, r), { timeout: ms }, String(label), re, src);
  } catch (_e) {
    const clicked = await page.evaluate((l, r, s) => { const b = (new Function('return ' + s)())(l, r); if (!b) return false; b.click(); return true; }, String(label), re, src);
    if (clicked) return;
    const seen = await page.evaluate(() => [...document.querySelectorAll('button,[role=button],a')]
      .filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 40)));
    throw new Error('no control "' + label + '"; visible: ' + JSON.stringify(seen));
  }
  await page.evaluate((l, r, s) => (new Function('return ' + s)())(l, r).click(), String(label), re, src);
}
const clickIfPresent = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll('button,[role=button],a')]
    .find((x) => (x.getAttribute('aria-label') || x.textContent.trim()).startsWith(l) && x.getBoundingClientRect().width > 0);
  if (!b) return false; b.click(); return true;
}, label);

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; }, { timeout: NAV_MS });
  await clickLabel(page, 'Continue');
  await clickLabel(page, 'Begin Reading');
  await sleep(500);
  await clickIfPresent(page, 'Maybe later');
  await sleep(200);
}
async function goHome(page) {
  await page.evaluate(() => { location.hash = ''; });
  for (let i = 0; i < 6; i++) { if (await clickIfPresent(page, 'Back')) { await sleep(250); continue; } break; }
  await clickIfPresent(page, 'Home');
  await sleep(300);
}
async function toMyWeb(page) {
  await clickLabel(page, 'Personal Study');
  await sleep(400);
  await clickLabel(page, 'The Whole Counsel');
  await page.waitForFunction(() => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), { timeout: NAV_MS });
  if (await page.$('.sw-fallback')) return false;
  await page.waitForFunction(() => !document.querySelector('.sw-loading'), { timeout: NAV_MS });
  await clickLabel(page, 'My web');
  await sleep(600);
  await clickIfPresent(page, 'Reset the view');
  await sleep(900);
  return true;
}
/** Three 1.8x steps: the button where the tree has one, else the wheel. */
async function zoom3(page) {
  const hasBtn = await page.evaluate(() => !!document.querySelector('button[aria-label="Zoom in"]'));
  if (hasBtn) { for (let i = 0; i < 3; i++) { await clickLabel(page, 'Zoom in'); await sleep(450); } }
  else {
    const c = await page.evaluate(() => { const b = document.querySelector('.sw-canvas-ui').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel({ deltaY: -280 }); await sleep(450); }
  }
  await sleep(700);
}

/** Pixel statistics of the 2D canvas in the central band (rails and labels excluded). */
const MEASURE = () => {
  const c = document.querySelector('.sw-canvas-ui');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const y0 = Math.floor(H * 0.22), y1 = Math.floor(H * 0.80);
  const d = ctx.getImageData(0, y0, W, y1 - y0).data;
  const hist = new Array(256).fill(0);
  let n = 0, ink = 0, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    const v = a ? Math.round(Math.max(d[i], d[i + 1], d[i + 2]) * a / 255) : 0;
    n++; hist[v]++;
    if (v >= 3) { ink++; if (v > max) max = v; }
  }
  const pct = (p) => { let acc = 0; const target = ink * p; for (let v = 3; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; } return 0; };
  const panel = document.querySelector('.sw-empty');
  const pr = panel ? panel.getBoundingClientRect() : null;
  const dpr = window.devicePixelRatio || 1;
  const bandCss = [y0 / dpr, y1 / dpr];
  const cover = pr ? Math.max(0, Math.min(pr.bottom, bandCss[1]) - Math.max(pr.top, bandCss[0])) / (bandCss[1] - bandCss[0]) : 0;
  return {
    hist, pixels: n,
    coverage: +(ink / n).toFixed(4), p50: pct(0.5), p95: pct(0.95), max,
    title: (document.querySelector('.sw-title p') || {}).textContent || '',
    panelCover: +cover.toFixed(3),
    contextOn: (document.querySelector('.sw-toggle') || { getAttribute: () => null }).getAttribute('aria-pressed'),
  };
};
/** Statistics of what ON draws and OFF does not: the histogram difference, so the
    rails' ticks and the reader's links (both present in OFF) never count as context. */
function diffStats(on, off) {
  let ink = 0, max = 0; const h = new Array(256).fill(0);
  for (let v = 3; v < 256; v++) { h[v] = Math.max(0, on.hist[v] - off.hist[v]); ink += h[v]; if (h[v]) max = v; }
  const pct = (p) => { let acc = 0; const target = ink * p; for (let v = 3; v < 256; v++) { acc += h[v]; if (acc >= target) return v; } return 0; };
  return { coverage: +(ink / on.pixels).toFixed(4), p50: pct(0.5), p95: pct(0.95), max };
}
async function readBoth(page) {
  const on = await page.evaluate(MEASURE);
  await clickLabel(page, 'Show the curated corpus connections'); await sleep(500);
  const off = await page.evaluate(MEASURE);
  await clickLabel(page, 'Show the curated corpus connections'); await sleep(500);
  return { on, off, ctx: diffStats(on, off) };
}
const COUNTERS = () => {
  window.__sw2d = { stroke: 0, clear: 0 };
  const P = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!P) return;
  const os = P.stroke; P.stroke = function () { window.__sw2d.stroke++; return os.apply(this, arguments); };
  // the draw's witness on EVERY tree: the personal draw clears the ui canvas
  // before it paints, so clears/frame ~ 1 means the draw ran each frame
  const oc = P.clearRect; P.clearRect = function () { if (this.canvas && this.canvas.classList && this.canvas.classList.contains('sw-canvas-ui')) window.__sw2d.clear++; return oc.apply(this, arguments); };
};
async function frameTime(page, panMs) {
  await page.evaluate((ms) => {
    const w = window; w.__swFrames = []; let last = 0; const stop = performance.now() + ms;
    const tick = (t) => { if (last) w.__swFrames.push(t - last); last = t; if (t < stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, panMs);
  const box = await page.evaluate(() => { const b = document.querySelector('.sw-canvas-ui').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; });
  const amp = Math.max(20, Math.min(box.w, box.h) / 4);
  await page.mouse.move(box.x, box.y); await page.mouse.down();
  const t0 = Date.now(); let k = 0;
  while (Date.now() - t0 < panMs) { k++; await page.mouse.move(box.x + Math.sin(k / 5) * amp, box.y + Math.cos(k / 7) * amp / 2); }
  await page.mouse.up();
  const d = await page.evaluate(() => window.__swFrames.slice().sort((a, b) => a - b));
  const c = await page.evaluate(() => { const c = Object.assign({}, window.__sw2d || {}); if (window.__sw2d) { window.__sw2d.stroke = 0; window.__sw2d.clear = 0; } return c; });
  if (!d.length) return null;
  const q = (p) => +d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(1);
  return { n: d.length, p50: q(0.5), p95: q(0.95), strokesPerFrame: Math.round((c.stroke || 0) / d.length), clearsPerFrame: +((c.clear || 0) / d.length).toFixed(2) };
}
/** Two runs, min-of-two p50; strokes/frame must show the draw ran. */
async function perfArm(page, tag, state, ceiling) {
  const a = await frameTime(page, 1500); await sleep(300);
  const b = await frameTime(page, 1500); await sleep(300);
  if (!a || !b) { fails.push(`${tag} R5 ${state}: no rAF frames recorded during the pan`); return; }
  const min = Math.min(a.p50, b.p50);
  note(`${tag} R5 ${state} rAF p50 ${a.p50}/${b.p50} ms (n ${a.n}/${b.n}, p95 ${a.p95}/${b.p95}, clears/frame ${a.clearsPerFrame}/${b.clearsPerFrame}, strokes/frame ${a.strokesPerFrame}/${b.strokesPerFrame}); ceiling ${ceiling}`);
  if (Math.min(a.clearsPerFrame, b.clearsPerFrame) < R5_MIN_CLEARS) fails.push(`${tag} R5 ${state}: ${Math.min(a.clearsPerFrame, b.clearsPerFrame)} ui-canvas clears/frame < ${R5_MIN_CLEARS}: the draw did not run every frame, so the frame time is not the draw's`);
  if (min > ceiling) fails.push(`${tag} R5 ${state}: min-of-two p50 ${min} ms > ceiling ${ceiling} ms`);
}
async function makeLink(page, route, verseIdx, ref) {
  await goHome(page);
  for (const step of route) { await clickLabel(page, step); await sleep(450); }
  await page.waitForFunction(() => document.querySelectorAll('[data-hl-key]').length > 3, { timeout: NAV_MS });
  await sleep(400);
  const picked = await page.evaluate((idx) => {
    const els = [...document.querySelectorAll('[data-hl-key]')].filter((e) => e.getBoundingClientRect().height > 0);
    const el = els[idx % els.length];
    el.scrollIntoView({ block: 'center' });
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t; while ((t = walker.nextNode())) { if (t.textContent.trim().length > 20) break; }
    if (!t) return null;
    const s = t.textContent; const a = s.search(/\S/); let b = a;
    for (let w = 0; w < 3 && b < s.length; w++) { b = s.indexOf(' ', b + 1); if (b < 0) { b = s.length; break; } }
    const r = document.createRange(); r.setStart(t, a); r.setEnd(t, b);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    return { key: el.getAttribute('data-hl-key'), text: s.slice(a, b) };
  }, verseIdx);
  if (!picked) throw new Error('no verse text to select');
  await page.waitForSelector('.sel-action-btn[title="Link"]', { visible: true, timeout: 8000 });
  await page.click('.sel-action-btn[title="Link"]');
  const input = await page.waitForSelector('.navpick input, input[placeholder*="earch"], .sheet input[type="search"], .sheet input[type="text"]', { visible: true, timeout: 8000 });
  await input.click({ clickCount: 3 });
  await input.type(ref, { delay: 20 });
  await sleep(700);
  await page.keyboard.press('Enter');
  await sleep(900);
  await clickIfPresent(page, 'Done'); await clickIfPresent(page, 'Close');
  await sleep(300);
  return picked.key + ' -> ' + ref;
}
const LINK_PLAN = [
  [['The Holy Bible', 'The Law', /Genesis$/, /^1The Creation/], 0, 'Eph 6:5'],
  [['The Holy Bible', 'The Law', /Genesis$/, /^1The Creation/], 5, 'Rom 8:28'],
  [['The Holy Bible', 'The Law', /Genesis$/, /^1The Creation/], 12, 'Ps 23:1'],
  [['The Holy Bible', 'The Law', /Genesis$/, /^1The Creation/], 20, 'John 3:16'],
  [['The Holy Bible', 'The Law', /Genesis$/, /^1The Creation/], 26, 'Isa 53:5'],
];
async function shot(page, name) { if (!OUT) return; await page.screenshot({ path: resolve(OUT, name + '.png') }); }

async function walk(page, url, fname) {
  const f = FRAMES[fname];
  const tag = `[${fname} ${f.w}x${f.h}]`;
  await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
  if (PERF) await page.evaluateOnNewDocument(COUNTERS);
  await boot(page, url);
  if (!(await toMyWeb(page))) {
    nothingToCheck = `${tag} the web could not be drawn (.sw-fallback); no canvas to read`;
    return;
  }
  if (PERF) {
    // TIMING FIRST, PIXELS AFTER: getImageData demotes the canvas (note 3b).
    await perfArm(page, tag, 'overview', R5_OVERVIEW_MS);
    await clickIfPresent(page, 'Reset the view'); await sleep(500);
    await zoom3(page);
    await perfArm(page, tag, 'three zoom steps', R5_ZOOM_MS[fname] || 1e9);
    await clickIfPresent(page, 'Reset the view'); await sleep(700);
  }
  await shot(page, `${fname}-0links-overview`);
  const zero = await readBoth(page);
  note(`${tag} 0 links overview: context (ON minus OFF) p50 ${zero.ctx.p50} p95 ${zero.ctx.p95} coverage ${zero.ctx.coverage}; control (OFF) coverage ${zero.off.coverage}; panel covers ${zero.on.panelCover} of the band; subtitle ${JSON.stringify(zero.on.title)}`);
  if (zero.off.coverage > CONTROL_MAX) fails.push(`${tag} C the control arm is not empty: coverage ${zero.off.coverage} > ${CONTROL_MAX} with context OFF and 0 links — the band is reading something other than context`);
  const structure = zero.ctx.p50 ? zero.ctx.p95 / zero.ctx.p50 : 0;
  if (structure < STRUCTURE) fails.push(`${tag} R1a the context has no structure: p95/p50 = ${zero.ctx.p95}/${zero.ctx.p50} = ${structure.toFixed(2)} < ${STRUCTURE} (a flat stain)`);
  if (fname === 'phoneLand' && zero.on.panelCover > PANEL_COVER) fails.push(`${tag} R3 the empty panel covers ${zero.on.panelCover} of the band's rows > ${PANEL_COVER}: the invitation hides the web it invites the reader into`);
  await clickIfPresent(page, 'Dismiss'); await sleep(300);
  await zoom3(page);
  await shot(page, `${fname}-0links-zoom3`);
  const zeroZoom = await readBoth(page);
  const reward = zero.ctx.p50 ? zeroZoom.ctx.p50 / zero.ctx.p50 : 0;
  note(`${tag} 0 links at three steps: context p50 ${zeroZoom.ctx.p50} p95 ${zeroZoom.ctx.p95}; reward ${reward.toFixed(2)}x${f.rewardArm ? '' : ' (printed, not asserted on the portrait frame)'}`);
  if (f.rewardArm && reward < ZOOM_REWARD) fails.push(`${tag} R1b zoom does not reward: p50 ${zeroZoom.ctx.p50} at three steps vs ${zero.ctx.p50} at overview = ${reward.toFixed(2)}x < ${ZOOM_REWARD}x`);
  // five links through the real UI
  const made = [];
  for (const [route, idx, ref] of LINK_PLAN.slice(0, NLINKS)) made.push(await makeLink(page, route, idx, ref));
  await goHome(page);
  await toMyWeb(page);
  await shot(page, `${fname}-5links-overview`);
  const five = await readBoth(page);
  note(`${tag} ${made.length} links (${made.join('; ')}) overview: links-only p95 ${five.off.p95} max ${five.off.max}; context p50 ${zero.ctx.p50}; subtitle ${JSON.stringify(five.on.title)}`);
  if (!/5 links/.test(five.on.title)) fails.push(`${tag} the five links did not all land through the UI: subtitle reads ${JSON.stringify(five.on.title)}`);
  if (five.off.p95 < LINK_CORE || zero.ctx.p50 > CONTEXT_P50) fails.push(`${tag} R2 a reader's link is not unmistakable: link p95 ${five.off.p95} (>= ${LINK_CORE}) against context p50 ${zero.ctx.p50} (<= ${CONTEXT_P50})`);
  await zoom3(page);
  await shot(page, `${fname}-5links-zoom3`);
  const fiveZoom = await readBoth(page);
  note(`${tag} ${made.length} links at three steps: links-only p95 ${fiveZoom.off.p95}; context p50 ${fiveZoom.ctx.p50}`);
}

let browser = null, server = null, harnessFault = null;
try {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const own = await serveOwnTree();
  server = own.server;
  console.log(`[e2e-myweb] tree ${HEAD} serving ${own.url}`);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 240000 });
  const probe = await browser.newPage();
  const renderer = await probe.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : null; });
  await probe.close();
  console.log('[e2e-myweb] renderer ' + JSON.stringify(renderer));
  for (const fname of WANT) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    try { await walk(page, own.url, fname); }
    finally { await ctx.close().catch(() => {}); }
  }
} catch (e) {
  harnessFault = e && e.stack ? e.stack : String(e);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
}
if (OUT) writeFileSync(resolve(OUT, 'e2e-myweb.json'), JSON.stringify({ HEAD, notes, fails, nothingToCheck, harnessFault }, null, 2));
if (harnessFault) {
  console.error('[e2e-myweb] HARNESS FAULT: ' + harnessFault);
  console.error('[e2e-myweb] RESULT HARNESS-FAULT — nothing was measured');
  process.exit(3);
}
if (fails.length) {
  if (nothingToCheck) console.error('[e2e-myweb] ALSO INCOMPLETE: ' + nothingToCheck);
  console.error('[e2e-myweb] ' + fails.length + ' FAILED:\n  ' + fails.join('\n  '));
  console.error('[e2e-myweb] RESULT FAIL (' + fails.length + ') tree ' + HEAD);
  process.exit(1);
}
if (nothingToCheck) {
  console.error('[e2e-myweb] ' + nothingToCheck);
  console.error('[e2e-myweb] RESULT NOTHING-TO-CHECK — incomplete, not a pass');
  process.exit(2);
}
console.log('[e2e-myweb] RESULT PASS tree ' + HEAD);
process.exit(0);
