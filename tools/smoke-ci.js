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

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  let browser;
  let exitCode = 1;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    console.log('[smoke-ci] loading', url);
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

    console.log('[smoke-ci] ' + report.summary);
    if (!report.ok) {
      console.error('[smoke-ci] FAIL — full report:');
      console.error(JSON.stringify(report, null, 2));
      if (pageErrors.length) console.error('[smoke-ci] pageerrors:', pageErrors);
    } else {
      exitCode = 0;
    }
  } catch (e) {
    console.error('[smoke-ci] harness error:', e && e.stack || e);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  process.exit(exitCode);
}

main();
