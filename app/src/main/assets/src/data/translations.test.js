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
  it('web: Romans 16:25-27 render the doxology this translation prints at 14:24-26', () => {
    const saved = globalThis.BIBLE_WEB;
    globalThis.BIBLE_WEB = { romans: { '14': [{ n: 24, text: 'web doxology a' }, { n: 25, text: 'web doxology b' }, { n: 26, text: 'web doxology c' }], '16': [{ n: 24, text: 'web 16:24' }] } };
    try {
      expect(translateVerse('romans', 16, { n: 24, text: 'nkjv24' }, 'web')).toBe('web 16:24');
      expect(translateVerse('romans', 16, { n: 25, text: 'nkjv25' }, 'web')).toBe('web doxology a');
      expect(translateVerse('romans', 16, { n: 27, text: 'nkjv27' }, 'web')).toBe('web doxology c');
      // a verse outside the alias still falls back cleanly
      expect(translateVerse('romans', 16, { n: 28, text: 'nkjv28' }, 'web')).toBe('nkjv28');
    } finally { globalThis.BIBLE_WEB = saved; }
  });

  it('hnv: an EMPTY shipped verse is a miss, so 16:25 takes the alias, not the blank', () => {
    const saved = globalThis.BIBLE_HNV;
    globalThis.BIBLE_HNV = { romans: { '14': [{ n: 24, text: 'hnv doxology a' }], '16': [{ n: 25, text: '' }] } };
    try {
      expect(translateVerse('romans', 16, { n: 25, text: 'nkjv25' }, 'hnv')).toBe('hnv doxology a');
    } finally { globalThis.BIBLE_HNV = saved; }
  });

  it('a BLANK shipped verse is a miss in every shape, not this translation’s text', () => {
    // data-corpus-6, second face. `if (t !== undefined) return t` handed an
    // empty string straight back, so the reader got a numbered verse row with
    // no text at all under the translation's header and nothing saying why.
    // Route A fixed hnv romans 16:25 only, because an empty value with no
    // alias row fell through the same test. Three shapes render the same blank
    // row and each took a different path: '' fell through `t !== undefined`;
    // '   ' is TRUTHY so it was returned by the early `if (t) return t`; null
    // fell through `t !== undefined` and React renders it as nothing.
    const saved = globalThis.BIBLE_HNV;
    globalThis.BIBLE_HNV = { luke: { '17': [
      { n: 35, text: 'hnv 17:35' },
      { n: 36, text: '' },
      { n: 37, text: '   ' },
      { n: 38, text: null },
    ] } };
    try {
      expect(translateVerse('luke', 17, { n: 35, text: 'nkjv35' }, 'hnv')).toBe('hnv 17:35');
      expect(translateVerse('luke', 17, { n: 36, text: 'nkjv36' }, 'hnv')).toBe('nkjv36');
      expect(translateVerse('luke', 17, { n: 37, text: 'nkjv37' }, 'hnv')).toBe('nkjv37');
      expect(translateVerse('luke', 17, { n: 38, text: 'nkjv38' }, 'hnv')).toBe('nkjv38');
    } finally { globalThis.BIBLE_HNV = saved; }
  });

  it('a blank verse in a sparse overlay hops to its BASE instead of rendering nothing', () => {
    // The base hop had the same `t !== undefined` test, so a blank overlay
    // verse shadowed a perfectly good base verse.
    const savedR = globalThis.BIBLE_RKJV;
    const savedK = globalThis.BIBLE_KJV;
    // titus, not john: _verseIndex caches by translation:book:chapter and the
    // fixtures at the top of this file already warmed rkjv:john:3.
    globalThis.BIBLE_RKJV = { titus: { '1': [{ n: 2, text: '' }] } };
    globalThis.BIBLE_KJV = { titus: { '1': [{ n: 2, text: 'kjv titus 1:2' }] } };
    try {
      expect(translateVerse('titus', 1, { n: 2, text: 'nkjv-t2' }, 'rkjv')).toBe('kjv titus 1:2');
    } finally { globalThis.BIBLE_RKJV = savedR; globalThis.BIBLE_KJV = savedK; }
  });

  it('a blank BASE verse falls all the way through to the NKJV', () => {
    const savedR = globalThis.BIBLE_RKJV;
    const savedK = globalThis.BIBLE_KJV;
    globalThis.BIBLE_RKJV = { titus: { '2': [{ n: 11, text: '' }] } };
    globalThis.BIBLE_KJV = { titus: { '2': [{ n: 11, text: '  ' }] } };
    try {
      expect(translateVerse('titus', 2, { n: 11, text: 'nkjv-t11' }, 'rkjv')).toBe('nkjv-t11');
    } finally { globalThis.BIBLE_RKJV = savedR; globalThis.BIBLE_KJV = savedK; }
  });

  it('chain lookups alternating overlay/base per verse stay consistent (LRU cache)', () => {
    for (let i = 0; i < 3; i++) {
      expect(translateVerse('john', 3, { n: 16, text: 'x' }, 'rkjv')).toBe('restored kjv 16');
      expect(translateVerse('john', 3, { n: 17, text: 'x' }, 'rkjv')).toBe('For God sent not his Son');
    }
  });
});
