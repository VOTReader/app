/* SRCH4 — snippet synonym-highlight term expansion.
   ────────────────────────────────────────────────
   expandSnippetTerms decides which words SrchSnippet marks. When synonym search
   is on, a verse surfaced by a synonym (search "shepherd" → a "pastor" verse)
   must highlight the matched synonym, not show it plain. Pure function → tested
   directly (no need to render the screen). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import {
  expandSnippetTerms, matchCountLabel, useImeHideBlur, SearchScreen, SEARCH_LIMIT,
} from './SearchScreen.jsx';
import {
  srchFilterCategories as realSrchFilterCategories,
  srchApplyFilter as realSrchApplyFilter,
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
describe('matchCountLabel (W0: honest 400+ cap)', () => {
  it('returns the plain count below the cap', () => {
    expect(matchCountLabel(0, 400)).toBe('0');
    expect(matchCountLabel(1, 400)).toBe('1');
    expect(matchCountLabel(399, 400)).toBe('399');
  });

  it('returns "400+" at the cap (the count is a floor, not a total)', () => {
    expect(matchCountLabel(400, 400)).toBe('400+');
  });

  it('returns the plain count when no limit applies', () => {
    expect(matchCountLabel(400, 0)).toBe('400');
    expect(matchCountLabel(400, null)).toBe('400');
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
    // [8] chips/sort helpers — real fns are pure; use the real ones so the
    // screen's memos behave (empty chip list for the single 'g' group).
    /** @type {any} */ (globalThis).srchFilterCategories = realSrchFilterCategories;
    /** @type {any} */ (globalThis).srchApplyFilter = realSrchApplyFilter;
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
      () => Promise.resolve({ parsed: null, results, parsedTerms: [] }),
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
});
