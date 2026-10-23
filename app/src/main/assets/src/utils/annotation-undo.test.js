// A06.6 / U06.2 (ideas audit n85, n343): a removed mark or link comes back with Undo; a new mark comes off with it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { snapshotGroups, offerUndoRemoved, offerUndoAdded, offerUndoLinkRemoved } from './annotation-undo.js';
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
