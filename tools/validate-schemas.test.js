/**
 * W9.1 Format A schema validator — vitest test suite
 */

import { describe, it, expect } from 'vitest';
import {
  validateFormatA,
  validateFormatB,
  validateHolyDays,
  validateFormatC,
  validateFormatD,
  validateAgainstReference,
  validateTranslationMap,
  validateScriptureDict,
  validateFootnoteMarkers,
  validateStudyBible,
  validateTranslationCompleteness,
} from './validate-schemas.js';

// ── helpers ──────────────────────────────────────────────────────

/** Minimal valid Format A letter. */
function validLetter(overrides = {}) {
  return {
    id: 'test-letter',
    title: 'Test Letter',
    blocks: [
      { type: 'para', segments: [{ t: 'text', v: 'Hello world.' }] },
      { type: 'closing', text: 'Says The Lord.' },
    ],
    footnotes: {},
    nkjv: {},
    ...overrides,
  };
}

/** Letter with a footnote + nkjv entry + fn segment. */
function letterWithFootnote(overrides = {}) {
  return {
    id: 'fn-letter',
    title: 'Footnote Letter',
    blocks: [
      {
        type: 'para',
        segments: [
          { t: 'text', v: 'Some text.' },
          { t: 'fn', v: '1' },
        ],
      },
    ],
    footnotes: {
      '1': { type: 'scripture', ref: 'John 3:16' },
    },
    nkjv: {
      'John 3:16': 'For God so loved the world...',
    },
    ...overrides,
  };
}

// ── valid letter passes ─────────────────────────────────────────

describe('validateFormatA', () => {
  it('valid minimal letter produces zero errors', () => {
    const result = validateFormatA([validLetter()]);
    expect(result.errors).toEqual([]);
  });

  it('valid letter with footnotes produces zero errors', () => {
    const result = validateFormatA([letterWithFootnote()]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('valid letter with all optional fields produces zero errors', () => {
    const letter = validLetter({
      num: 1,
      date: '3/28/05',
      from: 'From The Lord',
      spoken: 'The Word of The Lord',
      forLine: 'For All Those Who Have Ears to Hear',
      audioUrl: 'https://example.com/audio',
      soundcloudUrl: 'https://soundcloud.com/test',
      videoVoiceUrl: 'https://youtube.com/test',
      videoMusicUrl: 'https://youtube.com/test2',
      metaAddendum: '"Other Letter"',
      metaAddendumUrl: 'https://example.com',
      metaAddendumInternal: 'other-letter',
      relatedTopics: [{ label: 'Topic', url: 'https://example.com' }],
      prevLetter: null,
      nextLetter: { id: 'next', title: 'Next Letter' },
    });
    const result = validateFormatA([letter]);
    expect(result.errors).toEqual([]);
  });

  it('unknown fields are ignored (no error)', () => {
    const letter = validLetter({ noteLine: '(some note)', addendum: 'extra', isPreface: true });
    const result = validateFormatA([letter]);
    expect(result.errors).toEqual([]);
  });

  // ── missing required fields ─────────────────────────────────

  describe('missing required fields', () => {
    it('detects missing id', () => {
      const letter = validLetter();
      delete letter.id;
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('id');
    });

    it('detects empty id', () => {
      const result = validateFormatA([validLetter({ id: '' })]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('id');
    });

    it('detects missing title', () => {
      const letter = validLetter();
      delete letter.title;
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('title');
    });

    it('detects missing blocks', () => {
      const letter = validLetter();
      delete letter.blocks;
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('blocks');
    });

    it('detects missing footnotes', () => {
      const letter = validLetter();
      delete letter.footnotes;
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('footnotes');
    });

    it('detects missing nkjv', () => {
      const letter = validLetter();
      delete letter.nkjv;
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('nkjv');
    });
  });

  // ── block validation ────────────────────────────────────────

  describe('block validation', () => {
    it('detects invalid block type', () => {
      const letter = validLetter({
        blocks: [{ type: 'bogus', text: 'bad' }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('invalid block type');
      expect(result.errors[0]).toContain('bogus');
    });

    it('detects para block missing segments', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', text: 'wrong shape' }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('segments');
    });

    it('detects poetry block missing lines', () => {
      const letter = validLetter({
        blocks: [{ type: 'poetry', segments: [] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('lines');
    });

    it('detects closing block missing text', () => {
      const letter = validLetter({
        blocks: [{ type: 'closing', segments: [] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('text');
    });

    it('detects note block missing text', () => {
      const letter = validLetter({
        blocks: [{ type: 'note' }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('text');
    });

    it('accepts closing-fn block with segments', () => {
      const letter = validLetter({
        blocks: [
          { type: 'closing-fn', segments: [{ t: 'fn', v: '1' }] },
        ],
        footnotes: { '1': { type: 'scripture', ref: 'Rev 1:1' } },
        nkjv: { 'Rev 1:1': 'Text.' },
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('accepts intro block with segments', () => {
      const letter = validLetter({
        blocks: [
          { type: 'intro', segments: [{ t: 'italic', v: 'Question asked.' }] },
          { type: 'para', segments: [{ t: 'text', v: 'Answer.' }] },
        ],
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('accepts a scripture block WITH content (B6)', () => {
      // text / segments / lines are all valid content carriers.
      expect(validateFormatA([validLetter({ blocks: [{ type: 'scripture', text: 'A quoted verse.' }] })]).errors).toEqual([]);
      expect(validateFormatA([validLetter({ blocks: [{ type: 'scripture', segments: [{ t: 'text', v: 'x' }] }] })]).errors).toEqual([]);
    });
    it('rejects a scripture block with NO content — segments/text/lines (B6)', () => {
      const result = validateFormatA([validLetter({ blocks: [{ type: 'scripture' }] })]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('scripture');
    });

    it('validates poetry line arrays', () => {
      const letter = validLetter({
        blocks: [{ type: 'poetry', lines: ['not-an-array'] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be an array');
    });
  });

  // ── segment validation ──────────────────────────────────────

  describe('segment validation', () => {
    it('detects invalid segment type', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'unknown', v: 'test' }] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('invalid segment type');
      expect(result.errors[0]).toContain('unknown');
    });

    it('detects text segment missing v', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'text' }] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('"v"');
    });

    it('detects italic segment missing v', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'italic' }] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('detects bold-italic segment missing v', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'bold-italic' }] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('detects caps segment missing v', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'caps' }] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('detects fn segment missing v', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'fn' }] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('"v"');
    });

    it('accepts stanza-break without v', () => {
      const letter = validLetter({
        blocks: [{
          type: 'poetry',
          lines: [[{ t: 'stanza-break' }]],
        }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('accepts all valid segment types', () => {
      const letter = validLetter({
        blocks: [
          {
            type: 'para',
            segments: [
              { t: 'text', v: 'a' },
              { t: 'italic', v: 'b' },
              { t: 'bold-italic', v: 'c' },
              { t: 'caps', v: 'D' },
              { t: 'fn', v: '1' },
              { t: 'letter-link', label: '"Title"', link: { collection: 'Vol 1', letterTitle: 'Title' } },
            ],
          },
          {
            type: 'poetry',
            lines: [[{ t: 'stanza-break' }]],
          },
        ],
        footnotes: { '1': { type: 'note', text: 'See also.' } },
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('detects letter-link missing label', () => {
      const letter = validLetter({
        blocks: [{
          type: 'para',
          segments: [{ t: 'letter-link', link: { collection: 'V1', letterTitle: 'T' } }],
        }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('label');
    });

    it('detects letter-link missing link', () => {
      const letter = validLetter({
        blocks: [{
          type: 'para',
          segments: [{ t: 'letter-link', label: '"Title"' }],
        }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('link');
    });
  });

  // ── footnote validation ─────────────────────────────────────

  describe('footnote validation', () => {
    it('detects invalid footnote type', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'fn', v: '1' }] }],
        footnotes: { '1': { type: 'bogus', ref: 'John 3:16' } },
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('invalid footnote type');
    });

    it('detects scripture footnote missing ref', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'fn', v: '1' }] }],
        footnotes: { '1': { type: 'scripture' } },
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('ref');
    });

    it('detects scripture footnote ref not in nkjv', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'fn', v: '1' }] }],
        footnotes: { '1': { type: 'scripture', ref: 'Missing 1:1' } },
        nkjv: {},
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not found in nkjv');
    });

    it('detects note footnote missing text', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'fn', v: '1' }] }],
        footnotes: { '1': { type: 'note' } },
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('text');
    });

    it('accepts note footnote with url and link', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'fn', v: '1' }] }],
        footnotes: {
          '1': {
            type: 'note',
            text: 'Also read: "Grafted In"',
            url: 'https://example.com',
            link: { collection: 'Volume Three', letterTitle: 'Grafted In' },
          },
        },
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('accepts scripture footnote with seeAlso', () => {
      const letter = letterWithFootnote({
        footnotes: {
          '1': {
            type: 'scripture',
            ref: 'John 3:16',
            seeAlso: {
              label: 'Other Letter',
              collection: 'Volume Two',
              letterTitle: 'Other Letter',
            },
          },
        },
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('detects fn segment referencing non-existent footnote', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [{ t: 'fn', v: '99' }] }],
        footnotes: {},
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('does not exist');
    });
  });

  // ── orphan detection (warnings) ─────────────────────────────

  describe('orphan detection', () => {
    it('warns on orphaned footnote (defined but not referenced)', () => {
      const letter = validLetter({
        footnotes: { '1': { type: 'note', text: 'Orphan.' } },
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('never referenced');
    });

    it('warns on orphaned nkjv key (not referenced by any scripture footnote)', () => {
      const letter = validLetter({
        nkjv: { 'Psalm 23:1': 'The Lord is my shepherd.' },
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('nkjv key');
      expect(result.warnings[0]).toContain('not referenced');
    });
  });

  // ── nav link validation ─────────────────────────────────────

  describe('nav link validation', () => {
    it('accepts null prevLetter / nextLetter', () => {
      const letter = validLetter({ prevLetter: null, nextLetter: null });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('accepts valid prevLetter / nextLetter', () => {
      const letter = validLetter({
        prevLetter: { id: 'prev', title: 'Prev' },
        nextLetter: { id: 'next', title: 'Next' },
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
    });

    it('detects prevLetter missing id', () => {
      const letter = validLetter({ prevLetter: { title: 'Prev' } });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('prevLetter.id');
    });

    it('detects nextLetter missing title', () => {
      const letter = validLetter({ nextLetter: { id: 'next' } });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('nextLetter.title');
    });
  });

  // ── chain consistency ───────────────────────────────────────

  describe('chain validation', () => {
    it('passes for a consistent 3-letter chain', () => {
      const letters = [
        validLetter({
          id: 'a', title: 'A',
          prevLetter: null,
          nextLetter: { id: 'b', title: 'B' },
        }),
        validLetter({
          id: 'b', title: 'B',
          prevLetter: { id: 'a', title: 'A' },
          nextLetter: { id: 'c', title: 'C' },
        }),
        validLetter({
          id: 'c', title: 'C',
          prevLetter: { id: 'b', title: 'B' },
          nextLetter: null,
        }),
      ];
      const result = validateFormatA(letters);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('detects broken nextLetter chain', () => {
      const letters = [
        validLetter({
          id: 'a', title: 'A',
          prevLetter: null,
          nextLetter: { id: 'wrong', title: 'Wrong' },
        }),
        validLetter({
          id: 'b', title: 'B',
          prevLetter: { id: 'a', title: 'A' },
          nextLetter: null,
        }),
      ];
      const result = validateFormatA(letters);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('nextLetter.id');
      expect(result.errors[0]).toContain('wrong');
    });

    it('detects broken prevLetter chain', () => {
      const letters = [
        validLetter({
          id: 'a', title: 'A',
          prevLetter: null,
          nextLetter: { id: 'b', title: 'B' },
        }),
        validLetter({
          id: 'b', title: 'B',
          prevLetter: { id: 'wrong', title: 'Wrong' },
          nextLetter: null,
        }),
      ];
      const result = validateFormatA(letters);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('prevLetter.id');
      expect(result.errors[0]).toContain('wrong');
    });

    it('warns when first letter has non-null prevLetter', () => {
      const letters = [
        validLetter({
          id: 'a', title: 'A',
          prevLetter: { id: 'z', title: 'Z' },
          nextLetter: null,
        }),
      ];
      const result = validateFormatA(letters);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('first letter');
    });

    it('warns when last letter has non-null nextLetter', () => {
      const letters = [
        validLetter({
          id: 'a', title: 'A',
          prevLetter: null,
          nextLetter: { id: 'z', title: 'Z' },
        }),
      ];
      const result = validateFormatA(letters);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('last letter');
    });
  });

  // ── edge cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('rejects non-array input', () => {
      const result = validateFormatA('not-an-array');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('expected an array');
    });

    it('rejects non-object letter', () => {
      const result = validateFormatA([42]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not a plain object');
    });

    it('handles empty letter array', () => {
      const result = validateFormatA([]);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('handles non-object block gracefully', () => {
      const letter = validLetter({ blocks: [null, 'bad'] });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBe(2);
    });

    it('handles non-object segment gracefully', () => {
      const letter = validLetter({
        blocks: [{ type: 'para', segments: [null, 42] }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBe(2);
    });

    it('optional typed fields reject wrong types', () => {
      const letter = validLetter({ num: 'not-a-number', date: 123 });
      const result = validateFormatA([letter]);
      expect(result.errors.length).toBe(2);
      expect(result.errors[0]).toContain('num');
      expect(result.errors[1]).toContain('date');
    });

    it('relatedTopics validates entries', () => {
      const letter = validLetter({
        relatedTopics: [{ label: 'Good', url: 'https://x.com' }, { bad: true }],
      });
      const result = validateFormatA([letter]);
      // Second entry missing label and url
      expect(result.errors.length).toBe(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Format B (WTLB One/Two, The Blessed)
// ═══════════════════════════════════════════════════════════════

/** Minimal valid Format B entry. */
function validEntry(overrides = {}) {
  return {
    id: 'test-entry',
    num: 1,
    title: 'Test Entry',
    paragraphs: [{ align: 'center', text: 'Some text.' }],
    ...overrides,
  };
}

describe('validateFormatB', () => {
  it('valid minimal entry produces zero errors', () => {
    const result = validateFormatB([validEntry()]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('accepts all valid align values', () => {
    const entry = validEntry({
      paragraphs: [
        { align: 'center', text: 'a' },
        { align: 'justify', text: 'b' },
        { align: 'left', text: 'c' },
      ],
    });
    expect(validateFormatB([entry]).errors).toEqual([]);
  });

  it('detects missing id', () => {
    const e = validEntry(); delete e.id;
    const result = validateFormatB([e]);
    expect(result.errors[0]).toContain('id');
  });

  it('detects missing title', () => {
    const e = validEntry(); delete e.title;
    expect(validateFormatB([e]).errors[0]).toContain('title');
  });

  it('detects missing paragraphs', () => {
    const e = validEntry(); delete e.paragraphs;
    expect(validateFormatB([e]).errors[0]).toContain('paragraphs');
  });

  it('detects invalid align', () => {
    const e = validEntry({ paragraphs: [{ align: 'centre', text: 'x' }] });
    const result = validateFormatB([e]);
    expect(result.errors[0]).toContain('invalid align');
  });

  it('detects paragraph missing text', () => {
    const e = validEntry({ paragraphs: [{ align: 'center' }] });
    expect(validateFormatB([e]).errors[0]).toContain('text');
  });

  it('detects num wrong type', () => {
    expect(validateFormatB([validEntry({ num: 'one' })]).errors[0]).toContain('num');
  });

  it('rejects non-array input', () => {
    expect(validateFormatB('nope').errors[0]).toContain('expected an array');
  });

  it('rejects non-object scriptures', () => {
    expect(validateFormatB([validEntry({ scriptures: [] })]).errors[0]).toContain('scriptures');
  });

  describe('inline refs', () => {
    it('accepts a well-formed nav link', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: 'See {{nav:esther:7}}.' }] });
      expect(validateFormatB([e]).errors).toEqual([]);
    });

    it('detects a malformed nav link (missing chapter)', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: '{{nav:esther}}' }] });
      expect(validateFormatB([e]).errors[0]).toContain('malformed nav link');
    });

    it('detects a malformed nav link (non-numeric chapter)', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: '{{nav:esther:vii}}' }] });
      expect(validateFormatB([e]).errors[0]).toContain('malformed nav link');
    });

    it('detects an empty ref', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: 'x {{ref:}} y' }] });
      expect(validateFormatB([e]).errors[0]).toContain('empty inline ref');
    });

    it('warns when a ref is absent from a non-empty scriptures dict', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: 'See {{ref:John 3:16}}.' }] });
      const result = validateFormatB([e], { scriptures: { 'Matthew 4:4': 'text' } });
      expect(result.errors).toEqual([]);
      expect(result.warnings[0]).toContain('not found in scriptures');
    });

    it('passes when a ref exists in the scriptures dict', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: 'See {{ref:John 3:16}}.' }] });
      const result = validateFormatB([e], { scriptures: { 'John 3:16': 'text' } });
      expect(result.warnings).toEqual([]);
    });

    it('does not warn on refs when no scriptures dict is provided', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: '{{ref:John 3:16}}' }] });
      expect(validateFormatB([e]).warnings).toEqual([]);
    });

    it('matches compound ref keys verbatim', () => {
      const e = validEntry({ paragraphs: [{ align: 'center', text: '{{ref:Isaiah 40:13; Romans 11:34}}' }] });
      const result = validateFormatB([e], { scriptures: { 'Isaiah 40:13; Romans 11:34': 'text' } });
      expect(result.warnings).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Holy Days (hybrid album)
// ═══════════════════════════════════════════════════════════════

describe('validateHolyDays', () => {
  function wtlbEntry(overrides = {}) {
    return { id: 'hd-w', num: 1, title: 'HD WTLB', type: 'wtlb',
      paragraphs: [{ align: 'center', text: 'x' }], scriptures: {}, ...overrides };
  }
  function letterEntry(overrides = {}) {
    return { id: 'hd-l', num: 2, title: 'HD Letter', type: 'letter',
      blocks: [{ type: 'para', segments: [{ t: 'text', v: 'x' }] }],
      footnotes: {}, nkjv: {}, ...overrides };
  }

  it('accepts a valid wtlb-type entry', () => {
    expect(validateHolyDays([wtlbEntry()]).errors).toEqual([]);
  });

  it('accepts a valid letter-type entry', () => {
    expect(validateHolyDays([letterEntry()]).errors).toEqual([]);
  });

  it('detects an invalid type', () => {
    expect(validateHolyDays([wtlbEntry({ type: 'bogus' })]).errors[0]).toContain('invalid or missing "type"');
  });

  it('detects a missing type', () => {
    const e = wtlbEntry(); delete e.type;
    expect(validateHolyDays([e]).errors[0]).toContain('type');
  });

  it('delegates letter-type block validation to Format A', () => {
    const e = letterEntry({ blocks: [{ type: 'bogus' }] });
    expect(validateHolyDays([e]).errors[0]).toContain('invalid block type');
  });

  it('delegates wtlb-type paragraph validation to Format B', () => {
    const e = wtlbEntry({ paragraphs: [{ align: 'sideways', text: 'x' }] });
    expect(validateHolyDays([e]).errors[0]).toContain('invalid align');
  });

  it('passes a consistent prevEntry/nextEntry chain', () => {
    const entries = [
      wtlbEntry({ id: 'a', title: 'A', prevEntry: null, nextEntry: { id: 'b', title: 'B' } }),
      letterEntry({ id: 'b', title: 'B', prevEntry: { id: 'a', title: 'A' }, nextEntry: null }),
    ];
    const result = validateHolyDays(entries);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('detects a broken nextEntry chain', () => {
    const entries = [
      wtlbEntry({ id: 'a', title: 'A', prevEntry: null, nextEntry: { id: 'wrong', title: 'W' } }),
      wtlbEntry({ id: 'b', title: 'B', prevEntry: { id: 'a', title: 'A' }, nextEntry: null }),
    ];
    const result = validateHolyDays(entries);
    expect(result.errors[0]).toContain('nextEntry.id');
    expect(result.errors[0]).toContain('wrong');
  });

  it('rejects non-array input', () => {
    expect(validateHolyDays('nope').errors[0]).toContain('expected an array');
  });
});

// ═══════════════════════════════════════════════════════════════
// Format C (Bible books)
// ═══════════════════════════════════════════════════════════════

/** Minimal valid Format C book. */
function validBook(overrides = {}) {
  return {
    id: 'ephesians',
    title: 'Ephesians',
    chapters: [
      { num: 1, title: 'Ch1', sections: [
        { heading: 'Greeting', verses: [{ n: 1, text: 'Paul...' }, { n: 2, text: 'Grace...' }] },
      ] },
    ],
    ...overrides,
  };
}

describe('validateFormatC', () => {
  it('valid single book produces zero errors', () => {
    expect(validateFormatC(validBook()).errors).toEqual([]);
  });

  it('valid object-of-books produces zero errors', () => {
    expect(validateFormatC({ ephesians: validBook(), john: validBook({ id: 'john', title: 'John' }) }).errors).toEqual([]);
  });

  it('valid array of books produces zero errors', () => {
    expect(validateFormatC([validBook()]).errors).toEqual([]);
  });

  it('detects missing chapters', () => {
    const b = validBook(); delete b.chapters;
    expect(validateFormatC(b).errors[0]).toContain('chapters');
  });

  it('detects chapter missing num', () => {
    const b = validBook({ chapters: [{ sections: [] }] });
    expect(validateFormatC(b).errors[0]).toContain('num');
  });

  it('detects section missing verses', () => {
    const b = validBook({ chapters: [{ num: 1, sections: [{ heading: 'x' }] }] });
    expect(validateFormatC(b).errors[0]).toContain('verses');
  });

  it('detects verse missing n', () => {
    const b = validBook({ chapters: [{ num: 1, sections: [{ heading: 'x', verses: [{ text: 'no n' }] }] }] });
    expect(validateFormatC(b).errors[0]).toContain('"n"');
  });

  it('detects verse missing text', () => {
    const b = validBook({ chapters: [{ num: 1, sections: [{ heading: 'x', verses: [{ n: 1 }] }] }] });
    expect(validateFormatC(b).errors[0]).toContain('text');
  });

  it('detects non-ascending verse numbering', () => {
    const b = validBook({ chapters: [{ num: 1, sections: [{ heading: 'x', verses: [{ n: 5, text: 'a' }, { n: 3, text: 'b' }] }] }] });
    expect(validateFormatC(b).errors[0]).toContain('not ascending');
  });

  it('ascends across sections within a chapter', () => {
    const b = validBook({ chapters: [{ num: 1, sections: [
      { heading: 's1', verses: [{ n: 1, text: 'a' }, { n: 2, text: 'b' }] },
      { heading: 's2', verses: [{ n: 3, text: 'c' }] },
    ] }] });
    expect(validateFormatC(b).errors).toEqual([]);
  });

  it('warns on a verse gap', () => {
    const b = validBook({ chapters: [{ num: 1, sections: [{ heading: 'x', verses: [{ n: 1, text: 'a' }, { n: 5, text: 'b' }] }] }] });
    const result = validateFormatC(b);
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toContain('verse gap');
  });

  it('rejects non-object input', () => {
    expect(validateFormatC(42).errors[0]).toContain('expected an object');
  });

  describe('chromeOnly mode', () => {
    it('does not require per-book id/title', () => {
      const chrome = { ephesians: { chapters: [{ num: 1, sections: [{ heading: 'Greeting' }] }] } };
      expect(validateFormatC(chrome, { chromeOnly: true }).errors).toEqual([]);
    });

    it('does not require verses', () => {
      const chrome = { ephesians: { chapters: [{ num: 1, sections: [{ heading: 'h' }] }] } };
      expect(validateFormatC(chrome, { chromeOnly: true }).errors).toEqual([]);
    });

    it('still flags a non-array verses field if present', () => {
      const chrome = { ephesians: { chapters: [{ num: 1, sections: [{ heading: 'h', verses: 'bad' }] }] } };
      expect(validateFormatC(chrome, { chromeOnly: true }).errors[0]).toContain('verses');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Format D (Bible Studies)
// ═══════════════════════════════════════════════════════════════

/** Minimal valid Format D study. */
function validStudy(overrides = {}) {
  return {
    id: 'study-1',
    title: 'A Study',
    chapters: [
      { id: 'study-1-ch1', num: 1, title: 'Ch1', blocks: [] },
      { id: 'study-1-ch2', num: 2, title: 'Ch2', blocks: [] },
    ],
    ...overrides,
  };
}

describe('validateFormatD', () => {
  it('valid study (chapters only) produces zero errors', () => {
    expect(validateFormatD([validStudy()]).errors).toEqual([]);
  });

  it('valid multi-part study with resolving chapterIds produces zero errors', () => {
    const study = validStudy({
      parts: [{ num: 1, title: 'Part 1', chapterIds: ['study-1-ch1', 'study-1-ch2'] }],
    });
    expect(validateFormatD([study]).errors).toEqual([]);
  });

  it('detects missing chapters', () => {
    const s = validStudy(); delete s.chapters;
    expect(validateFormatD([s]).errors[0]).toContain('chapters');
  });

  it('detects chapter missing id', () => {
    const s = validStudy({ chapters: [{ num: 1, title: 'x' }] });
    expect(validateFormatD([s]).errors[0]).toContain('id');
  });

  it('detects part missing title', () => {
    const s = validStudy({ parts: [{ chapterIds: ['study-1-ch1'] }] });
    expect(validateFormatD([s]).errors[0]).toContain('title');
  });

  it('detects part missing chapterIds', () => {
    const s = validStudy({ parts: [{ title: 'Part 1' }] });
    expect(validateFormatD([s]).errors[0]).toContain('chapterIds');
  });

  it('detects an unresolvable chapterId', () => {
    const s = validStudy({ parts: [{ title: 'P', chapterIds: ['study-1-ch99'] }] });
    const result = validateFormatD([s]);
    expect(result.errors[0]).toContain('does not match any chapter');
  });

  it('accepts a singlePage study with no parts', () => {
    const s = validStudy({ singlePage: true });
    expect(validateFormatD([s]).errors).toEqual([]);
  });

  it('detects singlePage wrong type', () => {
    expect(validateFormatD([validStudy({ singlePage: 'yes' })]).errors[0]).toContain('singlePage');
  });

  it('rejects non-array input', () => {
    expect(validateFormatD('nope').errors[0]).toContain('expected an array');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cross-translation verse-count check
// ═══════════════════════════════════════════════════════════════

/** Single Format C book "ephesians" whose chapter 1 has the given verse #s. */
function bookWith(verseNums) {
  return {
    id: 'ephesians',
    title: 'Ephesians',
    chapters: [{ num: 1, sections: [{ heading: 'h', verses: verseNums.map((n) => ({ n, text: 'x' })) }] }],
  };
}
/** Reference map with Ephesians 1 having `count` verses. */
function refWith(count) {
  const verses = [];
  for (let n = 1; n <= count; n++) verses.push({ n, text: 'r' });
  return { ephesians: { '1': verses } };
}

describe('validateAgainstReference', () => {
  it('passes when the book has every reference verse', () => {
    expect(validateAgainstReference(bookWith([1, 2, 3]), refWith(3)).errors).toEqual([]);
  });

  it('flags a trailing gap', () => {
    const r = validateAgainstReference(bookWith([1, 2, 3]), refWith(5));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('missing verse(s) 4-5');
  });

  it('flags an internal gap', () => {
    expect(validateAgainstReference(bookWith([1, 3]), refWith(3)).errors[0]).toContain('missing verse(s) 2');
  });

  it('compresses non-contiguous missing verses into ranges', () => {
    expect(validateAgainstReference(bookWith([1, 5]), refWith(7)).errors[0]).toContain('missing verse(s) 2-4, 6-7');
  });

  it('accepts an object-of-books input', () => {
    expect(validateAgainstReference({ ephesians: bookWith([1, 2, 3]) }, refWith(3)).errors).toEqual([]);
  });

  it('maps a single book via singleBookId', () => {
    const book = { id: 'x', title: 'M', chapters: [{ num: 1, sections: [{ verses: [{ n: 1, text: 'a' }] }] }] };
    const ref = { 'matthew-plain': { '1': [{ n: 1 }, { n: 2 }] } };
    const r = validateAgainstReference(book, ref, { singleBookId: 'matthew-plain' });
    expect(r.errors[0]).toContain('missing verse(s) 2');
  });

  it('warns (no error) when the book is absent from the reference', () => {
    const r = validateAgainstReference(bookWith([1, 2, 3]), { genesis: { '1': [{ n: 1 }] } });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain('absent from reference');
  });

  it('skips a chapter listed in exceptions', () => {
    const r = validateAgainstReference(bookWith([1, 2]), refWith(3), { exceptions: ['ephesians 1'] });
    expect(r.errors).toEqual([]);
  });

  it('warns (no error) when no reference is provided', () => {
    const r = validateAgainstReference(bookWith([1]), null);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain('no reference translation');
  });

  it('ignores reference chapters the book does not declare (no false missing)', () => {
    // book has only ch1; reference also only ch1 here — a ref-only ch2 must not error
    const ref = { ephesians: { '1': [{ n: 1 }], '2': [{ n: 1 }, { n: 2 }] } };
    expect(validateAgainstReference(bookWith([1]), ref).errors).toEqual([]);
  });
});

// ── Format E: validateTranslationMap (bible-*.js verse maps) ─────

/** Minimal valid translation verse map. */
function validMap(overrides = {}) {
  return {
    genesis: {
      '1': [{ n: 1, text: 'In the beginning...' }, { n: 2, text: 'And the earth...' }],
      '2': [{ n: 1, text: 'Thus the heavens...' }],
    },
    ...overrides,
  };
}

describe('validateTranslationMap', () => {
  it('valid map produces zero errors and warnings', () => {
    const r = validateTranslationMap(validMap());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('empty map is vacuously valid', () => {
    expect(validateTranslationMap({}).errors).toEqual([]);
  });

  it('rejects an array (not an object of books)', () => {
    const r = validateTranslationMap([]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('expected an object');
  });

  it('rejects non-objects', () => {
    expect(validateTranslationMap('nope').errors.length).toBeGreaterThan(0);
    expect(validateTranslationMap(null).errors.length).toBeGreaterThan(0);
  });

  it('detects a book that is not an object of chapters', () => {
    const r = validateTranslationMap({ genesis: [1, 2, 3] });
    expect(r.errors.some((e) => e.includes('not an object of chapters'))).toBe(true);
  });

  it('detects a chapter value that is not an array', () => {
    const r = validateTranslationMap({ genesis: { '1': { n: 1 } } });
    expect(r.errors.some((e) => e.includes('not an array of verses'))).toBe(true);
  });

  it('warns on a non-numeric chapter key', () => {
    const r = validateTranslationMap({ genesis: { intro: [{ n: 1, text: 'x' }] } });
    expect(r.warnings.some((w) => w.includes('not a positive-integer string'))).toBe(true);
  });

  it('detects a verse missing n', () => {
    const r = validateTranslationMap({ genesis: { '1': [{ text: 'x' }] } });
    expect(r.errors.some((e) => e.includes('missing "n"'))).toBe(true);
  });

  it('detects a verse missing text', () => {
    const r = validateTranslationMap({ genesis: { '1': [{ n: 1 }] } });
    expect(r.errors.some((e) => e.includes('missing "text"'))).toBe(true);
  });

  it('treats non-ascending verse numbering as an error', () => {
    const r = validateTranslationMap({ genesis: { '1': [{ n: 2, text: 'a' }, { n: 1, text: 'b' }] } });
    expect(r.errors.some((e) => e.includes('not ascending'))).toBe(true);
  });

  it('treats a repeated verse number as an error', () => {
    const r = validateTranslationMap({ genesis: { '1': [{ n: 1, text: 'a' }, { n: 1, text: 'b' }] } });
    expect(r.errors.some((e) => e.includes('not ascending'))).toBe(true);
  });

  it('treats a verse gap as a warning, not an error (versification differences)', () => {
    const r = validateTranslationMap({ acts: { '8': [{ n: 36, text: 'a' }, { n: 38, text: 'b' }] } });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('verse gap'))).toBe(true);
  });

  it('names the book and file in the message context', () => {
    const r = validateTranslationMap({ genesis: { '1': [{ n: 1 }] } }, { fileName: 'bible-asv.js' });
    expect(r.errors[0]).toContain('bible-asv.js');
    expect(r.errors[0]).toContain('genesis');
  });

  it('detects a non-object verse', () => {
    const r = validateTranslationMap({ genesis: { '1': ['nope'] } });
    expect(r.errors.some((e) => e.includes('not an object'))).toBe(true);
  });
});

// ── Format E: validateScriptureDict (matthew-nkjv.js ref->text) ──

describe('validateScriptureDict', () => {
  it('valid ref->text dict produces zero errors', () => {
    const r = validateScriptureDict({ 'John 3:16': 'For God so loved...', 'Acts 2:23': 'Him being...' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('accepts compound values with | and em-dash separators', () => {
    const r = validateScriptureDict({
      'Daniel 7:9; Revelation 1:14-16': 'Daniel 7:9 — I watched... | Revelation 1:14-16 — His head...',
    });
    expect(r.errors).toEqual([]);
  });

  it('empty dict is vacuously valid', () => {
    expect(validateScriptureDict({}).errors).toEqual([]);
  });

  it('rejects an array', () => {
    const r = validateScriptureDict([]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('expected an object');
  });

  it('rejects non-objects', () => {
    expect(validateScriptureDict(null).errors.length).toBeGreaterThan(0);
    expect(validateScriptureDict(42).errors.length).toBeGreaterThan(0);
  });

  it('detects a non-string value', () => {
    const r = validateScriptureDict({ 'John 3:16': 123 });
    expect(r.errors.some((e) => e.includes('is not a string'))).toBe(true);
  });

  it('detects a null value', () => {
    const r = validateScriptureDict({ 'John 3:16': null });
    expect(r.errors.some((e) => e.includes('is not a string'))).toBe(true);
  });

  it('warns on an empty-string value', () => {
    const r = validateScriptureDict({ 'John 3:16': '' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('empty text'))).toBe(true);
  });

  it('names the offending ref in the message', () => {
    const r = validateScriptureDict({ 'John 3:16': 5 });
    expect(r.errors[0]).toContain('John 3:16');
  });
});

// ── Format E: validateStudyBible (matthew.js MATTHEW) ───────────

/** Minimal valid Study Bible. */
function validMatthew(overrides = {}) {
  return {
    id: 'matthew',
    title: 'Matthew',
    subtitle: 'The Gospel According to Matthew',
    votEdition: true,
    _dataVersion: '2026-05-03',
    preface: {
      title: 'Preface',
      blocks: [
        { type: 'heading', level: 1, text: 'THE VOLUMES OF TRUTH' },
        { type: 'para', segments: [{ t: 'text', v: 'Hello.' }] },
        { type: 'poetry', lines: [[{ t: 'italic', v: 'A line.' }], [{ t: 'text', v: '— Psalm 1' }]] },
      ],
    },
    chapters: [
      {
        num: 1,
        title: 'The Genealogy',
        verses: [{ n: 1, text: 'The book...' }, { n: 2, text: 'Abraham...' }],
        scriptures: [{ ref: '1:21', cite: 'Psalm 118:14' }],
        votNotes: [{ ref: '1:18-21', vol: 'Volume Two', letter: 'A Letter', excerpt: 'Some text.' }],
        links: [{ label: 'The Messiah', url: 'https://example.com' }],
      },
    ],
    ...overrides,
  };
}

describe('validateStudyBible', () => {
  it('valid study produces zero errors and warnings', () => {
    const r = validateStudyBible(validMatthew());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('accepts votNotes.vol === null (non-volume source)', () => {
    const study = validMatthew();
    study.chapters[0].votNotes.push({
      ref: '5:1-11', vol: null,
      letter: 'The Blessed: More Declarations of Blessedness', excerpt: 'A blessing.',
    });
    expect(validateStudyBible(study).errors).toEqual([]);
  });

  it('accepts a study with no preface', () => {
    const study = validMatthew();
    delete study.preface;
    expect(validateStudyBible(study).errors).toEqual([]);
  });

  it('accepts chapters without optional annotation layers', () => {
    const study = validMatthew({ chapters: [{ num: 1, verses: [{ n: 1, text: 'x' }] }] });
    expect(validateStudyBible(study).errors).toEqual([]);
  });

  it('ignores unknown top-level fields', () => {
    expect(validateStudyBible(validMatthew({ extra: 'whatever', _foo: 1 })).errors).toEqual([]);
  });

  it('rejects non-objects', () => {
    expect(validateStudyBible([]).errors[0]).toContain('expected a study object');
    expect(validateStudyBible(null).errors.length).toBeGreaterThan(0);
  });

  describe('top-level fields', () => {
    it('detects missing id', () => {
      const s = validMatthew(); delete s.id;
      expect(validateStudyBible(s).errors.some((e) => e.includes('"id"'))).toBe(true);
    });
    it('detects missing title', () => {
      const s = validMatthew(); delete s.title;
      expect(validateStudyBible(s).errors.some((e) => e.includes('"title"'))).toBe(true);
    });
    it('detects a non-string subtitle', () => {
      expect(validateStudyBible(validMatthew({ subtitle: 7 })).errors.some((e) => e.includes('subtitle'))).toBe(true);
    });
    it('detects a non-boolean votEdition', () => {
      expect(validateStudyBible(validMatthew({ votEdition: 'yes' })).errors.some((e) => e.includes('votEdition'))).toBe(true);
    });
    it('detects missing chapters', () => {
      const s = validMatthew(); delete s.chapters;
      expect(validateStudyBible(s).errors.some((e) => e.includes('chapters'))).toBe(true);
    });
    it('detects non-array chapters', () => {
      expect(validateStudyBible(validMatthew({ chapters: {} })).errors.some((e) => e.includes('chapters'))).toBe(true);
    });
  });

  describe('preface', () => {
    it('detects a non-object preface', () => {
      expect(validateStudyBible(validMatthew({ preface: 'nope' })).errors.some((e) => e.includes('preface'))).toBe(true);
    });
    it('detects missing blocks', () => {
      expect(validateStudyBible(validMatthew({ preface: { title: 'P' } })).errors.some((e) => e.includes('blocks'))).toBe(true);
    });
    it('detects an invalid block type', () => {
      const r = validateStudyBible(validMatthew({ preface: { blocks: [{ type: 'bogus' }] } }));
      expect(r.errors.some((e) => e.includes('invalid block type'))).toBe(true);
    });
    it('detects a heading missing level', () => {
      const r = validateStudyBible(validMatthew({ preface: { blocks: [{ type: 'heading', text: 'X' }] } }));
      expect(r.errors.some((e) => e.includes('level'))).toBe(true);
    });
    it('detects a heading missing text', () => {
      const r = validateStudyBible(validMatthew({ preface: { blocks: [{ type: 'heading', level: 1 }] } }));
      expect(r.errors.some((e) => e.includes('text'))).toBe(true);
    });
    it('detects a para missing segments', () => {
      const r = validateStudyBible(validMatthew({ preface: { blocks: [{ type: 'para' }] } }));
      expect(r.errors.some((e) => e.includes('segments'))).toBe(true);
    });
    it('detects an invalid segment type in a para (reuses the Format A segment check)', () => {
      const r = validateStudyBible(validMatthew({ preface: { blocks: [{ type: 'para', segments: [{ t: 'bogus', v: 'x' }] }] } }));
      expect(r.errors.some((e) => e.includes('invalid segment type'))).toBe(true);
    });
    it('detects a poetry line that is not an array', () => {
      const r = validateStudyBible(validMatthew({ preface: { blocks: [{ type: 'poetry', lines: ['nope'] }] } }));
      expect(r.errors.some((e) => e.includes('must be an array'))).toBe(true);
    });
    it('detects poetry missing lines', () => {
      const r = validateStudyBible(validMatthew({ preface: { blocks: [{ type: 'poetry' }] } }));
      expect(r.errors.some((e) => e.includes('lines'))).toBe(true);
    });
  });

  describe('chapters', () => {
    it('detects a chapter missing num', () => {
      const r = validateStudyBible(validMatthew({ chapters: [{ verses: [{ n: 1, text: 'x' }] }] }));
      expect(r.errors.some((e) => e.includes('num'))).toBe(true);
    });
    it('detects a chapter missing verses', () => {
      const r = validateStudyBible(validMatthew({ chapters: [{ num: 1 }] }));
      expect(r.errors.some((e) => e.includes('verses'))).toBe(true);
    });
    it('treats non-ascending verses as an error', () => {
      const r = validateStudyBible(validMatthew({ chapters: [{ num: 1, verses: [{ n: 3, text: 'a' }, { n: 2, text: 'b' }] }] }));
      expect(r.errors.some((e) => e.includes('not ascending'))).toBe(true);
    });
    it('treats a verse gap as a warning', () => {
      const r = validateStudyBible(validMatthew({ chapters: [{ num: 1, verses: [{ n: 1, text: 'a' }, { n: 3, text: 'b' }] }] }));
      expect(r.errors).toEqual([]);
      expect(r.warnings.some((w) => w.includes('verse gap'))).toBe(true);
    });
    it('detects a non-string chapter title', () => {
      const r = validateStudyBible(validMatthew({ chapters: [{ num: 1, title: 9, verses: [{ n: 1, text: 'x' }] }] }));
      expect(r.errors.some((e) => e.includes('title'))).toBe(true);
    });
  });

  describe('annotation layers', () => {
    const base = () => validMatthew().chapters[0];
    it('detects a scriptures entry missing ref', () => {
      const ch = base(); ch.scriptures = [{ cite: 'x' }];
      const r = validateStudyBible(validMatthew({ chapters: [ch] }));
      expect(r.errors.some((e) => e.includes('scriptures') && e.includes('ref'))).toBe(true);
    });
    it('detects a votNotes entry missing letter', () => {
      const ch = base(); ch.votNotes = [{ ref: '1:1', vol: 'V2', excerpt: 'e' }];
      const r = validateStudyBible(validMatthew({ chapters: [ch] }));
      expect(r.errors.some((e) => e.includes('votNotes') && e.includes('letter'))).toBe(true);
    });
    it('rejects a non-string, non-null votNotes.vol', () => {
      const ch = base(); ch.votNotes = [{ ref: '1:1', vol: 7, letter: 'L', excerpt: 'e' }];
      const r = validateStudyBible(validMatthew({ chapters: [ch] }));
      expect(r.errors.some((e) => e.includes('vol') && e.includes('string or null'))).toBe(true);
    });
    it('detects a links entry missing url', () => {
      const ch = base(); ch.links = [{ label: 'X' }];
      const r = validateStudyBible(validMatthew({ chapters: [ch] }));
      expect(r.errors.some((e) => e.includes('links') && e.includes('url'))).toBe(true);
    });
    it('detects an annotation layer that is not an array', () => {
      const ch = base(); ch.scriptures = { ref: '1:1', cite: 'x' };
      const r = validateStudyBible(validMatthew({ chapters: [ch] }));
      expect(r.errors.some((e) => e.includes('must be an array'))).toBe(true);
    });
    it('detects a non-object annotation record', () => {
      const ch = base(); ch.votNotes = ['nope'];
      const r = validateStudyBible(validMatthew({ chapters: [ch] }));
      expect(r.errors.some((e) => e.includes('not an object'))).toBe(true);
    });
  });
});

// ── Footnote verse markers (gold-render gate) ───────────────────
describe('validateFootnoteMarkers', () => {
  it('passes a fully-marked multi-verse value', () => {
    const r = validateFootnoteMarkers({ '2 Peter 1:20-21': '20. knowing this first 21. for prophecy never came' });
    expect(r.errors).toEqual([]);
  });
  it('flags a value whose decimal markers do not fully split (renders white)', () => {
    // Only verse 1 has a marker for a 3-verse ref → splits 1/3 with the "1."
    // class of leftover that renders white.
    const r = validateFootnoteMarkers({ 'Test 1:1-3': '1. first only — verses 2 and 3 carry no marker' });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('Test 1:1-3');
  });
  it('does NOT flag marker-less prose (renders gold-first, no stray decimal numbers)', () => {
    const r = validateFootnoteMarkers({ 'Test 1:1-3': 'first clause and second clause and third clause' });
    expect(r.errors).toEqual([]);
  });
  it('does NOT flag a Unicode-superscript excerpt (the renderer strips superscripts)', () => {
    const r = validateFootnoteMarkers({ 'Isaiah 53:2-12': 'For He shall grow up ³He is despised ⁴Surely ¹²Therefore' });
    expect(r.errors).toEqual([]);
  });
  it('does NOT flag a single-verse value', () => {
    const r = validateFootnoteMarkers({ 'John 3:16': 'For God so loved the world.' });
    expect(r.errors).toEqual([]);
  });
});

// ── CORP1 — duplicate id slug detection (the likeliest corpus regression) ──
describe('CORP1 — duplicate id detection', () => {
  it('Format A: flags a duplicate letter id slug', () => {
    const r = validateFormatA([validLetter({ id: 'dup' }), validLetter({ id: 'dup' })]);
    expect(r.errors.some((e) => /duplicate "id" "dup"/.test(e))).toBe(true);
  });
  it('Format A: distinct ids produce no duplicate error', () => {
    const r = validateFormatA([validLetter({ id: 'a' }), validLetter({ id: 'b' })]);
    expect(r.errors).toEqual([]);
  });
  it('Format B: flags a duplicate entry id slug', () => {
    const r = validateFormatB([{ id: 'dup', title: 'A', paragraphs: [] }, { id: 'dup', title: 'B', paragraphs: [] }]);
    expect(r.errors.some((e) => /duplicate "id" "dup"/.test(e))).toBe(true);
  });
  it('Format D: flags a duplicate study id slug', () => {
    const r = validateFormatD([{ id: 'dup', title: 'A', parts: [] }, { id: 'dup', title: 'B', parts: [] }]);
    expect(r.errors.some((e) => /duplicate "id" "dup"/.test(e))).toBe(true);
  });
});

// ── CORP2 — translation completeness (missing book/chapter vs KJV) ──
describe('validateTranslationCompleteness — CORP2', () => {
  const ref = { genesis: { '1': [{ n: 1 }], '2': [{ n: 1 }] }, exodus: { '1': [{ n: 1 }] } };
  it('passes when the translation has every reference book + chapter', () => {
    const map = { genesis: { '1': [{ n: 1 }], '2': [{ n: 1 }] }, exodus: { '1': [{ n: 1 }] } };
    expect(validateTranslationCompleteness(map, ref).errors).toEqual([]);
  });
  it('errors on a wholly-missing book', () => {
    const map = { genesis: { '1': [{ n: 1 }], '2': [{ n: 1 }] } }; // no exodus
    expect(validateTranslationCompleteness(map, ref).errors.some((e) => /missing book "exodus"/.test(e))).toBe(true);
  });
  it('errors on a wholly-missing chapter', () => {
    const map = { genesis: { '1': [{ n: 1 }] }, exodus: { '1': [{ n: 1 }] } }; // genesis ch2 gone
    expect(validateTranslationCompleteness(map, ref).errors.some((e) => /missing genesis chapter 2/.test(e))).toBe(true);
  });
  it('does NOT error on a missing single verse (the contiguity check owns that)', () => {
    const map = { genesis: { '1': [{ n: 1 }, { n: 3 }], '2': [{ n: 1 }] }, exodus: { '1': [{ n: 1 }] } };
    expect(validateTranslationCompleteness(map, ref).errors).toEqual([]);
  });
  it('skips gracefully (warn, no error) when the reference is unavailable', () => {
    const r = validateTranslationCompleteness({ genesis: {} }, null);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1);
  });
});
