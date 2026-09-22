// @ts-nocheck — reads the window['BIBLE_<CODE>'] alt-translation globals
/* translateVerse — resolves a verse to its alt-translation text (NKJV fallback). Pins
   PERF-3: the single-entry { n -> text } index must give the SAME results as the old
   linear scan AND rebuild on a chapter/translation change (no stale cross-chapter leak). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateVerse, releaseTranslationsExcept, _translationLoaded, _translationPromises } from './translations.js';

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
  it('a cached index answers only for the data it was built from (a replaced global is re-read)', () => {
    // Keyed by translation:book:chapter alone, the index handed a NEW edition object
    // the previous one's text. releaseTranslationsExcept purges by prefix, but any
    // other replacement (and every test here that installs its own BIBLE_KJV) got
    // the stale answer: the flake hunt caught 6 tests in this file reading another
    // test's fixture, --sequence.shuffle --sequence.seed=888.
    expect(translateVerse('john', 3, { n: 16, text: 'x' }, 'kjv')).toBe('For God so loued the world');
    globalThis.BIBLE_KJV = { john: { 3: [{ n: 16, text: 'a second load' }] } };
    expect(translateVerse('john', 3, { n: 16, text: 'x' }, 'kjv')).toBe('a second load');
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

/* boot-performance-4 — nothing has ever released a loaded translation.
   ----------------------------------------------------------------------
   Each shipped bible-<code>.js sets a ~32 MB window['BIBLE_<CODE>'] global, and
   a reader who tries several editions in one session keeps every one of them for
   the life of the page. `_translationPromises` is a code -> Promise map that is
   never cleared, `_translationLoaded` a code -> true map likewise, and the data
   itself hangs off window.

   THE THREE THINGS AN EVICTION MUST NOT TAKE, and only the first is obvious:

     1. the reader's SELECTION                       translations.js translateVerse
     2. its registry BASE                            _baseOf: KJV-R falls back to KJV,
                                                     so evicting KJV while KJV-R is
                                                     selected reads undefined and every
                                                     overlay miss silently becomes NKJV
     3. the per-verse index cache                    _xlateCache is keyed by translation
                                                     and holds the extracted strings; drop
                                                     the global and leave those and the
                                                     eviction frees a reference, not memory

   The fourth reader, scripture-resolution.js's inline tag, needs no pin: it already
   handles an absent global by firing loadTranslation and rendering NKJV once.

   And the fifth, the search index, is NOT pinned here either — deliberately, with a
   derivation rather than a hope. buildDocs is fully synchronous (no async, await,
   yield or timer anywhere in index-builder.js) and reads the global exactly once at
   :211, so no eviction can interleave with a running build. The window that DOES
   exist is between engine.js's `await loadCached(sig)` and that call, and what makes
   it dangerous is not the eviction but dataSignature carrying nothing about whether
   the data was there. That is closed in cache.js, where it is one component, and it
   fixes a hole that predates this branch. */
describe('releaseTranslationsExcept (boot-performance-4)', () => {
  const G = /** @type {any} */ (globalThis);
  beforeEach(() => {
    G.TRANSLATION_OPTIONS = [
      { id: 'nkjv', label: 'NKJV', desc: 'x' },
      { id: 'kjv', label: 'KJV', desc: 'x' },
      { id: 'rkjv', label: 'KJV-R', desc: 'x', base: 'kjv' },
      { id: 'web', label: 'WEB', desc: 'x' },
      { id: 'asv', label: 'ASV', desc: 'x' },
    ];
    for (const c of ['kjv', 'rkjv', 'web', 'asv']) {
      G['BIBLE_' + c.toUpperCase()] = { john: { 3: [{ n: 16, text: c + ' 16' }] } };
      _translationLoaded[c] = true;
      _translationPromises[c] = Promise.resolve();
    }
  });
  afterEach(() => {
    for (const c of ['kjv', 'rkjv', 'web', 'asv']) {
      delete G['BIBLE_' + c.toUpperCase()];
      delete _translationLoaded[c];
      delete _translationPromises[c];
    }
    delete G.TRANSLATION_OPTIONS;
  });

  const loaded = () => ['kjv', 'rkjv', 'web', 'asv'].filter((c) => G['BIBLE_' + c.toUpperCase()]);

  it('PRECONDITION: all four editions are loaded before any eviction', () => {
    /* If the fixture ever stopped loading them, every case below would be about
       an eviction with nothing to evict, and all of them would pass. */
    expect(loaded()).toEqual(['kjv', 'rkjv', 'web', 'asv']);
  });

  it('THE POINT: the editions the reader is not using are freed', () => {
    releaseTranslationsExcept('web');
    expect(loaded()).toEqual(['web']);
  });

  it('the SELECTION survives', () => {
    releaseTranslationsExcept('asv');
    expect(G.BIBLE_ASV).toBeTruthy();
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'asv')).toBe('asv 16');
  });

  it('the selection\'s registry BASE survives, and the overlay chain still resolves', () => {
    /* KJV-R is a sparse overlay whose misses fall through to KJV. Evicting KJV
       while KJV-R is selected does not fail loudly - every miss just renders NKJV,
       which is a wrong verse rather than a missing one. */
    releaseTranslationsExcept('rkjv');
    expect(loaded().sort()).toEqual(['kjv', 'rkjv']);
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'rkjv')).toBe('rkjv 16');
    expect(translateVerse('john', 3, { n: 99, text: 'nkjv99' }, 'rkjv')).toBe('nkjv99');
  });

  it('switching all the way back to NKJV frees everything', () => {
    /* The effect that owns this returns early on nkjv today, so the one switch
       that could free the most frees nothing. */
    releaseTranslationsExcept('nkjv');
    expect(loaded()).toEqual([]);
  });

  it('the bookkeeping goes with the data, so a re-open actually re-fetches', () => {
    /* _loadTranslationScript returns the cached promise when _translationPromises
       still holds one, so an eviction that frees the global and leaves the promise
       makes the edition permanently unloadable: the promise resolves instantly and
       the global never comes back. */
    releaseTranslationsExcept('web');
    expect(_translationLoaded.asv).toBeUndefined();
    expect(_translationPromises.asv).toBeUndefined();
  });

  it('the per-verse index cache is purged, or the eviction frees a reference and not memory', () => {
    /* _xlateCache is keyed translation:book:chapter and holds the EXTRACTED verse
       strings, so it pins the parsed data after the global is gone. Read through
       the cache first to seed it, evict, then re-install the edition with DIFFERENT
       text: a stale index answers with the old string. */
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'asv')).toBe('asv 16');
    releaseTranslationsExcept('web');
    G.BIBLE_ASV = { john: { 3: [{ n: 16, text: 'asv 16 SECOND LOAD' }] } };
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'asv')).toBe('asv 16 SECOND LOAD');
  });

  it('CONTROL: an eviction with nothing to evict leaves the selection alone', () => {
    releaseTranslationsExcept('web');
    releaseTranslationsExcept('web');
    expect(loaded()).toEqual(['web']);
    expect(translateVerse('john', 3, { n: 16, text: 'nkjv16' }, 'web')).toBe('web 16');
  });
});

/* THE CALLER. The effect that decides to CALL the sweep lived in App() and nothing here could
   reach it - mounting App in jsdom is not on offer - so a text gate on app.jsx stood in for it
   (boot-performance-4). It also put app.jsx at 809/800 on check:app-size. The effect is now
   hooks/use-translation-loader.js (w-evict-hook, 2026-09-11), where use-translation-loader.test.js
   DRIVES both arms with spies on the two helpers: the nkjv arm sweeps instead of returning early,
   and the loaded arm sweeps only after the load resolves. What no behavioural case can see is the
   wiring - that App() still calls the hook with the reader's translation - so THAT is what the
   text gate witnesses now, and only that. */
describe('App() calls the translation loader (boot-performance-4 / w-evict-hook, source gate)', () => {
  const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app.jsx'), 'utf8');
  /* A comment satisfies a text matcher in both directions, so strip first - and
     the stripper gets its own control below, on this very file's hazard. */
  const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('PRECONDITION: the stripper is alive and did not eat the program', () => {
    expect(SRC).toContain('only the setter side effect matters');           // lives in a comment
    expect(stripped).not.toContain('only the setter side effect matters');
    expect(stripped).toContain('useState(0)');                                // still the program
  });

  it('the composition root hands the reader\'s translation and the tick setter to the hook', () => {
    expect(stripped).toContain('useTranslationLoader(settings.translation, setTranslationTick)');
  });

  it('the effect itself has left App() - the sweep is called from the hook, never inline', () => {
    expect(stripped).not.toContain('releaseTranslationsExcept(');
    expect(stripped).not.toContain('loadTranslation(code)');
  });
});
