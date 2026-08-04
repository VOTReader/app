// Service-worker install resilience (P1pwa — first SW test; P2pwa — the fix).
// The SW is a classic worker script with NO exports, so we read its source,
// run it with mocked self / caches / fetch (mirroring the real Cache.add
// semantics: a non-ok response rejects, and addAll is all-or-nothing), capture
// the registered handlers, and drive 'install'.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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

function bootSW({ fail = [], fetchImpl = null } = {}) {
  const handlers = {};
  const cacheModes = [];   // every mode the install precache actually requested
  const installFetch = async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    if (req && req.cache) cacheModes.push(req.cache);
    return fail.includes(url) ? { ok: false, status: 404 } : { ok: true, status: 200, clone: () => ({ body: url }) };
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
  // eslint-disable-next-line no-new-func
  const run = new Function('self', 'caches', 'fetch', 'console', 'Request', SW_SRC);
  run(self, caches, fetchFn, { log() {}, warn() {}, error() {} }, FakeRequest);
  return { handlers, caches, claimed, cacheModes };
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
