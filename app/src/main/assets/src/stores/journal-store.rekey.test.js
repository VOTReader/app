// @ts-nocheck - tests pin the other stores onto globalThis, as journal-store.test.js does
/* JournalStore.rekeyMarks() - the boot pass that moves journal marks from block
   positions to block ids across the four stores that hold them (v05-01). The
   rules live in journal-mark-rekey.js and its own tests; this file proves the
   live stores are read, written back, and left alone once nothing is keyed by
   position. Globals pinned as in journal-store.test.js (the store reads the
   other stores as bare names, populated by _entry-b.js in production). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBAdapter } from './idb-adapter.js';
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
  globalThis.AnnotationStore = AnnotationStore;
  globalThis.NoteStore = NoteStore;
  globalThis.BookmarkStore = BookmarkStore;
  globalThis.LinkStore = LinkStore;
  globalThis.JournalIndexStore = JournalIndexStore;
  globalThis.JournalStatsStore = JournalStatsStore;
});

describe('JournalStore.rekeyMarks()', () => {
  it('moves a highlight, a note, a bookmark and a link end onto block ids, and a second call changes nothing', () => {
    // The marks were made on [A, B]; a divider went in at the top afterwards.
    const e = JournalStore.add({
      title: 'Philippians',
      blocks: [
        { id: 'b_div', type: 'divider' },
        { id: 'b_a', type: 'p', text: 'Grace to you, and peace.' },
        { id: 'b_b', type: 'p', text: 'I thank my God upon every remembrance of you.' },
      ],
    });
    const pos = (n) => 'journal:' + e.id + ':' + n;
    const id = (b) => 'journal:' + e.id + ':' + b;
    AnnotationStore.add(pos(0), { id: 'hl_a', groupId: 'hl_a', kind: 'highlight', color: 'yellow', start: 0, end: 5, text: 'Grace' });
    AnnotationStore.add(pos(1), { id: 'nt_b', groupId: 'g_b', kind: 'note', color: 'yellow', start: 0, end: 7, text: 'I thank' });
    NoteStore.set('g_b', { body: 'gratitude', keys: [pos(1)], fullText: 'I thank' });
    BookmarkStore.add({ id: 'bk_b', hlKey: pos(1) + ':2-7', label: 'thank' });
    LinkStore.add({
      id: 'ln_a',
      source: { type: /** @type {any} */ ('journal'), key: pos(0), label: 'Grace', text: 'Grace' },
      target: { type: 'bible', key: 'bible:philippians:1:2', label: 'Philippians 1:2' },
      created: 1,
    });

    const r = JournalStore.rekeyMarks();

    expect(r).toEqual({ moved: 5, left: 0 });
    expect(Object.keys(AnnotationStore.all()).sort()).toEqual([id('b_a'), id('b_b')]);
    expect(AnnotationStore.get(id('b_a'))[0].id).toBe('hl_a');
    expect(AnnotationStore.get(id('b_b'))[0].id).toBe('nt_b');
    expect(NoteStore.get('g_b').keys).toEqual([id('b_b')]);
    expect(NoteStore.get('g_b').body).toBe('gratitude');
    expect(BookmarkStore.get('bk_b').hlKey).toBe(id('b_b') + ':2-7');
    expect(LinkStore.all()[0].source.key).toBe(id('b_a'));
    expect(LinkStore.all()[0].target.key).toBe('bible:philippians:1:2');

    expect(JournalStore.rekeyMarks()).toEqual({ moved: 0, left: 0 });
  });

  it('the entry delete cascade still finds id-keyed marks', () => {
    const e = JournalStore.add({ title: 'One', blocks: [{ id: 'b_a', type: 'p', text: 'Grace.' }] });
    AnnotationStore.add('journal:' + e.id + ':b_a', { id: 'hl', groupId: 'hl', kind: 'highlight', color: 'yellow', start: 0, end: 5, text: 'Grace' });
    expect(JournalStore.associatedDataCounts(e.id).highlights).toBe(1);
  });

  it('with nothing keyed by position no store is written', () => {
    JournalStore.add({ title: 'Empty', blocks: [{ id: 'b_a', type: 'p', text: 'Grace.' }] });
    const before = AnnotationStore.all();
    expect(JournalStore.rekeyMarks()).toEqual({ moved: 0, left: 0 });
    expect(AnnotationStore.all()).toBe(before);
  });

  it('F4: an inline bookmark link in a paragraph reads as the title the viewer shows', () => {
    BookmarkStore.add({ id: 'bk_g', hlKey: 'bible:john:3:16', label: 'Grace' });
    const e = JournalStore.add({
      title: 'Links',
      blocks: [
        { id: 'b_link', type: 'p', text: 'Read [[bookmark:bk_g]] today' },
        { id: 'b_same', type: 'p', text: 'Read Grace today' },
      ],
    });
    AnnotationStore.add('journal:' + e.id + ':0', { id: 'hl', groupId: 'hl', kind: 'highlight', color: 'yellow', start: 0, end: 16, text: 'Read Grace today' });
    JournalStore.rekeyMarks();
    expect(Object.keys(AnnotationStore.all())).toEqual(['journal:' + e.id + ':b_link']);
  });
});

/* The refutation's store-level counterexamples, through the real save path: the stores hydrate from one IDB (an
   in-memory stand-in, as cross-tab-merge.test.js uses) and every save is the cross-tab merge the app runs. */
describe('JournalStore.rekeyMarks() on hydrated stores (refutation F1, F8)', () => {
  const STORES = () => [JournalStore, AnnotationStore, NoteStore, BookmarkStore, LinkStore];
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const settle = () => Promise.all(STORES().map((s) => s.whenSaved()));
  /** @type {any} */ let idb;
  const disk = (name) => idb[name] && idb[name].v;

  const ENTRY = { id: 'j_1', created: 1, updated: 1, blocks: [{ id: 'b_a', type: 'p', text: 'Grace' }, { id: 'b_b', type: 'p', text: 'Peace' }] };
  const DISK = {
    'vot-journal': { list: [ENTRY] },
    'vot-annotations': { 'journal:j_1:0': [{ id: 's1', groupId: 'g1', kind: 'note', color: 'yellow', start: 0, end: 5, text: 'Grace', created: 1, updated: 1 }] },
    'vot-notes': { g1: { groupId: 'g1', keys: ['journal:j_1:0'], fullText: 'Grace', body: 'Keep me', created: 1, updated: 1 } },
    'vot-bookmarks': [{ id: 'bk1', hlKey: 'journal:j_1:0:0-5', label: 'Grace', created: 1, updated: 1 }],
    'vot-links': [{ id: 'ln1', source: { type: 'journal', key: 'journal:j_1:0', text: 'Grace' }, target: { type: 'bible', key: 'bible:john:3:16' }, created: 1 }],
  };

  beforeEach(() => {
    idb = {};
    Object.keys(DISK).forEach((name) => { idb[name] = { v: clone(DISK[name]) }; });
    vi.spyOn(IDBAdapter, 'get').mockImplementation((store, key) => Promise.resolve(clone(idb[store] && idb[store][String(key)])));
    vi.spyOn(IDBAdapter, 'put').mockImplementation((store, key, val) => {
      (idb[store] || (idb[store] = {}))[String(key)] = clone(val);
      return Promise.resolve();
    });
    STORES().forEach((s) => s._resetForTests());
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('F1: the moved note, bookmark and link are what is saved (the merge kept the old keys), and a second run writes nothing', async () => {
    await Promise.all(STORES().map((s) => s._hydrate()));
    await settle();
    expect(JournalStore.rekeyMarks()).toEqual({ moved: 4, left: 0 });
    await settle();
    expect(Object.keys(disk('vot-annotations'))).toEqual(['journal:j_1:b_a']);
    expect(disk('vot-notes').g1.keys).toEqual(['journal:j_1:b_a']);
    expect(disk('vot-notes').g1.body).toBe('Keep me');
    expect(disk('vot-bookmarks')[0].hlKey).toBe('journal:j_1:b_a:0-5');
    expect(disk('vot-links')[0].source.key).toBe('journal:j_1:b_a');
    expect(NoteStore.get('g1').keys).toEqual(['journal:j_1:b_a']);   // and the live cache kept them too
    const puts = IDBAdapter.put.mock.calls.length;
    expect(JournalStore.rekeyMarks()).toEqual({ moved: 0, left: 0 });
    await settle();
    expect(IDBAdapter.put.mock.calls.length).toBe(puts);
  });

  it('F7: a mark a tab on an older version edited under its old key after this tab loaded ends up once, the newer copy', async () => {
    await Promise.all(STORES().map((s) => s._hydrate()));
    await settle();
    const edited = { ...DISK['vot-annotations']['journal:j_1:0'][0], color: 'blue', updated: 2 };
    idb['vot-annotations'].v = { 'journal:j_1:0': [edited] };   // the older tab's save, behind this tab's back
    JournalStore.rekeyMarks();
    await vi.waitFor(() => expect(disk('vot-annotations')).toEqual({ 'journal:j_1:b_a': [edited] }));
    expect(AnnotationStore.get('journal:j_1:b_a')).toEqual([edited]);
  });

  it('F8: a store still loading when the pass runs is waited for, and the pass runs once it has loaded', async () => {
    await Promise.all([JournalStore, NoteStore, BookmarkStore, LinkStore].map((s) => s._hydrate()));
    expect(AnnotationStore.isReady()).toBe(false);   // its read outlived the gate's 3 s timeout
    expect(JournalStore.rekeyMarks().moved).toBe(0);
    expect(NoteStore.get('g1').keys).toEqual(['journal:j_1:0']);   // nothing moves while one store is still loading
    await AnnotationStore._hydrate();
    await vi.waitFor(() => expect(Object.keys(AnnotationStore.all())).toEqual(['journal:j_1:b_a']));
    expect(NoteStore.get('g1').keys).toEqual(['journal:j_1:b_a']);
    expect(BookmarkStore.get('bk1').hlKey).toBe('journal:j_1:b_a:0-5');
    await settle();
    expect(Object.keys(disk('vot-annotations'))).toEqual(['journal:j_1:b_a']);
  });
});
