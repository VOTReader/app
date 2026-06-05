// @ts-nocheck — loads classic-script globals via eval; constructs fixture literals
/* AUDIT-PLAN SR8/T1 — the FlexSearch engine (app/src/main/assets/search.js,
   ~1,700 lines) had ZERO tests, and it sits OUTSIDE eslint/tsc/coverage scope
   (it's a classic script concatenated into bundle-a, not an ES module), so the
   runtime was its only check. This suite loads the REAL engine — the vendored
   flexsearch.min.js + search-data.js + search.js — over a tiny in-memory Bible
   fixture and pins the query behaviors SR1/SR2 fixed:

     SR1  the 'heading' field was dropped from the index (U22) but still searched,
          so every query threw (caught + warn-logged). A query must now run with
          NO '[VotSearch] field search failed' warning.
     SR2  the per-field search defaulted to strict-AND, so a multi-word query whose
          terms span different (short) verses returned ZERO. suggest:true must now
          return the matching verses, full-coverage first.

   Headless trick: loadAllTranslations() injects <script src> per alt-translation
   and awaits onload — which never fires in jsdom (hang). loadOneTranslation()
   short-circuits when window['BIBLE_<CODE>'] already exists, so we pre-seed those
   globals (empty) and the scriptures build proceeds with NKJV only. */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import 'fake-indexeddb/auto';

const assetsDir = 'app/src/main/assets';
const read = (rel) => fs.readFileSync(path.join(assetsDir, rel), 'utf8');

let VotSearch;

beforeAll(async () => {
  // Silence the engine's diagnostic console.log/info chatter ("[VotSearch]
  // ensureIndex…", "cache HIT/MISS"). Those fire from async index builds and,
  // in the parallel worker pool, can still be flushing at teardown — vitest
  // then reports an "onUserConsoleLog was pending" unhandled rejection that
  // FLAKILY exits non-zero (reddening the gate). A sync no-op mock leaves no
  // pending console RPC. warn/error are left intact (SR1 spies on warn; the
  // engine's missing-dependency guards use error).
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});

  // Pre-seed alt-translation globals → loadAllTranslations short-circuits (no
  // <script> injection → no jsdom hang). Empty roots = NKJV-only index.
  ['KJV', 'ASV', 'WEB', 'BSB', 'HNV', 'LSV', 'YLT'].forEach((c) => { globalThis['BIBLE_' + c] = {}; });

  // Tiny Bible fixture — buildDocs(scriptures) reads the bare `BOOKS` global.
  globalThis.BOOKS = {
    genesis: {
      id: 'genesis', title: 'Genesis', chapters: [
        { num: 1, sections: [{ heading: '', verses: [
          { n: 1, text: 'In the beginning God created the heavens and the earth.' },
          { n: 2, text: 'The earth was without form, and void; and darkness was on the face of the deep.' },
          { n: 3, text: 'Then God said, Let there be light; and there was light.' },
        ] }] },
      ],
    },
    john: {
      id: 'john', title: 'John', chapters: [
        { num: 3, sections: [{ heading: '', verses: [
          { n: 16, text: 'For God so loved the world that He gave His only begotten Son.' },
          { n: 17, text: 'He was moved with compassion, and the shepherd sought the lost.' },
        ] }] },
      ],
    },
  };

  // Load the dependencies via indirect eval (vendored flexsearch.min.js +
  // generated search-data.js — both classic scripts that set window globals;
  // they must run BEFORE search.js reads window.FlexSearch/VotSearchData).
  // eslint-disable-next-line no-eval
  const geval = eval;
  geval(read('flexsearch.min.js'));
  if (!window.FlexSearch && globalThis.FlexSearch) window.FlexSearch = globalThis.FlexSearch;
  geval(read('search-data.js'));
  // The engine itself loads via dynamic import (NOT eval) so v8 coverage
  // instruments it — eval'd source is invisible to the coverage provider.
  // search.js is a side-effect-only IIFE (no exports); importing it runs the
  // IIFE, which reads the globals seeded just above and attaches window.VotSearch.
  await import('../../search.js');

  VotSearch = window.VotSearch;
  if (!VotSearch) throw new Error('VotSearch failed to initialize (FlexSearch=' + typeof window.FlexSearch + ', VotSearchData=' + typeof window.VotSearchData + ')');
  await VotSearch.init({ corpora: ['scriptures'] });
});

afterAll(() => { vi.restoreAllMocks(); });

// search() is async and returns { parsed, results: [{ score, doc }] }.
const refs = async (query) => {
  const r = await VotSearch.search(query);
  return ((r && r.results) || []).map((m) => (m.doc && m.doc.ref) || '');
};

describe('search engine — SR1 (no dead heading-field throw)', () => {
  it('runs a query with NO "field search failed" warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await VotSearch.search('light');
      const fieldFails = warn.mock.calls.filter((args) => String(args[0]).includes('field search failed'));
      expect(fieldFails).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('returns the verse containing the single query word', async () => {
    expect((await refs('light')).some((ref) => /Genesis 1:3/.test(ref))).toBe(true);
  });
});

describe('search engine — SR2 (multi-word no longer strict-AND)', () => {
  it('returns results for terms that span different verses (was ZERO under strict-AND)', async () => {
    // "beginning"(v1) "void"(v2) "light"(v3) never co-occur in one verse.
    expect((await refs('beginning void light')).length).toBeGreaterThan(0);
  });

  it('still finds a verse by a distinctive single word', async () => {
    expect((await refs('loved')).some((ref) => /John 3:16/.test(ref))).toBe(true);
  });
});

describe('search engine — SR4 (opt-in synonym expansion)', () => {
  // John 3:17 in the fixture contains "compassion"/"shepherd" but NOT "mercy".
  it('with synonyms ON, "mercy" finds the verse that only contains "compassion"', async () => {
    const r = await VotSearch.search('mercy', { synonyms: true });
    const found = ((r && r.results) || []).map((m) => (m.doc && m.doc.ref) || '');
    expect(found.some((ref) => /John 3:17/.test(ref))).toBe(true);
  });

  it('with synonyms OFF, "mercy" finds nothing (no verse has the literal word)', async () => {
    const r = await VotSearch.search('mercy', { synonyms: false });
    expect(((r && r.results) || []).length).toBe(0);
  });
});

describe('search engine — parser sanity', () => {
  it('parse() returns a structured result for a book:chapter:verse reference', () => {
    const p = VotSearch.parse('genesis 1:1');
    expect(p).toBeTruthy();
    expect(typeof p).toBe('object');
  });

  it('an empty query returns no results without throwing', async () => {
    const r = await VotSearch.search('   ');
    expect((r && r.results) || []).toEqual([]);
  });
});

describe('search engine — G2: folding, coverage, direct-ref, punctuation', () => {
  it('SRCH-4: an accented query folds (NFD) to match unaccented text', async () => {
    // "begínning" (precomposed í) must fold to "beginning" on both the query
    // AND index side and still hit Genesis 1:1.
    expect((await refs('begínning')).some((ref) => /Genesis 1:1/.test(ref))).toBe(true);
    expect((await refs('créated')).some((ref) => /Genesis 1:1/.test(ref))).toBe(true);
  });

  it('SRCH-2: a full-coverage verse outranks a partial-coverage one', async () => {
    // "God created" — both terms in Genesis 1:1; only "God" in Genesis 1:3.
    const r = await refs('God created');
    expect(r[0]).toMatch(/Genesis 1:1/);
    const v1 = r.findIndex((ref) => /Genesis 1:1/.test(ref));
    const v3 = r.findIndex((ref) => /Genesis 1:3/.test(ref));
    if (v3 > -1) expect(v1).toBeLessThan(v3);    // full coverage ranks above partial
  });

  it('a book chapter:verse query parses to a reference, a plain word to text', async () => {
    const r = await VotSearch.search('genesis 1:1');
    expect(r.parsed.kind).not.toBe('text');   // recognized as a ref → UI direct-nav short-circuit
    const r2 = await VotSearch.search('light');
    expect(r2.parsed.kind).toBe('text');       // a plain word is a text query
    expect(r2.parsed.terms).toContain('light');
  });

  it('matches a word adjacent to punctuation (tokenizer strips it)', async () => {
    // Genesis 1:2 has "form, and void;" — "void" (followed by ';') must match.
    expect((await refs('void')).some((ref) => /Genesis 1:2/.test(ref))).toBe(true);
  });

  it('a punctuation-only query returns nothing without throwing', async () => {
    const r = await VotSearch.search('!!! ;;; ...');
    expect((r && r.results) || []).toEqual([]);
  });
});

/* ── Public-API surface (pure helpers) ─────────────────────────────────────
   These methods are exposed on window.VotSearch and depend only on the loaded
   VotSearchData tables (or are fully pure), so they need no engine build. They
   were the engine's largest untested block; pinning them brings search.js into
   real coverage instead of leaving the ranking-path-only slice measured. */
describe('search engine — levenshtein (bounded edit distance)', () => {
  it('returns 0 for identical strings and the length for an empty operand', () => {
    expect(VotSearch.levenshtein('grace', 'grace')).toBe(0);
    expect(VotSearch.levenshtein('', 'abc')).toBe(3);
    expect(VotSearch.levenshtein('abc', '')).toBe(3);
  });
  it('counts single edits', () => {
    expect(VotSearch.levenshtein('kitten', 'sitten', 3)).toBe(1);     // substitution
    expect(VotSearch.levenshtein('cat', 'cart', 3)).toBe(1);          // insertion
  });
  it('short-circuits past the cap (length gap and row-min both bail to cap+1)', () => {
    expect(VotSearch.levenshtein('a', 'abcdef', 2)).toBe(3);          // |len diff| > cap
    expect(VotSearch.levenshtein('abcde', 'vwxyz', 2)).toBe(3);       // every row exceeds cap
  });
});

describe('search engine — fuzzyBookSuggest', () => {
  it('maps an exact abbrev to its book id', () => {
    expect(VotSearch.fuzzyBookSuggest('genesis')).toBe('genesis');
  });
  it('tolerates a one-edit typo', () => {
    expect(VotSearch.fuzzyBookSuggest('genessis')).toBe('genesis');  // one extra letter
  });
  it('returns null for too-short or too-far input', () => {
    expect(VotSearch.fuzzyBookSuggest('g')).toBe(null);              // < 2 chars
    expect(VotSearch.fuzzyBookSuggest('zzzzzzzz')).toBe(null);       // beyond the cap
  });
});

describe('search engine — parse (reference grammar)', () => {
  it('parses a compact volume+letter ref (V2L5)', () => {
    const p = VotSearch.parse('V2L5');
    expect(p).toBeTruthy();
    expect(p.kind).toBe('ref-letter');
    expect(p.letterNum).toBe(5);
  });
  it('parses the dot and slash volume forms', () => {
    expect(VotSearch.parse('V2.5').kind).toBe('ref-letter');
    expect(VotSearch.parse('1/5 vol').kind).toBe('ref-letter');
  });
  it('parses a WTLB section ref', () => {
    const p = VotSearch.parse('WTLB 1:45');
    expect(p).toBeTruthy();
    expect(p.kind).toBe('ref-letter');
    expect(p.letterNum).toBe(45);
  });
  it('parses a shorthand collection ref (LfT preface + numbered)', () => {
    expect(VotSearch.parse('LfT 5').kind).toBe('ref-letter');
  });
  it('classifies a plain word as a text query and an empty string as null', () => {
    expect(VotSearch.parse('mercy').kind).toBe('text');
    expect(VotSearch.parse('   ')).toBe(null);
  });
});

describe('search engine — snippet', () => {
  it('returns the whole short text untouched when no term is given', () => {
    expect(VotSearch.snippet('a short verse', [])).toBe('a short verse');
  });
  it('truncates a long no-term text with an ellipsis', () => {
    const long = 'x'.repeat(300);
    const out = VotSearch.snippet(long, []);
    expect(out.length).toBeLessThanOrEqual(181);   // 180 + the ellipsis
    expect(out.endsWith('…')).toBe(true);
  });
  it('centers the window on the matched term (leading ellipsis when clipped)', () => {
    const text = 'In the beginning God created the heavens and the earth, and the light shone.';
    const out = VotSearch.snippet(text, ['light'], 30);
    expect(out).toMatch(/light/);
    expect(out).toMatch(/…/);
  });
  it('falls back to the head when the term is absent', () => {
    expect(VotSearch.snippet('alpha beta gamma', ['omega'])).toBe('alpha beta gamma');
    expect(VotSearch.snippet('', ['x'])).toBe('');
  });
});

describe('search engine — highlightSpans', () => {
  it('returns a single non-hit span for empty text or no terms', () => {
    expect(VotSearch.highlightSpans('', ['x'])).toEqual([{ text: '', hit: false }]);
    expect(VotSearch.highlightSpans('hello', [])).toEqual([{ text: 'hello', hit: false }]);
  });
  it('splits text into hit / non-hit spans around the matched term', () => {
    const spans = VotSearch.highlightSpans('the light of the world', ['light']);
    const hit = spans.find((s) => s.hit);
    expect(hit).toBeTruthy();
    expect(hit.text.toLowerCase()).toBe('light');
    expect(spans.map((s) => s.text).join('')).toBe('the light of the world');  // lossless
  });
  it('escapes regex-special characters in a term (no throw, no match)', () => {
    const spans = VotSearch.highlightSpans('cost is $5 (approx)', ['(approx)']);
    expect(spans.some((s) => s.hit && s.text === '(approx)')).toBe(true);
  });
});

describe('search engine — suggest (autocomplete)', () => {
  it('returns nothing for an empty query', () => {
    expect(VotSearch.suggest('')).toEqual([]);
  });
  it('suggests a book by name prefix', () => {
    const out = VotSearch.suggest('gen');
    expect(out.some((s) => s.kind === 'book' && /genesis/i.test(s.label))).toBe(true);
  });
  it('honors the max cap', () => {
    const out = VotSearch.suggest('a', { max: 3 });
    expect(out.length).toBeLessThanOrEqual(3);
  });
});

describe('search engine — getState / getStats shape', () => {
  it('getState reports the scriptures engine ready after init', () => {
    const st = VotSearch.getState();
    expect(st.scriptures.ready).toBe(true);
    expect(st.scriptures.docCount).toBeGreaterThan(0);
    expect(typeof st.ready).toBe('boolean');
  });
  it('getStats returns a per-engine object carrying the active translation', () => {
    const stats = VotSearch.getStats();
    expect(stats).toHaveProperty('scriptures');
    expect(stats).toHaveProperty('volumes');
    expect(stats.scriptures.translation).toBe('nkjv');
  });
});

/* ── Volumes corpus (the SECOND engine) ────────────────────────────────────
   The existing suite inits scriptures only, so the entire volumes doc-builder
   (Matthew Study Bible + letter collections + WTLB/Blessed/Holy-Days paragraph
   entries) was 0%. Seed a minimal but real-shaped fixture for each shape, read
   the collection's window-global NAME from the loaded registry (never hardcode),
   then build the volumes index and prove each shape is searchable. */
describe('search engine — volumes corpus doc-building', () => {
  beforeAll(async () => {
    const D = window.VotSearchData;
    // One real letter collection, seeded under its declared dataVar/prefaceVar
    // (read from the registry) — exercises collectLetters (preface concat),
    // pushLetterCollection, letterText (segment blocks AND poetry lines), footnotes.
    const vc0 = D.VOLUME_COLLECTIONS[0];
    if (vc0.prefaceVar) {
      globalThis[vc0.prefaceVar] = { id: 'preface', num: 0, title: 'A Word of Warning',
        blocks: [{ segments: [{ v: 'A solemn preface' }] }] };
    }
    globalThis[vc0.dataVar] = [{
      id: 'test-letter', num: 1, title: 'A Test Letter',
      blocks: [
        { segments: [{ v: 'Hear the word' }, { v: 'of the Lord' }] },
        { lines: [[{ v: 'a poetic line of judgment' }], [{ v: 'and another stanza' }]] },
      ],
      nkjv: { 'Isaiah 1:1': 'The vision of Isaiah the son of Amoz.' },
    }];
    // Matthew Study Bible — the isVolumes MATTHEW block (verse + study-note + cross-ref).
    globalThis.MATTHEW = {
      chapters: [{
        num: 1, title: 'The Genealogy',
        sections: [{ heading: 'Heading One', verses: [{ n: 1, text: 'The book of the genealogy of the Messiah.' }] }],
        votNotes: [{ excerpt: 'a curated study note', letter: 'Some Letter', vol: 'Volume One', ref: '1:1' }],
        scriptures: [{ cite: 'compare Luke 3', ref: '1:1' }],
      }],
    };
    // WTLB Part One — pushEntryCollection (paragraph entries → title + body docs).
    globalThis.WTLB_ONE = [{ id: 'w1', num: 1, title: 'Live By Every Word',
      paragraphs: [{ text: 'Man shall not live by bread alone.' }] }];
    // rebuild() (not init) — the volumes engine was already built EMPTY in-memory
    // by the earlier corpus:'all' searches, and ensureIndex short-circuits on a
    // ready in-memory slot. rebuild dropActive()s both slots + clears the cache,
    // forcing a fresh build that reads the fixtures seeded just above.
    await VotSearch.rebuild();
  });

  const volRefs = async (q) => {
    const r = await VotSearch.search(q, { corpus: 'volumes' });
    return ((r && r.results) || []).map((m) => (m.doc && m.doc.ref) || '');
  };

  it('indexes letter prose (a word from the body is findable)', async () => {
    expect((await volRefs('judgment')).length).toBeGreaterThan(0);
  });
  it('indexes the Matthew Study Bible verses', async () => {
    expect((await volRefs('genealogy')).length).toBeGreaterThan(0);
  });
  it('indexes WTLB paragraph entries', async () => {
    expect((await volRefs('bread')).length).toBeGreaterThan(0);
  });
  it('getState now reports the volumes engine ready with a doc count', () => {
    const st = VotSearch.getState();
    expect(st.volumes.ready).toBe(true);
    expect(st.volumes.docCount).toBeGreaterThan(0);
  });
});
