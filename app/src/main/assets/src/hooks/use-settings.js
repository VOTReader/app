/* ═══════════════════════════════════════════════════════════════════════
   useSettings — app settings state + mutators + body-class/AndroidBridge effect
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - settings state  (React.useState with migration initializer; initial
                        value merges saved settings + migration fixes over
                        the hardcoded defaults)
     - setSettings     (raw React setState — returned so App() can compose
                        settings writes from other subsystems if needed)
     - toggleSetting   (plain arrow fn: flips settings[key] boolean)
     - updateSetting   (plain arrow fn: sets settings[key] = val)
     - body-class + platform-bridge effect (deps [theme, settings])
                        Mirrors theme + every settings flag that has a CSS
                        body-class or a platform-bridge call onto
                        document.body.classList and PlatformBridge.

   DOES NOT OWN:
     - The vot-state PERSIST effect — it is usePersistedState (P6k+1). That
       effect is a composition-level persistence sink touching 8 values
       from 4 different subsystems (tabs, activeTabIdx, theme,
       lastReadChapters, lastReadLetterMap, activeReadKey, settings,
       readItems). It has no business inside a "settings" hook.
     - GARDEN_DEFAULT_TIER — a bare-name window global from bundle-d.js.
       Used as the gardenTier default inside the useState initializer.
       Accessed by bare name (no import, no param).

   PARAMS:
     savedSettings   — saved.settings from useSavedState in App() (may be
                       null / undefined on first launch). Passed explicitly
                       so the hook initialises React.useState with the
                       persisted value rather than re-reading localStorage.
     theme           — current theme string ("dark" | "light"); App()-local
                       useState. Required as a dep of the body-class effect
                       so the "light" body class toggles on theme changes.

   RETURNS: { settings, setSettings, toggleSetting, updateSetting }

   STORAGE:
     None directly. settings rides along in the vot-state JSON written by
     usePersistedState (P6k+1) via the returned settings value.

   WINDOW: none — wires no window.__* handler bridges. The body-class
     effect calls PlatformBridge.setLightStatusBar / setKeepScreenOn —
     setLightStatusBar is a no-op on web; setKeepScreenOn uses
     navigator.wakeLock fire-and-forget per [[explicit-async-decision]].
   ═══════════════════════════════════════════════════════════════════════ */

import { PlatformBridge } from '../utils/platform-bridge.js';
import { readingFontById, readingFontCss } from '../utils/reading-fonts.js';

/**
 * Settings object shape. Fields with stable defaults documented inline at
 * the useState initializer. Loosely-typed because the settings surface
 * grows over time and TS strictness would hurt more than it helps.
 *
 * @typedef {Record<string, any>} Settings
 */

/**
 * Settings state container hook. Owns settings + 3 mutators plus the
 * body-class + AndroidBridge mirroring effect. Persistence lives in
 * usePersistedState (P6k+1).
 *
 * @param {{ savedSettings: Settings | null | undefined, theme: string }} args
 * @returns {{
 *   settings: Settings,
 *   setSettings: (updater: Settings | ((prev: Settings) => Settings)) => void,
 *   toggleSetting: (key: string) => void,
 *   updateSetting: (key: string, val: any) => void
 * }}
 */
export function useSettings({ savedSettings, theme }) {
  // ── State ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = React.useState(() => {
    const savedS = savedSettings || {};
    // Migration: old `showChrome` → both new masters. Old `showChapterSummary`
    // → showChapterTitle (Matthew hero is unified into the universal setting).
    const migrated = {};
    if ('showChrome' in savedS) {
      if (savedS.showChrome === false) {
        migrated.showChapterTitle = false;
        migrated.showSectionHeadings = false;
      }
    }
    if ('showChapterSummary' in savedS && savedS.showChapterSummary === false) {
      migrated.showChapterTitle = false;
    }
    return {
      showReadingDot: false, showSurpriseButton: false, markAsRead: true,
      // Search defaults — only the values that are actually wired to
      // VotSearch.search() at the call site. Previously this block also
      // declared 12 searchInclude* flags (Notes, Verses, Headings,
      // StudyNotes, CrossRefs, Footnotes, Letters, LetterBody, Wtlb,
      // Blessed, HolyDays, BibleStudies) plus searchFuzzy and
      // searchAllTranslations — all dead defaults (declared, never read,
      // never exposed in UI). Removed 2026-05-11 so future devs aren't
      // misled into wiring against them. If granular include/exclude
      // ever ships, declare AT THAT TIME with both a Settings UI toggle
      // AND a consumer in the search call.
      searchUseStopWords: true,
      searchCorpus: 'all', // 'all' | 'scriptures' | 'volumes'
      // (searchEngine removed 2026-07-02 — the Classic/FlexSearch engine is
      //  RETIRED after the owner's A/B; MiniSearch is the only engine. A stale
      //  persisted 'searchEngine' key in old vot-state blobs is simply unread.)
      haptic: true,
      keepScreenOn: true,
      // Backup-freshness reminder (useBackupReminder). The companion stamps —
      // lastExportAt (set on export success) + lastBackupRemindedAt (set when
      // the reminder shows) — deliberately have NO defaults: absent means
      // "never", which the decision fn treats as stale.
      backupReminder: true,
      scriptureLayout: "genre", gardenTier: GARDEN_DEFAULT_TIER,
      showSettingsGear: true, translation: "nkjv", restoredNames: true, fontStyle: "classic",
      showChapterTitle: true, showSectionHeadings: true, showInlineEchoes: true,
      tabsEnabled: true,
      searchEnabled: true, historyEnabled: true,
      historyInNav: true,
      showBookmarkNav: true,
      showThemeBtn: true,
      showScrollNotch: true,
      arrowLayout: "off", // "split" | "right" | "left" | "nav" | "off"
      fontScale: "1", // WL1 — text-size multiplier ("1" | "1.15" | "1.3" | "1.5"); drives --font-scale on <html>
      // Autoscroll. Speed is stored in LINES PER MINUTE, never px/s: the text-
      // size slider spans 80–160%, and a px/s speed would silently change
      // reading pace by up to 2× when the reader resizes text. The controller
      // derives px from a measured line height, so this value is scale-
      // invariant. Off by default — the pill is chrome on every reading screen.
      autoScroll: false,
      autoScrollLpm: "16",
      autoScrollNext: false,
      autoScrollEndMs: "2500",
      ...savedS,
      ...migrated // migration wins over stale saved values
    };
  });

  // ── Plain arrow functions ──────────────────────────────────────────────
  const toggleSetting = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  const updateSetting = (key, val) => setSettings((prev) => ({ ...prev, [key]: val }));

  // ── Body-class + AndroidBridge effect ─────────────────────────────────
  // Mirrors theme + every settings flag that has a CSS body-class or a
  // native Android bridge call. Split out of the old App() save-state
  // effect (P6g) which had a combined dep array of 8 values.
  //
  // SAFE TO NARROW THE DEPS to [theme, settings]: the old effect listed
  // all 8 save-state deps, so JOB A (this) re-ran whenever tabs /
  // activeTabIdx / lastRead* / activeReadKey / readItems changed too.
  // On every one of those runs theme and settings were unchanged, so the
  // 9 classList.toggle calls re-applied IDENTICAL classes —
  // classList.toggle(name, bool) is idempotent (toggling a class to the
  // value it already has is a no-op). Those runs were pure redundant
  // work; dropping them by narrowing the deps to [theme, settings] is
  // invisible. Do NOT add the other 6 deps back.
  React.useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
    // [10] True Black — an OLED modifier on the DARK theme only (surfaces
    // --bg2/--bg3 drop to pure/near black; everything else untouched).
    document.body.classList.toggle("no-gear", !settings.showSettingsGear);
    document.body.classList.toggle("no-search", settings.searchEnabled === false);
    document.body.classList.toggle("no-history", settings.historyEnabled === false);
    document.body.classList.toggle("history-in-nav", !!settings.historyInNav);
    document.body.classList.toggle("no-bookmark-nav", settings.showBookmarkNav === false);
    document.body.classList.toggle("no-theme-nav", settings.showThemeBtn === false);
    document.body.classList.toggle("arrows-right", settings.arrowLayout === 'right');
    document.body.classList.toggle("arrows-left", settings.arrowLayout === 'left');
    document.body.classList.toggle("arrows-nav", settings.arrowLayout === 'nav');
    document.body.classList.toggle("arrows-off", settings.arrowLayout === 'off');
    document.body.classList.toggle("scroll-notch", !!settings.showScrollNotch);
    // Reading font — settings.fontStyle holds any READING_FONTS id (was a
    // classic/modern two-state before 2026-07-31). "classic" (default)
    // disables the #custom-fonts @font-face block so every font-family in
    // app.css falls back to system serif — the pre-existing behavior. Any
    // OTHER choice keeps the block enabled (Cinzel chrome + EB Garamond
    // fallback) and routes the body text through the --font-body var; the
    // reading fonts themselves are all vendored + @font-face'd in app.css
    // (fonts/reading/), so the browser lazily fetches exactly the chosen
    // one. An unknown id (forward-compat backup import) degrades to the
    // classic look via readingFontCss's fallback.
    const fontDef = readingFontById(settings.fontStyle);
    const customFontsEl = /** @type {HTMLStyleElement | null} */ (document.getElementById("custom-fonts"));
    if (customFontsEl) customFontsEl.disabled = !fontDef || fontDef.id === "classic";
    document.documentElement.style.setProperty("--font-body", readingFontCss(settings.fontStyle));
    // WL1/Session-4 — text-size scale. Mirror settings.fontScale onto the
    // --font-scale CSS var on <html>; app.css multiplies it into the root
    // font-size so all rem/em sizing scales (chrome is px-pinned — see the
    // "SESSION-4 TEXT-ONLY SCALING" block at the end of app.css). The
    // index.html boot script sets the initial value pre-mount (no FOUC);
    // this handles live changes from the Settings slider.
    // SEC-3: clamp numerically to the slider's range — settings (incl.
    // fontScale) are import-restorable from a backup, and an out-of-range
    // value would land in the --font-scale CSS var. The old 4-step selector
    // values ("1"/"1.15"/"1.3"/"1.5") all fall inside the range.
    const _fs = parseFloat(String(settings.fontScale));
    const _fsSafe = Number.isFinite(_fs) ? Math.min(3, Math.max(0.8, _fs)) : 1;
    document.documentElement.style.setProperty("--font-scale", String(_fsSafe));
    // Platform mirror — bridge owns the platform branch. Android passes
    // through to native window flags; web is a CSS-only no-op for the
    // status bar + navigator.wakeLock fire-and-forget for the screen-on
    // flag (auto-releases on tab hide).
    PlatformBridge.setLightStatusBar(theme === "light");
    PlatformBridge.setKeepScreenOn(settings.keepScreenOn !== false);
  }, [theme, settings]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { settings, setSettings, toggleSetting, updateSetting };
}
