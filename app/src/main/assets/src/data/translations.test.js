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

/* Sparse Restored-Name overlays: rkjv carries only changed verses and chains
   to its registry base (kjv) for the rest; rnkjv needs no chain — a miss falls
   through to verse.text, which IS the NKJV base. */
describe('translateVerse — sparse overlay base chain', () => {
  beforeEach(() => {
    globalThis.TRANSLATION_OPTIONS = [
      { id: 'nkjv', label: 'NKJV', desc: 'x' },
      { id: 'rnkjv', label: 'NKJV-R', desc: 'x' },
      { id: 'kjv', label: 'KJV', desc: 'x' },
      { id: 'rkjv', label: 'KJV-R', desc: 'x', base: 'kjv' },
    ];
    globalThis.BIBLE_RKJV = { john: { 3: [{ n: 16, text: 'restored kjv 16' }] } };
    globalThis.BIBLE_RNKJV = { john: { 3: [{ n: 16, text: 'restored nkjv 16' }] } };
  });
  afterEach(() => {
    delete globalThis.TRANSLATION_OPTIONS;
    delete globalThis.BIBLE_RKJV;
    delete globalThis.BIBLE_RNKJV;
  });

  it('rkjv: overlay verse wins', () => {
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'rkjv')).toBe('restored kjv 16');
  });
  it('rkjv: overlay miss falls back to the base translation (kjv), not NKJV', () => {
    expect(translateVerse('john', 3, { n: 17, text: 'nkjv17' }, 'rkjv')).toBe('For God sent not his Son');
    // whole book absent from the overlay (OT) → base translation text
    expect(translateVerse('genesis', 1, { n: 1, text: 'nkjvG' }, 'rkjv')).toBe('In the beginning God created');
  });
  it('rkjv: miss in overlay AND base → verse.text', () => {
    expect(translateVerse('mark', 1, { n: 1, text: 'nkjvM' }, 'rkjv')).toBe('nkjvM');
  });
  it('rkjv: base not yet loaded → verse.text (NKJV) until the kjv script lands', () => {
    const savedKjv = globalThis.BIBLE_KJV;
    delete globalThis.BIBLE_KJV;
    try {
      expect(translateVerse('john', 3, { n: 17, text: 'nkjv17' }, 'rkjv')).toBe('nkjv17');
      expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'rkjv')).toBe('restored kjv 16');
    } finally {
      globalThis.BIBLE_KJV = savedKjv;
    }
  });
  it('rnkjv (no base): overlay verse wins, miss falls through to verse.text', () => {
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'rnkjv')).toBe('restored nkjv 16');
    expect(translateVerse('john', 3, { n: 17, text: 'nkjv17' }, 'rnkjv')).toBe('nkjv17');
    expect(translateVerse('genesis', 1, { n: 1, text: 'nkjvG' }, 'rnkjv')).toBe('nkjvG');
  });
  it('chain lookups alternating overlay/base per verse stay consistent (LRU cache)', () => {
    for (let i = 0; i < 3; i++) {
      expect(translateVerse('john', 3, { n: 16, text: 'x' }, 'rkjv')).toBe('restored kjv 16');
      expect(translateVerse('john', 3, { n: 17, text: 'x' }, 'rkjv')).toBe('For God sent not his Son');
    }
  });
});
