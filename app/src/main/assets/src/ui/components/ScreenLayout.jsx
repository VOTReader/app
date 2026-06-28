/* ═══════════════════════════════════════════════════════════════════════
   ScreenLayout — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { usePagerGesture } from '../../hooks/use-pager-gesture.js';
import { PagerPeek } from './pager-preview.jsx';

// Apply a saved scroll record ({ anchorKey, anchorOff, y } | legacy number) to a
// given scroll container — used for the inert peek so it renders already at the
// neighbor's saved offset (a swipe lands where the live screen restores to, no
// top-then-jump). Prefers the content anchor (its data-hl-key element); falls
// back to the saved pixel y. The peek's reading blocks are content-visibility:
// visible, so heights are REAL and the anchor position is accurate immediately.
function applySavedScrollToEl(el, saved) {
  if (!el || !saved) return;
  const anchorKey = (typeof saved === 'object') ? saved.anchorKey : null;
  if (anchorKey) {
    const a = el.querySelector('[data-hl-key="' + String(anchorKey).replace(/"/g, '\\"') + '"]');
    if (a) {
      const aTop = (a.getBoundingClientRect().top - el.getBoundingClientRect().top) + el.scrollTop;
      el.scrollTop = Math.max(0, Math.round(aTop + (saved.anchorOff || 0)));
      return;
    }
  }
  const y = (typeof saved === 'number') ? saved : (typeof saved.y === 'number' ? saved.y : 0);
  if (y > 0) el.scrollTop = y;
}

export function ScreenLayout({ navChildren, children, showProgress, hideTabsBtn, trackScroll = true, pager, stickyNav, inert = false, restoreScroll = null }) {
  const scrollRef = React.useRef(null);
  // `inert`: this ScreenLayout is a THROWAWAY visual clone of a neighbor screen,
  // mounted by the pager (PagerPeek) UNDER the live screen so the finger-follow
  // swipe drags the REAL next/prev page (identical UI, width, wrapping, inline
  // annotation icons) instead of a separate spoof. An inert clone must claim
  // NONE of the app-wide singletons the live screen owns — the global scroll
  // element, the swipe gesture, the reading-progress / scroll-notch effects, the
  // tap-suppressor — or it would fight the live screen for them. Every such path
  // below is gated on !inert; the live screen keeps sole ownership. Visual
  // rendering (incl. the document-wide annotation paint, which keys per-element
  // by data-hl-key so it isolates the two panes) is NOT suppressed — that's what
  // makes the peek arrive already painted, before release.
  const activePager = inert ? null : pager;
  // Finger-follow page swipe. No-op when `pager` is absent (every non-reading
  // screen) or when inert (a clone never nests its own gesture/peeks). When
  // present, both neighbor peeks are pre-mounted and parked at their CSS ±100%
  // defaults; usePagerGesture hands their refs to the controller which drives
  // them imperatively — no React state fires during the swipe.
  const { trackRef, peekPrevRef, peekNextRef } = usePagerGesture(scrollRef, activePager);
  // Compute neighbor peek descriptors at render time. Pre-mounted peeks update
  // on each screen render (e.g. after navigation) with zero swipe-path cost.
  // Never computed when inert — a clone must not build grand-neighbor peeks.
  const prevDesc = activePager && typeof activePager.peek === 'function' ? activePager.peek('prev') : null;
  const nextDesc = activePager && typeof activePager.peek === 'function' ? activePager.peek('next') : null;
  const ref = React.useCallback((el) => {
    // __scrollEl is a mutable `let` GLOBAL declared in index.html (line ~515),
    // read by use-scroll-memory + use-thumbnails. It is a lexical global, NOT a
    // window property, so it must be assigned by bare name (window.__scrollEl
    // would be a different binding the readers never see). The auto-generated
    // globals.d.ts declares every global `const`, so this legitimate
    // reassignment trips a false TS2588 — suppress just this line.
    //
    // trackScroll gates this: ONLY the primary screen container (the one in the
    // ROUTES slot) is the scroll-memory / thumbnail target. An OVERLAY that
    // reuses ScreenLayout for its chrome while a real screen is still mounted
    // underneath (the Tabs overview) passes trackScroll={false} — otherwise it
    // hijacks __scrollEl on open and, worse, NULLS it on unmount (the screen
    // underneath never re-registers its ref), silently killing scroll recording
    // on that screen until the next navigation. Default true: every real screen.
    if (trackScroll && !inert) {
      // @ts-expect-error -- generated-globals const-vs-let mismatch (see above)
      __scrollEl = el;
    }
    scrollRef.current = el;
  }, [trackScroll, inert]);

  const notchRef = React.useRef(null);
  // The inert peek's scroll container (only used when inert). A layout effect
  // restores the neighbor's saved scroll onto it BEFORE paint, so the peek is
  // already at the right offset while it slides in.
  const inertScrollRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!inert) return;
    applySavedScrollToEl(inertScrollRef.current, restoreScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on the saved record's primitive fields (not its object identity, which is rebuilt each render) so this re-applies only when the target offset actually changes.
  }, [inert, restoreScroll && restoreScroll.anchorKey, restoreScroll && restoreScroll.anchorOff, restoreScroll && restoreScroll.y]);

  React.useEffect(() => {
    if (inert || !showProgress) return;
    const onScroll = () => {
      if (!__scrollEl) return;
      const { scrollTop, scrollHeight, clientHeight } = __scrollEl;
      const sentinel = __scrollEl.querySelector('.reading-end');
      let max;
      if (sentinel) {
        const containerTop = __scrollEl.getBoundingClientRect().top;
        const sentinelTop = sentinel.getBoundingClientRect().top;
        const sentinelOffset = sentinelTop - containerTop + scrollTop;
        max = Math.max(sentinelOffset - clientHeight, 1);
      } else {
        max = Math.max(scrollHeight - clientHeight, 1);
      }
      const pct = Math.min(scrollTop / max, 1);
      if (pct >= 0.9 && window.__onReadingComplete) window.__onReadingComplete();
    };
    let el = null;
    const attach = () => {
      if (__scrollEl !== el) {
        if (el) el.removeEventListener("scroll", onScroll);
        el = __scrollEl;
        if (el) el.addEventListener("scroll", onScroll, { passive: true });
      }
    };
    attach();
    const poll = setInterval(attach, 300);
    return () => {
      clearInterval(poll);
      if (el) el.removeEventListener("scroll", onScroll);
    };
  }, [showProgress, inert]);

  React.useEffect(() => {
    if (inert) return;
    const marker = notchRef.current;
    if (!marker) return;
    const update = () => {
      const el = __scrollEl;
      if (!el || !document.body.classList.contains('scroll-notch')) {
        marker.style.opacity = '0';
        return;
      }
      const sentinel = el.querySelector('.reading-end');
      if (!sentinel || el.scrollHeight <= el.clientHeight) {
        marker.style.opacity = '0';
        return;
      }
      const scrollRect = el.getBoundingClientRect();
      const sentinelOffset = sentinel.getBoundingClientRect().top - scrollRect.top + el.scrollTop;
      const pct = sentinelOffset / el.scrollHeight;
      marker.style.top = (scrollRect.top + pct * scrollRect.height) + 'px';
      marker.style.opacity = '0.5';
    };
    update();
    const ro = new ResizeObserver(update);
    if (__scrollEl) ro.observe(__scrollEl);
    const poll = setInterval(() => {
      if (__scrollEl) { ro.observe(__scrollEl); update(); }
    }, 500);
    return () => { ro.disconnect(); clearInterval(poll); };
  }, [inert]);

  // Suppress accidental taps that fire when a scrolling finger lifts on an
  // interactive element (footnote marker, highlight, icon, etc.). When the
  // finger moves >8 px vertically (and more vertically than horizontally, so
  // horizontal swipes aren't mistaken) we know it was a scroll, not a tap.
  // The renderer attaches native `touchend` listeners directly on elements
  // (dom-bookmarks, dom-links, annotation-engine) — those fire BEFORE any
  // bubble-phase listener on this container. So we use capture-phase on all
  // three events: capture fires top-down, reaching us BEFORE the element's
  // own handlers. On a scroll-end over an interactive element we stopPropagation
  // to block the native touchend handlers, then add a one-shot capture-phase
  // click suppressor to eat the synthesised click Android WebView also fires.
  React.useEffect(() => {
    if (inert) return;
    const el = scrollRef.current;
    if (!el) return;
    let startX = 0, startY = 0, startScrollTop = 0, startTime = 0, didScroll = false, didSwipeX = false;
    let suppressFn = null, suppressTid = null;

    const cleanupSuppress = () => {
      if (suppressFn) { document.removeEventListener('click', suppressFn, true); suppressFn = null; }
      if (suppressTid !== null) { clearTimeout(suppressTid); suppressTid = null; }
      window.__scrollLiftPending = false;
    };

    const INTERACTIVE_SEL = 'button, a, .fn-ref, .inline-scrip-ref, .letter-link-ref, '
      + '.tap-ref, .inline-bookmark-icon, .verse-link-icon, .inline-link-icon, .hl-note-icon';

    const onStart = (e) => {
      if (!e.touches || !e.touches[0]) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startScrollTop = el.scrollTop;
      startTime = performance.now();
      didScroll = false;
      didSwipeX = false;
      cleanupSuppress();
    };
    const onMove = (e) => {
      if (didScroll || didSwipeX || !e.touches || !e.touches[0]) return;
      const dy = Math.abs(e.touches[0].clientY - startY);
      const dx = Math.abs(e.touches[0].clientX - startX);
      // Lock the first axis intent (mirrors the pager's decideAxis: horizontal
      // must dominate ×1.3). A horizontal lock means the pager owns this gesture,
      // so onEndCapture must NOT stopPropagation the touchend — that would kill
      // the pager's same-element bubble end() and freeze the page mid-swipe with
      // no snap (the Matthew "holds part-way" bug, where dense study-note buttons
      // make almost every swipe start on an interactive target).
      if (dy > 8 && dy > dx) didScroll = true;
      else if (dx > 8 && dx > dy * 1.3) didSwipeX = true;
    };
    const onEndCapture = (e) => {
      // Suppress scroll-lifts (finger moved) and long-holds (finger held > 300 ms).
      // Either means the gesture was not a tap — clicking whatever you landed on
      // would be accidental. Small WebView scrolls below the 8px touchmove delta
      // are caught by the scrollTop change check.
      const scrolled = didScroll || el.scrollTop !== startScrollTop;
      const tooLong = (performance.now() - startTime) > 300;
      if (!scrolled && !tooLong) { didScroll = false; didSwipeX = false; return; }
      const wasSwipeX = didSwipeX;   // a horizontal pager swipe owns this lift
      didScroll = false;
      didSwipeX = false;
      cleanupSuppress();
      // Signal __nativeTapAnnotation (highlight marks on Android) to skip this lift.
      window.__scrollLiftPending = true;
      // Block the renderer's own touchend handler on the interactive target the
      // finger lifted over (an accidental ref/note open after a non-tap lift) —
      // but NEVER for a horizontal pager swipe: this is a capture-phase listener
      // on .screen-scroll, so stopPropagation here also cancels the pager's
      // same-element bubble end(), freezing the page mid-swipe. The pager cancels
      // its own accidental tap (preventDefault on the horizontal touchmove), and
      // the document-level click suppressor below still eats any synthesised click.
      if (!wasSwipeX && e.target && e.target.closest && e.target.closest(INTERACTIVE_SEL)) {
        e.stopPropagation();
      }
      // Only eat the ACCIDENTAL click on the reading content the finger lifted
      // over — i.e. a click whose target is inside this scroll container. A
      // deliberate tap on chrome OUTSIDE the scroll area (the Tabs button and
      // every other .top-nav control, FABs, the selection toolbar) must pass
      // through, even when it lands within 300 ms of a scroll. The suppressor
      // is document-wide on purpose (it must out-race the renderer's own
      // element-level touchend handlers, which run before any bubble listener),
      // so without this target scope it silently swallowed the next tap on ANY
      // nav button after a scroll — the "Tabs button lights up but does
      // nothing" bug. We still clean up unconditionally so the one-shot window
      // closes whether or not this particular click was suppressed.
      suppressFn = (ev) => {
        if (el.contains(ev.target)) { ev.stopPropagation(); ev.preventDefault(); }
        cleanupSuppress();
      };
      document.addEventListener('click', suppressFn, true);
      suppressTid = setTimeout(cleanupSuppress, 300);
    };

    el.addEventListener('touchstart', onStart, { capture: true, passive: true });
    el.addEventListener('touchmove', onMove, { capture: true, passive: true });
    el.addEventListener('touchend', onEndCapture, { capture: true });
    return () => {
      el.removeEventListener('touchstart', onStart, true);
      el.removeEventListener('touchmove', onMove, true);
      el.removeEventListener('touchend', onEndCapture, true);
      cleanupSuppress();
    };
  }, [inert]);

  // Inert clone (a pager peek): render ONLY the scrollable content, in a
  // container whose box model is byte-identical to the live `.screen-scroll`
  // (same overflow/scrollbar-gutter → same content width → same text wrapping).
  // No top-nav (the live nav stays fixed and identical), no sticky nav, no
  // pager-viewport (a clone never nests its own peeks), no scroll-notch marker.
  // The `.pager-peek` parent (PagerPeek) is position:absolute with a fixed
  // height, so height:100% sizes this without a flex parent.
  if (inert) {
    return <div className="screen-scroll" style={{ height: '100%' }} ref={inertScrollRef}>{children}</div>;
  }

  return (
    <div className="screen-layout">
      <nav className="top-nav">
        {navChildren}
        {hideTabsBtn ? null : <TabsNavBtn />}
      </nav>
      {pager ? (
        <div className="pager-viewport">
          <div className="screen-scroll" ref={ref}>
            <div className="pager-track" ref={trackRef}>{children}</div>
          </div>
          {prevDesc && <PagerPeek side="prev" desc={prevDesc} peekRef={peekPrevRef} />}
          {nextDesc && <PagerPeek side="next" desc={nextDesc} peekRef={peekNextRef} />}
        </div>
      ) : (
        <div className="screen-scroll" ref={ref}>
          {children}
        </div>
      )}
      {stickyNav}
      <div className="scroll-notch-marker" ref={notchRef} />
    </div>
  );
}
