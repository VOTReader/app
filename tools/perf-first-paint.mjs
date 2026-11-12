/**
 * tools/perf-first-paint.mjs - time to first paint and to interactive of a reading page at boot, CPU slowed 4x
 * (TABS3, 2026-11-11). Asks: does drawing the swipe neighbours slow the page the reader opens?
 *
 * Each run is a cold load of the app (same profile, so the tab reopens on the page) at 412 x 915 @3x:
 *   fcp     first-contentful-paint
 *   text    the reading page's own text is in the live column (.pager-track holds 200+ characters)
 *   tti     the end of the last long task before 2 s with none (from navigation start; text at least)
 *   peeks   (TABS4) both swipe neighbours are in the DOM
 * Run: node tools/perf-first-paint.mjs [--tree DIR] [--runs 3] [--modes idle,eager,off] [--json FILE]
 *   --tree  another checkout's root (an older commit extracted with `git archive`); default this one.
 *   --modes when the neighbours are drawn (window.__votPeeks, ScreenLayout.jsx): idle (the app), eager (in the page's
 *           own render, as before TABS4), off (none). The same build; the modes take turns run by run, so a busy
 *           machine slows them alike.
 */
import puppeteer from 'puppeteer';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TREE = resolve(opt('--tree', resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')));
const RUNS = Number(opt('--runs', '3'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const { serveOwnTree } = await import(pathToFileURL(join(TREE, 'tools', 'e2e-read-serve.mjs')).href);
const { server, url } = await serveOwnTree();
const profile = join(tmpdir(), 'vot-perf-' + process.pid);
rmSync(profile, { recursive: true, force: true });
const browser = await puppeteer.launch({ headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const out = { tree: TREE, runs: RUNS, pages: {} };

const MODES = String(opt('--modes', 'idle')).split(',').filter(Boolean);
const PROBE = (mode) => {
  window.__votPeeks = mode;
  window.__perf = { text: null, peeks: null, long: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push([e.startTime, e.startTime + e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (_e) { /* none */ }
  const tick = () => {
    const p = window.__perf;
    if (p.text == null) {
      const t = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll > .pager-track, .screen-layout > .screen-scroll');
      if (t && (t.textContent || '').length > 200) p.text = performance.now();
    }
    if (p.peeks == null && document.querySelectorAll('.screen-layout > .pager-viewport > .pager-peek').length >= 2) p.peeks = performance.now();
    if (p.text == null || (p.peeks == null && performance.now() < 30000)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const spread = (a) => { const v = a.filter((x) => x != null); return v.length ? { med: med(v), min: Math.min(...v), max: Math.max(...v) } : null; };

const clickText = async (page, re) => {
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate((src) => {
      const el = [...document.querySelectorAll('button, [role="button"], a')].find((b) => b.getClientRects().length && new RegExp(src, 'i').test((b.textContent || '').trim()));
      if (!el) return false; el.click(); return true;
    }, re.source);
    if (ok) { await sleep(600); return true; }
    await sleep(250);
  }
  return false;
};

async function seed(how, arg) {
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; });
  await clickText(page, /^Continue$/); await clickText(page, /Begin Reading/); await clickText(page, /^Maybe later$/);
  await page.evaluate(() => { window.__loadVotCorpus && window.__loadVotCorpus(); window.__loadBibleCorpus && window.__loadBibleCorpus(); });
  await page.waitForFunction("typeof window.__openAudioText === 'function' && window.__votCorpus && window.__votCorpus.loaded && window.__bibleCorpus && window.__bibleCorpus.loaded", { timeout: 60000 });
  const ok = await page.evaluate((h, a) => {
    if (h === 'bible') {
      const ed = window.BIBLE_AUDIO_EDITIONS && window.BIBLE_AUDIO_EDITIONS['brm-kjv'];
      AudioPlayer.playBibleBook({ volKey: ed.volKey, bookId: a[0], label: ed.label, chapterNum: a[1] });
    } else {
      const l = (window[a[1]] || [])[a[2]];
      AudioPlayer.playLetter({ volKey: a[0], letter: l, collectionLabel: 'perf' });
    }
    const st = AudioPlayer.getState(); const tr = st.queue[st.qi];
    if (!tr) return false;
    window.__openAudioText(tr); return true;
  }, how, arg);
  if (!ok) throw new Error('perf: could not open ' + how);
  await sleep(1500);
  await page.evaluate(() => AudioPlayer.stop());
  await sleep(3000);   // the tab's place reaches storage
  await page.close();
}

async function measure(mode) {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument(PROBE, mode);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__perf && window.__perf.text != null, { timeout: 60000 });
  // quiet: 2 s with no long task
  let last = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const end = await page.evaluate(() => Math.max(0, ...window.__perf.long.map((x) => x[1])));
    const now = await page.evaluate(() => performance.now());
    if (now - end > 2000 && end === last) break;
    last = end;
  }
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const text = window.__perf.text;
    const lastLong = Math.max(0, ...window.__perf.long.map((x) => x[1]));
    const pk = window.__perf.peeks;
    return { fcp: fcp ? Math.round(fcp.startTime) : null, text: Math.round(text), peeks: pk == null ? null : Math.round(pk), tti: Math.round(Math.max(text, lastLong)), longTasks: window.__perf.long.length };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  return r;
}

try {
  for (const [name, how, arg] of [['letter', 'letter', ['one', 'LETTERS_V1', 2]], ['bible', 'bible', ['genesis', 2]]]) {
    await seed(how, arg);
    const runs = Object.fromEntries(MODES.map((m) => [m, []]));
    for (let i = 0; i < RUNS; i++) for (const m of (i % 2 ? [...MODES].reverse() : MODES)) runs[m].push(await measure(m));
    out.pages[name] = {};
    for (const m of MODES) {
      const r = runs[m];
      out.pages[name][m] = { runs: r, fcp: spread(r.map((x) => x.fcp)), text: spread(r.map((x) => x.text)), peeks: spread(r.map((x) => x.peeks)), tti: spread(r.map((x) => x.tti)) };
      const o = out.pages[name][m];
      console.log(name, m, 'fcp', JSON.stringify(o.fcp), 'text', JSON.stringify(o.text), 'peeks', JSON.stringify(o.peeks), 'tti', JSON.stringify(o.tti));
    }
  }
} finally {
  await browser.close().catch(() => {});
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
if (opt('--json', null)) writeFileSync(resolve(opt('--json', null)), JSON.stringify(out, null, 1));
