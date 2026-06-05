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

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import 'fake-indexeddb/auto';

const assetsDir = 'app/src/main/assets';
const read = (rel) => fs.readFileSync(path.join(assetsDir, rel), 'utf8');

let VotSearch;

beforeAll(async () => {
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

  // Load the real engine in order (classic scripts; indirect eval runs them in
  // global scope so their window.* attachments land on the jsdom window).
  // eslint-disable-next-line no-eval
  const geval = eval;
  geval(read('flexsearch.min.js'));
  if (!window.FlexSearch && globalThis.FlexSearch) window.FlexSearch = globalThis.FlexSearch;
  geval(read('search-data.js'));
  geval(read('search.js'));

  VotSearch = window.VotSearch;
  if (!VotSearch) throw new Error('VotSearch failed to initialize (FlexSearch=' + typeof window.FlexSearch + ', VotSearchData=' + typeof window.VotSearchData + ')');
  await VotSearch.init({ corpora: ['scriptures'] });
});

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
