/* ═══════════════════════════════════════════════════════════════════════
   SelectionToolbar — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

function SelectionToolbar({ hlTick, setHlTick, onLinkRequest, onNoteRequest, onBookmarkRequest }) {
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [selInfo, setSelInfo] = React.useState(null); // { hlKey, start, end, text, existingHl, multiVerse }
  const [activeStyle, setActiveStyle] = React.useState('highlight'); // 'highlight' | 'underline'
  const toolbarRef = React.useRef(null);
  const suppressRef = React.useRef(false);

  // Compute character offset of a node+offset within a data-hl-key container's text
  const computeOffset = React.useCallback((container, node, offset) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
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
      try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (e) {}
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
        } catch (e) {
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
      if (isCollapsed && tapTarget) {
        const el = tapTarget.nodeType === 3 ? tapTarget.parentElement : tapTarget;
        // Note icon at end of a note span — opens note (or multi-note popover
        // if it's a merged badge icon) directly via the icon's own click handler
        const iconEl = el && el.closest('.hl-note-icon');
        if (iconEl) {
          const gids = (iconEl.getAttribute('data-group-ids') || iconEl.getAttribute('data-group-id') || '').split(',').filter(Boolean);
          if (gids.length > 1 && window.__showMultiNote) { window.__showMultiNote(gids, pos.x, pos.y); return; }
          if (gids.length === 1 && window.__openNote) { window.__openNote(gids[0]); return; }
        }
        const markEl = el && el.closest('mark.hl-mark');
        if (markEl) {
          const groupId = markEl.getAttribute('data-group-id') || markEl.getAttribute('data-hl-id');
          const kind = markEl.getAttribute('data-kind') || 'highlight';
          const containerEl = markEl.closest('[data-hl-key]');
          const hlKey = containerEl ? containerEl.getAttribute('data-hl-key') : null;
          if (groupId && hlKey) {
            if (kind === 'note') {
              // Look for OTHER overlapping note marks at this exact tap point
              const overlapGids = new Set([groupId]);
              try {
                const stack = document.elementsFromPoint(pos.x, pos.y);
                stack.forEach(n => {
                  if (n.matches && n.matches('mark.hl-note[data-kind="note"]')) {
                    const g = n.getAttribute('data-group-id');
                    if (g) overlapGids.add(g);
                  }
                });
              } catch (e) {}
              if (overlapGids.size > 1 && window.__showMultiNote) {
                window.__showMultiNote([...overlapGids], pos.x, pos.y);
                return;
              }
              if (window.__openNote) { window.__openNote(groupId); return; }
            }
            if (window.__showAnnChip) { window.__showAnnChip(pos.x, pos.y + 12, hlKey, groupId); return; }
          }
        }
      }
      setTimeout(computeAndShow, 150);
    };

    // Android long-press / right-click: same routing as tap.
    const onContextMenu = (e) => {
      const hlContainer = e.target.closest('[data-hl-key]');
      if (hlContainer) e.preventDefault();
      const iconEl = e.target.closest('.hl-note-icon');
      if (iconEl) {
        const gid = iconEl.getAttribute('data-group-id');
        if (gid && window.__openNote) { setVisible(false); window.__openNote(gid); return; }
      }
      const mark = e.target.closest('mark.hl-mark');
      if (mark) {
        const groupId = mark.getAttribute('data-group-id') || mark.getAttribute('data-hl-id');
        const kind = mark.getAttribute('data-kind') || 'highlight';
        const container = mark.closest('[data-hl-key]');
        const hlKey = container ? container.getAttribute('data-hl-key') : null;
        if (groupId && hlKey) {
          setVisible(false);
          if (kind === 'note' && window.__openNote) { window.__openNote(groupId); return; }
          if (window.__showAnnChip) { window.__showAnnChip(e.clientX, e.clientY, hlKey, groupId); return; }
        }
      }
      setTimeout(computeAndShow, 80);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('touchend', onPointerUp);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('touchend', onPointerUp);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [computeOffset, findHlContainer, hlTick]);

  const applyHighlight = React.useCallback((color) => {
    if (!selInfo) return;
    suppressRef.current = true;
    const kind = activeStyle === 'underline' ? 'underline' : 'highlight';
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
    setHlTick(t => t + 1);
    setTimeout(() => { suppressRef.current = false; }, 300);
  }, [selInfo, activeStyle, setHlTick, computeOffset]);

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
    setHlTick(t => t + 1);
    setTimeout(() => { suppressRef.current = false; }, 300);
  }, [selInfo, setHlTick, computeOffset]);

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
    // Default note color = yellow. If selection sits inside an existing
    // group, convert that group to a note (preserving color); otherwise
    // create a new note-kind annotation across the selected range(s).
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    let groupId;
    if (selInfo.multiVerse) {
      const containers = selInfo.multiContainers ||
        (range ? Array.from(document.querySelectorAll('[data-hl-key]')).filter(c => range.intersectsNode(c)) : []);
      // Look for an OVERLAPPING non-note group within the selection range.
      // If found, convert it (highlight/underline → note). Notes always
      // stack — never convert an existing note; create a new one alongside.
      let convertTarget = null;
      containers.forEach(function(container) {
        if (convertTarget) return;
        var hlKey = container.dataset.hlKey;
        var containerLen = container.textContent.length;
        var start = range && container.contains(range.startContainer)
          ? computeOffset(container, range.startContainer, range.startOffset) : 0;
        var end = range && container.contains(range.endContainer)
          ? computeOffset(container, range.endContainer, range.endOffset) : containerLen;
        AnnotationStore.get(hlKey).forEach(function(h) {
          if (convertTarget) return;
          if (h.start < end && h.end > start && h.kind !== 'note' && h.groupId) {
            convertTarget = h.groupId;
          }
        });
      });
      if (convertTarget) {
        AnnotationStore.convertGroup(convertTarget, 'note');
        groupId = convertTarget;
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
            id: hlId(), groupId: groupId, kind: 'note',
            start: snap.start, end: snap.end, color: 'yellow',
            text: containerText.slice(snap.start, snap.end),
            created: Date.now()
          });
        });
      }
    } else {
      // Single-container: snap to word boundaries, then look for any
      // OVERLAPPING non-note covering group to convert; otherwise create
      // new (allowing stacking with existing notes on the same range).
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
        h.start <= snap.start && h.end >= snap.end && h.kind !== 'note'
      );
      if (existing) {
        AnnotationStore.convertGroup(existing.groupId, 'note');
        groupId = existing.groupId;
      } else {
        const id = hlId();
        groupId = id;
        AnnotationStore.add(selInfo.hlKey, {
          id: id, groupId: id, kind: 'note',
          start: snap.start, end: snap.end,
          color: 'yellow', text: containerText.slice(snap.start, snap.end),
          created: Date.now()
        });
      }
    }
    // Build/refresh the NoteStore record — but only if at least one
    // segment actually exists for this groupId. The multi-container loop
    // above skips any container whose snapped range collapses to empty;
    // if ALL containers did so, no segments got added and we'd otherwise
    // persist a phantom note with empty keys[] and fullText that's
    // unremovable through the UI (row tap routes through noteSourceNav
    // which returns null for keys:[], and the sheet returns null because
    // segs.length === 0 → closes instantly).
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
      color: segs[0] ? segs[0].ann.color : 'yellow',
      fullText, keys,
      body: existingNote ? existingNote.body : ''
    });
    window.getSelection().removeAllRanges();
    setVisible(false);
    setHlTick(t => t + 1);
    onNoteRequest && onNoteRequest(groupId, /*startInEditMode=*/true);
  }, [selInfo, setHlTick, onNoteRequest, computeOffset]);

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
    //      selections (start/end are 0 in that branch — see the
    //      setSelInfo({hlKey:null,start:0,end:0,...}) call in the
    //      SelectionToolbar's compute path) and for the rare case where
    //      the container DOM has unmounted between selection and tap.
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
      if (typeof setHlTick === 'function') setHlTick(function(t) { return t + 1; });
    }
    if (typeof onBookmarkRequest === 'function') onBookmarkRequest(storedKey);
  }, [selInfo, setHlTick, onBookmarkRequest]);

  if (!visible || !selInfo) return null;

  const svgIcon = (paths, extra) => React.createElement("svg", Object.assign({ viewBox: "0 0 24 24" }, extra || {}), paths);

  // Style label preview: the colored "A" varies based on activeStyle
  const styleAClass = (color) => 'sel-style-A sel-style-A-' + (activeStyle === 'underline' ? 'underline' : 'fill') + ' sel-style-A-' + color;

  var mv = selInfo.multiVerse;
  // Show color row for multi-verse too, as long as there are hl-key containers affected
  var mvCanHighlight = mv && selInfo.multiContainers && selInfo.multiContainers.length > 0;
  var showColors = !mv || mvCanHighlight;
  // For multi-verse: check if ANY of the containers has an overlapping highlight to show ✕
  var mvHasExisting = mvCanHighlight && (selInfo.multiContainers || []).some(function(c) {
    return HighlightStore.get(c.dataset.hlKey).length > 0;
  });

  return React.createElement("div", {
    ref: toolbarRef,
    className: "sel-toolbar",
    style: { left: pos.x, top: pos.y, transform: 'translateY(-100%)' },
    onPointerDown: (e) => { e.stopPropagation(); suppressRef.current = true; },
    onPointerUp: () => { setTimeout(() => { suppressRef.current = false; }, 300); }
  },
    // Top row: style toggle + colors
    showColors && React.createElement("div", { className: "sel-toolbar-row sel-toolbar-styles" },
      React.createElement("button", {
        className: "sel-style-btn" + (activeStyle === 'highlight' ? ' active' : ''),
        onClick: () => setActiveStyle('highlight'),
        title: "Highlight"
      }, "A"),
      React.createElement("button", {
        className: "sel-style-btn sel-style-btn-underline" + (activeStyle === 'underline' ? ' active' : ''),
        onClick: () => setActiveStyle('underline'),
        title: "Underline"
      }, "A"),
      React.createElement("div", { className: "sel-toolbar-divider" }),
      React.createElement("div", { className: "sel-toolbar-colors" },
        HL_COLORS.map(c => React.createElement("button", {
          key: c,
          className: "sel-color-btn sel-color-" + activeStyle + (selInfo.existingHl && selInfo.existingHl.color === c && (selInfo.existingHl.kind || 'highlight') === activeStyle ? ' active' : ''),
          "data-color": c,
          onClick: () => applyHighlight(c),
          title: c
        })),
        (selInfo.existingHl || mvHasExisting) && React.createElement("button", {
          className: "sel-color-btn sel-color-clear",
          onClick: removeHighlight,
          title: "Remove highlight"
        }, "✕")
      )
    ),
    // Action buttons: note only for single-container; link + copy/share/search always
    React.createElement("div", { className: "sel-toolbar-row sel-toolbar-actions" },
      !mv && React.createElement("button", { className: "sel-action-btn", onClick: handleNote, title: "Note" },
        svgIcon([
          React.createElement("path", { key: "a", d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
          React.createElement("polyline", { key: "b", points: "14 2 14 8 20 8" }),
          React.createElement("line", { key: "c", x1: "8", y1: "13", x2: "16", y2: "13" }),
          React.createElement("line", { key: "d", x1: "8", y1: "17", x2: "16", y2: "17" })
        ]),
        React.createElement("span", null, "Note")
      ),
      showColors && React.createElement("button", { className: "sel-action-btn", onClick: handleLink, title: "Link" },
        svgIcon([
          React.createElement("path", { key: "a", d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
          React.createElement("path", { key: "b", d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })
        ]),
        React.createElement("span", null, "Link")
      ),
      React.createElement("button", { className: "sel-action-btn", onClick: copyText, title: "Copy" },
        svgIcon([
          React.createElement("rect", { key: "a", x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }),
          React.createElement("path", { key: "b", d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
        ]),
        React.createElement("span", null, "Copy")
      ),
      React.createElement("button", { className: "sel-action-btn", onClick: handleShare, title: "Share" },
        svgIcon([
          React.createElement("circle", { key: "a", cx: "18", cy: "5", r: "3" }),
          React.createElement("circle", { key: "b", cx: "6", cy: "12", r: "3" }),
          React.createElement("circle", { key: "c", cx: "18", cy: "19", r: "3" }),
          React.createElement("line", { key: "d", x1: "8.59", y1: "13.51", x2: "15.42", y2: "17.49" }),
          React.createElement("line", { key: "e", x1: "15.41", y1: "6.51", x2: "8.59", y2: "10.49" })
        ]),
        React.createElement("span", null, "Share")
      ),
      React.createElement("button", { className: "sel-action-btn", onClick: handleSearch, title: "Search" },
        svgIcon([
          React.createElement("circle", { key: "a", cx: "11", cy: "11", r: "8" }),
          React.createElement("line", { key: "b", x1: "21", y1: "21", x2: "16.65", y2: "16.65" })
        ]),
        React.createElement("span", null, "Search")
      ),
      React.createElement("button", { className: "sel-action-btn", onClick: handleBookmark, title: "Bookmark" },
        svgIcon([
          React.createElement("path", { key: "a", d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" })
        ]),
        React.createElement("span", null, "Bookmark")
      )
    )
  );
}
