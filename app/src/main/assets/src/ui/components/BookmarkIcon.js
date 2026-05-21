/* ═══════════════════════════════════════════════════════════════════════
   BookmarkIcon — per-verse inline bookmark affordance
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly.

   WHY THIS EXISTS:
   The app has two reading-view rendering strategies. DOM-overlay views
   (LetterView, WtlbEntryView) render `[data-hl-dom]` containers and get
   their inline bookmark icons injected by applyDOMBookmarks(). The
   React-component views (BibleChapterView, ChapterView) render each
   verse with HighlightableText and have NO `[data-hl-dom]` container —
   so applyDOMBookmarks() can never reach them. Those views render a
   per-verse `LinkIcon` for links; this is the bookmark parallel.

   Behaviour mirrors _buildBookmarkIcon() in src/renderer/dom-bookmarks.js:
     - single bookmark at this key  → window.__bookmarkEdit(id, {atSource})
     - multiple bookmarks          → window.__openBookmarkPopover(...)
   `getForKeyPrefix` is used (not getForKey) because selection bookmarks
   append ":start-end" to the verse-level key.
   ═══════════════════════════════════════════════════════════════════════ */

export function BookmarkIcon({ hlKey, hlTick }) {
  const bookmarks = React.useMemo(
    () => BookmarkStore.getForKeyPrefix(hlKey),
    [hlKey, hlTick]
  );
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

  return React.createElement("span", {
    className: "inline-bookmark-icon" + (ids.length > 1 ? " inline-bookmark-icon-multi" : ""),
    onClick: open,
    title: ids.length === 1 ? "Bookmark" : ids.length + " bookmarks"
  },
    React.createElement("svg", { viewBox: "0 0 24 24", fill: "currentColor", stroke: "currentColor" },
      React.createElement("path", {
        fill: "currentColor", stroke: "currentColor",
        strokeWidth: "1.5", strokeLinejoin: "round",
        d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
      })
    )
  );
}
