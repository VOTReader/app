/* SrchSnippet — a result's snippet in a three-line box, its first mark in view.
   ─────────────────────────────────────────────────────────────────────────
   WHOLE LINES (search200 UX D5). The box scrolled to put the mark's middle at
   its own middle. A mark that wraps ("the false prophet" over two lines) has
   its middle on the line between them, so the box stopped half a line in and
   cut its top and bottom lines through the letters (360 px, Text Size 140%,
   Revelation 20:10); a box 4.2rem tall held 2.99 lines, and scrollTop snaps to
   device pixels. The text now moves by whole lines in a box exactly three
   lines tall: the mark's first line in the middle row where the text allows,
   a mark over two lines shown whole.
   Book order re-sorts a group in place, and a moved element's scroll box
   started again at 0 (review of 74a9c334); the offset is the text's own style
   now, kept by a moved element, and it is set again on every render. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
/* Node builtins in an app/src test: this tsconfig has no node types (the SearchScreen.test.jsx precedent). */
// @ts-ignore -- no node types in this tsconfig
import { readFileSync } from 'node:fs';
// @ts-ignore -- no node types in this tsconfig
import { resolve, dirname } from 'node:path';
// @ts-ignore -- no node types in this tsconfig
import { fileURLToPath } from 'node:url';
import { SrchSnippet, firstLineShown } from './SrchSnippet.jsx';
import { snippet, highlightSpans } from '../../search/snippet.js';

describe('firstLineShown (the first whole line a three-line box shows)', () => {
  const lh = 31.5;
  const at = (/** @type {number} */ line) => line * lh + lh / 2; // a fragment's middle on that line
  const six = { lineHeight: lh, height: 6 * lh, rows: 3 };

  it('puts the line holding the mark in the middle row', () => {
    expect(firstLineShown({ ...six, startMid: at(3), endMid: at(3) })).toBe(2);
  });

  it('a mark over two lines shows whole: its lines in the middle and last rows, never half a line in', () => {
    expect(firstLineShown({ ...six, startMid: at(3), endMid: at(4) })).toBe(2);
    expect(firstLineShown({ ...six, startMid: at(1), endMid: at(3) })).toBe(1);
    // longer than the box: it starts in the top row
    expect(firstLineShown({ ...six, lineHeight: lh, height: 9 * lh, startMid: at(3), endMid: at(7) })).toBe(3);
  });

  it('stops at the top and at the last three lines', () => {
    expect(firstLineShown({ ...six, startMid: at(0), endMid: at(0) })).toBe(0);
    expect(firstLineShown({ ...six, startMid: at(1), endMid: at(1) })).toBe(0);
    expect(firstLineShown({ ...six, startMid: at(5), endMid: at(5) })).toBe(3);
  });

  it('text that fits, or a measure it cannot use, stays at the top', () => {
    expect(firstLineShown({ lineHeight: lh, height: 3 * lh, rows: 3, startMid: at(2), endMid: at(2) })).toBe(0);
    expect(firstLineShown({ lineHeight: NaN, height: 200, rows: 3, startMid: 120, endMid: 120 })).toBe(0);
    expect(firstLineShown({ lineHeight: lh, height: 0, rows: 3, startMid: 120, endMid: 120 })).toBe(0);
  });
});

describe('SrchSnippet (the box moves its text by whole lines)', () => {
  const REAL_RECT = Element.prototype.getBoundingClientRect;
  const REAL_RECTS = Element.prototype.getClientRects;
  // Text Size 140%: a 21 px font, 31.5 px lines; the box is three of them, the text six
  const LH = 31.5;
  /** @type {number[]} */ let markLines = [];
  beforeEach(() => {
    /** @type {any} */ (window).VotSearchMini = { snippet, highlightSpans };
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => /** @type {any} */ ({ lineHeight: LH + 'px', fontSize: '21px' }));
    Element.prototype.getBoundingClientRect = function () {
      const height = this.classList.contains('srch-snippet-lines') ? 6 * LH : 3 * LH;
      return /** @type {any} */ ({ top: 100, bottom: 100 + height, left: 0, right: 300, width: 300, height });
    };
    Element.prototype.getClientRects = function () {
      if (this.tagName !== 'MARK') return /** @type {any} */ ([]);
      return /** @type {any} */ (markLines.map((n) => ({ top: 100 + n * LH + 5, bottom: 100 + n * LH + 26.5 })));
    };
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Element.prototype.getBoundingClientRect = REAL_RECT;
    Element.prototype.getClientRects = REAL_RECTS;
    delete /** @type {any} */ (window).VotSearchMini;
  });
  const text = 'And the devil, who deceived them, was cast into the lake of fire and brimstone where the beast and the false prophet are.';
  const parts = (/** @type {HTMLElement} */ c) => ({
    box: /** @type {HTMLElement} */ (c.querySelector('.srch-snippet-scroll')),
    lines: /** @type {HTMLElement} */ (c.querySelector('.srch-snippet-scroll > .srch-snippet-lines')),
  });

  it('a mark wrapped over the fourth and fifth lines: the text moves up two whole lines, and the box never scrolls', () => {
    markLines = [3, 4];
    const { container } = render(<SrchSnippet text={text} terms={['the false prophet']} />);
    const { box, lines } = parts(container);
    expect(lines, 'the text sits in its own block inside the box').toBeTruthy();
    expect(lines.style.marginTop).toBe('-3em'); // 2 lines × 31.5 px = 63 px = 3em of a 21 px font
    expect(box.scrollTop).toBe(0);
  });

  it('a mark on the first lines leaves the text at the top', () => {
    markLines = [1];
    const { container } = render(<SrchSnippet text={text} terms={['devil']} />);
    expect(parts(container).lines.style.marginTop).toBe('');
  });

  it('keeps its place after a re-render that found the text back at the top (Book order moves the card)', () => {
    markLines = [4];
    const { container, rerender } = render(<SrchSnippet text={text} terms={['beast']} />);
    const { lines } = parts(container);
    expect(lines.style.marginTop).toBe('-4.5em');
    lines.style.marginTop = '';
    rerender(<SrchSnippet text={text} terms={['beast']} />);
    expect(lines.style.marginTop).toBe('-4.5em');
  });
});

describe('the snippet box is exactly three lines tall (app.css)', () => {
  it('.srch-snippet-scroll is 4.5em at the card snippet\'s line-height of 1.5', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app.css'), 'utf-8');
    const rule = (/** @type {string} */ sel) => {
      const i = css.indexOf(sel + ' {');
      return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
    };
    expect(rule('.srch-card-snippet')).toMatch(/line-height:1\.5;/);
    expect(rule('.srch-snippet-scroll')).toMatch(/max-height:4\.5em;/);
    expect(rule('.srch-snippet-scroll')).toMatch(/overflow:hidden;/);
  });
});
