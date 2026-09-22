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

  it('nothing holds it: -1', () => {
    expect(excerptLanding('zebra crossing at dawn', TEXTS)).toEqual({ index: -1, off: -1 });
    expect(excerptLanding('', TEXTS)).toEqual({ index: -1, off: -1 });
  });
});
