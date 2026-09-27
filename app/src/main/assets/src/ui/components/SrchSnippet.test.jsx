/* SrchSnippet — a result's snippet, its first mark centred in the three-line box.
   Book order re-sorts a group in place, and a moved element's scroll box starts
   again at 0 (review of 74a9c334), so the centring runs on every render, not
   only the first: the re-sort re-renders every card. */
import { it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, highlightSpans } from '../../search/snippet.js';

const REAL_RECT = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  /** @type {any} */ (window).VotSearchMini = { snippet, highlightSpans };
  // the box at 100, its mark 60 px further down
  Element.prototype.getBoundingClientRect = function () {
    const top = this.tagName === 'MARK' ? 160 : 100;
    return /** @type {any} */ ({ top, bottom: top + 20, left: 0, right: 100, width: 100, height: 20 });
  };
});
afterEach(() => {
  cleanup();
  Element.prototype.getBoundingClientRect = REAL_RECT;
  delete /** @type {any} */ (window).VotSearchMini;
});

it('centres the mark again after a re-render found its box back at the top', () => {
  const text = 'The LORD is my shepherd; I shall not want.';
  const { container, rerender } = render(<SrchSnippet text={text} terms={['shepherd']} />);
  const box = /** @type {HTMLElement} */ (container.querySelector('.srch-snippet-scroll'));
  const first = box.scrollTop;
  expect(first).not.toBe(0);
  box.scrollTop = 0;   // what moving the element does
  rerender(<SrchSnippet text={text} terms={['shepherd']} />);
  expect(box.scrollTop).toBe(first);
});
