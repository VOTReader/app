/* SRCH4 — snippet synonym-highlight term expansion.
   ────────────────────────────────────────────────
   expandSnippetTerms decides which words SrchSnippet marks. When synonym search
   is on, a verse surfaced by a synonym (search "shepherd" → a "pastor" verse)
   must highlight the matched synonym, not show it plain. Pure function → tested
   directly (no need to render the screen). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { SrchGroup as RealSrchGroup } from '../components/SrchGroup.jsx';
/* Node builtins in an app/src test: this tsconfig has no node types, so the
   three specifiers are ts-ignored (the use-lazy-bundles.test.jsx precedent). */
// @ts-ignore -- no node types in this tsconfig
import { readFileSync } from 'node:fs';
// @ts-ignore -- no node types in this tsconfig
import { resolve, dirname } from 'node:path';
// @ts-ignore -- no node types in this tsconfig
import { fileURLToPath } from 'node:url';
import {
  expandSnippetTerms, matchCountLabel, useImeHideBlur, SearchScreen, SEARCH_LIMIT, groupInSiteOrder, correctedQuery, letterRefCards,
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

  it('marks the run the engine found in a row (textQuery.run) with the real word', () => {
    const stop = new Set(['for', 'you', 'to', 'me']);
    expect(expandSnippetTerms({ kind: 'text', run: 'for you to embrace me' }, ['for', 'you', 'to', 'embrace', 'me'], MAP, false, stop))
      .toEqual(['for you to embrace me', 'embrace']);
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
/* The screen's grouping and sort globals (index.html's classic scripts). Every block that renders the screen sets
   them in its own beforeEach, so none leans on another block having run first (nw27: the suite run shuffled). */
function setScreenGlobals() {
  /** @type {any} */ (globalThis).SrchCard = () => null;
  /** @type {any} */ (globalThis).SrchGroup = () => null;
  /** @type {any} */ (globalThis).SRCH_GROUP_META = {};
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = {};
  /** @type {any} */ (globalThis).srchGroupKey = () => 'g';
  // [8] the sort helper — a pure fn; the real one so the screen's memo behaves.
  /** @type {any} */ (globalThis).srchSortCanonical = realSrchSortCanonical;
  /** @type {any} */ (globalThis).SRCH_CANONICAL_BOOK_INDEX = realCanonIndex;
}

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
    setScreenGlobals();
    /** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;
    /** @type {any} */ (globalThis).SRCH_QUICK_PICKS = [];
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
    expect(screen.getByRole('combobox', { name: 'Search' }).getAttribute('type')).toBe('search');
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
    const input = screen.getByRole('combobox', { name: 'Search' });
    expect(input.getAttribute('placeholder')).toBe('Search everything');
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
    expect(document.querySelector('.srch-searching'), 'the bar, for the eye').toBeTruthy();
    await act(async () => {
      resolveSearch({ parsed: null, results: [], parsedTerms: [] });
      await Promise.resolve();
    });
    // search200 B9: the region stays, and says what came of it; the bar goes
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent).not.toMatch(/Searching/i);
    expect(document.querySelector('.srch-searching')).toBeNull();
    vi.useRealTimers();
  });

  /* THE MEANING ARRIVES AFTER THE FIRST SEARCH (sr11 S22 look, 2026-10-15). A search typed before the on-device model
     was ready ran on the words alone, and the screen kept that list until the query changed: on the S22 'stay alert
     because nobody knows when the lord will come back' led with an unrelated letter, while the engine asked again led
     with "Keep Watch". The screen now searches again, quietly, once the model is ready, and on a search it resumes. */
  it('a search run before the meaning model was ready runs again when it is, and its order replaces the first', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey }) => <div className="stub-group" data-key={gkey} />;
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.title}</div>;
    const lead = () => { const c = document.querySelector('.srch-top-results .stub-card'); return c && c.textContent; };
    const E = /** @type {any} */ (window).VotSearchMini;
    /** @type {any} */ let ready;
    E.whenMeaningReady = vi.fn(() => new Promise((res) => { ready = res; }));
    // six results: five or fewer would have no Best Matches row to lead (search200 B2)
    const card = (/** @type {string} */ title) => [title, 'O1', 'O2', 'O3', 'O4', 'O5'].map((t, i) => ({ score: 10 - i, doc: { kind: 'letter', title: t, text: 't', g: i ? 'v7' : 'v1' } }));
    E.search = vi.fn()
      .mockResolvedValueOnce({ parsed: null, results: card('Words Only'), parsedTerms: [], meaningLater: true })
      .mockResolvedValue({ parsed: null, results: card('Keep Watch'), parsedTerms: [], meaningLater: false });
    const props = baseProps();
    const q = 'nobody knows when the lord will come back';
    const { rerender, unmount } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query={q} />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(lead()).toBe('Words Only');
    expect(E.search).toHaveBeenCalledTimes(1);
    expect(E.whenMeaningReady).toHaveBeenCalledTimes(1);
    await act(async () => { ready(true); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    expect(E.search).toHaveBeenCalledTimes(2);
    expect(lead()).toBe('Keep Watch');
    expect(document.querySelector('.srch-searching'), 'no "Searching" bar while it ranks again').toBeNull();
    expect(screen.getByRole('status').textContent, 'nor in the status region').not.toMatch(/Searching/);
    unmount();

    // Opened a result before the model was ready, then Back: the kept list ranks again too.
    E.search = vi.fn()
      .mockResolvedValueOnce({ parsed: null, results: card('Words Only'), parsedTerms: [], meaningLater: true })
      .mockResolvedValue({ parsed: null, results: card('Keep Watch'), parsedTerms: [], meaningLater: false });
    E.whenMeaningReady = vi.fn(() => new Promise((res) => { ready = res; }));
    const q2 = 'stay alert because nobody knows';
    const first = render(<SearchScreen {...props} />);
    first.rerender(<SearchScreen {...props} query={q2} />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    first.unmount();
    render(<SearchScreen {...props} query={q2} />);
    expect(lead()).toBe('Words Only');
    await act(async () => { ready(true); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    expect(lead()).toBe('Keep Watch');
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
    const summary = document.querySelector('.srch-results-summary');
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
    expect(document.querySelector('.srch-results-summary').textContent).toContain('3 sections');
    expect(document.querySelectorAll('.srch-filter-chip')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\bWTLB\b/);
    // The corpus row is THE chip row: three pills, once.
    expect([...document.querySelectorAll('.srch-corpus-btn')].map((b) => b.textContent)).toEqual(['All', 'Scriptures', 'Volumes']);
    // Two verses in a scripture group: the order switch shows, alone in its row, both orders named (sr12).
    const row = document.querySelector('.srch-filter-row');
    expect(row, 'the sort row').toBeTruthy();
    expect([...row.querySelectorAll('button')].map((b) => b.className)).toEqual(['srch-sort-btn active', 'srch-sort-btn']);
    expect([...row.querySelectorAll('.srch-sort-btn')].map((b) => b.textContent)).toEqual(['Relevance', 'Book order']);
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
    // Five or fewer: Best Matches would be the whole list again (search200 B2), so the open groups are the list.
    expect(few).toEqual({ open: ['true', 'true'], best: false });
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

  /* sr7: the engine ranks in slices now; a search the reader has typed past is told to stop at its next turn. */
  it('a newer query aborts the search it replaces', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results: [], parsedTerms: [] }));
    try {
      const props = baseProps();
      const { rerender } = render(<SearchScreen {...props} />);
      rerender(<SearchScreen {...props} query="love" />);
      act(() => { vi.advanceTimersByTime(200); });
      await act(async () => { await Promise.resolve(); });
      const first = /** @type {any} */ (window).VotSearchMini.search.mock.calls[0][1].signal;
      expect(first && first.aborted).toBe(false);
      rerender(<SearchScreen {...props} query="love one" />);
      expect(first.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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
    expect(document.querySelector('.srch-results-summary').textContent).toContain('3+ matches');
    vi.useRealTimers();
  });

  it('Book order shows for a letters-only search and puts each volume’s letters in number order, the lone group open with its full page', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.volumeId;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, items, defaultOpen, page }) => (
      <div className="stub-group" data-key={gkey} data-open={String(defaultOpen)} data-page={String(page)}>{items.map((e) => e.doc.letterNum).join(',')}</div>
    );
    const L = (num, score) => ({ score, doc: { kind: 'letter', volumeId: 'v7', letterNum: num, title: 'L' + num, ref: 'Volume Seven · Letter ' + num, text: 't' + num } });
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results: [L(55, 9), L(9, 8), L(53, 7), L(37, 6)], parsedTerms: [] }));
    const props = { ...baseProps(), settings: { searchCorpus: 'volumes' } };
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="flood" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('.stub-group').textContent).toBe('55,9,53,37');   // relevance
    const btn = [...document.querySelectorAll('.srch-sort-btn')].find((b) => b.textContent === 'Book order');
    expect(btn, 'the toggle shows for letters alone').toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(document.querySelector('.stub-group').textContent).toBe('9,37,53,55');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    // A lone group keeps its full page (the short first page is for several collections at once).
    expect(document.querySelector('.stub-group').getAttribute('data-open')).toBe('true');
    expect(document.querySelector('.stub-group').getAttribute('data-page')).toBe('undefined');
    vi.useRealTimers();
  });

  /* sr12, Corbin 10-14 20:2x: "the current button 'relevance' vs 'book order' doesn't seem to actually do anything".
     It re-sorted inside the groups only, and a long result set opens with every group closed under Best Matches,
     the one row the switch never touched: the reader saw the button's label flip and nothing else. Book order
     must change what is on screen: Best Matches (relevance's row) goes, every collection opens in reading order. */
  it('Book order changes what a long result set shows: Best Matches goes, every collection opens in reading order', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, items, defaultOpen, page, view }) => (
      <div className="stub-group" data-key={gkey} data-open={String(defaultOpen)} data-page={String(page)} data-view={String(view)}>
        {items.map((e) => e.doc.ref).join(',')}
      </div>
    );
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.ref}</div>;
    const V = (bookId, c, v, score) => ({ score, doc: { kind: 'verse', g: 'bible', bookId, chapterNum: c, verseNum: v, ref: bookId + ' ' + c + ':' + v, text: 't' } });
    const L = (g, num, score) => ({ score, doc: { kind: g === 'wtlb1' ? 'wtlb' : 'letter', g, letterNum: num, ref: g + '#' + num, title: g + num, text: 'l' + num } });
    // Relevance order, as the engine hands it over: Malachi first, the original letter before its WTLB reprint.
    const results = [V('malachi', 3, 6, 50), L('v1', 14, 49), L('wtlb1', 88, 48), V('genesis', 15, 7, 47), V('exodus', 6, 2, 46)];
    for (let i = 0; i < 20; i++) results.push(V('psalms', 100 - i, 1, 40 - i));
    for (let i = 0; i < 12; i++) results.push(L('v1', 30 - i, 20 - i));
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results, parsedTerms: [] }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="I am the Lord and I do not change" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const groups = () => [...document.querySelectorAll('.stub-group')];
    const sw = (name) => [...document.querySelectorAll('.srch-sort-btn')].find((b) => b.textContent === name);
    // Relevance: Best Matches leads, the 37 results open as a closed contents list.
    expect([...document.querySelectorAll('.srch-sort-btn')].map((b) => b.textContent), 'both orders are named in the switch').toEqual(['Relevance', 'Book order']);
    expect(sw('Relevance').getAttribute('aria-pressed')).toBe('true');
    expect(sw('Book order').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.srch-top-results'), 'Best Matches').toBeTruthy();
    expect(groups().map((g) => g.getAttribute('data-open'))).toEqual(['false', 'false', 'false']);
    const relevanceShows = document.body.textContent;
    fireEvent.click(sw('Book order'));
    // Book order: what the reader sees changes.
    expect(document.body.textContent).not.toBe(relevanceShows);
    expect(sw('Book order').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.srch-top-results'), 'no relevance row under Book order').toBeNull();
    expect(document.querySelector('.srch-sort-note').textContent).toMatch(/Genesis to Revelation/);
    expect(groups().map((g) => g.getAttribute('data-key')), 'the original before its reprint').toEqual(['bible', 'v1', 'wtlb1']);
    expect(groups().map((g) => g.getAttribute('data-open')), 'every collection open').toEqual(['true', 'true', 'true']);
    expect(groups().map((g) => g.getAttribute('data-view'))).toEqual(['book', 'book', 'book']);
    expect(groups().map((g) => g.getAttribute('data-page')), 'a short first page each, so a phone draws 3 lists, not 3 x 50 cards').toEqual(['10', '10', '10']);
    const bible = groups()[0].textContent.split(',');
    expect(bible.slice(0, 3)).toEqual(['genesis 15:7', 'exodus 6:2', 'psalms 81:1']);
    expect(bible[bible.length - 1]).toBe('malachi 3:6');
    expect(groups()[1].textContent.split(',').slice(0, 3)).toEqual(['v1#14', 'v1#19', 'v1#20']);
    // And back: relevance's screen again.
    fireEvent.click(sw('Relevance'));
    expect(document.querySelector('.srch-top-results')).toBeTruthy();
    expect(groups().map((g) => g.getAttribute('data-open'))).toEqual(['false', 'false', 'false']);
    expect(document.body.textContent).toBe(relevanceShows);
    vi.useRealTimers();
  });

  /* sr13 (the S22, 10-14): Book order on "I am The Lord and I do not change" opened on Genesis 4:9 ("Am I my brother's
     keeper?"), a verse holding a few of its words, because it listed all 1,344 loose matches in reading order. The
     engine marks a passage search's results `close` (the typed words together) or not: Book order lists the close ones
     first, each collection in reading order, and the rest behind one line. */
  it('Book order on a passage search opens on the close matches in reading order, the loose ones behind a line', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, items, defaultOpen, page, view, capped }) => (
      <div className="stub-group" data-key={gkey} data-open={String(defaultOpen)} data-page={String(page)} data-view={String(view)} data-capped={String(capped)}>
        {items.map((e) => e.doc.ref).join(',')}
      </div>
    );
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.ref}</div>;
    const V = (bookId, c, v, score, close) => ({ score, close, doc: { kind: 'verse', g: 'bible', volumeId: 'bible', bookId, chapterNum: c, verseNum: v, ref: bookId + ' ' + c + ':' + v, text: 't' } });
    const L = (g, num, score, close) => ({ score, close, doc: { kind: g === 'wtlb1' ? 'wtlb' : 'letter', g, volumeId: g, letterNum: num, ref: g + '#' + num, title: g + num, text: 'l' + num } });
    // Relevance order, as the engine hands it over: the close ones lead, the original letter before its WTLB reprint.
    const results = [L('v1', 30, 50, true), V('malachi', 3, 6, 49, true), L('v1', 14, 48, true), L('wtlb1', 88, 47, true), V('genesis', 4, 9, 46, false), V('exodus', 6, 2, 45, false)];
    for (let i = 0; i < 20; i++) results.push(V('psalms', 100 - i, 1, 40 - i, false));
    for (let i = 0; i < 12; i++) results.push(L('v1', 29 - i, 20 - i, false));
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results, parsedTerms: [], capped: ['bible'], truncated: false }));
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="I am the Lord and I do not change" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const groups = () => [...document.querySelectorAll('.stub-group')];
    const sw = (name) => [...document.querySelectorAll('.srch-sort-btn')].find((b) => b.textContent === name);
    const more = () => document.querySelector('.srch-loose-more');
    // Relevance is untouched: Best Matches, every result in its collection, no line.
    expect(document.querySelector('.srch-top-results')).toBeTruthy();
    expect(groups().map((g) => g.textContent.split(',').length)).toEqual([23, 14, 1]);
    expect(more()).toBeNull();
    const relevanceShows = document.body.textContent;
    fireEvent.click(sw('Book order'));
    expect(document.querySelector('.srch-top-results')).toBeNull();
    // The close matches only, each collection in reading order, the original before its reprint.
    expect(groups().map((g) => g.getAttribute('data-key'))).toEqual(['bible', 'v1', 'wtlb1']);
    expect(groups().map((g) => g.textContent)).toEqual(['malachi 3:6', 'v1#14,v1#30', 'wtlb1#88']);
    expect(groups().map((g) => g.getAttribute('data-open'))).toEqual(['true', 'true', 'true']);
    expect(groups().map((g) => g.getAttribute('data-view'))).toEqual(['book', 'book', 'book']);
    // A close list is all its collection holds closely: no "400+" on it.
    expect(groups().map((g) => g.getAttribute('data-capped'))).toEqual(['false', 'false', 'false']);
    expect(document.querySelector('.srch-close-label').textContent).toMatch(/closest matches/i);
    expect(document.body.textContent).not.toMatch(/genesis 4:9/);
    // The rest are one tap away, counted.
    expect(more().textContent).toMatch(/Show 34\+ partial matches/);
    fireEvent.click(more());
    expect(more(), 'the line goes once the loose ones show').toBeNull();
    expect(document.querySelector('.srch-loose-label').textContent).toMatch(/partial matches/i);
    const loose = groups().filter((g) => g.getAttribute('data-view') === 'book-more');
    expect(loose.map((g) => g.getAttribute('data-key'))).toEqual(['bible', 'v1']);
    expect(loose[0].textContent.split(',').slice(0, 3)).toEqual(['genesis 4:9', 'exodus 6:2', 'psalms 81:1']);
    expect(loose[0].getAttribute('data-capped'), 'the capped collection says so on its loose list').toBe('true');
    expect(loose[1].textContent.split(',').slice(0, 2)).toEqual(['v1#18', 'v1#19']);
    // A new search starts with the line again; back to Relevance shows relevance's screen.
    fireEvent.click(sw('Relevance'));
    expect(document.body.textContent).toBe(relevanceShows);
    vi.useRealTimers();
  });

  it('Book order lists every result when the engine marks none loose, or none close', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, items }) => <div className="stub-group" data-key={gkey}>{items.map((e) => e.doc.ref).join(',')}</div>;
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.ref}</div>;
    const V = (bookId, c, close) => ({ score: 1, close, doc: { kind: 'verse', g: 'bible', bookId, chapterNum: c, verseNum: 1, ref: bookId + ' ' + c, text: 't' } });
    const L = (num, close) => ({ score: 1, close, doc: { kind: 'letter', g: 'v1', letterNum: num, ref: 'v1#' + num, title: 'L', text: 'l' + num } });
    for (const mark of [true, false]) {
      const results = [L(9, mark), V('john', 3, mark), V('genesis', 1, mark), L(2, mark)];
      /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, results, parsedTerms: [] }));
      const props = baseProps();
      const { rerender, unmount } = render(<SearchScreen {...props} />);
      rerender(<SearchScreen {...props} query={'a passage typed out ' + mark} />);
      act(() => { vi.advanceTimersByTime(200); });
      await act(async () => { await Promise.resolve(); });
      fireEvent.click([...document.querySelectorAll('.srch-sort-btn')].find((b) => b.textContent === 'Book order'));
      expect([...document.querySelectorAll('.stub-group')].map((g) => g.textContent), String(mark)).toEqual(['genesis 1,john 3', 'v1#2,v1#9']);
      expect(document.querySelector('.srch-loose-more'), String(mark)).toBeNull();
      expect(document.querySelector('.srch-close-label'), String(mark)).toBeNull();
      unmount();
    }
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

  /* A passage's card caps the words' matches at five (search-2), and "resurrection"
     is the word of hundreds of letters: the summary offers the rest (search audit
     2026-09-27); the card comes before the summary that counts the words' matches. */
  it('under a card, the summary offers every match, and the card comes first', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).SrchCard = ({ isDirect }) => (isDirect ? <div className="stub-direct" /> : null);
    const card = { kind: 'named-passage', bookId: 'matthew', bookTitle: 'Matthew', chapter: 28, label: 'resurrection' };
    const hit = (i) => ({ score: 10 - i, doc: { kind: 'letter', title: 'L' + i, text: 't', ref: 'Volume One · Letter ' + i } });
    const search = vi.fn((q, opts) => Promise.resolve(opts.allWords
      ? { parsed: card, parsedTerms: ['resurrection'], results: [0, 1, 2, 3, 4, 5, 6, 7].map(hit), truncated: false }
      : { parsed: card, parsedTerms: ['resurrection'], results: [0, 1, 2, 3, 4].map(hit), truncated: true }));
    /** @type {any} */ (window).VotSearchMini.search = search;
    const props = baseProps();
    const { rerender } = render(<SearchScreen {...props} />);
    rerender(<SearchScreen {...props} query="resurrection" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    const summary = document.querySelector('.srch-results-summary');
    // search200 B5: "Found 5+ matches" under the card read as a count of the passage; the five are the closest
    expect(summary.textContent).toBe('Showing closest matches · Show all');
    const direct = document.querySelector('.stub-direct');
    expect(direct.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING, 'the card before the summary').toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(search.mock.calls[search.mock.calls.length - 1][1].allWords).toBe(true);
    expect(document.querySelector('.srch-results-summary').textContent).toContain('Found 8 matches');
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
    vi.useRealTimers();
  });

  it('Back to the same search opens on its results at once, without searching again', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, memo }) => <div className="stub-group" data-key={gkey} data-memo={memo} />;
    const search = vi.fn(() => Promise.resolve({ parsed: null, parsedTerms: ['remembered'], results: [
      { score: 2, doc: { kind: 'letter', title: 'a', text: 't', g: 'v7' } },
      { score: 1, doc: { kind: 'letter', title: 'b', text: 't', g: 'v1' } },
    ] }));
    /** @type {any} */ (window).VotSearchMini.search = search;
    const props = { ...baseProps(), settings: { searchCorpus: 'volumes' } };
    const first = render(<SearchScreen {...props} />);
    first.rerender(<SearchScreen {...props} query="remembered words" />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(search).toHaveBeenCalledTimes(1);
    first.unmount();
    // the screen comes back (Back from the letter): the groups are there on the first render
    render(<SearchScreen {...props} query="remembered words" />);
    const groups = [...document.querySelectorAll('.stub-group')];
    expect(groups.map((g) => g.getAttribute('data-key'))).toEqual(['v1', 'v7']);
    expect(groups[0].getAttribute('data-memo')).toContain('remembered words');
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    expect(search, 'not searched again').toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  /* The UI walk (search audit 2026-09-27). */
  const typeAndWait = async (props, q) => {
    const r = render(<SearchScreen {...props} />);
    r.rerender(<SearchScreen {...props} query={q} />);
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
    return r;
  };

  it('a picked suggestion stays picked: the list does not reopen on the query it set', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.suggest = () => [{ query: 'psalm 23', label: 'Psalm 23', kind: 'Ref' }];
    let q = 'psa';
    const props = { ...baseProps(), onQueryChange: (v) => { q = v; } };
    const r = await typeAndWait(props, 'psa');
    const item = document.querySelector('.srch-suggest-item');
    expect(item, 'the list, open').toBeTruthy();
    fireEvent.click(item);
    r.rerender(<SearchScreen {...props} query={q} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(q).toBe('psalm 23');
    expect(document.querySelector('.srch-suggest-item'), 'closed after the pick').toBeNull();
    vi.useRealTimers();
  });

  it('Escape closes the suggestions and leaves the query alone', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.suggest = () => [{ query: 'psalm 23', label: 'Psalm 23', kind: 'Ref' }];
    const onQueryChange = vi.fn();
    await typeAndWait({ ...baseProps(), onQueryChange }, 'psa');
    const input = screen.getByRole('combobox', { name: 'Search' });
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { input.dispatchEvent(ev); });
    expect(ev.defaultPrevented, 'the search box does not clear itself as well').toBe(true);
    expect(document.querySelector('.srch-suggest-item')).toBeNull();
    expect(onQueryChange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('the clear button keeps the focus in the box', async () => {
    vi.useFakeTimers();
    await typeAndWait(baseProps(), 'mercy');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Search' }));
    vi.useRealTimers();
  });

  it('a stop word alone says why nothing is listed, not "No results"', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'text' }, results: [], parsedTerms: [], textQuery: null, stopWordsOnly: true }));
    await typeAndWait(baseProps(), 'the');
    const none = document.querySelector('.search-no-results');
    expect(none.textContent).toContain('is in nearly every verse and letter');
    vi.useRealTimers();
  });

  it('nothing to search for (an emoji alone) says so instead of a blank screen', async () => {
    vi.useFakeTimers();
    await typeAndWait(baseProps(), '\u{1F64F}');
    expect(document.querySelector('.search-no-results').textContent).toBe('Type a word, a title or a reference to search.');
    vi.useRealTimers();
  });

  it('a Hebrew name is searched: letters in any script count', async () => {
    vi.useFakeTimers();
    const search = vi.fn(() => Promise.resolve({ parsed: null, results: [], parsedTerms: [] }));
    /** @type {any} */ (window).VotSearchMini.search = search;
    await typeAndWait(baseProps(), '\u05D9\u05D4\u05D5\u05E9\u05E2');
    expect(search).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('a scope that holds nothing says where it looked, and offers everywhere', async () => {
    vi.useFakeTimers();
    const onToggleScope = vi.fn();
    const props = { ...baseProps(), searchScope: { volumeId: 'v7' }, searchContext: { label: 'Volume Seven' }, onToggleScope };
    await typeAndWait(props, 'zzzz');
    const none = document.querySelector('.search-no-results');
    expect(none.textContent).toContain('No results for \u201czzzz\u201d in Volume Seven.');
    fireEvent.click(screen.getByRole('button', { name: 'Search everywhere' }));
    expect(onToggleScope).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('Best Matches shows a text once: a Holy Days reprint does not take a second place', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = () => null;
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.title + ' ' + entry.doc.g}</div>;
    const doc = (g, title, kind) => ({ kind, title, text: 'Keep the Passover, says The Lord.', g });
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, parsedTerms: ['passover'], results: [
      { score: 3, doc: doc('v3', 'Keep The Passover', 'letter') },
      { score: 3, doc: doc('holydays', 'Keep The Passover', 'holy-day') },
      { score: 1, doc: { kind: 'verse', ref: 'Exodus 12:11', text: 'It is the Lord\u2019s Passover.', g: 'bible' } },
    ] }));
    await typeAndWait(baseProps(), 'passover');
    const best = [...document.querySelectorAll('.srch-top-results .stub-card')].map((c) => c.textContent);
    expect(best).toEqual(['Keep The Passover v3', 'undefined bible']);
    vi.useRealTimers();
  });

  it('a passage card\u2019s chapter range uses a hyphen (Permanent Rule 1)', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).SrchCard = ({ entry, isDirect }) => (isDirect ? <div className="stub-direct">{entry.__label}</div> : null);
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'named-passage', bookId: 'matthew', bookTitle: 'Matthew', chapter: 5, chapterEnd: 7, label: 'sermon on the mount' }, results: [], parsedTerms: [] }));
    await typeAndWait(baseProps(), 'sermon on the mount');
    expect(document.querySelector('.stub-direct').textContent).toBe('Matthew 5-7');
    vi.useRealTimers();
  });

  it('a range across chapters is labelled with both ends (sweep W32)', async () => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).SrchCard = ({ entry, isDirect }) => (isDirect ? <div className="stub-direct">{entry.__label}</div> : null);
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', chapter: 14, verseStart: 1, chapterEnd: 16, verseEnd: 33 }, results: [], parsedTerms: [] }));
    await typeAndWait(baseProps(), 'John 14:1-16:33');
    expect(document.querySelector('.stub-direct').textContent).toBe('John 14:1-16:33');
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
    expect(document.querySelector('.srch-results-summary').textContent).toContain('1 match');
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

  /* Recent searches dropped any query without two ASCII letters (sweep low, REPORT.md:647): a Greek or
     Hebrew word, typed and committed, was never kept. Letters and digits of any script count. */
  it('a committed query in another script is kept as a recent search', () => {
    const add = vi.fn((q) => [q]);
    /** @type {any} */ (window).addRecentSearch = add;
    try {
      render(<SearchScreen {...baseProps()} query="ἀγάπη" settings={{ historyEnabled: true }} />);
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search' }), { key: 'Enter' });
      expect(add).toHaveBeenCalledWith('ἀγάπη');
      add.mockClear();
      cleanup();
      render(<SearchScreen {...baseProps()} query="? !" settings={{ historyEnabled: true }} />);
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search' }), { key: 'Enter' });
      expect(add, 'punctuation alone is still not a search to keep').not.toHaveBeenCalled();
    } finally {
      delete /** @type {any} */ (window).addRecentSearch;
    }
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
    expect(document.querySelector('.srch-results-summary').textContent).toContain('1 match');
    await act(async () => {
      pending.mercy({ parsed: null, results: [], parsedTerms: [] });
      await Promise.resolve();
    });
    // The stale "mercy" resolution (0 results) must NOT clobber grace's hit.
    expect(document.querySelector('.srch-results-summary').textContent).toContain('1 match');
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

describe('SearchScreen — the index is built for the reader (v09-perf-01, sweep W2)', () => {
  /* The screen awaited the corpora (the studies only since v09-perf-01) and then
     built with no edition: NKJV for every reader, and a search typed meanwhile
     built from whatever had loaded. The engine's init now loads every corpus
     itself (engine-corpora.test.js); the screen asks it for the reader's edition,
     and an index that is ready but for another edition is not taken as ready. */
  const noop = () => {};
  beforeEach(() => {
    setScreenGlobals();
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

  it("builds for the reader's edition", async () => {
    const init = vi.fn(() => Promise.resolve());
    /** @type {any} */ (window).VotSearchMini = {
      getState: () => ({ ready: false }), init, suggest: () => [], fuzzyBookSuggest: () => null,
      search: () => Promise.resolve({ parsed: null, results: [], parsedTerms: [] }),
    };
    render(<SearchScreen query="" onQueryChange={noop} settings={{ translation: 'kjv' }} onSettingsChange={noop} onSelect={noop}
      onBack={noop} searchScope={null} searchContext={null} onToggleScope={noop} onCommand={noop} />);
    await act(async () => { await Promise.resolve(); });
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ translation: 'kjv' }));
  });

  it('an index ready for another edition is built again, behind the progress bar', async () => {
    const init = vi.fn(() => new Promise(() => {}));
    /** @type {any} */ (window).VotSearchMini = {
      getState: () => ({ ready: true, translation: 'nkjv' }), isCurrent: (/** @type {any} */ o) => o.translation === 'nkjv',
      init, suggest: () => [], fuzzyBookSuggest: () => null,
      search: () => Promise.resolve({ parsed: null, results: [], parsedTerms: [] }),
    };
    render(<SearchScreen query="" onQueryChange={noop} settings={{ translation: 'kjv' }} onSettingsChange={noop} onSelect={noop}
      onBack={noop} searchScope={null} searchContext={null} onToggleScope={noop} onCommand={noop} />);
    await act(async () => { await Promise.resolve(); });
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ translation: 'kjv' }));
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
    setScreenGlobals();
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

/* A letter card opens a letter that exists (search audit 2026-09-27): "letter 55"
   made a card for Volume Two's Letter 55, which does not exist, and the tap did
   nothing; "volume 7 letter 99" the same. */
describe('letterRefCards', () => {
  const D = { VOLUME_COLLECTIONS: [
    { id: 'v1', screen: 'vot-one-letter', dataVar: 'L1', prefaceVar: null, label: 'Volume One' },
    { id: 'v2', screen: 'vot-letter', dataVar: 'L2', prefaceVar: null, label: 'Volume Two' },
    { id: 'v7', screen: 'vot-seven-letter', dataVar: 'L7', prefaceVar: 'L7P', label: 'Volume Seven' },
  ] };
  const win = {
    L1: [{ id: 'a55', num: 55, title: 'One Fifty-Five' }],
    L2: [{ id: 'b1', num: 1, title: 'Two One' }],
    L7: [{ id: 'c55', num: 55, title: 'Vengeance Is Mine, I Shall Repay' }, { id: 'c70', num: 70, title: 'The Last' }],
    L7P: { id: 'c0', num: 0, title: 'Preface' },
  };

  it('names the letter\u2019s title, and carries its id', () => {
    const r = letterRefCards({ kind: 'ref-letter', volumeId: 'v7', letterNum: 55, label: 'Volume Seven · Letter 55' }, D, win);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].__label).toBe('Volume Seven · Letter 55');
    expect(r.cards[0].__sub).toBe('Vengeance Is Mine, I Shall Repay');
    expect(r.cards[0].ref.letterId).toBe('c55');
  });

  it('a letter that is not there is said, with no card to tap', () => {
    const r = letterRefCards({ kind: 'ref-letter', volumeId: 'v7', letterNum: 99, label: 'Volume Seven · Letter 99' }, D, win);
    expect(r.cards).toEqual([]);
    expect(r.missing).toBe('Volume Seven has no Letter 99 (it runs 1 to 70).');
  });

  it('"letter 55" offers each collection that holds a Letter 55, in the site\u2019s order', () => {
    const r = letterRefCards({ kind: 'ref-letter', anyVolume: true, volumeId: 'v2', letterNum: 55, label: 'Letter 55' }, D, win);
    expect(r.cards.map((c) => c.__label)).toEqual(['Volume One · Letter 55', 'Volume Seven · Letter 55']);
    expect(r.cards.map((c) => c.ref.volumeId)).toEqual(['v1', 'v7']);
    expect(letterRefCards({ kind: 'ref-letter', anyVolume: true, volumeId: 'v2', letterNum: 99, label: 'Letter 99' }, D, win).missing)
      .toBe('No collection has a Letter 99.');
  });

  it('before the letters have loaded, the card is the one parsed', () => {
    const r = letterRefCards({ kind: 'ref-letter', anyVolume: true, volumeId: 'v2', letterNum: 55, label: 'Letter 55' }, D, {});
    expect(r.cards.map((c) => c.__label)).toEqual(['Letter 55']);
    expect(r.missing).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   search200 UX, track B: the search screen as a reader meets it (the UX walk
   of 2026-10-17, D:/Swarm/lanes/search200/out/ux/PLAN.md).
   ─────────────────────────────────────────────────────────────────────── */
describe('SearchScreen (search200 UX, track B)', () => {
  const noop = () => {};
  const baseProps = () => ({
    query: '', onQueryChange: noop, settings: {}, onSettingsChange: noop,
    onSelect: noop, onBack: noop, searchScope: null, searchContext: null,
    onToggleScope: noop, onCommand: noop,
  });
  /** A collection's letters, best first: titles g-0, g-1 ... */
  const letters = (/** @type {string} */ g, /** @type {number} */ n, from = 0) => Array.from({ length: n }, (_, i) => (
    { score: 1000 - from - i, doc: { kind: 'letter', title: g + '-' + (from + i), text: 'text of ' + g + '-' + (from + i), g } }));
  const searchReturns = (/** @type {any} */ r) => {
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => Promise.resolve({ parsed: null, parsedTerms: [], results: [], ...r }));
  };
  // past the 140ms debounce, then the engine's promise
  const commit = async () => {
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });
  };
  const typeIn = async (/** @type {any} */ props, /** @type {string} */ q) => {
    const r = render(<SearchScreen {...props} />);
    r.rerender(<SearchScreen {...props} query={q} />);
    await commit();
    return r;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).ScreenLayout = ({ navChildren, children }) => (
      <div className="screen-scroll">{navChildren}{children}</div>
    );
    setScreenGlobals();
    /** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;
    /** @type {any} */ (globalThis).SRCH_QUICK_PICKS = ['Beatitudes', 'Armor of God'];
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
    vi.useRealTimers();
    document.body.classList.remove('scroll-restoring');
    delete /** @type {any} */ (window).VotSearchMini;
    delete /** @type {any} */ (window).VotSearchData;
    delete /** @type {any} */ (window).getRecentSearches;
  });

  /* B2 (major): the Scriptures tab and the scope chip showed the one group left closed over a blank screen. The
     groups were keyed by the live search, so a tab switch remounted them over the OLD list (long, so closed),
     and the new list arrived under the same key. They are keyed by the search the list on screen came from. */
  it('B2: a tab that leaves one group opens it, though the list before it was long', async () => {
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    // like the real group, it reads defaultOpen once, when it mounts
    const StubGroup = ({ gkey, defaultOpen }) => {
      const [open] = React.useState(defaultOpen);
      return <div className="stub-group" data-key={gkey} data-open={String(open)} />;
    };
    /** @type {any} */ (globalThis).SrchGroup = StubGroup;
    /** @type {any} */ (window).VotSearchMini.search = vi.fn((q, o) => Promise.resolve({ parsed: null, parsedTerms: [],
      results: o.corpus === 'scriptures' ? letters('bible', 40) : letters('bible', 30).concat(letters('v3', 20)) }));
    const props = baseProps();
    const r = await typeIn(props, 'a lone group');
    const groups = () => [...document.querySelectorAll('.stub-group')].map((g) => g.getAttribute('data-key') + ':' + g.getAttribute('data-open'));
    expect(groups()).toEqual(['bible:false', 'v3:false']);
    r.rerender(<SearchScreen {...props} settings={{ searchCorpus: 'scriptures' }} query="a lone group" />);
    await commit();
    expect(groups()).toEqual(['bible:true']);
  });

  /* B2: 30 or fewer results across two or more groups open every group under Best Matches, which showed its
     five twice. The groups hold the rest, and a group that gave some up says "more". */
  it('B2: a short list leaves Best Matches out of the open groups', async () => {
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey, items, more }) => (
      <div className="stub-group" data-key={gkey} data-more={String(!!more)}>{items.map((e) => e.doc.title).join(',')}</div>
    );
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.title}</div>;
    searchReturns({ results: letters('v7', 6).concat(letters('v1', 3, 6)) });
    await typeIn(baseProps(), 'a short list');
    const best = [...document.querySelectorAll('.srch-top-results .stub-card')].map((c) => c.textContent);
    expect(best).toEqual(['v7-0', 'v7-1', 'v7-2', 'v7-3', 'v7-4']);
    const groups = [...document.querySelectorAll('.stub-group')].map((g) => [g.getAttribute('data-key'), g.textContent, g.getAttribute('data-more')]);
    expect(groups).toEqual([['v1', 'v1-6,v1-7,v1-8', 'false'], ['v7', 'v7-5', 'true']]);
    // the summary still counts every match, in every section that holds one
    expect(document.querySelector('.srch-results-summary').textContent).toContain('9 matches across 2 sections');
  });

  /* B2 review: in a short list a section whose results all went to Best Matches lost its header, and the summary
     still counted it ("Found 21 matches across 8 sections" over three headers, for "tittle"). The summary counts
     the sections it can show: with a section folded into Best Matches it says the matches alone. */
  it('B2: the summary never counts a section the short list shows no header for', async () => {
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = ({ gkey }) => <div className="stub-group" data-key={gkey} />;
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.title}</div>;
    const headers = () => document.querySelectorAll('.stub-group').length;
    const claimed = () => { const m = /across (\d+) section/.exec(document.querySelector('.srch-results-summary').textContent); return m ? Number(m[1]) : null; };
    // Best Matches takes all of v7 and v1; v2 keeps a header
    searchReturns({ results: letters('v7', 4).concat(letters('v1', 1, 4), letters('v2', 3, 5)) });
    const r = await typeIn(baseProps(), 'tittle');
    expect(headers()).toBe(1);
    expect(claimed(), 'no section count over one header for three sections').toBeNull();
    expect(document.querySelector('.srch-results-summary').textContent).toBe('Found 8 matches');
    expect(screen.getByRole('status').textContent).toBe('Found 8 matches.');
    r.unmount();
    // every section keeps a header: the count stands, and matches them
    searchReturns({ results: letters('v7', 6).concat(letters('v1', 3, 6)) });
    await typeIn(baseProps(), 'a short list');
    expect(claimed()).toBe(headers());
  });

  /* B2: refining a query while scrolled down showed the new list from mid-list. A new search lands at the top
     (the one-shot landing LetterView makes); a list resumed on Back is scroll-restore's, and so is a restore
     under way. */
  it('B2: a new search lands at the top of the list; a resumed one, or one under a restore, does not', async () => {
    const proto = /** @type {any} */ (Element.prototype);
    const had = Object.getOwnPropertyDescriptor(proto, 'scrollTo');
    const scrollTo = vi.fn();
    proto.scrollTo = scrollTo;
    try {
      searchReturns({ results: letters('g', 3) });
      const props = baseProps();
      const r = await typeIn(props, 'forgive one another');
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
      scrollTo.mockClear();
      r.rerender(<SearchScreen {...props} query="forgive one seventy" />);
      await commit();
      expect(scrollTo, 'a refined query').toHaveBeenCalledWith({ top: 0 });
      scrollTo.mockClear();
      document.body.classList.add('scroll-restoring');
      r.rerender(<SearchScreen {...props} query="forgive one seventy times" />);
      await commit();
      expect(scrollTo, 'under a restore').not.toHaveBeenCalled();
      document.body.classList.remove('scroll-restoring');
      r.unmount();
      // Back to the same search: it opens on its list, where the reader left it
      render(<SearchScreen {...props} query="forgive one seventy times" />);
      await commit();
      expect(scrollTo, 'a resumed list').not.toHaveBeenCalled();
    } finally {
      if (had) Object.defineProperty(proto, 'scrollTo', had); else delete proto.scrollTo;
    }
  });

  /* B2: a saved corpus tab stayed on while the empty screen said "Search everything". */
  it('B2: the empty screen names the tab in use and offers all of it in one tap', () => {
    const onSettingsChange = vi.fn();
    const hero = (/** @type {string} */ corpus) => {
      const r = render(<SearchScreen {...baseProps()} settings={{ searchCorpus: corpus }} onSettingsChange={onSettingsChange} />);
      const h = document.querySelector('.srch-empty-hero');
      const out = { text: h.textContent, all: !!screen.queryByRole('button', { name: 'Search all' }) };
      if (out.all) fireEvent.click(screen.getByRole('button', { name: 'Search all' }));
      r.unmount();
      return out;
    };
    const scrip = hero('scriptures');
    expect(scrip.text).toMatch(/^Search the Scriptures/);
    expect(scrip.all).toBe(true);
    expect(onSettingsChange).toHaveBeenLastCalledWith('searchCorpus', 'all');
    onSettingsChange.mockClear();
    const vol = hero('volumes');
    expect(vol.text).toMatch(/^Search the Volumes/);
    expect(vol.all).toBe(true);
    expect(onSettingsChange).toHaveBeenLastCalledWith('searchCorpus', 'all');
    onSettingsChange.mockClear();
    const all = hero('all');
    expect(all.text).toMatch(/^Search everything/);
    expect(all.all).toBe(false);
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  /* B2: "No results" never named the tab the search was held to. */
  it('B2: no results under a tab names the tab, and "Search all" widens it', async () => {
    const onSettingsChange = vi.fn();
    searchReturns({ results: [] });
    await typeIn({ ...baseProps(), settings: { searchCorpus: 'scriptures' }, onSettingsChange }, 'qqzzxvb');
    expect(document.querySelector('.search-no-results').textContent).toContain('No results for \u201cqqzzxvb\u201d in the Scriptures.');
    fireEvent.click(screen.getByRole('button', { name: 'Search all' }));
    expect(onSettingsChange).toHaveBeenCalledWith('searchCorpus', 'all');
  });

  /* B2: a reference typed under the Volumes tab lost its passage card (the parse is held to the tab). The card
     answers the reference under any tab: the screen reads the query as a reference across all of it. */
  it('B2: a Bible reference under Volumes, and a letter reference under Scriptures, keep their card', async () => {
    /** @type {any} */ (globalThis).SrchCard = ({ entry, isDirect }) => (isDirect ? <div className="stub-direct">{entry.__label}</div> : null);
    const parse = vi.fn((q) => (/john/.test(q)
      ? { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', chapter: 3, verseStart: 16 }
      : { kind: 'ref-letter', volumeId: 'zz', letterNum: 5, label: 'Volume Two · Letter 5' }));
    /** @type {any} */ (window).VotSearchMini.parse = parse;
    searchReturns({ parsed: { kind: 'text' }, results: letters('v2', 2) });
    const r = await typeIn({ ...baseProps(), settings: { searchCorpus: 'volumes' } }, 'john 3:16');
    expect([...document.querySelectorAll('.stub-direct')].map((d) => d.textContent)).toEqual(['John 3:16']);
    expect(parse).toHaveBeenCalledWith('john 3:16', { corpus: 'all' });
    r.unmount();
    await typeIn({ ...baseProps(), settings: { searchCorpus: 'scriptures' } }, 'volume 2 letter 5');
    expect([...document.querySelectorAll('.stub-direct')].map((d) => d.textContent)).toEqual(['Volume Two · Letter 5']);
  });

  /* B2 review: the card a reference keeps under Volumes took the tab's Best Matches with it, and a bare book name
     ("revelation", "john") became a Bible card over a closed contents list. A reference's card sits above the
     tab's Best Matches; a book name under Volumes is the words it is; and "Showing closest matches" is said only
     when the engine stopped at the closest few for a card of its own. */
  it('B2: under Volumes a reference card keeps the Best Matches row, and a bare book name makes no card', async () => {
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchCard = ({ entry, isDirect }) => (isDirect
      ? <div className="stub-direct">{entry.__label}</div> : <div className="stub-card">{entry.doc.title}</div>);
    /** @type {any} */ (window).VotSearchMini.parse = vi.fn((q) => (/3:16/.test(q)
      ? { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', chapter: 3, verseStart: 16 }
      : { kind: 'ref-book', bookId: 'revelation', bookTitle: 'Revelation' }));
    const direct = () => [...document.querySelectorAll('.stub-direct')].map((d) => d.textContent);
    const best = () => [...document.querySelectorAll('.srch-top-results .stub-card')].map((c) => c.textContent);
    searchReturns({ parsed: { kind: 'text' }, results: letters('v1', 20).concat(letters('v2', 20, 20)) });
    const r = await typeIn({ ...baseProps(), settings: { searchCorpus: 'volumes' } }, 'revelation');
    expect(direct(), 'a book name under Volumes is words').toEqual([]);
    expect(best()).toEqual(['v1-0', 'v1-1', 'v1-2', 'v1-3', 'v1-4']);
    r.unmount();
    searchReturns({ parsed: { kind: 'text' }, results: letters('v1', 20).concat(letters('v2', 20, 20)), truncated: true });
    await typeIn({ ...baseProps(), settings: { searchCorpus: 'volumes' } }, 'john 3:16');
    expect(direct()).toEqual(['John 3:16']);
    expect(best(), 'the card sits above the tab’s own row').toEqual(['v1-0', 'v1-1', 'v1-2', 'v1-3', 'v1-4']);
    expect(document.querySelector('.srch-results-summary').textContent, 'the tab searched every match').toMatch(/^Found 40\+ matches/);
  });

  /* B2: a book scope with the Volumes tab on said "No results in Luke", and "Search everywhere" kept the
     Volumes tab on. The conflict is named, with a way out of each side. */
  it('B2: a book scope under the Volumes tab names the conflict; each way out widens the tab', async () => {
    const onSettingsChange = vi.fn();
    const onToggleScope = vi.fn();
    const luke = { kind: 'book', bookId: 'luke', label: 'Luke' };
    searchReturns({ results: [] });
    await typeIn({ ...baseProps(), settings: { searchCorpus: 'volumes' }, searchScope: luke, searchContext: luke, onSettingsChange, onToggleScope }, 'turn the other cheek');
    const none = document.querySelector('.search-no-results');
    expect(none.textContent).toContain('Luke is in the Scriptures, and the Volumes tab is on.');
    expect(none.textContent).not.toContain('No results');
    expect(document.querySelector('.srch-no-results-tip'), 'no spelling tip: the words were never searched').toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search Luke' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith('searchCorpus', 'all');
    expect(onToggleScope).not.toHaveBeenCalled();
    onSettingsChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Search everywhere' }));
    expect(onToggleScope).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenLastCalledWith('searchCorpus', 'all');
  });

  it('B2: a volume scope under the Scriptures tab names the conflict too', async () => {
    const v7 = { kind: 'volume', volumeId: 'v7', label: 'Volume Seven' };
    searchReturns({ results: [] });
    await typeIn({ ...baseProps(), settings: { searchCorpus: 'scriptures' }, searchScope: v7, searchContext: v7 }, 'vengeance repay');
    expect(document.querySelector('.search-no-results').textContent).toContain('Volume Seven is in the Volumes, and the Scriptures tab is on.');
    expect(screen.getByRole('button', { name: 'Search Volume Seven' })).toBeTruthy();
  });

  /* B2 (polish): the no-results screen was one grey line. It offers a way on: a tip, and the same Recent and
     Quick picks rows the empty screen has. */
  it('B2: no results offers a tip and the Recent and Quick picks rows', async () => {
    const onQueryChange = vi.fn();
    /** @type {any} */ (window).getRecentSearches = () => ['mercy seat'];
    searchReturns({ results: [] });
    await typeIn({ ...baseProps(), onQueryChange }, 'zzqqxx nothing');
    expect(document.querySelector('.srch-no-results-tip').textContent).toMatch(/spelling/);
    expect(screen.getByRole('button', { name: 'mercy seat' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Beatitudes' }));
    expect(onQueryChange).toHaveBeenCalledWith('beatitudes');
  });

  it('B2: a stop word alone keeps its own line, with no tip under it', async () => {
    searchReturns({ parsed: { kind: 'text' }, results: [], stopWordsOnly: true });
    await typeIn(baseProps(), 'unto');
    expect(document.querySelector('.search-no-results').textContent).toContain('is in nearly every verse and letter');
    expect(document.querySelector('.srch-no-results-tip')).toBeNull();
  });

  /* B3 (major): the suggestion list could not be dismissed on a phone and caught taps meant for the controls
     under it (a tap on Book order ran "psalm 119"). It closes on Enter, on blur and on a scroll of the results;
     a tap, which is a click to a screen reader, picks. */
  const psalmSuggest = () => {
    /** @type {any} */ (window).VotSearchMini.suggest = () => [
      { query: 'psalm 23', label: 'Psalm 23', kind: 'Ref' }, { query: 'psalm 119', label: 'Psalm 119', kind: 'Ref' }];
  };
  const box = () => /** @type {HTMLInputElement} */ (document.querySelector('input.search-input'));
  const listOpen = () => !!document.querySelector('.srch-suggest-item');

  it('B3: Enter closes the suggestions, keeps the search and lets the keyboard go; its key says "search"', async () => {
    psalmSuggest();
    const addRecentSearch = vi.fn(() => []);
    /** @type {any} */ (window).addRecentSearch = addRecentSearch;
    try {
      await typeIn(baseProps(), 'psa');
      act(() => { box().focus(); });
      expect(listOpen(), 'open while typing').toBe(true);
      expect(box().getAttribute('enterkeyhint')).toBe('search');
      fireEvent.keyDown(box(), { key: 'Enter' });
      expect(listOpen(), 'closed on Enter').toBe(false);
      expect(document.activeElement, 'the box let go: the keyboard closes over the results').not.toBe(box());
      expect(addRecentSearch).toHaveBeenCalledWith('psa');
      act(() => { box().focus(); });
      expect(listOpen(), 'still closed for the query Enter closed it on').toBe(false);
    } finally {
      delete /** @type {any} */ (window).addRecentSearch;
    }
  });

  it('B3: a tap elsewhere closes the suggestions; back in the box they open again', async () => {
    psalmSuggest();
    await typeIn(baseProps(), 'psa');
    act(() => { box().focus(); });
    expect(listOpen()).toBe(true);
    act(() => { box().blur(); });
    expect(listOpen(), 'closed on blur').toBe(false);
    act(() => { box().focus(); });
    expect(listOpen(), 'open again in the box').toBe(true);
  });

  it('B3: a click on a suggestion picks it, as a finger or a screen reader sends it', async () => {
    psalmSuggest();
    let q = 'psa';
    const props = { ...baseProps(), onQueryChange: (/** @type {string} */ v) => { q = v; } };
    const r = await typeIn(props, 'psa');
    fireEvent.click(document.querySelectorAll('.srch-suggest-item')[1]);
    expect(q).toBe('psalm 119');
    r.rerender(<SearchScreen {...props} query={q} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(listOpen(), 'closed on the query it set').toBe(false);
    expect(document.activeElement, 'the keyboard goes down on a pick').not.toBe(box());
  });

  it('B3: a scroll of the results closes the suggestions', async () => {
    psalmSuggest();
    await typeIn(baseProps(), 'psa');
    expect(listOpen()).toBe(true);
    act(() => { document.querySelector('.screen-scroll').dispatchEvent(new Event('scroll')); });
    expect(listOpen(), 'closed on scroll').toBe(false);
  });

  /* B3 (critic): the box had no combobox semantics, and the suggestions answered neither the keyboard nor a
     screen reader's click. */
  it('B3: the box is a combobox over a listbox; the arrow keys walk the options and Enter picks one', async () => {
    psalmSuggest();
    let q = 'psa';
    const props = { ...baseProps(), onQueryChange: (/** @type {string} */ v) => { q = v; } };
    const r = await typeIn(props, 'psa');
    const input = screen.getByRole('combobox', { name: 'Search' });
    expect(input).toBe(box());
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    const list = screen.getByRole('listbox');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // past the last: round to the first
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // before the first: round to the last
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(q).toBe('psalm 119');
    r.rerender(<SearchScreen {...props} query={q} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(document.activeElement, 'a pick is a search: the keyboard goes down, as on Enter').not.toBe(input);
  });

  /* B3 (polish): a query restored with the screen was not selected, so typing appended to it; and the box took
     the focus 80 ms after it mounted, so a key typed at once was lost ("love" read "ove"). */
  it('B3: a query restored with the screen is focused and selected as it mounts, so typing replaces it', () => {
    render(<SearchScreen {...baseProps()} query="love your enemies" />);
    expect(document.activeElement).toBe(box());
    expect([box().selectionStart, box().selectionEnd]).toEqual([0, 17]);
  });

  it('B3: an empty box takes the focus as it mounts, so no key typed after the tap is lost', () => {
    render(<SearchScreen {...baseProps()} />);
    expect(document.activeElement).toBe(box());
  });

  /* B9 (critic): the counts and the no-results line reached no screen reader. The only status region came and went
     with the "Searching…" bar, and a region that arrives with its words is not read. One stays in the screen from
     the start and says each step. */
  it('B9: one polite status region stays in the screen and says each step of a search', async () => {
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ let resolve;
    /** @type {any} */ (window).VotSearchMini.search = vi.fn(() => new Promise((res) => { resolve = res; }));
    const props = baseProps();
    const r = render(<SearchScreen {...props} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.textContent, 'quiet before a search').toBe('');
    r.rerender(<SearchScreen {...props} query="still waters" />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getAllByRole('status'), 'one region, not one per message').toEqual([status]);
    expect(status.textContent).toBe('Searching…');
    await act(async () => { resolve({ parsed: null, parsedTerms: [], results: letters('v7', 3).concat(letters('v1', 1, 3)) }); await Promise.resolve(); });
    expect(screen.getAllByRole('status')).toEqual([status]);
    expect(status.textContent).toBe('Found 4 matches across 2 sections.');
    searchReturns({ results: [] });
    r.rerender(<SearchScreen {...props} settings={{ searchCorpus: 'scriptures' }} query="zzyzx" />);
    await commit();
    expect(screen.getAllByRole('status')).toEqual([status]);
    expect(status.textContent).toBe('No results for “zzyzx” in the Scriptures.');
  });

  /* B9 review: the region built its words from the live box and the last search's state, so each key typed after
     a search said a verdict on text not yet searched ("No results for “zzyzxqw”" before the search ran). A verdict
     names only the text searched; text still waiting for its search is "Searching…". */
  it('B9: a key typed after a search says no verdict on the new text until its search answers', async () => {
    searchReturns({ results: [] });
    const props = baseProps();
    const r = await typeIn(props, 'zzyzxq');
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('No results for “zzyzxq”.');
    r.rerender(<SearchScreen {...props} query="zzyzxqw" />);
    expect(status.textContent, 'not searched yet').not.toContain('zzyzxqw');
    expect(status.textContent).toBe('Searching…');
    expect(document.querySelector('.search-no-results').textContent, 'the line on screen names what was searched').toContain('No results for “zzyzxq”.');
    await commit();
    expect(status.textContent).toBe('No results for “zzyzxqw”.');
    expect(document.querySelector('.search-no-results').textContent).toContain('No results for “zzyzxqw”.');
    // a count is held the same way
    searchReturns({ results: letters('v7', 2) });
    r.rerender(<SearchScreen {...props} query="mercy" />);
    await commit();
    expect(status.textContent).toBe('Found 2 matches across 1 section.');
    r.rerender(<SearchScreen {...props} query="mercyq" />);
    expect(status.textContent).toBe('Searching…');
  });

  it('B9: the status region says a stop word, a corrected word, a scope the tab cannot reach and an emoji, as the screen does', async () => {
    const props = baseProps();
    const said = async (/** @type {any} */ extra, /** @type {string} */ q) => {
      const r = await typeIn({ ...props, ...extra }, q);
      const text = screen.getByRole('status').textContent;
      r.unmount();
      return text;
    };
    searchReturns({ parsed: { kind: 'text' }, results: [], stopWordsOnly: true });
    expect(await said({}, 'the')).toBe('“the” is in nearly every verse and letter. Add another word to search.');
    searchReturns({ results: letters('v7', 2), corrections: [{ from: 'shephard', to: 'shepherd' }] });
    expect(await said({}, 'shephard')).toBe('Showing results for shepherd. Found 2 matches across 1 section.');
    searchReturns({ results: [] });
    expect(await said({ settings: { searchCorpus: 'volumes' }, searchScope: { bookId: 'luke', label: 'Luke' }, searchContext: { label: 'Luke' } }, 'sparrows'))
      .toBe('Luke is in the Scriptures, and the Volumes tab is on.');
    expect(await said({}, '🙏')).toBe('Type a word, a title or a reference to search.');
  });

  /* B9: the results had no headings to move by: the section labels were divs and a group's header a bare button. */
  it('B9: the results are headed: each section an h2, each group an h3 over its own open-close button', async () => {
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = RealSrchGroup;
    /** @type {any} */ (globalThis).SrchCard = ({ entry }) => <div className="stub-card">{entry.doc.title}</div>;
    searchReturns({ results: letters('v7', 30).concat(letters('v1', 10, 30)) });
    await typeIn(baseProps(), 'headed results');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Best Matches']);
    const groups = screen.getAllByRole('heading', { level: 3 });
    expect(groups).toHaveLength(2);
    for (const h of groups) {
      const b = h.querySelector('button.srch-group-header');
      expect(b, 'the open-close button inside the heading').toBeTruthy();
      expect(b.getAttribute('aria-expanded')).toBe('false');
    }
    expect(groups[0].textContent).toMatch(/^Volume One · 10 letters/);
    expect(groups[1].textContent).toMatch(/^Volume Seven · 30 letters/);
  });

  it('B9: the empty screen is headed too: the hero, Recent and Quick picks', () => {
    /** @type {any} */ (window).getRecentSearches = () => ['mercy'];
    render(<SearchScreen {...baseProps()} settings={{ historyEnabled: true }} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Search everything', 'Recent', 'Quick picks']);
  });

  /* B5 (copy): the placeholder "Search scriptures, volumes, studies…" was cut off on a 360 px phone, and nothing
     said a reference, a phrase or "quotes" would work. The placeholder names the tab; a hint line says the rest. */
  it('B5: the placeholder is short and names the tab, and the empty screen hints at a reference, a phrase and quotes', () => {
    const placeholder = (/** @type {string} */ corpus) => {
      const r = render(<SearchScreen {...baseProps()} settings={{ searchCorpus: corpus }} />);
      const out = { ph: box().getAttribute('placeholder'), hint: document.querySelector('.srch-hint') && document.querySelector('.srch-hint').textContent };
      r.unmount();
      return out;
    };
    const all = placeholder('all');
    expect(all.ph).toBe('Search everything');
    expect(placeholder('scriptures').ph).toBe('Search the Scriptures');
    expect(placeholder('volumes').ph).toBe('Search the Volumes');
    expect(all.hint).toBe('Try a reference (John 3:16), a phrase, or “exact words” in quotes.');
    expect(placeholder('volumes').hint, 'on every tab').toBe(all.hint);
  });

  it('B5: under a reference card, the status region says the closest matches are shown, not a count', async () => {
    const card = { kind: 'named-passage', bookId: 'matthew', bookTitle: 'Matthew', chapter: 28, label: 'Resurrection' };
    searchReturns({ parsed: card, parsedTerms: ['resurrection'], results: letters('v1', 5), truncated: true });
    await typeIn(baseProps(), 'the resurrection');
    expect(document.querySelector('.srch-results-summary').textContent).toBe('Showing closest matches · Show all');
    // the card's own label first, as the card reads
    expect(screen.getByRole('status').textContent).toBe('Matthew 28. Showing closest matches.');
  });

  /* B7: the marks dropped only the engine's trimmed stop words, so with real words typed "who" was still marked
     (and marked "whom"). They drop the fuller list too; the engine still searches by the trimmed one. */
  it('B7: with real words typed, a word of the fuller stop list is not marked', async () => {
    /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {},
      STOP_WORDS_TRIMMED: new Set(['those']), STOP_WORDS: new Set(['those', 'who']) };
    /** @type {any} */ let seen = null;
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchCard = ({ terms }) => { seen = terms; return <div className="stub-card" />; };
    searchReturns({ parsed: { kind: 'text' }, parsedTerms: ['those', 'who', 'mourn'], results: letters('v7', 6).concat(letters('v1', 3, 6)) });
    await typeIn(baseProps(), 'those who mourn');
    expect(seen).toEqual(['mourn']);
  });

  /* B7 review: the card leaves out the engine's forms of a typed small word ("who" brought "whom"); it is told
     which small words were typed, in Best Matches and in the groups alike. */
  it('B7: each card is told the small words typed, alone or among real words', async () => {
    /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {},
      STOP_WORDS_TRIMMED: new Set(['those']), STOP_WORDS: new Set(['those', 'who']) };
    /** @type {any} */ const seen = [];
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ (globalThis).SrchGroup = RealSrchGroup;
    /** @type {any} */ (globalThis).SrchCard = ({ stopTyped, where }) => { seen.push(where + ':' + JSON.stringify(stopTyped)); return <div className="stub-card" />; };
    searchReturns({ parsed: { kind: 'text' }, parsedTerms: ['those', 'who', 'mourn'], results: letters('v7', 6).concat(letters('v1', 3, 6)) });
    const r = await typeIn(baseProps(), 'those who mourn');
    expect([...new Set(seen)].sort()).toEqual(['best:["those","who"]', 'v1:["those","who"]', 'v7:["those","who"]']);
    r.unmount();
    seen.length = 0;
    searchReturns({ parsed: { kind: 'text' }, parsedTerms: ['who'], results: letters('v7', 6).concat(letters('v1', 3, 6)) });
    await typeIn(baseProps(), 'who');
    expect([...new Set(seen)].sort()).toEqual(['best:["who"]', 'v1:["who"]', 'v7:["who"]']);
  });

  /* Track D (D6): the in-text find pill marked "whom" and "whoever" in a letter opened from a lone "who"
     (D:/Swarm/lanes/search200/out/ux/fix-D/find6-before.log): a tapped card hands on the small words typed,
     so the landing finds what the card marked. */
  it('D6: a tapped card hands on the small words typed, with the terms and the query', async () => {
    /** @type {any} */ (window).VotSearchData = { BOOK_DISPLAY: {}, SYNONYM_MAP: {},
      STOP_WORDS_TRIMMED: new Set(['those']), STOP_WORDS: new Set(['those', 'who']) };
    /** @type {any} */ (globalThis).srchGroupKey = (doc) => doc.g;
    /** @type {any} */ (globalThis).SRCH_GROUP_META = realGroupMeta();
    /** @type {any} */ let tapOn = null;
    /** @type {any} */ (globalThis).SrchCard = ({ entry, onSelect, where }) => { if (where === 'best' && !tapOn) tapOn = () => onSelect(entry); return <div className="stub-card" />; };
    const onSelect = vi.fn();
    searchReturns({ parsed: { kind: 'text' }, parsedTerms: ['those', 'who', 'mourn'], results: letters('v7', 6).concat(letters('v1', 3, 6)) });
    await typeIn({ ...baseProps(), onSelect }, 'those who mourn');
    act(() => { tapOn(); });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ doc: expect.objectContaining({ title: 'v7-0' }) }), ['mourn'], 'those who mourn', ['those', 'who']);
  });
});

describe('SearchScreen (search200 UX, track D)', () => {
  const noop = () => {};
  const baseProps = () => ({
    query: '', onQueryChange: noop, settings: {}, onSettingsChange: noop,
    onSelect: noop, onBack: noop, searchScope: null, searchContext: null,
    onToggleScope: noop, onCommand: noop,
  });
  const box = () => /** @type {HTMLInputElement} */ (document.querySelector('input.search-input'));
  const sel = () => [box().selectionStart, box().selectionEnd];
  /** The page leaves the screen and comes back (the app to the background and back). */
  const awayAndBack = () => {
    for (const v of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    /** @type {any} */ (globalThis).ScreenLayout = ({ navChildren, children }) => (
      <div className="screen-scroll">{navChildren}{children}</div>
    );
    setScreenGlobals();
    /** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;
    /** @type {any} */ (globalThis).SRCH_QUICK_PICKS = ['Beatitudes'];
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
    vi.useRealTimers();
    delete /** @type {any} */ (document).visibilityState; // the own property goes; the prototype's getter is back
    delete /** @type {any} */ (window).VotSearchMini;
    delete /** @type {any} */ (window).VotSearchData;
    delete /** @type {any} */ (window).getRecentSearches;
  });

  /* D3: on the APK a query the screen came back with was not selected when the reader went back to it. With the
     app back from the background on Search (Enter had let the box go), a tap put the caret where the finger
     landed and the next key went into the query: "Mercy" and an m read "Memrcy" (vot_api34, WebView 113). The
     tap that goes back to a query the reader has not touched since the screen came takes it whole; the next tap
     is the reader's own caret, and a query they typed keeps the caret where they put it. */
  it('D3: the first tap on the query the screen came with selects it whole; the next tap places the caret', () => {
    render(<SearchScreen {...baseProps()} query="love your enemies" />);
    act(() => { box().blur(); });
    box().setSelectionRange(4, 4); // where the finger landed
    fireEvent.click(box());
    expect(sel(), 'the tap took the query whole: the next key replaces it').toEqual([0, 17]);
    box().setSelectionRange(9, 9);
    fireEvent.click(box());
    expect(sel(), 'a second tap is the reader placing the caret').toEqual([9, 9]);
  });

  it('D3: the app back from the background on Search: the tap back into the query selects it whole', () => {
    render(<SearchScreen {...baseProps()} query="mercy" />);
    fireEvent.click(box()); // the first tap of the visit, spent
    act(() => { box().blur(); });
    awayAndBack();
    box().setSelectionRange(2, 2);
    fireEvent.click(box());
    expect(sel()).toEqual([0, 5]);
  });

  it('D3: a query the reader typed or changed keeps the caret where the tap puts it', () => {
    const props = baseProps();
    const r = render(<SearchScreen {...props} query="mercy" />);
    r.rerender(<SearchScreen {...props} query="mercy seat" />); // their own edit
    act(() => { box().blur(); });
    box().setSelectionRange(5, 5);
    fireEvent.click(box());
    expect(sel()).toEqual([5, 5]);
    cleanup();
    const r2 = render(<SearchScreen {...props} />);
    r2.rerender(<SearchScreen {...props} query="grace" />); // typed into an empty box
    act(() => { box().blur(); });
    box().setSelectionRange(3, 3);
    fireEvent.click(box());
    expect(sel()).toEqual([3, 3]);
  });

  /* D4: typed whole, a named passage's name opened its suggestion, which searches what is already typed, over
     the passage card the search had put at the top: the card's "Named passage — open" strip sat half under it
     ("faith without works", 412 px). A suggestion that would search the box's own words is left out; the list
     opens only for the others. */
  it('D4: a suggestion that searches what is typed is left out, and the list opens only for the rest', () => {
    /** @type {any} */ (window).VotSearchMini.suggest = () => [
      { kind: 'passage', label: 'Faith Without Works', query: 'faith without works', hint: 'James 2' },
      { kind: 'passage', label: 'Faith Without Works Is Dead', query: 'faith without works is dead', hint: 'James 2:26' }];
    const props = baseProps();
    const r = render(<SearchScreen {...props} />);
    r.rerender(<SearchScreen {...props} query="Faith  without works " />);
    act(() => { vi.advanceTimersByTime(200); });
    expect([...document.querySelectorAll('.srch-suggest-item')].map((b) => b.textContent))
      .toEqual(['passageFaith Without Works Is DeadJames 2:26']);
    /** @type {any} */ (window).VotSearchMini.suggest = () => [
      { kind: 'passage', label: 'Faith Without Works', query: 'faith without works', hint: 'James 2' }];
    r.rerender(<SearchScreen {...props} query="faith without works" />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(document.querySelector('.srch-suggest'), 'nothing left to offer: no list over the card').toBeNull();
    r.rerender(<SearchScreen {...props} query="faith with" />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(document.querySelectorAll('.srch-suggest-item'), 'a name still to finish is offered').toHaveLength(1);
  });
});
