// @ts-nocheck — tests build partial records and fake files
/* The reader's data through Export and Import, store by store (dl matrix, 2026-11-04).
   ─────────────────────────────────────────────────────────────────────────────────
   Every store the backup carries (backup-flow.js _exportableStores + _flagStores,
   which user-data-parity.test.js holds to IDBAdapter.STORE_NAMES), filled the way the
   app fills it, saved, exported, the device wiped (database deleted, media emptied,
   localStorage cleared), imported, then every cache and connection dropped and read
   back from disk. What is on disk after must deep-equal what was on disk before, store
   by store, and the photos and voice memos byte for byte.

   The rows are the stores; the columns are the cases:
     v3   the .votbak container both platforms write today (writeContainer → readContainer → applyV3)
     v2   the JSON backup every older build wrote (buildExportPayload → JSON → applyImportPayload)
     v1   the first, localStorage-era JSON (each store a JSON string under `data`)
     empty, large, unicode and emoji, media, an entry saved mid-edit
   and the refusals: a cut or garbled file, another app's file, a newer build's file,
   one bad section, a damaged media table. A refusal must leave the device's data
   exactly as it was (compared deep-equal against the snapshot taken before).

   Node's Blob replaces jsdom's before fake-indexeddb loads, so media blobs keep their
   bytes through the structured clone (backup.test.js does the same). */

import { Blob as NodeBlob } from 'node:buffer';
/** @type {any} */ (globalThis).Blob = NodeBlob;

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import { buildExportPayload, applyImportPayload, buildV3Manifest, applyV3 } from './backup.js';
import { writeContainer, readContainer } from './backup-container.js';
import { validateStorePayload, validateImportEnvelope, validateMediaRecord, isNewerBackup } from './import-validators.js';

import { IDBAdapter } from '../stores/idb-adapter.js';
import { hydrateAllStores } from '../stores/cached-store.js';
import { JournalMediaStore } from '../stores/journal-media-store.js';
import { AnnotationStore } from '../stores/annotation-store.js';
import { NoteStore } from '../stores/note-store.js';
import { BookmarkStore } from '../stores/bookmark-store.js';
import { LinkStore } from '../stores/link-store.js';
import { NotebookStore } from '../stores/notebook-store.js';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';
import { JournalStore, JournalNotebookStore } from '../stores/journal-store.js';
import { JournalIndexStore } from '../stores/journal-index-store.js';
import { JournalStatsStore } from '../stores/journal-stats-store.js';
import { ReadingStreakStore } from '../stores/reading-streak-store.js';
import { ReadingStatsStore } from '../stores/reading-stats-store.js';
import { GardenPosStore } from '../stores/garden-pos-store.js';
import { RecentNavStore } from '../stores/recent-nav-store.js';
import { HistoryStore } from '../stores/history-store.js';
import { ProphecyCardsStore } from '../stores/prophecy-cards-store.js';
import { HomeOrderStore } from '../stores/home-order-store.js';
import { LibraryOrderStore } from '../stores/library-order-store.js';
import { NoteDefaultStore } from '../stores/note-default-store.js';
import { StateStore } from '../stores/state-store.js';
import { AudioLibraryStore } from '../stores/audio-library-store.js';
import { AudioPositionsStore } from '../stores/audio-positions-store.js';
import {
  WelcomedFlagStore, AboutSeenFlagStore, GardenWarningFlagStore, AnnHintDismissedFlagStore, TourDoneFlagStore,
} from '../stores/app-flag-stores.js';
import { AUDIO_RELEASE_PREFIX } from './audio-track.js';

/* ── The backup's own two lists (backup-flow.js), with the real stores ── */
const storesMap = () => ({
  'vot-annotations':       { store: AnnotationStore,      method: 'replaceAll' },
  'vot-notes':             { store: NoteStore,            method: 'replaceAll' },
  'vot-bookmarks':         { store: BookmarkStore,        method: 'replaceAll' },
  'vot-links':             { store: LinkStore,            method: 'replaceAll' },
  'vot-reading-plans':     { store: ReadingPlanStore,     method: 'replaceAll' },
  'vot-notebooks':         { store: NotebookStore,        method: 'replaceAll' },
  'vot-journal':           { store: JournalStore,         method: 'replaceAll' },
  'vot-journal-notebooks': { store: JournalNotebookStore, method: 'replaceAll' },
  'vot-journal-index':     { store: JournalIndexStore,    method: 'replaceAll' },
  'vot-journal-stats':     { store: JournalStatsStore,    method: 'replaceAll' },
  'vot-reading-streak':    { store: ReadingStreakStore,   method: 'replaceAll' },
  'vot-reading-stats':     { store: ReadingStatsStore,    method: 'replaceAll' },
  'vot-garden-pos':        { store: GardenPosStore,       method: 'replaceAll' },
  'vot-recent-nav':        { store: RecentNavStore,       method: 'replaceAll' },
  'vot-history':           { store: HistoryStore,         method: 'setAll' },
  'vot-prophecy-cards':    { store: ProphecyCardsStore,   method: 'setAll' },
  'vot-home-order':        { store: HomeOrderStore,       method: 'set' },
  'vot-library-order':     { store: LibraryOrderStore,    method: 'set' },
  'vot-note-default':      { store: NoteDefaultStore,     method: 'replaceAll' },
  'vot-state':             { store: StateStore,           method: 'set' },
  'vot-audio-library':     { store: AudioLibraryStore,    method: 'replaceAll' },
  'vot-audio-positions':   { store: AudioPositionsStore,  method: 'replaceAll' },
});
const flagMap = () => ({
  'vot-welcomed':             WelcomedFlagStore,
  'vot-about-seen':           AboutSeenFlagStore,
  'vot-garden-warning-acked': GardenWarningFlagStore,
  'vot-ann-hint-dismissed':   AnnHintDismissedFlagStore,
  'vot-tour-done':            TourDoneFlagStore,
});
const STORE_NAMES = Object.keys(storesMap());
const FLAG_NAMES = Object.keys(flagMap());
const ALL = [...Object.values(storesMap()).map((e) => e.store), ...Object.values(flagMap())];
const importCtx = () => ({ storesMap: storesMap(), flagMap: flagMap(), mediaStore: JournalMediaStore, validateStorePayload, validateMediaRecord });
const exportCtx = () => ({
  storesMap: storesMap(), flagMap: flagMap(), idbAdapter: IDBAdapter, mediaStore: JournalMediaStore,
  diagnosticLog: [], nowIso: () => '2026-11-04T08:00:00.000Z', storageEstimate: async () => ({ quota: null, usage: null }),
});

/* ── device helpers ── */
const deleteDb = (name) => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase(name);
  req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined);
});
const flush = () => Promise.all(ALL.map((s) => s.whenSaved()));

/** Drop every cache and connection, then read every store back from disk (an app relaunch). */
async function relaunch() {
  await flush();
  ALL.forEach((s) => s._resetForTests());
  IDBAdapter._resetForTests();
  await hydrateAllStores();
  await flush();                        // each load ends in a save; let it land
}

/** A device with nothing on it: database gone, media gone, localStorage empty, stores loaded empty. */
async function wipeDevice() {
  await flush();
  IDBAdapter._resetForTests();
  await deleteDb('votreader');
  await JournalMediaStore.pruneOrphans([]);
  localStorage.clear();
  ALL.forEach((s) => s._resetForTests());
  await hydrateAllStores();
  await flush();
}

/** What is on disk: each store's record, and every media record with its bytes. */
async function diskSnapshot() {
  const stores = {};
  for (const name of [...STORE_NAMES, ...FLAG_NAMES]) stores[name] = await IDBAdapter.get(name, 'v');
  const media = {};
  for (const id of (await JournalMediaStore.allIds()).sort()) {
    const r = await JournalMediaStore.get(id);
    media[id] = {
      type: r.type, mime: r.mime, size: r.size, width: r.width, height: r.height, duration: r.duration, created: r.created,
      bytes: Array.from(new Uint8Array(await r.blob.arrayBuffer())),
    };
  }
  return { stores, media };
}

/**
 * `after` less the fields it gained that `before` never had and that hold only an empty
 * default ([] or {}): a store first written by its own writer can lack a field its
 * restore fills in empty (journal stats' retired milestone ledger), which loses nothing.
 * Everything `before` held is still compared whole.
 */
function withoutAddedEmpties(after, before) {
  if (!after || typeof after !== 'object' || Array.isArray(after) || !before || typeof before !== 'object' || Array.isArray(before)) return after;
  const out = {};
  for (const k of Object.keys(after)) {
    const v = after[k];
    const emptyDefault = (Array.isArray(v) && v.length === 0) || (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
    if (!(k in before) && emptyDefault) continue;
    out[k] = (k in before) ? withoutAddedEmpties(v, before[k]) : v;
  }
  return out;
}

/** Each store compared on its own, so a failure names the store. */
function expectSameDisk(after, before) {
  for (const name of Object.keys(before.stores)) {
    expect({ store: name, value: withoutAddedEmpties(after.stores[name], before.stores[name]) }).toEqual({ store: name, value: before.stores[name] });
  }
  expect(Object.keys(after.media)).toEqual(Object.keys(before.media));
  for (const id of Object.keys(before.media)) expect({ media: id, ...after.media[id] }).toEqual({ media: id, ...before.media[id] });
}

/* ── the export / import paths ── */
async function exportV3() {
  const built = await buildV3Manifest(exportCtx());
  expect(built.ok).toBe(true);
  const chunks = [];
  await writeContainer(built.manifest, built.mediaEntries, (u8) => chunks.push(u8.slice()));
  return { built, file: new NodeBlob(chunks) };
}
async function importV3(file) {
  const read = await readContainer(file);
  expect(validateImportEnvelope(read.manifest)).toEqual([]);
  const res = await applyV3(read.manifest, read.entries, importCtx());
  return { read, res };
}
async function exportV2() {
  const built = await buildExportPayload(exportCtx());
  expect(built.ok).toBe(true);
  return JSON.stringify(built.payload);
}
async function importV2(text) {
  const parsed = JSON.parse(text);
  expect(validateImportEnvelope(parsed, { json: true })).toEqual([]);
  return applyImportPayload(parsed, importCtx());
}
const CLEAN = { importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] };

/* ── what a reader writes ── */
const DAY = '2026-11-03';
const T = Date.UTC(2026, 10, 3, 15, 0, 0);
const POS_URL = AUDIO_RELEASE_PREFIX + 'vol2_the-wide-path.mp3';

/** Words a reader might write: emoji (with joiners and skin tones), right-to-left, CJK, combining marks, astral, quotes. */
const WORDS = [
  'Thank You, Lord 🙏🏽 for the morning — and for "the Way" ‘that is narrow’',
  'שָׁלוֹם and سلام side by side; 平安 too',
  'é (a combining accent), 𝔊𝔬𝔡 is 𝒻𝒶𝒾𝓉𝒽𝒻𝓊𝓁, 👨‍👩‍👧‍👦 the family',
  'a back\\slash, a tab\tand a newline\nkept as typed, </script> and all',
];

/**
 * A reader's library as the app's own writers leave it on disk, one record per store;
 * `opts.big` is a heavy reader's. Written straight to the database (never through the
 * restore's own replace methods, or a field those dropped would be missing from both
 * sides of the comparison), then the app is relaunched onto it.
 */
function libraryRecords(opts = {}) {
  const big = !!opts.big;
  const annotations = {};
  const nAnn = big ? 3000 : 3;
  for (let i = 0; i < nAnn; i++) {
    const key = 'bible:psalms:' + (1 + (i % 150)) + ':' + (1 + Math.floor(i / 150));
    (annotations[key] = annotations[key] || []).push({
      id: 'ann_' + i, groupId: i % 7 === 0 ? 'grp_note_' + i : 'ann_' + i, kind: i % 7 === 0 ? 'note' : (i % 3 ? 'highlight' : 'underline'),
      color: ['yellow', 'green', 'blue'][i % 3], start: 0, end: 12, text: WORDS[i % WORDS.length].slice(0, 12), created: T + i, updated: T + i,
    });
  }
  const notes = {};
  for (let i = 0; i < nAnn; i += 7) {
    notes['grp_note_' + i] = { groupId: 'grp_note_' + i, notebookIds: ['nb_1'], body: WORDS[i % WORDS.length] + ' #' + i, color: 'yellow',
      fullText: WORDS[0], keys: ['bible:psalms:' + (1 + (i % 150)) + ':' + (1 + Math.floor(i / 150))], created: T + i, updated: T + i + 1 };
  }
  const bookmarks = [];
  for (let i = 0; i < (big ? 1500 : 2); i++) {
    bookmarks.push({ id: 'bkm_' + i, hlKey: 'letter:the-wide-path:' + i, label: 'The Wide Path ¶' + i, thought: WORDS[i % WORDS.length], created: T + i, updated: T + i });
  }
  const entries = [];
  for (let i = 0; i < (big ? 600 : 2); i++) {
    const text = big ? (WORDS[i % WORDS.length] + ' ').repeat(40) : WORDS[i % WORDS.length];
    const blocks = [{ id: 'b_' + i + '_p', type: 'p', text }];
    if (!big && i === 0) {
      blocks.push({ id: 'b_0_img', type: 'image', mediaId: 'm_img', caption: 'The garden 🌸' });
      blocks.push({ id: 'b_0_aud', type: 'audio', mediaId: 'm_aud', duration: 3, caption: '', samples: [0.1, 0.5, 0.2] });
    }
    entries.push({ id: 'j_' + i, title: 'Entry ' + i + ' ✝', blocks, mood: null, tags: ['prayer'], notebookIds: ['jnb_1'], pinned: i === 0, created: T + i, updated: T + i });
  }
  const visits = [];
  for (let i = 0; i < (big ? 2000 : 2); i++) visits.push({ type: 'chapter', bookId: 'psalms', chapterNum: 1 + (i % 150), key: 'ch:psalms:' + (1 + (i % 150)), ts: T - i * 1000 });
  return {
    'vot-annotations': annotations,
    'vot-notes': notes,
    'vot-bookmarks': bookmarks,
    'vot-links': [{ id: 'lnk_1', source: { type: 'bible', key: 'bible:john:3:16', label: 'John 3:16' }, target: { type: 'letter', key: 'letter:the-wide-path:2', label: 'The Wide Path' }, created: T }],
    'vot-reading-plans': [{ id: 'run_1', plan: 'gospels', name: 'Gospels 🌿', start: '2026-10-01', status: 'running', segs: [[0, 2]], weekdays: [true, true, true, true, true, true, true],
      tracks: [{ items: [{ k: 'matthew-plain:1' }, { k: 'matthew-plain:2' }] }], ticks: { 'matthew-plain:1': '2026-10-01' }, created: T, updated: T }],
    'vot-notebooks': { list: [{ id: 'nb_1', name: 'Prayers 🙏', sortIndex: 0, created: T, updated: T }] },
    'vot-journal': { list: entries },
    'vot-journal-notebooks': { list: [{ id: 'jnb_1', name: 'Mornings', sortIndex: 0, created: T, updated: T }] },
    'vot-journal-index': { 'chapter:psalms:23': ['j_0'] },
    'vot-journal-stats': { totalEntries: entries.length, currentStreak: 2, longestStreak: 9, lastEntryDate: DAY, milestonesUnlocked: ['first'] },
    'vot-reading-streak': { currentStreak: 4, longestStreak: 21, lastReadDate: DAY, totalDays: 88 },
    'vot-reading-stats': { totalWordsRead: 123456, totalActiveMs: 7200000, totalCompletions: 57, rereads: 3,
      wordsByDay: { [DAY]: 4321 }, wpmSamples: [{ w: 300, ms: 60000 }], progress: { 'v1:romans:8': { b: 10, c: [0, 1, 2], t: T, w: 300, tw: 1000 } },
      milestonesUnlocked: ['read-first'] },
    'vot-garden-pos': { lastPage: 137 },
    'vot-recent-nav': [{ kind: 'letter', letterId: 'the-wide-path', title: 'The Wide Path', ts: T }],
    'vot-history': visits,
    'vot-prophecy-cards': { 'matthew-1:0:prophecy': true, 'matthew-2:3:prophecy': false },
    'vot-home-order': ['settings', 'library', 'history', 'volumes', 'scriptures', 'answers', 'studies', 'listening', 'songs'],
    'vot-library-order': ['bookmarks', 'notes', 'journal'],
    'vot-note-default': { style: 'underline', color: 'green' },
    'vot-state': { theme: 'light', settings: { fontStyle: 'modern', fontScale: '1.1', translation: 'nkjv' }, tabs: [{ id: 't1', screen: 'home' }],
      activeTabIdx: 0, readItems: { 'v1:psalms:23': 2, 'volume-two:the-wide-path': 1 }, lastReadChapters: { psalms: 23 }, lastReadLetterMap: {}, activeReadKey: null },
    'vot-audio-library': { v: 1, saved: [], recent: [], rate: 1.25, plays: 3, completions: 1, songSaved: [], songRecent: [], songKept: [] },
    'vot-audio-positions': { v: 1, positions: { [POS_URL]: { t: 90, d: 600, at: T } } },
    'vot-welcomed': true, 'vot-about-seen': false, 'vot-garden-warning-acked': true, 'vot-ann-hint-dismissed': true, 'vot-tour-done': true,
  };
}

async function fillLibrary(opts = {}) {
  const records = libraryRecords(opts);
  for (const name of Object.keys(records)) await IDBAdapter.put(name, 'v', records[name]);
  if (!opts.big) {
    await JournalMediaStore.put({ id: 'm_img', type: 'image', blob: new NodeBlob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 250, 0])], { type: 'image/jpeg' }),
      mime: 'image/jpeg', width: 4, height: 2, created: T });
    await JournalMediaStore.put({ id: 'm_aud', type: 'audio', blob: new NodeBlob([new Uint8Array(70000).map((_, i) => i % 251)], { type: 'audio/webm' }),
      mime: 'audio/webm', duration: 3, created: T });
  }
  await relaunch();
  // The app reads back exactly what was written: nothing in the fill is shaped wrong.
  const disk = await diskSnapshot();
  for (const name of Object.keys(records)) expect({ store: name, value: disk.stores[name] }).toEqual({ store: name, value: records[name] });
}

beforeEach(async () => {
  await wipeDevice();
});

/* ═══════════════════════════════════════════════════════════════════════
   The matrix: every store, every format, deep-equal on disk after a relaunch
   ═══════════════════════════════════════════════════════════════════════ */
describe('round-trip matrix: Export, wipe, Import, relaunch, compare (every store)', () => {
  it('covers every store the database declares except meta and offline-songs', () => {
    const covered = new Set([...STORE_NAMES, ...FLAG_NAMES]);
    const declared = IDBAdapter.STORE_NAMES.filter((n) => n !== 'meta' && n !== 'offline-songs');
    expect(declared.filter((n) => !covered.has(n))).toEqual([]);
    expect([...covered].filter((n) => !declared.includes(n))).toEqual([]);
  });

  it('v3 (.votbak): every store and both media deep-equal after the round trip', async () => {
    await fillLibrary();
    await relaunch();
    const before = await diskSnapshot();
    const { file } = await exportV3();
    await wipeDevice();
    const { read, res } = await importV3(file);
    expect(read.integrity).toBe('ok');
    expect(res).toEqual(CLEAN);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it('v2 (JSON, every older build): every store and both media deep-equal after the round trip', async () => {
    await fillLibrary();
    await relaunch();
    const before = await diskSnapshot();
    const text = await exportV2();
    await wipeDevice();
    expect(await importV2(text)).toEqual(CLEAN);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it('empty: a backup of a fresh device restores a fresh device, and replaces a full one', async () => {
    const before = await diskSnapshot();
    const { file } = await exportV3();
    await fillLibrary();                     // the reader's device now holds a library
    const { res } = await importV3(file);
    expect(res).toEqual(CLEAN);
    await relaunch();
    const after = await diskSnapshot();
    expect(after.media).toEqual({});
    for (const name of STORE_NAMES) {
      const v = after.stores[name];
      const empty = v == null || (Array.isArray(v) ? v.length === 0 : (typeof v === 'object' && (Array.isArray(v.list) ? v.list.length === 0 : true)));
      expect({ store: name, empty }).toEqual({ store: name, empty: true });
    }
    expect(after.stores['vot-welcomed']).toBe(before.stores['vot-welcomed'] || false);
  }, 30000);

  it('large: 600 journal entries, 3,000 marks, 1,500 bookmarks, 2,000 visits deep-equal (v3)', async () => {
    await fillLibrary({ big: true });
    await relaunch();
    const before = await diskSnapshot();
    expect(JSON.stringify(before.stores['vot-journal']).length).toBeGreaterThan(500000);   // stored in pieces (idb-chunks)
    const { file } = await exportV3();
    await wipeDevice();
    expect((await importV3(file)).res).toEqual(CLEAN);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 60000);

  it('unicode and emoji survive byte for byte in every text field (v3 and v2)', async () => {
    await fillLibrary();
    await relaunch();
    const before = await diskSnapshot();
    for (const [exp, imp] of [[async () => (await exportV3()).file, async (f) => (await importV3(f)).res], [exportV2, importV2]]) {
      const file = await exp();
      await wipeDevice();
      expect(await imp(file)).toEqual(CLEAN);
      await relaunch();
      const after = await diskSnapshot();
      expect(after.stores['vot-journal'].list.map((e) => e.blocks[0].text)).toEqual(WORDS.slice(0, 2));
      expect(after.stores['vot-notes'].grp_note_0.body).toBe(WORDS[0] + ' #0');
      expect(after.stores['vot-bookmarks'].map((b) => b.thought)).toEqual(WORDS.slice(0, 2));
      expectSameDisk(after, before);
    }
  }, 30000);

  it('a library written by the app\'s own writers (not by a restore) deep-equals after the round trip', async () => {
    // Every store reached the way the reader reaches it: add, update, record, tick.
    const e = JournalStore.add({ title: 'Psalm 23 ☀', blocks: [{ type: 'p', text: WORDS[0] }] });
    JournalStore.update(e.id, { blocks: [{ type: 'p', text: WORDS[1] }, { type: 'p', text: WORDS[2] }] });
    JournalStore.setPinned(e.id, true);
    const jnb = JournalNotebookStore.add('Mornings 🌅');
    JournalStore.toggleNotebook(e.id, jnb.id);
    JournalStatsStore.recordNewEntry(e.created);
    AnnotationStore.add('bible:psalms:23:1', { id: 'a1', start: 0, end: 13, text: 'The LORD is m' });
    AnnotationStore.recolorGroup('a1', 'blue');
    AnnotationStore.add('bible:psalms:23:4', { id: 'a2', groupId: 'g2', kind: 'note', start: 4, end: 20, text: 'though I walk' });
    NoteStore.set('g2', { body: WORDS[3], keys: ['bible:psalms:23:4'], fullText: 'though I walk' });
    const nb = NotebookStore.add('Comfort');
    NoteStore.toggleNotebook('g2', nb.id);
    BookmarkStore.add({ id: 'bk1', hlKey: 'bible:psalms:23:1:0-13', label: 'Psalm 23:1' });
    BookmarkStore.update('bk1', { thought: WORDS[0] });
    LinkStore.add({ id: 'l1', source: { type: 'bible', key: 'bible:psalms:23:1', label: 'Psalm 23:1' }, target: { type: 'journal', key: 'journal:' + e.id + ':0', entryId: e.id, label: 'Psalm 23' }, created: T });
    ReadingPlanStore.put({ id: 'run_w', plan: 'psalms', start: '2026-11-01', status: 'running', segs: [], weekdays: [true, true, true, true, true, true, true],
      tracks: [{ items: [{ k: 'v1:psalms:23' }, { k: 'v1:psalms:24' }] }], ticks: {}, created: T, updated: T });
    ReadingPlanStore.noteRead('v1:psalms', 23);
    ReadingStreakStore.recordReadingDay();
    ReadingStatsStore.recordCompletion({ key: 'v1:psalms:23', words: 118, activeMs: 40000 });
    ReadingStatsStore.recordProgress('v1:psalms:119', 22, [0, 1, 2], [40, 40, 40, ...new Array(19).fill(40)]);
    ReadingStatsStore.recordPaceSample({ words: 500, activeMs: 120000, requiredMs: 60000 });
    HistoryStore.add({ type: 'chapter', bookId: 'psalms', chapterNum: 23 });
    HistoryStore.add({ type: 'letter', letterId: 'the-wide-path', letterTitle: 'The Wide Path' });
    RecentNavStore.add({ kind: 'chapter', bookId: 'psalms', chapter: 23, title: 'Psalm 23' });
    ProphecyCardsStore.setOne('matthew-1:0:prophecy', false);
    GardenPosStore.set(12);
    HomeOrderStore.set(['library', 'volumes', 'scriptures']);
    LibraryOrderStore.set(['journal', 'notes']);
    NoteDefaultStore.set('squiggle', 'blue');
    StateStore.set({ theme: 'dark', settings: { fontStyle: 'classic', fontScale: '1.2' }, tabs: [{ id: 't1', screen: 'bible' }], activeTabIdx: 0,
      readItems: { 'v1:psalms:23': 1 }, lastReadChapters: { psalms: 23 }, lastReadLetterMap: {}, activeReadKey: 'v1' });
    AudioPositionsStore.setPosition({ url: POS_URL }, 75, 600);
    AudioLibraryStore.setPlaybackRate(1.5);
    AudioLibraryStore.countPlay();
    WelcomedFlagStore.set(); TourDoneFlagStore.set();
    await relaunch();
    const before = await diskSnapshot();
    expect(before.stores['vot-journal'].list[0].pinned).toBe(true);
    expect(Object.keys(before.stores['vot-reading-plans'][0].ticks)).toEqual(['v1:psalms:23']);
    const { file } = await exportV3();
    await wipeDevice();
    expect((await importV3(file)).res).toEqual(CLEAN);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it('an entry saved mid-edit (its write still in flight) is in the backup', async () => {
    await fillLibrary();
    JournalStore.update('j_0', { title: 'Written just before Export 🕯' });   // not awaited: Export starts at once
    NoteStore.update('grp_note_0', { body: 'the last words typed' });
    const { file } = await exportV3();
    await wipeDevice();
    expect((await importV3(file)).res).toEqual(CLEAN);
    await relaunch();
    expect(JournalStore.get('j_0').title).toBe('Written just before Export 🕯');
    expect(NoteStore.get('grp_note_0').body).toBe('the last words typed');
  }, 30000);
});

/* ═══════════════════════════════════════════════════════════════════════
   Older export versions
   ═══════════════════════════════════════════════════════════════════════ */
describe('older backups import', () => {
  it('v1 (the localStorage-era JSON: each store a JSON string under data) restores every store it carried', async () => {
    const v1 = {
      app: 'VOTReader', exportDate: '2026-05-01T10:00:00.000Z',      // no exportVersion: v1
      data: {
        'vot-state': JSON.stringify({ theme: 'light', settings: { fontStyle: 'modern' } }),
        'vot-annotations': JSON.stringify({ 'bible:john:3:16': [{ id: 'a1', groupId: 'a1', kind: 'highlight', color: 'yellow', start: 0, end: 3, text: 'For', created: 1, updated: 1 }] }),
        'vot-notes': JSON.stringify({ g1: { groupId: 'g1', notebookIds: [], body: 'old note ✨', color: 'yellow', fullText: '', keys: ['bible:john:3:16'], created: 1, updated: 1 } }),
        'vot-bookmarks': JSON.stringify([{ id: 'b1', hlKey: 'bible:john:3:16', label: 'John 3:16', created: 1, updated: 1 }]),
        'vot-journal': JSON.stringify({ list: [{ id: 'j1', title: 'Old entry', blocks: [{ id: 'b1', type: 'p', text: 'kept' }], mood: null, tags: [], notebookIds: [], pinned: false, created: 1, updated: 1 }] }),
        'vot-history': JSON.stringify([{ type: 'letter', letterId: 'the-wide-path', ts: 5 }]),
        'vot-welcomed': '1',
      },
    };
    expect(validateImportEnvelope(v1, { json: true })).toEqual([]);
    const res = await applyImportPayload(JSON.parse(JSON.stringify(v1)), importCtx());
    expect(res).toEqual(CLEAN);
    await relaunch();
    expect(AnnotationStore.get('bible:john:3:16')[0].text).toBe('For');
    expect(NoteStore.get('g1').body).toBe('old note ✨');
    expect(BookmarkStore.get('b1').label).toBe('John 3:16');
    expect(JournalStore.get('j1').blocks[0].text).toBe('kept');
    expect(HistoryStore.list()[0]).toMatchObject({ letterId: 'the-wide-path', key: 'lt:the-wide-path', ts: 5 });
    expect(WelcomedFlagStore.is()).toBe(true);
    expect(StateStore.get().theme).toBe('light');
  }, 30000);

  it('v2 written before countsVersion (journal counted as 1) restores and reconciles cleanly', async () => {
    await fillLibrary();
    await relaunch();
    const before = await diskSnapshot();
    const payload = JSON.parse(await exportV2());
    delete payload.countsVersion;
    for (const name of Object.keys(payload.counts)) {
      if (name === '_media') continue;
      const v = payload.stores[name];
      payload.counts[name] = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1);
    }
    await wipeDevice();
    expect(await importV2(JSON.stringify(payload))).toEqual(CLEAN);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it('a v3 container with no trailing checksum (the first v3 builds) restores in full', async () => {
    await fillLibrary();
    await relaunch();
    const before = await diskSnapshot();
    const { file } = await exportV3();
    const noCrc = file.slice(0, file.size - 4);
    await wipeDevice();
    const { read, res } = await importV3(noCrc);
    expect(read.integrity).toBe('absent');
    expect(res).toEqual(CLEAN);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);
});

/* ═══════════════════════════════════════════════════════════════════════
   Refusals: the device's data stays exactly as it was
   ═══════════════════════════════════════════════════════════════════════ */
describe('a damaged or foreign file leaves the device untouched', () => {
  /** The reader's library, on disk, before the bad file is tried. */
  async function libraryOnDisk() {
    await fillLibrary();
    await relaunch();
    return diskSnapshot();
  }

  it('a .votbak cut inside its index is refused before anything is written', async () => {
    const { file } = await exportV3();       // a backup of an empty device…
    const before = await libraryOnDisk();    // …tried on a full one
    await expect(readContainer(file.slice(0, 40))).rejects.toThrow(/truncated manifest|too small/);
    await expect(readContainer(file.slice(0, 10))).rejects.toThrow(/too small/);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it('a file that is not a .votbak (bad magic, garbled index) is refused', async () => {
    const before = await libraryOnDisk();
    await expect(readContainer(new NodeBlob([new TextEncoder().encode('NOTABACKUPATALL-and-some-more-bytes')]))).rejects.toThrow(/bad magic/);
    const { file } = await exportV3();
    const bytes = new Uint8Array(await file.arrayBuffer());
    bytes[16] = 0x7b; bytes[17] = 0x7b;      // the index's first characters: no longer JSON
    await expect(readContainer(new NodeBlob([bytes]))).rejects.toThrow(/not valid JSON/);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it('a cut JSON backup does not parse, and nothing is applied', async () => {
    await fillLibrary();
    await relaunch();
    const text = await exportV2();
    const before = await diskSnapshot();
    expect(() => JSON.parse(text.slice(0, Math.floor(text.length / 2)))).toThrow();
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it("another app's file, a newer build's backup, and a v3 index saved as JSON are refused by the envelope", async () => {
    expect(validateImportEnvelope({ app: 'SomethingElse', exportVersion: 2, data: {} })).not.toEqual([]);
    const newer = { app: 'VOTReader', exportVersion: 4, data: {}, stores: {}, media: [] };
    expect(validateImportEnvelope(newer)).not.toEqual([]);
    expect(isNewerBackup(newer)).toBe(true);
    expect(validateImportEnvelope({ app: 'VOTReader', exportVersion: 3, data: {}, stores: {}, media: [] }, { json: true })).not.toEqual([]);
    await expect(applyImportPayload({ app: 'VOTReader', exportVersion: 3, data: {}, stores: {}, media: [] }, importCtx())).rejects.toThrow(/not a v1\/v2/);
  });

  it('one bad section is skipped: the device keeps that store, its media, and gets the rest', async () => {
    await fillLibrary();
    await relaunch();
    const payload = JSON.parse(await exportV2());
    payload.stores['vot-bookmarks'] = 'not a list';
    payload.stores['vot-notes'] = { g: 5 };
    payload.stores['vot-journal'].list[0].title = 'From the backup';
    JournalStore.update('j_0', { title: 'On the device' });
    BookmarkStore.update('bkm_0', { thought: 'device thought' });
    await flush();
    const before = await diskSnapshot();
    const res = await applyImportPayload(payload, importCtx());
    expect(res.skippedStores.sort()).toEqual(['vot-bookmarks', 'vot-notes']);
    await relaunch();
    const after = await diskSnapshot();
    expect(after.stores['vot-bookmarks']).toEqual(before.stores['vot-bookmarks']);
    expect(after.stores['vot-notes']).toEqual(before.stores['vot-notes']);
    expect(after.media).toEqual(before.media);
    expect(JournalStore.get('j_0').title).toBe('From the backup');
  }, 30000);

  it('a damaged media table in a .votbak is refused before anything is written', async () => {
    const before = await libraryOnDisk();
    const { built } = await exportV3();
    const manifest = JSON.parse(JSON.stringify(built.manifest));
    manifest.media.push({ ...manifest.media[0] });          // a duplicate id
    await expect(applyV3(manifest, [], importCtx())).rejects.toThrow(/invalid v3 media manifest/);
    await relaunch();
    expectSameDisk(await diskSnapshot(), before);
  }, 30000);

  it('a .votbak cut inside a media frame restores the index and salvages, never deleting media', async () => {
    await fillLibrary();
    await relaunch();
    const { file } = await exportV3();
    const before = await diskSnapshot();
    await JournalMediaStore.put({ id: 'm_device_only', type: 'image', blob: new NodeBlob([new Uint8Array([9, 9, 9])], { type: 'image/png' }), mime: 'image/png', created: T });
    const cut = file.slice(0, file.size - 5000);             // into the voice memo's frame
    const { read, res } = await importV3(cut);
    expect(read.integrity).toBe('truncated');
    expect(res.countMismatches.length).toBeGreaterThan(0);    // the reader is told what did not come back
    await relaunch();
    const after = await diskSnapshot();
    expect(Object.keys(after.media).sort()).toEqual(['m_aud', 'm_device_only', 'm_img']);   // nothing deleted
    expect(after.media.m_aud).toEqual(before.media.m_aud);    // the device's copy of the cut memo stays
    expect(after.stores['vot-journal']).toEqual(before.stores['vot-journal']);
  }, 30000);
});
