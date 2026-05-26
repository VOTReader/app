package com.votreader.sacredui

import android.util.Log
import timber.log.Timber

/**
 * NK5 — release-build Timber tree. Captures the last [capacity] WARN+
 * log entries to an in-memory ring buffer so Export JSON can include
 * a diagnostic tail without ever writing anything to a file or
 * shipping it off-device.
 *
 * Why a separate tree (instead of DebugTree on release):
 *   - DebugTree calls android.util.Log, which on release builds gets
 *     filtered by the user's adb settings -- so messages would never
 *     reach Logcat anyway. We want them retrievable from inside the
 *     app itself.
 *   - Level filter: WARN and above only. DEBUG/INFO/VERBOSE are noisy
 *     in release builds and would push genuinely interesting WARN/ERROR
 *     entries out of the buffer; restricting the input keeps the
 *     [capacity] entries we DO store relevant.
 *   - The buffer is in-process only and cleared on app kill. Nothing
 *     is persisted, nothing is sent over the network, nothing is
 *     logged outside the app process. Matches the project's "no
 *     credentials, no security risks, local data only" policy
 *     (CLAUDE.md User policies).
 *
 * Sanitization: before storage, both regexes below redact content://
 * URIs and absolute paths from common Android roots. This keeps the
 * Export JSON safe to share via the user's chosen channel (email,
 * messaging) without leaking the device's filesystem layout or
 * picked-file identities.
 *
 * Threading: log() can fire from any thread (the @JavascriptInterface
 * binder threads, the Activity main thread, coroutines). The lock
 * around the ArrayDeque covers both append + the overflow eviction
 * step as one atomic transition.
 */
class BoundedLogTree(
    private val capacity: Int = DEFAULT_CAPACITY,
    private val clock: () -> Long = System::currentTimeMillis,
) : Timber.Tree() {

    /**
     * One captured log line. Timestamp is wall-clock millis at log
     * time, the level uses [android.util.Log] constants (WARN=5,
     * ERROR=6, ASSERT=7), tag is whatever Timber inferred from the
     * call site (nullable when forced via Timber.tag()), and message
     * has already passed through [sanitize].
     */
    data class LogEntry(
        val timestamp: Long,
        val level: Int,
        val tag: String?,
        val message: String,
    )

    private val lock = Any()
    private val buffer: ArrayDeque<LogEntry> = ArrayDeque(capacity)

    // `public` (widened from Timber.Tree's `protected abstract`) so the
    // same-module test set can drive log() directly with the (priority,
    // tag, message, t) tuple. Production callers go through Timber.w/e/wtf
    // which dispatch through this method internally; widening the
    // override has no effect on that path.
    public override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        if (priority < Log.WARN) return
        val sanitized = sanitize(message)
        val entry = LogEntry(clock(), priority, tag, sanitized)
        synchronized(lock) {
            if (buffer.size >= capacity) buffer.removeFirst()
            buffer.addLast(entry)
        }
    }

    /**
     * Snapshot of the current buffer in insertion order (oldest first).
     * Returns a new List so the caller cannot mutate internal state.
     */
    fun getEntries(): List<LogEntry> = synchronized(lock) { buffer.toList() }

    /** Drop all stored entries. */
    fun clear(): Unit = synchronized(lock) { buffer.clear() }

    companion object {
        const val DEFAULT_CAPACITY = 200

        // Match content:// and file:// URIs all the way to next whitespace.
        // Both expose either a content-provider identity or a real path,
        // neither of which belong in a shareable diagnostic export.
        private val SENSITIVE_URI = Regex("(?:content|file)://\\S+")

        // Match the small set of absolute-path roots Android exposes to
        // the app -- this is conservative on purpose, since over-matching
        // could redact legitimate informative substrings. The roots
        // covered are the ones actually appearing in MediaRecorder /
        // cacheDir / picker paths we log from.
        private val SENSITIVE_PATH =
            Regex("/(?:storage|data|sdcard|cache|system|mnt|root)/\\S*")

        // `internal` so the same-module test set can exercise sanitize()
        // directly. Production callers only reach it via log().
        internal fun sanitize(s: String): String =
            s.replace(SENSITIVE_URI, "[uri]")
                .replace(SENSITIVE_PATH, "[path]")
    }
}
