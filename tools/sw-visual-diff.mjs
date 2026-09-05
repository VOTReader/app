/**
 * sw-visual-diff — does collapsing a fly-over faded to nothing change a single pixel? (scripture-web-3:
 * the design pass at depth, measured instead of eyeballed.)
 *
 *   node tools/sw-visual-diff.mjs --after <web-renderer.js from the branch> [--backend hw|sw] [--out dir]
 *                                 [--eps 0.02,0.1] [--zooms 1,16,23,400]
 *
 * Serves its own tree (main's renderer is the BEFORE), boots the app once for a same-origin page, then
 * imports the renderer module four times with a query string the server ignores and request
 * interception rewrites:
 *   before  main's web-renderer.js as served
 *   before2 the same again, drawn again: the GPU's run-to-run noise floor
 *   after   the branch file, verbatim (exactly one `if (dim <= 0.)`)
 *   eps<e>  the branch file with the guard widened to `dim <= e` for each --eps value (what an epsilon would do)
 *   one     the branch file with the guard at `dim <= 1.` (the Verifier's bite: ink must vanish)
 * Each variant asserts its own guard text in SHADER_SOURCE.vertex before it draws, so a variant that
 * did not take cannot pass as one that did.
 *
 * Same view maths as sw-fill-measure.mjs (phone 375@3 and desktop 1920@1, centre verse 15000, famous
 * density, distance colours, dark). Each view is drawn once per variant on a detached canvas and read
 * back with gl.readPixels in the same task; pixels are compared to the BEFORE frame: count differing
 * (any channel), max channel delta, and each frame's ink (non-background pixels). PNGs of every frame
 * land in --out for a person to look at.
 *
 * Expected: after == before to the pixel at every zoom (a zero-alpha ribbon blends nothing), inside the
 * floor before2 (main drawn twice) sets for the GPU's own run-to-run noise; eps and one differ, or the
 * instrument cannot see a wrongly culled ribbon and the pass measured nothing.
 */
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const AFTER_PATH = arg('--after', null);
const BACKEND = arg('--backend', 'hw');
const OUT = arg('--out', null);
if (!AFTER_PATH) { console.error('--after <branch web-renderer.js> is required'); process.exit(2); }
const AFTER = readFileSync(resolve(AFTER_PATH), 'utf8');
const GUARD = 'if (dim <= 0.)';
if (AFTER.split(GUARD).length !== 2) { console.error(`the --after file does not carry exactly one "${GUARD}"`); process.exit(2); }
// --eps 0.02,0.1 adds one widened-guard variant per value: the sweep that finds the smallest epsilon
// the pixel instrument can see, which is the margin the literal zero has.
const EPS = arg('--eps', '0.02').split(',').map((e) => e.trim()).filter(Boolean);
// before2 is main's renderer imported a second time and drawn again: the run-to-run noise floor of
// the GPU itself (a 1-LSB blend difference on a handful of pixels is what the Radeon 890M shows).
// `after` passes when it stays inside that floor, never when it merely reads "small".
const VARIANTS = { before: null, before2: null, after: AFTER };
const EXPECT = { before: null, before2: null, after: 'if (dim <= 0.)' };
for (const e of EPS) { VARIANTS[`eps${e}`] = AFTER.replace(GUARD, `if (dim <= ${e})`); EXPECT[`eps${e}`] = `if (dim <= ${e})`; }
VARIANTS.one = AFTER.replace(GUARD, 'if (dim <= 1.)'); EXPECT.one = 'if (dim <= 1.)';
const BACKENDS = {
  hw: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  sw: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const DEVICES = [
  { name: 'phone375', W: 1125, H: 2001, DPR: 3 },
  { name: 'desktop1920', W: 1920, H: 1080, DPR: 1 },
];
// The partial-fade band (localize 0.55..1) is zoom 12.8..24 (LOCALIZE_START/END in geometry.js); a
// sweep that skips it cannot see a widened guard at all, so the default zoom list crosses it.
const ZOOMS = arg('--zooms', '1,12,16,20,22,23,23.5,24,40,400,4000').split(',').map(Number);
const CENTRE = 15000;
const RENDERER_URL = '/src/ui/scripture-web/web-renderer.js';
if (OUT) mkdirSync(resolve(OUT), { recursive: true });

const { server, url: BASE } = await serveOwnTree();
const results = [];
try {
  const browser = await puppeteer.launch({ headless: true, args: BACKENDS[BACKEND] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) return r.respond({ status: 404, body: '' });
      if (u.pathname === RENDERER_URL && u.searchParams.has('v') && VARIANTS[u.searchParams.get('v')]) {
        return r.respond({ status: 200, contentType: 'application/javascript', body: VARIANTS[u.searchParams.get('v')] });
      }
      r.continue();
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
    const renderer = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl2'; });
    console.log(`[${BACKEND}] ${renderer}`);
    // One evaluate per view: a single call over every view and variant runs past puppeteer's
    // protocol timeout (the PNG encodes alone are seconds each at 1125x2001).
    await page.evaluate(async ({ RENDERER_URL, EXPECT }) => {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'src/data/scripture-web-data.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const { decodeGraph } = await import('/src/utils/scripture-web/decode.js');
      const geo = await import('/src/utils/scripture-web/geometry.js');
      const graph = decodeGraph(window.SCRIPTURE_WEB_DATA);
      const mods = {};
      for (const v of Object.keys(EXPECT)) {
        const m = await import(`${RENDERER_URL}?v=${v}`);
        const src = m.SHADER_SOURCE.vertex;
        const guards = [...src.matchAll(/if \(dim <= ([^)]*)\)/g)].map((x) => x[1]);
        const ok = v.startsWith('before') ? guards.length === 0 : (guards.length === 1 && src.includes(EXPECT[v]));
        if (!ok) throw new Error(`variant ${v} did not take: guards=${JSON.stringify(guards)}`);
        mods[v] = m;
      }
      window.__swvd = { geo, graph, mods };
    }, { RENDERER_URL, EXPECT });
    const rows = [];
    for (const dev of DEVICES) {
      for (const zoom of ZOOMS) {
        const viewRows = await page.evaluate(async ({ dev, zoom, CENTRE, wantPng }) => {
          const { geo, graph, mods } = window.__swvd;
          const cam = geo.createCamera(graph.total);
          cam.ppv = geo.fitPPV(cam, dev.W) * zoom; cam.x = CENTRE; geo.clampCamera(cam, dev.W, 4000);
          const narrow = (dev.W / dev.DPR) <= 560;
          const ruler = (narrow ? 74 + 104 : 74 + 26) * dev.DPR;
          const avail = dev.H - ruler;
          const domeH = Math.min(avail, (dev.W / 2) * geo.MAX_STRETCH);
          const base = Math.min(avail, domeH + Math.max(0, avail - domeH) * 0.72);
          const ceil = domeH * 0.985;
          const z = cam.ppv / geo.fitPPV(cam, dev.W);
          const v = {
            width: dev.W, height: dev.H, base, ceil, squash: geo.squashFactor(ceil, dev.W), localize: geo.localizeFactor(z),
            density: 'famous', camX: cam.x, ppv: cam.ppv,
            strokeWidth: Math.min(0.9 + Math.log2(z) * 0.16, 2.4) * dev.DPR,
            alpha: Math.min(0.075 + Math.log2(z) * 0.028, 0.19),
            colorMode: 'distance', light: false, bg: [0, 0, 0], focusRange: null, focusArc: -1, hoverArc: -1,
          };
          const toPng = (px, W, H) => {
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H);
            for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
            for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
            ctx.putImageData(img, 0, 0);
            return c.toDataURL('image/png').split(',')[1];
          };
          const frames = {};
          const rows = {};
          for (const name of Object.keys(mods)) {
            const canvas = document.createElement('canvas'); canvas.width = dev.W; canvas.height = dev.H;
            const r = mods[name].createRenderer(canvas, graph);
            if (!r) throw new Error('no renderer');
            const gl = canvas.getContext('webgl2');
            r.draw(v);
            const stats = r.draw(v);
            const px = new Uint8Array(dev.W * dev.H * 4);
            gl.readPixels(0, 0, dev.W, dev.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
            r.dispose();
            let ink = 0;
            for (let i = 0; i < px.length; i += 4) if (px[i] | px[i + 1] | px[i + 2]) ink++;
            frames[name] = px;
            rows[name] = { ink, instances: stats.instances, draws: stats.draws, png: wantPng ? toPng(px, dev.W, dev.H) : null };
          }
          const ref = frames.before;
          const out = [];
          for (const name of Object.keys(frames)) {
            const px = frames[name];
            let diff = 0, maxd = 0;
            for (let i = 0; i < px.length; i += 4) {
              const d = Math.max(Math.abs(px[i] - ref[i]), Math.abs(px[i + 1] - ref[i + 1]), Math.abs(px[i + 2] - ref[i + 2]));
              if (d) { diff++; if (d > maxd) maxd = d; }
            }
            out.push({ device: dev.name, zoom: +z.toFixed(1), localize: +v.localize.toFixed(3), variant: name, ...rows[name], diffPx: diff, maxDelta: maxd, totalPx: dev.W * dev.H });
          }
          return out;
        }, { dev, zoom, CENTRE, wantPng: !!OUT });
        rows.push(...viewRows);
      }
    }
    for (const row of rows) {
      if (row.png && OUT) writeFileSync(resolve(OUT, `${row.device}-z${String(row.zoom).replace('.', 'p')}-${row.variant}.png`), Buffer.from(row.png, 'base64'));
      delete row.png;
      results.push({ backend: BACKEND, renderer, ...row });
      console.log(`  ${row.device.padEnd(12)} zoom ${String(row.zoom).padStart(6)}x (localize ${row.localize.toFixed(2)})  ${row.variant.padEnd(8)} ink ${String(row.ink).padStart(8)}  diff vs before ${String(row.diffPx).padStart(8)} px (max delta ${String(row.maxDelta).padStart(3)})  instances ${row.instances}`);
    }
  } finally { await browser.close(); }
} finally { server.close(); }
if (OUT) writeFileSync(resolve(OUT, `visual-diff-${BACKEND}.json`), JSON.stringify(results, null, 2) + '\n');
const floorFor = (r) => results.find((c) => c.variant === 'before2' && c.backend === r.backend && c.device === r.device && c.zoom === r.zoom);
const bad = results.filter((r) => r.variant === 'after' && (r.maxDelta > Math.max(1, floorFor(r).maxDelta) || r.diffPx > Math.max(16, 2 * floorFor(r).diffPx)));
const blind = results.filter((r) => r.variant === 'one' && r.zoom >= 40 && r.diffPx === 0);
console.log(bad.length ? `\nFAIL: after differs from before in ${bad.length} view(s)` : blind.length ? `\nFAIL: the threshold-1.0 control changed nothing in ${blind.length} deep view(s): instrument blind` : '\nPASS: after is inside the before-vs-before noise floor at every view, and the controls fired');
process.exit(bad.length || blind.length ? 1 : 0);
