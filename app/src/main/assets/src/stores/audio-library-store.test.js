/* AudioLibraryStore — Listening Library metadata and import hardening. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioLibraryStore,
  MAX_RECENT_AUDIO_TRACKS,
  MAX_SAVED_AUDIO_TRACKS,
  normalizeAudioLibrary,
} from './audio-library-store.js';
import { AUDIO_RELEASE_PREFIX } from '../utils/audio-track.js';

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
    expect(AudioLibraryStore.get()).toEqual({ v: 1, saved: [], recent: [], rate: 1, plays: 0 });
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

  it('persists only documented playback-rate presets', () => {
    expect(AudioLibraryStore.setPlaybackRate(1.5)).toBe(1.5);
    expect(AudioLibraryStore.getPlaybackRate()).toBe(1.5);
    expect(AudioLibraryStore.setPlaybackRate(1.37)).toBe(1);
    expect(AudioLibraryStore.getPlaybackRate()).toBe(1);
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
    expect(data).toEqual({ v: 1, saved: [], recent: [], rate: 2, plays: 0 });
  });

  it('bounds an imported plays counter', () => {
    expect(normalizeAudioLibrary({ plays: 41 }).plays).toBe(41);
    expect(normalizeAudioLibrary({ plays: -3 }).plays).toBe(0);
    expect(normalizeAudioLibrary({ plays: 'lots' }).plays).toBe(0);
    expect(normalizeAudioLibrary({ plays: 99999999999 }).plays).toBe(10000000);
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
