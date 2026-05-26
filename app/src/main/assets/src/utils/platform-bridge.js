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
 * @property {(topCropDp: number, maxDim: number, jpegQuality: number) => Promise<string>} takeScreenshot
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
  // Android takeScreenshot is sync (PixelCopy on a binder thread); wrap in
  // Promise.resolve to give consumers a uniform Promise<string> shape on
  // both platforms. Web returns html2canvas's genuine async Promise.
  takeScreenshot: async (top, max, q) => /** @type {any} */ (window).AndroidBridge.takeScreenshot(top, max, q),
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

// Web WakeLock — keepScreenOn impl (W1.2 Tier B.1). Per [[explicit-async-decision]]
// this is FIRE-AND-FORGET (return void): caller fires from a settings-toggle
// effect; UI shouldn't block on wake-lock requests, and a request failure
// isn't worth surfacing to the user. Internal Promise rejection is caught
// and logged via console.warn (W7.4 will migrate this to DiagnosticLog.warn).
//
// Semantic note: Android's setKeepScreenOn sets a window flag the OS respects
// until the app is backgrounded. The Web WakeLock API auto-releases the
// sentinel when the document is hidden (tab switch, minimize). Same intent
// (don't dim while user is reading); slightly different release trigger.
//
// De-dup: the consuming useSettings effect fires on every [theme, settings]
// change. If WakeLock keeps failing for the same reason (e.g. iframe / not
// visible / http context), log ONCE per failure session. Reset the flag on
// any successful acquire or any release call. This keeps prod-environment
// log noise minimal without hiding genuinely-changing failures.
/** @type {any} */ let _webWakeLockSentinel = null;
/** @type {boolean} */ let _webWakeLockRequestInFlight = false;
/** @type {string | null} */ let _webWakeLockLastWarnedReason = null;
function _warnWakeLock(/** @type {string} */ tag, /** @type {any} */ e) {
  if (typeof console === 'undefined' || !console.warn) return;
  const reason = (e && e.message) || String(e);
  if (reason === _webWakeLockLastWarnedReason) return;  // de-dup repeat failures
  _webWakeLockLastWarnedReason = reason;
  console.warn(`[PlatformBridge] setKeepScreenOn(${tag}) failed:`, reason);
}
/** @param {boolean} enabled */
function webSetKeepScreenOn(enabled) {
  try {
    const wakeLock = /** @type {any} */ (navigator).wakeLock;
    if (!wakeLock || typeof wakeLock.request !== 'function') return;  // API absent
    if (enabled) {
      if (_webWakeLockSentinel && !_webWakeLockSentinel.released) return;  // already held
      if (_webWakeLockRequestInFlight) return;  // request pending; don't pile up
      _webWakeLockRequestInFlight = true;
      wakeLock.request('screen').then((/** @type {any} */ sentinel) => {
        _webWakeLockSentinel = sentinel;
        _webWakeLockLastWarnedReason = null;  // success → reset the de-dup flag
      }).catch((/** @type {any} */ e) => {
        _warnWakeLock('true', e);
      }).finally(() => {
        _webWakeLockRequestInFlight = false;
      });
    } else if (_webWakeLockSentinel) {
      const s = _webWakeLockSentinel;
      _webWakeLockSentinel = null;
      _webWakeLockLastWarnedReason = null;  // explicit disable → reset the de-dup flag
      try {
        const p = s.release();
        if (p && typeof p.catch === 'function') {
          p.catch((/** @type {any} */ e) => _warnWakeLock('false', e));
        }
      } catch (e) {
        _warnWakeLock('false', e);
      }
    }
  } catch (e) {
    _warnWakeLock('unexpected', e);
  }
}

// Web screenshot — html2canvas integration (W1.2 Tier A). Folded in from
// use-thumbnails.js's old fallback path per [[consolidate-dont-duplicate]] +
// [[guard-removal-includes-fallback]]. Bridge owns the implementation;
// consumers (use-thumbnails) become pure callers of PlatformBridge.takeScreenshot.
//
// IGNORE_CLASSES is coupled to the app's UI structure — if a new chrome
// element is added that shouldn't appear in tab thumbnails, update this list.
// Long-term cleanup (post-W1): drive chrome-hiding entirely via CSS tied to
// the existing body.capturing-thumb class so the bridge doesn't need this knowledge.
const SCREENSHOT_IGNORE_CLASSES = [
  'tabs-overview-layer', 'top-nav', 'back-hint-row',
  'chapter-nav-sticky', 'reading-dot-global', 'surprise-fab',
  'mode-toggle-wrap',
];

/**
 * Web screenshot impl using html2canvas (bundled in bundle-a). Returns
 * a JPEG data URL string, or '' on failure / when html2canvas isn't loaded.
 *
 * @param {number} _topCropDp  - ignored on web (chrome hidden via classes)
 * @param {number} maxDim      - max width/height in CSS px; downscale if exceeded
 * @param {number} jpegQuality - 0-100 integer (matches Android contract);
 *                                converted to 0.0-1.0 for canvas.toDataURL
 * @returns {Promise<string>}
 */
async function webTakeScreenshot(_topCropDp, maxDim, jpegQuality) {
  // html2canvas ships in bundle-a (vendor); guard for unit-test env / cold boot
  if (typeof /** @type {any} */ (globalThis).html2canvas !== 'function') return '';
  const h2c = /** @type {any} */ (globalThis).html2canvas;
  const isLight = (typeof document !== 'undefined') && document.body.classList.contains('light');
  const bg = isLight ? '#f7f2e8' : '#07070e';
  try {
    const canvas = await h2c(document.body, {
      backgroundColor: bg,
      scale: Math.min(/** @type {any} */ (window).devicePixelRatio || 1, 2),
      useCORS: true,
      logging: false,
      allowTaint: false,
      imageTimeout: 2000,
      ignoreElements: (/** @type {Element} */ el) =>
        el.classList && SCREENSHOT_IGNORE_CLASSES.some((c) => el.classList.contains(c)),
    });
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(maxDim / w, maxDim / h, 1);
    let out = canvas;
    if (scale < 1) {
      const c2 = document.createElement('canvas');
      c2.width = Math.round(w * scale);
      c2.height = Math.round(h * scale);
      const ctx = c2.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        /** @type {any} */ (ctx).imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
      }
      out = c2;
    }
    return out.toDataURL('image/jpeg', Math.max(0, Math.min(100, jpegQuality)) / 100);
  } catch (_e) {
    return '';
  }
}

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
  takeScreenshot: webTakeScreenshot,
  saveToDownloads: (_name, _content) => {                  // W1.3 — preserves return contract
    notYetImplemented('saveToDownloads')();
    return 'error:web-impl-pending';
  },
  nativeRecordStart: () => 'error:web-impl-pending',       // W1.4
  nativeRecordPause: () => 'error:web-impl-pending',       // W1.4
  nativeRecordResume: () => 'error:web-impl-pending',      // W1.4

  // Category 1.5 — real web impl (W1.2 Tier B.1, fire-and-forget WakeLock)
  setKeepScreenOn: webSetKeepScreenOn,

  // Category 3 — not-yet-implemented warnings (void returns only)
  setImmersiveMode: notYetImplemented('setImmersiveMode'), // W1.x Fullscreen API
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
