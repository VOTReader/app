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
     - In-memory ONLY — never persisted, never sent over the network,
       cleared on page refresh. Matches BoundedLogTree's "in-process only,
       cleared on app kill" and the project's "local data only / no
       security risks" policy (CLAUDE.md User policies).
     - Sanitization: the SAME two redactions BoundedLogTree applies —
       content:// / file:// URIs → "[uri]", and absolute paths under the
       Android-exposed roots → "[path]". Keeps the Export JSON safe to
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
 *          'render', …) — a code-level identifier, never user content, so
 *          it is NOT sanitized (matches BoundedLogTree, which stores the
 *          inferred tag verbatim).
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

/**
 * Redact filesystem-revealing substrings from a message. URI replace runs
 * first so a `file:///storage/...` URI collapses to "[uri]" whole rather
 * than leaving a "[path]" tail (matches BoundedLogTree's replace order).
 * @param {string} s
 * @returns {string}
 */
function sanitize(s) {
  return String(s).replace(SENSITIVE_URI, '[uri]').replace(SENSITIVE_PATH, '[path]');
}

/* ─── Module state ──────────────────────────────────────────────────── */

/** @type {DiagEntry[]} */
let _buffer = [];

/**
 * Append one entry, evicting the oldest when over capacity. The tag is
 * coerced to string but left unsanitized (code-level identifier); the
 * message is coerced and sanitized.
 * @param {'W'|'E'|'I'} lvl
 * @param {string} tag
 * @param {string} msg
 */
function _push(lvl, tag, msg) {
  _buffer.push({ t: Date.now(), lvl, tag: String(tag), msg: sanitize(String(msg)) });
  if (_buffer.length > CAPACITY) _buffer.shift();
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

/** Drop all stored entries. Also the test-reset hook (the only mutable state). */
function _clear() { _buffer = []; }

/* ─── Export ─────────────────────────────────────────────────────────── */

export const DiagnosticLog = {
  warn: _warn,
  error: _error,
  timing: _timing,
  entries: _entries,
  toJSON: _toJSON,
  clear: _clear,
  CAPACITY,
  // Exposed for direct unit testing of the redaction (mirrors
  // BoundedLogTree.sanitize being `internal` for its same-module tests).
  _sanitize: sanitize,
};
