/**
 * W9.1 Format A schema validator — vitest test suite
 */

import { describe, it, expect } from 'vitest';
import { validateFormatA } from './validate-schemas.js';

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
