/* AudioPositionsStore — durable per-recording resume points, and the LRU +
   import hardening that keep the map small and trustworthy. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioPositionsStore,
  MAX_AUDIO_POSITIONS,
  normalizeAudioPositions,
} from './audio-positions-store.js';
import { AUDIO_RELEASE_PREFIX } from '../utils/audio-track.js';

/** @param {number} id */
function url(id) { return AUDIO_RELEASE_PREFIX + 'track_' + id + '.mp3'; }

/** A Track-shaped value, the way the player passes one in. */
function track(id) {
  return { key: 'one:letter-' + id, title: 'Letter ' + id, sub: 'Volume One', url: url(id), readerCode: 'B', partLabel: null };
}

const keysOf = () => Object.keys(AudioPositionsStore.get().positions);

beforeEach(() => {
  localStorage.clear();
  AudioPositionsStore._resetForTests({ forceLoaded: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-09T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('AudioPositionsStore — per-recording resume points', () => {
  it('starts with nothing remembered', () => {
    expect(AudioPositionsStore.get()).toEqual({ v: 1, positions: {} });
    expect(AudioPositionsStore.getPosition(url(1))).toBe(null);
  });

  it('remembers where a recording was left, by track object or by URL', () => {
    AudioPositionsStore.setPosition(track(1), 612.34, 3600);
    expect(AudioPositionsStore.getPosition(url(1))).toEqual({ t: 612.3, d: 3600 });
    expect(AudioPositionsStore.getPosition(track(1))).toEqual({ t: 612.3, d: 3600 });
    expect(AudioPositionsStore.get().positions[url(1)].at).toBe(Date.now());
  });

  it('never accepts a URL outside the release-asset boundary', () => {
    AudioPositionsStore.setPosition({ url: 'https://example.test/untrusted.mp3' }, 90, 600);
    AudioPositionsStore.setPosition('javascript:alert(1)', 90, 600);
    AudioPositionsStore.setPosition(null, 90, 600);
    expect(keysOf()).toEqual([]);
  });

  it('forgets a recording rather than storing a position that means "the start"', () => {
    AudioPositionsStore.setPosition(track(1), 300, 900);
    expect(AudioPositionsStore.getPosition(url(1))).toBeTruthy();

    AudioPositionsStore.setPosition(track(1), 0, 900);
    expect(AudioPositionsStore.getPosition(url(1))).toBe(null);
    expect(keysOf()).toEqual([]);
  });

  it('clearPosition forgets exactly one recording', () => {
    AudioPositionsStore.setPosition(track(1), 100, 900);
    AudioPositionsStore.setPosition(track(2), 200, 900);
    AudioPositionsStore.clearPosition(url(1));

    expect(AudioPositionsStore.getPosition(url(1))).toBe(null);
    expect(AudioPositionsStore.getPosition(url(2))).toEqual({ t: 200, d: 900 });
    // Forgetting something already forgotten is a no-op, not a write.
    const before = AudioPositionsStore.getVersion();
    AudioPositionsStore.clearPosition(url(1));
    expect(AudioPositionsStore.getVersion()).toBe(before);
  });

  it('moves a touched recording to the freshest end of the LRU', () => {
    AudioPositionsStore.setPosition(track(1), 10, 100);
    vi.advanceTimersByTime(1000);
    AudioPositionsStore.setPosition(track(2), 20, 100);
    vi.advanceTimersByTime(1000);
    AudioPositionsStore.setPosition(track(1), 30, 100);   // touch the older one

    // Key order IS the LRU order — delete-then-reinsert is what maintains it.
    expect(keysOf()).toEqual([url(2), url(1)]);
    expect(AudioPositionsStore.getPosition(url(1))).toEqual({ t: 30, d: 100 });
  });

  it('prunes the least recently touched once the map is full', () => {
    for (let i = 0; i < MAX_AUDIO_POSITIONS + 5; i++) {
      AudioPositionsStore.setPosition(track(i), 60, 600);
      vi.advanceTimersByTime(10);
    }
    expect(keysOf()).toHaveLength(MAX_AUDIO_POSITIONS);
    expect(AudioPositionsStore.getPosition(url(0))).toBe(null);   // the five oldest…
    expect(AudioPositionsStore.getPosition(url(4))).toBe(null);
    expect(AudioPositionsStore.getPosition(url(5))).toBeTruthy(); // …and nothing else
    expect(AudioPositionsStore.getPosition(url(MAX_AUDIO_POSITIONS + 4))).toBeTruthy();
  });
});

describe('normalizeAudioPositions — import boundary', () => {
  it('returns an empty map for anything that is not a positions record', () => {
    const empty = { v: 1, positions: {} };
    expect(normalizeAudioPositions(null)).toEqual(empty);
    expect(normalizeAudioPositions('positions')).toEqual(empty);
    expect(normalizeAudioPositions([1, 2])).toEqual(empty);
    expect(normalizeAudioPositions({})).toEqual(empty);
    expect(normalizeAudioPositions({ positions: [] })).toEqual(empty);
    expect(normalizeAudioPositions({ positions: { [url(1)]: 'halfway' } })).toEqual(empty);
  });

  it('drops arbitrary remote URLs before one can become a resume target', () => {
    const data = normalizeAudioPositions({
      positions: {
        'https://example.test/untrusted.mp3': { t: 90, d: 600, at: 5 },
        'javascript:alert(1)': { t: 90, d: 600, at: 5 },
        [AUDIO_RELEASE_PREFIX + '../escape.mp3']: { t: 90, d: 600, at: 5 },
        [url(1)]: { t: 90, d: 600, at: 5 },
      },
    });
    expect(Object.keys(data.positions)).toEqual([url(1)]);
  });

  it('clamps malformed clocks and timestamps', () => {
    const data = normalizeAudioPositions({
      positions: {
        [url(1)]: { t: 90.06, d: 'six hundred', at: -5 },
        [url(2)]: { t: 999999, d: 600, at: 1e30 },
        [url(3)]: { t: Infinity, d: 600, at: 10 },
        [url(4)]: { t: -4, d: 600, at: 10 },
        [url(5)]: { t: 90, d: 600 },
      },
    });
    // An unusable length is 0 (never a guess), a nonsense stamp sorts oldest.
    expect(data.positions[url(1)]).toEqual({ t: 90.1, d: 0, at: 0 });
    expect(data.positions[url(2)]).toEqual({ t: 360000, d: 600, at: 0 });
    expect(data.positions[url(5)]).toEqual({ t: 90, d: 600, at: 0 });
    // No usable clock at all ⇒ no row: it would mean the same as having none.
    expect(data.positions[url(3)]).toBeUndefined();
    expect(data.positions[url(4)]).toBeUndefined();
  });

  it('truncates an oversized map to the FRESHEST entries, in LRU order', () => {
    /** @type {Record<string, any>} */
    const positions = {};
    for (let i = 0; i < MAX_AUDIO_POSITIONS + 10; i++) positions[url(i)] = { t: 60, d: 600, at: 1000 + i };
    const keys = Object.keys(normalizeAudioPositions({ positions }).positions);

    expect(keys).toHaveLength(MAX_AUDIO_POSITIONS);
    expect(keys[0]).toBe(url(10));                                  // the ten oldest are gone
    expect(keys[keys.length - 1]).toBe(url(MAX_AUDIO_POSITIONS + 9)); // freshest last = LRU order
  });

  it('replaceAll accepts only the normalized durable shape', () => {
    AudioPositionsStore.replaceAll({
      positions: {
        [url(1)]: { t: 120, d: 900, at: 42 },
        'https://not-vot.invalid/a.mp3': { t: 120, d: 900, at: 99 },
      },
      somethingElse: true,
    });
    expect(AudioPositionsStore.get()).toEqual({ v: 1, positions: { [url(1)]: { t: 120, d: 900, at: 42 } } });
    expect(AudioPositionsStore.getPosition(url(1))).toEqual({ t: 120, d: 900 });
  });
});
