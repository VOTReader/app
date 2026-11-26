/* Review 11-26: a restore skips a part that fails its shape check and the phone keeps its own copy, but the parts
   computed from it were still written. A skipped journal kept the phone's entries while the backup's journal index
   ("N journal entries on this letter") and journal stats (entry count, streak) replaced the phone's: both then
   described entries that never landed. Now a part computed from a skipped part is skipped with it (backup-related.js).

   The matrix below is the proof that a restore now writes LESS, never more: for every combination of a journal, its
   index and its stats being valid, refused, unparsable or absent, on the v1, v2 and v3 paths, the parts written are
   exactly the parts the restore wrote before (carried, parsed, passing the real shape check), minus the journal's
   index and stats when the journal itself is not written. */
import { describe, it, expect } from 'vitest';
import { applyImportPayload, applyV3 } from './backup.js';
import { validateStorePayload } from './import-validators.js';
import { summarizeBackupManifest, describeSkipped } from './backup-verify.js';
import { STORES_DERIVED_FROM, storesSkippedWith, isSkippedWithSource } from './backup-related.js';

const NAMES = ['vot-notes', 'vot-journal', 'vot-journal-index', 'vot-journal-stats', 'vot-bookmarks'];
const GOOD = {
  'vot-notes': { n1: { groupId: 'n1' } },
  'vot-journal': { list: [{ id: 'e1', blocks: [] }] },
  'vot-journal-index': { 'note:n1': ['e1'] },
  'vot-journal-stats': { totalEntries: 3, currentStreak: 1, longestStreak: 2, lastEntryDate: '2026-11-01', milestonesUnlocked: [] },
  'vot-bookmarks': [{ id: 'b1' }],
};
const BAD = { 'vot-journal': { list: 'oops' }, 'vot-journal-index': 'junk', 'vot-journal-stats': 'junk' };
const UNPARSED = '{not json';

/** Spy stores: which parts were written, and with what. */
function spies() {
  /** @type {Record<string, any[]>} */ const writes = {};
  /** @type {Record<string, { store: any, method: string }>} */ const storesMap = {};
  for (const n of NAMES) {
    writes[n] = [];
    storesMap[n] = { store: { replaceAll: (d) => writes[n].push(d), whenSaved: () => Promise.resolve(true) }, method: 'replaceAll' };
  }
  return { writes, storesMap, written: () => NAMES.filter((n) => writes[n].length) };
}
const noMedia = { allIds: async () => [], delete: async () => {}, put: async () => {} };
const v3Media = {
  ...noMedia,
  beginImportReplace: async () => {}, stageImportRecord: async () => {},
  commitImportReplace: async () => ({ mode: 'replace', landed: 0 }), commitImportMerge: async () => ({ mode: 'merge', landed: 0 }),
  abortImportReplace: async () => {},
};
async function* none() { /* no media frames */ }

/** Each of the three journal parts: 'good' | 'bad' | 'absent' (and 'unparsed' for v1's journal). */
const STATES = ['good', 'bad', 'absent'];
const combos = [];
for (const j of [...STATES, 'unparsed']) for (const i of STATES) for (const s of STATES) combos.push({ 'vot-journal': j, 'vot-journal-index': i, 'vot-journal-stats': s });

/** The parts as a v2/v3 stores block (an unparsed journal is a v1 thing: there it is a refused object). */
function storesBlock(c) {
  /** @type {Record<string, any>} */ const out = { 'vot-notes': GOOD['vot-notes'], 'vot-bookmarks': GOOD['vot-bookmarks'] };
  for (const k of Object.keys(c)) {
    if (c[k] === 'good') out[k] = GOOD[k];
    else if (c[k] === 'bad' || c[k] === 'unparsed') out[k] = BAD[k];
  }
  return out;
}
/** The parts as a v1 data block of JSON strings. */
function dataBlock(c) {
  /** @type {Record<string, string>} */ const out = { 'vot-notes': JSON.stringify(GOOD['vot-notes']), 'vot-bookmarks': JSON.stringify(GOOD['vot-bookmarks']) };
  for (const k of Object.keys(c)) {
    if (c[k] === 'good') out[k] = JSON.stringify(GOOD[k]);
    else if (c[k] === 'bad') out[k] = JSON.stringify(BAD[k]);
    else if (c[k] === 'unparsed') out[k] = UNPARSED;
  }
  return out;
}
/** What the restore wrote before this change: every part it carries that parses (v1: a JSON string) and passes the
    real shape check. */
function writtenBefore(parts, v1 = false) {
  return NAMES.filter((n) => {
    if (!(n in parts)) return false;
    let v = parts[n];
    if (v1) { try { v = JSON.parse(v); } catch (_e) { return false; } }
    return validateStorePayload(n, v).length === 0;
  });
}
/** What it writes now: the same, less a journal's index and stats when the journal is carried and not written. */
function writtenNow(parts, v1 = false) {
  const before = writtenBefore(parts, v1);
  const journalLost = 'vot-journal' in parts && before.indexOf('vot-journal') < 0;
  return before.filter((n) => !(journalLost && STORES_DERIVED_FROM['vot-journal'].indexOf(n) >= 0));
}

describe('a part computed from a skipped part is skipped with it', () => {
  it('REPRO (v2): a refused journal keeps the phone\'s journal, its index and its stats', async () => {
    const { writes, storesMap, written } = spies();
    const res = await applyImportPayload(
      { exportVersion: 2, data: {}, stores: storesBlock({ 'vot-journal': 'bad', 'vot-journal-index': 'good', 'vot-journal-stats': 'good' }), media: {} },
      { storesMap, flagMap: {}, mediaStore: noMedia, validateStorePayload, validateMediaRecord: () => [] },
    );
    expect(written()).toEqual(['vot-notes', 'vot-bookmarks']);
    expect(writes['vot-journal-index']).toEqual([]);
    expect(writes['vot-journal-stats']).toEqual([]);
    expect(res.skippedStores).toEqual(['vot-journal', 'vot-journal-index', 'vot-journal-stats']);
  });

  it('REPRO (v3): the same through applyV3', async () => {
    const { storesMap, written } = spies();
    const res = await applyV3(
      { app: 'VOTReader', exportVersion: 3, data: {}, media: [], stores: storesBlock({ 'vot-journal': 'bad', 'vot-journal-index': 'good', 'vot-journal-stats': 'good' }) },
      none(), { storesMap, flagMap: {}, mediaStore: v3Media, validateStorePayload },
    );
    expect(written()).toEqual(['vot-notes', 'vot-bookmarks']);
    expect(res.skippedStores).toEqual(['vot-journal', 'vot-journal-index', 'vot-journal-stats']);
  });

  it('REPRO (v1): a journal string that does not parse takes its index and stats with it', async () => {
    const { storesMap, written } = spies();
    const res = await applyImportPayload(
      { exportVersion: 1, data: dataBlock({ 'vot-journal': 'unparsed', 'vot-journal-index': 'good', 'vot-journal-stats': 'good' }) },
      { storesMap, flagMap: {}, mediaStore: noMedia, validateStorePayload, validateMediaRecord: () => [] },
    );
    expect(written()).toEqual(['vot-notes', 'vot-bookmarks']);
    expect(res.importFailures).toBe(1);                                         // the unparsed journal, as before
    // r6: the unparsed journal is named too, as Verify names it, so the toast reads its index and stats "with them".
    expect(res.skippedStores).toEqual(['vot-journal', 'vot-journal-index', 'vot-journal-stats']);
  });

  it('the other way round does not hold: a refused index or stats never stops a good journal', async () => {
    const { storesMap, written } = spies();
    const res = await applyImportPayload(
      { exportVersion: 2, data: {}, stores: storesBlock({ 'vot-journal': 'good', 'vot-journal-index': 'bad', 'vot-journal-stats': 'bad' }), media: {} },
      { storesMap, flagMap: {}, mediaStore: noMedia, validateStorePayload, validateMediaRecord: () => [] },
    );
    expect(written()).toEqual(['vot-notes', 'vot-journal', 'vot-bookmarks']);
    expect(res.skippedStores).toEqual(['vot-journal-index', 'vot-journal-stats']);
  });

  describe('LESS, never more: every combination, every path, writes what it wrote before minus the journal\'s parts', () => {
    for (const c of combos) {
      const label = Object.values(c).join('/');
      if (c['vot-journal'] !== 'unparsed') {
        it('v2 ' + label, async () => {
          const stores = storesBlock(c);
          const { storesMap, written } = spies();
          await applyImportPayload({ exportVersion: 2, data: {}, stores, media: {} },
            { storesMap, flagMap: {}, mediaStore: noMedia, validateStorePayload, validateMediaRecord: () => [] });
          const got = written();
          for (const n of got) expect(writtenBefore(stores)).toContain(n);              // nothing new is written
          expect(got).toEqual(writtenNow(stores));
        });
        it('v3 ' + label, async () => {
          const stores = storesBlock(c);
          const { storesMap, written } = spies();
          await applyV3({ app: 'VOTReader', exportVersion: 3, data: {}, media: [], stores }, none(),
            { storesMap, flagMap: {}, mediaStore: v3Media, validateStorePayload });
          const got = written();
          for (const n of got) expect(writtenBefore(stores)).toContain(n);
          expect(got).toEqual(writtenNow(stores));
        });
      }
      it('v1 ' + label, async () => {
        const data = dataBlock(c);
        const { storesMap, written } = spies();
        await applyImportPayload({ exportVersion: 1, data },
          { storesMap, flagMap: {}, mediaStore: noMedia, validateStorePayload, validateMediaRecord: () => [] });
        const got = written();
        for (const n of got) expect(writtenBefore(data, true)).toContain(n);
        expect(got).toEqual(writtenNow(data, true));
      });
    }
  });

  it('a skipped journal still makes the media a no-delete merge (unchanged)', async () => {
    const kept = { a: 1, b: 1 };
    const media = { allIds: async () => Object.keys(kept), delete: async (id) => { delete kept[id]; }, put: async () => {} };
    const { storesMap } = spies();
    await applyImportPayload(
      { exportVersion: 2, data: {}, stores: storesBlock({ 'vot-journal': 'bad', 'vot-journal-index': 'good', 'vot-journal-stats': 'good' }), media: {} },
      { storesMap, flagMap: {}, mediaStore: media, validateStorePayload, validateMediaRecord: () => [] },
    );
    expect(Object.keys(kept)).toEqual(['a', 'b']);
  });
});

describe('the counts sheet and Verify count what the restore now skips', () => {
  const sum = (c) => summarizeBackupManifest({ exportVersion: 2, data: {}, stores: storesBlock(c), media: {} });

  it('a refused journal: its index and stats are skipped too, and add no records', () => {
    const s = sum({ 'vot-journal': 'bad', 'vot-journal-index': 'good', 'vot-journal-stats': 'good' });
    expect(s.skippedStores.sort()).toEqual(['vot-journal', 'vot-journal-index', 'vot-journal-stats']);
    expect(s.skipped).toEqual(['journal']);                     // the one row; index and stats have none
    expect(s.storeCount).toBe(2);                               // notes and bookmarks
    expect(s.records).toBe(2);
  });

  it('Verify names the journal, not "2 other parts": the index and stats go with it', () => {
    const line = describeSkipped(sum({ 'vot-journal': 'bad', 'vot-journal-index': 'good', 'vot-journal-stats': 'good' }));
    expect(line).toContain('journal entries');
    expect(line).not.toMatch(/other part/);
  });

  it('a refused index alone is still "1 other part" (it is not skipped with anything)', () => {
    const line = describeSkipped(sum({ 'vot-journal': 'good', 'vot-journal-index': 'bad', 'vot-journal-stats': 'good' }));
    expect(line).toContain('1 other part');
  });

  it('v1: an unparsed journal string skips its index and stats in the summary as in the restore', () => {
    const s = summarizeBackupManifest({ exportVersion: 1, data: dataBlock({ 'vot-journal': 'unparsed', 'vot-journal-index': 'good', 'vot-journal-stats': 'good' }) });
    expect(s.skippedStores.sort()).toEqual(['vot-journal', 'vot-journal-index', 'vot-journal-stats']);
  });
});

describe('backup-related helpers', () => {
  it('storesSkippedWith adds only carried derived parts, once', () => {
    expect(storesSkippedWith(['vot-journal'], () => true)).toEqual(['vot-journal-index', 'vot-journal-stats']);
    expect(storesSkippedWith(['vot-journal'], (n) => n === 'vot-journal-stats')).toEqual(['vot-journal-stats']);
    expect(storesSkippedWith(['vot-journal', 'vot-journal-index'], () => true)).toEqual(['vot-journal-stats']);
    expect(storesSkippedWith(['vot-notes'], () => true)).toEqual([]);
  });
  it('isSkippedWithSource', () => {
    expect(isSkippedWithSource('vot-journal-index', ['vot-journal', 'vot-journal-index'])).toBe(true);
    expect(isSkippedWithSource('vot-journal-index', ['vot-journal-index'])).toBe(false);
    expect(isSkippedWithSource('vot-journal', ['vot-journal'])).toBe(false);
  });
});
