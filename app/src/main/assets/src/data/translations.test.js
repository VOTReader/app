// @ts-nocheck — reads the window['BIBLE_<CODE>'] alt-translation globals
/* translateVerse — resolves a verse to its alt-translation text (NKJV fallback). Pins
   PERF-3: the single-entry { n -> text } index must give the SAME results as the old
   linear scan AND rebuild on a chapter/translation change (no stale cross-chapter leak). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { translateVerse } from './translations.js';

beforeEach(() => {
  globalThis.BIBLE_KJV = {
    john: { 3: [{ n: 16, text: 'For God so loued the world' }, { n: 17, text: 'For God sent not his Son' }] },
    genesis: { 1: [{ n: 1, text: 'In the beginning God created' }] },
  };
});
afterEach(() => { delete globalThis.BIBLE_KJV; });

describe('translateVerse (PERF-3)', () => {
  it('returns NKJV (verse.text) for nkjv / no translation', () => {
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'nkjv')).toBe('nkjv16');
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, null)).toBe('nkjv16');
  });
  it('returns the alt-translation text for a matching verse', () => {
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'kjv')).toBe('For God so loued the world');
    expect(translateVerse('john', 3, { n: 17, text: 'nkjv17' }, 'kjv')).toBe('For God sent not his Son');
  });
  it('falls back to NKJV when the data / book / chapter / verse is missing', () => {
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'asv')).toBe('nkjv16'); // BIBLE_ASV not set
    expect(translateVerse('mark', 1, { n: 1, text: 'nkjvM' }, 'kjv')).toBe('nkjvM');     // book absent
    expect(translateVerse('john', 99, { n: 1, text: 'nkjvC' }, 'kjv')).toBe('nkjvC');    // chapter absent
    expect(translateVerse('john', 3, { n: 999, text: 'nkjvV' }, 'kjv')).toBe('nkjvV');   // verse absent
  });
  it('PERF-3: the single-entry index rebuilds on chapter change (no stale cross-chapter result)', () => {
    expect(translateVerse('john', 3, { n: 16, text: 'x' }, 'kjv')).toBe('For God so loued the world');
    // switch chapters — n:1 must resolve to GENESIS 1:1, not a stale John index miss
    expect(translateVerse('genesis', 1, { n: 1, text: 'x' }, 'kjv')).toBe('In the beginning God created');
    // back to John 3 — index rebuilt correctly
    expect(translateVerse('john', 3, { n: 17, text: 'x' }, 'kjv')).toBe('For God sent not his Son');
  });
  it('PERF-3: repeated calls for the same chapter are consistent (cache hit)', () => {
    const a = translateVerse('john', 3, { n: 16, text: 'x' }, 'kjv');
    const b = translateVerse('john', 3, { n: 16, text: 'x' }, 'kjv');
    expect(a).toBe(b);
    expect(a).toBe('For God so loued the world');
  });
});
