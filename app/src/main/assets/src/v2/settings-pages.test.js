/* settings-pages.js (zv1): the Settings pages' words from main's settings, and their writers in main's shape (each takes a
   fake global object here, so nothing touches the real stores). */
import { describe, it, expect, vi } from 'vitest';
import {
  READERS, readerLine, listeningFacts, liveListening, editionOptions, editionLine, rateLabel, rateOptions, writeSetting,
  writeRate, daysAgo, liveData, safeCard, weeklyLine, versionLine, readVersion, readBuild, buildView, gateListening, gateData, pushListening,
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

  it('Download only on Wi-Fi also reaches the download stores (bundle-d\'s DownloadGate), as main\'s App pushed it', () => {
    const setWifiOnly = vi.fn();
    const gl = { StateStore: fakeStore({}), DownloadGate: { setWifiOnly } };
    writeSetting('downloadWifiOnly', true, gl);
    expect(setWifiOnly).toHaveBeenCalledWith(true);
    expect(gl.StateStore.st.settings).toEqual({ downloadWifiOnly: true, touched: { downloadWifiOnly: true } });
  });

  it('pushListening hands the saved favourite reader and Wi-Fi switch to bundle-d (a v2 boot; main\'s screen-routes did it as it rendered)', () => {
    const setPreferredReader = vi.fn();
    const setWifiOnly = vi.fn();
    pushListening({ StateStore: fakeStore({ settings: { letterReader: 'T', downloadWifiOnly: true } }), AudioPlayer: { setPreferredReader }, DownloadGate: { setWifiOnly } });
    expect(setPreferredReader).toHaveBeenCalledWith('T');
    expect(setWifiOnly).toHaveBeenCalledWith(true);
    // nothing saved: main's defaults (the manifest's own reading; downloads on any network)
    pushListening({ StateStore: fakeStore({}), AudioPlayer: { setPreferredReader }, DownloadGate: { setWifiOnly } });
    expect(setPreferredReader).toHaveBeenLastCalledWith(undefined);
    expect(setWifiOnly).toHaveBeenLastCalledWith(false);
    // before the store has loaded, or without bundle-d: nothing to say, nothing thrown
    expect(() => pushListening({ StateStore: { isReady: () => false }, AudioPlayer: { setPreferredReader } })).not.toThrow();
    expect(setPreferredReader).toHaveBeenCalledTimes(2);
    expect(() => pushListening({})).not.toThrow();
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

  it('readVersion: a gate row may say it is the installed app (7c) whatever the browser says', async () => {
    const file = { cacheVersion: 'v2', corpusVersion: 'c2' };
    const web = { getBuildVersion: () => Promise.resolve(null), fetchServerBuildVersion: () => Promise.resolve(file) };
    expect(await readVersion(web, true)).toBe(file);
    expect(await readVersion(web, false)).toBe(null);
  });

  it('readBuild: the website compares its build with the published one; the APK and an unkept page do not ask', async () => {
    const running = { cacheVersion: 'v1.0.2-27de477ee6', corpusVersion: 'c69' };
    const server = { cacheVersion: 'v1.0.3-5b1c09e2a4', corpusVersion: 'c69' };
    let asked = 0;
    const web = { getBuildVersion: () => Promise.resolve(running), fetchServerBuildVersion: () => { asked += 1; return Promise.resolve(server); } };
    expect(await readBuild(false, web)).toEqual({ android: false, running, server });
    expect(asked).toBe(1);
    expect(await readBuild(false, { ...web, fetchServerBuildVersion: () => Promise.resolve(null) })).toEqual({ android: false, running, server: null });
    expect(await readBuild(false, { ...web, fetchServerBuildVersion: () => Promise.reject(new Error('offline')) })).toEqual({ android: false, running, server: null });
    expect(await readBuild(false, { ...web, getBuildVersion: () => Promise.resolve(null) })).toEqual({ android: false, running: null, server: null });
    expect(asked).toBe(1);
    const apk = { getBuildVersion: () => Promise.resolve(null), fetchServerBuildVersion: () => Promise.resolve(running) };
    expect(await readBuild(true, apk)).toEqual({ android: true, running, server: null });
  });

  it('buildView: every line under the version (dz25 7i), Check on the website only', () => {
    const running = { cacheVersion: 'v1.0.2-27de477ee6', corpusVersion: 'c69' };
    const line = '1.0.2-27de477ee6 · corpus c69';
    const web = (server) => ({ android: false, running, server });
    expect(buildView(web({ cacheVersion: 'v1.0.3-5b1c09e2a4' }), false, false, 'this phone'))
      .toEqual({ line, sub: ['An update is ready: 1.0.3-5b1c09e2a4.', 'Reopen the app to use it.'], check: true });
    expect(buildView(web({ cacheVersion: 'v1.0.2-27de477ee6' }), false, false, 'this phone'))
      .toEqual({ line, sub: ['Website build: up to date'], check: true });
    expect(buildView(web(null), false, false, 'this phone'))
      .toEqual({ line, sub: ["Website build: couldn't reach the server to compare"], check: true });
    expect(buildView({ android: false, running: null, server: null }, false, false, 'this phone'))
      .toEqual({ line: null, sub: ['Website build: not kept for offline on this device yet'], check: true });
    expect(buildView(null, false, false, 'this phone')).toEqual({ line: null, sub: ['Checking…'], check: true });
    expect(buildView(web(null), false, true, 'this phone')).toEqual({ line, sub: ['Checking…'], check: true });
    expect(buildView({ android: true, running, server: null }, true, false, 'this phone'))
      .toEqual({ line, sub: ['Installed app build: updates come as a new app'], check: false });
    expect(buildView({ android: true, running: null, server: null }, true, false, 'this phone').line).toBe('Not known on this phone');
    expect(buildView(null, true, true, 'this phone')).toEqual({ line: '…', sub: ['Installed app build: updates come as a new app'], check: false });
  });
});

it('the gate pictures\' facts (states.json 7a, 7b)', () => {
  expect(gateListening()).toMatchObject({ reader: 'B', bibleAudio: 'brm-kjv', rate: 1, readAlongHighlight: true, showLetterSongs: true });
  expect(gateData(NOW)).toEqual({ lastExportAt: NOW - 2 * DAY, snapshots: { count: 7, newestAt: NOW - 3600 * 1000, where: 'phone' }, weekly: false, now: NOW });
});
