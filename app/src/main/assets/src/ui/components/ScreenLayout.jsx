/* ═══════════════════════════════════════════════════════════════════════
   ScreenLayout — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ScreenLayout({ navChildren, children, showProgress, hideTabsBtn }) {
  const ref = React.useCallback((el) => {__scrollEl = el;}, []);

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

  return (
    <div className="screen-layout">
      <nav className="top-nav">
        {navChildren}
        {hideTabsBtn ? null : <TabsNavBtn />}
      </nav>
      <div className="screen-scroll" ref={ref}>
        {children}
      </div>
    </div>
  );
}
