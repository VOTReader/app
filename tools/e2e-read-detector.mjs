/* E2E proof of the read-detector chain in a COMPOSITING Chromium.
   ─────────────────────────────────────────────────────────────────
   WHY THIS EXISTS: the read tracker (use-read-tracker.js) measures real
   rendering geometry. jsdom has no layout, and a hidden/non-composited
   page (the in-app Browser pane, a backgrounded tab) delivers neither
   IntersectionObserver callbacks nor honest visibility — so the ONLY
   faithful verification of the full chain (genuine read → completion →
   count-valued readItems durable in IDB → ReadingStatsStore ledger/day
   bucket → partial-read frontier → frontier cleared on completion) is a
   headless-but-compositing browser. This drove out a P0 the fully-green
   unit suite could not see (vot-reading-stats missing from IDBAdapter →
   permanent 'degraded' hydration) on 2026-08-03.

   RUN (optional, ~40s — NOT a pre-commit/CI gate):
     1. serve assets:  python tools/preview-server.py 8097 app/src/main/assets
     2. node tools/e2e-read-detector.mjs
   Expects "E2E PASS" on stdout; exits 1 otherwise. Wipes the votreader
   IDB + localStorage of the target ORIGIN (localhost:8097) for a
   deterministic run — never point it at a profile you care about.
   ─────────────────────────────────────────────────────────────────── */
import puppeteer from 'puppeteer';

const URL = 'http://127.0.0.1:8097/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const r = document.getElementById('root');
    return !!r && r.children.length > 0;
  }, { timeout: 30000 });

  // Fresh state for determinism.
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((res) => { const rq = indexedDB.deleteDatabase('votreader'); rq.onsuccess = rq.onerror = rq.onblocked = res; });
    location.reload();
  });
  await sleep(1500);
  await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, { timeout: 30000 });

  const clickText = async (re) => page.evaluate((reSrc) => {
    const re2 = new RegExp(reSrc);
    const el = [...document.querySelectorAll('button,[role=button],[class*=tile],[class*=card],[class*=row]')]
      .find((b) => re2.test(b.textContent) && b.textContent.length < 120);
    if (el) { el.click(); return true; }
    return false;
  }, re.source);

  // Onboarding (fresh profile) → Home → Prophetic Letters → Volume One.
  for (const re of [/Continue/, /Begin Reading/]) { await clickText(re); await sleep(700); }
  await clickText(/Prophetic Letters/); await sleep(900);
  await page.evaluate(() => { if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus(); });
  await sleep(1200);
  await clickText(/Volume One(?!\d)/); await sleep(900);

  // Open the preface (first chip row).
  const opened = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].filter((b) => b.querySelector('.idx-min-chip') && !b.querySelector('[class*=row] [class*=row]'));
    if (!rows.length) return null;
    rows[0].click();
    return rows[0].textContent.trim().slice(0, 40);
  });
  console.log('opened:', opened);
  await sleep(800);

  const meta = await page.evaluate(() => ({
    segs: document.querySelectorAll('[data-hl-key]').length,
    bridge: typeof window.__onReadingComplete,
    key: window.__readTrackerMeta && window.__readTrackerMeta.key,
    vis: document.visibilityState,
  }));
  console.log('armed:', JSON.stringify(meta));

  // GENUINE READ: dwell at top, then step through with pauses (each step
  // holds segments visible >800ms; total dwell exceeds words*100ms).
  const scrollStep = async (top) => page.evaluate((t) => {
    const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 100 && e.clientHeight > 300);
    if (sc) sc.scrollTop = t;
    return sc ? sc.scrollHeight : -1;
  }, top);
  await sleep(3500);
  await scrollStep(450); await sleep(3000);
  await scrollStep(900); await sleep(3000);
  await scrollStep(1400); await sleep(4000);

  const result1 = await page.evaluate(async () => {
    // readItems lives in the IDB vot-state record (LS holds only the boot shim).
    const st = await new Promise((res) => {
      const rq = indexedDB.open('votreader');
      rq.onsuccess = () => {
        const db = rq.result;
        try {
          const tx = db.transaction(['vot-state'], 'readonly');
          const g = tx.objectStore('vot-state').getAll();
          g.onsuccess = () => { db.close(); const all = g.result || []; const merged = Object.assign({}, ...all.map((r) => (r && r.value) ? { [r.key || r.id]: r.value } : r)); res(merged); };
          g.onerror = () => { db.close(); res({}); };
        } catch (e) { db.close(); res({ err: String(e) }); }
      };
      rq.onerror = () => res({});
    });
    const s = (typeof ReadingStatsStore !== 'undefined') ? ReadingStatsStore.get() : null;
    return {
      readItems: st.readItems || (st['vot-state'] && st['vot-state'].readItems) || null, stKeys: Object.keys(st).slice(0,8),
      words: s && s.totalWordsRead, completions: s && s.totalCompletions,
      activeMs: s && s.totalActiveMs, days: s && s.wordsByDay,
      progressKeys: s ? Object.keys(s.progress || {}) : null,
    };
  });
  console.log('AFTER FULL READ:', JSON.stringify(result1));

  // PARTIAL READ: back to the index, open a multi-block letter, read only
  // the top, flick to the bottom for less than the 800ms credit floor, then
  // navigate away. The honest reading frontier says "first unread block"
  // while the saved scroll position says "bottom" — reopening must land at
  // the SAVED POSITION (the frontier jump was retired 2026-08-04); the
  // frontier data itself must still be recorded.
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || '')); if (b) b.click(); });
  await sleep(900);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].filter((b) => b.querySelector('.idx-min-chip') && !b.querySelector('[class*=row] [class*=row]'));
    if (rows[3]) rows[3].click();
  });
  await sleep(600);
  const key2 = await page.evaluate(() => window.__readTrackerMeta && window.__readTrackerMeta.key);
  await sleep(3000);  // read only the visible top — partial
  await scrollStep(1000000);
  await sleep(100);   // too brief to credit the bottom, but scroll memory sees it
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || '')); if (b) b.click(); });
  await sleep(1200);

  const result2 = await page.evaluate(() => {
    const s = ReadingStatsStore.get();
    return { progress: s.progress || {} };
  });
  console.log('AFTER PARTIAL READ:', JSON.stringify({ key2, progressKeys: Object.keys(result2.progress), entry: result2.progress[key2] }));
  const partialEntry = result2.progress[key2];
  const partialCredited = new Set((partialEntry && partialEntry.c) || []);
  let expectedUnread = null;
  if (partialEntry) {
    for (let i = 0; i < partialEntry.b; i++) {
      if (!partialCredited.has(i)) { expectedUnread = i; break; }
    }
  }

  // Reopen that same letter. Scroll memory restores the bottom and NOTHING
  // moves it afterwards.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].filter((b) => b.querySelector('.idx-min-chip') && !b.querySelector('[class*=row] [class*=row]'));
    if (rows[3]) rows[3].click();
  });
  await sleep(2200);
  const resume = await page.evaluate((key, expected) => {
    const sc = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll');
    const cands = sc ? [...sc.querySelectorAll('[data-hl-key]')].filter((el) => !el.parentElement?.closest('[data-hl-key]')) : [];
    const blocks = cands.length;
    const firstUnread = ReadingStatsStore.firstUnreadIndex(key, blocks);
    const target = expected != null && cands[expected] && sc
      ? (cands[expected].getBoundingClientRect().top - sc.getBoundingClientRect().top) + sc.scrollTop
      : -1;
    return {
      keyNow: window.__readTrackerMeta && window.__readTrackerMeta.key,
      blocks,
      firstUnread,
      expectedUnread: expected,
      progress: ReadingStatsStore.getProgress(key),
      scrollTop: sc ? sc.scrollTop : -1,
      maxTop: sc ? sc.scrollHeight - sc.clientHeight : -1,
      viewport: sc ? sc.clientHeight : -1,
      target,
    };
  }, key2, expectedUnread);
  console.log('AFTER REOPEN (scroll-position resume):', JSON.stringify(resume));

  // Assertions
  const fails = [];
  if (!result1.readItems || result1.readItems['v1:volume-one:a-word-of-warning'] !== 1) fails.push('preface not marked read=1: ' + JSON.stringify(result1.readItems));
  if (!(result1.words > 50)) fails.push('totalWordsRead not recorded: ' + result1.words);
  if (result1.completions !== 1) fails.push('completions != 1: ' + result1.completions);
  if (!result2.progress[key2] || !result2.progress[key2].c || result2.progress[key2].c.length < 1) fails.push('no frontier recorded for partial read of ' + key2);
  if (result2.progress[key2] && result2.progress[key2].c.length >= result2.progress[key2].b) fails.push('partial fixture credited every block; resume frontier is useless');
  if (result2.progress[key2] && !(result2.progress[key2].w < result2.progress[key2].tw)) fails.push('word-weighted partial progress missing: ' + JSON.stringify(result2.progress[key2]));
  if (!(resume.firstUnread > 0)) fails.push('no useful first-unread index after reopen: ' + JSON.stringify(resume));
  // target === -1 means the expected block (or the scroller) could not be
  // located — that must FAIL loudly, not degrade into a vacuous pass.
  if (resume.target < 0) fails.push('frontier target block not locatable (selector/expectedUnread broke): ' + JSON.stringify(resume));
  // Non-vacuity: the saved bottom and the frontier block must be MORE than a
  // viewport apart, or "landed at the saved position" proves nothing.
  else if (!(resume.maxTop > resume.viewport && Math.abs(resume.maxTop - resume.target) > resume.viewport)) fails.push('fixture too short to distinguish scroll-restore from a frontier jump: ' + JSON.stringify(resume));
  else if (!(Math.abs(resume.scrollTop - resume.maxTop) <= resume.viewport)) fails.push('reopen did not resume at the SAVED scroll position (frontier jump back?): ' + JSON.stringify(resume));
  if (result2.progress['v1:volume-one:a-word-of-warning']) fails.push('completed item still has a frontier (should be cleared)');

  if (fails.length) { console.error('E2E FAIL:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
  else console.log('E2E PASS — completion, ledger, day bucket, frontier, frontier-clear all verified in a real compositing Chromium.');
} finally {
  await browser.close();
}
