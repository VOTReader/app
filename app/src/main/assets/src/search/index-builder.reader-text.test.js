// @ts-nocheck
/* The search index reads a letter the way a reader does: footnote numbers are
   not words. letterText used to push every segment's `v`, so a footnote's
   number sat in the indexed body and snippet() showed it:
     "…Thus by their fruits you shall know them. 2 And was I speaking only…"  (Volume One, Letter 15)
     "…You will know them by their fruits, 1 by the darkness…"               (Little Flock #24)
   These run the REAL letters and studies through buildDocs and the real
   snippet(), so the corpus's own footnotes are the fixture. The sweeps relabel
   every footnote marker with a sentinel first: a number is no test (studies
   rightly read "John 14, 15 and 16" and "fulfilled. 10 prophecies"), while a
   sentinel in a body can only have come from a marker. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildDocs } from './index-builder.js';
import { snippet } from './snippet.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
/** Load a corpus file's globals the way the app does (classic-script vars). */
function load(file, names) {
  const ctx = { window: {} };
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8') + ';this.__o={' + names.map((n) => n + ':' + n).join(',') + '}', ctx);
  return ctx.__o;
}

const FN = 'zqfootnotezq';
/** Relabel every footnote marker under `node` with the sentinel; returns how many. */
function markFootnotes(node) {
  if (!node || typeof node !== 'object') return 0;
  let n = 0;
  if (node.t === 'fn') { node.v = FN; n++; }
  for (const k of Object.keys(node)) n += markFootnotes(node[k]);
  return n;
}

const GLOBALS = {
  ...load('volume-one.js', ['LETTERS_V1_PREFACE', 'LETTERS_V1']),
  ...load('letters-flock.js', ['LETTERS_FLOCK_PREFACE', 'LETTERS_FLOCK']),
  ...load('bible-studies.js', ['BIBLE_STUDIES']),
  ...load('wtlb-one.js', ['WTLB_ONE']),
  ...load('the-blessed.js', ['THE_BLESSED']),
  ...load('answers.js', ['ANSWERS']),
};
const MARKED = {
  letters: markFootnotes(GLOBALS.LETTERS_V1) + markFootnotes(GLOBALS.LETTERS_FLOCK),
  studies: markFootnotes(GLOBALS.BIBLE_STUDIES),
};
const VOT_DATA = {
  VOLUME_COLLECTIONS: [
    { id: 'v1', dataVar: 'LETTERS_V1', prefaceVar: 'LETTERS_V1_PREFACE', label: 'Volume One' },
    { id: 'flock', dataVar: 'LETTERS_FLOCK', prefaceVar: 'LETTERS_FLOCK_PREFACE', label: "Letters to The Lord's Little Flock" },
  ],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {},
};

describe("letter and study bodies are indexed as the reader reads them (no footnote numbers)", () => {
  let prevData;
  let docs;
  beforeAll(() => {
    prevData = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    docs = buildDocs({ translation: 'nkjv' });
  });
  afterAll(() => {
    window.VotSearchData = prevData;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
  });
  const letter = (volumeId, num) => docs.find((d) => d.kind === 'letter' && d.volumeId === volumeId && d.letterNum === num);
  const fruits = ['by', 'their', 'fruits'];
  /** Every doc of this kind whose body still carries a footnote marker. */
  const leaks = (kind) => docs.filter((d) => d.kind === kind && d.text.includes(FN)).map((d) => d.ref);

  it('Volume One, Letter 15: "by their fruits" shows no footnote number', () => {
    expect(snippet(letter('v1', 15).text, fruits))
      .toContain('Thus by their fruits you shall know them. And was I speaking only');
  });

  it("Little Flock #24: \"by their fruits\" shows no footnote number", () => {
    expect(snippet(letter('flock', 24).text, fruits))
      .toContain('You will know them by their fruits, by the darkness of their faces');
  });

  it('no letter body carries a footnote marker', () => {
    expect(MARKED.letters).toBeGreaterThan(100);
    expect(docs.filter((d) => d.kind === 'letter').length).toBeGreaterThan(50);
    expect(leaks('letter')).toEqual([]);
  });

  it('study chapters read their letter-links by label, unwrap scripture refs, and carry no footnote marker', () => {
    expect(MARKED.studies).toBeGreaterThan(50);
    const studies = docs.filter((d) => d.kind === 'bible-study');
    expect(studies.length).toBeGreaterThan(20);
    const all = studies.map((d) => d.text).join('\n');
    // A letter-link carries its words in `label` (no `v`), so it used to vanish
    // (109 of them sit in study paragraphs; prophecy groups are not indexed).
    expect(all).toContain('"Without Spot or Blemish" - Volume Four');
    expect(all).not.toContain('{{ref:');
    expect(leaks('bible-study')).toEqual([]);
  });

  /* The Format B collections carry their emphasis as markup, and the index kept
     it: "**_\"Thus says The Lord:_** From the beginning…" is what an Answers
     result's snippet showed, underscores and asterisks included. */
  it('WTLB, The Blessed and Answers bodies carry no emphasis markers', () => {
    const entries = docs.filter((d) => d.kind === 'wtlb' || d.kind === 'blessed' || d.kind === 'answers');
    expect(entries.length).toBeGreaterThan(200);
    expect(entries.filter((d) => /\*\*|_/.test(d.text)).map((d) => d.ref + ' ' + d.title)).toEqual([]);
    const all = entries.map((d) => d.text).join('\n');
    expect(all).toContain('"Thus says The Lord: From the beginning I had written to you by the pen of My prophets');
    expect(all).toContain('Blessed are those who never lost the pearl, But held it close their whole life.');
    expect(all).not.toContain('{{');
  });
});
