/* v2 Home (mw5; pictures 0a-home, 0b-home-more): Continue and Recent re-show main's saved reading place and history
   (read only), the counts come from the corpus, every row opens its place with the right Back, the gate boots wait for
   the corpus, and 0b's scroll puts Volume Four under the top bar with its hairline. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App, applyGateScroll } from './App.jsx';
import { continueFromState, itemFromHistory, recentItems, describeItem, itemRoutes, savedHome } from './home-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const COLS = [
  ['one', 'Volume One', 'LETTERS_V1', 'vot-one-index'], ['two', 'Volume Two', 'LETTERS', 'vot-index'],
  ['three', 'Volume Three', 'LETTERS_V3', 'vot-three-index'], ['four', 'Volume Four', 'LETTERS_V4', 'vot-four-index'],
  ['five', 'Volume Five', 'LETTERS_V5', 'vot-five-index'], ['six', 'Volume Six', 'LETTERS_V6', 'vot-six-index'],
  ['seven', 'Volume Seven', 'LETTERS_V7', 'vot-seven-index'],
  ['timothy', 'Letters from Timothy', 'LETTERS_TIMOTHY', 'vot-timothy-index'], ['flock', "Letters to The Lord's Little Flock", 'LETTERS_FLOCK', 'vot-flock-index'],
  ['rebuke', "The Lord's Rebuke", 'LETTERS_REBUKE', 'vot-rebuke-index'], ['wtlb1', 'Words To Live By: Part One', 'WTLB_ONE', 'wtlb-one-index'],
  ['wtlb2', 'Words To Live By: Part Two', 'WTLB_TWO', 'wtlb-two-index'], ['blessed', 'The Blessed', 'THE_BLESSED', 'blessed-index'],
  ['holydays', 'Regarding The Holy Days', 'HOLY_DAYS', 'holy-days-index'], ['hm', 'Hidden Manna', 'HIDDEN_MANNA', null],
].map(([volKey, label, globalName, indexScreen]) => ({
  volKey, label, globalName, indexScreen, kind: ['wtlb1', 'wtlb2'].includes(volKey) ? 'wtlb' : volKey === 'blessed' ? 'blessed' : volKey === 'holydays' ? 'holy-days' : 'letter',
}));
const COUNTS = { one: 29, two: 29, three: 30, four: 29, five: 29, six: 31, seven: 67, timothy: 14, flock: 61, rebuke: 30, wtlb1: 149, wtlb2: 203, blessed: 8, holydays: 16, hm: 3 };
const TITLES = { 1: 'Chosen by God', 2: 'Honor Not the Day of the Dead... Honor God' };
const letters = (key, n) => Array.from({ length: n }, (_x, i) => ({ id: key + '-' + (i + 1), num: i + 1, title: (key === 'one' && TITLES[i + 1]) || key + ' letter ' + (i + 1), blocks: [] }));

function installCorpus() {
  g.COLLECTIONS = COLS;
  g.COL_BY_KEY = new Map(COLS.map((c) => [c.volKey, c]));
  g.COL_BY_INDEX_SC = new Map(COLS.filter((c) => c.indexScreen).map((c) => [c.indexScreen, c]));
  for (const c of COLS) g[c.globalName] = letters(c.volKey, COUNTS[c.volKey]);
}

/** index.html's lazy loader, held until the test lets it land. */
function lazyCorpus() {
  const listeners = new Set();
  const corpus = { loaded: false, error: false, v: 0, subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getVersion: () => corpus.v };
  let land;
  const done = new Promise((res) => { land = res; });
  g.__votCorpus = corpus;
  g.__loadVotCorpus = vi.fn(() => done);
  return () => act(async () => { installCorpus(); corpus.loaded = true; corpus.v += 1; listeners.forEach((cb) => cb()); land(); await done; });
}

beforeEach(() => { installCorpus(); });
afterEach(() => {
  cleanup();
  for (const c of COLS) delete g[c.globalName];
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'COL_BY_INDEX_SC', '__votCorpus', '__loadVotCorpus', 'StateStore', 'HistoryStore', 'matchMedia']) delete g[k];
  delete html.dataset.gate;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('saved data, re-shown (read only)', () => {
  it("Continue is main's 'you are here': a volume letter by id, a Bible chapter, a study chapter, or nothing", () => {
    expect(continueFromState({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'one-7' } })).toEqual({ kind: 'letter', collection: 'one', letterId: 'one-7' });
    expect(continueFromState({ activeReadKey: 'john', lastReadChapters: { john: 3 } })).toEqual({ kind: 'chapter', book: 'john', chapter: 3 });
    expect(continueFromState({ activeReadKey: 'bible-study-hosea', lastReadChapters: { 'bible-study-hosea': 'ch2' } }))
      .toEqual({ kind: 'study', studyId: 'hosea', chapterId: 'ch2' });
    expect(continueFromState({ activeReadKey: 'vol:two', lastReadLetterMap: {} })).toBe(null);
    expect(continueFromState({})).toBe(null);
    expect(continueFromState(null)).toBe(null);
  });

  it('a history letter maps to its collection by index screen, or by its id in an older entry; Hidden Manna never shows', () => {
    expect(itemFromHistory({ type: 'letter', letterId: 'two-4', letterNum: 4, volumeScreen: 'vot-index' })).toEqual({ kind: 'letter', collection: 'two', n: 4, letterId: 'two-4' });
    expect(itemFromHistory({ type: 'letter', letterId: 'flock-9' })).toEqual({ kind: 'letter', collection: 'flock', letterId: 'flock-9' });
    expect(itemFromHistory({ type: 'letter', letterId: 'hm-1', volumeScreen: null })).toBe(null);
    expect(itemFromHistory({ type: 'letter', letterId: 'hm-2' })).toBe(null);
    expect(itemFromHistory({ type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3 })).toEqual({ kind: 'chapter', book: 'john', bookTitle: 'John', chapter: 3 });
  });

  it('Recent is the newest distinct places, never the one Continue offers (by id or by number), two at most', () => {
    const cont = /** @type {import('./home-facts.js').HomeItem} */ ({ kind: 'letter', collection: 'one', letterId: 'one-1' });
    const hist = [
      { type: 'letter', letterId: 'one-1', letterNum: 1, volumeScreen: 'vot-one-index' },
      { type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3 },
      { type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3 },
      { type: 'letter', letterId: 'hm-1', volumeScreen: null },
      { type: 'letter', letterId: 'one-2', letterNum: 2, volumeScreen: 'vot-one-index' },
      { type: 'letter', letterId: 'one-5', letterNum: 5, volumeScreen: 'vot-one-index' },
    ];
    const recent = recentItems(hist, cont);
    expect(recent.map((it) => describeItem(it).chip)).toEqual(['John 3', 'Vol. One, Letter 2']);
  });

  it('savedHome reads StateStore and HistoryStore once loaded and writes nothing', () => {
    const set = vi.fn();
    g.StateStore = { isReady: () => true, get: () => ({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'one-1' } }), set };
    g.HistoryStore = { isReady: () => true, list: () => [{ type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3 }], add: set };
    const home = savedHome();
    expect(describeItem(home.continue)).toEqual({ title: 'Chosen by God', where: 'Volume One, Letter 1', chip: 'Vol. One, Letter 1' });
    expect(home.recent).toEqual([{ kind: 'chapter', book: 'john', bookTitle: 'John', chapter: 3 }]);
    expect(set).not.toHaveBeenCalled();
    g.StateStore.isReady = () => false;
    expect(savedHome().continue).toBe(null);
  });

  it('labels and routes: a letter under its collection, a chapter under The Bible and its book, an entry by its title', () => {
    expect(itemRoutes({ kind: 'letter', collection: 'one', letterId: 'one-2' })).toEqual([
      { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 2 }]);
    expect(itemRoutes({ kind: 'chapter', book: 'john', chapter: 3 })).toEqual([
      { place: 'bible' }, { place: 'bible-book', book: 'john' }, { place: 'bible-chapter', book: 'john', chapter: 3 }]);
    expect(describeItem({ kind: 'letter', collection: 'flock', n: 5 }).chip).toBe('Little Flock, Letter 5');
    expect(describeItem({ kind: 'letter', collection: 'wtlb1', n: 3 })).toEqual({ title: 'wtlb1 letter 3', where: 'Words To Live By: Part One', chip: 'wtlb1 letter 3' });
    expect(describeItem({ kind: 'letter', collection: 'one', letterId: 'gone' })).toBe(null);
  });
});

describe('Home on the screen', () => {
  it('0a-home: title, Continue, Recent, the seven volumes with counts from the corpus, Home lit, gear in the bar', async () => {
    const { container } = render(<V2App gateId="0a-home" />);
    expect(container.querySelector('h1.display.xl').textContent).toBe('The Volumesof Truth');
    expect(container.querySelector('.pill.block').textContent.trim()).toBe('Continue reading');
    expect(container.querySelector('.cont-where').textContent).toBe('Chosen by God · Volume One, Letter 1');
    expect([...container.querySelectorAll('.recent .chip')].map((c) => c.textContent)).toEqual(['John 3', 'Vol. One, Letter 2']);
    const cells = [...container.querySelectorAll('.vols button.c')].map((c) => c.textContent);
    expect(cells).toEqual(['Volume One29', 'Volume Two29', 'Volume Three30', 'Volume Four29', 'Volume Five29', 'Volume Six31', 'Volume Seven67']);
    expect([...container.querySelectorAll('.vols .n')].map((c) => c.textContent)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']);
    expect(container.querySelector('.tb .appname').textContent).toBe('VOTReader');
    expect(container.querySelector('.tb .ic').getAttribute('aria-label')).toBe('Settings');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Home');
    const more = [...container.querySelectorAll('.rows .row .tx')].map((r) => r.textContent);
    expect(more).toContain('Letters from Timothy14 letters');
    expect(more).toContain('Words To Live By: Part Two203 letters');
    expect(more).toContain('The Scriptures of TruthGenesis to Revelation · NKJV');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('waits for the lazy corpus before it says ready; the counts and titles come in with it', async () => {
    for (const c of COLS) delete g[c.globalName];
    const land = lazyCorpus();
    const { container } = render(<V2App gateId="0a-home" />);
    expect(g.__loadVotCorpus).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.vols .cnt')).toBe(null);
    await new Promise((r) => setTimeout(r, 30));
    expect(html.dataset.gate).toBe('waiting');
    await land();
    expect(container.querySelector('.cont-where').textContent).toBe('Chosen by God · Volume One, Letter 1');
    expect(container.querySelector('.vols .cnt').textContent).toBe('29');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('a failed corpus load still shows Home (no counts) and says ready', async () => {
    for (const c of COLS) delete g[c.globalName];
    g.__votCorpus = { loaded: false, error: true, subscribe: () => () => {}, getVersion: () => 1 };
    g.__loadVotCorpus = vi.fn(() => Promise.reject(new Error('offline')));
    const { container } = render(<V2App gateId="0a-home" />);
    expect(container.querySelector('h1.display.xl')).not.toBe(null);
    expect(container.querySelector('.vols .cnt')).toBe(null);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('a reader with nothing read yet starts at Letter 1', () => {
    g.StateStore = { isReady: () => true, get: () => ({}) };
    g.HistoryStore = { isReady: () => true, list: () => [] };
    const { container } = render(<V2App gateId={null} />);
    expect(container.querySelector('.pill.block').textContent.trim()).toBe('Start reading');
    expect(container.querySelector('.cont-where').textContent).toBe('Chosen by God · Volume One, Letter 1');
    expect(container.querySelector('.recent')).toBe(null);
  });

  it('Continue opens the letter under its volume; the gear opens Settings; a volume opens its page; Back says Home', () => {
    const { container } = render(<V2App gateId="0a-home" />);
    click(container.querySelector('.pill.block'));
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
    expect(container.querySelector('.tb .title').textContent).toBe('Volume One');
    click(container.querySelector('.tb button[aria-label="Back to Volume One"]'));
    click(container.querySelector('.tb button[aria-label="Back to Home"]'));
    click(container.querySelector('.tb .ic[aria-label="Settings"]'));
    expect(container.querySelectorAll('.srow').length).toBe(6);
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    click(container.querySelector('.tb button[aria-label="Back to Home"]'));
    click([...container.querySelectorAll('.vols button.c')][3]);
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    expect(container.querySelector('h1').textContent).toBe('Volume Four');
    click(container.querySelector('.tb button[aria-label="Back to Home"]'));
    click([...container.querySelectorAll('.recent .chip')][0]);
    expect(container.querySelector('.tb .title').textContent).toBe('John');
    expect(container.querySelector('h1').textContent).toBe('John 3');
  });

  it("0b-home-more: the gate scrolls the page 500 px, as drawn, and the top bar draws its hairline", async () => {
    const { container } = render(<V2App gateId="0b-home-more" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.content').scrollTop).toBe(500);
    expect(container.querySelector('.tb').className).toBe('tb scrolled');
  });

  it('a selector scroll puts that element right under the top bar (phone: bar above the scroller; laptop: sticky inside)', () => {
    // the arithmetic, with layout stubbed (jsdom has none): phone bar above the scroller, laptop bar sticky inside it
    const scroller = document.createElement('div');
    scroller.innerHTML = '<div class="vols"><div class="col"><span class="n last">IV</span></div></div>';
    scroller.getBoundingClientRect = () => /** @type {any} */ ({ top: 120 });
    scroller.querySelector('.n.last').getBoundingClientRect = () => /** @type {any} */ ({ top: 620 });
    applyGateScroll(scroller, '.vols .col:first-child .n.last');
    expect(scroller.scrollTop).toBe(500);
    const main = document.createElement('div');
    main.innerHTML = '<div class="col"><div class="tb"></div><span class="n last">IV</span></div>';
    main.getBoundingClientRect = () => /** @type {any} */ ({ top: 0 });
    main.querySelector('.tb').getBoundingClientRect = () => /** @type {any} */ ({ bottom: 72 });
    main.querySelector('.n.last').getBoundingClientRect = () => /** @type {any} */ ({ top: 572 });
    applyGateScroll(main, '.n.last');
    expect(main.scrollTop).toBe(500);
  });
});
