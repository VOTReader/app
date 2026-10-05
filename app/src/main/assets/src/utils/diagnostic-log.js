// @ts-check
/* ═══════════════════════════════════════════════════════════════════════
   DiagnosticLog — JS-side diagnostic ring buffer (web telemetry)
   ═══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js. No dependencies.

   W7.4 of the W7 code-quality-hardening phase. The JS-side twin of the
   Kotlin BoundedLogTree (app/src/main/java/.../BoundedLogTree.kt):
   BoundedLogTree captures WARN+ logs on Android with URI/path
   sanitization; on web there was nothing. This module fills that gap so
   store write failures, quota events, lazy-load timings, service-worker
   events, and render crashes are retrievable from inside the app on every
   platform — surfaced in Settings → Your Data and folded into Export JSON.

   Parity with BoundedLogTree (deliberate, so the two merge cleanly):
     - Capacity: 200 entries, FIFO eviction (oldest dropped on overflow).
     - In-memory, never sent over the network, cleared on page refresh -
       EXCEPT the storage-health tags (PERSIST_TAGS: hydration, store,
       state-guard, data-health). A slow start that degrades a store and
       then recovers left its only trace in a buffer the next reload
       emptied, so nobody could ever read it (datasafe 2026-10-05). Those
       warnings also go to a PERSIST_CAP-entry ring in localStorage
       (PERSIST_KEY, on this device only) and are read back into the
       buffer at the next boot, so a later Export JSON carries them.
     - Sanitization: the SAME redactions BoundedLogTree applies —
       content:// / file:// URIs → "[uri]", absolute Android paths →
       "[path]", and HTTP(S) query/fragment data → "[redacted]". Keeps
       the Export JSON safe to
       share via the user's chosen channel without leaking filesystem
       layout or picked-file identities.
     - Entry shape: { t, lvl, tag, msg } mirrors BoundedLogTree's
       toJson() ({"t","lvl","tag","msg"}) so PlatformBridge.getCrashLog()
       on Android can concat the Kotlin + JS arrays and sort by `t` with
       no per-entry reshaping.

   Levels: 'W' (warn) and 'E' (error) match BoundedLogTree's WARN/ERROR.
   'I' (info) is JS-only — used for timing() entries (lazy-load durations),
   a web diagnostic with no Android-WARN-floor equivalent. The merge tolerates
   the extra char; the Settings copy names "timings" explicitly.

   Single-threaded note: JS has no real concurrency, so unlike
   BoundedLogTree there is no lock — each _push() is an atomic synchronous
   append+evict within one event-loop tick.

   Public API (mirrors the W7.4 plan):
     DiagnosticLog.warn(tag, message)            → void
     DiagnosticLog.error(tag, message)           → void
     DiagnosticLog.timing(tag, label, durationMs)→ void
     DiagnosticLog.entries()                     → DiagEntry[] (copy, oldest-first)
     DiagnosticLog.toJSON()                      → string (JSON array; '[]' when empty)
     DiagnosticLog.clear()                       → void
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * One captured diagnostic line.
 *  - `t`   wall-clock millis at capture time (Date.now()).
 *  - `lvl` 'W' warn | 'E' error | 'I' info (timing). Matches BoundedLogTree's
 *          W/E plus a JS-only 'I'.
 *  - `tag` developer-supplied channel ('store', 'quota', 'corpus', 'sw',
 *          'render', …), passed through {@link sanitize} defensively.
 *  - `msg` the message, already passed through {@link sanitize}.
 * @typedef {{ t: number, lvl: 'W'|'E'|'I', tag: string, msg: string }} DiagEntry
 */

/** Ring-buffer capacity — matches BoundedLogTree.DEFAULT_CAPACITY. */
const CAPACITY = 200;

/* ─── Sanitization (ported verbatim from BoundedLogTree.sanitize) ─────── */

// content:// and file:// URIs through to the next whitespace. Both expose
// either a content-provider identity or a real path; neither belongs in a
// shareable diagnostic export. The `g` flag is REQUIRED here — JS
// String.replace(regex, str) only replaces the first match without it
// (Kotlin's String.replace(Regex, …) replaces all by default).
const SENSITIVE_URI = /(?:content|file):\/\/\S+/g;

// The small set of absolute-path roots Android exposes to the app. The body
// uses a tight class (\w + dot + slash + dash) rather than \S so trailing
// punctuation in the surrounding sentence (": failed", …) is NOT consumed by
// the redaction. Trailing '-' in the class is a literal hyphen, not a range.
const SENSITIVE_PATH = /\/(?:storage|data|sdcard|cache|system|mnt|root)\/[\w./-]*/g;

// Signed download URLs and failed requests can carry credentials or opaque
// identifiers in their query/fragment. Preserve the useful endpoint path while
// stripping everything from the first ? or # onward.
const WEB_URL = /https?:\/\/\S+/gi;

function redactWebUrl(url) {
  const query = url.indexOf('?');
  const fragment = url.indexOf('#');
  const cut = query < 0 ? fragment : fragment < 0 ? query : Math.min(query, fragment);
  const endpoint = cut < 0 ? url : url.slice(0, cut);
  const schemeEnd = endpoint.indexOf('://') + 3;
  const pathAt = endpoint.indexOf('/', schemeEnd);
  const pathStart = pathAt < 0 ? endpoint.length : pathAt;
  const userInfo = endpoint.lastIndexOf('@', pathStart - 1);
  const clean = userInfo >= schemeEnd && userInfo < pathStart
    ? endpoint.slice(0, schemeEnd) + '[redacted]@' + endpoint.slice(userInfo + 1)
    : endpoint;
  return clean + (cut < 0 ? '' : '[redacted]');
}

/**
 * Redact sensitive substrings from a message or tag. URI replace runs
 * first so a `file:///storage/...` URI collapses to "[uri]" whole rather
 * than leaving a "[path]" tail (matches BoundedLogTree's replace order).
 * @param {string} s
 * @returns {string}
 */
function sanitize(s) {
  return String(s)
    .replace(SENSITIVE_URI, '[uri]')
    .replace(SENSITIVE_PATH, '[path]')
    .replace(WEB_URL, redactWebUrl);
}

/* ─── The persisted storage-health ring (datasafe 2026-10-05) ─────────── */

/** localStorage key of the ring (in cached-store's LS_SKIP_LIST). */
export const PERSIST_KEY = 'vot-diag-ring';
/** Entries kept across reloads. */
const PERSIST_CAP = 50;
/** Tags whose warnings outlive the page: the storage-health channels. */
const PERSIST_TAGS = new Set(['hydration', 'store', 'state-guard', 'data-health']);

/** @returns {DiagEntry[]} the ring, oldest first; [] when absent or unreadable. */
function _readRing() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.t === 'number' && typeof e.msg === 'string') : [];
  } catch (_e) { return []; }
}

/** @param {DiagEntry} entry */
function _appendRing(entry) {
  try {
    const ring = _readRing();
    ring.push(entry);
    localStorage.setItem(PERSIST_KEY, JSON.stringify(ring.slice(-PERSIST_CAP)));
  } catch (_e) { /* quota or no storage: the in-memory entry still stands */ }
}

/* ─── Module state ──────────────────────────────────────────────────── */

/** Seeded with the ring, so earlier sessions' storage warnings show in an export.
 *  @type {DiagEntry[]} */
let _buffer = _readRing();

/**
 * Append one entry, evicting the oldest when over capacity. Both tag and
 * message are coerced to strings and sanitized.
 * @param {'W'|'E'|'I'} lvl
 * @param {string} tag
 * @param {string} msg
 */
function _push(lvl, tag, msg) {
  const entry = { t: Date.now(), lvl, tag: sanitize(String(tag)), msg: sanitize(String(msg)) };
  _buffer.push(entry);
  if (_buffer.length > CAPACITY) _buffer.shift();
  if (lvl !== 'I' && PERSIST_TAGS.has(entry.tag)) _appendRing(entry);
}

/* ─── Public functions ──────────────────────────────────────────────── */

/**
 * Record a warning. Use for recoverable problems worth surfacing in a
 * diagnostic export (store write failures, quota pressure, SW hiccups).
 * @param {string} tag
 * @param {string} message
 */
function _warn(tag, message) { _push('W', tag, message); }

/**
 * Record an error. Use for genuine failures (render crashes caught by the
 * ErrorBoundary, unrecoverable write paths).
 * @param {string} tag
 * @param {string} message
 */
function _error(tag, message) { _push('E', tag, message); }

/**
 * Record a timing. `label` names the thing measured; `durationMs` is
 * rounded to whole millis. Stored at info level ('I') — these are
 * web-side diagnostics (e.g. lazy corpus-load durations) with no Android
 * WARN-floor counterpart.
 * @param {string} tag
 * @param {string} label
 * @param {number} durationMs
 */
function _timing(tag, label, durationMs) {
  const ms = Number.isFinite(durationMs) ? Math.round(durationMs) : 0;
  _push('I', tag, String(label) + ' ' + ms + 'ms');
}

/**
 * Snapshot of the buffer in insertion order (oldest first). Returns a new
 * array of shallow-copied entries so callers cannot mutate internal state
 * (mirrors BoundedLogTree.getEntries() returning a fresh List).
 * @returns {DiagEntry[]}
 */
function _entries() {
  return _buffer.map((e) => ({ t: e.t, lvl: e.lvl, tag: e.tag, msg: e.msg }));
}

/**
 * Serialize the buffer to a JSON array string — the contract
 * PlatformBridge.getCrashLog() returns on web (a string the SettingsScreen
 * JSON.parses). Empty buffer → '[]', matching BoundedLogTree.toJson().
 * @returns {string}
 */
function _toJSON() {
  return JSON.stringify(_buffer);
}

/** Drop all stored entries, the persisted ring too. Also the test-reset hook. */
function _clear() {
  _buffer = [];
  try { localStorage.removeItem(PERSIST_KEY); } catch (_e) { /* no storage: nothing persisted */ }
}

/** The persisted storage-health ring alone (oldest first), for the data-health check. */
function _persisted() { return _readRing(); }

/* ─── Export ─────────────────────────────────────────────────────────── */

export const DiagnosticLog = {
  warn: _warn,
  error: _error,
  timing: _timing,
  entries: _entries,
  toJSON: _toJSON,
  clear: _clear,
  persisted: _persisted,
  CAPACITY,
  // Exposed for direct unit testing of the redaction (mirrors
  // BoundedLogTree.sanitize being `internal` for its same-module tests).
  _sanitize: sanitize,
};
