/* ═══════════════════════════════════════════════════════════════════════
   LinkIcon — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkIcon({ hlKey, onClick, prefix }) {
  // Subscribe to LinkStore — icon appears/disappears as links are
  // created/removed for this passage.
  React.useSyncExternalStore(
    React.useCallback((cb) => LinkStore.subscribe(cb), []),
    () => LinkStore.getVersion()
  );
  // When `prefix` is true, hlKey is treated as a prefix and any link whose
  // endpoint key starts with that prefix counts. Used by letter/wtlb blocks
  // because excerpts append ":start-end" to the block-level key.
  const links = prefix ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey);
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
