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
import { normalizeFontScaleSource, resolveFontScale, HYDRATION_FONT_SCALE_SOURCE } from '../utils/font-scale.js';

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
      // (backupReminder + its lastExportAt/lastBackupRemindedAt stamps removed
      //  2026-08-04 — the boot backup-freshness toast is retired. Stale keys in
      //  old vot-state blobs are simply unread.)
      scriptureLayout: "genre", gardenTier: GARDEN_DEFAULT_TIER,
      showSettingsGear: true, translation: "nkjv", restoredNames: true, fontStyle: "classic",
      // Recorded Bible edition for the whole-book Listen pill ('off' hides it).
      // Values are BIBLE_AUDIO_EDITIONS keys (utils/audio-track.js); an unknown
      // persisted value acts as 'off' (bibleAudioEdition() returns null).
      bibleAudio: "brm-kjv",
      // Default voice for the LETTER recordings ('auto' = the manifest's own
      // pick — Benjamin supersedes, then reader rank). A reader code ('B'|'T'|
      // 'V'|'M') starts every letter that HAS a reading by that reader with it;
      // letters that don't keep the primary. AUDIO_READERS (utils/audio-track.js)
      // is the registry; the player reads this through setPreferredReader.
      letterReader: "auto",
      showChapterTitle: true, showSectionHeadings: true, showInlineEchoes: true,
      // Fullscreen gesture is on by default. The hint count is deliberately
      // persisted so the brief teaching toast stops after a few uses.
      doubleTapFullscreen: true, fullscreenHintCount: 0,
      tabsEnabled: true,
      searchEnabled: true, historyEnabled: true,
      historyInNav: true,
      showBookmarkNav: true,
      showThemeBtn: true,
      showScrollNotch: true,
      arrowLayout: "off", // "split" | "right" | "left" | "nav" | "off"
      fontScale: "1", // WL1 — text-size multiplier ("1" | "1.15" | "1.3" | "1.5"); the READER's choice
      // fontScaleSource and systemFontScale are DELIBERATELY ABSENT from
      // these defaults, and that is load-bearing.
      //
      // Defaults are merged OVER a legacy install's saved settings, so a
      // literal `fontScaleSource: "system"` here would land on every reader
      // who predates the key and look like an explicit choice —
      // normalizeFontScaleSource would take it at face value and a reader
      // sitting at 150% would drop to their phone's size with no migration
      // ever running. Absence is the signal the normalizer needs; only the
      // slider and the Settings switch ever write the key.
      //
      // systemFontScale is likewise not a default: it is whatever the Android
      // bridge last reported, written by the effect below and cached for
      // index.html's pre-bundle boot writer. Absent on web, where there is no
      // bridge — which is also what makes it the availability signal for the
      // Settings row.
      // Autoscroll. Speed is stored in LINES PER MINUTE, never px/s: the text-
      // size slider spans 80–160%, and a px/s speed would silently change
      // reading pace by up to 2× when the reader resizes text. The controller
      // derives px from a measured line height, so this value is scale-
      // invariant. Off by default — the pill is chrome on every reading screen.
      autoScroll: false,
      autoScrollLpm: "16",
      autoScrollNext: false,
      autoScrollEndMs: "2500",
      // Read-along (ui/components/ReadAlongHighlight.jsx). TWO keys, both ON
      // by default, because they are two different kinds of thing: the wash
      // is a passive paint through the CSS Custom Highlight API, while the
      // follow-scroll is a scrollTop WRITER under the lease documented in
      // hooks/use-autoscroll.js. A reader who wants the wash without the
      // motion turns off exactly that half; readAlongHighlight off takes both
      // (no paint, nothing to follow).
      readAlongHighlight: true,
      readAlongFollow: true,
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
    // WL1/Session-4 — text-size scale. Mirror the resolved scale onto the
    // --font-scale CSS var on <html>; app.css multiplies it into the root
    // font-size so all rem/em sizing scales (chrome is px-pinned — see the
    // "SESSION-4 TEXT-ONLY SCALING" block at the end of app.css). The
    // index.html boot script sets the initial value pre-mount (no FOUC);
    // this handles live changes from the Settings slider AND corrects the
    // pre-mount guess once the live bridge value is known.
    //
    // WHICH INPUT WINS is settings.fontScaleSource, not settings.fontScale —
    // see utils/font-scale.js. Clamping lives in resolveFontScale (SEC-3:
    // settings are import-restorable from a backup, so an out-of-range value
    // must not reach the CSS var).
    //
    // THE BRIDGE IS READ HERE AND NOWHERE ELSE. The value is cached back into
    // settings.systemFontScale so index.html's inline writer — which runs
    // before any bundle and has no proof the JavascriptInterface exists yet —
    // never has to ask. `getSystemFontScale` does not exist on the bridge
    // until the native text-zoom batch lands; until then this reads undefined,
    // nothing is cached, and a 'system' source renders at 1, which is exactly
    // today's behaviour. The web build has no bridge and is unaffected by
    // design.
    const _src = normalizeFontScaleSource(settings, HYDRATION_FONT_SCALE_SOURCE);
    // R2: ANDROID ONLY. The web PlatformBridge answers 1 by design, and
    // caching that would (a) write systemFontScale:"1" into every web reader's
    // state and (b) light up the "Use my phone's text size" row on a platform
    // with no phone text size to follow — a switch that does nothing. Absence
    // of the cached value IS the availability signal the Settings row reads,
    // so it has to stay absent where the feature does not apply.
    let _sysNow;
    try {
      const _b = /** @type {any} */ (PlatformBridge);
      if (_b.isAndroid && typeof _b.getSystemFontScale === 'function') _sysNow = _b.getSystemFontScale();
    } catch (_e) { /* a bridge hop can throw; a wrong text size is not worth a crash */ }
    const _sysStr = (_sysNow === undefined || _sysNow === null) ? undefined : String(_sysNow);
    const _resolved = resolveFontScale(
      _sysStr === undefined ? settings : { ...settings, systemFontScale: _sysStr },
      _src,
    );
    document.documentElement.style.setProperty("--font-scale", String(_resolved));
    // Cache it for the next boot, and only when it actually moved — this
    // effect runs on every settings change and an unconditional write would
    // loop.
    if (_sysStr !== undefined && _sysStr !== settings.systemFontScale) {
      setSettings((prev) => ({ ...prev, systemFontScale: _sysStr }));
    }
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
