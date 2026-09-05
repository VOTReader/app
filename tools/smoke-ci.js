/**
 * U16 — headless render-walk gate for CI.
 *
 * smoke-lite.js (the existing CI check) is Node-only + structural (globals diff,
 * scripture-resolution presence). It renders ZERO screens, so the black-screen
 * class — a screen that builds clean but renders blank because a refactor moved
 * a helper out from under it — can slip every gate. This runs the REAL
 * 13-screen render walk + both annotation round-trips (tools/smoke.js) against
 * the BUILT bundles in headless Chrome, the cheapest enforced coverage over the
 * 83-file ui/ tree without 83 component tests.
 *
 * Flow: serve app/src/main/assets (no-store) → launch headless Chrome → load
 * index.html → wait for app mount → PRE-LOAD the lazy corpora (so the walk's
 * Volumes/Scriptures/Studies screens have their data and don't read as
 * "Loading…") → inject smoke.js via page.evaluate (NOT addScriptTag: the U10
 * hashed CSP blocks inline-script injection, but CDP Runtime.evaluate is
 * CSP-exempt, same as DevTools) → run votSmoke() → exit 0 on PASS, 1 on FAIL.
 * The same attempt finishes with a worst-case reading-toolbar geometry audit
 * at 360x800 so overflow hidden by the app shell cannot silently clip controls.
 *
 * Every uncaught page error raised while the page is open is part of the
 * verdict (foldPageErrors, 2026-09-03). React's ErrorBoundary only sees render;
 * a TypeError thrown from a click handler, a store subscriber, a timer or an
 * async effect during the walk leaves the screen painted and isCrashed() blind,
 * and until 2026-09-03 this harness collected those errors and printed them
 * only after the walk had already failed for another reason — so they passed
 * green. RED-proved: a `setTimeout(() => { throw ... }, 4000)` appended to
 * dist/bundle-b.js exited 0 with a PASS line on the old verdict.
 *
 * Local: `npm run smoke:ci`. CI: a step after `npm run build`.
 */

import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, 'app/src/main/assets');
const smokeSrc = readFileSync(resolve(root, 'tools/smoke.js'), 'utf8');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    // Resolve + contain to assetsDir (no path traversal).
    const filePath = normalize(resolve(assetsDir, '.' + urlPath));
    if (!filePath.startsWith(assetsDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(filePath));
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(server)));
}

async function auditCompactReadingNav(page) {
  await page.setViewport({ width: 360, height: 800 });
  const clickButton = async (pattern) => {
    const clicked = await page.evaluate((source) => {
      const re = new RegExp(source, 'i');
      const button = Array.from(document.querySelectorAll('button')).find((el) => re.test((el.textContent || '').trim()));
      if (!button) return false;
      button.click();
      return true;
    }, pattern.source);
    if (!clicked) throw new Error(`compact-nav route button not found: ${pattern}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 550));
  };

  const onHome = await page.evaluate(() => !!Array.from(document.querySelectorAll('button')).find((el) => /Prophetic Letters/i.test(el.textContent || '')));
  if (!onHome) {
    const clickedHome = await page.evaluate(() => {
      const button = document.querySelector('button[title="Home"]');
      if (!button) return false;
      button.click();
      return true;
    });
    if (!clickedHome) throw new Error('compact-nav Home button not found');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 550));
  }
  await clickButton(/Prophetic Letters/);
  await clickButton(/Words To Live By:\s*Part One/);
  await clickButton(/^1\s*Introduction/);

  return page.evaluate(() => {
    const nav = document.querySelector('.top-nav');
    if (!nav) return { ok: false, error: 'top nav missing' };
    const bounds = nav.getBoundingClientRect();
    const items = Array.from(nav.children).filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        label: el.getAttribute('aria-label') || el.getAttribute('title') || el.className || el.tagName,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
      };
    });
    const clipped = items.filter((item) => item.left < bounds.left - 1 || item.right > bounds.right + 1);
    const labels = items.map((item) => item.label);
    // C2-C [C3]: this walk ends on a WTLB Part One entry, and the back
    // affordance now names that destination instead of the generic word
    // "Index" — so the live assertion names it too (and is stronger for it:
    // "Back to Index" would have passed on any WTLB-family screen).
    const hasBack = labels.some((label) => /Back to Part One/i.test(String(label)));
    const hasHome = labels.some((label) => /^Home$/i.test(String(label)));
    return { ok: clipped.length === 0 && hasBack && hasHome, clipped, hasBack, hasHome, items };
  });
}

// Fold the page's uncaught errors into the walk's verdict. Exported for
// tools/smoke-ci.test.js; pure, so the verdict rule is pinned without a browser.
export function foldPageErrors(report, pageErrors) {
  if (!pageErrors || pageErrors.length === 0) return report;
  const n = pageErrors.length;
  const first = String(pageErrors[0]).split('\n')[0];
  report.ok = false;
  report.pageErrors = pageErrors.slice();
  report.summary += ` | ${n} UNCAUGHT PAGE ERROR${n === 1 ? '' : 'S'} — first: ${first}`;
  return report;
}

// One full smoke attempt against a FRESH browser: load → wait for mount →
// pre-load corpora → inject smoke.js → run votSmoke → return { report, pageErrors }.
// THROWS on a HARNESS error (CDP timeout / launch failure / wedged runner) — those
// are retried by main(). A RETURNED report is authoritative (pass OR genuine fail)
// and is never retried. The browser is always closed before returning/throwing so
// a wedged attempt can't leak a Chrome process into the next one.
async function runAttempt(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      // The whole 13-screen walk + 2 annotation round-trips runs as ONE
      // page.evaluate(votSmoke) — ~18s locally. On a loaded/wedged shared CI
      // runner that single CDP call can stall and surface a flaky
      // "Runtime.callFunctionOn timed out" with NO real failure (the walk is
      // bounded by its own sleeps). Raising the ceiling 180→600s did NOT fix it
      // — a hang consumes whatever timeout it's given (600s was hit too) — so the
      // real fix is the retry loop in main(). Keep a per-attempt ceiling generous
      // vs the ~18s walk (≈13×) but bounded so a hung attempt surfaces in minutes,
      // letting the retry recover instead of burning 10 minutes on one hang.
      protocolTimeout: 240000,
    });
    const page = await browser.newPage();
    // Desktop viewport, not Puppeteer's 800x600 default: the app's responsive
    // tiers (768/1100/1600 media queries + the rem-based inner caps) otherwise
    // run the whole walk in a geometry no real desktop uses. 1920x1080 exercises
    // the 1600 tier (--col-max 1040, 20px root) — the least-tested layout.
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for React to mount the app shell.
    await page.waitForFunction(
      () => { const r = document.getElementById('root'); return !!r && r.children.length > 0; },
      { timeout: 30000 }
    );

    // Pre-load the lazy corpora so the render walk's Volumes/Scriptures/Studies
    // screens have their data (else they show a "Loading…" placeholder and the
    // walk records them as unreached). Each loader is idempotent + returns a
    // promise; tolerate any being absent.
    await page.evaluate(async () => {
      const loaders = ['__loadBibleCorpus', '__loadMatthewCorpus', '__loadVotCorpus'];
      await Promise.all(loaders.map((n) => (typeof window[n] === 'function' ? window[n]() : null)));
    });

    // Inject smoke.js via CDP eval (CSP-exempt — the U10 hashed CSP would block
    // an injected inline <script>). The IIFE attaches window.votSmoke.
    await page.evaluate(smokeSrc);

    const report = await page.evaluate(() => window.votSmoke());
    // Horizontal-overflow tripwire at the desktop tier: any screen leaking past
    // the viewport width is a layout regression (body is overflow-x:hidden, so
    // this catches document-level leaks; per-element audits stay manual).
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflowX > 1) {
      report.ok = false;
      report.summary += ` | HORIZONTAL OVERFLOW ${overflowX}px at 1920x1080`;
    }
    let compactNav;
    try {
      compactNav = await auditCompactReadingNav(page);
    } catch (error) {
      compactNav = { ok: false, error: (error && error.message) || String(error) };
    }
    report.compactReadingNav = compactNav;
    if (!compactNav.ok) {
      report.ok = false;
      report.summary += ` | COMPACT NAV FAIL ${JSON.stringify(compactNav)}`;
    } else {
      report.summary += ' | compact nav ok at 360x800';
    }
    /* Runs second on purpose: the nav audit leaves the page on the letter
       screen, which is where the hero Listen pill is. */
    let touch;
    try {
      touch = await auditTouchTargets(page);
    } catch (error) {
      touch = { ok: false, problems: [(error && error.message) || String(error)], inventory: [] };
    }
    report.touchTargets = touch;
    if (touch.measurements) for (const m of touch.measurements) console.log(`[smoke-ci] tap ${m}`);
    if (touch.inventory.length) {
      console.log(`[smoke-ci] controls under ${TOUCH_FLOOR} px, reported not failed (Design & Performance triages):`);
      for (const line of touch.inventory) console.log(`  ${line}`);
    }
    if (!touch.ok) {
      report.ok = false;
      report.summary += ` | TOUCH TARGETS ${touch.problems.join('; ')}`;
    } else {
      report.summary += ' | touch targets ok at 360x800';
    }
    return { report, pageErrors };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* wedged browser — ignore */ } }
  }
}

/* WL4 touch-target floor, measured the way a finger meets it.
   ─────────────────────────────────────────────────────────────────────────
   getBoundingClientRect cannot see this. The repo's WL4 pattern keeps a
   control's VISUAL size and grows only its hit area, with a transparent
   ::after that no DOM box reports — journal-styles.js has used it since the
   26px block-delete x. So the only honest measurement is hit testing:
   elementFromPoint straight up and down the control's centre column until it
   stops answering with that control. That is the property the policy is
   about, and it is the one a reader experiences.

   Two assertions, because expanding a hit area is not free:

   1. Each named control owns at least FLOOR px vertically. Reported as the
      measured number, not a boolean, so a regression says how far it fell.

   2. NO visible control has lost its own centre. An expanded band reaches
      into the gutter, and a gutter between two rows is shared — grow both
      sides too far and the later one in paint order covers the earlier one's
      edge. Settings rows sit 21 px apart, so a 44 px band over a 26 px button
      takes 9 px of an 21 px gutter and 3 px stay clear; this assertion is
      what keeps that true when someone changes the spacing.

   Deliberately NOT a sweep of every control against the floor: the 18x18
   Settings info buttons and several chips are under it too, and are Design &
   Performance's to triage, not something to fail a CI gate on today. They are
   PRINTED below so the list stays visible instead of being quietly narrowed
   to what happens to pass. */
const TOUCH_FLOOR = 44;

async function auditTouchTargets(page) {
  await page.setViewport({ width: 360, height: 800 });
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));
  const clickText = async (source) => {
    const clicked = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const b = Array.from(document.querySelectorAll('button,[role=button]'))
        .find((el) => re.test(((el.getAttribute('aria-label') || el.textContent || '')).trim()) && el.getBoundingClientRect().width > 0);
      if (!b) return false;
      b.click();
      return true;
    }, source);
    await settle(550);
    return clicked;
  };

  /* Only RENDERED matches. The app keeps unmounted copies of some screens in
     the tree, so a raw querySelectorAll count includes pills with a zero box
     that no scroll can bring into view — indexing over those would report a
     failure about an element no reader can touch. */
  const countOf = (sel) => page.evaluate(
    (s2) => Array.from(document.querySelectorAll(s2)).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length,
    sel,
  );

  /* One target at a time, each scrolled to the middle first. Measuring a whole
     screen in one pass sounds cheaper and is wrong: elementFromPoint answers
     only inside the viewport, so anything near an edge measures short and
     anything past the fold measures zero -- which would read as "a neighbour
     stole its centre" and make the collision check meaningless. Centring the
     target also puts its real neighbours on screen, which is the population
     the collision check needs. */
  const measureOne = (screenName, sel, index) => page.evaluate(async (name, s2, i, floor) => {
    const target = Array.from(document.querySelectorAll(s2))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[i];
    if (!target) return null;
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 120));

    const inView = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0
        && r.top >= floor && r.bottom <= window.innerHeight - floor
        && r.left >= 0 && r.right <= window.innerWidth;
    };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    const tapHeight = (el) => {
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const owns = (y) => { const t = document.elementFromPoint(cx, y); return !!t && (t === el || el.contains(t)); };
      if (!owns(cy)) return 0;
      let up = 0; while (up < 80 && owns(cy - up - 1)) up += 1;
      let down = 0; while (down < 80 && owns(cy + down + 1)) down += 1;
      return up + down + 1;
    };
    const measured = (el) => { const r = el.getBoundingClientRect(); return { label: label(el), cls: String(el.className).slice(0, 30), w: Math.round(r.width), tap: tapHeight(el) }; };

    const neighbours = Array.from(document.querySelectorAll('button,[role=button],a,input,select,textarea')).filter(inView);
    return {
      screen: name,
      target: inView(target) ? measured(target) : null,
      offscreen: !inView(target),
      stolen: neighbours.map(measured).filter((m) => m.tap === 0).map((m) => m.label),
      under: neighbours.map(measured).filter((m) => m.tap < floor || m.w < floor),
    };
  }, screenName, sel, index, TOUCH_FLOOR);

  const measureAll = async (screenName, sel) => {
    const n = await countOf(sel);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const r = await measureOne(screenName, sel, i);
      if (r) rows.push(r);
    }
    return { screen: screenName, selector: sel, count: n, rows };
  };

  /* The compact-nav audit leaves the page on a WTLB Part One entry, which is
     where the hero Listen pill lives -- measured before navigating away. */
  const results = [await measureAll('letter', '.hero-play-pill')];

  if (!(await clickText('^Home$'))) throw new Error('touch-targets: Home button not found');
  if (!(await clickText('App Configuration'))) throw new Error('touch-targets: App Configuration not found');
  await page.evaluate(() => {
    for (const h of document.querySelectorAll('.settings-group-head')) if (/Your Data/.test(h.textContent || '')) h.click();
  });
  await settle(600);
  results.push(await measureAll('settings', '.settings-clear-btn'));

  const problems = [];
  const measurements = [];
  const inventory = [];
  for (const res of results) {
    if (!res.count) problems.push(`${res.screen}: nothing matched ${res.selector} -- the walk did not reach that screen`);
    /* A screen can hold several rendered copies of a control — the letter view
       preloads its neighbours, so three Listen pills exist and two sit ~900 and
       ~1600 px below the fold inside a container scrollIntoView does not drive.
       Those are skipped, not failed: they are not controls a reader can touch
       from here. What is NOT allowed is measuring none of them, which would
       make this whole audit pass by reaching nothing. */
    if (res.count && !res.rows.some((r) => !r.offscreen)) {
      problems.push(`${res.screen}: none of the ${res.count} ${res.selector} could be brought into the viewport — nothing was measured`);
    }
    for (const row of res.rows) {
      if (row.offscreen) continue;
      measurements.push(`${res.screen} ${row.target.label} ${row.target.w}x${row.target.tap}`);
      if (row.target.tap < TOUCH_FLOOR || row.target.w < TOUCH_FLOOR) {
        problems.push(`${res.screen}: "${row.target.label}" tap area ${row.target.w}x${row.target.tap} is under ${TOUCH_FLOOR}`);
      }
      for (const l of row.stolen) problems.push(`${res.screen}: "${l}" no longer owns its own centre -- a neighbour's hit area covers it`);
      for (const m of row.under) inventory.push(`${res.screen} ${m.w}x${m.tap} ${m.label} .${m.cls}`);
    }
  }
  return { ok: problems.length === 0, problems, measurements, inventory: [...new Set(inventory)] };
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  // Retry a HARNESS error (the flaky CDP hang) with a fresh browser; never retry
  // a genuine render failure. 3 attempts at a 240s ceiling bounds the worst case
  // while auto-recovering from the transient runner hang that used to need a
  // manual CI re-run.
  const MAX_ATTEMPTS = 3;
  let exitCode = 1;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[smoke-ci] attempt ${attempt}/${MAX_ATTEMPTS} — loading ${url}`);
      let result;
      try {
        result = await runAttempt(url);
      } catch (e) {
        // HARNESS error (CDP timeout / launch failure / wedged runner), NOT a
        // render failure — retry with a fresh browser.
        console.error(`[smoke-ci] harness error on attempt ${attempt}/${MAX_ATTEMPTS}:`, (e && e.message) || e);
        if (attempt < MAX_ATTEMPTS) { console.error('[smoke-ci] retrying with a fresh browser…'); continue; }
        console.error('[smoke-ci] giving up after', MAX_ATTEMPTS, 'attempts (runner likely wedged).');
        break;
      }
      // A real report is AUTHORITATIVE: a genuine render failure (ok === false)
      // must NOT be retried (that would mask a real regression). Done either way.
      const { report, pageErrors } = result;
      // A pageerror is a genuine failure, not a wedged runner: fold it into the
      // verdict here, on the authoritative (never retried) report.
      foldPageErrors(report, pageErrors);
      console.log('[smoke-ci] ' + report.summary);
      if (report.ok) {
        exitCode = 0;
      } else {
        console.error('[smoke-ci] FAIL — full report:');
        console.error(JSON.stringify(report, null, 2));
        if (pageErrors.length) console.error('[smoke-ci] pageerrors:', pageErrors);
      }
      break;
    }
  } finally {
    server.close();
  }
  process.exit(exitCode);
}

// Run only when invoked as a script; the unit test imports foldPageErrors.
const invokedDirectly = !!process.argv[1]
  && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) main();
