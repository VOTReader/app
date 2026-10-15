/* settings-pages.js (zv1): the Settings pages' words from main's settings, and their writers in main's shape (each takes a
   fake global object here, so nothing touches the real stores). */
import { describe, it, expect, vi } from 'vitest';
import {
  READERS, readerLine, listeningFacts, liveListening, editionOptions, editionLine, rateLabel, rateOptions, writeSetting,
  writeRate, daysAgo, liveData, safeCard, weeklyLine, versionLine, readVersion, updateLine, gateListening, gateData,
} from './settings-pages.js';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);

/** A ready StateStore holding `state`; set() keeps what it was given. */
function fakeStore(state) {
  const store = { st: state, isReady: () => true, get: () => store.st, set: vi.fn((s) => { store.st = s; }) };
  return store;
}

describe('Listening facts and words', () => {
  it('reads main keys with main defaults (auto reader, BRM KJV, every switch on)', () => {
    expect(listeningFacts({}, 0)).toEqual({
      reader: 'auto', bibleAudio: 'brm-kjv', rate: 1,
      readAlongHighlight: true, readAlongFollow: true, audioTurnPage: true, showLetterSongs: true,
    });
    const f = listeningFacts({ letterReader: 'T', bibleAudio: 'off', readAlongFollow: false, showLetterSongs: false }, 1.25);
    expect([f.reader, f.bibleAudio, f.rate, f.readAlongFollow, f.showLetterSongs, f.audioTurnPage]).toEqual(['T', 'off', 1.25, false, false, true]);
  });

  it('a real boot reads the saved settings and the library speed; a store not loaded yet gives the defaults', () => {
    const gl = { StateStore: fakeStore({ settings: { letterReader: 'M' } }), AudioLibraryStore: { getPlaybackRate: () => 1.5 } };
    expect(liveListening(gl)).toMatchObject({ reader: 'M', rate: 1.5 });
    expect(liveListening({ StateStore: { isReady: () => false, get: () => ({ settings: { letterReader: 'M' } }) } })).toMatchObject({ reader: 'auto', rate: 1 });
  });

  it('names the reader in plain words, Automatic for an unknown code', () => {
    expect(readerLine('B')).toBe('Benjamin, wherever he has recorded');
    expect(readerLine('zz')).toBe(READERS[0].line);
    expect(READERS.map((r) => r.id)).toEqual(['auto', 'B', 'T', 'V', 'M']);
  });

  it('offers main\'s released editions then Off, and names one by its own label', () => {
    const gl = {
      BIBLE_AUDIO_EDITIONS: {
        'brm-kjv': { label: 'KJV · Biblical Restoration Ministries' },
        'wop-nkjv': { label: 'NKJV · The Word of Promise', unreleased: true },
      },
    };
    expect(editionOptions(gl).map((o) => o.id)).toEqual(['brm-kjv', 'off']);
    expect(editionOptions({ ...gl, bibleAudioOffered: () => true }).map((o) => o.id)).toEqual(['brm-kjv', 'wop-nkjv', 'off']);
    expect(editionLine('brm-kjv', gl)).toBe('KJV · Biblical Restoration Ministries');
    expect(editionLine('off', gl)).toBe('Off · no Listen button on Bible chapters');
    expect(editionLine('xyz', {})).toBe('XYZ');
  });

  it('lists main\'s speeds, adding the current one when the player left it between them', () => {
    expect(rateLabel(1)).toBe('1×');
    expect(rateLabel(1.25)).toBe('1.25×');
    expect(rateOptions(1, {}).map((o) => o.id)).toEqual(['0.75', '1', '1.25', '1.5', '1.75', '2']);
    expect(rateOptions(1.1, { AUDIO_PLAYBACK_RATES: [1, 1.5] }).map((o) => o.label)).toEqual(['1×', '1.1×', '1.5×']);
    expect(rateOptions(1, {}).find((o) => o.id === '1').s).toBe('As recorded');
  });
});

describe('writers', () => {
  it('writes a setting as main does: the key and its touched mark, the rest of the state kept', () => {
    const store = fakeStore({ notes: [1], settings: { bibleAudio: 'brm-kjv', touched: { bibleAudio: true } } });
    const gl = { StateStore: store };
    expect(writeSetting('readAlongFollow', false, gl)).toBe(true);
    expect(store.st).toEqual({
      notes: [1],
      settings: { bibleAudio: 'brm-kjv', readAlongFollow: false, touched: { bibleAudio: true, readAlongFollow: true } },
    });
  });

  it('a favourite reader also reaches the player', () => {
    const setPreferredReader = vi.fn();
    const gl = { StateStore: fakeStore({}), AudioPlayer: { setPreferredReader } };
    writeSetting('letterReader', 'T', gl);
    expect(setPreferredReader).toHaveBeenCalledWith('T');
    expect(gl.StateStore.st.settings).toEqual({ letterReader: 'T', touched: { letterReader: true } });
  });

  it('writes nothing while the store has not loaded', () => {
    const set = vi.fn();
    expect(writeSetting('audioTurnPage', false, { StateStore: { isReady: () => false, get: () => ({}), set } })).toBe(false);
    expect(writeSetting('audioTurnPage', false, {})).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('the starting speed goes through the player first, else the library', () => {
    const player = { setPlaybackRate: vi.fn() };
    const lib = { setPlaybackRate: vi.fn() };
    expect(writeRate(1.5, { AudioPlayer: player, AudioLibraryStore: lib })).toBe(true);
    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(lib.setPlaybackRate).not.toHaveBeenCalled();
    expect(writeRate(2, { AudioLibraryStore: lib })).toBe(true);
    expect(lib.setPlaybackRate).toHaveBeenCalledWith(2);
    expect(writeRate(2, {})).toBe(false);
  });
});

describe('Your data', () => {
  it('counts whole days', () => {
    expect(daysAgo(NOW - 3600 * 1000, NOW)).toBe('today');
    expect(daysAgo(NOW - DAY, NOW)).toBe('yesterday');
    expect(daysAgo(NOW - 3 * DAY - 5, NOW)).toBe('3 days ago');
    expect(daysAgo(NOW + DAY, NOW)).toBe('today');
  });

  it('the safety card: exported, the newest snapshot and how many are kept where', () => {
    expect(safeCard(gateData(NOW), 'phone')).toEqual({ t: 'Exported 2 days ago', s: 'Newest snapshot today · 7 kept on this phone' });
    const browser = { lastExportAt: null, snapshots: { count: 2, newestAt: null, where: 'browser' }, weekly: null, now: NOW };
    expect(safeCard(browser, 'computer')).toEqual({ t: 'Not exported from this computer yet', s: '2 kept in this browser' });
    expect(safeCard({ lastExportAt: null, snapshots: null, weekly: null, now: NOW }, 'phone').s).toBe('Snapshots are kept on this phone as you go');
  });

  it('a real boot reads main\'s last export and DataSafety; a missing DataSafety hides the weekly row', () => {
    const gl = {
      localStorage: { getItem: (k) => (k === 'vot-last-export' ? String(NOW - DAY) : null) },
      DataSafety: { status: () => ({ count: 3, newestAt: NOW, where: 'phone' }), weeklyStatus: () => ({ on: true }) },
    };
    expect(liveData(gl)).toMatchObject({ lastExportAt: NOW - DAY, snapshots: { count: 3 }, weekly: true });
    expect(liveData({ localStorage: { getItem: () => null } })).toMatchObject({ lastExportAt: null, snapshots: null, weekly: null });
  });

  it('the weekly copy line', () => {
    expect(weeklyLine(false)).toBe('Off · once a week, the last 4 kept');
    expect(weeklyLine(true)).toBe('On · once a week, the last 4 kept');
  });
});

describe('Help and about', () => {
  it('the version line drops the v; nothing when the build is not known', () => {
    expect(versionLine({ cacheVersion: 'v1.0.2-27de477ee6', corpusVersion: 'c69' })).toBe('1.0.2-27de477ee6 · corpus c69');
    expect(versionLine(null)).toBe(null);
    expect(versionLine({})).toBe(null);
  });

  it('reads the service worker\'s build, else on Android the installed file', async () => {
    const sw = { cacheVersion: 'v1', corpusVersion: 'c1' };
    expect(await readVersion({ getBuildVersion: () => Promise.resolve(sw) })).toBe(sw);
    const file = { cacheVersion: 'v2', corpusVersion: 'c2' };
    const android = { getBuildVersion: () => Promise.resolve(null), PlatformBridge: { isAndroid: true }, fetchServerBuildVersion: () => Promise.resolve(file) };
    expect(await readVersion(android)).toBe(file);
    expect(await readVersion({ getBuildVersion: () => Promise.resolve(null), fetchServerBuildVersion: () => Promise.resolve(file) })).toBe(null);
    expect(await readVersion({ getBuildVersion: () => Promise.reject(new Error('no sw')) })).toBe(null);
  });

  it('what updates mean here', () => {
    expect(updateLine({ PlatformBridge: { isAndroid: true } })).toBe('Installed app build: updates come as a new app');
    expect(updateLine({})).toBe('Website build: a new version arrives when the app reopens');
  });
});

it('the gate pictures\' facts (states.json 7a, 7b)', () => {
  expect(gateListening()).toMatchObject({ reader: 'B', bibleAudio: 'brm-kjv', rate: 1, readAlongHighlight: true, showLetterSongs: true });
  expect(gateData(NOW)).toEqual({ lastExportAt: NOW - 2 * DAY, snapshots: { count: 7, newestAt: NOW - 3600 * 1000, where: 'phone' }, weekly: false, now: NOW });
});
