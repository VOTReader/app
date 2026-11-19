/* volume-facts — the seven Volumes' year spans.
   Pins the exact strings, including the no-break spaces round the dash
   (a plain-space row broke across lines at text size 2), and the freeze. */
import { describe, it, expect } from 'vitest';
import { VOLUME_YEARS } from './volume-facts.js';

describe('VOLUME_YEARS', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(VOLUME_YEARS)).toBe(true);
  });

  it('has exactly the seven volumes', () => {
    expect(Object.keys(VOLUME_YEARS)).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven']);
  });

  it('spans each volume as the Volumes page says', () => {
    expect(VOLUME_YEARS.one).toBe('2004 – 2006');
    expect(VOLUME_YEARS.two).toBe('2004 – 2010');
    expect(VOLUME_YEARS.three).toBe('2006 – 2010');
    expect(VOLUME_YEARS.four).toBe('2010 – 2011');
    expect(VOLUME_YEARS.five).toBe('2011 – 2014');
    expect(VOLUME_YEARS.six).toBe('2011 – 2014');
    expect(VOLUME_YEARS.seven).toBe('2005 – 2014');
  });

  it('uses no-break spaces, never plain spaces, round the dash', () => {
    for (const span of Object.values(VOLUME_YEARS)) {
      expect(span).toContain(' ');
      expect(span).not.toContain(' ');
      expect(span).toContain('–');
    }
  });

  it('volumes five and six share a span, and no other two do', () => {
    expect(VOLUME_YEARS.five).toBe(VOLUME_YEARS.six);
    const spans = Object.values(VOLUME_YEARS);
    expect(new Set(spans).size).toBe(6);
  });
});
