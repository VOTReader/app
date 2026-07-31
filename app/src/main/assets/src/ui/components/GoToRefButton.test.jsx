/* GoToRefButton — the "Go to Scripture" action on every scripture-ref sheet.
   ──────────────────────────────────────────────────────────────────────────
   Contract: parse the sheet's ref string with the REAL parseRefStr; when it
   reads as a Bible ref, render the gold in-app-link-style button; a tap
   resolves the ref via findBook into a {type:'bible'} endpoint and hands it
   to onGo. findBook needs the lazy Bible corpus — the mount effect pre-warms
   __loadBibleCorpus, and a tap that can't resolve yet retries briefly on an
   interval (the journal-viewer {{ref:}} pattern) instead of dropping the tap. */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { GoToRefButton } from './GoToRefButton.jsx';
import { parseRefStr, splitCompoundRef, findBook } from '../../data/scripture-resolution.js';

const Btn = /** @type {any} */ (GoToRefButton);
const g = /** @type {any} */ (globalThis);

beforeEach(() => {
  // The component reads these as free-var globals (window-attached in prod).
  // Real splitter + real findBook over a stub BOOKS = integration-pair fidelity.
  g.parseRefStr = parseRefStr;
  g.splitCompoundRef = splitCompoundRef;
  g.findBook = findBook;
  window.BOOKS = {
    isaiah: { id: 'isaiah', title: 'Isaiah' },
    john: { id: 'john', title: 'John' },
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete g.parseRefStr;
  delete g.splitCompoundRef;
  delete g.findBook;
  delete window.BOOKS;
  delete window.__loadBibleCorpus;
});

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

it('renders nothing for an unparseable ref string', () => {
  const { container } = render(<Btn refStr="not a reference" onGo={() => {}} />);
  expect(container.firstChild).toBeNull();
});

it('renders nothing when no onGo handler is wired', () => {
  const { container } = render(<Btn refStr="Isaiah 13:11" onGo={null} />);
  expect(container.firstChild).toBeNull();
});

it('shows a clean human label — translation tag stripped', () => {
  const { container } = render(<Btn refStr="John 14:6 (CJB)" onGo={() => {}} />);
  expect(container.querySelector('.fn-sheet-link-eyebrow').textContent).toBe('Go to Scripture');
  expect(container.querySelector('.fn-sheet-link-title').textContent).toBe('John 14:6');
});

it('tap resolves the ref and calls onGo with a bible endpoint', () => {
  const onGo = vi.fn();
  const { container } = render(<Btn refStr="Isaiah 13:11" onGo={onGo} />);
  click(container.querySelector('.sc-sheet-goto-btn'));
  expect(onGo).toHaveBeenCalledTimes(1);
  expect(onGo).toHaveBeenCalledWith({ type: 'bible', bookId: 'isaiah', chapter: 13, verse: 11 });
});

it('a range ref carries verseEnd so the whole span gets highlighted', () => {
  const onGo = vi.fn();
  const { container } = render(<Btn refStr="John 3:16-18" onGo={onGo} />);
  click(container.querySelector('.sc-sheet-goto-btn'));
  expect(onGo).toHaveBeenCalledWith({ type: 'bible', bookId: 'john', chapter: 3, verse: 16, verseEnd: 18 });
});

it('a compound semicolon cite renders ONE button per passage (Matthew study cites)', () => {
  window.BOOKS.psalms = { id: 'psalms', title: 'Psalms' };
  const onGo = vi.fn();
  const { container } = render(<Btn refStr="Psalm 118:14; Isaiah 12:2" onGo={onGo} />);
  const btns = [...container.querySelectorAll('.sc-sheet-goto-btn')];
  expect(btns.length).toBe(2);
  expect(btns[0].querySelector('.fn-sheet-link-title').textContent).toBe('Psalm 118:14');
  expect(btns[1].querySelector('.fn-sheet-link-title').textContent).toBe('Isaiah 12:2');
  click(btns[1]);
  expect(onGo).toHaveBeenCalledWith({ type: 'bible', bookId: 'isaiah', chapter: 12, verse: 2 });
  click(btns[0]);
  expect(onGo).toHaveBeenCalledWith({ type: 'bible', bookId: 'psalms', chapter: 118, verse: 14 });
});

it('an unparseable segment in a compound cite is skipped, parseable ones survive', () => {
  const { container } = render(<Btn refStr="see the gloss; Isaiah 12:2" onGo={() => {}} />);
  const btns = [...container.querySelectorAll('.sc-sheet-goto-btn')];
  expect(btns.length).toBe(1);
  expect(btns[0].querySelector('.fn-sheet-link-title').textContent).toBe('Isaiah 12:2');
});

it('a book-implied continuation carries the book forward (12 of matthew.js 23 compound cites)', () => {
  window.BOOKS.daniel = { id: 'daniel', title: 'Daniel' };
  const onGo = vi.fn();
  const { container } = render(<Btn refStr="Daniel 9:27; 11:31; 12:11" onGo={onGo} />);
  const btns = [...container.querySelectorAll('.sc-sheet-goto-btn')];
  expect(btns.map(b => b.querySelector('.fn-sheet-link-title').textContent))
    .toEqual(['Daniel 9:27', 'Daniel 11:31', 'Daniel 12:11']);
  click(btns[2]);
  expect(onGo).toHaveBeenCalledWith({ type: 'bible', bookId: 'daniel', chapter: 12, verse: 11 });
});

it('a comma verse list becomes its own button (bible-studies.js "1 John 4:9-10, 14")', () => {
  window.BOOKS['1john'] = { id: '1john', title: '1 John' };
  const onGo = vi.fn();
  const { container } = render(<Btn refStr="1 John 4:9-10, 14" onGo={onGo} />);
  const btns = [...container.querySelectorAll('.sc-sheet-goto-btn')];
  expect(btns.map(b => b.querySelector('.fn-sheet-link-title').textContent))
    .toEqual(['1 John 4:9-10', '1 John 4:14']);
  // Verse 14 used to be swallowed by parseRefStr's comma group — unreachable.
  click(btns[1]);
  expect(onGo).toHaveBeenCalledWith({ type: 'bible', bookId: '1john', chapter: 4, verse: 14 });
});

it('pre-warms the Bible corpus on mount', () => {
  window.__loadBibleCorpus = vi.fn();
  render(<Btn refStr="Isaiah 13:11" onGo={() => {}} />);
  expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
});

it('a tap before the corpus loads retries and navigates once it lands (never dropped)', () => {
  vi.useFakeTimers();
  delete window.BOOKS; // corpus not loaded — findBook resolves nothing
  window.__loadBibleCorpus = vi.fn();
  const onGo = vi.fn();
  const { container } = render(<Btn refStr="Isaiah 13:11" onGo={onGo} />);
  click(container.querySelector('.sc-sheet-goto-btn'));
  expect(onGo).not.toHaveBeenCalled();
  expect(window.__loadBibleCorpus).toHaveBeenCalled(); // kicked again at tap
  // Corpus arrives → the retry interval resolves the ref and fires onGo once.
  window.BOOKS = { isaiah: { id: 'isaiah', title: 'Isaiah' } };
  vi.advanceTimersByTime(500);
  expect(onGo).toHaveBeenCalledTimes(1);
  expect(onGo).toHaveBeenCalledWith({ type: 'bible', bookId: 'isaiah', chapter: 13, verse: 11 });
  // The interval is cleared — no repeat fire.
  vi.advanceTimersByTime(2000);
  expect(onGo).toHaveBeenCalledTimes(1);
});

it('gives up after the retry budget without firing onGo (bogus book)', () => {
  vi.useFakeTimers();
  delete window.BOOKS;
  window.__loadBibleCorpus = vi.fn();
  const onGo = vi.fn();
  const { container } = render(<Btn refStr="Isaiah 13:11" onGo={onGo} />);
  click(container.querySelector('.sc-sheet-goto-btn'));
  vi.advanceTimersByTime(40 * 250 + 1000); // exhaust the 40×250ms budget
  expect(onGo).not.toHaveBeenCalled();
});

it('clears a pending retry interval on unmount (sheet closed mid-load)', () => {
  vi.useFakeTimers();
  delete window.BOOKS;
  const onGo = vi.fn();
  const { container, unmount } = render(<Btn refStr="Isaiah 13:11" onGo={onGo} />);
  click(container.querySelector('.sc-sheet-goto-btn'));
  unmount();
  window.BOOKS = { isaiah: { id: 'isaiah', title: 'Isaiah' } };
  vi.advanceTimersByTime(2000);
  expect(onGo).not.toHaveBeenCalled(); // navigation intent dies with the sheet
});
