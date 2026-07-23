/* SrchCard — per-result matched-term merge (fuzzy snippet highlight).
   ────────────────────────────────────────────────────────────────────
   MiniSearch results carry `entry.terms` — the doc-side words the fuzzy/
   prefix search actually matched (typed "sheperd" → matched "shepherd").
   The query-level term list only holds the literal typed words, so before
   this merge a typo-corrected result rendered its snippet with NO <mark>.
   SrchCard must union entry.terms into the highlight list, and must pass
   results WITHOUT entry.terms (direct-ref parses) through unchanged. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SrchCard } from './SrchCard.jsx';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, highlightSpans } from '../../search/snippet.js';

beforeEach(() => {
  // SrchCard / SrchSnippet read these as free-var globals (window-attached in prod).
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { verse: { label: 'Verse', cls: '' } };
  /** @type {any} */ (globalThis).SrchSnippet = SrchSnippet;
  /** @type {any} */ (globalThis).VotSearchMini = { snippet, highlightSpans };
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

it('still marks plain query-level terms (no entry.terms on the result)', () => {
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

/* W0 SEARCH-UI — translation badge naming (P2 audit: 'RNKJV' on search cards
   vs 'NKJV-R' everywhere else). The badge must resolve the engine's raw
   translation id through TRANSLATION_OPTIONS (translationLabel), never render
   the raw id uppercased. TRANSLATION_OPTIONS is an index.html lexical global
   in prod; stub it here the same way the SRCH_* globals are stubbed above. */
describe('SrchCard translation badge (W0: registry label, never a raw id)', () => {
  beforeEach(() => {
    /** @type {any} */ (globalThis).TRANSLATION_OPTIONS = [
      { id: 'nkjv', label: 'NKJV', desc: 'New King James Version — default' },
      { id: 'rnkjv', label: 'NKJV-R', desc: 'NKJV Restored Name — His true Name restored in the New Testament' },
      { id: 'kjv', label: 'KJV', desc: 'King James Version 1769 — traditional' },
    ];
  });
  afterEach(() => { delete /** @type {any} */ (globalThis).TRANSLATION_OPTIONS; });

  it('renders the registry label "NKJV-R" for doc.translation "rnkjv", not "RNKJV"', () => {
    const e = { score: 1, doc: { kind: 'verse', ref: 'John 1:1', text: VERSE, translation: 'rnkjv' } };
    const { container } = render(<SrchCard entry={e} terms={[]} onSelect={() => {}} isDirect={false} />);
    expect(container.textContent).toContain('NKJV-R');
    expect(container.textContent).not.toContain('RNKJV');
  });

  it('renders "KJV" for doc.translation "kjv"', () => {
    const e = { score: 1, doc: { kind: 'verse', ref: 'John 1:1', text: VERSE, translation: 'kjv' } };
    const { container } = render(<SrchCard entry={e} terms={[]} onSelect={() => {}} isDirect={false} />);
    expect(container.textContent).toContain('KJV');
  });

  it('falls back to the NKJV default label for an unknown id — still never a raw id', () => {
    const e = { score: 1, doc: { kind: 'verse', ref: 'John 1:1', text: VERSE, translation: 'xyz' } };
    const { container } = render(<SrchCard entry={e} terms={[]} onSelect={() => {}} isDirect={false} />);
    expect(container.textContent).not.toContain('XYZ');
    expect(container.textContent).toContain('NKJV');
  });

  it('renders no translation badge for nkjv (default translation, existing behavior)', () => {
    const e = { score: 1, doc: { kind: 'verse', ref: 'John 1:1', text: VERSE, translation: 'nkjv' } };
    const { container } = render(<SrchCard entry={e} terms={[]} onSelect={() => {}} isDirect={false} />);
    expect(container.querySelectorAll('.srch-card-badge')).toHaveLength(1); // kind badge only
  });
});
