/* GoToRefButton — the "Go to Scripture" action on every scripture-ref sheet.
   ──────────────────────────────────────────────────────────────────────────
   Contract: parse the sheet's ref string with the REAL parseRefStr; when it
   reads as a Bible ref, render the gold in-app-link-style button; a tap
   resolves the ref via findBook into a {type:'bible'} endpoint and hands it
   to onGo. findBook needs the lazy Bible corpus — the button warms
   __loadBibleCorpus when it comes into view or on pointerdown/focus, and a tap that can't resolve yet retries briefly on an
   interval (the journal-viewer {{ref:}} pattern) instead of dropping the tap. */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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

/* ── Corpus warm-up (docs/perf/lighthouse-2026-09.md, item 2) ──────────────
   The mount effect used to call __loadBibleCorpus, and FootnoteListSection
   mounts one button per footnote, so every footnoted letter downloaded the
   whole Bible (1.4 MB gzip) at page load. The warm now happens when a button
   comes into view (near the reading column's scroll box), or on pointerdown
   or focus — never at bare mount. */
class FakeIO {
  static last = /** @type {FakeIO | null} */ (null);
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.els = []; this.disconnected = false; FakeIO.last = this; }
  observe(el) { this.els.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  fire(isIntersecting) { this.cb(this.els.map((target) => ({ target, isIntersecting }))); }
}
const withIO = () => { FakeIO.last = null; g.IntersectionObserver = FakeIO; };

it('does NOT load the Bible corpus at mount (a footnoted letter no longer downloads it on open)', () => {
  withIO();
  window.__loadBibleCorpus = vi.fn();
  render(<Btn refStr="Isaiah 13:11" onGo={() => {}} />);
  expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
  delete g.IntersectionObserver;
});

it('warms the corpus once the button comes into view, then stops observing', () => {
  withIO();
  window.__loadBibleCorpus = vi.fn();
  const { container } = render(<Btn refStr="Isaiah 13:11" onGo={() => {}} />);
  const io = FakeIO.last;
  expect(io.els[0]).toBe(container.querySelector('.sc-sheet-goto-btn'));
  io.fire(false);
  expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
  io.fire(true);
  expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
  expect(io.disconnected).toBe(true);
  delete g.IntersectionObserver;
});

it('observes against the reading column scroll box with a look-ahead margin', () => {
  withIO();
  window.__loadBibleCorpus = vi.fn();
  const scroller = document.createElement('div');
  scroller.className = 'screen-scroll';
  document.body.appendChild(scroller);
  render(<Btn refStr="Isaiah 13:11" onGo={() => {}} />, { container: scroller });
  expect(FakeIO.last.opts.root).toBe(scroller);
  expect(FakeIO.last.opts.rootMargin).toMatch(/px/);
  cleanup();
  scroller.remove();
  delete g.IntersectionObserver;
});

it('warms the corpus on pointerdown and on focus, before the tap lands', () => {
  withIO();
  window.__loadBibleCorpus = vi.fn();
  const { container } = render(<Btn refStr="Isaiah 13:11" onGo={() => {}} />);
  const btn = container.querySelector('.sc-sheet-goto-btn');
  fireEvent.pointerDown(btn);
  expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
  fireEvent.focus(btn);
  expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(2);
  delete g.IntersectionObserver;
});

it('disconnects the observer on unmount (no warm after the sheet closes)', () => {
  withIO();
  window.__loadBibleCorpus = vi.fn();
  const { unmount } = render(<Btn refStr="Isaiah 13:11" onGo={() => {}} />);
  const io = FakeIO.last;
  unmount();
  expect(io.disconnected).toBe(true);
  delete g.IntersectionObserver;
});

it('no button, no observer, no warm (unparseable ref)', () => {
  withIO();
  window.__loadBibleCorpus = vi.fn();
  render(<Btn refStr="not a reference" onGo={() => {}} />);
  expect(FakeIO.last).toBeNull();
  expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
  delete g.IntersectionObserver;
});

it('without IntersectionObserver it falls back to the old mount warm', () => {
  delete g.IntersectionObserver;
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
