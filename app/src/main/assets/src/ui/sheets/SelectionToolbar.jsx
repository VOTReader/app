/* ═══════════════════════════════════════════════════════════════════════
   SelectionToolbar — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function SelectionToolbar({ onLinkRequest, onNoteRequest, onBookmarkRequest }) {
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [selInfo, setSelInfo] = React.useState(null); // { hlKey, start, end, text, existingHl, multiVerse }
  const [activeStyle, setActiveStyle] = React.useState('highlight'); // 'highlight' | 'underline'
  // Confirm-strip mode for the ✕ remove button. Resets whenever the
  // selection changes so a fresh selection always lands on the normal
  // toolbar (not an inherited mid-confirm state from a prior selection).
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
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
      // Strip .fn-ref bubbles and .hl-note-icon elements from the selection text
      // so footnote numbers and note icons don't bleed into the link preview.
      const text = (() => {
        try {
          const frag = range.cloneContents();
          frag.querySelectorAll('.fn-ref, .hl-note-icon').forEach(function(el) { el.remove(); });
          return frag.textContent.trim();
        } catch (_e) {
          return sel.toString().trim();
        }
      })();
      if (!text) { setVisible(false); return; }
      const container = findHlContainer(range.startContainer);
      const endContainer = findHlContainer(range.endContainer);
      const isMultiVerse = !container || !endContainer || endContainer !== container;
      if (isMultiVerse) {
        // Cross-container selection: find all [data-hl-key] containers that overlap
        const allHlContainers = Array.from(document.querySelectorAll('[data-hl-key]'))
          .filter(function(c) { return range.intersectsNode(c); });
        if (allHlContainers.length === 0) { setVisible(false); return; }
        setSelInfo({ hlKey: null, start: 0, end: 0, text, existingHl: null, multiVerse: true, multiContainers: allHlContainers });
      } else {
        const hlKey = container.dataset.hlKey;
        const start = computeOffset(container, range.startContainer, range.startOffset);
        const end = computeOffset(container, range.endContainer, range.endOffset);
        if (start >= end) { setVisible(false); return; }
        const existing = HighlightStore.get(hlKey).find(h => h.start <= start && h.end >= end);
        setSelInfo({ hlKey, start, end, text, existingHl: existing || null, multiVerse: false });
      }
      const rect = range.getBoundingClientRect();
      const toolbarW = 320;
      let x = rect.left + rect.width / 2 - toolbarW / 2;
      x = Math.max(8, Math.min(x, window.innerWidth - toolbarW - 8));
      let y = rect.top - 10;
      if (y < 80) y = rect.bottom + 10;
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
    // target. Used by the tap (pointerup), the click fallback (Android), and
    // the long-press (contextmenu) paths so all three behave identically.
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
    const onPointerDown = (e) => {
      if (toolbarRef.current && toolbarRef.current.contains(e.target)) return;
      tapTargetRef.current = e.target;
      tapPosRef.current = { x: e.clientX || 0, y: e.clientY || 0 };
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
      // Tap detection: collapsed selection + tap on a mark or note icon.
      // Notes route to NoteSheet (read mode); highlights/underlines route
      // to the action chip. Overlapping note marks at the tap point show
      // the multi-note disambiguation popover.
      if (isCollapsed && tapTarget && routeAnnotationTap(tapTarget, pos.x, pos.y)) return;
      setTimeout(computeAndShow, 150);
    };

    // Android long-press / right-click: same routing as tap.
    const onContextMenu = (e) => {
      const hlContainer = e.target.closest('[data-hl-key]');
      if (hlContainer) e.preventDefault();
      if (routeAnnotationTap(e.target, e.clientX, e.clientY)) {
        setVisible(false);
        // A long-press creates a native text selection (the blue handles) right
        // under the chip; collapse it so the OS handles don't intersect our
        // "Remove / Color / Note" menu. The chip operates on the existing
        // annotation (via hlKey/groupId), so it doesn't need the selection.
        try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (_e) { /* best-effort */ }
        return;
      }
      setTimeout(computeAndShow, 80);
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
    // Android single-tap bridge (see onSingleTapUp in MainActivity.kt). Coords
    // are CSS pixels. elementFromPoint hit-tests the tap: an icon already fires
    // `click` natively (skip it); otherwise route the highlight/underline/note
    // MARK to the chip — the case the WebView's selection layer swallows.
    window.__nativeTapAnnotation = (x, y) => {
      try {
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
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('touchend', onPointerUp);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('click', onClick);
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
        var snap = snapRangeToWords(containerText, rawStart, rawEnd);
        if (snap.start >= snap.end) return;
        AnnotationStore.add(hlKey, {
          id: hlId(), groupId: groupId, kind: kind,
          start: snap.start, end: snap.end, color: color,
          text: containerText.slice(snap.start, snap.end),
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
      const snap = snapRangeToWords(containerText, selInfo.start, selInfo.end);
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
        color: color, text: containerText.slice(snap.start, snap.end),
        created: Date.now()
      });
    }
    window.getSelection().removeAllRanges();
    setVisible(false);
    setTimeout(() => { suppressRef.current = false; }, 300);
  }, [selInfo, activeStyle, computeOffset]);

  const removeHighlight = React.useCallback(() => {
    if (!selInfo) return;
    suppressRef.current = true;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const containers = selInfo.multiVerse
      ? (selInfo.multiContainers ||
          (range ? Array.from(document.querySelectorAll('[data-hl-key]')).filter(c => range.intersectsNode(c)) : []))
      : [document.querySelector('[data-hl-key="' + (selInfo.hlKey || '').replace(/"/g, '\\"') + '"]')].filter(Boolean);
    const removedGroups = new Set();
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
        if (h.start < end && h.end > start && h.groupId && !removedGroups.has(h.groupId)) {
          removedGroups.add(h.groupId);
          AnnotationStore.removeGroup(h.groupId);
          NoteStore.remove(h.groupId);
        }
      });
    });
    window.getSelection().removeAllRanges();
    setVisible(false);
    setTimeout(() => { suppressRef.current = false; }, 300);
  }, [selInfo, computeOffset]);

  const copyText = React.useCallback(() => {
    if (!selInfo) return;
    navigator.clipboard.writeText(selInfo.text).catch(() => {});
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
        containers.forEach(function(container) {
          var hlKey = container.dataset.hlKey;
          var containerText = container.textContent;
          var containerLen = containerText.length;
          var rawStart = range && container.contains(range.startContainer)
            ? computeOffset(container, range.startContainer, range.startOffset) : 0;
          var rawEnd = range && container.contains(range.endContainer)
            ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
          var snap = snapRangeToWords(containerText, rawStart, rawEnd);
          if (snap.start >= snap.end) return;
          AnnotationStore.add(hlKey, {
            id: hlId(), groupId: groupId, kind: def.style,
            start: snap.start, end: snap.end, color: def.color,
            text: containerText.slice(snap.start, snap.end),
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
      const snap = snapRangeToWords(containerText, selInfo.start, selInfo.end);
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
        AnnotationStore.add(selInfo.hlKey, {
          id: id, groupId: id, kind: def.style,
          start: snap.start, end: snap.end,
          color: def.color, text: containerText.slice(snap.start, snap.end),
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
    const fullText = segs.map(s => s.ann.text || '').join(' … ');
    const keys = [...new Set(segs.map(s => s.key))];
    const existingNote = NoteStore.get(groupId);
    NoteStore.set(groupId, {
      color: segs[0] ? segs[0].ann.color : def.color,
      fullText, keys,
      body: existingNote ? existingNote.body : ''
    });
    window.getSelection().removeAllRanges();
    setVisible(false);
    onNoteRequest && onNoteRequest(groupId, /*startInEditMode=*/true);
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
    window.__pendingSearchQuery = text;
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
    var snap = (typeof snapRangeToWords === 'function')
      ? snapRangeToWords(containerText, selInfo.start || 0, selInfo.end || 0)
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
    // auto-derived label and add an optional thought BEFORE persisting,
    // then commits on its own (App-level onConfirm wires the store write).
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
          question="Remove this highlight?"
          yesLabel="Yes, remove"
          onCancel={() => setConfirmingRemove(false)}
          onConfirm={() => { removeHighlight(); setConfirmingRemove(false); }}
        />
      ) : (
      <>
      {/* Top row: style toggle + colors */}
      {showColors && (
        <div className="sel-toolbar-row sel-toolbar-styles">
          <button
            className={"sel-style-btn" + (activeStyle === 'highlight' ? ' active' : '')}
            onClick={() => setActiveStyle('highlight')}
            title="Highlight"
          >
            A
          </button>
          <button
            className={"sel-style-btn sel-style-btn-underline" + (activeStyle === 'underline' ? ' active' : '')}
            onClick={() => setActiveStyle('underline')}
            title="Underline"
          >
            A
          </button>
          <button
            className={"sel-style-btn sel-style-btn-squiggle" + (activeStyle === 'squiggle' ? ' active' : '')}
            onClick={() => setActiveStyle('squiggle')}
            title="Squiggle underline"
          >
            A
          </button>
          <div className="sel-toolbar-divider" />
          <div className="sel-toolbar-colors">
            {HL_COLORS.map(c => (
              <button
                key={c}
                className={"sel-color-btn sel-color-" + activeStyle + (selInfo.existingHl && selInfo.existingHl.color === c && (selInfo.existingHl.kind || 'highlight') === activeStyle ? ' active' : '')}
                data-color={c}
                onClick={() => applyHighlight(c)}
                title={c}
              />
            ))}
            {(selInfo.existingHl || mvHasExisting) && (
              <button
                className="sel-color-btn sel-color-clear"
                onClick={() => setConfirmingRemove(true)}
                title="Remove highlight"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
      {/* Action buttons: note only for single-container; link + copy/share/search always */}
      <div className="sel-toolbar-row sel-toolbar-actions">
        {!mv && (
          <button className="sel-action-btn" onClick={handleNote} title="Note">
            <svg viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="16" y2="17" />
            </svg>
            <span>Note</span>
          </button>
        )}
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
