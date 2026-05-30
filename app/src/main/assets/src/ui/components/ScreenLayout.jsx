/* ═══════════════════════════════════════════════════════════════════════
   ScreenLayout — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScreenLayout({ navChildren, children, showProgress, hideTabsBtn }) {
  const ref = React.useCallback((el) => {
    // __scrollEl is a mutable `let` GLOBAL declared in index.html (line ~515),
    // read by use-scroll-memory + use-thumbnails. It is a lexical global, NOT a
    // window property, so it must be assigned by bare name (window.__scrollEl
    // would be a different binding the readers never see). The auto-generated
    // globals.d.ts declares every global `const`, so this legitimate
    // reassignment trips a false TS2588 — suppress just this line.
    // @ts-expect-error -- generated-globals const-vs-let mismatch (see above)
    __scrollEl = el;
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
