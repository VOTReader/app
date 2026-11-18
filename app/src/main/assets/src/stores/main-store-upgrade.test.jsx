// @ts-nocheck — reads a JSON fixture and pokes store internals (_idbStoreName, _load) on purpose
/* A reader on main opens this build with everything main kept for them (release of ui-overhaul, vot-ui 2026-11-16).

   main-store-53ae2f891.fixture.json was WRITTEN BY MAIN'S OWN CODE at 53ae2f891 (the live site's main); the writer is
   kept beside it (main-store-53ae2f891.writer.jsx.txt). It holds every place main keeps a reader's data, each with a
   real record:
   - IndexedDB 'votreader' v14: all 29 object stores (STORE_NAMES: 27 vot-* stores, offline-songs, meta);
   - IndexedDB 'vot-journal-media' (a journal photo) and 'vot-thumbs' (a tab picture);
   - localStorage: every key on main's LS_SKIP_LIST (main's own gate test proves that list is every vot-* key its
     source hands localStorage) but vot-restore-inflight, which exists only while a restore runs; and the four
     'vot.' keys (audio engine, journal re-key stamp, the downloads index and queue);
   - Cache Storage 'vot-offline-audio-v1': a recording main's WebOfflineAudio downloaded, and a second left in its
     paused queue.

   Here all of it is laid down as found and THIS build boots on it the way HydrationGate does (hydrate every store,
   the legacy sweep, the journal re-key). Nothing of the reader's is lost or rewritten: every database and every key
   reads back as main left it, the new build's own readers see it, and the downloads come back saved and queued.
   The deliberate differences are named: four top-bar settings the three tabs retired, and two screen states
   (vot-audio-recent-open, vot-plan-ribbon-hidden) whose screens the overhaul replaced; both stay in storage. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob as NodeBlob, Buffer } from 'node:buffer';

// jsdom's Blob does not survive fake-indexeddb's structuredClone (it lands as {}); Node's does, as a browser's does.
globalThis.Blob = NodeBlob;
window.Blob = NodeBlob;

vi.mock('../utils/platform-bridge.js', () => ({ PlatformBridge: { isAndroid: false, setLightStatusBar: vi.fn(), setKeepScreenOn: vi.fn() } }));
globalThis.GARDEN_DEFAULT_TIER = 2;

import { IDBAdapter } from './idb-adapter.js';
import { hydrateAllStores, clearLegacyLs, registeredStores, LS_SKIP_LIST } from './cached-store.js';
import { StateStore } from './state-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { AnnotationStore } from './annotation-store.js';
import { NoteStore } from './note-store.js';
import { NotebookStore } from './notebook-store.js';
import { HistoryStore } from './history-store.js';
import { ReadingPlanStore } from './reading-plan-store.js';
import { ReadingStatsStore } from './reading-stats-store.js';
import { ReadingStreakStore } from './reading-streak-store.js';
import { AudioLibraryStore } from './audio-library-store.js';
import { AudioPositionsStore } from './audio-positions-store.js';
import { LinkStore } from './link-store.js';
import { NoteDefaultStore } from './note-default-store.js';
import { WelcomedFlagStore, AboutSeenFlagStore, GardenWarningFlagStore, AnnHintDismissedFlagStore, TourDoneFlagStore } from './app-flag-stores.js';
import { RecentNavStore } from './recent-nav-store.js';
import { ProphecyCardsStore } from './prophecy-cards-store.js';
import { JournalStore, JournalNotebookStore } from './journal-store.js';
import { JournalIndexStore } from './journal-index-store.js';
import { JournalStatsStore } from './journal-stats-store.js';
import { HomeOrderStore } from './home-order-store.js';
import { LibraryOrderStore } from './library-order-store.js';
import { GardenPosStore } from './garden-pos-store.js';
import { OfflineSongsStore } from './offline-songs-store.js';
import { JournalMediaStore } from './journal-media-store.js';
import { idbReadAll as thumbReadAll, THUMB_DB, THUMB_DB_VERSION } from './thumb-store.js';
import { useSettings, RETIRED_SETTINGS } from '../hooks/use-settings.js';
import { getRecentSearches } from '../search/recent-searches.js';
import { readNoteDraft } from '../utils/note-draft.js';
import { WebOfflineAudio, OFFLINE_AUDIO_CACHE } from '../utils/offline-audio-web.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = JSON.parse(readFileSync(resolve(HERE, 'main-store-53ae2f891.fixture.json'), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

/** The settings keys the overhaul retired on purpose (use-settings.js RETIRED_SETTINGS, the three tabs, 2026-11-10). */
const RETIRED_BY_OVERHAUL = ['compactTopBar', 'showThemeBtn', 'historyInNav', 'showSettingsGear'];
/** Screen states main kept whose screens the overhaul replaced: nothing reads them now; they stay in storage. */
const LS_NO_LONGER_READ = ['vot-audio-recent-open', 'vot-plan-ribbon-hidden'];

const fromJson = (v) => {
  if (v && typeof v === 'object' && v.__blob === true) return new Blob([Buffer.from(v.b64, 'base64')], { type: v.type });
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = fromJson(x); return o; }
  return v;
};
async function toJson(v) {
  if (v instanceof Blob) return { __blob: true, type: v.type, b64: Buffer.from(await v.arrayBuffer()).toString('base64') };
  if (Array.isArray(v)) return Promise.all(v.map(toJson));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await toJson(x); return o; }
  return v;
}

/** Lay a dumped database down exactly: its version, its stores' shapes, every record. */
function restoreDb(name, dump) {
  return new Promise((res, rej) => {
    const req = indexedDB.open(name, dump.version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [s, d] of Object.entries(dump.stores)) {
        const os = db.createObjectStore(s, { keyPath: d.keyPath ?? undefined, autoIncrement: d.autoIncrement });
        for (const ix of d.indexes) os.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry });
      }
    };
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const names = Object.keys(dump.stores);
      if (!names.length) { db.close(); res(); return; }
      const tx = db.transaction(names, 'readwrite');
      for (const [s, d] of Object.entries(dump.stores)) {
        const os = tx.objectStore(s);
        for (const [k, v] of d.records) { if (d.keyPath == null) os.put(fromJson(v), k); else os.put(fromJson(v)); }
      }
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
  });
}
/** A database as it stands now, in the fixture's form. */
function dumpDb(name) {
  return new Promise((res, rej) => {
    const req = indexedDB.open(name);
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const stores = [...db.objectStoreNames];
      const raw = {};
      const tx = db.transaction(stores, 'readonly');
      for (const s of stores) {
        raw[s] = [];
        tx.objectStore(s).openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { raw[s].push([c.key, c.value]); c.continue(); } };
      }
      tx.oncomplete = async () => { db.close(); const out = { version: db.version, stores: {} }; for (const [s, r] of Object.entries(raw)) out.stores[s] = await toJson(r); res(out); };
      tx.onerror = () => rej(tx.error);
    };
  });
}
const recordsOf = (dump) => Object.fromEntries(Object.entries(dump.stores).map(([s, d]) => [s, d.records ?? d]));

/* Cache Storage, as offline-audio-web.test.js fakes it, filled with what main's download left. */
function fakeCaches() {
  const buckets = new Map();
  const bucket = (name) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const m = buckets.get(name);
    const k = (r) => (typeof r === 'string' ? r : r.url);
    return {
      keys: async () => [...m.keys()].map((url) => ({ url })),
      match: async (r) => { const e = m.get(k(r)); return e ? new Response(e.bytes.slice(0), { headers: e.headers }) : undefined; },
      put: async (r, res) => { const bytes = new Uint8Array(await res.arrayBuffer()); m.set(k(r), { bytes, headers: new Headers(res.headers) }); },
      delete: async (r) => m.delete(k(r)),
    };
  };
  return { open: async (name) => bucket(name), _buckets: buckets };
}
const define = (obj, name, value) => Object.defineProperty(obj, name, { value, configurable: true, writable: true });
let caches;

const STORES = [StateStore, BookmarkStore, AnnotationStore, NoteStore, NotebookStore, HistoryStore, ReadingPlanStore,
  ReadingStatsStore, ReadingStreakStore, AudioLibraryStore, AudioPositionsStore, LinkStore, NoteDefaultStore,
  WelcomedFlagStore, AboutSeenFlagStore, GardenWarningFlagStore, AnnHintDismissedFlagStore, TourDoneFlagStore,
  RecentNavStore, ProphecyCardsStore, JournalStore, JournalNotebookStore, JournalIndexStore, JournalStatsStore,
  HomeOrderStore, LibraryOrderStore, GardenPosStore];

/* The day main wrote the fixture (its streaks' lastReadDate). The streak stores break a streak 2 days after it, and the
   boot then writes currentStreak 0: on a real clock this test failed from 2026-11-18 on (push19). The clock is the
   fixture's day, at noon; only Date is faked (fake-indexeddb runs on the real timers). */
const FIXTURE_DAY = /"lastReadDate":"(\d{4}-\d{2}-\d{2})"/.exec(JSON.stringify(MAIN))[1];

afterAll(() => { vi.useRealTimers(); });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(FIXTURE_DAY + 'T12:00:00') });
  // Same schemas: nothing in this build upgrades a database main left.
  expect(IDBAdapter.DB_VERSION).toBe(MAIN.dbVersion);
  expect(MAIN.databases['votreader'].version).toBe(MAIN.dbVersion);
  expect(MAIN.databases[THUMB_DB].version).toBe(THUMB_DB_VERSION);
  for (const [name, dump] of Object.entries(MAIN.databases)) await restoreDb(name, dump);
  localStorage.clear();
  for (const [k, v] of Object.entries(MAIN.localStorage)) localStorage.setItem(k, v);
  caches = fakeCaches();
  for (const [name, entries] of Object.entries(MAIN.caches)) {
    const c = await caches.open(name);
    for (const e of entries) await c.put(e.url, new Response(Buffer.from(e.b64, 'base64'), { headers: e.headers }));
  }
  define(window, 'isSecureContext', true);
  define(window, 'caches', caches);
  define(globalThis, 'caches', caches);
  define(globalThis, 'fetch', vi.fn(async () => { throw new Error('offline: the test never downloads'); }));
  define(navigator, 'serviceWorker', { controller: { scriptURL: 'https://votreader.github.io/app/service-worker.js' } });
  define(navigator, 'storage', { estimate: async () => ({ quota: 1e9, usage: 1e6 }), persist: vi.fn(async () => true) });

  // This build's boot, as HydrationGate runs it.
  for (const s of STORES) s._resetForTests();
  await hydrateAllStores();
  await clearLegacyLs();
  JournalStore.rekeyMarks();
  for (const s of registeredStores()) await s.whenSaved();
}, 30000);

describe("everything main 53ae2f891 kept for a reader, opened by this build", () => {
  it('the fixture covers every database store and every localStorage key main writes', () => {
    const v = MAIN.databases['votreader'];
    expect(Object.keys(v.stores).sort()).toEqual([...MAIN.storeNames].sort());
    expect([...IDBAdapter.STORE_NAMES].sort()).toEqual([...MAIN.storeNames].sort());   // this build: the same 29
    for (const [s, d] of Object.entries(v.stores)) expect(d.records.length, s).toBeGreaterThan(0);
    // blobs hold their bytes (a jsdom Blob would have landed as {})
    expect(MAIN.databases['vot-journal-media'].stores.media.records[0][1].blob.__blob).toBe(true);
    expect(v.stores['offline-songs'].records[0][1].blob.__blob).toBe(true);
    expect(MAIN.databases['vot-journal-media'].stores.media.records).toHaveLength(1);
    expect(MAIN.databases[THUMB_DB].stores.thumbs.records).toHaveLength(1);
    const lsMissing = MAIN.lsSkipList.filter((k) => !(k in MAIN.localStorage));
    expect(lsMissing).toEqual(['vot-restore-inflight']);   // a marker that lives only while a restore runs
    for (const k of ['vot.audioEngine', 'vot.journalRekey', 'vot.offlineAudioIndex', 'vot.offlineAudioQueue']) expect(MAIN.localStorage[k], k).toBeTruthy();
    expect(MAIN.caches[OFFLINE_AUDIO_CACHE]).toHaveLength(1);
  });

  it('every store main wrote loads in this build, record for record', () => {
    const byName = new Map(registeredStores().map((s) => [s._idbStoreName, s]));
    for (const [name, d] of Object.entries(MAIN.databases['votreader'].stores)) {
      if (name === 'meta' || name === 'offline-songs') continue;   // read through their own modules, below
      const store = byName.get(name);
      expect(store, name + ' has no store in this build').toBeTruthy();
      expect(store._state, name).toBe('loaded');
      expect(clone(store._load()), name).toEqual(Object.fromEntries(d.records).v);
    }
  });

  it('the boot writes nothing over it: all three databases read back as main left them', async () => {
    for (const name of Object.keys(MAIN.databases)) {
      expect(recordsOf(await dumpDb(name)), name).toEqual(recordsOf(MAIN.databases[name]));
    }
  });

  it("every localStorage key main wrote is still there, unchanged, and survives a later sweep unless nothing reads it", () => {
    for (const [k, v] of Object.entries(MAIN.localStorage)) expect(localStorage.getItem(k), k).toBe(v);
    // The sweep runs again after a Clear All: each vot- key this build still uses is on its skip list.
    const swept = Object.keys(MAIN.localStorage).filter((k) => k.startsWith('vot-') && !LS_SKIP_LIST.includes(k));
    expect(swept.sort()).toEqual([...LS_NO_LONGER_READ].sort());
    // ...and nothing in this build's source reads those two any more.
    const src = [];
    (function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) src.push(readFileSync(p, 'utf8'));
      }
    })(resolve(HERE, '..'));
    for (const k of LS_NO_LONGER_READ) expect(src.some((s) => s.includes("'" + k + "'")), k).toBe(false);
  });

  it('settings: every value the reader had is kept; only the retired top-bar switches leave, and only new keys arrive', () => {
    const saved = Object.fromEntries(MAIN.databases['votreader'].stores['vot-state'].records).v.settings;
    const { result } = renderHook(() => useSettings({ savedSettings: clone(saved), theme: 'light' }));
    const now = result.current.settings;
    for (const k of RETIRED_BY_OVERHAUL) expect(RETIRED_SETTINGS).toContain(k);
    for (const [k, v] of Object.entries(saved)) {
      if (RETIRED_BY_OVERHAUL.includes(k)) { expect(k in now, k).toBe(false); continue; }
      expect(now[k], k).toEqual(v);
    }
    expect(Object.keys(now).filter((k) => !(k in saved)).sort()).toEqual(['copyLetters', 'copyScripture', 'keepStarred', 'shareLetters', 'shareScripture']);
    expect(now.showReadingDot).toBe(true);   // a stored choice stands; the off default is for an empty profile
    expect([now.fontScale, now.showScrollNotch, now.answersReadingPath, now.dwellMs]).toEqual(['1.3', false, false, '45000']);
    expect(now.touched).toEqual(saved.touched);
  });

  it("reading, library, journal, listening and the app's own flags read back through this build's stores", async () => {
    const st = StateStore.get();
    expect(st.readItems).toEqual({ 'v1:psalms:23': 2, 'v1:volume-one:the-wide-path': 1, 'v1:matthew:5': 1 });
    expect([st.lastReadChapters, st.lastReadLetterMap]).toEqual([{ psalms: 23, matthew: 5 }, { 'volume-one': 'the-wide-path' }]);
    expect(NoteStore.get('g2').color).toBe('blank');
    expect(NoteStore.get('g1').notebookIds).toEqual([NotebookStore.list()[0].id]);
    expect(AnnotationStore.get('bible:psalms:23:1').map((a) => a.color)).toEqual(['green']);
    expect(BookmarkStore.get('bm1').label).toBe('The Lord is my shepherd');
    expect(LinkStore.all()).toHaveLength(1);
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'green' });
    expect(HistoryStore.list()).toHaveLength(2);
    expect(ReadingStatsStore.getProgress('v1:psalms:23').c).toHaveLength(6);
    expect(ReadingStreakStore.get().currentStreak).toBeGreaterThanOrEqual(1);
    expect(ReadingPlanStore.all().map((r) => r.status)).toEqual(['running', 'paused']);
    expect(ReadingPlanStore.holds('psalms', 2)).toBe(true);
    for (const f of [WelcomedFlagStore, AboutSeenFlagStore, GardenWarningFlagStore, AnnHintDismissedFlagStore, TourDoneFlagStore]) expect(f.is()).toBe(true);
    expect(RecentNavStore.list()).toHaveLength(2);
    expect([ProphecyCardsStore.getOne('prophecy-1'), ProphecyCardsStore.getOne('prophecy-2')]).toEqual([true, false]);
    expect(HomeOrderStore.get()).toEqual(Object.fromEntries(MAIN.databases['votreader'].stores['vot-home-order'].records).v);
    expect(LibraryOrderStore.get().length).toBeGreaterThan(0);
    expect(GardenPosStore.get()).toBe(4);
    // Journal: the entry, its notebook, index and stats, the mark on its block, and its photo's bytes.
    const [entry] = JournalStore.all();
    expect(entry.title).toBe('Psalm 23 this morning');
    expect(JournalNotebookStore.list().map((n) => n.name)).toEqual(['Morning']);
    expect(JournalIndexStore.entriesReferencing('bible:psalms:23')).toContain(entry.id);
    expect(JournalStatsStore.get().totalEntries).toBe(1);
    expect(AnnotationStore.get('journal:' + entry.id + ':' + entry.blocks[0].id).map((a) => a.text)).toEqual(['Lord']);
    const photo = await JournalMediaStore.get(entry.blocks[1].mediaId);
    expect(photo && photo.type).toBe('image');
    expect([...new Uint8Array(await photo.blob.arrayBuffer())].slice(0, 4)).toEqual([137, 80, 78, 71]);   // the PNG's own bytes
    // Listening: the saved recording, its position, the kept song's bytes, and meta's song keys.
    expect(AudioLibraryStore.saved().map((t) => t.title)).toEqual(['The Wide Path']);
    expect(AudioPositionsStore.getPosition(AudioLibraryStore.saved()[0])).toBeTruthy();
    expect(AudioLibraryStore.songKept()).toEqual(['5a1f0c3e9b2d']);
    const song = await OfflineSongsStore.get('5a1f0c3e9b2d');
    expect([song.bytes, song.blob.size, song.blob.type]).toEqual([64, 64, 'audio/mpeg']);
    expect(await IDBAdapter.get('meta', 'song-votes')).toEqual({ '5a1f0c3e9b2d': 1 });
    expect((await IDBAdapter.get('meta', 'songs-catalog')).songs).toHaveLength(1);
    // Device keys read by their own modules.
    expect(getRecentSearches()).toEqual(['shepherd']);
    expect(readNoteDraft('g1').body).toBe('Comfort in the valley, and');
    // The tab picture.
    expect(Object.keys(await thumbReadAll())).toEqual(['t1']);
  });

  it('downloads: the recording main saved is still saved, and the queue it left comes back, paused', async () => {
    WebOfflineAudio._reset();
    WebOfflineAudio.offlineAudioState();   // the app's first read: seeds from the index, reads the cache
    // The index seeds the saved list at once; the queue comes back once the cache has been read (_load, then
    // _restoreQueue), so wait for that, not for the first list.
    await vi.waitFor(() => {
      const s = JSON.parse(WebOfflineAudio.offlineAudioState());
      if (!s.items.length || !s.queue.length) throw new Error('not read yet');
    }, { timeout: 3000 });
    const s = JSON.parse(WebOfflineAudio.offlineAudioState());
    expect(s.items.map((i) => [i.title, i.bytes])).toEqual([['The Wide Path', 4000]]);
    expect(s.queue.map((q) => q.title)).toEqual(['The Seventh Day']);
    expect(s.paused).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();   // paused: nothing downloads by itself
    expect((await (await caches.open(OFFLINE_AUDIO_CACHE)).keys()).length).toBe(1);
    WebOfflineAudio._reset();
  });
});
