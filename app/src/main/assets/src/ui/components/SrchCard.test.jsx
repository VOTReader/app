/* SrchCard — per-result matched-term merge (fuzzy snippet highlight).
   ────────────────────────────────────────────────────────────────────
   MiniSearch results carry `entry.terms` — the doc-side words the fuzzy/
   prefix search actually matched (typed "sheperd" → matched "shepherd").
   The query-level term list only holds the literal typed words, so before
   this merge a typo-corrected result rendered its snippet with NO <mark>.
   SrchCard must union entry.terms into the highlight list, and must pass
   results WITHOUT entry.terms (direct-ref parses) through unchanged. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SrchCard } from './SrchCard.jsx';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, highlightSpans, morePlaces } from '../../search/snippet.js';

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

/* Every place a letter says the words (Brianna, 2026-09-26): the card lists the
   places its snippet does not show, closed under one quiet row, each its own tap. */
describe('SrchCard — more places in this letter', () => {
  const pad = (n) => 'and the word went on. '.repeat(n);
  const LETTER = pad(3) + 'Behold, I shall bring upon them a flooding rain. ' + pad(300)
    + 'nor shall I flood the face of the earth in My anger. ' + pad(20)
    + 'Be a flood of water which covers, But a flood of judgment to destroy. ' + pad(3);
  const letter = (kind = 'letter') => ({
    score: 1, terms: ['flood', 'flooding'],
    doc: { kind, title: 'Vengeance Is Mine, I Shall Repay', ref: 'Volume Seven · Letter 55', text: LETTER, volumeId: 'v7', letterId: 'vengeance' },
  });
  beforeEach(() => {
    /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { letter: { label: 'Letter', cls: 'badge-letter' }, answers: { label: 'Answers', cls: '' } };
    /** @type {any} */ (globalThis).VotSearchMini = { snippet, highlightSpans, morePlaces };
  });

  it('a places list the reader opened is open again when the search comes back', () => {
    const first = render(<SrchCard entry={letter()} terms={['flood']} onSelect={() => {}} isDirect={false} memo="flood|v" />);
    fireEvent.click(first.container.querySelector('.srch-places-toggle'));
    first.unmount();
    const again = render(<SrchCard entry={letter()} terms={['flood']} onSelect={() => {}} isDirect={false} memo="flood|v" />);
    expect(again.container.querySelector('.srch-places-toggle').getAttribute('aria-expanded')).toBe('true');
  });

  it('the same letter in Best Matches and in its group are two cards: opening one opens only it', () => {
    const inGroup = render(<SrchCard entry={letter()} terms={['flood']} onSelect={() => {}} isDirect={false} memo="flood|w" where="v7" />);
    fireEvent.click(inGroup.container.querySelector('.srch-places-toggle'));
    inGroup.unmount();
    const best = render(<SrchCard entry={letter()} terms={['flood']} onSelect={() => {}} isDirect={false} memo="flood|w" where="best" />);
    expect(best.container.querySelector('.srch-places-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('says how many more places the letter holds, closed until asked', () => {
    const { container } = render(<SrchCard entry={letter()} terms={['flood']} onSelect={() => {}} isDirect={false} />);
    const toggle = container.querySelector('.srch-places-toggle');
    expect(toggle.textContent).toContain('2 more places in this letter');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.srch-places')).toBeNull();
  });

  it('opens to the places, the words marked, and a place taps through with where it starts', () => {
    const picked = [];
    const { container } = render(<SrchCard entry={letter()} terms={['flood']} onSelect={(e) => picked.push(e)} isDirect={false} />);
    fireEvent.click(container.querySelector('.srch-places-toggle'));
    expect(container.querySelector('.srch-places-toggle').getAttribute('aria-expanded')).toBe('true');
    const rows = [...container.querySelectorAll('.srch-place')];
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('Be a flood of water which covers, But a flood of judgment');
    expect([...rows[1].querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['flood', 'flood']);
    fireEvent.click(rows[1]);
    expect(picked).toHaveLength(1);
    expect(LETTER.slice(picked[0].placeStart).startsWith('flood of water')).toBe(true);
    expect(picked[0].doc.letterId).toBe('vengeance');
  });

  it('the card itself still opens the snippet\'s passage, with no place named', () => {
    const picked = [];
    const { container } = render(<SrchCard entry={letter()} terms={['flood']} onSelect={(e) => picked.push(e)} isDirect={false} />);
    fireEvent.click(container.querySelector('.srch-card'));
    expect(picked[0].placeStart).toBeUndefined();
  });

  it('names the unit by kind: an Answers topic', () => {
    const { container } = render(<SrchCard entry={letter('answers')} terms={['flood']} onSelect={() => {}} isDirect={false} />);
    expect(container.querySelector('.srch-places-toggle').textContent).toContain('2 more places in this topic');
  });

  it('a verse, or a letter that says the word once, has no places row', () => {
    const verse = { score: 1, doc: { kind: 'verse', ref: 'Genesis 7:17', text: 'Now the flood was on the earth forty days.' } };
    const once = { score: 1, doc: { kind: 'letter', title: 'A Day of Slaughter', ref: 'Volume Seven · Letter 53', text: pad(5) + 'as a flood to cover the land. ' + pad(5) } };
    for (const e of [verse, once]) {
      const { container, unmount } = render(<SrchCard entry={e} terms={['flood']} onSelect={() => {}} isDirect={false} />);
      expect(container.querySelector('.srch-places-toggle')).toBeNull();
      expect(container.querySelector('.srch-card-wrap')).toBeNull();
      unmount();
    }
  });

  it('an engine without morePlaces (an older cached bundle-e) renders the plain card', () => {
    /** @type {any} */ (globalThis).VotSearchMini = { snippet, highlightSpans };
    const { container } = render(<SrchCard entry={letter()} terms={['flood']} onSelect={() => {}} isDirect={false} />);
    expect(container.querySelector('.srch-card')).toBeTruthy();
    expect(container.querySelector('.srch-places-toggle')).toBeNull();
  });
});

/* A study chapter's card said the study's long name twice: the index folds it into
   the chapter's title and its location (search audit 2026-09-27). */
describe('SrchCard for a Bible study chapter', () => {
  it('leads with the chapter\u2019s own title, and names the study once, with the chapter', () => {
    /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { 'bible-study': { label: 'Study', cls: '' } };
    const study = 'YahuShua The Messiah, The Lamb of God';
    const e = { score: 1, doc: { kind: 'bible-study', title: study + ' \u2014 Tuesday Night, Passover', ref: study + ' 3', text: 'On the tenth day of the month.' } };
    const { container } = render(<SrchCard entry={e} terms={['passover']} onSelect={() => {}} isDirect={false} />);
    expect(container.querySelector('.srch-card-ref').textContent).toBe('Tuesday Night, Passover');
    expect(container.querySelector('.srch-card-loc').textContent).toBe(study + ' \u00b7 Chapter 3');
  });
});

it('a text only the meaning search found shows the passage it matched, not its opening (path to 500, 2026-10-05)', () => {
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { letter: { label: 'Letter', cls: '' } };
  const text = 'An opening line about other things entirely. '.repeat(8) + 'Remember now your Creator in the days of your youth.';
  const doc = { kind: 'letter', ref: 'Volume One · Letter 2', title: 'Youth', text, volumeId: 'v1', letterId: 'youth' };
  const { container } = render(
    <SrchCard entry={{ score: 1, doc, terms: [], placeStart: text.indexOf('Remember') }} terms={['honour', 'maker']} onSelect={() => {}} isDirect={false} />,
  );
  expect(container.querySelector('.srch-card-snippet').textContent.startsWith('Remember now your Creator')).toBe(true);
});
