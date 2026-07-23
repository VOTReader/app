/* ═══════════════════════════════════════════════════════════════════════
   HomeScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

// Abnormal-path trace for the tile drag — console.warn + DiagnosticLog so a
// failing device names itself (same pattern as [tabdrag]/[thumb]).
function _homeDragTrace(msg) {
  try { console.warn('[homedrag] ' + msg); } catch (_e) { /* ignore */ }
  try {
    if (typeof DiagnosticLog !== 'undefined' && DiagnosticLog && typeof DiagnosticLog.error === 'function') {
      DiagnosticLog.error('homedrag', msg);
    }
  } catch (_e) { /* ignore */ }
}

export function HomeScreen({ onSelect, onSurprise, showSurprise, onSettings, onSearch, onHistory, historyEnabled, onAbout, history: _history, theme, onThemeChange, translation }) {
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
    scriptures: { id: "scriptures", eyebrow: "The Holy Bible", title: "The Scriptures of Truth", detail: `Genesis to Revelation · ${translationLabel(translation)}` },
    studies: { id: "studies", eyebrow: "Study Editions", title: "Studies", detail: "Letter Studies · Matthew Study Bible" },
    library: { id: "library", eyebrow: "Personal Study", title: "Library", detail: "Notes, journal & bookmarks" },
    settings: { id: "settings", eyebrow: "App Configuration", title: "Settings", detail: "Display, themes & preferences" },
    history: { id: "history", eyebrow: "Recently Visited", title: "History", detail: "Resume where you left off" }
  };
  // DEFAULT_ORDER + the validation logic moved into HomeOrderStore
  // (W2.3b.4). HomeScreen reads via the store; HydrationGate has
  // resolved by the time this component mounts so the read is sync
  // from the in-memory cache.
  const [order, setOrder] = React.useState(() => HomeOrderStore.get());

  /* Drag architecture — IMPERATIVE DOM, not React state.
     React state re-renders at <60fps in Android WebView; direct writes to
     element.style.transform are effectively instant. We only keep state
     for what drives CSS classes (.pressing, .dragging) and for the final
     order commit. */
  /* Drag-to-reorder rides the SHARED pointer-events lifecycle
     (utils/press-drag.js — createPressDrag, extracted from the tabs v2
     redesign): one gesture object, document-capture listeners, force-reset
     on every new grab, explicit pointercancel commit, landing glide, click
     suppression. This screen owns only the 1D geometry + visuals. */
  const [pressingIdx, setPressingIdx] = React.useState(-1);
  const [dragIdx, setDragIdx] = React.useState(-1);

  const cardRefs = React.useRef([]); // DOM refs to each card
  const orderRef = React.useRef(order);
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
  const applySiblingShifts = (from, newTarget, h) => {
    cardRefs.current.forEach((el, i) => {
      if (!el || i === from) return;
      let shift = 0;
      if (from < newTarget && i > from && i <= newTarget) shift = -h;else
      if (from > newTarget && i < from && i >= newTarget) shift = h;
      el.style.transition = "transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
      el.style.transform = `translateY(${shift}px)`;
    });
  };

  // The shared lifecycle — created once; the callbacks below read only refs
  // + stable setters, so first-render closures stay correct.
  const dragRef = React.useRef(/** @type {any} */ (null));

  // Drop commit — SYNCHRONOUS at release: the order write + transform clear
  // land in ONE paint while the ghost glides into the target slot above the
  // hidden real tile. Tiles are keyed by ID, so the grabbed NODE persists
  // across the reorder — it is the reveal target at landing.
  const commitDrop = (g) => {
    const from = g.idx;
    const to = g.targetIdx >= 0 ? Math.min(g.targetIdx, orderRef.current.length - 1) : from;
    clearInlineTransforms();
    setDragIdx(-1);
    setPressingIdx(-1);
    const grabbedEl = g.data.el || null;
    if (grabbedEl) grabbedEl.style.opacity = "0";
    try {
      if (to !== from && to >= 0) {
        const newOrder = [...orderRef.current];
        const [moved] = newOrder.splice(from, 1);
        newOrder.splice(to, 0, moved);
        setOrder(newOrder);
        HomeOrderStore.set(newOrder);
      }
    } catch (err) {
      _homeDragTrace('reorder commit threw: ' + String(err).slice(0, 120));
    }
    const ghost = g.data.ghost;
    if (ghost) {
      const snapTop = (g.data.tops && (g.data.tops[to] ?? g.data.tops[from])) ?? 0;
      ghost.style.transition = "top 0.22s cubic-bezier(0.2,0.8,0.3,1), transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
      ghost.style.top = snapTop + "px";
      ghost.style.transform = "scale(1)";
    }
    dragRef.current.land(ghost, grabbedEl, 230);
  };

  if (!dragRef.current) {
    dragRef.current = createPressDrag({
      trace: _homeDragTrace,
      onGlow: (idx) => setPressingIdx(idx),
      onGlowClear: () => setPressingIdx(-1),
      // DRAG MODE (~1.4s hold): measure the live slot height, capture the
      // natural tops, and lift the tile off as a fixed-position ghost.
      onEngage: (g) => {
        setDragIdx(g.idx);
        let h = 80;
        if (cardRefs.current[0] && cardRefs.current[1]) {
          h = cardRefs.current[1].offsetTop - cardRefs.current[0].offsetTop;
        } else if (cardRefs.current[0]) {
          h = cardRefs.current[0].offsetHeight + 10;
        }
        g.data.h = h;
        g.data.tops = cardRefs.current.map((r) => r ? r.getBoundingClientRect().top : 0);
        const el = cardRefs.current[g.idx];
        g.data.el = el || null;
        if (el) {
          const rect = el.getBoundingClientRect();
          g.data.offY = g.startY - rect.top;
          const ghost = el.cloneNode(true);
          ghost.className = "home-nav-item drag-flying";
          ghost.style.cssText = [
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
          document.body.appendChild(ghost);
          g.data.ghost = ghost;
        }
        if (navigator.vibrate) {try {navigator.vibrate(55);} catch (_e) { /* unsupported — ignore */ }}
      },
      // ACTIVE DRAG: the ghost follows the finger vertically; the drop slot
      // is picked against the captured natural tops.
      onDragMove: (g, _x, y) => {
        const ghost = g.data.ghost;
        if (ghost) {
          ghost.style.transition = "none";
          ghost.style.top = (y - g.data.offY) + "px";
          ghost.style.transform = "scale(1.05)";
        }
        const tops = g.data.tops || [];
        const h = g.data.h || 80;
        const centerY = y - g.data.offY + h * 0.5;
        let t = 0;
        for (let i = 1; i < tops.length; i++) {
          if (centerY >= tops[i] - h * 0.3) t = i;
        }
        t = Math.max(0, Math.min(orderRef.current.length - 1, t));
        if (t !== g.targetIdx) {
          g.targetIdx = t;
          applySiblingShifts(g.idx, t, h);
        }
      },
      onCommit: commitDrop,
      onAbortDrag: (g) => {
        if (g.data.ghost && g.data.ghost.parentNode) g.data.ghost.parentNode.removeChild(g.data.ghost);
        clearInlineTransforms();
        setDragIdx(-1);
      },
    });
  }

  // Unmount mid-gesture: one call tears down timers, listeners, ghost, landing.
  React.useEffect(() => () => { dragRef.current.destroy(); }, []);

  const startPress = (idx, clientX, clientY, pointerId) =>
    dragRef.current.start(idx, clientX, clientY, pointerId, cardRefs.current[idx]);

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
              onPointerDown={(e) => {
                if (e.isPrimary === false) return; // a second finger never owns a gesture
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                startPress(i, e.clientX, e.clientY, e.pointerId);
              }}
              onDragStart={(e) => e.preventDefault()}
              onClick={(e) => {
                if (dragRef.current.suppressed()) {e.preventDefault();e.stopPropagation();return;}
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
          /* Wave 0: the breathing dice was visually anonymous — a sighted
             user had no way to know what it does. The visible caption
             matches the accessible name (label-in-name) so the two never
             drift; aria-hidden keeps the name sourced from aria-label
             alone. */
          <button className="surprise-fab" onClick={onSurprise} title="Open a Random Chapter or Letter" aria-label="Surprise Me">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3.5" />
              <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="16" cy="8" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="8" cy="16" r="1.15" fill="currentColor" stroke="none" />
              <circle cx="16" cy="16" r="1.15" fill="currentColor" stroke="none" />
            </svg>
            <span className="surprise-fab-caption" aria-hidden="true">Surprise Me</span>
          </button>
        )}
      </div>
    </ScreenLayout>
  );
}
