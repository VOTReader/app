import { describe, it, expect } from 'vitest';
import { excerptLanding } from './excerpt-landing.js';

const TEXTS = [
  'Beloved, the wide path is crowded and its gate is broad.',
  '',   // a heading: nothing to land on
  'But the still small voice spoke to him in the cave, and he listened.',
];

describe('excerptLanding', () => {
  it('lands on the block whose text holds the head', () => {
    expect(excerptLanding('still small voice spoke to him in the cave, and he listened. But', TEXTS)).toEqual({ index: 2, off: 8 });
  });

  it('an excerpt that opens with the previous block\'s last words lands on the block holding its TAIL', () => {
    const r = excerptLanding('gate is broad. But the still small voice spoke to him', TEXTS);
    expect(r.index).toBe(2);
    expect(r.off).toBe(TEXTS[2].indexOf('small voice spoke to him'));
  });

  it('a longer tail beats a shorter head (24-char tail before the 12-char head)', () => {
    // head 12 "gate is broa" sits in block 0; the 24-char tail sits in block 2 — the tail wins
    expect(excerptLanding('gate is broad. But the still small voice spoke to him', TEXTS).index).toBe(2);
  });

  it('a short excerpt (no tail longer than itself) still lands by its head', () => {
    expect(excerptLanding('spoke to him', TEXTS)).toEqual({ index: 2, off: TEXTS[2].indexOf('spoke') });
  });

  it('an excerpt running on into the NEXT block lands on the sentence holding the marked words', () => {
    const texts = ['For the Word of God is quick, and by it shall the multitudes be divided!', 'Behold, they have divided My Word and made it of none effect.'];
    const ex = 'multitudes be divided! Behold, they have divided';
    expect(excerptLanding(ex, texts).index).toBe(1);   // without the words: the 24-char tail, the block after
    expect(excerptLanding(ex, texts, ['multitudes', 'divided'])).toEqual({ index: 0, off: texts[0].indexOf('multitudes') });
    // ...and the excerpt opening with the previous block's last words still lands by its words
    expect(excerptLanding('gate is broad. But the still small voice spoke to him', TEXTS, ['small', 'voice']).index).toBe(2);
  });

  // search sr11 (2026-10-15, bench t411 "men - section one"): the excerpt ran from a section heading into the
  // next block's date line, a line the topic also opens with, and the 24-char tail landed the reader on that first
  // date line, 141 blocks above the heading.
  it('an excerpt straddling two blocks lands on the pair it straddles, on the side holding the marked words', () => {
    const date = '8/19/10 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy';
    const texts = ['I Am Calling You Out', date, '"Thus says The Lord God: Beloved children, I am calling you out."',
      '~ [From “Adorn Yourself with The Word of God” ~ Letters to The Lord\'s Little Flock]',
      'Come Out of the Churches of Men - Section One', date, '"Thus says The Lord God: Beloved children."'];
    const ex = 'Men - Section One 8/19/10 From The Lord, Our God';
    expect(excerptLanding(ex, texts, ['men', '-', 'section', 'one', 'ones'])).toEqual({ index: 4, off: texts[4].indexOf('Men - Section One') });
    // the marked words on the date line's side: the block after the heading, at its start
    expect(excerptLanding(ex, texts, ['lord', 'god'])).toEqual({ index: 5, off: 0 });
  });

  // sweep W33 (2026-10-13): the pieces were folded and the words were not, so "word." and a straight "god's"
  // (the text has God’s) counted nothing, and the sentence holding fewer of them landed it.
  it('the marked words count however they are typed: punctuation, either apostrophe, accents', () => {
    const texts = ['It was told of old in the law.', 'It is God’s word to the naïve and the blasé.'];
    const ex = 'told of old in the law. It is God’s word to the naïve';
    expect(excerptLanding(ex, texts, ['law', "god's", 'word.']).index).toBe(1);
    expect(excerptLanding(ex, texts, ['law', 'naive', 'blase']).index).toBe(1);
    // a word in curly single quotes is still the word, not the word with an apostrophe on it
    const quoted = ['He went down to the river.', 'And He said, ‘Hear Me.’ And they heard.'];
    expect(excerptLanding('down to the river. And He said, ‘Hear Me', quoted, ['river', 'hear', 'me']).index).toBe(1);
  });

  it('nothing holds it: -1', () => {
    expect(excerptLanding('zebra crossing at dawn', TEXTS)).toEqual({ index: -1, off: -1 });
    expect(excerptLanding('', TEXTS)).toEqual({ index: -1, off: -1 });
  });
});
