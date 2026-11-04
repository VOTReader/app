// @ts-nocheck — rows reach each store through a loose table
/* Every store the reader writes, against the three things that interrupt a save (dl matrix, 2026-11-04).
   ───────────────────────────────────────────────────────────────────────────────────────────
   The round trip through Export and Import is utils/backup-roundtrip-matrix.test.js. This is the
   rest of the matrix, one row per store, each a real store module over fake-indexeddb:

     quota   the device is full when the save runs (QuotaExceededError). The edit stays on screen,
             Export says one change may be missing, StorageHealth is told (its banner asks the
             reader to export), and once there is room the store's own retry puts it on disk.
     reload  the page goes away while the save is in flight (the browser aborts the transaction).
             What was saved before is still there, whole: never half-written, never empty. The edit
             that was in flight is what a reload a few milliseconds sooner would have lost; the
             writing surfaces keep their own synchronous copy for exactly that (the journal's
             JRNL-1 draft, the note draft, NoteSheet.draft.test.jsx; vot-state's resume record).
     2 tabs  two PWA tabs, each holding the copy it loaded, write the same store. A store the
             reader adds to keeps both tabs' additions (the merge stores, dl2 included). A store
             that holds one choice (a position, an arrangement, a preference) keeps the last
             tab's choice whole, by design; the audio stores are listed in the PR (not this area).

   Each "tab" or "launch" is a fresh copy of the store modules (vi.resetModules) with its own
   IndexedDB connection, over one shared database: the topology of real browser tabs. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const DAY = 86400000;
const D0 = new Date(2026, 10, 2, 12, 0, 0).getTime();
const AUDIO = 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/';

/* One row per store: open(tab) → the store; write(store, tag); has(store, tag); merge: does a
   second tab's write keep the first tab's (true), or is the store one last-chosen value (false). */
const ROWS = [
  { name: 'vot-annotations', mod: './annotation-store.js', exp: 'AnnotationStore', merge: true,
    write: (s, t) => s.add('bible:john:3:' + t.length, { id: 'a_' + t, start: 0, end: 3, text: 'For' }),
    has: (s, t) => s.get('bible:john:3:' + t.length).some((a) => a.id === 'a_' + t) },
  { name: 'vot-notes', mod: './note-store.js', exp: 'NoteStore', merge: true,
    write: (s, t) => s.set('g_' + t, { body: 'note ' + t, keys: [] }), has: (s, t) => !!s.get('g_' + t) && s.get('g_' + t).body === 'note ' + t },
  { name: 'vot-bookmarks', mod: './bookmark-store.js', exp: 'BookmarkStore', merge: true,
    write: (s, t) => s.add({ id: 'b_' + t, hlKey: 'bible:psalms:23:' + t.length, label: t }), has: (s, t) => !!s.get('b_' + t) },
  { name: 'vot-links', mod: './link-store.js', exp: 'LinkStore', merge: true,
    write: (s, t) => s.add({ id: 'l_' + t, source: { type: 'bible', key: 'bible:john:1:' + t.length, label: 'a' }, target: { type: 'bible', key: 'bible:john:2:' + t.length, label: 'b' }, created: D0 }),
    has: (s, t) => s.all().some((l) => l.id === 'l_' + t) },
  { name: 'vot-reading-plans', mod: './reading-plan-store.js', exp: 'ReadingPlanStore', merge: true,
    write: (s, t) => s.put({ id: 'r_' + t, plan: 'gospels', start: '2026-11-01', segs: [], tracks: [{ items: [] }], status: 'running', ticks: {}, created: D0, updated: D0 }),
    has: (s, t) => !!s.get('r_' + t) },
  { name: 'vot-notebooks', mod: './notebook-store.js', exp: 'NotebookStore', merge: true,
    write: (s, t) => s.add('Notebook ' + t), has: (s, t) => s.list().some((n) => n.name === 'Notebook ' + t) },
  { name: 'vot-journal', mod: './journal-store.js', exp: 'JournalStore', merge: true,
    write: (s, t) => s.add({ id: 'j_' + t, title: 'Entry ' + t, blocks: [{ id: 'p_' + t, type: 'p', text: t }] }), has: (s, t) => !!s.get('j_' + t) },
  { name: 'vot-journal-notebooks', mod: './journal-store.js', exp: 'JournalNotebookStore', merge: true,
    write: (s, t) => s.add('Journal book ' + t), has: (s, t) => s.list().some((n) => n.name === 'Journal book ' + t) },
  { name: 'vot-journal-index', mod: './journal-index-store.js', exp: 'JournalIndexStore', merge: true,
    write: (s, t) => s.rebuildForEntry('j_' + t, ['chapter:psalms:' + t.length]), has: (s, t) => s.entriesReferencing('chapter:psalms:' + t.length).includes('j_' + t) },
  { name: 'vot-journal-stats', mod: './journal-stats-store.js', exp: 'JournalStatsStore', merge: true, tally: true,
    write: (s) => s.recordNewEntry(D0), count: (s) => s.get().totalEntries || 0 },
  { name: 'vot-reading-streak', mod: './reading-streak-store.js', exp: 'ReadingStreakStore', merge: true, tally: true,
    write: (s, t) => s.recordReadingDay(D0 + ({ a: 0, b: 1, bb: 2 }[t] || 0) * DAY), count: (s) => s.get().totalDays || 0 },
  { name: 'vot-reading-stats', mod: './reading-stats-store.js', exp: 'ReadingStatsStore', merge: true, tally: true,
    write: (s, t) => s.recordCompletion({ key: 'v1:john:' + t.length, words: 100, activeMs: 30000, ts: D0 }), count: (s) => (s.get().totalWordsRead || 0) / 100 },
  { name: 'vot-history', mod: './history-store.js', exp: 'HistoryStore', merge: true,
    write: (s, t) => s.add({ type: 'letter', letterId: 'letter-' + t }), has: (s, t) => s.list().some((e) => e && e.letterId === 'letter-' + t) },
  { name: 'vot-state', mod: './state-store.js', exp: 'StateStore', merge: true,
    write: (s, t) => s.set({ ...(s.get() || {}), readItems: { ...((s.get() || {}).readItems || {}), ['v1:john:' + t.length]: 1 } }),
    has: (s, t) => !!((s.get() || {}).readItems || {})['v1:john:' + t.length] },
  { name: 'vot-garden-pos', mod: './garden-pos-store.js', exp: 'GardenPosStore', merge: false,
    write: (s, t) => s.set(t.length * 10), has: (s, t) => s.get() === t.length * 10 },
  { name: 'vot-recent-nav', mod: './recent-nav-store.js', exp: 'RecentNavStore', merge: false,
    write: (s, t) => s.add({ kind: 'letter', letterId: 'letter-' + t, title: t }), has: (s, t) => s.list().some((e) => e.letterId === 'letter-' + t) },
  { name: 'vot-prophecy-cards', mod: './prophecy-cards-store.js', exp: 'ProphecyCardsStore', merge: false,
    write: (s, t) => s.setAll({ ...s.getAll(), ['card:' + t]: false }), has: (s, t) => s.getAll()['card:' + t] === false },
  { name: 'vot-home-order', mod: './home-order-store.js', exp: 'HomeOrderStore', merge: false,
    write: (s, t) => s.set(t === 'a' ? ['library', 'volumes'] : ['history', 'volumes']), has: (s, t) => s.get()[0] === (t === 'a' ? 'library' : 'history') },
  { name: 'vot-library-order', mod: './library-order-store.js', exp: 'LibraryOrderStore', merge: false,
    write: (s, t) => s.set(t === 'a' ? ['notes', 'journal'] : ['journal', 'notes']), has: (s, t) => s.get()[0] === (t === 'a' ? 'notes' : 'journal') },
  { name: 'vot-note-default', mod: './note-default-store.js', exp: 'NoteDefaultStore', merge: false,
    write: (s, t) => s.set('underline', t === 'a' ? 'green' : 'blue'), has: (s, t) => s.get().color === (t === 'a' ? 'green' : 'blue') },
  { name: 'vot-audio-library', mod: './audio-library-store.js', exp: 'AudioLibraryStore', merge: false,
    write: (s, t) => s.setPlaybackRate(t === 'a' ? 1.25 : 1.5), has: (s, t) => s.getPlaybackRate() === (t === 'a' ? 1.25 : 1.5) },
  { name: 'vot-audio-positions', mod: './audio-positions-store.js', exp: 'AudioPositionsStore', merge: false,
    write: (s, t) => s.setPosition({ url: AUDIO + 'track_' + t + '.mp3' }, 60, 600), has: (s, t) => !!s.get().positions[AUDIO + 'track_' + t + '.mp3'] },
  ...['vot-welcomed', 'vot-about-seen', 'vot-garden-warning-acked', 'vot-ann-hint-dismissed', 'vot-tour-done'].map((name) => ({
    name, mod: './app-flag-stores.js', flag: true,
    exp: { 'vot-welcomed': 'WelcomedFlagStore', 'vot-about-seen': 'AboutSeenFlagStore', 'vot-garden-warning-acked': 'GardenWarningFlagStore',
      'vot-ann-hint-dismissed': 'AnnHintDismissedFlagStore', 'vot-tour-done': 'TourDoneFlagStore' }[name],
    merge: true, write: (s) => s.set(), has: (s) => s.is() === true,
  })),
];

/** Every tab a test opened, so their saves land before the next test deletes the database. */
const opened = [];

/** A tab (or a launch): fresh modules, the row's store loaded from the shared database. */
async function openTab(row) {
  vi.resetModules();
  const [mod, adapter, health] = await Promise.all([import(row.mod), import('./idb-adapter.js'), import('../utils/storage-health.js')]);
  const store = mod[row.exp];
  await store._hydrate();
  const tab = { store, IDBAdapter: adapter.IDBAdapter, StorageHealth: health.StorageHealth };
  opened.push(tab);
  return tab;
}

/** What a row's store holds for `tag`, read through a fresh launch. */
async function relaunchHas(row, tag) {
  const next = await openTab(row);
  await next.store.whenSaved();
  return row.tally ? row.count(next.store) : row.has(next.store, tag);
}

const deleteDb = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('votreader');
  req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined);
});

/** A put of `row`'s store that fails with `name` until `stop()` (other stores write as usual). */
function failPutsOf(tab, row, name) {
  const real = tab.IDBAdapter._putOnce;
  const spy = vi.spyOn(tab.IDBAdapter, '_putOnce').mockImplementation(function (store, key, value) {
    if (store !== row.name) return real.call(tab.IDBAdapter, store, key, value);
    const e = new Error(name === 'QuotaExceededError' ? 'The quota has been exceeded.' : 'Transaction aborted');
    e.name = name;
    return Promise.reject(e);
  });
  return () => spy.mockRestore();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(D0 + 1000);
  localStorage.clear();
  await deleteDb();
});

afterEach(async () => {
  for (const tab of opened) {
    if (tab.store._writeRetryTimer != null) tab.store._clearWriteRetry();   // a page that "went away" retries nothing
  }
  await Promise.all(opened.map((tab) => tab.store.whenSaved()));
  opened.length = 0;
  vi.useRealTimers();
});

describe('store safety matrix — quota: the device is full when the save runs', () => {
  it.each(ROWS.map((r) => [r.name, r]))('%s: the edit stays on screen, Export is told, the retry saves it once there is room', async (_n, row) => {
    const tab = await openTab(row);
    const told = vi.spyOn(tab.StorageHealth, 'onWriteFailure');
    const stop = failPutsOf(tab, row, 'QuotaExceededError');
    row.write(tab.store, 'q');
    expect(await tab.store.whenSaved()).toBe(false);                       // Export: "1 recent change may be missing"
    expect(row.tally ? row.count(tab.store) : row.has(tab.store, 'q')).toBeTruthy();   // still on screen
    expect(told).toHaveBeenCalled();
    expect(tab.store._writeRetryTimer).not.toBeNull();                      // STORE-4: a retry is scheduled
    stop();                                                                 // room again
    tab.store._clearWriteRetry();
    tab.store._save();                                                      // the retry's own save
    expect(await tab.store.whenSaved()).toBe(true);
    expect(await relaunchHas(row, 'q')).toBeTruthy();
  });
});

describe('store safety matrix — reload: the page goes away while the save is in flight', () => {
  it.each(ROWS.map((r) => [r.name, r]))('%s: what was saved before is still there, whole', async (_n, row) => {
    const tab = await openTab(row);
    row.write(tab.store, 'a');
    expect(await tab.store.whenSaved()).toBe(true);
    const before = await tab.IDBAdapter.get(row.name, 'v');
    failPutsOf(tab, row, 'AbortError');                                     // the unload aborts it (and the retry of it)
    if (!row.flag) row.write(tab.store, 'bb');
    else tab.store.clear();
    expect(await tab.store.whenSaved()).toBe(false);
    tab.store._clearWriteRetry();                                           // the page is gone
    const next = await openTab(row);
    expect(await next.IDBAdapter.get(row.name, 'v')).toEqual(before);
    expect(row.tally ? row.count(next.store) : row.has(next.store, 'a')).toBeTruthy();
  });
});

describe('store safety matrix — two tabs write the same store', () => {
  it.each(ROWS.map((r) => [r.name + (r.merge ? '' : ' (one value: the last tab\'s choice, whole)'), r]))('%s', async (_n, row) => {
    const A = await openTab(row);
    const B = await openTab(row);                                           // B holds the copy it loaded
    row.write(A.store, 'a');
    expect(await A.store.whenSaved()).toBe(true);
    row.write(B.store, 'b');
    expect(await B.store.whenSaved()).toBe(true);
    const C = await openTab(row);
    await C.store.whenSaved();
    if (row.tally) { expect(row.count(C.store)).toBe(2); return; }
    expect(row.has(C.store, 'b')).toBe(true);
    if (row.merge) expect(row.has(C.store, 'a')).toBe(true);
  });
});
