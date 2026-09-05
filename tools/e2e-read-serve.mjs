/* The read detector's origin — owned, and proved to be ours.
   ─────────────────────────────────────────────────────────────────
   Lifted out of e2e-read-detector.mjs so it can be tested without running
   the detector: that module launches a browser at import time, so a unit
   test importing it would execute the whole 40 s walk.

   TWO PROPERTIES, both asserted in e2e-read-harness.test.js:

   1. THE PORT IS OURS. Port 0 lets the OS pick, so no other process can
      answer for this origin. The old harness hardcoded 8097 and asked the
      caller to start a server there; Python's http.server sets
      allow_reuse_address, so with four worktrees running, every bind
      SUCCEEDED and which one answered was undefined. The gate reported PASS
      while serving another tree.

   2. THE BYTES ARE OURS. service-worker.js's CACHE_VERSION over HTTP must
      equal the one on disk here, asserted BEFORE the first navigation.

   READ THIS BEFORE TRUSTING PROPERTY 2: **as long as the harness owns its
   own server, that assertion compares equal BY CONSTRUCTION and cannot
   fail.** startServer() serves out of ASSETS, ASSETS resolves from
   import.meta.url, so the bytes over HTTP and the bytes on disk are the same
   bytes. A passing run is NOT evidence that the right tree was served — it
   is evidence that nobody has reintroduced an externally-supplied origin.

   That is exactly what it is for. It is a tripwire, not a measurement: the
   day someone adds a `VOT_PREVIEW` env override, or points BASE at a port
   the caller started, this stops being a tautology and starts being the only
   thing standing between a green result and a stranger's bundles. It throws
   rather than warns for the same reason.

   Saying so here is deliberate. A check that cannot currently fail, left
   undescribed, becomes the next "with no real failure behind it" — a line
   that reads like proof and is not. Removing that kind of false comfort from
   this file is the whole point of the change it arrived in.
   ─────────────────────────────────────────────────────────────────── */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg',
};

/* Same shape as e2e-readalong.mjs:108 — port 0 lets the OS pick, so the
   origin is unique to this process and no other server can answer for it. */
export function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(resolve(ASSETS, '.' + urlPath));
    if (!filePath.startsWith(ASSETS) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(filePath));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/**
 * One-shot GET, no keep-alive. Deliberately `node:http` and not `fetch`:
 * undici pools sockets, and a pooled socket asserts inside its own parser
 * when the throwaway server it was talking to shuts down at the end of a
 * run. `agent: false` means the connection dies with the request.
 *
 * @param {string} url
 * @returns {Promise<string | null>} body, or null on any non-200
 */
export function httpGet(url) {
  return new Promise((res, rej) => {
    const req = http.get(url, { agent: false }, (r) => {
      if (r.statusCode !== 200) { r.resume(); res(null); return; }
      let body = '';
      r.setEncoding('utf8');
      r.on('data', (c) => { body += c; });
      r.on('end', () => res(body));
    });
    req.on('error', rej);
  });
}

const CACHE_VERSION_RE = /CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/;

/** The CACHE_VERSION in this tree's service-worker.js, read from disk. */
export function treeCacheVersion() {
  const m = CACHE_VERSION_RE.exec(readFileSync(resolve(ASSETS, 'service-worker.js'), 'utf8'));
  return m ? m[1] : null;
}

/** The CACHE_VERSION in the service-worker.js a given origin is serving. */
export async function servedCacheVersion(base) {
  const body = await httpGet(base + '/service-worker.js');
  if (!body) return null;
  const m = CACHE_VERSION_RE.exec(body);
  return m ? m[1] : null;
}

/**
 * Refuse to test a stranger. Throws unless `base` is serving this tree.
 *
 * TAUTOLOGICAL TODAY — see the header. While the harness owns its own server
 * this compares equal by construction and cannot fail; it is here as the
 * tripwire for the day an externally-supplied origin comes back. Do not read
 * a pass as evidence that the right tree was served.
 *
 * Call it BEFORE the first navigation: afterwards a green result has already
 * been produced about whatever answered.
 *
 * @param {string} base origin, e.g. http://127.0.0.1:53124
 * @returns {Promise<void>}
 */
export async function assertServingOwnTree(base) {
  const want = treeCacheVersion();
  const got = await servedCacheVersion(base).catch(() => null);
  if (!want || got !== want) {
    throw new Error(
      `[e2e-read] refusing to run: ${base} is serving CACHE_VERSION ${JSON.stringify(got)}, `
      + `but this tree's service-worker.js says ${JSON.stringify(want)}. `
      + 'The harness is not serving the tree it was launched from.'
    );
  }
}
