package com.votreader.sacredui

import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Automatic rolling snapshots of the reader's data, kept OUTSIDE the WebView's
 * storage (datasafe 2026-10-05).
 *
 * On 2026-10-02 the owner's phone lost its whole VOTReader database: highlights,
 * notes, links, read marks, history, streak. No reinstall, no clear-data, no
 * low disk; the WebView's IndexedDB simply came back empty. Every backup the app
 * kept lived in that same storage, so nothing could bring it back. The page now
 * hands this store a snapshot (its export manifest, JSON, media not included)
 * once a day after every store has loaded, and offers a restore when it boots to
 * a library much smaller than the newest snapshot.
 *
 * Files live in [dir] (the app's private files dir): they survive a WebView
 * storage wipe and go only with an uninstall or Clear storage. Names are
 * `snap-yyyyMMdd-HHmmss.json`. [prune] keeps the newest snapshot of each of the
 * last [KEEP_DAYS] days that have one, plus the newest of each of the
 * [KEEP_WEEKS] weeks before those, so a slow loss that rolls a week of daily
 * snapshots still leaves an older good one. A snapshot over [MAX_BYTES] is
 * refused rather than written partly.
 *
 * W9 (2026-10-13): a snapshot's bytes are forced to the disk before it takes its
 * name, so a power cut leaves the old set or the new snapshot whole, never a named
 * one cut short. One broken anyway (one the page could not restore from: not strict JSON,
 * or no stores) is never listed and never keeps its day in [prune]: as the newest of its
 * day it used to push out the good copy before it. The page walks past one, too.
 *
 * Thread-safe (every entry point is synchronized): bridge calls land on binder
 * threads. Every failure is quiet (false / "" / "[]"), never a throw across the
 * bridge.
 *
 * ds-backup (2026-10-23): [cloud] holds one copy of the newest snapshot, and it is all of this
 * store that Google's cloud backup takes (res/xml/data_extraction_rules.xml): the whole set can
 * pass the 25 MB per-app cap, and over it Android skips the backup outright. A phone restored
 * from the cloud has only that copy; the first listing takes it back into [dir].
 */
class SnapshotStore(private val dir: File, private val cloud: File = File(dir.parentFile, "snapshot-cloud")) {

    companion object {
        const val KEEP_DAYS = 7
        const val KEEP_WEEKS = 4
        const val MAX_BYTES = 24L * 1024 * 1024
        private val NAME = Regex("""^snap-(\d{8})-(\d{6})\.json$""")
        private fun stampFormat() = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
    }

    /** Forces a written file's bytes to the disk (W9); a seam so a test sees it run before the rename. */
    internal var sync: (FileOutputStream) -> Unit = { it.fd.sync() }

    /** Write one snapshot; prunes old ones. False when empty, too big, or the write failed. */
    @Synchronized
    fun save(json: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (json.isNullOrBlank()) return false
        val bytes = json.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_BYTES) return false
        if (!cloudChecked) { cloudChecked = true; cloudTakeBack() }
        return try {
            if (!dir.isDirectory && !dir.mkdirs()) return false
            var name = "snap-" + stampFormat().format(Date(nowMs)) + ".json"
            // Two saves inside one second: the later one gets the next free second.
            var t = nowMs
            while (File(dir, name).exists()) {
                t += 1000
                name = "snap-" + stampFormat().format(Date(t)) + ".json"
            }
            val tmp = File(dir, "$name.tmp")
            FileOutputStream(tmp).use { out -> out.write(bytes); out.flush(); sync(out) }
            if (!tmp.renameTo(File(dir, name))) { tmp.delete(); return false }
            prune()
            cloudCopy()
            true
        } catch (e: Exception) {
            Timber.w(e, "snapshot save failed")
            false
        }
    }

    /** `[{name, size, at}]`, newest first; `at` is the time in the name (epoch ms). */
    @Synchronized
    fun listJson(): String = try {
        if (!cloudChecked) { cloudChecked = true; cloudTakeBack(); cloudCopy() }
        val arr = JSONArray()
        for (f in snapshots()) {
            if (whole(f) == false) continue          // broken; one unreadable this time is listed (the page walks past it)
            arr.put(JSONObject().put("name", f.name).put("size", f.length()).put("at", stampOf(f.name)))
        }
        arr.toString()
    } catch (e: Exception) { "[]" }

    /** One snapshot's JSON, or "" for an unknown or malformed name (no path ever leaves [dir]). */
    @Synchronized
    fun read(name: String?): String {
        if (name == null || !NAME.matches(name)) return ""
        if (!cloudChecked) { cloudChecked = true; cloudTakeBack(); cloudCopy() }
        val f = File(dir, name)
        return try { if (f.isFile) f.readText(Charsets.UTF_8) else "" } catch (e: Exception) { "" }
    }

    /** Delete every snapshot (the page's Clear All My Data). True when none remain. */
    @Synchronized
    fun clear(): Boolean {
        val files = dir.listFiles() ?: return true
        var ok = true
        for (f in files) if (f.name.startsWith("snap-") && !f.delete()) ok = false
        for (f in cloud.listFiles() ?: emptyArray()) if (f.name.startsWith("snap-") && !f.delete()) ok = false
        return ok
    }

    /** Whether this process has matched [cloud] against [dir] yet (once: a restore lands before the app runs). */
    private var cloudChecked = false

    /** A restored phone: a cloud copy [dir] lacks comes back into it (copied whole, then named). */
    private fun cloudTakeBack() {
        try {
            for (f in cloud.listFiles() ?: emptyArray()) {
                if (!NAME.matches(f.name) || File(dir, f.name).exists()) continue
                if (!dir.isDirectory && !dir.mkdirs()) return
                if (!place(f, dir)) Timber.w("cloud snapshot %s not taken back", f.name)
            }
        } catch (e: Exception) { Timber.w(e, "cloud snapshot take-back failed") }
    }

    /** [cloud] = exactly the newest whole snapshot. Quiet on failure: the next save tries again. */
    private fun cloudCopy() {
        try {
            val newest = snapshots().firstOrNull { whole(it) == true } ?: return
            if (!File(cloud, newest.name).isFile) {
                if (!cloud.isDirectory && !cloud.mkdirs()) return
                if (!place(newest, cloud, via = dir)) return
            }
            for (f in cloud.listFiles() ?: emptyArray()) if (f.name != newest.name) f.delete()
        } catch (e: Exception) { Timber.w(e, "cloud snapshot copy failed") }
    }

    /**
     * Copy [src] into [to] under its own name: bytes forced to the disk first, then renamed (W9). The
     * part-written file sits in [via], so one a dead process leaves is never in the cloud backup.
     */
    private fun place(src: File, to: File, via: File = to): Boolean {
        val tmp = File(via, src.name + ".tmp")
        FileOutputStream(tmp).use { out -> src.inputStream().use { it.copyTo(out) }; out.flush(); sync(out) }
        if (tmp.renameTo(File(to, src.name))) return true
        tmp.delete()
        return false
    }

    /** Snapshot files, newest first. */
    private fun snapshots(): List<File> =
        (dir.listFiles() ?: emptyArray()).filter { NAME.matches(it.name) }.sortedByDescending { it.name }

    /** [whole]'s verdicts by name, size and time: a named snapshot never changes, so each is read once. */
    private val verdicts = HashMap<String, Boolean>()

    /**
     * Whether the page can restore from this snapshot: the whole file is one JSON object, read
     * as strictly as the page's JSON.parse reads it, with a "stores" object at its top (W9 and
     * its refuter: an ends-only check passed a file broken in the middle, and org.json reads
     * JSON the page cannot). Null when the file could not be read this time: never cached,
     * never a reason to delete. Each file is read once per process.
     */
    private fun whole(f: File): Boolean? {
        val key = f.name + ":" + f.length() + ":" + f.lastModified()
        verdicts[key]?.let { return it }
        val text = try { f.readText(Charsets.UTF_8) } catch (e: Exception) { return null }
        val ok = StrictSnapshotJson(text).readable()
        if (verdicts.size > 64) verdicts.clear()
        verdicts[key] = ok
        return ok
    }

    private fun stampOf(name: String): Long {
        val m = NAME.find(name) ?: return 0L
        return try { stampFormat().parse(m.groupValues[1] + "-" + m.groupValues[2])?.time ?: 0L } catch (e: Exception) { 0L }
    }

    /** Keep the newest per day for KEEP_DAYS days, then the newest per week for KEEP_WEEKS weeks. */
    internal fun prune() {
        val days = LinkedHashSet<String>()
        val weeks = LinkedHashSet<String>()
        val cal = Calendar.getInstance(Locale.US)
        for (f in snapshots()) {
            // Broken (W9): never this day's keeper; like a leftover .tmp, never a snapshot again.
            // Unreadable this time: never this day's keeper either, and left alone.
            when (whole(f)) {
                false -> { Timber.w("snapshot %s is broken; removed", f.name); f.delete(); continue }
                null -> continue
                true -> {}
            }
            val day = NAME.find(f.name)!!.groupValues[1]
            if (day in days) { f.delete(); continue }
            if (days.size < KEEP_DAYS) { days.add(day); continue }
            // The week is named by the Sunday it starts on (snapshot-sink.js's rule):
            // YEAR + WEEK_OF_YEAR splits the week of Dec 27-31 into two keys.
            cal.timeInMillis = stampOf(f.name)
            cal.set(Calendar.HOUR_OF_DAY, 0)
            cal.add(Calendar.DAY_OF_MONTH, Calendar.SUNDAY - cal.get(Calendar.DAY_OF_WEEK))
            val week = "${cal.get(Calendar.YEAR)}-${cal.get(Calendar.DAY_OF_YEAR)}"
            if (week in weeks || weeks.size >= KEEP_WEEKS) { f.delete(); continue }
            weeks.add(week)
            days.add(day)
        }
        // A save the process died inside leaves a .tmp: never a snapshot, always garbage.
        (dir.listFiles() ?: emptyArray()).filter { it.name.endsWith(".json.tmp") }.forEach { it.delete() }
    }
}

/**
 * A strict JSON syntax check (RFC 8259, what JavaScript's JSON.parse accepts) for one snapshot:
 * one object with nothing after it, and a "stores" object among its top-level keys, which
 * data-safety.js needs to restore from it. Android's org.json is lenient (unquoted and
 * single-quoted strings, comments), so it cannot answer for the page. Builds nothing but the
 * top-level keys, decoded, the last of a repeated one counting (W9 refuter round 3).
 */
internal class StrictSnapshotJson(private val s: String) {
    private var i = 0
    private var hasStores = false

    fun readable(): Boolean = try {
        space()
        obj(top = true)
        space()
        i == s.length && hasStores
    } catch (e: IllegalArgumentException) { false } catch (e: StackOverflowError) { false }

    private fun peek(): Char = if (i < s.length) s[i] else END
    private fun bad(): Nothing = throw IllegalArgumentException("not JSON at $i")
    private fun take(c: Char) { if (peek() != c) bad(); i++ }
    private fun space() { while (i < s.length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++ }

    private fun value() {
        space()
        val c = peek()
        when {
            c == '{' -> obj(top = false)
            c == '[' -> arr()
            c == '"' -> str(keep = false)
            c == 't' -> word("true")
            c == 'f' -> word("false")
            c == 'n' -> word("null")
            c == '-' || c in '0'..'9' -> num()
            else -> bad()
        }
    }

    private fun obj(top: Boolean) {
        take('{'); space()
        if (peek() == '}') { i++; return }
        while (true) {
            space()
            val key = str(keep = top)
            space(); take(':'); space()
            if (top && key == "stores") hasStores = peek() == '{'     // JSON.parse keeps the last of a repeated key
            value(); space()
            if (peek() == ',') { i++; continue }
            take('}'); return
        }
    }

    private fun arr() {
        take('['); space()
        if (peek() == ']') { i++; return }
        while (true) {
            value(); space()
            if (peek() == ',') { i++; continue }
            take(']'); return
        }
    }

    /** A string; its text, escapes decoded as JSON.parse decodes them, only when [keep] (a top-level key). */
    private fun str(keep: Boolean): String? {
        take('"')
        val out = if (keep) StringBuilder() else null
        while (true) {
            if (i >= s.length) bad()
            val c = s[i]
            when {
                c == '"' -> { i++; return out?.toString() }
                c == '\\' -> {
                    i++
                    val e = peek()
                    when (e) {
                        '"', '\\', '/' -> out?.append(e)
                        'b' -> out?.append('\b')
                        'f' -> out?.append(12.toChar())
                        'n' -> out?.append('\n')
                        'r' -> out?.append('\r')
                        't' -> out?.append('\t')
                        'u' -> {
                            if (i + 4 >= s.length) bad()
                            for (k in 1..4) if (Character.digit(s[i + k], 16) < 0) bad()
                            out?.append(s.substring(i + 1, i + 5).toInt(16).toChar())
                            i += 4
                        }
                        else -> bad()
                    }
                    i++
                }
                c < ' ' -> bad()
                else -> { out?.append(c); i++ }
            }
        }
    }

    private fun num() {
        if (peek() == '-') i++
        if (peek() == '0') i++ else digits()
        if (peek() == '.') { i++; digits() }
        if (peek() == 'e' || peek() == 'E') { i++; if (peek() == '+' || peek() == '-') i++; digits() }
    }

    private fun digits() { if (peek() !in '0'..'9') bad(); while (peek() in '0'..'9') i++ }

    private fun word(w: String) { if (!s.startsWith(w, i)) bad(); i += w.length }

    private companion object { const val END = '\u0000' }
}
