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
 *   - Size filter: [MAX_ENTRY_BYTES] per entry, so the buffer is
 *     bounded in BYTES as well as in entries. It was not, and the
 *     reason is not obvious from this file: Timber's Tree.prepareLog
 *     appends getStackTraceString(t) to the message BEFORE log() is
 *     called, so every Timber.w(e, "...") arrived here carrying a
 *     whole stack trace. Measured 2026-09-05 in the unit-test JVM:
 *     90 bytes for a plain WARN, 5,489 with one throwable, 5,853 with
 *     three chained causes, ~1.05 MB for 200 of them -- inside the
 *     diagnostic export the reader shares from Settings. Two harms,
 *     not one: a megabyte of stack frames in a shareable file, and a
 *     ring that bounds COUNT silently evicting 5 KB of other evidence
 *     per noisy entry. Same reason NativeAudioRecorder truncates a
 *     refused name to LOGGED_NAME_CHARS.
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
     * call site (nullable when forced via Timber.tag()). Both tag and
     * message have already passed through [sanitize].
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
        // Sanitize BOTH fields. Every current call site uses a static literal tag
        // ("GardenCache", "WebViewJS"), for which sanitize() is a no-op — but the
        // export advertises a sanitized diagnostic tail, and a future
        // Timber.tag(someUri) would otherwise leak straight past the message
        // redaction. Sanitizing the tag too keeps the guarantee total, not
        // message-only, at the cost of one no-op String pass per WARN+ line.
        // compact() FIRST (rebuild the throwable half from t instead of storing
        // the multi-kilobyte trace Timber already glued onto the message),
        // sanitize() on the small result, capBytes() LAST so the stored value is
        // guaranteed to be under the cap whatever sanitize did to its length.
        val entry = LogEntry(
            clock(),
            priority,
            tag?.let { sanitize(it) },
            capBytes(sanitize(compact(message, t))),
        )
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

    /**
     * Serialize the buffer to a JSON array string. Each entry becomes
     * `{"t": <millis>, "lvl": "W|E|A", "tag": "<tag>" | null, "msg": "<message>"}`.
     * Empty buffer → `"[]"`.
     *
     * Hand-rolled rather than using org.json.JSONArray so this stays
     * pure-JVM (the org.json classes are Android-stub in unit tests
     * unless Robolectric is loaded). Escapes the four hot-path chars
     * (\, ", \n, \r, \t) directly and falls back to `\uXXXX` for the
     * remaining sub-0x20 control characters.
     */
    fun toJson(): String {
        val entries = getEntries()
        if (entries.isEmpty()) return "[]"
        val sb = StringBuilder(entries.size * 64).append('[')
        for ((i, e) in entries.withIndex()) {
            if (i > 0) sb.append(',')
            sb.append("{\"t\":").append(e.timestamp)
                .append(",\"lvl\":\"").append(levelChar(e.level)).append('"')
                .append(",\"tag\":")
            if (e.tag == null) sb.append("null")
            else sb.append(jsonString(e.tag))
            sb.append(",\"msg\":").append(jsonString(e.message))
                .append('}')
        }
        sb.append(']')
        return sb.toString()
    }

    companion object {
        const val DEFAULT_CAPACITY = 200

        /** Hard ceiling on the bytes ONE entry may occupy after sanitizing. */
        const val MAX_ENTRY_BYTES = 512

        /** Stack frames kept from the outermost throwable; the rest are counted. */
        const val TRACE_FRAMES = 3

        /** Cause-chain walk limit -- a self-referential cause chain is legal Java. */
        private const val MAX_CAUSES = 5

        /** U+2026, three bytes in UTF-8; reserved out of the budget when we truncate. */
        private const val ELLIPSIS = "\u2026"

        /**
         * Rebuild the throwable half of a Timber message compactly.
         *
         * Timber composes `message + "\n" + getStackTraceString(t)` before
         * calling log(), so by the time we see it the trace is already glued on.
         * We still have [t], so the whole appended trace is dropped and replaced
         * with: the caller's own message, the throwable's toString, EVERY cause's
         * toString, then [TRACE_FRAMES] frames and a "+N frames" marker.
         *
         * CAUSES BEFORE FRAMES, deliberately and against stack-trace convention.
         * [capBytes] truncates the tail, so whatever sits last is what gets lost
         * first -- and a root cause's message is worth more in a diagnostic than
         * a third frame. Frames are the context; causes are the finding.
         *
         * The boundary between the caller's message and Timber's appended trace
         * is the LAST occurrence of "\n" + t.toString(), which is exactly what
         * printStackTrace writes as its first line. `lastIndexOf` rather than
         * `indexOf` so a caller message that happens to quote the same text
         * cannot cut early; a "Caused by: " line cannot match because of its
         * prefix. If the marker is absent (a Timber version that composes
         * differently) the message is used whole and [capBytes] still bounds it.
         */
        internal fun compact(message: String, t: Throwable?): String {
            if (t == null) return message
            val marker = "\n" + t.toString()
            val cut = message.lastIndexOf(marker)
            val head = if (cut >= 0) message.substring(0, cut) else message

            val sb = StringBuilder(MAX_ENTRY_BYTES)
            if (head.isNotEmpty()) sb.append(head).append('\n')
            sb.append(t.toString())

            var cause = t.cause
            var seen = 0
            while (cause != null && cause !== t && seen < MAX_CAUSES) {
                sb.append("\nCaused by: ").append(cause.toString())
                val next = cause.cause
                cause = if (next === cause) null else next
                seen++
            }

            val frames = t.stackTrace
            for (i in 0 until minOf(TRACE_FRAMES, frames.size)) {
                sb.append("\n\tat ").append(frames[i].toString())
            }
            val dropped = frames.size - TRACE_FRAMES
            if (dropped > 0) sb.append("\n\t+").append(dropped).append(" frames")
            return sb.toString()
        }

        /**
         * Truncate [s] to [MAX_ENTRY_BYTES] of UTF-8, appending [ELLIPSIS] when
         * anything was dropped.
         *
         * Walks code POINTS, not chars: `String.take` cuts on a UTF-16 unit and
         * can leave a lone high surrogate, which [jsonString] then emits verbatim
         * (it only escapes the sub-0x20 control set) -- so an invalid-UTF-8 byte
         * would reach the reader's export and can break JSON.parse on the JS
         * side. A half-truncated log line is a nuisance; an unparseable export is
         * a lost diagnostic.
         */
        internal fun capBytes(s: String): String {
            var total = 0
            var i = 0
            while (i < s.length) {
                total += utf8Width(s.codePointAt(i))
                i += Character.charCount(s.codePointAt(i))
            }
            if (total <= MAX_ENTRY_BYTES) return s

            val budget = MAX_ENTRY_BYTES - 3 // ELLIPSIS is 3 bytes in UTF-8
            var used = 0
            var end = 0
            while (end < s.length) {
                val cp = s.codePointAt(end)
                val w = utf8Width(cp)
                if (used + w > budget) break
                used += w
                end += Character.charCount(cp)
            }
            return s.substring(0, end) + ELLIPSIS
        }

        /** UTF-8 byte width of one code point. */
        private fun utf8Width(cp: Int): Int = when {
            cp < 0x80 -> 1
            cp < 0x800 -> 2
            cp < 0x10000 -> 3
            else -> 4
        }

        // Match content:// and file:// URIs all the way to next whitespace.
        // Both expose either a content-provider identity or a real path,
        // neither of which belong in a shareable diagnostic export.
        private val SENSITIVE_URI = Regex("(?:content|file)://\\S+")

        // Match the small set of absolute-path roots Android exposes to
        // the app. Body uses a tight character class (\w + dot + slash +
        // dash) rather than \S so trailing punctuation (colons, commas,
        // quote marks) in the surrounding sentence is NOT consumed by
        // the redaction -- that would erase context-bearing words like
        // ": failed" that follow a path.
        private val SENSITIVE_PATH =
            Regex("/(?:storage|data|sdcard|cache|system|mnt|root)/[\\w./-]*")

        // Preserve a useful HTTP(S) endpoint while stripping signed-query
        // credentials and opaque fragments from shareable diagnostics.
        private val WEB_URL = Regex("https?://\\S+", RegexOption.IGNORE_CASE)

        // `internal` so the same-module test set can exercise sanitize()
        // directly. Production callers only reach it via log().
        internal fun sanitize(s: String): String =
            s.replace(SENSITIVE_URI, "[uri]")
                .replace(SENSITIVE_PATH, "[path]")
                .replace(WEB_URL) { match ->
                    val raw = match.value
                    val query = raw.indexOf('?')
                    val fragment = raw.indexOf('#')
                    val cut = when {
                        query < 0 -> fragment
                        fragment < 0 -> query
                        else -> minOf(query, fragment)
                    }
                    val endpoint = if (cut < 0) raw else raw.substring(0, cut)
                    val schemeEnd = endpoint.indexOf("://") + 3
                    val pathStart = endpoint.indexOf('/', schemeEnd).let { if (it < 0) endpoint.length else it }
                    val userInfo = endpoint.lastIndexOf('@', pathStart - 1).takeIf { it in schemeEnd until pathStart }
                    val clean = if (userInfo == null) endpoint else endpoint.substring(0, schemeEnd) + "[redacted]@" + endpoint.substring(userInfo + 1)
                    clean + if (cut < 0) "" else "[redacted]"
                }

        // Render the four-letter shorthand the Export JSON includes for
        // each entry's level. Confined to the values that survive the
        // WARN-floor filter in log().
        internal fun levelChar(lvl: Int): String = when (lvl) {
            Log.WARN -> "W"
            Log.ERROR -> "E"
            Log.ASSERT -> "A"
            else -> "?"
        }

        // JSON string escape: only the four hot-path chars + a generic
        // `\uXXXX` fallback for the remaining sub-0x20 control set.
        // Higher code points are emitted verbatim (the consumer reads
        // this as UTF-8). Internal so tests can hit it directly.
        internal fun jsonString(s: String): String {
            val sb = StringBuilder(s.length + 2).append('"')
            for (c in s) {
                when (c) {
                    '\\' -> sb.append("\\\\")
                    '"' -> sb.append("\\\"")
                    '\n' -> sb.append("\\n")
                    '\r' -> sb.append("\\r")
                    '\t' -> sb.append("\\t")
                    else -> {
                        if (c.code < 0x20) {
                            sb.append(String.format("\\u%04x", c.code))
                        } else {
                            sb.append(c)
                        }
                    }
                }
            }
            sb.append('"')
            return sb.toString()
        }
    }
}
