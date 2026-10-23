/* rs1 (Corbin 2026-10-22): "if I highlight a verse denoter number, the listen from here and repeat features
   disappear from the popup menu completely, meaning I can't highlight across multiple verses because the numbers get
   lumped in".
   ────────────────────────────────────────────────────────────────────────────
   A verse number sits in the gutter BESIDE its verse's [data-hl-key] block (BibleChapterView, ChapterView), not in
   it. A selection that started on one started outside every block: listenFromTarget found no block, so the toolbar
   offered no Listen from here (and Repeat only ever sits beside it); one verse took the multi-verse branch, so the
   swatch of a highlight already there lost its ring; and a selection with both ends on numbers, or of a number
   alone (a long-press on "16"), raised the browser's own menu instead of the toolbar. A boundary on a verse number
   now belongs to that verse (utils/reading-range.js): an end on a number stops before its verse, a start on one
   starts at its first word, and a number alone is its verse.

   BibleChapterView's markup (gutter number, verse block, icons, space), a real Range stubbed into
   window.getSelection (as in SelectionToolbar.test.jsx), raised by the long-press's contextmenu. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';

const V = {
  15: 'That whoever believes in Him should not perish but have eternal life.',
  16: 'For God so loved the world that He gave His only begotten Son, that whoever believes in Him should not perish but have everlasting life.',
  17: 'For God did not send His Son into the world to condemn the world, but that the world through Him might be saved.',
  18: 'He who believes in Him is not condemned; but he who does not believe is condemned already.',
};
const KEY = (/** @type {number} */ n) => 'bible:john:3:' + n;
const g = /** @type {any} */ (globalThis);
let _origGetSelection;
/** @type {PropertyDescriptor | undefined} */ let origClipboard;
/** @type {string[]} */ let written;
/** @type {any} */ let lf;

function chapter() {
  const wrap = document.createElement('div');
  wrap.className = 'verses-block';
  wrap.innerHTML = [15, 16, 17, 18].map((n) =>
    `<span id="v-${n}" class="verse"><span class="verse-num">${n}</span><span data-hl-key="${KEY(n)}">${V[n]}</span> </span>`).join('');
  document.body.appendChild(wrap);
  return wrap;
}
/** @param {number} n */
const numText = (n) => /** @type {Text} */ (/** @type {any} */ (document.querySelector(`#v-${n} .verse-num`)).firstChild);
/** @param {number} n */
const verseText = (n) => /** @type {Text} */ (/** @type {any} */ (document.querySelector(`[data-hl-key="${KEY(n)}"]`)).firstChild);

/** Select from (a, ao) to (b, bo), and long-press: the contextmenu that raises the toolbar. */
function selectAndPress(a, ao, b, bo) {
  const r = document.createRange();
  r.setStart(a, ao);
  r.setEnd(b, bo);
  r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
  window.getSelection = () => /** @type {any} */ ({
    isCollapsed: false, rangeCount: 1, getRangeAt: () => r, removeAllRanges: () => {},
    toString: () => r.toString(), anchorNode: r.startContainer, anchorOffset: r.startOffset,
    focusNode: r.endContainer, focusOffset: r.endOffset,
  });
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 100 });
  act(() => { /** @type {any} */ (a.parentElement).dispatchEvent(ev); });
  return ev;
}
const toolbar = () => /** @type {HTMLElement | null} */ (document.querySelector('.sel-toolbar'));
/** @param {string} sel */
const click = (sel) => { act(() => { /** @type {any} */ (document.querySelector(sel)).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); };
/** What the toolbar offers: every button's name, and which swatch is the live colour. */
const offered = () => [...(/** @type {HTMLElement} */ (toolbar())).querySelectorAll('button')]
  .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() + (b.getAttribute('aria-pressed') === 'true' ? ' (pressed)' : ''));

beforeEach(() => {
  _origGetSelection = window.getSelection;
  origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (/** @type {string} */ t) => { written.push(t); return Promise.resolve(); } }, writable: true, configurable: true,
  });
  g.HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
  g.HighlightStore = { get: () => [] };
  g.AnnotationStore = { get: () => [], getByGroup: () => [], add: vi.fn(), removeGroup: vi.fn(), convertGroup: vi.fn() };
  g.NoteStore = { get: () => null, set: vi.fn(), remove: vi.fn() };
  g.BookmarkStore = { add: vi.fn() };
  g.ConfirmStrip = vi.fn(() => null);
  g.snapRangeToWords = (_t, s, e) => ({ start: s, end: e });
  g.snapSelectionRange = (_c, _t, s, e) => ({ start: s, end: e });
  g.hlId = () => 'hl_test';
  g._bookTitle = (/** @type {string} */ id) => (id === 'john' ? 'John' : id);
  g.StateStore = { get: () => ({ settings: { translation: 'nkjv' } }) };
  g.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV' }];
  lf = { has: vi.fn((/** @type {string} */ k) => k.startsWith('bible:john:3:')), start: vi.fn(() => true), repeat: vi.fn(() => true) };
  window.__votListenFrom = lf;
  chapter();
  render(<SelectionToolbar onLinkRequest={vi.fn()} onNoteRequest={vi.fn()} onBookmarkRequest={vi.fn()} />);
});

afterEach(() => {
  cleanup();
  window.getSelection = _origGetSelection;
  if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
  else delete /** @type {any} */ (navigator).clipboard;
  document.body.innerHTML = '';
  for (const k of ['HL_COLORS', 'HighlightStore', 'AnnotationStore', 'NoteStore', 'BookmarkStore', 'ConfirmStrip', 'snapRangeToWords',
    'snapSelectionRange', 'hlId', '_bookTitle', 'StateStore', 'TRANSLATION_OPTIONS']) delete g[k];
  delete window.__votListenFrom;
});

describe('rs1 - a selection that takes in a verse number keeps the whole menu', () => {
  it('from 16\'s number into 17\'s words: Listen from here and Repeat stay, and act on 16-17', () => {
    selectAndPress(numText(16), 0, verseText(17), 10);
    expect(toolbar()).not.toBeNull();
    expect(document.querySelector('.sel-listen-btn'), 'Listen from here').not.toBeNull();
    expect(document.querySelector('.sel-repeat-btn'), 'Repeat').not.toBeNull();
    click('.sel-listen-btn');
    expect(lf.start).toHaveBeenCalledWith(KEY(16), 0);
    selectAndPress(numText(16), 0, verseText(17), 10);
    click('.sel-repeat-btn');
    expect(lf.repeat).toHaveBeenCalledWith([KEY(16), KEY(17)], 'John 3:16-17', 3);
  });

  it('the number and its words offer exactly what the words alone offer (the live colour keeps its ring)', () => {
    g.HighlightStore = { get: (/** @type {string} */ k) => (k === KEY(16) ? [{ start: 0, end: 30, color: 'green', kind: 'highlight' }] : []) };
    selectAndPress(verseText(16), 0, verseText(16), 20);
    const wordsAlone = offered();
    expect(wordsAlone).toContain('green highlight (pressed)');
    selectAndPress(numText(16), 0, verseText(16), 20);
    expect(offered()).toEqual(wordsAlone);
  });

  it('a number alone (a long-press on "16") is its verse: the toolbar, not the browser\'s menu, with Listen and Repeat', () => {
    const ev = selectAndPress(numText(16), 0, numText(16), 2);
    expect(ev.defaultPrevented, 'the browser\'s own menu stays down').toBe(true);
    expect(toolbar()).not.toBeNull();
    expect(document.querySelector('.sel-repeat-btn')).not.toBeNull();
    click('.sel-listen-btn');
    expect(lf.start).toHaveBeenCalledWith(KEY(16), 0);
    selectAndPress(numText(16), 0, numText(16), 2);
    const copy = [...document.querySelectorAll('.sel-action-btn')].find((b) => b.textContent === 'Copy');
    act(() => { /** @type {any} */ (copy).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(written).toEqual([`"${V[16]}"\n\nJohn 3:16 (NKJV)`]);
  });

  it('both ends on numbers (16\'s to 18\'s): the toolbar over 16-17, not the browser\'s menu', () => {
    const ev = selectAndPress(numText(16), 0, numText(18), 1);
    expect(ev.defaultPrevented).toBe(true);
    expect(toolbar()).not.toBeNull();
    click('.sel-repeat-btn');
    expect(lf.repeat).toHaveBeenCalledWith([KEY(16), KEY(17)], 'John 3:16-17', 3);
  });

  it('an end on the next verse\'s number stops before that verse', () => {
    selectAndPress(verseText(15), 5, numText(17), 1);
    click('.sel-listen-btn');
    expect(lf.start).toHaveBeenCalledWith(KEY(15), 5);
    selectAndPress(verseText(15), 5, numText(17), 1);
    click('.sel-repeat-btn');
    expect(lf.repeat).toHaveBeenCalledWith([KEY(15), KEY(16)], 'John 3:15-16', 3);
  });

  it('a start in the space after a verse begins at the next verse', () => {
    const gap = /** @type {Text} */ (/** @type {any} */ (document.querySelector('#v-15')).lastChild);   // the ' ' after 15's block
    selectAndPress(gap, 0, verseText(16), 12);
    click('.sel-listen-btn');
    expect(lf.start).toHaveBeenCalledWith(KEY(16), 0);
  });

  it('Ctrl+C or the native menu\'s Copy on a number alone copies its verse, as the Copy button does', () => {
    const r = document.createRange();
    r.setStart(numText(16), 0);
    r.setEnd(numText(16), 2);
    window.getSelection = () => /** @type {any} */ ({ isCollapsed: false, rangeCount: 1, getRangeAt: () => r, removeAllRanges: () => {}, toString: () => r.toString() });
    const data = /** @type {Record<string, string>} */ ({});
    const ev = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { setData: (/** @type {string} */ t, /** @type {string} */ v) => { data[t] = v; } } });
    numText(16).parentElement?.dispatchEvent(ev);
    expect(data['text/plain']).toBe(`"${V[16]}"\n\nJohn 3:16 (NKJV)`);
    expect(ev.defaultPrevented).toBe(true);
  });
});
