/**
 * tools/e2e-myweb-colour.mjs — My Web colour logic (1b): the pictures for
 * Corbin's call folder and the corridor gate (design-myweb-colour.md, 2026-09-11).
 *
 * ARM K, per frame (phoneLand 800x360 @2 touch, desktop 1920x1080 @2), on a
 * fresh browser context each:
 *   1. boot, SEED 20 reader links through the app's own persistLink (7 within
 *      scripture, 6 within the Volumes, 7 across; the subtitle's count is
 *      read back and printed; < 15 placed is a FAIL: the picture would be a lie)
 *   2. open My Web (corpus context on, view reset): `<frame>-O-dark.png`
 *   3. body.light applied exactly as use-settings.js does: `<frame>-O-light.png`
 *      (the canvas is black in both themes by construction; the chrome is what
 *      changes), then removed
 *   4. the legend cropped from the dark frame: `<frame>-legend.png`
 *   5. colour-vision pairs from the dark overview PNG (decoded in a scratch
 *      canvas, never getImageData on the app canvas): Machado 2009 severity 1.0
 *      deuteranopia and protanopia, `<frame>-cvd-deutan.png`, `<frame>-cvd-protan.png`
 *   6. THE CORRIDOR PAIR (the Orchestrator's gate on the 0.45 -> 0.70 ceiling):
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
 *   node tools/e2e-myweb-colour.mjs [--frames phoneLand,desktop] [--out DIR] [--ceilings 0.45,0.70] [--links 20]
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
const FRAME_LIST = arg('frames', 'phoneLand,desktop').split(',');
const CEILINGS = arg('ceilings', '0.45,0.70').split(',').map(Number);
const N_LINKS = Number(arg('links', '20'));
const NAV_MS = 60000;
const MIN_PLACED = 15;

const dirty = execSync('git status --porcelain', { cwd: OWN }).toString().trim();
if (dirty) { console.error(`[e2e-myweb-colour] REFUSING: dirty tree ${OWN}\n` + dirty); process.exit(3); }
const SHA = execSync('git rev-parse --short HEAD', { cwd: OWN }).toString().trim();
const puppeteer = createRequire(pathToFileURL(resolve(OWN, 'package.json')))('puppeteer');
const { serveOwnTree } = await import(pathToFileURL(resolve(OWN, 'tools/e2e-read-serve.mjs')).href);
if (OUT) mkdirSync(OUT, { recursive: true });

const FRAMES = {
  phoneLand: { w: 800, h: 360, dpr: 2, mobile: true },
  desktop: { w: 1920, h: 1080, dpr: 2, mobile: false },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
let nothingToCheck = null;
const notes = [];
const note = (s) => { notes.push(s); console.log('[e2e-myweb-colour] ' + s); };

// ── the seed: the reader's links, in the shapes the legend names ──
const LETTER_IDS = (() => {
  const src = readFileSync(resolve(OWN, 'app/src/main/assets/src/data/volume-one.js'), 'utf8');
  const ids = []; const re = /"id":\s*"([a-z0-9-]+)"/g; let m;
  while ((m = re.exec(src)) && ids.length < 8) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
})();
const BIBLE = [['genesis', 1, 1], ['exodus', 20, 3], ['psalms', 23, 1], ['isaiah', 53, 5], ['john', 3, 16], ['romans', 8, 28],
  ['revelation', 21, 4], ['proverbs', 3, 5], ['deuteronomy', 6, 4], ['jeremiah', 29, 11], ['matthew', 5, 3], ['hebrews', 11, 1], ['micah', 6, 8], ['daniel', 3, 17]];
const bibleEp = ([b, c, v]) => ({ type: 'bible', key: `bible:${b}:${c}:${v}`, bookId: b, chapter: c, verse: v, label: `${b} ${c}:${v}` });
const letterEp = (id) => ({ type: 'letter', key: `letter:${id}`, volKey: 'one', letterId: id, label: id });
function seedPairs(n) {
  const pairs = [];
  const nWithin = Math.round(n * 0.35), nVol = Math.round(n * 0.3), nAcross = n - nWithin - nVol;
  for (let i = 0; i < nWithin; i++) pairs.push([bibleEp(BIBLE[i]), bibleEp(BIBLE[(i + 7) % BIBLE.length])]);
  for (let i = 0; i < nVol; i++) pairs.push([letterEp(LETTER_IDS[i % LETTER_IDS.length]), letterEp(LETTER_IDS[(i + 3) % LETTER_IDS.length])]);
  for (let i = 0; i < nAcross; i++) pairs.push([bibleEp(BIBLE[(i + 3) % BIBLE.length]), letterEp(LETTER_IDS[(i + 1) % LETTER_IDS.length])]);
  return pairs;
}

const finder = (l) => [...document.querySelectorAll('button,[role=button],a')]
  .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0);
async function clickLabel(page, label) {
  await page.waitForFunction((l, s) => !!(new Function('return ' + s)())(l), { timeout: NAV_MS, polling: 200 }, label, finder.toString());
  await page.evaluate((l, s) => (new Function('return ' + s)())(l).click(), label, finder.toString());
}
const clickIfPresent = (page, label) => page.evaluate((l, s) => { const b = (new Function('return ' + s)())(l); if (!b) return false; b.click(); return true; }, label, finder.toString());
async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; }, { timeout: NAV_MS, polling: 200 });
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
  await clickLabel(page, 'The Whole Counsel');
  await page.waitForFunction(() => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), { timeout: NAV_MS, polling: 200 });
  if (await page.$('.sw-fallback')) return false;
  await page.waitForFunction(() => !document.querySelector('.sw-loading'), { timeout: NAV_MS, polling: 200 });
  await clickLabel(page, 'My web'); await sleep(800);
  await clickIfPresent(page, 'Dismiss'); await sleep(300);
  await clickIfPresent(page, 'Reset the view'); await sleep(700);
  return true;
}
const attr = (page, k) => page.evaluate((k) => (document.querySelector('.sw-root') || { getAttribute: () => null }).getAttribute(k), k);
const rails = (page) => page.evaluate(() => JSON.parse((document.querySelector('.sw-root') || { getAttribute: () => null }).getAttribute('data-rails') || 'null'));
const canvasRect = (page) => page.evaluate(() => { const b = document.querySelector('.sw-canvas-ui').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
const subtitle = (page) => page.evaluate(() => { const p = document.querySelector('.sw-title p'); return p ? p.textContent.trim() : ''; });
async function shot(page, name, clip) { if (!OUT) return; await page.screenshot(Object.assign({ path: resolve(OUT, name + '.png') }, clip ? { clip } : {})); }
async function settle(page) { await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(900); }

/** The longest task while the screen redraws once: the launch classification, printed, never gated. */
async function classify(page) {
  const longest = await page.evaluate(async () => {
    let max = 0;
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) max = Math.max(max, e.duration); });
    po.observe({ entryTypes: ['longtask'] });
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => setTimeout(r, 1200));
    po.disconnect();
    return Math.round(max);
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

/** Distinct lit runs per row and the lit share over a band of the screenshot (scratch canvas). */
const scanBand = (page, b64, x0, x1, y0, y1) => page.evaluate(async (b64, x0, x1, y0, y1) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const W = x1 - x0, H = y1 - y0;
  const d = g.getImageData(x0, y0, W, H).data;
  const runs = []; let lit = 0;
  for (let y = 0; y < H; y++) {
    let n = 0, prev = 0;
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4; const on = (d[p] + d[p + 1] + d[p + 2] > 90) ? 1 : 0;
      lit += on; if (on && !prev) n++; prev = on;
    }
    runs.push(n);
  }
  runs.sort((a, b) => a - b);
  return { rows: H, medianRuns: runs[Math.floor(H / 2)], maxRuns: runs[H - 1], litShare: +(lit / (W * H)).toFixed(3) };
}, b64, x0, x1, y0, y1);

async function zoomTopTo(page, c, r0, label, factor) {
  const v0 = Number(await attr(page, 'data-ppv-vot'));
  for (let i = 0; i < 40; i++) {
    const r = await rails(page);
    if (!r) return { ok: false, why: 'data-rails not published' };
    const band = r.top.find((b) => b.label.toLowerCase().startsWith(label.toLowerCase()));
    if (!band) return { ok: false, why: `band ${label} not visible after ${i} notches` };
    const v = Number(await attr(page, 'data-ppv-vot'));
    if (v / v0 >= factor) return { ok: true, band, steps: i, zoom: +(v / v0).toFixed(1) };
    const cx = c.l + Math.max(4, Math.min(c.w - 4, (band.x0 + band.x1) / 2));
    await page.mouse.move(cx, c.t + r0.topY + 12);
    await page.mouse.wheel({ deltaY: -120 }); await sleep(160);
  }
  return { ok: false, why: 'ran out of notches' };
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
  const cls = await classify(page);
  note(`${tag} launch: ${cls.klass}, longest task ${cls.longest} ms`);
  await page.mouse.move(c.l + 8, c.t + 8); await sleep(300);
  const dark = await page.screenshot({ encoding: 'base64' });
  if (OUT) writeFileSync(resolve(OUT, `${fname}-O-dark.png`), Buffer.from(dark, 'base64'));
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
  // the corridor pair
  if (!r0) { fails.push(`${tag} corridor: no data-rails`); return; }
  const z = await zoomTopTo(page, c, r0, 'MTAM', 40);
  if (!z.ok) { fails.push(`${tag} corridor: ${z.why}`); return; }
  note(`${tag} corridor: top rail at ${z.zoom}x fit after ${z.steps} notches, MTAM band ${Math.round(z.band.x0)}..${Math.round(z.band.x1)} CSS px`);
  const rows = {};
  for (const ceil of CEILINGS) {
    await page.evaluate((v) => { globalThis.__swContextCeiling = v; }, ceil);
    await settle(page);
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
  note(`tree ${OWN} @ ${SHA}; renderer ${renderer}; ceilings ${CEILINGS.join(',')}; ${N_LINKS} links (${LETTER_IDS.length} letter ids from volume-one)`);
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
if (OUT) writeFileSync(resolve(OUT, 'e2e-myweb-colour.json'), JSON.stringify({ sha: SHA, ceilings: CEILINGS, notes, fails }, null, 2));
if (process.exitCode === 3) process.exit(3);
if (nothingToCheck) { console.log('[e2e-myweb-colour] NOTHING TO CHECK: ' + nothingToCheck); process.exit(2); }
if (fails.length) { console.log('[e2e-myweb-colour] FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('[e2e-myweb-colour] PASS');
process.exit(0);
