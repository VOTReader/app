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
 *                     dark at y±8 in their own column (v2, information: a stack
 *                     of streaks 2-3 px apart defeats it, main read 0.04-0.07)
 *        horiz        of EDGE pixels (Sobel |g| > 40 on the summed RGB), the
 *                     share whose gradient is within ~18 deg of vertical, i.e.
 *                     the line under them runs within ~18 deg of horizontal.
 *                     A stack of streaks reads high whatever its density; a fan
 *                     of diagonals reads low; a saturated blob has no edges and
 *                     drops out. (v3, the gate)
 *      PASS: horiz <= STREAK_HORIZ[frame] (registered per frame at measured
 *      plus margin, the way R5 ceilings are keyed; main reads the BEFORE).
 *   O  overview shot at rest, for the byte-wise comparison between tips.
 *   C  continuity notch strip, Corbin's exact ask ("one tiny little increment
 *      of zoom later ... the green lines have merged"): from T1's frame the
 *      pointer finds ONE thread near the centre of the Isaiah band (its card
 *      publishes data-verse / data-vot); the view is reset; then 22 notches
 *      over the top rail at the centre of that thread's collection, one
 *      capture per notch, then 22 over the bottom rail at the centre of its
 *      book. At every notch the thread's endpoints and stroke class come from
 *      the tree's own exported geometry (verseToX, threadPath) fed the
 *      published cameras. Registered: the largest per-notch endpoint
 *      displacement in CSS px, and that the thread is never null and never
 *      changes stroke class (rise-only vs rise+run) between adjacent notches.
 *      Each notch's capture is taken while the gesture is still LIVE (inside
 *      the 150 ms hold, data-cap-fraction 0): what a moving finger sees.
 *   R  release: from the overview one wheel notch over the Bible rail at the
 *      Matthew corridor, then data-cap-fraction (the fraction the screen drew
 *      that frame: 0 live, 1 full) read every animation frame through the
 *      150 ms hold and the 250 ms fade, with a longtask observer beside it.
 *      This asserts the app's coverage SCHEDULE, not the picture: the picture
 *      is a pure function of the fraction (layerCap eases brightness in it),
 *      and pixels cannot be read tonight without demoting the canvas (below).
 *      Gate: after the last live frame at least three fading frames spanning
 *      >= 100 ms, never falling, then 1. Fewer is a POP when the jump into
 *      full sits between two ticks <= 50 ms apart (the Verifier's bite, fade
 *      removed: 0 fading frames, both frames, 4-5 ms cadence), UNRESOLVED when
 *      the tick gap there is longer (neither passes).
 *      Launch classification, printed on every launch: release frames drawn
 *      as main-thread long tasks >= 50 ms mean the 2D canvas is in software
 *      raster for that browser (measured on the RTX 5080 D3D11 string: 330-502
 *      ms a frame on desktop, 73-105 ms on the phone frame, against 5-8 ms
 *      accelerated; a new page in the same browser inherits it), so that
 *      launch is not a number: the browser is relaunched, up to three, and
 *      three software launches FAIL as "not a number". NO pixel read-back in
 *      this arm and it runs FIRST on a fresh page: two getImageData reads on
 *      the ui canvas, even before the notch, demote it the same way; the
 *      luminance instrument at 56133fd4 measured the defect it created (on a
 *      quiet machine it read 0.51-0.96/255 per fading frame: information).
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
 *   node tools/e2e-myweb-r2.mjs [--frames phoneLand,desktop] [--arms O,S,T,C] [--out DIR] [--before TREE]
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
/* v3 gate. Measured 2026-09-11 on the RTX 5080 with this instrument: main
   ce710380 reads 0.874 (800x360) / 0.900 (1920x1080); the tip ae30374e reads
   0.365 / 0.219. The gate sits at the midpoint so a regression halfway back to
   the streak field fails. The phone frame's 0.365 is its geometry, not a
   defect: a 144 px gap under 800 px puts a thread crossing 500 px at 16 deg. */
const STREAK_HORIZ = { phoneLand: 0.45, desktop: 0.35 };   // per frame: measured tip + margin; main fails both
const NOTCHES = 22;
const ARMS = arg('arms', 'R,O,S,T,C').split(',');
const BAND_FILL = 0.6;
// arm R launch classifier: an accelerated release frame draws in 5-8 ms here;
// a software-raster one in 73-105 ms (phone) / 330-502 ms (desktop). 50 sits
// between the two populations with a factor of >= 1.4 to the nearer one.
const SOFT_MS = 50;
// diagnosis only (e.g. --disable-features=SkiaGraphite); a run with args is
// not the frame the reader gets and is printed as such
const CHROME_ARGS = (process.env.MYWEB_CHROME_ARGS || '').split(' ').filter(Boolean);       // a rail "zoomed to a book": the book spans >= 60 % of the width

for (const t of new Set([OWN, TREE])) {
  const dirty = execSync('git status --porcelain', { cwd: t }).toString().trim();
  if (dirty) { console.error(`[e2e-myweb-r2] REFUSING: dirty tree ${t}\n` + dirty); process.exit(3); }
}
const sha = (t) => execSync('git rev-parse --short HEAD', { cwd: t }).toString().trim();
const puppeteer = createRequire(pathToFileURL(resolve(OWN, 'package.json')))('puppeteer');
const { serveOwnTree } = await import(pathToFileURL(resolve(TREE, 'tools/e2e-read-serve.mjs')).href);
// the tree's own law, for arm C (main has no threadPath: the arm reports that and stops)
const law = {
  ...(await import(pathToFileURL(resolve(TREE, 'app/src/main/assets/src/utils/scripture-web/geometry.js')).href)),
  ...(await import(pathToFileURL(resolve(TREE, 'app/src/main/assets/src/ui/scripture-web/rail-renderer.js')).href).catch(() => ({}))),
};
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
  await clickLabel(page, 'Scripture Web');   // the Library row (its "The Whole Counsel" eyebrow left 2026-09-25)
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
  return { eyebrow: q('.sw-tip-eyebrow'), ref: q('.sw-tip-ref'), alt: q('.sw-tip-ref-alt'), meta: q('.sw-tip-meta'), verse: Number(t.getAttribute('data-verse')), vot: Number(t.getAttribute('data-vot')) };
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
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = d[p] + d[p + 1] + d[p + 2];
  const R = 8;
  let streakRows = 0, nLit = 0, nAniso = 0, nEdge = 0, nHoriz = 0;
  for (let y = y0; y < y1; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      if (x >= 1 && x < W - 1 && y >= 1 && y < H - 1) {
        // Sobel on the summed RGB
        const i = y * W + x;
        const gx = (lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1]) - (lum[i - W - 1] + 2 * lum[i - 1] + lum[i + W - 1]);
        const gy = (lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1]) - (lum[i - W - 1] + 2 * lum[i - W] + lum[i - W + 1]);
        const ax = Math.abs(gx), ay = Math.abs(gy);
        if (ax + ay > 40 * 4) { nEdge++; if (ay >= 3 * ax) nHoriz++; }
      }
      if (!lit[y * W + x]) continue;
      row++; nLit++;
      if (x < R || x >= W - R || y < R || y >= H - R) continue;
      const hx = lit[y * W + x - R] && lit[y * W + x + R];
      const vy = lit[(y - R) * W + x] || lit[(y + R) * W + x];
      if (hx && !vy) nAniso++;
    }
    if (row / W >= 0.6) streakRows++;
  }
  return { rows: y1 - y0, rowFraction: +(streakRows / (y1 - y0)).toFixed(3), litPixels: nLit, aniso: +(nAniso / Math.max(1, nLit)).toFixed(3), edgePixels: nEdge, horiz: +(nHoriz / Math.max(1, nEdge)).toFixed(3) };
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
  const gate = STREAK_HORIZ[fname];
  note(`${tag} S: Bible ${(p1.b / p0.b).toFixed(1)}x (Volumes ${(p1.v / p0.v || 1).toFixed(1)}x): horiz ${s.horiz} (edges ${s.edgePixels}, gate <= ${gate}); rowFraction ${s.rowFraction}, aniso ${s.aniso} (lit ${s.litPixels} px)`);
  if (!(s.horiz <= gate)) fails.push(`${tag} S: horiz ${s.horiz} > ${gate}: the zoomed context reads as a horizontal streak field`);
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
  note(`${tag} T${suffix}: streak horiz ${s.horiz} (edges ${s.edgePixels}), rowFraction ${s.rowFraction}, aniso ${s.aniso}`);
  if (!(s.horiz <= STREAK_HORIZ[fname])) fails.push(`${tag} T${suffix}: horiz ${s.horiz} > ${STREAK_HORIZ[fname]} with both rails zoomed`);
  return { t, b, after, before };
}

/** Arm C: the notch strip. */
async function armC(page, tag, fname, c, r0, f) {
  if (!law.threadPath || !law.verseToX) { note(`${tag} C: this tree exports no threadPath; no strip`); fails.push(`${tag} C: no thread geometry to follow`); return; }
  // (1) find one thread near the centre of Isaiah in T1's frame
  const t = await zoomBandTo(page, c, r0, 'top', 'Rebuke', BAND_FILL);
  const b = await zoomBandTo(page, c, r0, 'bottom', 'Isaiah', BAND_FILL);
  if (!t.ok || !b.ok) { fails.push(`${tag} C: could not reach T1's frame (${t.why || b.why})`); return; }
  const r1 = await rails(page);
  const mid = (b.band.x0 + b.band.x1) / 2, half = (b.band.x1 - b.band.x0) * 0.1;
  let found = null;
  for (let i = 0; i < 40 && !found; i++) {
    const x = c.l + mid + half * (((i * 0.618) % 1) * 2 - 1);
    await page.mouse.move(x, c.t + r1.bottomY - 6); await sleep(120);
    const tip = await tipText(page);
    if (tip && /Corpus connection/i.test(tip.eyebrow) && Number.isFinite(tip.verse) && Number.isFinite(tip.vot)) found = tip;
  }
  await page.mouse.move(c.l + 8, c.t + 8); await sleep(200);
  if (!found) { fails.push(`${tag} C: no corpus thread within 14 px of the bottom rail near the centre of Isaiah`); return; }
  const book = found.ref.replace(/\s+\d+:\d+.*$/, '');
  note(`${tag} C: following "${found.ref}" ↕ "${found.alt}" (${found.meta}); verse ${found.verse}, vot ${found.vot}`);
  await clickLabel(page, 'Reset the view'); await sleep(600);
  const W = c.w * f.dpr;
  const read = async () => {
    const r = await rails(page);
    const topY = r.topY * f.dpr, bottomY = r.bottomY * f.dpr;
    const a = /** @type {[number, number]} */ ([law.verseToX(r.cam, W, found.verse), bottomY]);
    const bb = /** @type {[number, number]} */ ([law.verseToX(r.camV, W, found.vot), topY]);
    const pts = law.threadPath(a, bb, true, { width: W, gap: bottomY - topY, n: 12 });
    return { ax: +(a[0] / f.dpr).toFixed(1), bx: +(bb[0] / f.dpr).toFixed(1), drawn: !!pts, cls: pts ? (pts.rise >= 0 ? 'rise+run' : 'rise') : 'none', r };
  };
  const strip = async (which, label) => {
    let prev = await read();
    let maxDisp = 0, nulls = 0, classChanges = 0, at = -1;
    const rows = [{ notch: 0, ...prev }];
    for (let i = 1; i <= NOTCHES; i++) {
      const r = prev.r;
      const bands = which === 'top' ? r.top : r.bottom;
      const band = bands.find((x) => x.label.toLowerCase() === label.toLowerCase()) || bands.find((x) => x.label.toLowerCase().startsWith(label.toLowerCase()));
      if (!band) { fails.push(`${tag} C ${which}: band ${label} left the screen at notch ${i}`); break; }
      const cx = c.l + Math.max(4, Math.min(c.w - 4, (band.x0 + band.x1) / 2));
      await page.mouse.move(cx, which === 'top' ? c.t + r0.topY + 12 : c.t + r0.bottomY - 12);
      await page.mouse.wheel({ deltaY: -120 }); await sleep(30);
      // captured LIVE: inside the hold after the notch, the capped frame a moving finger sees
      const cf = await attr(page, 'data-cap-fraction');
      if (OUT) await page.screenshot({ path: resolve(OUT, `${fname}-C-${which}-${String(i).padStart(2, '0')}.png`) });
      if (i === 1) note(`${tag} C ${which}: notch captures are taken at data-cap-fraction ${cf} (0 = live cap)`);
      await page.mouse.move(c.l + 8, c.t + 8); await sleep(250);
      const cur = await read();
      const disp = Math.max(Math.abs(cur.ax - prev.ax), Math.abs(cur.bx - prev.bx));
      if (disp > maxDisp) { maxDisp = disp; at = i; }
      if (!cur.drawn) nulls++;
      if (cur.cls !== prev.cls) classChanges++;
      rows.push({ notch: i, ...cur, disp: +disp.toFixed(1) });
      prev = cur;
    }
    const p = await ppv(page);
    note(`${tag} C ${which} rail, ${NOTCHES} notches at ${label}: largest per-notch endpoint displacement ${maxDisp.toFixed(1)} CSS px (notch ${at}); drawn at every notch: ${nulls === 0 ? 'yes' : 'NO (' + nulls + ' null)'}; stroke class changes: ${classChanges}; endpoints notch 0 -> ${NOTCHES}: bottom x ${rows[0].ax} -> ${prev.ax}, top x ${rows[0].bx} -> ${prev.bx}; cameras now Bible ${(p.b / rows[0].r.cam.ppv * f.dpr).toFixed(1)}x Volumes ${(p.v / rows[0].r.camV.ppv * f.dpr).toFixed(1)}x`);
    if (nulls) fails.push(`${tag} C ${which}: the thread vanished at ${nulls} notches`);
    if (classChanges) fails.push(`${tag} C ${which}: the thread changed stroke class ${classChanges} times between adjacent notches`);
    if (OUT) writeFileSync(resolve(OUT, `${fname}-C-${which}.json`), JSON.stringify(rows.map(({ r, ...rest }) => rest), null, 1));
    return maxDisp;
  };
  await strip('top', found.meta);
  await strip('bottom', book);
  await clickIfPresent(page, 'Reset the view'); await sleep(400);
}

/** Arm R: the release fade, measured in the Matthew corridor. */
async function armR(page, tag, fname, c, r0, attempt) {
  // the corridor: the band between the rails over the Matthew stretch of the
  // bottom rail (the Study Bible notes), the densest ink on the overview
  const band = r0.bottom.find((b) => b.label === 'Matthew');
  if (!band) { fails.push(`${tag} R: no Matthew band published`); return; }
  const x0 = Math.max(0, band.x0 - 40), x1 = Math.min(c.w, band.x1 + 40);
  await clickIfPresent(page, 'Reset the view'); await sleep(500);
  await page.mouse.move(c.l + 8, c.t + 8); await sleep(300);
  // THE INSTRUMENT is data-cap-fraction read every animation frame: the
  // fraction the screen drew that frame (0 live, 1 full, between = fading).
  // The picture is a pure function of it (layerCap eases brightness in f), so
  // the trace IS the picture's schedule. NO pixel read-back anywhere in this
  // arm: two getImageData reads on the 3840x2160 ui canvas, even before the
  // notch, demote it to software rasterisation (measured: one frame per
  // ~500 ms on desktop, ~85 ms on the phone frame) and the fade cannot draw.
  const SAMPLER = `(ms) => new Promise((done) => {
    const root = document.querySelector('.sw-root');
    const out = []; const t0 = performance.now(); const longs = [];
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ t: +(e.startTime - t0).toFixed(0), ms: +e.duration.toFixed(0) }); });
    po.observe({ entryTypes: ['longtask'] });
    const tick = () => {
      out.push({ t: +(performance.now() - t0).toFixed(0), cf: Number(root.getAttribute('data-cap-fraction')) });
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { po.disconnect(); done({ out, longs }); }
    };
    requestAnimationFrame(tick);
  })`;
  const sample = (ms) => page.evaluate((src, ms) => (new Function('return ' + src)())(ms), SAMPLER, ms);
  await page.mouse.move(c.l + (band.x0 + band.x1) / 2, c.t + r0.bottomY - 12); await sleep(150);
  // the sampler starts BEFORE the notch: a slow puppeteer round trip after the
  // wheel (132 ms seen on a loaded machine) would otherwise skip the 150 ms hold
  const pending = sample(1000);
  await sleep(80);
  await page.mouse.wheel({ deltaY: -120 });
  const { out: all, longs } = await pending;
  await page.mouse.move(c.l + 8, c.t + 8);
  const firstLiveIdx = all.findIndex((x) => x.cf === 0);
  const shots = firstLiveIdx >= 0 ? all.slice(firstLiveIdx) : all;
  // after the last live frame the fraction must pass through at least three
  // fading frames spanning >= 100 ms, never fall, and reach 1
  const live = shots.filter((x) => x.cf === 0);
  const lastLiveIdx = live.length ? shots.indexOf(live[live.length - 1]) : 0;
  const after = shots.slice(lastLiveIdx);
  const fading = after.filter((x) => x.cf > 0 && x.cf < 1), full = after.filter((x) => x.cf === 1);
  const first = shots[0], lastLive = live.length ? live[live.length - 1] : null, firstFull = full.length ? full[0] : null;
  let falls = 0;
  for (let i = 1; i < after.length; i++) if (after[i].cf < after[i - 1].cf) falls++;
  const fadeSpan = fading.length ? fading[fading.length - 1].t - fading[0].t : 0;
  const gaps = after.slice(1).map((x, i) => x.t - after[i].t);
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const cadence = after.length > 1 ? Math.round((after[after.length - 1].t - after[0].t) / (after.length - 1)) : 0;
  const soft = longs.filter((l) => l.ms >= SOFT_MS);
  note(`${tag} R (launch ${attempt}): cap-fraction trace after the notch: ${shots.length} frames over ${shots[shots.length - 1].t - shots[0].t} ms (cadence ${cadence} ms, largest gap ${maxGap} ms): live ${live.length} frames (${lastLive ? 'to t+' + lastLive.t : 'none'}), fading ${fading.length} frames over ${fadeSpan} ms, falls ${falls}, full from t+${firstFull ? firstFull.t : '-'}; main-thread long tasks in the window: ${longs.length ? longs.map((l) => `${l.ms} ms at t+${l.t}`).join(', ') : 'none'}`);
  if (OUT) writeFileSync(resolve(OUT, `${fname}-R-launch${attempt}.json`), JSON.stringify({ shots: all, longs }, null, 1));
  // headless Chrome lands the 2D canvas in software raster on some launches
  // (measured: 4 of 11 desktop launches drew every release frame as a
  // 330-500 ms main-thread long task, the others at 5 ms cadence, same tree,
  // same renderer string): that launch is not a number. Recreate the page and
  // try again, up to three launches, every one printed.
  // a trace with a >= 200 ms hole and no long task is a starved page (one
  // launch gave a single tick in 1.76 s): the same verdict, not a number
  const starved = !soft.length && (all.length < 3 || Math.max(...all.slice(1).map((x, i) => x.t - all[i].t)) >= 200);
  if (starved) soft.push({ t: 0, ms: 0 });
  if (soft.length) {
    if (attempt < 3) { note(`${tag} R: launch ${attempt} ${starved ? `starved the page (${all.length} ticks, largest hole ${Math.max(...all.slice(1).map((x, i) => x.t - all[i].t))} ms, no long task)` : `drew the release as long tasks (${soft.map((l) => l.ms + ' ms').join(', ')}): software-raster canvas`}, not a number; relaunching the browser`); return 'software'; }
    fails.push(`${tag} R: three browser launches drew the release as main-thread long tasks (last: ${soft.map((l) => l.ms + ' ms').join(', ')}): no accelerated canvas to judge the fade on; not a number`);
    return 'software';
  }
  note(`${tag} R: launch ${attempt} classified accelerated (no long task >= ${SOFT_MS} ms in the release window)${attempt > 1 ? ' after ' + (attempt - 1) + ' software launch(es)' : ' first try'}`);
  // the jump: the tick gap into the first full frame. Too few fading frames is
  // a POP only when the sampler saw the jump between two close ticks; a long
  // gap there is UNRESOLVED (the instrument did not see it; neither passes)
  const jumpGap = firstFull ? firstFull.t - (after[after.indexOf(firstFull) - 1] || firstFull).t : Infinity;
  if (!live.length) fails.push(`${tag} R: no live frame after the notch (first cap ${first.cf} at t+${first.t} ms): the hold was not seen`);
  if (!firstFull) fails.push(`${tag} R: the cap did not come back to full within the sample window`);
  if (fading.length < 3) fails.push(jumpGap <= 50
    ? `${tag} R: POP: the cap fraction jumped to full ${jumpGap} ms after the previous tick through ${fading.length} fading frames (frame cadence ${cadence} ms): there was no fade`
    : `${tag} R: UNRESOLVED: ${fading.length} fading frames and a ${jumpGap} ms tick gap into full (cadence ${cadence} ms): the sampler could not have seen a 250 ms fade; not a pass`);
  else if (!(fadeSpan >= 100)) fails.push(`${tag} R: the fade spanned ${fadeSpan} ms of frames, under 100: not a visible span`);
  if (falls) fails.push(`${tag} R: the cap fraction fell ${falls} times during the release: not monotone`);
  await clickIfPresent(page, 'Reset the view'); await sleep(300);
  return 'ok';
}

async function walk(page, url, fname, attempt) {
  const f = FRAMES[fname];
  const tag = `[${fname} ${f.w}x${f.h}]`;
  await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
  await boot(page, url);
  if (!(await toMyWeb(page))) { nothingToCheck = `${tag} the web could not be drawn (.sw-fallback)`; return; }
  const c = await canvasRect(page);
  const r0 = await rails(page);
  note(`${tag} rails ${r0 ? `topY ${r0.topY} bottomY ${r0.bottomY}, ${r0.top.length} collections, ${r0.bottom.length} books` : 'NOT PUBLISHED (data-rails absent)'}`);
  // R first, on the fresh page (see the arm's note)
  if (ARMS.includes('R')) { if (r0) { if (await armR(page, tag, fname, c, r0, attempt) === 'software' && attempt < 3) return 'relaunch'; } else fails.push(`${tag} R: no data-rails`); }
  if (ARMS.includes('O')) { await page.mouse.move(c.l + 8, c.t + 8); await sleep(250); await shot(page, `${fname}-O-overview`); }
  if (ARMS.includes('S')) await armS(page, tag, fname, c, r0);
  if (ARMS.includes('C')) { if (r0) await armC(page, tag, fname, c, r0, f); else fails.push(`${tag} C: no data-rails`); }
  if (!ARMS.includes('T')) return;
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
  const launch = async () => {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', ...CHROME_ARGS], protocolTimeout: 240000 });
    const page = await (await browser.createBrowserContext()).newPage();
    await page.goto('about:blank');
    return page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : null; });
  };
  note(`tree ${TREE} @ ${sha(TREE)}${TREE !== OWN ? ` (instrument from ${sha(OWN)})` : ''}; renderer ${await launch()}${CHROME_ARGS.length ? '; CHROME ARGS ' + CHROME_ARGS.join(' ') + ' (diagnosis, not the frame the reader gets)' : ''}`);
  for (const fname of FRAME_LIST) {
    if (!FRAMES[fname]) { fails.push(`unknown frame ${fname}`); continue; }
    // a fresh context per frame: the first walk's onboarding answers live in its
    // storage. A software-raster launch (arm R) gets a whole new browser: a new
    // page in the same browser inherits the state (measured 3 of 3).
    for (let attempt = 1; attempt <= 3; attempt++) {
      const page = await (await browser.createBrowserContext()).newPage();
      let r;
      try { r = await walk(page, own.url, fname, attempt); } catch (e) {
        // a software-raster launch can also fail to BOOT the desktop frame inside
        // the 60 s wait (measured twice); it counts as one of the three launches
        if (!(e && e.name === 'TimeoutError') || !ARMS.includes('R')) throw e;
        note(`[${fname}] launch ${attempt}: boot exceeded ${NAV_MS / 1000} s (${String(e.message).split(String.fromCharCode(10))[0]}); not a number; relaunching the browser`);
        r = attempt < 3 ? 'relaunch' : 'boot-timeout';
        if (r === 'boot-timeout') fails.push(`[${fname}] three browser launches could not boot the frame or drew the release in software: not a number`);
      }
      if (r !== 'relaunch') break;
      await browser.close(); browser = null;
      await launch();
    }
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
