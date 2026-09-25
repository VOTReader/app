// @ts-nocheck - a small hand-made graph (the shape decode.js produces)
/* n6-05 (sweep 2, 09-25): the list fallback opened on the newest chapter in
   History. Following a connection reads a verse, which History records, so
   coming back (or pressing Try again, which remounts it) dropped the reader's
   place for the chapter they had just visited. The list now keeps its own place. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { WebFallbackList } from './WebFallbackList.jsx';

const graph = () => ({
  total: 30, count: 0, from: new Uint16Array(0), to: new Uint16Array(0), votes: new Int16Array(0),
  buckets: [{ off: 0, len: 0, off20: 0, off10: 0, segments: 8, chunks: [] }],
  books: [{ id: 'genesis', title: 'Genesis', abbr: 'Gen', start: 0 }],
  chapters: [[0, 1, 0, 10], [0, 2, 10, 10], [0, 3, 20, 10]],
  chapterOfVerse: new Uint16Array(30), densityTiers: [20, 7], votEdges: [], prophecy: [], votLinks: [],
});
const noop = () => {};
const list = (g, initialChapter) => render(<WebFallbackList graph={g} initialChapter={initialChapter}
  onOpen={noop} onRetry={noop} onBack={noop} verseText={() => ''} />);

afterEach(cleanup);

describe('WebFallbackList keeps its place (n6-05)', () => {
  it('opens where the reader left it, not on the chapter History saw last', () => {
    const g = graph();
    const first = list(g, 0);
    expect(first.container.querySelector('.sw-fallback-list').getAttribute('data-chapter')).toBe('Genesis 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));   // the screen remounts the list
    first.unmount();
    const again = list(g, 1);   // History's newest chapter: the one a followed connection visited
    expect(again.container.querySelector('.sw-fallback-list').getAttribute('data-chapter')).toBe('Genesis 3');
    again.unmount();
    // any other way in opens on History's chapter, as before
    expect(list(g, 1).container.querySelector('.sw-fallback-list').getAttribute('data-chapter')).toBe('Genesis 2');
  });
});

/* n6-06 (sweep 2): the list moved one chapter at a time through 1,189
   chapters. The chapter label opens a panel under the stepper: the book (a
   select) and that book's chapters (a grid); a tap goes there. Mockup:
   lanes/myweb/out/mockups/n606/n606-r2-john.png. */
describe('WebFallbackList jumps to any chapter (n6-06)', () => {
  const two = () => ({
    ...graph(),
    books: [{ id: 'genesis', title: 'Genesis', abbr: 'Gen', start: 0 }, { id: 'exodus', title: 'Exodus', abbr: 'Exo', start: 3 }],
    chapters: [[0, 1, 0, 10], [0, 2, 10, 10], [0, 3, 20, 10], [1, 1, 30, 10], [1, 2, 40, 10]],
    total: 50,
  });
  const at = (c) => c.container.querySelector('.sw-fallback-list').getAttribute('data-chapter');
  const toggle = () => screen.getByRole('button', { name: /choose a chapter/ });

  it('the chapter label opens and closes the picker', () => {
    list(two(), 1);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('combobox', { name: 'Book' })).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Book' }).value).toBe('0');
    fireEvent.click(toggle());
    expect(screen.queryByRole('combobox', { name: 'Book' })).toBeNull();
  });

  it("shows the book's chapters with the current one marked, and a tap goes there and closes", () => {
    const c = list(two(), 1);
    fireEvent.click(toggle());
    const grid = screen.getByRole('group', { name: 'Chapters of Genesis' });
    const buttons = grid.querySelectorAll('button');
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual(['1', '2', '3']);
    expect(buttons[1].getAttribute('aria-current')).toBe('true');
    expect(buttons[0].getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Genesis 3' }));
    expect(at(c)).toBe('Genesis 3');
    expect(screen.queryByRole('combobox', { name: 'Book' })).toBeNull();
    expect(document.activeElement).toBe(toggle());   // focus comes back to the label
  });

  it('another book lists its own chapters; none is marked until one is chosen', () => {
    const c = list(two(), 0);
    fireEvent.click(toggle());
    fireEvent.change(screen.getByRole('combobox', { name: 'Book' }), { target: { value: '1' } });
    const grid = screen.getByRole('group', { name: 'Chapters of Exodus' });
    expect(Array.from(grid.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['1', '2']);
    expect(grid.querySelector('[aria-current]')).toBeNull();
    expect(at(c)).toBe('Genesis 1');   // choosing a book alone goes nowhere
    fireEvent.click(screen.getByRole('button', { name: 'Exodus 2' }));
    expect(at(c)).toBe('Exodus 2');
  });

  it('Escape closes the picker and gives focus back to the label', () => {
    list(two(), 0);
    fireEvent.click(toggle());
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Book' }), { key: 'Escape' });
    expect(screen.queryByRole('combobox', { name: 'Book' })).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('the arrows still step, and the label follows', () => {
    const c = list(two(), 2);
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    expect(at(c)).toBe('Exodus 1');
    expect(toggle().textContent).toBe('Exodus 1');
  });

  it('66 books: the select groups them Old and New Testament', () => {
    const books = Array.from({ length: 66 }, (_, i) => ({ id: 'b' + i, title: 'Book ' + i, abbr: 'B' + i, start: i }));
    const g = { ...graph(), books, chapters: books.map((_, i) => [i, 1, i * 10, 10]), total: 660 };
    list(g, 40);
    fireEvent.click(toggle());
    const groups = screen.getByRole('combobox', { name: 'Book' }).querySelectorAll('optgroup');
    expect(Array.from(groups).map((o) => [o.label, o.children.length])).toEqual([['Old Testament', 39], ['New Testament', 27]]);
  });
});
