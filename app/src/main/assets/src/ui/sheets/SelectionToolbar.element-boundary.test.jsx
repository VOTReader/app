// @ts-nocheck
/* RED — annotation-selection-8. Adopted from codex-repros 293d878e (Codex unit, 2026-09-03) by the Verifier; import path
   moved to tools/repro/ (see verifier-repros.md for why). Range.selectNodeContents() makes BOTH boundaries the
   <p> element, and computeOffset (SHOW_TEXT walker) returns charPos + offset for each: 12 and 14 for a 12-char
   paragraph. The Chrome triple-click shape is pinned separately below once the browser probe settles it. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';

beforeEach(() => {
  globalThis.HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
  globalThis.HighlightStore = { get: () => [] };
  globalThis.AnnotationStore = { get: () => [], add: vi.fn(), removeGroup: vi.fn() };
  globalThis.NoteStore = { get: () => null };
  globalThis.BookmarkStore = { add: vi.fn() };
  globalThis.snapSelectionRange = (_container, _text, start, end) => ({ start, end });
  globalThis.snapRangeToWords = (_text, start, end) => ({ start, end });
  globalThis.hlId = () => 'repro-id';
  window.__showAnnChip = vi.fn();
  window.__openNote = vi.fn();
});

afterEach(() => {
  cleanup();
  delete globalThis.HL_COLORS;
  delete globalThis.HighlightStore;
  delete globalThis.AnnotationStore;
  delete globalThis.NoteStore;
  delete globalThis.BookmarkStore;
  delete globalThis.snapSelectionRange;
  delete globalThis.snapRangeToWords;
  delete globalThis.hlId;
  delete window.__showAnnChip;
  delete window.__openNote;
  delete window.getSelection;
});

describe('REPRO annotation-selection-8: element Range boundary', () => {
  it('reports the full selected text range when Range boundaries are elements', () => {
    const container = document.createElement('p');
    container.dataset.hlKey = 'repro:element-boundary';
    container.innerHTML = '<span>first</span><span> second</span>';
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    range.getBoundingClientRect = () => ({ left: 10, top: 100, right: 200, bottom: 120, width: 190, height: 20 });
    window.getSelection = () => ({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: vi.fn(),
      toString: () => range.toString(),
    });

    const onLinkRequest = vi.fn();
    render(<SelectionToolbar onLinkRequest={onLinkRequest} />);
    fireEvent.contextMenu(container, { clientX: 20, clientY: 100 });
    fireEvent.click([...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Link'));

    expect(onLinkRequest).toHaveBeenCalledWith(expect.objectContaining({
      hlKey: 'repro:element-boundary',
      start: 0,
      end: container.textContent.length,
    }));
  });
});

/* Verifier addition (2026-09-03): the shape a REAL Chrome triple-click hands
   the page, measured with tools/repro/annotation-selection-8.browser-cdp.mjs
   (Chrome for Testing 151, Input.dispatchMouseEvent clickCount 3):
     start = (first text node of the paragraph, 0)
     end   = (the NEXT block element, 0)          <- an ELEMENT boundary
   Only the LAST paragraph on the page ends in its own text node. So for every
   paragraph but the last, the everyday "select this paragraph" gesture puts
   the end boundary on the following <p>: findHlContainer(range.endContainer)
   resolves to the NEXT container, the toolbar takes the cross-container
   (multiVerse) branch for a selection that lives entirely in one paragraph,
   and no single-container highlight/link/note can be made from it. */
describe('REPRO annotation-selection-8: Chrome triple-click (end boundary = next block, offset 0)', () => {
  it('a triple-clicked paragraph is ONE container: link request carries its hlKey and [0, textLength)', () => {
    const first = document.createElement('p');
    first.dataset.hlKey = 'repro:para-0';
    first.innerHTML = 'In the beginning <em>God</em> created the heaven.';
    const next = document.createElement('p');
    next.dataset.hlKey = 'repro:para-1';
    next.textContent = 'And the earth was without form, and void.';
    document.body.appendChild(first);
    document.body.appendChild(next);

    const range = document.createRange();
    range.setStart(first.firstChild, 0);   // "In the beginning " text node, offset 0
    range.setEnd(next, 0);                 // the NEXT <p>, offset 0 — what Chrome hands us
    range.getBoundingClientRect = () => ({ left: 10, top: 100, right: 200, bottom: 120, width: 190, height: 20 });
    window.getSelection = () => ({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: vi.fn(),
      toString: () => range.toString(),
    });

    const onLinkRequest = vi.fn();
    render(<SelectionToolbar onLinkRequest={onLinkRequest} />);
    fireEvent.contextMenu(first, { clientX: 20, clientY: 100 });
    const linkBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Link');
    expect(linkBtn, 'no Link action: the toolbar took the multi-verse branch for a single paragraph').toBeTruthy();
    fireEvent.click(linkBtn);
    expect(onLinkRequest).toHaveBeenCalledWith(expect.objectContaining({
      hlKey: 'repro:para-0',
      start: 0,
      end: first.textContent.length,
    }));
  });
});
