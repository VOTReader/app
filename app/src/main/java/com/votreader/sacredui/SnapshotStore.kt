package com.votreader.sacredui

import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber
import java.io.File
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
 * Thread-safe (every entry point is synchronized): bridge calls land on binder
 * threads. Every failure is quiet (false / "" / "[]"), never a throw across the
 * bridge.
 */
class SnapshotStore(private val dir: File) {

    companion object {
        const val KEEP_DAYS = 7
        const val KEEP_WEEKS = 4
        const val MAX_BYTES = 24L * 1024 * 1024
        private val NAME = Regex("""^snap-(\d{8})-(\d{6})\.json$""")
        private fun stampFormat() = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
    }

    /** Write one snapshot; prunes old ones. False when empty, too big, or the write failed. */
    @Synchronized
    fun save(json: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (json.isNullOrBlank()) return false
        val bytes = json.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_BYTES) return false
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
            tmp.writeBytes(bytes)
            if (!tmp.renameTo(File(dir, name))) { tmp.delete(); return false }
            prune()
            true
        } catch (e: Exception) {
            Timber.w(e, "snapshot save failed")
            false
        }
    }

    /** `[{name, size, at}]`, newest first; `at` is the time in the name (epoch ms). */
    @Synchronized
    fun listJson(): String = try {
        val arr = JSONArray()
        for (f in snapshots()) {
            arr.put(JSONObject().put("name", f.name).put("size", f.length()).put("at", stampOf(f.name)))
        }
        arr.toString()
    } catch (e: Exception) { "[]" }

    /** One snapshot's JSON, or "" for an unknown or malformed name (no path ever leaves [dir]). */
    @Synchronized
    fun read(name: String?): String {
        if (name == null || !NAME.matches(name)) return ""
        val f = File(dir, name)
        return try { if (f.isFile) f.readText(Charsets.UTF_8) else "" } catch (e: Exception) { "" }
    }

    /** Delete every snapshot (the page's Clear All My Data). True when none remain. */
    @Synchronized
    fun clear(): Boolean {
        val files = dir.listFiles() ?: return true
        var ok = true
        for (f in files) if (f.name.startsWith("snap-") && !f.delete()) ok = false
        return ok
    }

    /** Snapshot files, newest first. */
    private fun snapshots(): List<File> =
        (dir.listFiles() ?: emptyArray()).filter { NAME.matches(it.name) }.sortedByDescending { it.name }

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
            val day = NAME.find(f.name)!!.groupValues[1]
            if (day in days) { f.delete(); continue }
            if (days.size < KEEP_DAYS) { days.add(day); continue }
            cal.timeInMillis = stampOf(f.name)
            val week = "${cal.get(Calendar.YEAR)}-${cal.get(Calendar.WEEK_OF_YEAR)}"
            if (week in weeks || weeks.size >= KEEP_WEEKS) { f.delete(); continue }
            weeks.add(week)
            days.add(day)
        }
        // A save the process died inside leaves a .tmp: never a snapshot, always garbage.
        (dir.listFiles() ?: emptyArray()).filter { it.name.endsWith(".json.tmp") }.forEach { it.delete() }
    }
}
