// @ts-nocheck
/* song-catalog — Songs of the Letters: the trust pattern, the catalog's
   adoption rules, the lookups, and THE queue order (seeded shuffle, one
   version per family). Contract: D:/Swarm/calls/ai-music/catalog-schema.md. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isVotAudioUrl, normalizeAudioTrack, isSongKey, songIdOfKey } from './audio-track.js';
import {
  SONGS_HOST,
  adoptSongCatalog,
  loadSongCatalog,
  familiesFor,
  familyById,
  featuredOf,
  normalizeSongCatalog,
  seededShuffle,
  shuffledFeatured,
  songAlbumLabel,
  songAssetUrl,
  songById,
  songQueue,
  songsForLetter,
  songThumbUrl,
  songTrack,
  versionsOf,
  SongCatalog,
  _resetSongCatalogForTests,
} from './song-catalog.js';
import { SONG_FIXTURE, bigSongCatalog } from './song-catalog.fixture.js';

beforeEach(() => {
  _resetSongCatalogForTests();
});

describe('the song trust boundary — ONE exact pattern, not a prefix', () => {
  const ok = 'https://votreader.github.io/songs-3/3fa9c1d2e4b5.mp3';

  it('accepts exactly a shard mp3 named by a 12-hex id', () => {
    expect(isVotAudioUrl(ok)).toBe(true);
    expect(isVotAudioUrl('https://votreader.github.io/songs-12/000000000000.mp3')).toBe(true);
  });

  it('rejects every near miss', () => {
    for (const bad of [
      'http://votreader.github.io/songs-3/3fa9c1d2e4b5.mp3',               // not https
      'https://votreader.github.io/songs/3fa9c1d2e4b5.mp3',                // the catalog site, not a shard
      'https://votreader.github.io/songs-/3fa9c1d2e4b5.mp3',               // no shard number
      'https://votreader.github.io/songs-3/3FA9C1D2E4B5.mp3',              // upper-case hex is not an id
      'https://votreader.github.io/songs-3/3fa9c1d2e4b.mp3',               // 11 hex
      'https://votreader.github.io/songs-3/3fa9c1d2e4b55.mp3',             // 13 hex
      'https://votreader.github.io/songs-3/3fa9c1d2e4b5.mp3?x=1',          // query
      'https://votreader.github.io/songs-3/3fa9c1d2e4b5.mp3#t',            // fragment
      'https://votreader.github.io/songs-3/../app/3fa9c1d2e4b5.mp3',       // traversal
      'https://votreader.github.io/songs-3/3fa9c1d2e4b5.mp3/../../x.mp3',  // a "prefix" with a tail
      'https://votreader.github.io/songs-3/sub/3fa9c1d2e4b5.mp3',          // a sub-folder
      'https://votreader.github.io/songs-3/3fa9c1d2e4b5.ogg',              // not an mp3
      'https://votreader.github.io.evil.test/songs-3/3fa9c1d2e4b5.mp3',    // look-alike host
      'https://evil.test/https://votreader.github.io/songs-3/3fa9c1d2e4b5.mp3',
      // The Releases fallback was dropped when Pages was chosen (2026-09-24).
      'https://github.com/VOTReader/votreader-songs/releases/download/songs-v1/3fa9c1d2e4b5.mp3',
    ]) {
      expect(isVotAudioUrl(bad), bad).toBe(false);
    }
  });

  it('a stored track with a song URL outside the pattern normalizes to nothing', () => {
    expect(normalizeAudioTrack({ key: 'song:3fa9c1d2e4b5', title: 'x', url: ok })).toMatchObject({ url: ok });
    expect(normalizeAudioTrack({ key: 'song:3fa9c1d2e4b5', title: 'x', url: ok + '?x' })).toBe(null);
  });

  it('a song URL can never carry a letter’s key: the key is derived from the URL', () => {
    expect(normalizeAudioTrack({ key: 'wtlb1:come-love-awaits-you', title: 'x', url: ok }).key).toBe('song:3fa9c1d2e4b5');
    expect(normalizeAudioTrack({ key: null, title: 'x', url: ok }).key).toBe('song:3fa9c1d2e4b5');
  });

  it('song keys are `song:` plus a 12-hex id, nothing else', () => {
    expect(isSongKey('song:3fa9c1d2e4b5')).toBe(true);
    expect(songIdOfKey('song:3fa9c1d2e4b5')).toBe('3fa9c1d2e4b5');
    for (const bad of ['song:', 'song:3FA9C1D2E4B5', 'songs:3fa9c1d2e4b5', 'wtlb1:3fa9c1d2e4b5', null, 42]) {
      expect(isSongKey(bad)).toBe(false);
      expect(songIdOfKey(bad)).toBe('');
    }
  });

  it('songAssetUrl builds the shard URL from { id, sh } and refuses anything else', () => {
    expect(SONGS_HOST.catalogUrl).toBe('https://votreader.github.io/songs/catalog.json');
    expect(songAssetUrl({ id: '3fa9c1d2e4b5', sh: 3 })).toBe(ok);
    expect(songAssetUrl({ id: '3fa9c1d2e4b5', sh: 0 })).toBe('');
    expect(songAssetUrl({ id: '3fa9c1d2e4b5', sh: 1.5 })).toBe('');
    expect(songAssetUrl({ id: '../x', sh: 1 })).toBe('');
    expect(songThumbUrl({ id: '3fa9c1d2e4b5' })).toBe('https://votreader.github.io/songs/thumbs/512/3fa9c1d2e4b5.webp');
    expect(songThumbUrl({ id: '3fa9c1d2e4b5' }, 256)).toBe('https://votreader.github.io/songs/thumbs/256/3fa9c1d2e4b5.webp');
    expect(songThumbUrl({ id: 'nope' })).toBe('');
  });
});

describe('adopting a catalog', () => {
  it('adopts schema 1 and notifies subscribers', () => {
    let calls = 0;
    SongCatalog.subscribe(() => { calls++; });
    expect(SongCatalog.loaded).toBe(false);
    expect(adoptSongCatalog(SONG_FIXTURE)).toBe(true);
    expect(SongCatalog.loaded).toBe(true);
    expect(SongCatalog.catalogVersion()).toBe('2026-09-24.6');
    expect(calls).toBe(1);
    expect(SongCatalog.getVersion()).toBe(1);
  });

  it('REFUSES an unknown schema major and keeps the copy it had', () => {
    adoptSongCatalog(SONG_FIXTURE);
    const before = SongCatalog.getVersion();
    expect(adoptSongCatalog({ ...SONG_FIXTURE, schema: 2, version: 'future' })).toBe(false);
    expect(adoptSongCatalog({ ...SONG_FIXTURE, schema: '2.0', version: 'future' })).toBe(false);
    expect(adoptSongCatalog({ ...SONG_FIXTURE, schema: undefined })).toBe(false);
    expect(SongCatalog.catalogVersion()).toBe('2026-09-24.6');
    expect(SongCatalog.getVersion()).toBe(before);
    // A minor bump within major 1 is still read.
    expect(normalizeSongCatalog({ ...SONG_FIXTURE, schema: '1.3' })).toBeTruthy();
    expect(normalizeSongCatalog({ ...SONG_FIXTURE, schema: 1.3 })).toBeTruthy();
  });

  it('refuses shapes that are not a catalog', () => {
    for (const bad of [null, [], 'x', { schema: 1 }, { schema: 1, songs: [] }, { schema: 1, songs: [{ id: 'nope' }] }]) {
      expect(adoptSongCatalog(bad)).toBe(false);
    }
    expect(SongCatalog.loaded).toBe(false);
  });
});

describe('lookups', () => {
  beforeEach(() => { adoptSongCatalog(SONG_FIXTURE); });

  it('songById resolves hidden rows too (a saved id must still resolve)', () => {
    expect(songById('aaaaaaaaaaa3')).toMatchObject({ hid: true, dup: 'aaaaaaaaaaa2' });
    expect(songById('ffffffffffff')).toBe(null);
  });

  it('versions: featured first, hidden excluded', () => {
    const fam = familyById('fam-a');
    expect(versionsOf(fam).map((s) => s.id)).toEqual(['aaaaaaaaaaa1', 'aaaaaaaaaaa2']);
    expect(featuredOf(fam).id).toBe('aaaaaaaaaaa1');
    // fam-c features c2 although c1 comes first in the file.
    expect(versionsOf(familyById('fam-c')).map((s) => s.id)).toEqual(['ccccccccccc2', 'ccccccccccc1']);
  });

  it('familiesFor filters by collection, style, words and family', () => {
    expect(familiesFor({}).map((f) => f.id)).toEqual(['fam-a', 'fam-b', 'fam-c']);
    expect(familiesFor({ col: 'inspired' }).map((f) => f.id)).toEqual(['fam-b']);
    expect(familiesFor({ style: 'worship' }).map((f) => f.id)).toEqual(['fam-b', 'fam-c']);
    expect(familiesFor({ style: 'spoken' }).map((f) => f.id)).toEqual(['fam-b']);   // a delivery chip
    expect(familiesFor({ q: 'HMARIE' }).map((f) => f.id)).toEqual(['fam-a']);
    expect(familiesFor({ family: 'fam-c' }).map((f) => f.id)).toEqual(['fam-c']);
    expect(familiesFor({ bogus: 'x' }).map((f) => f.id)).toEqual(['fam-a', 'fam-b', 'fam-c']);
  });

  it('songsForLetter shows medium and high confidence only — low is never shown', () => {
    expect(songsForLetter('wtlb1:come-love-awaits-you').map((s) => s.id)).toEqual(['aaaaaaaaaaa1', 'aaaaaaaaaaa2']);
    // ccccccccccc1 names one:the-letter at LOW confidence; only c2 (medium) shows.
    expect(songsForLetter('one:the-letter').map((s) => s.id)).toEqual(['ccccccccccc2']);
    expect(songsForLetter('two:none')).toEqual([]);
  });

  it('album labels: the letter collection, or the shelf name', () => {
    globalThis.COL_BY_KEY = new Map([['wtlb1', { label: 'Words To Live By: Part One' }]]);
    try {
      expect(songAlbumLabel(songById('aaaaaaaaaaa1'))).toBe('Words To Live By: Part One');
      expect(songAlbumLabel(songById('bbbbbbbbbbb1'))).toBe('Inspired by the letters');
      expect(songAlbumLabel(songById('ccccccccccc1'))).toBe('Songs of the Letters');   // 'one' not in this registry
    } finally { delete globalThis.COL_BY_KEY; }
  });

  it('songTrack is a plain six-field Track under a song: key', () => {
    expect(songTrack(songById('aaaaaaaaaaa1'))).toEqual({
      key: 'song:aaaaaaaaaaa1', title: 'Come, Love Awaits You', sub: 'Songs of the Letters',
      url: 'https://votreader.github.io/songs-1/aaaaaaaaaaa1.mp3', readerCode: '', partLabel: 'Country · hmarie777',
    });
    expect(songTrack(songById('ddddddddddd1'))).toBe(null);   // sh 0: no playable URL
  });
});

describe('order — the seeded shuffle and songQueue', () => {
  it('seededShuffle is a permutation, reproducible by seed', () => {
    const list = Array.from({ length: 50 }, (_u, i) => i);
    const a = seededShuffle(list, 42);
    expect(a.slice().sort((x, y) => x - y)).toEqual(list);
    expect(seededShuffle(list, 42)).toEqual(a);
    expect(seededShuffle(list, 43)).not.toEqual(a);
    expect(list[0]).toBe(0);   // the input is untouched
  });

  it('shuffle plays ONE version per family — the featured one, unless a filter needs another', () => {
    adoptSongCatalog(SONG_FIXTURE);
    const all = shuffledFeatured({}, 7).map((s) => s.id).sort();
    expect(all).toEqual(['aaaaaaaaaaa1', 'bbbbbbbbbbb1', 'ccccccccccc2']);
    // Worship: fam-c's featured version is rock, so its worship take stands in.
    expect(shuffledFeatured({ style: 'worship' }, 7).map((s) => s.id).sort()).toEqual(['bbbbbbbbbbb1', 'ccccccccccc1']);
  });

  it('a 900-family shuffle holds 900 different songs', () => {
    adoptSongCatalog(bigSongCatalog(900));
    const order = shuffledFeatured({}, 99);
    expect(order).toHaveLength(900);
    expect(new Set(order.map((s) => s.f)).size).toBe(900);
  });

  it('songQueue: plain lists are forward-only from the start; shuffled ones open on it', () => {
    adoptSongCatalog(SONG_FIXTURE);
    expect(songQueue({ filter: {} }).map((s) => s.id))
      .toEqual(['aaaaaaaaaaa1', 'aaaaaaaaaaa2', 'bbbbbbbbbbb1', 'ccccccccccc2', 'ccccccccccc1']);
    expect(songQueue({ filter: {}, startKey: 'song:bbbbbbbbbbb1' }).map((s) => s.id))
      .toEqual(['bbbbbbbbbbb1', 'ccccccccccc2', 'ccccccccccc1']);
    // One version per family: the chosen take fills its family's slot.
    const one = songQueue({ filter: {}, one: true, shuffle: true, seed: 3, startKey: 'song:aaaaaaaaaaa2' }).map((s) => s.id);
    expect(one[0]).toBe('aaaaaaaaaaa2');
    expect(one).not.toContain('aaaaaaaaaaa1');
    expect(one).toHaveLength(3);
    expect(songQueue({ filter: {}, one: true, startKey: 'song:ccccccccccc1' }).map((s) => s.id))
      .toEqual(['ccccccccccc1']);                     // plain: forward-only from fam-c's slot, take 1 in it
    // Shuffle REORDERS: the same five songs as the plain list, the chosen one first.
    const all = songQueue({ filter: {}, shuffle: true, seed: 3, startKey: 'song:aaaaaaaaaaa2' }).map((s) => s.id);
    expect(all[0]).toBe('aaaaaaaaaaa2');
    expect(all.slice().sort()).toEqual(['aaaaaaaaaaa1', 'aaaaaaaaaaa2', 'bbbbbbbbbbb1', 'ccccccccccc1', 'ccccccccccc2']);
    // Explicit ids keep their order; hidden and unknown ids drop out.
    expect(songQueue({ ids: ['ccccccccccc1', 'aaaaaaaaaaa3', 'ffffffffffff', 'bbbbbbbbbbb1'] }).map((s) => s.id))
      .toEqual(['ccccccccccc1', 'bbbbbbbbbbb1']);
  });
});

describe('the loader — network first, the last good copy kept (landing B)', () => {
  /** A fake IDBAdapter holding the last good copy in `meta`. */
  function fakeIdb(initial) {
    const map = new Map();
    if (initial) map.set('meta/songs-catalog', initial);
    return {
      map,
      get: vi.fn(async (store, key) => map.get(store + '/' + key)),
      put: vi.fn(async (store, key, value) => { map.set(store + '/' + key, value); }),
    };
  }
  const ok = (body) => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
  const v2 = { ...SONG_FIXTURE, version: '2026-09-25.6' };

  afterEach(() => {
    delete globalThis.IDBAdapter;
    delete globalThis.fetch;
    vi.useRealTimers();
  });

  it('fetches the published catalog URL, adopts it and keeps it as the last good copy', async () => {
    const idb = fakeIdb(SONG_FIXTURE);
    globalThis.IDBAdapter = idb;
    globalThis.fetch = vi.fn(() => ok(v2));
    let notified = 0;
    SongCatalog.subscribe(() => { notified++; });
    const p = loadSongCatalog();
    expect(notified).toBe(0);                                  // async-notify-only: nothing synchronous
    expect(await p).toBe(true);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://votreader.github.io/songs/catalog.json');
    expect(globalThis.fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-cache', credentials: 'omit' });
    expect(SongCatalog.catalogVersion()).toBe('2026-09-25.6');   // the network wins over the stored copy
    expect(idb.put).toHaveBeenCalledWith('meta', 'songs-catalog', v2);
    expect(await loadSongCatalog()).toBe(true);                 // once per launch: no second fetch
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('offline: the last good copy is adopted', async () => {
    globalThis.IDBAdapter = fakeIdb(SONG_FIXTURE);
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await loadSongCatalog()).toBe(true);
    expect(SongCatalog.loaded).toBe(true);
    expect(SongCatalog.error).toBe(false);
    expect(SongCatalog.catalogVersion()).toBe('2026-09-24.6');
    expect(songById('aaaaaaaaaaa1')).toBeTruthy();
  });

  it('a 404 or a non-JSON body also falls back to the last good copy', async () => {
    globalThis.IDBAdapter = fakeIdb(SONG_FIXTURE);
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }));
    expect(await loadSongCatalog()).toBe(true);
    _resetSongCatalogForTests();
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, text: async () => '<html>portal</html>', json: async () => { throw new SyntaxError('bad'); } }));
    expect(await loadSongCatalog()).toBe(true);
    expect(SongCatalog.catalogVersion()).toBe('2026-09-24.6');
  });

  it('an unknown schema major from the network is REFUSED: the old copy stays, and is not overwritten', async () => {
    const idb = fakeIdb(SONG_FIXTURE);
    globalThis.IDBAdapter = idb;
    globalThis.fetch = vi.fn(() => ok({ ...SONG_FIXTURE, schema: 2, version: 'from-the-future' }));
    expect(await loadSongCatalog()).toBe(true);
    expect(SongCatalog.catalogVersion()).toBe('2026-09-24.6');
    expect(idb.put).not.toHaveBeenCalled();
    expect(idb.map.get('meta/songs-catalog')).toBe(SONG_FIXTURE);
  });

  it('nothing anywhere: not loaded, error set — and the next ask tries again', async () => {
    globalThis.IDBAdapter = fakeIdb(null);
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    expect(await loadSongCatalog()).toBe(false);
    expect(SongCatalog.loaded).toBe(false);
    expect(SongCatalog.error).toBe(true);
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    expect(await loadSongCatalog()).toBe(true);
    expect(SongCatalog.error).toBe(false);
  });

  it('a stored copy of an unknown schema is not adopted either', async () => {
    globalThis.IDBAdapter = fakeIdb({ ...SONG_FIXTURE, schema: 9 });
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    expect(await loadSongCatalog()).toBe(false);
  });
});

/* n3-06 (sweep 2): a takedown or a new song reached a reader only on a later
   cold launch, and never in an APK process left running for days (the loader
   fetched once per process). Now the catalog is checked again when the app
   comes back into view, when the link returns, or when a screen asks for it,
   at most once per SONG_CATALOG_RECHECK_MS. */
describe('the loader — re-checked when the reader comes back (n3-06)', () => {
  const ok = (body) => Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
  const T0 = new Date('2026-09-25T12:00:00Z');
  const firstSong = SONG_FIXTURE.songs[0].id;
  /** The fixture with its first song taken down (the publisher's `hid` flag), stamped anew. */
  const takenDown = {
    ...SONG_FIXTURE,
    version: '2026-09-25.7',
    songs: SONG_FIXTURE.songs.map((s, i) => (i === 0 ? { ...s, hid: true } : s)),
  };
  let hidden = false;
  let made = false;
  function setHidden(v) {
    hidden = v;
    document.dispatchEvent(new Event('visibilitychange'));
  }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(T0);
    hidden = false;
    // Under jsdom (the repo-root run) the real document and window; under node
    // (this folder's own config) bare event targets in their place.
    made = typeof document === 'undefined';
    if (made) {
      globalThis.document = new EventTarget();
      globalThis.window = new EventTarget();
    }
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    globalThis.IDBAdapter = { get: vi.fn(async () => null), put: vi.fn(async () => {}) };
  });
  afterEach(() => {
    delete globalThis.IDBAdapter;
    delete globalThis.fetch;
    _resetSongCatalogForTests();   // drops the listeners before the targets go
    delete document.visibilityState;   // jsdom's own getter (on the prototype) answers again
    if (made) {
      delete globalThis.document;
      delete globalThis.window;
    }
    vi.useRealTimers();
  });

  it('coming back after the interval fetches again and adopts a takedown', async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    expect(await loadSongCatalog()).toBe(true);
    expect(songById(firstSong).hid).toBe(false);
    globalThis.fetch = vi.fn(() => ok(takenDown));
    setHidden(true);
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(false);
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(SongCatalog.catalogVersion()).toBe('2026-09-25.7');
    expect(songById(firstSong).hid).toBe(true);
    expect(globalThis.IDBAdapter.put).toHaveBeenLastCalledWith('meta', 'songs-catalog', takenDown);
  });

  it('coming back within the interval does not fetch', async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    await loadSongCatalog();
    setHidden(true);
    vi.setSystemTime(new Date(T0.getTime() + 5 * 60 * 1000));
    setHidden(false);
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('the same bytes again: no redraw, no rewrite of the last good copy', async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    await loadSongCatalog();
    const v = SongCatalog.getVersion();
    const puts = globalThis.IDBAdapter.put.mock.calls.length;
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(true); setHidden(false);
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(SongCatalog.getVersion()).toBe(v);
    expect(globalThis.IDBAdapter.put.mock.calls.length).toBe(puts);
  });

  it('a failed re-check keeps the catalog as it was (no error, no empty shelf), and tries again next time', async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    await loadSongCatalog();
    const v = SongCatalog.getVersion();
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(true); setHidden(false);
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(SongCatalog.loaded).toBe(true);
    expect(SongCatalog.error).toBe(false);
    expect(SongCatalog.getVersion()).toBe(v);
    // The link comes back: the 'online' event re-checks without waiting another interval.
    globalThis.fetch = vi.fn(() => ok(takenDown));
    vi.setSystemTime(new Date(T0.getTime() + 32 * 60 * 1000));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(SongCatalog.catalogVersion()).toBe('2026-09-25.7');
  });

  it('a hidden page never fetches; a screen asking load() again after the interval re-checks in the background', async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    await loadSongCatalog();
    globalThis.fetch = vi.fn(() => ok(takenDown));
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(true);
    await flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    hidden = false;   // an APK left in the foreground: no visibility event at all
    expect(await loadSongCatalog()).toBe(true);   // answers at once from memory
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(SongCatalog.catalogVersion()).toBe('2026-09-25.7');
  });

  it("the service worker's marked copy is no fresh answer: the link coming back asks again at once", async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    await loadSongCatalog();
    // Offline PWA: the worker answers 200 with its copy, marked.
    const marked = { ok: true, status: 200, headers: new Headers({ 'X-VOT-Fallback': '1' }), text: async () => JSON.stringify(SONG_FIXTURE) };
    globalThis.fetch = vi.fn(() => Promise.resolve(marked));
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(true); setHidden(false);
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    globalThis.fetch = vi.fn(() => ok(takenDown));
    vi.setSystemTime(new Date(T0.getTime() + 31.5 * 60 * 1000));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(SongCatalog.catalogVersion()).toBe('2026-09-25.7');
  });

  it('after a check with no fresh answer, coming back a minute later asks again (no 30 min wait)', async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    await loadSongCatalog();
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(true); setHidden(false);
    await flush();
    vi.setSystemTime(new Date(T0.getTime() + 31.5 * 60 * 1000));
    setHidden(true); setHidden(false);
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);   // under a minute: no storm
    globalThis.fetch = vi.fn(() => ok(takenDown));
    vi.setSystemTime(new Date(T0.getTime() + 32.1 * 60 * 1000));
    setHidden(true); setHidden(false);
    await flush();
    expect(SongCatalog.catalogVersion()).toBe('2026-09-25.7');
  });

  it('an OLDER catalog (a CDN edge, a stale copy) never replaces the one loaded: a takedown stays', async () => {
    globalThis.fetch = vi.fn(() => ok({ ...takenDown, generated: '2026-09-25T10:00:00-06:00' }));
    await loadSongCatalog();
    expect(songById(firstSong).hid).toBe(true);
    const puts = globalThis.IDBAdapter.put.mock.calls.length;
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));   // generated 2026-09-24T23:40:00-06:00
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(true); setHidden(false);
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(songById(firstSong).hid).toBe(true);
    expect(globalThis.IDBAdapter.put.mock.calls.length).toBe(puts);
  });

  it('a launch that found no catalog anywhere loads when the link comes back', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    expect(await loadSongCatalog()).toBe(false);
    expect(SongCatalog.error).toBe(true);
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(SongCatalog.loaded).toBe(true);
    expect(SongCatalog.error).toBe(false);
  });

  it('two triggers at once share one request', async () => {
    globalThis.fetch = vi.fn(() => ok(SONG_FIXTURE));
    await loadSongCatalog();
    let release;
    globalThis.fetch = vi.fn(() => new Promise((r) => { release = r; }));
    vi.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    setHidden(true); setHidden(false);
    window.dispatchEvent(new Event('online'));
    void loadSongCatalog();
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    release({ ok: true, status: 200, text: async () => JSON.stringify(takenDown) });
    await flush();
    expect(SongCatalog.catalogVersion()).toBe('2026-09-25.7');
  });
});
