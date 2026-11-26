/* backup-verify — the read-only .votbak inspector's pure halves
   (FABLE5-BACKLOG [15]). The heavy checks live in readContainer /
   v3AndroidImportEntries (their own suites); these tests pin the
   summary math and the user-facing report copy. */

import { describe, it, expect } from 'vitest';
import { summarizeBackupManifest, formatVerifyReport } from './backup-verify.js';
import { buildV3Manifest, buildExportPayload } from './backup.js';
import { writeContainer, readContainer } from './backup-container.js';
import { formatBytes } from './format-bytes.js';

// Hand-written counts and no `stores` block, so the summary reads `counts`
// (its fallback). What the real exporter writes is tested at the end of the file.
const v3Manifest = {
  app: 'VOTReader',
  exportVersion: 3,
  exportDate: '2026-07-01T12:00:00.000Z',
  counts: {
    _media: 2,
    'vot-notes': 12,
    'vot-annotations': 40,
    'vot-journal': 5,
    'vot-bookmarks': 3,
    'vot-links': 7,
  },
  media: [
    { id: 'a', size: 1000 },
    { id: 'b', size: 2500 },
  ],
};

describe('summarizeBackupManifest', () => {
  it('totals records across stores (excluding _media) and sums media bytes (v3 array)', () => {
    const s = summarizeBackupManifest(v3Manifest);
    expect(s.records).toBe(12 + 40 + 5 + 3 + 7);
    expect(s.storeCount).toBe(5);
    expect(s.mediaCount).toBe(2);
    expect(s.mediaBytes).toBe(3500);
    expect(s.notes).toBe(12);
    // Declared counts hold passages, not marks: no stores block, no highlight count.
    expect(s.annotatedPassages).toBe(40);
    expect(s.highlights).toBe(0);
    expect(s.journal).toBe(5);
    expect(s.bookmarks).toBe(3);
    expect(s.date).toBe('2026-07-01T12:00:00.000Z');
  });

  it('handles the legacy v1/v2 media OBJECT map', () => {
    const s = summarizeBackupManifest({
      exportDate: '2026-01-01T00:00:00.000Z',
      counts: { 'vot-notes': 1 },
      media: { m1: { size: 10 }, m2: { size: 20 } },
    });
    expect(s.mediaCount).toBe(2);
    expect(s.mediaBytes).toBe(30);
  });

  it('never throws on garbage — zeros out', () => {
    const s = summarizeBackupManifest({ counts: { 'vot-notes': 'NaN?' }, media: 'nope' });
    expect(s.records).toBe(0);
    expect(s.storeCount).toBe(0);
    expect(s.mediaCount).toBe(0);
    expect(s.date).toBe(null);
    expect(summarizeBackupManifest(null).records).toBe(0);
  });
});

describe('formatVerifyReport', () => {
  const s = summarizeBackupManifest(v3Manifest);

  it('v3 with a passing CRC reads as intact', () => {
    const r = formatVerifyReport(s, 'ok', 'v3');
    expect(r.level).toBe('ok');
    expect(r.message).toContain('12 notes');
    expect(r.message).toContain('40 annotated passages');
    expect(r.message).toContain('5 journal entries');
    expect(r.message).toContain('67 records across 5 data stores');
    expect(r.message).toContain('2 media files');
    // id-datasafe 156: the CRC covers the records; media was only checked for size.
    expect(r.message).toContain('Checksum passed: your records read back intact. Photos and voice memos were checked for size, not content.');
    expect(formatVerifyReport({ ...s, mediaCount: 0 }, 'ok', 'v3').message).not.toContain('Photos');
  });

  it('a CRC mismatch is a warning', () => {
    const r = formatVerifyReport(s, 'mismatch', 'v3');
    // id-datasafe 157: plain words, no 'imported-readable'.
    expect(r.message).toContain('the checksum FAILED, so this file may be damaged. It can still be imported');
    expect(r.level).toBe('warn');
    expect(r.message).toContain('FAILED');
  });

  it('an older CRC-less v3 backup is ok with a checksum note', () => {
    const r = formatVerifyReport(s, 'absent', 'v3');
    expect(r.level).toBe('ok');
    expect(r.message).toContain('No checksum');
  });

  it('a malformed/trailing trailer warns about truncation', () => {
    const r = formatVerifyReport(s, 'malformed', 'v3');
    expect(r.level).toBe('warn');
    expect(r.message).toContain('truncated');
  });

  it('legacy backups report ok without a checksum claim', () => {
    const r = formatVerifyReport(s, 'absent', 'legacy');
    expect(r.level).toBe('ok');
    expect(r.message).toContain('Older text-format backup');
  });

  it('singulars + unknown date stay grammatical', () => {
    const one = summarizeBackupManifest({ counts: { 'vot-notes': 1 }, media: [{ id: 'x', size: 5 }] });
    const r = formatVerifyReport(one, 'ok', 'v3');
    expect(r.message).toContain('1 note — ');
    expect(r.message).toContain('1 record across 1 data store');
    expect(r.message).toContain('1 media file (');
    expect(r.message).toContain('date unknown');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   The seam storage-backup-1 opened. readContainer stopped throwing on a
   damaged media frame and started salvaging, which is right for IMPORT — the
   owner is warned before the confirm sheet and 99% of a backup beats none of
   it. "Verify a Backup" inherited the same change without its own report, and
   verify's entire job is telling the owner what the file can give back. So a
   media count taken from the manifest's claim rather than from what was
   actually read is the one number in this app that must never be optimistic:
   someone reads it, believes the backup is whole, and deletes the source.

   These run the real writeContainer -> readContainer -> formatVerifyReport
   chain rather than a hand-made integrity string, because the defect was in
   the seam between two modules that were each correct on their own.
   ───────────────────────────────────────────────────────────────────────── */
/* An integrity value the report does not recognise is not evidence about the
   file. `StorageManager.v3ImportVerify()` returns `error:<reason>` when the
   NATIVE verify session itself fails, `SettingsScreen`'s Android branch hands
   it straight to formatVerifyReport, and until 2026-09-04 it landed in the
   malformed/trailing arm — so a failed CHECK was reported as a damaged FILE,
   with a specific and wrong diagnosis, on Android, today. Found by the Verifier
   looking for a reachable path that omits the salvage count and finding a
   different one next to it. */
describe('an unrecognised integrity value reports ignorance, not a defect', () => {
  const s = summarizeBackupManifest(v3Manifest);

  for (const value of ['error:no_session', 'error:read_failed', 'something-new']) {
    it(`"${value}" does not accuse the file of anything`, () => {
      const r = formatVerifyReport(s, value, 'v3');
      expect(r.level).toBe('warn');
      expect(r.message).not.toContain('unexpected bytes at the end of the file');
      expect(r.message).not.toContain('truncated or altered');
      expect(r.message).toContain('could not be checked');
      // The manifest WAS read and validated, so the summary still stands.
      expect(r.message).toContain('2 media files');
    });
  }

  it('the two values that DO mean a damaged trailer still say so', () => {
    for (const value of ['malformed', 'trailing']) {
      const r = formatVerifyReport(s, value, 'v3');
      expect(r.message).toContain('unexpected bytes at the end of the file');
      expect(r.level).toBe('warn');
    }
  });
});

describe('a salvaged (truncated) container reports what it can give back', () => {
  async function pack(manifest, mediaEntries) {
    const chunks = [];
    await writeContainer(manifest, mediaEntries, (u8) => { chunks.push(u8.slice()); });
    return new Blob(chunks);
  }
  const fill = (n, v) => { const u = new Uint8Array(n); u.fill(v); return u; };

  /** Build a 2-media container and cut into the LAST frame. */
  async function truncatedRead() {
    const good = fill(500, 7);
    const bad = fill(300, 9);
    const manifest = {
      app: 'VOTReader', exportVersion: 3, exportDate: '2026-09-01T12:00:00.000Z',
      counts: { 'vot-notes': 4 },
      media: [{ id: 'good', size: good.length }, { id: 'bad', size: bad.length }],
    };
    const blob = await pack(manifest, [{ blob: new Blob([good]) }, { blob: new Blob([bad]) }]);
    return readContainer(blob.slice(0, blob.size - 50));
  }

  /** What SettingsScreen hands the report: the frames actually read back. */
  const salvagedOf = (read) => ({
    count: read.entries.length,
    bytes: read.entries.reduce((n, e) => n + ((e.meta && e.meta.size) || 0), 0),
  });

  it('REPRO: the report counts the media frames READ, not the number the manifest claims', async () => {
    const read = await truncatedRead();
    expect(read.integrity).toBe('truncated');
    expect(read.entries).toHaveLength(1);   // 1 of 2 is recoverable

    const r = formatVerifyReport(
      summarizeBackupManifest(read.manifest), read.integrity, 'v3', salvagedOf(read),
    );

    expect(r.level).toBe('warn');
    expect(r.message).not.toContain('plus 2 media files');
    expect(r.message).toContain('1 of 2 media files');
    // The byte figure follows the readable frames too, not the declared total.
    expect(r.message).toContain(formatBytes(500));
    expect(r.message).not.toContain(formatBytes(800));
  });

  it('REPRO: a short file is not reported as a file with extra bytes appended', async () => {
    const read = await truncatedRead();
    const r = formatVerifyReport(
      summarizeBackupManifest(read.manifest), read.integrity, 'v3', salvagedOf(read),
    );
    // 'truncated' used to fall through to the malformed/trailing catch-all,
    // which diagnoses the opposite failure: bytes ADDED after the last frame.
    expect(r.message).not.toContain('unexpected bytes at the end of the file');
    expect(r.message).toContain('could not be read all the way through');
  });

  it('a container whose media is entirely unreadable says so instead of going quiet', async () => {
    const only = fill(500, 3);
    const manifest = {
      app: 'VOTReader', exportVersion: 3,
      counts: { 'vot-notes': 4 },
      media: [{ id: 'a', size: only.length }],
    };
    const blob = await pack(manifest, [{ blob: new Blob([only]) }]);
    const read = await readContainer(blob.slice(0, blob.size - 10));
    expect(read.entries).toEqual([]);

    const r = formatVerifyReport(
      summarizeBackupManifest(read.manifest), read.integrity, 'v3', salvagedOf(read),
    );
    expect(r.message).toContain('0 of 1 media file');
    expect(r.level).toBe('warn');
  });

  it('a caller that omits the salvaged count states ignorance, never zero', async () => {
    // The Android verify path calls formatVerifyReport with three arguments.
    // It cannot reach this branch today — v3ImportVerify never returns
    // 'truncated' — but the day the native reader salvages the way the web
    // one now does, a defaulted 0 would tell the owner that none of their
    // media survived a backup that may be almost whole. Ignorance has to read
    // as ignorance.
    const read = await truncatedRead();
    const r = formatVerifyReport(summarizeBackupManifest(read.manifest), read.integrity, 'v3');

    expect(r.message).not.toContain('0 of 2');
    expect(r.message).not.toContain('plus 2 media files');
    expect(r.message).toContain('some of its 2 media files could not be read back');
    expect(r.message).toContain('could not be read all the way through');
    expect(r.level).toBe('warn');
  });

  it('an intact container is unaffected — the honest count IS the manifest count', () => {
    const r = formatVerifyReport(summarizeBackupManifest(v3Manifest), 'ok', 'v3');
    expect(r.message).toContain('2 media files');
    expect(r.message).not.toContain(' of 2 media files');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   The journal store persists `{ list: [...] }` (journal-store.js), and until
   countsVersion 2 both exporters counted that object's KEYS: every backup
   declared 1 journal entry however many it held, and Verify printed the
   claim. The fixture at the top of this file hand-writes 'vot-journal': 5, a
   number the exporter could not produce, which is how the bug outlived its
   own test. These run the real builders; nothing below writes a count.
   ───────────────────────────────────────────────────────────────────────── */
describe('Verify counts the journal a real export carries', () => {
  const entry = (n) => ({
    id: 'j' + n, title: 'Entry ' + n, blocks: [], mood: null, tags: [], notebookIds: [], pinned: false, created: n, updated: n,
  });
  // Each store in the shape it persists: the journal and its notebooks as
  // `{ list }`, notes as a groupId map, bookmarks as an array.
  const saved = {
    'vot-journal': { list: [1, 2, 3, 4, 5].map(entry) },
    'vot-journal-notebooks': { list: [
      { id: 'jnb1', name: 'Daily', sortIndex: 0, created: 1, updated: 1 },
      { id: 'jnb2', name: 'Prayer', sortIndex: 1, created: 2, updated: 2 },
    ] },
    'vot-notes': { g1: { groupId: 'g1', body: 'a' }, g2: { groupId: 'g2', body: 'b' } },
    'vot-bookmarks': [{ id: 'b1', hlKey: 'bible:genesis:1:1' }],
  };
  const exportCtx = () => ({
    storesMap: Object.fromEntries(Object.keys(saved).map((k) => [k, { store: {}, method: 'replaceAll' }])),
    flagMap: {},
    idbAdapter: { get: async (name) => saved[name] },
    mediaStore: { allIds: async () => [], get: async () => null },
    storageEstimate: async () => ({ quota: null, usage: null }),
    nowIso: () => '2026-09-25T12:00:00.000Z',
  });
  /** The same file as the exporter wrote it before countsVersion: every store counted by its keys. */
  const writtenBeforeCountsVersion = (m) => {
    const old = { ...m, counts: { _media: m.counts._media } };
    delete old.countsVersion;
    for (const [k, v] of Object.entries(m.stores)) {
      old.counts[k] = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1);
    }
    return old;
  };

  it('v3: buildV3Manifest → container → Verify reports all 5 journal entries', async () => {
    const built = await buildV3Manifest(exportCtx());
    if (!built.ok) throw new Error('export failed');
    const chunks = [];
    await writeContainer(built.manifest, built.mediaEntries, (u8) => { chunks.push(u8.slice()); });
    const read = await readContainer(new Blob(chunks));

    const s = summarizeBackupManifest(read.manifest);
    expect(s.journal).toBe(5);
    const r = formatVerifyReport(s, read.integrity, 'v3');
    expect(r.message).toContain('2 notes, 5 journal entries, 1 bookmark, 2 notebooks — ');   // data-7: notebooks named too
    // 5 entries + 2 journal notebooks + 2 notes + 1 bookmark.
    expect(r.message).toContain('10 records across 4 data stores');
  });

  it('legacy v2: buildExportPayload → JSON → Verify reports all 5 journal entries', async () => {
    const built = await buildExportPayload(exportCtx());
    if (!built.ok) throw new Error('export failed');
    const r = formatVerifyReport(summarizeBackupManifest(JSON.parse(JSON.stringify(built.payload))), 'absent', 'legacy');
    expect(r.message).toContain('5 journal entries');
    expect(r.message).toContain('10 records across 4 data stores');
  });

  it('a backup written before countsVersion, which declares 1, verifies as the 5 it holds', async () => {
    const built = await buildV3Manifest(exportCtx());
    if (!built.ok) throw new Error('export failed');
    const old = writtenBeforeCountsVersion(built.manifest);
    expect(old.counts['vot-journal']).toBe(1);
    const r = formatVerifyReport(summarizeBackupManifest(old), 'absent', 'v3');
    expect(r.message).toContain('5 journal entries');
    expect(r.message).toContain('10 records across 4 data stores');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   vot-annotations persists hlKey → [marks] (annotation-store.js). The store
   rule counts that map's KEYS, one per annotated passage, and Verify printed
   the figure as "highlights": five highlights across two verses verified as
   "2 highlights" (sweep v057), the wrong answer to the one question an owner
   brings to an only backup. The library's own count of the same data
   (data-safety summarize, which the storage banner prints) sums the lists.
   ───────────────────────────────────────────────────────────────────────── */
describe('Verify counts the highlights a real export carries', () => {
  const mark = (id) => ({
    id, groupId: id, kind: 'highlight', color: 'yellow', start: 0, end: 5, text: 'grace', created: 1, updated: 1,
  });
  const saved = {
    'vot-annotations': {
      'bible:john:3:16': [mark('a1'), mark('a2'), mark('a3')],
      'bible:john:3:17': [mark('a4'), mark('a5')],
    },
  };
  const exportCtx = () => ({
    storesMap: Object.fromEntries(Object.keys(saved).map((k) => [k, { store: {}, method: 'replaceAll' }])),
    flagMap: {},
    idbAdapter: { get: async (name) => saved[name] },
    mediaStore: { allIds: async () => [], get: async () => null },
    storageEstimate: async () => ({ quota: null, usage: null }),
    nowIso: () => '2026-09-25T12:00:00.000Z',
  });

  it('v3: five highlights in two verses verify as 5 highlights, not 2', async () => {
    const built = await buildV3Manifest(exportCtx());
    if (!built.ok) throw new Error('export failed');
    const chunks = [];
    await writeContainer(built.manifest, built.mediaEntries, (u8) => { chunks.push(u8.slice()); });
    const read = await readContainer(new Blob(chunks));

    const r = formatVerifyReport(summarizeBackupManifest(read.manifest), read.integrity, 'v3');
    expect(r.message).toContain('Backup from ');
    expect(r.message).toContain(': 5 highlights — ');
    // The record total stays the store rule the counts block and import
    // reconciliation use: one record per annotated passage.
    expect(r.message).toContain('2 records across 1 data store');
  });

  it('legacy v2: the same library verifies as 5 highlights', async () => {
    const built = await buildExportPayload(exportCtx());
    if (!built.ok) throw new Error('export failed');
    const r = formatVerifyReport(summarizeBackupManifest(JSON.parse(JSON.stringify(built.payload))), 'absent', 'legacy');
    expect(r.message).toContain(': 5 highlights — ');
  });

  it('one mark is one highlight; a key with no list adds none', () => {
    const s = summarizeBackupManifest({ stores: { 'vot-annotations': { k1: [mark('a1')], k2: null, k3: 'junk' } } });
    expect(formatVerifyReport(s, 'ok', 'v3').message).toContain(': 1 highlight — ');
  });

  it('a file that only declares counts says passages, the unit those counts are in', () => {
    const many = formatVerifyReport(summarizeBackupManifest({ counts: { 'vot-annotations': 12 } }), 'absent', 'v3');
    expect(many.message).toContain(': 12 annotated passages — ');
    expect(many.message).not.toContain('highlight');
    const one = formatVerifyReport(summarizeBackupManifest({ counts: { 'vot-annotations': 1 } }), 'absent', 'v3');
    expect(one.message).toContain(': 1 annotated passage — ');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   data-7 (audit 2026-11-23): links, reading plans, notebooks and read marks.
   A restore overwrites them too, but the summary counted four kinds, so a
   backup of plans and progress read as four zeros on the restore sheet and in
   Verify, and its warning line named none of what it held.
   ───────────────────────────────────────────────────────────────────────── */
describe('summarizeBackupManifest: the kinds past the first four (data-7)', () => {
  const doc = {
    exportDate: '2026-11-20T10:00:00.000Z',
    stores: {
      'vot-links': [{ id: 'l1' }, { id: 'l2' }],
      'vot-reading-plans': [{ id: 'p1' }],
      'vot-notebooks': { list: [{ id: 'nb1' }, { id: 'nb2' }] },
      'vot-journal-notebooks': { list: [{ id: 'jnb1' }] },
      'vot-state': { readItems: { 'v1:genesis:1': 1, 'v1:genesis:2': 1, 'v1:exodus:1': 1 }, settings: {} },
    },
  };

  it('counts them from the stores the file carries', () => {
    const s = summarizeBackupManifest(doc);
    expect([s.links, s.plans, s.notebooks, s.readMarks]).toEqual([2, 1, 3, 3]);
  });

  it('the Verify line names them', () => {
    const r = formatVerifyReport(summarizeBackupManifest(doc), 'mismatch', 'v3');
    expect(r.message).toContain(': 2 links, 3 notebooks, 1 reading plan, 3 places marked read — ');
    const one = formatVerifyReport(summarizeBackupManifest({ stores: { 'vot-links': [{ id: 'l' }], 'vot-state': { readItems: { 'v1:john:3': 1 } } } }), 'ok', 'v3');
    expect(one.message).toContain(': 1 link, 1 place marked read — ');
  });

  it('a counts-only file still names links, plans and notebooks; read marks need the stores', () => {
    const s = summarizeBackupManifest({ counts: { 'vot-links': 4, 'vot-reading-plans': 2, 'vot-notebooks': 1, 'vot-state': 1 } });
    expect([s.links, s.plans, s.notebooks, s.readMarks]).toEqual([4, 2, 1, 0]);
  });

  it('an old backup without those sections reads 0 for each, and odd shapes do not throw', () => {
    const old = summarizeBackupManifest({ exportVersion: 2, data: {}, stores: { 'vot-notes': { g1: { groupId: 'g1' } } } });
    expect([old.notes, old.links, old.plans, old.notebooks, old.readMarks]).toEqual([1, 0, 0, 0, 0]);
    const odd = summarizeBackupManifest({ stores: { 'vot-state': { readItems: ['x'] }, 'vot-links': 'junk', 'vot-notebooks': null } });
    expect([odd.links, odd.notebooks, odd.readMarks]).toEqual([1, 0, 0]);   // a scalar store is one record by the store rule
    expect(summarizeBackupManifest({ stores: { 'vot-state': null } }).readMarks).toBe(0);
    expect(summarizeBackupManifest({ stores: { 'vot-state': 'x' } }).readMarks).toBe(0);
    expect(formatVerifyReport(old, 'ok', 'v3').message).toContain(': 1 note — ');
  });

  it('a real export: read marks across several books verify as one each, though the state is one record', async () => {
    const readItems = {};
    for (const [book, n] of /** @type {Array<[string, number]>} */ ([['genesis', 50], ['psalms', 23], ['john', 21], ['revelation', 3]])) {
      for (let c = 1; c <= n; c += 1) readItems['v1:' + book + ':' + c] = 1764158400000;
    }
    const saved = { 'vot-state': { readItems, settings: { theme: 'dark' } }, 'vot-links': [{ id: 'l1', created: 1 }] };
    const built = await buildV3Manifest({
      storesMap: Object.fromEntries(Object.keys(saved).map((k) => [k, { store: {}, method: k === 'vot-state' ? 'set' : 'replaceAll' }])),
      flagMap: {},
      idbAdapter: { get: async (name) => saved[name] },
      mediaStore: { allIds: async () => [], get: async () => null },
      storageEstimate: async () => ({ quota: null, usage: null }),
      nowIso: () => '2026-11-26T12:00:00.000Z',
    });
    if (!built.ok) throw new Error('export failed');
    const chunks = [];
    await writeContainer(built.manifest, built.mediaEntries, (u8) => { chunks.push(u8.slice()); });
    const read = await readContainer(new Blob(chunks));
    const s = summarizeBackupManifest(read.manifest);
    expect(s.readMarks).toBe(97);
    expect(s.links).toBe(1);
    const r = formatVerifyReport(s, read.integrity, 'v3');
    expect(r.message).toContain(': 1 link, 97 places marked read — ');
  });
});

/* A v1 backup keeps its stores in `data` as localStorage JSON strings and the restore reads them from there
   (applyImportPayload's V1 fallback), but the summary read only `stores` and `counts`: Verify said 0 records
   across 0 data stores and the restore sheet showed zeros for a file about to overwrite the library. */
describe('summarizeBackupManifest: a v1 backup counted from its data block', () => {
  const v1 = {
    app: 'VOTReader',
    exportDate: '2025-03-01T12:00:00.000Z',
    data: {
      'vot-notes': JSON.stringify({ g1: { groupId: 'g1' }, g2: { groupId: 'g2' } }),
      'vot-bookmarks': JSON.stringify([{ id: 'b1' }]),
      'vot-links': JSON.stringify([{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]),
      'vot-state': JSON.stringify({ readItems: { 'v1:genesis:1': 1, 'v1:john:3': 1 }, settings: {} }),
      'vot-welcomed': '1',
      'vot-broken': '{not json',
      'other-key': JSON.stringify([1, 2]),
    },
  };

  it('REPRO: counts what the restore would write, not 0 records across 0 stores', () => {
    const s = summarizeBackupManifest(v1);
    expect([s.notes, s.bookmarks, s.links, s.readMarks]).toEqual([2, 1, 3, 2]);
    expect(s.storeCount).toBe(4);   // notes, bookmarks, links, state; the flag, the broken string and the other key are not stores
    expect(s.records).toBe(2 + 1 + 3 + 2);
    expect(formatVerifyReport(s, 'absent', 'legacy').message).toContain(': 2 notes, 1 bookmark, 3 links, 2 places marked read — 8 records across 4 data stores.');
  });

  it('a file with stores or declared counts is read from those, never also from data', () => {
    const v2 = { ...v1, exportVersion: 2, stores: { 'vot-notes': { g9: {} } } };
    const s2 = summarizeBackupManifest(v2);
    expect([s2.notes, s2.links, s2.readMarks, s2.storeCount]).toEqual([1, 0, 0, 1]);
    const counted = summarizeBackupManifest({ ...v1, counts: { 'vot-notes': 5 } });
    expect([counted.notes, counted.links, counted.storeCount]).toEqual([5, 0, 1]);
  });

  it('an empty or odd data block still reads zeros', () => {
    expect(summarizeBackupManifest({ data: {} }).records).toBe(0);
    expect(summarizeBackupManifest({ data: [] }).records).toBe(0);
    expect(summarizeBackupManifest({ data: { 'vot-notes': 'null' } }).records).toBe(0);
  });
});

/* A kind the file does not carry is left untouched by a restore, so the counts sheet must not print 0 for it
   (0 reads as a wipe). The summary names those kinds (absent), and the ones it carries but cannot count (unknown). */
describe('summarizeBackupManifest: kinds the file does not carry, or cannot count', () => {
  it('REPRO: a missing section is absent; a carried empty one is 0 and not absent', () => {
    const s = summarizeBackupManifest({ exportVersion: 2, data: {}, stores: { 'vot-notes': {}, 'vot-links': [] }, media: {} });
    expect([s.notes, s.links, s.mediaCount]).toEqual([0, 0, 0]);
    expect(s.absent).not.toContain('notes');
    expect(s.absent).not.toContain('links');
    expect(s.absent).not.toContain('mediaCount');
    expect(s.absent).toEqual(expect.arrayContaining(['highlights', 'journal', 'bookmarks', 'plans', 'notebooks', 'readMarks']));
    expect(s.unknown).toEqual([]);
  });

  it('either notebook store carries notebooks; vot-state carries read marks even with none marked', () => {
    const s = summarizeBackupManifest({ stores: { 'vot-journal-notebooks': { list: [] }, 'vot-state': { settings: {} } } });
    expect(s.absent).not.toContain('notebooks');
    expect(s.absent).not.toContain('readMarks');
    expect(s.readMarks).toBe(0);
  });

  it('media: a v3 array or v1/v2 map carries it (empty too); no table and no _media count does not', () => {
    expect(summarizeBackupManifest({ stores: {}, media: [] }).absent).not.toContain('mediaCount');
    expect(summarizeBackupManifest({ counts: { _media: 0 } }).absent).not.toContain('mediaCount');
    expect(summarizeBackupManifest({ stores: {} }).absent).toContain('mediaCount');
  });

  it('a counts-only file cannot say its read marks or highlights: unknown, not absent and not 0', () => {
    const s = summarizeBackupManifest({ counts: { 'vot-state': 1, 'vot-annotations': 4, 'vot-notes': 2 } });
    expect(s.unknown).toEqual(['highlights', 'readMarks']);
    expect(s.absent).not.toContain('readMarks');
    expect(s.absent).toContain('links');
    const none = summarizeBackupManifest({ counts: { 'vot-notes': 2 } });
    expect(none.unknown).toEqual([]);
    expect(none.absent).toContain('readMarks');
  });

  it('null or garbage never throws and says nothing is carried', () => {
    const s = summarizeBackupManifest(null);
    expect(s.absent).toContain('notes');
    expect(s.absent).toContain('mediaCount');
  });
});
