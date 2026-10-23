// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   selection-drag — a selection being dragged stays in the reading column,
   and an end held at the edge scrolls the column gently (rs1, 2026-10-22)
   ═══════════════════════════════════════════════════════════════════════
   Bundled into bundle-d; SelectionToolbar starts it once (it is always mounted).

   Corbin, 2026-10-22: "if I highlight something and scroll to highlight more,
   instead of scrolling the page up or down gently to continue highlighting,
   sometimes it'll highlight for instance the media player, or it'll suddenly
   highlight the entire page including other UI elements, or my select will
   drop entirely".

   Measured on the S22 with real touches (lanes/readalong/out/rs1):
   - A handle dragged onto the mini player put the selection's end on the
     page's last element (a hidden toast after the app): 2585 characters, the
     rest of the chapter, the swipe previews and the player. Over chrome the
     browser takes the nearest text in DOCUMENT order, not on screen.
   - Dragged up over the top bar (in flow above the column, no text under it),
     the end went to the page's first text (the hero) and the browser scrolled
     the column to the top to show it.
   - The old edge scroll measured the moving end by the WHOLE selection's box
     when the end had none of its own (that hidden toast), so the escape read
     as "at the top" and wound the column up at 1500 px/s.
   - While a handle is dragged the page hears no touch or pointer event; the
     contextmenu the browser sends after the lift is the one sign the finger
     has left the glass.
   - A selection the page sets while a handle is held ENDS the browser's drag
     (it sends that contextmenu 2 ms later, and the finger moves nothing after
     it): the end must never be set from here until the lift.

   So, while a selection that starts in a reading column is dragged:
   1. the chrome around the column takes no touches (body.sel-dragging in
      app.css: bars, pills, toasts), so the browser finds the text under the
      finger, even text under the mini player, and the selection toolbar waits
      for the lift (selectionDragging);
   2. a scroll the browser makes to show an end it put far away (the hero) is
      undone;
   3. an end at the top or bottom edge of the reading text (or past it, or lost
      past it) scrolls the column gently, faster the deeper it goes; the
      browser moves the end onto the text that comes under the finger as the
      finger moves;
   4. at the lift the end goes where the reader saw it: onto the reading text
      that shows, at the finger's line, when the browser had lost it, left it
      under the player or the bars, or the column had scrolled under a still
      finger since the browser last moved it;
   5. it all stops at the lift (contextmenu), on a new touch, or when the
      selection goes. With no lift heard, the scroll stops SCROLL_LEASE_MS
      after the browser last moved an end it can see, and at LEASE_MS the drag
      ends as if lifted (a safety net).
   While a drag is on, only the reading column is selectable (app.css), so an
   end dragged past the chapter's last line stays on it: the browser had put
   it on an empty marker after the column, off the screen.
   A mouse drag survives an end set by the page, and the page hears its
   pointer: the column scrolls the same gentle way while the mouse is held at
   an edge or past it, the end goes onto the text under the mouse each frame
   and at once when the browser loses it, and a scroll the browser makes on
   its own is undone (its autoscroll ran ~2000 px/s with the mouse just over
   the top bar, and none with it over the player); the wheel still scrolls.
   A selection made with the keyboard is never touched.
   ═══════════════════════════════════════════════════════════════════════ */

/** px inside the reading text's top or bottom edge where an end held there starts the scroll. */
export const DRAG_BAND = 56;
/** px/s at the band's inner edge, and at its deepest (an end past the edge by a band). The S22 at 90-480 ran
    410-480 px/s with the finger on the mini player: too fast to stop on a verse. */
export const SPEED_MIN = 60;
export const SPEED_MAX = 320;
/** The browser has not moved an end it can see for this long: the scroll stops until it does. A finger held on
    the glass moves a hair now and then, and the text moving under it moves the end, so only a lift (or a finger
    quite still) goes this long without; this bounds a scroll after a lift no contextmenu told of. An end the
    browser LOST past an edge (the finger over the top bar, no text under it) cannot move while the finger stays
    there, so that scroll goes on until the lift, whose contextmenu comes there too (S22). */
export const SCROLL_LEASE_MS = 1500;
/** ... and for this long, whatever the end: the drag is over, as if lifted (a safety net). */
export const LEASE_MS = 8000;

/** The swipe previews: inert clones of the neighbour pages (ScreenLayout). */
const OFF_PAGE = '[inert], .pager-peek';
/** Words inside the column that are not reading text: a press there is no place for an end. */
const NOT_TEXT = 'button, input, textarea, [contenteditable]:not([contenteditable="false"]), .mini-title, .back-hint-row, .bottom-nav, .sel-toolbar';

/**
 * How fast (px/s, + down, - up) the column scrolls for an end at `y`, or 0
 * outside the bands. The speed climbs from SPEED_MIN at the band's inner edge,
 * through a quarter of the way at the edge itself, to SPEED_MAX a band past
 * it (a finger deep in the mini player), squared so the start is soft.
 * @param {{ y: number, top: number, bottom: number, band?: number, min?: number, max?: number }} a
 * @returns {number}
 */
export function edgeScrollSpeed({ y, top, bottom, band = DRAG_BAND, min = SPEED_MIN, max = SPEED_MAX }) {
  if (!(bottom > top) || !Number.isFinite(y)) return 0;
  // A short column keeps a still middle: the two bands never meet.
  const b = Math.max(1, Math.min(band, (bottom - top) / 3));
  const speed = (/** @type {number} */ into) => { const d = Math.min(1, into / (2 * b)); return min + (max - min) * d * d; };
  if (y > bottom - b) return speed(y - (bottom - b));
  if (y < top + b) return -speed((top + b) - y);
  return 0;
}

/** The top edge of the bottom dock: the highest visible floating bottom control (the mini player and its pull
    tab, the auto-scroll and find pills, the Study Notes toggle), or the viewport's bottom when none shows.
    @param {Document} [doc] @param {number} [vh] @returns {number} */
export function dockTop(doc = document, vh = window.innerHeight) {
  let top = vh;
  for (const el of doc.querySelectorAll('.audio-bar, .audio-bar-pull, .ascroll-pill, .find-pill, .mode-toggle-wrap')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.top < top && getComputedStyle(el).display !== 'none') top = r.top;
  }
  return top;
}

/** Where the reading text shows in `col`: under the bands pinned at its top (the "Back to" row, the page's
    mini title once shown) and above the bottom dock.
    @param {Element} col @returns {{ top: number, bottom: number, left: number, right: number }} */
export function readingEdges(col) {
  const box = col.getBoundingClientRect();
  let top = box.top;
  for (const el of col.querySelectorAll('.back-hint-row, .mini-title.shown')) {
    const r = el.getBoundingClientRect();
    if (r.height && r.bottom > top && r.top < box.top + 200) top = r.bottom;
  }
  const doc = col.ownerDocument || document;
  const vh = (doc.defaultView || window).innerHeight;
  return { top, bottom: Math.min(box.bottom, dockTop(doc, vh)), left: box.left, right: box.right };
}

/** The live reading column a node is in (a .screen-scroll that is no swipe preview), or null.
    @param {Node | null} node @returns {Element | null} */
export function liveColumnOf(node) {
  const el = node && (node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement);
  const col = el ? el.closest('.screen-scroll') : null;
  return col && !col.closest(OFF_PAGE) ? col : null;
}

/** Is a selection end being dragged now? The selection toolbar raises at the lift, not in the middle of a drag.
    @param {Document} [doc] */
export function selectionDragging(doc = document) {
  return !!doc.body && doc.body.classList.contains('sel-dragging');
}

/** The caret at a point of the screen ({ node, offset }), or null.
    @param {Document} doc @param {number} x @param {number} y */
function caretAt(doc, x, y) {
  const d = /** @type {any} */ (doc);
  try {
    if (typeof d.caretPositionFromPoint === 'function') {
      const p = d.caretPositionFromPoint(x, y);
      if (p && p.offsetNode) return { node: /** @type {Node} */ (p.offsetNode), offset: /** @type {number} */ (p.offset) };
    }
    if (typeof d.caretRangeFromPoint === 'function') {
      const r = d.caretRangeFromPoint(x, y);
      if (r) return { node: r.startContainer, offset: r.startOffset };
    }
  } catch (_e) { /* a point off the page */ }
  return null;
}

/** Is a caret on words of the column (not its chrome, nor a decoration a selection cannot take: the ✦ ornament)?
    @param {{ node: Node }} c @param {Element} col */
function onColumnText(c, col) {
  const el = c.node.nodeType === 1 ? /** @type {Element} */ (c.node) : c.node.parentElement;
  if (!el || !col.contains(el) || c.node.nodeType !== 3 || el.closest(NOT_TEXT)) return false;
  const cs = /** @type {any} */ (getComputedStyle(el));
  return (cs.userSelect || cs.webkitUserSelect) !== 'none';
}

/** The screen box of a selection end, or null when it has none (an empty or hidden element).
    @param {Document} doc @param {Node} node @param {number} offset */
function caretBox(doc, node, offset) {
  try {
    const r = doc.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const rects = r.getClientRects();
    const b = rects.length ? rects[0] : (node.nodeType === 3 ? null : /** @type {Element} */ (node).getBoundingClientRect());
    return b && (b.width || b.height) ? { x: b.left, y: (b.top + b.bottom) / 2, h: b.height || 0 } : null;
  } catch (_e) { return null; }
}

/** The line height of the text in a column (px).
    @param {Element} col */
function lineHeightOf(col) {
  const probe = col.querySelector('[data-hl-key]') || col;
  const lh = parseFloat(getComputedStyle(probe).lineHeight);
  return lh > 0 && Number.isFinite(lh) ? lh : 28;
}

/**
 * Start the selection drag guard on `doc`. Returns stop().
 * @param {{ doc?: Document, now?: () => number, frame?: (cb: FrameRequestCallback) => number, cancelFrame?: (id: number) => void }} [deps]
 * @returns {() => void}
 */
export function startSelectionDrag(deps = {}) {
  const doc = deps.doc || document;
  const win = /** @type {Window} */ (doc.defaultView || window);
  const now = deps.now || (() => performance.now());
  const frame = deps.frame || ((cb) => win.requestAnimationFrame(cb));
  const cancelFrame = deps.cancelFrame || ((id) => win.cancelAnimationFrame(id));

  /** The selection as last seen. */
  let last = { anchorNode: /** @type {Node | null} */ (null), anchorOffset: 0, focusNode: /** @type {Node | null} */ (null), focusOffset: 0, collapsed: true };
  let pointer = 'touch';            // the last pointer that went down (a handle drag sends none)
  let mouseDown = false;
  let keyAt = -Infinity;            // a key went down: Shift+arrows move the end, leave them be
  let menuAt = -Infinity;           // the last contextmenu: the long-press's own, or the lift after a drag
  let wheelAt = -Infinity;          // the wheel turned: a mouse drag's column may move by it
  /** Where the finger is, as far as the page can know: the end the browser last put down, or the edge the end
      was lost past; for a mouse, the pointer. */
  let finger = { x: 0, y: 0, at: -Infinity };
  /** The browser's last move lost the end past an edge (see SCROLL_LEASE_MS). */
  let lost = false;
  /** px the column scrolled under the finger since the browser last moved the end. */
  let scrolled = 0;
  /** An end we set ourselves (at the lift): its selectionchange is ours. */
  let mine = /** @type {{ node: Node, offset: number } | null} */ (null);
  /** The column the drag is in, and its scrollTop as we last knew it (to undo a jump the browser makes). */
  let col = /** @type {Element | null} */ (null);
  let knownTop = 0;
  let dragging = false;
  let leaseTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  let raf = 0, lastT = 0, carry = 0;

  const setDragging = (/** @type {boolean} */ on) => {
    dragging = on;
    if (doc.body) doc.body.classList.toggle('sel-dragging', on);
  };
  const stopScroll = () => { if (raf) cancelFrame(raf); raf = 0; lastT = 0; carry = 0; };
  const endDrag = () => {
    stopScroll();
    if (leaseTimer) { clearTimeout(leaseTimer); leaseTimer = null; }
    setDragging(false);
    col = null; scrolled = 0; lost = false;
  };
  const armLease = () => {
    if (leaseTimer) clearTimeout(leaseTimer);
    leaseTimer = setTimeout(() => { leaseTimer = null; if (!mouseDown) { pinEnd(); endDrag(); } }, LEASE_MS);
  };

  /** Put the selection's end on the caret `c`, keeping its anchor. */
  const setEnd = (/** @type {Selection} */ sel, /** @type {{ node: Node, offset: number }} */ c) => {
    if (sel.focusNode === c.node && sel.focusOffset === c.offset) return;
    if (!last.anchorNode) return;
    mine = c;
    try { sel.setBaseAndExtent(last.anchorNode, last.anchorOffset, c.node, c.offset); } catch (_e) { mine = null; }
  };

  /** The caret on the column's text at the line of `y` (kept inside the text that shows), or the nearest line
      toward the middle that has text, up to `reach` lines; `x` is kept inside the column. Null when none has. */
  const caretNear = (/** @type {Element} */ c, /** @type {number} */ y, /** @type {number} */ x, reach = 6) => {
    const e = readingEdges(c);
    const lh = lineHeightOf(c);
    const cx = Math.min(Math.max(x, e.left + 24), e.right - 24);
    const cy = Math.min(Math.max(y, e.top + lh / 2), e.bottom - lh / 2);
    const inward = cy > (e.top + e.bottom) / 2 ? -1 : 1;
    for (let i = 0; i < reach; i++) {
      const hit = caretAt(doc, cx, cy + inward * lh * i);
      if (hit && onColumnText(hit, c)) return hit;
    }
    return null;
  };

  /** At the lift: the end goes onto the reading text that shows, at the finger's line, when the browser lost it
      (the finger is then the edge it was lost past), left it under the dock or the top bands, or the column moved
      under a still finger; else it stays put. */
  const pinEnd = () => {
    const sel = win.getSelection();
    if (!col || !sel || sel.isCollapsed || !sel.focusNode || !last.anchorNode) return;
    const e = readingEdges(col);
    const box = caretBox(doc, sel.focusNode, sel.focusOffset);
    const inCol = col.contains(sel.focusNode) && !(sel.focusNode.parentElement && sel.focusNode.parentElement.closest(OFF_PAGE));
    let y = null, reach = 6;
    if (!inCol || !box) y = finger.y;
    else if (box.y > e.bottom) y = e.bottom;
    else if (box.y < e.top) y = e.top;
    // The text under a finger that stayed still: that line only. Past the chapter's last words there is none, and
    // the browser's end (on those words) stands.
    else if (Math.abs(scrolled) >= lineHeightOf(col) / 2) { y = finger.y; reach = 1; }
    if (y === null) return;
    const c = caretNear(col, y, finger.x, reach);
    if (c) setEnd(sel, c);
  };

  /** Each frame while the finger is at an edge: scroll the column a little (a mouse's end follows it). */
  const tick = (/** @type {number} */ t) => {
    raf = 0;
    const sel = win.getSelection();
    if (!col || !sel || sel.isCollapsed || !sel.rangeCount) { endDrag(); return; }
    if (!mouseDown && !lost && now() - finger.at > SCROLL_LEASE_MS) { stopScroll(); return; }
    const e = readingEdges(col);
    const v = edgeScrollSpeed({ y: finger.y, top: e.top, bottom: e.bottom });
    if (!v) { stopScroll(); return; }
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    carry += v * dt;
    const step = Math.trunc(carry);
    carry -= step;
    if (step) {
      const before = col.scrollTop;
      col.scrollTop = before + step;
      knownTop = col.scrollTop;
      scrolled += col.scrollTop - before;
      if (col.scrollTop === before) { stopScroll(); return; }   // the column's end: nothing more to give
    }
    if (mouseDown) { const c = caretNear(col, finger.y, finger.x); if (c) setEnd(sel, c); }
    raf = frame(tick);
  };

  const onSelectionChange = () => {
    const sel = win.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !sel.anchorNode || !sel.focusNode) {
      last = { anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0, collapsed: true };
      if (dragging && !mouseDown) endDrag();
      return;
    }
    const prev = last;
    last = { anchorNode: sel.anchorNode, anchorOffset: sel.anchorOffset, focusNode: sel.focusNode, focusOffset: sel.focusOffset, collapsed: false };
    if (mine && sel.focusNode === mine.node && sel.focusOffset === mine.offset) { mine = null; return; }   // ours
    mine = null;
    // A change that moved nothing (a selectionchange the page did not cause by moving an end) is left alone: a
    // reader who scrolled away from a selection must not have it brought back to the screen.
    const endMoved = sel.focusNode !== prev.focusNode || sel.focusOffset !== prev.focusOffset;
    if (!endMoved && !mouseDown) return;
    const c = liveColumnOf(sel.anchorNode);
    const anchorEl = sel.anchorNode.nodeType === 1 ? /** @type {Element} */ (sel.anchorNode) : sel.anchorNode.parentElement;
    if (!c || !anchorEl || anchorEl.closest(NOT_TEXT)) { if (dragging && !mouseDown) endDrag(); return; }
    if (now() - keyAt < 500) return;
    // A drag moves one end of a selection already there while the other stays put. Dragging the START handle turns
    // the selection round: its old end becomes the anchor (S22, 2026-10-22). The long-press that made the selection
    // is not a drag: Chromium sends its contextmenu, then the selectionchange. A mouse drag is one from its press.
    const at = (/** @type {Node | null} */ n, /** @type {number} */ o) => sel.anchorNode === n && sel.anchorOffset === o;
    const goesOn = !prev.collapsed && (at(prev.anchorNode, prev.anchorOffset) || at(prev.focusNode, prev.focusOffset));
    const handleDrag = pointer !== 'mouse' && goesOn && now() - menuAt > 150;
    if (!handleDrag && !mouseDown) return;
    if (!dragging || col !== c) { col = c; knownTop = c.scrollTop; }
    setDragging(true);
    // The browser scrolled the column far, in one go, to show an end it put somewhere else: undo it.
    if (Math.abs(c.scrollTop - knownTop) > c.clientHeight * 0.6) c.scrollTop = knownTop;
    knownTop = c.scrollTop;
    scrolled = 0;
    const e = readingEdges(c);
    const lh = lineHeightOf(c);
    const box = caretBox(doc, sel.focusNode, sel.focusOffset);
    const inCol = c.contains(sel.focusNode) && !(sel.focusNode.parentElement && sel.focusNode.parentElement.closest(OFF_PAGE));
    const vh = win.innerHeight;
    // A finger is on the screen, so an end the browser put far past the reading text's edges (more than a few
    // lines under the top bar, or off the bottom of the screen) was put there by its document-order fallback.
    const far = Math.max(3 * lh, 120);
    const gone = !inCol || !box || box.y < e.top - far || box.y > vh + far;
    // Which way was it dragged: the end is after the anchor (down) or before it (up).
    let dir = 1;
    if (gone) {
      try {
        const r = doc.createRange();
        r.setStart(/** @type {Node} */ (last.anchorNode), last.anchorOffset);
        dir = r.comparePoint(sel.focusNode, sel.focusOffset) < 0 ? -1 : 1;
      } catch (_e) { /* keep down */ }
    }
    if (mouseDown) {
      // The pointer tells where a mouse is (onPointerMove), and a mouse drag survives an end set from here: one the
      // browser put off the column's text goes onto the text at the edge it went past at once.
      if (gone) { const back = caretNear(c, dir > 0 ? e.bottom : e.top, finger.x); if (back) setEnd(sel, back); }
      return;
    }
    lost = gone;
    if (gone) finger = { x: finger.at > -Infinity ? finger.x : (e.left + e.right) / 2, y: dir > 0 ? e.bottom : e.top, at: now() };
    else if (box) finger = { x: box.x, y: box.y, at: now() };
    armLease();
    if (edgeScrollSpeed({ y: finger.y, top: e.top, bottom: e.bottom })) {
      if (!raf) raf = frame(tick);
    } else {
      stopScroll();
    }
  };

  // A scroll of the column the drag did not make, far in one go: the browser showing an end it put somewhere
  // else. Put it back before it paints.
  // A mouse drag's column moves only by tick() and the wheel: the browser's own autoscroll is undone.
  const onScroll = (/** @type {Event} */ ev) => {
    if (!dragging || !col || ev.target !== col) return;
    if (mouseDown) {
      if (now() - wheelAt < 250) knownTop = col.scrollTop;
      else if (col.scrollTop !== knownTop) col.scrollTop = knownTop;
      return;
    }
    if (Math.abs(col.scrollTop - knownTop) > col.clientHeight * 0.6) col.scrollTop = knownTop;
    else knownTop = col.scrollTop;
  };
  const onPointerMove = (/** @type {PointerEvent} */ e) => {
    if (!mouseDown || !col) return;
    finger = { x: e.clientX, y: e.clientY, at: now() };
    const ed = readingEdges(col);
    if (edgeScrollSpeed({ y: finger.y, top: ed.top, bottom: ed.bottom })) { if (!raf) raf = frame(tick); }
    else stopScroll();
  };
  const onWheel = () => { wheelAt = now(); };
  const onContextMenu = () => {
    menuAt = now();
    if (pointer === 'mouse' || !dragging) return;
    // The lift after a handle drag: the drag is over, so the end may be set now.
    pinEnd();
    endDrag();
  };
  const onPointerDown = (/** @type {PointerEvent} */ e) => {
    pointer = e.pointerType || 'mouse';
    if (dragging) endDrag();          // a new touch: no lift was heard, and the drag is over
    if (pointer === 'mouse' && e.button === 0) {
      const c = liveColumnOf(/** @type {Node} */ (e.target));
      mouseDown = !!c;
      if (c) { col = c; knownTop = c.scrollTop; finger = { x: e.clientX, y: e.clientY, at: now() }; setDragging(true); }
    }
  };
  const onPointerUp = () => {
    if (!mouseDown) return;
    mouseDown = false;
    pinEnd();
    endDrag();
  };
  const onKey = () => { keyAt = now(); };

  doc.addEventListener('selectionchange', onSelectionChange);
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  doc.addEventListener('contextmenu', onContextMenu, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  doc.addEventListener('pointerup', onPointerUp, true);
  doc.addEventListener('pointercancel', onPointerUp, true);
  doc.addEventListener('wheel', onWheel, { capture: true, passive: true });
  doc.addEventListener('keydown', onKey, true);
  return () => {
    endDrag();
    doc.removeEventListener('selectionchange', onSelectionChange);
    doc.removeEventListener('scroll', onScroll, true);
    doc.removeEventListener('contextmenu', onContextMenu, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerUp, true);
    doc.removeEventListener('pointercancel', onPointerUp, true);
    doc.removeEventListener('wheel', onWheel, true);
    doc.removeEventListener('keydown', onKey, true);
  };
}
