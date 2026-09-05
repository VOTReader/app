/* RED — search-3: the search index is built from the text it is STAMPED with.
   ─────────────────────────────────────────────────────────────────────────
   index-builder.js:211 reads the alternate translation off a classic-script
   global:

     const altData = (translation !== 'nkjv') ? window['BIBLE_' + translation.toUpperCase()] : null;

   Nothing on the search path ever injects that global. SearchScreen fires
   E.init({ onProgress }) with mount deps [], engine.build() goes straight to
   buildDocs({ translation: code }), and loadTranslation() — the lazy script
   loader that defines BIBLE_<CODE> — is never called. So for a reader on any
   non-NKJV translation altData is undefined, every verse falls through to the
   NKJV base v.text, and the index is then STAMPED stats.translation = code and
   persisted under dataSignature(code) ('tr:kjv'). sameTranslation() compares
   against that stamp, so nothing ever rebuilds it: NKJV text lives in the KJV
   cache slot for good.

   Two separate claims, two REDs:
     1. the translation's text must actually be loaded before the index is built;
     2. when it could NOT be loaded, the index must be stamped with the text it
        really contains — a not-known must never be written down as a value.

   translations.js already names this exact hazard for another path ("would
   render NKJV text under a foreign (CJB) cite"); the index had it unguarded. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VotSearchMini } from './engine.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his']),
  SYNONYM_MAP: {},
  BOOK_ABBREVS: { psalms: 'psalms', ps: 'psalms', psalm: 'psalms' },
  BOOK_DISPLAY: { psalms: 'Psalms' },
  NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {},
  COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {}, VOLUME_COLLECTIONS: [],
  OT_BOOK_IDS: ['psalms'], NT_BOOK_IDS: [],
  GENRE_GROUPS: { poetry: ['psalms'] },
  WORD_NUMS: {}, ROMAN_NUMS: {},
};

/** The NKJV base corpus. 'pastures' is the word only this text carries. */
const BOOKS = {
  psalms: { id: 'psalms', title: 'Psalms', chapters: [{ num: 23, sections: [{ heading: '', verses: [
    { n: 1, text: 'The LORD is my shepherd; I shall not want.' },
    { n: 2, text: 'He makes me to lie down in green pastures.' },
  ] }] }] },
};

/** What loadTranslation('kjv') would define. 'whatsoever' is KJV-only here. */
const BIBLE_KJV = {
  psalms: { 23: [
    { n: 1, text: 'The LORD is my shepherd; I shall not lack whatsoever.' },
    { n: 2, text: 'He maketh me to lie down in green meadows.' },
  ] },
};

let prevData;
/** @type {any} */ let loadSpy;

beforeEach(() => {
  prevData = window.VotSearchData;
  window.VotSearchData = VOT_DATA;
  globalThis.BOOKS = BOOKS;
  delete globalThis.BIBLE_KJV;
});

afterEach(() => {
  window.VotSearchData = prevData;
  delete globalThis.BOOKS;
  delete globalThis.BIBLE_KJV;
  delete globalThis.loadTranslation;
});

/** A loader that behaves like the real one: resolves either way, and defines
    the global only when the script would really have shipped. */
function installLoader({ shipped }) {
  loadSpy = vi.fn(async (code) => {
    if (shipped && code === 'kjv') globalThis.BIBLE_KJV = BIBLE_KJV;
  });
  globalThis.loadTranslation = loadSpy;
}

async function textsFor(query) {
  const res = await VotSearchMini.search(query, { translation: undefined });
  return res.results.map((r) => r.doc.ref);
}

describe('search-3 — the index is built from the translation it is stamped with', () => {
  it('RED: a non-NKJV build loads that translation, so its own wording is what gets indexed', async () => {
    installLoader({ shipped: true });
    await VotSearchMini.rebuild({ translation: 'kjv' });

    expect(loadSpy).toHaveBeenCalledWith('kjv');
    expect(await textsFor('whatsoever')).toEqual(['Psalms 23:1']);  // the KJV wording is in the index
    expect(await textsFor('want')).toEqual([]);                      // the NKJV wording is not
  });

  it('CONTROL: a successful load stamps the index with the code that was asked for', async () => {
    // This one PASSES TODAY, and today it passes for the wrong reason: the build
    // stamps whatever code it was handed, loaded or not. It is here to constrain the
    // FIX, not to describe the present — same matcher as the RED below, the other
    // value, so a fix that just always stamped nkjv would fail it.
    installLoader({ shipped: true });
    await VotSearchMini.rebuild({ translation: 'kjv' });
    expect(VotSearchMini.getStats().translation).toBe('kjv');
  });

  it('RED: a translation that could NOT be loaded is stamped nkjv — the text the index really holds', async () => {
    // The real 404 / unshipped-code path: loadTranslation resolves and defines
    // nothing. Stamping 'kjv' here caches NKJV text under 'tr:kjv' and
    // sameTranslation() keeps it forever.
    installLoader({ shipped: false });
    await VotSearchMini.rebuild({ translation: 'kjv' });

    expect(globalThis.BIBLE_KJV).toBeUndefined();
    expect(await textsFor('pastures')).toEqual(['Psalms 23:2']);   // it IS the NKJV text
    expect(VotSearchMini.getStats().translation).toBe('nkjv');     // …so that is what it must say
  });

  it('CONTROL: an nkjv build asks no loader and stamps nkjv', async () => {
    // Passes before and after. Stops the fix from being "always call the loader"
    // or "always stamp nkjv".
    installLoader({ shipped: true });
    await VotSearchMini.rebuild({ translation: 'nkjv' });

    expect(loadSpy).not.toHaveBeenCalled();
    expect(VotSearchMini.getStats().translation).toBe('nkjv');
    expect(await textsFor('pastures')).toEqual(['Psalms 23:2']);
  });
});
