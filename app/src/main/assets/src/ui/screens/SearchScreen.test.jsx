/* SRCH4 — snippet synonym-highlight term expansion.
   ────────────────────────────────────────────────
   expandSnippetTerms decides which words SrchSnippet marks. When synonym search
   is on, a verse surfaced by a synonym (search "shepherd" → a "pastor" verse)
   must highlight the matched synonym, not show it plain. Pure function → tested
   directly (no need to render the screen). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
/* Node builtins in an app/src test: this tsconfig has no node types, so the
   three specifiers are ts-ignored (the use-lazy-bundles.test.jsx precedent). */
// @ts-ignore -- no node types in this tsconfig
import { readFileSync } from 'node:fs';
// @ts-ignore -- no node types in this tsconfig
import { resolve, dirname } from 'node:path';
// @ts-ignore -- no node types in this tsconfig
import { fileURLToPath } from 'node:url';
import {
  expandSnippetTerms, matchCountLabel, useImeHideBlur, SearchScreen, SEARCH_LIMIT, groupInSiteOrder, correctedQuery,
} from './SearchScreen.jsx';
import {
  srchSortCanonical as realSrchSortCanonical,
  SRCH_CANONICAL_BOOK_INDEX as realCanonIndex,
} from '../../utils/search.js';

const MAP = {
  shepherd: ['shepherd', 'pastor'],
  pastor: ['shepherd', 'pastor'],
};

describe('expandSnippetTerms (SRCH4)', () => {
  it('returns [] for a non-text parsed result (command / null)', () => {
    expect(expandSnippetTerms({ kind: 'command' }, ['x'], MAP, true)).toEqual([]);
    expect(expandSnippetTerms(null, ['x'], MAP, true)).toEqual([]);
  });

  it('returns just the literal terms when synonym search is off', () => {
    expect(expandSnippetTerms({ kind: 'text', phrase: '' }, ['shepherd'], MAP, false))
      .toEqual(['shepherd']);
  });

  it('returns just the literal terms when no synonym map is available', () => {
    expect(expandSnippetTerms({ kind: 'text', phrase: '' }, ['shepherd'], null, true))
      .toEqual(['shepherd']);
  });

  it('expands each literal term through its synonym group when on (matched word highlights)', () => {
    const out = expandSnippetTerms({ kind: 'text', phrase: '' }, ['shepherd'], MAP, true);
    expect(out).toContain('shepherd');
    expect(out).toContain('pastor');
    expect(new Set(out).size).toBe(out.length); // de-duped
  });

  it('drops the stop words the reader typed among real words, which are not words to mark (search audit 2026-09-27)', () => {
    const stop = new Set(['is', 'the', 'me']);
    expect(expandSnippetTerms({ kind: 'text', phrase: '' }, ['faith', 'is', 'the', 'substance'], MAP, true, stop)).toEqual(['faith', 'substance']);
    // punctuation typed onto a stop word does not hide it
    expect(expandSnippetTerms({ kind: 'text', phrase: '' }, ['question', 'me.'], MAP, true, stop)).toEqual(['question']);
    // only stop words: they are all there is to mark
    expect(expandSnippetTerms({ kind: 'text', phrase: '' }, ['is', 'the'], MAP, true, stop)).toEqual(['is', 'the']);
  });

  it('never synonym-expands the phrase (the engine exempts phrases)', () => {
    // 'shepherd' is the PHRASE, parsedTerms is empty → no synonym pulled in.
    expect(expandSnippetTerms({ kind: 'text', phrase: 'shepherd' }, [], MAP, true))
      .toEqual(['shepherd']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   WAVE-0 SEARCH-UI — four presentation-layer contracts.
   ─────────────────────────────────────────────────────────────────────── */

/* matchCountLabel (micro-gap a) — the engine caps at SEARCH_LIMIT (400), so a
   count of exactly 400 means "at least 400", not "exactly 400". Displaying
   the raw number overstates precision; the summary must say "400+". */
/* The result groups follow the website's order (Brianna, 2026-09-26): the
   collections as trumpetcallofgodonline.com lists them, whatever the query. */
const INDEX_HTML = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'index.html'), 'utf-8');
function realGroupMeta() {
  const start = INDEX_HTML.indexOf('const SRCH_GROUP_META = {');
  const end = INDEX_HTML.indexOf('};', start);
  return new Function('return ' + INDEX_HTML.slice(INDEX_HTML.indexOf('{', start), end + 1))();
}

describe("groupInSiteOrder (the website's collection order)", () => {
  const hit = (g, score) => ({ score, doc: { g } });
  const key = (doc) => doc.g;

  it("index.html lists the collections in the website's order, the Bible first and Answers last", () => {
    const meta = realGroupMeta();
    const byOrder = Object.keys(meta).sort((a, b) => meta[a].order - meta[b].order);
    expect(byOrder).toEqual([
      'bible', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7',
      'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays',
      'matthew', 'matthew-study', 'bible-studies', 'answers', 'letters', 'other',
    ]);
  });

  it('orders the groups by the site, not by their best score', () => {
    const meta = realGroupMeta();
    // relevance order: Volume Seven's letter scored highest, the Bible lowest
    const results = [hit('v7', 9), hit('answers', 8), hit('wtlb1', 7), hit('v7', 6), hit('flock', 5), hit('v2', 4), hit('rebuke', 3), hit('bible', 1)];
    expect(groupInSiteOrder(results, key, meta).map((g) => g.key))
      .toEqual(['bible', 'v2', 'v7', 'rebuke', 'wtlb1', 'flock', 'answers']);
  });

  it("keeps each group's own items in relevance order", () => {
    const results = [hit('v7', 9), hit('v2', 8), hit('v7', 2)];
    const v7 = groupInSiteOrder(results, key, realGroupMeta()).find((g) => g.key === 'v7');
    expect(v7.items.map((e) => /** @type {any} */ (e).score)).toEqual([9, 2]);
  });

  it('puts a group the table does not know after every known one, in first-seen order', () => {
    const results = [hit('zz', 9), hit('yy', 8), hit('v1', 1)];
    expect(groupInSiteOrder(results, key, realGroupMeta()).map((g) => g.key)).toEqual(['v1', 'zz', 'yy']);
  });

  it('returns no groups for no results', () => {
    expect(groupInSiteOrder([], key, realGroupMeta())).toEqual([]);
  });
});

describe('correctedQuery (a corrected typo, offered back as a query)', () => {
  it('matches a query word the way the engine read it: an accented typo is rewritten too', () => {
    expect(correctedQuery('the lord is my Shéphard', [{ from: 'shephard', to: 'shepherd' }])).toBe('the lord is my shepherd');
  });

  it('puts each corrected word in, whole words, any case', () => {
    expect(correctedQuery('the Lord is my Shephard', [{ from: 'shephard', to: 'shepherd' }])).toBe('the Lord is my shepherd');
    expect(correctedQuery('shephard psalmm', [{ from: 'shephard', to: 'shepherd' }, { from: 'psalmm', to: 'psalm' }])).toBe('shepherd psalm');
  });

  it('never rewrites inside another word, and leaves a query it cannot find the word in', () => {
    expect(correctedQuery('shephardess shephard', [{ from: 'shephard', to: 'shepherd' }])).toBe('shephardess shepherd');
    expect(correctedQuery('flood', [{ from: 'zzz', to: 'z' }])).toBe('flood');
    expect(correctedQuery('  flood  ', [])).toBe('flood');
  });
});

describe('matchCountLabel (W0: honest 400+ cap)', () => {
  it('returns the plain count when nothing was cut', () => {
    expect(matchCountLabel(0)).toBe('0');
    expect(matchCountLabel(1, false)).toBe('1');
    expect(matchCountLabel(399, false)).toBe('399');
  });

  it('adds "+" when the engine cut the results short (the count is a floor, not a total)', () => {
    expect(matchCountLabel(400, true)).toBe('400+');
  });

  it('groups thousands, now that each collection keeps its own 400', () => {
    expect(matchCountLabel(1290, false)).toBe('1,290');
    expect(matchCountLabel(1290, true)).toBe('1,290+');
  });
});

/* useImeHideBlur (IME blur) — exiting search cost up to 3 back presses because
   the input kept focus after the IME hid (back 1 closed the keyboard, back 2
   cleared focus state, back 3 finally navigated). The hook mirrors the
   use-keyboard-inset signal (visualViewport diff, same 80px noise clamp) and
   blurs the input when keyboard height transitions >0 → 0 while focused. */
describe('useImeHideBlur (W0: blur when the IME hides)', () => {
  let vv;
  const setViewport = (inner, visual) => {
    Object.defineProperty(window, 'innerHeight', { value: inner, configurable: true, writable: true });
    vv.height = visual;
  };
  const fireResize = () => act(() => { vv.dispatchEvent(new Event('resize')); });

  function Harness() {
    const ref = React.useRef(null);
    useImeHideBlur(ref);
    return <input data-testid="ime-input" ref={ref} />;
  }

  beforeEach(() => {
    vv = /** @type {any} */ (new EventTarget());
    vv.height = 800;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true });
  });
  afterEach(() => {
    cleanup();
    delete window.visualViewport;
  });

  it('blurs the focused input when keyboard height transitions to 0', () => {
    render(<Harness />);
    const input = screen.getByTestId('ime-input');
    input.focus();
    expect(document.activeElement).toBe(input);
    setViewport(800, 500); // IME opens (diff 300 > 80 clamp)
    fireResize();
    expect(document.activeElement).toBe(input); // no blur while keyboard is UP
    setViewport(800, 800); // IME hides → keyboard height 0
    fireResize();
    expect(document.activeElement).not.toBe(input); // blurred → next back exits per the dispatcher contract
  });

  it('does nothing when the input is not focused at hide time', () => {
    render(<Harness />);
    setViewport(800, 500);
    fireResize();
    setViewport(800, 800);
    expect(() => fireResize()).not.toThrow();
  });

  it('ignores the sub-80px residual noise without arming a transition', () => {
    render(<Harness />);
    const input = screen.getByTestId('ime-input');
    input.focus();
    setViewport(800, 750); // 50px residual — clamped to 0, but no >0 → 0 transition armed
    fireResize();
    expect(document.activeElement).toBe(input);
  });

  it('no-ops cleanly when visualViewport is unavailable', () => {
    delete window.visualViewport;
    expect(() => render(<Harness />)).not.toThrow();
  });
});

/* SearchScreen render-level contracts (micro-gaps a/b/c/d).
   ScreenLayout / SrchCard / SrchGroup / the SRCH_* registries resolve as free
   globals in prod (bundle-d + index.html lexical bindings); stub them here the
   same way SrchCard.test.jsx does. */
describe('SearchScreen (W0 micro-gaps)', () => {
  const noop = () => {};
  const baseProps = () => ({
    query: '', onQueryChange: noop, settings: {}, onSettingsChange: noop,
    onSelect: noop, onBack: noop, searchScope: null, searchContext: null,
    onToggleScope: noop, onCommand: noop,
  });

  beforeEach(() => {
    /** @type {any} */ (globalThis).ScreenLayout = ({ navChildren, children }) => (
      <div>{navChildren}{children}</div>
    );
    /** @type {any} */ (globalThis).SrchCard = () => null;
    /** @type {any} */ (globalThis).SrchGroup = () => null;
    /** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;
    /** @type {any} */ (globalThis).SRCH_QUICK_PICKS = [];
    /** @type {any} */ (globalThis).SRCH_GROUP_META = {};
    /** @type {any} */ (globalThis).SRCH_KIND_LABEL = {};
    /** @type {any} */ (globalThis).srchGroupKey = () => 'g';
    // [8] the sort helper — a pure fn; the real one so the screen's memo behaves.
    /** @type {any} */ (globalThis).srchSortCanonical = realSrchSortCanonical;
    /** @type {any} */ (globalThis).SRCH_CANONICAL_BOOK_INDEX = realCanonIndex;
    /** @type {any} */ (window).VotSearchMini = {
      getState: () => ({ ready: true }),
      init: () => Promise.resolve(),
      suggest: () => [],
      fuzzyBookSuggest: () => null,
      search: () => Promise.resolve({ parsed: null, results: [], parsedTerms: [] }),
    };
    /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {} };
    /** @type {any} */ (window).getRecentSearches = () => [];
  });
  afterEach(() => {
    cleanup();
    delete /** @type {any} */ (window).VotSearchMini;
    delete /** @type {any} */ (window).VotSearchData;
    delete /** @type {any} */ (window).getRecentSearches;
    delete /** @type {any} */ (window).removeRecentSearch;
  });

  it('(d) the query input is type="search"', () => {
    render(<SearchScreen {...baseProps()} />);
    expect(screen.getByPlaceholderText(/Search scriptures/i).getAttribute('type')).toBe('search');
  });

  /* v07-12: the empty state promised study notes and footnotes, which the
     index never holds (index-builder.js NOT emitted, an owner directive). */
  it('(v07-12) the empty state names only what search searches', () => {
    const { container } = render(<SearchScreen {...baseProps()} />);
    const hero = container.querySelector('.srch-empty-hero');
    expect(hero).not.toBeNull();
    expect(hero.textContent).not.toMatch(/study notes|footnotes/i);
    expect(hero.textContent).toMatch(/Bible studies/);
  });

  /* C2-C [C8]: the app's primary search field named itself only by
     placeholder — which stops being announced the moment a character is
     typed, and is never announced at all on a field restored with a query
     already in it — and its clear button announced as the glyph "✕". */
  it('[C8] the query input has an accessible name of its own', () => {
    render(<SearchScreen {...baseProps()} />);
    const input = screen.getByRole('searchbox', { name: 'Search' });
    expect(input.getAttribute('placeholder')).toMatch(/Search scriptures/i);
  });

  it('[C8] the clear button is named "Clear search", not "✕"', () => {
    const props = baseProps();
    render(<SearchScreen {...props} query="mercy" />);
    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear.className).toContain('srch-clear-btn');
    expect(clear.getAttribute('title')).toBe('Clear search');
  });

  it('[C8] there is no clear button to name while the box is empty', () => {
    render(<SearchScreen {...baseProps()} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('(c) shows a live-region in-flight indicator while the engine runs, then clears it', async () => {
    vi.useFakeTimers();
    let resolveSearch;
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(
      () => new Promise((res) => { resolveSearch = res; }),
    );
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="mercy" />);
    act(() => { vi.advanceTimersByTime(200); }); // past the 140ms debounce
    expect(/** @type {any} */ (window).VotSearchMini.search).toHaveBeenCalled();
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/Searching/i);
    expect(status.getAttribute('aria-live')).toBe('polite');
    await act(async () => {
      resolveSearch({ parsed: null, results: [], parsedTerms: [] });
      await Promise.resolve();
    });
    expect(screen.queryByRole('status')).toBeNull();
    vi.useRealTimers();
  });

  it('(a) the summary reads "400+" when results hit the engine cap, not the raw cap as a total', async () => {
    vi.useFakeTimers();
    const results = Array.from({ length: SEARCH_LIMIT }, (_, i) => ({
      score: 1, doc: { kind: 'verse', ref: 'R' + i, text: 't' },
    }));
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(
      () => Promise.resolve({ parsed: null, results, parsedTerms: [], capped: ['bible'], truncated: false }),
    );
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="mercy" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const summary = screen.getByText(/Found/i).closest('.srch-results-summary');
    expect(summary.textContent).toContain('400+');
    expect(summary.textContent).not.toMatch(/Found 400 matches/);
    vi.useRealTimers();
  });

  /* CATALOGUE SR1 + SR2 (audit row 6, 2026-09-12): the screen showed two chip rows — the corpus pills
     (All / Scriptures / Volumes, a persisted setting that narrows what is SEARCHED) and, under the
     summary, the [8] result-filter chips (All / Scriptures · n / Volumes · n / WTLB · n / Studies · n)
     that narrowed what was RENDERED — the same three words twice on one screen, and the second row
     the only place in the app that spelled Words To Live By as "WTLB". One row: the filter chips go;
     the sort toggle stays as that row's one button. */
  it('SR1+SR2: results across several sections render NO filter chips and no "WTLB"; the sort toggle is the row\'s one button', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;         // real grouping for this case
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({
      parsed: null,
      results: [
        { score: 3, doc: { kind: 'verse', ref: 'Ps 23:1', text: 't', g: 'bible' } },
        { score: 2, doc: { kind: 'verse', ref: 'Ps 23:2', text: 't', g: 'bible' } },
        { score: 1, doc: { kind: 'letter', title: 'A', text: 't', g: 'v2' } },
        { score: 1, doc: { kind: 'wtlb', title: 'B', text: 't', g: 'wtlb1' } },
      ],
      parsedTerms: [],
    }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="shepherd" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/Found/i).closest('.srch-results-summary').textContent).toContain('3 sections');
    expect(document.querySelectorAll('.srch-filter-chip')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\bWTLB\b/);
    // The corpus row is THE chip row: three pills, once.
    expect([...document.querySelectorAll('.srch-corpus-btn')].map((b) => b.textContent)).toEqual(['All', 'Scriptures', 'Volumes']);
    // Two verses in a scripture group: the sort toggle shows, alone in its row.
    const row = document.querySelector('.srch-filter-row');
    expect(row, 'the sort row').toBeTruthy();
    expect([...row.querySelectorAll('button')].map((b) => b.className)).toEqual(['srch-sort-btn']);
    expect(row.querySelector('.srch-sort-btn').textContent).toBe('Book order');
    vi.useRealTimers();
  });

  it("the groups render in the site's order, closed under Best Matches, in the Volumes corpus too", async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, defaultOpen }) => (
      <div className="stub-group" data-key={gkey} data-open={String(defaultOpen)} />
    );
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.title}</div>;
    const results = [];
    for (let i = 0; i < 20; i++) results.push({ score: 100 - i, doc: { kind: 'letter', title: 'seven-' + i, text: 't', g: 'v7' } });
    for (let i = 0; i < 20; i++) results.push({ score: 50 - i, doc: { kind: 'letter', title: 'two-' + i, text: 't', g: 'v2' } });
    results.push({ score: 1, doc: { kind: 'wtlb', title: 'wtlb', text: 't', g: 'wtlb1' } });
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results, parsedTerms: [] }));
    const props = { ...baseProps(), settings: { searchCorpus: 'volumes' } };
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="flood" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const groups = [...document.querySelectorAll('.stub-group')];
    expect(groups.map((g) => g.getAttribute('data-key'))).toEqual(['v2', 'v7', 'wtlb1']);
    // 41 hits: a contents list, every group closed ...
    expect(groups.map((g) => g.getAttribute('data-open'))).toEqual(['false', 'false', 'false']);
    // ... under the five best hits, which lead in the Volumes corpus as in All.
    const best = document.querySelector('.srch-top-results');
    expect(best, 'Best Matches').toBeTruthy();
    expect([...best.querySelectorAll('.stub-card')].map((c) => c.textContent)).toEqual(['seven-0', 'seven-1', 'seven-2', 'seven-3', 'seven-4']);
    vi.useRealTimers();
  });

  it('a short result set opens every group, and one group has no Best Matches row', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, defaultOpen }) => (
      <div className="stub-group" data-key={gkey} data-open={String(defaultOpen)} />
    );
    const run = async (results) => {
      /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results, parsedTerms: [] }));
      const props = baseProps();
      const { rerender, unmount } = render(<SearchScreen {...props} />);
      rerender(<SearchScreen {...props} query="flood" />);
      act(() => { vi.advanceTimersByTime(200); });
      await act(async () => { await Promise.resolve(); });
      const out = {
        open: [...document.querySelectorAll('.stub-group')].map((g) => g.getAttribute('data-open')),
        best: !!document.querySelector('.srch-top-results'),
      };
      unmount();
      return out;
    };
    const few = await run([
      { score: 2, doc: { kind: 'letter', title: 'a', text: 't', g: 'v7' } },
      { score: 1, doc: { kind: 'letter', title: 'b', text: 't', g: 'v1' } },
    ]);
    expect(few).toEqual({ open: ['true', 'true'], best: true });
    const many = [];
    for (let i = 0; i < 40; i++) many.push({ score: 40 - i, doc: { kind: 'letter', title: 'x' + i, text: 't', g: 'v3' } });
    expect(await run(many)).toEqual({ open: ['true'], best: false });
    vi.useRealTimers();
  });

  it('asks the engine for SEARCH_LIMIT per collection, so verses cannot crowd the letters out', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results: [], parsedTerms: [] }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="love" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const opts = /** @type {any} */ (window).VotSearchMini.search.mock.calls[0][1];
    expect(opts.perVolume).toBe(SEARCH_LIMIT);
    expect(opts.limit).toBeGreaterThan(SEARCH_LIMIT);
    vi.useRealTimers();
  });

  it("a capped collection's group is told so, by its group key", async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => (doc.volumeId === 'matthew-study' ? 'matthew' : doc.volumeId);
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, capped }) => <div className="stub-group" data-key={gkey} data-capped={String(capped)} />;
    const results = [
      { score: 3, doc: { kind: 'verse', volumeId: 'bible', bookId: 'john', ref: 'John 1:1', text: 't' } },
      { score: 2, doc: { kind: 'verse', volumeId: 'matthew-study', bookId: 'matthew', ref: 'Matthew 1:1', text: 't' } },
      { score: 1, doc: { kind: 'letter', volumeId: 'v7', title: 'L', text: 't' } },
    ];
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results, parsedTerms: [], capped: ['bible', 'matthew-study'], truncated: false }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="love" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const capped = Object.fromEntries([...document.querySelectorAll('.stub-group')].map((g) => [g.getAttribute('data-key'), g.getAttribute('data-capped')]));
    expect(capped).toEqual({ bible: 'true', v7: 'false', matthew: 'true' });
    expect(screen.getByText(/Found/i).closest('.srch-results-summary').textContent).toContain('3+ matches');
    vi.useRealTimers();
  });

  it('Book order shows for a letters-only search and puts each volume’s letters in number order, without closing the group', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.volumeId;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    let mounts = 0;
    function MountCountingGroup({ gkey, items }) {
      React.useEffect(() => { mounts++; }, []);
      return <div className="stub-group" data-key={gkey}>{items.map((e) => e.doc.letterNum).join(',')}</div>;
    }
    /** @type {any} */ (globalThis).SrchGroup = MountCountingGroup;
    const L = (num, score) => ({ score, doc: { kind: 'letter', volumeId: 'v7', letterNum: num, title: 'L' + num, ref: 'Volume Seven · Letter ' + num, text: 't' + num } });
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results: [L(55, 9), L(9, 8), L(53, 7), L(37, 6)], parsedTerms: [] }));
    const props = { ...baseProps(), settings: { searchCorpus: 'volumes' } };
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="flood" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('.stub-group').textContent).toBe('55,9,53,37');   // relevance
    const btn = document.querySelector('.srch-sort-btn');
    expect(btn, 'the toggle shows for letters alone').toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe('Sort results in book order');
    const before = mounts;
    fireEvent.click(btn);
    expect(document.querySelector('.stub-group').textContent).toBe('9,37,53,55');
    expect(mounts, 'the group was re-sorted in place, not re-mounted (a reader’s open group stays open)').toBe(before);
    vi.useRealTimers();
  });

  it('a corrected typo is said out loud, and the corrected query is one tap into the box', async () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({
      parsed: null, parsedTerms: [], corrections: [{ from: 'shephard', to: 'shepherd' }],
      results: [{ score: 1, doc: { kind: 'verse', ref: 'Psalms 23:1', text: 'The LORD is my shepherd' } }],
    }));
    const props = { ...baseProps(), onQueryChange };
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="my Shephard" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const note = document.querySelector('.srch-corrected');
    expect(note, 'the note').toBeTruthy();
    expect(note.textContent).toBe('No results for “shephard”. Showing results for my shepherd.');
    fireEvent.click(note.querySelector('.srch-corrected-link'));
    expect(onQueryChange).toHaveBeenCalledWith('my shepherd');
    vi.useRealTimers();
  });

  it('no correction, no note', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({
      parsed: null, parsedTerms: [], corrections: [],
      results: [{ score: 1, doc: { kind: 'verse', ref: 'Psalms 23:1', text: 'The LORD is my shepherd' } }],
    }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="shepherd" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('.srch-corrected')).toBeNull();
    vi.useRealTimers();
  });

  it('(a) the summary keeps the exact count below the cap', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({
      parsed: null,
      results: [{ score: 1, doc: { kind: 'verse', ref: 'Ps 23:1', text: 't' } }],
      parsedTerms: [],
    }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="shepherd" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/Found/i).closest('.srch-results-summary').textContent).toContain('1 match');
    vi.useRealTimers();
  });

  it('search-2: the screen hands the hits their TERMS under a nav card', async () => {
    /* WHAT THIS CAN AND CANNOT SEE, because it decides what the assertion is.
       This file stubs `SrchCard` and `SrchGroup` to `() => null`, so no snippet and
       no `<mark>` can ever render here — measured: with a nav parse and one result,
       the summary reads "1 match" while both `.srch-groups` containers are EMPTY.
       Asserting the highlight would mean swapping in the real components and then
       testing my own wiring of them.

       So the witness sits one boundary earlier: the `terms` the screen PASSES. That
       is exactly what the fix changes — `expandSnippetTerms` returns [] unless the
       parse it is handed is a TEXT one, so under a nav card the terms would be empty
       and the hits would render bare. The `<mark>` itself is the e2e harness's to
       see; nothing in this file can. */
    vi.useFakeTimers();
    const seenTerms = [];
    const realGroup = /** @type {any} */ (globalThis).SrchGroup;
    /** @type {any} */ (globalThis).SrchGroup = (props) => { seenTerms.push(props.terms); return null; };
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({
      // the CARD's kind…
      parsed: { kind: 'ref-book', bookId: 'numbers', bookTitle: 'Numbers' },
      // …and the same query read as TEXT, which is what the highlighter needs.
      textQuery: { kind: 'text', phrase: null, terms: ['numbers'], must: [], mustNot: [] },
      parsedTerms: ['numbers'],
      results: [{ score: 1, doc: { kind: 'verse', ref: 'Ps 147:4', text: 'He telleth the numbers of the stars.' } }],
    }));
    try {
      const props = baseProps();
      const { rerender } = render(<SearchScreen {...props} />);
      rerender(<SearchScreen {...props} query="numbers" />);
      act(() => { vi.advanceTimersByTime(200); });
      await act(async () => { await Promise.resolve(); });

      // The group was rendered at all — otherwise the assertion below is vacuous.
      expect(seenTerms.length).toBeGreaterThan(0);
      const last = seenTerms[seenTerms.length - 1] || [];
      expect(last).toContain('numbers');
    } finally {
      /** @type {any} */ (globalThis).SrchGroup = realGroup;
      vi.useRealTimers();
    }
  });

  it('(b) each recent search is individually removable via ConfirmStrip ("remove" vocabulary)', () => {
    /** @type {any} */ (window).getRecentSearches = () => ['mercy', 'grace'];
    /** @type {any} */ (window).removeRecentSearch = vi.fn(() => ['grace']);
    render(<SearchScreen {...baseProps()} settings={{ historyEnabled: true }} />);
    expect(screen.getByText('mercy')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove recent search mercy'));
    // ConfirmStrip replaces the chips (per-instance registry; back dismisses
    // the confirm, not the screen — ConfirmStrip owns that contract).
    expect(screen.getByText('Yes, remove')).toBeTruthy();
    expect(screen.queryByText('mercy')).toBeNull();
    fireEvent.click(screen.getByText('Yes, remove'));
    expect(/** @type {any} */ (window).removeRecentSearch).toHaveBeenCalledWith('mercy');
    // Strip closed; remaining recent still listed, removed one gone.
    expect(screen.queryByText('Yes, remove')).toBeNull();
    expect(screen.getByText('grace')).toBeTruthy();
    expect(screen.queryByText('mercy')).toBeNull();
  });

  it('(b) cancelling the confirm restores the chips untouched', () => {
    /** @type {any} */ (window).getRecentSearches = () => ['mercy'];
    /** @type {any} */ (window).removeRecentSearch = vi.fn(() => []);
    render(<SearchScreen {...baseProps()} settings={{ historyEnabled: true }} />);
    fireEvent.click(screen.getByLabelText('Remove recent search mercy'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(/** @type {any} */ (window).removeRecentSearch).not.toHaveBeenCalled();
    expect(screen.getByText('mercy')).toBeTruthy();
  });

  it('a slow older query resolving late cannot overwrite the newer results (stale guard)', async () => {
    vi.useFakeTimers();
    // Per-query controllable promises: "mercy" is held open, "grace" resolves
    // first — the engine yields the main thread mid-search, so this ordering
    // is reachable in production, not synthetic.
    const pending = {};
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(
      (q) => new Promise((res) => { pending[q] = res; }),
    );
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="mercy" />);
    act(() => { vi.advanceTimersByTime(200); }); // "mercy" now in flight
    rerender(<SearchScreen {...props} query="grace" />);
    act(() => { vi.advanceTimersByTime(200); }); // "grace" in flight too
    await act(async () => {
      pending.grace({ parsed: null, results: [{ score: 1, doc: { kind: 'verse', ref: 'Eph 2:8', text: 'grace' } }], parsedTerms: [] });
      await Promise.resolve();
    });
    expect(screen.getByText(/Found/i).closest('.srch-results-summary').textContent).toContain('1 match');
    await act(async () => {
      pending.mercy({ parsed: null, results: [], parsedTerms: [] });
      await Promise.resolve();
    });
    // The stale "mercy" resolution (0 results) must NOT clobber grace's hit.
    expect(screen.getByText(/Found/i).closest('.srch-results-summary').textContent).toContain('1 match');
    vi.useRealTimers();
  });

  /* search-6 — the SCREEN half. `search()` parsing before it waits is useless while
     the screen refuses to call it: `if (!buildInfo.ready) return;` sat at the top of
     the debounced effect, so during a ~10 s cold build a reference or a command
     produced nothing at all. These two cases are the reader-facing statement, and
     the second is what stops the first passing for the wrong reason. */
  it('search-6: a reference is searched for while the index is still building', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.getState = () => ({ ready: false, building: true });
    /** @type {any} */ (window).VotSearchMini.init = vi.fn(() => new Promise(() => {}));
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({
      parsed: { kind: 'bible', bookId: 'genesis', bookTitle: 'Genesis', chapter: 1, label: 'Genesis 1' },
      results: [], parsedTerms: [],
    }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="gen 1" />);
    await act(async () => { vi.advanceTimersByTime(200); await Promise.resolve(); });

    // The engine was ASKED, with the index nowhere near ready.
    expect(/** @type {any} */ (window).VotSearchMini.search).toHaveBeenCalled();
    expect(/** @type {any} */ (window).VotSearchMini.getState().ready).toBe(false);
    vi.useRealTimers();
  });

  it('search-6 CONTROL: a build that never finishes is genuinely never finished', async () => {
    /* Without this, the case above is satisfied by a harness whose `init` quietly
       resolved and made the index ready — which would prove nothing about the
       building window at all. */
    vi.useFakeTimers();
    let initSettled = false;
    /** @type {any} */ (window).VotSearchMini.getState = () => ({ ready: false, building: true });
    /** @type {any} */ (window).VotSearchMini.init = vi.fn(() => new Promise(() => {}).then(() => { initSettled = true; }));
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({
      parsed: { kind: 'command', action: 'home', label: 'Go home' }, results: [], parsedTerms: [],
    }));
    // baseProps' onCommand is a noop, and this case needs to see the call.
    const props = Object.assign(baseProps(), { onCommand: vi.fn() });
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="/home" />);
    await act(async () => { vi.advanceTimersByTime(200); await Promise.resolve(); });

    expect(/** @type {any} */ (window).VotSearchMini.search).toHaveBeenCalled();
    expect(initSettled).toBe(false);          // the build really did not complete
    // …and the command reached the screen's own handler, which is what a reader sees.
    expect(props.onCommand).toHaveBeenCalledWith('home');
    vi.useRealTimers();
  });

  it('unmounting mid-build and mid-search leaves no dangling setState (back out of Search)', async () => {
    vi.useFakeTimers();
    let progressCb = null;
    let resolveInit;
    /** @type {any} */ (window).VotSearchMini.getState = () => ({ ready: false });
    /** @type {any} */ (window).VotSearchMini.init = vi.fn((opts) => {
      progressCb = opts && opts.onProgress;
      return new Promise((res) => { resolveInit = res; });
    });
    let resolveSearch;
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(
      () => new Promise((res) => { resolveSearch = res; }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props = baseProps();
    const { unmount } = render(<SearchScreen {...props} />);
    await act(async () => { await Promise.resolve(); }); // corpus loads settle → init starts
    expect(/** @type {any} */ (window).VotSearchMini.init).toHaveBeenCalled();
    unmount();
    // Late build progress + completion after unmount: guarded no-ops.
    await act(async () => {
      if (progressCb) progressCb(5, 10);
      resolveInit();
      if (resolveSearch) resolveSearch({ parsed: null, results: [], parsedTerms: [] });
      await Promise.resolve();
    });
    // The guards drop both late callbacks: no thrown error, no React noise.
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe('SearchScreen — the index waits for the Bible Studies (v09-perf-01)', () => {
  /* The screen awaited the Bible, Matthew, VOT and Answers corpora but never the
     studies, so a reader who went from boot straight to Search built (and cached)
     an index with no study chapters, and the cache key flipped with whether the
     Studies screen had been opened first: a ~10 s cold rebuild each flip. */
  const noop = () => {};
  beforeEach(() => {
    /** @type {any} */ (globalThis).ScreenLayout = ({ children }) => <div>{children}</div>;
    /** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;
    /** @type {any} */ (globalThis).SRCH_QUICK_PICKS = [];
    /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {} };
    /** @type {any} */ (window).getRecentSearches = () => [];
  });
  afterEach(() => {
    cleanup();
    delete /** @type {any} */ (window).VotSearchMini;
    delete /** @type {any} */ (globalThis).loadBibleStudies;
  });

  it('builds only after loadBibleStudies has settled', async () => {
    let settle = noop;
    /** @type {any} */ (globalThis).loadBibleStudies = vi.fn(() => new Promise((r) => { settle = () => r(true); }));
    const init = vi.fn(() => Promise.resolve());
    /** @type {any} */ (window).VotSearchMini = {
      getState: () => ({ ready: false }), init, suggest: () => [], fuzzyBookSuggest: () => null,
      search: () => Promise.resolve({ parsed: null, results: [], parsedTerms: [] }),
    };
    render(<SearchScreen query="" onQueryChange={noop} settings={{}} onSettingsChange={noop} onSelect={noop}
      onBack={noop} searchScope={null} searchContext={null} onToggleScope={noop} onCommand={noop} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(/** @type {any} */ (globalThis).loadBibleStudies).toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    await act(async () => { settle(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(init).toHaveBeenCalled();
  });
});

/* Songs of the Letters (L8): ONE shortcut row at the top when the LOADED catalog matches the query — an
   in-memory filter, never a MiniSearch document (the index is not rebuilt, the catalog not fetched). */
describe('SearchScreen — the songs shortcut row', () => {
  const noop = () => {};
  let Songs;
  let Parts;
  beforeEach(async () => {
    Songs = await import('../../utils/song-catalog.js');
    Parts = await import('../components/SongParts.jsx');
    const { SONG_FIXTURE } = await import('../../utils/song-catalog.fixture.js');
    Songs._resetSongCatalogForTests();
    Songs.adoptSongCatalog(SONG_FIXTURE);
    /** @type {any} */ (globalThis).ScreenLayout = ({ children }) => <div>{children}</div>;
    /** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;
    /** @type {any} */ (globalThis).SRCH_QUICK_PICKS = [];
    /** @type {any} */ (globalThis).SongCatalog = Songs.SongCatalog;
    /** @type {any} */ (globalThis).findSongFamilies = Parts.findSongFamilies;
    /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {} };
    /** @type {any} */ (window).getRecentSearches = () => [];
    /** @type {any} */ (window).VotSearchMini = {
      getState: () => ({ ready: false }), init: vi.fn(() => new Promise(() => {})), suggest: () => [], fuzzyBookSuggest: () => null,
      search: vi.fn(() => Promise.resolve({ parsed: null, results: [], parsedTerms: [] })),
    };
  });
  afterEach(() => {
    cleanup();
    Songs._resetSongCatalogForTests();
    for (const k of ['SongCatalog', 'findSongFamilies']) delete /** @type {any} */ (globalThis)[k];
    delete /** @type {any} */ (window).VotSearchMini;
  });
  const renderAt = (query, onOpenSongs) => render(<SearchScreen query={query} onQueryChange={noop} settings={{}} onSettingsChange={noop}
    onSelect={noop} onBack={noop} searchScope={null} searchContext={null} onToggleScope={noop} onCommand={noop} onOpenSongs={onOpenSongs} />);

  it('"love awaits" shows the row, which opens the Songs hub with the filter filled', () => {
    const onOpenSongs = vi.fn();
    renderAt('love awaits', onOpenSongs);
    const row = screen.getByRole('button', { name: /1 song matches “love awaits”/ });
    fireEvent.click(row);
    expect(onOpenSongs).toHaveBeenCalledWith('love awaits');
  });

  it('no match, a one-letter query, or no catalog loaded: no row', () => {
    renderAt('zzzz', vi.fn());
    expect(screen.queryByText(/songs? match/)).toBeNull();
    cleanup();
    renderAt('l', vi.fn());
    expect(screen.queryByText(/songs? match/)).toBeNull();
    cleanup();
    Songs._resetSongCatalogForTests();
    renderAt('love awaits', vi.fn());
    expect(screen.queryByText(/songs? match/)).toBeNull();
  });
});
