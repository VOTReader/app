/* v2 Search (zv1): the gate pictures 3a-search and 3b-search-results, and a real boot over a fake engine: typing groups
   the hits, "More in the letters" hands over to the Letters scope, clearing refocuses the box, a hit opens in this tab
   and Back shows the same results without searching again. A gate boot never starts the engine. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { forgetSearch } from '../search-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const ONE = { volKey: 'one', label: 'Volume One', searchVolId: 'v1', globalName: 'LETTERS_V1', letterScreen: 'vot-one-letter' };

afterEach(() => {
  cleanup();
  forgetSearch();
  for (const k of ['VotSearchMini', 'VotSearchData', 'COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'StateStore']) delete g[k];
  delete html.dataset.gate;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A fake main engine: ready, answering every search with `results`. */
function fakeEngine(results, parsed = { kind: 'text', terms: ['chosen'] }) {
  return {
    getState: () => ({ ready: true }),
    isCurrent: () => true,
    init: vi.fn(() => Promise.resolve()),
    search: vi.fn(() => Promise.resolve({ parsed, textQuery: parsed, parsedTerms: ['chosen'], results })),
  };
}

const letter = (n, title, text) => ({ doc: { id: 'l' + n, kind: 'letter', volumeId: 'v1', letterNum: n, title, ref: 'Volume One · Letter ' + n, text } });

describe('gate pictures', () => {
  it('3a-search: the heading, the empty box, five Try chips and the hint; Search lit', async () => {
    const { container } = render(<V2App gateId="3a-search" />);
    expect(container.querySelector('.page-head.tabroot h1.display').textContent).toBe('Search');
    const q = /** @type {HTMLInputElement} */ (container.querySelector('.field input.q'));
    expect(q.value).toBe('');
    expect(q.placeholder).toBe('Words, a verse, a letter’s name');
    expect(container.querySelector('.field .clear')).toBe(null);
    expect(container.querySelector('.label.try').textContent).toBe('Try');
    expect(texts(container, '.chips .chip')).toEqual(['born again', 'set apart', 'Chosen by God', 'John 3', 'Volume Three']);
    expect(container.querySelector('.hint').textContent).toMatch(/^One search for the letters, the Bible, Answers and your notes\./);
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Search');
    expect(container.querySelector('.tb .ic[aria-label="More"]')).not.toBe(null);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3b-search-results: "chosen" in the focused box, All lit, Go to, the two letters and John 13:18 marked', async () => {
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.VotSearchMini = fakeEngine([]);
    const { container } = render(<V2App gateId="3b-search-results" />);
    expect(container.querySelector('h1')).toBe(null);
    expect(/** @type {HTMLInputElement} */ (container.querySelector('.field.focus input.q')).value).toBe('chosen');
    expect(container.querySelector('.field .clear')).not.toBe(null);
    expect(texts(container, '.chips.scopes .chip')).toEqual(['All', 'Letters', 'Bible', 'Answers', 'Notes']);
    expect(texts(container, '.chips.scopes .chip.on')).toEqual(['All']);
    expect(texts(container, '.grp .label')).toEqual(['Go to', 'In the letters', 'In the Bible']);
    const [go, letters, bible] = container.querySelectorAll('.grp');
    expect(texts(go, '.hit .tt')).toEqual(['Chosen by God']);
    expect(texts(go, '.hit .where')).toEqual(['Volume One · Letter 1']);
    expect(texts(letters, '.hit .where')).toEqual(['Volume One · Letter 1', 'Volume One · Letter 4']);
    expect(texts(letters, '.hit .ex mark')).toEqual(['chosen', 'chosen']);
    expect(texts(bible, '.hit .where')).toEqual(['John 13:18']);
    expect(bible.querySelector('.hit .ex.bx mark').textContent).toBe('chosen');
    expect(container.querySelector('.more')).toBe(null);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(g.VotSearchMini.init).not.toHaveBeenCalled();
    expect(g.VotSearchMini.search).not.toHaveBeenCalled();
  });
});

describe('searching (real boot, fake engine)', () => {
  function openSearch() {
    const r = render(<V2App gateId={null} />);
    click([...r.container.querySelectorAll('.tabbar .tab')][1]);
    return r.container;
  }
  async function typeAndWait(c, text) {
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: text } });
    await act(async () => { vi.advanceTimersByTime(140); });
    await act(async () => { await Promise.resolve(); });
  }

  it('typing searches once after 140 ms and groups the hits; past three, "More in the letters" opens Letters', async () => {
    vi.useFakeTimers();
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.VotSearchMini = fakeEngine([
      letter(1, 'Chosen by God', 'you are one of My chosen sons'),
      letter(2, 'Two', 'the chosen to give'),
      { doc: { id: 'v', kind: 'verse', bookId: 'john', chapterNum: 13, verseNum: 18, ref: 'John 13:18', text: 'I know whom I have chosen' } },
      letter(3, 'Three', 'chosen three'),
      letter(4, 'Four', 'chosen four'),
    ]);
    const c = openSearch();
    expect(c.querySelector('h1').textContent).toBe('Search');
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: 'c' } });
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: 'chosen' } });
    expect(c.querySelector('h1')).toBe(null);
    await typeAndWait(c, 'chosen');
    expect(g.VotSearchMini.search).toHaveBeenCalledTimes(1);
    expect(g.VotSearchMini.search.mock.calls[0][0]).toBe('chosen');
    expect(g.VotSearchMini.search.mock.calls[0][1]).toMatchObject({ corpus: 'all', limit: 6000, perVolume: 400, translation: 'nkjv' });
    expect(texts(c, '.grp .label')).toEqual(['Go to', 'In the letters', 'In the Bible']);
    const letters = c.querySelectorAll('.grp')[1];
    expect(letters.querySelectorAll('.hit').length).toBe(3);
    expect(letters.querySelector('.more').textContent).toBe('More in the letters');
    click(letters.querySelector('.more'));
    expect(texts(c, '.chips.scopes .chip.on')).toEqual(['Letters']);
    expect(texts(c, '.grp .label')).toEqual(['In the letters']);
    expect(c.querySelectorAll('.grp .hit').length).toBe(4);
    expect(c.querySelector('.more')).toBe(null);
  });

  it('one letter does not search; nothing found says so; Clear empties and refocuses the box', async () => {
    vi.useFakeTimers();
    g.VotSearchMini = fakeEngine([]);
    const c = openSearch();
    await typeAndWait(c, 'x');
    expect(g.VotSearchMini.search).not.toHaveBeenCalled();
    await typeAndWait(c, 'zzqq');
    expect(c.querySelector('.empty .t').textContent).toBe('No results for “zzqq”');
    click(c.querySelector('.field .clear'));
    const q = /** @type {HTMLInputElement} */ (c.querySelector('.field input.q'));
    expect(q.value).toBe('');
    expect(document.activeElement).toBe(q);
    expect(c.querySelector('h1').textContent).toBe('Search');
  });

  it('a hit opens in this tab; Back shows the same results without searching again', async () => {
    vi.useFakeTimers();
    g.COLLECTIONS = [ONE];
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.LETTERS_V1 = [{ id: 'chosen', num: 1, title: 'Chosen by God', blocks: [] }];
    g.VotSearchMini = fakeEngine([letter(1, 'Chosen by God', 'you are one of My chosen sons')]);
    const c = openSearch();
    await typeAndWait(c, 'chosen');
    click(c.querySelectorAll('.grp')[1].querySelector('.hit[role="button"]'));
    expect(c.querySelector('h1').textContent).toBe('Chosen by God');
    expect(c.querySelector('.tb .title').textContent).toBe('Search');
    click(c.querySelector('.tb button'));
    expect(/** @type {HTMLInputElement} */ (c.querySelector('.field input.q')).value).toBe('chosen');
    expect(texts(c, '.grp .label')).toEqual(['Go to', 'In the letters']);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(g.VotSearchMini.search).toHaveBeenCalledTimes(1);
  });

  it('no engine: says search could not start', async () => {
    vi.useFakeTimers();
    const c = openSearch();
    await typeAndWait(c, 'chosen');
    expect(c.querySelector('.hint').textContent).toMatch(/^Search couldn’t start\./);
  });
});
