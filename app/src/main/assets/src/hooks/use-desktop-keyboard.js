/* ═══════════════════════════════════════════════════════════════════════
   useDesktopKeyboard — keyboard shortcuts for the desktop PWA (W4.2)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Desktop users expect a keyboard. Mobile has its own gestures, so this is
   gated behind !PlatformBridge.isAndroid and never registers in the APK.
   Escape→back is already wired by W1.5 (use-android-back / history-sync), so
   it's intentionally NOT handled here.

   Shortcuts (ignored whenever the user is typing in an input/textarea/
   contenteditable, so they never hijack the search box or journal editor):
     /  or  Ctrl/Cmd+F   → open the app's full-text search (window.__goSearch)
     ArrowLeft/Right     → previous/next chapter

   The arrow keys don't reimplement chapter navigation — they activate the
   reading view's existing StickyChapterNav arrows (.chapter-nav-sticky-arrow,
   prev then next), reusing whatever onPrev/onNext that view already wired.
   No-op on screens without chapter nav. Decoupled from App() entirely.

   Mount-only; no params, no return.
   ═══════════════════════════════════════════════════════════════════════ */

import { PlatformBridge } from '../utils/platform-bridge.js';

/** @returns {void} */
export function useDesktopKeyboard() {
  React.useEffect(() => {
    if (PlatformBridge.isAndroid) return; // mobile uses gestures, not a keyboard

    const onKey = (e) => {
      const el = /** @type {any} */ (e.target);
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;

      // '/' (vim-style) or Ctrl/Cmd+F → open the app's full-text search.
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F'))) {
        if (typeof window.__goSearch === 'function') {
          e.preventDefault();
          window.__goSearch();
        }
        return;
      }

      // Plain Left/Right → prev/next chapter via the existing sticky-nav
      // arrows. Modified arrows (selection etc.) are left alone.
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const nav = document.querySelector('.chapter-nav-sticky');
        if (!nav) return;
        const arrows = nav.querySelectorAll('.chapter-nav-sticky-arrow');
        const btn = /** @type {any} */ (e.key === 'ArrowLeft' ? arrows[0] : arrows[1]);
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
