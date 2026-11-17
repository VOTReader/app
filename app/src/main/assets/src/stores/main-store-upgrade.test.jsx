// @ts-nocheck — reads a JSON fixture and pokes store internals (_idbStoreName, _load) on purpose
/* A reader on main opens this build with the data main wrote (release of ui-overhaul, vot-ui 2026-11-16).

   main-store-53ae2f891.fixture.json was WRITTEN BY MAIN'S OWN CODE at 53ae2f891 (the live site's main): a throwaway
   test there put a reader's settings through main's useSettings (a first boot, then five changes of the reader's
   own), and their bookmarks, highlights, notes (one saved with No color), a notebook, a link, history, read
   progress, two reading plans (one paused), a kept recording with a position, and three of main's localStorage keys
   through the stores' public methods; then main's boot ran (hydrate, the one-time legacy sweep) and the IndexedDB
   database and localStorage were dumped as they stood.

   Here that database is laid down as found and THIS build boots on it: every store loads exactly what main wrote,
   the boot writes nothing back over it, the sweep leaves main's keys alone, and the settings keep every value the
   reader had. The one deliberate loss is named: the four top-bar switches the three tabs retired
   (RETIRED_SETTINGS), which nothing in this build reads. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../utils/platform-bridge.js', () => ({ PlatformBridge: { isAndroid: false, setLightStatusBar: vi.fn(), setKeepScreenOn: vi.fn() } }));
globalThis.GARDEN_DEFAULT_TIER = 2;

import { IDBAdapter } from './idb-adapter.js';
import { hydrateAllStores, clearLegacyLs, registeredStores } from './cached-store.js';
import { StateStore } from './state-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { AnnotationStore } from './annotation-store.js';
import { NoteStore } from './note-store.js';
import { NotebookStore } from './notebook-store.js';
import { HistoryStore } from './history-store.js';
import { ReadingPlanStore } from './reading-plan-store.js';
import { ReadingStatsStore } from './reading-stats-store.js';
import { AudioLibraryStore } from './audio-library-store.js';
import { AudioPositionsStore } from './audio-positions-store.js';
import { LinkStore } from './link-store.js';
import { NoteDefaultStore } from './note-default-store.js';
import { useSettings, RETIRED_SETTINGS } from '../hooks/use-settings.js';

const MAIN = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'main-store-53ae2f891.fixture.json'), 'utf8'));
const STORES = { StateStore, BookmarkStore, AnnotationStore, NoteStore, NotebookStore, HistoryStore, ReadingPlanStore,
  ReadingStatsStore, AudioLibraryStore, AudioPositionsStore, LinkStore, NoteDefaultStore };
const clone = (v) => JSON.parse(JSON.stringify(v));

/** The settings keys the overhaul retired on purpose (use-settings.js RETIRED_SETTINGS, the three tabs, 2026-11-10). */
const RETIRED_BY_OVERHAUL = ['compactTopBar', 'showThemeBtn', 'historyInNav', 'showSettingsGear'];

async function dumpIdb() {
  const out = {};
  for (const name of IDBAdapter.STORE_NAMES) {
    const all = await IDBAdapter.getAll(name);
    if (all && Object.keys(all).length) out[name] = all;
  }
  return out;
}

beforeAll(async () => {
  expect(IDBAdapter.DB_VERSION).toBe(MAIN.dbVersion);   // same schema: no upgrade step runs over main's database
  for (const [name, records] of Object.entries(MAIN.idb)) {
    for (const [key, value] of Object.entries(records)) await IDBAdapter.put(name, key, clone(value));
  }
  localStorage.clear();
  for (const [k, v] of Object.entries(MAIN.localStorage)) localStorage.setItem(k, v);
  for (const s of Object.values(STORES)) s._resetForTests();   // pending, as at a cold start
  await hydrateAllStores();
  await clearLegacyLs();
});

describe("a reader's data written by main 53ae2f891, opened by this build", () => {
  it('every store main wrote loads in this build, record for record', () => {
    const byName = new Map(registeredStores().map((s) => [s._idbStoreName, s]));
    const names = Object.keys(MAIN.idb).filter((n) => n !== 'meta' && n !== 'vot-journal-stats');
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (const name of names) {
      const store = byName.get(name);
      expect(store, name + ' has no store in this build').toBeTruthy();
      expect(store._state, name).toBe('loaded');
      expect(clone(store._load()), name).toEqual(MAIN.idb[name].v);
    }
  });

  it('the boot writes nothing over it: the database after boot is the database main left', async () => {
    for (const s of registeredStores()) await s.whenSaved();
    expect(await dumpIdb()).toEqual(MAIN.idb);
  });

  it("the legacy sweep has already run for this reader and leaves main's localStorage keys alone", () => {
    for (const [k, v] of Object.entries(MAIN.localStorage)) expect(localStorage.getItem(k), k).toBe(v);
  });

  it('settings: every value the reader had is kept; only the retired top-bar switches leave, and only new keys arrive', () => {
    const saved = MAIN.idb['vot-state'].v.settings;
    const { result } = renderHook(() => useSettings({ savedSettings: clone(saved), theme: 'light' }));
    const now = result.current.settings;
    for (const k of RETIRED_BY_OVERHAUL) expect(RETIRED_SETTINGS).toContain(k);
    for (const [k, v] of Object.entries(saved)) {
      if (RETIRED_BY_OVERHAUL.includes(k)) { expect(k in now, k).toBe(false); continue; }
      expect(now[k], k).toEqual(v);
    }
    const added = Object.keys(now).filter((k) => !(k in saved)).sort();
    expect(added).toEqual(['copyLetters', 'copyScripture', 'keepStarred', 'shareLetters', 'shareScripture']);
    // The reader's own choices and main's defaults both stand: the Reading position marker stays on for them
    // (its default is off only for a profile with nothing stored).
    expect(now.showReadingDot).toBe(true);
    expect(now.fontScale).toBe('1.3');
    expect(now.showScrollNotch).toBe(false);
    expect(now.answersReadingPath).toBe(false);
    expect(now.touched).toEqual(saved.touched);
  });

  it('read state, notes, highlights, bookmarks, plans and downloads read back as main wrote them', () => {
    const st = StateStore.get();
    expect(st.readItems).toEqual(MAIN.idb['vot-state'].v.readItems);
    expect(st.lastReadChapters).toEqual({ psalms: 23, matthew: 5 });
    expect(st.lastReadLetterMap).toEqual({ 'volume-one': 'the-wide-path' });
    expect(NoteStore.get('g2').color).toBe('blank');
    expect(NoteStore.get('g1').notebookIds).toEqual([NotebookStore.list()[0].id]);
    expect(AnnotationStore.get('bible:psalms:23:1').map((a) => a.color)).toEqual(['green']);
    expect(BookmarkStore.get('bm1').label).toBe('The Lord is my shepherd');
    expect(HistoryStore.list()).toHaveLength(2);
    expect(ReadingStatsStore.getProgress('v1:psalms:23').c).toHaveLength(6);
    expect(ReadingPlanStore.all().map((r) => r.status)).toEqual(['running', 'paused']);
    expect(ReadingPlanStore.active()).toHaveLength(2);
    expect(ReadingPlanStore.holds('psalms', 2)).toBe(true);
    expect(AudioLibraryStore.saved().map((t) => t.title)).toEqual(['The Wide Path']);
    expect(AudioPositionsStore.getPosition(AudioLibraryStore.saved()[0])).toBeTruthy();
    expect(LinkStore.all()).toHaveLength(1);
    expect(NoteDefaultStore.get()).toEqual({ style: 'highlight', color: 'green' });
  });
});
