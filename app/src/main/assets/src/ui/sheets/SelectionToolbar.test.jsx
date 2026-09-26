/* W4.5 + annotation tap routing — SelectionToolbar contract.
   ────────────────────────────────────────────────────────────
   Locks the pointer-drag and tap-routing behaviors:

     P1-11a every toolbar control has an accessible name: the container is a
           named role="toolbar", style buttons announce Highlight/Underline/
           Squiggle (with aria-pressed tracking the active style), and color
           swatches announce their color (+ pressed when that color is live).
     P1-15 ▲/▼ scroll-nudge buttons scroll the reading container (.screen-
           scroll ancestor) by ~60% of its visible height WITHOUT clearing the
           active selection — the Android freeze where a selection longer than
           one viewport couldn't be highlighted because drags only EXTEND the
           selection (the page can't scroll mid-selection).

     W4.5  mouse-drag selection (pointerdown → selection → pointerup)
           raises the toolbar; a plain click (collapsed selection) does not.
     tap   a click or brief touch on an existing highlight/note mark or icon
           routes to the action chip / note sheet / multi-note popover.
           Long-press (contextmenu) NEVER routes a tap — only brief taps
           (< 300 ms) and mouse clicks open chips/notes.
     raise a long-press / right-click that produced a TEXT SELECTION still
           raises the toolbar (the Android selection path, where the native
           selection machinery swallows pointerup/touchend); a bare long-press
           with nothing selected raises nothing.

   The handlers live inside a mount-time useEffect closure (attached to
   `document`), so they can only be exercised by rendering the component and
   dispatching real events. window.getSelection is stubbed over a REAL Range
   so cloneContents()/computeOffset()/treeWalker still operate on real nodes
   (jsdom's native Selection model is unreliable for addRange()). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SelectionToolbar, computeToolbarPlacement, computeEdgeAutoScroll } from './SelectionToolbar.jsx';
import { snapSelectionRange as realSnapSelectionRange } from '../../renderer/annotation-engine.jsx';
import { showToast as realShowToast, _resetToasts } from '../../utils/toast.js';

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
    // The edge auto-scroll probe collapses a clone onto the MOVING edge.
    focusNode: range ? range.endContainer : null,
    focusOffset: range ? range.endOffset : 0,
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
  /** @type {any} */ (globalThis).ConfirmStrip = vi.fn(() => null);   // ANN2: capture the question/onConfirm props
  /** @type {any} */ (globalThis).snapRangeToWords = (_t, s, e) => ({ start: s, end: e });
  // Identity stub (mirrors snapRangeToWords above) — the line-break-seam logic is
  // covered in annotation-engine.test.jsx; here we assert raw offsets pass through.
  /** @type {any} */ (globalThis).snapSelectionRange = (_c, _t, s, e) => ({ start: s, end: e });
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
  delete /** @type {any} */ (globalThis).snapSelectionRange;
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

  it('applies a kind:"squiggle" annotation when the Squiggle style is selected', async () => {
    const c = readingContainer('bible:test:1:1', 'The Revelation of Jesus Christ');
    mount();
    stubSelection(rangeOver(c, 0, 13)); // "The Revelation"
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    const squiggleBtn = document.querySelector('.sel-style-btn-squiggle');
    expect(squiggleBtn).not.toBeNull();
    act(() => { fire(squiggleBtn, 'click'); });
    const greenBtn = document.querySelector('.sel-color-btn[data-color="green"]');
    expect(greenBtn).not.toBeNull();
    act(() => { fire(greenBtn, 'click'); });
    expect(/** @type {any} */ (globalThis).AnnotationStore.add).toHaveBeenCalledWith(
      'bible:test:1:1',
      expect.objectContaining({ kind: 'squiggle', color: 'green' }),
    );
  });
});

describe('SelectionToolbar — zero-width annotation guard (annotation-selection-4)', () => {
  it('does not persist a highlight for a punctuation-only selection (single container)', async () => {
    const c = readingContainer('bible:test:1:1', 'He said — and the crowd, "Amen," — went away.');
    // Real word-snap for this suite is stubbed as identity in beforeEach; swap in
    // the REAL snapSelectionRange so this test exercises the actual collapse an
    // all-punctuation run produces (annotation-engine.jsx:48: "An all-punctuation/
    // whitespace selection collapses to start===end; every caller already bails
    // on that" — applyHighlight's single-container path is the one that didn't).
    /** @type {any} */ (globalThis).snapSelectionRange = realSnapSelectionRange;
    mount();
    stubSelection(rangeOver(c, 7, 10)); // " — " (space-emdash-space) -> snaps to {10,10}
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    // The trimmed selection text is the em dash itself (non-empty), so
    // computeAndShow raises the toolbar same as any other selection.
    const yellowBtn = document.querySelector('.sel-color-btn[data-color="yellow"]');
    expect(yellowBtn).not.toBeNull();
    act(() => { fire(yellowBtn, 'click'); });
    expect(/** @type {any} */ (globalThis).AnnotationStore.add).not.toHaveBeenCalled();
  });

  /* The bail must ALSO release suppressRef, and nothing else in the file
     noticed: the Verifier deleted the `setTimeout(() => { suppressRef.current
     = false; }, 300)` line, left the guard, and got 45/45 green. The line is
     load-bearing — applyHighlight sets suppressRef true at :629 (handleNote,
     whose guard this one is modelled on, never does), and with it stuck true
     the guards at :393, :461 and :467 all return early, so the toolbar never
     appears again. No other reset rescues it: :708 needs a successful
     highlight, :750 is removeHighlight, and :1034 is a pointer-up on a toolbar
     that is not visible. One punctuation-only selection would wedge the
     selection toolbar for the rest of the session. */
  it('releases the suppress flag after the bail, so the next selection still raises the toolbar', async () => {
    const c = readingContainer('bible:test:1:1', 'He said — and the crowd, "Amen," — went away.');
    /** @type {any} */ (globalThis).snapSelectionRange = realSnapSelectionRange;
    mount();

    // 1. The punctuation-only selection that bails.
    stubSelection(rangeOver(c, 7, 10)); // " — " -> snaps to {10,10}
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    const yellowBtn = document.querySelector('.sel-color-btn[data-color="yellow"]');
    act(() => { fire(yellowBtn, 'click'); });
    expect(/** @type {any} */ (globalThis).AnnotationStore.add).not.toHaveBeenCalled();

    // 2. Past the 300 ms reset the bail schedules.
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });

    // 3. A normal word selection must still be able to raise the toolbar.
    stubSelection(rangeOver(c, 11, 14)); // "and"
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(document.querySelector('.sel-color-btn[data-color="yellow"]')).not.toBeNull();
  });
});

describe('SelectionToolbar — footnote markers excluded from stored text (annotation-selection-6)', () => {
  it('strips a .fn-ref digit from the stored highlight text but keeps raw-textContent offsets', async () => {
    // "as it is written." (17 chars) + fn-ref digit "2" (container-text index
    // 17) + " Therefore" (10 chars) — three sibling text nodes under the same
    // [data-hl-key] container, exactly how Segments.jsx renders a footnote
    // marker inline (span.fn-ref, textContent = the digit).
    const c = readingContainer('letter:test:1', 'as it is written.<span class="fn-ref">2</span> Therefore');
    mount();
    const r = document.createRange();
    r.setStart(c.childNodes[0], 9);  // "written.2 Therefore" starts at "w"
    r.setEnd(c.childNodes[2], 10);   // through the end of "Therefore"
    r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    stubSelection(r);
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r2) => setTimeout(r2, 250));
    });
    const yellowBtn = document.querySelector('.sel-color-btn[data-color="yellow"]');
    expect(yellowBtn).not.toBeNull();
    act(() => { fire(yellowBtn, 'click'); });
    // Offsets (9-28) index the RAW textContent, footnote digit included — that
    // coordinate space must not move. Only the stored display text drops the
    // digit, matching computeAndShow's own .fn-ref strip for selInfo.text.
    expect(/** @type {any} */ (globalThis).AnnotationStore.add).toHaveBeenCalledWith(
      'letter:test:1',
      expect.objectContaining({ start: 9, end: 28, text: 'written. Therefore' }),
    );
  });
});

describe('SelectionToolbar — long-press / right-click raises the toolbar (selection only)', () => {
  it('raises the toolbar when a long-press / right-click produced a text selection', () => {
    const c = readingContainer('bible:test:1:2', 'who bore witness to the word of God');
    mount();
    stubSelection(rangeOver(c, 0, 14)); // "who bore witne"
    /** @type {any} */ let ev;
    act(() => { ev = fire(c, 'contextmenu', { clientX: 20, clientY: 20 }); });
    // Suppresses the native menu and shows ours.
    expect(ev.defaultPrevented).toBe(true);
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();
  });

  it('a long-press on a highlight mark with NO selection does not open the chip', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark" data-group-id="g1" data-kind="highlight">witness</mark> to God',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null); // a bare long-press leaves a collapsed selection
    /** @type {any} */ let ev;
    act(() => { ev = fire(mark, 'contextmenu', { clientX: 100, clientY: 200 }); });
    // No chip, no note, native menu left intact (the dropped long-press behavior).
    expect(window.__showAnnChip).not.toHaveBeenCalled();
    expect(window.__openNote).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    expect(document.querySelector('.sel-toolbar')).toBeNull();
  });

  it('leaves the native menu intact for a selection outside any [data-hl-key] container', () => {
    const outside = document.createElement('div');
    outside.textContent = 'app chrome, not reading text';
    document.body.appendChild(outside);
    mount();
    stubSelection(rangeOver(outside, 0, 3)); // a selection, but outside reading text
    /** @type {any} */ let ev;
    act(() => { ev = fire(outside, 'contextmenu', { clientX: 5, clientY: 5 }); });
    expect(ev.defaultPrevented).toBe(false);
    expect(document.querySelector('.sel-toolbar')).toBeNull();
  });
});

describe('SelectionToolbar — annotation tap and click routing', () => {
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

  // A native tap that arrives while __scrollLiftPending is set (finger just
  // lifted off a scroll) must be silently ignored — the user was scrolling,
  // not intentionally tapping the highlight.
  it('native tap is suppressed when __scrollLiftPending is set', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark" data-group-id="g10" data-kind="highlight">word</mark>',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null);
    window.__scrollLiftPending = true;
    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => mark;
    try {
      act(() => { window.__nativeTapAnnotation(20, 20); });
    } finally {
      document.elementFromPoint = origEFP;
      window.__scrollLiftPending = false;
    }
    expect(window.__showAnnChip).not.toHaveBeenCalled();
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

  it('routes a click on a note mark to __openNote', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark hl-note" data-group-id="g2" data-kind="note">witness</mark> to God',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null);
    // Note-ness is a NoteStore entry now (not data-kind) — make g2 a note.
    /** @type {any} */ (globalThis).NoteStore.get = (g) => (g === 'g2' ? { groupId: 'g2' } : null);
    act(() => { fire(mark, 'click', { clientX: 10, clientY: 10 }); });
    expect(window.__openNote).toHaveBeenCalledWith('g2');
    expect(window.__showAnnChip).not.toHaveBeenCalled();
  });

  it('routes a click on a note icon to __openNote', () => {
    const c = readingContainer(
      'bible:test:1:2',
      'witness<span class="hl-note-icon" data-group-id="g3"></span> to God',
    );
    const icon = c.querySelector('.hl-note-icon');
    mount();
    stubSelection(null);
    act(() => { fire(icon, 'click', { clientX: 10, clientY: 10 }); });
    expect(window.__openNote).toHaveBeenCalledWith('g3');
  });

  // ANN5: the overlapping-note WINNER selection uses document.elementsFromPoint
  // (plural) to gather every noted mark at the tap point — >1 distinct group opens
  // the multi-note popover, otherwise the single note. jsdom has no layout, so
  // elementsFromPoint must be stubbed (the existing tests only stub the SINGULAR
  // elementFromPoint, leaving this branch unexercised).
  it('routes overlapping note marks to __showMultiNote (elementsFromPoint winner)', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark hl-note" data-group-id="g1" data-kind="note">over</mark>'
      + '<mark class="hl-mark hl-note" data-group-id="g2" data-kind="note">lap</mark> to God',
    );
    const marks = c.querySelectorAll('mark.hl-mark');
    mount();
    stubSelection(null);
    /** @type {any} */ (globalThis).NoteStore.get = (g) => ((g === 'g1' || g === 'g2') ? { groupId: g } : null);
    const origEFP = document.elementsFromPoint;
    document.elementsFromPoint = () => [marks[0], marks[1]]; // both noted marks under the tap
    try {
      act(() => { fire(marks[0], 'click', { clientX: 10, clientY: 10 }); });
    } finally {
      document.elementsFromPoint = origEFP;
    }
    expect(window.__showMultiNote).toHaveBeenCalledTimes(1);
    const [gids] = /** @type {any} */ (window.__showMultiNote).mock.calls[0];
    expect([...gids].sort()).toEqual(['g1', 'g2']);
    expect(window.__openNote).not.toHaveBeenCalled();
  });

  it('routes a single note when elementsFromPoint finds no other overlap', () => {
    const c = readingContainer(
      'bible:test:1:2',
      '<mark class="hl-mark hl-note" data-group-id="g5" data-kind="note">solo</mark> to God',
    );
    const mark = c.querySelector('mark.hl-mark');
    mount();
    stubSelection(null);
    /** @type {any} */ (globalThis).NoteStore.get = (g) => (g === 'g5' ? { groupId: 'g5' } : null);
    const origEFP = document.elementsFromPoint;
    document.elementsFromPoint = () => [mark]; // only this mark at the point
    try {
      act(() => { fire(mark, 'click', { clientX: 10, clientY: 10 }); });
    } finally {
      document.elementsFromPoint = origEFP;
    }
    expect(window.__openNote).toHaveBeenCalledWith('g5');
    expect(window.__showMultiNote).not.toHaveBeenCalled();
  });

});

describe('SelectionToolbar — verse-number crossing (Android menu + copy)', () => {
  // Helper: cross-element range from first text node in startEl[startOff] to
  // first text node in endEl[endOff]. Mimics a selection that spans a .verse-num
  // sibling into a [data-hl-key] reading container.
  function crossRange(startEl, startOff, endEl, endOff) {
    const sn = document.createTreeWalker(startEl, NodeFilter.SHOW_TEXT, null).nextNode();
    const en = document.createTreeWalker(endEl, NodeFilter.SHOW_TEXT, null).nextNode();
    const r = document.createRange();
    r.setStart(sn, startOff);
    r.setEnd(en, endOff);
    r.getBoundingClientRect = () =>
      /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    return r;
  }

  it('suppresses the native menu when selection starts on a verse-num but ends in reading text', () => {
    const numSpan = document.createElement('span');
    numSpan.className = 'verse-num';
    numSpan.textContent = '3';
    document.body.appendChild(numSpan);
    const c = readingContainer('bible:test:1:3', 'In the beginning God created');
    mount();
    stubSelection(crossRange(numSpan, 0, c, 5));
    /** @type {any} */ let ev;
    act(() => { ev = fire(numSpan, 'contextmenu', { clientX: 5, clientY: 5 }); });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();
  });

  it('Copy button writes text WITH verse numbers; clean text (without verse-num) still used for the toolbar', () => {
    const numSpan = document.createElement('span');
    numSpan.className = 'verse-num';
    numSpan.textContent = '5';
    document.body.appendChild(numSpan);
    const c = readingContainer('bible:test:1:5', 'God called the light Day');

    const writtenTexts = /** @type {string[]} */ ([]);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { writtenTexts.push(t); return Promise.resolve(); } },
      writable: true, configurable: true,
    });

    mount();
    // Range from verse-num "5" into verse text (first 17 chars = "God called the li")
    stubSelection(crossRange(numSpan, 0, c, 17));
    act(() => { fire(numSpan, 'contextmenu', { clientX: 5, clientY: 5 }); });
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();

    const copyBtn = /** @type {any} */ ([...document.querySelectorAll('.sel-action-btn span')]
      .find((s) => s.textContent === 'Copy')?.closest('.sel-action-btn'));
    expect(copyBtn).not.toBeNull();
    act(() => { fire(copyBtn, 'click'); });

    expect(writtenTexts.length).toBe(1);
    // Copy text preserves the verse number "5"
    expect(writtenTexts[0]).toMatch(/5/);
    // Copy text also includes the reading content
    expect(writtenTexts[0]).toMatch(/God called the li/);
  });
});

describe('computeToolbarPlacement — near-top placement policy', () => {
  // toolbarH 150, navBottom 60 → minY = 60+8+150 = 218; lineH 28 → gap 56.
  const base = { toolbarH: 150, navBottom: 60, viewportH: 800, lineH: 28 };

  it('fits above: sits a two-line gap above the selection, no scroll', () => {
    expect(computeToolbarPlacement({ ...base, selTop: 400, selBottom: 420, maxScrollUp: 500 }))
      .toEqual({ y: 344, scrollUp: 0 }); // 400 − 56
  });

  it('near the top with scroll room: scrolls up exactly the deficit and pins under the nav', () => {
    // above = 100−56 = 44 < 218 → deficit 174. After scrollTop −= 174 the
    // selection sits at 274, and y=218 is exactly two lines (56px) above it.
    expect(computeToolbarPlacement({ ...base, selTop: 100, selBottom: 120, maxScrollUp: 500 }))
      .toEqual({ y: 218, scrollUp: 174 });
  });

  it('at the very top of the document (not enough scroll room): flips fully below, never a partial scroll', () => {
    // deficit 174 > maxScrollUp 40 → below = 120 + 56 + 150 = 326 (toolbar TOP
    // lands at 326−150 = 176, a two-line gap under selBottom 120). scrollUp
    // must be 0 — a partial scroll can't make room above, so it would just
    // jump the content for nothing.
    expect(computeToolbarPlacement({ ...base, selTop: 100, selBottom: 120, maxScrollUp: 40 }))
      .toEqual({ y: 326, scrollUp: 0 });
  });

  it('viewport-spanning selection (nothing fits): clamps under the nav so the end handle stays reachable', () => {
    // below = 700+56+150 = 906 > 792 → last resort.
    expect(computeToolbarPlacement({ ...base, selTop: 100, selBottom: 700, maxScrollUp: 0 }))
      .toEqual({ y: 218, scrollUp: 0 });
  });

  it('a selection starting OFF-SCREEN above never triggers the assist scroll (no yank-back)', () => {
    // Reachable now that real scrolling + edge auto-scroll let a selection run
    // far past the viewport: measured on-device, the release yanked the reader
    // ~2000px back up. selTop -1900 is above navBottom 60 -> assist refused;
    // selBottom 700 leaves no room below either, so it clamps under the nav.
    expect(computeToolbarPlacement({ ...base, selTop: -1900, selBottom: 700, maxScrollUp: 2563 }))
      .toEqual({ y: 218, scrollUp: 0 });
    // Same off-screen start, but with room below -> flips below, still no scroll.
    expect(computeToolbarPlacement({ ...base, selTop: -1900, selBottom: 200, maxScrollUp: 2563 }))
      .toEqual({ y: 406, scrollUp: 0 });
  });

  it('the assist is capped at one toolbar-plus-gap of travel (a huge deficit flips instead)', () => {
    // selTop 70 is on-screen, but deficit = 218 - (70-56) = 204 > 150+56=206?
    // no: 204 <= 206, so this one still assists (the near-top case it exists for).
    expect(computeToolbarPlacement({ ...base, selTop: 70, selBottom: 90, maxScrollUp: 900 }))
      .toEqual({ y: 218, scrollUp: 204 });
    // A taller toolbar makes minY larger, pushing the deficit past the cap.
    const tall = { ...base, toolbarH: 40 };  // minY = 108, cap = 40+56 = 96
    // selTop 20 -> above = -36, deficit = 144 > 96 -> refuse, flip below.
    expect(computeToolbarPlacement({ ...tall, selTop: 20, selBottom: 40, maxScrollUp: 900 }))
      .toEqual({ y: 136, scrollUp: 0 });
  });

  it('the gap tracks the text line height (2 lines) and is sane-bounded', () => {
    // Largest text size: lineH 48 → gap 96.
    expect(computeToolbarPlacement({ ...base, lineH: 48, selTop: 500, selBottom: 520, maxScrollUp: 0 }).y).toBe(404);
    // Absurd computed lineHeight clamps at 120.
    expect(computeToolbarPlacement({ ...base, lineH: 500, selTop: 500, selBottom: 520, maxScrollUp: 0 }).y).toBe(380);
  });
});

describe('SelectionToolbar — near-top selection never sits under the toolbar (layout effect)', () => {
  /* jsdom has no layout engine: the placement layout effect bails on
     offsetWidth/offsetHeight 0. Stub the prototype getters so ONLY the
     .sel-toolbar element reports a real size (320×150) — every other element
     keeps jsdom's 0, matching production geometry closely enough to drive the
     placement math. No .top-nav in the test DOM → navBottom falls back to 60,
     so minY = 218; the rangeOver rect is top 100 / bottom 116 and jsdom's
     lineHeight is unparseable → lineH falls back to 28 → gap 56. */
  let restoreSize;
  beforeEach(() => {
    const ow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() { return this.classList && this.classList.contains('sel-toolbar') ? 320 : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() { return this.classList && this.classList.contains('sel-toolbar') ? 150 : 0; },
    });
    restoreSize = () => {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', ow);
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', oh);
    };
  });
  afterEach(() => { restoreSize(); });

  /** Scrollable reading container (stands in for .screen-scroll) with a
      controllable scrollTop, holding a [data-hl-key] paragraph. */
  function scrollerWithContainer(scrollTop) {
    const s = document.createElement('div');
    s.style.overflowY = 'auto';
    Object.defineProperty(s, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, get: () => 700 });
    let st = scrollTop;
    Object.defineProperty(s, 'scrollTop', { configurable: true, get: () => st, set: (v) => { st = v; } });
    document.body.appendChild(s);
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'bible:test:1:1');
    p.textContent = 'The Revelation of Jesus Christ';
    s.appendChild(p);
    return { scroller: s, container: p };
  }

  it('with scroll room: auto-scrolls the container up by the deficit and sits two lines above (RED pre-fix: no scroll, toolbar shoved onto the selection)', () => {
    const { scroller, container } = scrollerWithContainer(500);
    mount();
    stubSelection(rangeOver(container, 0, 14)); // rect top 100 → deficit 174
    act(() => { fire(container, 'contextmenu', { clientX: 20, clientY: 20 }); });
    const tb = /** @type {HTMLElement} */ (document.querySelector('.sel-toolbar'));
    expect(tb).not.toBeNull();
    expect(scroller.scrollTop).toBe(326);   // 500 − 174
    expect(tb.style.top).toBe('218px');     // bottom edge = two lines above the slid-down selection
  });

  it('at the top of the document (scrollTop 0): places the toolbar fully BELOW the selection (RED pre-fix: clamped on top of it)', () => {
    const { scroller, container } = scrollerWithContainer(0);
    mount();
    stubSelection(rangeOver(container, 0, 14));
    act(() => { fire(container, 'contextmenu', { clientX: 20, clientY: 20 }); });
    const tb = /** @type {HTMLElement} */ (document.querySelector('.sel-toolbar'));
    expect(tb).not.toBeNull();
    expect(scroller.scrollTop).toBe(0);     // nothing to reveal — no pointless jump
    // y 322 → toolbar TOP at 322−150 = 172, a two-line gap under selBottom 116.
    expect(tb.style.top).toBe('322px');
  });
});

describe('SelectionToolbar — ANN2 remove-confirm discloses note deletion', () => {
  // Raise the toolbar over an EXISTING highlight (so the ✕ shows), then press ✕.
  async function raiseAndPressClear({ noted }) {
    const c = readingContainer('bible:test:1:1', 'The Revelation of Jesus Christ');
    const ann = [{ start: 0, end: 14, groupId: 'g1', kind: 'highlight', color: 'yellow' }];
    /** @type {any} */ (globalThis).HighlightStore.get = () => ann;   // covers [0,14] → existingHl → ✕ shows
    /** @type {any} */ (globalThis).AnnotationStore.get = () => ann;  // selectionGroups finds g1
    /** @type {any} */ (globalThis).NoteStore.get = (g) => (noted && g === 'g1' ? { groupId: 'g1' } : null);
    mount();
    stubSelection(rangeOver(c, 0, 14)); // "The Revelation"
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    const clearBtn = document.querySelector('.sel-color-clear');
    expect(clearBtn).not.toBeNull();
    act(() => { fire(clearBtn, 'click'); });
  }
  const questions = () => /** @type {any} */ (globalThis).ConfirmStrip.mock.calls.map((c) => c[0] && c[0].question);

  it('a NOTED highlight: the confirm warns the note text will be deleted', async () => {
    await raiseAndPressClear({ noted: true });
    expect(questions().some((q) => /note/i.test(q || '') && /deleted/i.test(q || ''))).toBe(true);
  });

  it('an UN-noted highlight: the confirm keeps the plain wording (no false note warning)', async () => {
    await raiseAndPressClear({ noted: false });
    expect(questions().some((q) => q === 'Remove this highlight?')).toBe(true);
    expect(questions().some((q) => /note/i.test(q || ''))).toBe(false);
  });

  it('confirming removes the highlight AND its note (the disclosed behavior)', async () => {
    await raiseAndPressClear({ noted: true });
    const call = /** @type {any} */ (globalThis).ConfirmStrip.mock.calls.find((c) => c[0] && typeof c[0].onConfirm === 'function');
    expect(call).toBeTruthy();
    act(() => { call[0].onConfirm(); });
    expect(/** @type {any} */ (globalThis).AnnotationStore.removeGroup).toHaveBeenCalledWith('g1');
    expect(/** @type {any} */ (globalThis).NoteStore.remove).toHaveBeenCalledWith('g1');
  });
});

describe('SelectionToolbar — P1-11a accessible names', () => {
  /** Raise the toolbar over a fresh selection and return its root element. */
  async function raiseToolbar() {
    const c = readingContainer('bible:test:1:1', 'The Revelation of Jesus Christ');
    mount();
    stubSelection(rangeOver(c, 0, 13)); // "The Revelation"
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    const tb = document.querySelector('.sel-toolbar');
    expect(tb).not.toBeNull();
    return /** @type {HTMLElement} */ (tb);
  }

  it('the container is a named toolbar landmark', async () => {
    const tb = await raiseToolbar();
    expect(tb.getAttribute('role')).toBe('toolbar');
    expect((tb.getAttribute('aria-label') || '').length).toBeGreaterThan(0);
  });

  it('style buttons have distinct names and aria-pressed tracks the active style', async () => {
    const tb = await raiseToolbar();
    const names = () => [...tb.querySelectorAll('.sel-style-btn')].map((b) => b.getAttribute('aria-label'));
    // All three previously announced as bare "A" (the visible glyph).
    expect(names()).toEqual(['Highlight', 'Underline', 'Squiggle underline']);
    // Default style is highlight — pressed there, not on the others.
    expect(tb.querySelector('.sel-style-btn')?.getAttribute('aria-pressed')).toBe('true');
    expect(tb.querySelector('.sel-style-btn-underline')?.getAttribute('aria-pressed')).toBe('false');
    expect(tb.querySelector('.sel-style-btn-squiggle')?.getAttribute('aria-pressed')).toBe('false');
    // Switching styles flips the pressed state (state-aware naming).
    act(() => { fire(/** @type {Element} */ (tb.querySelector('.sel-style-btn-squiggle')), 'click'); });
    expect(tb.querySelector('.sel-style-btn-squiggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(tb.querySelector('.sel-style-btn')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('color swatches announce their color and mark the live color pressed', async () => {
    // Existing green highlight over the selection → the green swatch is "current".
    const ann = [{ start: 0, end: 13, groupId: 'g1', kind: 'highlight', color: 'green' }];
    /** @type {any} */ (globalThis).HighlightStore.get = () => ann;
    /** @type {any} */ (globalThis).AnnotationStore.get = () => ann;
    const tb = await raiseToolbar();
    const swatches = [...tb.querySelectorAll('.sel-color-btn[data-color]')];
    expect(swatches.length).toBeGreaterThan(0);
    swatches.forEach((b) => {
      const color = b.getAttribute('data-color') || '';
      // Previously nameless (title only): now the name carries the color.
      expect(b.getAttribute('aria-label') || '').toContain(color);
    });
    const pressed = (c) => tb.querySelector('.sel-color-btn[data-color="' + c + '"]')?.getAttribute('aria-pressed');
    expect(pressed('green')).toBe('true');
    expect(pressed('yellow')).toBe('false');
    // The ✕ remove button has an accessible name too.
    const clear = tb.querySelector('.sel-color-clear');
    expect(clear).not.toBeNull();
    expect((clear?.getAttribute('aria-label') || '')).toMatch(/remove/i);
  });
});

describe('computeEdgeAutoScroll — the handle-drag edge decision (2026-07-29)', () => {
  /* The owner: "once you open highlight it locks scroll ... it'd be better if
     you could just scroll normally." Verified on-device (vot_api34, CDP) that
     the NATIVE layer never blocked scrolling — an identical synthetic drag
     scrolled 192px both with and without a live selection, and the selection
     survived. What actually broke the feel: a toolbar placed once and never
     moved (content scrolled 200px, toolbar moved 0px), and no natural gesture
     for extending a selection past the viewport. The ▲/▼ nudge row is retired
     in favour of real scrolling + this edge auto-scroll. */
  const BOX = { boxTop: 60, boxBottom: 760, band: 90 };

  it('a focus edge in the BOTTOM band scrolls down', () => {
    expect(computeEdgeAutoScroll({ focusTop: 740, focusBottom: 750, ...BOX })).toBe(1);
  });

  it('a focus edge in the TOP band scrolls up', () => {
    expect(computeEdgeAutoScroll({ focusTop: 80, focusBottom: 100, ...BOX })).toBe(-1);
  });

  it('mid-container is a no-scroll zone', () => {
    expect(computeEdgeAutoScroll({ focusTop: 400, focusBottom: 420, ...BOX })).toBe(0);
  });

  it('the band edges are exact (just inside arms, just outside does not)', () => {
    // bottom band arms below 760 − 90 = 670
    expect(computeEdgeAutoScroll({ focusTop: 660, focusBottom: 671, ...BOX })).toBe(1);
    expect(computeEdgeAutoScroll({ focusTop: 640, focusBottom: 670, ...BOX })).toBe(0);
    // top band arms above 60 + 90 = 150
    expect(computeEdgeAutoScroll({ focusTop: 149, focusBottom: 169, ...BOX })).toBe(-1);
    expect(computeEdgeAutoScroll({ focusTop: 150, focusBottom: 170, ...BOX })).toBe(0);
  });

  it('an oversized band is clamped to half the box, so the two ends can never both arm', () => {
    // A band wider than half the box would otherwise make every point satisfy
    // BOTH edge tests (up and down at once = thrash). Clamped to 350 here, the
    // regions meet at the midpoint (410) and the split stays single-valued.
    const tall = { boxTop: 60, boxBottom: 760, band: 5000 };
    expect(computeEdgeAutoScroll({ focusTop: 409, focusBottom: 409, ...tall })).toBe(-1);
    expect(computeEdgeAutoScroll({ focusTop: 411, focusBottom: 411, ...tall })).toBe(1);
    // Sweeping a collapsed edge end to end: every -1 precedes every 1 (one
    // clean crossover, no flip-flop), and the only non-directional point is
    // the exact midpoint knife-edge — never a whole dead zone.
    const dirs = [];
    for (let y = 60; y <= 760; y += 25) {
      dirs.push(computeEdgeAutoScroll({ focusTop: y, focusBottom: y, ...tall }));
    }
    expect(dirs.lastIndexOf(-1)).toBeLessThan(dirs.indexOf(1));
    expect(dirs.filter((d) => d === 0).length).toBeLessThanOrEqual(1);
  });

  it('a degenerate box never scrolls', () => {
    expect(computeEdgeAutoScroll({ focusTop: 0, focusBottom: 0, boxTop: 100, boxBottom: 100, band: 90 })).toBe(0);
  });
});

describe('edge auto-scroll interval — per-tick re-probe (2026-07-30)', () => {
  /* Regression: the interval used to check only isCollapsed per tick; the
     band/stop evaluation ran only on selectionchange. Releasing the handle
     INSIDE the band fires no further events (Android swallows the
     post-selection pointerup/touchend, and scrolling alone doesn't change the
     selection), so the container kept auto-scrolling to its end. The band is
     now re-probed on every tick: a released edge glides out of the band and
     stops, and a focus jump straight into the opposite band reverses instead
     of keeping the stale closure direction. */

  /** Scroller (box 60..760, band arms below 670 / above 150) holding a
      [data-hl-key] paragraph, with a MUTABLE focus rect: the probe's collapsed
      clone yields no rects in jsdom (forced below), so the component falls
      back to the selection range's getBoundingClientRect — stubbed here to
      read `focusRect.value`. */
  function armedScroller(focusRect) {
    const s = document.createElement('div');
    s.style.overflowY = 'auto';
    Object.defineProperty(s, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, get: () => 700 });
    let st = 500;
    Object.defineProperty(s, 'scrollTop', {
      configurable: true, get: () => st,
      set: (v) => { st = Math.min(Math.max(0, v), 2000 - 700); },
    });
    s.getBoundingClientRect = () => /** @type {any} */ ({ top: 60, bottom: 760, left: 0, right: 400, width: 400, height: 700 });
    document.body.appendChild(s);
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'bible:test:1:1');
    p.textContent = 'The Revelation of Jesus Christ which God gave unto Him';
    s.appendChild(p);
    const r = rangeOver(p, 0, 14);
    r.getBoundingClientRect = () => /** @type {any} */ (focusRect.value);
    return { scroller: s, container: p, range: r };
  }

  let _origGetClientRects;
  beforeEach(() => {
    _origGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () { return /** @type {any} */ ([]); };
  });
  afterEach(() => {
    Range.prototype.getClientRects = _origGetClientRects;
    vi.useRealTimers();
  });

  /** Raise the toolbar, then dispatch one selectionchange (under fake timers)
      to arm the auto-scroll interval. All advances stay < 350ms so the
      unrelated computeAndShow debounce never fires. */
  function arm(focusRect) {
    const parts = armedScroller(focusRect);
    mount();
    stubSelection(parts.range);
    act(() => { fire(parts.container, 'contextmenu', { clientX: 20, clientY: 20 }); });
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();
    vi.useFakeTimers();
    act(() => { document.dispatchEvent(new Event('selectionchange')); });
    return parts;
  }

  it('released inside the band: scrolling stops once the edge scrolls out (RED pre-fix: ran to the container end)', () => {
    const focusRect = { value: { top: 700, bottom: 716 } };   // bottom band
    const { scroller } = arm(focusRect);
    act(() => { vi.advanceTimersByTime(48); });               // 3 ticks × 24px
    expect(scroller.scrollTop).toBe(500 + 3 * 24);
    // Handle released — NO further selectionchange arrives. The scrolled
    // content carried the frozen edge out of the band.
    focusRect.value = { top: 400, bottom: 416 };
    act(() => { vi.advanceTimersByTime(16); });               // first out-of-band probe stops it
    const settled = scroller.scrollTop;
    act(() => { vi.advanceTimersByTime(160); });              // event silence — must stay put
    expect(scroller.scrollTop).toBe(settled);
  });

  it('a focus jump straight into the OPPOSITE band reverses direction (no stale closure dir)', () => {
    const focusRect = { value: { top: 700, bottom: 716 } };   // bottom band → stepping down
    const { scroller } = arm(focusRect);
    act(() => { vi.advanceTimersByTime(32); });
    const high = scroller.scrollTop;
    expect(high).toBeGreaterThan(500);
    focusRect.value = { top: 80, bottom: 96 };                // top band, no event in between
    act(() => { vi.advanceTimersByTime(32); });
    expect(scroller.scrollTop).toBeLessThan(high);            // now stepping UP
  });

  it('collapse mid-scroll stops the interval', () => {
    const focusRect = { value: { top: 700, bottom: 716 } };
    const { scroller } = arm(focusRect);
    act(() => { vi.advanceTimersByTime(32); });
    stubSelection(null);                                      // selection collapsed
    act(() => { vi.advanceTimersByTime(16); });
    const settled = scroller.scrollTop;
    act(() => { vi.advanceTimersByTime(160); });
    expect(scroller.scrollTop).toBe(settled);
  });
});

describe('SelectionToolbar — the ▲/▼ nudge row is retired', () => {
  function scrollerWithContainer(scrollTop) {
    const s = document.createElement('div');
    s.style.overflowY = 'auto';
    Object.defineProperty(s, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, get: () => 700 });
    let st = scrollTop;
    Object.defineProperty(s, 'scrollTop', {
      configurable: true, get: () => st,
      set: (v) => { st = Math.min(Math.max(0, v), 2000 - 700); },
    });
    document.body.appendChild(s);
    const p = document.createElement('p');
    p.setAttribute('data-hl-key', 'bible:test:1:1');
    p.textContent = 'The Revelation of Jesus Christ';
    s.appendChild(p);
    return { scroller: s, container: p };
  }

  it('no nudge buttons render while a selection is active (real scrolling replaced them)', () => {
    const { container } = scrollerWithContainer(0);
    mount();
    stubSelection(rangeOver(container, 0, 14));
    act(() => { fire(container, 'contextmenu', { clientX: 20, clientY: 20 }); });
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();
    expect(document.querySelector('.sel-nudge-btn')).toBeNull();
  });
});

/* A15 — Copy / Share outcomes are reported, never swallowed.
   Before: copyText and handleShare fired the promise, `.catch(() => {})`'d
   it, and cleared the selection in the same tick, so a browser that denied
   clipboard access lost the reader's quote in silence. The contract now:
   success says so, an intentional native-share cancel stays quiet, and any
   failure leaves the quote on screen, selectable, with a retry. */
describe('SelectionToolbar — Copy / Share outcomes are reported (A15)', () => {
  const QUOTE = 'In the beginning was the Word';
  /** @type {PropertyDescriptor | undefined} */ let origClipboard;
  /** @type {PropertyDescriptor | undefined} */ let origShare;

  beforeEach(() => {
    origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    /** @type {any} */ (globalThis).showToast = realShowToast;
  });

  afterEach(() => {
    _resetToasts();
    delete /** @type {any} */ (globalThis).showToast;
    if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
    else delete /** @type {any} */ (navigator).clipboard;
    if (origShare) Object.defineProperty(navigator, 'share', origShare);
    else delete /** @type {any} */ (navigator).share;
  });

  /** @param {((t: string) => Promise<void>) | null} writeText */
  function setClipboard(writeText) {
    Object.defineProperty(navigator, 'clipboard', {
      value: writeText ? { writeText } : undefined, writable: true, configurable: true,
    });
  }
  /** @param {((d: any) => Promise<void>) | undefined} fn */
  function setShare(fn) {
    Object.defineProperty(navigator, 'share', { value: fn, writable: true, configurable: true });
  }
  function denied() {
    return Promise.reject(Object.assign(new Error('Write permission denied.'), { name: 'NotAllowedError' }));
  }
  function raiseToolbar() {
    const c = readingContainer('bible:test:1:1', QUOTE);
    mount();
    stubSelection(rangeOver(c, 0, QUOTE.length));
    act(() => { fire(c, 'contextmenu', { clientX: 5, clientY: 5 }); });
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();
  }
  /** @param {string} label */
  function tapAction(label) {
    const btn = /** @type {any} */ ([...document.querySelectorAll('.sel-action-btn span')]
      .find((s) => s.textContent === label)?.closest('.sel-action-btn'));
    expect(btn).toBeTruthy();
    act(() => { fire(btn, 'click'); });
  }
  async function settle() {
    await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
  }
  function recovery() { return document.querySelector('[role="dialog"].copy-fallback, [role="alertdialog"].copy-fallback'); }
  function toastText() { const t = document.querySelector('.vot-toast.show'); return t ? t.textContent : ''; }

  it('Copy denied by the browser keeps the quote on screen, selectable, with a retry', async () => {
    setClipboard(denied);
    raiseToolbar();
    tapAction('Copy');
    await settle();
    const dlg = recovery();
    expect(dlg).not.toBeNull();
    const box = /** @type {HTMLTextAreaElement|null} */ (dlg && dlg.querySelector('textarea'));
    expect(box && box.value).toContain(QUOTE);
    expect(box && box.readOnly).toBe(true);
    expect([...(dlg ? dlg.querySelectorAll('button') : [])].map((b) => b.textContent)).toContain('Try again');
    expect(dlg && dlg.textContent).toMatch(/copy/i);
    expect(toastText()).not.toMatch(/Copied/);
  });

  it('Copy with no clipboard API at all (an insecure page) is reported, not thrown', async () => {
    setClipboard(null);
    raiseToolbar();
    tapAction('Copy');
    await settle();
    expect(recovery()).not.toBeNull();
  });

  it('a successful Copy confirms with a "Copied" toast and no dialog', async () => {
    const written = /** @type {string[]} */ ([]);
    setClipboard((t) => { written.push(t); return Promise.resolve(); });
    raiseToolbar();
    tapAction('Copy');
    await settle();
    expect(written.length).toBe(1);
    expect(written[0]).toContain(QUOTE);
    expect(toastText()).toMatch(/^Copied/);
    expect(recovery()).toBeNull();
  });

  it('Share cancelled by the reader stays quiet: no toast, no dialog, nothing copied', async () => {
    const written = /** @type {string[]} */ ([]);
    setClipboard((t) => { written.push(t); return Promise.resolve(); });
    setShare(() => Promise.reject(Object.assign(new Error('Share canceled'), { name: 'AbortError' })));
    raiseToolbar();
    tapAction('Share');
    await settle();
    expect(written.length).toBe(0);
    expect(toastText()).toBe('');
    expect(recovery()).toBeNull();
  });

  it('Share unavailable copies instead and tells the reader to paste it', async () => {
    setShare(undefined);
    setClipboard(() => Promise.resolve());
    raiseToolbar();
    tapAction('Share');
    await settle();
    expect(toastText()).toMatch(/Copied/);
    expect(toastText()).toMatch(/paste/i);
    expect(recovery()).toBeNull();
  });

  /* A8 (2026-09-22): Share carries the passage as a link that opens there;
     the reader's own journal writing never travels as a link. */
  /** @param {string} key */
  function raiseToolbarOn(key) {
    const c = readingContainer(key, QUOTE);
    mount();
    stubSelection(rangeOver(c, 0, QUOTE.length));
    act(() => { fire(c, 'contextmenu', { clientX: 5, clientY: 5 }); });
    expect(document.querySelector('.sel-toolbar')).not.toBeNull();
  }
  it('Share sends the quote, its reference and a link that opens the passage (A8)', async () => {
    const sent = /** @type {any[]} */ ([]);
    setShare((d) => { sent.push(d); return Promise.resolve(); });
    raiseToolbarOn('bible:john:3:16');
    tapAction('Share');
    await settle();
    expect(sent.length).toBe(1);
    expect(sent[0].text.startsWith(QUOTE)).toBe(true);
    expect(sent[0].text).toContain('3:16');
    expect(sent[0].text.endsWith('https://votreader.github.io/app/?p=bible%3Ajohn%3A3%3A16')).toBe(true);
  });

  /* n6-10 (sweep 2): a quote across three verses was labelled with its
     first verse only ("John 3:16"). The link still opens the first verse. */
  it('(n6-10) a quote across verses is labelled with its range', async () => {
    const sent = /** @type {any[]} */ ([]);
    setShare((d) => { sent.push(d); return Promise.resolve(); });
    const vs = ['bible:john:3:16', 'bible:john:3:17', 'bible:john:3:18'].map((k) => readingContainer(k, QUOTE));
    mount();
    const r = document.createRange();
    r.setStart(/** @type {any} */ (vs[0].firstChild), 3);
    r.setEnd(/** @type {any} */ (vs[2].firstChild), 10);
    r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    stubSelection(r);
    act(() => { fire(vs[0], 'contextmenu', { clientX: 5, clientY: 5 }); });
    tapAction('Share');
    await settle();
    expect(sent.length).toBe(1);
    // ASCII hyphen: Permanent Rule 1 (verse ranges never take an en dash, labels included; cp1).
    expect(sent[0].text).toMatch(/\n3:16-18\n|John 3:16-18\n|john 3:16-18\n/);
    expect(sent[0].text).not.toMatch(/[–—]/);
    expect(sent[0].text.endsWith('?p=bible%3Ajohn%3A3%3A16')).toBe(true);
  });

  /* n6-10, the rest: the quote is in the reader's translation while the link opens in the recipient's, so the
     label names it ("John 3:16 (KJV)"): two readers comparing the words know why they differ. */
  it('(n6-10) a Bible quote names the reader\'s translation', async () => {
    const g = /** @type {any} */ (globalThis);
    g.StateStore = { get: () => ({ settings: { translation: 'kjv' } }) };
    g.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV', desc: 'New King James Version' }, { id: 'kjv', label: 'KJV', desc: 'King James Version' }];
    try {
      const sent = /** @type {any[]} */ ([]);
      setShare((d) => { sent.push(d); return Promise.resolve(); });
      const c = readingContainer('bible:john:3:16', QUOTE);
      mount();
      const r = document.createRange();
      r.setStart(/** @type {any} */ (c.firstChild), 3);
      r.setEnd(/** @type {any} */ (c.firstChild), 20);
      r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
      stubSelection(r);
      act(() => { fire(c, 'contextmenu', { clientX: 5, clientY: 5 }); });
      tapAction('Share');
      await settle();
      expect(sent[0].text).toMatch(/3:16 \(KJV\)\n/);
    } finally { delete g.StateStore; delete g.TRANSLATION_OPTIONS; }
  });

  it('Share from the reader’s own journal sends the words alone, no link (A8)', async () => {
    const sent = /** @type {any[]} */ ([]);
    setShare((d) => { sent.push(d); return Promise.resolve(); });
    raiseToolbarOn('journal:abc123:0');
    tapAction('Share');
    await settle();
    expect(sent.length).toBe(1);
    expect(sent[0].text).toBe(QUOTE);
  });

  it('Share failing for another reason, with copy denied too, keeps the quote recoverable', async () => {
    setShare(() => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })));
    setClipboard(denied);
    raiseToolbar();
    tapAction('Share');
    await settle();
    const dlg = recovery();
    expect(dlg).not.toBeNull();
    const box = /** @type {HTMLTextAreaElement|null} */ (dlg && dlg.querySelector('textarea'));
    expect(box && box.value).toContain(QUOTE);
  });

  it('Try again copies from a fresh tap, closes the dialog and confirms "Copied"', async () => {
    let allow = false;
    setClipboard(() => (allow ? Promise.resolve() : denied()));
    raiseToolbar();
    tapAction('Copy');
    await settle();
    const dlg = recovery();
    expect(dlg).not.toBeNull();
    allow = true;
    const retry = /** @type {any} */ ([...(dlg ? dlg.querySelectorAll('button') : [])]
      .find((b) => b.textContent === 'Try again'));
    act(() => { fire(retry, 'click'); });
    await settle();
    expect(recovery()).toBeNull();
    expect(toastText()).toMatch(/^Copied/);
  });
});

/* cg1 — a poem's lines are separate <div>s; Copy must keep them as lines. */
describe('SelectionToolbar — Copy keeps a poetry selection\'s line breaks (cg1)', () => {
  /** @type {PropertyDescriptor | undefined} */ let origClipboard;
  beforeEach(() => { origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard'); });
  afterEach(() => {
    if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
    else delete /** @type {any} */ (navigator).clipboard;
  });

  it('copies two poetry lines as two lines, not glued together', () => {
    // A DIV container (a <div> inside the harness's <p> would be re-parented by the HTML parser).
    const c = document.createElement('div');
    c.setAttribute('data-hl-key', 'letter:test:3');
    c.innerHTML = '<div class="poem-line">If anyone adds to these words,</div><div class="poem-line">I will add to them the punishments</div>';
    document.body.appendChild(c);
    const written = /** @type {string[]} */ ([]);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { written.push(t); return Promise.resolve(); } }, writable: true, configurable: true,
    });
    mount();
    const lines = c.querySelectorAll('.poem-line');
    const r = document.createRange();
    r.setStart(/** @type {any} */ (lines[0].firstChild), 0);
    r.setEnd(/** @type {any} */ (lines[1].firstChild), 34);
    r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    stubSelection(r);
    act(() => { fire(c, 'contextmenu', { clientX: 5, clientY: 5 }); });
    const copyBtn = /** @type {any} */ ([...document.querySelectorAll('.sel-action-btn span')]
      .find((s) => s.textContent === 'Copy')?.closest('.sel-action-btn'));
    act(() => { fire(copyBtn, 'click'); });
    expect(written[0]).toBe('If anyone adds to these words,\nI will add to them the punishments');
  });

  /* n6-02 (sweep 2): the cg1 fix reached Copy only; Share still sent
     frag.textContent, so a poem's lines and a letter's paragraphs arrived glued. */
  it('(n6-02) Share keeps the lines apart too, and leaves the verse numbers out', async () => {
    const origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    const sent = /** @type {any[]} */ ([]);
    Object.defineProperty(navigator, 'share', { value: (d) => { sent.push(d); return Promise.resolve(); }, writable: true, configurable: true });
    try {
      const c = document.createElement('div');
      c.setAttribute('data-hl-key', 'letter:test:3');
      c.innerHTML = '<div class="poem-line"><span class="verse-num">18</span>If anyone adds to these words,</div><div class="poem-line">I will add to them the punishments</div>';
      document.body.appendChild(c);
      mount();
      const lines = c.querySelectorAll('.poem-line');
      const r = document.createRange();
      r.setStart(/** @type {any} */ (lines[0].firstChild), 0);
      r.setEnd(/** @type {any} */ (lines[1].firstChild), 34);
      r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
      stubSelection(r);
      act(() => { fire(c, 'contextmenu', { clientX: 5, clientY: 5 }); });
      const shareBtn = /** @type {any} */ ([...document.querySelectorAll('.sel-action-btn span')]
        .find((s) => s.textContent === 'Share')?.closest('.sel-action-btn'));
      act(() => { fire(shareBtn, 'click'); });
      await act(async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); });
      expect(sent.length).toBe(1);
      expect(sent[0].text.startsWith('If anyone adds to these words,\nI will add to them the punishments')).toBe(true);
    } finally {
      if (origShare) Object.defineProperty(navigator, 'share', origShare);
      else delete /** @type {any} */ (navigator).share;
    }
  });
});

/* LISTEN FROM HERE (item 7, 2026-09-24). The live reading pane registers
   window.__votListenFrom { has, start } while its unit has a recording
   (ReadAlongHighlight, onListen). The toolbar offers ONE extra action then, in
   its own row between the style/colour strip and the six actions (the Codex
   mockup pick, r1 option 2); text without a recording keeps today's toolbar. */
describe('SelectionToolbar — Listen from here', () => {
  afterEach(() => { delete /** @type {any} */ (window).__votListenFrom; });

  async function raise(c, start, end) {
    stubSelection(rangeOver(c, start, end));
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    return /** @type {HTMLElement} */ (document.querySelector('.sel-toolbar'));
  }

  it('offers it, in its own row between the colours and the actions, on text with a recording', async () => {
    const c = readingContainer('letter:one:chosen:3', 'Many things will I teach you. And though you feel weak');
    const start = vi.fn(() => true);
    /** @type {any} */ (window).__votListenFrom = { has: (k) => k === 'letter:one:chosen:3', start };
    mount();
    const tb = await raise(c, 30, 45);   // "And though you "
    const btn = /** @type {HTMLButtonElement} */ (tb.querySelector('.sel-listen-btn'));
    expect(btn).not.toBeNull();
    expect(btn.textContent.trim()).toBe('Listen from here');
    expect(btn.getAttribute('type')).toBe('button');
    const rows = [...tb.children].map((el) => el.className);
    const iListen = rows.findIndex((cl) => /sel-toolbar-listen/.test(cl));
    expect(iListen).toBeGreaterThan(rows.findIndex((cl) => /sel-toolbar-styles/.test(cl)));
    expect(iListen).toBeLessThan(rows.findIndex((cl) => /sel-toolbar-actions/.test(cl)));
    // The six actions are untouched.
    expect([...tb.querySelectorAll('.sel-action-btn span')].map((s) => s.textContent))
      .toEqual(['Note', 'Link', 'Copy', 'Share', 'Search', 'Bookmark']);
    expect(start).not.toHaveBeenCalled();
  });

  it('a tap starts the recording at the selection start and puts the toolbar away', async () => {
    const c = readingContainer('letter:one:chosen:3', 'Many things will I teach you. And though you feel weak');
    const start = vi.fn(() => true);
    /** @type {any} */ (window).__votListenFrom = { has: () => true, start };
    mount();
    const tb = await raise(c, 30, 45);
    act(() => { fire(/** @type {any} */ (tb.querySelector('.sel-listen-btn')), 'click'); });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('letter:one:chosen:3', 30);
    expect(document.querySelector('.sel-toolbar')).toBeNull();
  });

  it('text without a recording keeps today\'s toolbar exactly (no pane, or a block the pane does not own)', async () => {
    const c = readingContainer('bible:test:1:1', 'The Revelation of Jesus Christ');
    mount();
    let tb = await raise(c, 4, 14);
    expect(tb.querySelector('.sel-listen-btn')).toBeNull();
    expect(tb.querySelector('.sel-toolbar-listen')).toBeNull();
    cleanup();
    /** @type {any} */ (window).__votListenFrom = { has: () => false, start: vi.fn(() => true) };
    mount();
    tb = await raise(c, 4, 14);
    expect(tb.querySelector('.sel-listen-btn')).toBeNull();
  });
});

/* REPEAT THIS PASSAGE (rp1 part 3, 2026-09-25; mockup lanes/myweb/out/mockups/rp1/r1-repeat.png): REPEAT sits
   beside Listen from here while the pane can loop (window.__votListenFrom.repeat; the APK's native player has
   none yet), and loops the selected blocks three times under the passage's own reference. */
describe('SelectionToolbar — Repeat', () => {
  afterEach(() => { delete /** @type {any} */ (window).__votListenFrom; });

  async function raise(c, start, end) {
    stubSelection(rangeOver(c, start, end));
    act(() => { fire(c, 'pointerdown', { clientX: 5, clientY: 5 }); });
    await act(async () => {
      fire(c, 'pointerup', { clientX: 80, clientY: 5 });
      await new Promise((r) => setTimeout(r, 250));
    });
    return /** @type {HTMLElement} */ (document.querySelector('.sel-toolbar'));
  }

  it('sits beside Listen from here and loops the verse three times under its reference', async () => {
    const c = readingContainer('bible:psalms:23:1', 'The LORD is my shepherd; I shall not want.');
    const repeat = vi.fn((/** @type {string[]} */ _keys, /** @type {string} */ _label, /** @type {number} */ _times) => true);
    /** @type {any} */ (globalThis)._bookTitle = (id) => (id === 'psalms' ? 'Psalms' : id);   // the app's global
    /** @type {any} */ (window).__votListenFrom = { has: () => true, start: vi.fn(() => true), repeat };
    mount();
    const tb = await raise(c, 4, 14);
    const row = /** @type {HTMLElement} */ (tb.querySelector('.sel-toolbar-listen'));
    const btn = /** @type {HTMLButtonElement} */ (row.querySelector('.sel-repeat-btn'));
    expect(btn).not.toBeNull();
    expect(btn.textContent.trim()).toBe('Repeat');
    expect(btn.getAttribute('aria-label')).toBe('Repeat this passage 3 times');
    expect([...row.querySelectorAll('button')].map((b) => b.className)).toEqual(['sel-listen-btn', 'sel-repeat-btn']);
    act(() => { fire(btn, 'click'); });
    expect(repeat).toHaveBeenCalledTimes(1);
    const [keys, label, times] = repeat.mock.calls[0];
    expect(keys).toEqual(['bible:psalms:23:1']);
    expect(label, 'the Share label of the passage').toBe('Psalms 23:1');
    expect(times).toBe(3);
    expect(document.querySelector('.sel-toolbar')).toBeNull();
    delete /** @type {any} */ (globalThis)._bookTitle;
  });

  it('no Repeat where the pane cannot loop: Listen from here stays alone', async () => {
    const c = readingContainer('letter:one:chosen:3', 'Many things will I teach you. And though you feel weak');
    /** @type {any} */ (window).__votListenFrom = { has: () => true, start: vi.fn(() => true) };
    mount();
    const tb = await raise(c, 30, 45);
    expect(tb.querySelector('.sel-listen-btn')).not.toBeNull();
    expect(tb.querySelector('.sel-repeat-btn')).toBeNull();
  });
});

/* cp1 (2026-09-26, a reader's request): a copied passage arrived as
   "37On the last day, ..." with no reference, and the reader typed
   "John 7:37-39" under it by hand. The Copy button and EVERY other way of
   copying (Ctrl+C, the Android selection menu, the iOS callout: the document
   `copy` event) now give a verse per line, "37 On", and the reference. */
describe('SelectionToolbar — a copied passage names itself (cp1)', () => {
  const V37 = 'On the last day, that great day of the feast, YahuShua stood and cried out, saying, “If anyone thirsts, let him come to Me and drink.';
  const V38 = 'He who believes in Me, as the Scripture has said, out of his heart will flow rivers of living water.”';
  const V39 = 'But this He spoke concerning the Spirit, whom those believing in Him would receive; for the Holy Spirit was not yet given, because YahuShua was not yet glorified.';
  const WANT = `37 ${V37}\n38 ${V38}\n39 ${V39}\nJohn 7:37-39 (NKJV-R)`;
  const g = /** @type {any} */ (globalThis);
  /** @type {PropertyDescriptor | undefined} */ let origClipboard;

  beforeEach(() => {
    origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    g._bookTitle = (/** @type {string} */ id) => (id === 'john' ? 'John' : id);
    g.StateStore = { get: () => ({ settings: { translation: 'rnkjv' } }) };
    g.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV' }, { id: 'rnkjv', label: 'NKJV-R' }];
  });
  afterEach(() => {
    if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
    else delete /** @type {any} */ (navigator).clipboard;
    delete g._bookTitle; delete g.StateStore; delete g.TRANSLATION_OPTIONS;
  });

  /** BibleChapterView's markup: gutter number, verse block, icons, space. */
  function chapter() {
    const wrap = document.createElement('div');
    wrap.className = 'verses-block';
    wrap.innerHTML = [[37, V37], [38, V38], [39, V39]].map(([n, t]) =>
      `<span id="v-${n}" class="verse"><span class="verse-num">${n}</span><span data-hl-key="bible:john:7:${n}">${t}</span> </span>`).join('');
    document.body.appendChild(wrap);
    return wrap;
  }
  /** The reader's selection: from the "37" in the gutter to the end of verse 39. */
  function readersRange() {
    const r = document.createRange();
    r.setStart(/** @type {any} */ (document.querySelector('#v-37 .verse-num')).firstChild, 0);
    const end = /** @type {any} */ (document.querySelector('[data-hl-key="bible:john:7:39"]')).firstChild;
    r.setEnd(end, end.length);
    r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    return r;
  }
  /** A `copy` event as the browser dispatches it, with a clipboardData to write to.
      @param {EventTarget} target */
  function nativeCopy(target) {
    const data = /** @type {Record<string, string>} */ ({});
    const ev = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { setData: (/** @type {string} */ t, /** @type {string} */ v) => { data[t] = v; } } });
    target.dispatchEvent(ev);
    return { ev, data };
  }

  it('the Copy button copies the reader\'s John 7:37-39 as asked: "37 On ...", a verse per line, then the reference', () => {
    chapter();
    const written = /** @type {string[]} */ ([]);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (/** @type {string} */ t) => { written.push(t); return Promise.resolve(); } }, writable: true, configurable: true,
    });
    mount();
    stubSelection(readersRange());
    act(() => { fire(/** @type {any} */ (document.querySelector('#v-38')), 'contextmenu', { clientX: 5, clientY: 5 }); });
    const copyBtn = /** @type {any} */ ([...document.querySelectorAll('.sel-action-btn span')]
      .find((s) => s.textContent === 'Copy')?.closest('.sel-action-btn'));
    act(() => { fire(copyBtn, 'click'); });
    expect(written).toEqual([WANT]);
  });

  it('Ctrl+C / the native menu\'s Copy (the document copy event) writes the same text and replaces the browser\'s', () => {
    chapter();
    mount();
    stubSelection(readersRange());
    const { ev, data } = nativeCopy(/** @type {any} */ (document.querySelector('#v-37 .verse-num')));
    expect(data['text/plain']).toBe(WANT);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('a copy inside a text field is the field\'s own (search box, journal editor, the copy-fallback retry)', () => {
    chapter();
    const box = document.createElement('textarea');
    box.value = 'my own words';
    document.body.appendChild(box);
    mount();
    stubSelection(readersRange());   // even with reading text selected elsewhere
    const { ev, data } = nativeCopy(box);
    expect(data['text/plain']).toBeUndefined();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Share sends the same passage without the numbers: a verse per line, Copy\'s reference, a link to the first verse', async () => {
    chapter();
    const origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    const sent = /** @type {any[]} */ ([]);
    Object.defineProperty(navigator, 'share', { value: (/** @type {any} */ d) => { sent.push(d); return Promise.resolve(); }, writable: true, configurable: true });
    try {
      mount();
      stubSelection(readersRange());
      act(() => { fire(/** @type {any} */ (document.querySelector('#v-38')), 'contextmenu', { clientX: 5, clientY: 5 }); });
      const shareBtn = /** @type {any} */ ([...document.querySelectorAll('.sel-action-btn span')]
        .find((sp) => sp.textContent === 'Share')?.closest('.sel-action-btn'));
      act(() => { fire(shareBtn, 'click'); });
      await act(async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); });
      expect(sent[0].text).toBe(`${V37}\n${V38}\n${V39}\n\nJohn 7:37-39 (NKJV-R)\nhttps://votreader.github.io/app/?p=bible%3Ajohn%3A7%3A37`);
    } finally {
      if (origShare) Object.defineProperty(navigator, 'share', origShare);
      else delete /** @type {any} */ (navigator).share;
    }
  });

  it('Share keeps a Words To Live By poem\'s <br> lines apart (they arrived glued: "captiveThat")', async () => {
    const p = readingContainer('wtlb:faith:2', '');
    p.innerHTML = 'Take your every thought captive<br><br>That you may be set apart';
    const origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    const sent = /** @type {any[]} */ ([]);
    Object.defineProperty(navigator, 'share', { value: (/** @type {any} */ d) => { sent.push(d); return Promise.resolve(); }, writable: true, configurable: true });
    try {
      mount();
      const r = document.createRange();
      r.setStart(p, 0);
      r.setEnd(p, p.childNodes.length);
      r.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
      stubSelection(r);
      act(() => { fire(p, 'contextmenu', { clientX: 5, clientY: 5 }); });
      const shareBtn = /** @type {any} */ ([...document.querySelectorAll('.sel-action-btn span')]
        .find((sp) => sp.textContent === 'Share')?.closest('.sel-action-btn'));
      act(() => { fire(shareBtn, 'click'); });
      await act(async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); });
      expect(sent[0].text.startsWith('Take your every thought captive\n\nThat you may be set apart')).toBe(true);
    } finally {
      if (origShare) Object.defineProperty(navigator, 'share', origShare);
      else delete /** @type {any} */ (navigator).share;
    }
  });

  it('the reader\'s own journal and text outside the reading blocks keep the browser\'s copy', () => {
    const p = readingContainer('journal:e1:b1', 'What I learned today');
    mount();
    stubSelection(rangeOver(p, 0, 8));
    let r = nativeCopy(p);
    expect(r.data['text/plain']).toBeUndefined();
    expect(r.ev.defaultPrevented).toBe(false);
    const d = document.createElement('div');
    d.textContent = 'Reading settings';
    document.body.appendChild(d);
    stubSelection(rangeOver(d, 0, 7));
    r = nativeCopy(d);
    expect(r.ev.defaultPrevented).toBe(false);
  });

  it('a select-all highlight marks only the page on screen, never the swipe previews of the next and previous chapters', async () => {
    const peek = document.createElement('div');
    peek.className = 'pager-peek pager-peek-next';
    peek.setAttribute('inert', '');
    peek.innerHTML = '<span class="verse"><span class="verse-num">1</span><span data-hl-key="bible:john:8:1">But Jesus went to the Mount of Olives.</span></span>';
    chapter();
    document.body.appendChild(peek);
    mount();
    const all = document.createRange();
    all.setStart(document.body, 0);
    all.setEnd(document.body, document.body.childNodes.length);
    all.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 100, right: 80, bottom: 116, width: 80, height: 16 });
    stubSelection(all);
    // Ctrl+A: no pointer, so the toolbar rises from the settled selectionchange.
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((r) => setTimeout(r, 400));
    });
    const yellow = /** @type {any} */ (document.querySelector('.sel-color-btn[data-color="yellow"]'));
    act(() => { fire(yellow, 'click'); });
    const keys = g.AnnotationStore.add.mock.calls.map((/** @type {any[]} */ c) => c[0]);
    expect(keys).toEqual(['bible:john:7:37', 'bible:john:7:38', 'bible:john:7:39']);
  });
});
