/* The orphan sweep against a sibling PWA tab (review 2026-11-26). A tab's journal in memory does not see another
   tab's saves until it saves itself, so the boot sweep (use-journal-media-sweep.js) took a photo the other tab had
   just linked for an orphan and deleted it. The sweep now also keeps what the stored journal names, read with the
   journal's save lock held. Real stores on fake-indexeddb. */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { JournalStore } from './journal-store.js';
import { JournalMediaStore } from './journal-media-store.js';
import { IDBAdapter } from './idb-adapter.js';

describe('orphan sweep vs a sibling tab', () => {
  it('keeps media another tab linked after this tab loaded the journal', async () => {
    // This tab boots: one entry, no media.
    await IDBAdapter.put('vot-journal', 'v', { list: [{ id: 'e1', created: 1, updated: 1, title: 'old', blocks: [{ id: 'b1', type: 'text', text: 'x' }] }] });
    await JournalStore._hydrate();
    expect(JournalStore.isReady()).toBe(true);
    // The sibling tab: photo stored, an entry naming it saved, the link marked.
    const created = Date.now() - 1000;
    await JournalMediaStore.put({ id: 'm1', type: 'image', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), mime: 'image/jpeg', size: 3, created, unlinked: true });
    const cur = await IDBAdapter.get('vot-journal', 'v');
    cur.list.push({ id: 'e2', created, updated: created, title: 'new', blocks: [{ id: 'b2', type: 'image', mediaId: 'm1' }] });
    await IDBAdapter.put('vot-journal', 'v', cur);
    await JournalMediaStore.markLinked('m1');
    // An orphan nobody names, for the sweep still to take.
    await JournalMediaStore.put({ id: 'm9', type: 'image', blob: new Blob([new Uint8Array([9])], { type: 'image/jpeg' }), mime: 'image/jpeg', size: 1, created });
    // This tab's sweep, as use-journal-media-sweep.js runs it.
    const referenced = JournalStore.collectAllMediaIds();
    expect(referenced).toEqual([]);
    const n = await JournalStore.withSavesHeld(() => JournalMediaStore.pruneOrphans(referenced, Date.now(), () => JournalStore.mediaIdsOnDisk()));
    expect(await JournalMediaStore.get('m1')).toBeTruthy();
    expect(await JournalMediaStore.get('m9')).toBeFalsy();
    expect(n).toBe(1);
  });

  it('deletes nothing when the stored journal cannot be read', async () => {
    const created = Date.now() - 1000;
    await JournalMediaStore.put({ id: 'm7', type: 'image', blob: new Blob([new Uint8Array([7])], { type: 'image/jpeg' }), mime: 'image/jpeg', size: 1, created });
    await expect(JournalMediaStore.pruneOrphans([], Date.now(), () => Promise.reject(new Error('read failed')))).rejects.toThrow('read failed');
    expect(await JournalMediaStore.get('m7')).toBeTruthy();
  });
});
