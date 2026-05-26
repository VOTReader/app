/* ═══════════════════════════════════════════════════════════════════════
   BookmarkIcon — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function BookmarkIcon({ hlKey }) {
  // Subscribe to BookmarkStore mutations — re-renders this component
  // whenever a bookmark is added / removed / updated. Replaces the
  // legacy hlTick cache-bust prop.
  React.useSyncExternalStore(
    React.useCallback((cb) => BookmarkStore.subscribe(cb), []),
    () => BookmarkStore.getVersion()
  );
  const bookmarks = BookmarkStore.getForKeyPrefix(hlKey);
  if (!bookmarks || bookmarks.length === 0) return null;

  const ids = bookmarks.map((b) => b.id);
  const open = (e) => {
    e.stopPropagation();
    e.preventDefault();
    // Single bookmark — open the create/edit sheet directly. atSource:true
    // suppresses the sheet's "Open Source" button (the user is already on
    // the bookmarked passage). Mirrors _buildBookmarkIcon's tap handler.
    if (ids.length === 1 && window.__bookmarkEdit) {
      window.__bookmarkEdit(ids[0], { atSource: true });
      return;
    }
    // Multiple bookmarks — the popover disambiguates.
    const rect = e.currentTarget.getBoundingClientRect();
    if (window.__openBookmarkPopover) {
      window.__openBookmarkPopover(ids, rect.left + rect.width / 2, rect.bottom + 4, hlKey);
    }
  };

  return (
    <span
      className={"inline-bookmark-icon" + (ids.length > 1 ? " inline-bookmark-icon-multi" : "")}
      onClick={open}
      title={ids.length === 1 ? "Bookmark" : ids.length + " bookmarks"}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
        <path
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
        />
      </svg>
    </span>
  );
}
