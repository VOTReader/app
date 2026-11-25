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
let formatSongBytes;

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
  const m = await import('./song-keep.js');
  SongKeep = m.SongKeep;
  formatSongBytes = m.formatSongBytes;
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

  /* Sweep W64 (2026-10-13): the abort covered only the fetch, so a song cancelled or removed while it was hashed,
     stored or read back came back as kept (and on the backup's list); a remove during the store fetched it again. */
  describe('cancelled or removed while it is being stored (sweep W64)', () => {
    let releasePut;
    beforeEach(() => {
      releasePut = null;
      store.put = vi.fn((rec) => new Promise((r) => { releasePut = () => { store.map.set(rec.id, rec); r(); }; }));
    });
    const storing = () => vi.waitFor(() => expect(releasePut).toBeTypeOf('function'));

    it('Cancel: not kept, nothing stored, not listed, not failed', async () => {
      await SongKeep.keep([A1]);
      await storing();
      SongKeep.cancel([A1]);
      releasePut();
      await settled();
      expect(SongKeep.isKept(A1)).toBe(false);
      expect(store.map.has(A1)).toBe(false);
      expect(lib.kept).toEqual([]);
      expect(SongKeep.statusOf(A1)).toBe('none');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Remove all: the song on its way goes too', async () => {
      await SongKeep.keep([A1]);
      await storing();
      const done = SongKeep.removeAll();
      releasePut();
      await done;
      await settled();
      expect(SongKeep.keptIds()).toEqual([]);
      expect(store.map.size).toBe(0);
      expect(lib.kept).toEqual([]);
    });

    it('remove: gone, and not fetched a second time', async () => {
      await SongKeep.keep([A1]);
      await storing();
      const done = SongKeep.remove([A1]);
      releasePut();
      await done;
      await settled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(SongKeep.isKept(A1)).toBe(false);
      expect(store.map.has(A1)).toBe(false);
      expect(lib.kept).toEqual([]);
    });

    // W64 refuter round 2: a keep still checking for room (before its song is queued) was out of every list a
    // Cancel or Remove all reads, so the song started after them and came back kept.
    it.each([
      ['Remove all', () => SongKeep.removeAll()],
      ['Cancel', () => SongKeep.cancel([A1])],
      ['remove', () => SongKeep.remove([A1])],
    ])('%s while Keep is still checking for room: nothing starts', async (_label, stop) => {
      let roomIn = null;
      estimate.mockImplementation(() => new Promise((r) => { roomIn = () => r({ quota: 10e9, usage: 1e6 }); }));
      const asked = SongKeep.keep([A1]);
      await vi.waitFor(() => expect(roomIn).toBeTypeOf('function'));
      await stop();
      roomIn();
      await asked;
      await settled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(store.map.has(A1)).toBe(false);
      expect(lib.kept).toEqual([]);
      expect(SongKeep.statusOf(A1)).toBe('none');
    });

    // W64 refuter round 3: on a cold start the stored list loads late; a Remove all (or remove) before it landed read
    // an empty kept list, and the load then brought the song back as kept.
    it.each([
      ['Remove all', () => SongKeep.removeAll()],
      ['remove', () => SongKeep.remove([A1])],
    ])('%s before the stored list has loaded takes the songs it then finds', async (_label, stop) => {
      store.map.set(A1, { id: A1, blob: new Blob([bytes(1000)]), bytes: 1000, sha256: '', keptAt: 1 });
      lib.kept = [A1];
      let listIn = null;
      // A read snapshots what is stored when it starts, as an IndexedDB getAll does.
      store.all = vi.fn(() => { const snap = [...store.map.values()]; return new Promise((r) => { listIn = () => r(snap); }); });
      void SongKeep.ready();
      await vi.waitFor(() => expect(listIn).toBeTypeOf('function'));
      const done = stop();
      listIn();
      await done;
      await SongKeep.ready();   // the late load has landed
      expect(SongKeep.keptIds()).toEqual([]);
      expect(store.map.size).toBe(0);
      expect(lib.kept).toEqual([]);
    });

    it('a Cancel before a later Keep of the same song does not stop that Keep', async () => {
      SongKeep.cancel([A1]);
      await SongKeep.keep([A1]);
      await storing();
      releasePut();
      await settled();
      expect(SongKeep.isKept(A1)).toBe(true);
    });

    it('a store read that fails after Cancel is the cancel, not a failure: the stored copy goes', async () => {
      let rejectGet = null;
      store.get = vi.fn(() => new Promise((_r, j) => { rejectGet = () => j(new Error('read failed')); }));
      await SongKeep.keep([A1]);
      await storing();
      releasePut();
      await vi.waitFor(() => expect(rejectGet).toBeTypeOf('function'));
      SongKeep.cancel([A1]);
      rejectGet();
      await settled();
      expect(SongKeep.statusOf(A1)).toBe('none');
      expect(store.map.has(A1)).toBe(false);
      expect(SongKeep.isKept(A1)).toBe(false);
      expect(lib.kept).toEqual([]);
    });
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
    native = { items: [], freeBytes: 5e9, queued: [], active: null };
    const b = {
      offlineAudioState: vi.fn(() => JSON.stringify({
        items: native.items, totalBytes: native.items.reduce((n, i) => n + i.bytes, 0), freeBytes: native.freeBytes,
        active: native.active, queued: native.queued,
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

  /* sweep v037: Remove all read only the songs already on the phone, so the ones still queued or downloading in the
     phone's store went on, landed, and were listed as kept again (on the backup's list too). */
  it('Remove all stops the songs still on their way, so none of them lands back as kept', async () => {
    const b = bridge();
    const row = (id, sh) => ({ url: SONG_URL(sh, id), key: 'song:' + id, title: 't', bytes: 1000, savedAt: 5 });
    // The phone's store as it really behaves: a cancel takes a song out of its queue, a remove off its disk.
    b.offlineAudioCancel.mockImplementation((json) => {
      const urls = JSON.parse(json);
      native.queued = native.queued.filter((u) => urls.indexOf(u) < 0);
      if (native.active && urls.indexOf(native.active.url) >= 0) native.active = null;
    });
    b.offlineAudioRemove.mockImplementation((json) => {
      const urls = JSON.parse(json);
      native.items = native.items.filter((it) => urls.indexOf(it.url) < 0);
    });
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    SongKeep.subscribe(() => {});
    await SongKeep.keep([A1, A2, B1], 'k');
    // A1 has landed, A2 is downloading, B1 waits in the phone's queue.
    native.items = [row(A1, 1)];
    native.active = { url: SONG_URL(1, A2), bytes: 10, total: 1000 };
    native.queued = [SONG_URL(2, B1)];
    send({ type: 'done', url: SONG_URL(1, A1), bytes: 1000 });
    expect(lib.kept).toEqual([A1]);
    expect([SongKeep.statusOf(A2), SongKeep.statusOf(B1)]).toEqual(['keeping', 'queued']);

    await SongKeep.removeAll();
    // Both songs on their way are stopped, once each, in the phone's store.
    const cancelled = b.offlineAudioCancel.mock.calls.flatMap((c) => JSON.parse(c[0]));
    expect(cancelled.sort()).toEqual([SONG_URL(1, A2), SONG_URL(2, B1)].sort());
    // Whatever the phone still had on its way runs to the end and lands.
    const going = (native.active ? [native.active.url] : []).concat(native.queued);
    native.active = null;
    native.queued = [];
    for (const url of going) {
      native.items = native.items.concat([{ url, key: 'song', title: 't', bytes: 1000, savedAt: 6 }]);
      send({ type: 'done', url, bytes: 1000 });
    }
    send({ type: 'removed', urls: [SONG_URL(1, A1)] });
    expect(SongKeep.keptIds()).toEqual([]);
    expect(lib.kept).toEqual([]);   // nothing back on the backup's list
    expect([A1, A2, B1].map((id) => SongKeep.statusOf(id))).toEqual(['none', 'none', 'none']);
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

/* ra6 (Corbin 2026-10-14, brief design-10): Download only on Wi-Fi holds a keep while the phone is on mobile data. */
describe('song-keep on the web — Download only on Wi-Fi (ra6)', () => {
  let gate;
  let conn;
  beforeEach(async () => {
    gate = await import('./download-gate.js');   // the instance song-keep.js imported (load() reset the modules)
    conn = new EventTarget();
    conn.type = 'cellular';
    conn.move = (t) => { conn.type = t; conn.dispatchEvent(new Event('change')); };
    Object.defineProperty(window.navigator, 'connection', { configurable: true, value: conn });
  });
  afterEach(() => {
    gate._resetDownloadGate();
    delete window.navigator.connection;
  });

  it('on mobile data a keep waits and says so, then goes on by itself on Wi-Fi', async () => {
    gate.setWifiOnly(true);
    await SongKeep.keep([A1]);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(SongKeep.statusOf(A1)).toBe('queued');
    expect(SongKeep.waiting()).toBe(true);
    conn.move('wifi');
    await settled();
    expect(SongKeep.isKept(A1)).toBe(true);
    expect(SongKeep.waiting()).toBe(false);
  });

  it('a song on its way stops on mobile data and waits at the head of the queue, not as a failure', async () => {
    conn.type = 'wifi';
    gate.setWifiOnly(true);
    fetchMock.mockImplementationOnce((_u, init) => new Promise((_r, j) => {
      init.signal.addEventListener('abort', () => j(new DOMException('aborted', 'AbortError')));
    }));
    await SongKeep.keep([A1, A2]);
    await vi.waitFor(() => expect(SongKeep.statusOf(A1)).toBe('keeping'));
    conn.move('cellular');
    await vi.waitFor(() => expect(SongKeep.statusOf(A1)).toBe('queued'));
    expect(SongKeep.waiting()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    conn.move('wifi');
    await settled();
    expect(SongKeep.isKept(A1)).toBe(true);
    expect(SongKeep.isKept(A2)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(SONG_URL(1, A1));
    expect(fetchMock.mock.calls[1][0]).toBe(SONG_URL(1, A1));   // A1 again first, from the top
  });

  it('a cancel while it waits wins: Wi-Fi afterwards fetches nothing', async () => {
    gate.setWifiOnly(true);
    await SongKeep.keep([A1]);
    SongKeep.cancel([A1]);
    expect(SongKeep.statusOf(A1)).toBe('none');
    conn.move('wifi');
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* votreader-tests-7 item 4: the edges the first suites did not reach — sizes in
   words, refusals, bad input, a store that fails, and the phone's own edges. */
describe('song-keep — the edges: sizes, refusals and bad input', () => {
  const A3 = 'aaaaaaaaaaa3';   // hidden duplicate in the fixture
  const D1 = 'ddddddddddd1';   // no shard in the fixture
  const E1 = 'eeeeeeeeeee1';   // a well-formed id the catalog does not know

  it('formatSongBytes: 0 MB for nothing, GB at a billion, one decimal under 10 MB, whole above', () => {
    expect(formatSongBytes(0)).toBe('0 MB');
    expect(formatSongBytes(-5)).toBe('0 MB');
    expect(formatSongBytes(NaN)).toBe('0 MB');
    expect(formatSongBytes(1e9)).toBe('1 GB');
    expect(formatSongBytes(3.8e9)).toBe('3.8 GB');
    expect(formatSongBytes(1e6)).toBe('1 MB');
    expect(formatSongBytes(3_400_000)).toBe('3.4 MB');
    expect(formatSongBytes(10.4e6)).toBe('10 MB');
    expect(formatSongBytes(64e6)).toBe('64 MB');
  });

  it('bad ids are not kept, have no status and no object URL', () => {
    expect(SongKeep.isKept('x')).toBe(false);
    expect(SongKeep.isKept(null)).toBe(false);
    expect(SongKeep.isKept(42)).toBe(false);
    expect(SongKeep.statusOf('')).toBe('none');
    expect(SongKeep.statusOf(undefined)).toBe('none');
    expect(SongKeep.objectUrlFor('x')).toBe('');
    expect(SongKeep.objectUrlFor(null)).toBe('');
  });

  it('keep of nothing keepable starts nothing and says nothing', async () => {
    const res = await SongKeep.keep([E1, A3, D1, 'bad'], 'k');
    expect(res).toEqual({ ok: true, text: '' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keep with no list at all starts nothing', async () => {
    expect(await SongKeep.keep(null)).toEqual({ ok: true, text: '' });
    expect(await SongKeep.keep('nope')).toEqual({ ok: true, text: '' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a duplicate id in one keep is fetched once', async () => {
    await SongKeep.keep([A1, A1, A1]);
    await settled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(SongKeep.isKept(A1)).toBe(true);
  });

  it('a browser without the store cannot keep songs, and says so', async () => {
    delete globalThis.OfflineSongsStore;
    expect(SongKeep.availability()).toBe('none');
    const res = await SongKeep.keep([A1], 'k');
    expect(res.text).toBe('This browser cannot keep songs.');
    expect(SongKeep.noteFor('k')).toBe('This browser cannot keep songs.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a browser without crypto.subtle cannot keep songs', async () => {
    vi.stubGlobal('crypto', {});
    try {
      expect(SongKeep.availability()).toBe('none');
      const res = await SongKeep.keep([A1], 'k');
      expect(res.text).toBe('This browser cannot keep songs.');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('an installed app (standalone display) may keep songs even on iOS', () => {
    const orig = window.matchMedia;
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: false });
    window.matchMedia = vi.fn(() => ({ matches: true, media: '(display-mode: standalone)', addEventListener() {}, removeEventListener() {} }));
    try {
      expect(SongKeep.availability()).toBe('ok');
    } finally {
      window.matchMedia = orig;
    }
  });

  it('the stored list may hold junk: bad records are skipped', async () => {
    store.all = vi.fn(async () => [null, { id: 'bad' }, { id: A1, blob: new Blob([bytes(1000)]), bytes: 1000, keptAt: 1 }]);
    await SongKeep.ready();
    expect(SongKeep.isKept(A1)).toBe(true);
    expect(SongKeep.keptIds()).toEqual([A1]);
  });

  it('a stored list that is not a list reads as empty, not an error', async () => {
    store.all = vi.fn(async () => 'junk');
    await SongKeep.ready();
    expect(SongKeep.keptIds()).toEqual([]);
  });

  it('a store with no all() leaves the kept list empty, not an error', async () => {
    globalThis.OfflineSongsStore = { get: async () => null, put: async () => {}, delete: async () => {} };
    await SongKeep.ready();
    expect(SongKeep.isKept(A1)).toBe(false);
    expect(SongKeep.keptIds()).toEqual([]);
  });

  it('a download the server refuses is a network failure, not kept', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, arrayBuffer: async () => bytes(1000).buffer }));
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.isKept(A1)).toBe(false);
    expect(SongKeep.statusOf(A1)).toBe('failed');
    expect(store.map.has(A1)).toBe(false);
  });

  it('a full store fails the keep and stores nothing', async () => {
    const e = new Error('full');
    e.name = 'QuotaExceededError';
    store.put = vi.fn(async () => { throw e; });
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.statusOf(A1)).toBe('failed');
    expect(SongKeep.isKept(A1)).toBe(false);
    expect(store.map.has(A1)).toBe(false);
  });

  it('a store that fails otherwise fails the keep and stores nothing', async () => {
    store.put = vi.fn(async () => { throw new Error('disk gone'); });
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.statusOf(A1)).toBe('failed');
    expect(SongKeep.isKept(A1)).toBe(false);
  });

  it('a read-back that never matches fails after the second try, nothing left stored', async () => {
    store.corruptNextGet = 5;
    await SongKeep.keep([A1]);
    await settled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(SongKeep.statusOf(A1)).toBe('failed');
    expect(store.map.has(A1)).toBe(false);
    expect(lib.kept).toEqual([]);
  });

  it('keeping works with no library bridge: kept, just not listed', async () => {
    delete globalThis.AudioLibraryStore;
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.isKept(A1)).toBe(true);
    await SongKeep.remove([A1]);
    expect(SongKeep.isKept(A1)).toBe(false);
  });

  it('the first keep without storage.persist still keeps', async () => {
    Object.defineProperty(window.navigator, 'storage', { configurable: true, value: { estimate } });
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.isKept(A1)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('bytesOf: the catalog size wins; a kept song the catalog dropped counts its own bytes; unknown counts 0', async () => {
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.bytesOf([A1])).toBe(1000);
    Songs.adoptSongCatalog({ ...SONG_FIXTURE, songs: SONG_FIXTURE.songs.map((s) => ({ ...s, b: s.id === A1 ? 0 : 1000 })) });
    expect(SongKeep.bytesOf([A1])).toBe(1000);   // its own stored bytes, the catalog no longer states a size
    expect(SongKeep.bytesOf([E1])).toBe(0);
    expect(SongKeep.bytesOf([])).toBe(0);
  });

  it('progressOf of no list is all zeros', () => {
    const zero = { total: 0, kept: 0, busy: 0, failed: 0, bytes: 0, needBytes: 0 };
    expect(SongKeep.progressOf(null)).toEqual(zero);
    expect(SongKeep.progressOf('x')).toEqual(zero);
    expect(SongKeep.progressOf([A1, A1, 'bad'])).toMatchObject({ total: 1 });
  });

  it('cancel and remove of no list do nothing', async () => {
    await SongKeep.keep([A1]);
    await settled();
    SongKeep.cancel(null);
    await SongKeep.remove(null);
    await SongKeep.remove([]);
    await SongKeep.remove(['bad']);
    expect(SongKeep.isKept(A1)).toBe(true);
  });

  it('clearNote: a shown note clears with a notify; clearing nothing notifies nobody', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    await SongKeep.keep([A1], 'k');
    expect(SongKeep.noteFor('k')).toBe('Keeping songs needs a connection.');
    let notes = 0;
    SongKeep.subscribe(() => { notes++; });
    SongKeep.clearNote('k');
    expect(SongKeep.noteFor('k')).toBe('');
    expect(notes).toBe(1);
    SongKeep.clearNote('k');
    SongKeep.clearNote('never');
    expect(notes).toBe(1);
  });

  it('releaseObjectUrl with nothing live is a no-op', () => {
    expect(() => SongKeep.releaseObjectUrl()).not.toThrow();
  });

  it('missing() before the stored list loads is empty, then names what is gone; without a library it is empty', async () => {
    lib.kept = [A1];
    expect(SongKeep.missing()).toEqual([]);   // not loaded yet: it asks, and answers nothing
    await SongKeep.ready();
    expect(SongKeep.missing()).toEqual([A1]);
    delete globalThis.AudioLibraryStore;
    expect(SongKeep.missing()).toEqual([]);
  });

  it('objectUrlFor without createObjectURL is empty even for a kept song', async () => {
    await SongKeep.keep([A1]);
    await settled();
    const orig = URL.createObjectURL;
    URL.createObjectURL = undefined;
    try {
      expect(SongKeep.objectUrlFor(A1)).toBe('');
    } finally {
      URL.createObjectURL = orig;
    }
  });

  it('_reset empties everything after a keep', async () => {
    await SongKeep.keep([A1]);
    await settled();
    expect(SongKeep.isKept(A1)).toBe(true);
    SongKeep._reset();
    expect(SongKeep.keptIds()).toEqual([]);
    expect(SongKeep.isKept(A1)).toBe(false);
    expect(SongKeep.waiting()).toBe(false);
  });
});

describe('song-keep in the phone app — the edges', () => {
  const E1 = 'eeeeeeeeeee1';
  let native;
  function bridge() {
    native = { items: [], freeBytes: 5e9, queued: [], active: null };
    const b = {
      offlineAudioState: vi.fn(() => JSON.stringify({
        items: native.items, totalBytes: native.items.reduce((n, i) => n + i.bytes, 0), freeBytes: native.freeBytes,
        active: native.active, queued: native.queued,
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

  it('statusOf a song the catalog does not know is none; waiting asks the phone', async () => {
    bridge();
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    expect(SongKeep.statusOf(E1)).toBe('none');
    expect(SongKeep.waiting()).toBe(false);
  });

  it('cancel of a song not on its way calls no cancel on the phone', async () => {
    const b = bridge();
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    SongKeep.cancel([A1]);
    expect(b.offlineAudioCancel).not.toHaveBeenCalled();
    SongKeep.cancel(null);
    expect(b.offlineAudioCancel).not.toHaveBeenCalled();
  });

  it('remove of a song the phone does not hold removes nothing there', async () => {
    const b = bridge();
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    await SongKeep.remove([A1]);
    expect(b.offlineAudioRemove).not.toHaveBeenCalled();
  });

  it('the phone saying it cannot measure free room does not block a keep', async () => {
    const b = bridge();
    native.freeBytes = -1;
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    const res = await SongKeep.keep([A1], 'k');
    expect(res).toEqual({ ok: true, text: '' });
    expect(b.offlineAudioSave).toHaveBeenCalledTimes(1);
  });

  it('bytesOf counts the phone bytes for a song the catalog dropped', async () => {
    bridge();
    await load();
    Songs.adoptSongCatalog({ ...SONG_FIXTURE, songs: SONG_FIXTURE.songs.map((s) => ({ ...s, b: s.id === A1 ? 0 : 1000 })) });
    native.items = [{ url: SONG_URL(1, A1), key: 'song:' + A1, title: 't', bytes: 1000, savedAt: 5 }];
    send({ type: 'done', url: SONG_URL(1, A1), bytes: 1000 });
    expect(SongKeep.bytesOf([A1])).toBe(1000);
  });

  it('a second wrong size is a failure, not a third try', async () => {
    const b = bridge();
    await load();
    Songs.adoptSongCatalog(smallCatalog());
    SongKeep.subscribe(() => {});
    native.items = [{ url: SONG_URL(1, A1), key: 'song:' + A1, title: 't', bytes: 777, savedAt: 5 }];
    send({ type: 'done', url: SONG_URL(1, A1), bytes: 777 });
    native.items = [];
    send({ type: 'removed', urls: [SONG_URL(1, A1)] });
    expect(b.offlineAudioSave).toHaveBeenCalledTimes(1);   // fetched once more
    native.items = [{ url: SONG_URL(1, A1), key: 'song:' + A1, title: 't', bytes: 888, savedAt: 6 }];
    send({ type: 'done', url: SONG_URL(1, A1), bytes: 888 });
    expect(b.offlineAudioSave).toHaveBeenCalledTimes(1);   // no third try
    native.items = [];   // the phone takes the wrong-sized copy off, as it was told
    send({ type: 'removed', urls: [SONG_URL(1, A1)] });
    expect(SongKeep.statusOf(A1)).toBe('failed');
    expect(lib.kept).toEqual([]);
  });
});
