function SelectionToolbar({ hlTick, setHlTick, onLinkRequest, onNoteRequest }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [selInfo, setSelInfo] = useState(null); // { hlKey, start, end, text, existingHl, multiVerse }
  const [activeStyle, setActiveStyle] = useState('highlight'); // 'highlight' | 'underline'
  const toolbarRef = useRef(null);
  const suppressRef = useRef(false);

  // Compute character offset of a node+offset within a data-hl-key container's text
  const computeOffset = useCallback((container, node, offset) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let charPos = 0;
    while (walker.nextNode()) {
      if (walker.currentNode === node) return charPos + offset;
      charPos += walker.currentNode.textContent.length;
    }
    return charPos + offset;
  }, []);

  // Find the data-hl-key container for a DOM node
  const findHlContainer = useCallback((node) => {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && !el.dataset.hlKey) el = el.parentElement;
    return el;
  }, []);

  const dragRef = useRef(false);
  const selChangeTimerRef = useRef(null);
  const tapTargetRef = useRef(null);
  const tapPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    window.__hideSelectionToolbar = () => {
      setVisible(false);
      try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (e) {}
    };
    return () => { window.__hideSelectionToolbar = null; };
  }, []);

  useEffect(() => {
    const computeAndShow = () => {
      if (suppressRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setVisible(false);
        return;
      }
      const range = sel.getRangeAt(0);
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

    const onSelectionChange = () => {
      if (suppressRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        if (selChangeTimerRef.current) { clearTimeout(selChangeTimerRef.current); selChangeTimerRef.current = null; }
        setTimeout(() => {
          if (!suppressRef.current) {
            const s = window.getSelection();
            if (!s || s.isCollapsed) setVisible(false);
          }
        }, 150);
      } else if (!dragRef.current) {
        if (selChangeTimerRef.current) clearTimeout(selChangeTimerRef.current);
        selChangeTimerRef.current = setTimeout(function() {
          selChangeTimerRef.current = null;
          computeAndShow();
        }, 350);
      }
    };

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
      if (isCollapsed && tapTarget) {
        const el = tapTarget.nodeType === 3 ? tapTarget.parentElement : tapTarget;
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

  const applyHighlight = useCallback((color) => {
    if (!selInfo) return;
    suppressRef.current = true;
    const kind = activeStyle === 'underline' ? 'underline' : 'highlight';
    if (selInfo.multiVerse) {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const containers = selInfo.multiContainers ||
        (range ? Array.from(document.querySelectorAll('[data-hl-key]')).filter(function(c) { return range.intersectsNode(c); }) : []);
      const groupId = hlId();
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

  const removeHighlight = useCallback(() => {
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

  const copyText = useCallback(() => {
    if (!selInfo) return;
    navigator.clipboard.writeText(selInfo.text).catch(() => {});
    window.getSelection().removeAllRanges();
    setVisible(false);
  }, [selInfo]);

  const handleLink = useCallback(() => {
    if (!selInfo) return;
    window.getSelection().removeAllRanges();
    setVisible(false);
    var linkInfo = selInfo;
    if (selInfo.multiVerse && selInfo.multiContainers && selInfo.multiContainers.length > 0) {
      linkInfo = Object.assign({}, selInfo, { hlKey: selInfo.multiContainers[0].dataset.hlKey });
    }
    onLinkRequest && onLinkRequest(linkInfo);
  }, [selInfo, onLinkRequest]);

  const handleNote = useCallback(() => {
    if (!selInfo) return;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    let groupId;
    if (selInfo.multiVerse) {
      const containers = selInfo.multiContainers ||
        (range ? Array.from(document.querySelectorAll('[data-hl-key]')).filter(c => range.intersectsNode(c)) : []);
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
      const container = document.querySelector('[data-hl-key="' + selInfo.hlKey.replace(/"/g, '\\"') + '"]');
      const containerText = container ? container.textContent : selInfo.text;
      const snap = snapRangeToWords(containerText, selInfo.start, selInfo.end);
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

  const handleShare = useCallback(() => {
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

  const handleSearch = useCallback(() => {
    if (!selInfo) return;
    const text = selInfo.text;
    window.getSelection().removeAllRanges();
    setVisible(false);
    window.__pendingSearchQuery = text;
    if (window.__goSearch) window.__goSearch();
  }, [selInfo]);

  if (!visible || !selInfo) return null;

  const svgIcon = (paths, extra) => React.createElement("svg", Object.assign({ viewBox: "0 0 24 24" }, extra || {}), paths);

  var mv = selInfo.multiVerse;
  var mvCanHighlight = mv && selInfo.multiContainers && selInfo.multiContainers.length > 0;
  var showColors = !mv || mvCanHighlight;
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
          className: "sel-color-btn sel-color-" + activeStyle + (selInfo.existingHl && selInfo.existingHl.color === c && (selInfo.existingHl.kind || (selInfo.existingHl.style === 'underline' ? 'underline' : 'highlight')) === activeStyle ? ' active' : ''),
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
      )
    )
  );
}
