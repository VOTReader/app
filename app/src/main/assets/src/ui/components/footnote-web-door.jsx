/* ═══════════════════════════════════════════════════════════════════════
   footnote-web-door — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A scripture footnote's door into the Scripture Web, as the footnote sheet
   and the in-body footnote list both draw it (ideas audit s14.5: the list had
   Go to Scripture but no web door). A footnote citing several passages gets
   one door with a small button per passage (Corbin, 2026-10-24: "Romans 6:23,
   Ezekiel 18:4, Ezekiel 18:20" opened only the first; "should be an option
   for each one? Too much bloat?"): one row, every passage a tap. */

import { webStartOfRef } from '../../utils/scripture-web/ref-parse.js';

/** The web's door for one reference: the start it opens on (its verse, or its chapter), or null
 * when the routes have no door (window.__openScriptureWeb, screen-routes.jsx) or the reference
 * names no Bible place. @param {string} ref */
function doorOfRef(ref) {
  const open = typeof window !== 'undefined' ? /** @type {any} */ (window).__openScriptureWeb : null;
  if (typeof open !== 'function') return null;
  const start = webStartOfRef(ref);
  return start && open(start, { check: true }) ? start : null;
}

/** The Scripture Web's door for a scripture footnote (the navigation stream, w3): its first
 * passage's start, or null. @param {any} fn */
export function webDoorOf(fn) {
  return fn && fn.type === 'scripture' ? doorOfRef(fn.ref) : null;
}

/** Each passage a scripture footnote cites, with its web start: the shared splitter
 * (splitCompoundRef, scripture-resolution.js) where it is loaded, else the reference whole.
 * @param {any} fn @returns {{ ref: string, start: any }[]} */
export function webDoorsOf(fn) {
  if (!fn || fn.type !== 'scripture') return [];
  const parts = typeof splitCompoundRef === 'function' ? splitCompoundRef(fn.ref) : [];
  const refs = parts.length ? parts.map((/** @type {any} */ p) => p.ref) : [fn.ref];
  const out = [];
  for (const ref of refs) {
    const start = doorOfRef(ref);
    if (start) out.push({ ref, start });
  }
  return out;
}

/**
 * "Show in Scripture Web ›" for a scripture footnote, or nothing when it has no door; with
 * several passages, one row holding a button for each.
 * @param {{ fn: any, onBefore?: () => void }} props  onBefore: runs first (the sheet closes)
 */
export function WebDoorButton({ fn, onBefore }) {
  const doors = webDoorsOf(fn);
  if (!doors.length) return null;
  /** @param {any} e @param {any} start */
  const go = (e, start) => {
    // in the list the card under it scrolls back to the bubble; the door is its own tap
    e.stopPropagation();
    if (onBefore) onBefore();
    /** @type {any} */ (window).__openScriptureWeb(start);
  };
  if (doors.length > 1) {
    return (
      <div className="fn-sheet-link-btn fn-web-doors" role="group" aria-label="Show in Scripture Web" data-door="web">
        <span className="fn-sheet-link-body">
          <span className="fn-sheet-link-eyebrow" aria-hidden="true">Show in Scripture Web</span>
          <span className="fn-web-refs">
            {doors.map((d) => (
              <button key={d.ref} type="button" className="fn-web-ref" onClick={(e) => go(e, d.start)}
                aria-label={'Show ' + d.ref + ' in Scripture Web'}>
                {d.ref} <span aria-hidden="true">{"›"}</span>
              </button>
            ))}
          </span>
        </span>
      </div>
    );
  }
  return (
    <button type="button" className="fn-sheet-link-btn" data-door="web" onClick={(e) => go(e, doors[0].start)}>
      <span className="fn-sheet-link-body">
        <span className="fn-sheet-link-eyebrow">Show in Scripture Web</span>
        <span className="fn-sheet-link-title">{fn.ref}</span>
      </span>
      <span className="fn-sheet-link-chevron">{"›"}</span>
    </button>
  );
}
