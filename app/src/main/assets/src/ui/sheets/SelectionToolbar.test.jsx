/* W4.5 + annotation tap routing — SelectionToolbar contract.
   ────────────────────────────────────────────────────────────
   Locks the pointer-drag and tap-routing behaviors:

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
import { SelectionToolbar, computeToolbarPlacement } from './SelectionToolbar.jsx';

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
