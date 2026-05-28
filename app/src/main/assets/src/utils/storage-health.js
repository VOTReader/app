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

/* ─── Constants ─────────────────────────────────────────────────────── */

const REFRESH_INTERVAL_MS = 300000;
const STALE_THRESHOLD_MS = 60000;
const CAUTION_PERCENT = 0.50;
const WARNING_PERCENT = 0.80;
const CRITICAL_PERCENT = 0.95;
const LOW_QUOTA_BYTES = 100 * 1024 * 1024;
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
/** @type {Set<string>} */
let _sessionDismissals = new Set();
/** @type {ReturnType<typeof setInterval> | null} */
let _refreshIntervalId = null;
let _lastAssessedAt = 0;
let _safariWarningShownThisSession = false;
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
  if (typeof /** @type {any} */ (window).AndroidBridge !== 'undefined') return PLATFORM.ANDROID_WEBVIEW;

  var ua = uaOverride || ((typeof navigator !== 'undefined' && navigator.userAgent) || '');

  var isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  if (isSafari) {
    if (/** @type {any} */ (navigator).standalone === true) return PLATFORM.SAFARI_PWA;
    return PLATFORM.SAFARI_TAB;
  }

  if (/Edg\//.test(ua)) return PLATFORM.EDGE;
  if (/Firefox\//.test(ua)) return PLATFORM.FIREFOX;
  if (/Chrome\//.test(ua)) return PLATFORM.CHROME;

  return PLATFORM.UNKNOWN;
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
 * @returns {string}
 */
function _computeTier(quota, usage, persisted, platform, writeFailed, privateModeLikely) {
  if (writeFailed) return TIER.READONLY;

  var pct = (quota != null && usage != null && quota > 0) ? usage / quota : null;

  if (pct != null && pct >= CRITICAL_PERCENT) return TIER.CRITICAL;
  if (quota != null && quota < CRITICAL_QUOTA_BYTES) return TIER.CRITICAL;
  if (privateModeLikely) return TIER.CRITICAL;

  if (pct != null && pct >= WARNING_PERCENT) return TIER.WARNING;
  if (quota != null && quota < LOW_QUOTA_BYTES) return TIER.WARNING;

  if (pct != null && pct >= CAUTION_PERCENT) return TIER.CAUTION;
  if (persisted === false) return TIER.CAUTION;
  if (platform === PLATFORM.SAFARI_TAB) return TIER.CAUTION;

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
 * @returns {string[]}
 */
function _computeRisks(platform, persisted, quota, writeFailed, privateModeLikely, prevQuota) {
  var risks = [];

  if (platform === PLATFORM.SAFARI_TAB) risks.push(RISK.SAFARI_7DAY);
  if (platform === PLATFORM.SAFARI_PWA) risks.push(RISK.IOS_PWA_ISOLATE);
  if (quota != null && quota < LOW_QUOTA_BYTES) risks.push(RISK.LOW_QUOTA);
  if (quota != null && quota < CRITICAL_QUOTA_BYTES) risks.push(RISK.CRITICAL_QUOTA);
  if (persisted === false) risks.push(RISK.NOT_PERSISTED);
  if (privateModeLikely) risks.push(RISK.PRIVATE_MODE);
  if (writeFailed) risks.push(RISK.WRITE_FAILED);
  if (prevQuota != null && quota != null && quota < prevQuota) risks.push(RISK.QUOTA_DECLINING);

  return risks;
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
    });
    _report = fallback;
    _lastAssessedAt = Date.now();
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

  var privateModeLikely = (
    platform === PLATFORM.SAFARI_TAB || platform === PLATFORM.SAFARI_PWA
  ) && quota != null && quota < PRIVATE_SAFARI_QUOTA_HEURISTIC;

  var prevQuota = _report ? _report.quota : null;
  var tier = _computeTier(quota, usage, persistedBool, platform, _writeFailedThisSession, privateModeLikely);
  var risks = _computeRisks(platform, persistedBool, quota, _writeFailedThisSession, privateModeLikely, prevQuota);

  /** @type {StorageHealthReport} */
  var report = {
    tier: tier,
    platform: platform,
    quota: quota,
    usage: usage,
    persisted: persisted != null ? !!persisted : null,
    percentUsed: pct,
    remaining: remaining,
    risks: risks,
    privateModeLikely: privateModeLikely,
    lastAssessedAt: Date.now(),
    writeFailedThisSession: _writeFailedThisSession,
  };

  _report = report;
  _lastAssessedAt = Date.now();
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
  if (!r || r.quota == null || r.usage == null || r.quota <= 0) return { ok: true };

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
function _onWriteFailure(_err) {
  _writeFailedThisSession = true;
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
 * Request persistent storage from the browser. Returns true on grant.
 * MUST be called from a user-gesture onClick handler (Firefox silently
 * fails otherwise).
 *
 * @returns {Promise<boolean>}
 */
async function _requestPersistence() {
  var storage = _getStorageApi();
  if (!storage || typeof storage.persist !== 'function') return false;
  try {
    var granted = await storage.persist();
    if (granted) _assess();
    return !!granted;
  } catch (_e) { return false; }
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
  if (_safariWarningShownThisSession) return { shouldBlock: false };
  if (_sessionDismissals.has('safari-7day')) return { shouldBlock: false };
  _safariWarningShownThisSession = true;
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
 * Start periodic health assessment. Called once after hydration
 * completes (from HydrationGate). Kicks off the initial assess(),
 * sets up a 5-minute refresh interval, and listens for visibility
 * changes to re-assess on resume when stale.
 */
function _start() {
  if (_refreshIntervalId) return;
  _assess();

  _refreshIntervalId = setInterval(function () {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    _assess();
  }, REFRESH_INTERVAL_MS);

  if (typeof document !== 'undefined') {
    _visibilityHandler = function () {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - _lastAssessedAt > STALE_THRESHOLD_MS) _assess();
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
 * @param {{ platform?: string, storageApi?: any }} [opts]
 */
function _resetForTests(opts) {
  _stop();
  _report = null;
  _version = 0;
  _listeners = null;
  _platform = (opts && opts.platform) || null;
  _writeFailedThisSession = false;
  _sessionDismissals = new Set();
  _lastAssessedAt = 0;
  _safariWarningShownThisSession = false;
  _assessInFlight = null;
  _storageApiOverride = (opts && opts.storageApi) || null;
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
  checkFirstDataCreation: _checkFirstDataCreation,
  dismissScenario: _dismissScenario,
  isDismissed: _isDismissed,
  start: _start,
  stop: _stop,
  _resetForTests: _resetForTests,
  _detectPlatform: _detectPlatform,
  TIER: TIER,
  PLATFORM: PLATFORM,
  RISK: RISK,
};
