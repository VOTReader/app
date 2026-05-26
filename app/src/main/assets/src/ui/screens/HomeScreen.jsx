/* ═══════════════════════════════════════════════════════════════════════
   HomeScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function HomeScreen({ onSelect, onSurprise, showSurprise, onSettings, onSearch, onHistory, historyEnabled, onInfo, onAbout, history: _history, theme, onThemeChange }) {
  /* ──────────────────────────────────────────────────────────────
     Drag-and-drop home tiles (1s long-press → lift → drag → snap)
       Architecture note: we use IMPERATIVE DOM manipulation for all
     drag visuals, not React state. React state updates at 60fps in
     Android WebView are too slow to feel smooth and were causing
     the "card doesn't follow finger" bug. Instead:
         - React state only tracks: order, pressingIdx, dragIdx
         (used purely for CSS class toggling — .pressing, .dragging)
       - All transform/translateY animation is done via direct
         .style.transform writes through refs stored in cardRefs
       - Move listeners are attached synchronously in onTouchStart/
         onMouseDown (not via useEffect) so no moves are missed
     ────────────────────────────────────────────────────────────── */


  const ITEMS_BY_ID = {
    volumes: { id: "volumes", eyebrow: "Prophetic Letters", title: "The Volumes of Truth", detail: "Letters from The Lord, Our God and Savior" },
    scriptures: { id: "scriptures", eyebrow: "The Holy Bible", title: "The Scriptures of Truth", detail: "Genesis to Revelation · NKJV" },
    studies: { id: "studies", eyebrow: "Study Editions", title: "Studies", detail: "Letter Studies · Matthew Study Bible" },
    library: { id: "library", eyebrow: "Personal Study", title: "Library", detail: "Notes, journal & bookmarks" },
    settings: { id: "settings", eyebrow: "App Configuration", title: "Settings", detail: "Display, themes & preferences" },
    history: { id: "history", eyebrow: "Recently Visited", title: "History", detail: "Resume where you left off" }
  };
  const DEFAULT_ORDER = ["volumes", "scriptures", "studies", "library", "settings", "history"];

  // Load persisted order (permanent unless storage cleared)
  const [order, setOrder] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("vot-home-order") || "null");
      if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length &&
      DEFAULT_ORDER.every((id) => saved.includes(id))) return saved;
    } catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
    return DEFAULT_ORDER;
  });

  /* Drag architecture — IMPERATIVE DOM, not React state.
     React state re-renders at <60fps in Android WebView; direct writes to
     element.style.transform are effectively instant. We only keep state
     for what drives CSS classes (.pressing, .dragging) and for the final
     order commit. */
  const [pressingIdx, setPressingIdx] = React.useState(-1);
  const [dragIdx, setDragIdx] = React.useState(-1);

  const cardRefs = React.useRef([]); // DOM refs to each card
  const pressTimerRef = React.useRef(null);
  const visualDelayTimerRef = React.useRef(null);
  const pressStartYRef = React.useRef(0);
  const pressStartTsRef = React.useRef(0);
  const tileHeightRef = React.useRef(80);
  const dragIdxRef = React.useRef(-1);
  const targetIdxRef = React.useRef(-1);
  const pressingIdxRef = React.useRef(-1);
  const orderRef = React.useRef(order);
  const justDraggedRef = React.useRef(false);
  const activeCleanupRef = React.useRef(null);
  const dragCloneRef = React.useRef(null);
  const fingerOffsetYRef = React.useRef(0);
  const naturalCardTopsRef = React.useRef([]);

  React.useEffect(() => {dragIdxRef.current = dragIdx;}, [dragIdx]);
  React.useEffect(() => {pressingIdxRef.current = pressingIdx;}, [pressingIdx]);
  React.useEffect(() => {orderRef.current = order;}, [order]);

  // Q8.3: pre-fire the VOT corpus load on home screen mount. Users
  // typically tap a home tile within a few seconds; by the time they pick
  // Volumes / Library / Studies, the 3 MB corpus is already downloading
  // in parallel with their tile scan.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') {
      window.__loadVotCorpus().catch((e) => console.warn('VOT corpus pre-load failed', e));
    }
  }, []);

  // Surprise button needs MATTHEW + BIBLE_BOOK_LIST + BIBLE_STUDIES (all
  // lazy globals) to build its random pool. Pre-fire each loader when the
  // button is shown so the tap resolves cleanly instead of waiting on the
  // user's next visit to Scriptures / Studies.
  React.useEffect(() => {
    if (!showSurprise) return;
    if (typeof window.__loadBibleCorpus === 'function') {
      window.__loadBibleCorpus().catch((e) => console.warn('Bible corpus pre-load (surprise) failed', e));
    }
    if (typeof window.__loadMatthewCorpus === 'function') {
      window.__loadMatthewCorpus().catch((e) => console.warn('Matthew corpus pre-load (surprise) failed', e));
    }
    // bible-studies.js is a separate ~4.3 MB lazy script (translations.js
    // loadBibleStudies). Without it, study chapters never reach the dice pool.
    if (typeof loadBibleStudies === 'function') {
      loadBibleStudies().catch((e) => console.warn('Bible studies pre-load (surprise) failed', e));
    }
  }, [showSurprise]);

  // Cleanup timer + any in-flight doc listeners on unmount
  React.useEffect(() => () => {
    clearTimeout(pressTimerRef.current);
    if (activeCleanupRef.current) activeCleanupRef.current();
    if (dragCloneRef.current && dragCloneRef.current.parentNode)
    dragCloneRef.current.parentNode.removeChild(dragCloneRef.current);
  }, []);

  const setCardRef = (i) => (el) => {cardRefs.current[i] = el;};

  const clearInlineTransforms = () => {
    cardRefs.current.forEach((el) => {
      if (!el) return;
      el.style.transform = "";
      el.style.transition = "";
      el.style.zIndex = "";
      el.style.opacity = "";
    });
  };

  // Shift siblings out of the way of the dragged card based on current target slot.
  const applySiblingShifts = (newTarget) => {
    const from = dragIdxRef.current;
    const h = tileHeightRef.current;
    cardRefs.current.forEach((el, i) => {
      if (!el || i === from) return;
      let shift = 0;
      if (from < newTarget && i > from && i <= newTarget) shift = -h;else
      if (from > newTarget && i < from && i >= newTarget) shift = h;
      el.style.transition = "transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
      el.style.transform = `translateY(${shift}px)`;
    });
  };

  const startPress = (idx, clientY) => {
    if (pressingIdxRef.current >= 0 || dragIdxRef.current >= 0) return;
    pressStartYRef.current = clientY;
    pressStartTsRef.current = Date.now();
    // Track the intent in a ref immediately (for drift detection), but
    // delay the visible "pressing" glow + progress bar until the press
    // looks intentional (~280ms). Short taps should never flash it.
    pressingIdxRef.current = idx;
    clearTimeout(visualDelayTimerRef.current);
    visualDelayTimerRef.current = setTimeout(() => {
      if (pressingIdxRef.current === idx && dragIdxRef.current < 0) {
        setPressingIdx(idx);
      }
    }, 280);

    // Attach document listeners SYNCHRONOUSLY. No useEffect gap, no missed moves.
    const onMove = (e) => {
      const y = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
      if (dragIdxRef.current >= 0 && e.cancelable) {
        try {e.preventDefault();} catch (_err) { /* DOM access — element may not exist or API unsupported */ }
      }

      if (dragIdxRef.current >= 0) {
        // ACTIVE DRAG: move the fixed clone to follow the finger precisely
        const clone = dragCloneRef.current;
        if (clone) {
          clone.style.transition = "none";
          clone.style.top = y - fingerOffsetYRef.current + "px";
          clone.style.transform = "scale(1.05)";
        }
        // Determine drop slot by comparing clone's vertical center to natural card positions
        const naturalTops = naturalCardTopsRef.current;
        const h = tileHeightRef.current || 80;
        const centerY = y - fingerOffsetYRef.current + h * 0.5;
        let newTarget = 0;
        for (let i = 1; i < naturalTops.length; i++) {
          if (centerY >= naturalTops[i] - h * 0.3) newTarget = i;
        }
        newTarget = Math.max(0, Math.min(orderRef.current.length - 1, newTarget));
        if (newTarget !== targetIdxRef.current) {
          targetIdxRef.current = newTarget;
          applySiblingShifts(newTarget);
        }
      } else if (pressingIdxRef.current >= 0) {
        // PRESSING (pre-drag): cancel if finger drifts
        if (Math.abs(y - pressStartYRef.current) > 10) {
          clearTimeout(pressTimerRef.current);
          clearTimeout(visualDelayTimerRef.current);
          setPressingIdx(-1);
          pressingIdxRef.current = -1;
          if (Date.now() - pressStartTsRef.current > 400) {
            justDraggedRef.current = true;
            setTimeout(() => {justDraggedRef.current = false;}, 300);
          }
        }
      }
    };

    const onEnd = () => {
      if (activeCleanupRef.current) activeCleanupRef.current();
      endPress();
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    activeCleanupRef.current = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      activeCleanupRef.current = null;
    };

    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      // ~1.4s total from tap → ENTER DRAG MODE (280ms buffer + 1100ms hold)
      // Measure live slot height (card height + gap) from the DOM
      if (cardRefs.current[0] && cardRefs.current[1]) {
        tileHeightRef.current = cardRefs.current[1].offsetTop - cardRefs.current[0].offsetTop;
      } else if (cardRefs.current[0]) {
        tileHeightRef.current = cardRefs.current[0].offsetHeight + 10;
      }
      justDraggedRef.current = true;
      setPressingIdx(-1);
      setDragIdx(idx);
      targetIdxRef.current = idx;

      // The "pop" — card lifts off screen as a fixed-position clone that follows the finger.
      // The original becomes an invisible ghost that holds its space in the flow.
      const el = cardRefs.current[idx];
      if (el) {
        const rect = el.getBoundingClientRect();
        fingerOffsetYRef.current = pressStartYRef.current - rect.top;
        naturalCardTopsRef.current = cardRefs.current.map((r) => r ? r.getBoundingClientRect().top : 0);
        // Flying clone: fixed to viewport, floats above everything
        const clone = el.cloneNode(true);
        clone.className = "home-nav-item drag-flying";
        clone.style.cssText = [
        "position:fixed",
        "top:" + rect.top + "px",
        "left:" + rect.left + "px",
        "width:" + rect.width + "px",
        "height:" + rect.height + "px",
        "z-index:9999",
        "pointer-events:none",
        "margin:0",
        "box-sizing:border-box",
        "transition:transform 0.16s cubic-bezier(0.2,0.8,0.3,1)",
        "transform:scale(1.05)"].
        join(";");
        document.body.appendChild(clone);
        dragCloneRef.current = clone;
      }
      if (navigator.vibrate) {try {navigator.vibrate(55);} catch (_e) { /* DOM access — element may not exist or API unsupported */ }}
    }, 1380); // 280ms buffer + 1100ms hold — forgiving enough to avoid false triggers on quick taps
  };

  const endPress = () => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(visualDelayTimerRef.current);
    const wasPressing = pressingIdxRef.current >= 0;
    const wasDragging = dragIdxRef.current >= 0;
    setPressingIdx(-1);
    pressingIdxRef.current = -1;

    if (wasDragging) {
      const from = dragIdxRef.current;
      const to = targetIdxRef.current >= 0 ? targetIdxRef.current : from;
      const clone = dragCloneRef.current;
      // Snap the flying clone to the target slot's natural position, then remove it.
      if (clone) {
        const snapTop = naturalCardTopsRef.current[to] ?? naturalCardTopsRef.current[from] ?? 0;
        clone.style.transition = "top 0.22s cubic-bezier(0.2,0.8,0.3,1), transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
        clone.style.top = snapTop + "px";
        clone.style.transform = "scale(1)";
      }
      setTimeout(() => {
        // Snap complete — remove clone, wipe sibling transforms, commit new order.
        if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        dragCloneRef.current = null;
        clearInlineTransforms();
        if (to !== from && to >= 0) {
          const newOrder = [...orderRef.current];
          const [moved] = newOrder.splice(from, 1);
          newOrder.splice(to, 0, moved);
          setOrder(newOrder);
          try {localStorage.setItem("vot-home-order", JSON.stringify(newOrder));} catch (_e) { /* localStorage access — disabled / quota / privacy mode non-fatal */ }
        }
        setDragIdx(-1);
        targetIdxRef.current = -1;
        setTimeout(() => {justDraggedRef.current = false;}, 120);
      }, 240);
    } else if (wasPressing) {
      if (Date.now() - pressStartTsRef.current > 400) {
        justDraggedRef.current = true;
        setTimeout(() => {justDraggedRef.current = false;}, 300);
      }
    }
  };

  const handleTap = (id) => {
    if (id === "settings") {onSettings();return;}
    if (id === "history") {onHistory();return;}
    onSelect(id);
  };

  const isFirstVisit = !window.__homeAnimShown;
  React.useEffect(() => {window.__homeAnimShown = true;}, []);

  const orderedItems = order.map((id) => ITEMS_BY_ID[id]).filter((item) => {
    if (!item) return false;
    if (item.id === "history" && historyEnabled === false) return false;
    return true;
  });

  return (
    <ScreenLayout navChildren={
      <>
        <button className="nav-search-btn" onClick={onInfo} title="Welcome image" aria-label="Show welcome image" style={{ marginRight: '0.25rem', color: 'var(--gold)' }}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="10.5" y="2" width="3" height="20" rx="1" />
            <rect x="4" y="8" width="16" height="3" rx="1" />
          </svg>
        </button>
        <button className="nav-search-btn" onClick={onAbout} title="About VOTReader" aria-label="About VOTReader" style={{ marginRight: 'auto', color: 'var(--gold)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9.5" />
            <line x1="12" y1="11" x2="12" y2="17" strokeLinecap="round" />
            <circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button className="nav-search-btn" onClick={onSearch} title="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <ThemeBtn theme={theme} onThemeChange={onThemeChange} />
      </>
    }>
      <div className={`home-screen home-screen-app${isFirstVisit ? "" : " home-fast"}`}>
        <h1 className="home-main-title">The Volumes of Truth</h1>
        <div className="home-main-amp" aria-hidden="true">&amp;</div>
        <h2 className="home-main-title2">The Scriptures of Truth</h2>
        <div className="home-ornament">
          <div className="home-ornament-line" />
          <div className="home-ornament-diamond" />
          <div className="home-ornament-line r" />
        </div>
        <div className="home-nav-list">
          {orderedItems.map((item, i) => (
            <button
              key={item.id}
              ref={setCardRef(i)}
              className={`home-nav-item${i === pressingIdx ? " pressing" : ""}${i === dragIdx ? " dragging" : ""}`}
              onTouchStart={(e) => {
                if (e.touches && e.touches[0]) startPress(i, e.touches[0].clientY);
              }}
              onMouseDown={(e) => {
                if (e.button === 0) startPress(i, e.clientY);
              }}
              onClick={(e) => {
                if (justDraggedRef.current) {e.preventDefault();e.stopPropagation();return;}
                handleTap(item.id);
              }}
            >
              <span className="hni-text">
                <span className="hni-eyebrow">{item.eyebrow}</span>
                <span className="hni-title">{item.title}</span>
                <span className="hni-detail">{item.detail}</span>
              </span>
              <span className="hni-arrow">{"›"}</span>
            </button>
          ))}
        </div>
        {isFirstVisit && <span className="home-rearrange-hint">Hold to rearrange</span>}
        {showSurprise && (
          <button className="surprise-fab" onClick={onSurprise} title="Open a Random Chapter or Letter" aria-label="Surprise Me">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3.5" />
              <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="16" cy="8" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="8" cy="16" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="16" cy="16" r="1.15" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
      </div>
    </ScreenLayout>
  );
}
