/* SrchCard — per-result matched-term merge (fuzzy snippet highlight).
   ────────────────────────────────────────────────────────────────────
   MiniSearch results carry `entry.terms` — the doc-side words the fuzzy/
   prefix search actually matched (typed "sheperd" → matched "shepherd").
   The query-level term list only holds the literal typed words, so before
   this merge a typo-corrected result rendered its snippet with NO <mark>.
   SrchCard must union entry.terms into the highlight list, and must pass
   Classic results (no entry.terms) through unchanged. */

import { it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SrchCard } from './SrchCard.jsx';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, highlightSpans } from '../../search/snippet.js';

beforeEach(() => {
  // SrchCard / SrchSnippet read these as free-var globals (window-attached in prod).
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { verse: { label: 'Verse', cls: '' } };
  /** @type {any} */ (globalThis).SrchSnippet = SrchSnippet;
  /** @type {any} */ (globalThis).VotSearch = { snippet, highlightSpans };
});
afterEach(() => { cleanup(); });

const VERSE = 'The LORD is my shepherd; I shall not want.';
const entry = (terms) => ({
  score: 1,
  doc: { kind: 'verse', ref: 'Psalms 23:1', text: VERSE },
  ...(terms ? { terms } : {}),
});

const marks = (container) => [...container.querySelectorAll('mark')].map((m) => m.textContent);

it('marks the fuzzy-corrected word carried on entry.terms (typed term alone matches nothing)', () => {
  const { container } = render(
    <SrchCard entry={entry(['shepherd'])} terms={['sheperd']} onSelect={() => {}} isDirect={false} />,
  );
  expect(marks(container).some((t) => /shepherd/i.test(t))).toBe(true);
});

it('still marks plain query-level terms (no entry.terms — the Classic engine shape)', () => {
  const { container } = render(
    <SrchCard entry={entry(null)} terms={['shepherd']} onSelect={() => {}} isDirect={false} />,
  );
  expect(marks(container).some((t) => /shepherd/i.test(t))).toBe(true);
});

it('renders unmarked (no crash) when neither list matches', () => {
  const { container } = render(
    <SrchCard entry={entry([])} terms={['zebra']} onSelect={() => {}} isDirect={false} />,
  );
  expect(marks(container)).toHaveLength(0);
  expect(container.textContent).toContain('shepherd');
});
