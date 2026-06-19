/* ═══════════════════════════════════════════════════════════════════════
   ScreenLayout — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { usePagerGesture } from '../../hooks/use-pager-gesture.js';
import { PagerPeek } from './pager-preview.jsx';

export function ScreenLayout({ navChildren, children, showProgress, hideTabsBtn, trackScroll = true, pager, stickyNav }) {
  const scrollRef = React.useRef(null);
  // Finger-follow page swipe. No-op when `pager` is absent (every non-reading
  // screen). When present, both neighbor peeks are pre-mounted and parked at
  // their CSS ±100% defaults; usePagerGesture hands their refs to the controller
  // which drives them imperatively — no React state fires during the swipe.
  const { trackRef, peekPrevRef, peekNextRef } = usePagerGesture(scrollRef, pager);
  // Compute neighbor peek descriptors at render time. Pre-mounted peeks update
  // on each screen render (e.g. after navigation) with zero swipe-path cost.
  const prevDesc = pager && typeof pager.peek === 'function' ? pager.peek('prev') : null;
  const nextDesc = pager && typeof pager.peek === 'function' ? pager.peek('next') : null;
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
    if (trackScroll) {
      // @ts-expect-error -- generated-globals const-vs-let mismatch (see above)
      __scrollEl = el;
    }
    scrollRef.current = el;
  }, [trackScroll]);

  const notchRef = React.useRef(null);

  React.useEffect(() => {
    if (!showProgress) return;
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
  }, [showProgress]);

  React.useEffect(() => {
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
  }, []);

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
    const el = scrollRef.current;
    if (!el) return;
    let startX = 0, startY = 0, startScrollTop = 0, startTime = 0, didScroll = false;
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
      cleanupSuppress();
    };
    const onMove = (e) => {
      if (didScroll || !e.touches || !e.touches[0]) return;
      const dy = Math.abs(e.touches[0].clientY - startY);
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy > 8 && dy > dx) didScroll = true;
    };
    const onEndCapture = (e) => {
      // Suppress scroll-lifts (finger moved) and long-holds (finger held > 300 ms).
      // Either means the gesture was not a tap — clicking whatever you landed on
      // would be accidental. Small WebView scrolls below the 8px touchmove delta
      // are caught by the scrollTop change check.
      const scrolled = didScroll || el.scrollTop !== startScrollTop;
      const tooLong = (performance.now() - startTime) > 300;
      if (!scrolled && !tooLong) { didScroll = false; return; }
      didScroll = false;
      cleanupSuppress();
      // Signal __nativeTapAnnotation (highlight marks on Android) to skip this lift.
      window.__scrollLiftPending = true;
      if (e.target && e.target.closest && e.target.closest(INTERACTIVE_SEL)) {
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
  }, []);

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
