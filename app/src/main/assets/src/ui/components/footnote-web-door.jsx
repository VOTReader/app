/* ═══════════════════════════════════════════════════════════════════════
   footnote-web-door — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A scripture footnote's door into the Scripture Web, as the footnote sheet
   and the in-body footnote list both draw it (ideas audit s14.5: the list had
   Go to Scripture but no web door). */

import { webStartOfRef } from '../../utils/scripture-web/ref-parse.js';

/** The Scripture Web's door for a scripture footnote (the navigation stream, w3): the start the
 * web opens on (its verse, or its chapter), or null when the routes have no door
 * (window.__openScriptureWeb, screen-routes.jsx) or the reference names no Bible place.
 * @param {any} fn */
export function webDoorOf(fn) {
  const open = typeof window !== 'undefined' ? /** @type {any} */ (window).__openScriptureWeb : null;
  if (!fn || fn.type !== 'scripture' || typeof open !== 'function') return null;
  const start = webStartOfRef(fn.ref);
  return start && open(start, { check: true }) ? start : null;
}

/**
 * "Show in Scripture Web ›" for a scripture footnote, or nothing when it has no door.
 * @param {{ fn: any, onBefore?: () => void }} props  onBefore: runs first (the sheet closes)
 */
export function WebDoorButton({ fn, onBefore }) {
  const start = webDoorOf(fn);
  if (!start) return null;
  return (
    <button type="button" className="fn-sheet-link-btn" data-door="web"
      onClick={(e) => {
        // in the list the card under it scrolls back to the bubble; the door is its own tap
        e.stopPropagation();
        if (onBefore) onBefore();
        /** @type {any} */ (window).__openScriptureWeb(start);
      }}>
      <span className="fn-sheet-link-body">
        <span className="fn-sheet-link-eyebrow">Show in Scripture Web</span>
        <span className="fn-sheet-link-title">{fn.ref}</span>
      </span>
      <span className="fn-sheet-link-chevron">{"›"}</span>
    </button>
  );
}
