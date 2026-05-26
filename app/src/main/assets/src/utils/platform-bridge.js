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

// Web immersive mode — Fullscreen API (W1.2 Tier B.3). GardenView calls
// setImmersiveMode(true) from a mount-time useEffect, which is OUTSIDE
// the user-gesture chain that triggered navigation. Most browsers block
// requestFullscreen() in that context with a "Permissions check failed"
// TypeError — we swallow it (best-effort; on Android this works natively;
// on web Garden remains in-page with browser chrome visible).
/** @param {boolean} immersive */
function webSetImmersiveMode(immersive) {
  try {
    if (immersive) {
      const elem = /** @type {any} */ (document).documentElement;
      if (elem && typeof elem.requestFullscreen === 'function') {
        const result = elem.requestFullscreen();
        if (result && typeof result.catch === 'function') {
          result.catch((/** @type {any} */ e) => {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[PlatformBridge] setImmersiveMode(true) requestFullscreen blocked:', e && e.message || e);
            }
          });
        }
      }
    } else {
      const doc = /** @type {any} */ (document);
      if (typeof doc.exitFullscreen === 'function' && doc.fullscreenElement) {
        const result = doc.exitFullscreen();
        if (result && typeof result.catch === 'function') {
          result.catch((/** @type {any} */ e) => {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[PlatformBridge] setImmersiveMode(false) exitFullscreen failed:', e && e.message || e);
            }
          });
        }
      }
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[PlatformBridge] setImmersiveMode unexpected error:', /** @type {any} */ (e).message || e);
    }
  }
}

// Web zoom — DELIBERATE NO-OPS (W1.2 Tier B.3). Per
// [[verify-inertness-not-equivalence]]: the Android methods exist to
// override WebView's default (zoom DISABLED), enabling pinch-zoom on the
// Garden image specifically. Browsers default to zoom ENABLED — there's
// nothing for the bridge to do. CSS touch-action: none would actively
// BREAK the natural pinch behavior the user expects. resetZoom has no
// web equivalent at all (no JS API can undo a user's pinch-zoom). These
// are no-ops, NOT CSS hacks.
const webSetZoomEnabled = () => {};
const webResetZoom = () => {};

// Web file picker — openFilePicker impl (W1.2 Tier B.2). Per
// [[file-input-user-gesture]], the input.click() MUST be invoked synchronously
// from the caller's user-gesture handler (no await/setTimeout between).
// Per [[preserve-callback-contracts]], we fire `window.__onImportFile(base64)`
// with the same shape Android's AppInterface fires — the caller (SettingsScreen)
// installs that global handler BEFORE calling openFilePicker; web fires it
// from FileReader.onload exactly like Android fires it from the picker activity.
//
// FileReader.readAsDataURL gives us a "data:<mime>;base64,XXX" string; we
// strip the prefix so the callback receives pure base64 matching the
// Android contract (atob-decodable directly).
function webOpenFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (/** @type {any} */ ev) => {
    const cb = /** @type {any} */ (window).__onImportFile;
    const file = ev.target.files && ev.target.files[0];
    if (!file) {
      if (typeof cb === 'function') cb(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (/** @type {any} */ re) => {
      // "data:application/json;base64,XXX" → strip prefix to "XXX"
      const result = String(re.target.result || '');
      const idx = result.indexOf(',');
      const base64 = idx >= 0 ? result.substring(idx + 1) : result;
      if (typeof cb === 'function') cb(base64);
    };
    reader.onerror = () => {
      if (typeof cb === 'function') cb(null);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// Web save-to-downloads — Blob + URL.createObjectURL + anchor click (W1.2
// Tier B.2). Folded in from SettingsScreen.jsx's existing fallback per
// [[consolidate-dont-duplicate]]. Returns 'ok' or 'error:<reason>'
// matching the Android contract from AppInterface.kt.
/**
 * @param {string} filename
 * @param {string} content
 * @returns {string}
 */
function webSaveToDownloads(filename, content) {
  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); a.remove(); } catch (_e) { /* DOM teardown best-effort */ }
    }, 0);
    return 'ok';
  } catch (e) {
    return 'error:' + (/** @type {any} */ (e) && /** @type {any} */ (e).message || e);
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
  getCrashLog: () => '[]',           // W7.4 will populate the JS DiagnosticLog
  nativeRecordAmplitude: () => 0,

  // Category 3 — real web impls
  takeScreenshot: webTakeScreenshot,         // Tier A (html2canvas)
  setKeepScreenOn: webSetKeepScreenOn,       // Tier B.1 (WakeLock + de-dup)
  openFilePicker: webOpenFilePicker,         // Tier B.2 (DOM input + FileReader → __onImportFile)
  saveToDownloads: webSaveToDownloads,       // Tier B.2 (Blob + URL.createObjectURL + anchor)
  setImmersiveMode: webSetImmersiveMode,     // Tier B.3 (Fullscreen API, best-effort)
  setZoomEnabled: webSetZoomEnabled,         // Tier B.3 (no-op — browsers handle zoom natively)
  resetZoom: webResetZoom,                   // Tier B.3 (no-op — no JS API to reset user pinch-zoom)

  // Recording string-contract placeholders (W1.4)
  nativeRecordStart: () => 'error:web-impl-pending',
  nativeRecordPause: () => 'error:web-impl-pending',
  nativeRecordResume: () => 'error:web-impl-pending',

  // Category 4 — not-yet-implemented warnings (void returns only)
  haptic: notYetImplemented('haptic'),                       // future; haptic JS wiring not yet present
  requestMicPermission: notYetImplemented('requestMicPermission'), // W1.4
  nativeRecordStop: notYetImplemented('nativeRecordStop'),   // W1.4
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
