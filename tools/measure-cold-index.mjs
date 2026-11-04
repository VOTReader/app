#!/usr/bin/env node
/* measure-cold-index — how long a cold app start takes to have its search index (search200 h8, 2026-11-04).
   ─────────────────────────────────────────────────────────────────────────────
   A cold index is the common case after every corpus update (the warm index's signature names the corpus
   version), not only a first install. Each run: a fresh profile goes through first run once (the service
   worker installs and precaches), then the app is opened again with the warm index deleted at document
   start and the CPU throttled (default 4x, a phone's stand-in). It records, from navigation start:
   first contentful paint, when the build began and when the index was ready (VotSearchMini.getState()),
   every long task (PerformanceObserver 'longtask') up to 2 s after ready, and with --search-at, when a
   search asked at that time answered (the reader typing in the first seconds).

     node tools/measure-cold-index.mjs [--assets DIR] [--runs 3] [--throttle 4] [--search-at 1100]
                                       [--query "the lord is my shepherd"] [--json OUT] [--log FILE]

   Run it under the machine's caps: python D:/Swarm/tools/lowprio.py --cap 35 node tools/measure-cold-index.mjs ... --log F */
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { resolve, normalize, extname, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { throughFirstRun, declineTourOffer } from './first-run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const ASSETS = resolve(arg('--assets', resolve(HERE, '..', 'app', 'src', 'main', 'assets')));
const RUNS = +arg('--runs', 3);
const THROTTLE = +arg('--throttle', 4);
const SEARCH_AT = argv.includes('--search-at') ? +arg('--search-at') : null;
const QUERY = arg('--query', 'the lord is my shepherd');
const JSON_OUT = arg('--json', null);
const LOG = arg('--log', null);
const log = (s) => { if (LOG) appendFileSync(LOG, s + '\n'); else console.log(s); };

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.bin': 'application/octet-stream', '.onnx': 'application/octet-stream', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const f = normalize(resolve(ASSETS, '.' + p));
  if (!f.startsWith(ASSETS) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* In the page from document start: the long tasks, the first paint, and the build's start and end. */
const PROBE = (searchAt, query) => {
  const w = /** @type {any} */ (window);
  if (w.__coldProbe) return;
  const P = w.__coldProbe = { longtasks: [], fcp: null, buildStart: null, ready: null, docCount: 0, stats: null, search: null };
  try { if (self.caches) caches.delete('vot-search-index'); } catch { /* none */ }
  // what the search worker is asked and when it answers, and the big fetches (--trace)
  P.trace = [];
  const T = (/** @type {any[]} */ ...e) => P.trace.push([Math.round(performance.now()), ...e]);
  const W = w.Worker;
  if (typeof W === 'function') {
    w.Worker = function (/** @type {any} */ u, /** @type {any} */ o) {
      const wk = new W(u, o);
      const post = wk.postMessage.bind(wk);
      wk.postMessage = (/** @type {any} */ m, /** @type {any} */ t) => { if (m && m.op) T('send', m.op, m.id); return post(m, t); };
      wk.addEventListener('message', (/** @type {any} */ e) => { const d = e.data || {}; if (d.done) T('done', d.id, d.error || ''); else if (d.head) T('head', d.id); });
      return wk;
    };
  }
  const F = w.fetch;
  if (typeof F === 'function') w.fetch = (/** @type {any} */ u, /** @type {any} */ o) => { const n = String(u && u.url || u).split('/').pop(); T('fetch', n); return F(u, o).then((r) => { T('fetched', n); return r; }); };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') P.fcp = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true });
  } catch { /* no observer */ }
  /* The index is ready when an init() resolves: a timer polling getState() is starved while the originals are read
     a slice at a time behind scheduler.yield (its continuations go ahead of timers), and read ready seconds late. */
  let engine = null;
  Object.defineProperty(w, 'VotSearchMini', { configurable: true, enumerable: true, get: () => engine, set: (v) => {
    engine = v;
    if (v && typeof v.init === 'function' && !v.__probed) {
      const init = v.init;
      v.__probed = true;
      v.init = (/** @type {any} */ o) => {
        if (P.buildStart == null) P.buildStart = Math.round(performance.now());
        const p = init(o);
        Promise.resolve(p).then(() => { if (P.ready == null) { P.ready = Math.round(performance.now()); P.docCount = v.getState().docCount; P.stats = v.getStats ? v.getStats() : null; } }, () => {});
        return p;
      };
    }
  } });
  const iv = setInterval(() => {
    const E = w.VotSearchMini;
    if (!E || typeof E.getState !== 'function') return;
    const st = E.getState();
        if (st.originals === 'ready' && P.originals == null) { P.originals = Math.round(performance.now()); clearInterval(iv); }
  }, 25);
  if (searchAt != null) {
    setTimeout(function ask() {
      const E = w.VotSearchMini;
      if (!E) { setTimeout(ask, 25); return; }
      const t0 = performance.now();
      P.search = { asked: Math.round(t0) };
      // the search's own wait for the index is the build it starts; this init joins it, to see when it is ready
      E.init({ translation: 'nkjv' }).catch(() => {});
      E.search(query, { translation: 'nkjv' }).then((r) => { P.search.answered = Math.round(performance.now()); P.search.ms = P.search.answered - P.search.asked; P.search.n = (r.results || []).length; P.search.first = r.results && r.results[0] ? (r.results[0].doc.ref || r.results[0].doc.title) : null; }, (e) => { P.search.error = String(e); });
    }, Math.max(0, searchAt - performance.now()));
  }
};

const results = [];
for (let run = 0, tries = 0; run < RUNS; run++) {
  const profile = mkdtempSync(join(tmpdir(), 'vot-cold-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, args: ['--no-sandbox', '--renderer-process-limit=2', '--disable-gpu'] });
  try {
    // 1. first run: the service worker installs and precaches; the page then goes away
    let page = await browser.newPage();
    await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1 });
    await page.goto(BASE, { waitUntil: 'load' });
    await throughFirstRun(page, { timeoutMs: 120000 });
    await declineTourOffer(page).catch(() => {});
    for (let i = 0; i < 120; i++) { if (await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller))) break; await sleep(250); }
    await sleep(3000);
    await page.close();
    // 2. the cold start, measured
    page = await browser.newPage();
    await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1 });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    let workerThrottled = 0;
    page.on('workercreated', (wk) => { try { const c = /** @type {any} */ (wk).client; if (c) c.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }).then(() => { workerThrottled++; }, () => {}); } catch { /* not supported */ } });
    await page.evaluateOnNewDocument(PROBE, SEARCH_AT, QUERY);
    await page.goto(BASE, { waitUntil: 'load' });
    const t0 = Date.now();
    let P = null;
    while (Date.now() - t0 < 90000) {
      P = await page.evaluate(() => /** @type {any} */ (window).__coldProbe);
      if (P && P.ready != null && P.originals != null && (SEARCH_AT == null || (P.search && (P.search.answered || P.search.error)))) break;
      await sleep(250);
    }
    await sleep(2000 * THROTTLE / 4 + 1000);   // what runs after the swap (the originals, the excerpts) shows in the long tasks
    P = await page.evaluate(() => /** @type {any} */ (window).__coldProbe);
    const lt = P.longtasks;
    const before = lt.filter(([s]) => P.ready == null || s < P.ready);
    const sum = (a) => a.reduce((n, [, d]) => n + d, 0);
    const r = {
      run, fcp: P.fcp, buildStart: P.buildStart, ready: P.ready, originals: P.originals, docCount: P.docCount, stats: P.stats, search: P.search, workerThrottled,
      longTasks: { count: lt.length, total: sum(lt), max: lt.reduce((m, [, d]) => Math.max(m, d), 0), toReady: { count: before.length, total: sum(before), max: before.reduce((m, [, d]) => Math.max(m, d), 0) }, over100: lt.filter(([, d]) => d > 100).length },
      tasks: lt,
      trace: P.trace,
    };
    results.push(r);
    log(`run ${run}: fcp ${r.fcp} ms  init ${r.buildStart}  ready ${r.ready}  originals ${r.originals} (${r.docCount} docs; ${r.stats ? `collect ${r.stats.collectMs} insert ${r.stats.insertMs} build ${r.stats.buildMs}${r.stats.cached ? ' cached' : ''}` : ''})  long tasks ${r.longTasks.count} (${r.longTasks.total} ms, max ${r.longTasks.max}, >100ms ${r.longTasks.over100}; before ready ${r.longTasks.toReady.count}/${r.longTasks.toReady.total} ms)${r.search ? `  search asked ${r.search.asked} answered ${r.search.answered} (${r.search.ms} ms, ${r.search.n} hits, first ${r.search.first})` : ''}  worker throttled ${workerThrottled}`);
  } catch (e) {
    log(`run ${run}: failed (${e && e.message})`);
    if (++tries < 3) run--;
  } finally {
    await browser.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ }
  }
}
const med = (k) => { const v = results.map(k).filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
log(`median of ${results.length}: fcp ${med((r) => r.fcp)}  ready ${med((r) => r.ready)}  originals ${med((r) => r.originals)}  long-task total ${med((r) => r.longTasks.total)} max ${med((r) => r.longTasks.max)}${SEARCH_AT != null ? `  search answered ${med((r) => r.search && r.search.answered)} (${med((r) => r.search && r.search.ms)} ms)` : ''}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ assets: ASSETS, throttle: THROTTLE, searchAt: SEARCH_AT, query: QUERY, results }, null, 1));
server.close();
process.exit(0);
