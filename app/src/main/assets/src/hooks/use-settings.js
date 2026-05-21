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
     - body-class + AndroidBridge effect (deps [theme, settings])
                        Mirrors theme + every settings flag that has a CSS
                        body-class or a native Android bridge call onto
                        document.body.classList and window.AndroidBridge.

   DOES NOT OWN:
     - The vot-state PERSIST effect — it is usePersistedState (P6k+1). That
       effect is a composition-level persistence sink touching 8 values
       from 4 different subsystems (tabs, activeTabIdx, theme,
       lastReadChapters, lastReadLetterMap, activeReadKey, settings,
       readItems). It has no business inside a "settings" hook.
     - showWelcome / isOnline / dismissWelcome / the online-check effect —
       they stay in App() entirely and are not related to settings.
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
     effect CALLS window.AndroidBridge.setLightStatusBar / setKeepScreenOn
     (native methods, absent + no-op on desktop) — those are calls, not
     bridges this hook owns or must clean up.
   ═══════════════════════════════════════════════════════════════════════ */

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
      showReadingDot: false, showSurpriseButton: false, markAsRead: false,
      showProgressBar: true,
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
      haptic: true,
      keepScreenOn: true,
      scriptureLayout: "genre", gardenTier: GARDEN_DEFAULT_TIER,
      showSettingsGear: false, translation: "nkjv", restoredNames: false,
      showChapterTitle: true, showSectionHeadings: true, showInlineEchoes: true,
      tabsEnabled: false,
      searchEnabled: true, historyEnabled: true,
      historyInNav: false,
      arrowLayout: "split", // "split" | "right" | "left" | "nav" | "off"
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
    document.body.classList.toggle("no-gear", !settings.showSettingsGear);
    document.body.classList.toggle("no-search", settings.searchEnabled === false);
    document.body.classList.toggle("no-history", settings.historyEnabled === false);
    document.body.classList.toggle("history-in-nav", !!settings.historyInNav);
    document.body.classList.toggle("arrows-right", settings.arrowLayout === 'right');
    document.body.classList.toggle("arrows-left", settings.arrowLayout === 'left');
    document.body.classList.toggle("arrows-nav", settings.arrowLayout === 'nav');
    document.body.classList.toggle("arrows-off", settings.arrowLayout === 'off');
    if (window.AndroidBridge) window.AndroidBridge.setLightStatusBar(theme === "light");
    // Mirror the keep-screen-on setting to the Android window flag. On PC the
    // bridge method is absent and this no-ops. Defaults to true (matches the
    // pre-toggle behavior — the Kotlin side also defaults to keep-on).
    if (window.AndroidBridge && typeof window.AndroidBridge.setKeepScreenOn === 'function') {
      window.AndroidBridge.setKeepScreenOn(settings.keepScreenOn !== false);
    }
  }, [theme, settings]);

  // ── Return ─────────────────────────────────────────────────────────────
  return { settings, setSettings, toggleSetting, updateSetting };
}
