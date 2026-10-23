// @ts-nocheck — free-var globals stubbed per test (bundle-d contract)
/* A06.3 (idea sweep 2026-10-22; traced on the S22's installed PWA 2026-10-22): a note marker opens its sheet on
   the tap's lift (pointerup), and the browser's click for that same tap lands 5-20 ms later on the sheet's backdrop,
   which closes it. On the phone a tap on a note marker never showed its note (11 taps of 11). The click of a tap
   already routed on its lift is spent: it reaches nothing, whatever opened under the finger. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';

let origGetSelection;
let closed;

function fire(target, type, opts = {}) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  origGetSelection = window.getSelection;
  window.getSelection = () => ({ isCollapsed: true, rangeCount: 0, getRangeAt: () => null, removeAllRanges: () => {}, toString: () => '' });
  globalThis.HL_COLORS = ['yellow'];
  globalThis.HighlightStore = { get: () => [] };
  globalThis.AnnotationStore = { get: () => [], getByGroup: () => [], add: vi.fn(), removeGroup: vi.fn(), convertGroup: vi.fn() };
  globalThis.NoteStore = { get: () => ({ body: 'a note' }), set: vi.fn(), remove: vi.fn() };
  globalThis.snapRangeToWords = (_t, s, e) => ({ start: s, end: e });
  globalThis.snapSelectionRange = (_c, _t, s, e) => ({ start: s, end: e });
  globalThis.hlId = () => 'hl_test';
  closed = vi.fn();
  // The sheet a note marker opens: a backdrop that closes on a click, put up at once under the finger.
  window.__openNote = vi.fn(() => {
    const overlay = document.createElement('div');
    overlay.className = 'note-sheet-overlay';
    overlay.addEventListener('click', closed);
    document.body.appendChild(overlay);
  });
  window.__showAnnChip = vi.fn();
  window.__showMultiNote = vi.fn();
});

afterEach(() => {
  cleanup();
  window.getSelection = origGetSelection;
  document.body.innerHTML = '';
  for (const k of ['HL_COLORS', 'HighlightStore', 'AnnotationStore', 'NoteStore', 'snapRangeToWords', 'snapSelectionRange', 'hlId']) delete globalThis[k];
  delete window.__openNote;
  delete window.__showAnnChip;
  delete window.__showMultiNote;
});

function tapNoteMarker() {
  const p = document.createElement('p');
  p.setAttribute('data-hl-key', 'bible:john:3:16');
  p.innerHTML = 'so loved<span class="hl-note-icon" data-group-id="g1">*</span> the world';
  document.body.appendChild(p);
  render(<SelectionToolbar onLinkRequest={vi.fn()} onNoteRequest={vi.fn()} onBookmarkRequest={vi.fn()} />);
  const icon = p.querySelector('.hl-note-icon');
  act(() => {
    fire(icon, 'pointerdown', { clientX: 50, clientY: 100 });
    fire(icon, 'pointerup', { clientX: 50, clientY: 100 });
  });
  expect(window.__openNote).toHaveBeenCalledWith('g1');
  return /** @type {HTMLElement} */ (document.querySelector('.note-sheet-overlay'));
}

describe('SelectionToolbar — the click of a tap routed on its lift (A06.3)', () => {
  it('never reaches the sheet the tap opened, and never routes the marker again', () => {
    const overlay = tapNoteMarker();
    act(() => { fire(overlay, 'click', { clientX: 51, clientY: 102 }); });
    expect(closed).not.toHaveBeenCalled();
    expect(window.__openNote).toHaveBeenCalledTimes(1);
  });

  it('the reader\'s next click is their own: it closes the sheet', () => {
    const overlay = tapNoteMarker();
    act(() => { fire(overlay, 'click', { clientX: 51, clientY: 102 }); });
    act(() => { fire(overlay, 'click', { clientX: 51, clientY: 102 }); });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a click somewhere else is not the tap\'s own', () => {
    const overlay = tapNoteMarker();
    act(() => { fire(overlay, 'click', { clientX: 200, clientY: 400 }); });
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
