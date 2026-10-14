/* sweep W24 (2026-10-13): the search tables were plain objects, so a word that names one of
   Object.prototype's own keys read the prototype's function as its entry. "constructors" failed the
   search ("Spread syntax..."), "constructor faith" crashed the results into the error panel,
   "constructor" alone was a command that returned nothing, "constructor 3" a card labelled with
   function source, and a text saying the word could not be indexed ("key must be a string").
   Every table is read as a table of its own keys now. Read against the app's own tables. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { wordForms } from './word-forms.js';
import { kjvEncode, expandArchaicTerms } from './tokenize.js';
import { expandQueryTerms } from './synonyms.js';
import { snippet, morePlaces, findPlaces, matchExcerpt } from './snippet.js';
import { parseReference } from './ref-parser.js';
import { lemma } from './passage.js';
import { VotSearchMini } from './engine.js';

const GLOBALS = {
  BOOKS: {
    genesis: { id: 'genesis', title: 'Genesis', chapters: [{ num: 1, sections: [{ heading: '', verses: [{ n: 1, text: 'In the beginning God created the heavens and the earth.' }] }] }] },
  },
  LETTERS_V1: [
    { id: 'builder', num: 1, title: 'The Builder', blocks: [{ segments: [{ v: 'The constructor of the temple built it by faith, and the Lord is the builder of all things.' }] }] },
  ],
};

let prev;
beforeAll(async () => {
  prev = window.VotSearchData;
  // @ts-ignore -- a classic script: it sets window.VotSearchData
  await import('../../search-data.js');
  for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
  await VotSearchMini.init();
});
afterAll(() => {
  window.VotSearchData = prev;
  for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
});

describe('a word that names a prototype key is a word', () => {
  it('the tables give it nothing of their own', () => {
    expect(() => wordForms('constructors')).not.toThrow();
    expect(wordForms('constructors')).toContain('constructor');
    expect(kjvEncode('the constructor')).toEqual(['the', 'constructor']);
    expect(expandArchaicTerms(['constructor'])).toEqual(['constructor']);
    expect(lemma('constructor')).toBe('constructor');
    expect(expandQueryTerms(['constructor']).units.map((u) => u.term)).not.toContain('undefined');
  });
  it('the snippet, the places and the landing read it', () => {
    const t = 'The constructor of the temple built it by faith.';
    expect(snippet(t, ['constructor', 'temple'])).toContain('constructor');
    expect(() => morePlaces(t, ['constructor', 'faith'])).not.toThrow();
    expect(findPlaces(t, ['constructor'])).toHaveLength(1);
    expect(matchExcerpt(t, ['constructor'])).toMatch(/^constructor/);
  });
  it('it is neither a command nor a book', () => {
    expect(/** @type {any} */ (parseReference('constructor', { corpus: 'all' }) || {}).kind).not.toBe('command');
    const three = /** @type {any} */ (parseReference('constructor 3', { corpus: 'all' }) || {});
    expect(three.kind).not.toBe('ref-bible');
  });
  it('a text that says it is indexed, and the search finds it, alone or with another word', async () => {
    for (const q of ['constructor', 'constructors', 'constructor faith']) {
      const r = await VotSearchMini.search(q);
      expect(r.results.map((x) => /** @type {any} */ (x).doc.letterId)).toContain('builder');
    }
  });
});
