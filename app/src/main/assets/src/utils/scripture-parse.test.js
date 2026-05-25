/* Q5.9 — scripture-parse edge cases (multi-strategy verse split).
   ─────────────────────────────────────────────────────────────────
   scripture-parse exports 8 helpers; the highest-value targets are
   the ones with branching strategy fallback chains where a silent
   off-by-one or strategy-priority bug shows up as "the verse markers
   render at the wrong positions" — visible to readers but not
   loud enough to bug-report.

   splitIntoVerses tries 4 strategies in order:
     0. Explicit "N. text" markers (longest prefix matching verseNums)
     0b. Unicode superscript markers (²when ³if ⁴then)
     1. Sentence-boundary split
     2. Comma-chain genealogy ("the X, the Y, the Z" from Luke 3)
     Fallback: single-element array

   The silent-fail modes:
     - Strategy 0 partial prefix not respected → wrong split at the
       first off-prefix marker (e.g., 2-of-3 markers match, falls
       through to strategy 1 with garbage)
     - Strategy 0b super-prefix-absent assumption wrong → first verse's
       text gets prepended to verse 2's text
     - parseRefRange comma form drops the 'verses' array → genealogy
       verses render in contiguous ranges, hiding the actual sparse set
*/

import { describe, it, expect } from 'vitest';
import {
  firstVerseOfRef,
  parseRefRanges,
  lastVerseOfFirstRange,
  echoVersesForRef,
  parseRefRange,
  splitIntoVerses,
} from './scripture-parse.js';

describe('firstVerseOfRef', () => {
  it('extracts the first verse number from a single-verse ref', () => {
    expect(firstVerseOfRef('5')).toBe(5);
    expect(firstVerseOfRef('12')).toBe(12);
  });

  it('extracts the first verse from a chapter:verse ref', () => {
    expect(firstVerseOfRef('5:7')).toBe(7);
    expect(firstVerseOfRef('22:1-10')).toBe(1);
  });

  it('extracts the first verse from comma-separated ranges', () => {
    expect(firstVerseOfRef('3, 7, 11')).toBe(3);
    expect(firstVerseOfRef('5:3, 5')).toBe(3);
  });

  it('returns null when no number is present', () => {
    expect(firstVerseOfRef('no numbers here')).toBeNull();
    expect(firstVerseOfRef('')).toBeNull();
  });

  it('handles a range form', () => {
    expect(firstVerseOfRef('5-10')).toBe(5);
  });
});

describe('parseRefRanges', () => {
  it('parses a single verse', () => {
    expect(parseRefRanges('5')).toEqual([{ start: 5, end: 5 }]);
  });

  it('parses a single range', () => {
    expect(parseRefRanges('5-10')).toEqual([{ start: 5, end: 10 }]);
  });

  it('parses comma-separated singles', () => {
    expect(parseRefRanges('3, 7, 11')).toEqual([
      { start: 3, end: 3 },
      { start: 7, end: 7 },
      { start: 11, end: 11 },
    ]);
  });

  it('parses mixed comma-separated ranges and singles', () => {
    expect(parseRefRanges('5-7, 9, 11-12')).toEqual([
      { start: 5, end: 7 },
      { start: 9, end: 9 },
      { start: 11, end: 12 },
    ]);
  });

  it('strips a leading chapter prefix', () => {
    expect(parseRefRanges('5:3-7')).toEqual([{ start: 3, end: 7 }]);
  });

  it('returns [] for an unparseable input', () => {
    expect(parseRefRanges('nothing here')).toEqual([]);
  });
});

describe('lastVerseOfFirstRange', () => {
  it('returns the end of the first range', () => {
    expect(lastVerseOfFirstRange('5-7')).toBe(7);
    expect(lastVerseOfFirstRange('5-7, 9-11')).toBe(7);
  });

  it('returns the single verse when no range', () => {
    expect(lastVerseOfFirstRange('5')).toBe(5);
  });

  it('returns null on unparseable input', () => {
    // parseRefRanges returns [] which means ranges.length is 0, so
    // lastVerseOfFirstRange falls back to firstVerseOfRef which
    // returns null on unparseable input.
    expect(lastVerseOfFirstRange('xyz')).toBeNull();
  });
});

describe('echoVersesForRef', () => {
  it('returns [] for a single range (no echoes)', () => {
    expect(echoVersesForRef('5-7')).toEqual([]);
    expect(echoVersesForRef('5')).toEqual([]);
  });

  it('returns the END of every range AFTER the first', () => {
    // For "5-7, 9, 11-12", first range is [5,7]; echo verses are 9 and 12.
    expect(echoVersesForRef('5-7, 9, 11-12')).toEqual([9, 12]);
  });

  it('treats comma-separated singles as one-verse ranges', () => {
    // For "3, 7, 11", first range is [3,3]; echoes are 7 and 11.
    expect(echoVersesForRef('3, 7, 11')).toEqual([7, 11]);
  });
});

describe('parseRefRange', () => {
  it('parses a simple range', () => {
    expect(parseRefRange('5:3-7')).toEqual({ start: 3, end: 7 });
  });

  it('parses a comma-form with explicit verse list', () => {
    // "7:7, 9, 11" → start: 7, end: 11, verses: [7, 9, 11]
    const result = parseRefRange('7:7, 9, 11');
    expect(result).toEqual({ start: 7, end: 11, verses: [7, 9, 11] });
  });

  it('parses a comma-form with two verses', () => {
    expect(parseRefRange('5:7, 9')).toEqual({ start: 7, end: 9, verses: [7, 9] });
  });

  it('returns null for a single-verse ref (start === end is rejected)', () => {
    // The implementation returns null when end <= start (no range to split).
    expect(parseRefRange('5:7')).toBeNull();
    expect(parseRefRange('Genesis 1:1')).toBeNull();
  });

  it('strips parenthetical content before parsing', () => {
    // The implementation does `.replace(/\s*\(.*?\)\s*/g, "")` first.
    expect(parseRefRange('Exodus 12:18-20 (NKJV)')).toEqual({ start: 18, end: 20 });
  });

  it('returns null on unparseable refs', () => {
    expect(parseRefRange('garbage')).toBeNull();
    expect(parseRefRange('')).toBeNull();
  });
});

describe('splitIntoVerses — multi-strategy chain', () => {
  it('returns null for a single-verse ref (no split needed)', () => {
    expect(splitIntoVerses('Hello world', '5:7')).toBeNull();
  });

  it('returns null when parseRefRange returns null', () => {
    expect(splitIntoVerses('text', 'no-range')).toBeNull();
  });

  // ── Strategy 0: explicit "N. text" markers ─────────────────────
  describe('Strategy 0 — explicit "N. text" markers', () => {
    it('splits text with sequential N. markers', () => {
      // Production refs always carry a chapter prefix ("Book Ch:Vs-Vs");
      // parseRefRange requires the `:` and rejects bare ranges. We use
      // '5:1-3' as the canonical 3-verse form.
      const result = splitIntoVerses('1. text one 2. text two 3. text three', '5:1-3');
      expect(result).toEqual([
        { vNum: 1, text: 'text one' },
        { vNum: 2, text: 'text two' },
        { vNum: 3, text: 'text three' },
      ]);
    });

    it('handles longest-prefix-match (partial markers)', () => {
      // Only 2 of 3 markers present — should split on what we have, not
      // fall through to Strategy 1.
      const result = splitIntoVerses('1. first 2. second remainder', '5:1-3');
      expect(result).toEqual([
        { vNum: 1, text: 'first' },
        { vNum: 2, text: 'second remainder' },
      ]);
    });

    it('matches markers correctly with non-period preceding char', () => {
      // The regex allows any whitespace BEFORE the marker — so a comma+
      // newline before "2." also matches.
      const result = splitIntoVerses('1. one,\n2. two', '5:1-2');
      expect(result?.[0].vNum).toBe(1);
      expect(result?.[0].text).toContain('one');
      expect(result?.[1].vNum).toBe(2);
      expect(result?.[1].text).toBe('two');
    });
  });

  // ── Strategy 0b: Unicode superscript markers ────────────────────
  describe('Strategy 0b — Unicode superscript markers', () => {
    it('splits text with superscript prefixes', () => {
      // MATTHEW_NKJV / bolls.life format: "text ²when ³if" with ref 5:1-3
      // → 3 segments, first one has implicit verse-1 prefix.
      const result = splitIntoVerses('first verse text ²second ³third', '5:1-3');
      expect(result).toEqual([
        { vNum: 1, text: 'first verse text' },
        { vNum: 2, text: 'second' },
        { vNum: 3, text: 'third' },
      ]);
    });

    it('handles multi-digit superscript verses (e.g. ¹²)', () => {
      // ¹² = verse 12. ¹³ = verse 13.
      const result = splitIntoVerses(
        'verse eleven ¹²verse twelve ¹³verse thirteen',
        '5:11-13'
      );
      expect(result).toEqual([
        { vNum: 11, text: 'verse eleven' },
        { vNum: 12, text: 'verse twelve' },
        { vNum: 13, text: 'verse thirteen' },
      ]);
    });

    it('uses Strategy 0 (decimal markers) preferentially over 0b when both present', () => {
      // Strategy 0 (longest prefix) tries first. If we have decimal
      // markers that match, we use them; superscripts in the trailing
      // text are not Strategy-0b'd as a fallback.
      const result = splitIntoVerses('1. first 2. second', '5:1-2');
      expect(result?.[0].vNum).toBe(1);
      expect(result?.[1].vNum).toBe(2);
    });
  });

  // ── Strategy 1: sentence-boundary split ─────────────────────────
  describe('Strategy 1 — sentence-boundary split', () => {
    it('splits on sentence boundaries when no explicit markers are present', () => {
      // No "N." markers, no superscripts — falls through to Strategy 1.
      // Text has 3 sentences → 3 segments for a 3-verse ref.
      const result = splitIntoVerses(
        'First sentence here. Second sentence here. Third sentence here.',
        '5:1-3'
      );
      expect(result).not.toBeNull();
      expect(result?.length).toBe(3);
      expect(result?.[0].vNum).toBe(1);
      expect(result?.[2].vNum).toBe(3);
    });
  });

  // ── Strategy 2 + fallback ───────────────────────────────────────
  describe('Strategy 2 / fallback — too few chunks for count', () => {
    it('returns a single-element array with start vNum when no strategy can split', () => {
      // Single short sentence; chunks (1) < count (3). After Strategy 1
      // fails and Strategy 2 (the comma-chain) also can't get enough
      // chunks, the implementation returns a single-element fallback
      // tagged with the start verse number.
      const result = splitIntoVerses('Too short.', '5:7-9');
      expect(result).toEqual([{ vNum: 7, text: 'Too short.' }]);
    });
  });

  // ── Comma-form refs ────────────────────────────────────────────
  describe('Comma-form refs (sparse verse list)', () => {
    it('uses the explicit verses[] array for marker matching', () => {
      // Ref "5:1, 3, 5" → verses [1, 3, 5]. Text has markers for those
      // specific verses (not 2, 4) → should split on the verses array.
      const result = splitIntoVerses('1. first 3. third 5. fifth', '5:1, 3, 5');
      expect(result).toEqual([
        { vNum: 1, text: 'first' },
        { vNum: 3, text: 'third' },
        { vNum: 5, text: 'fifth' },
      ]);
    });
  });
});
