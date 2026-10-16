/* AudioLibraryStore — Listening Library metadata and import hardening. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioLibraryStore,
  MAX_RECENT_AUDIO_TRACKS,
  MAX_KEPT_SONGS,
  MAX_RECENT_SONGS,
  MAX_SAVED_AUDIO_TRACKS,
  MAX_SAVED_SONGS,
  normalizeAudioLibrary,
} from './audio-library-store.js';
import { AUDIO_RELEASE_PREFIX } from '../utils/audio-track.js';
import { IDBAdapter } from './idb-adapter.js';

/** @param {number} id */
function track(id) {
  return {
    key: 'one:letter-' + id,
    title: 'Letter ' + id,
    sub: 'Volume One',
    url: AUDIO_RELEASE_PREFIX + 'track_' + id + '.mp3',
    readerCode: 'B',
    partLabel: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  AudioLibraryStore._resetForTests({ forceLoaded: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('AudioLibraryStore — normalized metadata', () => {
  it('starts with a conservative empty library and normal playback speed', () => {
    expect(AudioLibraryStore.get()).toEqual({ v: 1, saved: [], recent: [], rate: 1, plays: 0, completions: 0, songSaved: [], songRecent: [], songKept: [] });
  });

  it('recordPlayed keeps the recent shelf without crediting a lifetime play', () => {
    AudioLibraryStore.recordPlayed(track(1));
    AudioLibraryStore.recordPlayed(track(1));
    AudioLibraryStore.recordPlayed(track(2));
    expect(AudioLibraryStore.recent()).toHaveLength(2);   // history dedupes
    // The player starts a track on every auto-advance; only the tap counts.
    expect(AudioLibraryStore.getPlays()).toBe(0);
  });

  it('countPlay counts one play at a time and stays bounded', () => {
    expect(AudioLibraryStore.countPlay()).toBe(1);
    AudioLibraryStore.countPlay();
    AudioLibraryStore.countPlay();
    expect(AudioLibraryStore.getPlays()).toBe(3);

    AudioLibraryStore.replaceAll({ plays: 10000000 });
    expect(AudioLibraryStore.countPlay()).toBe(10000000);
  });

  it('counts completions separately from plays, and stays bounded', () => {
    AudioLibraryStore.countPlay();
    expect(AudioLibraryStore.getCompletions()).toBe(0);   // started ≠ finished

    expect(AudioLibraryStore.countCompletion()).toBe(1);
    AudioLibraryStore.countCompletion();
    expect(AudioLibraryStore.getCompletions()).toBe(2);
    expect(AudioLibraryStore.getPlays()).toBe(1);         // untouched by the above

    AudioLibraryStore.replaceAll({ completions: 10000000 });
    expect(AudioLibraryStore.countCompletion()).toBe(10000000);
  });

  it('saves once by release URL, then toggles that save off', () => {
    const first = track(1);
    expect(AudioLibraryStore.toggleSaved(first)).toBe(true);
    expect(AudioLibraryStore.isSaved(first)).toBe(true);
    expect(AudioLibraryStore.saved()).toMatchObject([{ title: 'Letter 1', savedAt: Date.now() }]);

    expect(AudioLibraryStore.toggleSaved({ ...first, title: 'Corrected title' })).toBe(false);
    expect(AudioLibraryStore.saved()).toEqual([]);
  });

  it('moves repeat playback to the top instead of duplicating history', () => {
    const first = track(1);
    const second = track(2);
    AudioLibraryStore.recordPlayed(first);
    vi.advanceTimersByTime(1000);
    AudioLibraryStore.recordPlayed(second);
    vi.advanceTimersByTime(1000);
    AudioLibraryStore.recordPlayed(first);

    const recent = AudioLibraryStore.recent();
    expect(recent).toHaveLength(2);
    expect(recent.map((item) => item.url)).toEqual([first.url, second.url]);
    expect(recent[0].playedAt).toBe(Date.now());
  });

  it('persists any 1 % rate in 0.50-3.00 and clamps the rest', () => {
    expect(AudioLibraryStore.setPlaybackRate(1.5)).toBe(1.5);
    expect(AudioLibraryStore.getPlaybackRate()).toBe(1.5);
    // Corbin 2026-09-21: speed is continuous in 1 % steps, not quarter jumps.
    expect(AudioLibraryStore.setPlaybackRate(1.37)).toBe(1.37);
    expect(AudioLibraryStore.getPlaybackRate()).toBe(1.37);
    expect(AudioLibraryStore.setPlaybackRate(1.2500000001)).toBe(1.25);  // float noise still lands on the step
    expect(AudioLibraryStore.setPlaybackRate(0.2)).toBe(0.5);            // below the floor
    expect(AudioLibraryStore.setPlaybackRate(9)).toBe(3);                // above the ceiling (Chromium throws past 16)
    expect(AudioLibraryStore.setPlaybackRate('fast')).toBe(1);           // garbage = normal
    expect(AudioLibraryStore.setPlaybackRate(0.75)).toBe(0.75);          // an old preset migrates unchanged
  });

  it('removeRecent drops exactly one row, by its immutable release URL', () => {
    AudioLibraryStore.recordPlayed(track(1));
    AudioLibraryStore.recordPlayed(track(2));
    AudioLibraryStore.toggleSaved(track(1));

    expect(AudioLibraryStore.removeRecent(track(1).url)).toBe(true);
    expect(AudioLibraryStore.recent().map((item) => item.url)).toEqual([track(2).url]);
    // A saved copy of the same recording is a different shelf and survives.
    expect(AudioLibraryStore.isSaved(track(1))).toBe(true);

    // Nothing to remove, and nothing that could name an arbitrary URL.
    expect(AudioLibraryStore.removeRecent(track(1).url)).toBe(false);
    expect(AudioLibraryStore.removeRecent('')).toBe(false);
    expect(AudioLibraryStore.removeRecent(null)).toBe(false);
    expect(AudioLibraryStore.recent()).toHaveLength(1);
  });

  it('restoreRecent puts removed rows back by their play time (v2 Recent\'s Undo, rv5); a row played again since wins', () => {
    AudioLibraryStore.recordPlayed(track(1));
    vi.advanceTimersByTime(60000);
    AudioLibraryStore.recordPlayed(track(2));
    vi.advanceTimersByTime(60000);
    AudioLibraryStore.recordPlayed(track(3));
    const rows = AudioLibraryStore.recent().filter((item) => item.url !== track(3).url);
    rows.forEach((item) => AudioLibraryStore.removeRecent(item.url));
    expect(AudioLibraryStore.recent().map((item) => item.title)).toEqual(['Letter 3']);

    AudioLibraryStore.restoreRecent(rows);
    expect(AudioLibraryStore.recent().map((item) => item.title)).toEqual(['Letter 3', 'Letter 2', 'Letter 1']);
    expect(AudioLibraryStore.recent()[2].playedAt).toBe(rows[1].playedAt);

    AudioLibraryStore.clearRecent();
    vi.advanceTimersByTime(60000);
    AudioLibraryStore.recordPlayed(track(2));   // played again after the clear
    const newer = AudioLibraryStore.recent()[0].playedAt;
    AudioLibraryStore.restoreRecent(rows.concat(/** @type {any[]} */ ([null, { url: '' }])));
    expect(AudioLibraryStore.recent().map((item) => [item.title, item.playedAt === newer])).toEqual([
      ['Letter 2', true], ['Letter 1', false],
    ]);
  });

  it('clearRecent leaves saved recordings and speed intact', () => {
    AudioLibraryStore.toggleSaved(track(1));
    AudioLibraryStore.recordPlayed(track(2));
    AudioLibraryStore.setPlaybackRate(1.25);
    AudioLibraryStore.clearRecent();

    expect(AudioLibraryStore.recent()).toEqual([]);
    expect(AudioLibraryStore.saved()).toHaveLength(1);
    expect(AudioLibraryStore.getPlaybackRate()).toBe(1.25);
  });
});

describe('normalizeAudioLibrary — import boundary', () => {
  it('drops arbitrary remote URLs before they reach the player', () => {
    const data = normalizeAudioLibrary({
      saved: [{ ...track(1), url: 'https://example.test/untrusted.mp3', savedAt: 20 }],
      recent: [{ ...track(2), url: 'javascript:alert(1)', playedAt: 30 }],
      rate: 2,
    });
    expect(data).toEqual({ v: 1, saved: [], recent: [], rate: 2, plays: 0, completions: 0, songSaved: [], songRecent: [], songKept: [] });
  });

  it('bounds an imported plays counter', () => {
    expect(normalizeAudioLibrary({ plays: 41 }).plays).toBe(41);
    expect(normalizeAudioLibrary({ plays: -3 }).plays).toBe(0);
    expect(normalizeAudioLibrary({ plays: 'lots' }).plays).toBe(0);
    expect(normalizeAudioLibrary({ plays: 99999999999 }).plays).toBe(10000000);
  });

  it('bounds an imported completions counter the same way', () => {
    expect(normalizeAudioLibrary({ completions: 12 }).completions).toBe(12);
    expect(normalizeAudioLibrary({ completions: -3 }).completions).toBe(0);
    expect(normalizeAudioLibrary({ completions: 'many' }).completions).toBe(0);
    expect(normalizeAudioLibrary({ completions: 99999999999 }).completions).toBe(10000000);
  });

  it('never infers completions from the recent shelf', () => {
    // A started recording is not a finished one — plays may take the shelf as
    // a lower bound; completions has no such evidence and must stay at zero.
    const legacy = normalizeAudioLibrary({
      recent: [{ ...track(1), playedAt: 11 }, { ...track(2), playedAt: 10 }],
    });
    expect(legacy.plays).toBe(2);
    expect(legacy.completions).toBe(0);
  });

  it('keeps a conservative listening lower bound for pre-counter libraries', () => {
    const legacy = normalizeAudioLibrary({
      recent: [
        { ...track(1), playedAt: 11 },
        { ...track(2), playedAt: 10 },
      ],
    });
    expect(legacy.plays).toBe(2);
    expect(normalizeAudioLibrary({ ...legacy, plays: 0 }).plays).toBe(0);
  });

  it('deduplicates by immutable URL, sorts newest first, and bounds imported lists', () => {
    const saved = Array.from({ length: MAX_SAVED_AUDIO_TRACKS + 4 }, (_unused, i) => ({ ...track(i), savedAt: i }));
    const recent = Array.from({ length: MAX_RECENT_AUDIO_TRACKS + 4 }, (_unused, i) => ({ ...track(i + 200), playedAt: i }));
    saved.push({ ...track(1), title: 'Duplicate', savedAt: 9999 });
    recent.push({ ...track(201), title: 'Duplicate', playedAt: 9999 });

    const data = normalizeAudioLibrary({ saved, recent, rate: 1.25000001 });
    expect(data.saved).toHaveLength(MAX_SAVED_AUDIO_TRACKS);
    expect(data.recent).toHaveLength(MAX_RECENT_AUDIO_TRACKS);
    expect(data.saved[0].savedAt).toBe(9999);
    expect(data.recent[0].playedAt).toBe(9999);
    expect(data.rate).toBe(1.25);
  });

  it('replaceAll accepts only the normalized durable shape', () => {
    AudioLibraryStore.replaceAll({
      saved: [{ ...track(3), savedAt: 42 }, { ...track(4), url: 'https://not-vot.invalid/a.mp3', savedAt: 99 }],
      recent: [{ ...track(5), playedAt: 73 }],
      rate: 0.75,
    });
    expect(AudioLibraryStore.get()).toMatchObject({
      v: 1,
      saved: [{ url: track(3).url, savedAt: 42 }],
      recent: [{ url: track(5).url, playedAt: 73 }],
      rate: 0.75,
    });
  });
});

describe('AudioLibraryStore — Songs of the Letters shelves (2026-09-24)', () => {
  const sid = (n) => n.toString(16).padStart(12, '0');

  it('saves songs by id, newest first, and toggles a save off', () => {
    expect(AudioLibraryStore.toggleSongSaved(sid(1))).toBe(true);
    expect(AudioLibraryStore.toggleSongSaved(sid(2))).toBe(true);
    expect(AudioLibraryStore.songSaved()).toEqual([sid(2), sid(1)]);
    expect(AudioLibraryStore.isSongSaved(sid(1))).toBe(true);
    expect(AudioLibraryStore.toggleSongSaved(sid(1))).toBe(false);
    expect(AudioLibraryStore.songSaved()).toEqual([sid(2)]);
    // Not a song id: refused, nothing stored.
    expect(AudioLibraryStore.toggleSongSaved('https://example.test/a.mp3')).toBe(false);
    expect(AudioLibraryStore.songSaved()).toEqual([sid(2)]);
  });

  it('records played songs on their OWN shelf — never the recordings shelf, never a lifetime play', () => {
    AudioLibraryStore.recordSongPlayed(sid(1));
    AudioLibraryStore.recordSongPlayed(sid(2));
    AudioLibraryStore.recordSongPlayed(sid(1));   // a repeat moves forward, no duplicate row
    expect(AudioLibraryStore.songRecent()).toEqual([sid(1), sid(2)]);
    expect(AudioLibraryStore.recent()).toEqual([]);
    expect(AudioLibraryStore.getPlays()).toBe(0);
    expect(AudioLibraryStore.removeSongRecent(sid(2))).toBe(true);
    expect(AudioLibraryStore.removeSongRecent(sid(2))).toBe(false);
    expect(AudioLibraryStore.songRecent()).toEqual([sid(1)]);
  });

  it('bounds both shelves (500 saved, 30 recent)', () => {
    for (let i = 0; i < MAX_RECENT_SONGS + 5; i++) AudioLibraryStore.recordSongPlayed(sid(i + 1));
    expect(AudioLibraryStore.songRecent()).toHaveLength(MAX_RECENT_SONGS);
    expect(AudioLibraryStore.songRecent()[0]).toBe(sid(MAX_RECENT_SONGS + 5));
    const many = Array.from({ length: MAX_SAVED_SONGS + 20 }, (_u, i) => sid(i + 1));
    expect(normalizeAudioLibrary({ songSaved: many }).songSaved).toHaveLength(MAX_SAVED_SONGS);
  });

  it('normalizes imported song lists: ids only, deduplicated, newest occurrence kept', () => {
    const data = normalizeAudioLibrary({
      songSaved: [sid(3), 'not-an-id', sid(3), 42, 'ABCDEF123456', sid(4)],
      songRecent: 'nope',
    });
    expect(data.songSaved).toEqual([sid(3), sid(4)]);   // upper-case hex is not a catalog id
    expect(data.songRecent).toEqual([]);
    // An older record without the fields reads as empty shelves (additive to v1).
    expect(normalizeAudioLibrary({ saved: [] })).toMatchObject({ songSaved: [], songRecent: [] });
  });

  it('keeps the list of songs kept on this phone (K1): newest first, off removes, ids only, bounded', () => {
    AudioLibraryStore.setSongsKept([sid(1), sid(2)], true);
    AudioLibraryStore.setSongsKept([sid(3)], true);
    expect(AudioLibraryStore.songKept()).toEqual([sid(3), sid(1), sid(2)]);
    AudioLibraryStore.setSongsKept([sid(1), 'nope'], false);
    expect(AudioLibraryStore.songKept()).toEqual([sid(3), sid(2)]);
    AudioLibraryStore.setSongsKept([sid(2)], true);   // kept again: to the top, once
    expect(AudioLibraryStore.songKept()).toEqual([sid(2), sid(3)]);
    const many = Array.from({ length: MAX_KEPT_SONGS + 3 }, (_u, i) => sid(i + 1));
    expect(normalizeAudioLibrary({ songKept: many }).songKept).toHaveLength(MAX_KEPT_SONGS);
    expect(normalizeAudioLibrary({ songKept: [sid(4), 'x', sid(4)] }).songKept).toEqual([sid(4)]);
    // The list rides the backup: replaceAll restores it.
    AudioLibraryStore.replaceAll({ songKept: [sid(9)] });
    expect(AudioLibraryStore.songKept()).toEqual([sid(9)]);
  });

  it('a song TRACK stars and plays onto the songs shelves, never the recordings ones', () => {
    const song = { key: 'song:' + sid(7), title: 'A Song', sub: null, url: 'https://votreader.github.io/songs-1/' + sid(7) + '.mp3', readerCode: '', partLabel: 'Pop' };
    expect(AudioLibraryStore.toggleSaved(song)).toBe(true);
    expect(AudioLibraryStore.isSaved(song)).toBe(true);
    expect(AudioLibraryStore.songSaved()).toEqual([sid(7)]);
    expect(AudioLibraryStore.saved()).toEqual([]);
    AudioLibraryStore.recordPlayed(song);
    expect(AudioLibraryStore.songRecent()).toEqual([sid(7)]);
    expect(AudioLibraryStore.recent()).toEqual([]);
    expect(AudioLibraryStore.toggleSaved(song)).toBe(false);
    expect(AudioLibraryStore.songSaved()).toEqual([]);
  });

  it('carries the song shelves through replaceAll (the backup/import path)', () => {
    AudioLibraryStore.replaceAll({ songSaved: [sid(9)], songRecent: [sid(8), sid(9)] });
    expect(AudioLibraryStore.songSaved()).toEqual([sid(9)]);
    expect(AudioLibraryStore.songRecent()).toEqual([sid(8), sid(9)]);
  });
});

/* sweep v018: before the library has loaded (IndexedDB slow, store 'degraded'),
   every star reads empty, because the overlay starts from defaults. A tap there
   means "save this", and it must still mean that once the real library lands:
   the queued op has to SET the starred state, not flip it again on real data,
   where it would take a recording or song the reader had already saved OFF. */
describe('AudioLibraryStore — a star tapped before the library has loaded (sweep v018)', () => {
  const sid = (n) => n.toString(16).padStart(12, '0');
  const song = (n) => ({ key: 'song:' + sid(n), title: 'Song ' + n, sub: null, url: 'https://votreader.github.io/songs-1/' + sid(n) + '.mp3', readerCode: '', partLabel: 'Pop' });

  /** @type {any} */ let putSpy;

  /** Boot the store into 'degraded' with IndexedDB's answer held back.
   *  @returns {Promise<(data: any) => Promise<void>>} lands the given record */
  async function degradedBoot() {
    /** @type {(v: any) => void} */ let answer = () => {};
    vi.spyOn(IDBAdapter, 'get').mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    putSpy = vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    AudioLibraryStore._resetForTests();
    const hydrated = AudioLibraryStore._hydrate();
    await vi.advanceTimersByTimeAsync(3000);
    await hydrated;
    expect(AudioLibraryStore.getState()).toBe('degraded');
    return async (data) => { answer(data); await vi.advanceTimersByTimeAsync(0); };
  }

  /** The record the rebase wrote to IndexedDB. */
  const persisted = () => putSpy.mock.calls.filter((c) => c[0] === 'vot-audio-library').pop()[2];

  afterEach(() => vi.restoreAllMocks());

  it('a saved recording starred again while degraded stays saved', async () => {
    const land = await degradedBoot();
    expect(AudioLibraryStore.isSaved(track(1))).toBe(false);   // the empty star the reader sees
    expect(AudioLibraryStore.toggleSaved(track(1))).toBe(true);
    await land({ v: 1, saved: [{ ...track(1), savedAt: 111 }], recent: [], rate: 1, plays: 0, completions: 0 });
    expect(AudioLibraryStore.getState()).toBe('loaded');
    expect(AudioLibraryStore.isSaved(track(1))).toBe(true);
    expect(AudioLibraryStore.saved().map((t) => [t.url, t.savedAt])).toEqual([[track(1).url, 111]]);
    expect(persisted().saved.map((t) => t.url)).toEqual([track(1).url]);
  });

  it('a saved song starred again while degraded stays saved (song id and song track)', async () => {
    const land = await degradedBoot();
    expect(AudioLibraryStore.isSongSaved(sid(5))).toBe(false);
    expect(AudioLibraryStore.toggleSongSaved(sid(5))).toBe(true);
    expect(AudioLibraryStore.isSaved(song(6))).toBe(false);
    expect(AudioLibraryStore.toggleSaved(song(6))).toBe(true);
    await land({ v: 1, saved: [], recent: [], songSaved: [sid(6), sid(5)] });
    expect(AudioLibraryStore.songSaved()).toEqual([sid(6), sid(5)]);
    expect(persisted().songSaved).toEqual([sid(6), sid(5)]);
  });

  it('the last state the reader saw is the one that lands', async () => {
    const land = await degradedBoot();
    AudioLibraryStore.toggleSaved(track(2));   // starred ...
    AudioLibraryStore.toggleSaved(track(2));   // ... and un-starred again
    AudioLibraryStore.toggleSaved(track(3));   // starred, and not saved before
    AudioLibraryStore.toggleSongSaved(sid(7));
    AudioLibraryStore.toggleSongSaved(sid(7));
    await land({ v: 1, saved: [{ ...track(2), savedAt: 5 }], recent: [], songSaved: [sid(7)] });
    expect(AudioLibraryStore.saved().map((t) => t.url)).toEqual([track(3).url]);
    expect(AudioLibraryStore.songSaved()).toEqual([]);
  });
});

/* sweep v019: a Listening Library or Songs screen reads the store once per row
   (isSaved for each star). Each read re-normalized the whole library, and the
   kept-song ids were deduped with a linear search per id, so one render cost
   rows x (kept ids)^2. Timed for real, with wide margins both ways: the old
   code took over a second here on a desktop, the fixed one about a millisecond. */
describe('AudioLibraryStore — per-row reads on a full library (sweep v019)', () => {
  const sid = (n) => n.toString(16).padStart(12, '0');
  const song = (n) => ({ key: 'song:' + sid(n), title: 'Song ' + n, sub: null, url: 'https://votreader.github.io/songs-1/' + sid(n) + '.mp3', readerCode: '', partLabel: 'Pop' });
  const keptIds = () => Array.from({ length: MAX_KEPT_SONGS }, (_u, i) => sid(i + 1));

  it('a screen of stars reads fast with every song kept', () => {
    vi.useRealTimers();
    AudioLibraryStore.replaceAll({
      saved: Array.from({ length: MAX_SAVED_AUDIO_TRACKS }, (_u, i) => ({ ...track(i + 1), savedAt: i + 1 })),
      songSaved: Array.from({ length: MAX_SAVED_SONGS }, (_u, i) => sid(i + 1)),
      songKept: keptIds(),
    });
    const started = performance.now();
    for (let row = 1; row <= 40; row++) {
      expect(AudioLibraryStore.isSaved(song(row))).toBe(true);
      expect(AudioLibraryStore.isSaved(track(row))).toBe(true);
    }
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('normalizing a full kept list is linear in its length', () => {
    vi.useRealTimers();
    const ids = keptIds().flatMap((id) => [id, id]);   // every id twice: the dedupe has work to do
    // The best of five rounds, so a busy machine cannot fail it: a load spike slows a round, not all five.
    let best = Infinity;
    for (let round = 0; round < 5; round++) {
      const started = performance.now();
      for (let i = 0; i < 10; i++) expect(normalizeAudioLibrary({ songKept: ids }).songKept).toHaveLength(MAX_KEPT_SONGS);
      best = Math.min(best, performance.now() - started);
    }
    expect(best).toBeLessThan(150);
  });

  it('the rows read what was just written, and nobody can change what they read', () => {
    expect(AudioLibraryStore.isSongSaved(sid(1))).toBe(false);
    AudioLibraryStore.toggleSongSaved(sid(1));
    expect(AudioLibraryStore.isSongSaved(sid(1))).toBe(true);
    AudioLibraryStore.setSongsKept([sid(2)], true);
    expect(AudioLibraryStore.songKept()).toEqual([sid(2)]);
    AudioLibraryStore.toggleSaved(track(1));
    expect(AudioLibraryStore.isSaved(track(1))).toBe(true);
    AudioLibraryStore.replaceAll({ songSaved: [sid(3)] });
    expect(AudioLibraryStore.isSongSaved(sid(1))).toBe(false);
    expect(AudioLibraryStore.isSongSaved(sid(3))).toBe(true);
    expect(AudioLibraryStore.isSaved(track(1))).toBe(false);
    AudioLibraryStore.get().songSaved.push(sid(4));   // get() hands out a copy
    AudioLibraryStore.songSaved().push(sid(5));       // and so do the list readers
    expect(AudioLibraryStore.songSaved()).toEqual([sid(3)]);
  });
});
