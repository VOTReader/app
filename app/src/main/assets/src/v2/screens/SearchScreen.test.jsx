/* v2 Search (zv1; zs26 = design dz19). The gate pictures 3a, 3b, 3e-3h drawn from main's engine rows (gate-data, fetched
   as a gate boot fetches them): Go to with the songs row, main's count, Relevance | Book order, Best matches with the
   original before its reprint, the more-places line, Book order's closest matches, the notes line, Recent, one volume.
   Then real boots over a fake engine: typing groups the hits, the order switch and its reset, places that open, recent
   searches recorded and removed with Undo, history off, the scope chip from the page Search was opened from, every case
   of the notes line. A gate boot never starts the engine. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
// @ts-ignore: node in a test (this tsconfig has no node types)
import fs from 'node:fs';
// @ts-ignore: node in a test (this tsconfig has no node types)
import path from 'node:path';
// @ts-ignore: node in a test (this tsconfig has no node types)
import { fileURLToPath } from 'node:url';
import { V2App } from '../App.jsx';
import { SearchScreen } from './SearchScreen.jsx';
import { forgetSearch } from '../search-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const ROWS = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gate-data/search-rows.json'), 'utf8'));
const col = (volKey, label, searchVolId) => ({ volKey, label, searchVolId, globalName: 'LETTERS_' + volKey.toUpperCase() });
const ONE = { volKey: 'one', label: 'Volume One', searchVolId: 'v1', globalName: 'LETTERS_V1', letterScreen: 'vot-one-letter' };
const COLS = [ONE, col('two', 'Volume Two', 'v2'), col('three', 'Volume Three', 'v3'), col('four', 'Volume Four', 'v4'),
  col('seven', 'Volume Seven', 'v7'), col('wtlb1', 'Words To Live By: Part One', 'wtlb1'), col('wtlb2', 'Words To Live By: Part Two', 'wtlb2'),
  col('flock', "Letters to The Lord's Little Flock", 'flock'), col('timothy', 'Letters from Timothy', 'timothy'),
  col('answers', 'Answers Only God Can Give', 'answers')];

afterEach(() => {
  cleanup();
  forgetSearch();
  localStorage.clear();
  for (const k of ['VotSearchMini', 'VotSearchData', 'COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'StateStore', 'fetch', 'findSongFamilies']) delete g[k];
  delete html.dataset.gate;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A fake main engine: ready, answering each search with `answer(q, opts)` (an engine result) or the same hits for all. */
function fakeEngine(answer, more = {}) {
  const parsed = { kind: 'text', terms: ['chosen'] };
  const reply = typeof answer === 'function' ? answer : () => ({ results: answer });
  return {
    getState: () => ({ ready: true }),
    isCurrent: () => true,
    init: vi.fn(() => Promise.resolve()),
    search: vi.fn((q, opts) => Promise.resolve({ parsed, textQuery: parsed, parsedTerms: q.split(' '), ...reply(q, opts) })),
    ...more,
  };
}

const letter = (n, title, text) => ({ doc: { id: 'l' + n, kind: 'letter', volumeId: 'v1', letterNum: n, title, ref: 'Volume One · Letter ' + n, text } });
const verse = { doc: { id: 'v', kind: 'verse', bookId: 'john', chapterNum: 13, verseNum: 18, ref: 'John 13:18', text: 'I know whom I have chosen' } };

describe('gate pictures', () => {
  /** A gate boot of `id` over main's engine rows, the engine present but never asked. */
  async function gateBoot(id) {
    g.COL_BY_KEY = new Map(COLS.map((c) => [c.volKey, c]));
    g.VotSearchMini = fakeEngine([]);
    g.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve(ROWS) }));
    const r = render(<V2App gateId={id} />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(g.VotSearchMini.init).not.toHaveBeenCalled();
    expect(g.VotSearchMini.search).not.toHaveBeenCalled();
    return r.container;
  }
  const pressed = (c) => [...c.querySelectorAll('.seg.sr-seg span')].map((s) => s.getAttribute('aria-pressed'));
  const groupOf = (c, label) => [...c.querySelectorAll('.grp')].find((gr) => (gr.querySelector('.label') || {}).textContent === label);

  it('3a-search: the heading, the empty box, five Try chips and the hint; Search lit', async () => {
    const { container } = render(<V2App gateId="3a-search" />);
    expect(container.querySelector('.page-head.tabroot h1.display').textContent).toBe('Search');
    const q = /** @type {HTMLInputElement} */ (container.querySelector('.field input.q'));
    expect(q.value).toBe('');
    expect(q.placeholder).toBe('Words, a verse, a letter’s name');
    expect(container.querySelector('.field .clear')).toBe(null);
    expect(container.querySelector('.label.rec')).toBe(null);
    expect(container.querySelector('.label.try').textContent).toBe('Try');
    expect(texts(container, '.chips .chip')).toEqual(['born again', 'set apart', 'Chosen by God', 'John 3', 'Volume Three']);
    expect(container.querySelector('.hint').textContent).toMatch(/^One search for the letters, the Bible, Answers and your notes\./);
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Search');
    expect(container.querySelector('.tb .ic[aria-label="More"]')).not.toBe(null);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('3b-search-results: Go to (songs), main\'s count, Relevance lit, Best matches with the original before its reprint', async () => {
    g.fetch = vi.fn(() => new Promise(() => {}));
    const early = render(<V2App gateId="3b-search-results" />);
    await act(async () => { await Promise.resolve(); });
    expect(html.dataset.gate).not.toBe('ready'); // ready waits for the rows
    expect(g.fetch).toHaveBeenCalledWith('src/v2/gate-data/search-rows.json');
    early.unmount();

    const c = await gateBoot('3b-search-results');
    expect(c.querySelector('h1')).toBe(null);
    expect(/** @type {HTMLInputElement} */ (c.querySelector('.field.focus input.q')).value).toBe('chosen');
    expect(texts(c, '.chips.scopes .chip')).toEqual(['All', 'Letters', 'Bible', 'Answers', 'Notes']);
    expect(texts(c, '.chips.scopes .chip.on')).toEqual(['All']);
    expect(texts(c, '.grp > .label')).toEqual(['Go to', 'Best matches', 'In the letters', 'In the Bible', 'In Answers']);
    const go = groupOf(c, 'Go to');
    expect(texts(go, '.hit .where')).toEqual(['Songs of the Letters']);
    expect(texts(go, '.hit .tt')).toEqual(['1 song matches “chosen”']);
    expect(c.querySelector('.sr-sum').textContent).toBe('Found 432 matches across 18 sections');
    expect(c.querySelector('.seg.sr-seg').getAttribute('aria-label')).toBe('Order results');
    expect(texts(c, '.seg.sr-seg span')).toEqual(['Relevance', 'Book order']);
    expect(pressed(c)).toEqual(['true', 'false']);
    expect(c.querySelector('.sr-nt').textContent).toBe('Best matches first');
    const best = groupOf(c, 'Best matches');
    expect(texts(best, '.hit .where')).toEqual(['Volume Four · Letter 18', 'Words To Live By: Part One 35', 'Volume Three · Letter 21',
      'Volume One · Letter 1', "Letters to The Lord's Little Flock · Letter 55"]);
    expect(texts(best, '.hit .tt')).toEqual(['Choose Me', 'Who You Choose', 'Chosen Vessels', 'Chosen by God', 'My Bride Is Chosen']);
    // design's words, cut at the sentence that holds the first mark (dz19)
    expect(best.querySelector('.hit .ex').textContent).toBe('…who you choose, not what you choose, is the answer. For who you choose '
      + 'defines what you do. And whosoever chooses another, and not Me in truth, has chosen themselves, and…');
    expect(texts(best.querySelector('.hit .ex'), 'mark')).toEqual(['choose', 'choose', 'choose', 'chooses', 'chosen']);
    expect(texts(best, '.sr-more')).toEqual(['1 more place in this letter', '1 more place in this entry']);
    expect(best.querySelector('.sr-more').getAttribute('aria-expanded')).toBe('false');
    expect(best.querySelectorAll('.hit.hp')).toHaveLength(2);
  });

  it('3e-search-book-order: Book order lit, the closest matches by collection, the rest behind one button', async () => {
    const c = await gateBoot('3e-search-book-order');
    expect(c.querySelector('.sr-sum').textContent).toBe('Found 669+ matches across 18 sections');
    expect(pressed(c)).toEqual(['false', 'true']);
    expect(c.querySelector('.sr-nt').textContent).toBe('Genesis to Revelation, then Volume One onward');
    expect(texts(c, '.grp > .label')).toEqual(['Closest matches']);
    expect(texts(c, '.sr-col')).toEqual(['Volume Seven· 1 letter', 'Words To Live By: Part Two· 1 entry']);
    expect(texts(c, '.hit .where')).toEqual(['Volume Seven · Letter 15', 'Words To Live By: Part Two 170']);
    expect(texts(c.querySelector('.hit .ex'), 'mark')).toEqual(['grace', 'Grace', 'light', 'Light']);
    const part = c.querySelector('button.btn2.sr-part');
    expect(part.textContent).toBe('Show 667+ partial matches');
    click(part);
    expect(texts(c, '.grp > .label')).toEqual(['Closest matches', 'Partial matches']);
    expect(c.querySelector('.sr-part')).toBe(null);
    expect(texts(c, '.sr-col')[2]).toBe('The Bible· 3 verses');
    // Relevance: the five back, Book order's lists gone
    click(c.querySelectorAll('.seg.sr-seg span')[0]);
    expect(pressed(c)).toEqual(['true', 'false']);
    expect(texts(c, '.grp > .label')[0]).toBe('Best matches');
    expect(c.querySelector('.sr-col')).toBe(null);
  });

  it('3f-search-corrected: main\'s corrections line; the corrected word is a button that puts it in the box', async () => {
    const c = await gateBoot('3f-search-corrected');
    const fix = c.querySelector('.sr-fix');
    expect(fix.textContent).toBe('No results for “rightousness”. Showing results for righteousness.');
    expect(c.querySelector('.sr-sum').textContent).toBe('Found 661+ matches across 17 sections');
    const best = groupOf(c, 'Best matches');
    expect(texts(best, '.hit .where')).toEqual(['Words To Live By: Part Two 173', 'Answers Only God Can Give',
      'Words To Live By: Part One 18', '1 John 3:7', 'Volume Four · Letter 10']);
    expect(best.querySelectorAll('.hit .ex.bx')).toHaveLength(1);
    expect(texts(best, '.sr-more')).toEqual(['7 more places in this topic']);
    click(fix.querySelector('button'));
    expect(/** @type {HTMLInputElement} */ (c.querySelector('.field input.q')).value).toBe('righteousness');
  });

  it('3g-search-recent: Recent above Try, each with its own x; x removes at once with Undo; storage untouched', async () => {
    const c = await gateBoot('3g-search-recent');
    expect(c.querySelector('.label.rec').textContent).toBe('Recent');
    const recent = () => texts(c, '.chip.rc .rq');
    expect(recent()).toEqual(['from grace to grace', 'chosen', 'churches of men', 'Malachi 3:6', 'righteousness']);
    expect([...c.querySelectorAll('.chip.rc .x')].map((x) => x.getAttribute('aria-label'))[1]).toBe('Remove recent search chosen');
    expect(c.querySelector('.label.try')).not.toBe(null);
    expect(c.querySelector('.hint')).toBe(null);
    click(c.querySelectorAll('.chip.rc .x')[1]);
    expect(recent()).toEqual(['from grace to grace', 'churches of men', 'Malachi 3:6', 'righteousness']);
    const toast = document.querySelector('.toast');
    expect(toast.textContent).toBe('Removed “chosen”Undo');
    click(toast.querySelector('.act'));
    expect(recent()).toEqual(['from grace to grace', 'chosen', 'churches of men', 'Malachi 3:6', 'righteousness']);
    expect(document.querySelector('.toast')).toBe(null);
    expect(localStorage.getItem('vot-recent-searches')).toBe(null);
    // a recent search runs: it fills the box
    click(c.querySelectorAll('.chip.rc .rq')[2]);
    expect(/** @type {HTMLInputElement} */ (c.querySelector('.field input.q')).value).toBe('churches of men');
  });

  it('3h-search-scoped: opened from Volume Three, its chip on: one group, the count "in Volume Three"; x searches everywhere', async () => {
    const c = await gateBoot('3h-search-scoped');
    expect(texts(c, '.chips.scopes .chip')).toEqual(['In Volume Three']);
    const chip = c.querySelector('.chips.scopes .chip.on.rc');
    expect(chip.querySelector('.x').getAttribute('aria-label')).toBe('Search everywhere');
    expect(c.querySelector('.sr-sum').textContent).toBe('Found 30 matches in Volume Three');
    expect(pressed(c)).toEqual(['true', 'false']);
    expect(texts(c, '.grp > .label')).toEqual(['In Volume Three']);
    expect(texts(c, '.hit .where').slice(0, 4)).toEqual(['Volume Three · Letter 15', 'Volume Three · Letter 18', 'Volume Three · Letter 23',
      'Volume Three · Letter 29']);
    // main's marks: the typed words and the engine's forms, never the stop word "of"
    const marks = texts(c, '.hit .ex mark');
    expect(marks).toContain('church');
    expect(marks).not.toContain('of');
    click(chip.querySelector('.x'));
    expect(texts(c, '.chips.scopes .chip')).toEqual(['In Volume Three', 'All', 'Letters', 'Bible', 'Answers', 'Notes']);
    expect(c.querySelector('.chips.scopes .chip.ctx').getAttribute('aria-pressed')).toBe(null);
    expect(texts(c, '.chips.scopes .chip.on')).toEqual(['All']);
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
  const pressed = (c) => [...c.querySelectorAll('.seg.sr-seg span')].map((s) => s.getAttribute('aria-pressed'));
  const FIVE = () => [letter(1, 'Chosen by God', 'you are one of My chosen sons'), letter(2, 'Two', 'the chosen to give'), verse,
    letter(3, 'Three', 'chosen three'), letter(4, 'Four', 'chosen four')];

  it('typing searches once after 140 ms: Best matches, then the groups; past three, "More in the letters" opens Letters', async () => {
    vi.useFakeTimers();
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.VotSearchMini = fakeEngine(FIVE());
    const c = openSearch();
    expect(c.querySelector('h1').textContent).toBe('Search');
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: 'c' } });
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: 'chosen' } });
    expect(c.querySelector('h1')).toBe(null);
    await typeAndWait(c, 'chosen');
    expect(g.VotSearchMini.search).toHaveBeenCalledTimes(1);
    expect(g.VotSearchMini.search.mock.calls[0][0]).toBe('chosen');
    expect(g.VotSearchMini.search.mock.calls[0][1]).toMatchObject({ corpus: 'all', limit: 6000, perVolume: 400, translation: 'nkjv', scope: null });
    expect(c.querySelector('.sr-sum').textContent).toBe('Found 5 matches across 2 sections');
    expect(texts(c, '.grp > .label')).toEqual(['Best matches', 'In the letters', 'In the Bible']);
    expect(texts(c.querySelectorAll('.grp')[0], '.hit .where')).toEqual(['Volume One · Letter 1', 'Volume One · Letter 2', 'John 13:18',
      'Volume One · Letter 3', 'Volume One · Letter 4']);
    const letters = c.querySelectorAll('.grp')[1];
    expect(letters.querySelectorAll('.hit').length).toBe(3);
    expect(letters.querySelector('.more').textContent).toBe('More in the letters');
    click(letters.querySelector('.more'));
    expect(texts(c, '.chips.scopes .chip.on')).toEqual(['Letters']);
    expect(texts(c, '.grp > .label')).toEqual(['In the letters']);
    expect(c.querySelector('.sr-sum').textContent).toBe('Found 4 matches across 1 section');
    expect(c.querySelectorAll('.grp .hit').length).toBe(4);
    expect(c.querySelector('.more')).toBe(null);
  });

  it('Book order: the switch flips, collections in reading order; a new query is Relevance again', async () => {
    vi.useFakeTimers();
    g.COL_BY_KEY = new Map([['one', ONE]]);
    const hits = FIVE();
    g.VotSearchMini = fakeEngine([hits[3], hits[0], hits[2], hits[4], hits[1]]);
    const c = openSearch();
    await typeAndWait(c, 'chosen');
    expect(pressed(c)).toEqual(['true', 'false']);
    const [rel, book] = c.querySelectorAll('.seg.sr-seg span');
    expect(book.getAttribute('role')).toBe('button');
    fireEvent.keyDown(book, { key: 'Enter' });
    expect(pressed(c)).toEqual(['false', 'true']);
    expect(c.querySelector('.sr-nt').textContent).toBe('Genesis to Revelation, then Volume One onward');
    expect(texts(c, '.grp > .label')).toEqual([]);
    expect(texts(c, '.sr-col')).toEqual(['The Bible· 1 verse', 'Volume One· 4 letters']);
    expect(texts(c, '.hit .where')).toEqual(['John 13:18', 'Volume One · Letter 1', 'Volume One · Letter 2', 'Volume One · Letter 3',
      'Volume One · Letter 4']);
    click(rel);
    expect(pressed(c)).toEqual(['true', 'false']);
    click(book);
    await typeAndWait(c, 'chosen ones');
    expect(pressed(c)).toEqual(['true', 'false']);
    expect(texts(c, '.grp > .label')[0]).toBe('Best matches');
  });

  it('more places: the line under a letter opens its other places in place; a place opens the letter there', async () => {
    vi.useFakeTimers();
    g.COLLECTIONS = [ONE];
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.LETTERS_V1 = [{ id: 'chosen', num: 1, title: 'Chosen by God', blocks: [] }];
    const far = 'You are chosen of Me. ' + 'And the rivers ran on and on, under the hills. '.repeat(12) + 'Behold, the chosen shall stand.';
    g.VotSearchMini = fakeEngine([letter(1, 'Chosen by God', far)]);
    const c = openSearch();
    await typeAndWait(c, 'chosen');
    const more = c.querySelector('.hit-x .sr-more');
    expect(more.textContent).toBe('1 more place in this letter');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('.hit.hp')).not.toBe(null);
    click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const places = c.querySelectorAll('.sr-pl .sr-p');
    expect(places).toHaveLength(1);
    expect(texts(places[0], 'mark')).toEqual(['chosen']);
    click(places[0]);
    expect(c.querySelector('h1').textContent).toBe('Chosen by God');
    expect(JSON.parse(localStorage.getItem('vot-recent-searches'))).toEqual(['chosen']); // opening a result records it
    click(c.querySelector('.tb button'));
    expect(c.querySelector('.hit-x .sr-more').getAttribute('aria-expanded')).toBe('true');
  });

  it('a hit opens in this tab; Back shows the same results, order and all, without searching again', async () => {
    vi.useFakeTimers();
    g.COLLECTIONS = [ONE];
    g.COL_BY_KEY = new Map([['one', ONE]]);
    g.LETTERS_V1 = [{ id: 'chosen', num: 1, title: 'Chosen by God', blocks: [] }];
    g.VotSearchMini = fakeEngine([letter(1, 'Chosen by God', 'you are one of My chosen sons'), letter(2, 'Two', 'chosen two')]);
    const c = openSearch();
    await typeAndWait(c, 'chosen');
    click(c.querySelectorAll('.seg.sr-seg span')[1]);
    click(c.querySelector('.hit[role="button"]'));
    expect(c.querySelector('h1').textContent).toBe('Chosen by God');
    expect(c.querySelector('.tb .title').textContent).toBe('Search');
    click(c.querySelector('.tb button'));
    expect(/** @type {HTMLInputElement} */ (c.querySelector('.field input.q')).value).toBe('chosen');
    expect(pressed(c)).toEqual(['false', 'true']);
    expect(texts(c, '.sr-col')).toEqual(['Volume One· 2 letters']);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(g.VotSearchMini.search).toHaveBeenCalledTimes(1);
  });

  it('recent searches: Enter records; the empty box lists them; x removes from storage with Undo putting it back', async () => {
    vi.useFakeTimers();
    localStorage.setItem('vot-recent-searches', JSON.stringify(['grace', 'mercy']));
    g.VotSearchMini = fakeEngine([]);
    const c = openSearch();
    expect(texts(c, '.chip.rc .rq')).toEqual(['grace', 'mercy']);
    expect(c.querySelector('.hint')).toBe(null);
    await typeAndWait(c, 'chosen');
    fireEvent.keyDown(c.querySelector('.field input.q'), { key: 'Enter' });
    expect(JSON.parse(localStorage.getItem('vot-recent-searches'))).toEqual(['chosen', 'grace', 'mercy']);
    click(c.querySelector('.field .clear'));
    expect(texts(c, '.chip.rc .rq')).toEqual(['chosen', 'grace', 'mercy']);
    click(c.querySelectorAll('.chip.rc .x')[1]);
    expect(texts(c, '.chip.rc .rq')).toEqual(['chosen', 'mercy']);
    expect(JSON.parse(localStorage.getItem('vot-recent-searches'))).toEqual(['chosen', 'mercy']);
    expect(document.querySelector('.toast').textContent).toBe('Removed “grace”Undo');
    click(document.querySelector('.toast .act'));
    expect(texts(c, '.chip.rc .rq')).toEqual(['chosen', 'grace', 'mercy']);
    expect(JSON.parse(localStorage.getItem('vot-recent-searches'))).toEqual(['chosen', 'grace', 'mercy']);
    // the toast goes by itself
    click(c.querySelectorAll('.chip.rc .x')[0]);
    expect(document.querySelector('.toast')).not.toBe(null);
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(document.querySelector('.toast')).toBe(null);
  });

  it('history off (Your data): no recent searches shown and none recorded', async () => {
    vi.useFakeTimers();
    localStorage.setItem('vot-recent-searches', JSON.stringify(['grace']));
    g.StateStore = { isReady: () => true, get: () => ({ settings: { historyEnabled: false } }) };
    g.VotSearchMini = fakeEngine([]);
    const c = openSearch();
    expect(c.querySelector('.label.rec')).toBe(null);
    expect(c.querySelector('.hint')).not.toBe(null);
    await typeAndWait(c, 'chosen');
    fireEvent.keyDown(c.querySelector('.field input.q'), { key: 'Enter' });
    expect(JSON.parse(localStorage.getItem('vot-recent-searches'))).toEqual(['grace']);
  });

  it('the Search tab names the page it was opened from: its chip leads the row', async () => {
    g.COL_BY_KEY = new Map(COLS.map((c) => [c.volKey, c]));
    const { container: c } = render(<V2App gateId="1a-letter" />);
    click([...c.querySelectorAll('.tabbar .tab')][1]);
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: 'grace' } });
    expect(texts(c, '.chips.scopes .chip')).toEqual(['In Volume One', 'All', 'Letters', 'Bible', 'Answers', 'Notes']);
    click(c.querySelector('.chips.scopes .chip.ctx'));
    expect(texts(c, '.chips.scopes .chip')).toEqual(['In Volume One']);
    // the Search tab again, from Search: the same place
    click([...c.querySelectorAll('.tabbar .tab')][1]);
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: 'grace' } });
    expect(texts(c, '.chips.scopes .chip')[0]).toBe('In Volume One');
    // from Home: no place, no chip
    click([...c.querySelectorAll('.tabbar .tab')][0]);
    click([...c.querySelectorAll('.tabbar .tab')][1]);
    fireEvent.change(c.querySelector('.field input.q'), { target: { value: 'grace' } });
    expect(texts(c, '.chips.scopes .chip')[0]).toBe('All');
  });

  describe('scope chip and the notes line (the screen alone)', () => {
    const FROM = { place: 'search', from: { place: 'letter', collection: 'one', n: 1 } };
    function screen(route = { place: 'search' }) {
      return render(<SearchScreen route={route} gate={null} go={vi.fn()} onReady={() => {}} facts={{}}
        desktop={false} device="phone" pop={() => {}} replace={() => {}} openTab={() => {}} />).container;
    }

    it('on: the engine searches that volume, one group, the count "in Volume One"; nothing there offers everywhere', async () => {
      vi.useFakeTimers();
      g.COL_BY_KEY = new Map([['one', ONE]]);
      g.VotSearchMini = fakeEngine((q, o) => ({ results: q === 'zz top' ? [] : o.scope ? FIVE().filter((h) => h.doc.volumeId === 'v1') : FIVE() }));
      g.findSongFamilies = () => [{}];
      const c = screen(FROM);
      await typeAndWait(c, 'chosen');
      expect(c.querySelector('.chip.ctx').textContent).toBe('In Volume One');
      expect(texts(c, '.grp > .label')[0]).toBe('Go to');
      click(c.querySelector('.chip.ctx'));
      await act(async () => { vi.advanceTimersByTime(140); });
      await act(async () => { await Promise.resolve(); });
      expect(g.VotSearchMini.search.mock.calls.at(-1)[1].scope).toEqual({ volumeId: 'v1' });
      expect(c.querySelector('.sr-sum').textContent).toBe('Found 4 matches in Volume One');
      expect(texts(c, '.grp > .label')).toEqual(['In Volume One']); // no Go to: results from that place only
      await typeAndWait(c, 'zz top');
      expect(c.querySelector('.sr-fix').textContent).toBe('No results for “zz top” in Volume One. Search everywhere');
      click(c.querySelector('.sr-fix button'));
      await act(async () => { vi.advanceTimersByTime(140); });
      await act(async () => { await Promise.resolve(); });
      expect(g.VotSearchMini.search.mock.calls.at(-1)[1].scope).toBe(null);
      expect(c.querySelector('.chip.ctx')).not.toBe(null);
    });

    it("a route's q (Answers' \"Search the whole library for\", mw10 2j): those words everywhere, Relevance, each new route once", async () => {
      vi.useFakeTimers();
      g.COL_BY_KEY = new Map([['one', ONE]]);
      g.VotSearchMini = fakeEngine((q, o) => ({ results: o.scope ? FIVE().filter((h) => h.doc.volumeId === 'v1') : FIVE() }));
      const props = /** @type {any} */ ({ gate: null, go: vi.fn(), onReady: () => {}, facts: {}, desktop: false, device: 'phone', pop: () => {},
        replace: () => {}, openTab: () => {} });
      const box = (root) => /** @type {HTMLInputElement} */ (root.querySelector('.field input.q')).value;
      const settle = async () => { await act(async () => { vi.advanceTimersByTime(140); }); await act(async () => { await Promise.resolve(); }); };
      const last = () => g.VotSearchMini.search.mock.calls.at(-1);
      // scoped to Volume One and in Book order, then asked from elsewhere
      const r = render(<SearchScreen route={FROM} {...props} />);
      const c = r.container;
      await typeAndWait(c, 'chosen');
      click(c.querySelector('.chip.ctx'));
      fireEvent.keyDown(c.querySelectorAll('.seg.sr-seg span')[1], { key: 'Enter' });
      await settle();
      expect(last()[1].scope).toEqual({ volumeId: 'v1' });
      const asked = { ...FROM, q: 'chosen sons' };
      r.rerender(<SearchScreen route={asked} {...props} />);
      await settle();
      expect(box(c)).toBe('chosen sons');
      expect(last()[0]).toBe('chosen sons');
      expect(last()[1].scope).toBe(null);
      expect(pressed(c)).toEqual(['true', 'false']);
      expect(c.querySelector('.sr-sum').textContent).toBe('Found 5 matches across 2 sections');
      // typed over, then the same route again (Back to Search): what was typed stays
      await typeAndWait(c, 'faith');
      r.rerender(<SearchScreen route={asked} {...props} />);
      await settle();
      expect(box(c)).toBe('faith');
      // a new route with the same words asks again; a fresh mount opens on its words
      await typeAndWait(c, 'other');
      r.rerender(<SearchScreen route={{ place: 'search', q: 'chosen sons' }} {...props} />);
      await settle();
      expect(box(c)).toBe('chosen sons');
      cleanup();
      const fresh = render(<SearchScreen route={{ place: 'search', q: 'mercy' }} {...props} />).container;
      await settle();
      expect(box(fresh)).toBe('mercy');
      expect(last()[0]).toBe('mercy');
    });

    it('corrected, unquoted, stop words only, did you mean: main\'s words, the fix a button', async () => {
      vi.useFakeTimers();
      g.VotSearchData = { BOOK_DISPLAY: { genesis: 'Genesis' }, STOP_WORDS_TRIMMED: new Set(['the', 'of']) };
      g.VotSearchMini = fakeEngine((q) => {
        if (q === 'rightousness') return { results: FIVE(), corrections: [{ from: 'rightousness', to: 'righteousness' }] };
        if (q === '"chosen sons of god"') return { results: FIVE(), unquoted: 'chosen sons of god' };
        if (q === 'the') return { results: [], stopWordsOnly: true };
        return { results: [] };
      }, { fuzzyBookSuggest: (q) => (q === 'genisis' ? 'genesis' : null) });
      const c = screen();
      await typeAndWait(c, 'rightousness');
      expect(c.querySelector('.sr-fix').textContent).toBe('No results for “rightousness”. Showing results for righteousness.');
      click(c.querySelector('.sr-fix button'));
      await act(async () => { vi.advanceTimersByTime(140); });
      expect(g.VotSearchMini.search.mock.calls.at(-1)[0]).toBe('righteousness');
      await typeAndWait(c, '"chosen sons of god"');
      expect(c.querySelector('.sr-fix').textContent).toBe('No exact match for “chosen sons of god”. Showing results for its words.');
      await typeAndWait(c, 'the');
      expect(c.querySelector('.sr-fix').textContent).toBe('“the” is in nearly every verse and letter. Add another word to search.');
      expect(c.querySelector('.empty')).toBe(null);
      await typeAndWait(c, 'genisis');
      expect(c.querySelector('.sr-fix').textContent).toBe('No results for “genisis” — did you mean Genesis?');
      click(c.querySelector('.sr-fix button'));
      expect(/** @type {HTMLInputElement} */ (c.querySelector('.field input.q')).value).toBe('Genesis');
    });

    it('the index building counts its progress over a bar; searching says so', async () => {
      vi.useFakeTimers();
      let progress = null;
      g.VotSearchMini = {
        getState: () => ({ ready: false }),
        init: vi.fn((o) => { progress = o.onProgress; return new Promise(() => {}); }),
        search: vi.fn(() => new Promise(() => {})),
      };
      const c = screen();
      await typeAndWait(c, 'chosen');
      expect(c.querySelector('.sr-fix').textContent).toBe('Building search index…');
      act(() => { progress(1200, 4000); });
      expect(c.querySelector('.sr-fix[role="status"]').textContent).toBe('Building search index… 1,200 / 4,000');
      expect(/** @type {HTMLElement} */ (c.querySelector('.sr-bar > i')).style.width).toBe('30%');
    });

    it('while the last rows show, the new search is said only to a screen reader', async () => {
      vi.useFakeTimers();
      g.COL_BY_KEY = new Map([['one', ONE]]);
      let second = false;
      g.VotSearchMini = fakeEngine(() => ({ results: FIVE() }));
      const c = screen();
      await typeAndWait(c, 'chosen');
      g.VotSearchMini.search = vi.fn(() => { second = true; return new Promise(() => {}); });
      await typeAndWait(c, 'chosen one');
      expect(second).toBe(true);
      expect(c.querySelector('.sr-live[role="status"]').textContent).toBe('Searching…');
      expect(c.querySelector('.sr-fix')).toBe(null);
      expect(c.querySelectorAll('.hit').length).toBeGreaterThan(0);
    });
  });

  it('one letter does not search; nothing found says so; Clear empties and refocuses the box', async () => {
    vi.useFakeTimers();
    g.VotSearchMini = fakeEngine([]);
    const c = openSearch();
    await typeAndWait(c, 'x');
    expect(g.VotSearchMini.search).not.toHaveBeenCalled();
    await typeAndWait(c, 'zzqq');
    expect(c.querySelector('.empty .t').textContent).toBe('No results for “zzqq”');
    expect(c.querySelector('.sr-sum')).toBe(null);
    expect(c.querySelector('.seg')).toBe(null);
    click(c.querySelector('.field .clear'));
    const q = /** @type {HTMLInputElement} */ (c.querySelector('.field input.q'));
    expect(q.value).toBe('');
    expect(document.activeElement).toBe(q);
    expect(c.querySelector('h1').textContent).toBe('Search');
  });

  it('no engine: says search could not start', async () => {
    vi.useFakeTimers();
    const c = openSearch();
    await typeAndWait(c, 'chosen');
    expect(c.querySelector('.hint').textContent).toMatch(/^Search couldn’t start\./);
  });
});
