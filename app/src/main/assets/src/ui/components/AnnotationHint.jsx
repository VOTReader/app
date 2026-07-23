/* ═══════════════════════════════════════════════════════════════════════
   AnnotationHint — Cluster D (esbuild bundle-d.js)
   ───────────────────────────────────────────────────────────────────────
   First-run discoverability for the annotation system. The long-press →
   toolbar gesture is invisible chrome: a brand-new reader has no way to
   learn that highlights/notes/bookmarks exist short of stumbling into a
   text selection. This pill teaches the ONE gesture, exactly once, to
   exactly the audience that needs it:

   - Renders ONLY while the user has ZERO annotations, notes, AND
     bookmarks — the moment they create their first mark the store
     subscription re-renders this to null, permanently (they have data
     now, so on every future boot the condition is already false). No
     persisted "seen" flag is needed: the data itself is the flag, so
     there's no IDB schema change and nothing new to export/import.
   - The ✕ dismissal is DURABLE (W0 P1-1): it records
     AnnHintDismissedFlagStore (bundle-b, IDB 'vot-ann-hint-dismissed',
     hydrated before App renders so the .is() read below is synchronous).
     The old session-only window flag let the pill re-pitch on every cold
     boot to exactly the dismissers who never annotate — the tail case the
     old design called acceptable, but a re-teach on every launch is a
     nag, not a tip. The window flag remains ONLY as the no-store fallback
     for bare-test hosts.
   - Waits ~2.5s after the reading screen mounts so it never competes
     with the page-load moment, and renders position:fixed OUTSIDE the
     .pager-track (ScreenLayout renders it as a stickyNav sibling) so a
     swipe-settle transform can't displace it.
   - The pill container is pointer-events:none (W0 P1-1, app.css) so it
     stops swallowing the very long-press it teaches; the ✕ re-enables
     pointer events on itself. That works because the ✕ is a native
     <button> with its OWN onClick — nothing is delegated to the now
     pointer-inert container. Keep it that way.
   ═══════════════════════════════════════════════════════════════════════ */

export function AnnotationHint() {
  // Store subscriptions — any first annotation/note/bookmark re-renders
  // this component and extinguishes the hint. Guarded typeof access: the
  // stores (bundle-b) always precede this component (bundle-d) at runtime,
  // but hosts that render ScreenLayout bare (tests) shouldn't need them.
  const _has = typeof AnnotationStore !== 'undefined'
    && typeof NoteStore !== 'undefined'
    && typeof BookmarkStore !== 'undefined';
  React.useSyncExternalStore(
    React.useCallback((cb) => (_has ? AnnotationStore.subscribe(cb) : () => {}), [_has]),
    () => (_has ? AnnotationStore.getVersion() : 0)
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (_has ? NoteStore.subscribe(cb) : () => {}), [_has]),
    () => (_has ? NoteStore.getVersion() : 0)
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (_has ? BookmarkStore.subscribe(cb) : () => {}), [_has]),
    () => (_has ? BookmarkStore.getVersion() : 0)
  );

  const [delayDone, setDelayDone] = React.useState(false);
  // Durable dismissal (W0 P1-1). AnnHintDismissedFlagStore is a bundle-b
  // bare global (same bridge as the data stores above) and is hydrated
  // before App renders, so the .is() read in the initializer is the
  // synchronous, post-hydration truth. Missing global (bare-test hosts)
  // → the old session-only window flag keeps those hosts working.
  const _flag = typeof AnnHintDismissedFlagStore !== 'undefined'
    ? AnnHintDismissedFlagStore : null;
  const [dismissed, setDismissed] = React.useState(
    () => (_flag ? _flag.is()
      : (typeof window !== 'undefined' && !!window.__annHintDismissed))
  );
  React.useEffect(() => {
    const t = setTimeout(() => setDelayDone(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // Missing stores (bare-test hosts) → treat as "has data": never show.
  const hasAnyData = !_has ||
    Object.keys(AnnotationStore.all() || {}).length > 0 ||
    NoteStore.count() > 0 ||
    BookmarkStore.count() > 0;

  if (hasAnyData || dismissed || !delayDone) return null;

  return (
    <div className="ann-hint-pill" role="status">
      <svg className="ann-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11.5V5.5a1.5 1.5 0 0 1 3 0v5" />
        <path d="M12 10.5v-1a1.5 1.5 0 0 1 3 0v2" />
        <path d="M15 11.5v-.5a1.5 1.5 0 0 1 3 0v3.5c0 3.5-2 6-5.5 6S7.3 18.6 6 16l-1.8-3.5a1.4 1.4 0 0 1 2.4-1.4L8 13V7" opacity="0.9" />
      </svg>
      <span className="ann-hint-text">
        Press and hold any text to highlight, note, or bookmark it
      </span>
      <button
        className="ann-hint-close"
        onClick={() => {
          // Persist first (survives the cold boot), then hide locally.
          // The no-store fallback keeps the legacy session semantics.
          if (_flag) _flag.set(); else window.__annHintDismissed = true;
          setDismissed(true);
        }}
        aria-label="Dismiss tip"
      >×</button>
    </div>
  );
}
