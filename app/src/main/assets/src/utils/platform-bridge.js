// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   PlatformBridge — single source of truth for platform-conditional behavior
   ═══════════════════════════════════════════════════════════════════════
   Two shells (Android APK, desktop PWA), one JS codebase. PlatformBridge
   is the ONLY place that branches on platform. Consumers call its methods,
   or read `PlatformBridge.isAndroid` for the platform flag; they do NOT check
   `window.AndroidBridge` directly. (U14, 2026-06-01: restored — the 4 sites
   that bypassed this — storage-health, use-history-sync, use-android-back ×2 —
   now read PlatformBridge.isAndroid. A grep for `window.AndroidBridge` outside
   this file returns only comments + test fixtures.)

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
   W1.3: web file I/O — openFilePicker + saveToFile via <input
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

// W7.4: getCrashLog merges the JS-side DiagnosticLog with the native log.
// diagnostic-log.js is a zero-dependency leaf in the same bundle (bundle-b),
// so this import is a clean one-way edge — no cycle.
import { DiagnosticLog } from './diagnostic-log.js';

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
 * @property {(suggestedName: string, content: string) => void} saveToFile
 * @property {(suggestedName: string) => Promise<{ write: (chunk: Uint8Array) => Promise<void>, close: () => Promise<void>, abort: () => Promise<void> } | null>} openExportSink
 * @property {() => Promise<Blob | null>} pickImportFile
 * @property {(suggestedName: string) => void} v3ExportOpen
 * @property {(manifestJson: string) => string} v3ExportBegin
 * @property {(sizeStr: string) => string} v3ExportWriteBlob
 * @property {(base64Chunk: string) => string} v3ExportChunk
 * @property {(commit: boolean) => string} v3ExportFinish
 * @property {() => void} v3ImportOpen
 * @property {() => string} v3ImportBegin
 * @property {() => string} v3ImportNextBlob
 * @property {(maxBytes: number) => string} v3ImportReadChunk
 * @property {() => void} v3ImportClose
 * @property {() => string} getCrashLog
 * @property {() => void} clearGardenCache
 */

/**
 * @typedef {PlatformBridgeShape & { isAndroid: boolean }} PlatformBridgeExport
 */

// ── Detection ── only place this expression appears in the codebase ───
const isAndroid = !!(typeof window !== 'undefined' && /** @type {any} */ (window).AndroidBridge);

// ── getCrashLog merge (W7.4) ──────────────────────────────────────────
// On Android, window.AndroidBridge.getCrashLog() returns the Kotlin
// BoundedLogTree as a JSON array string. We parse it, concat the JS-side
// DiagnosticLog entries, and sort by timestamp so the export reads as one
// chronological stream. Both sides emit the same { t, lvl, tag, msg } shape
// (see diagnostic-log.js / BoundedLogTree.kt) — no per-entry reshaping. A
// malformed native log falls back to JS-only rather than throwing.
/**
 * @param {string} nativeJson  the Kotlin BoundedLogTree JSON array string
 * @returns {string} merged JSON array string, sorted ascending by `t`
 */
function mergeCrashLog(nativeJson) {
  let native = [];
  try {
    const parsed = JSON.parse(nativeJson || '[]');
    if (Array.isArray(parsed)) native = parsed;
  } catch (_e) { /* malformed native log — fall back to JS-only */ }
  const merged = native.concat(DiagnosticLog.entries());
  merged.sort((a, b) => ((a && a.t) || 0) - ((b && b.t) || 0));
  return JSON.stringify(merged);
}

// ── Android impl: pure passthrough to window.AndroidBridge ────────────
// Each method delegates 1:1 to the native bridge.
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
  saveToFile: (name, content) => /** @type {any} */ (window).AndroidBridge.saveToFile(name, content),
  // openExportSink/pickImportFile are the WEB v3 file primitives (FS Access API
  // / sliceable Blob). They are NOT the Android path: a SAF import can't expose a
  // GB file as a lazy random-access Blob, so Android streams through the native
  // chunked bridge below instead (native owns the framing — see backup-container.js /
  // StorageManager.kt). SettingsScreen branches on isAndroid and never calls
  // these two on Android; they reject loudly if something ever does.
  openExportSink: () => Promise.reject(new Error('openExportSink: web-only — Android uses the v3 chunked bridge (v3Export*)')),
  pickImportFile: () => Promise.reject(new Error('pickImportFile: web-only — Android uses the v3 chunked bridge (v3Import*)')),
  // v3 streaming backup — native chunked bridge (P3). The framing is in Kotlin
  // (StorageManager); these are 1:1 passthroughs. base64 is the transient bridge
  // encoding only (the string bridge can't carry raw bytes). v3ExportOpen/
  // v3ImportOpen launch the async SAF picker and settle via __onV3ExportReady /
  // __onV3ImportReady; the rest are synchronous and return "ok"/"error:<reason>"
  // (or "v3:<manifest>"/"legacy:<json>" for v3ImportBegin, base64/""/"error:" for
  // v3ImportReadChunk). Driven by SettingsScreen._exportV3Android/_importV3Android.
  v3ExportOpen: (name) => /** @type {any} */ (window).AndroidBridge.v3ExportOpen(name),
  v3ExportBegin: (manifestJson) => /** @type {any} */ (window).AndroidBridge.v3ExportBegin(manifestJson),
  v3ExportWriteBlob: (sizeStr) => /** @type {any} */ (window).AndroidBridge.v3ExportWriteBlob(sizeStr),
  v3ExportChunk: (b64) => /** @type {any} */ (window).AndroidBridge.v3ExportChunk(b64),
  v3ExportFinish: (commit) => /** @type {any} */ (window).AndroidBridge.v3ExportFinish(commit),
  v3ImportOpen: () => /** @type {any} */ (window).AndroidBridge.v3ImportOpen(),
  v3ImportBegin: () => /** @type {any} */ (window).AndroidBridge.v3ImportBegin(),
  v3ImportNextBlob: () => /** @type {any} */ (window).AndroidBridge.v3ImportNextBlob(),
  v3ImportReadChunk: (n) => /** @type {any} */ (window).AndroidBridge.v3ImportReadChunk(n),
  v3ImportClose: () => /** @type {any} */ (window).AndroidBridge.v3ImportClose(),
  // Merge the Kotlin BoundedLogTree with the JS DiagnosticLog (W7.4).
  getCrashLog: () => mergeCrashLog(/** @type {any} */ (window).AndroidBridge.getCrashLog()),
  // NTV3: wipe the native Garden image disk cache (cacheDir/garden, up to 800 MB).
  // Called from "Clear All My Data" so the native cache doesn't survive the wipe.
  clearGardenCache: () => /** @type {any} */ (window).AndroidBridge.clearGardenCache(),
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

/**
 * The v3 native chunked-bridge methods exist only on Android — on web, the v3
 * container is streamed via openExportSink + writeContainer / pickImportFile +
 * readContainer (SettingsScreen branches on isAndroid and never calls these on
 * web). They throw rather than silently no-op so a wiring mistake surfaces.
 * @param {string} name
 * @returns {(...args: any[]) => never}
 */
const v3AndroidOnly = (name) => () => {
  throw new Error(`${name}: Android-only (web v3 backup uses openExportSink/writeContainer + pickImportFile/readContainer)`);
};

// Web WakeLock — keepScreenOn impl (W1.2 Tier B.1). Per [[explicit-async-decision]]
// this is FIRE-AND-FORGET (return void): caller fires from a settings-toggle
// effect; UI shouldn't block on wake-lock requests, and a request failure
// isn't worth surfacing to the user. Internal Promise rejection is caught,
// recorded to the DiagnosticLog (W7.4), and logged via console.warn.
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
  const reason = (e && e.message) || String(e);
  if (reason === _webWakeLockLastWarnedReason) return;  // de-dup repeat failures
  _webWakeLockLastWarnedReason = reason;
  DiagnosticLog.warn('wakelock', `setKeepScreenOn(${tag}) failed: ${reason}`);
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[PlatformBridge] setKeepScreenOn(${tag}) failed:`, reason);
  }
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
// Matches Android's StorageManager.MAX_IMPORT_SIZE (50 MB) so the oversize
// import guard is symmetric across both platforms.
const WEB_MAX_IMPORT_BYTES = 50 * 1024 * 1024;

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
    // Mirror the Android 50 MB import cap: a huge accidental pick would
    // otherwise OOM / hang FileReader on a low-end device. Report it as the
    // 'too_large' code so SettingsScreen shows the specific oversize message;
    // every other null stays a silent cancel/error exactly as before.
    if (file.size > WEB_MAX_IMPORT_BYTES) {
      if (typeof cb === 'function') cb(null, 'too_large');
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
// Tier B.2). The browser's download manager IS the destination picker
// (the user's download settings choose the folder, or a "save as" dialog
// prompts), so this mirrors the SAF flow's outcome. Asynchronous to match
// the Android saveToFile contract: fires window.__onExportComplete with
// "ok" / "error:<reason>" instead of returning a value.
/**
 * @param {string} suggestedName
 * @param {string} content
 * @returns {void}
 */
function webSaveToFile(suggestedName, content) {
  /** @param {string} result */
  const report = (result) => {
    const cb = /** @type {any} */ (window).__onExportComplete;
    if (typeof cb === 'function') cb(result);
  };
  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); a.remove(); } catch (_e) { /* DOM teardown best-effort */ }
    }, 0);
    report('ok');
  } catch (e) {
    report('error:' + (/** @type {any} */ (e) && /** @type {any} */ (e).message || e));
  }
}

// ── v3 streaming backup I/O (P2 — web side) ─────────────────────────────
// The bridge provides format-AGNOSTIC file primitives; SettingsScreen layers the
// container codec (writeContainer/readContainer) on top. The File System Access
// API (showSaveFilePicker/createWritable, Chromium/Edge) streams straight to disk
// so a GB-scale backup never sits whole in memory. Where it's absent
// (Firefox/Safari/most mobile web) we fall back to a Blob download — best-effort,
// bounded by available memory. The Android equivalents stream through the native
// chunked bridge (P3) and implement the SAME { write, close } / File contract.

/**
 * Open a streaming WRITE sink for an export. Returns { write, close, abort }, or
 * null if the user cancelled the destination picker. abort() discards a partial
 * write on failure (BAK5) so a mid-stream error can't leave a truncated backup.
 * @param {string} suggestedName
 * @returns {Promise<{ write: (chunk: Uint8Array) => Promise<void>, close: () => Promise<void>, abort: () => Promise<void> } | null>}
 */
async function webOpenExportSink(suggestedName) {
  const picker = /** @type {any} */ (window).showSaveFilePicker;
  if (typeof picker === 'function') {
    let handle;
    try {
      handle = await picker({
        suggestedName,
        types: [{ description: 'VOTReader backup', accept: { 'application/octet-stream': ['.votbak'] } }],
      });
    } catch (e) {
      if (e && /** @type {any} */ (e).name === 'AbortError') return null; // user cancelled
      throw e;
    }
    const writable = await handle.createWritable();
    return {
      write: (chunk) => writable.write(chunk),
      close: () => writable.close(),
      // BAK5: createWritable() commits to the target file only on close()
      // (temp-swap), so abort() drops the in-progress data and leaves the user's
      // existing file intact — deterministic cleanup instead of relying on GC of
      // an unclosed stream. The only backup must never leave a truncated .votbak.
      abort: () => writable.abort(),
    };
  }
  // Fallback: accumulate chunks, download as a Blob on close. No streaming-to-disk
  // without the FS Access API, so this is memory-bounded (best-effort for moderate
  // sizes; the GB-scale web path is the FS Access API above / the Android native bridge).
  /** @type {Uint8Array[]} */
  const chunks = [];
  return {
    write: (chunk) => { chunks.push(chunk.slice()); return Promise.resolve(); },
    // BAK5: nothing is written to disk until close() triggers the download, so
    // abort just drops the buffered chunks — no partial file can exist on this path.
    abort: () => { chunks.length = 0; return Promise.resolve(); },
    close: () => {
      try {
        // Cast: TS lib types Uint8Array as Uint8Array<ArrayBufferLike>, which it
        // won't accept as a BlobPart (wants ArrayBuffer-backed) — a runtime no-op.
        const blob = new Blob(/** @type {any} */ (chunks), { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (_e) { /* DOM teardown best-effort */ } }, 0);
      } catch (e) { return Promise.reject(e); }
      return Promise.resolve();
    },
  };
}

/**
 * Pick a backup file to import. Returns the File (a Blob the container reader can
 * slice) or null if cancelled. MUST be called synchronously from a user gesture
 * ([[file-input-user-gesture]]) — the caller awaits this from a click handler.
 * @returns {Promise<Blob | null>}
 */
function webPickImportFile() {
  const picker = /** @type {any} */ (window).showOpenFilePicker;
  if (typeof picker === 'function') {
    return picker({ multiple: false })
      .then((/** @type {any[]} */ handles) => (handles && handles[0] ? handles[0].getFile() : null))
      .catch((/** @type {any} */ e) => { if (e && e.name === 'AbortError') return null; throw e; });
  }
  // Fallback: a DOM file input; input.click() runs synchronously in the gesture.
  return new Promise((resolve, reject) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.votbak,application/octet-stream,application/json,.json';
      input.onchange = (/** @type {any} */ ev) => {
        const file = ev.target.files && ev.target.files[0];
        resolve(file || null);
      };
      input.click();
    } catch (e) { reject(e); }
  });
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

/** @type {Promise<any> | null} */
let _h2cPromise = null;
/**
 * Lazy-load html2canvas.min.js on the FIRST web screenshot (U13). It was
 * concatenated into bundle-a — ~198 KB parsed at EVERY boot, but only web
 * thumbnails use it (Android screenshots via native PixelCopy), so it was pure
 * boot-path dead weight on Android. The file stays SW-precached, so this
 * resolves ~instantly (and offline). Resolves to the html2canvas function, or
 * null if it can't load (degrades to no thumbnail). The injected <script src>
 * is governed by CSP script-src 'self' — unaffected by the U10 inline hashes.
 * @returns {Promise<any>}
 */
function _ensureHtml2canvas() {
  const g = /** @type {any} */ (globalThis);
  if (typeof g.html2canvas === 'function') return Promise.resolve(g.html2canvas);
  if (_h2cPromise) return _h2cPromise;
  if (typeof document === 'undefined') return Promise.resolve(null);
  _h2cPromise = new Promise((resolve) => {
    try {
      const s = document.createElement('script');
      s.src = 'html2canvas.min.js';
      s.onload = () => resolve(typeof g.html2canvas === 'function' ? g.html2canvas : null);
      s.onerror = () => { _h2cPromise = null; resolve(null); }; // allow a retry next time
      document.head.appendChild(s);
    } catch (_e) { _h2cPromise = null; resolve(null); }
  });
  return _h2cPromise;
}

/**
 * Web screenshot impl using html2canvas (lazy-loaded on demand — U13). Returns
 * a JPEG data URL string, or '' on failure / when html2canvas can't load.
 *
 * @param {number} _topCropDp  - ignored on web (chrome hidden via classes)
 * @param {number} maxDim      - max width/height in CSS px; downscale if exceeded
 * @param {number} jpegQuality - 0-100 integer (matches Android contract);
 *                                converted to 0.0-1.0 for canvas.toDataURL
 * @returns {Promise<string>}
 */
async function webTakeScreenshot(_topCropDp, maxDim, jpegQuality) {
  const h2c = await _ensureHtml2canvas();
  if (typeof h2c !== 'function') return '';
  const isLight = (typeof document !== 'undefined') && document.body.classList.contains('light');
  const bg = isLight ? '#f7f2e8' : '#07070e';
  try {
    const canvas = await h2c(document.body, {
      backgroundColor: bg,
      // PERF-1: capture at scale 1, NOT devicePixelRatio×2. The result is downscaled to
      // maxDim:1440 below regardless, so a DPR×2 capture of the WHOLE scrolled body (a
      // long chapter is many thousands of px tall) just allocated a ~4× larger transient
      // canvas (tens of MB) for zero visible gain — and this fires on every scroll-stop
      // and after every nav. scale:1 keeps the spike bounded on a 2-3 GB device.
      scale: 1,
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

// Web audio recording — MediaRecorder + AnalyserNode (W1.2 Tier C).
// Consolidates the existing inline MediaRecorder code from
// JournalRecordingSheet.jsx:118-279 per [[consolidate-dont-duplicate]].
// The component (Tier C consumer migration) becomes a pure UI shell with
// no platform branches — ALL recording state + lifecycle lives here.
//
// Architecture (per directives + memories):
// - Module-level _webRecorder holds session state (mediaStream,
//   mediaRecorder, audioContext, analyser, ampBuffer, chunks, timing).
// - Pre-allocated Uint8Array ampBuffer per [[amplitude-buffer-preallocation]] —
//   AnalyserNode.getByteTimeDomainData(buf) reuses the same buffer instance
//   across every amplitude poll (~50ms cadence) to avoid GC pressure.
// - requestMicPermission is fire-and-forget per [[explicit-async-decision]]:
//   getUserMedia + store stream + fire window.__onMicPermissionResult.
// - nativeRecordStop fires __onNativeRecordingComplete(b64, durMs, mime, blob?)
//   — one callback shape for both platforms ([[callback-flow-unification]]):
//   Android passes base64 (string-only bridge), web passes the Blob directly as
//   the 4th arg (J3 — no base64 round-trip) with b64=null; the consumer prefers
//   the blob and falls back to decoding b64.
// - MediaStream tracks are .stop()-ed on every exit path (stop / cancel /
//   error) per [[mediastream-track-cleanup]] — leaked tracks keep the mic
//   indicator active + hardware allocated.
// - Mime negotiation strictly webm/opus → ogg/opus → 'error:unsupported-codec'
//   per [[mediarecorder-mime-policy]] — NO wav fallback (would 10× per-memo
//   storage size). Existing 4-candidate list (webm-no-codec, mp4) intentionally
//   removed in favor of the policy memo's discipline.

const _webRecorder = {
  /** @type {any} */ mediaStream: null,
  /** @type {any} */ mediaRecorder: null,
  /** @type {any} */ audioContext: null,
  /** @type {any} */ analyser: null,
  /** @type {Uint8Array | null} */ ampBuffer: null,
  /** @type {any[]} */ chunks: [],
  /** @type {number} */ startTimeMs: 0,
  /** @type {number} */ accumulatedMs: 0,
  /** @type {string} */ mime: '',
  /** @type {'inactive'|'recording'|'paused'} */ state: 'inactive',
};

// Full session teardown — used by stop's onstop AND cancel AND error paths.
// Stops MediaStream tracks (releases mic + clears OS indicator), closes
// AudioContext, clears chunks. Safe to call multiple times (idempotent).
function _webRecorderCleanup() {
  if (_webRecorder.mediaStream) {
    try { _webRecorder.mediaStream.getTracks().forEach((/** @type {any} */ t) => t.stop()); } catch (_e) { /* best-effort */ }
    _webRecorder.mediaStream = null;
  }
  if (_webRecorder.audioContext) {
    try { _webRecorder.audioContext.close(); } catch (_e) { /* best-effort */ }
    _webRecorder.audioContext = null;
  }
  _webRecorder.analyser = null;
  _webRecorder.ampBuffer = null;
  _webRecorder.chunks = [];
  _webRecorder.mediaRecorder = null;
  _webRecorder.state = 'inactive';
  _webRecorder.startTimeMs = 0;
  _webRecorder.accumulatedMs = 0;
  _webRecorder.mime = '';
}

// Fire __onNativeRecordingComplete(base64, durationMs, mime, blob) — the global
// callback that the consumer (JournalRecordingSheet) installs before recording
// starts. Android passes base64 (its bridge is string-only) and no blob; web
// passes the assembled Blob DIRECTLY as the 4th arg (CLAUDE.md rule 5 — no
// base64 encode/decode round-trip held in heap) and the consumer prefers it.
// Wrapped in try/catch so a consumer-side throw doesn't leak out of the bridge.
/**
 * @param {string | null} b64
 * @param {number} durMs
 * @param {string} mime
 * @param {Blob} [blob] - web only: the recording Blob, passed straight through
 *   to skip a base64 round-trip; Android omits it and the consumer uses b64.
 */
function _fireRecordingComplete(b64, durMs, mime, blob) {
  const cb = /** @type {any} */ (window).__onNativeRecordingComplete;
  if (typeof cb === 'function') {
    try { cb(b64, durMs, mime, blob); } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[PlatformBridge] __onNativeRecordingComplete consumer threw:', /** @type {any} */ (e).message || e);
      }
    }
  }
}

function webRequestMicPermission() {
  // Fire-and-forget: getUserMedia is async, but the bridge contract is
  // sync void. Caller installs window.__onMicPermissionResult BEFORE
  // calling; we fire it from the async result. Stream is stored for
  // nativeRecordStart to consume next.
  const cbName = '__onMicPermissionResult';
  /** @param {boolean} granted */
  const fire = (granted) => {
    const cb = /** @type {any} */ (window)[cbName];
    if (typeof cb === 'function') {
      try { cb(granted); } catch (_e) { /* consumer-side error — best-effort */ }
    }
  };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    fire(false);
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((/** @type {any} */ stream) => {
      // Store the stream for nativeRecordStart to use
      _webRecorder.mediaStream = stream;
      fire(true);
    })
    .catch((/** @type {any} */ _err) => {
      // NotAllowedError / NotFoundError / NotReadableError / etc.
      fire(false);
    });
}

/** @returns {string} */
function webNativeRecordStart() {
  if (typeof MediaRecorder === 'undefined') return 'error:no-MediaRecorder';
  if (!_webRecorder.mediaStream) return 'error:no-stream';

  // Strict mime negotiation per [[mediarecorder-mime-policy]]
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
  let mime = '';
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) { mime = c; break; }
  }
  if (!mime) {
    // Neither opus codec available — surface clean error, DO NOT fall back to wav
    _webRecorderCleanup();
    return 'error:unsupported-codec';
  }

  /** @type {any} */ let rec;
  try {
    rec = new MediaRecorder(_webRecorder.mediaStream, { mimeType: mime });
  } catch (e) {
    _webRecorderCleanup();
    return 'error:' + ((/** @type {any} */ (e) && /** @type {any} */ (e).message) || e);
  }

  _webRecorder.mediaRecorder = rec;
  _webRecorder.chunks = [];
  _webRecorder.mime = mime;

  rec.ondataavailable = (/** @type {any} */ e) => {
    if (e.data && e.data.size > 0) _webRecorder.chunks.push(e.data);
  };
  rec.onstop = () => {
    // J3: hand the assembled Blob STRAIGHT to the consumer — no base64 round
    // trip. readAsDataURL held the whole recording as a ~1.33x base64 string in
    // heap (CLAUDE.md rule 5); the web consumer already wants a Blob, so pass it
    // as the 4th arg and skip both the encode here and the atob in the consumer.
    // b64 is null on web; the consumer prefers the blob. Android still passes
    // base64 (its string-only native bridge can't carry a Blob). Building the
    // Blob copies the chunks' data, so the immediate cleanup() (which clears
    // _webRecorder.chunks) cannot invalidate it.
    const finalMime = _webRecorder.mime || mime;
    const blob = new Blob(_webRecorder.chunks, { type: finalMime });
    const durMs = _webRecorder.accumulatedMs;
    _fireRecordingComplete(null, durMs, finalMime, blob);
    _webRecorderCleanup();
  };

  // AnalyserNode for amplitude polling. Optional — if AudioContext isn't
  // available (rare), amplitude returns 0 and the waveform displays as
  // baseline. Pre-allocated buffer per [[amplitude-buffer-preallocation]].
  try {
    const AudioCtx = /** @type {any} */ (window).AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      _webRecorder.audioContext = ctx;
      const source = ctx.createMediaStreamSource(_webRecorder.mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      _webRecorder.analyser = analyser;
      _webRecorder.ampBuffer = new Uint8Array(analyser.frequencyBinCount);
    }
  } catch (_e) { /* analyser is optional */ }

  rec.start(250);  // 250 ms chunk interval — preserved from production code
  _webRecorder.startTimeMs = Date.now();
  _webRecorder.accumulatedMs = 0;
  _webRecorder.state = 'recording';
  return 'ok';
}

/** @returns {string} */
function webNativeRecordPause() {
  if (!_webRecorder.mediaRecorder || _webRecorder.state !== 'recording') return 'error:not-recording';
  try {
    _webRecorder.mediaRecorder.pause();
  } catch (e) {
    return 'error:' + ((/** @type {any} */ (e) && /** @type {any} */ (e).message) || e);
  }
  _webRecorder.accumulatedMs += Date.now() - _webRecorder.startTimeMs;
  _webRecorder.state = 'paused';
  return 'ok';
}

/** @returns {string} */
function webNativeRecordResume() {
  if (!_webRecorder.mediaRecorder || _webRecorder.state !== 'paused') return 'error:not-paused';
  try {
    _webRecorder.mediaRecorder.resume();
  } catch (e) {
    return 'error:' + ((/** @type {any} */ (e) && /** @type {any} */ (e).message) || e);
  }
  _webRecorder.startTimeMs = Date.now();
  _webRecorder.state = 'recording';
  return 'ok';
}

/**
 * Per [[amplitude-buffer-preallocation]], reuses the pre-allocated
 * ampBuffer (never allocates per-call). Computes RMS from time-domain
 * data (matches the existing production code's tuning) and maps to
 * Android's 0-32767 contract for getMaxAmplitude parity.
 * @returns {number}
 */
function webNativeRecordAmplitude() {
  if (!_webRecorder.analyser || !_webRecorder.ampBuffer) return 0;
  _webRecorder.analyser.getByteTimeDomainData(_webRecorder.ampBuffer);
  const buf = _webRecorder.ampBuffer;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buf.length);
  return Math.round(rms * 32767);  // map RMS [0,1] → amp [0,32767]
}

function webNativeRecordStop() {
  if (!_webRecorder.mediaRecorder) return;
  // Snapshot duration BEFORE stopping (onstop runs async and reads accumulatedMs)
  if (_webRecorder.state === 'recording') {
    _webRecorder.accumulatedMs += Date.now() - _webRecorder.startTimeMs;
  }
  _webRecorder.state = 'inactive';
  try {
    _webRecorder.mediaRecorder.stop();  // triggers onstop → fires __onNativeRecordingComplete
  } catch (_e) {
    // Stop failed — fire callback with null to unblock the consumer
    _fireRecordingComplete(null, 0, _webRecorder.mime);
    _webRecorderCleanup();
  }
}

function webNativeRecordCancel() {
  // Discard recording WITHOUT firing __onNativeRecordingComplete. Per
  // [[mediastream-track-cleanup]] this must stop all tracks so the mic
  // indicator goes off + the hardware is released.
  if (_webRecorder.mediaRecorder) {
    try {
      _webRecorder.mediaRecorder.onstop = null;  // suppress the callback fire
      if (_webRecorder.mediaRecorder.state !== 'inactive') {
        _webRecorder.mediaRecorder.stop();
      }
    } catch (_e) { /* best-effort */ }
  }
  _webRecorderCleanup();
}

/** @type {PlatformBridgeShape} */
const webImpl = {
  // Category 1 — genuine no-ops on web
  setLightStatusBar: () => {},   // CSS body.light handles the theme
  startAudioSession: () => {},   // Browser handles audio session natively
  endAudioSession: () => {},

  // Category 2 — safe defaults
  getZoomScale: () => 1.0,
  // W7.4: the JS DiagnosticLog IS the web crash log (no native log to merge).
  getCrashLog: () => DiagnosticLog.toJSON(),
  // NTV3: web has no app-managed Garden cache (Garden <img>s are browser
  // HTTP-cached); "Clear All" deletes the IDB data, so this is a genuine no-op.
  clearGardenCache: () => {},

  // Category 3 — real web impls
  takeScreenshot: webTakeScreenshot,         // Tier A (html2canvas)
  setKeepScreenOn: webSetKeepScreenOn,       // Tier B.1 (WakeLock + de-dup)
  openFilePicker: webOpenFilePicker,         // Tier B.2 (DOM input + FileReader → __onImportFile)
  saveToFile: webSaveToFile,                 // Tier B.2 (Blob + URL.createObjectURL + anchor → __onExportComplete)
  openExportSink: webOpenExportSink,         // P2 (FS Access API writable / Blob-download fallback)
  pickImportFile: webPickImportFile,         // P2 (FS Access API open / DOM input → File)
  // v3 native chunked bridge — Android-only (web uses openExportSink/pickImportFile above)
  v3ExportOpen: v3AndroidOnly('v3ExportOpen'),
  v3ExportBegin: v3AndroidOnly('v3ExportBegin'),
  v3ExportWriteBlob: v3AndroidOnly('v3ExportWriteBlob'),
  v3ExportChunk: v3AndroidOnly('v3ExportChunk'),
  v3ExportFinish: v3AndroidOnly('v3ExportFinish'),
  v3ImportOpen: v3AndroidOnly('v3ImportOpen'),
  v3ImportBegin: v3AndroidOnly('v3ImportBegin'),
  v3ImportNextBlob: v3AndroidOnly('v3ImportNextBlob'),
  v3ImportReadChunk: v3AndroidOnly('v3ImportReadChunk'),
  v3ImportClose: v3AndroidOnly('v3ImportClose'),
  setImmersiveMode: webSetImmersiveMode,     // Tier B.3 (Fullscreen API, best-effort)
  setZoomEnabled: webSetZoomEnabled,         // Tier B.3 (no-op — browsers handle zoom natively)
  resetZoom: webResetZoom,                   // Tier B.3 (no-op — no JS API to reset user pinch-zoom)
  // Tier C (W1.4): MediaRecorder + AnalyserNode recording flow
  requestMicPermission: webRequestMicPermission,
  nativeRecordStart: webNativeRecordStart,
  nativeRecordPause: webNativeRecordPause,
  nativeRecordResume: webNativeRecordResume,
  nativeRecordAmplitude: webNativeRecordAmplitude,
  nativeRecordStop: webNativeRecordStop,
  nativeRecordCancel: webNativeRecordCancel,

  // Category 4 — not-yet-implemented warnings (void returns only)
  haptic: notYetImplemented('haptic'),                       // future; haptic JS wiring not yet present
};

/**
 * The platform bridge. Selects between Android and Web impls at module
 * load time based on `window.AndroidBridge` presence. Consumers always
 * see the same shape (PlatformBridgeShape).
 *
 * @type {PlatformBridgeExport}
 */
export const PlatformBridge = /** @type {PlatformBridgeExport} */ (isAndroid ? androidImpl : webImpl);
PlatformBridge.isAndroid = isAndroid;
