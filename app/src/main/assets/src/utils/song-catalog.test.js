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
    const shuffled = songQueue({ filter: {}, shuffle: true, seed: 3, startKey: 'song:aaaaaaaaaaa2' }).map((s) => s.id);
    expect(shuffled[0]).toBe('aaaaaaaaaaa2');
    expect(shuffled).not.toContain('aaaaaaaaaaa1');   // one version of fam-a, the chosen one
    expect(shuffled).toHaveLength(3);
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
  const ok = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
  const v2 = { ...SONG_FIXTURE, version: '2026-09-25.6' };

  afterEach(() => {
    delete globalThis.IDBAdapter;
    delete globalThis.fetch;
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
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }));
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
