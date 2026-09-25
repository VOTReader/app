// @ts-nocheck — drives fake stores, fetch and a fake phone bridge in jsdom
/* song-keep — Songs of the Letters kept on this phone (K1).

   Each test fails on the lie it names: a song kept whose bytes are not the
   catalog's, a stored copy nobody checked, a batch started that cannot fit,
   an iPhone tab promised storage Safari will clear, two object URLs alive at
   once, a removed song still on the backup's list, a restore that forgets
   what was kept, and (the phone app) a kept song the native store holds at
   the wrong size. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SONG_FIXTURE } from './song-catalog.fixture.js';

const SONG_URL = (sh, id) => 'https://votreader.github.io/songs-' + sh + '/' + id + '.mp3';
const A1 = 'aaaaaaaaaaa1';
const A2 = 'aaaaaaaaaaa2';
const B1 = 'bbbbbbbbbbb1';

let SongKeep;
let Songs;

/** An in-memory offline-songs store with the real one's API. */
function fakeStore() {
  const map = new Map();
  return {
    map,
    corruptNextGet: 0,
    all: vi.fn(async () => [...map.values()]),
    get: vi.fn(async function (id) {
      const rec = map.get(id);
      if (rec && this.corruptNextGet > 0) {
        this.corruptNextGet--;
        return { ...rec, blob: new Blob([new Uint8Array(rec.bytes)]) };   // right size, wrong bytes
      }
      return rec || null;
    }),
    put: vi.fn(async (rec) => { map.set(rec.id, rec); }),
    delete: vi.fn(async (id) => { map.delete(id); }),
  };
}

/** A library bridge recording the kept list. */
function fakeLibrary(kept = []) {
  return {
    kept: kept.slice(),
    songKept() { return this.kept.slice(); },
    setSongsKept: vi.fn(function (ids, on) {
      const rest = this.kept.filter((x) => ids.indexOf(x) < 0);
      this.kept = on ? ids.concat(rest) : rest;
    }),
  };
}

/** bytes of a song: n bytes of a pattern that differs per song. */
const bytes = (n, seed = 1) => { const u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = (i * seed) % 251; return u; };

let store;
let lib;
let fetchMock;
let estimate;
let persist;

async function load() {
  vi.resetModules();
  SongKeep = (await import('./song-keep.js')).SongKeep;
  Songs = await import('./song-catalog.js');
  Songs.adoptSongCatalog(SONG_FIXTURE);
}

/** A small catalog-sized song answer (the fixture says b: 3,000,000; tests shrink b to keep memory small). */
function smallCatalog(b = 1000) {
  return { ...SONG_FIXTURE, songs: SONG_FIXTURE.songs.map((s) => ({ ...s, b })) };
}

beforeEach(async () => {
  store = fakeStore();
  lib = fakeLibrary();
  globalThis.OfflineSongsStore = store;
  globalThis.AudioLibraryStore = lib;
  fetchMock = vi.fn(async (url) => ({ ok: true, arrayBuffer: async () => bytes(1000, url.length).buffer }));
  globalThis.fetch = fetchMock;
  estimate = vi.fn(async () => ({ quota: 10e9, usage: 1e6 }));
  persist = vi.fn(async () => true);
  Object.defineProperty(window.navigator, 'storage', { configurable: true, value: { estimate, persist } });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  if (!globalThis.indexedDB) globalThis.indexedDB = {};
  await load();
  Songs.adoptSongCatalog(smallCatalog());
});

afterEach(() => {
  delete globalThis.OfflineSongsStore;
  delete globalThis.AudioLibraryStore;
  delete window.AndroidBridge;
  delete window.navigator.standalone;
  vi.useRealTimers();
});

/** Resolve once nothing is on its way. */
async function settled() {
  await vi.waitFor(() => { expect(SongKeep.progressOf([A1, A2, B1]).busy).toBe(0); });
}

describe('song-keep on the web — the offline-songs store', () => {
  it('keeps a song: fetched once, the catalog size, hashed, stored, read back, listed for the backup', async () => {
    const res = await SongKeep.keep([A1], 'song:fam-a');
    expect(res).toEqual({ ok: true, text: '' });
    await settled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(SONG_URL(1, A1));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    const rec = store.map.get(A1);
    expect(rec.bytes).toBe(1000);
    expect(rec.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.blob.size).toBe(1000);
    expect(SongKeep.isKept(A1)).toBe(true);
    expect(SongKeep.statusOf(A1)).toBe('kept');
    expect(lib.kept).toEqual([A1]);
    expect(persist).toHaveBeenCalledTimes(1);   // the first keep asks for persistent storage
    expect(SongKeep.progressOf([A1, A2])).toMatchObject({ total: 2, kept: 1, busy: 0, bytes: 2000, needBytes: 1000 });
  });

  it('a download that is not the catalog size is thrown away and fetched once more', async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => bytes(n++ === 0 ? 999 : 1000).buffer }));
    await SongKeep.keep([A1]);
    await settled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(SongKeep.isKept(A1)).toBe(true);
  });

  it('twice the wrong size: not kept, failed, nothing stored, nothing listed', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => bytes(998).buffer }));
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.isKept(A1)).toBe(false);
    expect(SongKeep.statusOf(A1)).toBe('failed');
    expect(store.map.has(A1)).toBe(false);
    expect(store.put).not.toHaveBeenCalled();   // a wrong size is never written, not even for a moment
    expect(lib.kept).toEqual([]);
  });

  it('a stored copy whose hash is not the download\'s is deleted and kept again', async () => {
    store.corruptNextGet = 1;
    await SongKeep.keep([A1]);
    await settled();
    expect(store.delete).toHaveBeenCalledWith(A1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(SongKeep.isKept(A1)).toBe(true);
  });

  it('refuses a batch that cannot fit, early and in words, with sizes from the catalog', async () => {
    Songs.adoptSongCatalog(smallCatalog(3_000_000));
    estimate.mockResolvedValue({ quota: 5_000_000, usage: 1_000_000 });
    const res = await SongKeep.keep([A1, A2], 'song:fam-a');
    expect(res.text).toBe('Not enough room: needs 6 MB, 4 MB free.');
    expect(SongKeep.noteFor('song:fam-a')).toBe('Not enough room: needs 6 MB, 4 MB free.');
    expect(fetchMock).not.toHaveBeenCalled();
    // The next try that fits clears the note.
    estimate.mockResolvedValue({ quota: 10e9, usage: 0 });
    Songs.adoptSongCatalog(smallCatalog());
    await SongKeep.keep([A1, A2], 'song:fam-a');
    expect(SongKeep.noteFor('song:fam-a')).toBe('');
    await settled();
  });

  it('offline: nothing starts, and the button says why', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    const res = await SongKeep.keep([A1], 'k');
    expect(res.text).toBe('Keeping songs needs a connection.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an iPhone in a Safari tab is told to add the app to its Home Screen, and nothing is kept', async () => {
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: false });
    expect(SongKeep.availability()).toBe('ios-tab');
    const res = await SongKeep.keep([A1], 'k');
    expect(res.text).toBe('Add VOTReader to your Home Screen to keep songs.');
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true });
    expect(SongKeep.availability()).toBe('ok');
  });

  it('keeps one song at a time, and Cancel takes the waiting ones off', async () => {
    let release;
    fetchMock.mockImplementation(() => new Promise((r) => { release = () => r({ ok: true, arrayBuffer: async () => bytes(1000).buffer }); }));
    await SongKeep.keep([A1, A2, B1]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(SongKeep.statusOf(A1)).toBe('keeping');
    expect(SongKeep.statusOf(A2)).toBe('queued');
    SongKeep.cancel([A2, B1]);
    expect(SongKeep.statusOf(B1)).toBe('none');
    release();
    await settled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(SongKeep.keptIds()).toEqual([A1]);
  });

  it('one object URL alive at a time: the last is revoked when another song plays, and on release', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const made = [];
    const revoked = [];
    URL.createObjectURL = vi.fn(() => { const u = 'blob:song-' + made.length; made.push(u); return u; });
    URL.revokeObjectURL = vi.fn((u) => revoked.push(u));
    await SongKeep.keep([A1, A2]);
    await settled();
    const u1 = SongKeep.objectUrlFor(A1);
    expect(SongKeep.objectUrlFor(A1)).toBe(u1);   // the same song keeps its URL
    const u2 = SongKeep.objectUrlFor(A2);
    expect(u2).not.toBe(u1);
    vi.advanceTimersByTime(1500);
    expect(revoked).toEqual([u1]);
    SongKeep.releaseObjectUrl();
    vi.advanceTimersByTime(1500);
    expect(revoked).toEqual([u1, u2]);
    expect(SongKeep.objectUrlFor(B1)).toBe('');   // not kept: no URL
  });

  it('remove takes the bytes and the backup\'s list entry; remove all empties both', async () => {
    await SongKeep.keep([A1, A2]);
    await settled();
    await SongKeep.remove([A1]);
    expect(store.map.has(A1)).toBe(false);
    expect(SongKeep.isKept(A1)).toBe(false);
    expect(lib.kept).toEqual([A2]);
    await SongKeep.removeAll();
    expect(store.map.size).toBe(0);
    expect(lib.kept).toEqual([]);
  });

  it('a restore brings the list without the bytes: missing() names what to download again', async () => {
    lib.kept = [A1, A2, 'ddddddddddd1'];   // d1 has no shard: never offered
    await SongKeep.ready();
    expect(SongKeep.missing()).toEqual([A1, A2]);
    expect(SongKeep.bytesOf(SongKeep.missing())).toBe(2000);
    await SongKeep.keep(SongKeep.missing(), 'restore');
    await settled();
    expect(SongKeep.missing()).toEqual([]);
  });

  it('what is kept survives a restart: read back from the store', async () => {
    await SongKeep.keep([A1]);
    await settled();
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    await SongKeep.ready();
    expect(SongKeep.isKept(A1)).toBe(true);
  });
});

describe('song-keep in the phone app — the native store', () => {
  let native;
  function bridge() {
    native = { items: [], freeBytes: 5e9 };
    const b = {
      offlineAudioState: vi.fn(() => JSON.stringify({
        items: native.items, totalBytes: native.items.reduce((n, i) => n + i.bytes, 0), freeBytes: native.freeBytes, active: null, queued: [],
      })),
      offlineAudioSave: vi.fn(),
      offlineAudioRemove: vi.fn(),
      offlineAudioCancel: vi.fn(),
      offlineAudioSizes: vi.fn(),
    };
    window.AndroidBridge = b;
    return b;
  }
  const send = (o) => window.__votOfflineAudio(JSON.stringify(o));

  it('hands the songs to the phone under their own URLs, and lists what lands', async () => {
    const b = bridge();
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    await SongKeep.keep([A1, A2], 'k');
    const sent = JSON.parse(b.offlineAudioSave.mock.calls[0][0]);
    expect(sent.map((i) => i.url)).toEqual([SONG_URL(1, A1), SONG_URL(1, A2)]);
    expect(sent[0]).toMatchObject({ key: 'song:' + A1 });
    expect(SongKeep.statusOf(A1)).toBe('queued');
    native.items = [{ url: SONG_URL(1, A1), key: 'song:' + A1, title: 't', bytes: 1000, savedAt: 5 }];
    send({ type: 'done', url: SONG_URL(1, A1), bytes: 1000 });
    expect(SongKeep.isKept(A1)).toBe(true);
    expect(lib.kept).toEqual([A1]);
    expect(fetchMock).not.toHaveBeenCalled();   // the page never fetches in the app
  });

  it('a song the phone holds at the wrong size is removed and fetched once more', async () => {
    const b = bridge();
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    SongKeep.subscribe(() => {});
    native.items = [{ url: SONG_URL(1, A1), key: 'song:' + A1, title: 't', bytes: 777, savedAt: 5 }];
    send({ type: 'done', url: SONG_URL(1, A1), bytes: 777 });
    expect(JSON.parse(b.offlineAudioRemove.mock.calls[0][0])).toEqual([SONG_URL(1, A1)]);
    native.items = [];
    send({ type: 'removed', urls: [SONG_URL(1, A1)] });
    expect(JSON.parse(b.offlineAudioSave.mock.calls[0][0])[0].url).toBe(SONG_URL(1, A1));
    expect(lib.kept).toEqual([]);   // never listed at the wrong size
  });

  it('refuses early when the phone lacks the room (its 200 MB margin kept)', async () => {
    bridge();
    native.freeBytes = 200 * 1024 * 1024 + 1500;
    await load();
    Songs.adoptSongCatalog(smallCatalog(1000));
    const res = await SongKeep.keep([A1, A2], 'k');
    expect(res.text).toMatch(/^Not enough room: needs /);
  });
});
