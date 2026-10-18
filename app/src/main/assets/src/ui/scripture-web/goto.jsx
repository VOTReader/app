/* ═══════════════════════════════════════════════════════════════════════
   goto — the Scripture Web's go-to (search a book, chapter or verse) and
   what a tap on a drawn name does. Cluster F (bundle-d), used by
   ui/screens/ScriptureWebScreen.jsx and ui/scripture-web/use-web-selection.js.
   The navigation stream owns this file (CONTRACTS.md section 10).
   ═══════════════════════════════════════════════════════════════════════

   Two contracts other streams call (CONTRACTS.md sections 4 and 9):

     useGoTo(web)   the go-to's state and its two render nodes. `button` is
                    the header slot: the screen renders it first inside the
                    chrome's control row, so the search button sits in the
                    header without the screen knowing what it is; `box` is the
                    search box, rendered over the canvas. Both are null today,
                    so the chrome is exactly as it was (no new DOM, no new
                    sw-* class: every sw-* class needs its v2 CSS rule).
     routeOverlayHit(hit, nav)
                    what a tap on something the overlay drew does (a book
                    name, a chapter numeral, a "+n" pill: overlay-renderer.js
                    hitOverlay); true when it handled the tap, so the tap
                    stops before the line picking. Returns false today.

   THE STUBS ARE BEHAVIOUR-NEUTRAL: no button, no box, no routing. */

/**
 * @typedef {{ button: any, box: any, isOpen: boolean, open: (query?: string) => void, close: () => void }} GoTo
 *   button  the header slot's node (null: nothing in the header)
 *   box     the go-to box's node, rendered over the canvas (null: none)
 *   open    opens the box, optionally with a query typed in; close closes it
 */

const NO_GOTO = Object.freeze({
  button: null, box: null, isOpen: false,
  open() {}, close() {},
});

/**
 * The go-to. `web` is what it needs from the screen (CONTRACTS.md section 9): the graph, flyTo,
 * openPanel, the journey, lightThreads, the live region's setAnnounce and the start prop. The
 * stub reads none of it and returns the same frozen nothing every render.
 * @param {{ graph?: any, flyTo?: Function, openPanel?: Function, journey?: any,
 *   lightThreads?: Function, setAnnounce?: Function, start?: any }} _web
 * @returns {GoTo}
 */
export function useGoTo(_web) {
  return NO_GOTO;
}

/**
 * Route a tap on an overlay target (CONTRACTS.md section 4). The navigation stream fills it in:
 * a book name frames the book (flyTo { x0, x1 }), a chapter numeral opens the chapter's group
 * (openPanel { mode: 'group', chapter }), a pill opens its group (openPanel { mode: 'group', ids,
 * label }), and each pushes onto the journey. The stub routes nothing.
 * @param {import('./overlay-renderer.js').OverlayHit | null} hit
 * @param {{ graph: any, flyTo: Function, openPanel: Function, journey: any }} nav
 * @returns {boolean} whether the tap was handled
 */
export function routeOverlayHit(hit, nav) {
  if (!hit || !nav) return false;
  return false;
}
