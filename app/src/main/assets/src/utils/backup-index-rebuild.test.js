/* Refuter 11-26 (r6), on 4cea0509c: a restore skips a refused part and keeps the phone's copy. The journal index
   ("N journal entries on this letter", the letter chip and the inbound sheet) is computed only from the journal's
   entries (JournalStore._reindex). 4cea0509c skips the index with a skipped journal; the other way round it keeps
   on purpose: a good journal is written whatever its index is. Then a refused (or missing, or failed) index left
   the phone's old index beside the backup's entries, and nothing rebuilt it (JournalStore.replaceAll's comment
   said the import layer does; nothing did): the backup's entries lost their letter chips and the phone's gone
   entries kept theirs. Now a journal written without its index has the index rebuilt from the entries.

   And a v1 journal string that does not parse is named in the restore's skipped list, as Verify names it, so the
   result toast reads "invalid: vot-journal; with them: ..." instead of calling the good index and stats invalid. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { applyImportPayload, applyV3 } from './backup.js';
import { validateStorePayload } from './import-validators.js';
import { isSkippedWithSource } from './backup-related.js';
import { IDBAdapter } from '../stores/idb-adapter.js';
import { JournalStore } from '../stores/journal-store.js';
import { JournalIndexStore } from '../stores/journal-index-store.js';

const ALL = [JournalStore, JournalIndexStore];
const storesMap = () => ({
  'vot-journal': { store: JournalStore, method: 'replaceAll' },
  'vot-journal-index': { store: JournalIndexStore, method: 'replaceAll' },
});
const noMedia = { allIds: async () => [], delete: async () => {}, put: async () => {} };
const v3Media = {
  ...noMedia,
  beginImportReplace: async () => {}, stageImportRecord: async () => {},
  commitImportReplace: async () => ({ mode: 'replace', landed: 0 }), commitImportMerge: async () => ({ mode: 'merge', landed: 0 }),
  abortImportReplace: async () => {},
};
async function* none() { /* no media frames */ }
const deleteDb = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('votreader');
  req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined);
});
const flush = () => Promise.all(ALL.map((s) => s.whenSaved()));

const PHONE_LETTER = 'letter:v1/old-letter';
const BACKUP_LETTER = 'letter:v2/new-letter';
const entry = (id, volKey, letterId) => ({ id, created: 1, updated: 1, blocks: [{ type: 'letter-card', volKey, letterId }] });
const PHONE_JOURNAL = { list: [entry('p1', 'v1', 'old-letter')] };
const BACKUP_JOURNAL = { list: [entry('b1', 'v2', 'new-letter'), entry('b2', 'v2', 'new-letter')] };

const ctx = () => ({ storesMap: storesMap(), flagMap: {}, mediaStore: noMedia, validateStorePayload, validateMediaRecord: () => [] });

describe('a journal written without its index gets the index rebuilt from its entries', () => {
  beforeEach(async () => {
    await flush();
    IDBAdapter._resetForTests();
    await deleteDb();
    localStorage.clear();
    ALL.forEach((s) => s._resetForTests({ forceLoaded: true }));
    JournalStore.add(PHONE_JOURNAL.list[0]);
    await flush();
    expect(JournalIndexStore.entriesReferencing(PHONE_LETTER)).toEqual(['p1']);   // the phone's own, consistent
  });

  const check = () => {
    expect(JournalStore.all().map((e) => e.id).sort()).toEqual(['b1', 'b2']);
    expect(JournalIndexStore.entriesReferencing(BACKUP_LETTER).sort()).toEqual(['b1', 'b2']);  // the chip shows them
    expect(JournalIndexStore.entriesReferencing(PHONE_LETTER)).toEqual([]);                    // no chip for a gone entry
  };

  it('v2: a refused index', async () => {
    const res = await applyImportPayload({ exportVersion: 2, data: {}, stores: { 'vot-journal': BACKUP_JOURNAL, 'vot-journal-index': 'junk' }, media: {} }, ctx());
    expect(res.skippedStores).toEqual(['vot-journal-index']);
    check();
  });

  it('v2: a backup that carries the journal but no index', async () => {
    await applyImportPayload({ exportVersion: 2, data: {}, stores: { 'vot-journal': BACKUP_JOURNAL }, media: {} }, ctx());
    check();
  });

  it('v3: a refused index', async () => {
    const res = await applyV3({ app: 'VOTReader', exportVersion: 3, data: {}, media: [], stores: { 'vot-journal': BACKUP_JOURNAL, 'vot-journal-index': 'junk' } },
      none(), { storesMap: storesMap(), flagMap: {}, mediaStore: v3Media, validateStorePayload });
    expect(res.skippedStores).toEqual(['vot-journal-index']);
    check();
  });

  it('v1: an index string that does not parse', async () => {
    await applyImportPayload({ exportVersion: 1, data: { 'vot-journal': JSON.stringify(BACKUP_JOURNAL), 'vot-journal-index': '{bad' } }, ctx());
    check();
  });

  it('the rebuilt index is durable (a reload reads it back)', async () => {
    await applyImportPayload({ exportVersion: 2, data: {}, stores: { 'vot-journal': BACKUP_JOURNAL, 'vot-journal-index': 'junk' }, media: {} }, ctx());
    await flush();
    expect(await IDBAdapter.get('vot-journal-index', 'v')).toEqual({ [BACKUP_LETTER]: ['b1', 'b2'] });
  });

  it('unchanged: a good index is written as the backup has it', async () => {
    const own = { [BACKUP_LETTER]: ['b1'] };
    await applyImportPayload({ exportVersion: 2, data: {}, stores: { 'vot-journal': BACKUP_JOURNAL, 'vot-journal-index': own }, media: {} }, ctx());
    expect(JournalIndexStore.entriesReferencing(BACKUP_LETTER)).toEqual(['b1']);
  });

  it('unchanged: a skipped journal keeps the phone\'s journal and index together', async () => {
    await applyImportPayload({ exportVersion: 2, data: {}, stores: { 'vot-journal': { list: 'oops' }, 'vot-journal-index': {} }, media: {} }, ctx());
    expect(JournalStore.all().map((e) => e.id)).toEqual(['p1']);
    expect(JournalIndexStore.entriesReferencing(PHONE_LETTER)).toEqual(['p1']);
  });

  it('unchanged: a backup with no journal leaves both alone', async () => {
    await applyImportPayload({ exportVersion: 2, data: {}, stores: { 'vot-journal-index': 'junk' }, media: {} }, ctx());
    expect(JournalStore.all().map((e) => e.id)).toEqual(['p1']);
    expect(JournalIndexStore.entriesReferencing(PHONE_LETTER)).toEqual(['p1']);
  });
});

describe('v1: a journal string that does not parse is named in the skipped list, so the toast names it', () => {
  it('the restore lists the journal with its index and stats', async () => {
    const res = await applyImportPayload({ exportVersion: 1, data: {
      'vot-journal': '{not json', 'vot-journal-index': '{}', 'vot-journal-stats': '{}',
    } }, { ...ctx(), storesMap: {
      'vot-journal': { store: { replaceAll() {}, whenSaved: () => Promise.resolve(true) }, method: 'replaceAll' },
      'vot-journal-index': { store: { replaceAll() {}, whenSaved: () => Promise.resolve(true) }, method: 'replaceAll' },
      'vot-journal-stats': { store: { replaceAll() {}, whenSaved: () => Promise.resolve(true) }, method: 'replaceAll' },
    } });
    expect(res.skippedStores).toEqual(['vot-journal', 'vot-journal-index', 'vot-journal-stats']);
    // backup-flow's toast split: the good index and stats read "with them", never "invalid".
    const withThem = res.skippedStores.filter((n) => isSkippedWithSource(n, res.skippedStores));
    expect(withThem).toEqual(['vot-journal-index', 'vot-journal-stats']);
  });
});
