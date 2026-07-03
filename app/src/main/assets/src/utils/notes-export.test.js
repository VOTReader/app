/* notes-export tests — the "Share as text" composer + delivery shim.
   composeNotesExport/notesExportFilename are pure (deterministic given
   an explicit `now`), so the document shape is pinned exactly here; the
   delivery shim is tested against stubbed navigator.share /
   PlatformBridge.saveToFile globals (the real paths are the OS share
   sheet and the SAF picker / Blob download — not reachable in jsdom). */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { composeNotesExport, notesExportFilename, shareNotesExport, _absoluteDate } from './notes-export.js';

// Local-time construction keeps the absolute-date assertions independent
// of the host timezone (the composer formats in local time).
const EXPORT_TS = new Date(2026, 6, 3).getTime();   // July 3, 2026
const NOTE_TS = new Date(2026, 5, 12).getTime();    // June 12, 2026

const label = (note) => note._label || 'Unknown';

describe('_absoluteDate', () => {
  it('formats an epoch as "Month D, YYYY" and empty for falsy', () => {
    expect(_absoluteDate(EXPORT_TS)).toBe('July 3, 2026');
    expect(_absoluteDate(0)).toBe('');
    expect(_absoluteDate(null)).toBe('');
  });
});

describe('composeNotesExport', () => {
  it('renders a header-only document with "No notes." for an empty notebook', () => {
    const doc = composeNotesExport({ title: 'Devotional', notes: [], resolveLabel: label, now: EXPORT_TS });
    expect(doc).toBe(
      '# Devotional\n' +
      '\n' +
      '0 notes · Exported July 3, 2026 · VOTReader\n' +
      '\n' +
      'No notes.\n'
    );
  });

  it('groups a 3-note notebook by source label with quotes, bodies, and dates', () => {
    const notes = [
      { _label: 'Genesis 1:1-2', fullText: 'In the beginning', body: 'Creation note.', updated: NOTE_TS },
      { _label: 'Genesis 1:1-2', fullText: 'And the earth was without form', body: '', updated: NOTE_TS },
      { _label: 'The Wide Path', fullText: 'Walk the narrow way', body: 'Letter thought.', created: NOTE_TS },
    ];
    const doc = composeNotesExport({ title: 'Devotional', notes, resolveLabel: label, now: EXPORT_TS });
    expect(doc).toBe(
      '# Devotional\n' +
      '\n' +
      '3 notes · Exported July 3, 2026 · VOTReader\n' +
      '\n' +
      '## Genesis 1:1-2\n' +
      '\n' +
      '> “In the beginning”\n' +
      '\n' +
      'Creation note.\n' +
      '\n' +
      '— June 12, 2026\n' +
      '\n' +
      '> “And the earth was without form”\n' +
      '\n' +
      '— June 12, 2026\n' +
      '\n' +
      '## The Wide Path\n' +
      '\n' +
      '> “Walk the narrow way”\n' +
      '\n' +
      'Letter thought.\n' +
      '\n' +
      '— June 12, 2026\n'
    );
  });

  it('uses the singular "1 note" and defaults the title to My Notes', () => {
    const one = [{ _label: 'X', body: 'b', updated: NOTE_TS }];
    const doc = composeNotesExport({ title: '', notes: one, resolveLabel: label, now: EXPORT_TS });
    expect(doc).toContain('# My Notes\n');
    expect(doc).toContain('1 note · Exported July 3, 2026 · VOTReader');
  });

  it('omits the quote for a note without an anchor and the body when blank', () => {
    const notes = [{ _label: 'Journal · Morning', fullText: '', body: '  ', updated: NOTE_TS }];
    const doc = composeNotesExport({ title: 'My Notes', notes, resolveLabel: label, now: EXPORT_TS });
    expect(doc).not.toContain('>');
    expect(doc).toContain('## Journal · Morning\n\n— June 12, 2026\n');
  });

  it('blockquotes every line of a multi-line anchor', () => {
    const notes = [{ _label: 'Psalm 23', fullText: 'The Lord is my shepherd;\nI shall not want.', updated: NOTE_TS }];
    const doc = composeNotesExport({ title: 'My Notes', notes, resolveLabel: label, now: EXPORT_TS });
    expect(doc).toContain('> “The Lord is my shepherd;\n> I shall not want.”');
  });

  it('normalizes collapsed poetry anchors like the rows do (excerpt-display)', () => {
    const notes = [{ _label: 'L', fullText: 'gird up your loins,And become', updated: NOTE_TS }];
    const doc = composeNotesExport({ title: 'My Notes', notes, resolveLabel: label, now: EXPORT_TS });
    expect(doc).toContain('> “gird up your loins, And become”');
  });

  it('degrades to the raw key when the resolver throws, and to "Note" without keys', () => {
    const throwing = () => { throw new Error('registry not loaded'); };
    const notes = [
      { keys: ['letter:the-last-trump:3'], body: 'a', updated: NOTE_TS },
      { keys: [], body: 'b', updated: NOTE_TS },
    ];
    const doc = composeNotesExport({ title: 'My Notes', notes, resolveLabel: throwing, now: EXPORT_TS });
    expect(doc).toContain('## letter:the-last-trump:3');
    expect(doc).toContain('## Note');
  });

  it('falls back to the raw key when no resolver is passed', () => {
    const doc = composeNotesExport({ title: 'My Notes', notes: [{ keys: ['bible:genesis:1:1'], body: 'x', updated: NOTE_TS }], now: EXPORT_TS });
    expect(doc).toContain('## bible:genesis:1:1');
  });
});

describe('notesExportFilename', () => {
  it('appends " notes" + a local date stamp + .md', () => {
    expect(notesExportFilename('Devotional', EXPORT_TS)).toBe('Devotional notes 2026-07-03.md');
  });

  it('skips " notes" when the title already says it', () => {
    expect(notesExportFilename('My Notes', EXPORT_TS)).toBe('My Notes 2026-07-03.md');
  });

  it('strips filesystem-reserved characters and defaults an empty title', () => {
    expect(notesExportFilename('A/B: "C"?', EXPORT_TS)).toBe('AB C notes 2026-07-03.md');
    expect(notesExportFilename('', EXPORT_TS)).toBe('Notes 2026-07-03.md');
    expect(notesExportFilename('***', EXPORT_TS)).toBe('Notes 2026-07-03.md');
  });
});

describe('shareNotesExport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.__onExportComplete = null;
  });

  it('prefers navigator.share when the host provides it', () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });
    const saveToFile = vi.fn();
    vi.stubGlobal('PlatformBridge', { saveToFile });
    const out = shareNotesExport({ title: 'Devotional', filename: 'f.md', text: 'doc' });
    expect(out).toBe('share');
    expect(share).toHaveBeenCalledWith({ title: 'Devotional', text: 'doc' });
    expect(saveToFile).not.toHaveBeenCalled();
  });

  it('falls back to PlatformBridge.saveToFile and toasts success via __onExportComplete', () => {
    vi.stubGlobal('navigator', {});
    const saveToFile = vi.fn();
    vi.stubGlobal('PlatformBridge', { saveToFile });
    const toast = vi.fn();
    vi.stubGlobal('showToast', toast);
    const out = shareNotesExport({ title: 'Devotional', filename: 'Devotional notes 2026-07-03.md', text: 'doc' });
    expect(out).toBe('file');
    expect(saveToFile).toHaveBeenCalledWith('Devotional notes 2026-07-03.md', 'doc');
    expect(typeof window.__onExportComplete).toBe('function');
    window.__onExportComplete('ok');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ text: 'Notes exported.' }));
    // One-shot: the handler unregisters itself.
    expect(window.__onExportComplete).toBe(null);
  });

  it('toasts a failure but stays silent on user cancel', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PlatformBridge', { saveToFile: vi.fn() });
    const toast = vi.fn();
    vi.stubGlobal('showToast', toast);
    shareNotesExport({ title: 'T', filename: 'f.md', text: 'doc' });
    window.__onExportComplete('cancelled');
    expect(toast).not.toHaveBeenCalled();
    shareNotesExport({ title: 'T', filename: 'f.md', text: 'doc' });
    window.__onExportComplete('error:no-space');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ text: 'Export failed. Please try again.' }));
  });

  it('returns "none" when neither share nor the bridge exists (bare host)', () => {
    vi.stubGlobal('navigator', {});
    const out = shareNotesExport({ title: 'T', filename: 'f.md', text: 'doc' });
    expect(out).toBe('none');
  });
});
