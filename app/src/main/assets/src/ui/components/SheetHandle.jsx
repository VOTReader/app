/* ═══════════════════════════════════════════════════════════════════════
   SheetHandle — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE one grabber module for every bottom sheet. Replaces the three
   cosmetic handle divs (fn-sheet-handle / select-sheet-handle /
   link-action-handle) that were duplicated across 9 sheets — an owner
   report: an older reader tapped the pill bar expecting it to close the
   sheet and nothing happened. Both the pill bar and the ‹ chevron at the
   sheet's upper-left are real 44px buttons that close the sheet; the
   chevron is the visible fallback for readers who don't know the
   pull-handle idiom. */

/** U06.8: a downward drag this far closes the sheet, or a quicker flick (px per ms) of any length past a few px. */
export const DRAG_CLOSE_PX = 64;
export const FLING_PX_PER_MS = 0.5;

/**
 * U06.8 (UX wave 3): the pill ignored a drag. Dragged down it carries the sheet with the finger; let go far enough
 * down, or flicked, the sheet closes; otherwise it settles back. A tap still closes it, as before.
 * @param {() => void} onClose
 */
function useDragToClose(onClose) {
  const drag = React.useRef(/** @type {{ y: number, t: number, dy: number, sheet: HTMLElement | null, id: number } | null} */ (null));
  const moved = React.useRef(false);
  const onPointerDown = (/** @type {any} */ e) => {
    const row = e.currentTarget.parentElement;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, sheet: row ? row.parentElement : null, id: e.pointerId };
    moved.current = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_e) { /* a synthetic pointer */ }
  };
  const onPointerMove = (/** @type {any} */ e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (d.dy > 4) moved.current = true;
    if (d.sheet) { d.sheet.style.transition = 'none'; d.sheet.style.transform = 'translateY(' + d.dy + 'px)'; }
  };
  const end = (/** @type {any} */ e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const ms = Math.max(1, performance.now() - d.t);
    const close = d.dy >= DRAG_CLOSE_PX || (d.dy > 12 && d.dy / ms >= FLING_PX_PER_MS);
    if (d.sheet) { d.sheet.style.transition = ''; d.sheet.style.transform = ''; }
    if (close) onClose();
  };
  // A drag that settled back is not a tap: the click after it must not close the sheet.
  const onClick = () => { if (moved.current) { moved.current = false; return; } onClose(); };
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onClick };
}

/* `glyph` (the Answers sheets, AOGCG 2026-10-22): what the close button draws in place of the ‹,
   their 20px × icon. The button, its name and its place are the same for every sheet. */
/** @param {{ onClose: () => void, glyph?: any }} props */
export function SheetHandle({ onClose, glyph }) {
  const grab = useDragToClose(onClose);
  return (
    <div className="sheet-handle-row">
      <button type="button" className="sheet-handle-back" onClick={onClose} aria-label="Close">
        {glyph || '‹'}
      </button>
      {/* The pill bar is a redundant touch affordance for sighted users —
          aria-hidden + tabIndex -1 keep it out of the accessibility tree so
          the ‹ chevron is the ONE screen-reader/keyboard Close stop (two
          adjacent identical "Close" announcements otherwise). */}
      <button type="button" className="sheet-handle-grab" {...grab} aria-hidden="true" tabIndex={-1}>
        <span className="sheet-handle-bar" />
      </button>
    </div>
  );
}
