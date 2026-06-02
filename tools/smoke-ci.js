/**
 * U16 — headless render-walk gate for CI.
 *
 * smoke-lite.js (the existing CI check) is Node-only + structural (globals diff,
 * scripture-resolution presence). It renders ZERO screens, so the black-screen
 * class — a screen that builds clean but renders blank because a refactor moved
 * a helper out from under it — can slip every gate. This runs the REAL
 * 12-screen render walk + both annotation round-trips (tools/smoke.js) against
 * the BUILT bundles in headless Chrome, the cheapest enforced coverage over the
 * 83-file ui/ tree without 83 component tests.
 *
 * Flow: serve app/src/main/assets (no-store) → launch headless Chrome → load
 * index.html → wait for app mount → PRE-LOAD the lazy corpora (so the walk's
 * Volumes/Scriptures/Studies screens have their data and don't read as
 * "Loading…") → inject smoke.js via page.evaluate (NOT addScriptTag: the U10
 * hashed CSP blocks inline-script injection, but CDP Runtime.evaluate is
 * CSP-exempt, same as DevTools) → run votSmoke() → exit 0 on PASS, 1 on FAIL.
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
      // The whole 12-screen walk + 2 annotation round-trips runs as ONE
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
    return { report, pageErrors };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* wedged browser — ignore */ } }
  }
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

main();
