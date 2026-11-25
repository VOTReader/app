// @ts-nocheck — tests construct partial JournalEntry literals
/* Tier 1 — JournalStore.remove() cascade + pruneNotebook tests.
   ──────────────────────────────────────────────────────────────
   Two bug classes guarded here:

   1. remove() cascade — when a journal entry is deleted, every
      annotation/note/bookmark/link anchored under `journal:<id>:`
      must follow. Under-eager cleanup leaves dangling annotations
      that have no reachable owner and clutter the Library hubs.
      Over-eager cleanup wipes OTHER journals' data (a false-prefix
      match on `journal:j_1` vs `journal:j_10`).

   2. pruneNotebook — symmetric to NoteStore.pruneNotebook. The
      silent failure is prune-one-too-many (strips the user's other
      notebook memberships on the same entry) or unconditional
      bumps (fires _save/_bump even when no entry changed — wastes
      a write + spuriously re-renders every useSyncExternalStore
      consumer). The if-changed guard at journal-store.js:412 is
      the fix; this file tests it both ways.

   The cross-store cascade relies on `typeof X !== 'undefined'`
   lookups inside journal-store.js. In production those globals
   are populated by _entry-b.js's Object.assign(window, ...). In
   the vitest jsdom environment we pin them onto globalThis in
   beforeEach so the cascade code sees them.
*/

import 'fake-indexeddb/auto'; // the stores' real IDB write path, so no 'IndexedDB is not available' write failures (console-clean)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JournalStore, JournalNotebookStore } from './journal-store.js';
import { AnnotationStore } from './annotation-store.js';
import { NoteStore } from './note-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { LinkStore } from './link-store.js';
import { JournalIndexStore } from './journal-index-store.js';
import { JournalStatsStore } from './journal-stats-store.js';
import { JournalHelpers } from '../data/journal-helpers.js';
import { mergeListStore } from './store-merge.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('./annotation-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get AnnotationStore() { return 'AnnotationStore' in globalThis ? /** @type {any} */ (globalThis).AnnotationStore : real.AnnotationStore; } }; });
vi.mock('./note-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get NoteStore() { return 'NoteStore' in globalThis ? /** @type {any} */ (globalThis).NoteStore : real.NoteStore; } }; });
vi.mock('./bookmark-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get BookmarkStore() { return 'BookmarkStore' in globalThis ? /** @type {any} */ (globalThis).BookmarkStore : real.BookmarkStore; } }; });
vi.mock('./link-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get LinkStore() { return 'LinkStore' in globalThis ? /** @type {any} */ (globalThis).LinkStore : real.LinkStore; } }; });
vi.mock('./journal-index-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalIndexStore() { return 'JournalIndexStore' in globalThis ? /** @type {any} */ (globalThis).JournalIndexStore : real.JournalIndexStore; } }; });
vi.mock('./journal-stats-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStatsStore() { return 'JournalStatsStore' in globalThis ? /** @type {any} */ (globalThis).JournalStatsStore : real.JournalStatsStore; } }; });
vi.mock('./journal-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get JournalStore() { return 'JournalStore' in globalThis ? /** @type {any} */ (globalThis).JournalStore : real.JournalStore; } }; });

beforeEach(() => {
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  AnnotationStore._resetForTests({ forceLoaded: true });
  NoteStore._resetForTests({ forceLoaded: true });
  BookmarkStore._resetForTests({ forceLoaded: true });
  LinkStore._resetForTests({ forceLoaded: true });
  JournalIndexStore._resetForTests({ forceLoaded: true });
  JournalStatsStore._resetForTests({ forceLoaded: true });
  JournalNotebookStore._resetForTests({ forceLoaded: true });

  // journal-store.js uses bare-name lookups guarded by `typeof X !== 'undefined'`.
  // In production _entry-b.js populates these on window; in jsdom we have to
  // do it manually so the cascade can find them.
  globalThis.AnnotationStore = AnnotationStore;
  globalThis.NoteStore = NoteStore;
  globalThis.BookmarkStore = BookmarkStore;
  globalThis.LinkStore = LinkStore;
  globalThis.JournalIndexStore = JournalIndexStore;
  globalThis.JournalStatsStore = JournalStatsStore;
});

/* ──────────────────────────────────────────────────────────────
   JournalStore.remove() — cascade across all 4 associated stores
   ────────────────────────────────────────────────────────────── */
describe('JournalStore.remove() — cross-store cascade', () => {
  it('removes all annotations/notes/bookmarks/links anchored under journal:<id>: while leaving other journals untouched', () => {
    // Two journal entries — both will be referenced by every store; we
    // delete j_1 and assert that j_2's data survives untouched.
    const j1 = JournalStore.add({ title: 'Entry 1' });
    const j2 = JournalStore.add({ title: 'Entry 2' });

    // ── Annotations: 2 highlights on j_1, 1 underline on j_1, 1 highlight on j_2.
    const j1key1 = 'journal:' + j1.id + ':0';
    const j1key2 = 'journal:' + j1.id + ':3';
    const j2key1 = 'journal:' + j2.id + ':0';
    AnnotationStore.add(j1key1, { id: 'hl_j1_a', start: 0, end: 10, kind: 'highlight', color: 'yellow' });
    AnnotationStore.add(j1key1, { id: 'hl_j1_b', start: 20, end: 30, kind: 'highlight', color: 'green' });
    AnnotationStore.add(j1key2, { id: 'ul_j1_c', start: 5, end: 25, kind: 'underline' });
    AnnotationStore.add(j2key1, { id: 'hl_j2_a', start: 0, end: 12, kind: 'highlight', color: 'pink' });

    // ── Notes: one note on j_1 (groupId stored on the annotation kind='note'),
    //    one note on j_2.
    AnnotationStore.add(j1key1, { id: 'note_j1_x', start: 40, end: 60, kind: 'note', groupId: 'gid_j1' });
    AnnotationStore.add(j2key1, { id: 'note_j2_y', start: 40, end: 60, kind: 'note', groupId: 'gid_j2' });
    NoteStore.set('gid_j1', { body: 'on j1', keys: [j1key1] });
    NoteStore.set('gid_j2', { body: 'on j2', keys: [j2key1] });

    // ── Bookmarks: 2 on j_1, 1 on j_2.
    BookmarkStore.add({ id: 'bk_j1_a', hlKey: 'journal:' + j1.id + ':1', label: 'b1' });
    BookmarkStore.add({ id: 'bk_j1_b', hlKey: 'journal:' + j1.id + ':2:5-15', label: 'b2' });
    BookmarkStore.add({ id: 'bk_j2_a', hlKey: 'journal:' + j2.id + ':1', label: 'b3' });

    // ── Links: one with j_1 in source.key, one with j_1 in target.key,
    //    one purely on j_2 (must survive).
    LinkStore.add({
      id: 'lnk_j1_a',
      source: { type: /** @type {any} */ ('journal'), key: 'journal:' + j1.id + ':2', label: 'src' },
      target: { type: 'letter', key: 'letter:the-wide-path:0', label: 'tgt' },
      created: Date.now()
    });
    LinkStore.add({
      id: 'lnk_j1_b',
      source: { type: 'bible', key: 'bible:genesis:1:1', label: 'src' },
      target: { type: /** @type {any} */ ('journal'), key: 'journal:' + j1.id + ':3', label: 'tgt' },
      created: Date.now()
    });
    LinkStore.add({
      id: 'lnk_j2_a',
      source: { type: /** @type {any} */ ('journal'), key: 'journal:' + j2.id + ':0', label: 'src' },
      target: { type: 'letter', key: 'letter:the-wide-path:0', label: 'tgt' },
      created: Date.now()
    });

    // Sanity-check pre-conditions.
    expect(JournalStore.count()).toBe(2);
    expect(Object.keys(AnnotationStore.all()).length).toBe(3);  // j1k1 + j1k2 + j2k1
    expect(NoteStore.count()).toBe(2);
    expect(BookmarkStore.count()).toBe(3);
    expect(LinkStore.all().length).toBe(3);

    // ── ACT.
    JournalStore.remove(j1.id);

    // ── Entry itself gone, j_2 survives.
    expect(JournalStore.get(j1.id)).toBeNull();
    expect(JournalStore.get(j2.id)).not.toBeNull();
    expect(JournalStore.count()).toBe(1);

    // ── Annotations: j_1's two keys are gone; j_2's key survives, with
    //    j_2's note annotation still there.
    const annAfter = AnnotationStore.all();
    expect(annAfter[j1key1]).toBeUndefined();
    expect(annAfter[j1key2]).toBeUndefined();
    expect(annAfter[j2key1]).toBeDefined();
    expect(annAfter[j2key1].length).toBe(2);  // hl_j2_a + note_j2_y

    // ── Notes: gid_j1 purged; gid_j2 survives.
    expect(NoteStore.get('gid_j1')).toBeNull();
    expect(NoteStore.get('gid_j2')).not.toBeNull();

    // ── Bookmarks: j_1's two gone; j_2's survives.
    expect(BookmarkStore.get('bk_j1_a')).toBeNull();
    expect(BookmarkStore.get('bk_j1_b')).toBeNull();
    expect(BookmarkStore.get('bk_j2_a')).not.toBeNull();
    expect(BookmarkStore.count()).toBe(1);

    // ── Links: j_1's two gone (matched via source.key + target.key);
    //    j_2's link survives.
    expect(LinkStore.all().find(l => l.id === 'lnk_j1_a')).toBeUndefined();
    expect(LinkStore.all().find(l => l.id === 'lnk_j1_b')).toBeUndefined();
    expect(LinkStore.all().find(l => l.id === 'lnk_j2_a')).toBeDefined();
    expect(LinkStore.all().length).toBe(1);
  });

  it('cascades correctly when journal:<source>.entryId is the join (link without key prefix)', () => {
    // The _scanAssociated has FOUR ways for a link to match a journal entry:
    //   source.key starts with prefix, target.key starts with prefix,
    //   source.type === 'journal' && source.entryId === id, OR
    //   target.type === 'journal' && target.entryId === id.
    // This test exercises the latter two (entryId-only join) to ensure
    // those paths fire too.
    const j1 = JournalStore.add({});
    LinkStore.add({
      id: 'lnk_entryid_src',
      source: { type: /** @type {any} */ ('journal'), key: 'unrelated:key', label: 'src', entryId: j1.id },
      target: { type: 'letter', key: 'letter:foo:0', label: 't' },
      created: Date.now()
    });
    LinkStore.add({
      id: 'lnk_entryid_tgt',
      source: { type: 'letter', key: 'letter:foo:0', label: 's' },
      target: { type: /** @type {any} */ ('journal'), key: 'unrelated:key2', label: 'tgt', entryId: j1.id },
      created: Date.now()
    });

    JournalStore.remove(j1.id);

    expect(LinkStore.all().length).toBe(0);
  });

  it('does not crash and still deletes the entry when no associated data exists', () => {
    const j1 = JournalStore.add({ title: 'lonely' });
    expect(JournalStore.count()).toBe(1);

    // No annotations, notes, bookmarks, or links exist.
    expect(() => JournalStore.remove(j1.id)).not.toThrow();

    expect(JournalStore.get(j1.id)).toBeNull();
    expect(JournalStore.count()).toBe(0);
  });

  it('is a no-op on an unknown id (idempotent)', () => {
    const j1 = JournalStore.add({ title: 'real entry' });

    // Seed associated data — none of it must move when removing an
    // unrelated id.
    AnnotationStore.add('journal:' + j1.id + ':0', { id: 'hl_real', start: 0, end: 5 });
    BookmarkStore.add({ id: 'bk_real', hlKey: 'journal:' + j1.id + ':1', label: 'b' });

    expect(() => JournalStore.remove('j_never_exists')).not.toThrow();
    expect(() => JournalStore.remove('')).not.toThrow();
    expect(() => JournalStore.remove(null)).not.toThrow();
    expect(() => JournalStore.remove(undefined)).not.toThrow();

    // Real entry's data still intact.
    expect(JournalStore.get(j1.id)).not.toBeNull();
    expect(AnnotationStore.get('journal:' + j1.id + ':0').length).toBe(1);
    expect(BookmarkStore.count()).toBe(1);
  });

  it('cascades JournalIndexStore.removeEntry and JournalStatsStore.recordDeletion', () => {
    // The cascade tail at journal-store.js:355-356 fires removeEntry +
    // recordDeletion. Confirm both fire (i.e. the index loses the entry
    // id and the stats counter decrements).
    const j1 = JournalStore.add({});

    // Seed the reverse-index so we can prove it gets cleaned.
    JournalIndexStore.rebuildForEntry(j1.id, ['letter:vol1/foo', 'chapter:matthew:5']);
    expect(JournalIndexStore.entriesReferencing('letter:vol1/foo')).toContain(j1.id);

    // Seed the stats counter so the decrement is observable.
    JournalStatsStore.recordNewEntry(Date.now());
    expect(JournalStatsStore.get().totalEntries).toBe(1);

    JournalStore.remove(j1.id);

    // Index buckets purged.
    expect(JournalIndexStore.entriesReferencing('letter:vol1/foo')).toEqual([]);
    expect(JournalIndexStore.entriesReferencing('chapter:matthew:5')).toEqual([]);

    // Stats decremented (recordDeletion clamps to 0).
    expect(JournalStatsStore.get().totalEntries).toBe(0);
  });

  it('remove(id, { skipStats: true }) removes the entry WITHOUT the stats decrement (blank-entry prune-on-exit)', () => {
    // P1-7/P1-5: the editor's prune-on-exit removes a blank entry whose
    // stats were NEVER recorded (recording happens at the first non-empty
    // save). A recordDeletion cascade there would under-count real entries.
    const j1 = JournalStore.add({});

    JournalStatsStore.recordNewEntry(Date.now());
    expect(JournalStatsStore.get().totalEntries).toBe(1);

    JournalStore.remove(j1.id, { skipStats: true });

    expect(JournalStore.get(j1.id)).toBeNull();           // entry is gone
    expect(JournalStatsStore.get().totalEntries).toBe(1); // no phantom decrement
  });
});

/* ──────────────────────────────────────────────────────────────
   The id add() hands back must be the id the entry KEEPS. add() built
   the entry (minting `id`/`created`/`updated`) and only then reached
   _shouldDefer, so under pending/degraded hydration the overlay
   re-invocation minted a SECOND id and the replay a THIRD — while the
   caller (hooks/use-journal-mutations.js) had already handed the first
   one to the editor. Every later update() addressed an id that never
   existed in any cache, so the reader's first journal entry of the
   session was written and then silently lost. Nothing surfaced it: the
   editor shows its own local blocks either way.
   ────────────────────────────────────────────────────────────── */
describe('JournalStore.add() — the id the caller gets is the id that survives', () => {
  it('keeps one id and one entry across the pending overlay AND the replay', () => {
    // beforeEach restores forceLoaded for every sibling case, so dropping
    // this store back to 'pending' here is contained.
    JournalStore._resetForTests();          // idb-backed, no forceLoaded → 'pending'
    expect(JournalStore.getState()).toBe('pending');

    // What createAndEditJournal does: take the entry, hand its id onward.
    const e = JournalStore.add({ title: 't' });

    // The editor's first save, addressed to that id, must land on the overlay.
    JournalStore.update(e.id, { title: 'edited' });
    expect(JournalStore.get(e.id)).not.toBeNull();
    expect(JournalStore.get(e.id).title).toBe('edited');

    // Hydration completes with an empty IDB snapshot; the queue replays.
    JournalStore._rebaseAndPromote({ list: [] });
    expect(JournalStore.getState()).toBe('loaded');
    expect(JournalStore.count()).toBe(1);              // not two, not three
    expect(JournalStore.get(e.id)).not.toBeNull();
    expect(JournalStore.get(e.id).title).toBe('edited');
    expect(JournalStore.get(e.id).created).toBe(e.created);
  });
});

/* ──────────────────────────────────────────────────────────────
   D6 — the cross-store cascade must be ATOMIC under degraded/pending
   hydration. _scanAssociated reads the loaded TARGET stores by key
   prefix, so without a guard the cascade fires DURABLY during the
   _applyToPendingCache overlay — while the entry deletion is only
   queued. That risks a half-applied delete (associations purged but
   the entry kept = orphan, if hydration never completes) and a double
   recordDeletion at replay. The cascade must be deferred to replay.
   ────────────────────────────────────────────────────────────── */
describe('JournalStore.remove() — cascade is atomic under degraded hydration', () => {
  it('defers the cross-store cascade + stats to replay (no premature purge, no double recordDeletion)', () => {
    // Target stores stay loaded (beforeEach); JournalStore goes degraded.
    JournalStore._resetForTests();        // idb-backed → 'pending'
    JournalStore._state = 'degraded';     // exercise the degraded label
    expect(JournalStore.getState()).toBe('degraded');

    const jid = 'j_degraded_1';
    const jkey = 'journal:' + jid + ':0';

    // Associations for the entry, seeded in the (loaded) target stores.
    AnnotationStore.add(jkey, { id: 'hl_x', start: 0, end: 5, kind: 'highlight', color: 'yellow' });
    AnnotationStore.add(jkey, { id: 'note_x', start: 6, end: 9, kind: 'note', groupId: 'gid_x' });
    NoteStore.set('gid_x', { body: 'note', keys: [jkey] });
    BookmarkStore.add({ id: 'bk_x', hlKey: 'journal:' + jid + ':1', label: 'b' });

    // Seed stats to 2 so a single decrement (→1) is distinguishable from a
    // double decrement (→0). recordDeletion clamps at 0.
    JournalStatsStore.recordNewEntry(Date.now());
    JournalStatsStore.recordNewEntry(Date.now());
    expect(JournalStatsStore.get().totalEntries).toBe(2);

    // ACT 1 — delete while degraded: queued + applied to the overlay only.
    // The DURABLE cross-store cascade + stats MUST NOT fire yet (else an
    // app close before hydration would orphan the entry).
    JournalStore.remove(jid);
    expect(AnnotationStore.all()[jkey]).toBeDefined();
    expect(NoteStore.get('gid_x')).not.toBeNull();
    expect(BookmarkStore.get('bk_x')).not.toBeNull();
    expect(JournalStatsStore.get().totalEntries).toBe(2); // no premature decrement

    // ACT 2 — hydration completes with IDB data containing the entry; the
    // queued 'remove' replays and the cascade fires exactly ONCE.
    JournalStore._rebaseAndPromote({ list: [{ id: jid, title: 'E' }] });
    expect(JournalStore.getState()).toBe('loaded');
    expect(JournalStore.get(jid)).toBeNull();
    expect(AnnotationStore.all()[jkey]).toBeUndefined();
    expect(NoteStore.get('gid_x')).toBeNull();
    expect(BookmarkStore.get('bk_x')).toBeNull();
    expect(JournalStatsStore.get().totalEntries).toBe(1); // ONE decrement, not two
  });
});

/* ──────────────────────────────────────────────────────────────
   JournalStore.pruneNotebook — symmetric to NoteStore.pruneNotebook
   ────────────────────────────────────────────────────────────── */
describe('JournalStore.pruneNotebook — cascade from journal-notebook deletion', () => {
  it('strips the deleted notebookId from every entry, preserving the other notebook memberships', () => {
    // Three entries, each with overlapping notebook memberships. After
    // pruneNotebook('nb_b'), only nb_b is removed; nb_a and nb_c survive.
    const j1 = JournalStore.add({ notebookIds: ['nb_a', 'nb_b', 'nb_c'] });
    const j2 = JournalStore.add({ notebookIds: ['nb_b'] });
    const j3 = JournalStore.add({ notebookIds: ['nb_a', 'nb_c'] });  // no nb_b

    JournalStore.pruneNotebook('nb_b');

    // j1: nb_b removed, others survive.
    expect(JournalStore.get(j1.id).notebookIds).toEqual(['nb_a', 'nb_c']);
    // j2: nb_b was the only one — list now empty.
    expect(JournalStore.get(j2.id).notebookIds).toEqual([]);
    // j3: never had nb_b — untouched.
    expect(JournalStore.get(j3.id).notebookIds).toEqual(['nb_a', 'nb_c']);
  });

  it('does NOT touch other notebookIds on the same entry (prune-one-too-many guard)', () => {
    // The critical regression — pruning nb_a must NOT strip nb_b or nb_c
    // from the same entry's notebookIds array.
    const j1 = JournalStore.add({ notebookIds: ['nb_a', 'nb_b', 'nb_c'] });

    JournalStore.pruneNotebook('nb_a');

    expect(JournalStore.get(j1.id).notebookIds).toEqual(['nb_b', 'nb_c']);
  });

  it('leaves entries without notebookIds (or with a different notebookId) alone — no `updated` bump', async () => {
    // Three entries: one with the target nbId, one with the WRONG nbId,
    // and one with no notebookIds at all. Only the first should see
    // `updated` advance.
    const j_with = JournalStore.add({ notebookIds: ['nb_a'] });
    const j_wrong = JournalStore.add({ notebookIds: ['nb_b'] });
    const j_empty = JournalStore.add({});  // defaults to []

    const with_before = JournalStore.get(j_with.id).updated;
    const wrong_before = JournalStore.get(j_wrong.id).updated;
    const empty_before = JournalStore.get(j_empty.id).updated;

    // Strict clock advance so a spurious touch is visible.
    await new Promise(r => setTimeout(r, 5));

    JournalStore.pruneNotebook('nb_a');

    // j_with: nb_a was removed → updated bumped (1 ms past its own, W16: not to now).
    expect(JournalStore.get(j_with.id).notebookIds).toEqual([]);
    expect(JournalStore.get(j_with.id).updated).toBe(with_before + 1);

    // j_wrong + j_empty: untouched — `updated` unchanged.
    expect(JournalStore.get(j_wrong.id).notebookIds).toEqual(['nb_b']);
    expect(JournalStore.get(j_wrong.id).updated).toBe(wrong_before);
    expect(JournalStore.get(j_empty.id).notebookIds).toEqual([]);
    expect(JournalStore.get(j_empty.id).updated).toBe(empty_before);
  });

  it('does NOT fire _save / _bump when no entry changes (if-changed guard at line 412)', () => {
    // Seed an entry whose notebookIds does NOT contain the target nbId.
    // pruneNotebook should be an observable no-op: the version counter
    // (incremented by _bump) must NOT advance. This is the bug fixed in
    // journal-store.js:412 — pre-fix, _bump fired unconditionally and
    // spuriously re-rendered every subscriber.
    JournalStore.add({ notebookIds: ['nb_a'] });
    JournalStore.add({ notebookIds: ['nb_c'] });
    const versionBefore = JournalStore.getVersion();

    JournalStore.pruneNotebook('nb_unused');

    // No entry changed → _bump never fired → version unchanged.
    expect(JournalStore.getVersion()).toBe(versionBefore);
  });

  it('DOES fire _bump exactly once when at least one entry changes', () => {
    // Inverse of the above — a real prune across two entries should fire
    // _bump exactly ONCE (single _save after the batch, per the
    // journal-store.js:412 single-bump pattern).
    JournalStore.add({ notebookIds: ['nb_a', 'nb_b'] });
    JournalStore.add({ notebookIds: ['nb_a'] });

    const versionBefore = JournalStore.getVersion();

    JournalStore.pruneNotebook('nb_a');

    // Bumped, exactly +1 (single save for the batched mutation).
    expect(JournalStore.getVersion()).toBe(versionBefore + 1);
  });

  it('is a no-op on falsy notebookId (null / undefined / empty string)', () => {
    JournalStore.add({ notebookIds: ['nb_a'] });
    const versionBefore = JournalStore.getVersion();

    JournalStore.pruneNotebook(null);
    JournalStore.pruneNotebook(undefined);
    JournalStore.pruneNotebook('');

    // Nothing fired — entry intact, version unchanged.
    expect(JournalStore.all()[0].notebookIds).toEqual(['nb_a']);
    expect(JournalStore.getVersion()).toBe(versionBefore);
  });

  it('handles entries with missing/falsy notebookIds without crashing (defensive guard)', () => {
    // The continue-on-falsy guard at line 407 (!e.notebookIds || !.length)
    // protects legacy entries that pre-date the notebookIds field.
    /** @type {any} */
    const data = JournalStore._load();
    data.list.push({ id: 'j_legacy', title: 'legacy', blocks: [], created: 1, updated: 1 });
    data.list.push({ id: 'j_null_nb', title: 'null', blocks: [], notebookIds: null, created: 2, updated: 2 });
    JournalStore._save();

    expect(() => JournalStore.pruneNotebook('nb_a')).not.toThrow();

    // Legacy entry untouched.
    const legacy = /** @type {any} */ (JournalStore.get('j_legacy'));
    expect(legacy.notebookIds).toBeUndefined();
    const nullnb = /** @type {any} */ (JournalStore.get('j_null_nb'));
    expect(nullnb.notebookIds).toBeNull();
  });
});

/* ──────────────────────────────────────────────────────────────
   TEST-5 — scan read paths (media reference scans; the unused search went, id-datasafe 266)
   ────────────────────────────────────────────────────────────── */
describe('JournalStore — scan paths (TEST-5)', () => {
  it('collectAllMediaIds gathers image + audio mediaIds across entries', () => {
    JournalStore.add({ blocks: [{ type: 'image', mediaId: 'm1' }, { type: 'text', text: 'x' }] });
    JournalStore.add({ blocks: [{ type: 'audio', mediaId: 'm2' }] });
    JournalStore.add({ blocks: [{ type: 'text', text: 'no media' }] });
    expect(JournalStore.collectAllMediaIds().sort()).toEqual(['m1', 'm2']);
  });

  it('isMediaReferencedElsewhere is true only when ANOTHER entry embeds the blob', () => {
    const a = JournalStore.add({ blocks: [{ type: 'image', mediaId: 'shared' }] });
    const b = JournalStore.add({ blocks: [{ type: 'image', mediaId: 'shared' }] });
    expect(JournalStore.isMediaReferencedElsewhere('shared', a.id)).toBe(true);     // b still embeds it
    JournalStore.remove(b.id);
    expect(JournalStore.isMediaReferencedElsewhere('shared', a.id)).toBe(false);    // only a remains
    expect(JournalStore.isMediaReferencedElsewhere(null, a.id)).toBe(false);        // falsy id short-circuits
  });
});

/* ──────────────────────────────────────────────────────────────
   v05-05 — a pin is not an edit. setPinned/togglePin went through
   update(), which stamps `updated: Date.now()`, and the hub dates and
   sorts its cards by `updated`: pinning a year-old entry showed today's
   date on it and moved it to the top. But every save also merges the
   cache onto the stored copy by `updated` (a tie keeps the stored copy),
   so a pin that left `updated` alone was dropped by the next save - the
   real app showed it; an in-memory store cannot. update(..., { keepDate:
   true }) moves the stamp 1 ms past the entry's own, and the option rides
   the deferred-hydration queue (the replay re-invokes update with the
   same arguments).
   ────────────────────────────────────────────────────────────── */
describe('JournalStore — pinning keeps the entry\'s date (v05-05)', () => {
  const YEAR_AGO = Date.now() - 365 * 24 * 3600 * 1000;
  const keptDate = (e) => e.updated > YEAR_AGO && e.updated < YEAR_AGO + 1000;

  it('setPinned and togglePin keep the entry\'s date', () => {
    const e = JournalStore.add({ title: 'old', created: YEAR_AGO, updated: YEAR_AGO });
    JournalStore.setPinned(e.id, true);
    expect(JournalStore.get(e.id).pinned).toBe(true);
    expect(keptDate(JournalStore.get(e.id))).toBe(true);
    JournalStore.togglePin(e.id);
    expect(JournalStore.get(e.id).pinned).toBe(false);
    expect(keptDate(JournalStore.get(e.id))).toBe(true);
  });

  it('the pin survives the save-time merge with the stored copy', () => {
    const e = JournalStore.add({ title: 'old', created: YEAR_AGO, updated: YEAR_AGO });
    const stored = { list: [JSON.parse(JSON.stringify(JournalStore.get(e.id)))] };   // on disk before the pin
    JournalStore.setPinned(e.id, true);
    // What _saveMerged does on the next save: merge the cache (ours) onto the committed copy (theirs).
    const merged = mergeListStore(stored, { list: [JournalStore.get(e.id)] }, stored);
    expect(merged.list[0].pinned).toBe(true);
  });

  it('pinning an old entry does not move it above a newer one', () => {
    const old = JournalStore.add({ title: 'old', created: YEAR_AGO, updated: YEAR_AGO });
    JournalStore.add({ title: 'recent' });
    JournalStore.togglePin(old.id);
    expect(JournalStore.all().map((e) => e.title)).toEqual(['recent', 'old']);
  });

  it('an edit still re-dates the entry', () => {
    const e = JournalStore.add({ title: 'old', created: YEAR_AGO, updated: YEAR_AGO });
    JournalStore.update(e.id, { title: 'edited' });
    expect(JournalStore.get(e.id).updated).toBeGreaterThan(YEAR_AGO);
  });

  it('a pin made while the store is still loading keeps the date after the replay', () => {
    JournalStore._resetForTests();            // idb-backed, no forceLoaded → 'pending'
    expect(JournalStore.getState()).toBe('pending');
    JournalStore.setPinned('j_old', true);    // queued: the entry is still only on disk
    JournalStore._rebaseAndPromote({ list: [{
      id: 'j_old', title: 'old', blocks: [], mood: null, tags: [], notebookIds: [], pinned: false,
      created: YEAR_AGO, updated: YEAR_AGO,
    }] });
    expect(JournalStore.get('j_old').pinned).toBe(true);
    expect(keptDate(JournalStore.get('j_old'))).toBe(true);
  });
});

/* W16 (sweep 10-13): deleting a notebook re-dated every entry in it. pruneNotebook
   stamped Date.now(), so year-old entries jumped to the top of the hub dated today.
   Dropping a deleted notebook's id is not an edit: like a pin (v05-05) the stamp
   moves 1 ms past the entry's own, which still wins the save-time merge. */
describe('JournalStore.pruneNotebook keeps the entry\'s date (W16)', () => {
  const YEAR_AGO = Date.now() - 365 * 24 * 3600 * 1000;

  it('a year-old entry keeps its date and its place in the hub', () => {
    const old = JournalStore.add({ title: 'old', notebookIds: ['nb_a'], created: YEAR_AGO, updated: YEAR_AGO });
    JournalStore.add({ title: 'recent' });
    JournalStore.pruneNotebook('nb_a');
    expect(JournalStore.get(old.id).notebookIds).toEqual([]);
    expect(JournalStore.get(old.id).updated).toBe(YEAR_AGO + 1);
    expect(JournalStore.all().map((e) => e.title)).toEqual(['recent', 'old']);
  });

  it('the prune survives the save-time merge with the stored copy', () => {
    const old = JournalStore.add({ title: 'old', notebookIds: ['nb_a', 'nb_b'], created: YEAR_AGO, updated: YEAR_AGO });
    const stored = { list: [JSON.parse(JSON.stringify(JournalStore.get(old.id)))] };   // on disk before the prune
    JournalStore.pruneNotebook('nb_a');
    const merged = mergeListStore(stored, { list: [JournalStore.get(old.id)] }, stored);
    expect(merged.list[0].notebookIds).toEqual(['nb_b']);
  });
});

/* W16: the editor's exit prune can run while a block delete's Undo is still on
   screen. It removes the blank entry with keepMarks (the entry's marks wait, so an
   Undo that re-adds the entry finds them); purgeOrphanMarks takes them once the
   window has closed, and only if the entry is still gone. */
describe('JournalStore.remove keepMarks + purgeOrphanMarks (W16)', () => {
  it('remove(id, { keepMarks: true }) removes the entry and leaves its marks', () => {
    const e = JournalStore.add({ title: '' });
    BookmarkStore.add({ id: 'bk_w16', hlKey: 'journal:' + e.id + ':1', label: 'b' });
    JournalStore.remove(e.id, { skipStats: true, keepMarks: true });
    expect(JournalStore.get(e.id)).toBeNull();
    expect(BookmarkStore.get('bk_w16')).not.toBeNull();
  });

  it('purgeOrphanMarks takes the marks of an entry that is gone', () => {
    const e = JournalStore.add({ title: '' });
    BookmarkStore.add({ id: 'bk_w16', hlKey: 'journal:' + e.id + ':1', label: 'b' });
    JournalStore.remove(e.id, { skipStats: true, keepMarks: true });
    JournalStore.purgeOrphanMarks(e.id);
    expect(BookmarkStore.get('bk_w16')).toBeNull();
  });

  it('purgeOrphanMarks leaves the marks of an entry that is back', () => {
    const e = JournalStore.add({ title: '' });
    BookmarkStore.add({ id: 'bk_w16', hlKey: 'journal:' + e.id + ':1', label: 'b' });
    JournalStore.remove(e.id, { skipStats: true, keepMarks: true });
    JournalStore.add({ id: e.id, title: 'back', created: e.created });
    JournalStore.purgeOrphanMarks(e.id);
    expect(BookmarkStore.get('bk_w16')).not.toBeNull();
  });
});

/* n4-07 (sweep 2, 09-25): the Journal hub's "recover" of an unclaimed voice memo
   added an audio block with no id, and nothing enforced the id every journal mark
   now keys on (v05-01: journal:<entryId>:<blockId>; the viewer's key={b.id}).
   The store gives any block that arrives without one an id of its own. */
describe('JournalStore: every block has an id (n4-07)', () => {
  beforeEach(() => { JournalStore._resetForTests({ forceLoaded: true }); });

  it('add() gives an id-less block an id and keeps the ones it has', () => {
    const e = JournalStore.add({ title: '', blocks: [{ type: 'audio', mediaId: 'm_1', duration: 3, samples: null }, { id: 'b_keep', type: 'p', text: 'x' }] });
    expect(e.blocks[0].id).toMatch(/^b_/);
    expect(e.blocks[0].mediaId).toBe('m_1');
    expect(e.blocks[1].id).toBe('b_keep');
    expect(JournalStore.get(e.id).blocks[0].id).toBe(e.blocks[0].id);
  });

  it('update() does the same for blocks in a patch, and two new blocks get two ids', () => {
    const e = JournalStore.add({ title: 't', blocks: [] });
    const u = JournalStore.update(e.id, { blocks: [{ type: 'p', text: 'a' }, { type: 'p', text: 'b' }] });
    expect(u.blocks[0].id).toMatch(/^b_/);
    expect(u.blocks[1].id).toMatch(/^b_/);
    expect(u.blocks[0].id).not.toBe(u.blocks[1].id);
  });
});

/* sweep v103: update() minted ids for id-less blocks AFTER _shouldDefer, so under
   pending/degraded hydration the overlay pass and the replay pass each minted their
   own. The reader saw (and marked, journal:<entry>:<blockId>) the overlay's id; the
   replay wrote a different one to disk and the mark pointed at no block. add()
   already builds its ids before deferring (its IDENTITY CONTRACT); update() must too. */
describe('JournalStore.update(): a new block keeps one id across the pending overlay and the replay (v103)', () => {
  it('the block id the reader sees while loading is the id that is stored', () => {
    JournalStore._resetForTests();            // idb-backed, no forceLoaded → 'pending'
    expect(JournalStore.getState()).toBe('pending');
    // Every mint differs: the overlay pass and the replay pass can never collide by chance.
    let n = 0;
    const rnd = vi.spyOn(Math, 'random').mockImplementation(() => ((++n * 7919) % 100000) / 100000);
    try {
      const e = JournalStore.add({ title: 't', blocks: [] });
      // The hub's recovered voice memo: a block that arrives with no id.
      JournalStore.update(e.id, { blocks: [{ type: 'audio', mediaId: 'm_1', duration: 3, samples: null }] });
      const seen = JournalStore.get(e.id).blocks[0].id;   // what the viewer renders and marks
      expect(seen).toMatch(/^b_/);

      JournalStore._rebaseAndPromote({ list: [] });      // hydration completes; the queue replays
      expect(JournalStore.getState()).toBe('loaded');
      expect(JournalStore.get(e.id).blocks[0].id).toBe(seen);
      expect(JournalStore.get(e.id).blocks[0].mediaId).toBe('m_1');
    } finally {
      rnd.mockRestore();
    }
  });
});

/* ──────────────────────────────────────────────────────────────
   n4-06 (sweep 2): deleting ONE block takes its marks with it once the editor's
   Undo window has passed, and nothing else: not the entry's other blocks, not a
   note's keys on other blocks, not a whole-entry link, not a block that is back.
   ────────────────────────────────────────────────────────────── */
describe('JournalStore - one block\'s marks (n4-06)', () => {
  const setup = () => {
    const j = JournalStore.add({ title: 'E', blocks: [{ id: 'b_a', type: 'p', text: 'one' }, { id: 'b_b', type: 'p', text: 'two' }] });
    const A = 'journal:' + j.id + ':b_a', B = 'journal:' + j.id + ':b_b';
    AnnotationStore.add(A, { id: 'h1', groupId: 'g1', start: 0, end: 3, kind: 'highlight', color: 'yellow' });
    AnnotationStore.add(A, { id: 'u1', groupId: 'g2', start: 0, end: 3, kind: 'underline' });
    AnnotationStore.add(B, { id: 'h2', groupId: 'g3', start: 0, end: 3, kind: 'highlight', color: 'yellow' });
    AnnotationStore.add(A, { id: 's1', groupId: 'g4', start: 0, end: 3, kind: 'highlight', color: 'blue' });   // a note spanning A and B
    AnnotationStore.add(B, { id: 's2', groupId: 'g4', start: 0, end: 3, kind: 'highlight', color: 'blue' });
    NoteStore.set('g1', { body: 'only on A', keys: [A] });
    NoteStore.set('g4', { body: 'spans', keys: [A, B] });
    BookmarkStore.add({ id: 'bk_a', hlKey: A + ':0-3', label: 'x' });
    BookmarkStore.add({ id: 'bk_a0', hlKey: A, label: 'x' });
    BookmarkStore.add({ id: 'bk_ab', hlKey: 'journal:' + j.id + ':b_ab:0-3', label: 'not A: b_ab' });
    LinkStore.add({ id: 'l_a', source: { type: /** @type {any} */ ('journal'), key: A + ':0-3' }, target: { type: 'letter', key: 'letter:x:0' }, created: 1 });
    LinkStore.add({ id: 'l_whole', source: { type: /** @type {any} */ ('journal'), entryId: j.id, key: 'journal:' + j.id }, target: { type: 'letter', key: 'letter:x:0' }, created: 1 });
    return { j, A, B };
  };

  it('counts and names only that block\'s marks (the confirm copy)', () => {
    const { j } = setup();
    const c = JournalStore.associatedDataCounts(j.id, 'b_a');
    expect(c).toMatchObject({ highlights: 2, underlines: 1, notes: 1, bookmarks: 2, links: 1 });   // g4 spans B: it stays, not counted
    expect(JournalStore.associatedDataSummary(j.id, 'b_zzz')).toBe(null);
  });

  it('purges them once the block is gone; the other block, the spanning note\'s other key and the whole-entry link stay', () => {
    const { j, A, B } = setup();
    JournalStore.update(j.id, { blocks: [{ id: 'b_b', type: 'p', text: 'two' }] });
    expect(JournalStore.purgeBlockMarks(j.id, 'b_a')).toBeGreaterThan(0);
    expect(AnnotationStore.get(A)).toEqual([]);
    expect(AnnotationStore.get(B).map((a) => a.id).sort()).toEqual(['h2', 's2']);
    expect(NoteStore.get('g1')).toBe(null);
    expect(NoteStore.get('g4').keys).toEqual([B]);
    expect(BookmarkStore.all().map((b) => b.id)).toEqual(['bk_ab']);
    expect(LinkStore.all().map((l) => l.id)).toEqual(['l_whole']);
  });

  it('removes nothing while the block is still there (an Undo put it back), stored or in the editor\'s live blocks', () => {
    const { j, A } = setup();
    expect(JournalStore.purgeBlockMarks(j.id, 'b_a')).toBe(0);
    JournalStore.update(j.id, { blocks: [{ id: 'b_b', type: 'p', text: 'two' }] });
    expect(JournalStore.purgeBlockMarks(j.id, 'b_a', [{ id: 'b_a', type: 'p', text: 'one' }])).toBe(0);
    expect(AnnotationStore.get(A)).toHaveLength(3);
  });
});

describe('JournalStore - one block\'s purge never reaches another block (n4-06 refuter F2)', () => {
  it('a note whose stored keys are out of date keeps its segment on a block that stays', () => {
    const j = JournalStore.add({ title: 'E', blocks: [{ id: 'b_1', type: 'p', text: 'one' }, { id: 'b_12', type: 'p', text: 'two' }] });
    const k1 = 'journal:' + j.id + ':b_1', k12 = 'journal:' + j.id + ':b_12';
    AnnotationStore.add(k1, { id: 'y1', groupId: 'gy', start: 0, end: 3, kind: 'highlight', color: 'yellow' });
    AnnotationStore.add(k12, { id: 'y2', groupId: 'gy', start: 0, end: 3, kind: 'highlight', color: 'yellow' });
    NoteStore.set('gy', { body: 'stale keys', keys: [k1] });
    JournalStore.update(j.id, { blocks: [{ id: 'b_12', type: 'p', text: 'two' }] });
    JournalStore.purgeBlockMarks(j.id, 'b_1');
    expect(AnnotationStore.get(k12).map((a) => a.id)).toEqual(['y2']);
    expect(AnnotationStore.get(k1)).toEqual([]);
  });
});

describe('JournalStore - a squiggle is counted as a squiggle (ds5 s35.1)', () => {
  it('a squiggle-only entry is not described as a highlight', () => {
    const j = JournalStore.add({ title: 'S', blocks: [{ id: 'b_s', type: 'p', text: 'wavy' }] });
    AnnotationStore.add('journal:' + j.id + ':b_s', { id: 'q1', groupId: 'gq', start: 0, end: 4, kind: 'squiggle', color: 'yellow' });
    const c = JournalStore.associatedDataCounts(j.id);
    expect(c).toMatchObject({ highlights: 0, squiggles: 1, total: 1 });
    expect(JournalStore.associatedDataSummary(j.id)).toBe('1 squiggle');
  });
});
/* ──────────────────────────────────────────────────────────────
   tests-6 item 14a: JournalStore CRUD fallbacks + pins/notebook
   toggles + media helpers + clear/replaceAll + JournalNotebookStore.
   The cascade machinery (_scanAssociated / rekeyMarks / summary /
   purge) is item 14b — this half is the store surface itself.
   ────────────────────────────────────────────────────────────── */
describe('JournalStore - CRUD fallbacks (tests-6 item 14a)', () => {
  it('all() sorts by updated, falling back to created, then 0', () => {
    JournalStore.replaceAll({ list: [
      { id: 'a', title: 'A', blocks: [], tags: [], notebookIds: [], pinned: false, updated: 5, created: 1 },
      { id: 'b', title: 'B', blocks: [], tags: [], notebookIds: [], pinned: false, created: 9 },
      { id: 'c', title: 'C', blocks: [], tags: [], notebookIds: [], pinned: false },
    ] });
    expect(JournalStore.all().map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('get() returns null for a falsy id and for a missing id', () => {
    expect(JournalStore.get(null)).toBeNull();
    expect(JournalStore.get('')).toBeNull();
    expect(JournalStore.get(undefined)).toBeNull();
    expect(JournalStore.get('j_nope')).toBeNull();
  });

  it('count()/all()/get() tolerate a cache with no list', () => {
    JournalStore._cache = {};
    expect(JournalStore.count()).toBe(0);
    expect(JournalStore.all()).toEqual([]);
    expect(JournalStore.get('x')).toBeNull();
  });

  it('add() honours a full seed and defaults the rest', () => {
    const e = JournalStore.add({ id: 'j_fixed', title: 'T', mood: 'deep', tags: ['prayer'], notebookIds: ['n1'], pinned: true, created: 111, updated: 222, blocks: [{ id: 'b1', type: 'p', text: 'x' }] });
    expect(e).toMatchObject({ id: 'j_fixed', title: 'T', mood: 'deep', tags: ['prayer'], notebookIds: ['n1'], pinned: true, created: 111, updated: 222 });
    expect(e.blocks).toEqual([{ id: 'b1', type: 'p', text: 'x' }]);
    expect(JournalStore.get('j_fixed')).not.toBeNull();
  });

  it('add() with no seed mints an id and default blocks', () => {
    const e = JournalStore.add();
    expect(e.id).toMatch(/^j_/);
    expect(Array.isArray(e.blocks)).toBe(true);
    expect(e.title).toBe('');
    expect(e.mood).toBeNull();
    expect(e.tags).toEqual([]);
    expect(e.notebookIds).toEqual([]);
    expect(e.pinned).toBe(false);
    const e2 = JournalStore.add(null);
    expect(e2.id).toMatch(/^j_/);
  });

  it('add() falls back on non-array tags/notebookIds/blocks', () => {
    const e = JournalStore.add({ title: 'x', tags: 'nope', notebookIds: 'nope', blocks: 'nope' });
    expect(e.tags).toEqual([]);
    expect(e.notebookIds).toEqual([]);
    expect(Array.isArray(e.blocks)).toBe(true);
  });

  it('add() mints ids for id-less blocks and keeps the rest as-is', () => {
    const e = JournalStore.add({ title: 'x', blocks: [{ type: 'p', text: 'new' }, null, 'str', { id: 'kept', type: 'p' }] });
    expect(e.blocks[0].id).toMatch(/^b_/);
    expect(e.blocks[1]).toBeNull();
    expect(e.blocks[2]).toBe('str');
    expect(e.blocks[3].id).toBe('kept');
  });

  it('update() returns null for a falsy id, a missing patch, or an unknown id', () => {
    const e = JournalStore.add({ title: 'x' });
    expect(JournalStore.update(null, { title: 'y' })).toBeNull();
    expect(JournalStore.update('', { title: 'y' })).toBeNull();
    expect(JournalStore.update(e.id, null)).toBeNull();
    expect(JournalStore.update(e.id, undefined)).toBeNull();
    expect(JournalStore.update('j_nope', { title: 'y' })).toBeNull();
  });

  it('update() with keepDate moves the stamp 1 ms past the entry stamp', () => {
    JournalStore.replaceAll({ list: [{ id: 'k', title: 'K', blocks: [], tags: [], notebookIds: [], pinned: false, created: 1000, updated: 1000 }] });
    const out = JournalStore.update('k', { title: 'K2' }, { keepDate: true });
    expect(out.updated).toBe(1001);
    expect(out.title).toBe('K2');
    const out2 = JournalStore.update('k', { title: 'K3' });
    expect(out2.updated).toBeGreaterThan(1001);
  });

  it('update() with blocks reindexes; without blocks it does not', () => {
    const spy = vi.spyOn(JournalIndexStore, 'rebuildForEntry');
    const e = JournalStore.add({ title: 'x' });
    spy.mockClear();
    JournalStore.update(e.id, { title: 'y' });
    expect(spy).not.toHaveBeenCalled();
    JournalStore.update(e.id, { blocks: [{ id: 'b1', type: 'p', text: 'z' }] });
    expect(spy).toHaveBeenCalledWith(e.id, expect.anything());
    spy.mockRestore();
  });
});

describe('JournalStore - pins and notebook toggles (tests-6 item 14a)', () => {
  it('setPinned keeps the date (keepDate) and returns null for an unknown id', () => {
    expect(JournalStore.setPinned('j_nope', true)).toBeNull();
    JournalStore.replaceAll({ list: [{ id: 'p', title: 'P', blocks: [], tags: [], notebookIds: [], pinned: false, created: 500, updated: 500 }] });
    const out = JournalStore.setPinned('p', true);
    expect(out.pinned).toBe(true);
    expect(out.updated).toBe(501);
  });

  it('togglePin flips and returns null for an unknown id', () => {
    expect(JournalStore.togglePin('j_nope')).toBeNull();
    const e = JournalStore.add({ title: 'x' });
    expect(JournalStore.togglePin(e.id).pinned).toBe(true);
    expect(JournalStore.togglePin(e.id).pinned).toBe(false);
  });

  it('toggleNotebook adds then removes a membership; guards falsy ids', () => {
    expect(JournalStore.toggleNotebook('j_nope', 'n1')).toBeNull();
    const e = JournalStore.add({ title: 'x' });
    expect(JournalStore.toggleNotebook(e.id, '')).toBeNull();
    expect(JournalStore.toggleNotebook(e.id)).toBeNull();
    expect(JournalStore.toggleNotebook(e.id, 'n1').notebookIds).toEqual(['n1']);
    expect(JournalStore.toggleNotebook(e.id, 'n2').notebookIds).toEqual(['n1', 'n2']);
    expect(JournalStore.toggleNotebook(e.id, 'n1').notebookIds).toEqual(['n2']);
  });

  it('toggleNotebook tolerates an entry with no notebookIds field', () => {
    JournalStore.replaceAll({ list: [{ id: 'm', title: 'M', blocks: [], tags: [], pinned: false, created: 1, updated: 1 }] });
    expect(JournalStore.toggleNotebook('m', 'n9').notebookIds).toEqual(['n9']);
  });
});

describe('JournalStore - pruneNotebook (tests-6 item 14a)', () => {
  it('is a no-op for a falsy notebook id', () => {
    const e = JournalStore.add({ title: 'x', notebookIds: ['n1'] });
    JournalStore.pruneNotebook('');
    JournalStore.pruneNotebook(null);
    expect(JournalStore.get(e.id).notebookIds).toEqual(['n1']);
  });

  it('strips the id, bumps only changed entries, and skips entries without the field', () => {
    JournalStore.replaceAll({ list: [
      { id: 'a', title: 'A', blocks: [], tags: [], notebookIds: ['n1', 'n2'], pinned: false, created: 1, updated: 10 },
      { id: 'b', title: 'B', blocks: [], tags: [], notebookIds: ['n2'], pinned: false, created: 1, updated: 20 },
      { id: 'c', title: 'C', blocks: [], tags: [], pinned: false, created: 1, updated: 30 },
      { id: 'd', title: 'D', blocks: [], tags: [], notebookIds: [], pinned: false, created: 1, updated: 40 },
    ] });
    const saveSpy = vi.spyOn(JournalStore, '_save');
    JournalStore.pruneNotebook('n1');
    expect(JournalStore.get('a').notebookIds).toEqual(['n2']);
    expect(JournalStore.get('a').updated).toBe(11);
    expect(JournalStore.get('b').notebookIds).toEqual(['n2']);
    expect(JournalStore.get('b').updated).toBe(20);
    expect(JournalStore.get('c').updated).toBe(30);
    expect(saveSpy).toHaveBeenCalled();
    saveSpy.mockClear();
    JournalStore.pruneNotebook('nX');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(JournalStore.get('a').updated).toBe(11);
    saveSpy.mockRestore();
  });
});

describe('JournalStore - media helpers (tests-6 item 14a)', () => {
  const seed = () => JournalStore.replaceAll({ list: [
    { id: 'a', title: 'A', blocks: [{ type: 'image', mediaId: 'm1' }, { type: 'audio', mediaId: 'm2' }, { type: 'image' }, { type: 'p', text: 'x', mediaId: 'mX' }], tags: [], notebookIds: [], pinned: false, created: 1, updated: 1 },
    { id: 'b', title: 'B', blocks: [{ type: 'audio', mediaId: 'm1' }], tags: [], notebookIds: [], pinned: false, created: 1, updated: 1 },
    { id: 'c', title: 'C', tags: [], notebookIds: [], pinned: false, created: 1, updated: 1 },
  ] });

  it('collectAllMediaIds returns every image/audio mediaId, in order', () => {
    seed();
    expect(JournalStore.collectAllMediaIds()).toEqual(['m1', 'm2', 'm1']);
  });

  it('isMediaReferencedElsewhere guards falsy ids and honours the exception', () => {
    seed();
    expect(JournalStore.isMediaReferencedElsewhere(null)).toBe(false);
    expect(JournalStore.isMediaReferencedElsewhere('')).toBe(false);
    expect(JournalStore.isMediaReferencedElsewhere('m_nope', 'a')).toBe(false);
    expect(JournalStore.isMediaReferencedElsewhere('m1', 'a')).toBe(true);
    expect(JournalStore.isMediaReferencedElsewhere('m2', 'a')).toBe(false);
    expect(JournalStore.isMediaReferencedElsewhere('m1', 'b')).toBe(true);
  });
});

describe('JournalStore - _reindex, clear, replaceAll (tests-6 item 14a)', () => {
  it('_reindex never throws when the index rebuild fails', () => {
    const spy = vi.spyOn(JournalHelpers, 'collectRefs').mockImplementation(() => { throw new Error('boom'); });
    const e = JournalStore.add({ title: 'x' });
    expect(JournalStore.get(e.id)).not.toBeNull();
    spy.mockRestore();
  });

  it('clear() empties the journal', () => {
    JournalStore.add({ title: 'one' });
    JournalStore.add({ title: 'two' });
    expect(JournalStore.count()).toBe(2);
    JournalStore.clear();
    expect(JournalStore.count()).toBe(0);
    expect(JournalStore.all()).toEqual([]);
  });

  it('clear() while pending wipes the overlay immediately (clear is not a deferred op)', () => {
    JournalStore._resetForTests();
    expect(JournalStore.getState()).toBe('pending');
    const e = JournalStore.add({ title: 'x' });
    expect(JournalStore.get(e.id)).not.toBeNull();
    JournalStore.clear();
    expect(JournalStore.get(e.id)).toBeNull();
    expect(JournalStore.count()).toBe(0);
  });

  it('replaceAll() tolerates null, non-object and list-less payloads', () => {
    JournalStore.add({ title: 'x' });
    JournalStore.replaceAll(null);
    expect(JournalStore.count()).toBe(0);
    JournalStore.replaceAll('nope');
    expect(JournalStore.count()).toBe(0);
    JournalStore.replaceAll({});
    expect(JournalStore.count()).toBe(0);
    JournalStore.replaceAll({ list: 'nope' });
    expect(JournalStore.count()).toBe(0);
    JournalStore.replaceAll({ list: [{ id: 'r1', title: 'R', blocks: [], tags: [], notebookIds: [], pinned: false, created: 1, updated: 1 }] });
    expect(JournalStore.count()).toBe(1);
    expect(JournalStore.get('r1').title).toBe('R');
  });
});

describe('JournalStore - remove() options and purgeOrphanMarks (tests-6 item 14a)', () => {
  it('remove(id, { skipStats: true }) skips the stats decrement', () => {
    const spy = vi.spyOn(JournalStatsStore, 'recordDeletion');
    const e = JournalStore.add({ title: 'x' });
    spy.mockClear();
    JournalStore.remove(e.id, { skipStats: true });
    expect(spy).not.toHaveBeenCalled();
    const e2 = JournalStore.add({ title: 'y' });
    spy.mockClear();
    JournalStore.remove(e2.id);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('remove(id, { keepMarks: true }) leaves the marks until purgeOrphanMarks', () => {
    const e = JournalStore.add({ title: 'x' });
    AnnotationStore.add('journal:' + e.id + ':0', { id: 'hl_k', start: 0, end: 5, kind: 'highlight', color: 'yellow' });
    JournalStore.remove(e.id, { keepMarks: true });
    expect(JournalStore.get(e.id)).toBeNull();
    expect(AnnotationStore.get('journal:' + e.id + ':0')).toHaveLength(1);
    JournalStore.purgeOrphanMarks(e.id);
    expect(AnnotationStore.get('journal:' + e.id + ':0')).toEqual([]);
  });

  it('purgeOrphanMarks is a no-op for a falsy id or an entry that is back', () => {
    expect(() => JournalStore.purgeOrphanMarks('')).not.toThrow();
    expect(() => JournalStore.purgeOrphanMarks(null)).not.toThrow();
    const e = JournalStore.add({ title: 'x' });
    AnnotationStore.add('journal:' + e.id + ':0', { id: 'hl_b', start: 0, end: 5, kind: 'highlight', color: 'yellow' });
    JournalStore.purgeOrphanMarks(e.id);
    expect(AnnotationStore.get('journal:' + e.id + ':0')).toHaveLength(1);
    expect(JournalStore.get(e.id)).not.toBeNull();
  });

  it('purgeOrphanMarks on an unknown id scans and purges nothing', () => {
    expect(() => JournalStore.purgeOrphanMarks('j_nope')).not.toThrow();
  });
});

describe('JournalNotebookStore (tests-6 item 14a)', () => {
  it('list() sorts by sortIndex, then created', () => {
    JournalNotebookStore.replaceAll({ list: [
      { id: 'n1', name: 'B', sortIndex: 1, created: 5, updated: 5 },
      { id: 'n2', name: 'A', sortIndex: 1, created: 2, updated: 2 },
      { id: 'n3', name: 'C', created: 9, updated: 9 },
      { id: 'n4', name: 'D', updated: 9 },
    ] });
    expect(JournalNotebookStore.list().map((n) => n.id)).toEqual(['n4', 'n3', 'n2', 'n1']);
  });

  it('get() returns null for an unknown id', () => {
    expect(JournalNotebookStore.get('nb_nope')).toBeNull();
  });

  it('add() rejects blank names and numbers notebooks by position', () => {
    JournalNotebookStore.replaceAll({ list: [] });
    expect(JournalNotebookStore.add('')).toBeNull();
    expect(JournalNotebookStore.add(null)).toBeNull();
    expect(JournalNotebookStore.add('   ')).toBeNull();
    const a = JournalNotebookStore.add('  Work  ');
    expect(a.name).toBe('Work');
    expect(a.id).toMatch(/^jnb_/);
    expect(a.sortIndex).toBe(0);
    const b = JournalNotebookStore.add('Home');
    expect(b.sortIndex).toBe(1);
  });

  it('rename() ignores blank names and unknown ids, and renames in place', () => {
    JournalNotebookStore.replaceAll({ list: [] });
    const nb = JournalNotebookStore.add('Old');
    JournalNotebookStore.rename(nb.id, '');
    JournalNotebookStore.rename(nb.id, '   ');
    JournalNotebookStore.rename(nb.id, null);
    expect(JournalNotebookStore.get(nb.id).name).toBe('Old');
    JournalNotebookStore.rename('nb_nope', 'New');
    expect(JournalNotebookStore.list()).toHaveLength(1);
    const before = JournalNotebookStore.get(nb.id).updated;
    JournalNotebookStore.rename(nb.id, 'New');
    expect(JournalNotebookStore.get(nb.id).name).toBe('New');
    expect(JournalNotebookStore.get(nb.id).updated).toBeGreaterThanOrEqual(before);
  });

  it('remove() deletes the notebook and prunes it from entries', () => {
    JournalNotebookStore.replaceAll({ list: [] });
    const nb = JournalNotebookStore.add('Gone');
    const e = JournalStore.add({ title: 'x', notebookIds: [nb.id, 'keep'] });
    JournalNotebookStore.remove(nb.id);
    expect(JournalNotebookStore.get(nb.id)).toBeNull();
    expect(JournalStore.get(e.id).notebookIds).toEqual(['keep']);
  });

  it('replaceAll() tolerates null, non-object and list-less payloads', () => {
    JournalNotebookStore.add('x');
    JournalNotebookStore.replaceAll(null);
    expect(JournalNotebookStore.list()).toEqual([]);
    JournalNotebookStore.replaceAll('nope');
    expect(JournalNotebookStore.list()).toEqual([]);
    JournalNotebookStore.replaceAll({});
    expect(JournalNotebookStore.list()).toEqual([]);
    JournalNotebookStore.replaceAll({ list: 'nope' });
    expect(JournalNotebookStore.list()).toEqual([]);
    JournalNotebookStore.replaceAll({ list: [{ id: 'r1', name: 'R', sortIndex: 0, created: 1, updated: 1 }] });
    expect(JournalNotebookStore.list()).toHaveLength(1);
  });
});

/* ──────────────────────────────────────────────────────────────
   tests-6 item 14a, round 2: the cheap stragglers the first pass
   left — sort-comparator falsy sides, keepDate/prune stamp
   fallbacks, _cache-with-no-list reads, and the pending-state
   _shouldDefer sides. The scan/rekey/summary/purge internals
   (journal-store.js:299-348, 391-419, 480-484, 498-535) stay 14b.
   ────────────────────────────────────────────────────────────── */
describe('JournalStore - 14a stragglers', () => {
  it('all() covers the both-missing sort side with a two-entry list', () => {
    JournalStore.replaceAll({ list: [
      { id: 'c', title: 'C', blocks: [], tags: [], notebookIds: [], pinned: false, created: 3, updated: 3 },
      { id: 'n', title: 'N', blocks: [], tags: [], notebookIds: [], pinned: false },
    ] });
    expect(JournalStore.all().map((e) => e.id)).toEqual(['c', 'n']);
  });

  it('all() covers the first-operand sort side with the neither-entry first', () => {
    JournalStore.replaceAll({ list: [
      { id: 'n', title: 'N', blocks: [], tags: [], notebookIds: [], pinned: false },
      { id: 'c', title: 'C', blocks: [], tags: [], notebookIds: [], pinned: false, created: 3, updated: 3 },
    ] });
    expect(JournalStore.all().map((e) => e.id)).toEqual(['c', 'n']);
  });

  it('keepDate stamps from created, then 0, when updated is missing', () => {
    JournalStore.replaceAll({ list: [
      { id: 'k1', title: 'K1', blocks: [], tags: [], notebookIds: [], pinned: false, created: 50 },
      { id: 'k2', title: 'K2', blocks: [], tags: [], notebookIds: [], pinned: false },
    ] });
    expect(JournalStore.setPinned('k1', true).updated).toBe(51);
    expect(JournalStore.setPinned('k2', true).updated).toBe(1);
  });

  it('pruneNotebook bumps from created, then 0, when updated is missing', () => {
    JournalStore.replaceAll({ list: [
      { id: 'a', title: 'A', blocks: [], tags: [], notebookIds: ['n1'], pinned: false, created: 7 },
      { id: 'b', title: 'B', blocks: [], tags: [], notebookIds: ['n1'], pinned: false },
    ] });
    JournalStore.pruneNotebook('n1');
    expect(JournalStore.get('a').updated).toBe(8);
    expect(JournalStore.get('b').updated).toBe(1);
  });

  it('reads tolerate a cache with no list', () => {
    JournalStore._cache = {};
    expect(JournalStore.collectAllMediaIds()).toEqual([]);
    expect(JournalStore.isMediaReferencedElsewhere('m', 'x')).toBe(false);
    expect(() => JournalStore.pruneNotebook('n')).not.toThrow();
    JournalNotebookStore._cache = {};
    expect(JournalNotebookStore.list()).toEqual([]);
    expect(JournalNotebookStore.get('x')).toBeNull();
    expect(() => JournalNotebookStore.rename('x', 'y')).not.toThrow();
    expect(() => JournalNotebookStore.remove('x')).not.toThrow();
    const nb = JournalNotebookStore.add('Fresh');
    expect(nb).not.toBeNull();
    expect(nb.sortIndex).toBe(0);
  });

  it('notebook list() covers the missing-created sort side with two entries', () => {
    JournalNotebookStore.replaceAll({ list: [
      { id: 'a', name: 'A', sortIndex: 0, created: 5, updated: 5 },
      { id: 'b', name: 'B', sortIndex: 0, updated: 5 },
    ] });
    expect(JournalNotebookStore.list().map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('notebook list() covers the first-operand sort side with the dateless notebook first', () => {
    JournalNotebookStore.replaceAll({ list: [
      { id: 'b', name: 'B', sortIndex: 0, updated: 5 },
      { id: 'a', name: 'A', sortIndex: 0, created: 5, updated: 5 },
    ] });
    expect(JournalNotebookStore.list().map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('pending-state calls reach the _shouldDefer sides', () => {
    JournalStore._resetForTests();
    expect(JournalStore.getState()).toBe('pending');
    expect(() => JournalStore.pruneNotebook('n')).not.toThrow();
    expect(() => JournalStore.replaceAll({ list: [] })).not.toThrow();
    expect(() => JournalStore.purgeOrphanMarks('x')).not.toThrow();
    JournalNotebookStore._resetForTests();
    expect(JournalNotebookStore.getState()).toBe('pending');
    JournalNotebookStore.add('x');
    JournalNotebookStore.rename('x', 'y');
    JournalNotebookStore.remove('x');
    JournalNotebookStore.replaceAll(null);
  });

  it('purgeBlockMarks guards falsy ids and a missing entry, and skips the purge at zero marks', () => {
    expect(JournalStore.purgeBlockMarks('', 'b_a')).toBe(0);
    expect(JournalStore.purgeBlockMarks('j_x', '')).toBe(0);
    expect(JournalStore.purgeBlockMarks('j_nope', 'b_a')).toBe(0);
    const j = JournalStore.add({ title: 'E', blocks: [{ id: 'b_a', type: 'p', text: 'one' }, { id: 'b_b', type: 'p', text: 'two' }] });
    JournalStore.update(j.id, { blocks: [{ id: 'b_b', type: 'p', text: 'two' }] });
    expect(JournalStore.purgeBlockMarks(j.id, 'b_a')).toBe(0);
  });
});

