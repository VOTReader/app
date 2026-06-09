/* ═══════════════════════════════════════════════════════════════════════
   ScreenLayout — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScreenLayout({ navChildren, children, showProgress, hideTabsBtn }) {
  const scrollRef = React.useRef(null);
  const ref = React.useCallback((el) => {
    // __scrollEl is a mutable `let` GLOBAL declared in index.html (line ~515),
    // read by use-scroll-memory + use-thumbnails. It is a lexical global, NOT a
    // window property, so it must be assigned by bare name (window.__scrollEl
    // would be a different binding the readers never see). The auto-generated
    // globals.d.ts declares every global `const`, so this legitimate
    // reassignment trips a false TS2588 — suppress just this line.
    // @ts-expect-error -- generated-globals const-vs-let mismatch (see above)
    __scrollEl = el;
    scrollRef.current = el;
  }, []);

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
      suppressFn = (ev) => { ev.stopPropagation(); ev.preventDefault(); cleanupSuppress(); };
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
      <div className="screen-scroll" ref={ref}>
        {children}
      </div>
      <div className="scroll-notch-marker" ref={notchRef} />
    </div>
  );
}
