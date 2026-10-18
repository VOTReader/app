/**
 * tools/e2e-myweb-colour.mjs — My Web colour logic (1b): the pictures for
 * Corbin's call folder and the corridor gate (design-myweb-colour.md, 2026-09-11).
 *
 * ARM K, per frame (phoneLand 800x360 @2 touch, pixelLand 891x411 @2.6 touch,
 * desktop 1920x1080 @2), on a fresh browser context each:
 *   1. boot, SEED 20 reader links through the app's own persistLink (7 within
 *      scripture, 6 within the Volumes, 7 across; the subtitle's count is
 *      read back and printed; < 15 placed is a FAIL: the picture would be a lie)
 *   2. open My Web (Timothy's notes on, view reset): `<frame>-O-dark.png`, and
 *      THE TWO FAMILIES (the w3 law, fix-review #6; the 2026-09-11 four-hue
 *      cool family and the gold / amber / coral warm one are retired): every
 *      saturated lit pixel between the rails is Timothy's teal family (hue
 *      165-215 deg: his four sources) or the reader's one gold (hue 33-46;
 *      the retired amber sits at 29, coral at 11). Gate: both families drawn,
 *      and the rest (a third family, or a blend where a gold halo crosses a
 *      teal corridor) under OTHER_MAX of them. The reader's links are one
 *      gold, so their shape is the pin's: on the top rail's row the pins are
 *      classed by their profile above the rail (a solid dot, 4 CSS px, for a
 *      link within the Volumes; a dot inside a ring, 5.5, for one across);
 *      gate: >= 2 dot pins, a within-the-Volumes link with both pins on screen
 *   3. body.light applied exactly as use-settings.js does: `<frame>-O-light.png`
 *      (the canvas is black in both themes by construction; the chrome is what
 *      changes), then removed
 *   4. the legend cropped from the dark frame: `<frame>-legend.png`
 *   5. colour-vision pairs from the dark overview PNG (decoded in a scratch
 *      canvas, never getImageData on the app canvas): Machado 2009 severity 1.0
 *      deuteranopia and protanopia, `<frame>-cvd-deutan.png`, `<frame>-cvd-protan.png`
 *   6. THE ZOOM LADDER (call 07's adjust, 2026-09-12): the top rail wheeled at MTAM to
 *      1x, 6x, 16x and its ceiling under the one law, `<frame>-ladder-<z>x.png`, the band
 *      under the rail scanned at each; gate: mean luminance must not rise from 16x to the
 *      ceiling (the plateau leg). Then, only with --ceilings a,b (the knob comparison):
 *      THE CORRIDOR PAIR (the Orchestrator's gate on the 0.45 -> 0.70 ceiling):
 *      the top rail wheeled at the Study Bible's segment (MTAM) until its
 *      camera reads >= 40x fit, then the same view drawn under each ceiling in
 *      --ceilings (the screen's walk knob globalThis.__swContextCeiling, unset
 *      in the app): `<frame>-corridor-<ceiling>.png`. On each capture a 40 CSS px
 *      band below the top rail is scanned row by row: distinct lit runs per row
 *      (a stroke crossing the row) and the lit share. Registered: median runs
 *      per row at the higher ceiling >= 0.8 x the lower, and the lit share at
 *      the higher ceiling < 0.9 (not a slab). Numbers printed whichever way.
 *
 * Launch classification is printed (renderer string + the longest task while
 * the overview draws), never gated: contrast and colour do not depend on it;
 * a software-raster launch is stated in the README the call folder carries.
 *
 *   node tools/e2e-myweb-colour.mjs [--frames phoneLand,pixelLand,desktop] [--out DIR] [--ceilings 0.45,0.70] [--links 20]
 *
 * Refuses a dirty tree (the tree under test IS the commit). Serves its own tree
 * in this process and exits when done; run it as ONE foreground node process.
 * EXIT: 0 pass, 1 fail, 2 nothing-to-check (the web never drew), 3 harness.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const OWN = resolve(HERE, '..');
const OUT = arg('out', '');
const FRAME_LIST = arg('frames', 'phoneLand,pixelLand,desktop').split(',');
const CEILINGS = arg('ceilings', '').split(',').filter(Boolean).map(Number);   // opt-in: the knob comparison (call 07's first pictures)
const LADDER = arg('ladder', '1,6,16,ceil').split(',');                          // the zoom ladder under the ONE law (call 07's adjust)
const N_LINKS = Number(arg('links', '20'));
const NAV_MS = 60000;
const MIN_PLACED = 15;
// the two families (fix-review #6): hue bands in degrees, and the share of saturated lit pixels allowed outside both
const TEAL_HUE = [165, 215], GOLD_HUE = [33, 46];
const OTHER_MAX = 0.05;

const dirty = execSync('git status --porcelain', { cwd: OWN }).toString().trim();
if (dirty) { console.error(`[e2e-myweb-colour] REFUSING: dirty tree ${OWN}\n` + dirty); process.exit(3); }
const SHA = execSync('git rev-parse --short HEAD', { cwd: OWN }).toString().trim();
const puppeteer = createRequire(pathToFileURL(resolve(OWN, 'package.json')))('puppeteer');
const { serveOwnTree } = await import(pathToFileURL(resolve(OWN, 'tools/e2e-read-serve.mjs')).href);
// the tree's own ink law, so the tool never restates 0.04*z^0.75 (two definitions that must agree)
const { personalInk } = await import(pathToFileURL(resolve(OWN, 'app/src/main/assets/src/ui/scripture-web/rail-renderer.js')).href);
if (OUT) mkdirSync(OUT, { recursive: true });

const FRAMES = {
  phoneLand: { w: 800, h: 360, dpr: 2, mobile: true },
  pixelLand: { w: 891, h: 411, dpr: 2.6, mobile: true },     // the owner's Pixel 9 Pro, landscape
  desktop: { w: 1920, h: 1080, dpr: 2, mobile: false },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll from node in the MAIN world. puppeteer's waitForFunction runs in its isolated world, which in a fresh
 *  browser context starved for the whole timeout while a plain evaluate saw the target at the same instant
 *  (slot 5, 10:39: 'Continue' listed in the diagnostic, unseen by the wait); polling:200 does not help. */
async function waitFor(page, fn, ms, ...args) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await page.evaluate(fn, ...args)) return true; await sleep(200); }
  return false;
}
const fails = [];
let nothingToCheck = null;
const notes = [];
const note = (s) => { notes.push(s); console.log('[e2e-myweb-colour] ' + s); };

// ── the seed: the reader's links, in the shapes the legend names ──
// Letter ends from FOUR collections spread along the top rail (Vol I at the left edge, Vol IV, the
// Lord's Rebuke near the middle, Letters to the Flock past it), each endpoint scoped by its volKey.
// myweb-colour's review (D1/D2): with every letter drawn from volume-one, no 'within the Volumes'
// link was on any picture (its pin - one of the three pin shapes Corbin approves, amber then, a gold dot since w3 - never
// appeared) and the seven across links stacked out of the top-left corner with their pins clipped.
const LETTER_SETS = (() => {
  const files = { one: 'volume-one', four: 'volume-four', rebuke: 'lords-rebuke', flock: 'letters-flock' };
  const out = {};
  for (const [volKey, file] of Object.entries(files)) {
    const src = readFileSync(resolve(OWN, `app/src/main/assets/src/data/${file}.js`), 'utf8');
    const ids = []; const re = /"id":\s*"([a-z0-9-]+)"/g; let m;
    while ((m = re.exec(src)) && ids.length < 8) if (!ids.includes(m[1])) ids.push(m[1]);
    out[volKey] = ids;
  }
  return out;
})();
const VOL_KEYS = Object.keys(LETTER_SETS);
const BIBLE = [['genesis', 1, 1], ['exodus', 20, 3], ['psalms', 23, 1], ['isaiah', 53, 5], ['john', 3, 16], ['romans', 8, 28],
  ['revelation', 21, 4], ['proverbs', 3, 5], ['deuteronomy', 6, 4], ['jeremiah', 29, 11], ['matthew', 5, 3], ['hebrews', 11, 1], ['micah', 6, 8], ['daniel', 3, 17]];
const bibleEp = ([b, c, v]) => ({ type: 'bible', key: `bible:${b}:${c}:${v}`, bookId: b, chapter: c, verse: v, label: `${b} ${c}:${v}` });
const letterEp = (volKey, i) => { const id = LETTER_SETS[volKey][i % LETTER_SETS[volKey].length]; return { type: 'letter', key: `letter:${id}`, volKey, letterId: id, label: `${volKey}/${id}` }; };
function seedPairs(n) {
  const pairs = [];
  const nWithin = Math.round(n * 0.35), nVol = Math.round(n * 0.3), nAcross = n - nWithin - nVol;
  for (let i = 0; i < nWithin; i++) pairs.push([bibleEp(BIBLE[i]), bibleEp(BIBLE[(i + 7) % BIBLE.length])]);
  // each within-the-Volumes pair joins two DIFFERENT collections (the second end's offset runs 1..3, never 0 mod 4,
  // past 12 pairs too); the across links' letter ends rotate through all four
  for (let i = 0; i < nVol; i++) pairs.push([letterEp(VOL_KEYS[i % VOL_KEYS.length], i), letterEp(VOL_KEYS[(i + 1 + (Math.floor(i / VOL_KEYS.length) % (VOL_KEYS.length - 1))) % VOL_KEYS.length], i + 2)]);
  for (let i = 0; i < nAcross; i++) pairs.push([bibleEp(BIBLE[(i + 3) % BIBLE.length]), letterEp(VOL_KEYS[(i + 2) % VOL_KEYS.length], i + 4)]);
  return pairs;
}

const finder = (l) => [...document.querySelectorAll('button,[role=button],a')]
  .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0);
async function clickLabel(page, label) {
  const wait = async (ms) => { if (!(await waitFor(page, (l, s) => !!(new Function('return ' + s)())(l), ms, label, finder.toString()))) throw new Error('timeout'); };
  try { await wait(NAV_MS); } catch (e) {
    // diagnostics first: what the page shows instead, then ONE reload (a starved fresh context woke on one)
    const seen = await page.evaluate(() => ({ ready: document.readyState, vis: document.visibilityState, url: location.href,
      labels: [...document.querySelectorAll('button,[role=button],a')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 24)).slice(0, 20),
      text: (document.getElementById('root') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 160) })).catch((x) => ({ evalError: String(x) }));
    console.log(`[boot] '${label}' not visible after ${NAV_MS} ms; page shows ${JSON.stringify(seen)}; reloading once`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_MS });
    try { await wait(30000); } catch (e2) { throw new Error(`'${label}' not visible after a reload either; before the reload the page showed ${JSON.stringify(seen)}`); }
  }
  await page.evaluate((l, s) => (new Function('return ' + s)())(l).click(), label, finder.toString());
}
const clickIfPresent = (page, label) => page.evaluate((l, s) => { const b = (new Function('return ' + s)())(l); if (!b) return false; b.click(); return true; }, label, finder.toString());
async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  if (!(await waitFor(page, () => { const r = document.getElementById('root'); return !!r && r.children.length > 0; }, NAV_MS))) throw new Error('wait timed out (main-world poll)');
  await clickLabel(page, 'Continue'); await clickLabel(page, 'Begin Reading'); await sleep(500);
  await clickIfPresent(page, 'Maybe later'); await sleep(200);
}
async function seed(page, pairs) {
  return page.evaluate(async (pairs) => {
    const g = globalThis;
    if (typeof g.persistLink !== 'function' || typeof g.LinkStore === 'undefined') return { ok: false, why: 'persistLink / LinkStore not global' };
    const before = g.LinkStore.all().length;
    for (const [a, b] of pairs) g.persistLink(a, b);
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true, before, after: g.LinkStore.all().length };
  }, pairs);
}
async function toMyWeb(page) {
  await clickLabel(page, 'Personal Study'); await sleep(400);
  await clickLabel(page, 'Scripture Web');   // the Library row (its "The Whole Counsel" eyebrow left 2026-09-25)
  if (!(await waitFor(page, () => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), NAV_MS))) throw new Error('wait timed out (main-world poll)');
  if (await page.$('.sw-fallback')) return false;
  if (!(await waitFor(page, () => !document.querySelector('.sw-loading'), NAV_MS))) throw new Error('wait timed out (main-world poll)');
  await clickLabel(page, 'My web'); await sleep(800);
  // the first-run guide ("How to read this web") opens on a fresh context and covers the band; its
  // button is "Got it" ('Dismiss' is the empty notice's x)
  await clickIfPresent(page, 'Got it'); await sleep(300);
  await clickIfPresent(page, 'Dismiss'); await sleep(300);
  await clickIfPresent(page, 'Reset the view'); await sleep(700);
  return true;
}
const attr = (page, k) => page.evaluate((k) => (document.querySelector('.sw-root') || { getAttribute: () => null }).getAttribute(k), k);
const rails = (page) => page.evaluate(() => JSON.parse((document.querySelector('.sw-root') || { getAttribute: () => null }).getAttribute('data-rails') || 'null'));
const canvasRect = (page) => page.evaluate(() => { const b = document.querySelector('.sw-canvas-ui').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
const subtitle = (page) => page.evaluate(() => { const p = document.querySelector('.sw-title p'); return p ? p.textContent.trim() : ''; });
async function shot(page, name, clip) { if (!OUT) return; await page.screenshot(Object.assign({ path: resolve(OUT, name + '.png') }, clip ? { clip } : {})); }
/** Schedule a REAL frame: a zero-delta wheel over the top rail is a no-op zoom that calls schedule().
 *  (A window 'resize' event reaches nothing - the screen observes its canvas with a ResizeObserver -
 *  and the first run's two corridor captures were one frame twice: 93 of 1,152,000 px differed.) */
async function settle(page, at) { await page.mouse.move(at.x, at.y); await page.mouse.wheel({ deltaY: 0 }); await sleep(900); }
/** The pointer that settled the frame rests on the rail and a 'Your link' hover card (.sw-tip) covered half
 *  the corridor in runs 3 and 4. Park it over the topbar's subtitle (chrome: the canvas hears no hover there)
 *  and clear the card with Escape - pressed ONLY while .sw-tip is in the DOM, since with nothing open Escape
 *  is onBack() and leaves the screen. */
async function clearHover(page) {
  const r = await page.evaluate(() => { const e = document.querySelector('.sw-title p') || document.querySelector('.sw-title'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  if (r) await page.mouse.move(r.x, r.y);
  await sleep(250);
  if (await page.$('.sw-tip')) { await page.focus('.sw-root'); await page.keyboard.press('Escape'); await sleep(350); }
  if (await page.$('.sw-tip')) note('WARN a hover card is still on screen after Escape');
}

/** The longest task while the screen redraws once: the launch classification, printed, never gated. The redraw
 *  is settle()'s real frame (a zero-delta wheel over the top rail at `at`); a window 'resize' reaches nothing. */
async function classify(page, at) {
  await page.evaluate(() => {
    const box = { max: 0 };
    box.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) box.max = Math.max(box.max, e.duration); });
    box.po.observe({ entryTypes: ['longtask'] });
    globalThis.__swClassify = box;
  });
  await page.mouse.move(at.x, at.y); await page.mouse.wheel({ deltaY: 0 });
  await sleep(1200);
  const longest = await page.evaluate(() => {
    const box = globalThis.__swClassify; box.po.disconnect(); delete globalThis.__swClassify;
    return Math.round(box.max);
  });
  return { longest, klass: longest >= 100 ? 'software-raster (long task >= 100 ms on a redraw)' : 'accelerated' };
}

/** Machado 2009 severity-1.0 simulation of a PNG, in a scratch canvas in the page; returns a data URL. */
const simulate = (page, b64, kind) => page.evaluate(async (b64, kind) => {
  const M = {
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  }[kind];
  const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const l2s = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
  const LUT = new Float32Array(256); for (let i = 0; i < 256; i++) LUT[i] = s2l(i);
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height); const d = id.data;
  for (let p = 0; p < d.length; p += 4) {
    const r = LUT[d[p]], gg = LUT[d[p + 1]], b = LUT[d[p + 2]];
    d[p] = l2s(M[0][0] * r + M[0][1] * gg + M[0][2] * b);
    d[p + 1] = l2s(M[1][0] * r + M[1][1] * gg + M[1][2] * b);
    d[p + 2] = l2s(M[2][0] * r + M[2][1] * gg + M[2][2] * b);
  }
  g.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}, b64, kind);

/** The two families over a band of the screenshot (scratch canvas): saturated lit pixels by hue band. */
const families = (page, b64, y0, y1, teal, gold) => page.evaluate(async (b64, y0, y1, teal, gold) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const W = c.width, H = y1 - y0; const d = g.getImageData(0, y0, W, H).data;
  let nTeal = 0, nGold = 0, nOther = 0;
  const others = new Map();
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], gg = d[p + 1], b = d[p + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (r + gg + b <= 90 || mx === 0 || (mx - mn) / mx < 0.25) continue;     // dark, or neutral (rails, names, ticks)
    let h = mx === r ? ((gg - b) / (mx - mn)) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4;
    h = (h * 60 + 360) % 360;
    if (h >= teal[0] && h <= teal[1]) nTeal++;
    else if (h >= gold[0] && h <= gold[1]) nGold++;
    else { nOther++; const k = Math.round(h / 10) * 10; others.set(k, (others.get(k) || 0) + 1); }
  }
  const all = nTeal + nGold + nOther;
  const top = [...others.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}deg:${n}`).join(' ');
  return { teal: nTeal, gold: nGold, other: nOther, otherShare: all ? +(nOther / all).toFixed(4) : 0, otherHues: top };
}, b64, y0, y1, teal, gold);

/** The reader's pins on one rail's row, by shape: gold blobs along the row, each classed by its profile ABOVE the
 *  rail (the link leaves its pin downward): a solid dot (radius 4 CSS) has no gold 5-6.3 CSS px up, a dot inside a
 *  ring (radius 5.5) does. */
const pinShapes = (page, b64, yRail, dpr, W, gold) => page.evaluate(async (b64, yRail, dpr, W, gold) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const y0 = Math.max(0, Math.round(yRail - 9 * dpr)), H = Math.round(18 * dpr);
  const d = g.getImageData(0, y0, W, H).data;
  const isGold = (x, y) => {
    if (x < 0 || x >= W || y < y0 || y >= y0 + H) return false;
    const p = ((y - y0) * W + x) * 4, r = d[p], gg = d[p + 1], b = d[p + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (r + gg + b <= 150 || (mx - mn) / mx < 0.25 || mx !== r) return false;
    const h = (((gg - b) / (mx - mn)) % 6) * 60;
    return h >= gold[0] && h <= gold[1];
  };
  const col = new Uint8Array(W);
  for (let y = y0; y < y0 + H; y++) for (let x = 0; x < W; x++) if (isGold(x, y)) col[x] = 1;
  let dots = 0, ringDots = 0, other = 0, run = 0;
  const yc = Math.round(yRail);
  const anyUp = (x, r0, r1) => { for (let r = Math.round(r0 * dpr); r <= Math.round(r1 * dpr); r++) if (isGold(x, yc - r)) return true; return false; };
  for (let x = 0; x <= W; x++) {
    if (x < W && col[x]) { run++; continue; }
    if (run >= 2) {
      const cx = x - Math.ceil(run / 2);
      if (!anyUp(cx, 0, 1.5)) other++;
      else if (anyUp(cx, 5, 6.3)) ringDots++;
      else dots++;
    }
    run = 0;
  }
  return { dots, ringDots, other };
}, b64, yRail, dpr, W, gold);

/** Distinct lit runs per row and the lit share over a band of the screenshot (scratch canvas). */
const scanBand = (page, b64, x0, x1, y0, y1) => page.evaluate(async (b64, x0, x1, y0, y1) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const W = x1 - x0, H = y1 - y0;
  const d = g.getImageData(x0, y0, W, H).data;
  const runs = []; let lit = 0, sum = 0, litSum = 0;
  for (let y = 0; y < H; y++) {
    let n = 0, prev = 0;
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4; const on = (d[p] + d[p + 1] + d[p + 2] > 90) ? 1 : 0;
      sum += d[p] + d[p + 1] + d[p + 2];
      if (on) litSum += d[p] + d[p + 1] + d[p + 2];
      lit += on; if (on && !prev) n++; prev = on;
    }
    runs.push(n);
  }
  runs.sort((a, b) => a - b);
  return { rows: H, medianRuns: runs[Math.floor(H / 2)], maxRuns: runs[H - 1], litShare: +(lit / (W * H)).toFixed(3), meanLum: +(sum / (3 * W * H)).toFixed(2),
    // the mean over the INK alone (pixels above the lit threshold): the per-stroke brightness, which is what a
    // reader calls "the colours"; the band mean above confounds it with how many strokes cross the band
    litMean: lit ? +(litSum / (3 * lit)).toFixed(2) : 0 };
}, b64, x0, x1, y0, y1);

async function zoomTopTo(page, c, r0, label, factor, vFit) {
  const v0 = vFit > 0 ? vFit : Number(await attr(page, 'data-ppv-vot'));
  let last = v0, same = 0;
  for (let i = 0; i < 60; i++) {
    const r = await rails(page);
    if (!r) return { ok: false, why: 'data-rails not published' };
    const band = r.top.find((b) => b.label.toLowerCase().startsWith(label.toLowerCase()));
    if (!band) return { ok: false, why: `band ${label} not visible after ${i} notches` };
    const v = Number(await attr(page, 'data-ppv-vot'));
    if (v / v0 >= factor) return { ok: true, band, steps: i, zoom: +(v / v0).toFixed(1), saturated: false };
    same = v === last ? same + 1 : 0; last = v;
    // the rail's own ceiling: the wheel no longer moves it (the desktop Volumes rail caps under 40x fit)
    if (same >= 2 && i > 3) return { ok: true, band, steps: i, zoom: +(v / v0).toFixed(1), saturated: true };
    const cx = c.l + Math.max(4, Math.min(c.w - 4, (band.x0 + band.x1) / 2));
    await page.mouse.move(cx, c.t + r0.topY + 12);
    await page.mouse.wheel({ deltaY: -120 }); await sleep(160);
  }
  return { ok: false, why: `ran out of notches at ${(Number(await attr(page, 'data-ppv-vot')) / v0).toFixed(1)}x fit` };
}

async function walk(page, url, fname) {
  const f = FRAMES[fname];
  const tag = `[${fname} ${f.w}x${f.h}]`;
  await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
  await boot(page, url);
  const s = await seed(page, seedPairs(N_LINKS));
  if (!s.ok) { fails.push(`${tag} seed: ${s.why}`); return; }
  note(`${tag} seeded ${s.after - s.before} links through persistLink (store ${s.before} -> ${s.after})`);
  if (!(await toMyWeb(page))) { nothingToCheck = `${tag} the web could not be drawn (.sw-fallback)`; return; }
  const sub = await subtitle(page);
  const placed = Number((/(\d+)/.exec(sub) || [0, 0])[1]);
  note(`${tag} My Web subtitle "${sub}" (${placed} links placed)`);
  if (placed < MIN_PLACED) fails.push(`${tag} only ${placed} of ${N_LINKS} seeded links placed on the rails (< ${MIN_PLACED}); the picture is not the 20-link picture`);
  const c = await canvasRect(page);
  const r0 = await rails(page);
  const cls = await classify(page, { x: c.l + c.w / 2, y: c.t + r0.topY + 12 });
  note(`${tag} launch: ${cls.klass}, longest task ${cls.longest} ms`);
  await page.mouse.move(c.l + 8, c.t + 8); await sleep(300);
  const dark = await page.screenshot({ encoding: 'base64' });
  if (OUT) writeFileSync(resolve(OUT, `${fname}-O-dark.png`), Buffer.from(dark, 'base64'));
  // THE TWO FAMILIES (w3, fix-review #6): between the rails, Timothy's teal and the reader's one gold, nothing else
  if (r0) {
    const fam = await families(page, dark, Math.round((c.t + r0.topY + 4) * f.dpr), Math.round((c.t + r0.bottomY - 4) * f.dpr), TEAL_HUE, GOLD_HUE);
    note(`${tag} two families between the rails: teal ${fam.teal} px, gold ${fam.gold} px, other ${fam.other} px (${(fam.otherShare * 100).toFixed(2)} %, gate < ${OTHER_MAX * 100} %${fam.other ? '; commonest other hues ' + fam.otherHues : ''})`);
    if (!fam.teal) fails.push(`${tag} two families: no teal drawn (Timothy's notes are on)`);
    if (!fam.gold) fails.push(`${tag} two families: no gold drawn (${placed} links placed)`);
    if (!(fam.otherShare < OTHER_MAX)) fails.push(`${tag} two families: ${(fam.otherShare * 100).toFixed(2)} % of the saturated ink is neither teal nor the reader's gold (hues ${fam.otherHues})`);
    // D1, by shape: a within-the-Volumes link with BOTH pins on screen = >= 2 solid-dot pins on the top rail's row
    const pins = await pinShapes(page, dark, (c.t + r0.topY) * f.dpr, f.dpr, Math.round(f.w * f.dpr), GOLD_HUE);
    note(`${tag} pins on the top rail's row: ${pins.dots} dot (within the Volumes), ${pins.ringDots} ring-and-dot (across), ${pins.other} unclassed`);
    if (pins.dots < 2) fails.push(`${tag} no within-the-Volumes link with both pins on screen (dot pins on the top rail: ${pins.dots}) - the dot pin would be missing from the picture`);
  }
  // light: the theme applied as use-settings.js does; the screen's observer re-reads its tokens
  await page.evaluate(() => document.body.classList.toggle('light', true)); await sleep(600);
  await shot(page, `${fname}-O-light`);
  await page.evaluate(() => document.body.classList.toggle('light', false)); await sleep(400);
  // the legend, cropped
  const lb = await page.evaluate(() => { const e = document.querySelector('.sw-legend'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; });
  if (lb && lb.width > 0) await shot(page, `${fname}-legend`, { x: Math.max(0, lb.x - 8), y: Math.max(0, lb.y - 6), width: Math.min(f.w, lb.width + 16), height: lb.height + 12 });
  else fails.push(`${tag} legend not on screen`);
  // colour-vision pairs
  for (const kind of ['deutan', 'protan']) {
    const url2 = await simulate(page, dark, kind);
    if (OUT) writeFileSync(resolve(OUT, `${fname}-cvd-${kind}.png`), Buffer.from(url2.split(',')[1], 'base64'));
  }
  note(`${tag} O-dark, O-light, legend, cvd-deutan, cvd-protan written`);
  if (!r0) { fails.push(`${tag} ladder: no data-rails`); return; }
  // THE ZOOM LADDER (call 07's adjust, Corbin 2026-09-12: "brighter and brighter ... odd"): the top rail wheeled
  // at the MTAM band to 1x, 6x, 16x and its ceiling under the ONE law; at each step the 40 CSS px band under the
  // rail is scanned (mean luminance, strokes per row, lit share). The plateau leg is the gate: from 16x to the
  // ceiling the alpha is flat and the band only thins, so its mean luminance must not rise (5 % noise margin).
  const vFit = Number(await attr(page, 'data-ppv-vot'));
  const rungs = {};
  for (const step of LADDER) {
    const want = step === 'ceil' ? 1e6 : Number(step);
    let zl = { ok: true, band: r0.top.find((b) => b.label.toLowerCase().startsWith('mtam')), steps: 0, zoom: 1, saturated: false };
    if (want > 1) zl = await zoomTopTo(page, c, r0, 'MTAM', want, vFit);
    if (!zl.ok || !zl.band) { fails.push(`${tag} ladder ${step}: ${zl.why || 'MTAM band not on the rail'}`); break; }
    await settle(page, { x: c.l + c.w / 2, y: c.t + r0.topY + 12 });
    await clearHover(page);
    const b64 = await page.screenshot({ encoding: 'base64' });
    if (OUT) writeFileSync(resolve(OUT, `${fname}-ladder-${step}x.png`), Buffer.from(b64, 'base64'));
    const x0 = Math.round(Math.max(0, zl.band.x0) * f.dpr), x1 = Math.round(Math.min(c.w, zl.band.x1) * f.dpr);
    const y0 = Math.round((c.t + r0.topY + 4) * f.dpr), y1 = Math.round((c.t + r0.topY + 44) * f.dpr);
    const row = await scanBand(page, b64, x0, x1, y0, y1);
    rungs[step] = Object.assign({ zoom: zl.zoom, saturated: zl.saturated }, row);
    note(`${tag} ladder ${step}x: top rail at ${zl.zoom}x fit${zl.saturated ? ' (the rail\'s ceiling)' : ''}, MTAM band ${Math.round(zl.band.x0)}..${Math.round(zl.band.x1)} CSS px: mean luminance ${row.meanLum}, lit-pixel mean ${row.litMean}, median ${row.medianRuns} strokes per row, lit share ${row.litShare}`);
  }
  if (rungs['16'] && rungs.ceil) {
    // THE GATE reads the ink, not the band: the band's x-range is the MTAM segment, which widens with zoom until it
    // spans the frame, and the strokes crossing it per pixel RISE (measured on the old law, phoneLand: 20 strokes
    // over 565 px at 16x, 78 over 1,364 px at the ceiling, x1.6 per px), so the band mean climbs under a flat
    // alpha and would fail the right law. The lit-pixel mean is the per-stroke brightness; it may rise a little
    // on the plateau leg because the stroke widens 1.43 -> 1.6 px and a wider stroke has more fully-covered
    // core per anti-aliased edge - 10 % is that allowance. The old law (alpha 0.35 -> 0.68 on this leg) must
    // FAIL this gate, or the instrument cannot see the complaint: the BEFORE run is its positive control.
    // No ink at either rung is no measurement (the band off-frame, a hover card over it): fail it, never read 0 as flat.
    const inked = rungs['16'].litMean > 0 && rungs.ceil.litMean > 0;
    if (!inked) fails.push(`${tag} ladder: no ink measured at ${rungs['16'].litMean > 0 ? 'the ceiling' : '16x'} (lit-pixel mean 0); the plateau gate measured nothing`);
    const rel = inked ? rungs.ceil.litMean / rungs['16'].litMean : 0;
    const relBand = rungs['16'].meanLum > 0 ? rungs.ceil.meanLum / rungs['16'].meanLum : 0;
    note(`${tag} ladder plateau leg 16x -> ceiling: lit-pixel mean x${rel.toFixed(3)} (the gate: the ink must not brighten; <= 1.10 allows the 1.43 -> 1.6 px width); band mean x${relBand.toFixed(3)} (information: it also counts how many strokes cross the band)`);
    if (rel > 1.10) fails.push(`${tag} ladder: the ink got BRIGHTER from 16x to the ceiling (lit-pixel mean x${rel.toFixed(3)}); the plateau is not holding`);
  }
  if (!CEILINGS.length) return;
  // the corridor pair through the knob (opt-in, --ceilings a,b): the plateau forced to each value at the ceiling
  const z = await zoomTopTo(page, c, r0, 'MTAM', 40, vFit);
  if (!z.ok) { fails.push(`${tag} corridor: ${z.why}`); return; }
  note(`${tag} corridor: top rail at ${z.zoom}x fit after ${z.steps} notches${z.saturated ? ' (the rail\'s own ceiling; the wheel stopped moving it)' : ''}, MTAM band ${Math.round(z.band.x0)}..${Math.round(z.band.x1)} CSS px`);
  // the ceiling only BINDS where the depth alpha law reaches it (0.45 from ~25.5x fit, 0.70 from ~45x);
  // below that the two ceilings paint one alpha by the law, the pair cannot differ, and the gate is not
  // a measurement on this frame (run 3: the desktop rail caps at 18.2x, alpha 0.352 under both)
  const aLo = personalInk(z.zoom, Math.min(...CEILINGS)).context.alpha, aHi = personalInk(z.zoom, Math.max(...CEILINGS)).context.alpha;
  if (!(aHi > aLo)) { note(`${tag} corridor UNRESOLVED on this frame: at ${z.zoom}x fit the context alpha is ${aLo.toFixed(3)} under both ceilings (the law reaches ${Math.min(...CEILINGS)} only deeper); no pair, no gate here`); return; }
  note(`${tag} corridor: context alpha ${aLo.toFixed(3)} @ ${Math.min(...CEILINGS)} vs ${aHi.toFixed(3)} @ ${Math.max(...CEILINGS)} at ${z.zoom}x fit - the ceiling binds, the pair is a measurement`);
  const rows = {};
  for (const ceil of CEILINGS) {
    await page.evaluate((v) => { globalThis.__swContextCeiling = v; }, ceil);
    await settle(page, { x: c.l + c.w / 2, y: c.t + r0.topY + 12 });
    await clearHover(page);
    const b64 = await page.screenshot({ encoding: 'base64' });
    if (OUT) writeFileSync(resolve(OUT, `${fname}-corridor-${ceil}.png`), Buffer.from(b64, 'base64'));
    const x0 = Math.round(Math.max(0, z.band.x0) * f.dpr), x1 = Math.round(Math.min(c.w, z.band.x1) * f.dpr);
    const y0 = Math.round((c.t + r0.topY + 4) * f.dpr), y1 = Math.round((c.t + r0.topY + 44) * f.dpr);
    rows[ceil] = await scanBand(page, b64, x0, x1, y0, y1);
    note(`${tag} corridor @ ceiling ${ceil}: median ${rows[ceil].medianRuns} distinct strokes per row (max ${rows[ceil].maxRuns}), lit share ${rows[ceil].litShare} over ${x1 - x0}x${y1 - y0} device px`);
  }
  await page.evaluate(() => { delete globalThis.__swContextCeiling; });
  const lo = rows[Math.min(...CEILINGS)], hi = rows[Math.max(...CEILINGS)];
  if (lo && hi) {
    const rel = lo.meanLum > 0 ? hi.meanLum / lo.meanLum : 0;
    note(`${tag} corridor band mean luminance ${lo.meanLum} @ ${Math.min(...CEILINGS)} -> ${hi.meanLum} @ ${Math.max(...CEILINGS)} (x${rel.toFixed(3)}; the knob reached the paint iff this moved)`);
    if (!(rel >= 1.03)) fails.push(`${tag} corridor: the two ceilings painted the same band (mean luminance x${rel.toFixed(3)}, want >= 1.03) - the knob did not reach the paint, so the pair is one frame twice`);
    if (hi.medianRuns < 0.8 * lo.medianRuns) fails.push(`${tag} corridor: strokes per row fell ${lo.medianRuns} -> ${hi.medianRuns} at the higher ceiling (threads merging)`);
    if (hi.litShare >= 0.9) fails.push(`${tag} corridor: lit share ${hi.litShare} at the higher ceiling reads as a slab`);
  }
}

let browser, own;
try {
  own = await serveOwnTree();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 240000 });
  const p0 = await (await browser.createBrowserContext()).newPage(); await p0.goto('about:blank');
  const renderer = await p0.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown'; });
  note(`tree ${OWN} @ ${SHA}; renderer ${renderer}; ladder ${LADDER.join(',')}; ceilings ${CEILINGS.length ? CEILINGS.join(',') : 'none (knob comparison off)'}; ${N_LINKS} links (letters from ${VOL_KEYS.map((k) => `${k}:${LETTER_SETS[k].length}`).join(' ')})`);
  for (const fname of FRAME_LIST) {
    if (!FRAMES[fname]) { fails.push(`unknown frame ${fname}`); continue; }
    const page = await (await browser.createBrowserContext()).newPage();
    await walk(page, own.url, fname);
  }
} catch (e) {
  console.error('[e2e-myweb-colour] harness: ' + (e && e.stack || e));
  if (fails.length) console.error('[e2e-myweb-colour] fails so far:\n  ' + fails.join('\n  '));
  process.exitCode = 3;
} finally {
  if (browser) await browser.close();
  if (own) own.server.close();
}
if (OUT) writeFileSync(resolve(OUT, 'e2e-myweb-colour.json'), JSON.stringify({ sha: SHA, ladder: LADDER, ceilings: CEILINGS, notes, fails }, null, 2));
if (process.exitCode === 3) process.exit(3);
if (nothingToCheck) { console.log('[e2e-myweb-colour] NOTHING TO CHECK: ' + nothingToCheck); process.exit(2); }
if (fails.length) { console.log('[e2e-myweb-colour] FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('[e2e-myweb-colour] PASS');
process.exit(0);
