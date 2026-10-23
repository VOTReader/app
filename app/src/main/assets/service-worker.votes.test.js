// @ts-nocheck
/* The service worker's half of song votes (sy4-3, Corbin 2026-10-22): Background Sync drains the page's outbox
   from IDB ('votreader' / meta / 'song-votes-outbox') when the link is back, even with the app closed. It never
   creates or upgrades the app's database. fake-indexeddb is scoped to this file. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SW_SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'service-worker.js'), 'utf8');
const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';

function bootSW(fetchImpl) {
  const handlers = {};
  const self = { addEventListener: (t, fn) => { handlers[t] = fn; }, location: { origin: 'https://app.test' }, clients: {} };
  const caches = { open: async () => ({ put: async () => {}, match: async () => undefined }) };
  new Function('self', 'caches', 'fetch', 'console', SW_SRC)(self, caches, fetchImpl, { log() {}, warn() {}, error() {} });
  return handlers;
}

function sync(handlers, tag) {
  let p = Promise.resolve();
  handlers.sync({ tag, waitUntil: (w) => { p = w; } });
  return p;
}

function openDb(version) {
  return new Promise((res, rej) => {
    const req = version ? indexedDB.open('votreader', version) : indexedDB.open('votreader');
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('meta')) req.result.createObjectStore('meta'); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function metaGet(key) {
  const db = await openDb();
  try {
    return await new Promise((res) => { const r = db.transaction('meta').objectStore('meta').get(key); r.onsuccess = () => res(r.result); });
  } finally { db.close(); }
}
async function metaPut(key, value) {
  const db = await openDb(1);
  await new Promise((res) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(value, key); tx.oncomplete = res; });
  db.close();
}
function dropDb() {
  return new Promise((res) => { const r = indexedDB.deleteDatabase('votreader'); r.onsuccess = res; r.onerror = res; r.onblocked = res; });
}

const vote = (song, v, at) => ({ install: 'storedrandomid_0000', song, v, at, traits: { w: 412, h: 915, dpr: 2.63, tz: 'America/Denver' } });

beforeEach(async () => { await dropDb(); });

describe('Background Sync sends the waiting votes (sy4-3)', () => {
  it('posts each waiting vote to the Worker and empties the outbox', async () => {
    const now = Date.now();
    await metaPut('song-votes-outbox', { [A]: vote(A, 1, now - 5), [B]: vote(B, 0, now) });
    const posted = [];
    const h = bootSW(async (url, init) => { posted.push([url, JSON.parse(init.body)]); return { status: 204 }; });
    await sync(h, 'song-votes');
    expect(posted.map((p) => p[0])).toEqual(['https://votes.votreader.workers.dev/v1/vote', 'https://votes.votreader.workers.dev/v1/vote']);
    expect(posted.map((p) => p[1].song)).toEqual([A, B]);   // oldest first
    expect(await metaGet('song-votes-outbox')).toEqual({});
  });

  it('no network: the votes stay and the sync rejects, so the browser fires it again later', async () => {
    const now = Date.now();
    await metaPut('song-votes-outbox', { [A]: vote(A, 1, now) });
    const h = bootSW(async () => { throw new TypeError('Failed to fetch'); });
    await expect(sync(h, 'song-votes')).rejects.toThrow();
    expect(Object.keys(await metaGet('song-votes-outbox'))).toEqual([A]);
  });

  it('a 400 is dropped (the Worker will never take it); a 429 is kept', async () => {
    const now = Date.now();
    await metaPut('song-votes-outbox', { [A]: vote(A, 1, now - 5), [B]: vote(B, 1, now) });
    const h = bootSW(async (_url, init) => ({ status: JSON.parse(init.body).song === A ? 400 : 429 }));
    await expect(sync(h, 'song-votes')).rejects.toThrow();
    expect(Object.keys(await metaGet('song-votes-outbox'))).toEqual([B]);
  });

  it('ignores other sync tags', async () => {
    await metaPut('song-votes-outbox', { [A]: vote(A, 1, Date.now()) });
    let calls = 0;
    const h = bootSW(async () => { calls++; return { status: 204 }; });
    await sync(h, 'something-else');
    expect(calls).toBe(0);
  });

  it('never creates the app database when there is none', async () => {
    let calls = 0;
    const h = bootSW(async () => { calls++; return { status: 204 }; });
    await sync(h, 'song-votes');
    expect(calls).toBe(0);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain('votreader');
  });
});

describe('votes.json is network-first like the catalog', () => {
  it('the worker answers /songs/votes.json itself, with the network answer when there is one', async () => {
    const fresh = { ok: true, status: 200, redirected: false, clone: () => ({}) };
    const h = bootSW(async () => fresh);
    let res = null;
    h.fetch({ request: { url: 'https://app.test/songs/votes.json', method: 'GET', mode: 'cors' }, respondWith: (p) => { res = p; }, waitUntil: () => {} });
    expect(res).not.toBe(null);
    expect(await res).toBe(fresh);
  });
});
