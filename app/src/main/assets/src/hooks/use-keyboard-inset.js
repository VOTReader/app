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

   It also marks the root `kb-up` while the keyboard is up, for what steps
   aside while typing (the mini player: player brief 2026-10-22, 3a). Chrome
   and the PWA shrink the visual viewport; the APK keeps the viewport and
   reports the keyboard in --inset-bottom instead (MainActivity's
   reservedInsetTypes include the IME), so that is read too.

   Mount-only effect; no params, no return. Extracted verbatim from App().
   ═══════════════════════════════════════════════════════════════════════ */

/** Past this much bottom inset (px) the APK is reporting a keyboard: a nav bar or taskbar is at most ~56. */
const IME_INSET_PX = 120;

/** @returns {void} */
export function useKeyboardInset() {
  React.useEffect(() => {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    let open = false;
    const mark = () => {
      const inset = parseFloat(root.style.getPropertyValue('--inset-bottom')) || 0;
      // A pinch-zoom shrinks the visual viewport too: that is not a keyboard.
      const zoomed = (Number(vv.scale) || 1) > 1.05;
      root.classList.toggle('kb-up', (open && !zoomed) || inset > IME_INSET_PX);
    };
    const update = () => {
      // Difference between layout viewport and visual viewport ≈ keyboard.
      // Some browsers (notably older Android WebViews) report a small
      // residual diff (~1-3px) even when the keyboard is closed — clamp
      // anything under 80px to 0 so we don't shift overlays for noise.
      const diff = Math.max(0, window.innerHeight - vv.height);
      // The keyboard's top edge in layout coordinates is offsetTop + height:
      // Chrome also PANS the visual viewport up to the focused field, and a
      // bare diff then lifts fixed sheets a second time, past the top of
      // the screen (lw1 2026-09-26, S22: the note box hidden above view).
      // The 80px clamp stays on the raw diff, which says the keyboard is open.
      open = diff > 80;
      const kh = open ? Math.max(0, Math.round(diff - (vv.offsetTop || 0))) : 0;
      root.style.setProperty('--keyboard-height', kh + 'px');
      mark();
    };
    // The APK writes --inset-bottom onto the root's style whenever the insets change (JsBridge.setCssProperties).
    const watch = typeof MutationObserver === 'function' ? new MutationObserver(mark) : null;
    if (watch) watch.observe(root, { attributes: true, attributeFilter: ['style'] });
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      if (watch) watch.disconnect();
      root.classList.remove('kb-up');
      root.style.setProperty('--keyboard-height', '0px');
    };
  }, []);
}
