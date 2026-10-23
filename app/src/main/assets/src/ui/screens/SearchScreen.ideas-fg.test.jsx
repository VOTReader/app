/* search200 ideas F and G on the screen: the topic card a question gets (mockups/F-topic-card), and what a search
   that found nothing offers (mockups/G-empty-state). The engine is a stand-in; the pick and the floors are real. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { SearchScreen } from './SearchScreen.jsx';
import { TOPIC_MEANING_FLOOR } from '../components/srch-topic.js';
import { NEAREST_MEANING_FLOOR } from '../components/srch-empty.js';
import { srchSortCanonical, SRCH_CANONICAL_BOOK_INDEX } from '../../utils/search.js';

const noop = () => {};
const baseProps = () => ({
  query: '', onQueryChange: noop, settings: {}, onSettingsChange: noop,
  onSelect: noop, onBack: noop, searchScope: null, searchContext: null,
  onToggleScope: noop, onCommand: noop,
});

const TOPIC_TEXT = 'Introduction. Beloved, I delight in that which one gives to another in My name, and by the works of their own hands and feet in all righteousness; this is the tithe in which I delight most. Will a man rob God? Yet you have robbed Me!';
const topicDoc = { kind: 'answers', title: 'Regarding Tithing', ref: 'Answers Only God Can Give', volumeId: 'answers', text: TOPIC_TEXT, g: 'answers' };
const letterDoc = { kind: 'letter', title: 'Tithing', ref: 'Letters from Timothy · Letter 7', volumeId: 'timothy', g: 'timothy',
  text: 'Beloved, I delight in that which one gives to another in My name, and by the works of their own hands and feet in all righteousness.' };
const verseDoc = { kind: 'verse', ref: 'Malachi 3:8', bookId: 'malachi', g: 'bible', text: 'Will a man rob God? Yet you have robbed Me!' };
const strayDoc = { kind: 'verse', ref: 'Numbers 18:26', bookId: 'numbers', g: 'bible', text: 'Speak thus to the Levites, and say to them: When you take the tithes.' };

/** The results a question about tithing brings: the letter first, the topic second (its cosine `m`). */
const tithing = (/** @type {number|undefined} */ m) => [
  { score: 9, doc: letterDoc },
  { score: 8, doc: topicDoc, ...(m === undefined ? {} : { meaning: m }) },
  { score: 7, doc: strayDoc },
  { score: 6, doc: verseDoc },
  // enough more for a Best Matches row over the groups
  ...Array.from({ length: 6 }, (_, i) => ({ score: 5 - i, doc: { kind: 'letter', title: 'Offerings ' + i, ref: 'Volume Two · Letter ' + i, g: 'v2', text: 'Bring an offering ' + i } })),
];

beforeEach(() => {
  vi.useFakeTimers();
  /** @type {any} */ (globalThis).ScreenLayout = ({ navChildren, children }) => <div>{navChildren}{children}</div>;
  /** @type {any} */ (globalThis).SrchCard = ({ entry, why }) => <div className="stub-card">{(entry.doc && (entry.doc.title || entry.doc.ref)) + (why ? ' [' + why + ']' : '')}</div>;
  /** @type {any} */ (globalThis).SrchGroup = () => null;
  /** @type {any} */ (globalThis).SRCH_GROUP_META = {};
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = {};
  /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g || 'g';
  /** @type {any} */ (globalThis).srchSortCanonical = srchSortCanonical;
  /** @type {any} */ (globalThis).SRCH_CANONICAL_BOOK_INDEX = SRCH_CANONICAL_BOOK_INDEX;
  /** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;
  /** @type {any} */ (globalThis).SRCH_QUICK_PICKS = [];
  /** @type {any} */ (window).VotSearchMini = {
    getState: () => ({ ready: true }),
    init: () => Promise.resolve(),
    suggest: () => [],
    fuzzyBookSuggest: () => null,
    snippet: (/** @type {string} */ t) => t.slice(0, 180),
    highlightSpans: (/** @type {string} */ t) => [{ text: t, hit: false }],
    search: () => Promise.resolve({ parsed: { kind: 'text' }, results: [], parsedTerms: [] }),
  };
  /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {}, STOP_WORDS_TRIMMED: ['the', 'of', 'what', 'does', 'say', 'about'] };
  /** @type {any} */ (window).getRecentSearches = () => [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete /** @type {any} */ (window).VotSearchMini;
  delete /** @type {any} */ (window).VotSearchData;
  delete /** @type {any} */ (window).getRecentSearches;
});

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const typeAndWait = async (/** @type {any} */ props, /** @type {string} */ q) => {
  const r = render(<SearchScreen {...props} />);
  r.rerender(<SearchScreen {...props} query={q} />);
  act(() => { vi.advanceTimersByTime(200); });
  await flush();
  return r;
};

describe('F: the topic card a question gets', () => {
  it('names the topic over Best Matches, with the texts it quotes; each text and "Open topic" open where they say', async () => {
    const results = tithing(TOPIC_MEANING_FLOOR + 0.05);
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, parsedTerms: ['tithing'], results }));
    const onSelect = vi.fn();
    await typeAndWait({ ...baseProps(), onSelect }, 'what does the lord say about tithing');
    const card = document.querySelector('.srch-topic');
    expect(card, 'the card').toBeTruthy();
    expect(card.querySelector('.srch-topic-eyebrow').textContent).toBe('Answers Only God Can Give');
    expect(card.querySelector('.srch-topic-title').textContent).toBe('Regarding Tithing');
    expect([...card.querySelectorAll('.srch-topic-ref')].map((x) => x.textContent)).toEqual(['Letters from Timothy · Tithing', 'Malachi 3:8']);
    expect(card.querySelector('.srch-topic-quote').textContent.startsWith('“Beloved')).toBe(true);
    // over Best Matches
    const best = document.querySelector('.srch-top-results');
    expect(best && (card.compareDocumentPosition(best) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    fireEvent.click(card.querySelectorAll('.srch-topic-text')[1]);
    expect(onSelect.mock.calls[0][0]).toBe(results[3]);
    fireEvent.click(screen.getByRole('button', { name: /Open topic/ }));
    expect(onSelect.mock.calls[1][0].doc).toBe(topicDoc);
    expect(onSelect.mock.calls[1][0].placeStart).toBe(0);
    expect(document.querySelector('[role="status"]').textContent).toContain('Answers Only God Can Give: Regarding Tithing.');
  });

  /* The hub walk's "what happens when we die?" (S22, 2026-10-22): Best Matches were verses holding "happen", and the
     topics that answer it sat in the last group, closed. The card names the topic the model is surest of wherever the
     words put it. */
  it('names the topic a question asks for when keyword verses fill Best Matches and the topics sit at the end', async () => {
    const verses = Array.from({ length: 18 }, (_, i) => ({ score: 20 - i, meaning: 0.6, doc: { kind: 'verse', ref: 'Ecclesiastes 3:' + (i + 1), bookId: 'ecclesiastes', g: 'bible', text: 'For what happens to the sons of men also happens to animals ' + i } }));
    const death = { kind: 'answers', title: 'Regarding the First Death', ref: 'Answers Only God Can Give', volumeId: 'answers', g: 'answers',
      text: 'Many have asked what happens when we die. For what happens to the sons of men also happens to animals 0; one thing befalls them.' };
    const churches = { kind: 'answers', title: 'Regarding the Churches of Men', ref: 'Answers Only God Can Give', volumeId: 'answers', g: 'answers', text: 'Woe to the churches.' };
    const results = [...verses, { score: 1, meaning: TOPIC_MEANING_FLOOR - 0.05, doc: churches }, { score: 0.5, meaning: TOPIC_MEANING_FLOOR + 0.06, doc: death }];
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, parsedTerms: ['happens', 'die'], results }));
    await typeAndWait(baseProps(), 'what happens when we die?');
    const card = document.querySelector('.srch-topic');
    expect(card && card.querySelector('.srch-topic-title').textContent).toBe('Regarding the First Death');
    expect([...card.querySelectorAll('.srch-topic-ref')].map((x) => x.textContent)[0]).toBe('Ecclesiastes 3:1');
  });

  it('shows nothing for a topic the model is not sure of, or ranked no cosine', async () => {
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, parsedTerms: ['tithing'], results: tithing(TOPIC_MEANING_FLOOR - 0.01) }));
    const r = await typeAndWait(baseProps(), 'what does the lord say about tithing');
    expect(document.querySelector('.srch-topic')).toBeNull();
    r.unmount();
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, parsedTerms: ['tithing'], results: tithing(undefined) }));
    await typeAndWait(baseProps(), 'what does the lord say about tithing');
    expect(document.querySelector('.srch-topic')).toBeNull();
  });

  it('a search that is no question gets no card, sure or not', async () => {
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, parsedTerms: ['tithing'], results: tithing(0.95) }));
    await typeAndWait(baseProps(), 'tithing');
    expect(document.querySelector('.srch-topic')).toBeNull();
  });

  it('Book order is the list alone: the card goes with Best Matches', async () => {
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, parsedTerms: ['tithing'], results: tithing(0.95) }));
    await typeAndWait(baseProps(), 'what is tithing');
    expect(document.querySelector('.srch-topic')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Book order' }));
    expect(document.querySelector('.srch-topic')).toBeNull();
  });
});

describe('G: what a search that found nothing offers', () => {
  it('lists the nearest texts by meaning above the floor, each tagged "by meaning", before the picks', async () => {
    const near = [
      { score: 0, meaning: NEAREST_MEANING_FLOOR + 0.05, doc: { kind: 'verse', ref: 'Genesis 1:11', text: 'Let the earth bring forth grass' }, terms: [] },
      { score: 0, meaning: NEAREST_MEANING_FLOOR - 0.01, doc: { kind: 'verse', ref: 'Job 8:11', text: 'Can the papyrus grow up without a marsh?' }, terms: [] },
    ];
    const nearest = vi.fn(() => Promise.resolve(near));
    Object.assign(/** @type {any} */ (window).VotSearchMini, { nearest, knows: () => false, whenMeaningReady: () => Promise.resolve(true) });
    await typeAndWait({ ...baseProps(), settings: { searchCorpus: 'scriptures' } }, 'photosynthesis');
    expect(nearest).toHaveBeenCalledWith('photosynthesis', expect.objectContaining({ corpus: 'scriptures' }));
    expect(document.querySelector('.srch-nearest-label').textContent).toBe('Nearest by meaning');
    expect([...document.querySelectorAll('.srch-nearest .stub-card')].map((c) => c.textContent)).toEqual(['Genesis 1:11 [by meaning]']);
    // no fewer words to offer: today's line and tip stand
    const none = document.querySelector('.search-no-results');
    expect(none.textContent).toContain('No results for “photosynthesis” in the Scriptures.');
    expect(none.textContent).toContain('Check the spelling');
    expect(document.querySelector('.srch-fewer')).toBeNull();
  });

  it('offers the query trimmed to the words some text holds, when that finds something, with "Search all"', async () => {
    const search = vi.fn((/** @type {string} */ q) => Promise.resolve(q === 'seven trumpets'
      ? { parsed: { kind: 'text' }, parsedTerms: ['seven', 'trumpets'], results: [{ score: 1, doc: verseDoc }] }
      : { parsed: { kind: 'text' }, parsedTerms: [], results: [] }));
    Object.assign(/** @type {any} */ (window).VotSearchMini, { search, nearest: () => Promise.resolve([]), knows: (/** @type {string} */ w) => w !== 'photosynthesis' });
    const onQueryChange = vi.fn();
    const onSettingsChange = vi.fn();
    await typeAndWait({ ...baseProps(), onQueryChange, onSettingsChange, settings: { searchCorpus: 'scriptures' } }, '"seven trumpets" +photosynthesis');
    const line = document.querySelector('.srch-fewer');
    expect(line && line.textContent).toBe('Try fewer words: seven trumpets · Search all');
    expect(document.querySelector('.srch-no-results-tip'), 'the old tip goes when the link shows').toBeNull();
    expect(search).toHaveBeenCalledWith('seven trumpets', expect.objectContaining({ corpus: 'scriptures' }));
    fireEvent.click(screen.getByRole('button', { name: 'seven trumpets' }));
    expect(onQueryChange).toHaveBeenCalledWith('seven trumpets');
    fireEvent.click(screen.getByRole('button', { name: 'Search all' }));
    expect(onSettingsChange).toHaveBeenCalledWith('searchCorpus', 'all');
    expect(document.querySelector('.srch-nearest'), 'nothing near enough: no list').toBeNull();
  });

  it('offers no fewer words that would find nothing either', async () => {
    const search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, parsedTerms: [], results: [] }));
    Object.assign(/** @type {any} */ (window).VotSearchMini, { search, nearest: () => Promise.resolve([]), knows: (/** @type {string} */ w) => w !== 'photosynthesis' });
    await typeAndWait(baseProps(), '"seven trumpets" +photosynthesis');
    expect(search).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.srch-fewer')).toBeNull();
    expect(document.querySelector('.srch-no-results-tip')).toBeTruthy();
  });
});
