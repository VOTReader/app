/* ═══════════════════════════════════════════════════════════════════════
   LinkIcon — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkIcon({ hlKey, hlTick, onClick, prefix }) {
  // When `prefix` is true, hlKey is treated as a prefix and any link whose
  // endpoint key starts with that prefix counts. Used by letter/wtlb blocks
  // because excerpts append ":start-end" to the block-level key.
  const links = React.useMemo(
    () => prefix ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey),
    [hlKey, hlTick, prefix]
  );
  if (!links || links.length === 0) return null;
  return React.createElement("span", {
    className: "verse-link-icon",
    onClick: (e) => { e.stopPropagation(); onClick && onClick(hlKey); },
    title: links.length + " link" + (links.length > 1 ? "s" : "")
  },
    React.createElement("svg", { viewBox: "0 0 24 24" },
      React.createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
      React.createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })
    )
  );
}
