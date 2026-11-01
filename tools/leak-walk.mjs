/**
 * Leak walk: the real app in headless Chromium, every main screen and the reader
 * tabs opened and closed N times, counting what is left running (leak hunt, 2026-11-01).
 *
 * The jsdom gate (app/src/main/assets/src/ui/leak/) holds each screen alone to "nothing
 * outlives the unmount". This is the whole-app view a reader lives in: the built bundles,
 * the real corpora, App() routing between screens. Per leg (tools/leak-walk/walk.js) it
 * runs one warm-up cycle (first-visit caches fill), then N cycles, and reports:
 *   - the live counts before and after the N cycles, by kind, and the creation sites that
 *     grew (tools/leak-walk/instrument.js): window/document listeners, intervals,
 *     timeouts of 1 s or more, frames, observers, BroadcastChannels, IndexedDB
 *     connections, object URLs, store subscriptions;
 *   - Chromium's own DOM counters (documents, nodes, JS event listeners on any target);
 *   - the JS heap after a forced GC, before and after.
 *
 * Run: `node tools/leak-walk.mjs` after `npm run build` (it serves app/src/main/assets).
 * Env: LEGS=volumeLetter,bible (default: all), N=20, INSTRUMENT=0 (heap only, no API
 * wrapping), BUNDLES=<dir> (serve bundle-b/c/d from <dir>, e.g. an unminified build for
 * readable stacks). JSON on stdout, a readable log on stderr. Exit 1 when a leg's step
 * missed its target (the walk did not measure what it says) or the page threw.
 * Serves 127.0.0.1 only.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, '..', 'app', 'src', 'main', 'assets');
const BUNDLES = process.env.BUNDLES ? resolve(process.env.BUNDLES) : '';
const N = Number(process.env.N || 20);
const INSTRUMENT = process.env.INSTRUMENT !== '0';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  let f = normalize(resolve(assetsDir, '.' + p));
  if (BUNDLES && /^\/dist\/bundle-[bcd]\.js$/.test(p)) f = resolve(BUNDLES, p.slice('/dist/'.length));
  else if (!f.startsWith(assetsDir)) { res.writeHead(404); res.end(); return; }
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--js-flags=--expose-gc'] });
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 900 });
  if (INSTRUMENT) await page.evaluateOnNewDocument(readFileSync(resolve(here, 'leak-walk', 'instrument.js'), 'utf8'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${addr.port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => { const r = document.getElementById('root'); return r && r.children.length > 0; }, { timeout: 30000 });
  await page.evaluate(readFileSync(resolve(here, 'leak-walk', 'walk.js'), 'utf8'));
  await page.evaluate(async () => {
    for (const k of ['__loadVotCorpus', '__loadBibleCorpus', '__loadMatthewCorpus', '__loadAnswersCorpus']) {
      try { if (window[k]) await window[k](); } catch (_e) { /* a corpus that fails stays out of the walk */ }
    }
  });
  await sleep(1500);
  // First run: About → Begin Reading → the tour's "don't show again" → Home.
  await page.evaluate(async () => {
    const w = window.__walk;
    w.click(/^Continue/); await w.sleep(300);
    w.click(/Begin Reading/); await w.sleep(800);
    w.click(/Don.t show this again/); await w.sleep(300);
    await w.home();
  });
  if (INSTRUMENT) {
    // Store subscriptions: every global with a subscribe(), wrapped once the app is up.
    await page.evaluate(() => {
      const L = window.__leak;
      let seq = 1e9;
      for (const k of Object.getOwnPropertyNames(window)) {
        let o;
        try { o = window[k]; } catch (_e) { continue; }
        if (!o || (typeof o !== 'object' && typeof o !== 'function') || typeof o.subscribe !== 'function' || o.__leakWrapped) continue;
        const orig = o.subscribe;
        try {
          o.subscribe = function (...args) {
            const un = orig.apply(this, args);
            const id = ++seq;
            L.live.set(id, { kind: 'sub', desc: 'sub ' + k, stack: (new Error().stack || '').split('\n').slice(2, 8).map((x) => x.trim()).join(' | ') });
            if (typeof un !== 'function') return un;
            let done = false;
            return function (...a) { if (!done) { done = true; L.live.delete(id); } return un.apply(this, a); };
          };
          o.__leakWrapped = true;
        } catch (_e) { /* a frozen global is not counted */ }
      }
    });
  }
  const cdp = await page.createCDPSession();
  const gc = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); };
  const heapKB = async () => { await gc(); return Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 1024); };
  const domCounters = async () => { await gc(); return cdp.send('Memory.getDOMCounters'); };
  const snapshot = async () => (INSTRUMENT ? JSON.parse(await page.evaluate(() => JSON.stringify(window.__leak.snapshot()))) : {});
  const norm = (v) => v.kind + ' ' + v.desc.replace(/timeout \d+/, 'timeout') + ' @ ' + v.stack.replace(/https?:\/\/127\.0\.0\.1:\d+\//g, '');
  const bySite = (o) => { const m = {}; for (const v of Object.values(o)) { const k = norm(v); m[k] = (m[k] || 0) + 1; } return m; };
  const byKind = (o) => { const m = {}; for (const v of Object.values(o)) m[v.kind] = (m[v.kind] || 0) + 1; return m; };

  const all = await page.evaluate(() => Object.keys(window.__walk.legs));
  const legs = process.env.LEGS ? process.env.LEGS.split(',') : all;
  const report = { n: N, heapStartKB: await heapKB(), legs: {} };
  for (const leg of legs) {
    if (!all.includes(leg)) throw new Error('no such leg: ' + leg);
    await page.evaluate((l) => window.__walk.cycle(l), leg);   // warm-up
    await sleep(1200);
    const b = await snapshot();
    const d0 = await domCounters();
    const h0 = await heapKB();
    let ok = 0;
    for (let i = 0; i < N; i++) if (await page.evaluate((l) => window.__walk.cycle(l), leg)) ok++;
    await sleep(2500);   // let the last cycle's deferrals land
    const a = await snapshot();
    const d1 = await domCounters();
    const h1 = await heapKB();
    const sb = bySite(b), sa = bySite(a);
    const grew = {};
    for (const k of Object.keys(sa)) if ((sa[k] || 0) > (sb[k] || 0)) grew[k] = sa[k] - (sb[k] || 0);
    report.legs[leg] = { ok, before: byKind(b), after: byKind(a), dom: [d0, d1], heapKB: [h0, h1], grew };
    if (ok < N) failed = true;
    console.error(`${leg.padEnd(14)} ${ok}/${N}  heap ${h0} -> ${h1} KB (${h1 - h0 >= 0 ? '+' : ''}${h1 - h0})  nodes ${d0.nodes} -> ${d1.nodes}  listeners(all) ${d0.jsEventListeners} -> ${d1.jsEventListeners}` +
      (INSTRUMENT ? `  counted ${JSON.stringify(byKind(b))} -> ${JSON.stringify(byKind(a))}` : ''));
    for (const [k, n] of Object.entries(grew)) console.error(`    +${n} ${k.slice(0, 400)}`);
  }
  report.heapEndKB = await heapKB();
  report.errors = errors;
  if (errors.length) failed = true;
  console.error(`heap ${report.heapStartKB} -> ${report.heapEndKB} KB over the walk; page errors: ${errors.length}`);
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
