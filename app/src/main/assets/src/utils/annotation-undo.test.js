// A06.6 / U06.2 (ideas audit n85, n343): a removed mark or link comes back with Undo; a new mark comes off with it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { snapshotGroups, offerUndoRemoved, offerUndoAdded, offerUndoLinkRemoved, removeBookmarkWithUndo, removeLinkWithUndo } from './annotation-undo.js';
import { _resetToasts } from './toast.js';

const G = /** @type {any} */ (globalThis);

let data;
beforeEach(() => {
  data = { k1: [{ id: 'a', groupId: 'g', kind: 'highlight', color: 'yellow', start: 0, end: 4 }], k2: [{ id: 'b', groupId: 'g', kind: 'highlight', color: 'yellow', start: 0, end: 2 }] };
  G.AnnotationStore = {
    getByGroup: (gid) => Object.keys(data).flatMap((k) => data[k].filter((h) => h.groupId === gid).map((ann) => ({ key: k, ann }))),
    add: vi.fn((k, ann) => { (data[k] = data[k] || []).push(ann); }),
    removeGroup: vi.fn((gid) => { for (const k of Object.keys(data)) { data[k] = data[k].filter((h) => h.groupId !== gid); if (!data[k].length) delete data[k]; } }),
  };
  G.NoteStore = { get: (gid) => (gid === 'g' ? { groupId: 'g', body: 'my words' } : null), set: vi.fn() };
});
afterEach(() => { _resetToasts(); delete G.AnnotationStore; delete G.NoteStore; delete G.LinkStore; });

const undo = (id) => /** @type {HTMLButtonElement} */ (document.getElementById(id).querySelector('.vot-undo-btn'));

describe('annotation undo', () => {
  it('Undo after a removal puts every segment and the note back', () => {
    const gone = snapshotGroups(['g']);
    G.AnnotationStore.removeGroup('g');
    offerUndoRemoved(gone, 'Highlight and note removed');
    expect(document.getElementById('vot-toast-mark-removed').textContent).toBe('Highlight and note removedUndo');
    undo('vot-toast-mark-removed').click();
    expect(data.k1.map((h) => h.id)).toEqual(['a']);
    expect(data.k2.map((h) => h.id)).toEqual(['b']);
    expect(G.NoteStore.set).toHaveBeenCalledWith('g', { groupId: 'g', body: 'my words' });
  });

  it('nothing was there: no toast', () => {
    offerUndoRemoved(snapshotGroups(['none']));
    expect(document.getElementById('vot-toast-mark-removed')).toBeNull();
  });

  it('Undo after a new mark takes it off', () => {
    offerUndoAdded('g', 'Underlined');
    expect(document.getElementById('vot-toast-mark-added').textContent).toBe('UnderlinedUndo');
    undo('vot-toast-mark-added').click();
    expect(G.AnnotationStore.removeGroup).toHaveBeenCalledWith('g');
  });

  it('Undo after a link removal adds the same link back', () => {
    G.LinkStore = { add: vi.fn() };
    const link = { id: 'l1', source: {}, target: {} };
    offerUndoLinkRemoved(link);
    undo('vot-toast-link-removed').click();
    expect(G.LinkStore.add).toHaveBeenCalledWith(link);
  });
});

describe('bookmark delete Undo (0610)', () => {
  let list;
  beforeEach(() => {
    list = [{ id: 'b1', hlKey: 'k:1', label: 'One' }, { id: 'b2', hlKey: 'k:2', label: 'Two', thought: 't' }, { id: 'b3', hlKey: 'k:3', label: 'Three' }];
    G.BookmarkStore = {
      all: () => list,
      get: (id) => list.find((b) => b.id === id) || null,
      remove: vi.fn((id) => { list = list.filter((b) => b.id !== id); }),
      restore: vi.fn((rec, i) => { if (!list.some((b) => b.id === rec.id)) list.splice(i, 0, rec); }),
    };
  });
  afterEach(() => { delete G.BookmarkStore; });

  it('deletes, offers "Bookmark deleted · Undo", and Undo puts the same record back in its place', () => {
    const before = JSON.parse(JSON.stringify(list));
    removeBookmarkWithUndo('b2');
    expect(list.map((b) => b.id)).toEqual(['b1', 'b3']);
    expect(document.getElementById('vot-toast-bookmark-removed').textContent).toBe('Bookmark deletedUndo');
    undo('vot-toast-bookmark-removed').click();
    expect(list).toEqual(before);
  });

  it('an unknown id deletes nothing and offers nothing', () => {
    removeBookmarkWithUndo('nope');
    expect(G.BookmarkStore.remove).not.toHaveBeenCalled();
    expect(document.getElementById('vot-toast-bookmark-removed')).toBeNull();
  });
});

describe('link delete Undo keeps the stored order (0610)', () => {
  it('removeLinkWithUndo deletes, offers "Link removed · Undo", and Undo restores the same record at its index', () => {
    let links = [{ id: 'l1' }, { id: 'l2', created: 5 }, { id: 'l3' }];
    G.LinkStore = {
      all: () => links,
      remove: vi.fn((id) => { links = links.filter((l) => l.id !== id); }),
      restore: vi.fn((rec, i) => { links.splice(i, 0, rec); }),
      add: vi.fn(),
    };
    removeLinkWithUndo('l2');
    expect(links.map((l) => l.id)).toEqual(['l1', 'l3']);
    undo('vot-toast-link-removed').click();
    expect(links).toEqual([{ id: 'l1' }, { id: 'l2', created: 5 }, { id: 'l3' }]);
    expect(G.LinkStore.add).not.toHaveBeenCalled();
  });
});
