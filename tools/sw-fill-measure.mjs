/**
 * sw-fill-measure — what does one Scripture Web frame cost the GPU, at the zooms where the
 * fly-over cull is supposed to make invisible ribbons free? (scripture-web-3: the before and
 * the after of collapsing culled ribbons instead of zeroing their alpha.)
 *
 *   node tools/sw-fill-measure.mjs                 # hardware ANGLE and SwiftShader, both devices
 *   node tools/sw-fill-measure.mjs --backend sw    # CPU rasteriser only (fill-bound, magnifies waste)
 *   node tools/sw-fill-measure.mjs --out fill.json
 *
 * Serves its own tree, boots the app once for a same-origin page, then drives the REAL renderer
 * (`createRenderer`) and the REAL asset (`src/data/scripture-web-data.js`, famous density) on a
 * detached canvas with the view the screen would compute: phone 375 CSS px at DPR 3 (1125x2001)
 * and desktop 1920x1080 at DPR 1, centre verse 15000, zoom 1 / 40 / 400 / 4000 (MAX_ZOOM). Each
 * frame is timed with `EXT_disjoint_timer_query_webgl2` (GPU elapsed; `gl.finish()` does not block in
 * Chrome's command buffer, so wall time around a draw measures nothing and is not reported). Medians
 * of 10 frames after 2 warm-ups. The renderer's own stats give the instances and draw calls actually
 * submitted after chunk culling. A backend without the timer extension reports n/a.
 *
 * The numbers are for one machine's GPU and for SwiftShader; they are a before/after instrument,
 * not a Pixel frame time. The modelled 144 Mpx figure in the finding is area; this is time.
 */
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const BACKEND = arg('--backend', 'both');
const OUT = arg('--out', null);
const BACKENDS = {
  hw: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  sw: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const DEVICES = [
  { name: 'phone 375@3', W: 1125, H: 2001, DPR: 3 },
  { name: 'desktop 1920@1', W: 1920, H: 1080, DPR: 1 },
];
const ZOOMS = [1, 40, 400, 4000];
const CENTRE = 15000;

const { server, url: BASE } = await serveOwnTree();
const results = [];
try {
  for (const be of (BACKEND === 'both' ? ['hw', 'sw'] : [BACKEND])) {
    const browser = await puppeteer.launch({ headless: true, args: BACKENDS[be] });
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (r) => { if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) r.respond({ status: 404, body: '' }); else r.continue(); });
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
      const renderer = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl2'; });
      console.log(`\n[${be}] ${renderer}`);
      const rows = await page.evaluate(async ({ DEVICES, ZOOMS, CENTRE }) => {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'src/data/scripture-web-data.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
        const { decodeGraph } = await import('/src/utils/scripture-web/decode.js');
        const geo = await import('/src/utils/scripture-web/geometry.js');
        const { createRenderer } = await import('/src/ui/scripture-web/web-renderer.js');
        const graph = decodeGraph(window.SCRIPTURE_WEB_DATA);
        const out = [];
        const sleepFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
        const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
        for (const dev of DEVICES) {
          const canvas = document.createElement('canvas'); canvas.width = dev.W; canvas.height = dev.H;
          const r = createRenderer(canvas, graph);
          if (!r) { out.push({ device: dev.name, error: 'no renderer' }); continue; }
          const gl = canvas.getContext('webgl2');
          const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
          for (const zoom of ZOOMS) {
            // The screen's own view maths (ScriptureWebScreen.jsx frame()/viewFor()/draw()).
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
            const gpu = [];
            let stats = null;
            for (let i = 0; i < 12; i++) {
              const q = ext ? gl.createQuery() : null;
              if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
              stats = r.draw(v);
              if (q) {
                gl.endQuery(ext.TIME_ELAPSED_EXT);
                // SwiftShader frames can take a second each; wait for the result, not a frame count.
                for (let k = 0; k < 600 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await sleepFrame();
                const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
                if (!disjoint && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
                gl.deleteQuery(q);
              }
              await sleepFrame();
            }
            out.push({ device: dev.name, zoom: Math.round(z), instances: stats.instances, draws: stats.draws, strokePx: +v.strokeWidth.toFixed(1), gpuMs: gpu.length ? +median(gpu.slice(-10)).toFixed(2) : null, frames: gpu.length });
          }
          r.dispose();
        }
        return out;
      }, { DEVICES, ZOOMS, CENTRE });
      for (const row of rows) { results.push({ backend: be, renderer, ...row }); console.log(`  ${row.device.padEnd(16)} zoom ${String(row.zoom).padStart(4)}x  instances ${String(row.instances).padStart(6)}  draws ${String(row.draws).padStart(3)}  stroke ${row.strokePx} px  gpu ${row.gpuMs == null ? '   n/a' : row.gpuMs.toFixed(2).padStart(7)} ms (${row.frames} timed)`); }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
if (OUT) { writeFileSync(resolve(OUT), JSON.stringify(results, null, 2) + '\n'); console.log(`wrote ${OUT}`); }
console.log('\nsw-fill-measure done');
