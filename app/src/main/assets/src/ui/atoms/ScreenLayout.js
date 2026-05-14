function ScreenLayout({ navChildren, children, showProgress, hideTabsBtn }) {
  const ref = React.useCallback((el) => {window.__scrollEl = el;}, []);

  React.useEffect(() => {
    if (!showProgress) return;
    const onScroll = () => {
      if (!window.__scrollEl) return;
      const { scrollTop, scrollHeight, clientHeight } = window.__scrollEl;
      const sentinel = window.__scrollEl.querySelector('.reading-end');
      let max;
      if (sentinel) {
        const containerTop = window.__scrollEl.getBoundingClientRect().top;
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
      if (window.__scrollEl !== el) {
        if (el) el.removeEventListener("scroll", onScroll);
        el = window.__scrollEl;
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

  return (/*#__PURE__*/
    React.createElement("div", { className: "screen-layout" }, /*#__PURE__*/
    React.createElement("nav", { className: "top-nav" }, navChildren, hideTabsBtn ? null : /*#__PURE__*/React.createElement(TabsNavBtn, null)), /*#__PURE__*/
    React.createElement("div", { className: "screen-scroll", ref: ref },
    children
    )
    ));
}
