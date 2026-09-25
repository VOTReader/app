// @ts-nocheck
/* answers-contents — an Answers topic's sections and passages, for the contents navigator. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { answersContents, contentsSummary, passageTextBefore } from './answers-contents.js';

const P = (text, align = 'justify') => ({ text, align });

describe('answersContents', () => {
  it('groups passages under the bold centred headings, each starting at its first paragraph', () => {
    const c = answersContents({ paragraphs: [
      P('**I AM COME**', 'center'),                                   // 0
      P('_2/4/11_ **_From The Lord, Our God and Savior_**'),          // 1  passage 1 starts
      P('Thus says The Lord: My sons and daughters…'),                // 2
      P('~ [From “I AM COME” ~ Volume 5]', 'right'),                  // 3
      P('✦', 'center'),                                               // 4  divider: no passage
      P('"Beloved, hear Me…"'),                                       // 5  passage 2 starts
      P('~ [From “The Cups of the Thirsty” ~ Volume 4]', 'right'),    // 6
      P('**I Shall Return**', 'center'),                              // 7
      P('"Behold, I come quickly…"'),                                 // 8
      P('~ [From "The Measuring Line" ~ Volume 5]', 'right'),         // 9  straight quotes too
    ] });
    expect(c.passages).toBe(3);
    expect(c.sections.map((s) => [s.title, s.index, s.passages.length])).toEqual([
      ['I AM COME', 0, 2], ['I Shall Return', 7, 1],
    ]);
    expect(c.sections[0].passages).toEqual([
      { index: 1, title: 'I AM COME', collection: 'Volume 5' },
      { index: 5, title: 'The Cups of the Thirsty', collection: 'Volume 4' },
    ]);
    expect(c.sections[1].passages[0]).toEqual({ index: 8, title: 'The Measuring Line', collection: 'Volume 5' });
  });

  it('passages before the first heading form an untitled lead section; bold that is not centred is not a heading', () => {
    const c = answersContents({ paragraphs: [
      P('**Hear, O people**'),                                        // bold prose, justified: not a heading
      P('~ [From “Hear” ~ The Lord\'s Rebuke]', 'right'),
      P('**Section**', 'center'),
      P('text'),
      P('~ [From “Two” ~ Letters to the Flock]', 'right'),
    ] });
    expect(c.sections.map((s) => s.title)).toEqual(['', 'Section']);
    expect(c.sections[0].passages[0]).toEqual({ index: 0, title: 'Hear', collection: "The Lord's Rebuke" });
    expect(contentsSummary(c)).toBe('2 passages');          // one named section: sections not counted
  });

  it('an empty or odd entry is an empty contents, never a throw', () => {
    expect(answersContents(null)).toEqual({ sections: [], passages: 0 });
    expect(answersContents({ paragraphs: [P(''), null, P('✦', 'center')] })).toEqual({ sections: [], passages: 0 });
  });

  it('summary: sections are named only when the site names more than one', () => {
    expect(contentsSummary({ sections: [{ title: 'A' }, { title: 'B' }], passages: 54 })).toBe('2 sections · 54 passages');
    expect(contentsSummary({ sections: [{ title: '' }], passages: 1 })).toBe('1 passage');
  });
});

describe('on the real corpus', () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'answers.js'), 'utf8');
  const ctx = {};
  runInNewContext(src, ctx);
  it('counts every source line of every topic exactly once (1,636 in all)', () => {
    let total = 0;
    for (const e of ctx.ANSWERS) {
      const c = answersContents(e);
      const lines = e.paragraphs.filter((p) => /^~ \[From /.test(p.text)).length;
      expect(c.passages, e.id).toBe(lines);
      expect(c.sections.flatMap((s) => s.passages).length, e.id).toBe(lines);
      total += c.passages;
    }
    expect(total).toBe(1636);
  });
  it('every passage starts at a real paragraph, in order, and names its source', () => {
    for (const e of ctx.ANSWERS) {
      const idx = answersContents(e).sections.flatMap((s) => s.passages);
      for (let i = 0; i < idx.length; i++) {
        expect(idx[i].index, e.id).toBeGreaterThanOrEqual(0);
        expect(idx[i].index, e.id).toBeLessThan(e.paragraphs.length);
        if (i) expect(idx[i].index, e.id).toBeGreaterThan(idx[i - 1].index);
        expect(idx[i].title.length, e.id).toBeGreaterThan(0);
      }
    }
  });
  it('The Coming of The Lord: 54 passages under its named sections', () => {
    const c = answersContents(ctx.ANSWERS.find((e) => e.id === 'the-coming-of-the-lord'));
    expect(c.passages).toBe(54);
    expect(c.sections[0].title).toBe('I AM COME');
    expect(c.sections[0].passages[0]).toMatchObject({ title: 'I AM COME', collection: 'Volume 5' });
  });
});

describe('passageTextBefore', () => {
  const paras = [
    P('**I AM COME**', 'center'),                                              // 0
    P('_2/4/11_ **_From The Lord, Our God and Savior_**\n_The Word of The Lord_'), // 1 dated header: left out
    P('_Thus says The Lord:_ My sons and daughters{{ref:John 3:16}}, **hear**.'),  // 2
    P('Beloved, let go.'),                                                      // 3
    P('~ [From “I AM COME” ~ Volume 5]', 'right'),                             // 4
    P('✦', 'center'),                                                           // 5
    P('Second passage.'),                                                       // 6
    P('~ [From “B” ~ Volume 4]', 'right'),                                      // 7
  ];
  it('quotes the passage a source line closes, header out and marks stripped', () => {
    expect(passageTextBefore(paras, 4)).toBe('Thus says The Lord: My sons and daughters , hear. Beloved, let go.');
  });
  it('stops at the previous source line / divider', () => {
    expect(passageTextBefore(paras, 7)).toBe('Second passage.');
  });
  it('is empty when there is nothing to quote', () => {
    expect(passageTextBefore(paras, 0)).toBe('');
    expect(passageTextBefore(null, 3)).toBe('');
  });
});
