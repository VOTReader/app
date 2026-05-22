/* ═══════════════════════════════════════════════════════════════════════
   ChapterBookmarkBtn — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function ChapterBookmarkBtn({ chapterBookmark, hlTick }) {
  if (!chapterBookmark || !chapterBookmark.hlKey || typeof BookmarkStore === 'undefined') return null;
  // React.useMemo so we re-derive only when hlTick changes (after a create/delete).
  const existing = React.useMemo(
    () => BookmarkStore.getForKey(chapterBookmark.hlKey),
    [chapterBookmark.hlKey, hlTick]
  );
  const isBookmarked = existing.length > 0;

  const onClick = (e) => {
    e.stopPropagation();
    if (isBookmarked) {
      // Open the popover near the button so the user can edit thought / delete.
      const rect = e.currentTarget.getBoundingClientRect();
      const ids = existing.map(b => b.id);
      if (window.__openBookmarkPopover) {
        window.__openBookmarkPopover(ids, rect.left + rect.width / 2, rect.bottom + 4, chapterBookmark.hlKey);
      }
      return;
    }
    // Open the pre-commit create sheet so the user can refine label +
    // attach a thought before persisting. Same flow as the
    // SelectionToolbar bookmark action — consistent experience whether
    // the user bookmarks a phrase or a whole chapter.
    if (window.__bookmarkCreate) {
      window.__bookmarkCreate({
        hlKey: chapterBookmark.hlKey,
        sourceLabel: chapterBookmark.label || '',
        excerpt: '',
        defaultLabel: chapterBookmark.label || 'Chapter bookmark'
      });
    } else {
      // Fallback (bridge missing): silent-add so the action is never lost.
      BookmarkStore.add({
        id: (typeof bkmId === 'function') ? bkmId() : ('bkm_' + Date.now()),
        hlKey: chapterBookmark.hlKey,
        label: chapterBookmark.label || 'Chapter bookmark',
        thought: '',
        created: Date.now(),
        updated: Date.now()
      });
      if (window.__bumpHlTick) window.__bumpHlTick();
    }
  };

  return (
    <button
      className={"nav-bookmark-btn" + (isBookmarked ? " nav-bookmark-btn-active" : "")}
      onClick={onClick}
      title={isBookmarked ? "Open bookmark options" : "Bookmark this chapter"}
      aria-label={isBookmarked ? "Open bookmark options" : "Bookmark this chapter"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill={isBookmarked ? "currentColor" : "none"} />
      </svg>
    </button>
  );
}
