#!/usr/bin/env node
/* measure-s22-frame-time — the Scripture Web's frame time on the phone, written down.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * The Scripture Web draws 63k threads through one WebGL2 shader, and every
 * landing since the structure law (2026-09-21) has carried a hand-run S22
 * measurement (median / p90 rAF gap while panning at fit, ~12x, the ceiling
 * and the ceiling panned up) that lived only in a lane's out/ folder. This
 * tool is that measurement as a repo citizen: it writes
 * tools/perf/s22-frame-time.json with the numbers, the renderer string, the
 * commit and a hash of the Scripture Web SOURCE it measured, and
 * check-s22-frame-time.js (CI) refuses a source that has moved on without a
 * fresh measurement, or numbers over budget.
 *
 * CI has no phone; the measurement happens here, before the commit that
 * changes the Scripture Web. The recipe (also in check-s22-frame-time.js):
 *   1. phone awake + unlocked, Chrome open on about:blank;
 *      adb forward tcp:9333 localabstract:chrome_devtools_remote
 *      (curl http://127.0.0.1:9333/json/version must answer)
 *   2. a CLEAN tree with the built dist (npm run build), then
 *      npm run measure:s22            (≈ 90 s; writes tools/perf/s22-frame-time.json)
 *   3. commit the JSON with the source change.
 * Serves THIS tree (tools/e2e-read-serve.mjs, port 0), adb-reverses the port
 * to the phone, walks to the Scripture Web (Famous) and measures. Options:
 *   --devtools 9333   the forwarded DevTools port
 *   --serial <adb serial>   when more than one device is attached
 *   --allow-dirty     measure an uncommitted tree (the JSON then records sha HEAD+)
 */
import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { sourceHash, JSON_PATH, SCENES } from './check-s22-frame-time.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const DEVTOOLS = arg('--devtools', '9333');
const SERIAL = arg('--serial', '');
const ADB = 'adb' + (SERIAL ? ` -s ${SERIAL}` : '');
// tracked changes only: an untracked file is not in the built dist this measures
const dirty = execSync('git status --porcelain --untracked-files=no', { cwd: ROOT }).toString().trim();
if (dirty && !argv.includes('--allow-dirty')) {
  console.error('[s22] REFUSING: dirty tree (pass --allow-dirty to measure it anyway)\n' + dirty);
  process.exit(3);
}
// a dirty tree is named HEAD+ (git's own spelling for 'with changes')
const SHA = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() + (dirty ? '+' : '');
const puppeteer = createRequire(pathToFileURL(resolve(ROOT, 'package.json')))('puppeteer');
const { serveOwnTree } = await import(pathToFileURL(resolve(ROOT, 'tools/e2e-read-serve.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (s) => console.log('[s22] ' + s);
const finder = (l) => [...document.querySelectorAll('button,[role=button],a')]
  .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0);
async function waitFor(page, fn, ms, ...args) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await page.evaluate(fn, ...args)) return true; await sleep(200); }
  return false;
}
async function clickLabel(page, label, ms = 45000) {
  if (!(await waitFor(page, (l, s) => !!(new Function('return ' + s)())(l), ms, label, finder.toString()))) {
    throw new Error(`'${label}' not visible`);
  }
  await page.evaluate((l, s) => (new Function('return ' + s)())(l).click(), label, finder.toString());
}
const clickIfPresent = (page, label) => page.evaluate((l, s) => { const b = (new Function('return ' + s)())(l); if (!b) return false; b.click(); return true; }, label, finder.toString());
const attr = (page, k) => page.evaluate((k) => (document.querySelector('.sw-root') || { getAttribute: () => null }).getAttribute(k), k);
async function press(page, key, n, gap = 40) { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(gap); } }
/** rAF gaps over `ms` while the arrow keys pan the web left and right. */
async function frameTime(page, ms) {
  await page.focus('.sw-root');
  const panning = (async () => { const end = Date.now() + ms + 200; let dir = 0; while (Date.now() < end) { await page.keyboard.press(dir++ % 40 < 20 ? 'ArrowRight' : 'ArrowLeft'); await sleep(8); } })();
  const r = await page.evaluate(async (ms) => {
    const gaps = []; let last = performance.now(); const end = last + ms;
    await new Promise((done) => { const tick = (t) => { gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
    gaps.shift(); gaps.sort((a, b) => a - b);
    const q = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
    return { frames: gaps.length, median: +q(0.5).toFixed(2), p90: +q(0.9).toFixed(2), max: +q(1).toFixed(2), fps: +(gaps.length / (ms / 1000)).toFixed(1) };
  }, ms);
  await panning;
  return r;
}

const { server, url: LOCAL } = await serveOwnTree();
const port = new URL(LOCAL).port;
execSync(`${ADB} reverse tcp:${port} tcp:${port}`);
const URL0 = `http://127.0.0.1:${port}/`;
note(`serving ${ROOT} @ ${SHA} at ${LOCAL}; the phone reaches it at ${URL0}`);
let exitCode = 0;
try {
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEVTOOLS}`, defaultViewport: null, protocolTimeout: 240000 });
  try {
    let page = (await browser.pages()).find((p) => p.url().startsWith(URL0));
    if (!page) page = await browser.newPage();
    await page.bringToFront();
    await page.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!(await waitFor(page, () => { const r = document.getElementById('root'); return !!r && r.children.length > 0; }, 60000))) throw new Error('root never rendered');
    await clickLabel(page, 'Continue'); await clickLabel(page, 'Begin Reading'); await sleep(500);
    await clickIfPresent(page, 'Maybe later'); await sleep(200);
    await clickLabel(page, 'Personal Study'); await sleep(400);
    await clickLabel(page, 'The Whole Counsel');
    if (!(await waitFor(page, () => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), 60000))) throw new Error('no sw-root');
    if (await page.$('.sw-fallback')) throw new Error('sw-fallback: ' + await page.evaluate(() => (document.querySelector('.sw-fallback-body') || {}).textContent || ''));
    if (!(await waitFor(page, () => !document.querySelector('.sw-loading'), 60000))) throw new Error('still loading');
    await sleep(800); await clickIfPresent(page, 'Dismiss'); await sleep(300);
    await page.select('select.sw-select', 'famous'); await sleep(600);
    const renderer = await page.evaluate(() => { const gl = document.querySelector('canvas.sw-canvas-gl')?.getContext('webgl2') || document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'none'; });
    const viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }));
    note(`renderer "${renderer}" viewport ${JSON.stringify(viewport)}`);
    await page.focus('.sw-root'); await page.keyboard.press('0'); await sleep(600);
    const fit = Number(await attr(page, 'data-ppv-css'));
    const scenes = {};
    scenes.fit = await frameTime(page, 3000); note(`fit ${JSON.stringify(scenes.fit)}`);
    await page.keyboard.press('0'); await sleep(300);
    for (let i = 0; i < 40 && Number(await attr(page, 'data-ppv-css')) / fit < 12; i++) { await page.keyboard.press('+'); await sleep(60); }
    await sleep(500);
    scenes.mid = await frameTime(page, 3000); note(`mid (${(Number(await attr(page, 'data-ppv-css')) / fit).toFixed(1)}x) ${JSON.stringify(scenes.mid)}`);
    await page.keyboard.press('0'); await sleep(300);
    await press(page, '+', 40, 60); await sleep(900);
    scenes.ceiling = await frameTime(page, 3000); note(`ceiling ${JSON.stringify(scenes.ceiling)}`);
    await press(page, 'ArrowUp', 40, 30); await sleep(600);
    scenes.ceilingUp = await frameTime(page, 3000); note(`ceiling panned up ${JSON.stringify(scenes.ceilingUp)}`);
    await press(page, 'ArrowDown', 80, 15); await sleep(300);
    for (const k of SCENES) if (!scenes[k]) throw new Error('scene missing: ' + k);
    const out = {
      measured: new Date().toISOString(), sha: SHA, sourceHash: sourceHash(ROOT),
      device: { renderer, viewport, ua: await browser.userAgent() }, scenes,
    };
    mkdirSync(dirname(resolve(ROOT, JSON_PATH)), { recursive: true });
    writeFileSync(resolve(ROOT, JSON_PATH), JSON.stringify(out, null, 2) + '\n');
    note(`wrote ${JSON_PATH} (source ${out.sourceHash})`);
  } catch (e) { note('FAILED: ' + (e && e.stack || e)); exitCode = 1; }
  finally { await browser.disconnect(); }
} finally {
  server.close();
  try { execSync(`${ADB} reverse --remove tcp:${port}`); } catch { /* already gone */ }
}
process.exit(exitCode);
