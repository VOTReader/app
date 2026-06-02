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
  async add(url) {
    const r = await this._fetch(url);
    if (!r || !r.ok) throw new TypeError('Request failed: ' + url); // mirrors Cache.add
    this.store.set(url, r);
  }
  async addAll(urls) { await Promise.all(urls.map((u) => this.add(u))); } // all-or-nothing
  async match(url) { return this.store.get(url) || undefined; }
  async put(req, res) { this.store.set(req, res); }
}
class FakeCaches {
  constructor(fetchFn) { this.map = new Map(); this._fetch = fetchFn; }
  async open(name) { if (!this.map.has(name)) this.map.set(name, new FakeCache(this._fetch)); return this.map.get(name); }
  async keys() { return [...this.map.keys()]; }
  async delete(name) { return this.map.delete(name); }
}

function bootSW({ fail = [] } = {}) {
  const handlers = {};
  const fetchFn = async (url) =>
    (fail.includes(url) ? { ok: false, status: 404 } : { ok: true, status: 200, clone: () => ({ body: url }) });
  const caches = new FakeCaches(fetchFn);
  const self = {
    addEventListener: (t, fn) => { handlers[t] = fn; },
    location: { origin: 'https://app.test' },
    skipWaiting: () => {},
  };
  // eslint-disable-next-line no-new-func
  const run = new Function('self', 'caches', 'fetch', 'console', SW_SRC);
  run(self, caches, fetchFn, { log() {}, warn() {}, error() {} });
  return { handlers, caches };
}

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

  it('registers install/activate/message/fetch handlers', () => {
    const sw = bootSW();
    expect(typeof sw.handlers.install).toBe('function');
    expect(typeof sw.handlers.activate).toBe('function');
    expect(typeof sw.handlers.message).toBe('function');
    expect(typeof sw.handlers.fetch).toBe('function');
  });
});
