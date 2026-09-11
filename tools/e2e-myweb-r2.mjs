/**
 * tools/e2e-myweb-r2.mjs — My Web zoom geometry + independent two-rail zoom
 * (design-perf, 2026-09-11, Corbin's "grey lines look low resolution … zoom in,
 * lines turn into a completely horizontal mess … zoom both independently").
 *
 * ARMS (each printed with its numbers whichever way it lands):
 *   S  streak: My Web, 0 links, corpus context ON, the Bible rail wheeled 8
 *      notches over Psalms (the frame of Corbin's screenshot). Two instruments
 *      over the band rows 22..80 % of the height of a fresh-decoded screenshot:
 *        rowFraction  rows with >= 60 % of their width lit (v1; saturates on a
 *                     dense field of REAL threads on a 144 px gap, printed as
 *                     information)
 *        aniso        of lit pixels, the share lit at x±8 on their own row and
 *                     dark at y±8 in their own column: a near-horizontal run
 *                     with dark above and below, the streak signature (v2, the
 *                     gate). A diagonal or a dense crossing field reads low.
 *      PASS: aniso <= STREAK_ANISO on both frames (main reads the BEFORE).
 *   T  two-rail: wheel over the top rail until Rebuke fills >= 60 % of the
 *      width while data-ppv-css (the Bible camera) does not move; then wheel
 *      over the bottom rail until Isaiah fills >= 60 % while data-ppv-vot does
 *      not move. Endpoints THROUGH THE REAL UI: the pointer scans the Isaiah
 *      band 6 px above the bottom rail until the hover card reads "Corpus
 *      connection" with an Isaiah verse; then the Rebuke band 6 px below the
 *      top rail until the card's third line (the Volume the passage sits in)
 *      reads Rebuke. Then the pills:
 *      "Reset the Volumes rail" returns only the top camera to fit; "Reset the
 *      view" returns both. Then the reverse pairing: top to the leftmost
 *      collection (Vol I), bottom to Revelation, the same card assertions.
 *      On main nothing is published (no data-rails, one camera): the arm fails
 *      at its first assertion, which is the RED.
 *
 * USAGE
 *   node tools/e2e-myweb-r2.mjs [--frames phoneLand,desktop] [--out DIR] [--before TREE]
 *   --before TREE serves THAT tree (its own tools/e2e-read-serve.mjs, its own
 *   git status) and measures it with this file's instruments: the BEFORE
 *   number comes from the same exported code as the AFTER. Both trees must be
 *   clean (git status --porcelain): the tree under test IS the commit.
 *
 * EXIT: 0 pass, 1 fail, 2 nothing-to-check (the screen never drew), 3 harness.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const HERE = dirname(fileURLToPath(import.meta.url));
const OWN = resolve(HERE, '..');
const TREE = resolve(arg('before', OWN));
const OUT = arg('out', '');
const FRAME_LIST = arg('frames', 'phoneLand,desktop').split(',');
const NAV_MS = 60000;
const STREAK_ANISO = 0.30;   // v2 gate; main read 0.5x on both frames, the tip below (numbers in the log)
const BAND_FILL = 0.6;       // a rail "zoomed to a book": the book spans >= 60 % of the width

for (const t of new Set([OWN, TREE])) {
  const dirty = execSync('git status --porcelain', { cwd: t }).toString().trim();
  if (dirty) { console.error(`[e2e-myweb-r2] REFUSING: dirty tree ${t}\n` + dirty); process.exit(3); }
}
const sha = (t) => execSync('git rev-parse --short HEAD', { cwd: t }).toString().trim();
const puppeteer = createRequire(pathToFileURL(resolve(OWN, 'package.json')))('puppeteer');
const { serveOwnTree } = await import(pathToFileURL(resolve(TREE, 'tools/e2e-read-serve.mjs')).href);
if (OUT) mkdirSync(OUT, { recursive: true });

const FRAMES = {
  phoneLand: { w: 800, h: 360, dpr: 2, mobile: true },
  desktop: { w: 1920, h: 1080, dpr: 2, mobile: false },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
let nothingToCheck = null;
const notes = [];
const note = (s) => { notes.push(s); console.log('[e2e-myweb-r2] ' + s); };

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
  await clickLabel(page, 'Continue'); await clickLabel(page, 'Begin Reading'); await sleep(500);
  await clickIfPresent(page, 'Maybe later'); await sleep(200);
}
async function toMyWeb(page) {
  await clickLabel(page, 'Personal Study'); await sleep(400);
  await clickLabel(page, 'The Whole Counsel');
  await page.waitForFunction(() => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), { timeout: NAV_MS });
  if (await page.$('.sw-fallback')) return false;
  await page.waitForFunction(() => !document.querySelector('.sw-loading'), { timeout: NAV_MS });
  await clickLabel(page, 'My web'); await sleep(800);
  await clickIfPresent(page, 'Dismiss'); await sleep(300);
  await clickIfPresent(page, 'Reset the view'); await sleep(700);
  return true;
}
const attr = (page, k) => page.evaluate((k) => (document.querySelector('.sw-root') || { getAttribute: () => null }).getAttribute(k), k);
const rails = (page) => page.evaluate(() => JSON.parse((document.querySelector('.sw-root') || { getAttribute: () => null }).getAttribute('data-rails') || 'null'));
const ppv = async (page) => ({ b: Number(await attr(page, 'data-ppv-css')), v: Number(await attr(page, 'data-ppv-vot')) });
const canvasRect = (page) => page.evaluate(() => { const b = document.querySelector('.sw-canvas-ui').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
const tipText = (page) => page.evaluate(() => {
  const t = document.querySelector('.sw-tip'); if (!t) return null;
  const q = (c) => { const e = t.querySelector(c); return e ? e.textContent.trim() : ''; };
  return { eyebrow: q('.sw-tip-eyebrow'), ref: q('.sw-tip-ref'), alt: q('.sw-tip-ref-alt'), meta: q('.sw-tip-meta') };
});

/** Both instruments over a fresh-decoded screenshot (never getImageData on the app canvas). */
const streak = (page, b64) => page.evaluate(async (b64, y0f, y1f) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const W = c.width, H = c.height;
  const d = g.getImageData(0, 0, W, H).data;
  const lit = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < lit.length; i++, p += 4) lit[i] = (d[p] + d[p + 1] + d[p + 2] > 60) ? 1 : 0;
  const y0 = Math.floor(H * y0f), y1 = Math.floor(H * y1f);
  const R = 8;
  let streakRows = 0, nLit = 0, nAniso = 0;
  for (let y = y0; y < y1; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      if (!lit[y * W + x]) continue;
      row++; nLit++;
      if (x < R || x >= W - R || y < R || y >= H - R) continue;
      const hx = lit[y * W + x - R] && lit[y * W + x + R];
      const vy = lit[(y - R) * W + x] || lit[(y + R) * W + x];
      if (hx && !vy) nAniso++;
    }
    if (row / W >= 0.6) streakRows++;
  }
  return { rows: y1 - y0, rowFraction: +(streakRows / (y1 - y0)).toFixed(3), litPixels: nLit, aniso: +(nAniso / Math.max(1, nLit)).toFixed(3) };
}, b64, 0.22, 0.80);

async function shot(page, name) { if (OUT) await page.screenshot({ path: resolve(OUT, name + '.png') }); }

/** Wheel over one rail at a band's centre until the band spans >= frac of the width. */
async function zoomBandTo(page, c, r0, which, label, frac) {
  for (let i = 0; i < 40; i++) {
    const r = await rails(page);
    if (!r) return { ok: false, why: 'data-rails not published' };
    const bands = which === 'top' ? r.top : r.bottom;
    const band = bands.find((b) => b.label.toLowerCase().startsWith(label.toLowerCase()));
    if (!band) return { ok: false, why: `band ${label} not visible after ${i} notches; visible ${bands.length}: ${bands[0] && bands[0].label}..${bands[bands.length - 1] && bands[bands.length - 1].label}; cam ${JSON.stringify(r.cam)} camV ${JSON.stringify(r.camV)}` };
    if ((band.x1 - band.x0) / c.w >= frac) return { ok: true, band, steps: i };
    // anchor INSIDE the band: Revelation is 10 px wide at fit on 800 px, and a
    // 20 px edge clamp put the anchor in Jude, so the zoom pushed it off screen
    const cx = c.l + Math.max(4, Math.min(c.w - 4, (band.x0 + band.x1) / 2));
    await page.mouse.move(cx, which === 'top' ? c.t + r0.topY + 12 : c.t + r0.bottomY - 12);
    await page.mouse.wheel({ deltaY: -120 }); await sleep(160);
  }
  return { ok: false, why: 'ran out of steps' };
}

/** Scan a band along its rail through the real hover until the card names the book. */
async function hoverEndpoint(page, c, r, which, band, want) {
  const y = which === 'top' ? c.t + r.topY + 6 : c.t + r.bottomY - 6;
  const x0 = Math.max(24, band.x0 + 8), x1 = Math.min(c.w - 24, band.x1 - 8);
  const tries = 40;
  let last = null;
  for (let i = 0; i < tries; i++) {
    const x = c.l + x0 + (x1 - x0) * ((i * 0.618) % 1);   // golden-ratio scatter across the band
    await page.mouse.move(x, y); await sleep(120);
    const t = await tipText(page);
    last = t;
    if (t && /Corpus connection/i.test(t.eyebrow)) {
      const text = which === 'top' ? t.meta : t.ref;
      if (want.test(text)) return { ok: true, x: Math.round(x - c.l), card: t, tries: i + 1 };
    }
  }
  return { ok: false, last, tries };
}

async function armS(page, tag, fname, c, r0) {
  const p0 = await ppv(page);
  await page.mouse.move(c.l + c.w * 0.55, c.t + (r0 ? r0.bottomY : c.h * 0.8) - 10);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: -280 }); await sleep(180); }
  await sleep(600);
  const p1 = await ppv(page);
  await page.mouse.move(c.l + 8, c.t + 8); await sleep(250);   // park: no hover card in the frame
  await shot(page, `${fname}-S-psalms-10x`);
  const s = await streak(page, await page.screenshot({ encoding: 'base64' }));
  note(`${tag} S: Bible ${(p1.b / p0.b).toFixed(1)}x (Volumes ${(p1.v / p0.v || 1).toFixed(1)}x): rowFraction ${s.rowFraction}, aniso ${s.aniso} (lit ${s.litPixels} px, gate <= ${STREAK_ANISO})`);
  if (!(s.aniso <= STREAK_ANISO)) fails.push(`${tag} S: aniso ${s.aniso} > ${STREAK_ANISO}: the zoomed context reads as a horizontal streak field`);
  await clickIfPresent(page, 'Reset the view'); await sleep(600);
  return s;
}

async function pairing(page, tag, fname, c, r0, topLabel, bottomLabel, topWant, bottomWant, suffix) {
  const before = await ppv(page);
  const t = await zoomBandTo(page, c, r0, 'top', topLabel, BAND_FILL);
  const mid = await ppv(page);
  if (!t.ok) { fails.push(`${tag} T${suffix}: top rail to ${topLabel}: ${t.why}`); return null; }
  if (!(mid.v > before.v * 1.5)) fails.push(`${tag} T${suffix}: the Volumes camera did not zoom (ppv-vot ${before.v} -> ${mid.v})`);
  if (!(Math.abs(mid.b - before.b) <= before.b * 0.01)) fails.push(`${tag} T${suffix}: wheeling over the TOP rail moved the Bible camera (ppv-css ${before.b} -> ${mid.b}): the zoom is not independent`);
  const b = await zoomBandTo(page, c, r0, 'bottom', bottomLabel, BAND_FILL);
  const after = await ppv(page);
  if (!b.ok) { await shot(page, `${fname}-T${suffix}-FAIL`); fails.push(`${tag} T${suffix}: bottom rail to ${bottomLabel}: ${b.why}`); return null; }
  if (!(after.b > mid.b * 1.5)) fails.push(`${tag} T${suffix}: the Bible camera did not zoom (ppv-css ${mid.b} -> ${after.b})`);
  if (!(Math.abs(after.v - mid.v) <= mid.v * 0.01)) fails.push(`${tag} T${suffix}: wheeling over the BOTTOM rail moved the Volumes camera (ppv-vot ${mid.v} -> ${after.v}): the zoom is not independent`);
  await sleep(400);
  const r = await rails(page);
  note(`${tag} T${suffix}: top ${topLabel} ${t.steps} notches -> ${((t.band.x1 - t.band.x0) / c.w * 100).toFixed(0)} % of the width, Volumes ${(after.v / before.v).toFixed(1)}x; bottom ${bottomLabel} ${b.steps} notches -> ${((b.band.x1 - b.band.x0) / c.w * 100).toFixed(0)} %, Bible ${(after.b / before.b).toFixed(1)}x; visible top ${r.top.map((x) => x.label).join('|')} bottom ${r.bottom.map((x) => x.label).join('|')}`);
  const eb = await hoverEndpoint(page, c, r, 'bottom', b.band, bottomWant);
  const et = await hoverEndpoint(page, c, r, 'top', t.band, topWant);
  const card = (h) => `"${h.card.ref}" ↕ "${h.card.alt}" (${h.card.meta})`;
  note(`${tag} T${suffix}: bottom endpoint ${eb.ok ? `hit at x ${eb.x} after ${eb.tries}: ${card(eb)}` : `MISS after ${eb.tries} (last card ${JSON.stringify(eb.last)})`}; top endpoint ${et.ok ? `hit at x ${et.x} after ${et.tries}: ${card(et)}` : `MISS after ${et.tries} (last card ${JSON.stringify(et.last)})`}`);
  if (!eb.ok) fails.push(`${tag} T${suffix}: no thread within 14 px of the bottom rail inside ${bottomLabel} names a ${bottomLabel} verse`);
  if (!et.ok) fails.push(`${tag} T${suffix}: no thread within 14 px of the top rail inside ${topLabel} names ${topLabel}`);
  await page.mouse.move(c.l + 8, c.t + 8); await sleep(250);
  await shot(page, `${fname}-T${suffix}-${topLabel}-${bottomLabel}`.replace(/\s+/g, '_'));
  const s = await streak(page, await page.screenshot({ encoding: 'base64' }));
  note(`${tag} T${suffix}: streak rowFraction ${s.rowFraction}, aniso ${s.aniso}`);
  if (!(s.aniso <= STREAK_ANISO)) fails.push(`${tag} T${suffix}: aniso ${s.aniso} > ${STREAK_ANISO} with both rails zoomed`);
  return { t, b, after, before };
}

async function walk(page, url, fname) {
  const f = FRAMES[fname];
  const tag = `[${fname} ${f.w}x${f.h}]`;
  await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
  await boot(page, url);
  if (!(await toMyWeb(page))) { nothingToCheck = `${tag} the web could not be drawn (.sw-fallback)`; return; }
  const c = await canvasRect(page);
  const r0 = await rails(page);
  note(`${tag} rails ${r0 ? `topY ${r0.topY} bottomY ${r0.bottomY}, ${r0.top.length} collections, ${r0.bottom.length} books` : 'NOT PUBLISHED (data-rails absent)'}`);
  await armS(page, tag, fname, c, r0);
  if (!r0) { fails.push(`${tag} T: the screen publishes no data-rails, so no rail can be zoomed to a book`); return; }
  const p1 = await pairing(page, tag, fname, c, r0, 'Rebuke', 'Isaiah', /Rebuke/i, /^Isaiah\b/, '1');
  if (p1) {
    // the pills: the top pill returns only the Volumes camera; global Reset returns both
    await clickLabel(page, 'Reset the Volumes rail'); await sleep(500);
    const q = await ppv(page);
    const topBack = Math.abs(q.v - p1.before.v) <= p1.before.v * 0.01, bibleHeld = Math.abs(q.b - p1.after.b) <= p1.after.b * 0.01;
    note(`${tag} T1 pill "Reset the Volumes rail": Volumes ${(q.v / p1.before.v).toFixed(2)}x of fit, Bible ${(q.b / p1.before.b).toFixed(1)}x held`);
    if (!topBack) fails.push(`${tag} T1: the Volumes pill did not return the top camera to fit`);
    if (!bibleHeld) fails.push(`${tag} T1: the Volumes pill moved the Bible camera`);
    await clickLabel(page, 'Reset the view'); await sleep(500);
    const z = await ppv(page);
    if (!(Math.abs(z.b - p1.before.b) <= p1.before.b * 0.01 && Math.abs(z.v - p1.before.v) <= p1.before.v * 0.01)) fails.push(`${tag} T1: "Reset the view" did not return both cameras to fit (${JSON.stringify(z)} vs ${JSON.stringify(p1.before)})`);
  }
  await clickIfPresent(page, 'Reset the view'); await sleep(500);
  await pairing(page, tag, fname, c, r0, 'Vol I', 'Revelation', /^Vol I$/, /^Revelation\b/, '2');
  await clickIfPresent(page, 'Reset the view'); await sleep(300);
}

let browser, own;
try {
  own = await serveOwnTree();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 240000 });
  let page = await (await browser.createBrowserContext()).newPage();
  const renderer = await (async () => { await page.goto('about:blank'); return page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : null; }); })();
  note(`tree ${TREE} @ ${sha(TREE)}${TREE !== OWN ? ` (instrument from ${sha(OWN)})` : ''}; renderer ${renderer}`);
  for (const fname of FRAME_LIST) {
    if (!FRAMES[fname]) { fails.push(`unknown frame ${fname}`); continue; }
    // a fresh context per frame: the first walk's onboarding answers live in its storage
    page = await (await browser.createBrowserContext()).newPage();
    await walk(page, own.url, fname);
  }
} catch (e) {
  console.error('[e2e-myweb-r2] harness: ' + (e && e.stack || e));
  if (fails.length) console.error('[e2e-myweb-r2] fails so far:\n  ' + fails.join('\n  '));
  process.exitCode = 3;
} finally {
  if (browser) await browser.close();
  if (own) own.server.close();
}
if (OUT) writeFileSync(resolve(OUT, 'e2e-myweb-r2.json'), JSON.stringify({ tree: TREE, sha: sha(TREE), notes, fails }, null, 2));
if (process.exitCode === 3) process.exit(3);
if (nothingToCheck) { console.log('[e2e-myweb-r2] NOTHING TO CHECK: ' + nothingToCheck); process.exit(2); }
if (fails.length) { console.log('[e2e-myweb-r2] FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('[e2e-myweb-r2] PASS');
process.exit(0);
