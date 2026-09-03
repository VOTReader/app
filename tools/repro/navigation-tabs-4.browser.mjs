// Verifier reproduction (navigation-tabs-4) in a REAL browser against the
// preview server: a persisted tab on a letter screen whose letterId the
// corpus no longer resolves boots to a blank, chromeless screen — and a
// reload lands on the same blank screen.
//
//   python tools/preview-server.py 8097 app/src/main/assets   (already running)
//   node tools/repro/navigation-tabs-4.browser.mjs [port]
//
// The persisted state is seeded through the legacy localStorage key that
// CachedStore reads when IDB is empty (legacyLsKey === storageKey), which is
// exactly a first boot of this profile. Each scenario runs in its own
// browser context, so its IDB starts empty.
import puppeteer from 'puppeteer';

const PORT = process.argv[2] || '8097';
const URL = `http://localhost:${PORT}/index.html`;

async function boot(browser, votState) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 400, height: 800 });
  await page.evaluateOnNewDocument((s) => {
    if (!localStorage.getItem('vot-state')) localStorage.setItem('vot-state', JSON.stringify(s));
  }, votState);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  return { ctx, page, errors };
}

async function settle(page) {
  // The VOT corpus is lazy; the letter route kicks its load. Wait for it and
  // give React two frames to re-render on the corpus bump.
  await page.waitForFunction(() => window.__votCorpus && (window.__votCorpus.loaded || window.__votCorpus.error), { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const text = (root && root.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      corpusLoaded: !!(window.__votCorpus && window.__votCorpus.loaded),
      corpusError: !!(window.__votCorpus && window.__votCorpus.error),
      rootChildren: root ? root.children.length : -1,
      rootTextLength: text.length,
      rootTextHead: text.slice(0, 80),
      topNav: !!document.querySelector('.top-nav'),
      anyButton: document.querySelectorAll('#root button').length,
      loadingPlaceholder: !!document.querySelector('.sc-sheet-loading'),
      screenFromState: (() => { try { return JSON.parse(localStorage.getItem('vot-state') || '{}'); } catch (_e) { return null; } })(),
    };
  });
}

const browser = await puppeteer.launch({ headless: true });
try {
  // A real letter id, read from the corpus itself so the CONTROL is honest.
  const { ctx: c0, page: p0 } = await boot(browser, { tabs: [{ screen: 'volumes-home' }], activeTabIdx: 0 });
  await p0.evaluate(() => window.__loadVotCorpus && window.__loadVotCorpus());
  await p0.waitForFunction(() => window.__votCorpus && window.__votCorpus.loaded, { timeout: 60000 });
  const realId = await p0.evaluate(() => {
    const col = COL_BY_KEY.get('one');
    const arr = col && (col.letters || col.entries || []);
    const first = Array.isArray(arr) ? arr[0] : (arr && Object.values(arr)[0]);
    return first && (first.id || first.slug || first.letterId) || null;
  });
  await c0.close();

  const out = { realId };

  // CONTROL: the same tab with a letterId that resolves.
  {
    const { ctx, page, errors } = await boot(browser, { tabs: [{ screen: 'vot-one-letter', letterId: realId }], activeTabIdx: 0 });
    out.control = await settle(page);
    out.control.errors = errors;
    await ctx.close();
  }
  // REPRO: the same tab with a letterId the corpus no longer has (a rename or
  // removal in a corpus bump), then a reload of the same profile.
  {
    const { ctx, page, errors } = await boot(browser, { tabs: [{ screen: 'vot-one-letter', letterId: 'no-such-letter-after-corpus-bump' }], activeTabIdx: 0 });
    out.deadId = await settle(page);
    await page.reload({ waitUntil: 'load' });
    out.deadIdAfterReload = await settle(page);
    out.deadIdAfterReload.errors = errors;
    await ctx.close();
  }
  const blank = (s) => s.corpusLoaded && !s.topNav && s.anyButton === 0 && s.rootTextLength === 0;
  out.verdict = {
    controlHasChrome: out.control.topNav && out.control.rootTextLength > 0,
    deadIdIsBlank: blank(out.deadId),
    blankSurvivesReload: blank(out.deadIdAfterReload),
  };
  out.verdict.reproduced = out.verdict.controlHasChrome && out.verdict.deadIdIsBlank && out.verdict.blankSurvivesReload;
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = out.verdict.reproduced ? 0 : 2;
} finally {
  await browser.close();
}
