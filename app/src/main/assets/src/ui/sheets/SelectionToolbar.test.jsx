/* W4.4 + W4.5 — SelectionToolbar desktop contract.
   ────────────────────────────────────────────────
   Locks the unified pointer + contextmenu behavior the desktop polish
   depends on (verified live in a desktop-width preview before this test
   was written):

     W4.5  mouse-drag selection (pointerdown → selection → pointerup)
           raises the toolbar; a plain click (collapsed selection) does not.
     W4.4  right-click inside reading text suppresses the native menu and
           either raises the toolbar (plain selection) or routes an existing
           mark/note-icon to its chip/note handler. Right-click OUTSIDE any
           [data-hl-key] container leaves the native menu intact.

   The handlers live inside a mount-time useEffect closure (attached to
   `document`), so they can only be exercised by rendering the component and
   dispatching real events. window.getSelection is stubbed over a REAL Range
   so cloneContents()/computeOffset()/treeWalker still operate on real nodes
   (jsdom's native Selection model is unreliable for addRange()). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SelectionToolbar } from './SelectionToolbar.jsx';

let _origGetSelection;

/** Build a reading container in document.body (sibling of the React root). */
function readingContainer(hlKey, html) {
  const p = document.createElement('p');
  p.setAttribute('data-hl-key', hlKey);
  p.innerHTML = html;
  document.body.appendChild(p);
  return p;
}

/** Stub window.getSelection. Pass a real Range for a non-collapsed selection,
    or null/undefined for a collapsed (empty) selection. */
function stubSelection(range) {
  window.getSelection = () => /** @type {any} */ ({
    isCollapsed: !range,
    rangeCount: range ? 1 : 0,
    getRangeAt: () => range,
    removeAllRanges: () => {},
    toString: () => (range ? range.toString() : ''),
  });
}

/** Range over [start,end] of the first text node inside `el`. jsdom has no
    layout engine, so Range.getBoundingClientRect is unimplemented — stub it
    (the component only reads it to position the toolbar, cosmetic in tests). */
function rangeOver(el, start, end) {
  const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null).nextNode();
  const r = document.createRange();
  r.setStart(tn, start);
  r.setEnd(tn, end);
  r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
  return r;
}

function fire(target, type, opts = {}) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(ev);
  return ev;
}

function mount() {
  return render(
    <SelectionToolbar onLinkRequest={vi.fn()} onNoteRequest={vi.fn()} onBookmarkRequest={vi.fn()} />,
  );
}

beforeEach(() => {
  _origGetSelection = window.getSelection;
  // Globals SelectionToolbar reads as free variables (provided by the bundle
  // IIFE in production; stubbed here). StorageHealth / findEntryContext /
  // _bookmarkSourceLabel / bkmId are typeof-guarded in the component, so
  // they can stay undefined.
  /** @type {any} */ (globalThis).HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
  /** @type {any} */ (globalThis).HighlightStore = { get: () => [] };
  /** @type {any} */ (globalThis).AnnotationStore = {
    get: () => [], getByGroup: () => [], add: vi.fn(), removeGroup: vi.fn(), convertGroup: vi.fn(),
  };
  /** @type {any} */ (globalThis).NoteStore = { get: () => null, set: vi.fn(), remove: vi.fn() };
  /** @type {any} */ (globalThis).BookmarkStore = { add: vi.fn() };
  /** @type {any} */ (globalThis).ConfirmStrip = () => null;
  /** @type {any} */ (globalThis).snapRangeToWords = (_t, s, e) => ({ start: s, end: e });
  /** @type {any} */ (globalThis).hlId = () => 'hl_test';
  window.__showAnnChip = vi.fn();
  window.__openNote = vi.fn();
  window.__showMultiNote = vi.fn();
});

afterEach(() => {
  cleanup();
  window.getSelection = _origGetSelection;
  document.body.innerHTML = '';
  delete /** @type {any} */ (globalThis).HL_COLORS;
  delete /** @type {any} */ (globalThis).HighlightStore;
  delete /** @type {any} */ (globalThis).AnnotationStore;
  delete /** @type {any} */ (globalThis).NoteStore;
  delete /** @type {any} */ (globalThis).BookmarkStore;
  delete /** @type {any} */ (globalThis).ConfirmStrip;
  delete /** @type {any} */ (globalThis).snapRangeToWords;
  delete /** @type {any} */ (globalThis).hlId;
});

describe('SelectionToolbar — W4.5 mouse-drag selection', () => {
  it('raises the toolbar after pointerup with a non-collapsed selection', async () => {
    const c = readingContainer('bible:test:1:1', 'The Revelation of Jesus Christ');
    mount();
    stubSelection(rangeOver(c, 0, 13)); // "The Revelation"
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250)); // past the 150ms computeAndShow
    });
    const tb = document.querySelector('.sel-toolbar');
    expect(tb).not.toBeNull();
    expect(tb.querySelector('.sel-toolbar-colors')).not.toBeNull();
    expect([...tb.querySelectorAll('.sel-action-btn span')].map((s) => s.textContent))
      .toEqual(['Note', 'Link', 'Copy', 'Share', 'Search', 'Bookmark']);
  });

  it('does not raise the toolbar on a plain click (collapsed selection)', async () => {
    const c = readingContainer('bible:test:1:1', 'The Revelation of Jesus Christ');
    mount();
    stubSelection(null); // collapsed — a click, not a drag
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 5, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(document.querySelector('.sel-toolbar')).toBeNull();
  });
});

describe('SelectionToolbar — W4.4 right-click context menu', () => {
  it('suppresses the native menu and raises the toolbar on a text selection', async () => {
    const c = readingContainer('bible:test:1:2', 'who bore witness to the word of God');
    mount();
    stubSelection(rangeOver(c, 0, 14)); // "who bore witne"
    /** @type {any} */ let ev;
    await act(async () => {
      ev = fire(c, 'contextmenu', { clientX: 20, clientY: 20 });
      await new Promise((r) => setTimeout(r, 150)); // past the 80ms computeAndShow
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();
  });

  it('routes a highlight mark to __showAnnChip (no toolbar)', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark" data-group-id="g1" data-kind="highlight">witness</mark> to God',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null);
    /** @type {any} */ let ev;
    act(() => { ev = fire(mark, 'contextmenu', { clientX: 100, clientY: 200 }); });
    expect(ev.defaultPrevented).toBe(true);
    // chip opens at the default position (the point itself, no offset).
    expect(window.__showAnnChip).toHaveBeenCalledWith(100, 200, 'bible:test:1:2', 'g1');
    expect(window.__openNote).not.toHaveBeenCalled();
    expect(document.querySelector('.sel-toolbar')).toBeNull();
  });

  // Desktop / non-text taps fire `click`; this opens the chip on a highlight.
  it('routes a click on a highlight mark to __showAnnChip', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark" data-group-id="g9" data-kind="highlight">witness</mark> to God',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null); // a tap leaves a collapsed selection
    act(() => { fire(mark, 'click', { clientX: 40, clientY: 60 }); });
    expect(window.__showAnnChip).toHaveBeenCalledWith(40, 60, 'bible:test:1:2', 'g9');
  });

  // Android fix: a tap on a highlight (selectable text) does NOT emit a usable
  // `click` in the WebView, so MainActivity's GestureDetector hit-tests the tap
  // point through window.__nativeTapAnnotation(cssX, cssY). elementFromPoint is
  // stubbed because jsdom has no layout engine.
  it('routes a native tap (__nativeTapAnnotation) on a highlight mark to __showAnnChip', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark" data-group-id="g7" data-kind="highlight">witness</mark> to God',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null);
    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => mark;
    try {
      act(() => { window.__nativeTapAnnotation(41, 61); });
    } finally {
      document.elementFromPoint = origEFP;
    }
    // chip opens at the default position (the tap point itself, no offset).
    expect(window.__showAnnChip).toHaveBeenCalledWith(41, 61, 'bible:test:1:2', 'g7');
  });

  // A native tap that lands on a note ICON must be skipped — the icon already
  // fires `click` on Android and self-routes, so routing it here too would
  // double-fire (open the note twice).
  it('native tap skips a note icon (its own click handler routes it)', () => {
    const c = readingContainer(
      'bible:test:1:2',
      'witness<span class="hl-note-icon" data-group-id="g8"></span> to God',
    );
    const icon = c.querySelector('.hl-note-icon');
    mount();
    stubSelection(null);
    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => icon;
    try {
      act(() => { window.__nativeTapAnnotation(40, 60); });
    } finally {
      document.elementFromPoint = origEFP;
    }
    expect(window.__showAnnChip).not.toHaveBeenCalled();
    expect(window.__openNote).not.toHaveBeenCalled();
  });

  // A native tap on plain (non-annotated) text opens nothing.
  it('native tap on plain text opens nothing', () => {
    const c = readingContainer('bible:test:1:2', 'plain unmarked verse text');
    mount();
    stubSelection(null);
    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => c; // the container has no mark ancestor
    try {
      act(() => { window.__nativeTapAnnotation(10, 10); });
    } finally {
      document.elementFromPoint = origEFP;
    }
    expect(window.__showAnnChip).not.toHaveBeenCalled();
    expect(window.__openNote).not.toHaveBeenCalled();
  });

  it('a click on plain (non-annotated) text opens nothing', () => {
    const c = readingContainer('bible:test:1:2', 'plain unmarked verse text');
    mount();
    stubSelection(null);
    act(() => { fire(c, 'click', { clientX: 10, clientY: 10 }); });
    expect(window.__showAnnChip).not.toHaveBeenCalled();
    expect(window.__openNote).not.toHaveBeenCalled();
  });

  it('routes a note mark to __openNote', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark hl-note" data-group-id="g2" data-kind="note">witness</mark> to God',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null);
    /** @type {any} */ let ev;
    act(() => { ev = fire(mark, 'contextmenu', { clientX: 10, clientY: 10 }); });
    expect(ev.defaultPrevented).toBe(true);
    expect(window.__openNote).toHaveBeenCalledWith('g2');
    expect(window.__showAnnChip).not.toHaveBeenCalled();
  });

  it('routes a note icon to __openNote', () => {
    const c = readingContainer(
      'bible:test:1:2',
      'witness<span class="hl-note-icon" data-group-id="g3"></span> to God',
    );
    const icon = c.querySelector('.hl-note-icon');
    mount();
    stubSelection(null);
    /** @type {any} */ let ev;
    act(() => { ev = fire(icon, 'contextmenu', { clientX: 10, clientY: 10 }); });
    expect(ev.defaultPrevented).toBe(true);
    expect(window.__openNote).toHaveBeenCalledWith('g3');
  });

  it('leaves the native menu intact outside any [data-hl-key] container', async () => {
    const outside = document.createElement('div');
    outside.textContent = 'app chrome, not reading text';
    document.body.appendChild(outside);
    mount();
    stubSelection(null);
    /** @type {any} */ let ev;
    await act(async () => {
      ev = fire(outside, 'contextmenu', { clientX: 5, clientY: 5 });
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(document.querySelector('.sel-toolbar')).toBeNull();
  });
});
