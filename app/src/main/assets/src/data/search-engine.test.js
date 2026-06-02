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
