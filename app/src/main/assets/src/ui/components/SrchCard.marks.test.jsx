/* SrchCard: exact and related marks (search200 ideas D, 2026-10-22). The words typed keep the full mark
   (`.search-highlight`); what search matched for them (a word form, a synonym, one of His names) is marked
   `.search-related`, a dotted underline with no wash, in the snippet, the title and the "more places" list alike. */
import { it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SrchCard } from './SrchCard.jsx';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, snippetAt, highlightSpans, morePlaces } from '../../search/snippet.js';

/** @type {any} */ let prevData;
beforeAll(async () => {
  prevData = window.VotSearchData;
  // @ts-ignore -- a classic script: it sets window.VotSearchData (the synonym table: shepherd, pastor)
  await import('../../../search-data.js');
});
afterAll(() => { window.VotSearchData = prevData; });
beforeEach(() => {
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { verse: { label: 'Verse', cls: '' }, letter: { label: 'Letter', cls: '' } };
  /** @type {any} */ (globalThis).SrchSnippet = SrchSnippet;
  /** @type {any} */ (globalThis).VotSearchMini = { snippet, snippetAt, highlightSpans, morePlaces };
});
afterEach(() => { cleanup(); });

const kinds = (/** @type {Element} */ c) => [...c.querySelectorAll('mark')].map((m) => (m.classList.contains('search-related') ? '~' : '') + m.textContent);

it('D: the typed words keep the full mark; His name and a word form are marked related', () => {
  const entry = { score: 1, doc: { kind: 'verse', ref: 'John 11:35', text: 'Then YahuShua wept, and they were weeping.' }, terms: ['yahushua', 'weeping'] };
  const { container } = render(<SrchCard entry={entry} terms={['jesus', 'wept']} onSelect={() => {}} isDirect={false} />);
  expect(kinds(container)).toEqual(['~YahuShua', 'wept', '~weeping']);
  expect(container.querySelector('mark.search-related.search-highlight')).toBe(null);
});

it('D: a title and the "more places" list mark related words the same way', () => {
  const filler = 'and the people of the land went on their way, '.repeat(6);
  const text = 'YahuShua wept at the tomb. ' + filler + 'Then YahuShua wept again. ' + filler + 'And Jesus wept with them.';
  const entry = { score: 1, doc: { kind: 'letter', title: 'YahuShua Wept', ref: 'Volume One · Letter 3', text }, terms: ['yahushua'] };
  const { container, getByText } = render(<SrchCard entry={entry} terms={['jesus', 'wept']} onSelect={() => {}} isDirect={false} />);
  const head = container.querySelector('.srch-card-ref');
  expect(head && kinds(head)).toEqual(['~YahuShua', 'Wept']);
  fireEvent.click(getByText(/more place/));
  const list = container.querySelector('.srch-places');
  expect(list && kinds(list).some((k) => k === '~YahuShua')).toBe(true);
  expect(list && kinds(list).some((k) => k === 'wept' || k === 'Jesus wept')).toBe(true);
});
