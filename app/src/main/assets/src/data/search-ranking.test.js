// @ts-nocheck — loads classic-script globals via eval; constructs fixture literals
/* BLIND-AUDIT SRCH-1/2/3 — search RANKING over a faithful CROSS-CORPUS fixture.

   The audit proved (on the real corpus) that the default multi-word search buried
   the target verse: every volume doc carried its collection LABEL in the `ref`
   field (e.g. "A Testament Against The World: The Lord's Rebuke"), `ref` was
   indexed + boosted 2.5x, so a common query word matched — and ranked — every
   letter in a collection ahead of the actual verse.

   This suite reproduces the cross-corpus merge (Scriptures + one real Volume, the
   Lord's Rebuke) and pins the fixes:

     SRCH-1  `ref` is no longer indexed → a word that exists ONLY in the collection
             label is not searchable, and the target verse ranks #1.
     SRCH-2  the term-coverage multiplier now applies to verses, so a full-coverage
             verse outranks partial-coverage prose.
     SRCH-3  a synonym-only hit ("pastor" for a "shepherd" query) is demoted below
             the literal match, but still returned for recall.

   NON-VACUOUS: the 13 fixture letters all contain "lord" (so they DO surface), and
   under the OLD ref-indexing they would bury the single verse — so re-indexing
   `ref` makes test #1 fail.

   Headless trick (mirrors search-engine.test.js): pre-seed empty BIBLE_<CODE>
   globals so loadAllTranslations short-circuits (no <script> injection → no jsdom
   hang); the scriptures build proceeds NKJV-only. */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import 'fake-indexeddb/auto';

const assetsDir = 'app/src/main/assets';
const read = (rel) => fs.readFileSync(path.join(assetsDir, rel), 'utf8');

let VotSearch;
const rebukeLabel = "A Testament Against The World: The Lord's Rebuke";

beforeAll(async () => {
  ['KJV', 'ASV', 'WEB', 'BSB', 'HNV', 'LSV', 'YLT'].forEach((c) => { globalThis['BIBLE_' + c] = {}; });

  // ── Scriptures fixture: the target verse contains BOTH "lord" and "shepherd".
  globalThis.BOOKS = {
    psalms: {
      id: 'psalms', title: 'Psalms', chapters: [
        { num: 23, sections: [{ heading: '', verses: [
          { n: 1, text: 'The LORD is my shepherd; I shall not want.' },
          { n: 2, text: 'He makes me to lie down in green pastures; He leads me beside the still waters.' },
        ] }] },
      ],
    },
  };

  // ── Volumes fixture: the REAL "rebuke" collection (dataVar LETTERS_REBUKE). Its
  // label carries "against"/"testament"/"world"/"lord"/"rebuke". The letter BODIES
  // contain "lord"/"world" (so they surface) but NEVER "shepherd"/"against".
  const letters = [];
  for (let i = 1; i <= 12; i++) {
    letters.push({
      id: 'rk' + i, num: i, title: 'The Coming Wrath ' + i,
      blocks: [{ type: 'para', segments: [
        { t: 'text', v: 'Behold, the Lord will judge the whole world for its pride and rebellion.' },
      ] }],
    });
  }
  // One letter whose body contains the SYNONYM "pastor" (not "shepherd").
  letters.push({
    id: 'rkpastor', num: 13, title: 'Concerning The Flock',
    blocks: [{ type: 'para', segments: [
      { t: 'text', v: 'A faithful pastor tends the people of the Lord with patience.' },
    ] }],
  });
  globalThis.LETTERS_REBUKE = letters;

  // eslint-disable-next-line no-eval
  const geval = eval;
  geval(read('flexsearch.min.js'));
  if (!window.FlexSearch && globalThis.FlexSearch) window.FlexSearch = globalThis.FlexSearch;
  geval(read('search-data.js'));
  geval(read('search.js'));

  VotSearch = window.VotSearch;
  if (!VotSearch) throw new Error('VotSearch failed to initialize');
  await VotSearch.init({ corpora: ['scriptures', 'volumes'] });
});

const run = async (query, opts) => {
  const r = await VotSearch.search(query, Object.assign({ corpus: 'all', limit: 400 }, opts || {}));
  return (r && r.results) || [];
};
const isLetter = (d) => d && (d.kind === 'letter' || d.kind === 'letter-title');

describe('search ranking — SRCH-1 (ref de-indexed, verse wins)', () => {
  it('the target verse is the #1 result for its own multi-word text', async () => {
    const results = await run('the lord is my shepherd', { synonyms: false });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].doc.kind).toBe('verse');
    expect(results[0].doc.ref).toMatch(/Psalms 23:1/);
  });

  it('the verse outranks every collection-label letter that also matches "lord"', async () => {
    const results = await run('the lord is my shepherd', { synonyms: false });
    const verseIdx = results.findIndex((m) => m.doc.kind === 'verse' && /Psalms 23:1/.test(m.doc.ref));
    const firstLetterIdx = results.findIndex((m) => isLetter(m.doc));
    expect(verseIdx).toBe(0);
    // letters DO surface (they contain "lord"), proving the test is non-vacuous…
    expect(firstLetterIdx).toBeGreaterThan(-1);
    // …but every one of them ranks below the verse.
    expect(verseIdx).toBeLessThan(firstLetterIdx);
  });

  it('a word that exists ONLY in the collection label is no longer searchable', async () => {
    // "against" appears only in rebukeLabel (ref/heading), never in any body/title/verse.
    expect(rebukeLabel.toLowerCase()).toContain('against');
    const results = await run('against', { synonyms: false });
    const labelHits = results.filter((m) => isLetter(m.doc));
    expect(labelHits).toEqual([]);
  });
});

describe('search ranking — SRCH-3 (synonym-only hits demoted, still returned)', () => {
  it('a literal "shepherd" verse outranks a synonym-only "pastor" letter', async () => {
    const results = await run('shepherd', { synonyms: true });
    const verseIdx = results.findIndex((m) => m.doc.kind === 'verse');
    const pastorIdx = results.findIndex((m) => m.doc.letterId === 'rkpastor');
    expect(verseIdx).toBeGreaterThan(-1);
    expect(pastorIdx).toBeGreaterThan(-1);     // recall preserved: still present
    expect(verseIdx).toBeLessThan(pastorIdx);  // …but ranked below the literal match
  });

  it('with synonyms OFF, the synonym-only "pastor" letter is not returned', async () => {
    const results = await run('shepherd', { synonyms: false });
    expect(results.some((m) => m.doc.letterId === 'rkpastor')).toBe(false);
  });
});
