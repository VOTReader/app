/* v2 Bible pages (mw5; pictures 5a-bible, 5b-book): the books come from main's canon table (there before the Bible loads),
   "Reading" marks the newest Bible chapter in main's history, a book's chapters show main's read record dotted and the
   reader's place ringed; a real boot reads main's stores and writes nothing, a gate boot reads its facts instead. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { BibleScreen, BookScreen } from './screens/BibleScreen.jsx';
import { BOOK_LIST, OT_COUNT, bookOf, testamentBooks, readingBook, bookProgress, savedBible, translationName } from './bible-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const titles = (container) => [...container.querySelectorAll('.rows.bks .row.bk .t')].map((t) => t.textContent);

/** main's StateStore and HistoryStore as a page reads them; writes are spies that must stay untouched. */
function installStores(state, entries = []) {
  g.StateStore = { isReady: () => true, get: vi.fn(() => state), set: vi.fn(), update: vi.fn() };
  g.HistoryStore = { isReady: () => true, list: vi.fn(() => entries), add: vi.fn(), push: vi.fn(), clear: vi.fn() };
}

/** A page's props on a real boot (no gate). */
const realProps = (over = {}) => ({
  facts: { translation: 'nkjv' }, gate: null, desktop: false, device: /** @type {'phone'} */ ('phone'), go: vi.fn(), pop: vi.fn(),
  replace: vi.fn(), openTab: vi.fn(), onReady: vi.fn(), ...over,
});

afterEach(() => {
  cleanup();
  for (const k of ['StateStore', 'HistoryStore', 'translationLabel', 'AudioPlayer']) delete g[k];
  delete html.dataset.gate;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the canon', () => {
  it('66 books, Genesis to Malachi then Matthew to Revelation, with their chapter counts', () => {
    expect(BOOK_LIST.length).toBe(66);
    expect(testamentBooks('old').length).toBe(OT_COUNT);
    expect(testamentBooks('new').length).toBe(27);
    expect(testamentBooks('old')[0]).toEqual({ id: 'genesis', title: 'Genesis', chapters: 50, testament: 'old' });
    expect(testamentBooks('old')[38].title).toBe('Malachi');
    expect(testamentBooks('new')[0]).toEqual({ id: 'matthew-plain', title: 'Matthew', chapters: 28, testament: 'new' });
    expect(testamentBooks('new')[26]).toMatchObject({ title: 'Revelation', chapters: 22 });
    expect(bookOf('psalms')).toMatchObject({ title: 'Psalms', chapters: 150 });
  });

  it("main's study Matthew ('matthew') is the canon Matthew; an unknown id is no book", () => {
    expect(bookOf('matthew')).toBe(bookOf('matthew-plain'));
    expect(bookOf('nope')).toBe(null);
  });

  it("names the translation as main does, else its id upper-cased", () => {
    expect(translationName(undefined)).toBe('NKJV');
    expect(translationName('rvr1960')).toBe('RVR1960');
    g.translationLabel = (id) => (id === 'kjv' ? 'KJV 1769' : 'NKJV');
    expect(translationName('kjv')).toBe('KJV 1769');
  });
});

describe('what is being read', () => {
  it("the newest Bible chapter in main's history wins over its active place; letters in between are skipped", () => {
    const state = { activeReadKey: 'genesis', lastReadChapters: { genesis: 4 } };
    const entries = [
      { type: 'letter', letterId: 'christmas', volumeScreen: 'vot-one-index' },
      { type: 'chapter', bookId: 'john', chapterNum: 3 },
      { type: 'chapter', bookId: 'genesis', chapterNum: 4 },
    ];
    expect(readingBook(state, entries)).toBe('john');
    expect(readingBook(state, [{ type: 'chapter', bookId: 'matthew', chapterNum: 5 }])).toBe('matthew-plain');
  });

  it("no Bible history: main's active Bible place; a letter or nothing saved: no book", () => {
    expect(readingBook({ activeReadKey: 'genesis', lastReadChapters: { genesis: 4 } }, [])).toBe('genesis');
    expect(readingBook({ activeReadKey: 'vol:one', lastReadLetterMap: { one: 'christmas' } }, [])).toBe(null);
    expect(readingBook(null, null)).toBe(null);
    expect(readingBook({}, [{ type: 'chapter', bookId: 'not-a-book', chapterNum: 1 }])).toBe(null);
  });

  it("a book's read chapters are main's read marks ('v1:<book>:<n>'); the place is its last chapter, moved past read ones", () => {
    const genesis = /** @type {any} */ (bookOf('genesis'));
    const readItems = {};
    for (let c = 1; c <= 11; c += 1) readItems['v1:genesis:' + c] = 1;
    readItems['v1:exodus:1'] = 1;
    expect(bookProgress({ readItems, lastReadChapters: { genesis: 12 } }, genesis)).toEqual({ read: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], place: 12 });
    // the reader finished chapter 11 where it left off: the ring moves on to 12
    expect(bookProgress({ readItems, lastReadChapters: { genesis: 11 } }, genesis).place).toBe(12);
    expect(bookProgress({ readItems, lastReadChapters: { genesis: 3 } }, genesis).place).toBe(12);
    expect(bookProgress({ readItems }, genesis)).toEqual({ read: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], place: null });
    expect(bookProgress({ readItems, lastReadChapters: { genesis: 51 } }, genesis).place).toBe(null);
    expect(bookProgress(null, genesis)).toEqual({ read: [], place: null });
  });

  it('every chapter from the place to the end read: no ring', () => {
    const jude = /** @type {any} */ (bookOf('jude'));
    expect(bookProgress({ readItems: { 'v1:jude:1': 1 }, lastReadChapters: { jude: 1 } }, jude)).toEqual({ read: [1], place: null });
  });

  it("reads main's stores only once they are ready, and never writes", () => {
    expect(savedBible({})).toEqual({ state: null, entries: [] });
    expect(savedBible({ StateStore: { isReady: () => false, get: () => ({ a: 1 }) } })).toEqual({ state: null, entries: [] });
    installStores({ activeReadKey: 'john' }, [{ type: 'chapter', bookId: 'john', chapterNum: 3 }]);
    expect(savedBible()).toEqual({ state: { activeReadKey: 'john' }, entries: [{ type: 'chapter', bookId: 'john', chapterNum: 3 }] });
    expect(g.StateStore.set).not.toHaveBeenCalled();
    expect(g.StateStore.update).not.toHaveBeenCalled();
  });
});

describe('5a-bible, the gate picture', () => {
  it('opens on the New Testament with John marked "Reading"; Back names Home', async () => {
    const { container } = render(<V2App gateId="5a-bible" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    expect(container.querySelector('.overline').textContent).toBe('The Scriptures of Truth · NKJV');
    expect(container.querySelector('h1.display').textContent).toBe('The Bible');
    const seg = [...container.querySelectorAll('.seg.tst [role="radio"]')];
    expect(seg.map((s) => [s.textContent, s.getAttribute('aria-checked')])).toEqual([['Old Testament', 'false'], ['New Testament', 'true']]);
    expect(seg[1].className).toBe('on');
    const names = titles(container);
    expect(names.length).toBe(27);
    expect(names.slice(0, 5)).toEqual(['Matthew', 'Mark', 'Luke', 'John', 'Acts']);
    const cur = [...container.querySelectorAll('.row.bk.cur')];
    expect(cur.map((r) => r.querySelector('.t').textContent)).toEqual(['John']);
    expect(cur[0].querySelector('.here').textContent).toBe('Reading');
    expect(container.querySelectorAll('.row.bk .here').length).toBe(1);
  });

  it('the switch shows the Old Testament (no book marked there), and back', () => {
    const { container } = render(<V2App gateId="5a-bible" />);
    click(container.querySelectorAll('.seg.tst [role="radio"]')[0]);
    const names = titles(container);
    expect(names.length).toBe(39);
    expect(names[0]).toBe('Genesis');
    expect(names[38]).toBe('Malachi');
    expect(container.querySelector('.row.bk.cur')).toBe(null);
    expect(container.querySelectorAll('.seg.tst [role="radio"]')[0].getAttribute('aria-checked')).toBe('true');
    const nt = container.querySelectorAll('.seg.tst [role="radio"]')[1];
    act(() => { nt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(titles(container).length).toBe(27);
  });

  it('a book opens its chapters (Back names The Bible) and Back returns to the list', () => {
    const { container } = render(<V2App gateId="5a-bible" />);
    const john = [...container.querySelectorAll('.row.bk')].find((r) => r.querySelector('.t').textContent === 'John');
    click(/** @type {any} */ (john));
    expect(container.querySelector('h1.display').textContent).toBe('John');
    expect(container.querySelector('.lede').textContent).toBe('21 chapters');
    expect(container.querySelector('.tb .title').textContent).toBe('The Bible');
    click(container.querySelector('.tb button[aria-label="Back to The Bible"]'));
    expect(container.querySelector('h1.display').textContent).toBe('The Bible');
  });

  it('the gate boot reads no stores', async () => {
    installStores({ activeReadKey: 'genesis', lastReadChapters: { genesis: 4 } });
    render(<V2App gateId="5a-bible" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(g.HistoryStore.list).not.toHaveBeenCalled();
    expect(g.StateStore.set).not.toHaveBeenCalled();
  });
});

describe('5b-book, the gate picture', () => {
  it('Genesis: 50 chapters, 1-11 read (dotted), 12 ringed, the rest plain; Back names The Bible', async () => {
    const { container } = render(<V2App gateId="5b-book" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .title').textContent).toBe('The Bible');
    expect(container.querySelector('.overline').textContent).toBe('The Scriptures of Truth · NKJV');
    expect(container.querySelector('h1.display').textContent).toBe('Genesis');
    expect(container.querySelector('.lede').textContent).toBe('50 chapters');
    const ch = [...container.querySelectorAll('.chgrid .ch')];
    expect(ch.map((c) => c.textContent)).toEqual(Array.from({ length: 50 }, (_x, i) => String(i + 1)));
    expect(ch.filter((c) => c.classList.contains('read')).map((c) => c.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(ch.filter((c) => c.classList.contains('cur')).map((c) => c.textContent)).toEqual(['12']);
    expect(ch[10].getAttribute('aria-label')).toBe('Genesis 11, read');
    expect(ch[11].getAttribute('aria-label')).toBe('Genesis 12, where you are');
    expect(ch[12].getAttribute('aria-label')).toBe('Genesis 13');
  });

  it('a chapter opens the Bible reader at that chapter', () => {
    const go = vi.fn();
    const gate = { facts: { bible: { read: { genesis: [1] }, place: { genesis: 2 } } } };
    const { container } = render(<BookScreen route={{ place: 'bible-book', book: 'genesis' }} {...realProps({ gate, go })} />);
    click(container.querySelectorAll('.chgrid .ch')[11]);
    expect(go).toHaveBeenCalledWith({ place: 'bible-chapter', book: 'genesis', chapter: 12 });
  });

  it('a one-chapter book says "1 chapter"; an unknown book says it could not be opened, and is ready', () => {
    const onReady = vi.fn();
    const { container, unmount } = render(<BookScreen route={{ place: 'bible-book', book: 'jude' }} {...realProps({ onReady })} />);
    expect(container.querySelector('.lede').textContent).toBe('1 chapter');
    expect(onReady).toHaveBeenCalled();
    unmount();
    const ready2 = vi.fn();
    const again = render(<BookScreen route={{ place: 'bible-book', book: 'nope' }} {...realProps({ onReady: ready2 })} />);
    expect(again.container.querySelector('.empty .t').textContent).toBe('This book could not be opened.');
    expect(ready2).toHaveBeenCalled();
  });
});

describe('a real boot', () => {
  it("The Bible opens on the testament of the book main's history says is being read, and writes nothing", () => {
    installStores({ activeReadKey: 'john', lastReadChapters: { john: 3, genesis: 2 } },
      [{ type: 'chapter', bookId: 'genesis', chapterNum: 2 }, { type: 'chapter', bookId: 'john', chapterNum: 3 }]);
    const { container } = render(<BibleScreen route={{ place: 'bible' }} {...realProps()} />);
    expect(titles(container).length).toBe(39);
    expect(container.querySelector('.row.bk.cur .t').textContent).toBe('Genesis');
    expect(g.StateStore.set).not.toHaveBeenCalled();
    expect(g.StateStore.update).not.toHaveBeenCalled();
    expect(g.HistoryStore.add).not.toHaveBeenCalled();
  });

  it('nothing read yet: the Old Testament, no book marked; a row opens its book', () => {
    const go = vi.fn();
    const { container } = render(<BibleScreen route={{ place: 'bible' }} {...realProps({ go })} />);
    expect(titles(container)[0]).toBe('Genesis');
    expect(container.querySelector('.row.bk.cur')).toBe(null);
    click(container.querySelectorAll('.row.bk')[18]);
    expect(go).toHaveBeenCalledWith({ place: 'bible-book', book: 'psalms' });
  });

  it("a book's chapters are main's read marks and place", () => {
    const readItems = { 'v1:john:1': 1, 'v1:john:2': 1, 'v1:genesis:5': 1 };
    installStores({ readItems, lastReadChapters: { john: 2 } });
    const { container } = render(<BookScreen route={{ place: 'bible-book', book: 'john' }} {...realProps()} />);
    expect([...container.querySelectorAll('.chgrid .ch.read')].map((c) => c.textContent)).toEqual(['1', '2']);
    expect([...container.querySelectorAll('.chgrid .ch.cur')].map((c) => c.textContent)).toEqual(['3']);
    expect(g.StateStore.set).not.toHaveBeenCalled();
  });

  it("main's study Matthew opens the canon Matthew's chapters", () => {
    const { container } = render(<BookScreen route={{ place: 'bible-book', book: 'matthew' }} {...realProps()} />);
    expect(container.querySelector('h1.display').textContent).toBe('Matthew');
    expect(container.querySelectorAll('.chgrid .ch').length).toBe(28);
  });
});

describe('laptop (D5)', () => {
  it('the books run down three columns: --n rows each, the first row of each column marked .top', () => {
    const { container } = render(<BibleScreen route={{ place: 'bible', testament: 'old' }} {...realProps({ desktop: true })} />);
    const list = /** @type {HTMLElement} */ (container.querySelector('.rows.bks'));
    expect(list.style.getPropertyValue('--n')).toBe('13');
    const tops = [...list.querySelectorAll('.row.bk.top')].map((r) => r.querySelector('.t').textContent);
    expect(tops).toEqual(['Genesis', '2 Chronicles', 'Daniel']);
    cleanup();
    const nt = render(<BibleScreen route={{ place: 'bible', testament: 'new' }} {...realProps({ desktop: true })} />);
    expect(/** @type {HTMLElement} */ (nt.container.querySelector('.rows.bks')).style.getPropertyValue('--n')).toBe('9');
    expect([...nt.container.querySelectorAll('.row.bk.top')].map((r) => r.querySelector('.t').textContent))
      .toEqual(['Matthew', 'Ephesians', 'Hebrews']);
  });

  it('the phone list has no columns', () => {
    const { container } = render(<BibleScreen route={{ place: 'bible' }} {...realProps()} />);
    expect(/** @type {HTMLElement} */ (container.querySelector('.rows.bks')).style.getPropertyValue('--n')).toBe('');
    expect(container.querySelector('.row.bk.top')).toBe(null);
  });
});
