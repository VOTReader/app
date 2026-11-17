// 0610: History removes one row (a place's visits on one day), with an Undo that puts them back exactly.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryStore } from '../stores/history-store.js';
import { removeHistoryRow } from './use-history.js';
import { _resetToasts } from '../utils/toast.js';

beforeEach(() => { localStorage.clear(); HistoryStore._resetForTests({ forceLoaded: true }); });
afterEach(() => { _resetToasts(); });

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
});
