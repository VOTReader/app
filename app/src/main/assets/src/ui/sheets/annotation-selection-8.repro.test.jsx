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
