/* v2 Home (mw5; pictures 0a-home, 0b-home-more): Continue and Recent re-show main's saved reading place and history
   (read only), the counts come from the corpus, every row opens its place with the right Back, the gate boots wait for
   the corpus, and 0b's scroll puts Volume Four under the top bar with its hairline. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App, applyGateScroll } from './App.jsx';
import { continueFromState, itemFromHistory, itemFromTab, itemFromTrack, recentItems, describeItem, itemRoutes, savedHome } from './home-facts.js';

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
  ['holydays', 'Regarding The Holy Days', 'HOLY_DAYS', 'holy-days-index'], ['answers', 'Answers Only God Can Give', 'ANSWERS', 'answers-home'],
  ['hm', 'Hidden Manna', 'HIDDEN_MANNA', null],
].map(([volKey, label, globalName, indexScreen]) => ({
  volKey, label, globalName, indexScreen, prefaceGlobal: volKey === 'one' ? 'LETTERS_V1_PREFACE' : null,
  kind: ['wtlb1', 'wtlb2', 'answers'].includes(volKey) ? 'wtlb' : volKey === 'blessed' ? 'blessed' : volKey === 'holydays' ? 'holy-days' : 'letter',
}));
const COUNTS = { one: 29, two: 29, three: 30, four: 29, five: 29, six: 31, seven: 67, timothy: 14, flock: 61, rebuke: 30, wtlb1: 149, wtlb2: 203, blessed: 8, holydays: 16, answers: 3, hm: 3 };
const TITLES = { 1: 'Chosen by God', 2: 'Honor Not the Day of the Dead... Honor God' };
const letters = (key, n) => Array.from({ length: n }, (_x, i) => ({ id: key + '-' + (i + 1), num: i + 1, title: (key === 'one' && TITLES[i + 1]) || key + ' letter ' + (i + 1), blocks: [] }));

function installCorpus() {
  g.COLLECTIONS = COLS;
  g.COL_BY_KEY = new Map(COLS.map((c) => [c.volKey, c]));
  g.COL_BY_INDEX_SC = new Map(COLS.filter((c) => c.indexScreen).map((c) => [c.indexScreen, c]));
  for (const c of COLS) g[c.globalName] = letters(c.volKey, COUNTS[c.volKey]);
  g.LETTERS_V1_PREFACE = { id: 'a-word-of-warning', title: 'A Word of Warning', blocks: [] };
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
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'COL_BY_INDEX_SC', 'LETTERS_V1_PREFACE', '__votCorpus', '__loadVotCorpus', '__answersCorpus', '__loadAnswersCorpus', 'StateStore', 'HistoryStore', 'AudioLibraryStore', 'AudioPlayer', 'matchMedia']) delete g[k];
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

  it('Recent is the newest distinct places, never the one Continue offers (by id or by number)', () => {
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
    expect(recent.map((it) => describeItem(it).chip)).toEqual(['John 3', 'Vol. One, Letter 2', 'Vol. One, Letter 5']);
  });

  it("main's open pages come into Recent: eight from the history plus any open page further back, then the rest in tab order", () => {
    g.COL_BY_LETTER_SC = new Map(COLS.map((c) => [c.volKey === 'one' ? 'vot-one-letter' : c.volKey === 'wtlb1' ? 'wtlb-one-entry' : 'x-' + c.volKey, c]));
    const hist = Array.from({ length: 10 }, (_x, i) => ({ type: 'letter', letterId: 'one-' + (i + 2), letterNum: i + 2, volumeScreen: 'vot-one-index' }));
    const tabs = [{ screen: 'home' }, { screen: 'vot-one-letter', letterId: 'one-11' }, { screen: 'bible-ch', bookId: 'john', chapterNum: 3 },
      { screen: 'wtlb-one-entry', letterId: 'wtlb1-4' }, { screen: 'vot-one-letter', letterId: 'one-1' }, { screen: 'settings' }];
    const recent = recentItems(hist, { kind: 'letter', collection: 'one', letterId: 'one-1' }, 8, g, tabs);
    expect(recent.map((it) => describeItem(it).chip)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 11].map((n) => 'Vol. One, Letter ' + n)
      .concat(['John 3', 'wtlb1 letter 4']));
    delete g.COL_BY_LETTER_SC;
  });

  it("a recently played recording as a place, read as main opens its text: a letter, a Bible chapter, a study chapter; never Hidden Manna", () => {
    expect(itemFromTrack({ key: 'one:one-4', url: 'u4', partLabel: null, playedAt: 5 })).toEqual({ kind: 'letter', collection: 'one', letterId: 'one-4' });
    expect(itemFromTrack({ key: 'bible-kjv:john', url: 'b', partLabel: 'Chapter 3' })).toEqual({ kind: 'chapter', book: 'john', chapter: 3 });
    expect(itemFromTrack({ key: 'bible-kjv:john', url: 'b', partLabel: null })).toEqual({ kind: 'chapter', book: 'john', chapter: 1 });
    expect(itemFromTrack({ key: 'study:hosea-ch2', url: 's', title: 'Hosea 2' })).toEqual({ kind: 'study', studyId: 'hosea', chapterId: 'hosea-ch2', title: 'Hosea 2' });
    for (const t of [{ key: 'hm:hm-1', url: 'h' }, { key: 'nope:x', url: 'n' }, { key: 'study:hosea', url: 's' }, { key: null, url: 'c' }, { key: 'one:', url: 'e' }, null]) {
      expect(itemFromTrack(t)).toBe(null);
    }
    // a Words To Live By compilation (key null) is its section's first letter, once the player knows it (AudioShelf textKeyOf)
    g.AudioPlayer = { sectionOpeningKey: (t) => (t.url === 'c' ? 'wtlb1:wtlb1-4' : null) };
    expect(itemFromTrack({ key: null, url: 'c' })).toEqual({ kind: 'letter', collection: 'wtlb1', letterId: 'wtlb1-4' });
    expect(itemFromTrack({ key: null, url: 'd' })).toBe(null);
    delete g.AudioPlayer;
  });

  it("main's recently played recordings come into Recent by time with the history (a tie: history first), once each, never Continue's", () => {
    const hist = [{ type: 'letter', letterId: 'one-2', letterNum: 2, volumeScreen: 'vot-one-index', ts: 30 },
      { type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3, ts: 10 }];
    const played = [{ key: 'one:one-6', url: 'a', playedAt: 40 }, { key: 'one:one-2', url: 'b', playedAt: 20 },
      { key: 'one:one-4', url: 'c', playedAt: 10 }, { key: 'one:one-1', url: 'd', playedAt: 9 }, { key: 'hm:hm-1', url: 'e', playedAt: 8 },
      { key: 'bible-kjv:john', url: 'f', partLabel: 'Chapter 3', playedAt: 7 }, { key: 'one:one-7', url: 'g', playedAt: 5 }];
    const cont = /** @type {import('./home-facts.js').HomeItem} */ ({ kind: 'letter', collection: 'one', letterId: 'one-1' });
    expect(recentItems(hist, cont, 8, g, [], played).map((it) => describeItem(it).chip))
      .toEqual(['Vol. One, Letter 6', 'Vol. One, Letter 2', 'John 3', 'Vol. One, Letter 4', 'Vol. One, Letter 7']);
    // only a recording, nothing read: it still shows
    expect(recentItems([], null, 8, g, [], [{ key: 'one:one-4', url: 'u4', partLabel: null, playedAt: 5 }]).map((it) => describeItem(it).chip))
      .toEqual(['Vol. One, Letter 4']);
    // the eight are counted over both; an open page further back still comes in
    g.COL_BY_LETTER_SC = new Map([['vot-one-letter', g.COL_BY_KEY.get('one')]]);
    const many = Array.from({ length: 10 }, (_x, i) => ({ key: 'one:one-' + (i + 2), url: 'm' + i, playedAt: 100 - i }));
    const recent = recentItems(hist, null, 8, g, [{ screen: 'vot-one-letter', letterId: 'one-11' }], many);
    expect(recent.map((it) => describeItem(it).chip)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 11].map((n) => 'Vol. One, Letter ' + n));
    delete g.COL_BY_LETTER_SC;
  });

  it("an open page as a place: a chapter (Matthew's plain text too), a letter by its letter screen, a study chapter; never Hidden Manna", () => {
    g.COL_BY_LETTER_SC = new Map([['vot-one-letter', g.COL_BY_KEY.get('one')], ['hm-letter', g.COL_BY_KEY.get('hm')]]);
    expect(itemFromTab({ screen: 'bible-ch', bookId: 'john', chapterNum: 3 })).toEqual({ kind: 'chapter', book: 'john', chapter: 3 });
    expect(itemFromTab({ screen: 'matthew-ch', bookId: 'matthew-plain', chapterNum: 5 })).toEqual({ kind: 'chapter', book: 'matthew', chapter: 5 });
    expect(itemFromTab({ screen: 'vot-one-letter', letterId: 'one-3' })).toEqual({ kind: 'letter', collection: 'one', letterId: 'one-3' });
    expect(itemFromTab({ screen: 'bible-study-chapter', studyId: 'hosea', studyChapterId: 'hosea-ch2' })).toEqual({ kind: 'study', studyId: 'hosea', chapterId: 'hosea-ch2' });
    for (const t of [{ screen: 'hm-letter', letterId: 'hm-1' }, { screen: 'home' }, { screen: 'bible-ch', bookId: 'john' }, { screen: 'vot-one-index' }, null]) {
      expect(itemFromTab(t)).toBe(null);
    }
    delete g.COL_BY_LETTER_SC;
  });

  it('savedHome reads StateStore, HistoryStore and the recently played once loaded and writes nothing', () => {
    const set = vi.fn();
    g.StateStore = { isReady: () => true, get: () => ({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'one-1' } }), set };
    g.HistoryStore = { isReady: () => true, list: () => [{ type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3, ts: 10 }], add: set };
    g.AudioLibraryStore = { isReady: () => true, recent: () => [{ key: 'one:one-4', url: 'u4', partLabel: null, playedAt: 20 }], recordPlayed: set };
    const home = savedHome();
    expect(describeItem(home.continue)).toEqual({ title: 'Chosen by God', where: 'Volume One, Letter 1', chip: 'Vol. One, Letter 1' });
    expect(home.recent).toEqual([{ kind: 'letter', collection: 'one', letterId: 'one-4' }, { kind: 'chapter', book: 'john', bookTitle: 'John', chapter: 3 }]);
    expect(set).not.toHaveBeenCalled();
    g.AudioLibraryStore.isReady = () => false;
    expect(savedHome().recent).toEqual([{ kind: 'chapter', book: 'john', bookTitle: 'John', chapter: 3 }]);
    g.AudioLibraryStore.recent = () => { throw new Error('no store'); };
    g.AudioLibraryStore.isReady = () => true;
    expect(savedHome().recent).toEqual([{ kind: 'chapter', book: 'john', bookTitle: 'John', chapter: 3 }]);
    g.StateStore.isReady = () => false;
    expect(savedHome().continue).toBe(null);
  });

  it("a volume's preface is a place too (main keeps it outside the letters): from the history, an open page, a recording, Continue", () => {
    const pre = /** @type {import('./home-facts.js').HomeItem} */ ({ kind: 'letter', collection: 'one', letterId: 'a-word-of-warning' });
    expect(describeItem(pre)).toEqual({ title: 'A Word of Warning', where: 'Volume One, Preface', chip: 'Vol. One, Preface' });
    expect(itemRoutes(pre)).toEqual([{ place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', preface: true }]);
    g.COL_BY_LETTER_SC = new Map([['vot-one-letter', g.COL_BY_KEY.get('one')]]);
    const hist = [{ type: 'letter', letterId: 'a-word-of-warning', letterTitle: 'A Word of Warning', letterNum: null, volumeScreen: 'vot-one-index', ts: 9 }];
    const played = [{ key: 'one:a-word-of-warning', url: 'p', partLabel: null, playedAt: 5 }];
    for (const [h, tabs, pl] of [[hist, [], []], [[], [{ screen: 'vot-one-letter', letterId: 'a-word-of-warning' }], []], [[], [], played],
      [hist, [{ screen: 'vot-one-letter', letterId: 'a-word-of-warning' }], played]]) {
      expect(recentItems(h, null, 8, g, tabs, pl).map((it) => describeItem(it).chip)).toEqual(['Vol. One, Preface']);
    }
    expect(recentItems(hist, continueFromState({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'a-word-of-warning' } }), 8, g, [], played)).toEqual([]);
    expect(describeItem(continueFromState({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'a-word-of-warning' } })).where).toBe('Volume One, Preface');
    delete g.COL_BY_LETTER_SC;
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

  it("an Answers topic main read comes into Recent once its own corpus lands (asked only when one is there), and opens it", async () => {
    delete g.ANSWERS;
    const listeners = new Set();
    const corpus = { loaded: false, v: 0, subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getVersion: () => corpus.v };
    g.__answersCorpus = corpus;
    g.__loadAnswersCorpus = vi.fn(() => Promise.resolve());
    g.StateStore = { isReady: () => true, get: () => ({}) };
    g.HistoryStore = { isReady: () => true, list: () => [] };
    const first = render(<V2App gateId={null} />);
    expect(g.__loadAnswersCorpus).not.toHaveBeenCalled();
    first.unmount();
    g.HistoryStore = { isReady: () => true, list: () => [{ type: 'letter', letterId: 'answers-2', letterTitle: 'answers letter 2', letterNum: 2, volumeScreen: 'answers-home', ts: 5 },
      { type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3, ts: 4 }] };
    const { container } = render(<V2App gateId={null} />);
    expect([...container.querySelectorAll('.recent .chip')].map((c) => c.textContent)).toEqual(['John 3']);
    expect(g.__loadAnswersCorpus).toHaveBeenCalledTimes(1);
    await act(async () => { g.ANSWERS = letters('answers', 3); corpus.loaded = true; corpus.v += 1; listeners.forEach((cb) => cb()); });
    expect([...container.querySelectorAll('.recent .chip')].map((c) => c.textContent)).toEqual(['answers letter 2', 'John 3']);
    await click(container.querySelector('.recent .chip'));
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('answers letter 2'));
  });

  it('a reader with nothing read yet starts at Letter 1', () => {
    g.StateStore = { isReady: () => true, get: () => ({}) };
    g.HistoryStore = { isReady: () => true, list: () => [] };
    const { container } = render(<V2App gateId={null} />);
    expect(container.querySelector('.pill.block').textContent.trim()).toBe('Start reading');
    expect(container.querySelector('.cont-where').textContent).toBe('Chosen by God · Volume One, Letter 1');
    expect(container.querySelector('.recent')).toBe(null);
  });

  it('a real boot keeps the letter Start reading opens as main does: its history entry and the place', () => {
    let state = { theme: 'dark' };
    g.StateStore = { isReady: () => true, get: () => state, set: vi.fn((s) => { state = s; }) };
    g.HistoryStore = { isReady: () => true, list: () => [], add: vi.fn() };
    const { container } = render(<V2App gateId={null} />);
    expect(g.HistoryStore.add).not.toHaveBeenCalled();
    click(container.querySelector('.pill.block'));
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
    expect(g.HistoryStore.add).toHaveBeenCalledWith({ type: 'letter', letterId: 'one-1', letterTitle: 'Chosen by God', letterNum: 1, volumeScreen: 'vot-one-index' });
    expect(state).toEqual({ theme: 'dark', activeReadKey: 'vol:one', lastReadLetterMap: { one: 'one-1' } });
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
