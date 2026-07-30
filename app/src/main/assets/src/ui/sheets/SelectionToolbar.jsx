/* ═══════════════════════════════════════════════════════════════════════
   SelectionToolbar — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';

function hlDisplayText(container, tcText, start, end) {
  if (!container) return tcText.slice(start, end);
  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  var off = 0, parts = [], prevBlock = null;
  while (walker.nextNode()) {
    var n = walker.currentNode;
    var nLen = n.textContent.length;
    var nEnd = off + nLen;
    if (nEnd > start && off < end) {
      var block = n.parentElement;
      while (block && block !== container && block.tagName !== 'DIV' && block.tagName !== 'P') block = block.parentElement;
      if (prevBlock && block !== prevBlock) parts.push('\n');
      prevBlock = block;
      parts.push(n.textContent.slice(Math.max(0, start - off), Math.min(nLen, end - off)));
    }
    off = nEnd;
  }
  return parts.join('') || tcText.slice(start, end);
}

/** Nearest scrollable ancestor of `node` — the reading screen's .screen-scroll
    in practice, but derived structurally so picker screens and future layouts
    work too. Returns null when nothing above the node actually scrolls.
    @param {Node|null} node */
function findScrollParent(node) {

  let el = node && node.nodeType === 3 ? /** @type {Text} */ (node).parentElement : /** @type {Element|null} */ (node);
  while (el && el !== document.body && el !== document.documentElement) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
    }
    el = el.parentElement;
  }
  return null;
}


/** Decide where the toolbar goes relative to the current selection. The
    returned `y` is the toolbar's BOTTOM edge (the element renders with
    translateY(-100%), hanging upward from pos.y); `scrollUp` is how many px
    the reading container should scroll up (scrollTop -= scrollUp) BEFORE the
    toolbar shows, sliding the selection down to make room.

    Placement policy (the Android near-top fix):
      1. Prefer ABOVE the selection with a two-line gap, so the selected text
         and its native drag handles stay visible and grabbable.
      2. No room under the top-nav? Auto-scroll the container up exactly the
         deficit — the selection slides down and the toolbar still sits two
         lines above it.
      3. Container can't scroll that far (selection at the very top of the
         document — nothing above to reveal)? Sit fully BELOW the selection
         with the same two-line gap instead. Never on top of it.
      4. Viewport-spanning selection (nothing fits anywhere): clamp under the
         nav as before — the selection's end handle in the lower half of the
         screen stays reachable.
    @param {{ selTop: number, selBottom: number, toolbarH: number,
              navBottom: number, viewportH: number, lineH: number,
              maxScrollUp: number }} a
    @returns {{ y: number, scrollUp: number }} */
export function computeToolbarPlacement({ selTop, selBottom, toolbarH, navBottom, viewportH, lineH, maxScrollUp }) {
  const margin = 8;
  const gap = Math.min(Math.max(2 * lineH, 40), 120); // "two lines", sane-bounded
  const minY = navBottom + margin + toolbarH; // lowest y whose toolbar TOP still clears the nav
  const above = selTop - gap;
  if (above >= minY) return { y: above, scrollUp: 0 };
  const deficit = minY - above;
  // ASSIST-SCROLL GUARD (2026-07-29). The assist exists for a selection sitting
  // JUST under the nav: scroll up a little, and the toolbar fits above it. It
  // must never fire for a selection whose START is already off-screen above —
  // there is no "room above" to reveal, and the scroll would be enormous.
  // Measured before this guard: extending a selection down past the viewport
  // (now easy, with real scrolling + edge auto-scroll) left selTop ~-1900, so
  // the release yanked the reader back ~2000px. The selection must also still
  // be the thing on screen: cap the assist at one toolbar-plus-gap of travel.
  const assistable = selTop >= navBottom && deficit <= toolbarH + gap;
  if (assistable && deficit <= maxScrollUp) return { y: minY, scrollUp: deficit };
  const below = selBottom + gap + toolbarH;
  if (below <= viewportH - margin) return { y: below, scrollUp: 0 };
  return { y: minY, scrollUp: 0 };
}

/** Which way (if any) the reading container should auto-scroll while a native
    selection handle is dragged. The dragged (focus) edge sitting inside the
    `band` at either end of the scroller's box means the user is reaching past
    the viewport, so the container steps toward that edge — the standard
    e-reader gesture, and the replacement for the retired ▲/▼ nudge buttons.

    Extracted as a pure helper (same discipline as computeToolbarPlacement) so
    the decision is pinned by test without jsdom layout: jsdom does no layout,
    so an effect that reads live rects can't be exercised faithfully.

    @param {{ focusTop: number, focusBottom: number, boxTop: number,
              boxBottom: number, band: number }} a
    @returns {-1|0|1} -1 = scroll up, 1 = scroll down, 0 = leave it alone */
export function computeEdgeAutoScroll({ focusTop, focusBottom, boxTop, boxBottom, band }) {
  if (!(boxBottom > boxTop)) return 0;              // degenerate box — never scroll
  // A band taller than half the box would arm both ends at once; clamp so the
  // middle of a short container is always a no-scroll zone.
  const b = Math.max(0, Math.min(band, (boxBottom - boxTop) / 2));
  if (focusTop < boxTop + b) return -1;
  if (focusBottom > boxBottom - b) return 1;
  return 0;
}

export function SelectionToolbar({ onLinkRequest, onNoteRequest, onBookmarkRequest }) {
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [selInfo, setSelInfo] = React.useState(null); // { hlKey, start, end, text, copyText, existingHl, multiVerse }
  const [activeStyle, setActiveStyle] = React.useState('highlight'); // 'highlight' | 'underline'
  // Confirm-strip mode for the ✕ remove button. Resets whenever the
  // selection changes so a fresh selection always lands on the normal
  // toolbar (not an inherited mid-confirm state from a prior selection).
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  // ANN2: how many of the overlapping highlights carry a NoteStore body — computed
  // when the ✕ is pressed — so the confirm can disclose that removing also deletes
  // the note text (removeHighlight calls NoteStore.remove per group).
  const [removeNoteCount, setRemoveNoteCount] = React.useState(0);
  React.useEffect(() => { setConfirmingRemove(false); }, [selInfo]);

  // W1.5(a.2) — register with the central modal registry while the toolbar
  // is visible so Escape dismisses the selection (via __hideSelectionToolbar's
  // setVisible + clear-selection routine) instead of firing back-nav. The
  // toolbar is ALWAYS MOUNTED (the AppShellSheets parent doesn't gate it),
  // so the registration is gated on `visible` state instead.
  useModalRegistry({
    id: 'selection-toolbar',
    dismiss: () => {
      setVisible(false);
      try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
    },
    active: visible,
  });
  const toolbarRef = React.useRef(null);
  const suppressRef = React.useRef(false);

  // Compute character offset of a node+offset within a data-hl-key container's text
  const computeOffset = React.useCallback((container, node, offset) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let charPos = 0;
    while (walker.nextNode()) {
      if (walker.currentNode === node) return charPos + offset;
      charPos += walker.currentNode.textContent.length;
    }
    return charPos + offset;
  }, []);

  // Find the data-hl-key container for a DOM node
  const findHlContainer = React.useCallback((node) => {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && !el.dataset.hlKey) el = el.parentElement;
    return el;
  }, []);

  // Track whether the pointer/finger is currently down (drag in progress)
  const dragRef = React.useRef(false);
  // Debounce timer for selectionchange → show (handle-drag scenario)
  const selChangeTimerRef = React.useRef(null);
  // Track tap target and position for tap-on-mark detection
  const tapTargetRef = React.useRef(null);
  const tapPosRef = React.useRef({ x: 0, y: 0 });

  // Expose a hide bridge so the App-level navigation effect can dismiss
  // the toolbar when the user leaves the screen — otherwise the
  // always-mounted toolbar would persist with a stale selInfo anchored
  // to a hlKey that no longer exists.
  React.useEffect(() => {
    window.__hideSelectionToolbar = () => {
      setVisible(false);
      try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (_e) { /* DOM access — element may not exist or API unsupported */ }
    };
    return () => { window.__hideSelectionToolbar = null; };
  }, []);

  // Authoritative placement pass. computeAndShow seeds pos from an ESTIMATE
  // (the toolbar hasn't rendered yet, so its real size is unknown); this
  // layout effect re-derives the final placement BEFORE PAINT once the
  // rendered width/height are measurable:
  //   x — clamp so no part runs off either edge (the old bug was a selection
  //       near the right margin leaving the far buttons untappable);
  //   y — computeToolbarPlacement (see its docstring): above-with-gap,
  //       else auto-scroll the reading container up to make room, else flip
  //       fully below. Replaces the old blind Math.max(p.y, navBottom+h)
  //       clamp, which shoved a near-top toolbar DOWN ONTO the selection —
  //       covering the text and the native drag handles (owner-reported on
  //       Android). The scroll (scrollTop -= scrollUp) is synchronous here,
  //       so content and toolbar land together in one frame.
  // SCROLL-FOLLOW (2026-07-29): extracted from the layout effect so the SAME
  // placement math runs both on commit AND on every scroll frame while the
  // toolbar is up. `allowAssistScroll` is the one difference: the initial
  // placement may scroll the container up to make room (the near-top assist),
  // but a scroll-driven re-place must NEVER move the container — that would
  // fight the user's own finger.
  const placeFromSelection = React.useCallback((allowAssistScroll) => {
    const el = toolbarRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return; // jsdom / not yet laid out — nothing to place against
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - w - margin);
    const navEl = document.querySelector('.top-nav');
    const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 60;
    let placed = null;
    let selX = null;
    try {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          const container = findHlContainer(range.startContainer);
          let lineH = 28;
          if (container) {
            const lh = parseFloat(getComputedStyle(container).lineHeight);
            if (lh > 0 && isFinite(lh)) lineH = lh;
          }
          const scroller = findScrollParent(container || range.startContainer);
          placed = computeToolbarPlacement({
            selTop: rect.top,
            selBottom: rect.bottom,
            toolbarH: h,
            navBottom,
            viewportH: window.innerHeight,
            lineH,
            maxScrollUp: allowAssistScroll && scroller ? scroller.scrollTop : 0,
          });
          if (allowAssistScroll && placed.scrollUp > 0 && scroller) scroller.scrollTop -= placed.scrollUp;
          // Track the selection horizontally too, so a scroll-follow re-place
          // stays centred on the (possibly re-wrapped) selection.
          selX = rect.left + rect.width / 2 - w / 2;
        }
      }
    } catch (_e) { /* selection gone mid-frame — fall through to the plain clamp */ }
    setPos((p) => {
      const baseX = selX == null ? p.x : selX;
      const x = Math.min(Math.max(margin, baseX), maxLeft);
      // No live rect (selection cleared between commit and effect): keep the
      // old defensive clamp so the toolbar at least never overlaps the nav.
      const y = placed ? placed.y : Math.max(p.y, navBottom + h + margin);
      return (x === p.x && y === p.y) ? p : { x, y };
    });
  }, [findHlContainer]);

  React.useLayoutEffect(() => {
    if (!visible) return;
    placeFromSelection(true);
  }, [visible, selInfo, placeFromSelection]);

  // ── Scroll-follow + edge auto-scroll (2026-07-29, owner-reported) ────────
  // The owner: "once you open highlight it locks scroll ... it'd be better if
  // you could just scroll normally." VERIFIED ON-DEVICE (vot_api34, CDP): the
  // native selection layer does NOT block scrolling — an identical synthetic
  // drag scrolled 192px both with and without a live selection, and the
  // selection survived. So P1-15's premise ("the page can't scroll") was
  // wrong. What actually made scrolling feel broken:
  //   (a) the toolbar was placed ONCE and never moved — measured: content
  //       scrolled 200px, toolbar moved 0px. A stranded 196px-tall pane
  //       hovering over unrelated text reads as "the page is stuck", and it
  //       covers the very lines you were trying to reach (a drag started on
  //       the pane hits the pane, not the scroller);
  //   (b) extending a selection PAST the viewport had no natural gesture, so
  //       ▲/▼ nudge buttons were added instead.
  // Fixes: the toolbar now re-places from the live selection rect on every
  // scroll frame (rAF-coalesced), and dragging a selection handle into the
  // top/bottom edge band auto-scrolls the container — the standard e-reader
  // gesture. The ▲/▼ row is retired.
  React.useEffect(() => {
    if (!visible) return undefined;
    const sel = window.getSelection();
    let scroller = null;
    try {
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        scroller = findScrollParent(findHlContainer(r.startContainer) || r.startContainer);
      }
    } catch (_e) { /* selection gone — nothing to follow */ }
    if (!scroller) return undefined;

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;                       // coalesce to one re-place per frame
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const s = window.getSelection();
        if (!s || s.isCollapsed || s.rangeCount === 0) return;
        placeFromSelection(false);             // never move the container here
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, selInfo, placeFromSelection, findHlContainer]);

  // EDGE AUTO-SCROLL while a native selection handle is being dragged. The
  // handle drag fires `selectionchange` continuously, so no touch tracking is
  // needed: whenever the selection's moving edge sits inside the edge band we
  // step the container toward it on an interval. The band is RE-PROBED ON
  // EVERY TICK, not only on selectionchange — after the handle is released
  // inside the band no further events arrive (Android swallows the
  // post-selection pointerup/touchend, and scrolling alone doesn't change the
  // selection), so an event-only stop would run away to the container end.
  // Per-tick probing stops the moment the edge leaves the band (a released
  // edge glides at most BAND px before scrolling out of it), the selection
  // collapses, or the toolbar hides, and re-reads direction each step so a
  // focus jump straight from one band to the other can't keep a stale
  // direction. Step size is small (one line-ish) so the text glides.
  React.useEffect(() => {
    if (!visible) return undefined;
    const BAND = 90;      // px from the scroller's edge that arms auto-scroll
    const STEP = 24;      // px per tick
    const TICK = 16;      // ms
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    // Where does the selection's MOVING edge sit? { dir, scroller } while the
    // edge is inside a band, null when auto-scroll should not run.
    const probe = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      let scroller = null;
      let focusRect = null;
      try {
        const range = sel.getRangeAt(0);
        scroller = findScrollParent(findHlContainer(range.startContainer) || range.startContainer);
        // The MOVING edge is the focus node — collapse a clone onto it so the
        // band test tracks the handle the user is actually dragging, not the
        // whole (possibly viewport-spanning) selection.
        const pr = document.createRange();
        pr.setStart(sel.focusNode, sel.focusOffset);
        pr.setEnd(sel.focusNode, sel.focusOffset);
        const rects = pr.getClientRects();
        focusRect = (rects && rects.length) ? rects[0] : range.getBoundingClientRect();
      } catch (_e) { return null; }
      if (!scroller || !focusRect) return null;
      const box = scroller.getBoundingClientRect();
      const dir = computeEdgeAutoScroll({
        focusTop: focusRect.top,
        focusBottom: focusRect.bottom,
        boxTop: box.top,
        boxBottom: box.bottom,
        band: BAND,
      });
      return dir === 0 ? null : { dir, scroller };
    };

    const tick = () => {
      const hit = probe();
      if (!hit) { stop(); return; }
      const before = hit.scroller.scrollTop;
      hit.scroller.scrollTop += hit.dir * STEP;   // assignment clamps at both ends
      if (hit.scroller.scrollTop === before) stop();  // hit an end — nothing more to give
    };

    const evaluate = () => {
      if (!probe()) { stop(); return; }
      if (!timer) timer = setInterval(tick, TICK);
    };

    document.addEventListener('selectionchange', evaluate);
    return () => { stop(); document.removeEventListener('selectionchange', evaluate); };
  }, [visible, findHlContainer]);

  React.useEffect(() => {
    // Compute and show the toolbar from the current selection
    const computeAndShow = () => {
      if (suppressRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setVisible(false);
        return;
      }
      const range = sel.getRangeAt(0);
      // Strip .fn-ref bubbles, .hl-note-icon elements, and .verse-num labels from
      // the selection text so footnote numbers, note icons, and verse numbers
      // don't bleed into notes/search/bookmarks. The verse number also lives
      // OUTSIDE the [data-hl-key] container, so the annotation range itself
      // can't cover it — a highlight/note/icon applies only to the scripture
      // text, never the number, while the menu still raises on the selection.
      const text = (() => {
        try {
          const frag = range.cloneContents();
          frag.querySelectorAll('.fn-ref, .hl-note-icon, .verse-num').forEach(function(el) { el.remove(); });
          return frag.textContent.trim();
        } catch (_e) {
          return sel.toString().trim();
        }
      })();
      if (!text) { setVisible(false); return; }
      // Copy-specific text: keep verse-number spans so pasting preserves their
      // inline position. Everything else (footnote bubbles, note icons) still
      // stripped. Only the Copy action uses this; all other actions use `text`.
      const selCopyText = (() => {
        try {
          const frag = range.cloneContents();
          frag.querySelectorAll('.fn-ref, .hl-note-icon').forEach(function(el) { el.remove(); });
          return frag.textContent.trim();
        } catch (_e) {
          return text;
        }
      })();
      const container = findHlContainer(range.startContainer);
      const endContainer = findHlContainer(range.endContainer);
      const isMultiVerse = !container || !endContainer || endContainer !== container;
      if (isMultiVerse) {
        // Cross-container selection: find all [data-hl-key] containers that overlap
        const allHlContainers = Array.from(document.querySelectorAll('[data-hl-key]'))
          .filter(function(c) { return range.intersectsNode(c); });
        if (allHlContainers.length === 0) { setVisible(false); return; }
        setSelInfo({ hlKey: null, start: 0, end: 0, text, copyText: selCopyText, existingHl: null, multiVerse: true, multiContainers: allHlContainers });
      } else {
        const hlKey = container.dataset.hlKey;
        const start = computeOffset(container, range.startContainer, range.startOffset);
        const end = computeOffset(container, range.endContainer, range.endOffset);
        if (start >= end) { setVisible(false); return; }
        const existing = HighlightStore.get(hlKey).find(h => h.start <= start && h.end >= end);
        setSelInfo({ hlKey, start, end, text, copyText: selCopyText, existingHl: existing || null, multiVerse: false });
      }
      const rect = range.getBoundingClientRect();
      const toolbarW = 320;
      let x = rect.left + rect.width / 2 - toolbarW / 2;
      x = Math.max(8, Math.min(x, window.innerWidth - toolbarW - 8));
      // Estimate only — the placement layout effect derives the real position
      // (incl. the near-top scroll-assist / below-flip) before paint, once the
      // toolbar's true height is measurable. The old `y = rect.bottom + 10`
      // near-top flip was wrong: with translateY(-100%) that put the toolbar's
      // BOTTOM just under the selection, i.e. its body on top of the text.
      const y = rect.top - 10;
      setPos({ x, y });
      setVisible(true);
    };

    // Selection-change listener: hide on collapse; debounce-show after handle-drag
    const onSelectionChange = () => {
      if (suppressRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        if (selChangeTimerRef.current) { clearTimeout(selChangeTimerRef.current); selChangeTimerRef.current = null; }
        // Tiny delay so toolbar tap can fire before hiding
        setTimeout(() => {
          if (!suppressRef.current) {
            const s = window.getSelection();
            if (!s || s.isCollapsed) setVisible(false);
          }
        }, 150);
      } else if (!dragRef.current) {
        // Non-empty selection and pointer is already up: this is a handle-drag
        // adjustment. Debounce so we wait for the user to finish dragging.
        if (selChangeTimerRef.current) clearTimeout(selChangeTimerRef.current);
        selChangeTimerRef.current = setTimeout(function() {
          selChangeTimerRef.current = null;
          computeAndShow();
        }, 350);
      }
    };

    // Shared tap/click routing for an EXISTING annotation: a note icon, a note
    // mark (-> open note / multi-note popover), or a highlight/underline mark
    // (-> the Remove/Color/Note action chip). Returns true if it handled the
    // target. Used by the brief-tap (pointerup) and click (onClick / Android
    // native bridge) paths.
    const routeAnnotationTap = (rawTarget, x, y) => {
      const el = rawTarget && rawTarget.nodeType === 3 ? rawTarget.parentElement : rawTarget;
      if (!el || !el.closest) return false;
      // Note icon at end of a note span (or merged badge -> multi-note popover).
      const iconEl = el.closest('.hl-note-icon');
      if (iconEl) {
        const gids = (iconEl.getAttribute('data-group-ids') || iconEl.getAttribute('data-group-id') || '').split(',').filter(Boolean);
        if (gids.length > 1 && window.__showMultiNote) { window.__showMultiNote(gids, x, y); return true; }
        if (gids.length === 1 && window.__openNote) { window.__openNote(gids[0]); return true; }
      }
      const markEl = el.closest('mark.hl-mark');
      if (!markEl) return false;
      const groupId = markEl.getAttribute('data-group-id') || markEl.getAttribute('data-hl-id');
      const containerEl = markEl.closest('[data-hl-key]');
      const hlKey = containerEl ? containerEl.getAttribute('data-hl-key') : null;
      if (!groupId || !hlKey) return false;
      // Note-ness is a NoteStore entry now, not the kind. A mark whose group
      // has a note opens the note sheet; a highlight/underline/squiggle WITHOUT
      // a note falls through to the action chip below.
      const isNote = typeof NoteStore !== 'undefined' && !!NoteStore.get(groupId);
      if (isNote) {
        // Look for OTHER overlapping note marks at this exact point.
        const overlapGids = new Set([groupId]);
        try {
          document.elementsFromPoint(x, y).forEach(function(n) {
            if (n.matches && n.matches('mark.hl-note[data-group-id]')) {
              const g = n.getAttribute('data-group-id');
              if (g && (typeof NoteStore === 'undefined' || NoteStore.get(g))) overlapGids.add(g);
            }
          });
        } catch (_e) { /* DOM access - element may not exist or API unsupported */ }
        if (overlapGids.size > 1 && window.__showMultiNote) { window.__showMultiNote([...overlapGids], x, y); return true; }
        if (window.__openNote) { window.__openNote(groupId); return true; }
      }
      // Chip opens at its default position (the tap / long-press point). A tap
      // creates no native selection handles, and the long-press path collapses
      // the selection before this fires, so no downward offset is needed.
      if (window.__showAnnChip) { window.__showAnnChip(x, y, hlKey, groupId); return true; }
      return false;
    };

    // Pointer/touch lifecycle: track drag state and commit on release
    let pointerDownTime = 0;
    const onPointerDown = (e) => {
      if (toolbarRef.current && toolbarRef.current.contains(e.target)) return;
      tapTargetRef.current = e.target;
      tapPosRef.current = { x: e.clientX || 0, y: e.clientY || 0 };
      pointerDownTime = performance.now();
      dragRef.current = true;
      setVisible(false);
    };
    const onPointerUp = (e) => {
      if (!dragRef.current) return;
      dragRef.current = false;
      const sel = window.getSelection();
      const isCollapsed = !sel || sel.isCollapsed;
      const tapTarget = tapTargetRef.current;
      const pos = (e && e.clientX) ? { x: e.clientX, y: e.clientY } : tapPosRef.current;
      // Only route annotation taps from brief touches (< 300 ms). Longer holds
      // are scrolls or long-presses; both should be ignored here. Also skip
      // if ScreenLayout already flagged this lift as a scroll.
      const isBriefTap = (performance.now() - pointerDownTime) < 300;
      if (isCollapsed && isBriefTap && !window.__scrollLiftPending && tapTarget && routeAnnotationTap(tapTarget, pos.x, pos.y)) return;
      setTimeout(computeAndShow, 150);
    };

    // Tap-to-open the action chip — the path differs by platform because a tap
    // on a highlight <mark> fires different events on desktop vs Android:
    //   - DESKTOP (mouse): `click` fires reliably on the mark, so onClick
    //     routes it.
    //   - ANDROID WebView: a tap on selectable <mark> text is consumed by the
    //     native text-selection machinery, which emits NO `click` and NO
    //     bubbling `touchend` (only a long-press, via the selection ActionMode,
    //     used to reach the chip — what the user found annoying). So the native
    //     side (MainActivity's GestureDetector) observes the tap WITHOUT
    //     consuming it and calls window.__nativeTapAnnotation(cssX, cssY); we
    //     hit-test that point and route the mark. Note/bookmark/link ICONS are
    //     non-selectable, so they fire `click` on Android too and self-route —
    //     the native hit-test skips them so they don't double-fire.
    const onClick = (e) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;  // mid-selection -> leave it to the toolbar
      routeAnnotationTap(e.target, e.clientX || 0, e.clientY || 0);
    };

    // Long-press (Android) / right-click (desktop). This is RAISE-ONLY: it
    // NEVER routes an annotation tap (opening a chip/note on long-press was the
    // behavior the user asked us to drop — our items are tap/click only). The
    // one thing a long-press must still do is raise the selection toolbar when
    // it produced a TEXT SELECTION: on Android the native selection machinery
    // swallows the post-selection pointerup/touchend, so `contextmenu` is the
    // only reliable signal that a fresh selection is ready to act on. A bare
    // long-press with nothing selected (collapsed selection), or a selection
    // outside reading text, is left alone — no toolbar, native menu intact.
    const onContextMenu = (e) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      // Check both endpoints: a selection that starts/ends on a verse-number
      // span (outside any [data-hl-key]) but reaches into reading text still
      // has one endpoint in annotatable content — suppress the native menu.
      const r = sel.getRangeAt(0);
      if (!findHlContainer(r.startContainer) && !findHlContainer(r.endContainer)) return;
      e.preventDefault();
      computeAndShow();
    };
    // Android single-tap bridge (see onSingleTapUp in MainActivity.kt). Coords
    // are CSS pixels. elementFromPoint hit-tests the tap: an icon already fires
    // `click` natively (skip it); otherwise route the highlight/underline/note
    // MARK to the chip — the case the WebView's selection layer swallows.
    window.__nativeTapAnnotation = (x, y) => {
      try {
        if (window.__scrollLiftPending) return;  // finger just lifted from a scroll — not a tap
        const el = document.elementFromPoint(x, y);
        if (!el || !el.closest) return;
        if (el.closest('.hl-note-icon')) return;  // icon → its own click handler routes it
        const markEl = el.closest('mark.hl-mark');
        if (markEl) routeAnnotationTap(markEl, x, y);
      } catch (_e) { /* hit-test best-effort; DOM may be mid-update */ }
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('touchend', onPointerUp);
    document.addEventListener('click', onClick);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('touchend', onPointerUp);
      document.removeEventListener('click', onClick);
      document.removeEventListener('contextmenu', onContextMenu);
      window.__nativeTapAnnotation = null;
    };
  }, [computeOffset, findHlContainer]);

  const applyHighlight = React.useCallback((color) => {
    if (!selInfo) return;
    if (typeof StorageHealth !== 'undefined' && StorageHealth.checkFirstDataCreation().shouldBlock) return;
    suppressRef.current = true;
    const kind = activeStyle === 'underline' ? 'underline'
      : activeStyle === 'squiggle' ? 'squiggle' : 'highlight';
    if (selInfo.multiVerse) {
      // Multi-container: all spans share ONE groupId so they act as one annotation
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const containers = selInfo.multiContainers ||
        (range ? Array.from(document.querySelectorAll('[data-hl-key]')).filter(function(c) { return range.intersectsNode(c); }) : []);
      const groupId = hlId();
      // Recolor semantics: only remove groups whose range EXACTLY matches
      // the new selection in this container — partial overlap is preserved
      // so users can layer highlights/underlines/notes.
      const groupsToRemove = new Set();
      containers.forEach(function(container) {
        var hlKey = container.dataset.hlKey;
        var containerLen = container.textContent.length;
        var start = range && container.contains(range.startContainer)
          ? computeOffset(container, range.startContainer, range.startOffset) : 0;
        var end = range && container.contains(range.endContainer)
          ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
        AnnotationStore.get(hlKey).forEach(function(h) {
          if (h.start === start && h.end === end && h.groupId) groupsToRemove.add(h.groupId);
        });
      });
      groupsToRemove.forEach(function(gid) { AnnotationStore.removeGroup(gid); NoteStore.remove(gid); });
      // Now add the new group — snap each container's range to word boundaries
      containers.forEach(function(container) {
        var hlKey = container.dataset.hlKey;
        var containerText = container.textContent;
        var containerLen = containerText.length;
        var rawStart = range && container.contains(range.startContainer)
          ? computeOffset(container, range.startContainer, range.startOffset) : 0;
        var rawEnd = range && container.contains(range.endContainer)
          ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
        var snap = snapSelectionRange(container, containerText, rawStart, rawEnd);
        if (snap.start >= snap.end) return;
        AnnotationStore.add(hlKey, {
          id: hlId(), groupId: groupId, kind: kind,
          start: snap.start, end: snap.end, color: color,
          text: hlDisplayText(container, containerText, snap.start, snap.end),
          created: Date.now()
        });
      });
    } else {
      // Single container — only remove EXACT-RANGE matches (recolor flow).
      // Partial overlap stacks: the user can layer multiple highlights,
      // underlines, and notes on the same passage. Range snaps to whole-word
      // boundaries first so the visual mark never lands mid-word.
      const container = document.querySelector('[data-hl-key="' + selInfo.hlKey.replace(/"/g, '\\"') + '"]');
      const containerText = container ? container.textContent : selInfo.text;
      const snap = snapSelectionRange(container, containerText, selInfo.start, selInfo.end);
      const existing = AnnotationStore.get(selInfo.hlKey);
      const groupsToRemove = new Set();
      existing.forEach(h => {
        if (h.start === snap.start && h.end === snap.end && h.groupId) groupsToRemove.add(h.groupId);
      });
      groupsToRemove.forEach(gid => { AnnotationStore.removeGroup(gid); NoteStore.remove(gid); });
      const id = hlId();
      AnnotationStore.add(selInfo.hlKey, {
        id: id, groupId: id, kind: kind,
        start: snap.start, end: snap.end,
        color: color, text: hlDisplayText(container, containerText, snap.start, snap.end),
        created: Date.now()
      });
    }
    window.getSelection().removeAllRanges();
    setVisible(false);
    setTimeout(() => { suppressRef.current = false; }, 300);
  }, [selInfo, activeStyle, computeOffset]);

  // The groupIds whose annotation overlaps the current selection, across every
  // touched container. Shared by removeHighlight (what to delete) and the remove
  // confirm's note-count (ANN2 disclosure) so the two can't drift.
  const selectionGroups = React.useCallback(() => {
    /** @type {Set<string>} */
    const groups = new Set();
    if (!selInfo) return groups;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const containers = selInfo.multiVerse
      ? (selInfo.multiContainers ||
          (range ? Array.from(document.querySelectorAll('[data-hl-key]')).filter(c => range.intersectsNode(c)) : []))
      : [document.querySelector('[data-hl-key="' + (selInfo.hlKey || '').replace(/"/g, '\\"') + '"]')].filter(Boolean);
    containers.forEach(function(container) {
      if (!container) return;
      var hlKey = container.dataset.hlKey;
      var containerLen = container.textContent.length;
      var start = selInfo.multiVerse
        ? (range && container.contains(range.startContainer) ? computeOffset(container, range.startContainer, range.startOffset) : 0)
        : selInfo.start;
      var end = selInfo.multiVerse
        ? (range && container.contains(range.endContainer) ? computeOffset(container, range.endContainer, range.endOffset) : containerLen)
        : selInfo.end;
      AnnotationStore.get(hlKey).forEach(function(h) {
        if (h.start < end && h.end > start && h.groupId) groups.add(h.groupId);
      });
    });
    return groups;
  }, [selInfo, computeOffset]);

  const removeHighlight = React.useCallback(() => {
    if (!selInfo) return;
    suppressRef.current = true;
    selectionGroups().forEach(function(gid) {
      AnnotationStore.removeGroup(gid);
      NoteStore.remove(gid);   // ANN2: the confirm now discloses this note deletion
    });
    window.getSelection().removeAllRanges();
    setVisible(false);
    setTimeout(() => { suppressRef.current = false; }, 300);
  }, [selInfo, selectionGroups]);

  const copyText = React.useCallback(() => {
    if (!selInfo) return;
    navigator.clipboard.writeText(selInfo.copyText || selInfo.text).catch(() => {});
    window.getSelection().removeAllRanges();
    setVisible(false);
  }, [selInfo]);

  const handleLink = React.useCallback(() => {
    if (!selInfo) return;
    window.getSelection().removeAllRanges();
    setVisible(false);
    // For multi-container selections anchor the link to the first hl-key container
    var linkInfo = selInfo;
    if (selInfo.multiVerse && selInfo.multiContainers && selInfo.multiContainers.length > 0) {
      linkInfo = Object.assign({}, selInfo, { hlKey: selInfo.multiContainers[0].dataset.hlKey });
    }
    onLinkRequest && onLinkRequest(linkInfo);
  }, [selInfo, onLinkRequest]);

  const handleNote = React.useCallback(() => {
    if (!selInfo) return;
    if (typeof StorageHealth !== 'undefined' && StorageHealth.checkFirstDataCreation().shouldBlock) return;
    // New notes use the last-used note default (style + color); the cold-start
    // default is a BLANK highlight (invisible mark + just the icon — a note
    // with no visual overhead). Note-ness is a NoteStore entry, NOT the kind,
    // so we never stamp kind:'note' anymore — a note is a highlight/underline/
    // squiggle (or blank) that ALSO has a NoteStore record.
    const def = (typeof NoteDefaultStore !== 'undefined')
      ? NoteDefaultStore.get() : { style: 'highlight', color: 'blank' };
    const _hasNote = (gid) => typeof NoteStore !== 'undefined' && !!NoteStore.get(gid);
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    let groupId;
    // True when THIS flow creates the annotation group (vs attaching note-ness
    // to an existing mark). The NoteSheet needs it so discarding a never-saved
    // note removes exactly what this flow created — never a pre-existing mark.
    let createdGroup = false;
    if (selInfo.multiVerse) {
      const containers = selInfo.multiContainers ||
        (range ? Array.from(document.querySelectorAll('[data-hl-key]')).filter(c => range.intersectsNode(c)) : []);
      // Attach to an OVERLAPPING group that doesn't already have a note (keeps
      // its existing style/color); otherwise create a new group at the default.
      let attachTarget = null;
      containers.forEach(function(container) {
        if (attachTarget) return;
        var hlKey = container.dataset.hlKey;
        var containerLen = container.textContent.length;
        var start = range && container.contains(range.startContainer)
          ? computeOffset(container, range.startContainer, range.startOffset) : 0;
        var end = range && container.contains(range.endContainer)
          ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
        AnnotationStore.get(hlKey).forEach(function(h) {
          if (attachTarget) return;
          if (h.start < end && h.end > start && h.groupId && !_hasNote(h.groupId)) {
            attachTarget = h.groupId;
          }
        });
      });
      if (attachTarget) {
        groupId = attachTarget;
      } else {
        groupId = hlId();
        createdGroup = true;
        containers.forEach(function(container) {
          var hlKey = container.dataset.hlKey;
          var containerText = container.textContent;
          var containerLen = containerText.length;
          var rawStart = range && container.contains(range.startContainer)
            ? computeOffset(container, range.startContainer, range.startOffset) : 0;
          var rawEnd = range && container.contains(range.endContainer)
            ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
          var snap = snapSelectionRange(container, containerText, rawStart, rawEnd);
          if (snap.start >= snap.end) return;
          AnnotationStore.add(hlKey, {
            id: hlId(), groupId: groupId, kind: def.style,
            start: snap.start, end: snap.end, color: def.color,
            text: hlDisplayText(container, containerText, snap.start, snap.end),
            created: Date.now()
          });
        });
      }
    } else {
      // Single-container: snap to word boundaries, then attach to any
      // OVERLAPPING covering group that lacks a note; otherwise create new
      // at the default (allowing stacking with existing notes on the range).
      const container = document.querySelector('[data-hl-key="' + selInfo.hlKey.replace(/"/g, '\\"') + '"]');
      const containerText = container ? container.textContent : selInfo.text;
      const snap = snapSelectionRange(container, containerText, selInfo.start, selInfo.end);
      // Empty / whitespace-only / collapsed selection — bail before we create
      // a zero-width annotation (would render as nothing but persist forever).
      if (snap.start >= snap.end) {
        window.getSelection().removeAllRanges();
        setVisible(false);
        return;
      }
      const existing = AnnotationStore.get(selInfo.hlKey).find(h =>
        h.start <= snap.start && h.end >= snap.end && h.groupId && !_hasNote(h.groupId)
      );
      if (existing) {
        groupId = existing.groupId;
      } else {
        const id = hlId();
        groupId = id;
        createdGroup = true;
        AnnotationStore.add(selInfo.hlKey, {
          id: id, groupId: id, kind: def.style,
          start: snap.start, end: snap.end,
          color: def.color, text: hlDisplayText(container, containerText, snap.start, snap.end),
          created: Date.now()
        });
      }
    }
    // Build/refresh the NoteStore record — but only if at least one
    // segment actually exists for this groupId.
    const segs = AnnotationStore.getByGroup(groupId);
    if (segs.length === 0) {
      window.getSelection().removeAllRanges();
      setVisible(false);
      return;
    }
    // Normalize at WRITE time too: ann.text captured before the TreeWalker
    // poetry fix can carry collapsed line joins — don't bake them into a
    // fresh note record.
    const fullText = normalizeExcerptDisplay(segs.map(s => s.ann.text || '').join(' … '));
    const keys = [...new Set(segs.map(s => s.key))];
    const existingNote = NoteStore.get(groupId);
    NoteStore.set(groupId, {
      color: segs[0] ? segs[0].ann.color : def.color,
      fullText, keys,
      body: existingNote ? existingNote.body : ''
    });
    window.getSelection().removeAllRanges();
    setVisible(false);
    onNoteRequest && onNoteRequest(groupId, /*startInEditMode=*/true, /*freshGroup=*/createdGroup);
  }, [selInfo, onNoteRequest, computeOffset]);

  const handleShare = React.useCallback(() => {
    if (!selInfo) return;
    const text = selInfo.text;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    window.getSelection().removeAllRanges();
    setVisible(false);
  }, [selInfo]);

  const handleSearch = React.useCallback(() => {
    if (!selInfo) return;
    const text = selInfo.text;
    window.getSelection().removeAllRanges();
    setVisible(false);
    // Stash query & route to search screen via global bridge
    window.navHandoff.set('pendingSearchQuery', text);
    if (window.__goSearch) window.__goSearch();
  }, [selInfo]);


  const handleBookmark = React.useCallback(() => {
    if (!selInfo) return;
    if (typeof StorageHealth !== 'undefined' && StorageHealth.checkFirstDataCreation().shouldBlock) return;
    // Determine the hlKey: single-container uses selInfo.hlKey;
    // multi-container uses the first container's key.
    var hlKey = selInfo.hlKey;
    if (selInfo.multiVerse && selInfo.multiContainers && selInfo.multiContainers.length > 0) {
      hlKey = selInfo.multiContainers[0].dataset.hlKey;
    }
    if (!hlKey) { window.getSelection().removeAllRanges(); setVisible(false); return; }

    // Snap selection range to word boundaries (single-container only;
    // multi-container bookmarks use the first-container start as a proxy).
    var container = document.querySelector('[data-hl-key="' + hlKey.replace(/"/g, '\\"') + '"]');
    var containerText = container ? container.textContent : (selInfo.text || '');
    var snap = (typeof snapSelectionRange === 'function')
      ? snapSelectionRange(container, containerText, selInfo.start || 0, selInfo.end || 0)
      : { start: selInfo.start || 0, end: selInfo.end || 0 };

    // Derive label from the highlighted text. Two-strategy approach so the
    // label is reliably the user's actual selection across every selection
    // shape:
    //   1. Container slice with word-boundary snap — preferred when we have
    //      the source container and a valid offset range. Keeps the label
    //      tidy when the user's drag ends mid-word.
    //   2. Raw selInfo.text fallback — needed for multi-container
    //      selections (start/end are 0 in that branch) and for the rare case
    //      where the container DOM has unmounted between selection and tap.
    //   3. Source-style fallback ("Bookmark in <Title>") only if both
    //      above produced nothing — defensive last resort.
    var labelText = '';
    if (container && snap.end > snap.start) {
      labelText = containerText.slice(snap.start, snap.end).trim();
    }
    if (!labelText && selInfo.text) {
      labelText = selInfo.text.trim();
    }
    // Truncate very long auto-labels to 120 chars so they read as a short tag
    if (labelText.length > 120) labelText = labelText.slice(0, 117) + '...';
    if (!labelText) {
      // Build a human-readable fallback from the container key kind
      var parts = hlKey.split(':');
      var kind = parts[0];
      if (kind === 'bible' || kind === 'study') {
        labelText = 'Bookmark';
      } else if (kind === 'letter' || kind === 'wtlb' || kind === 'blessed' || kind === 'holy-days') {
        var ctx = (typeof findEntryContext === 'function') ? findEntryContext(parts[1], kind) : null;
        labelText = ctx && ctx.title ? ('Bookmark in ' + ctx.title) : 'Bookmark';
      } else {
        labelText = 'Bookmark';
      }
    }

    // Build the stored hlKey: append :start-end if we have a valid range.
    var storedKey = hlKey;
    if (snap.end > snap.start) {
      storedKey = hlKey + ':' + snap.start + '-' + snap.end;
    }

    // Excerpt: same two-strategy pattern as labelText so the preview block
    // in the BookmarkCreateSheet always shows the actual highlight.
    var excerpt = '';
    if (container && snap.end > snap.start) {
      excerpt = containerText.slice(snap.start, snap.end);
    }
    if (!excerpt && selInfo.text) {
      excerpt = selInfo.text;
    }
    if (excerpt.length > 220) excerpt = excerpt.slice(0, 217) + '...';

    // Source label: re-use the same derivation that BookmarksScreen rows do.
    var sourceLabel = (typeof _bookmarkSourceLabel === 'function')
      ? _bookmarkSourceLabel(storedKey)
      : '';

    window.getSelection().removeAllRanges();
    setVisible(false);

    // Open the pre-commit BookmarkCreateSheet — replaces the previous
    // silent BookmarkStore.add. The sheet lets the user refine the
    // auto-derived label BEFORE persisting, then commits on its own
    // (App-level onConfirm wires the store write).
    if (typeof window.__bookmarkCreate === 'function') {
      window.__bookmarkCreate({
        hlKey: storedKey,
        sourceLabel: sourceLabel,
        excerpt: excerpt,
        defaultLabel: labelText
      });
    } else {
      // Fallback: defensive path if the App-level bridge wasn't installed
      // yet — directly persist so we never lose the user's intent.
      BookmarkStore.add({
        id: (typeof bkmId === 'function') ? bkmId() : ('bkm_' + Date.now()),
        hlKey: storedKey, label: labelText, thought: '',
        created: Date.now(), updated: Date.now()
      });
    }
    if (typeof onBookmarkRequest === 'function') onBookmarkRequest(storedKey);
  }, [selInfo, onBookmarkRequest]);

  if (!visible || !selInfo) return null;

  // (Pre-Q3.3f-dead a styleAClass(color) helper lived here; no caller.)

  var mv = selInfo.multiVerse;
  // Show color row for multi-verse too, as long as there are hl-key containers affected
  var mvCanHighlight = mv && selInfo.multiContainers && selInfo.multiContainers.length > 0;
  var showColors = !mv || mvCanHighlight;
  // For multi-verse: check if ANY of the containers has an overlapping highlight to show ✕
  var mvHasExisting = mvCanHighlight && (selInfo.multiContainers || []).some(function(c) {
    return HighlightStore.get(c.dataset.hlKey).length > 0;
  });

  return (
    <div
      ref={toolbarRef}
      className="sel-toolbar"
      role="toolbar"
      aria-label="Text selection actions"
      style={{ left: pos.x, top: pos.y, transform: 'translateY(-100%)' }}
      onPointerDown={(e) => { e.stopPropagation(); suppressRef.current = true; }}
      onPointerUp={() => { setTimeout(() => { suppressRef.current = false; }, 300); }}
    >
      {/* While confirming a remove, the whole toolbar collapses to the
          ConfirmStrip so the user is focused on the single decision (and
          can't accidentally tap an unrelated action). Cancel returns to
          the normal toolbar; Yes calls removeHighlight which also hides
          the toolbar. */}
      {confirmingRemove ? (
        <ConfirmStrip
          question={removeNoteCount > 0
            ? `Remove this highlight and ${removeNoteCount === 1 ? 'its note' : removeNoteCount + ' notes'}? The note text will be deleted.`
            : 'Remove this highlight?'}
          yesLabel="Yes, remove"
          onCancel={() => setConfirmingRemove(false)}
          onConfirm={() => { removeHighlight(); setConfirmingRemove(false); }}
        />
      ) : (
      <>
      {/* Top row: style toggle + colors. Every control carries an accessible
          name (P1-11a): the style buttons' visible glyph is a bare "A" in
          three flavors, so the NAME comes from aria-label, with aria-pressed
          tracking the active style; swatches announce their color. */}
      {showColors && (
        <div className="sel-toolbar-row sel-toolbar-styles">
          <button
            type="button"
            className={"sel-style-btn" + (activeStyle === 'highlight' ? ' active' : '')}
            onClick={() => setActiveStyle('highlight')}
            title="Highlight"
            aria-label="Highlight"
            aria-pressed={activeStyle === 'highlight'}
          >
            A
          </button>
          <button
            type="button"
            className={"sel-style-btn sel-style-btn-underline" + (activeStyle === 'underline' ? ' active' : '')}
            onClick={() => setActiveStyle('underline')}
            title="Underline"
            aria-label="Underline"
            aria-pressed={activeStyle === 'underline'}
          >
            A
          </button>
          <button
            type="button"
            className={"sel-style-btn sel-style-btn-squiggle" + (activeStyle === 'squiggle' ? ' active' : '')}
            onClick={() => setActiveStyle('squiggle')}
            title="Squiggle underline"
            aria-label="Squiggle underline"
            aria-pressed={activeStyle === 'squiggle'}
          >
            A
          </button>
          <div className="sel-toolbar-divider" />
          <div className="sel-toolbar-colors">
            {HL_COLORS.map(c => {
              // "Current color" = the existing annotation over this exact
              // selection already uses this swatch in the active style — the
              // same condition that paints the .active ring, now also exposed
              // as aria-pressed so the state is announced, not just shown.
              const isCurrent = !!(selInfo.existingHl && selInfo.existingHl.color === c
                && (selInfo.existingHl.kind || 'highlight') === activeStyle);
              return (
                <button
                  key={c}
                  type="button"
                  className={"sel-color-btn sel-color-" + activeStyle + (isCurrent ? ' active' : '')}
                  data-color={c}
                  onClick={() => applyHighlight(c)}
                  title={c}
                  aria-label={c + ' ' + activeStyle}
                  aria-pressed={isCurrent}
                />
              );
            })}
            {(selInfo.existingHl || mvHasExisting) && (
              <button
                type="button"
                className="sel-color-btn sel-color-clear"
                onClick={() => {
                  let n = 0;
                  selectionGroups().forEach((gid) => { if (typeof NoteStore !== 'undefined' && NoteStore.get(gid)) n += 1; });
                  setRemoveNoteCount(n);
                  setConfirmingRemove(true);
                }}
                title="Remove highlight"
                aria-label="Remove highlight"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
      {/* Action buttons: note only for single-container; link + copy/share/search always */}
      <div className="sel-toolbar-row sel-toolbar-actions">
        {/* Note works for multi-verse / multi-paragraph selections too — the
            handleNote multiVerse branch spans every [data-hl-key] container in
            the range, so a whole chapter or letter can become a single note.
            (Previously gated behind !mv, which made Note vanish the moment a
            selection crossed a paragraph break or verse boundary.) */}
        <button className="sel-action-btn" onClick={handleNote} title="Note">
          <svg viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
          <span>Note</span>
        </button>
        {showColors && (
          <button className="sel-action-btn" onClick={handleLink} title="Link">
            <svg viewBox="0 0 24 24">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Link</span>
          </button>
        )}
        <button className="sel-action-btn" onClick={copyText} title="Copy">
          <svg viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>Copy</span>
        </button>
        <button className="sel-action-btn" onClick={handleShare} title="Share">
          <svg viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>Share</span>
        </button>
        <button className="sel-action-btn" onClick={handleSearch} title="Search">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search</span>
        </button>
        <button className="sel-action-btn" onClick={handleBookmark} title="Bookmark">
          <svg viewBox="0 0 24 24">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span>Bookmark</span>
        </button>
      </div>
      </>
      )}
    </div>
  );
}
