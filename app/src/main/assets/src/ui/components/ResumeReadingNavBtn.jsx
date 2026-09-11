/* ═══════════════════════════════════════════════════════════════════════
   ResumeReadingNavBtn — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The pulsing "continue reading" gold marker — text lines with a pointer at
   the one you were on (a bare dot until 2026-09-10 — Corbin: "Change the icon
   for the reading resume dot to something that makes more sense"; a bookmark
   ribbon for a day after that, until it was the Bookmark button's icon too —
   Corbin, 2026-09-11: "You shouldn't have the same icon for two different
   features"), rendered INSIDE the top nav bar
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
      title="Reading Position Marker"
      aria-label="Reading Position Marker"
    >
      {/* Three lines of text and a pointer at the one you were on: the place in the
          reading, not a bookmark. The Bookmark button in the same bar wears the ribbon
          (Corbin, 2026-09-11: "You shouldn't have the same icon for two different
          features"); marker-glyph.test.jsx measures the two silhouettes apart at 16 px.
          Inline, so it takes the gold token through currentColor and needs no asset. */}
      <svg className="rdg-glyph" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
        fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5h10" opacity="0.5" />
        <path d="M11 12h10" />
        <path d="M11 19h7" opacity="0.5" />
        <path d="M2.5 7.5l6 4.5-6 4.5z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
