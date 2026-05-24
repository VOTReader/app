/* ═══════════════════════════════════════════════════════════════════════
   LinkIcon — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkIcon({ hlKey, hlTick, onClick, prefix }) {
  // When `prefix` is true, hlKey is treated as a prefix and any link whose
  // endpoint key starts with that prefix counts. Used by letter/wtlb blocks
  // because excerpts append ":start-end" to the block-level key.
  const links = React.useMemo(
    () => prefix ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal: hlTick bumps on store mutation, forces memo recompute (ARCHITECTURE.md §"Annotation rendering")
    [hlKey, hlTick, prefix]
  );
  if (!links || links.length === 0) return null;
  return (
    <span
      className="verse-link-icon"
      onClick={(e) => { e.stopPropagation(); onClick && onClick(hlKey); }}
      title={links.length + " link" + (links.length > 1 ? "s" : "")}
    >
      <svg viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </span>
  );
}
