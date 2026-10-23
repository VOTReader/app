/* Study notes, chapter summaries and headings as their own results group (Corbin 2026-10-23, DECISIONS item 5).
   The engine finds them in an index of their own (searchNotes, search/notes-index.js); the screen lists them as one
   group after every collection, so a Best Match or a verse or letter hit is never pushed down by one. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { SrchGroup as RealSrchGroup } from '../components/SrchGroup.jsx';
// @ts-ignore -- no node types in this tsconfig
import { readFileSync } from 'node:fs';
// @ts-ignore -- no node types in this tsconfig
import { resolve, dirname } from 'node:path';
// @ts-ignore -- no node types in this tsconfig
import { fileURLToPath } from 'node:url';
import { SearchScreen } from './SearchScreen.jsx';
import { srchSortCanonical, SRCH_CANONICAL_BOOK_INDEX } from '../../utils/search.js';

const INDEX_HTML = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'index.html'), 'utf-8');
function realGroupMeta() {
  const start = INDEX_HTML.indexOf('const SRCH_GROUP_META = {');
  const end = INDEX_HTML.indexOf('};', start);
  return new Function('return ' + INDEX_HTML.slice(INDEX_HTML.indexOf('{', start), end + 1))();
}

describe('SearchScreen — study notes, chapter summaries and headings', () => {
  const noop = () => {};
  const baseProps = () => ({
    query: '', onQueryChange: noop, settings: {}, onSettingsChange: noop,
    onSelect: noop, onBack: noop, searchScope: null, searchContext: null,
    onToggleScope: noop, onCommand: noop,
  });
  const letters = (/** @type {string} */ g, /** @type {number} */ n, from = 0) => Array.from({ length: n }, (_, i) => (
    { score: 1000 - from - i, doc: { kind: 'letter', title: g + '-' + (from + i), text: 'text of ' + g + '-' + (from + i), g } }));
  const NOTES = [
    { score: 9, doc: { kind: 'heading', bookId: 'genesis', chapterNum: 1, verseNum: 1, heading: 'The Creation Week', text: 'The Creation Week', ref: 'Genesis 1:1', title: 'H1' }, terms: ['creation'] },
    { score: 5, doc: { kind: 'study-note', bookId: 'matthew', chapterNum: 5, verseNum: 3, heading: 'Volume Two · Meek', text: 'creation groans', ref: 'Matthew 5:3', title: 'N1' }, terms: ['creation'] },
  ];
  const commit = async () => {
    act(() => { vi.advanceTimersByTime(200); });
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
  };
  const typeIn = async (/** @type {any} */ props, /** @type {string} */ q) => {
    const r = render(<SearchScreen {...props} />);
    r.rerender(<SearchScreen {...props} query={q} />);
    await commit();
    return r;
  };
  const E = () => /** @type {any} */ (window).VotSearchMini;

  beforeEach(() => {
    vi.useFakeTimers();
    const g = /** @type {any} */ (globalThis);
    g.ScreenLayout = ({ navChildren, children }) => <div className="screen-scroll">{navChildren}{children}</div>;
    g.SrchCard = ({ entry, onSelect }) => <button type="button" className="stub-card" onClick={() => onSelect(entry)}>{entry.doc ? entry.doc.title : entry.__label}</button>;
    g.SrchGroup = ({ gkey, items }) => <div className="stub-group" data-key={gkey}>{items.map((e) => e.doc.title).join(',')}</div>;
    g.SRCH_GROUP_META = realGroupMeta();
    g.SRCH_KIND_LABEL = {};
    g.srchGroupKey = (doc) => doc.g;
    g.srchSortCanonical = srchSortCanonical;
    g.SRCH_CANONICAL_BOOK_INDEX = SRCH_CANONICAL_BOOK_INDEX;
    g.ConfirmStrip = ConfirmStrip;
    g.SRCH_QUICK_PICKS = [];
    /** @type {any} */ (window).VotSearchMini = {
      getState: () => ({ ready: true }),
      init: () => Promise.resolve(),
      suggest: () => [],
      fuzzyBookSuggest: () => null,
      search: vi.fn(() => Promise.resolve({ parsed: { kind: 'text', phrase: '' }, parsedTerms: ['creation'], results: letters('v7', 6).concat(letters('v1', 3, 6)) })),
      searchNotes: vi.fn(() => Promise.resolve(NOTES)),
    };
    /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {} };
    /** @type {any} */ (window).getRecentSearches = () => [];
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete /** @type {any} */ (window).VotSearchMini;
    delete /** @type {any} */ (window).VotSearchData;
    delete /** @type {any} */ (window).getRecentSearches;
  });

  it('index.html names the group, listed after every collection', () => {
    const meta = realGroupMeta();
    expect(meta.notes.label).toBe('Study notes & headings');
    for (const k of Object.keys(meta)) if (k !== 'notes' && k !== 'other') expect(meta.notes.order).toBeGreaterThan(meta[k].order);
  });

  it('lists them as their own group after the collections, and Best Matches is what the search ranked', async () => {
    await typeIn({ ...baseProps(), settings: { searchCorpus: 'volumes' } }, 'creation');
    expect(E().searchNotes).toHaveBeenCalledWith('creation', expect.objectContaining({ corpus: 'volumes', scope: null }));
    const best = [...document.querySelectorAll('.srch-top-results .stub-card')].map((c) => c.textContent);
    expect(best).toEqual(['v7-0', 'v7-1', 'v7-2', 'v7-3', 'v7-4']);
    const groups = [...document.querySelectorAll('.stub-group')].map((g) => [g.getAttribute('data-key'), g.textContent]);
    expect(groups).toEqual([['v1', 'v1-6,v1-7,v1-8'], ['v7', 'v7-5'], ['notes', 'H1,N1']]);
  });

  it('the group is the real group, labelled, and a tap opens the hit', async () => {
    /** @type {any} */ (globalThis).SrchGroup = RealSrchGroup;
    const onSelect = vi.fn();
    await typeIn({ ...baseProps(), onSelect }, 'creation');
    const header = [...document.querySelectorAll('.srch-group-header')].map((h) => h.textContent);
    expect(header[header.length - 1]).toMatch(/^Study notes & headings · 2 matches/);
    const note = [...document.querySelectorAll('.stub-card')].find((c) => c.textContent === 'N1');
    fireEvent.click(/** @type {Element} */ (note));
    expect(onSelect).toHaveBeenCalledWith(NOTES[1], expect.anything(), 'creation', expect.anything());
  });

  it('a reference or a command asks for none', async () => {
    E().search = vi.fn(() => Promise.resolve({ parsed: { kind: 'ref-bible', bookId: 'john', chapter: 3 }, parsedTerms: [], results: [] }));
    await typeIn(baseProps(), 'john 3');
    expect(E().searchNotes).not.toHaveBeenCalled();
    expect(document.querySelector('[data-key="notes"]')).toBeNull();
  });

  it('a search no text holds still shows the notes and headings that hold it', async () => {
    E().search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text', phrase: '' }, parsedTerms: ['creation'], results: [] }));
    await typeIn(baseProps(), 'creation');
    expect(document.querySelector('.search-no-results')).not.toBeNull();
    expect(document.querySelector('[data-key="notes"]').textContent).toBe('H1,N1');
  });
});
