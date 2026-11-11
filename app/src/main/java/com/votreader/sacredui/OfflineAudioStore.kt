package com.votreader.sacredui

import android.content.Context
import android.os.Build
import android.webkit.WebResourceResponse
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Recordings downloaded to the phone (listening item 8; Corbin 2026-09-22: "yes after reset"). Any amount at once:
 * Corbin's downloads picks (2026-10-23 02:3x) allow a whole Bible edition (4.4 to 5.9 GB) and all of TVOT, so the
 * page hands the store a list of any length, in calls of up to [MAX_BATCH].
 *
 * The queue survives (dl-d2): queue.json holds what is still to download, in order, with the paused switch, the
 * batch's counts and the "will try again" list, so a close, a kill or a restart picks up where it was. Each download
 * on its way keeps its `<name>.part`, and resume.json names each one's declared size, ETag and the bytes known to be
 * on disk; it goes on from there with an HTTP Range request ([rangeOpener]); a server that answers with the whole
 * file, or a size that changed, starts it again from the top. On Android 14+ a user-initiated data transfer job
 * (DownloadJobService) keeps the process alive with the app closed and shows "Downloading 3 of 31".
 *
 * How the queue runs (dl-rework, 2026-11-10; the browser store offline-audio-web.js keeps the same rules):
 * - [PARALLEL] downloads at once, each on its own worker ([work]). The next is the first waiting one by priority
 *   ([Item.pri]: one the listener tapped by itself, then a set, then automatic ones and kept songs), in the order asked
 *   within each.
 * - One that does not fit in the free space (plus [SPACE_MARGIN], minus what the others still need) is stepped over;
 *   the queue holds as 'space' only when nothing left fits ([reasonNow], with the shortfall in the state's `need`).
 * - A failed download is tried again after [retryDelays], then moves to the "will try again" list (`later`): never
 *   dropped. That list is tried again by itself with growing gaps ([laterDelays], capped at 30 min), whenever the
 *   network changes, and at every start. A GitHub 404 or 5xx is recorded as the server's answer ('server' and its
 *   status), not as no network.
 * - Waiting, never silent: when nothing can start the state says why ([reasonNow]: paused, wifi, offline, space,
 *   retrying, later), and a timer ([timer]) or a change (a network, a removal, Resume) looks again.
 *
 * Why native: the release assets answer without Access-Control-Allow-Origin (both the github.com 302 and the
 * release-assets 206), so a page cannot read their bytes, and an opaque cached copy cannot answer the media element's
 * Range requests. The WebView's shouldInterceptRequest can: the <audio> element keeps asking for the SAME release URL,
 * and a downloaded one is answered from disk ([intercept]), Range included, so play, seek and the read-along clock
 * work with no signal exactly as online. GardenImageCache is the precedent (release assets from disk).
 *
 * Where: filesDir/offline-audio/ (NOT cacheDir: a download the listener chose must not be evicted like a cache), one
 * flat file per recording named `<release tag>__<asset>.mp3` ([fileNameFor]: only the app's own audio releases), plus
 * index.json (url -> file, bytes, savedAt, key, title), written whole by temp file + atomic move.
 *
 * A download lands whole or not at all: bytes stream to `<name>.part` in constant memory, the count must match the
 * declared length, and only then is it moved into place and indexed; a .part is never served, and one left by a kill
 * is kept only when resume.json names it (cut back to its synced bytes), else swept at start. Redirects are followed
 * by hand with every hop's host on the Garden allowlist, and free space is checked against the declared length plus a
 * margin before a byte is written.
 *
 * Every state change goes to JS as one JSON event through [emit] (JsEvent.OfflineAudio): queued, progress (throttled),
 * done(bytes), failed(reason: network | server | short | size | disk, status?: on the "will try again" list),
 * cancelled, removed, waiting(reason).
 *
 * Download only on Wi-Fi (ra6, Corbin 2026-10-14): with the page's switch on ([setWifiOnly]) and the network metered
 * ([unmetered] false: mobile data, a metered hotspot, or none), downloads wait in the queue, and those on their way
 * stop, keep their bytes and wait; on an unmetered network they go on from them. The state says `waiting`, and each
 * change of the gate sends `checked`, so the rows re-read.
 */
class OfflineAudioStore(
    root: File,
    private val opener: (String) -> Opened? = ::openRelease,
    private val executor: Executor = Executors.newFixedThreadPool(PARALLEL) { r -> Thread(r, "offline-audio").apply { isDaemon = true } },
    private val freeBytes: () -> Long = { root.usableSpace },
    private val emit: (String) -> Unit = {},
    private val clock: () -> Long = System::currentTimeMillis,
    private val sizeLister: (String) -> Map<String, Long>? = ::listReleaseSizes,
    private val headSize: (String) -> Long? = ::headLength,
    private val sizeExecutor: Executor = Executors.newSingleThreadExecutor { r -> Thread(r, "offline-audio-sizes").apply { isDaemon = true } },
    private val unmetered: () -> Boolean = { true },
    /** Resume a download from byte `from` (If-Range on the ETag held); a store given only [opener] starts over. */
    private val rangeOpener: (String, Long, String?) -> Opened? = { url, _, _ -> opener(url) },
    /** The phone has a network at all: a download that failed without one waits for it and spends no retry. */
    private val online: () -> Boolean = { true },
    /** Waits before each quick retry of a failed download; after the last it moves to the "will try again" list. */
    private val retryDelays: List<Long> = emptyList(),
    /** The "will try again" list's gaps, growing; the last one repeats. */
    private val laterDelays: List<Long> = LATER_DELAYS,
    /** The queue has work: the app keeps it going with the app closed (DownloadJob.schedule). */
    private val onBusy: (OfflineAudioStore) -> Unit = {},
    /** Look again after `ms` (a retry's time, a space or network re-check). */
    private val timer: (Long, () -> Unit) -> Unit = ::scheduleLater,
    /** The queue runs with the app closed (the user-initiated job, Android 14+): the page then never says "Keep VOTReader open". */
    private val runsClosed: Boolean = false,
) {
    /**
     * One recording to download: its release URL, the player key it plays under, and a title for the shelf. [update]:
     * it is on the phone already and its release asset changed; the new bytes replace it once whole (sweep n2-01).
     * [bytes]: its size as the page knows it (the manifest's baked bytes), -1 unknown; for the queue's totals only,
     * the server's declared length is what a download is checked against. [wifi]: an automatic download (dl-d5: plan
     * week, the next 3), which starts only on an unmetered network. [pri]: [PRI_TAP], [PRI_BULK] or [PRI_AUTO].
     */
    data class Item(val url: String, val key: String, val title: String, val update: Boolean = false, val bytes: Long = -1L,
        val wifi: Boolean = false, val pri: Int = if (wifi) PRI_AUTO else PRI_BULK)

    /**
     * An open download: the body, its declared length (-1 unknown) and how to release the connection. A Range
     * answer (206) starts at [start] and names the whole file's [total]; a whole answer starts at 0. [etag]: the
     * server's strong ETag, for If-Range when it is resumed.
     */
    class Opened(
        val stream: InputStream,
        val length: Long,
        val onClose: () -> Unit = {},
        val start: Long = 0L,
        val total: Long = -1L,
        val etag: String? = null,
    ) {
        /** The whole file's size, -1 unknown. */
        val size: Long get() = if (start == 0L) length else total
    }

    /** The server answered [status] (a 404, a 5xx): a server answer, not a missing network. Thrown by an opener. */
    class ServerAnswer(val status: Int) : IOException("HTTP $status")

    /** What the bytes on disk of one download on its way are (resume.json). */
    private data class Resume(val url: String, val total: Long, val etag: String?, val synced: Long)

    /** How one try at a download ended. */
    private sealed class Outcome {
        data object Finished : Outcome()
        data object Held : Outcome()
        data object Space : Outcome()
        data class Failed(val reason: String, val status: Int = 0) : Outcome()
    }

    /** One waiting download's retry state (guarded by lock): its tries, not before [at], and why the last failed. */
    private class Wait(var tries: Int = 0, var at: Long = 0L, var reason: String = "network", var status: Int = 0,
        var later: Boolean = false, var noRoom: Boolean = false)

    /** The batch the notification counts: recordings asked since the queue was last empty (kept songs left out). */
    class Summary(
        val busy: Boolean, val paused: Boolean, val reason: String?, val done: Int, val total: Int, val failed: Int,
        val activeBytes: Long, val activeTotal: Long, val leftBytes: Long, val wifiOnly: Boolean,
        /** Everything left is on the "will try again" list: nothing for the job to hold the process up for. */
        val onlyLater: Boolean = false,
        /** What can run needs an unmetered network: the switch is on, or only automatic downloads are left. */
        val needsUnmetered: Boolean = false,
    )

    /** How to answer a Range header against a file of a known length. */
    sealed class RangeAnswer {
        data object Full : RangeAnswer()
        data class Part(val start: Long, val end: Long) : RangeAnswer()
        data object Unsatisfiable : RangeAnswer()
    }

    private data class Entry(val file: String, val bytes: Long, val savedAt: Long, val key: String, val title: String)

    private class Active(val url: String) {
        @Volatile var bytes = 0L
        @Volatile var total = -1L
    }

    private val dir = File(root, DIR_NAME).apply { mkdirs() }
    private val indexFile = File(dir, "index.json")
    private val lock = Any()
    private val entries = LinkedHashMap<String, Entry>()          // guarded by lock
    /** Waiting to start (the "will try again" list too), not on its way. */
    private val queued = LinkedHashSet<String>()                  // guarded by lock
    private val cancelled: MutableSet<String> = ConcurrentHashMap.newKeySet()
    /** The downloads on their way, at most [PARALLEL]. */
    private val actives = LinkedHashMap<String, Active>()         // guarded by lock
    private val waits = HashMap<String, Wait>()                   // guarded by lock
    /** The order asked: each new one takes the next number; one put back keeps its own. */
    private val seqs = HashMap<String, Long>()                    // guarded by lock
    private var nextSeq = 0L                                      // guarded by lock
    /** Workers running [work] (started by [ensureWorkers]; one that finds nothing to start leaves). */
    private var workers = 0                                       // guarded by lock
    /** The earliest time a [timer] is set to look again; Long.MAX_VALUE: none set. */
    private var armedAt = Long.MAX_VALUE                          // guarded by lock

    // Download only on Wi-Fi (ra6): the page's switch.
    @Volatile private var wifiOnly = false

    /** A download on its way stopped (paused, a metered network): it goes back to the queue (never a failure). */
    private class Held : Exception()

    // The saved queue (dl-d2): url -> item for everything not yet on the phone (waiting, on its way, will try again),
    // in the order asked (guarded by lock).
    private val queueFile = File(dir, "queue.json")
    private val resumeFile = File(dir, "resume.json")
    private val pending = LinkedHashMap<String, Item>()
    @Volatile private var paused = false
    /** The bytes on disk of each download on its way (guarded by lock); resume.json mirrors it ([resumeWriteLock]). */
    private val resumes = HashMap<String, Resume>()
    private var resumeVersion = 0L   // guarded by lock
    private val resumeWriteLock = Any()
    private var resumeWritten = 0L   // guarded by resumeWriteLock
    /** Why nothing started at the last look: space, retrying, offline, wifi, later; null when something did. */
    @Volatile private var holdReason: String? = null
    private var batchTotal = 0     // guarded by lock
    private var batchDone = 0      // guarded by lock
    private var batchFailed = 0    // guarded by lock
    private var batchBytes = 0L    // guarded by lock
    private var batchDoneBytes = 0L // guarded by lock
    private var queueWrittenAt = 0L

    // Release sizes (bytes) per tag: tag -> (fetchedAt, asset name -> bytes), kept in sizes.json for [SIZE_TTL].
    private val sizesFile = File(dir, "sizes.json")
    private val sizeLock = Any()
    private val sizeCache = HashMap<String, Pair<Long, Map<String, Long>>>()   // guarded by sizeLock
    private val listingFailedAt = HashMap<String, Long>()                        // guarded by sizeLock
    // HEADs spent per tag since the window began: tag -> (windowStart, count). The budget is per tag and window, not
    // per call: a screen of rows asking one by one once spent a thousand (sweep n2-02).
    private val headsSpent = HashMap<String, Pair<Long, Int>>()                   // guarded by sizeLock

    init {
        load()
        loadSizes()
        loadQueue()
    }

    /**
     * Look up the size of each of [urls] before it is downloaded (the rows' "Download · 18 MB", a collection's total):
     * one release listing per tag, cached on the phone for a week, a HEAD per file only for what a listing does not
     * answer. Runs on its own worker (never behind a download) and answers with one event:
     * {type: "sizes", sizes: {url: bytes}, asked: [url...]}; a size nobody could give is simply absent, and `asked`
     * lets the page ask again for exactly those later (not for what another call still has on its way).
     */
    fun requestSizes(urls: List<String>) {
        val asked = urls.distinct().take(MAX_SIZE_BATCH)
        if (asked.isEmpty()) return
        val wanted = asked.mapNotNull { u -> splitRelease(u)?.let { Triple(u, it.first, it.second) } }
        sizeExecutor.execute {
            val out = JSONObject()
            for ((tag, group) in wanted.groupBy { it.second }) {
                val listing = listingFor(tag)
                for ((url, _, asset) in group) {
                    // A HEAD (a round trip and a redirect) only for what a listing did not answer, and only while this
                    // tag's budget lasts: a failed listing must not turn one screen into a thousand requests.
                    val n = listing?.get(asset) ?: if (takeHead(tag)) {
                        try { headSize(url) } catch (_: Exception) { null }
                    } else null
                    if (n != null && n > 0L) out.put(url, n)
                }
            }
            send(JSONObject().put("type", "sizes").put("sizes", out).put("asked", JSONArray(asked)).toString())
        }
    }

    /**
     * The shelf opened: read the release listing of every tag with a recording on the phone again when the one held is
     * older than [CHECK_TTL], so a re-uploaded asset (same URL, new bytes: the read-along timings were made on the new
     * ones) shows as an update, not only a week later (sweep n2-01). One 'checked' event back; the page re-reads the
     * state, whose items carry `stale`.
     */
    fun checkSaved() {
        val tags = synchronized(lock) { entries.keys.mapNotNull { splitRelease(it)?.first }.toSet() }
        if (tags.isEmpty()) return
        sizeExecutor.execute {
            for (tag in tags) listingFor(tag, CHECK_TTL)
            send(JSONObject().put("type", "checked").toString())
        }
    }

    /**
     * A recording on the phone is stale when its release's listing names the asset at another size than the bytes on
     * the phone: the asset was uploaded again. Size is the test (a trim or a re-encode changes it); an asset the
     * listing does not name, or no listing, is never called stale.
     */
    private fun isStale(url: String, e: Entry, listings: Map<String, Map<String, Long>>): Boolean {
        val (tag, asset) = splitRelease(url) ?: return false
        val size = listings[tag]?.get(asset) ?: return false
        return size > 0L && size != e.bytes
    }

    /**
     * A download just landed with [bytes]: those are the release's bytes now, newer than any listing held. A listing
     * cached before a re-upload would otherwise call the fresh file stale, and Update could never clear it (the
     * refutation of s3r chunk 2).
     */
    private fun noteLanded(url: String, bytes: Long) {
        val (tag, asset) = splitRelease(url) ?: return
        synchronized(sizeLock) {
            val hit = sizeCache[tag] ?: return
            val held = hit.second[asset] ?: return
            if (held == bytes) return
            sizeCache[tag] = hit.first to (hit.second + (asset to bytes))
            persistSizes()
        }
    }

    /** One HEAD from [tag]'s budget: [MAX_HEADS_PER_TAG] per [LISTING_RETRY_MS] window, whatever the calls. */
    private fun takeHead(tag: String): Boolean = synchronized(sizeLock) {
        val now = clock()
        val (start, n) = headsSpent[tag]?.takeIf { now - it.first < LISTING_RETRY_MS } ?: (now to 0)
        if (n >= MAX_HEADS_PER_TAG) { headsSpent[tag] = start to n; return false }
        headsSpent[tag] = start to (n + 1)
        true
    }

    private fun listingFor(tag: String, ttl: Long = SIZE_TTL): Map<String, Long>? {
        synchronized(sizeLock) {
            val hit = sizeCache[tag]
            if (hit != null && clock() - hit.first < ttl) return hit.second
            // A listing that just failed (no signal, GitHub's 60-an-hour limit) is not asked again for a while.
            val failed = listingFailedAt[tag]
            if (failed != null && clock() - failed < LISTING_RETRY_MS) return hit?.second
        }
        val fresh = try { sizeLister(tag) } catch (_: Exception) { null }
        if (fresh == null) return synchronized(sizeLock) {
            listingFailedAt[tag] = clock()
            sizeCache[tag]?.second   // a stale listing beats none
        }
        synchronized(sizeLock) {
            sizeCache[tag] = clock() to fresh
            persistSizes()
        }
        return fresh
    }

    private fun loadSizes() {
        val text = try { if (sizesFile.isFile) sizesFile.readText() else null } catch (_: Exception) { null } ?: return
        try {
            val tags = JSONObject(text).optJSONObject("tags") ?: return
            for (tag in tags.keys()) {
                if (!TAG_RE.matches(tag)) continue
                val o = tags.optJSONObject(tag) ?: continue
                val assets = o.optJSONObject("assets") ?: continue
                val m = HashMap<String, Long>()
                for (name in assets.keys()) { val n = assets.optLong(name, -1L); if (n > 0L && ASSET_RE.matches(name)) m[name] = n }
                sizeCache[tag] = o.optLong("at") to m
            }
        } catch (e: Exception) {
            Timber.w(e, "offline audio: sizes cache unreadable - asked again")
        }
    }

    /** Called under [sizeLock]. */
    private fun persistSizes() {
        val tags = JSONObject()
        for ((tag, v) in sizeCache) {
            val assets = JSONObject()
            for ((name, n) in v.second) assets.put(name, n)
            tags.put(tag, JSONObject().put("at", v.first).put("assets", assets))
        }
        val tmp = File(dir, "sizes.json.tmp")
        try {
            tmp.writeText(JSONObject().put("v", 1).put("tags", tags).toString())
            Files.move(tmp.toPath(), sizesFile.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (e: Exception) {
            Timber.w(e, "offline audio: sizes cache write failed")
        }
    }

    // ── the page's JSON (AppInterface hands it over untouched; untrusted, a bad shape is a quiet no-op) ──

    /** `[{url, key, title, update?, bytes?, wifi?, pri?}, ...]`: download each (at most [MAX_BATCH] per call; the page chunks). */
    fun enqueueJson(json: String?) {
        val arr = parseArray(json) ?: return
        val items = ArrayList<Item>()
        for (i in 0 until minOf(arr.length(), MAX_BATCH)) {
            val o = arr.optJSONObject(i) ?: continue
            val url = o.optString("url")
            val bytes = o.optLong("bytes", -1L).takeIf { it in 1L..MAX_BYTES } ?: -1L
            val wifi = o.optBoolean("wifi", false)
            if (url.isNotEmpty()) items += Item(url, o.optString("key"), o.optString("title"), o.optBoolean("update", false), bytes,
                wifi, priOf(o.opt("pri"), wifi, url))
        }
        if (items.isNotEmpty()) enqueue(items)
    }

    /** `[url, ...]`, or `["*"]` for everything. */
    fun removeJson(json: String?) {
        val urls = parseUrls(json) ?: return
        if (urls.contains("*")) removeAll() else if (urls.isNotEmpty()) remove(urls)
    }

    /** `[url, ...]`, or `["*"]` for everything. */
    fun cancelJson(json: String?) {
        val urls = parseUrls(json) ?: return
        if (urls.contains("*")) cancelAll() else if (urls.isNotEmpty()) cancel(urls)
    }

    /** The shelf opened: check the recordings on the phone for updates (one 'checked' event back). */
    fun checkSavedJson() { checkSaved() }

    /** `[url, ...]`: look their sizes up (one 'sizes' event back). */
    fun requestSizesJson(json: String?) {
        val urls = parseUrls(json) ?: return
        if (urls.isNotEmpty()) requestSizes(urls)
    }

    private fun parseArray(json: String?): JSONArray? =
        if (json.isNullOrBlank()) null else try { JSONArray(json) } catch (_: Exception) { null }

    private fun parseUrls(json: String?): List<String>? {
        val arr = parseArray(json) ?: return null
        val out = ArrayList<String>()
        for (i in 0 until minOf(arr.length(), MAX_BATCH)) {
            val s = arr.opt(i) as? String ?: continue
            if (s.isNotEmpty()) out += s
        }
        return out
    }

    /** The page's Download only on Wi-Fi switch (AppInterface.offlineAudioWifiOnly; the page pushes it as it renders). */
    fun setWifiOnly(on: Boolean) {
        if (wifiOnly == on) return
        wifiOnly = on
        gateChanged()
        // The job's network rule follows the switch (defect 13): the busy hook schedules it again with the new one.
        if (busy()) busyNow()
    }

    /**
     * The network or the switch changed (MeteredWatch, [setWifiOnly]): what waits looks again, the rows re-read. With a
     * network, the "will try again" list is tried now too (a network coming back is one of its times).
     */
    fun gateChanged() {
        if (runCatching { online() }.getOrDefault(true)) synchronized(lock) { for (w in waits.values) if (w.later || !w.noRoom) w.at = 0L }
        wake()
        send(JSONObject().put("type", "checked").toString())
    }

    /** The network is unmetered now (Wi-Fi): the page queues its automatic downloads only then (dl-d5). */
    fun unmeteredNow(): Boolean = runCatching { unmetered() }.getOrDefault(false)

    /** Downloads wait now: the switch is on and the network is metered. */
    fun waiting(): Boolean = wifiOnly && !runCatching { unmetered() }.getOrDefault(false)

    /** Pause all (the page's Pause, the notification's): those on their way stop and keep their bytes. Survives a restart. */
    fun pause() {
        synchronized(lock) {
            if (paused) return
            paused = true
            persistQueue()
        }
        gateChanged()
    }

    /** Resume all: the queue goes on from where it stopped. */
    fun resume() {
        val busy = synchronized(lock) {
            if (!paused) return
            paused = false
            persistQueue()
            pending.isNotEmpty()
        }
        gateChanged()
        if (busy) busyNow()
    }

    /** Retry now: every one on the "will try again" list (and every wait) is tried at once. */
    fun retryNow() {
        synchronized(lock) {
            for ((url, w) in waits) {
                w.at = 0L; w.noRoom = false
                if (w.later) { w.later = false; w.tries = 0; if (!isSong(url) && batchFailed > 0) batchFailed-- }
            }
            persistQueue()
        }
        wake()
        busyNow()
        send(JSONObject().put("type", "checked").toString())
    }

    fun isPaused(): Boolean = paused

    /** Something is queued, downloading or on the "will try again" list. */
    fun busy(): Boolean = synchronized(lock) { pending.isNotEmpty() }

    /** Why the queue is not moving now (paused, wifi, offline, space, retrying, later), or null when it is, or is empty. */
    fun reasonNow(): String? = synchronized(lock) { reasonNowLocked() }

    /** The batch for the notification (DownloadJobService). */
    fun summary(): Summary {
        val listings = synchronized(sizeLock) { sizeCache.mapValues { it.value.second } }
        return synchronized(lock) {
            var bytes = 0L
            var total = 0L
            for (a in actives.values) { bytes += a.bytes; if (a.total > 0L) total += a.total }
            val live = queued.filter { waits[it]?.later != true } + actives.keys
            val onlyLater = pending.isNotEmpty() && live.isEmpty()
            val autoOnly = live.isNotEmpty() && live.all { pending[it]?.wifi == true }
            Summary(pending.isNotEmpty(), paused, reasonNowLocked(), batchDone, batchTotal, batchFailed,
                bytes, if (actives.isEmpty()) -1L else total, leftLocked(listings).first, wifiOnly, onlyLater, wifiOnly || autoOnly)
        }
    }

    private fun isLaterLocked(url: String): Boolean = waits[url]?.later == true

    private fun reasonNowLocked(): String? = when {
        pending.isEmpty() -> null
        actives.isEmpty() && queued.all { isLaterLocked(it) } -> "later"
        paused -> "paused"
        waiting() -> "wifi"
        actives.isNotEmpty() -> null
        else -> holdReason
    }

    /** (bytes still to download that are known, how many have no known size) over what is waiting or on its way. Called under [lock]. */
    private fun leftLocked(listings: Map<String, Map<String, Long>>): Pair<Long, Int> {
        var bytes = 0L
        var unknown = 0
        for ((url, item) in pending) {
            if (isLaterLocked(url)) continue
            val a = actives[url]
            val size = item.bytes.takeIf { it > 0L } ?: splitRelease(url)?.let { (tag, asset) -> listings[tag]?.get(asset) }
                ?: (if (a != null && a.total > 0L) a.total else null)
            if (size == null) { unknown++; continue }
            bytes += if (a != null) maxOf(0L, size - a.bytes) else size
        }
        return bytes to unknown
    }

    private fun busyNow() = try { onBusy(this) } catch (e: Exception) { Timber.w(e, "offline audio: the busy hook threw") }

    /** Something changed (a network, a removal, Resume, a new download): start what may start. */
    private fun wake() = ensureWorkers()

    /** The worker holds while paused or waiting for Wi-Fi. */
    private fun holding(): Boolean = paused || waiting()

    /** True when [url] is on the phone (whole, indexed). */
    fun isSaved(url: String): Boolean = synchronized(lock) { entries.containsKey(url) }

    /** The downloaded file for [url], or null when it is not on the phone (m3: the native player reads it directly). */
    fun fileFor(url: String): File? {
        val e = synchronized(lock) { entries[url] } ?: return null
        return File(dir, e.file).takeIf { it.isFile && it.length() > 0L }
    }

    /** A new batch: nothing is waiting or on its way (the "will try again" list stays its own). Called under [lock]. */
    private fun startBatchIfIdleLocked() {
        if (actives.isNotEmpty() || queued.any { !isLaterLocked(it) }) return
        batchTotal = 0; batchDone = 0; batchFailed = 0; batchBytes = 0L; batchDoneBytes = 0L
    }

    /**
     * Queue [items] (skipping any not from the audio releases or already on the phone). One already waiting is asked
     * again: its wait ends (one on the "will try again" list is tried now), it moves up to the higher priority, and
     * the listener's own lifts an automatic one off Wi-Fi (dl-d5).
     */
    fun enqueue(items: List<Item>) {
        val fresh = ArrayList<Item>()
        var moved = false
        synchronized(lock) {
            startBatchIfIdleLocked()
            for (item in items) {
                fileNameFor(item.url) ?: continue
                val had = pending[item.url]
                if (had != null) {
                    var next = had
                    if (had.wifi && !item.wifi) next = next.copy(wifi = false)
                    if (item.pri < next.pri) next = next.copy(pri = item.pri)
                    if (next != had) pending[item.url] = next
                    waits[item.url]?.let { w ->
                        if (w.later) { w.later = false; w.tries = 0; if (!isSong(item.url) && batchFailed > 0) batchFailed-- }
                        w.at = 0L; w.noRoom = false
                    }
                    moved = true
                    continue
                }
                if (entries.containsKey(item.url) && !item.update) continue
                pending[item.url] = item
                queued.add(item.url)
                seqs[item.url] = nextSeq++
                fresh += item
                if (!isSong(item.url)) { batchTotal++; if (item.bytes > 0L) batchBytes += item.bytes }
            }
            if (fresh.isNotEmpty() || moved) persistQueue()
        }
        if (fresh.isEmpty() && !moved) return
        busyNow()
        // One event for the batch, before any worker starts on it: a Download all of 150 re-drew the screen 150 times
        // (sweep n2-03). `url` names the first, for a page that reads only that.
        if (fresh.isNotEmpty()) {
            send(JSONObject().put("type", "queued").put("url", fresh[0].url).put("urls", JSONArray(fresh.map { it.url })).toString())
        }
        // Download only on Wi-Fi: held on a metered network, the rows re-read the state and say Waiting for Wi-Fi.
        if (waiting() || (moved && fresh.isEmpty())) send(JSONObject().put("type", "checked").toString())
        ensureWorkers()
    }

    /**
     * Stop [urls]: one still waiting (or on the "will try again" list) comes off the queue at once (and says so); one
     * downloading stops at its next chunk.
     */
    fun cancel(urls: List<String>) {
        val dropped = ArrayList<String>()
        synchronized(lock) {
            for (u in urls) {
                if (queued.remove(u)) { dropped += u; dropPendingLocked(u, counted = false) }
                else if (actives.containsKey(u)) cancelled.add(u)
            }
            if (dropped.isNotEmpty()) persistQueue()
        }
        for (u in dropped) send(event("cancelled", u).toString())
        if (dropped.isNotEmpty()) wake()
    }

    /** Stop everything queued, downloading or on the "will try again" list. */
    fun cancelAll() {
        val dropped: List<String>
        synchronized(lock) {
            dropped = queued.toList()
            queued.clear()
            for (u in dropped) dropPendingLocked(u, counted = false)
            cancelled.addAll(actives.keys)
            persistQueue()
        }
        for (u in dropped) send(event("cancelled", u).toString())
        wake()
    }

    /**
     * [url] leaves the saved queue (done, or cancelled while not on its way: [counted] false takes it off the batch's
     * total). Its resumable bytes go with it, unless it is on its way, whose worker owns them. Called under [lock].
     */
    private fun dropPendingLocked(url: String, counted: Boolean) {
        if (pending.remove(url) == null) return
        val w = waits.remove(url)
        seqs.remove(url)
        if (!isSong(url)) {
            if (!counted && batchTotal > 0) batchTotal--
            if (w?.later == true && batchFailed > 0) batchFailed--
        }
        if (resumes.containsKey(url) && !actives.containsKey(url)) {
            setResumeLocked(url, null)
            fileNameFor(url)?.let { File(dir, it + PART).delete() }
        }
    }

    /** Take [urls] off the phone (file and index entry), and stop an update of any of them on its way. */
    fun remove(urls: List<String>) {
        cancel(urls)
        val gone = ArrayList<String>()
        val files = ArrayList<String>()
        synchronized(lock) {
            for (u in urls) {
                val e = entries.remove(u) ?: continue
                files.add(e.file)
                gone.add(u)
            }
            if (gone.isNotEmpty()) persist()
        }
        for (f in files) File(dir, f).delete()
        if (gone.isNotEmpty()) {
            send(JSONObject().put("type", "removed").put("urls", JSONArray(gone)).toString())
            roomMade()
        }
    }

    /** Room was made: what waited for space looks again now. */
    private fun roomMade() {
        synchronized(lock) { for (w in waits.values) if (w.noRoom) { w.noRoom = false; w.at = 0L } }
        wake()
    }

    /** Take every downloaded recording off the phone, and stop what is still queued or downloading. */
    fun removeAll() {
        cancelAll()
        val files: List<String>
        synchronized(lock) {
            files = entries.values.map { it.file }
            entries.clear()
            persist()
        }
        for (f in files) File(dir, f).delete()
        send(JSONObject().put("type", "removed").put("all", true).toString())
    }

    /** The waiting ones in the order they start: by priority, then as asked. Called under [lock]. */
    private fun orderedLocked(): List<String> =
        queued.sortedWith(compareBy<String>({ pending[it]?.pri ?: PRI_BULK }, { seqs[it] ?: Long.MAX_VALUE }))

    /** Everything the shelf and the rows need, as one JSON object. */
    fun stateJson(): String {
        val listings = synchronized(sizeLock) { sizeCache.mapValues { it.value.second } }
        return synchronized(lock) { stateJsonLocked(listings) }
    }

    private fun stateJsonLocked(listings: Map<String, Map<String, Long>>): String {
        val items = JSONArray()
        var total = 0L
        for ((url, e) in entries) {
            val o = JSONObject().put("url", url).put("key", e.key).put("title", e.title).put("bytes", e.bytes).put("savedAt", e.savedAt)
            if (isStale(url, e, listings)) o.put("stale", true)
            items.put(o)
            total += e.bytes
        }
        val (leftBytes, unknown) = leftLocked(listings)
        val order = orderedLocked()
        val waitingNow = order.filter { !isLaterLocked(it) }
        val activeList = JSONArray()
        val queue = JSONArray()
        for (a in actives.values) {
            activeList.put(JSONObject().put("url", a.url).put("bytes", a.bytes).put("total", a.total))
            pending[a.url]?.let { queue.put(brief(it)) }
        }
        for (u in waitingNow) pending[u]?.let { queue.put(brief(it)) }
        val later = JSONArray()
        for (u in order) {
            val w = waits[u] ?: continue
            if (!w.later) continue
            val it = pending[u] ?: continue
            later.put(brief(it).put("reason", w.reason).put("status", w.status).put("tries", w.tries).put("at", w.at))
        }
        val first = actives.values.firstOrNull()
        val reason = reasonNowLocked()
        return JSONObject()
            .put("items", items)
            .put("totalBytes", total)
            .put("freeBytes", runCatching { freeBytes() }.getOrDefault(-1L))
            .put("active", if (first == null) JSONObject.NULL else JSONObject().put("url", first.url).put("bytes", first.bytes).put("total", first.total))
            .put("actives", activeList)
            .put("queued", JSONArray(waitingNow))
            .put("queue", queue)
            .put("later", later)
            .put("waiting", (waitingNow.isNotEmpty() || actives.isNotEmpty()) && waiting())
            // dl-d2: the saved queue's own words (BRIDGE.md).
            .put("paused", paused)
            .put("reason", reason ?: JSONObject.NULL)
            .put("need", if (reason == "space") needLocked(listings) else 0L)
            .put("closedRuns", runsClosed)
            .put("left", JSONObject().put("count", waitingNow.size + actives.size).put("bytes", leftBytes).put("unknown", unknown))
            .put("batch", JSONObject().put("done", batchDone).put("total", batchTotal).put("failed", batchFailed)
                .put("bytes", maxOf(batchBytes, batchDoneBytes)).put("doneBytes", batchDoneBytes))
            .toString()
    }

    private fun brief(it: Item): JSONObject =
        JSONObject().put("url", it.url).put("key", it.key).put("title", it.title).put("pri", it.pri)

    /** A waiting one's size: the page's, the listing's, or its kept bytes' declared total; -1 unknown. Called under [lock]. */
    private fun sizeOfLocked(url: String, item: Item, listings: Map<String, Map<String, Long>>?): Long =
        item.bytes.takeIf { it > 0L }
            ?: resumes[url]?.total?.takeIf { it > 0L }
            ?: listings?.let { l -> splitRelease(url)?.let { (tag, asset) -> l[tag]?.get(asset) } }
            ?: -1L

    /** The bytes the downloads on their way still need. Called under [lock]. */
    private fun reservedLocked(except: String? = null): Long {
        var n = 0L
        for (a in actives.values) {
            if (a.url == except) continue
            val total = if (a.total > 0L) a.total else pending[a.url]?.bytes ?: -1L
            if (total > 0L) n += maxOf(0L, total - a.bytes)
        }
        return n
    }

    /** How much more room the smallest waiting one needs before it fits (0: none known). Called under [lock]. */
    private fun needLocked(listings: Map<String, Map<String, Long>>): Long {
        val free = runCatching { freeBytes() }.getOrDefault(-1L)
        if (free < 0L) return 0L
        val room = free - SPACE_MARGIN - reservedLocked()
        var best = 0L
        for (u in queued) {
            if (isLaterLocked(u)) continue
            val item = pending[u] ?: continue
            val size = sizeOfLocked(u, item, listings)
            if (size <= 0L) continue
            val short = size - (resumes[u]?.synced ?: 0L) - room
            if (short > 0L && (best == 0L || short < best)) best = short
        }
        return best
    }

    /**
     * The WebView's request for [url]: a downloaded recording answered from disk (200 whole, 206 for a Range, 416
     * past the end); anything else null, so the WebView loads it exactly as before. Called on a WebView background
     * thread.
     *
     * WebView cuts the Range ITSELF from the stream it is handed (Chromium input_stream_reader.cc: the size from
     * available(), the bounds from the request's Range, a skip to the first byte, then a read to the end of the
     * stream), and it sets Content-Length. So the answer is the file from byte 0, capped after the range's last byte,
     * with the 206 status and Content-Range; a body cut here would be cut twice (the refutation of 2026-09-24).
     */
    fun intercept(url: String, range: String?): WebResourceResponse? {
        val e = synchronized(lock) { entries[url] } ?: return null
        val f = File(dir, e.file)
        val total = f.length()
        if (!f.isFile || total <= 0L) return null
        return try {
            when (val r = parseRange(range, total)) {
                RangeAnswer.Full -> WebResourceResponse(MIME, null, 200, "OK", baseHeaders(), FileInputStream(f))
                is RangeAnswer.Part -> WebResourceResponse(MIME, null, 206, "Partial Content",
                    baseHeaders() + ("Content-Range" to "bytes ${r.start}-${r.end}/$total"),
                    Capped(FileInputStream(f), r.end + 1))
                RangeAnswer.Unsatisfiable -> WebResourceResponse(MIME, null, 416, "Range Not Satisfiable",
                    baseHeaders() + ("Content-Range" to "bytes */$total"), ByteArrayInputStream(ByteArray(0)))
            }
        } catch (ex: Exception) {
            Timber.w(ex, "offline audio: serving %s failed - the WebView loads it itself", url)
            null
        }
    }

    // ── download ──────────────────────────────────────────────────────

    /** Start workers up to [PARALLEL] while something waits. A worker leaves when nothing more can start ([takeNext]). */
    private fun ensureWorkers() {
        val n = synchronized(lock) {
            if (queued.isEmpty()) 0
            else maxOf(0, minOf(PARALLEL, queued.size) - workers).also { workers += it }
        }
        repeat(n) {
            try { executor.execute { work() } } catch (e: Exception) {
                // An executor shut down (the process is going): the saved queue picks it up at the next start.
                synchronized(lock) { workers-- }
                Timber.w(e, "offline audio: a worker could not start")
            }
        }
    }

    /** One worker: take the next download that may start, run it, again; leave when none may start now. */
    private fun work() {
        var left = false
        try {
            while (true) {
                val next = takeNext()
                if (next == null) { left = true; break }
                runOne(next.first, next.second)
            }
        } catch (e: Throwable) {
            Timber.w(e, "offline audio: a worker stopped")
        } finally {
            // takeNext counted this worker out when it found nothing; any other way out counts it out here.
            if (!left) synchronized(lock) { workers-- }
        }
    }

    /**
     * The next download that may start now, made active: the first waiting one by priority that is due, allowed on this
     * network and fits; or null, with the worker counted out and [holdReason] saying why (a timer set to look again).
     */
    private fun takeNext(): Pair<Item, Active>? {
        val listings = synchronized(sizeLock) { sizeCache.mapValues { it.value.second } }
        var event: String? = null
        var lookAgain = -1L
        val picked = synchronized(lock) {
            val before = holdReason
            if (paused || waiting()) {
                workers--
                if (!paused) lookAgain = GATE_RECHECK_MS
                return@synchronized null
            }
            val now = clock()
            val free = runCatching { freeBytes() }.getOrDefault(-1L)
            val room = if (free < 0L) Long.MAX_VALUE else free - SPACE_MARGIN - reservedLocked()
            var space = false
            var retry = false
            var wifi = false
            var soonest = Long.MAX_VALUE
            var pick: String? = null
            for (url in orderedLocked()) {
                val item = pending[url] ?: continue
                val w = waits[url]
                if (w != null && w.at > now) {
                    soonest = minOf(soonest, w.at)
                    if (w.noRoom) space = true else if (!w.later) retry = true
                    continue
                }
                if (item.wifi && !unmeteredNow()) { wifi = true; continue }
                val size = sizeOfLocked(url, item, listings)
                // Known not to fit: stepped over; the next one may.
                if (size > 0L && size - (resumes[url]?.synced ?: 0L) > room) { space = true; continue }
                pick = url
                break
            }
            if (pick != null && !runCatching { online() }.getOrDefault(true)) {
                holdReason = "offline"
                if (before != "offline") event = "offline"
                lookAgain = OFFLINE_RECHECK_MS
                workers--
                return@synchronized null
            }
            if (pick != null) {
                val url: String = pick
                queued.remove(url)
                cancelled.remove(url)
                waits[url]?.noRoom = false
                val act = Active(url)
                actives[url] = act
                holdReason = null
                if (soonest != Long.MAX_VALUE) lookAgain = maxOf(0L, soonest - now)
                return@synchronized pending[url]!! to act
            }
            holdReason = when {
                space -> "space"
                retry -> "retrying"
                wifi -> "wifi"
                queued.isNotEmpty() -> "later"
                else -> null
            }
            if (holdReason == "space" && before != "space" && actives.isEmpty()) event = "space"
            lookAgain = when {
                space -> minOf(SPACE_RECHECK_MS, if (soonest == Long.MAX_VALUE) SPACE_RECHECK_MS else maxOf(0L, soonest - now))
                soonest != Long.MAX_VALUE -> maxOf(0L, soonest - now)
                wifi -> GATE_RECHECK_MS
                else -> -1L
            }
            workers--
            null
        }
        event?.let { send(JSONObject().put("type", "waiting").put("url", "").put("reason", it).toString()) }
        if (lookAgain >= 0L) arm(lookAgain)
        return picked
    }

    /** Look again in [ms] (one timer at a time: the earliest asked wins). */
    private fun arm(ms: Long) {
        val at = clock() + ms
        synchronized(lock) {
            if (at >= armedAt) return
            armedAt = at
        }
        try {
            timer(ms) {
                synchronized(lock) { if (armedAt <= clock() + TIMER_SLACK_MS) armedAt = Long.MAX_VALUE }
                ensureWorkers()
            }
        } catch (e: Exception) {
            synchronized(lock) { armedAt = Long.MAX_VALUE }
            Timber.w(e, "offline audio: the timer could not be set")
        }
    }

    /** Run one download made active by [takeNext], and put it back when it did not land. */
    private fun runOne(item: Item, act: Active) {
        val name = fileNameFor(item.url)
        val out = if (name == null) Outcome.Failed("network") else attempt(item, name, act)
        when (out) {
            Outcome.Finished, Outcome.Held -> Unit
            Outcome.Space -> {
                synchronized(lock) {
                    if (pending.containsKey(item.url)) waits.getOrPut(item.url) { Wait() }.apply { noRoom = true; at = clock() + SPACE_RECHECK_MS }
                }
                arm(SPACE_RECHECK_MS)
            }
            is Outcome.Failed -> {
                // No network at all: it waits for one (a network change wakes it); that spends no retry.
                if ((out.reason == "network" || out.reason == "short") && !runCatching { online() }.getOrDefault(true)) return
                failed(item.url, out.reason, out.status, quick = true)
            }
        }
    }

    /**
     * [url] failed: a quick retry while [retryDelays] last (with [quick]), then the "will try again" list with growing
     * gaps ([laterDelays]). Never dropped. The page hears 'waiting' (retrying), or 'failed' once it joins the list.
     */
    private fun failed(url: String, reason: String, status: Int, quick: Boolean) {
        val wait: Long
        val kind: Int   // 1: a quick retry; 2: onto the "will try again" list; 3: on it already, a longer gap
        synchronized(lock) {
            if (!pending.containsKey(url)) return
            val w = waits.getOrPut(url) { Wait() }
            if (!quick) w.tries = maxOf(w.tries, retryDelays.size)
            w.tries++
            w.reason = reason
            w.status = status
            w.noRoom = false
            if (w.tries <= retryDelays.size) {
                kind = 1
                wait = retryDelays[w.tries - 1]
            } else {
                kind = if (w.later) 3 else 2
                w.later = true
                wait = laterDelays[minOf(w.tries - retryDelays.size - 1, laterDelays.size - 1)]
                if (kind == 2 && !isSong(url)) batchFailed++
            }
            w.at = clock() + wait
            persistQueue()
        }
        when (kind) {
            1 -> send(event("waiting", url).put("reason", "retrying").toString())
            2 -> {
                val e = event("failed", url).put("reason", reason)
                if (status > 0) e.put("status", status)
                send(e.toString())
            }
            else -> send(JSONObject().put("type", "checked").toString())
        }
        arm(wait)
    }

    /**
     * One try at [item]. Finished: done or cancelled (its event sent), or moved to the "will try again" list. Held,
     * Space, Failed: it is queued again with its bytes kept for a resume, unless a cancel landed meanwhile (then
     * Finished).
     */
    private fun attempt(item: Item, name: String, act: Active): Outcome {
        val part = File(dir, name + PART)
        var failReason = "network"
        var keepPart = false
        var opened: Opened? = null
        try {
            if (cancelled.contains(item.url)) return cancelledNow(item.url, act)
            val held = synchronized(lock) { resumes[item.url] }?.takeIf { part.isFile }
            var from = if (held != null) part.length() else 0L
            if (held == null || (held.total > 0L && from > held.total)) { part.delete(); from = 0L }
            if (from == 0L) setResume(item.url, null)
            if (held != null && from > 0L && from == held.total) {
                // Every byte was on disk when it stopped (a kill between the last byte and the move).
                return land(item, name, part, from, act)
            }
            val others = synchronized(lock) { reservedLocked(except = item.url) }
            val known = held?.total?.takeIf { it > 0L } ?: item.bytes
            if (known > 0L && known - from + SPACE_MARGIN + others > freeBytes()) { keepPart = from > 0L; return requeue(item.url, act, Outcome.Space) }
            opened = try {
                if (from > 0L) rangeOpener(item.url, from, held?.etag) else opener(item.url)
            } catch (e: ServerAnswer) {
                keepPart = from > 0L
                return requeue(item.url, act, Outcome.Failed("server", e.status))
            }
            if (opened == null) { keepPart = from > 0L; return requeue(item.url, act, Outcome.Failed("network")) }
            if (from > 0L && opened.start != from) {
                // The server sent the whole file (the ETag changed, or it ignored the Range): the bytes held go, and
                // this answer is the download from the top. One that starts anywhere else is asked again whole.
                part.delete(); setResume(item.url, null); from = 0L
                if (opened.start != 0L) {
                    try { opened.onClose() } catch (_: Exception) { }
                    opened = opener(item.url) ?: return requeue(item.url, act, Outcome.Failed("network"))
                }
            }
            if (from > 0L && held!!.total > 0L && opened.size != held.total) {
                // The file is another size now: the bytes held are not a part of it. Start again from the top.
                try { opened.onClose() } catch (_: Exception) { }
                part.delete(); setResume(item.url, null); from = 0L
                opened = opener(item.url) ?: return requeue(item.url, act, Outcome.Failed("network"))
            }
            if (opened.start != 0L && opened.start != from) return requeue(item.url, act, Outcome.Failed("network"))
            val size = opened.size
            act.total = size
            act.bytes = from
            if (size > MAX_BYTES) return failLater(item.url, act, "size")
            if (size > 0 && size - from + SPACE_MARGIN + others > freeBytes()) { keepPart = from > 0L; return requeue(item.url, act, Outcome.Space) }
            setResume(item.url, Resume(item.url, size, opened.etag, from))
            send(progress(act).toString())
            var total = from
            var synced = from
            var lastEmit = clock()
            try {
                FileOutputStream(part, from > 0L).use { out ->
                    opened.stream.use { input ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            if (cancelled.contains(item.url)) return cancelledNow(item.url, act)
                            if (holding()) { out.fd.sync(); setResume(item.url, Resume(item.url, size, opened.etag, total)); throw Held() }
                            val n = input.read(buf)
                            if (n < 0) break
                            total += n
                            if (total > MAX_BYTES) return failLater(item.url, act, "size")
                            out.write(buf, 0, n)
                            act.bytes = total
                            if (total - synced >= SYNC_EVERY) {
                                // What a power cut could lose is what came after the last sync: resume.json says how far
                                // the bytes are safe, and a restart cuts the .part back to it.
                                out.fd.sync(); synced = total; setResume(item.url, Resume(item.url, size, opened.etag, total))
                            }
                            val now = clock()
                            if (now - lastEmit >= PROGRESS_MS) { lastEmit = now; send(progress(act).toString()) }
                        }
                        out.fd.sync()
                    }
                }
            } catch (e: IOException) {
                keepPart = true
                // A full disk is a wait for room, never a network failure to retry.
                return requeue(item.url, act,
                    if (runCatching { freeBytes() }.getOrDefault(Long.MAX_VALUE) < SPACE_MARGIN) Outcome.Space else Outcome.Failed("network"))
            }
            if (size > 0 && total < size) { keepPart = true; failReason = "short"; return requeue(item.url, act, Outcome.Failed(failReason)) }   // the answer ended early
            if (total <= 0L || (size > 0 && total != size)) return failLater(item.url, act, "short")
            // A chunked answer declared no length: its room is checked now, before the move.
            if (size <= 0 && freeBytes() < SPACE_MARGIN) return requeue(item.url, act, Outcome.Space)
            return land(item, name, part, total, act)
        } catch (_: Held) {
            // Paused or stopped for a metered network: back in the queue with its bytes (a cancel that landed
            // meanwhile wins); a worker goes on from them once the gate opens.
            keepPart = true
            return requeue(item.url, act, Outcome.Held)
        } catch (e: Exception) {
            Timber.w(e, "offline audio: download of %s failed", item.url)
            keepPart = part.isFile && synchronized(lock) { resumes.containsKey(item.url) }
            return requeue(item.url, act, Outcome.Failed(failReason))
        } finally {
            val kept = synchronized(lock) { resumes.containsKey(item.url) }
            if (!keepPart || !kept) {
                if (part.exists()) part.delete()
                if (kept) setResume(item.url, null)
            }
            try { opened?.onClose?.invoke() } catch (_: Exception) { /* release best-effort */ }
            synchronized(lock) { if (actives[item.url] === act) actives.remove(item.url) }
        }
    }

    /** Move a whole [part] of [total] bytes into place and index it; Finished with its event sent. */
    private fun land(item: Item, name: String, part: File, total: Long, act: Active): Outcome {
        val target = File(dir, name)
        // Cancel and Remove all take this lock too: the last cancellation check, the move into place and the index
        // entry happen under ONE hold of it, so neither can land in between. A Remove all during the final read or
        // the fsync used to be missed, and the recording came back after the shelf was emptied (the Codex
        // refutation of 2026-09-24, M3).
        var outcome = "done"
        synchronized(lock) {
            if (cancelled.remove(item.url)) outcome = "cancelled"
            else try {
                Files.move(part.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
                entries[item.url] = Entry(name, total, clock(), item.key.take(MAX_TEXT), item.title.take(MAX_TEXT))
                persist()
            } catch (e: Exception) {
                Timber.w(e, "offline audio: could not move %s into place", name)
                outcome = "disk"
            }
            if (outcome == "done") {
                if (!isSong(item.url)) {
                    batchDone++
                    batchDoneBytes += total
                    if (item.bytes <= 0L) batchBytes += total
                    if (waits[item.url]?.later == true && batchFailed > 0) batchFailed--
                    batchTotal = maxOf(batchTotal, batchDone + batchFailed)
                }
                pending.remove(item.url)
                waits.remove(item.url)
                seqs.remove(item.url)
                // An update left listed by a kill would download again (the index cannot tell it is done): write now.
                if (item.update) persistQueue() else persistQueueSoon()
            }
            if (outcome == "cancelled") { dropPendingLocked(item.url, counted = false); persistQueue() }
            if (actives[item.url] === act) actives.remove(item.url)   // before the event: the page re-reads the state on it
            if (resumes.containsKey(item.url)) setResumeLocked(item.url, null)
        }
        if (outcome == "done") noteLanded(item.url, total)
        when (outcome) {
            "done" -> send(event("done", item.url).put("bytes", total).toString())
            "cancelled" -> send(event("cancelled", item.url).toString())
            else -> { requeue(item.url, act, Outcome.Finished); failed(item.url, outcome, 0, quick = false) }
        }
        return Outcome.Finished
    }

    /** The one downloading was cancelled: its bytes go, it leaves the queue. */
    private fun cancelledNow(url: String, act: Active): Outcome {
        synchronized(lock) {
            cancelled.remove(url)
            if (actives[url] === act) actives.remove(url)
            if (resumes.containsKey(url)) setResumeLocked(url, null)
            dropPendingLocked(url, counted = false)
            persistQueue()
        }
        fileNameFor(url)?.let { File(dir, it + PART).delete() }
        send(event("cancelled", url).toString())
        return Outcome.Finished
    }

    /** Back in the queue for [why], in its own place (Finished instead when a cancel landed meanwhile). */
    private fun requeue(url: String, act: Active, why: Outcome): Outcome {
        val again = synchronized(lock) {
            if (actives[url] === act) actives.remove(url)
            if (cancelled.remove(url) || !pending.containsKey(url)) {
                if (resumes.containsKey(url)) setResumeLocked(url, null)
                dropPendingLocked(url, counted = false)
                persistQueue()
                false
            } else {
                queued.add(url)
                true
            }
        }
        if (!again) {
            fileNameFor(url)?.let { File(dir, it + PART).delete() }
            send(event("cancelled", url).toString())
            return Outcome.Finished
        }
        if (why == Outcome.Held) send(JSONObject().put("type", "checked").toString())
        return why
    }

    /** [url] cannot land as it is (too big, cut short): onto the "will try again" list at once, its bytes gone. */
    private fun failLater(url: String, act: Active, reason: String): Outcome {
        synchronized(lock) { if (resumes.containsKey(url)) setResumeLocked(url, null) }
        fileNameFor(url)?.let { File(dir, it + PART).delete() }
        requeue(url, act, Outcome.Finished)
        if (synchronized(lock) { pending.containsKey(url) }) failed(url, reason, 0, quick = false)
        return Outcome.Finished
    }

    /**
     * Every event goes out through here. The observer is MainActivity's sink into its WebView, which a re-created
     * Activity publishes before the WebView exists (and a destroyed one may still hold): an observer that throws must
     * never stop a download, nor escape a worker thread, where an uncaught exception kills the app (the Codex
     * refutation of 2026-09-24, M4). The page re-reads the whole state when it loads, so a lost event costs nothing.
     */
    private fun send(json: String) {
        try { emit(json) } catch (e: Exception) { Timber.w(e, "offline audio: an event could not be delivered") }
    }

    private fun progress(a: Active) = event("progress", a.url).put("bytes", a.bytes).put("total", a.total)

    private fun event(type: String, url: String) = JSONObject().put("type", type).put("url", url)

    // ── index ─────────────────────────────────────────────────────────

    private fun load() {
        val text = try { if (indexFile.isFile) indexFile.readText() else null } catch (e: Exception) { null }
        if (text != null) readIndex(text)
        // A recording on disk that the index does not list (a failed index write, a kill between the move and the
        // write, a torn or missing index) is listed again from its name, so it can still be played and removed.
        var found = false
        dir.listFiles { f -> f.isFile && f.name.endsWith(".mp3") }?.forEach { f ->
            val url = urlForFileName(f.name) ?: return@forEach
            if (entries.containsKey(url) || f.length() <= 0L) return@forEach
            entries[url] = Entry(f.name, f.length(), f.lastModified(), "", f.name.substringAfter("__").removeSuffix(".mp3"))
            found = true
        }
        if (found) persist()
    }

    private fun readIndex(text: String) {
        try {
            val items = JSONObject(text).optJSONObject("items") ?: return
            for (url in items.keys()) {
                val o = items.optJSONObject(url) ?: continue
                val file = o.optString("file")
                val f = File(dir, file)
                // A record whose name does not follow from its URL, or whose file is gone, is dropped.
                if (fileNameFor(url) != file || !f.isFile || f.length() <= 0L) continue
                entries[url] = Entry(file, f.length(), o.optLong("savedAt"), o.optString("key"), o.optString("title"))
            }
        } catch (e: Exception) {
            Timber.w(e, "offline audio: index unreadable - its files are found again from their names")
        }
    }

    /** Called under [lock]. */
    private fun persist() {
        val items = JSONObject()
        for ((url, e) in entries) {
            items.put(url, JSONObject().put("file", e.file).put("bytes", e.bytes).put("savedAt", e.savedAt).put("key", e.key).put("title", e.title))
        }
        val tmp = File(dir, "index.json.tmp")
        try {
            FileOutputStream(tmp).use { out ->
                out.write(JSONObject().put("v", 1).put("items", items).toString().toByteArray(Charsets.UTF_8))
                out.fd.sync()   // on disk before it replaces the index
            }
            Files.move(tmp.toPath(), indexFile.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (e: Exception) {
            Timber.w(e, "offline audio: index write failed - the files are found again at the next start")
        }
    }

    // ── the saved queue (dl-d2; dl-rework: several on their way, the "will try again" list) ──

    /**
     * Read queue.json and resume.json, keep each .part resume.json names (cut back to the bytes it says were synced:
     * what came after may not have reached the disk), sweep every other .part, and queue again what is not on the phone
     * yet. The "will try again" list comes back too, due now: a start is one of its times. A torn or missing file is an
     * empty queue; the recordings themselves are in the index. resume.json from before dl-rework (one object for the one
     * download on its way) is read as a list of one.
     */
    private fun loadQueue() {
        val q = readJsonFile(queueFile)
        val items = ArrayList<Item>()
        val later = HashMap<String, Wait>()
        if (q != null) {
            paused = q.optBoolean("paused", false)
            q.optJSONObject("batch")?.let { b ->
                batchTotal = b.optInt("total").coerceAtLeast(0); batchDone = b.optInt("done").coerceAtLeast(0)
                batchBytes = b.optLong("bytes").coerceAtLeast(0L); batchDoneBytes = b.optLong("doneBytes").coerceAtLeast(0L)
            }
            val arr = q.optJSONArray("items")
            if (arr != null) for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val url = o.optString("url")
                if (fileNameFor(url) == null) continue
                val wifi = o.optBoolean("wifi", false)
                items += Item(url, o.optString("key").take(MAX_TEXT), o.optString("title").take(MAX_TEXT), o.optBoolean("update", false),
                    o.optLong("bytes", -1L).takeIf { it in 1L..MAX_BYTES } ?: -1L, wifi, priOf(o.opt("pri"), wifi, url))
                if (o.optBoolean("later", false)) {
                    later[url] = Wait(tries = o.optInt("tries").coerceAtLeast(retryDelays.size + 1), at = 0L,
                        reason = o.optString("reason").takeIf { it.isNotEmpty() }?.take(16) ?: "network",
                        status = o.optInt("status").coerceIn(0, 999), later = true)
                }
            }
        }
        val listed = items.map { it.url }.toSet()
        val held = HashMap<String, Resume>()
        readJsonFile(resumeFile)?.let { o ->
            val arr = o.optJSONArray("items")
            val list = if (arr != null) (0 until arr.length()).mapNotNull { arr.optJSONObject(it) } else listOf(o)
            for (r in list) {
                val url = r.optString("url")
                if (url !in listed || fileNameFor(url) == null) continue
                held[url] = Resume(url, r.optLong("total", -1L), r.optString("etag").takeIf { it.isNotEmpty() }, r.optLong("synced", 0L).coerceAtLeast(0L))
            }
        }
        val keep = held.keys.mapNotNull { fileNameFor(it)?.plus(PART) }.toSet()
        dir.listFiles { f -> f.name.endsWith(PART) }?.forEach { if (it.name !in keep) runCatching { it.delete() } }
        val kept = HashMap<String, Resume>()
        for ((url, r) in held) {
            val f = File(dir, fileNameFor(url)!! + PART)
            try {
                if (!f.isFile || r.synced <= 0L) { f.delete(); continue }
                if (f.length() > r.synced) RandomAccessFile(f, "rw").use { it.setLength(r.synced) }
                kept[url] = if (f.length() < r.synced) r.copy(synced = f.length()) else r
            } catch (e: Exception) {
                Timber.w(e, "offline audio: a kept .part could not be cut back - it starts again"); f.delete()
            }
        }
        var fresh = 0
        synchronized(lock) {
            resumes.clear()
            resumes.putAll(kept)
            writeResumesLocked()
            for (item in items) {
                if ((entries.containsKey(item.url) && !item.update) || pending.containsKey(item.url)) continue
                pending[item.url] = item
                queued.add(item.url)
                seqs[item.url] = nextSeq++
                later[item.url]?.let { waits[item.url] = it }
                fresh++
            }
            batchFailed = pending.keys.count { waits[it]?.later == true && !isSong(it) }
            batchTotal = maxOf(batchTotal, batchDone + pending.keys.count { !isSong(it) })
            if (fresh != items.size) persistQueue()
        }
        if (fresh == 0) return
        ensureWorkers()
        busyNow()
    }

    /** Write queue.json whole (temp file + atomic move). Called under [lock]. */
    private fun persistQueue() {
        queueWrittenAt = clock()
        val list = JSONArray()
        for (item in pending.values) {
            val o = JSONObject().put("url", item.url).put("key", item.key).put("title", item.title).put("pri", item.pri)
            if (item.update) o.put("update", true)
            if (item.bytes > 0L) o.put("bytes", item.bytes)
            if (item.wifi) o.put("wifi", true)
            waits[item.url]?.takeIf { it.later }?.let { w ->
                o.put("later", true).put("tries", w.tries).put("reason", w.reason)
                if (w.status > 0) o.put("status", w.status)
            }
            list.put(o)
        }
        val json = JSONObject().put("v", 2).put("paused", paused).put("items", list)
            .put("batch", JSONObject().put("total", batchTotal).put("done", batchDone).put("failed", batchFailed)
                .put("bytes", batchBytes).put("doneBytes", batchDoneBytes))
        writeWhole(queueFile, json.toString(), "queue")
    }

    /**
     * A finished download leaves the queue: written at most every [QUEUE_WRITE_MS] while more are left (a whole
     * edition is 1,189 files, its queue.json some hundreds of KB). One left listed by a kill is skipped at the next
     * start: it is in the index. Called under [lock].
     */
    private fun persistQueueSoon() {
        if (pending.isEmpty() || clock() - queueWrittenAt >= QUEUE_WRITE_MS) persistQueue()
    }

    /** One download's resumable bytes (null: none); resume.json follows, written outside the queue's lock. */
    private fun setResume(url: String, r: Resume?) {
        val snap = synchronized(lock) {
            if (r == null) { if (resumes.remove(url) == null) return } else resumes[url] = r
            resumes.values.toList() to ++resumeVersion
        }
        writeResumes(snap.first, snap.second)
    }

    /** Called under [lock] (cancel, land: rare). */
    private fun setResumeLocked(url: String, r: Resume?) {
        if (r == null) { if (resumes.remove(url) == null) return } else resumes[url] = r
        writeResumesLocked()
    }

    /** Called under [lock]. */
    private fun writeResumesLocked() = writeResumes(resumes.values.toList(), ++resumeVersion)

    /**
     * resume.json, whole: every download's kept bytes ({v: 2, items: [...]}); gone when none. Writers on several
     * workers never put an older picture over a newer one ([version]).
     */
    private fun writeResumes(list: List<Resume>, version: Long) {
        synchronized(resumeWriteLock) {
            if (version <= resumeWritten) return
            resumeWritten = version
            if (list.isEmpty()) { resumeFile.delete(); return }
            val arr = JSONArray()
            for (r in list) {
                val o = JSONObject().put("url", r.url).put("total", r.total).put("synced", r.synced)
                if (r.etag != null) o.put("etag", r.etag)
                arr.put(o)
            }
            writeWhole(resumeFile, JSONObject().put("v", 2).put("items", arr).toString(), "resume")
        }
    }

    /** A kept song (K1): it rides the same queue, last, and never counts in the recordings' batch. */
    private fun isSong(url: String): Boolean = splitSong(url) != null

    private fun writeWhole(target: File, text: String, what: String) {
        val tmp = File(dir, target.name + ".tmp")
        try {
            FileOutputStream(tmp).use { out ->
                out.write(text.toByteArray(Charsets.UTF_8))
                out.fd.sync()
            }
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (e: Exception) {
            Timber.w(e, "offline audio: %s write failed", what)
        }
    }

    private fun readJsonFile(f: File): JSONObject? = try {
        if (f.isFile) JSONObject(f.readText()) else null
    } catch (e: Exception) {
        Timber.w(e, "offline audio: %s unreadable - left out", f.name); null
    }

    /**
     * The file from byte 0, ending after byte [cap] - 1: WebView sizes it by available(), skips to the range's first
     * byte with skip(), and reads to its end, so all three respect the cap.
     */
    private class Capped(input: InputStream, private val cap: Long) : FilterInputStream(input) {
        private var pos = 0L

        override fun available(): Int = minOf(super.available().toLong(), maxOf(0L, cap - pos)).toInt()

        override fun read(): Int {
            if (pos >= cap) return -1
            val b = super.read()
            if (b >= 0) pos++
            return b
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (pos >= cap) return -1
            val n = super.read(b, off, minOf(len.toLong(), cap - pos).toInt())
            if (n > 0) pos += n
            return n
        }

        override fun skip(n: Long): Long {
            val k = super.skip(minOf(n, maxOf(0L, cap - pos)))
            if (k > 0) pos += k
            return k
        }

        override fun markSupported(): Boolean = false
    }

    companion object {
        /**
         * Where [shared]'s events go: MainActivity sets it to the JsBridge (JsEvent.OfflineAudio) and clears it in
         * onDestroy (the AudioKeepAliveService.commandSink pattern). Null: the event drops, the download goes on.
         */
        @Volatile
        var eventSink: ((String) -> Unit)? = null

        @Volatile
        private var sharedStore: OfflineAudioStore? = null

        /**
         * The one store per process. Two over one folder would each sweep the other's in-flight .part at start and
         * load diverging indexes, so the Activity (which can be re-created) never builds its own.
         */
        fun shared(context: Context): OfflineAudioStore =
            sharedStore ?: synchronized(this) {
                sharedStore ?: run {
                    val app = context.applicationContext
                    // Download only on Wi-Fi (ra6): the store asks the watch, and each flip wakes a waiting download.
                    val watch = MeteredWatch(app)
                    OfflineAudioStore(app.filesDir, emit = { json -> eventSink?.invoke(json) }, unmetered = watch::unmetered,
                        rangeOpener = ::openReleaseFrom, online = watch::online, retryDelays = RETRY_DELAYS,
                        onBusy = { store -> DownloadJob.schedule(app, store) },
                        runsClosed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
                        .also { store -> sharedStore = store; watch.start { store.gateChanged() } }
                }
            }

        const val DIR_NAME = "offline-audio"
        /** How many recordings download at once (the browser store's DOWNLOADS_AT_ONCE is the same). */
        const val PARALLEL = 3
        /** Priorities, first served first: one the listener tapped by itself, a set, automatic ones and kept songs. */
        const val PRI_TAP = 0
        const val PRI_BULK = 1
        const val PRI_AUTO = 2

        /** The page's "pri" ('tap' | 'bulk' | 'auto', or 0-2); unsaid: automatic for a wifi item or a song, else a set. */
        internal fun priOf(v: Any?, wifi: Boolean, url: String): Int = when {
            wifi || splitSong(url) != null -> PRI_AUTO
            v == "tap" -> PRI_TAP
            v == "auto" -> PRI_AUTO
            v is Number && v.toInt() in PRI_TAP..PRI_AUTO -> v.toInt()
            else -> PRI_BULK
        }

        private val timers: ScheduledExecutorService by lazy {
            Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "offline-audio-timer").apply { isDaemon = true } }
        }

        /** The production timer: one daemon thread for every store's looks again. */
        fun scheduleLater(ms: Long, task: () -> Unit) {
            timers.schedule({ try { task() } catch (e: Exception) { Timber.w(e, "offline audio: a timed look threw") } }, ms, TimeUnit.MILLISECONDS)
        }
        private const val PART = ".part"
        private const val MIME = "audio/mpeg"
        private const val PREFIX = "https://github.com/VOTReader/votreader-assets/releases/download/"
        private val TAG_RE = Regex("^audio-[a-z0-9-]+$")
        private val ASSET_RE = Regex("^[A-Za-z0-9_-]+\\.mp3$")

        // The largest recording on the releases is a 256 MB whole-book file (audio-bible-v1, 2026-09-24).
        private const val MAX_BYTES = 400L * 1024 * 1024
        // Room kept free on the phone beyond the recording itself.
        private const val SPACE_MARGIN = 200L * 1024 * 1024
        private const val PROGRESS_MS = 500L
        /** A waiting download re-checks the gate this often even unwoken (a lost network callback costs one wait). */
        private const val GATE_RECHECK_MS = 5_000L
        /** A timer that fires this early still counts as the one set. */
        private const val TIMER_SLACK_MS = 50L
        private const val MAX_TEXT = 240

        // The release host and the asset hosts its 302 goes to (GardenImageCache's allowlist), and the Songs of the
        // Letters shard sites (GitHub Pages, answered directly).
        private val ALLOWED_HOSTS = setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "votreader.github.io")

        // Songs of the Letters kept on this phone (K1): one mp3 on a shard site, the page's exact trust pattern
        // (utils/audio-track.js SONG_URL). ExoPlayer reads a kept song from its file under the same URL.
        private const val SONGS_ORIGIN = "https://votreader.github.io/"
        private val SONG_RE = Regex("^https://votreader\\.github\\.io/(songs-[0-9]{1,3})/([0-9a-f]{12}\\.mp3)$")
        private const val MAX_REDIRECTS = 5
        private const val HTTP_RANGE_NOT_SATISFIABLE = 416
        private const val USER_AGENT = "VOTReader-Android/1.0"

        // Sizes: a week-old listing is asked again; one ask covers at most a big collection or book.
        private const val SIZE_TTL = 7L * 24 * 3600 * 1000
        /** How old a listing may be when the shelf checks the recordings on the phone for updates. */
        private const val CHECK_TTL = 6L * 3600 * 1000
        private const val MAX_SIZE_BATCH = 400
        // One call from the page: the page sends 400 at a time (an older shell took no more), a whole edition is
        // 1,189 files; a call past this is cut here and the page's next state read shows what was queued.
        private const val MAX_BATCH = 2000
        /** The bytes a power cut can cost a resumed download: the .part is synced and resume.json written this often. */
        private const val SYNC_EVERY = 4L * 1024 * 1024
        /** A download waiting for room looks again this often (a removal looks at once). */
        private const val SPACE_RECHECK_MS = 30_000L
        /** A download that failed with no network looks again this often (a network change looks at once). */
        private const val OFFLINE_RECHECK_MS = 60_000L
        private const val QUEUE_WRITE_MS = 3_000L
        /** The app's quick retries of a failed download, each from its bytes: three, then the "will try again" list. */
        val RETRY_DELAYS = listOf(5_000L, 20_000L, 60_000L)
        /** The "will try again" list's gaps: growing, capped at 30 min (the last repeats). */
        val LATER_DELAYS = listOf(2L * 60_000, 5L * 60_000, 10L * 60_000, 20L * 60_000, 30L * 60_000)
        private const val MAX_HEADS_PER_TAG = 40
        private const val LISTING_RETRY_MS = 10L * 60 * 1000
        private const val MAX_LISTING_BYTES = 8L * 1024 * 1024
        private const val API_RELEASE_BY_TAG = "https://api.github.com/repos/VOTReader/votreader-assets/releases/tags/"

        /** (tag, asset) of one of the app's audio releases; null for anything else. */
        private fun splitRelease(url: String): Pair<String, String>? {
            if (!url.startsWith(PREFIX)) return null
            val rest = url.substring(PREFIX.length)
            val slash = rest.indexOf('/')
            if (slash <= 0) return null
            val tag = rest.substring(0, slash)
            val asset = rest.substring(slash + 1)
            if (!TAG_RE.matches(tag) || !ASSET_RE.matches(asset)) return null
            return tag to asset
        }

        /** (site, asset) of one Songs of the Letters mp3 on a shard site; null for anything else. */
        private fun splitSong(url: String): Pair<String, String>? =
            SONG_RE.matchEntire(url)?.let { it.groupValues[1] to it.groupValues[2] }

        /** The URL a stored file name came from (the inverse of [fileNameFor]); null for any other name. */
        internal fun urlForFileName(name: String): String? {
            val at = name.indexOf("__")   // neither a tag nor a song site holds '_', so the first "__" is the joint
            if (at <= 0) return null
            val head = name.substring(0, at)
            val base = if (head.startsWith("songs-")) SONGS_ORIGIN else PREFIX
            val url = base + head + "/" + name.substring(at + 2)
            return if (fileNameFor(url) == name) url else null
        }

        /** `<tag>__<asset>.mp3` for one of the app's audio releases, `songs-<n>__<id>.mp3` for a kept song; null for anything else. */
        fun fileNameFor(url: String): String? =
            (splitRelease(url) ?: splitSong(url))?.let { (tag, asset) -> "${tag}__$asset" }

        /** The production lister: GitHub's release JSON for [tag] (every asset's name and size), read capped. */
        fun listReleaseSizes(tag: String): Map<String, Long>? {
            if (!TAG_RE.matches(tag)) return null
            val conn = (URL(API_RELEASE_BY_TAG + tag).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15_000
                readTimeout = 30_000
                requestMethod = "GET"
                setRequestProperty("Accept", "application/vnd.github+json")
                setRequestProperty("User-Agent", USER_AGENT)
            }
            return try {
                if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
                val bytes = conn.inputStream.use { readCapped(it, MAX_LISTING_BYTES) } ?: return null
                val assets = JSONObject(String(bytes, Charsets.UTF_8)).optJSONArray("assets") ?: return null
                val out = HashMap<String, Long>()
                for (i in 0 until assets.length()) {
                    val a = assets.optJSONObject(i) ?: continue
                    val name = a.optString("name")
                    val size = a.optLong("size", -1L)
                    if (size > 0L && ASSET_RE.matches(name)) out[name] = size
                }
                out
            } catch (e: Exception) {
                Timber.w(e, "offline audio: release listing for %s failed", tag); null
            } finally {
                conn.disconnect()
            }
        }

        /** The production HEAD: the declared length of [url], redirects followed by hand on the allowlist. */
        fun headLength(url: String): Long? {
            if (!hostAllowed(url)) return null
            var current = url
            var hops = 0
            while (true) {
                val conn = (URL(current).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 15_000
                    readTimeout = 15_000
                    requestMethod = "HEAD"
                    setRequestProperty("User-Agent", USER_AGENT)
                }
                try {
                    val code = conn.responseCode
                    if (code in 300..399) {
                        val loc = conn.getHeaderField("Location")
                        if (loc.isNullOrBlank() || ++hops > MAX_REDIRECTS) return null
                        val next = try { URL(URL(current), loc).toString() } catch (_: Exception) { return null }
                        if (!hostAllowed(next)) return null
                        current = next
                        continue
                    }
                    if (code != HttpURLConnection.HTTP_OK) return null
                    val n = conn.contentLengthLong
                    return if (n > 0L) n else null
                } finally {
                    conn.disconnect()
                }
            }
        }

        private fun readCapped(input: InputStream, cap: Long): ByteArray? {
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                total += n
                if (total > cap) return null
                out.write(buf, 0, n)
            }
            return out.toByteArray()
        }

        /** RFC 9110 single byte ranges; a multi-range, a unit other than bytes or an invalid spec is ignored (whole). */
        fun parseRange(header: String?, total: Long): RangeAnswer {
            val h = header?.trim() ?: return RangeAnswer.Full
            if (!h.startsWith("bytes=", ignoreCase = true)) return RangeAnswer.Full
            val spec = h.substring(6).trim()
            if (spec.contains(',')) return RangeAnswer.Full
            val dash = spec.indexOf('-')
            if (dash < 0) return RangeAnswer.Full
            val a = spec.substring(0, dash).trim()
            val b = spec.substring(dash + 1).trim()
            if (a.isEmpty()) {
                val n = b.toLongOrNull() ?: return RangeAnswer.Full
                if (n <= 0L) return RangeAnswer.Unsatisfiable
                return RangeAnswer.Part(maxOf(0L, total - n), total - 1)
            }
            val start = a.toLongOrNull() ?: return RangeAnswer.Full
            val last = if (b.isEmpty()) null else (b.toLongOrNull() ?: return RangeAnswer.Full)
            if (start < 0L || (last != null && last < start)) return RangeAnswer.Full
            if (start >= total) return RangeAnswer.Unsatisfiable
            return RangeAnswer.Part(start, minOf(last ?: (total - 1), total - 1))
        }

        /** `bytes a-b/total` -> (a, total); (-1, -1) for anything else. */
        internal fun parseContentRange(header: String?): Pair<Long, Long> {
            val m = Regex("^bytes\\s+(\\d+)-(\\d+)/(\\d+)$").matchEntire(header?.trim() ?: return -1L to -1L) ?: return -1L to -1L
            val a = m.groupValues[1].toLongOrNull() ?: return -1L to -1L
            val b = m.groupValues[2].toLongOrNull() ?: return -1L to -1L
            val t = m.groupValues[3].toLongOrNull() ?: return -1L to -1L
            return if (b < a || b >= t) -1L to -1L else a to t
        }

        private fun baseHeaders() = mapOf("Accept-Ranges" to "bytes", "Cache-Control" to "no-store")

        private fun hostAllowed(url: String): Boolean = try {
            val u = URL(url)
            u.protocol.equals("https", ignoreCase = true) && ALLOWED_HOSTS.contains((u.host ?: "").lowercase())
        } catch (_: Exception) { false }

        /** The production opener: GET with redirects followed by hand, each hop's host re-verified; 200 only. */
        fun openRelease(url: String): Opened? = openReleaseFrom(url, 0L, null)

        /**
         * The production resume: the same GET asking for the bytes from [from] (Range), with If-Range on a strong
         * [etag], so a file that changed comes back whole (200, start 0) and never spliced onto the old bytes. A 206
         * must start at [from] and name the whole size; anything else is null (the store tries again or starts over).
         */
        fun openReleaseFrom(url: String, from: Long, etag: String?): Opened? {
            if (!hostAllowed(url)) return null
            var current = url
            var hops = 0
            while (true) {
                val conn = (URL(current).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 15_000
                    readTimeout = 30_000
                    requestMethod = "GET"
                    setRequestProperty("User-Agent", USER_AGENT)
                    if (from > 0L) {
                        setRequestProperty("Range", "bytes=$from-")
                        if (etag != null && !etag.startsWith("W/")) setRequestProperty("If-Range", etag)
                    }
                }
                val code = conn.responseCode
                if (code in 300..399 && code != HttpURLConnection.HTTP_NOT_MODIFIED) {
                    val loc = conn.getHeaderField("Location")
                    conn.disconnect()
                    if (loc.isNullOrBlank() || ++hops > MAX_REDIRECTS) return null
                    val next = try { URL(URL(current), loc).toString() } catch (_: Exception) { return null }
                    if (!hostAllowed(next)) {
                        Timber.w("offline audio: redirect to a host off the allowlist refused: %s", next)
                        return null
                    }
                    current = next
                    continue
                }
                val tag = conn.getHeaderField("ETag")?.trim()?.takeIf { it.isNotEmpty() && !it.startsWith("W/") }
                if (code == HttpURLConnection.HTTP_PARTIAL && from > 0L) {
                    val (start, whole) = parseContentRange(conn.getHeaderField("Content-Range"))
                    if (start == from && whole > 0L) {
                        return Opened(conn.inputStream, conn.contentLengthLong, { conn.disconnect() }, start = start, total = whole, etag = tag)
                    }
                }
                if (from > 0L && (code == HttpURLConnection.HTTP_PARTIAL || code == HTTP_RANGE_NOT_SATISFIABLE)) {
                    // A part that is not the one asked for, or none (416: the file is shorter now, say re-uploaded
                    // with no strong ETag held): ask for the whole file. Its start of 0 tells the store to throw the
                    // kept bytes away; a null here would only be retried from the same bytes until it failed.
                    conn.disconnect()
                    return openReleaseFrom(url, 0L, null)
                }
                // A 4xx or 5xx is the server's answer (a missing asset, GitHub down), not a lost network (defect 23).
                if (code >= 400) { conn.disconnect(); throw ServerAnswer(code) }
                if (code != HttpURLConnection.HTTP_OK) { conn.disconnect(); return null }
                return Opened(conn.inputStream, conn.contentLengthLong, { conn.disconnect() }, etag = tag)
            }
        }
    }
}
