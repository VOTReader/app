/* ═══════════════════════════════════════════════════════════════════════
   LibraryScreen — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   One row per thing the reader keeps (the redesign, 2026-09-25, Codex
   mockup r4 take 1): icon, name, one line, the count at the right. The
   line says what the row holds, or while it is empty (Wave 0's guide) how
   to start it; an empty row shows no count, and screen readers hear
   "No notes yet" from an sr-only detail instead.

   Drag-to-reorder: same imperative DOM / long-press architecture as
   HomeScreen (1D reference) and TabsOverview (2D grid). The sibling
   shifts keep their 2D FLIP (nearest centre, real viewport coords), which
   serves one column of rows as the special case it is.

   Order is persisted via LibraryOrderStore (IDB, key vot-library-order).

   Ref-sync rule (from the TabsOverview fix): dragIdxRef.current and
   pressingIdxRef.current are set SYNCHRONOUSLY inside the 1.4 s timer
   callback, not only via useEffect. On mobile, touchmove fires before
   React re-renders so the useEffect-only path leaves the refs stale.
   ═══════════════════════════════════════════════════════════════════════ */

import { ACHIEVEMENT_STORE_NAMES, buildAchievements, collectAchievementSnapshot } from '../../utils/achievements.js';
import { isMarkKind } from '../../utils/mark-kinds.js';

// Abnormal-path trace for the tile drag — console.warn + DiagnosticLog so a
// failing device names itself (same pattern as [tabdrag]/[thumb]).
function _libDragTrace(msg) {
  try { console.warn('[libdrag] ' + msg); } catch (_e) { /* ignore */ }
  try {
    if (typeof DiagnosticLog !== 'undefined' && DiagnosticLog && typeof DiagnosticLog.error === 'function') {
      DiagnosticLog.error('libdrag', msg);
    }
  } catch (_e) { /* ignore */ }
}

/** Subscribe to one cross-bundle store by name (absent store = inert). */
function useStoreVersion(name) {
  const store = /** @type {any} */ (globalThis)[name];
  React.useSyncExternalStore(
    React.useCallback((cb) => (store && typeof store.subscribe === 'function') ? store.subscribe(cb) : () => {}, [store]),
    () => (store && typeof store.getVersion === 'function') ? store.getVersion() : 0
  );
}

export function LibraryScreen({ onBack, onOpenNotes, onOpenLinks, onOpenBookmarks, onOpenJournal, onOpenHighlights, onOpenProgress, onOpenMilestones, onOpenPlans, readingPlanCount, onOpenScriptureWeb, totalReadCount, readItems, theme, onThemeChange, onSearch, onHistory, onSettings, historyEnabled: _historyEnabled }) {
  ACHIEVEMENT_STORE_NAMES.forEach(useStoreVersion);   // fixed list — stable hook order
  // (AudioLibraryStore is in that list — the milestones chip counts listening.
  // The Listening Library itself moved to a HOME card on 2026-08-09.)

  const milestones = buildAchievements(collectAchievementSnapshot(readItems));

  const noteCount      = NoteStore.count();
  const linkCount      = LinkStore.all().length;
  const bookmarkCount  = (typeof BookmarkStore  !== 'undefined') ? BookmarkStore.count()  : 0;
  const journalCount   = (typeof JournalStore   !== 'undefined') ? JournalStore.count()   : 0;
  const highlightCount = (() => {
    if (typeof AnnotationStore === 'undefined') return 0;
    const data = AnnotationStore.all() || {};
    const seen = {};
    Object.keys(data).forEach(k => (data[k] || []).forEach(a => {
      if (isMarkKind(a.kind)) seen[a.groupId || a.id] = 1;
    }));
    return Object.keys(seen).length;
  })();

  // ── Tile metadata (static) ──────────────────────────────────────────
  // Defined inline so the SVG JSX resolves in component scope.
  //   count  the figure at the right, null while the row is empty
  //   unit   read after it by a screen reader only (" notes"), so the
  //          visible figures line up in one column
  //   empty  what a screen reader hears for an empty row
  //   desc   the second line while the row has something
  //   guide  Wave 0: the second line while it is EMPTY, a one-line "how X
  //          happens" in the voice of the destination screen's own empty
  //          state (NotesIndexScreen / BookmarksScreen / LinksScreen /
  //          HighlightsScreen / JournalHubScreen)
  const tally = (n, one, many) => ({
    count: n > 0 ? n.toLocaleString('en-US') : null,
    unit: ' ' + (n === 1 ? one : many),
    empty: 'No ' + many + ' yet',
  });
  const TILES_BY_ID = {
    notes: {
      id: 'notes', title: 'Notes', ...tally(noteCount, 'note', 'notes'),
      desc: 'Your notes on passages',
      guide: noteCount === 0 ? 'Long-press text in any chapter and tap Note.' : null,
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
      id: 'links', title: 'Links', ...tally(linkCount, 'link', 'links'),
      desc: 'Passages you joined together',
      guide: linkCount === 0 ? 'Select text, tap Link, and pick a destination.' : null,
      onClick: onOpenLinks,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
    journal: {
      id: 'journal', title: 'Journal', ...tally(journalCount, 'entry', 'entries'),
      desc: 'Your dated reflections',
      guide: journalCount === 0 ? 'Tap "New Entry" in the Journal to write your first reflection.' : null,
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
      id: 'bookmarks', title: 'Bookmarks', ...tally(bookmarkCount, 'bookmark', 'bookmarks'),
      desc: 'Places to come back to',
      guide: bookmarkCount === 0 ? 'Select text and tap Bookmark in the toolbar.' : null,
      onClick: onOpenBookmarks,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    highlights: {
      id: 'highlights', title: 'Highlights & Underlines', ...tally(highlightCount, 'mark', 'marks'),
      desc: 'Passages you marked',
      guide: highlightCount === 0 ? 'Select a passage and tap a color to highlight or underline it.' : null,
      onClick: onOpenHighlights,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M9 11l-4 4 4 4 11-11-4-4-7 7" />
          <line x1="13" y1="7" x2="17" y2="11" />
        </svg>
      ),
    },
    progress: {
      id: 'progress', title: 'Progress',
      count: totalReadCount ? totalReadCount.toLocaleString('en-US') + ' read' : null, unit: '',
      empty: 'Nothing read yet',
      desc: 'Your reading at a glance',
      guide: !totalReadCount ? 'Chapters you read are counted here.' : null,
      onClick: onOpenProgress,
      icon: (
        <svg viewBox="0 0 24 24">
          <line x1="6" y1="20" x2="6" y2="14" />
          <line x1="12" y1="20" x2="12" y2="9" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <path d="M3 20h18" />
        </svg>
      ),
    },
    // rp1: the way in to a reading plan (the Today card on Home shows it once it runs)
    plans: {
      id: 'plans', title: 'Reading plans',
      count: readingPlanCount ? String(readingPlanCount) : null, unit: readingPlanCount === 1 ? ' plan running' : ' plans running',
      empty: 'No plan yet',
      desc: 'Bible in a Year, the Volumes in order',
      guide: !readingPlanCount ? 'Read the Bible in a year, or the Volumes in order.' : null,
      onClick: onOpenPlans,
      icon: (
        <svg viewBox="0 0 24 24">
          <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" />
        </svg>
      ),
    },
    milestones: {
      id: 'milestones', title: 'Milestones',
      count: milestones.earned ? milestones.earned + ' of ' + milestones.total : null, unit: ' reached',
      empty: 'None reached yet',
      desc: 'Reading, listening and study',
      guide: !milestones.earned ? 'Reading, listening, and study all count toward these.' : null,
      onClick: onOpenMilestones,
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8z" />
        </svg>
      ),
    },
    'scripture-web': {
      id: 'scripture-web', title: 'Scripture Web',
      // Never empty and nothing of the reader's to count: the line carries its size.
      count: null, unit: '', empty: null,
      desc: '63,418 cross-references',
      // No guide: the "Still under construction." caption of 2026-09-05 left with the
      // Home shortcut's return (2026-09-11) — the tour teaches the web now, and a tile
      // one screen away saying it is not ready would contradict it.
      onClick: onOpenScriptureWeb,
      icon: (
        // Three nested arcs over a baseline — the visualization in miniature.
        <svg viewBox="0 0 24 24">
          <path d="M3 19a9 9 0 0 1 18 0" />
          <path d="M6 19a6 6 0 0 1 12 0" />
          <path d="M9 19a3 3 0 0 1 6 0" />
          <line x1="2" y1="19" x2="22" y2="19" />
        </svg>
      ),
    },
  };

  /* ── Drag-to-reorder — the SHARED pointer-events lifecycle ────────────
     (utils/press-drag.js — createPressDrag, extracted from the tabs v2
     redesign). This screen owns only the 2D grid geometry + visuals. */
  const libraryOrderVersion = React.useSyncExternalStore(
    React.useCallback((cb) => LibraryOrderStore.subscribe(cb), []),
    () => LibraryOrderStore.getVersion()
  );
  const [order, setOrder] = React.useState(() => LibraryOrderStore.get());
  React.useEffect(() => { setOrder(LibraryOrderStore.get()); }, [libraryOrderVersion]);
  const [pressingIdx, setPressingIdx] = React.useState(-1);
  const [dragIdx, setDragIdx] = React.useState(-1);

  const cardRefs = React.useRef([]);
  const orderRef = React.useRef(order);
  React.useEffect(() => { orderRef.current = order; }, [order]);

  const setCardRef = (i) => (el) => { cardRefs.current[i] = el; };

  const clearInlineTransforms = () => {
    cardRefs.current.forEach((el) => {
      if (!el) return;
      el.style.transform = ''; el.style.transition = '';
      el.style.zIndex = ''; el.style.opacity = '';
    });
  };

  // FLIP sibling shifts — 2D because the grid wraps rows.
  const applySiblingShifts = (from, to, rects) => {
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
  const pickTarget = (cx, cy, rects) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const dx = cx - rects[i].cx, dy = cy - rects[i].cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return Math.max(0, Math.min(orderRef.current.length - 1, best));
  };

  const dragRef = React.useRef(/** @type {any} */ (null));

  // Drop commit — SYNCHRONOUS at release: order write + transform clear land
  // in ONE paint while the ghost glides into the target slot above the
  // hidden real tile (tiles are keyed by ID, so the grabbed NODE persists
  // across the reorder — it is the reveal target).
  const commitDrop = (g) => {
    const from = g.idx;
    const to = g.targetIdx >= 0 ? Math.min(g.targetIdx, orderRef.current.length - 1) : from;
    clearInlineTransforms();
    setDragIdx(-1);
    setPressingIdx(-1);
    const grabbedEl = g.data.el || null;
    if (grabbedEl) grabbedEl.style.opacity = '0';
    try {
      if (to !== from && to >= 0) {
        const newOrder = [...orderRef.current];
        const [moved]  = newOrder.splice(from, 1);
        newOrder.splice(to, 0, moved);
        setOrder(newOrder);
        LibraryOrderStore.set(newOrder);
      }
    } catch (err) {
      _libDragTrace('reorder commit threw: ' + String(err).slice(0, 120));
    }
    const ghost = g.data.ghost;
    if (ghost) {
      const snap = g.data.rects && (g.data.rects[to] || g.data.rects[from]);
      if (snap) {
        ghost.style.transition =
          'left 0.22s cubic-bezier(0.2,0.8,0.3,1),top 0.22s cubic-bezier(0.2,0.8,0.3,1),transform 0.22s cubic-bezier(0.2,0.8,0.3,1)';
        ghost.style.left      = snap.left + 'px';
        ghost.style.top       = snap.top  + 'px';
        ghost.style.transform = 'scale(1)';
      }
    }
    dragRef.current.land(ghost, grabbedEl, 230);
  };

  if (!dragRef.current) {
    dragRef.current = createPressDrag({
      trace: _libDragTrace,
      onGlow: (idx) => setPressingIdx(idx),
      onGlowClear: () => setPressingIdx(-1),
      onEngage: (g) => {
        setDragIdx(g.idx);
        // Capture every card's natural viewport rect at drag start.
        g.data.rects = cardRefs.current.map((el) => {
          if (!el) return { left: 0, top: 0, cx: 0, cy: 0, w: 0, h: 0 };
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
        });
        const el = cardRefs.current[g.idx];
        g.data.el = el || null;
        if (el) {
          const rect = el.getBoundingClientRect();
          g.data.offX = g.startX - rect.left;
          g.data.offY = g.startY - rect.top;
          const ghost = el.cloneNode(true);
          ghost.className = 'library-tile drag-flying';
          ghost.style.cssText = [
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
          // A large Text Size stacks each row's count under its words through an
          // @container query on the list; the ghost lives on <body>, outside that
          // container, so it copies the row's computed layout to look the same.
          const srcMain = el.querySelector('.library-tile-main');
          const ghostMain = ghost.querySelector('.library-tile-main');
          if (srcMain && ghostMain) {
            const cs = getComputedStyle(srcMain);
            ghostMain.style.flexDirection = cs.flexDirection;
            ghostMain.style.alignItems = cs.alignItems;
            ghostMain.style.gap = cs.gap;
          }
          document.body.appendChild(ghost);
          g.data.ghost = ghost;
        }
        if (navigator.vibrate) { try { navigator.vibrate(55); } catch (_e) { /* unsupported */ } }
      },
      onDragMove: (g, x, y) => {
        const ghost = g.data.ghost;
        if (ghost) {
          ghost.style.transition = 'none';
          ghost.style.left = (x - g.data.offX) + 'px';
          ghost.style.top  = (y - g.data.offY) + 'px';
          ghost.style.transform = 'scale(1.05)';
        }
        const r0 = g.data.rects && g.data.rects[g.idx];
        const cx = (x - g.data.offX) + (r0 ? r0.w * 0.5 : 0);
        const cy = (y - g.data.offY) + (r0 ? r0.h * 0.5 : 0);
        const t = pickTarget(cx, cy, g.data.rects || []);
        if (t !== g.targetIdx) {
          g.targetIdx = t;
          applySiblingShifts(g.idx, t, g.data.rects || []);
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

  // Trim stale refs when a future reorder changes card count (safe no-op here,
  // but mirrors the TabsOverview pattern for consistency).
  cardRefs.current.length = order.length;

  const orderedTiles = order.map((id) => TILES_BY_ID[id]).filter(Boolean);

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack: onBack, onSearch: onSearch, onHistory: onHistory, onSettings: onSettings, theme: theme, onThemeChange: onThemeChange })}
    >
      <div className="library-screen">
        <header className="study-head">
          <h1 className="study-head-title">Library</h1>
          <p className="study-head-sub">Your notes, reflections and saved passages.</p>
        </header>
        <div className="library-grid">
          {orderedTiles.map((tile, i) => (
            <button
              key={tile.id}
              ref={setCardRef(i)}
              className={'library-tile' + (i === pressingIdx ? ' pressing' : '') + (i === dragIdx ? ' dragging' : '')}
              onClick={(e) => {
                if (dragRef.current.suppressed()) { e.preventDefault(); e.stopPropagation(); return; }
                tile.onClick();
              }}
              onPointerDown={(e) => {
                if (e.isPrimary === false) return; // a second finger never owns a gesture
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                startPress(i, e.clientX, e.clientY, e.pointerId);
              }}
              onDragStart={(e) => e.preventDefault()}
            >
              <span className="library-tile-icon" aria-hidden="true">{tile.icon}</span>
              {/* main: the words and the count, which wraps under them when a large
                  Text Size leaves no room beside them (app.css). */}
              <span className="library-tile-main">
                <span className="library-tile-text">
                  <span className="library-tile-title">{tile.title}</span>
                  {tile.guide
                    ? <span className="library-tile-guide">{tile.guide}</span>
                    : <span className="library-tile-desc">{tile.desc}</span>}
                </span>
                {tile.count != null
                  ? <span className="library-tile-detail">{tile.count}{tile.unit ? <span className="sr-only">{tile.unit}</span> : null}</span>
                  : tile.empty && <span className="library-tile-detail sr-only">{tile.empty}</span>}
              </span>
              <span className="library-tile-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
}
