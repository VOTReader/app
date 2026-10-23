// @ts-check
/* v2's pieces for main's selection drag guard (ui/sheets/selection-drag.js, rs1 2026-10-22; myweb mw-rs1):
   the page scroller is the reading column, the mini player, the auto-scroll pill and the tab bar make the bottom
   dock, and the top bar (pinned inside the desktop column) is the band at its top. While a drag runs
   (body.sel-dragging) shell.css lets the chrome take no touches, so the browser finds the words under the finger
   even under the mini player, and only the scroller takes the end. */

/** @type {import('../ui/sheets/selection-drag.js').DragLayout} */
export const V2_DRAG_LAYOUT = {
  column: '.v2 [data-scroller]',
  dock: '.v2 .mini, .v2 .asp, .v2 .tabbar',
  bands: '.tb',
  offPage: '[inert]',
  notText: 'button, input, textarea, [contenteditable]:not([contenteditable="false"]), .tb, .fnd, .toast-wrap, .reading-end',
};
