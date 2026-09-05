/**
 * sw-visual-diff — does a Scripture Web renderer/geometry change draw the same pixels as main where it
 * promises to? The repo's GPU-pixel gate, two modes:
 *
 *   TREE MODE (the general one; scripture-web-depth D2 and every renderer branch after it)
 *     node tools/sw-visual-diff.mjs --after-tree <git ref> [--zooms 1,2,4,6] [--themes dark,light]
 *                                   [--backend hw|sw] [--out dir]
 *   Reads web-renderer.js, geometry.js and palette.js from `git show <ref>:<path>` and draws them
 *   beside main's served files. Each variant is drawn with ITS OWN tree's laws (localize, squash,
 *   and the style law if that tree exports `ribbonStyle(zoom, localize, light, anchored)` from
 *   geometry.js; otherwise the v1 inline law). Variants:
 *     before   main's files as served
 *     before2  the same again, drawn again: the GPU's run-to-run noise floor
 *     after    the tree's files, verbatim
 *     poison   the tree's renderer with the fragment alpha doubled: the instrument MUST see this one,
 *              at every listed view, or it measured nothing
 *   PASS = after inside the before-vs-before floor at every listed view AND poison differs at every
 *   listed view. The default zooms 1,2,4,6 are the band where localizeFactor is 0, i.e. the overview
 *   dome a depth fix promises not to touch; list deeper zooms only when the branch promises identity there.
 *
 *   LEGACY MODE (scripture-web-3: the fly-over cull guard)
 *     node tools/sw-visual-diff.mjs --after <web-renderer.js from the branch> [--eps 0.02,0.1] ...
 *   Variants before/before2/after/eps<e>/one as documented in scripture-web-3-design-pass.md: the
 *   --after file must carry exactly one `if (dim <= 0.)`; eps widens it; `one` erases every ribbon.
 *
 * CONTRACT. This PROVES, on this machine's GPU through the Chrome puppeteer bundles (ANGLE D3D11 on the
 * Radeon 890M; `--backend sw` for SwiftShader Vulkan), pixel identity within the noise floor main-
 * drawn-twice sets, and that the instrument can see a change (the poison / threshold-1.0 control). It
 * CANNOT prove a mobile GPU: no Mali or Adreno compiler runs here. Exit 0 = PASS; 1 = a view failed
 * (printed); 2 = bad arguments or a control anchor missing from the tree under test.
 *
 * Views: phone 375@3 (1125x2001) and desktop 1920@1, centre verse 15000, Famous density, Distance
 * colours; the frame maths mirror ScriptureWebScreen's frame(). Each view is drawn once per variant on
 * a detached canvas and read back with gl.readPixels in the same task (no compositor, nothing stale);
 * pixels are compared to the BEFORE frame: count differing (any channel), max channel delta, each
 * frame's ink. `bg` is passed as the CSS string the renderer's cssColorToRGB expects (an array falls
 * through to black and a light frame then reads 18.82:1 everywhere: a uniform extreme is a fault
 * signature, not a finding). PNGs of every frame land in --out for a person to look at.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SRC = 'app/src/main/assets/src';
const URLS = {
  renderer: '/src/ui/scripture-web/web-renderer.js',
  geometry: '/src/utils/scripture-web/geometry.js',
  palette: '/src/utils/scripture-web/palette.js',
};

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const AFTER_PATH = arg('--after', null);
const AFTER_TREE = arg('--after-tree', null);
const BACKEND = arg('--backend', 'hw');
const OUT = arg('--out', null);
if (!AFTER_PATH && !AFTER_TREE) { console.error('give --after <branch web-renderer.js> (legacy) or --after-tree <git ref> (tree mode)'); process.exit(2); }
const TREE_MODE = !!AFTER_TREE;
const THEMES_ALL = {
  dark: { light: false, bg: '#000000' },
  light: { light: true, bg: '#f7f2e8' },
};
const THEMES = (TREE_MODE ? arg('--themes', 'dark,light') : arg('--themes', 'dark')).split(',').map((t) => t.trim()).filter((t) => THEMES_ALL[t]);
const BACKENDS = {
  hw: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  sw: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const DEVICES = [
  { name: 'phone375', W: 1125, H: 2001, DPR: 3 },
  { name: 'desktop1920', W: 1920, H: 1080, DPR: 1 },
];
// Legacy: the partial-fade band (localize 0.55..1) is zoom 12.8..24; the default list crosses it.
// Tree: the overview band where localizeFactor is 0 and identity is the promise.
const ZOOMS = arg('--zooms', TREE_MODE ? '1,2,4,6' : '1,12,16,20,22,23,23.5,24,40,400,4000').split(',').map(Number);
const CENTRE = 15000;
if (OUT) mkdirSync(resolve(OUT), { recursive: true });

// ── variants: { name: { renderer, geometry, palette } | null (= served) } ────────────────────────
// A variant's renderer imports geometry/palette through a `?v=<name>` query so the module cache keeps
// each tree's laws apart; request interception serves the right text for each.
const VARIANTS = { before: null, before2: null };
const EXPECT_GUARD = {};       // legacy: guard text each variant must carry
const POISON_ANCHOR = 'o = vec4(vCol.rgb*a, a);';
const rewire = (name, files) => ({
  ...files,
  renderer: files.renderer
    .replace(`'../../utils/scripture-web/geometry.js'`, `'../../utils/scripture-web/geometry.js?v=${name}'`)
    .replace(`'../../utils/scripture-web/palette.js'`, `'../../utils/scripture-web/palette.js?v=${name}'`),
});
if (TREE_MODE) {
  const show = (p) => execFileSync('git', ['show', `${AFTER_TREE}:${SRC}/${p}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });
  let files;
  try {
    files = { renderer: show('ui/scripture-web/web-renderer.js'), geometry: show('utils/scripture-web/geometry.js'), palette: show('utils/scripture-web/palette.js') };
  } catch (e) { console.error(`cannot read the tree ${AFTER_TREE}: ${e.message.split('\n')[0]}`); process.exit(2); }
  if (files.renderer.split(POISON_ANCHOR).length !== 2) { console.error(`the tree's web-renderer.js does not carry exactly one "${POISON_ANCHOR}": the poison control has no anchor, refusing to run blind`); process.exit(2); }
  VARIANTS.after = rewire('after', files);
  VARIANTS.poison = rewire('poison', { ...files, renderer: files.renderer.replace(POISON_ANCHOR, 'o = vec4(vCol.rgb*min(1., a*2.), min(1., a*2.));') });
  console.log(`tree mode: after = ${AFTER_TREE} (${execFileSync('git', ['rev-parse', '--short', AFTER_TREE], { cwd: REPO, encoding: 'utf8' }).trim()}), renderer ${files.renderer.length} B, geometry ${files.geometry.length} B, palette ${files.palette.length} B`);
} else {
  const AFTER = readFileSync(resolve(AFTER_PATH), 'utf8');
  const GUARD = 'if (dim <= 0.)';
  if (AFTER.split(GUARD).length !== 2) { console.error(`the --after file does not carry exactly one "${GUARD}"`); process.exit(2); }
  const EPS = arg('--eps', '0.02').split(',').map((e) => e.trim()).filter(Boolean);
  VARIANTS.after = { renderer: AFTER }; EXPECT_GUARD.after = GUARD;
  for (const e of EPS) { VARIANTS[`eps${e}`] = { renderer: AFTER.replace(GUARD, `if (dim <= ${e})`) }; EXPECT_GUARD[`eps${e}`] = `if (dim <= ${e})`; }
  VARIANTS.one = { renderer: AFTER.replace(GUARD, 'if (dim <= 1.)') }; EXPECT_GUARD.one = 'if (dim <= 1.)';
}

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
      const v = u.searchParams.get('v');
      const files = v && VARIANTS[v];
      if (files) {
        const key = u.pathname === URLS.renderer ? 'renderer' : u.pathname === URLS.geometry ? 'geometry' : u.pathname === URLS.palette ? 'palette' : null;
        if (key && files[key]) return r.respond({ status: 200, contentType: 'application/javascript', body: files[key] });
      }
      r.continue();
    });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
    const renderer = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl2'; });
    console.log(`[${BACKEND}] ${renderer}`);
    const variantNames = Object.keys(VARIANTS);
    const hasOwnGeometry = Object.fromEntries(variantNames.map((n) => [n, !!(VARIANTS[n] && VARIANTS[n].geometry)]));
    await page.evaluate(async ({ URLS, variantNames, hasOwnGeometry, EXPECT_GUARD, POISONED }) => {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'src/data/scripture-web-data.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const { decodeGraph } = await import('/src/utils/scripture-web/decode.js');
      const graph = decodeGraph(window.SCRIPTURE_WEB_DATA);
      const mods = {};
      for (const v of variantNames) {
        const m = await import(`${URLS.renderer}?v=${v}`);
        const geo = await import(hasOwnGeometry[v] ? `${URLS.geometry}?v=${v}` : URLS.geometry);
        const src = m.SHADER_SOURCE.vertex;
        if (EXPECT_GUARD[v] !== undefined) {
          const guards = [...src.matchAll(/if \(dim <= ([^)]*)\)/g)].map((x) => x[1]);
          if (!(guards.length === 1 && src.includes(EXPECT_GUARD[v]))) throw new Error(`variant ${v} did not take: guards=${JSON.stringify(guards)}`);
        }
        if (v.startsWith('before') && /if \(dim <= /.test(src) && Object.keys(EXPECT_GUARD).length) throw new Error('before carries a guard: the served tree is not main');
        if (v === 'poison' && !m.SHADER_SOURCE.fragment.includes(POISONED)) throw new Error('poison did not take');
        if (v === 'after' && m.SHADER_SOURCE.fragment.includes(POISONED)) throw new Error('after carries the poison');
        mods[v] = { m, geo };
      }
      window.__swvd = { graph, mods };
    }, { URLS, variantNames, hasOwnGeometry, EXPECT_GUARD, POISONED: 'min(1., a*2.)' });
    const rows = [];
    for (const dev of DEVICES) {
      for (const zoom of ZOOMS) {
        for (const themeName of THEMES) {
          const theme = THEMES_ALL[themeName];
          const viewRows = await page.evaluate(async ({ dev, zoom, theme, themeName, CENTRE, wantPng }) => {
            const { graph, mods } = window.__swvd;
            const narrow = (dev.W / dev.DPR) <= 560;
            const ruler = (narrow ? 74 + 104 : 74 + 26) * dev.DPR;
            const avail = dev.H - ruler;
            const toPng = (px, W, H) => {
              const c = document.createElement('canvas'); c.width = W; c.height = H;
              const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H);
              for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
              for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
              ctx.putImageData(img, 0, 0);
              return c.toDataURL('image/png').split(',')[1];
            };
            const frames = {}, rows = {};
            let zSeen = 0, locSeen = 0;
            for (const name of Object.keys(mods)) {
              const { m, geo } = mods[name];
              // Each variant's view from ITS OWN geometry: camera, localize, squash, and style law.
              const cam = geo.createCamera(graph.total);
              cam.ppv = geo.fitPPV(cam, dev.W) * zoom; cam.x = CENTRE; geo.clampCamera(cam, dev.W, 4000);
              const domeH = Math.min(avail, (dev.W / 2) * geo.MAX_STRETCH);
              const base = Math.min(avail, domeH + Math.max(0, avail - domeH) * 0.72);
              const ceil = domeH * 0.985;
              const z = cam.ppv / geo.fitPPV(cam, dev.W);
              const localize = geo.localizeFactor(z);
              const style = typeof geo.ribbonStyle === 'function'
                ? geo.ribbonStyle(z, localize, theme.light, 0)
                : { alpha: Math.min(0.075 + Math.log2(z) * 0.028, theme.light ? 0.42 : 0.19), strokeWidthCss: Math.min(0.9 + Math.log2(z) * 0.16, 2.4) };
              const v = {
                width: dev.W, height: dev.H, base, ceil, squash: geo.squashFactor(ceil, dev.W), localize,
                density: 'famous', camX: cam.x, ppv: cam.ppv,
                strokeWidth: style.strokeWidthCss * dev.DPR, alpha: style.alpha,
                colorMode: 'distance', light: theme.light, bg: theme.bg, focusRange: null, focusArc: -1, hoverArc: -1,
              };
              zSeen = z; locSeen = localize;
              const canvas = document.createElement('canvas'); canvas.width = dev.W; canvas.height = dev.H;
              const r = m.createRenderer(canvas, graph);
              if (!r) throw new Error('no renderer');
              const gl = canvas.getContext('webgl2');
              r.draw(v);
              const stats = r.draw(v);
              const px = new Uint8Array(dev.W * dev.H * 4);
              gl.readPixels(0, 0, dev.W, dev.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
              r.dispose();
              const bg = px.length ? [px[0], px[1], px[2]] : [0, 0, 0];   // the cleared corner: the frame's own ground
              let ink = 0;
              for (let i = 0; i < px.length; i += 4) if (px[i] !== bg[0] || px[i + 1] !== bg[1] || px[i + 2] !== bg[2]) ink++;
              frames[name] = px;
              rows[name] = { ink, instances: stats.instances, draws: stats.draws, alpha: +v.alpha.toFixed(3), png: wantPng ? toPng(px, dev.W, dev.H) : null };
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
              out.push({ device: dev.name, theme: themeName, zoom: +zSeen.toFixed(1), localize: +locSeen.toFixed(3), variant: name, ...rows[name], diffPx: diff, maxDelta: maxd, totalPx: dev.W * dev.H });
            }
            return out;
          }, { dev, zoom, theme, themeName, CENTRE, wantPng: !!OUT });
          rows.push(...viewRows);
        }
      }
    }
    for (const row of rows) {
      if (row.png && OUT) writeFileSync(resolve(OUT, `${row.device}-${row.theme}-z${String(row.zoom).replace('.', 'p')}-${row.variant}.png`), Buffer.from(row.png, 'base64'));
      delete row.png;
      results.push({ backend: BACKEND, renderer, ...row });
      console.log(`  ${row.device.padEnd(12)} ${row.theme.padEnd(5)} zoom ${String(row.zoom).padStart(6)}x (localize ${row.localize.toFixed(2)})  ${row.variant.padEnd(8)} ink ${String(row.ink).padStart(8)}  diff vs before ${String(row.diffPx).padStart(8)} px (max delta ${String(row.maxDelta).padStart(3)})  instances ${row.instances}`);
    }
  } finally { await browser.close(); }
} finally { server.close(); }
if (OUT) writeFileSync(resolve(OUT, `visual-diff-${BACKEND}.json`), JSON.stringify(results, null, 2) + '\n');
const same = (a, b) => a.backend === b.backend && a.device === b.device && a.theme === b.theme && a.zoom === b.zoom;
const floorFor = (r) => results.find((c) => c.variant === 'before2' && same(c, r));
const bad = results.filter((r) => r.variant === 'after' && (r.maxDelta > Math.max(1, floorFor(r).maxDelta) || r.diffPx > Math.max(16, 2 * floorFor(r).diffPx)));
const blind = TREE_MODE
  ? results.filter((r) => r.variant === 'poison' && r.diffPx <= Math.max(16, 2 * floorFor(r).diffPx))
  : results.filter((r) => r.variant === 'one' && r.zoom >= 40 && r.diffPx === 0);
for (const r of bad) console.log(`  FAIL after: ${r.device} ${r.theme} zoom ${r.zoom}x diff ${r.diffPx} px max delta ${r.maxDelta} (floor ${floorFor(r).diffPx} px / ${floorFor(r).maxDelta})`);
for (const r of blind) console.log(`  BLIND control: ${r.device} ${r.theme} zoom ${r.zoom}x ${r.variant} diff ${r.diffPx} px`);
console.log(bad.length ? `\nFAIL: after differs from before in ${bad.length} view(s)`
  : blind.length ? `\nFAIL: the ${TREE_MODE ? 'poison' : 'threshold-1.0'} control changed nothing in ${blind.length} view(s): instrument blind`
  : `\nPASS: after is inside the before-vs-before noise floor at every view, and the ${TREE_MODE ? 'poison' : 'threshold-1.0'} control fired`);
process.exit(bad.length || blind.length ? 1 : 0);
