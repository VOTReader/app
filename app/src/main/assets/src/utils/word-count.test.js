/* word-count — the ONE definition of "how many words is this item".
   The baseline gate in tools/validate-schemas.js imports this same module,
   so these tests pin the counting contract for both the app and the gate. */

import { describe, it, expect } from 'vitest';
import { countTextWords, countItemWords, readingMinutes } from './word-count.js';

describe('countTextWords', () => {
  it('counts /\\S+/ tokens and survives null/undefined/empty', () => {
    expect(countTextWords('For God so loved the world')).toBe(6);
    expect(countTextWords('  spaced   out\n\nlines ')).toBe(3);
    expect(countTextWords('')).toBe(0);
    expect(countTextWords(null)).toBe(0);
    expect(countTextWords(undefined)).toBe(0);
  });

  it('counts Format-B markup by raw tokens (the deterministic contract)', () => {
    expect(countTextWords('_italic_')).toBe(1);
    expect(countTextWords('**bold** word')).toBe(2);
    expect(countTextWords('see {{ref:Matthew 4:4}} here')).toBe(4);
  });
});

describe('countItemWords — Format A (letters)', () => {
  const letter = {
    id: 'x', title: 'Ignored Title Words Here', date: '1/1/05',
    from: 'From The Lord (header — excluded)',
    blocks: [
      { type: 'para', segments: [
        { t: 'bold-italic', v: 'Thus says The Lord:' },   // 4
        { t: 'text', v: ' hear Me now' },                  // 3
        { t: 'fn', v: '1' },                               // 0 — marker
      ] },
      { type: 'poetry', lines: [
        [{ t: 'text', v: 'line one here' }],               // 3
        [{ t: 'stanza-break' }],                           // 0
        [{ t: 'italic', v: 'and two' }],                   // 2
      ] },
      { type: 'closing', text: 'Says The Lord.' },         // 3
    ],
    footnotes: { 1: { type: 'scripture', ref: 'Isaiah 13:11' } },
    nkjv: { 'Isaiah 13:11': 'excluded footnote scripture text' },
  };
  it('sums segments + poetry lines + closing; excludes fn markers, headers, footnote dicts', () => {
    expect(countItemWords(letter)).toBe(4 + 3 + 3 + 2 + 3);
  });
  it('includes sectionIntro prose when present', () => {
    expect(countItemWords({ blocks: [], sectionIntro: 'a dream of a coming storm' })).toBe(6);
  });
  /* PRODUCTION shape: every real sectionIntro in the corpus (volume-seven
     "Recompense" + 14 bible-studies chapters) is an ARRAY of blocks, not a
     string. String-coercing it counted the two words of "[object Object]"
     instead of the prose — thousands of words missing from the minute chips,
     word-weighted progress, and the corpus baseline. */
  it('counts an ARRAY sectionIntro as blocks — the shape the corpus actually uses', () => {
    expect(countItemWords({
      blocks: [],
      sectionIntro: [
        { type: 'heading', text: 'A Dream of a Coming Storm' },        // 6
        { type: 'para', segments: [{ t: 'text', v: 'I saw a storm coming' }] }, // 5
        { type: 'para', segments: [{ t: 'text', v: 'then three tornadoes' }, { t: 'fn', v: '1' }] }, // 3
      ],
    })).toBe(14);
  });
});

describe('countItemWords — Format B (WTLB/Blessed)', () => {
  it('sums paragraph text', () => {
    expect(countItemWords({ paragraphs: [
      { align: 'center', text: 'The wailing of the penitent' },  // 5
      { align: 'justify', text: 'brings forth healing' },        // 3
    ] })).toBe(8);
  });
});

describe('countItemWords — bible chapters', () => {
  /* Section headings are CHROME, not reading content: the reader can switch
     them off (settings.showSectionHeadings) or tap to hide them, and they
     carry no data-hl-key so the read detector never measures them. Counting
     them here would make this data-derived total permanently disagree with
     the DOM-derived one, in a way the data side cannot resolve. */
  it('sums verses and EXCLUDES section headings (nested Format C)', () => {
    expect(countItemWords({ num: 1, sections: [
      { heading: 'The Beatitudes', verses: [{ n: 1, text: 'Blessed are the poor' }] }, // 4 (heading not counted)
      { verses: [{ n: 2, text: 'for theirs is' }] },                                    // 3
    ] })).toBe(7);
  });
  it('sums flat Matthew-shape verses', () => {
    expect(countItemWords({ num: 1, verses: [{ n: 1, text: 'The book of' }, { n: 2, text: 'the genealogy' }] })).toBe(5);
  });
});

describe('countItemWords — safety', () => {
  it('unknown shapes count 0, never guess', () => {
    expect(countItemWords({ someFuture: 'shape' })).toBe(0);
    expect(countItemWords(null)).toBe(0);
    expect(countItemWords('string')).toBe(0);
  });
  it('memoizes on object identity', () => {
    const item = { paragraphs: [{ text: 'one two three' }] };
    expect(countItemWords(item)).toBe(3);
    item.paragraphs.push({ text: 'mutation ignored' }); // memo hit — corpus items never mutate
    expect(countItemWords(item)).toBe(3);
  });
});

describe('readingMinutes', () => {
  it('rounds at the default 230 wpm with a 1-minute floor', () => {
    expect(readingMinutes(94)).toBe(1);      // WTLB average — floor
    expect(readingMinutes(937)).toBe(4);     // Volume Seven average
    expect(readingMinutes(2385)).toBe(10);   // Psalm 119
    expect(readingMinutes(0)).toBe(0);
  });
  it('uses a measured pace when given', () => {
    expect(readingMinutes(920, 460)).toBe(2);
    expect(readingMinutes(920, 0)).toBe(4);  // bad pace falls back to 230
  });
});
