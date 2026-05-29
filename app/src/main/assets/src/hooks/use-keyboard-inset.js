/* ═══════════════════════════════════════════════════════════════════════
   useKeyboardInset — expose soft-keyboard height as --keyboard-height (P11)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Tracks the soft-keyboard height via the visualViewport API and exposes it
   to CSS as `--keyboard-height`. Overlays that own inputs/textareas
   (BookmarkCreateSheet, LinkPicker, NoteSheet) use this variable as
   padding-bottom so the sheet lifts above the keyboard when it opens and
   settles back when it closes — works the same on any Android version, any
   keyboard app, and PWA-mode browsers. The Kotlin-side `--inset-bottom`
   covers system bars / camera cutout; this covers the IME specifically and
   is independent of WebView quirks.

   Mount-only effect; no params, no return. Extracted verbatim from App().
   ═══════════════════════════════════════════════════════════════════════ */

/** @returns {void} */
export function useKeyboardInset() {
  React.useEffect(() => {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      // Difference between layout viewport and visual viewport ≈ keyboard.
      // Some browsers (notably older Android WebViews) report a small
      // residual diff (~1-3px) even when the keyboard is closed — clamp
      // anything under 80px to 0 so we don't shift overlays for noise.
      const diff = Math.max(0, window.innerHeight - vv.height);
      const kh = diff > 80 ? diff : 0;
      root.style.setProperty('--keyboard-height', kh + 'px');
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.setProperty('--keyboard-height', '0px');
    };
  }, []);
}
