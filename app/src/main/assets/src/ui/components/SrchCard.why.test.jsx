/* SrchCard: the "why this matched" line (search200 ideas E, PICKS.md E; h8 2026-11-04). A card the typed words did not
   find as typed says why it is there, in one quiet line under the snippet, read when the card renders from its own
   text and the words it marks (VotSearchMini.whyMatched): "YahuShua = Jesus", "shepherd → pastor", "KJV wording",
   "by meaning". A card the typed words found as typed shows no line, and a row that names its own reason (the
   near-meaning row's `why`) keeps it. */
import { it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SrchCard, whyLine } from './SrchCard.jsx';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, snippetAt, highlightSpans, morePlaces } from '../../search/snippet.js';
import { VotSearchMini as E } from '../../search/engine.js';

/** @type {any} */ let prevData;
/** @type {any} */ let REAL;
beforeAll(async () => {
  prevData = window.VotSearchData;
  // @ts-ignore -- a classic script: it sets window.VotSearchData (the synonym table: shepherd, pastor)
  await import('../../../search-data.js');
  REAL = window.VotSearchData;
});
afterAll(() => { window.VotSearchData = prevData; });
beforeEach(() => {
  window.VotSearchData = REAL;
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { verse: { label: 'Verse', cls: '' }, letter: { label: 'Letter', cls: '' } };
  /** @type {any} */ (globalThis).SrchSnippet = SrchSnippet;
  /** @type {any} */ (globalThis).VotSearchMini = { snippet, snippetAt, highlightSpans, morePlaces, whyMatched: E.whyMatched };
});
afterEach(() => { cleanup(); });

const why = (/** @type {Element} */ c) => { const w = c.querySelector('.srch-card-why'); return w ? w.textContent : null; };
/** @param {any} entry @param {string[]} terms @param {any} [props] */
const line = (entry, terms, props = {}) => {
  const { container } = render(<SrchCard entry={entry} terms={terms} onSelect={() => {}} isDirect={false} {...props} />);
  const t = why(container);
  cleanup();
  return t;
};
const verse = (/** @type {string} */ ref, /** @type {string} */ text, /** @type {any} */ more = {}) => ({ score: 1, doc: { kind: 'verse', ref, text }, terms: [], ...more });

it('E: a card found by one of His names says so, in the text\'s own spelling', () => {
  expect(line(verse('John 11:35', 'Then YahuShua wept.', { terms: ['yahushua'] }), ['jesus', 'wept'])).toBe('YahuShua = Jesus');
});

it('E: a word swapped, the KJV wording and the meaning each have their line', () => {
  expect(line(verse('Jeremiah 3:15', 'And I will give you pastors according to My heart'), ['shepherd', 'pastor'])).toBe('shepherd → pastor');
  expect(line(verse('Ezekiel 34:2', 'Woe to those who feed themselves', { kjvWording: true }), ['shepherds', 'feed'])).toBe('KJV wording');
  expect(line(verse('Isaiah 40:11', 'He will feed His flock', { byMeaning: true }), ['shepherd', 'flock'])).toBe('by meaning');
});

it('E: a card the typed words found as typed shows no line, whatever brought it in', () => {
  expect(line(verse('John 11:35', 'Jesus wept.', { byMeaning: true, kjvWording: true }), ['jesus', 'wept'])).toBe(null);
  // a card holding some of the words that nothing else explains shows none either
  expect(line(verse('Isaiah 40:11', 'He will feed His flock'), ['shepherd', 'flock'])).toBe(null);
});

it('E: a row that names its own reason keeps it (the near-meaning row)', () => {
  expect(line(verse('Isaiah 40:11', 'He will feed His flock'), [], { why: 'by meaning' })).toBe('by meaning');
});

it('E: with no reader for it (an older engine), no line', () => {
  /** @type {any} */ (globalThis).VotSearchMini = { snippet, snippetAt, highlightSpans, morePlaces };
  expect(line(verse('John 11:35', 'Then YahuShua wept.', { terms: ['yahushua'] }), ['jesus', 'wept'])).toBe(null);
});

it('whyLine: the words of each reason', () => {
  expect(whyLine({ kind: 'name', from: 'jesus', to: 'YahuShua' })).toBe('YahuShua = Jesus');
  expect(whyLine({ kind: 'swap', from: 'Shepherd', to: 'Pastor' })).toBe('shepherd → pastor');
  expect(whyLine({ kind: 'kjv' })).toBe('KJV wording');
  expect(whyLine({ kind: 'meaning' })).toBe('by meaning');
  expect(whyLine(null)).toBe('');
  expect(whyLine({ kind: 'swap', from: 'shepherd' })).toBe('');
  expect(whyLine({ kind: 'something-else', from: 'a', to: 'b' })).toBe('');
});
