/* ═══════════════════════════════════════════════════════════════════════
   AnnotationHint — Cluster D (esbuild bundle-d.js)
   ───────────────────────────────────────────────────────────────────────
   First-run discoverability for the annotation system: the long-press that
   opens the selection sheet is invisible chrome, so a new reader is told the
   ONE gesture in words.

   W2d (mock v2 r-letter, 2026-11-11): nothing floats over a reader, so the
   tip is no longer a pill over the text. It is the first row of the reader's
   More menu (MoreMenu.jsx), saying the tour's own words for the gesture
   (TourController.highlightWords(), tour-steps.js), so the two cannot drift.

   - Shown ONLY while the reader has ZERO highlights, notes AND bookmarks, and
     has not set the durable flag AnnHintDismissedFlagStore (bundle-b, IDB
     'vot-ann-hint-dismissed', hydrated before App renders). The store
     subscriptions re-render it to null the moment a first mark lands.
   - A tap on the row is "Got it": it sets the flag and closes the menu.
     SelectionToolbar sets the same flag on the reader's first long-press
     (hint1), so once the gesture is learned the row goes for good.
   - Stores and TourController are bundle-b bare globals (never imported: a
     second bundled copy would be a second, silent state); a host without
     them (bare tests) never shows the row.
   ═══════════════════════════════════════════════════════════════════════ */

/** Re-render on a store's notify; a missing store (bare tests) never notifies. @param {any} store */
function useVersion(store) {
  const ok = !!(store && typeof store.subscribe === 'function' && typeof store.getVersion === 'function');
  React.useSyncExternalStore(
    React.useCallback((/** @type {() => void} */ cb) => (ok ? store.subscribe(cb) : () => {}), [store, ok]),
    () => (ok ? store.getVersion() : 0)
  );
}

/** True while the tip still has someone to teach. */
export function useAnnotationHintWanted() {
  const has = typeof AnnotationStore !== 'undefined' && typeof NoteStore !== 'undefined'
    && typeof BookmarkStore !== 'undefined' && typeof TourController !== 'undefined';
  const flag = typeof AnnHintDismissedFlagStore !== 'undefined' ? AnnHintDismissedFlagStore : null;
  useVersion(has ? AnnotationStore : null);
  useVersion(has ? NoteStore : null);
  useVersion(has ? BookmarkStore : null);
  useVersion(flag);
  if (!has || !flag || flag.is()) return false;
  return !(Object.keys(AnnotationStore.all() || {}).length > 0 || NoteStore.count() > 0 || BookmarkStore.count() > 0);
}

const HAND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11.5V5.5a1.5 1.5 0 0 1 3 0v5" />
    <path d="M12 10.5v-1a1.5 1.5 0 0 1 3 0v2" />
    <path d="M15 11.5v-.5a1.5 1.5 0 0 1 3 0v3.5c0 3.5-2 6-5.5 6S7.3 18.6 6 16l-1.8-3.5a1.4 1.4 0 0 1 2.4-1.4L8 13V7" />
  </svg>
);

/**
 * The tip as a More-menu row. `onDone` closes the menu.
 * @param {{ onDone: () => void }} props
 */
export function AnnotationHintItem({ onDone }) {
  const wanted = useAnnotationHintWanted();
  if (!wanted) return null;
  return (
    <button type="button" role="menuitem" className="more-menu-item more-menu-hint"
      onClick={() => { AnnHintDismissedFlagStore.set(); onDone(); }}>
      {HAND}
      <span className="more-menu-item-text">
        <span>{TourController.highlightWords()}</span>
        <span className="more-menu-item-sub">Got it</span>
      </span>
    </button>
  );
}
