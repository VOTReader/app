// @ts-nocheck — tests build partial records
/* dl1 (2026-11-04) — an edit made after the device clock steps back is kept.
   ─────────────────────────────────────────────────────────────────────────
   Every precious store saves through the cross-tab merge (cached-store.js
   _saveMerged → store-merge.js). In ONE tab the stored copy it merges onto is
   this tab's own last save, and the merge used to keep whichever copy had the
   newer `updated`, a tie to the stored one. So once the clock went back (a
   manual time change, a network-time correction on a phone that ran fast) every
   edit to a record last saved under the faster clock was thrown away at its
   save: gone from memory at once and never on disk. Two saves of one record in
   one millisecond lost the second the same way (the frozen clock below).

   These run the REAL stores over fake-indexeddb, save, step the clock back a
   minute, edit, save, then drop every cache and reload from disk. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBAdapter } from './idb-adapter.js';
import { JournalStore } from './journal-store.js';
import { NoteStore } from './note-store.js';
import { AnnotationStore } from './annotation-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { NotebookStore } from './notebook-store.js';
import { ReadingPlanStore } from './reading-plan-store.js';

const FAST = Date.UTC(2026, 10, 4, 12, 0, 0);   // the clock as it ran ahead
const BACK = FAST - 60 * 1000;                   // corrected one minute back

const STORES = [JournalStore, NoteStore, AnnotationStore, BookmarkStore, NotebookStore, ReadingPlanStore];

const deleteDb = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('votreader');
  req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined);
});

/** Drop every cache and the connection, then read each store back from disk. */
async function reload() {
  await Promise.all(STORES.map((s) => s.whenSaved()));
  STORES.forEach((s) => s._resetForTests());
  IDBAdapter._resetForTests();
  await Promise.all(STORES.map((s) => s._hydrate()));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FAST);
  await Promise.all(STORES.map((s) => s.whenSaved()));
  IDBAdapter._resetForTests();
  await deleteDb();
  localStorage.clear();
  STORES.forEach((s) => s._resetForTests());
  await Promise.all(STORES.map((s) => s._hydrate()));   // loaded, with a merge ancestor, as at boot
});

afterEach(() => { vi.useRealTimers(); });

describe('dl1 — the clock steps back between two saves of one record', () => {
  it('a journal entry keeps the words written after the clock went back', async () => {
    const e = JournalStore.add({ title: 'Morning', blocks: [{ id: 'b1', type: 'p', text: 'first words' }] });
    await JournalStore.whenSaved();
    vi.setSystemTime(BACK);
    JournalStore.update(e.id, { blocks: [{ id: 'b1', type: 'p', text: 'first words, and the rest of the prayer' }] });
    expect(await JournalStore.whenSaved()).toBe(true);
    // in memory: the merge result replaces the cache, so the old code lost it here already
    expect(JournalStore.get(e.id).blocks[0].text).toBe('first words, and the rest of the prayer');
    await reload();
    expect(JournalStore.get(e.id).blocks[0].text).toBe('first words, and the rest of the prayer');
  });

  it('a note body edited after the clock went back is kept', async () => {
    NoteStore.set('g1', { body: 'draft', keys: ['bible:john:3:16'] });
    await NoteStore.whenSaved();
    vi.setSystemTime(BACK);
    NoteStore.update('g1', { body: 'the whole note' });
    await NoteStore.whenSaved();
    await reload();
    expect(NoteStore.get('g1').body).toBe('the whole note');
  });

  it('a highlight recoloured after the clock went back keeps its colour', async () => {
    AnnotationStore.add('bible:john:3:16', { id: 'a1', start: 0, end: 5, color: 'yellow', text: 'For G' });
    await AnnotationStore.whenSaved();
    vi.setSystemTime(BACK);
    AnnotationStore.recolorGroup('a1', 'blue');
    await AnnotationStore.whenSaved();
    await reload();
    expect(AnnotationStore.get('bible:john:3:16')[0].color).toBe('blue');
  });

  it("a bookmark's thought written after the clock went back is kept", async () => {
    BookmarkStore.add({ id: 'bk1', hlKey: 'bible:psalms:23:1', label: 'Psalm 23' });
    await BookmarkStore.whenSaved();
    vi.setSystemTime(BACK);
    BookmarkStore.update('bk1', { thought: 'read this on the hard days' });
    await BookmarkStore.whenSaved();
    await reload();
    expect(BookmarkStore.get('bk1').thought).toBe('read this on the hard days');
  });

  it('a notebook renamed after the clock went back keeps its new name', async () => {
    const nb = NotebookStore.add('Psalms');
    await NotebookStore.whenSaved();
    vi.setSystemTime(BACK);
    NotebookStore.rename(nb.id, 'Psalms of comfort');
    await NotebookStore.whenSaved();
    await reload();
    expect(NotebookStore.get(nb.id).name).toBe('Psalms of comfort');
  });

  it('a reading plan paused after the clock went back stays paused', async () => {
    const run = { id: 'run1', plan: 'gospels', start: '2026-11-01', segs: [], tracks: [{ items: [] }],
      status: 'running', ticks: {}, created: FAST, updated: FAST };
    ReadingPlanStore.put(run);
    await ReadingPlanStore.whenSaved();
    vi.setSystemTime(BACK);
    ReadingPlanStore.put({ ...run, status: 'paused', paused: '2026-11-04', updated: BACK });
    await ReadingPlanStore.whenSaved();
    await reload();
    expect(ReadingPlanStore.get('run1').status).toBe('paused');
  });

  /* dl3, review (myweb lane, 2026-11-04): an exact save (every store an Import & Overwrite
     writes) wrote its private copy AND made that same object both `_cache` and the next
     `_base`, so the reader's first in-place edit after the restore went into the ancestor
     too, read as unchanged at the next merge, and was dropped from screen and disk. */
  it('the first edits after an Import & Overwrite are kept (a bookmark added, another\'s thought, a highlight)', async () => {
    BookmarkStore.replaceExact('replaceAll', [{ id: 'bk_r', hlKey: 'bible:psalms:23:1', label: 'Restored', created: 1, updated: 1 }]);
    AnnotationStore.replaceExact('replaceAll', { 'bible:john:1:1': [{ id: 'a_r', groupId: 'a_r', kind: 'highlight', color: 'yellow', start: 0, end: 2, text: 'In', created: 1, updated: 1 }] });
    await Promise.all([BookmarkStore.whenSaved(), AnnotationStore.whenSaved()]);
    BookmarkStore.add({ id: 'bk_new', hlKey: 'bible:psalms:23:4', label: 'Added after the restore' });
    BookmarkStore.update('bk_r', { thought: 'written after the restore' });
    AnnotationStore.add('bible:john:1:1', { id: 'a_new', start: 3, end: 6, text: 'the' });
    await Promise.all([BookmarkStore.whenSaved(), AnnotationStore.whenSaved()]);
    await reload();
    expect(BookmarkStore.get('bk_new')).toBeTruthy();
    expect(BookmarkStore.get('bk_r').thought).toBe('written after the restore');
    expect(AnnotationStore.get('bible:john:1:1').map((a) => a.id).sort()).toEqual(['a_new', 'a_r']);
  });

  it('two saves of one entry in the same millisecond keep the second', async () => {
    const e = JournalStore.add({ title: 'One', blocks: [] });
    await JournalStore.whenSaved();
    JournalStore.update(e.id, { title: 'Two' });          // the clock has not moved (frozen)
    await JournalStore.whenSaved();
    JournalStore.update(e.id, { title: 'Three' });
    await JournalStore.whenSaved();
    await reload();
    expect(JournalStore.get(e.id).title).toBe('Three');
  });
});
