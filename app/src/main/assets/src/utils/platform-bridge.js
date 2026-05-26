// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   PlatformBridge — single source of truth for platform-conditional behavior
   ═══════════════════════════════════════════════════════════════════════
   Two shells (Android APK, desktop PWA), one JS codebase. PlatformBridge
   is the ONLY place that branches on platform. Consumers call its methods;
   they do NOT check `window.AndroidBridge` directly.

   Mirror of the 20 @JavascriptInterface methods on AppInterface.kt (the
   Android side). See AppInterface.kt for the authoritative contract.

   ── W1 sequence (this file evolves over W1.1 → W1.5) ────────────────────
   W1.1 (LANDED): interface + Android passthrough + web placeholders.
     Pure addition — no consumer migrations yet, no behavior change on
     Android, no real web implementations. Web impls are skeletons that
     warn (notYetImplemented) or return safe defaults.
   W1.2 (NEXT): migrate the call sites in use-settings, use-thumbnails,
     GardenView, JournalRecordingSheet, SettingsScreen. After this commit,
     grep for `window.AndroidBridge` outside this file returns ZERO matches.
   W1.3: web file I/O — openFilePicker + saveToDownloads via <input
     type="file"> / Blob URL. MUST be called from a user-gesture callstack
     (browsers block programmatic .click() outside user-initiated handlers).
   W1.4: web audio recording — CONSOLIDATES the existing MediaRecorder
     logic from JournalRecordingSheet.jsx:~140-160 (don't duplicate).
     Mime negotiation: webm/opus → ogg/opus → "error:unsupported-codec".
     No wav fallback (would balloon ~50KB/min memos to ~500KB/min).
   W1.5: web back-nav — Escape key gated by `document.fullscreenElement`
     + open-sheet state (don't swallow browser-native Escape behavior).

   ── Detection ───────────────────────────────────────────────────────────
   The isAndroid expression appears in exactly ONE place: this file.
   Matches the existing pattern at JournalRecordingSheet.jsx:214.
   Anywhere else is a regression — W1.2 cleans up all current duplicate
   detection variants (`_abc`, `_ab`, `_ab2`, `AB`, raw `isAndroid` locals).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} PlatformBridgeShape
 * @property {(light: boolean) => void} setLightStatusBar
 * @property {(enabled: boolean) => void} setKeepScreenOn
 * @property {(immersive: boolean) => void} setImmersiveMode
 * @property {(enabled: boolean) => void} setZoomEnabled
 * @property {() => void} resetZoom
 * @property {() => number} getZoomScale
 * @property {(style: number) => void} haptic
 * @property {() => void} startAudioSession
 * @property {() => void} endAudioSession
 * @property {() => void} requestMicPermission
 * @property {() => string} nativeRecordStart
 * @property {() => string} nativeRecordPause
 * @property {() => string} nativeRecordResume
 * @property {() => number} nativeRecordAmplitude
 * @property {() => void} nativeRecordStop
 * @property {() => void} nativeRecordCancel
 * @property {(topCropDp: number, maxDim: number, jpegQuality: number) => string} takeScreenshot
 * @property {() => void} openFilePicker
 * @property {(filename: string, content: string) => string} saveToDownloads
 * @property {() => string} getCrashLog
 */

// ── Detection ── only place this expression appears in the codebase ───
const isAndroid = !!(typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge);

// ── Android impl: pure passthrough to window.AndroidBridge ────────────
// Each method delegates 1:1 to the native bridge. Zero behavior change
// vs. the pre-W1.2 pattern of calling window.AndroidBridge directly.
// The /** @type {any} */ cast on window is needed because TS doesn't know
// about AndroidBridge until lint:globals regenerates globals.generated.d.ts;
// inside this file we accept the cast because we ARE the detection layer.
/** @type {PlatformBridgeShape} */
const androidImpl = {
  setLightStatusBar: (light) => /** @type {any} */ (window).AndroidBridge.setLightStatusBar(light),
  setKeepScreenOn: (enabled) => /** @type {any} */ (window).AndroidBridge.setKeepScreenOn(enabled),
  setImmersiveMode: (immersive) => /** @type {any} */ (window).AndroidBridge.setImmersiveMode(immersive),
  setZoomEnabled: (enabled) => /** @type {any} */ (window).AndroidBridge.setZoomEnabled(enabled),
  resetZoom: () => /** @type {any} */ (window).AndroidBridge.resetZoom(),
  getZoomScale: () => /** @type {any} */ (window).AndroidBridge.getZoomScale(),
  haptic: (style) => /** @type {any} */ (window).AndroidBridge.haptic(style),
  startAudioSession: () => /** @type {any} */ (window).AndroidBridge.startAudioSession(),
  endAudioSession: () => /** @type {any} */ (window).AndroidBridge.endAudioSession(),
  requestMicPermission: () => /** @type {any} */ (window).AndroidBridge.requestMicPermission(),
  nativeRecordStart: () => /** @type {any} */ (window).AndroidBridge.nativeRecordStart(),
  nativeRecordPause: () => /** @type {any} */ (window).AndroidBridge.nativeRecordPause(),
  nativeRecordResume: () => /** @type {any} */ (window).AndroidBridge.nativeRecordResume(),
  nativeRecordAmplitude: () => /** @type {any} */ (window).AndroidBridge.nativeRecordAmplitude(),
  nativeRecordStop: () => /** @type {any} */ (window).AndroidBridge.nativeRecordStop(),
  nativeRecordCancel: () => /** @type {any} */ (window).AndroidBridge.nativeRecordCancel(),
  takeScreenshot: (top, max, q) => /** @type {any} */ (window).AndroidBridge.takeScreenshot(top, max, q),
  openFilePicker: () => /** @type {any} */ (window).AndroidBridge.openFilePicker(),
  saveToDownloads: (name, content) => /** @type {any} */ (window).AndroidBridge.saveToDownloads(name, content),
  getCrashLog: () => /** @type {any} */ (window).AndroidBridge.getCrashLog(),
};

// ── Web impl: placeholders (W1.3 / W1.4 / W1.5 fill in actual behavior) ─
// Three categories:
//   1. Genuine no-ops — Android-specific UI knobs where the browser
//      handles the concern natively (theme via CSS, audio session via
//      browser).
//   2. Safe defaults — getters with sensible web answers (getZoomScale
//      returns 1.0, getCrashLog returns "[]" matching the Android
//      debug-build path).
//   3. notYetImplemented warnings — surface the gap clearly when called.
//      Recording methods use the "error:<reason>" string contract matching
//      Kotlin's NativeAudioRecorder.Result.Failure → JS string shape.

const NYI_TAG = '[PlatformBridge]';
/**
 * @param {string} name
 * @returns {(...args: any[]) => void}
 */
const notYetImplemented = (name) => () => {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`${NYI_TAG} ${name}() web impl pending (W1.3-W1.5)`);
  }
};

/** @type {PlatformBridgeShape} */
const webImpl = {
  // Category 1 — genuine no-ops on web
  setLightStatusBar: () => {},   // CSS body.light handles the theme
  startAudioSession: () => {},   // Browser handles audio session natively
  endAudioSession: () => {},

  // Category 2 — safe defaults
  getZoomScale: () => 1.0,
  getCrashLog: () => '[]',
  nativeRecordAmplitude: () => 0,
  takeScreenshot: () => '',                                // W1.x html2canvas
  saveToDownloads: (_name, _content) => {                  // W1.3 — preserves return contract
    notYetImplemented('saveToDownloads')();
    return 'error:web-impl-pending';
  },
  nativeRecordStart: () => 'error:web-impl-pending',       // W1.4
  nativeRecordPause: () => 'error:web-impl-pending',       // W1.4
  nativeRecordResume: () => 'error:web-impl-pending',      // W1.4

  // Category 3 — not-yet-implemented warnings (void returns only)
  setImmersiveMode: notYetImplemented('setImmersiveMode'), // W1.x Fullscreen API
  setKeepScreenOn: notYetImplemented('setKeepScreenOn'),   // W1.x WakeLock API
  setZoomEnabled: notYetImplemented('setZoomEnabled'),
  resetZoom: notYetImplemented('resetZoom'),
  haptic: notYetImplemented('haptic'),                     // W1.x navigator.vibrate
  openFilePicker: notYetImplemented('openFilePicker'),     // W1.3
  requestMicPermission: notYetImplemented('requestMicPermission'), // W1.4
  nativeRecordStop: notYetImplemented('nativeRecordStop'), // W1.4
  nativeRecordCancel: notYetImplemented('nativeRecordCancel'), // W1.4
};

/**
 * The platform bridge. Selects between Android and Web impls at module
 * load time based on `window.AndroidBridge` presence. Consumers always
 * see the same shape (PlatformBridgeShape).
 *
 * @type {PlatformBridgeShape}
 */
export const PlatformBridge = isAndroid ? androidImpl : webImpl;
