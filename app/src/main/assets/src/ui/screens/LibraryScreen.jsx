/* ═══════════════════════════════════════════════════════════════════════
   LibraryScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Drag-to-reorder: same imperative DOM / long-press architecture as
   HomeScreen (1D reference) and TabsOverview (2D grid). The 5 tiles are
   in a 2-column grid, so sibling shifts use full 2D FLIP (naturalRectsRef
   holds real viewport coords; diagonal cross-row moves work for free).

   Order is persisted via LibraryOrderStore (IDB, key vot-library-order).

   Ref-sync rule (from the TabsOverview fix): dragIdxRef.current and
   pressingIdxRef.current are set SYNCHRONOUSLY inside the 1.4 s timer
   callback, not only via useEffect. On mobile, touchmove fires before
   React re-renders so the useEffect-only path leaves the refs stale.
   ═══════════════════════════════════════════════════════════════════════ */

export function LibraryScreen({ onBack, onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, onOpenHighlights, theme, onThemeChange, onSearch, onHistory, onSettings, historyEnabled: _historyEnabled }) {
  // Subscribe to all 5 stores so tile counts re-render on any mutation.
  React.useSyncExternalStore(
    React.useCallback((cb) => NoteStore.subscribe(cb), []),
    () => NoteStore.getVersion()
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => LinkStore.subscribe(cb), []),
    () => LinkStore.getVersion()
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof BookmarkStore !== 'undefined') ? BookmarkStore.subscribe(cb) : () => {}, []),
    () => (typeof BookmarkStore !== 'undefined') ? BookmarkStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof JournalStore !== 'undefined') ? JournalStore.subscribe(cb) : () => {}, []),
    () => (typeof JournalStore !== 'undefined') ? JournalStore.getVersion() : 0
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.subscribe(cb) : () => {}, []),
    () => (typeof AnnotationStore !== 'undefined') ? AnnotationStore.getVersion() : 0
  );

  const noteCount      = NoteStore.count();
  const linkCount      = LinkStore.all().length;
  const bookmarkCount  = (typeof BookmarkStore  !== 'undefined') ? BookmarkStore.count()  : 0;
  const journalCount   = (typeof JournalStore   !== 'undefined') ? JournalStore.count()   : 0;
  const highlightCount = (() => {
    if (typeof AnnotationStore === 'undefined') return 0;
    const data = AnnotationStore.all() || {};
    const seen = {};
    Object.keys(data).forEach(k => (data[k] || []).forEach(a => {
      if (a.kind === 'highlight' || a.kind === 'underline') seen[a.groupId || a.id] = 1;
    }));
    return Object.keys(seen).length;
  })();

  // ── Tile metadata (static) ──────────────────────────────────────────
  // Defined inline so the SVG JSX resolves in component scope.
  const TILES_BY_ID = {
    notes: {
      id: 'notes', eyebrow: 'My Notes', title: 'Notes',
      detail: noteCount === 0 ? 'No notes yet' : (noteCount + (noteCount === 1 ? ' note' : ' notes')),
      onClick: onOpenNotes,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      ),
    },
    links: {
      id: 'links', eyebrow: 'My Links', title: 'Links',
      detail: linkCount === 0 ? 'No links yet' : (linkCount + (linkCount === 1 ? ' link' : ' links')),
      onClick: onOpenLinks,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
    journal: {
      id: 'journal', eyebrow: 'My Journal', title: 'Journal',
      detail: journalCount === 0 ? 'No entries yet' : (journalCount + (journalCount === 1 ? ' entry' : ' entries')),
      onClick: onOpenJournal,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M19 4H8a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h11z" />
          <line x1="9" y1="9" x2="16" y2="9" />
          <line x1="9" y1="13" x2="16" y2="13" />
        </svg>
      ),
    },
    bookmarks: {
      id: 'bookmarks', eyebrow: 'My Bookmarks', title: 'Bookmarks',
      detail: bookmarkCount === 0 ? 'No bookmarks yet' : (bookmarkCount + (bookmarkCount === 1 ? ' bookmark' : ' bookmarks')),
      onClick: onOpenBookmarks,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    highlights: {
      id: 'highlights', eyebrow: 'My Marks', title: 'Highlights & Underlines',
      detail: highlightCount === 0 ? 'No marks yet' : (highlightCount + (highlightCount === 1 ? ' mark' : ' marks')),
      onClick: onOpenHighlights,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M9 11l-4 4 4 4 11-11-4-4-7 7" />
          <line x1="13" y1="7" x2="17" y2="11" />
        </svg>
      ),
    },
  };

  // ── Drag-to-reorder state (CSS-class drivers only) + imperative refs ─
  const [order, setOrder] = React.useState(() => LibraryOrderStore.get());
  const [pressingIdx, setPressingIdx] = React.useState(-1);
  const [dragIdx, setDragIdx] = React.useState(-1);

  const cardRefs          = React.useRef([]);
  const pressTimerRef     = React.useRef(null);
  const visualDelayTimerRef = React.useRef(null);
  const pressStartXRef    = React.useRef(0);
  const pressStartYRef    = React.useRef(0);
  const pressStartTsRef   = React.useRef(0);
  const dragIdxRef        = React.useRef(-1);
  const targetIdxRef      = React.useRef(-1);
  const pressingIdxRef    = React.useRef(-1);
  const orderRef          = React.useRef(order);
  const justDraggedRef    = React.useRef(false);
  const activeCleanupRef  = React.useRef(null);
  const dragCloneRef      = React.useRef(null);
  const fingerOffsetXRef  = React.useRef(0);
  const fingerOffsetYRef  = React.useRef(0);
  const naturalRectsRef   = React.useRef([]); // [{left,top,cx,cy,w,h}] per card at drag-start

  React.useEffect(() => { dragIdxRef.current     = dragIdx;   }, [dragIdx]);
  React.useEffect(() => { pressingIdxRef.current = pressingIdx; }, [pressingIdx]);
  React.useEffect(() => { orderRef.current       = order;     }, [order]);

  // Cleanup timers, doc listeners, and the flying clone on unmount.
  React.useEffect(() => () => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(visualDelayTimerRef.current);
    if (activeCleanupRef.current) activeCleanupRef.current();
    if (dragCloneRef.current && dragCloneRef.current.parentNode)
      dragCloneRef.current.parentNode.removeChild(dragCloneRef.current);
  }, []);

  const setCardRef = (i) => (el) => { cardRefs.current[i] = el; };

  const clearInlineTransforms = () => {
    cardRefs.current.forEach((el) => {
      if (!el) return;
      el.style.transform = ''; el.style.transition = '';
      el.style.zIndex = ''; el.style.opacity = '';
    });
  };

  // FLIP sibling shifts — 2D because the grid wraps rows.
  const applySiblingShifts = (to) => {
    const from = dragIdxRef.current;
    const rects = naturalRectsRef.current;
    cardRefs.current.forEach((el, i) => {
      if (!el || i === from) return;
      let visualIdx = i;
      if (from < to) { if (i > from && i <= to) visualIdx = i - 1; }
      else           { if (i >= to && i < from) visualIdx = i + 1; }
      const tgt = rects[visualIdx] || rects[i];
      const src = rects[i];
      if (!tgt || !src) return;
      el.style.transition = 'transform 0.22s cubic-bezier(0.2,0.8,0.3,1)';
      el.style.transform  = `translate(${tgt.cx - src.cx}px,${tgt.cy - src.cy}px)`;
    });
  };

  // Nearest card by 2D squared distance.
  const pickTarget = (cx, cy) => {
    const rects = naturalRectsRef.current;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const dx = cx - rects[i].cx, dy = cy - rects[i].cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return Math.max(0, Math.min(orderRef.current.length - 1, best));
  };

  const startPress = (idx, clientX, clientY) => {
    if (pressingIdxRef.current >= 0 || dragIdxRef.current >= 0) return;
    pressStartXRef.current  = clientX;
    pressStartYRef.current  = clientY;
    pressStartTsRef.current = Date.now();
    pressingIdxRef.current  = idx;

    clearTimeout(visualDelayTimerRef.current);
    visualDelayTimerRef.current = setTimeout(() => {
      if (pressingIdxRef.current === idx && dragIdxRef.current < 0) setPressingIdx(idx);
    }, 280);

    const onMove = (e) => {
      const x = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const y = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
      if (dragIdxRef.current >= 0 && e.cancelable) {
        try { e.preventDefault(); } catch (_err) { /* passive — ignore */ }
      }
      if (dragIdxRef.current >= 0) {
        const clone = dragCloneRef.current;
        if (clone) {
          clone.style.transition = 'none';
          clone.style.left = (x - fingerOffsetXRef.current) + 'px';
          clone.style.top  = (y - fingerOffsetYRef.current) + 'px';
          clone.style.transform = 'scale(1.05)';
        }
        const r0 = naturalRectsRef.current[dragIdxRef.current];
        const cx = (x - fingerOffsetXRef.current) + (r0 ? r0.w * 0.5 : 0);
        const cy = (y - fingerOffsetYRef.current) + (r0 ? r0.h * 0.5 : 0);
        const newTarget = pickTarget(cx, cy);
        if (newTarget !== targetIdxRef.current) {
          targetIdxRef.current = newTarget;
          applySiblingShifts(newTarget);
        }
      } else if (pressingIdxRef.current >= 0) {
        if (Math.abs(x - pressStartXRef.current) > 10 || Math.abs(y - pressStartYRef.current) > 10) {
          clearTimeout(pressTimerRef.current);
          clearTimeout(visualDelayTimerRef.current);
          setPressingIdx(-1);
          pressingIdxRef.current = -1;
          if (Date.now() - pressStartTsRef.current > 400) {
            justDraggedRef.current = true;
            setTimeout(() => { justDraggedRef.current = false; }, 300);
          }
        }
      }
    };
    const onEnd = () => { if (activeCleanupRef.current) activeCleanupRef.current(); endPress(); };

    document.addEventListener('touchmove',   onMove, { passive: false });
    document.addEventListener('touchend',    onEnd);
    document.addEventListener('touchcancel', onEnd);
    document.addEventListener('mousemove',   onMove);
    document.addEventListener('mouseup',     onEnd);
    activeCleanupRef.current = () => {
      document.removeEventListener('touchmove',   onMove);
      document.removeEventListener('touchend',    onEnd);
      document.removeEventListener('touchcancel', onEnd);
      document.removeEventListener('mousemove',   onMove);
      document.removeEventListener('mouseup',     onEnd);
      activeCleanupRef.current = null;
    };

    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      // Refs must be set synchronously — setDragIdx/setPressingIdx are async
      // React state updates that only reach the refs via useEffect after the
      // next render. touchmove fires before that render on mobile.
      justDraggedRef.current = true;
      pressingIdxRef.current = -1;
      dragIdxRef.current     = idx;
      setPressingIdx(-1);
      setDragIdx(idx);
      targetIdxRef.current = idx;

      // Capture every card's natural viewport rect at drag start.
      naturalRectsRef.current = cardRefs.current.map((el) => {
        if (!el) return { left: 0, top: 0, cx: 0, cy: 0, w: 0, h: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
      });

      const el = cardRefs.current[idx];
      if (el) {
        const rect = el.getBoundingClientRect();
        fingerOffsetXRef.current = pressStartXRef.current - rect.left;
        fingerOffsetYRef.current = pressStartYRef.current - rect.top;
        const clone = el.cloneNode(true);
        clone.className = 'library-tile drag-flying';
        clone.style.cssText = [
          'position:fixed',
          'top:'    + rect.top    + 'px',
          'left:'   + rect.left   + 'px',
          'width:'  + rect.width  + 'px',
          'height:' + rect.height + 'px',
          'z-index:9999',
          'pointer-events:none',
          'margin:0',
          'box-sizing:border-box',
          'transition:transform 0.16s cubic-bezier(0.2,0.8,0.3,1)',
          'transform:scale(1.05)',
        ].join(';');
        document.body.appendChild(clone);
        dragCloneRef.current = clone;
      }
      if (navigator.vibrate) { try { navigator.vibrate(55); } catch (_e) { /* unsupported */ } }
    }, 1380);
  };

  const endPress = () => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(visualDelayTimerRef.current);
    const wasPressing = pressingIdxRef.current >= 0;
    const wasDragging = dragIdxRef.current >= 0;
    setPressingIdx(-1);
    pressingIdxRef.current = -1;

    if (wasDragging) {
      const from  = dragIdxRef.current;
      const to    = targetIdxRef.current >= 0 ? targetIdxRef.current : from;
      const clone = dragCloneRef.current;
      const rects = naturalRectsRef.current;
      if (clone) {
        const snap = rects[to] || rects[from];
        clone.style.transition =
          'left 0.22s cubic-bezier(0.2,0.8,0.3,1),top 0.22s cubic-bezier(0.2,0.8,0.3,1),transform 0.22s cubic-bezier(0.2,0.8,0.3,1)';
        clone.style.left      = (snap ? snap.left : 0) + 'px';
        clone.style.top       = (snap ? snap.top  : 0) + 'px';
        clone.style.transform = 'scale(1)';
      }
      setTimeout(() => {
        if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        dragCloneRef.current = null;
        clearInlineTransforms();
        if (to !== from && to >= 0) {
          const newOrder = [...orderRef.current];
          const [moved]  = newOrder.splice(from, 1);
          newOrder.splice(to, 0, moved);
          setOrder(newOrder);
          LibraryOrderStore.set(newOrder);
        }
        dragIdxRef.current   = -1;   // sync immediately; setDragIdx's useEffect is async
        setDragIdx(-1);
        targetIdxRef.current = -1;
        setTimeout(() => { justDraggedRef.current = false; }, 120);
      }, 240);
    } else if (wasPressing) {
      if (Date.now() - pressStartTsRef.current > 400) {
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 300);
      }
    }
  };

  // Trim stale refs when a future reorder changes card count (safe no-op here,
  // but mirrors the TabsOverview pattern for consistency).
  cardRefs.current.length = order.length;

  const orderedTiles = order.map((id) => TILES_BY_ID[id]).filter(Boolean);

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack: onBack, onSearch: onSearch, onHistory: onHistory, onSettings: onSettings, theme: theme, onThemeChange: onThemeChange })}
    >
      <div className="library-screen">
        <div className="library-eyebrow">Personal Study</div>
        <h1 className="library-title">Library</h1>
        <p className="library-sub">Your collected notes, reflections, and saved passages.</p>
        <div className="library-grid">
          {orderedTiles.map((tile, i) => (
            <button
              key={tile.id}
              ref={setCardRef(i)}
              className={'library-tile' + (i === pressingIdx ? ' pressing' : '') + (i === dragIdx ? ' dragging' : '')}
              onClick={(e) => {
                if (justDraggedRef.current) { e.preventDefault(); e.stopPropagation(); return; }
                tile.onClick();
              }}
              onTouchStart={(e) => { if (e.touches && e.touches[0]) startPress(i, e.touches[0].clientX, e.touches[0].clientY); }}
              onMouseDown={(e) => { if (e.button === 0) startPress(i, e.clientX, e.clientY); }}
            >
              <span className="library-tile-icon">{tile.icon}</span>
              <span className="library-tile-eyebrow">{tile.eyebrow}</span>
              <span className="library-tile-title">{tile.title}</span>
              <span className="library-tile-detail">{tile.detail}</span>
              <span className="library-tile-arrow">›</span>
            </button>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}
