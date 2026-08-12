// Service-worker install resilience (P1pwa — first SW test; P2pwa — the fix).
// The SW is a classic worker script with NO exports, so we read its source,
// run it with mocked self / caches / fetch (mirroring the real Cache.add
// semantics: a non-ok response rejects, and addAll is all-or-nothing), capture
// the registered handlers, and drive 'install'.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { webcrypto } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const swPath = resolve(dirname(fileURLToPath(import.meta.url)), 'service-worker.js');
const SW_SRC = readFileSync(swPath, 'utf8');

class FakeCache {
  constructor(fetchFn) { this.store = new Map(); this._fetch = fetchFn; }
  // Real Cache keys by the request URL whether you pass a string or a Request;
  // normalize both so install (string urls) and fetch (Request objects) align.
  _key(k) { return typeof k === 'string' ? k : k.url; }
  async add(url) {
    const r = await this._fetch(url);
    if (!r || !r.ok) throw new TypeError('Request failed: ' + url); // mirrors Cache.add
    this.store.set(this._key(url), r);
  }
  async addAll(urls) { await Promise.all(urls.map((u) => this.add(u))); } // all-or-nothing
  async match(req, opts) {
    const key = this._key(req);
    if (this.store.has(key)) return this.store.get(key);
    if (opts && opts.ignoreSearch) {
      const bare = key.split('?')[0];
      for (const [k, v] of this.store) { if (k.split('?')[0] === bare) return v; }
    }
    return undefined;
  }
  async put(req, res) { this.store.set(this._key(req), res); }
}
class FakeCaches {
  constructor(fetchFn) { this.map = new Map(); this._fetch = fetchFn; }
  async open(name) { if (!this.map.has(name)) this.map.set(name, new FakeCache(this._fetch)); return this.map.get(name); }
  async keys() { return [...this.map.keys()]; }
  async delete(name) { return this.map.delete(name); }
  // Global caches.match — search every open cache (the SW uses this in coreFirst/corpusFirst).
  async match(req, opts) {
    for (const c of this.map.values()) { const r = await c.match(req, opts); if (r) return r; }
    return undefined;
  }
}

// Minimal Request stand-in: the SW wraps every precache URL in
// `new Request(url, { cache: 'reload' })` (STALE-CACHE RESILIENCE), so the
// script needs a Request constructor in scope AND the test needs to see the
// cache mode it asked for. Keeps `.url` as the raw relative string so cache
// keys stay identical to the plain-string era.
class FakeRequest {
  constructor(url, init) { this.url = typeof url === 'string' ? url : url.url; this.cache = (init && init.cache) || 'default'; }
}

/**
 * Real bytes for a precache URL, or null when it isn't a file on disk.
 *
 * install() now verifies every text asset against ASSET_INTEGRITY — sha256 hashes
 * GENERATED from these exact files by tools/sync-sw-version.js. So the fake
 * network has to serve the REAL bytes, or every test would trip the integrity
 * check. That is a feature: it means these tests exercise the true hashes rather
 * than a stubbed-out check that could pass while the real one is broken.
 *
 * @param {string} url e.g. './dist/bundle-a.js'
 * @returns {Uint8Array|null}
 */
function realBytes(url) {
  if (typeof url !== 'string' || !url.startsWith('./')) return null;
  // './' is the directory index. A real server answers it with index.html's bytes
  // (GitHub Pages and tools/preview-server.py both do), and ASSET_INTEGRITY gives
  // it index.html's hash for exactly that reason — so the harness must serve the
  // same thing, or the boot document would look tampered in every test.
  const rel = url === './' ? 'index.html' : url.slice(2);
  const fp = resolve(dirname(swPath), rel);
  try { return new Uint8Array(readFileSync(fp)); } catch { return null; }
}

function bootSW({ fail = [], corrupt = [], flakyOnce = [], fetchImpl = null } = {}) {
  const handlers = {};
  const cacheModes = [];   // every mode the install precache actually requested
  const attempts = new Map();   // url -> how many times install fetched it
  const installFetch = async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    if (req && req.cache) cacheModes.push(req.cache);
    const n = (attempts.get(url) || 0) + 1;
    attempts.set(url, n);
    if (fail.includes(url)) return { ok: false, status: 404 };
    const real = realBytes(url);
    // corrupt: always serve wrong bytes. flakyOnce: wrong bytes on the FIRST
    // fetch only, so the SW's single retry can recover — the deploy-straddle case.
    const wrong = corrupt.includes(url) || (flakyOnce.includes(url) && n === 1);
    let bytes = real;
    if (real && wrong) { bytes = new Uint8Array(real.length + 1); bytes.set(real); bytes[real.length] = 0x21; }
    const clone = bytes
      ? { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
      : { body: url };
    return { ok: true, status: 200, body: url, clone: () => clone };
  };
  // The SW's runtime `fetch` (coreFirst/corpusFirst) can be overridden per-test;
  // the FakeCaches' own fetch (for install cache.add) stays the install one.
  const fetchFn = fetchImpl || installFetch;
  const caches = new FakeCaches(installFetch);
  const claimed = { count: 0 };
  const self = {
    addEventListener: (t, fn) => { handlers[t] = fn; },
    location: { origin: 'https://app.test' },
    skipWaiting: () => {},
    clients: { claim: async () => { claimed.count += 1; } },
  };
  // `crypto` is passed EXPLICITLY rather than left to resolve off globalThis:
  // the SW's integrity check needs crypto.subtle.digest, and under jsdom the
  // global `crypto` does not reliably carry .subtle. Node's webcrypto always does.
  // eslint-disable-next-line no-new-func
  const run = new Function('self', 'caches', 'fetch', 'console', 'Request', 'crypto', SW_SRC);
  run(self, caches, fetchFn, { log() {}, warn() {}, error() {} }, FakeRequest, webcrypto);
  return { handlers, caches, claimed, cacheModes, attempts };
}

// Drive the fetch handler: returns the promise passed to respondWith, or
// undefined when the SW lets the request fall through (cross-origin / non-GET).
function fetchEvent(sw, request) {
  let p;
  sw.handlers.fetch({ request, respondWith: (promise) => { p = promise; } });
  return p;
}
// Drive the activate handler: returns the waitUntil promise.
function activate(sw) {
  let p;
  sw.handlers.activate({ waitUntil: (promise) => { p = promise; } });
  return p;
}
const getReq = (url, mode = 'cors') => ({ url, method: 'GET', mode });

// Drive the install handler: capture the promise it hands to event.waitUntil.
function install(sw) {
  let p;
  sw.handlers.install({ waitUntil: (promise) => { p = promise; } });
  return p;
}
async function coreCache(sw) {
  const name = (await sw.caches.keys()).find((k) => k.startsWith('vot-core-'));
  return sw.caches.open(name);
}

describe('service-worker install (P1pwa / P2pwa)', () => {
  it('caches the critical shell AND best-effort assets on a clean install', async () => {
    const sw = bootSW();
    await install(sw);
    const core = await coreCache(sw);
    expect(await core.match('./index.html')).toBeTruthy();
    expect(await core.match('./dist/bundle-a.js')).toBeTruthy();
    expect(await core.match('./dist/app.min.css')).toBeTruthy();
    expect(await core.match('./offline.html')).toBeTruthy(); // best-effort, cached
  });

  it('SURVIVES a best-effort asset 404 — install still resolves (P2pwa)', async () => {
    const sw = bootSW({ fail: ['./offline.html', './splash.jpg'] });
    await expect(install(sw)).resolves.toBeUndefined();
    const core = await coreCache(sw);
    expect(await core.match('./index.html')).toBeTruthy(); // critical still cached
    expect(await core.match('./offline.html')).toBeFalsy(); // the failed one skipped, not fatal
  });

  it('FAILS install when a CRITICAL asset 404s — all-or-nothing (P2pwa)', async () => {
    const sw = bootSW({ fail: ['./index.html'] });
    await expect(install(sw)).rejects.toBeTruthy();
  });

  /* STALE-CACHE RESILIENCE: cache.add()/addAll() may satisfy themselves from
     the browser HTTP cache, which would fill a brand-new vot-core-<newhash>
     bucket with the PREVIOUS deploy's bytes and pin them there until the NEXT
     version bump — the exact "installed the PWA, got an old build" symptom.
     Every precache fetch must therefore go out as cache:'reload'. */
  it('precaches every asset with cache:reload — never from the HTTP cache', async () => {
    const sw = bootSW();
    await install(sw);
    expect(sw.cacheModes.length).toBeGreaterThan(0);
    expect(sw.cacheModes.every((m) => m === 'reload')).toBe(true);
  });

  /* INTEGRITY-VERIFIED PRECACHE. A fresh CACHE_VERSION proves the cache KEY is
     new, not that the BYTES are — `cache: 'reload'` only bypasses the LOCAL HTTP
     cache and has no authority over the CDN in front of Pages. Since coreFirst is
     unconditional cache-first with no revalidation, wrong bytes written into
     vot-core-<newhash> stay pinned until the NEXT deploy. install() therefore
     verifies each text asset against ASSET_INTEGRITY (generated by
     tools/sync-sw-version.js from the same files that produce CACHE_VERSION) and
     refuses the build rather than pinning bytes it cannot vouch for. */
  it('ASSET_INTEGRITY is populated — an empty map would silently verify nothing', () => {
    const block = SW_SRC.match(/const ASSET_INTEGRITY = \{([\s\S]*?)\};/);
    expect(block).toBeTruthy();
    const entries = [...block[1].matchAll(/'([^']+)':\s*'([0-9a-f]{64})'/g)];
    expect(entries.length).toBeGreaterThanOrEqual(8);
    // The four eager bundles + the shell must all be covered, or the boot path
    // is exactly the part that goes unverified.
    const covered = entries.map((m) => m[1]);
    for (const must of ['./index.html', './dist/bundle-a.js', './dist/bundle-b.js',
      './dist/bundle-c.js', './dist/bundle-d.js', './dist/app.min.css']) {
      expect(covered).toContain(must);
    }
  });

  it('FAILS install when a CRITICAL asset\'s bytes do not match its hash', async () => {
    const sw = bootSW({ corrupt: ['./dist/bundle-a.js'] });
    await expect(install(sw)).rejects.toThrow(/integrity check failed/);
    // The safe direction: nothing half-written is left claiming to be this build.
    const name = (await sw.caches.keys()).find((k) => k.startsWith('vot-core-'));
    const core = name ? await sw.caches.open(name) : null;
    if (core) expect(await core.match('./dist/bundle-a.js')).toBeFalsy();
  });

  it('RETRIES once and SUCCEEDS when only the first fetch was wrong (deploy straddle)', async () => {
    const sw = bootSW({ flakyOnce: ['./dist/bundle-a.js'] });
    await expect(install(sw)).resolves.toBeUndefined();
    expect(sw.attempts.get('./dist/bundle-a.js')).toBe(2);   // one retry, not a loop
    const core = await coreCache(sw);
    expect(await core.match('./dist/bundle-a.js')).toBeTruthy();
  });

  it('does NOT fail the whole install when a NON-critical asset fails integrity', async () => {
    // bundle-e/-f and offline.html are not needed to boot, so refusing the entire
    // update over one of them would trade a working new build for a broken screen.
    const sw = bootSW({ corrupt: ['./dist/bundle-e.js'] });
    await expect(install(sw)).resolves.toBeUndefined();
    const core = await coreCache(sw);
    expect(await core.match('./dist/bundle-a.js')).toBeTruthy();   // shell still cached
    expect(await core.match('./dist/bundle-e.js')).toBeFalsy();    // suspect bytes not pinned
  });

  it('verifies against the REAL generated hashes — a clean install passes them', async () => {
    // Guards the whole mechanism: if sync-sw-version's hashing and the SW's hashing
    // ever disagree (CR handling, encoding), every install would fail.
    const sw = bootSW();
    await expect(install(sw)).resolves.toBeUndefined();
    expect(sw.attempts.get('./dist/bundle-a.js')).toBe(1);   // matched first time
  });

  /* The assertion above would ALSO hold if verification were skipped entirely, so on
     its own it proves nothing about the real map. These two close that gap: the first
     proves the REAL generated hash is what gets compared (tamper any single verified
     asset and the real map rejects it), and the second proves the check is actually
     reached for every asset the map covers rather than for a lucky subset. */
  it('the REAL map rejects a tamper on EVERY critical verified asset, one at a time', async () => {
    const critical = ['./index.html', './dist/app.min.css', './dist/bundle-a.js',
      './dist/bundle-b.js', './dist/bundle-c.js', './dist/bundle-d.js'];
    for (const target of critical) {
      const sw = bootSW({ corrupt: [target] });
      await expect(install(sw), 'tampering ' + target + ' must fail install')
        .rejects.toThrow(/integrity check failed/);
    }
  });

  it('fetches and verifies EVERY asset the generated map covers', async () => {
    const block = SW_SRC.match(/const ASSET_INTEGRITY = \{([\s\S]*?)\};/);
    const covered = [...block[1].matchAll(/'([^']+)':\s*'[0-9a-f]{64}'/g)].map((m) => m[1]);
    const sw = bootSW();
    await install(sw);
    // Every covered asset was fetched during install — so none was silently
    // skipped by a key-format mismatch between the generator and the worker.
    const unfetched = covered.filter((u) => !sw.attempts.has(u));
    expect(unfetched).toEqual([]);
  });

  it('registers install/activate/message/fetch handlers', () => {
    const sw = bootSW();
    expect(typeof sw.handlers.install).toBe('function');
    expect(typeof sw.handlers.activate).toBe('function');
    expect(typeof sw.handlers.message).toBe('function');
    expect(typeof sw.handlers.fetch).toBe('function');
  });
});

describe('service-worker fetch + activate runtime (TEST-2)', () => {
  it('serves a cached core asset from cache — no network hit', async () => {
    const netCalls = [];
    const sw = bootSW({ fetchImpl: async (r) => { netCalls.push(r.url); return { ok: true }; } });
    const core = await sw.caches.open('vot-core-seed');
    const cachedResp = { body: 'cached-bundle' };
    await core.put('https://app.test/dist/bundle-a.js', cachedResp);
    const res = await fetchEvent(sw, getReq('https://app.test/dist/bundle-a.js'));
    expect(res).toBe(cachedResp);
    expect(netCalls).toEqual([]);                 // cache hit ⇒ network never touched
  });

  it('fetches a corpus bundle on miss and caches it (cache-on-use)', async () => {
    const fetched = { ok: true, redirected: false, clone: () => ({ body: 'corpus' }) };
    const sw = bootSW({ fetchImpl: async () => fetched });
    const res = await fetchEvent(sw, getReq('https://app.test/dist/bundle-a-bible.js'));
    expect(res).toBe(fetched);
    const corpusName = (await sw.caches.keys()).find((k) => k.startsWith('vot-corpus-'));
    const corpus = await sw.caches.open(corpusName);
    expect(await corpus.match('https://app.test/dist/bundle-a-bible.js')).toBeTruthy();
  });

  it('does NOT cache a REDIRECTED corpus response (SW-4)', async () => {
    const fetched = { ok: true, redirected: true, clone: () => ({}) };
    const sw = bootSW({ fetchImpl: async () => fetched });
    await fetchEvent(sw, getReq('https://app.test/dist/bundle-a-vot.js'));
    const corpusName = (await sw.caches.keys()).find((k) => k.startsWith('vot-corpus-'));
    if (corpusName) {
      const corpus = await sw.caches.open(corpusName);
      expect(await corpus.match('https://app.test/dist/bundle-a-vot.js')).toBeFalsy();
    }
  });

  it('falls back to the precached shell on an offline navigation with a query string (SW-2)', async () => {
    const sw = bootSW({ fetchImpl: async () => { throw new Error('offline'); } });
    const core = await sw.caches.open('vot-core-seed');
    const shell = { body: 'app-shell' };
    await core.put('./index.html', shell);
    const res = await fetchEvent(sw, { url: 'https://app.test/index.html?utm=x', method: 'GET', mode: 'navigate' });
    expect(res).toBe(shell);                      // ignoreSearch hit, not the offline page
  });

  it('serves offline.html when navigating offline with no cached shell', async () => {
    const sw = bootSW({ fetchImpl: async () => { throw new Error('offline'); } });
    const core = await sw.caches.open('vot-core-seed');
    const offline = { body: 'offline-page' };
    await core.put('./offline.html', offline);
    const res = await fetchEvent(sw, { url: 'https://app.test/deep/link', method: 'GET', mode: 'navigate' });
    expect(res).toBe(offline);
  });

  it('ignores cross-origin + non-GET requests (no respondWith)', async () => {
    const sw = bootSW({ fetchImpl: async () => ({ ok: true }) });
    expect(fetchEvent(sw, getReq('https://github.com/x/y.jpg'))).toBeUndefined();   // cross-origin
    expect(fetchEvent(sw, { url: 'https://app.test/x', method: 'POST', mode: 'cors' })).toBeUndefined();
  });

  it('activate evicts STALE versioned caches, keeps the current ones', async () => {
    const sw = bootSW();
    await install(sw);                              // creates the current vot-core-* / vot-corpus-*
    const before = await sw.caches.keys();
    const curCore = before.find((k) => k.startsWith('vot-core-'));
    const curCorpus = before.find((k) => k.startsWith('vot-corpus-'));
    await sw.caches.open('vot-core-OLD');
    await sw.caches.open('vot-corpus-OLD');
    await activate(sw);
    const after = await sw.caches.keys();
    expect(after).toContain(curCore);
    expect(after).toContain(curCorpus);
    expect(after).not.toContain('vot-core-OLD');   // stale core evicted (CACHE_VERSION bust)
    expect(after).not.toContain('vot-corpus-OLD'); // stale corpus evicted (CORPUS_VERSION bust)
    // clients.claim() must run during activation: skipWaiting alone never
    // fires controllerchange in open tabs, so without claim() an existing tab
    // keeps the old controller while its old core cache is deleted above —
    // sw-register's reload never happens and the tab 503s offline.
    expect(sw.claimed.count).toBe(1);
  });
});
