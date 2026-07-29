/* backup-verify — the read-only .votbak inspector's pure halves
   (FABLE5-BACKLOG [15]). The heavy checks live in readContainer /
   v3AndroidImportEntries (their own suites); these tests pin the
   summary math and the user-facing report copy. */

import { describe, it, expect } from 'vitest';
import { summarizeBackupManifest, formatVerifyReport } from './backup-verify.js';

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
