/* ═══════════════════════════════════════════════════════════════════════
   ResumeReadingNavBtn — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The pulsing "resume reading" gold dot, rendered INSIDE the top nav bar
   (ScreenLayout mounts it just left of the Tabs button). It used to be an
   App-level position:fixed button floating over the top-right of index
   screens — that drew over content AND had to be visibility-hidden on the
   live page during every tab-thumbnail capture, which blinked it out for a
   split second on every scroll-stop (owner-reported). Living in the nav
   solves both: the nav is chrome (overlaps nothing), and the nav is already
   excluded from thumbnails on every path (Android native crops it via
   navHeightDp; html2canvas ignores `top-nav` via SCREENSHOT_IGNORE_CLASSES),
   so the dot needs no capture-time hiding at all.

   ReadingDotContext is provided by App() with { screen, enabled, onGo }:
     screen   — current screen id; this component owns the eligibility list
                (the dot is pointless ON a reading screen, and noise on
                utility screens — same set the old App-level gate used).
     enabled  — settings.showReadingDot && a reading position exists.
     onGo     — goToLastRead (use-reading-position-nav). App passes a fresh
                closure each render (it reads live nav state); the context
                value is deliberately NOT memoized — the sole consumer is
                this one tiny button.

   Bare-host safety: a missing/null context renders null BEFORE any global
   (LETTER_SCREEN_SET) is touched, so test hosts that mount ScreenLayout
   without the provider need no stubs.
   ═══════════════════════════════════════════════════════════════════════ */

export const ReadingDotContext = React.createContext(null);

// Screens where the dot is hidden even when a reading position exists:
// you're already reading (letter screens via LETTER_SCREEN_SET, bible/
// matthew chapters) or on a utility surface where "resume" is noise.
const DOT_HIDDEN_SCREENS = new Set([
  'matthew-ch', 'bible-ch', 'search', 'garden-view', 'settings', 'history',
  'library', 'my-progress', 'notes-index', 'links-index', 'bookmarks-index',
  'highlights-index', 'journal-home', 'journal-viewer', 'journal-editor',
  'about',
]);

export function ResumeReadingNavBtn() {
  const ctx = React.useContext(ReadingDotContext);
  if (!ctx || !ctx.enabled) return null;
  const { screen, onGo } = ctx;
  if (DOT_HIDDEN_SCREENS.has(screen) || LETTER_SCREEN_SET.has(screen)) return null;
  return (
    <button
      className="reading-dot-nav"
      onClick={onGo}
      title="Resume reading"
      aria-label="Resume reading"
    >
      <span className="rdg-inner" />
    </button>
  );
}
