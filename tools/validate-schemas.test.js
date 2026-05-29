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

    it('accepts scripture block (flexible structure)', () => {
      const letter = validLetter({
        blocks: [{ type: 'scripture' }],
      });
      const result = validateFormatA([letter]);
      expect(result.errors).toEqual([]);
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
