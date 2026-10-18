/* ═══════════════════════════════════════════════════════════════════════
   usePanelLayout — where the docked panel sits, and what it covers.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   The panel stream owns this file (CONTRACTS.md section 10).
   ═══════════════════════════════════════════════════════════════════════

   Spec section 3 ("Horizontal: the panel open") as numbers read from the
   ROOT's own box (a rotated phone is a wide screen whatever the media
   queries say, the reason .sw-narrow keys off clientWidth):

     panel width  clamp(420px, 40vw, 780px) on PC; max(340px, 42vw) compact
                  (root height <= 500: every "phone" value of the spec)
     sheet        below 560 px wide the panel is a bottom sheet instead
                  (Q12: docked at every landscape width; phone landscape
                  891x411 docks right)
     canvas area  the root minus the panel; the controls collapse to the
                  go-to and a "⋯" menu while it is under 1000 px

   The panel inset (CONTRACTS.md section 5) is written here and nowhere else:
   `right` is the docked width while a panel is open at 560 px and up,
   `bottom` the sheet's height below it, both 0 while nothing is open. It is
   written on open, close and resize, then the frame is scheduled, so flyTo,
   the overlay and GL keep out of what the panel covers.

   An unmeasured root (width 0: before layout, or jsdom) has no layout: no
   inset, no collapse, nothing moves. */

/** The root width below which the panel is a bottom sheet (Q12). */
export const SHEET_BELOW = 560;
/** The canvas-area width below which the controls collapse to search + ⋯ (spec section 3). */
export const COLLAPSE_BELOW = 1000;

/**
 * @typedef {{ w: number, h: number, compact: boolean, narrow: boolean, sheet: boolean,
 *   panelW: number, sheetH: number, gutter: number }} PanelLayout
 */

/**
 * The panel's layout for a root of w x h CSS px, or null for an unmeasured root.
 * @param {number} w @param {number} h
 * @returns {PanelLayout | null}
 */
export function panelLayout(w, h) {
  if (!(w > 0) || !(h > 0)) return null;
  const compact = h <= 500;
  const sheet = w < SHEET_BELOW;
  const panelW = sheet ? w : Math.round(compact ? Math.max(340, 0.42 * w) : Math.min(780, Math.max(420, 0.4 * w)));
  // the sheet: most of a short root, never taller than a comfortable read
  const sheetH = sheet ? Math.round(Math.min(0.6 * h, 560)) : 0;
  return { w, h, compact, narrow: w <= SHEET_BELOW, sheet, panelW, sheetH, gutter: compact ? 16 : 24 };
}

/**
 * What the panel covers, CSS px (CONTRACTS.md section 5).
 * @param {PanelLayout | null} layout @param {boolean} open
 * @returns {{ right: number, bottom: number }}
 */
export function insetOf(layout, open) {
  if (!layout || !open) return { right: 0, bottom: 0 };
  return layout.sheet ? { right: 0, bottom: layout.sheetH } : { right: layout.panelW, bottom: 0 };
}

/**
 * Whether the controls collapse to the go-to and the ⋯ menu: the canvas area (the root minus an
 * open docked panel) is under 1000 px. Never on an unmeasured root.
 * @param {PanelLayout | null} layout @param {boolean} open
 */
export function collapsedFor(layout, open) {
  if (!layout) return false;
  return layout.w - insetOf(layout, open).right < COLLAPSE_BELOW;
}

/**
 * The root's measured size as a layout (state: the render reads it), and `insetFor()`, what the panel
 * WILL cover once open (a ref read: the selection hook frames a connection before the panel renders).
 * Reattaches when the root element changes (the no-WebGL list unmounts it; Try again mounts a new one).
 * @param {{ current: HTMLElement | null }} wrapRef
 */
export function usePanelLayout(wrapRef) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const watchRef = React.useRef(/** @type {{ el: HTMLElement, stop: () => void } | null} */ (null));
  React.useEffect(() => {
    const el = wrapRef.current;
    const cur = watchRef.current;
    if (cur && cur.el === el) return;
    if (cur) cur.stop();
    watchRef.current = null;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', read);
    watchRef.current = { el, stop: () => { if (ro) ro.disconnect(); window.removeEventListener('resize', read); } };
  });
  React.useEffect(() => () => { if (watchRef.current) watchRef.current.stop(); watchRef.current = null; }, []);
  const layout = React.useMemo(() => panelLayout(size.w, size.h), [size.w, size.h]);
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  const insetFor = React.useCallback(() => insetOf(layoutRef.current, true), []);
  return { layout, insetFor };
}

/**
 * The inset's one writer (CONTRACTS.md section 5), and the panel's width as --sw-panel-w on the root
 * (the controls right-align to the panel's left edge). Runs after every commit; writes and schedules a
 * frame only when the value changed. onShrink (optional; the camera's settleInset) runs once the
 * right inset has shrunk, after the new value is written: the camera clamp's slack for the panel
 * shrank with it.
 * @param {{ layout: PanelLayout | null, open: boolean, panelInsetRef: { current: { right: number, bottom: number } },
 *   wrapRef: { current: HTMLElement | null }, schedule: () => void, onShrink?: () => void }} p
 */
export function usePanelInset({ layout, open, panelInsetRef, wrapRef, schedule, onShrink }) {
  React.useLayoutEffect(() => {
    const next = insetOf(layout, open);
    const cur = panelInsetRef.current;
    if (!cur || cur.right !== next.right || cur.bottom !== next.bottom) {
      panelInsetRef.current = next;
      schedule();
      if (cur && next.right < cur.right && typeof onShrink === 'function') onShrink();
    }
    const el = wrapRef.current;
    if (el && layout) {
      el.style.setProperty('--sw-panel-w', layout.panelW + 'px');
      el.style.setProperty('--sw-sheet-h', layout.sheetH + 'px');
    }
  });
}
