// 0610: History removes one row (a place's visits on one day), with an Undo that puts them back exactly.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryStore } from '../stores/history-store.js';
import { removeHistoryRow } from './history-undo.js';
import { _resetToasts } from './toast.js';

// The app reads HistoryStore as bundle-b's window global (bundle-d must not build its own copy).
beforeEach(() => { localStorage.clear(); HistoryStore._resetForTests({ forceLoaded: true }); /** @type {any} */ (globalThis).HistoryStore = HistoryStore; });
afterEach(() => { _resetToasts(); delete /** @type {any} */ (globalThis).HistoryStore; });

describe('removeHistoryRow', () => {
  it("removes that place's visits on the row's day only; Undo puts the list back as it was", () => {
    const D = new Date(2026, 10, 17, 12).getTime();
    HistoryStore.setAll([
      { type: 'chapter', bookId: 'psalms', chapterNum: 23, key: 'ch:psalms:23', ts: D + 3000 },
      { type: 'letter', letterId: 'x', key: 'lt:x', ts: D + 2000 },
      { type: 'chapter', bookId: 'psalms', chapterNum: 23, key: 'ch:psalms:23', ts: D - 3 * 3600000 },
      { type: 'chapter', bookId: 'psalms', chapterNum: 23, key: 'ch:psalms:23', ts: D - 86400000 },
    ]);
    const before = JSON.parse(JSON.stringify(HistoryStore.list()));
    removeHistoryRow({ key: 'ch:psalms:23', ts: D + 3000 });
    expect(HistoryStore.list().map((e) => e.key + '@' + e.ts)).toEqual(['lt:x@' + (D + 2000), 'ch:psalms:23@' + (D - 86400000)]);
    const toast = document.getElementById('vot-toast-history-removed');
    expect(toast.textContent).toBe('Removed from historyUndo');
    /** @type {HTMLButtonElement} */ (toast.querySelector('.vot-undo-btn')).click();
    expect(JSON.parse(JSON.stringify(HistoryStore.list()))).toEqual(before);
  });

  it('with no HistoryStore global (bundle-b not loaded) it does nothing and throws nothing', () => {
    delete /** @type {any} */ (globalThis).HistoryStore;
    expect(() => removeHistoryRow({ key: 'ch:psalms:23', ts: Date.now() })).not.toThrow();
    expect(document.getElementById('vot-toast-history-removed')).toBeNull();
  });
});
