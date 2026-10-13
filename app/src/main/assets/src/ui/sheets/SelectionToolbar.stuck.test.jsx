// @ts-nocheck
/* W54 — the selection toolbar can no longer get stuck ignoring new selections.
   ─────────────────────────────────────────────────────────────────────
   A press on the toolbar sets suppressRef so the selection collapsing under
   the tap does not hide it mid-action; only the toolbar's OWN pointerup
   cleared it. A press that ended anywhere else (dragged off the toolbar,
   cancelled by a scroll) left it set for good, and every later selection was
   ignored until a reload. The press now ends wherever the pointer lifts or is
   cancelled. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';

beforeEach(() => {
  globalThis.HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
  globalThis.HighlightStore = { get: () => [] };
  globalThis.AnnotationStore = { get: () => [], add: vi.fn(), removeGroup: vi.fn() };
  globalThis.NoteStore = { get: () => null };
  globalThis.BookmarkStore = { add: vi.fn() };
  globalThis.snapSelectionRange = (_c, _t, start, end) => ({ start, end });
  globalThis.snapRangeToWords = (_t, start, end) => ({ start, end });
  window.__showAnnChip = vi.fn();
  window.__openNote = vi.fn();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  ['HL_COLORS', 'HighlightStore', 'AnnotationStore', 'NoteStore', 'BookmarkStore', 'snapSelectionRange', 'snapRangeToWords']
    .forEach((k) => { delete globalThis[k]; });
  delete window.__showAnnChip;
  delete window.__openNote;
  delete window.getSelection;
});

function block(key, text) {
  const p = document.createElement('p');
  p.dataset.hlKey = key;
  p.textContent = text;
  document.body.appendChild(p);
  return p;
}
/** Selects all of `el`'s text and raises the toolbar on it (the right-click path). */
function selectAndRaise(el) {
  const range = document.createRange();
  range.selectNodeContents(el.firstChild);
  range.getBoundingClientRect = () => ({ left: 10, top: 100, right: 200, bottom: 120, width: 190, height: 20 });
  window.getSelection = () => ({
    isCollapsed: false, rangeCount: 1, getRangeAt: () => range, removeAllRanges: vi.fn(), toString: () => range.toString(),
  });
  fireEvent.contextMenu(el, { clientX: 20, clientY: 100 });
}
const linkBtn = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Link');
const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

describe('SelectionToolbar: a press that ends off the toolbar does not leave it deaf (W54)', () => {
  for (const [how, end] of [
    ['lifts outside the toolbar', () => fireEvent.pointerUp(document.body)],
    ['is cancelled (a scroll took it)', () => fireEvent.pointerCancel(document.body)],
  ]) {
    it('a press that ' + how + ' still lets the next selection raise the toolbar', async () => {
      const onLinkRequest = vi.fn();
      const a = block('bible:john:3:16', 'For God so loved the world');
      const b = block('bible:john:3:17', 'For God sent not His Son');
      render(<SelectionToolbar onLinkRequest={onLinkRequest} />);
      selectAndRaise(a);
      fireEvent.pointerDown(document.querySelector('.sel-toolbar'));
      end();
      await wait(350);
      selectAndRaise(b);
      fireEvent.click(linkBtn());
      expect(onLinkRequest).toHaveBeenCalledWith(expect.objectContaining({ hlKey: 'bible:john:3:17' }));
    });
  }
});
