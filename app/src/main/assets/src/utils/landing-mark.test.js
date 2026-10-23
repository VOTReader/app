import { describe, it, expect } from 'vitest';
import { landingRange } from './landing-mark.js';

const block = (html) => { const el = document.createElement('p'); el.innerHTML = html; return el; };

describe('landingRange: the landed sentence in a block\'s DOM text', () => {
  it('finds the words across text nodes, past a footnote number, in the squashed domain', () => {
    const el = block('Repent, for <em>the  penalty</em><sup class="fn-ref">3</sup> of sin is death, says The Lord.');
    const r = landingRange(el, 'the penalty of sin is death');
    expect(r && r.toString()).toBe('the  penalty3 of sin is death');
  });

  it('falls back to the sentence\'s head when its tail runs past the block', () => {
    const el = block('And He said: the wages of sin is death, but the gift of God is eternal life.');
    const r = landingRange(el, 'the wages of sin is death, but the gift of God is eternal life. And the next block begins');
    expect(r && r.toString()).toBe('the wages of sin is death, but the gift');
  });

  it('a head cut mid-word marks to the end of that word', () => {
    const el = block('Behold, the multitudes be divided among themselves, and they know it not.');
    const r = landingRange(el, 'the multitudes be divided among themselvesXX and more words than the block');
    expect(r && r.toString()).toBe('the multitudes be divided among themselves');
  });

  it('is null for words the block does not hold, or none', () => {
    expect(landingRange(block('Nothing here.'), 'zebra crossing at dawn')).toBeNull();
    expect(landingRange(block('Nothing here.'), '')).toBeNull();
    expect(landingRange(null, 'x')).toBeNull();
  });
});
