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
    expect(s.annotations).toBe(40);
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
    expect(r.message).toContain('40 highlights');
    expect(r.message).toContain('5 journal entries');
    expect(r.message).toContain('67 records across 5 data stores');
    expect(r.message).toContain('2 media files');
    expect(r.message).toContain('Integrity check passed');
  });

  it('a CRC mismatch is a warning', () => {
    const r = formatVerifyReport(s, 'mismatch', 'v3');
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
    expect(r.message).toContain('2 notes, 5 journal entries, 1 bookmark — ');
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
