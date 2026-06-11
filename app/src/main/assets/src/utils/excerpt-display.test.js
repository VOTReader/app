/* excerpt-display tests — display-normalization of stored collapsed
   poetry excerpts ("loins,And become…"). One shared transform feeds every
   surface that renders stored user-captured text (NoteSheet, NoteRow,
   MultiNotePopover, HighlightsScreen, JournalInsertSheet pickers, the
   journal note/letter cards, BookmarkCreateSheet) plus the two write-time
   sites that bake annotation text into new note records — a regression
   here re-collapses ALL of them at once. */

import { describe, it, expect } from 'vitest';
import { normalizeExcerptDisplay } from './excerpt-display.js';

describe('normalizeExcerptDisplay', () => {
  it('re-inserts the missing space at collapsed poetry line joins (the reported string)', () => {
    const stored = 'Therefore gird up your loins,And become the man of God you aspire to be;Stand firm for My cause and do not waver;Draw very close and receive of Me…';
    expect(normalizeExcerptDisplay(stored)).toBe(
      'Therefore gird up your loins, And become the man of God you aspire to be; Stand firm for My cause and do not waver; Draw very close and receive of Me…'
    );
  });

  it('handles colon / question / exclamation joins', () => {
    expect(normalizeExcerptDisplay('hear Me:For I am')).toBe('hear Me: For I am');
    expect(normalizeExcerptDisplay('who shall stand?Only the faithful')).toBe('who shall stand? Only the faithful');
    expect(normalizeExcerptDisplay('rejoice!Sing praises')).toBe('rejoice! Sing praises');
  });

  it('leaves mid-sentence lowercase after punctuation untouched', () => {
    expect(normalizeExcerptDisplay('one,two and three')).toBe('one,two and three');
  });

  it('is a no-op on correctly-spaced text (idempotent)', () => {
    const ok = 'Therefore gird up your loins, And become the man of God';
    expect(normalizeExcerptDisplay(ok)).toBe(ok);
    expect(normalizeExcerptDisplay(normalizeExcerptDisplay(ok))).toBe(ok);
  });

  it('never splits dotted abbreviations (period deliberately excluded)', () => {
    expect(normalizeExcerptDisplay('the U.S.A. endures')).toBe('the U.S.A. endures');
  });

  it('returns empty string for null / undefined / empty input', () => {
    expect(normalizeExcerptDisplay(null)).toBe('');
    expect(normalizeExcerptDisplay(undefined)).toBe('');
    expect(normalizeExcerptDisplay('')).toBe('');
  });
});
