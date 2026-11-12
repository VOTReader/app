/* FEAT1 (s-ref): "Letters that cite John 3:16 · N" under a Bible reference card. The count and list come from
   VERSE_CITES (src/data/verse-cites.js; utils/scripture-web/verse-cites.test.js holds it to the web's graph);
   here a small fixture of the same shape. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { SrchCard } from './SrchCard.jsx';

// John: chapters of 51, 25 and 36 verses, so John 3:16 is verse id 51 + 25 + 15 = 91.
const ID = (/** @type {number} */ ch, /** @type {number} */ v) => [0, 51, 76][ch - 1] + v - 1;
const FIXTURE = {
  version: 1,
  books: ['john'],
  verses: [[51, 25, 36]],
  votCites: [
    { c: 'two', id: 'the-wide-path', t: 'The Wide Path', s: [[ID(3, 16), 0, 4, '1', null, ID(3, 16)], [ID(3, 16), 0, 9, '3', null, ID(3, 16)]] },
    { c: 'wtlb1', id: 'devotion', t: 'Devotion', s: [[ID(3, 16), 2, 2, 0, null, ID(3, 18)]] },
    { c: 'five', id: 'a-later-word', t: 'A Later Word', s: [[ID(3, 17), 0, 1, '2', null, ID(3, 17)]] },
    { c: 'four', id: 'the-bread', t: 'The Bread', s: [[ID(2, 1), 0, 3, '1', null, ID(2, 1)]] },
  ],
  mirrors: {},
};
const ref = (/** @type {any} */ r, /** @type {string} */ label) => ({ __direct: true, __label: label, __sub: 'words', ref: { kind: 'ref-bible', bookId: 'john', bookTitle: 'John', ...r } });

beforeEach(() => { /** @type {any} */ (window).VERSE_CITES = FIXTURE; });
afterEach(() => { cleanup(); delete (/** @type {any} */ (window)).VERSE_CITES; });

const citeRow = (/** @type {HTMLElement} */ c) => [...c.querySelectorAll('.srch-direct-also button')].find((b) => /Letters that cite/.test(b.textContent || '')) || null;

describe('Letters that cite a reference (FEAT1)', () => {
  it('a verse: the row counts the letters, opens their list, and each card opens its letter at the citation', () => {
    const onOpenCite = vi.fn();
    const { container } = render(<SrchCard entry={ref({ chapter: 3, verseStart: 16 }, 'John 3:16')} terms={[]} onSelect={() => {}} isDirect onOpenCite={onOpenCite} />);
    const row = /** @type {HTMLElement} */ (citeRow(container));
    expect(row.textContent).toBe('Letters that cite John 3:162');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.srch-cite').length).toBe(0);
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const cards = [...container.querySelectorAll('button.srch-cite')];
    // reading order: Volume Two before Words to the Little Book One
    expect(cards.map((b) => b.querySelector('.srch-card-ref').textContent)).toEqual(['The Wide Path', 'Devotion']);
    expect(cards[0].querySelector('.srch-card-loc').textContent).toMatch(/· 2 places$/);
    expect(cards[0].querySelector('.srch-card-snippet').textContent).toBe('Paragraph 5');
    fireEvent.click(cards[0]);
    expect(onOpenCite).toHaveBeenCalledTimes(1);
    expect(onOpenCite.mock.calls[0][0]).toMatchObject({ type: 'letter', letterId: 'the-wide-path', key: 'letter:the-wide-path:4' });
  });

  it('a range and a chapter take in every verse in them', () => {
    let r = render(<SrchCard entry={ref({ chapter: 3, verseStart: 16, verseEnd: 18 }, 'John 3:16-18')} terms={[]} onSelect={() => {}} isDirect />);
    expect(citeRow(r.container).textContent).toBe('Letters that cite John 3:16-183');
    cleanup();
    r = render(<SrchCard entry={ref({ chapter: 3 }, 'John 3')} terms={[]} onSelect={() => {}} isDirect />);
    expect(citeRow(r.container).textContent).toBe('Letters that cite John 33');
    cleanup();
    r = render(<SrchCard entry={ref({ chapter: 2, verseStart: 1 }, 'John 2:1')} terms={[]} onSelect={() => {}} isDirect />);
    expect(citeRow(r.container).textContent).toBe('Letters that cite John 2:11');
  });

  it('no row where no letter cites it, and none for a book or a letter', () => {
    let r = render(<SrchCard entry={ref({ chapter: 1, verseStart: 3 }, 'John 1:3')} terms={[]} onSelect={() => {}} isDirect />);
    expect(citeRow(r.container)).toBeNull();
    expect(r.container.querySelector('.srch-direct-also')).toBeNull();
    cleanup();
    r = render(<SrchCard entry={{ __direct: true, __label: 'John', ref: { kind: 'ref-book', bookId: 'john' } }} terms={[]} onSelect={() => {}} isDirect />);
    expect(citeRow(r.container)).toBeNull();
  });
});

describe('Letters that cite: late letters and an edited reference (PL-SEARCH 3, 5)', () => {
  afterEach(() => { delete (/** @type {any} */ (globalThis)).WTLB_ONE; delete (/** @type {any} */ (globalThis)).__votCorpus; });

  it('quotes the citing sentence once the letters land after the list was first worked out', () => {
    /** @type {Set<() => void>} */
    const subs = new Set();
    let version = 0;
    // the app's window is its global object; under vitest the two differ, and the card reads the global
    /** @type {any} */ (globalThis).__votCorpus = { subscribe: (/** @type {() => void} */ cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => version };
    const { container } = render(<SrchCard entry={ref({ chapter: 3, verseStart: 16 }, 'John 3:16')} terms={[]} onSelect={() => {}} isDirect />);
    fireEvent.click(/** @type {HTMLElement} */ (citeRow(container)));
    const snippet = () => [...container.querySelectorAll('button.srch-cite')][1].querySelector('.srch-card-snippet').textContent;
    expect(snippet()).toBe('Paragraph 3');
    /** @type {any} */ (globalThis).WTLB_ONE = [{ id: 'devotion', paragraphs: [{ text: 'One.' }, { text: 'Two.' }, { text: 'Before it. For God so loved the world {{ref:John 3:16}}. After it.' }] }];
    act(() => { version++; subs.forEach((cb) => cb()); });
    expect(snippet()).toMatch(/For God so loved the world/);
  });

  it('a list opened for one reference is closed for the next, and each is remembered under its own key', () => {
    const memo = 'pl-search-5';
    const at = (/** @type {number} */ v) => <SrchCard entry={ref({ chapter: 3, verseStart: v }, 'John 3:' + v)} terms={[]} onSelect={() => {}} isDirect memo={memo} />;
    const r = render(at(16));
    fireEvent.click(/** @type {HTMLElement} */ (citeRow(r.container)));
    expect(r.container.querySelectorAll('.srch-cite').length).toBe(2);
    r.rerender(at(17));
    expect(citeRow(r.container).getAttribute('aria-expanded')).toBe('false');
    expect(r.container.querySelectorAll('.srch-cite').length).toBe(0);
    fireEvent.click(/** @type {HTMLElement} */ (citeRow(r.container)));
    expect(r.container.querySelectorAll('.srch-cite').length).toBe(2);
    // back at 3:16 its own choice (open) still stands; a fresh card for 3:17 comes back open too
    r.rerender(at(16));
    expect(citeRow(r.container).getAttribute('aria-expanded')).toBe('true');
    cleanup();
    const again = render(at(17));
    expect(citeRow(again.container).getAttribute('aria-expanded')).toBe('true');
  });
});
