/* ═══════════════════════════════════════════════════════════════════════
   StorageHealth — platform-aware storage risk assessment engine
   ═══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js. No React dependency.

   W2.7a of the W2 storage-hardening phase. Owns:
     - Platform detection (Android WebView / Safari tab / Safari PWA /
       Firefox / Chrome / Edge / unknown / private-mode heuristic)
     - Quota snapshot via navigator.storage.estimate()
     - Persistence check via navigator.storage.persisted()
     - 5-tier health assessment: healthy → caution → warning → critical
       → readonly
     - 8 risk flags: safari-7day, ios-pwa-isolate, low-quota,
       critical-quota, not-persisted, private-mode, write-failed,
       quota-declining
     - Write-path integration: checkBeforeWrite / onWriteFailure /
       onWriteSuccess
     - Periodic re-assessment (5 min while visible, on resume if stale)
     - Session-level dismissal state for banner scenarios
     - Safari first-data-creation gate (sync, UI shows the modal)

   React integration: subscribers get the useSyncExternalStore contract
   (subscribe + getVersion). The UI hook (useStorageHealth, W2.7b) is a
   thin wrapper. useStorageInfo (W2.5) will be rewired to delegate here
   in W2.7d so two modules don't call estimate() independently.

   Dependency direction: stores call StorageHealth.onWriteFailure in
   their _save() catch blocks (W2.7c). StorageHealth NEVER imports
   stores — no circular dependency risk.

   Public API:
     StorageHealth.assess()                  → Promise<StorageHealthReport>
     StorageHealth.getReport()               → StorageHealthReport (sync)
     StorageHealth.subscribe(cb)             → unsubscribe function
     StorageHealth.getVersion()              → number
     StorageHealth.getPlatform()             → string
     StorageHealth.checkBeforeWrite(bytes)   → { ok, reason? }
     StorageHealth.onWriteFailure(err)       → void
     StorageHealth.onWriteSuccess()          → void
     StorageHealth.reassessIfCautious()      → void
     StorageHealth.requestPersistence()      → Promise<boolean>
     StorageHealth.checkFirstDataCreation()  → { shouldBlock, reason? }
     StorageHealth.dismissScenario(id)       → void
     StorageHealth.isDismissed(id)           → boolean
     StorageHealth.start()                   → void
     StorageHealth.stop()                    → void
   ═══════════════════════════════════════════════════════════════════════ */

// W7.4: degraded-tier transitions are recorded to the JS DiagnosticLog so
// quota pressure shows up in the diagnostic export. Clean one-way import —
// diagnostic-log.js is a zero-dependency leaf in the same bundle.
import { DiagnosticLog } from './diagnostic-log.js';
import { PlatformBridge } from './platform-bridge.js';
import { showToast, hideToast } from './toast.js';

/* ─── Constants ─────────────────────────────────────────────────────── */

const REFRESH_INTERVAL_MS = 300000;
const STALE_THRESHOLD_MS = 60000;
const CAUTION_PERCENT = 0.50;
const WARNING_PERCENT = 0.80;
const CRITICAL_PERCENT = 0.95;
const LOW_QUOTA_BYTES = 100 * 1024 * 1024;
// NOTE (CQ7): this 50 MB is the CRITICAL storage-QUOTA threshold (we warn when
// free space drops this low), NOT the 50 MB import-file cap (platform-bridge
// WEB_MAX_IMPORT_BYTES / StorageManager MAX_IMPORT_SIZE). Same number, unrelated
// meaning — do NOT "unify" them; they move independently.
const CRITICAL_QUOTA_BYTES = 50 * 1024 * 1024;
const PRIVATE_SAFARI_QUOTA_HEURISTIC = 120 * 1024 * 1024;

/** @enum {string} */
const TIER = Object.freeze({
  HEALTHY:  'healthy',
  CAUTION:  'caution',
  WARNING:  'warning',
  CRITICAL: 'critical',
  READONLY: 'readonly',
});

/** @enum {string} */
const PLATFORM = Object.freeze({
  ANDROID_WEBVIEW: 'android-webview',
  SAFARI_TAB:      'safari-tab',
  SAFARI_PWA:      'safari-pwa',
  FIREFOX:         'firefox',
  CHROME:          'chrome',
  EDGE:            'edge',
  UNKNOWN:         'unknown',
});

/** @enum {string} */
const RISK = Object.freeze({
  SAFARI_7DAY:     'safari-7day',
  IOS_PWA_ISOLATE: 'ios-pwa-isolate',
  LOW_QUOTA:       'low-quota',
  CRITICAL_QUOTA:  'critical-quota',
  NOT_PERSISTED:   'not-persisted',
  PRIVATE_MODE:    'private-mode',
  WRITE_FAILED:    'write-failed',
  QUOTA_DECLINING: 'quota-declining',
});

/* ─── Types ─────────────────────────────────────────────────────────── */

/**
 * @typedef {{
 *   tier: string,
 *   platform: string,
 *   quota: number | null,
 *   usage: number | null,
 *   persisted: boolean | null,
 *   percentUsed: number | null,
 *   remaining: number | null,
 *   risks: string[],
 *   privateModeLikely: boolean,
 *   lastAssessedAt: number,
 *   writeFailedThisSession: boolean,
 *   safariGateBlocked: boolean,
 *   storesDegraded: boolean,
 * }} StorageHealthReport
 */

/** @type {StorageHealthReport} */
const _DEFAULT_REPORT = Object.freeze({
  tier: TIER.HEALTHY,
  platform: PLATFORM.UNKNOWN,
  quota: null,
  usage: null,
  persisted: null,
  percentUsed: null,
  remaining: null,
  risks: [],
  privateModeLikely: false,
  lastAssessedAt: 0,
  writeFailedThisSession: false,
  safariGateBlocked: false,
  storesDegraded: false,
});

/* ─── Module state ──────────────────────────────────────────────────── */

/** @type {StorageHealthReport | null} */
let _report = null;
let _version = 0;
/** @type {Set<() => void> | null} */
let _listeners = null;
/** @type {string | null} */
let _platform = null;
let _writeFailedThisSession = false;
/**
 * D5: timestamp of the last per-action write-failure toast. Used to
 * cooldown-dedup the toast so a BURST of failing writes (e.g. rapid edits
 * while storage is broken) surfaces ONE toast, re-armed at most every
 * WRITE_FAIL_TOAST_COOLDOWN_MS — not one toast per failed `_save()`.
 */
let _lastWriteFailToastAt = 0;
const WRITE_FAIL_TOAST_COOLDOWN_MS = 8000;
/** Stable DOM id for the write-failure toast (so repeats coalesce). */
const WRITE_FAIL_TOAST_ID = 'vot-toast-writefail';
/** @type {Set<string>} */
let _sessionDismissals = new Set();
/** @type {ReturnType<typeof setInterval> | null} */
let _refreshIntervalId = null;
let _lastAssessedAt = 0;
let _safariWarningShownThisSession = false;
let _safariGateBlocked = false;
// E5: true while any cached store is stuck in the degraded hydration tier
// (serving empty copyDefault() snapshots). Plumbed into the report so the
// StorageHealthBanner — which only subscribes to StorageHealth — can surface
// a low-key "storage is slow" heads-up.
let _storesDegraded = false;
/** @type {Promise<StorageHealthReport> | null} */
let _assessInFlight = null;
/** @type {(() => void) | null} */
let _visibilityHandler = null;

/**
 * Test-only override for navigator.storage. When set, assess() reads
 * from this object instead of the real API.
 * @type {{ estimate?: () => Promise<any>, persisted?: () => Promise<boolean>, persist?: () => Promise<boolean> } | null}
 */
let _storageApiOverride = null;

/**
 * Test-only override for the installed-PWA / standalone check. null = detect
 * for real (display-mode media query + navigator.standalone).
 * @type {boolean | null}
 */
let _standaloneOverride = null;

/**
 * Guards _ensurePersistence so concurrent assess/resume cycles don't fire
 * overlapping persist() calls. Self-clears in a finally.
 */
let _persistInFlight = false;

/* ─── Internal helpers ──────────────────────────────────────────────── */

function _bump() {
  _version += 1;
  if (!_listeners) return;
  for (const cb of _listeners) {
    try { cb(); } catch (e) { console.warn('StorageHealth subscriber threw', e); }
  }
}

function _getStorageApi() {
  if (_storageApiOverride) return _storageApiOverride;
  var nav = (typeof navigator !== 'undefined') ? navigator : null;
  return (nav && nav.storage) || null;
}

/**
 * Classify the runtime environment for storage-policy purposes.
 * Cached on first call — the platform doesn't change mid-session.
 *
 * @param {string} [uaOverride]  test-only UA string injection
 * @returns {string}
 */
function _detectPlatform(uaOverride) {
  if (typeof window === 'undefined') return PLATFORM.UNKNOWN;
  // U14: route platform detection through the bridge's single source of truth
  // (PlatformBridge.isAndroid) instead of probing window.AndroidBridge directly.
  // isAndroid is a module-load boolean and _detectPlatform runs lazily (via
  // getPlatform), so the bridge is always resolved by the time we read it.
  if (PlatformBridge.isAndroid) return PLATFORM.ANDROID_WEBVIEW;

  var ua = uaOverride || ((typeof navigator !== 'undefined' && navigator.userAgent) || '');

  // U20: real Safari = Apple's WebKit browser with NO impostor token. The old
  // `/Safari/ && !/Chrome|Chromium|Edg/` was far too loose: it tagged
  // DuckDuckGo, in-app webviews (Facebook/Instagram/WeChat/Line), and even the
  // iOS variants of other browsers (CriOS = Chrome-iOS, FxiOS = Firefox-iOS,
  // EdgiOS, OPiOS) as Safari — they all carry "Safari" but no "Chrome" token —
  // and then surfaced Safari's 7-day-eviction warning + first-data-creation gate,
  // which read WRONG in those browsers. UA-sniffing should never drive a
  // user-facing warning on a guess. Require AppleWebKit + Safari + none of the
  // known non-Safari tokens; anything misclassified falls to UNKNOWN — the
  // conservative, SILENT path (generic storage health, no Safari-specific flows).
  var NON_SAFARI = /(Chrome|Chromium|Edg|EdgiOS|CriOS|FxiOS|OPR|OPiOS|OPT|SamsungBrowser|DuckDuckGo|Ddg|YaBrowser|GSA|FBAN|FBAV|FB_IAB|Instagram|Line|MicroMessenger|HuaweiBrowser|MiuiBrowser)/i;
  var isSafari = /AppleWebKit/.test(ua) && /Safari/.test(ua) && !NON_SAFARI.test(ua);
  if (isSafari) {
    if (/** @type {any} */ (navigator).standalone === true) return PLATFORM.SAFARI_PWA;
    return PLATFORM.SAFARI_TAB;
  }

  if (/Edg(iOS)?\//.test(ua)) return PLATFORM.EDGE;
  if (/Firefox\//.test(ua)) return PLATFORM.FIREFOX;
  if (/Chrome\//.test(ua)) return PLATFORM.CHROME;

  return PLATFORM.UNKNOWN;
}

/**
 * Is the app running as an INSTALLED PWA / standalone window (any engine)?
 * Installed apps are exempt from the eviction concerns the not-persisted banner
 * warns about: Chromium auto-grants persistence on install, and an iOS app added
 * to the Home Screen is exempt from Safari's 7-day ITP storage sweep. Detected
 * via the display-mode media query (Chromium/Firefox/desktop) plus the legacy
 * navigator.standalone (iOS Safari). Defensive — matchMedia can be absent in
 * non-browser/test environments, and a bad media string can throw.
 *
 * @returns {boolean}
 */
function _isStandalone() {
  if (_standaloneOverride !== null) return _standaloneOverride;
  if (typeof window === 'undefined') return false;
  try {
    var mm = window.matchMedia;
    if (typeof mm === 'function') {
      if (mm('(display-mode: standalone)').matches) return true;
      if (mm('(display-mode: window-controls-overlay)').matches) return true;
      if (mm('(display-mode: minimal-ui)').matches) return true;
      if (mm('(display-mode: fullscreen)').matches) return true;
    }
  } catch (_e) { /* matchMedia unavailable/buggy — fall through */ }
  try {
    if (/** @type {any} */ (navigator).standalone === true) return true;
  } catch (_e) { /* navigator.standalone access threw — ignore */ }
  return false;
}

/**
 * Engines where persist() is granted via a USER PROMPT — so a banner/Settings
 * button can actually secure persistence. Firefox is the only mainstream one.
 * Chromium grants silently by heuristic (no prompt, no user-clickable lever);
 * WebKit/Safari auto-grants but its real eviction lever is "Add to Home Screen"
 * (the 7-day ITP sweep, which persist() does NOT stop). So the not-persisted
 * "Protect my data" banner is only honest/actionable on the prompt engines.
 *
 * @param {string} platform
 * @returns {boolean}
 */
function _persistRequiresPrompt(platform) {
  return platform === PLATFORM.FIREFOX;
}

/**
 * Engines where persist() resolves WITHOUT a user prompt — safe to attempt
 * SILENTLY on startup to upgrade best-effort → persistent for free. Chromium
 * only: it grants automatically for installed PWAs / bookmarked / high-engagement
 * sites and otherwise returns false, never showing UI. Firefox is excluded (it
 * prompts — must be user-initiated). Safari is excluded on purpose: a silent
 * grant would flip persisted→true and FALSELY reassure in Settings while the
 * 7-day ITP sweep still applies to non-installed sites. The Android APK is
 * excluded (data already durable; persist() is a no-op there).
 *
 * @param {string} platform
 * @returns {boolean}
 */
function _persistIsSilent(platform) {
  return platform === PLATFORM.CHROME || platform === PLATFORM.EDGE;
}

/**
 * Pure tier computation from storage metrics + platform state.
 *
 * @param {number | null} quota
 * @param {number | null} usage
 * @param {boolean} persisted
 * @param {string} platform
 * @param {boolean} writeFailed
 * @param {boolean} privateModeLikely
 * @param {boolean} standalone
 * @returns {string}
 */
function _computeTier(quota, usage, persisted, platform, writeFailed, privateModeLikely, standalone) {
  if (writeFailed) return TIER.READONLY;

  var pct = (quota != null && usage != null && quota > 0) ? usage / quota : null;

  if (pct != null && pct >= CRITICAL_PERCENT) return TIER.CRITICAL;
  if (quota != null && quota < CRITICAL_QUOTA_BYTES) return TIER.CRITICAL;
  if (privateModeLikely) return TIER.CRITICAL;

  if (pct != null && pct >= WARNING_PERCENT) return TIER.WARNING;
  if (quota != null && quota < LOW_QUOTA_BYTES) return TIER.WARNING;

  if (pct != null && pct >= CAUTION_PERCENT) return TIER.CAUTION;
  // Not-persisted only counts as a caution where the user can actually fix it
  // (a prompt engine) and isn't already installed/standalone. On Chromium it's
  // the normal best-effort steady state (silently upgraded — see _ensurePersistence);
  // on Safari the 7-day caution is raised by the SAFARI_TAB check below instead.
  if (persisted === false && _persistRequiresPrompt(platform) && !standalone) return TIER.CAUTION;
  if (platform === PLATFORM.SAFARI_TAB && !standalone) return TIER.CAUTION;

  return TIER.HEALTHY;
}

/**
 * Compute risk flags from the current storage state.
 *
 * @param {string} platform
 * @param {boolean} persisted
 * @param {number | null} quota
 * @param {boolean} writeFailed
 * @param {boolean} privateModeLikely
 * @param {number | null} prevQuota
 * @param {boolean} standalone
 * @returns {string[]}
 */
function _computeRisks(platform, persisted, quota, writeFailed, privateModeLikely, prevQuota, standalone) {
  var risks = [];

  if (platform === PLATFORM.SAFARI_TAB && !standalone) risks.push(RISK.SAFARI_7DAY);
  if (platform === PLATFORM.SAFARI_PWA) risks.push(RISK.IOS_PWA_ISOLATE);
  if (quota != null && quota < LOW_QUOTA_BYTES) risks.push(RISK.LOW_QUOTA);
  if (quota != null && quota < CRITICAL_QUOTA_BYTES) risks.push(RISK.CRITICAL_QUOTA);
  // not-persisted is only a surfaced risk where it's actionable: a prompt engine
  // (Firefox) and not already installed/standalone. The Android APK never reaches
  // here (persistedBool is forced true in _assessImpl); Chromium is upgraded
  // silently; Safari's real lever is the 7-day flow above, not persist().
  if (persisted === false && _persistRequiresPrompt(platform) && !standalone) risks.push(RISK.NOT_PERSISTED);
  if (privateModeLikely) risks.push(RISK.PRIVATE_MODE);
  if (writeFailed) risks.push(RISK.WRITE_FAILED);
  if (prevQuota != null && quota != null && quota < prevQuota) risks.push(RISK.QUOTA_DECLINING);

  return risks;
}

/**
 * Emit a DiagnosticLog 'quota' warning when the tier worsens into a degraded
 * state (W7.4). Transition-gated (newTier !== prevTier) and degraded-only
 * (WARNING/CRITICAL/READONLY) so a healthy session logs nothing and a steady
 * degraded tier is not re-logged on every 5-minute re-assess.
 *
 * @param {string | null} prevTier
 * @param {string} newTier
 * @param {number | null} pct
 */
function _logTierTransition(prevTier, newTier, pct) {
  if (newTier === prevTier) return;
  if (newTier !== TIER.WARNING && newTier !== TIER.CRITICAL && newTier !== TIER.READONLY) return;
  DiagnosticLog.warn('quota', 'storage tier → ' + newTier + (pct != null ? ' (' + Math.round(pct * 100) + '% used)' : ''));
}

/* ─── Public functions ──────────────────────────────────────────────── */

/**
 * Run a full storage assessment. Coalesces concurrent calls — if an
 * assess is already in flight, returns the same promise.
 *
 * @returns {Promise<StorageHealthReport>}
 */
async function _assess() {
  if (_assessInFlight) return _assessInFlight;
  var p = _assessImpl();
  _assessInFlight = p;
  try { return await p; }
  finally { _assessInFlight = null; }
}

/** @returns {Promise<StorageHealthReport>} */
async function _assessImpl() {
  var storage = _getStorageApi();
  var platform = _getPlatform();
  var prevTier = _report ? _report.tier : null;

  if (!storage || typeof storage.estimate !== 'function') {
    var fallbackRisks = _writeFailedThisSession ? [RISK.WRITE_FAILED] : [];
    var fallback = /** @type {StorageHealthReport} */ ({
      tier: _writeFailedThisSession ? TIER.READONLY : TIER.HEALTHY,
      platform: platform,
      quota: null,
      usage: null,
      persisted: null,
      percentUsed: null,
      remaining: null,
      risks: fallbackRisks,
      privateModeLikely: false,
      lastAssessedAt: Date.now(),
      writeFailedThisSession: _writeFailedThisSession,
      safariGateBlocked: _safariGateBlocked,
      storesDegraded: _storesDegraded,
    });
    _report = fallback;
    _lastAssessedAt = Date.now();
    _logTierTransition(prevTier, fallback.tier, null);
    _bump();
    return fallback;
  }

  var estimate = null;
  var persisted = null;

  try { estimate = await storage.estimate(); } catch (_e) { /* best-effort */ }
  try {
    persisted = (typeof storage.persisted === 'function')
      ? await storage.persisted()
      : false;
  } catch (_e) { persisted = false; }

  var quota = (estimate && typeof estimate.quota === 'number') ? estimate.quota : null;
  var usage = (estimate && typeof estimate.usage === 'number') ? estimate.usage : null;
  var pct = (quota != null && usage != null && quota > 0) ? usage / quota : null;
  var remaining = (quota != null && usage != null) ? quota - usage : null;
  var persistedBool = persisted === true;
  // On the installed Android APK the WebView's IndexedDB/localStorage live in the
  // app's PRIVATE data dir (android:allowBackup="false") — durable app data, NOT
  // subject to the browser's best-effort eviction that navigator.storage.persisted()
  // reflects. The API reports false there (no installed-PWA / site-engagement
  // heuristic can grant persistence inside a WebView), but nothing "cleans up" that
  // data: it's gone only on uninstall or a manual Settings → Clear data. Treat it
  // as persisted so the "protect your data from browser cleanup" banner + the
  // Settings "Protect now" nag — both browser-tab concerns that read FALSE on the
  // APK and whose persist() request can't be granted there anyway — don't fire.
  if (platform === PLATFORM.ANDROID_WEBVIEW) persistedBool = true;

  var privateModeLikely = (
    platform === PLATFORM.SAFARI_TAB || platform === PLATFORM.SAFARI_PWA
  ) && quota != null && quota < PRIVATE_SAFARI_QUOTA_HEURISTIC;

  var standalone = _isStandalone();
  var prevQuota = _report ? _report.quota : null;
  var tier = _computeTier(quota, usage, persistedBool, platform, _writeFailedThisSession, privateModeLikely, standalone);
  var risks = _computeRisks(platform, persistedBool, quota, _writeFailedThisSession, privateModeLikely, prevQuota, standalone);

  /** @type {StorageHealthReport} */
  var report = {
    tier: tier,
    platform: platform,
    quota: quota,
    usage: usage,
    persisted: persistedBool,
    percentUsed: pct,
    remaining: remaining,
    risks: risks,
    privateModeLikely: privateModeLikely,
    lastAssessedAt: Date.now(),
    writeFailedThisSession: _writeFailedThisSession,
    safariGateBlocked: _safariGateBlocked,
    storesDegraded: _storesDegraded,
  };

  _report = report;
  _lastAssessedAt = Date.now();
  _logTierTransition(prevTier, tier, pct);
  _bump();
  return report;
}

/** @returns {StorageHealthReport} */
function _getReport() {
  return _report || _DEFAULT_REPORT;
}

/**
 * @param {() => void} callback
 * @returns {() => void}
 */
function _subscribe(callback) {
  if (!_listeners) _listeners = new Set();
  _listeners.add(callback);
  return function () { if (_listeners) _listeners.delete(callback); };
}

/** @returns {number} */
function _getVersion() { return _version; }

/** @returns {string} */
function _getPlatform() {
  if (!_platform) _platform = _detectPlatform();
  return _platform;
}

/**
 * Sync pre-write check against cached quota data. Returns `ok: false`
 * when the projected post-write usage would exceed 95% (caller should
 * show a confirmation dialog — the store write itself is not blocked).
 *
 * @param {number} bytes
 * @returns {{ ok: boolean, reason?: string }}
 */
function _checkBeforeWrite(bytes) {
  if (_writeFailedThisSession) return { ok: false, reason: 'write-failed' };
  var r = _report;
  if (!r || r.quota == null || r.usage == null) return { ok: true };
  if (r.quota <= 0) return { ok: false, reason: 'critical' };

  var afterPercent = (r.usage + bytes) / r.quota;
  if (afterPercent >= CRITICAL_PERCENT) return { ok: false, reason: 'critical' };
  if (afterPercent >= WARNING_PERCENT) return { ok: true, reason: 'warning' };
  return { ok: true };
}

/**
 * Called from CachedStore._save() and JournalMediaStore.put() catch
 * blocks when an IDB write fails. Immediately transitions the tier to
 * READONLY and kicks off a re-assessment for fresh quota numbers.
 *
 * @param {any} _err
 */
/**
 * D5: show a cooldown-deduped per-action write-failure toast. The passive
 * StorageHealth banner says storage is unhealthy in general; this tells the
 * user THIS change didn't persist so they can re-try / export a backup.
 * Wording is generic because any store can be the failing writer
 * (annotation, note, journal, bookmark…). Coalesces by a stable toast id and
 * throttles by WRITE_FAIL_TOAST_COOLDOWN_MS so a burst of failed writes can't
 * spam a wall of toasts.
 */
function _notifyWriteFailureToast() {
  var now = Date.now();
  if (now - _lastWriteFailToastAt < WRITE_FAIL_TOAST_COOLDOWN_MS) return;
  _lastWriteFailToastAt = now;
  showToast({
    id: WRITE_FAIL_TOAST_ID,
    className: 'vot-toast',
    text: "Couldn't save your last change — device storage may be full. Open Settings → Storage, or export a backup.",
    durationMs: 6000,
    ariaLive: 'assertive',
  });
}

function _onWriteFailure(_err) {
  _writeFailedThisSession = true;
  _notifyWriteFailureToast();
  if (_report) {
    var risks = _report.risks.includes(RISK.WRITE_FAILED)
      ? _report.risks
      : _report.risks.concat(RISK.WRITE_FAILED);
    _report = {
      tier: TIER.READONLY,
      platform: _report.platform,
      quota: _report.quota,
      usage: _report.usage,
      persisted: _report.persisted,
      percentUsed: _report.percentUsed,
      remaining: _report.remaining,
      risks: risks,
      privateModeLikely: _report.privateModeLikely,
      lastAssessedAt: _report.lastAssessedAt,
      writeFailedThisSession: true,
      safariGateBlocked: _safariGateBlocked,
      storesDegraded: _storesDegraded,
    };
  }
  _bump();
  _assess();
}

/**
 * Called after a successful IDB write when a prior failure was recorded.
 * Clears the READONLY override and re-assesses to compute the real tier
 * from current quota.
 */
function _onWriteSuccess() {
  if (!_writeFailedThisSession) return;
  _writeFailedThisSession = false;
  // D5: storage recovered — clear the error toast + reset the cooldown so a
  // genuinely new failure surfaces immediately instead of waiting one out.
  _lastWriteFailToastAt = 0;
  hideToast(WRITE_FAIL_TOAST_ID);
  return _assess();
}

/**
 * Re-assess only if the current tier is CAUTION or worse. Called after
 * data-creating actions to track whether usage has tipped into a worse
 * tier. No-op when healthy (avoids unnecessary estimate() calls).
 */
function _reassessIfCautious() {
  if (!_report || _report.tier === TIER.HEALTHY) return;
  _assess();
}

/**
 * Low-level persist() call. Feature-detects, swallows errors, returns the
 * boolean grant result. Does NOT re-assess — callers decide.
 *
 * @returns {Promise<boolean>}
 */
async function _doPersist() {
  var storage = _getStorageApi();
  if (!storage || typeof storage.persist !== 'function') return false;
  try {
    return !!(await storage.persist());
  } catch (_e) { return false; }
}

/**
 * Request persistent storage from the browser. Returns true on grant.
 * MUST be called from a user-gesture onClick handler — on Firefox persist()
 * shows a permission prompt the engine ties to a user activation. Short-circuits
 * (no redundant call) when storage is already persistent, and re-assesses on
 * grant so the report/UI reflect the upgrade. A denial doesn't re-assess
 * (nothing changed; the caller's local persistDenied state surfaces it).
 *
 * @returns {Promise<boolean>}
 */
async function _requestPersistence() {
  if (_report && _report.persisted === true) return true;
  var granted = await _doPersist();
  if (granted) await _assess();
  return granted;
}

/**
 * Proactively + SILENTLY secure persistence where the engine grants it without
 * a prompt (Chromium — see _persistIsSilent). Idempotent and self-limiting:
 * no-ops once persisted, in-flight-guarded, and skips prompt engines, so it's
 * safe to call on startup AND on every visibility-resume (engagement may cross
 * Chromium's auto-grant threshold mid-session). This is the robustness win —
 * persistence is upgraded for free instead of waiting for the user to discover
 * the Settings button. On Firefox (prompt engine) and Safari (7-day lever is
 * install, not persist) this is a deliberate no-op.
 *
 * @returns {Promise<void>}
 */
async function _ensurePersistence() {
  if (_persistInFlight) return;
  if (_report && _report.persisted === true) return;
  if (!_persistIsSilent(_getPlatform())) return;
  _persistInFlight = true;
  try {
    var granted = await _doPersist();
    if (granted) await _assess();
  } finally {
    _persistInFlight = false;
  }
}

/**
 * Sync gate for the Safari 7-day data eviction modal (Scenario 3).
 * Returns `shouldBlock: true` exactly once per session when the
 * platform is safari-tab. The UI shows the modal and awaits the
 * user's choice before proceeding with the data-creating gesture.
 *
 * @returns {{ shouldBlock: boolean, reason?: string }}
 */
function _checkFirstDataCreation() {
  var platform = _getPlatform();
  if (platform !== PLATFORM.SAFARI_TAB) return { shouldBlock: false };
  // Installed (Home Screen / Add to Dock) Safari apps are exempt from the 7-day
  // ITP sweep, so the warning would be a false alarm there.
  if (_isStandalone()) return { shouldBlock: false };
  if (_safariWarningShownThisSession) return { shouldBlock: false };
  if (_sessionDismissals.has('safari-7day')) return { shouldBlock: false };
  _safariWarningShownThisSession = true;
  _safariGateBlocked = true;
  if (_report) _report = Object.assign({}, _report, { safariGateBlocked: true });
  _bump();
  return { shouldBlock: true, reason: 'safari-7day' };
}

/**
 * Mark a scenario as dismissed for this session. Bumps version so
 * banner components re-render without the dismissed scenario.
 *
 * @param {string} scenarioId
 */
function _dismissScenario(scenarioId) {
  _sessionDismissals.add(scenarioId);
  if (scenarioId === 'safari-7day') {
    _safariGateBlocked = false;
    if (_report) _report = Object.assign({}, _report, { safariGateBlocked: false });
  }
  _bump();
}

/**
 * @param {string} scenarioId
 * @returns {boolean}
 */
function _isDismissed(scenarioId) {
  return _sessionDismissals.has(scenarioId);
}

/**
 * E5: set/clear the "a cached store is stuck degraded" flag. Cached stores
 * call this (as a bare global, typeof-guarded) on their degraded-hydration
 * transition, and recompute-clear it once no store remains degraded. Mirrors
 * the safariGateBlocked plumbing (Object.assign + _bump) so the banner picks
 * it up via its existing StorageHealth subscription. No-op early-return makes
 * the per-store calls cheap.
 *
 * @param {boolean} v
 */
function _setStoresDegraded(v) {
  var b = !!v;
  if (b === _storesDegraded) return;
  _storesDegraded = b;
  if (_report) _report = Object.assign({}, _report, { storesDegraded: b });
  _bump();
}

/**
 * Start periodic health assessment. Called once after hydration
 * completes (from HydrationGate). Kicks off the initial assess(),
 * sets up a 5-minute refresh interval, and listens for visibility
 * changes to re-assess on resume when stale.
 */
function _start() {
  if (_refreshIntervalId) return;
  // Silently secure persistence (Chromium) right after the first assessment,
  // so installed/engaged users are protected without ever seeing a prompt.
  _assess().then(_ensurePersistence);

  _refreshIntervalId = setInterval(function () {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    _assess();
  }, REFRESH_INTERVAL_MS);

  if (typeof document !== 'undefined') {
    _visibilityHandler = function () {
      if (document.visibilityState !== 'visible') return;
      // Re-attempt the silent persist on resume — Chromium may have crossed its
      // auto-grant engagement threshold since load. _ensurePersistence self-guards
      // (no-op once persisted / off prompt engines), so this is cheap.
      if (Date.now() - _lastAssessedAt > STALE_THRESHOLD_MS) {
        _assess().then(_ensurePersistence);
      } else {
        _ensurePersistence();
      }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);
  }
}

/**
 * Stop periodic assessment. Clears the interval and removes the
 * visibility listener. Idempotent.
 */
function _stop() {
  if (_refreshIntervalId) {
    clearInterval(_refreshIntervalId);
    _refreshIntervalId = null;
  }
  if (_visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
}

/**
 * TEST-ONLY: reset all module state. Accepts optional overrides for
 * platform and storageApi to enable deterministic tests without
 * global mocking.
 *
 * @param {{ platform?: string, storageApi?: any, standalone?: boolean }} [opts]
 */
function _resetForTests(opts) {
  _stop();
  _report = null;
  _version = 0;
  _listeners = null;
  _platform = (opts && opts.platform) || null;
  _writeFailedThisSession = false;
  _lastWriteFailToastAt = 0;
  _sessionDismissals = new Set();
  _lastAssessedAt = 0;
  _safariWarningShownThisSession = false;
  _safariGateBlocked = false;
  _storesDegraded = false;
  _assessInFlight = null;
  _persistInFlight = false;
  _storageApiOverride = (opts && opts.storageApi) || null;
  _standaloneOverride = (opts && typeof opts.standalone === 'boolean') ? opts.standalone : null;
}

/* ─── Export ─────────────────────────────────────────────────────────── */

export const StorageHealth = {
  assess: _assess,
  getReport: _getReport,
  subscribe: _subscribe,
  getVersion: _getVersion,
  getPlatform: _getPlatform,
  checkBeforeWrite: _checkBeforeWrite,
  onWriteFailure: _onWriteFailure,
  onWriteSuccess: _onWriteSuccess,
  reassessIfCautious: _reassessIfCautious,
  requestPersistence: _requestPersistence,
  ensurePersistence: _ensurePersistence,
  checkFirstDataCreation: _checkFirstDataCreation,
  dismissScenario: _dismissScenario,
  isDismissed: _isDismissed,
  setStoresDegraded: _setStoresDegraded,
  start: _start,
  stop: _stop,
  _resetForTests: _resetForTests,
  _detectPlatform: _detectPlatform,
  _isStandalone: _isStandalone,
  TIER: TIER,
  PLATFORM: PLATFORM,
  RISK: RISK,
};
