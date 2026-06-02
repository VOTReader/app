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

import { describe, it, expect, beforeEach } from 'vitest';
import { JournalStore } from './journal-store.js';
import { AnnotationStore } from './annotation-store.js';
import { NoteStore } from './note-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { LinkStore } from './link-store.js';
import { JournalIndexStore } from './journal-index-store.js';
import { JournalStatsStore } from './journal-stats-store.js';

beforeEach(() => {
  localStorage.clear();
  JournalStore._resetForTests({ forceLoaded: true });
  AnnotationStore._resetForTests({ forceLoaded: true });
  NoteStore._resetForTests({ forceLoaded: true });
  BookmarkStore._resetForTests({ forceLoaded: true });
  LinkStore._resetForTests({ forceLoaded: true });
  JournalIndexStore._resetForTests({ forceLoaded: true });
  JournalStatsStore._resetForTests({ forceLoaded: true });

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

    const wrong_before = JournalStore.get(j_wrong.id).updated;
    const empty_before = JournalStore.get(j_empty.id).updated;

    // Strict clock advance so a spurious touch is visible.
    await new Promise(r => setTimeout(r, 5));

    JournalStore.pruneNotebook('nb_a');

    // j_with: nb_a was removed → updated bumped.
    expect(JournalStore.get(j_with.id).notebookIds).toEqual([]);
    expect(JournalStore.get(j_with.id).updated).toBeGreaterThan(wrong_before);

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
