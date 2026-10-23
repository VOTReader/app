/* ═══════════════════════════════════════════════════════════════════════
   LinkIcon — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { iconButtonProps } from '../../renderer/icon-button.js';

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
  // A verse counts what its Links sidebar lists (mw17 s29.4): part of the
  // verse and a span covering it, not only the whole verse.
  const links = prefix ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getTouching(hlKey);
  if (!links || links.length === 0) return null;
  return (
    // W65 (sweep 2026-10-13): a named button; Enter/Space open what a tap opens (renderer/icon-button.js).
    <span
      className="verse-link-icon"
      onClick={(e) => { e.stopPropagation(); onClick && onClick(hlKey); }}
      title={links.length + " link" + (links.length > 1 ? "s" : "")}
      {...iconButtonProps(links.length === 1 ? "Open link" : "Open " + links.length + " links", () => { onClick && onClick(hlKey); })}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </span>
  );
}
