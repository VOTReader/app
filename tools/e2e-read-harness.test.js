/* The read detector must serve the tree it is testing — nothing else.
   ─────────────────────────────────────────────────────────────────
   It used to hardcode `http://127.0.0.1:8097/index.html` and require the
   caller to start a preview server there. Python's http.server sets
   allow_reuse_address, so with several worktrees running, EVERY bind
   succeeded and which one answered a given connection was undefined. The
   gate printed `E2E PASS` while exercising another tree, and every
   e2e:read result taken during that window was worthless and looked fine.

   Two properties close it, and neither is a substitute for the other:

     1. the harness binds its OWN ephemeral port, so no other process can
        answer for that origin — proved here against a server occupying
        8097 for the length of the case;
     2. before the first navigation it asserts the bytes it is serving are
        this tree's, fingerprinted on service-worker.js's CACHE_VERSION,
        which every build regenerates.

   Property 2 is a TRIPWIRE, not a measurement. While the harness owns its
   own server the two CACHE_VERSIONs are the same bytes by construction, so
   that assertion cannot currently fail — and the third case below is the
   one carrying it, because it points the assertion at a stranger and
   requires a throw. It earns its place the day someone reintroduces an
   externally-supplied origin, which is nearer than it sounds: the pattern
   this replaced was copied out of CONTRIBUTING into a third harness within
   hours of being written down.

   No puppeteer here: both properties are settled before a browser exists,
   which is exactly why they can be tested cheaply. */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ASSETS, startServer, servedCacheVersion, treeCacheVersion, assertServingOwnTree, httpGet,
  serveOwnTree,
} from './e2e-read-serve.mjs';
import { readFileSync as readSrc } from 'node:fs';

const DECOY_BODY = 'DECOY-NOT-THE-TREE-UNDER-TEST';
let decoy = null;
let served = null;

/** Drop keep-alive sockets before closing, or undici asserts on the teardown. */
async function shut(srv) {
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise((r) => srv.close(r));
}

afterEach(async () => {
  if (decoy) { await shut(decoy); decoy = null; }
  if (served) { await shut(served); served = null; }
});

/**
 * Occupy 8097 with something answering the wrong bytes.
 *
 * Resolves null when the port is ALREADY taken — the normal case on this
 * machine, and the hazard itself: another worktree's preview server is
 * sitting there. Either way 8097 is held by a stranger for the length of
 * the case, which is all these assertions need.
 */
function startDecoy() {
  return new Promise((r) => {
    const s = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(DECOY_BODY);
    });
    s.on('error', () => r(null));            // EADDRINUSE — a real squatter is up
    s.listen(8097, '127.0.0.1', () => r(s));
  });
}

const DETECTOR = resolve(ASSETS, '..', '..', '..', '..', 'tools', 'e2e-read-detector.mjs');
const detectorSource = () => readSrc(DETECTOR, 'utf8');

/** The detector's EXECUTABLE lines. Its comments narrate the two defects this
 *  file guards — the old http://127.0.0.1:8097, and the storage-clearing block
 *  that hung — on purpose, and that prose is the opposite of the defect. Every
 *  negative below is checked against this, and every one of them is paired with
 *  a positive on the same string, so a stripper that ate too much would fail
 *  rather than pass everything. */
const detectorCode = () => detectorSource()
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('e2e:read serves its own tree', () => {
  it('never consults 8097, whoever is sitting on it', async () => {
    decoy = await startDecoy();
    served = await startServer();
    const base = `http://127.0.0.1:${served.address().port}`;

    expect(served.address().port).not.toBe(8097);

    const html = await httpGet(base + '/index.html');
    expect(html).not.toContain(DECOY_BODY);
    expect(html).toBe(readFileSync(resolve(ASSETS, 'index.html'), 'utf8'));

    // ...and 8097 really was occupied while we ran, or this proves nothing.
    // WHAT it serves is beside the point: index.html is usually identical
    // across branches, which is precisely why the old harness could answer
    // from another worktree and look right. The property is that we never
    // asked it.
    expect(await httpGet('http://127.0.0.1:8097/index.html')).toBeTruthy();
  });

  it('serves the service worker of THIS tree', async () => {
    served = await startServer();
    const base = `http://127.0.0.1:${served.address().port}`;

    const onDisk = treeCacheVersion();
    expect(onDisk).toBeTruthy();
    expect(await servedCacheVersion(base)).toBe(onDisk);
    await expect(assertServingOwnTree(base)).resolves.toBeUndefined();
  });

  it('refuses loudly when the served tree is not this one', async () => {
    decoy = await startDecoy();
    // Whatever holds 8097 answers — but it is not serving this tree's
    // service worker, so the run must abort rather than report on it.
    await expect(assertServingOwnTree('http://127.0.0.1:8097')).rejects.toThrow(/CACHE_VERSION/);
  });
});

/* The gap the Verifier found by bite-checking the three cases above, which is
   the reason `serveOwnTree()` exists.

   They reverted the port fix while LEAVING `startServer()` in place — the
   realistic regression, not a synthetic one: the server still bound an
   ephemeral port, and the detector navigated to a hardcoded 8097 anyway.
   **The suite still passed 3/3.** Everything above asserts on a `base` this
   file constructs itself, so it proves the MODULE behaves and never proves the
   DETECTOR uses the module's origin. Two places the origin could be defined;
   the guard covered one.

   A test that pinned the fix rather than catching its removal — on the guard
   built to stop that exact recurrence. These two cases close it. */
describe('the detector uses the origin the module bound', () => {
  it('serveOwnTree hands back a URL on its own ephemeral port', async () => {
    decoy = await startDecoy();
    const out = await serveOwnTree();
    served = out.server;
    try {
      expect(out.url).toBe(`${out.base}/index.html`);
      expect(out.url).not.toContain(':8097');
      expect(await httpGet(out.url)).toBe(readFileSync(resolve(ASSETS, 'index.html'), 'utf8'));
    } finally { /* afterEach shuts it */ }
  });

  /* Source-level, deliberately: the failure is a SECOND definition of the
     origin appearing, and no runtime assertion can see a line that was never
     executed. The detector must take its URL from the module and build none of
     its own — that is the property, and it is checkable by reading. */
  it('the detector builds no origin of its own', () => {
    expect(detectorSource()).toContain('serveOwnTree');
    expect(detectorCode()).not.toMatch(/127\.0\.0\.1:\d+/);
    // ...and no re-derivation from the server object either.
    expect(detectorCode()).not.toMatch(/address\(\)\s*\.\s*port/);
  });
});

/* The reset block that WAS the `e2e:read` hang.
   ─────────────────────────────────────────────────────────────────────────
   Until 2026-09-04 the detector made its own fresh state after the app
   mounted: `localStorage.clear()`, then an awaited
   `indexedDB.deleteDatabase('votreader')`, then `location.reload()`. It was
   load-bearing rather than hygiene — the walk asserts counts, and a previous
   run's data makes every one of them wrong.

   One run in twenty then died at the 240 s protocolTimeout. The Verifier's
   console-channel probe showed the function reaching `ls-cleared` and then
   nothing, ever: the delete fired **no success, no error and no blocked**,
   because the harness was deleting the app's live database out from under a
   page still booting and reopening it for every store write.

     rq.onsuccess = rq.onerror = rq.onblocked = res;

   Three handlers reads as exhaustive. The real failure is no outcome at all.

   Determinism now comes from an isolated browser context, so there is nothing
   to clear and nothing that can refuse to be cleared. These cases hold the
   detector to that, and they are source-level for the same reason the origin
   case above is: the failure is a line REAPPEARING, and no runtime assertion
   can see a line that was never executed.
   ───────────────────────────────────────────────────────────────────────── */
describe('the detector isolates its storage instead of deleting it', () => {
  it('takes its page from a browser context of its own', () => {
    const code = detectorCode();
    expect(code).toMatch(/createBrowserContext\(\)/);
    expect(code).toMatch(/context\s*\.\s*newPage\(\)/);
    // The default context is shared with everything else this browser opens
    // AND with whatever the previous run left in that origin.
    expect(code).not.toMatch(/browser\s*\.\s*newPage\(\)/);
    // ...and the partition has to be discarded, or twenty runs share one.
    expect(code).toMatch(/context\s*\.\s*close\(\)/);
  });

  it('never clears the page storage, by any of the three routes', () => {
    const code = detectorCode();
    expect(code).not.toMatch(/deleteDatabase/);
    expect(code).not.toMatch(/localStorage\s*\.\s*clear/);
    expect(code).not.toMatch(/location\s*\.\s*reload/);
  });

  /* The two cases above are negatives against a string this file builds by
     deleting most of a file. A stripper that removed too much would satisfy
     every one of them, so this is what makes them mean something: the raw
     source DOES contain the forbidden text (in the explanation), the stripped
     source does NOT, and the stripped source still holds the code. Delete the
     comment-stripping and this fails; strip everything and this fails. */
  it('the comment stripper is what makes those negatives true, not an empty string', () => {
    const raw = detectorSource();
    const code = detectorCode();

    expect(raw).toMatch(/deleteDatabase/);          // narrated in the header
    expect(raw).toMatch(/location\.reload/);        // narrated too
    expect(code).not.toMatch(/deleteDatabase/);

    // The stripped text is still the program.
    expect(code).toMatch(/await\s+puppeteer\.launch/);
    expect(code).toMatch(/E2E PASS/);
    expect(code.length).toBeGreaterThan(2000);
  });
});
