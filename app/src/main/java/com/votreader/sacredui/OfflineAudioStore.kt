package com.votreader.sacredui

import android.content.Context
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
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/**
 * Recordings downloaded to the phone (listening item 8; Corbin 2026-09-22: "yes after reset" - one recording, a
 * collection or a Bible book at a time, never a whole edition, which is 3-5 GB).
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
 * declared length, and only then is it moved into place and indexed; a .part left by a kill is swept at start and is
 * never served. One download at a time (a single worker thread), redirects followed by hand with every hop's host on
 * the Garden allowlist, free space checked against the declared length plus a margin before a byte is written.
 *
 * Every state change goes to JS as one JSON event through [emit] (JsEvent.OfflineAudio): queued, progress (throttled),
 * done, failed(reason: network | space | short | size | disk), cancelled, removed.
 */
class OfflineAudioStore(
    root: File,
    private val opener: (String) -> Opened? = ::openRelease,
    private val executor: Executor = Executors.newSingleThreadExecutor { r -> Thread(r, "offline-audio").apply { isDaemon = true } },
    private val freeBytes: () -> Long = { root.usableSpace },
    private val emit: (String) -> Unit = {},
    private val clock: () -> Long = System::currentTimeMillis,
    private val sizeLister: (String) -> Map<String, Long>? = ::listReleaseSizes,
    private val headSize: (String) -> Long? = ::headLength,
    private val sizeExecutor: Executor = Executors.newSingleThreadExecutor { r -> Thread(r, "offline-audio-sizes").apply { isDaemon = true } },
) {
    /** One recording to download: its release URL, the player key it plays under, and a title for the shelf. */
    data class Item(val url: String, val key: String, val title: String)

    /** An open download: the body, its declared length (-1 unknown) and how to release the connection. */
    class Opened(val stream: InputStream, val length: Long, val onClose: () -> Unit = {})

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
    private val queued = LinkedHashSet<String>()                  // guarded by lock
    private val cancelled: MutableSet<String> = ConcurrentHashMap.newKeySet()
    @Volatile private var active: Active? = null

    // Release sizes (bytes) per tag: tag -> (fetchedAt, asset name -> bytes), kept in sizes.json for [SIZE_TTL].
    private val sizesFile = File(dir, "sizes.json")
    private val sizeLock = Any()
    private val sizeCache = HashMap<String, Pair<Long, Map<String, Long>>>()   // guarded by sizeLock
    private val listingFailedAt = HashMap<String, Long>()                        // guarded by sizeLock

    init {
        // A .part is a download a kill interrupted: never resumed, never served.
        dir.listFiles { f -> f.name.endsWith(PART) }?.forEach { runCatching { it.delete() } }
        load()
        loadSizes()
    }

    /**
     * Look up the size of each of [urls] before it is downloaded (the rows' "Download · 18 MB", a collection's total):
     * one release listing per tag, cached on the phone for a week, a HEAD per file only for what a listing does not
     * answer. Runs on its own worker (never behind a download) and answers with one event:
     * {type: "sizes", sizes: {url: bytes}}; a size nobody could give is simply absent.
     */
    fun requestSizes(urls: List<String>) {
        val wanted = urls.distinct().mapNotNull { u -> splitRelease(u)?.let { Triple(u, it.first, it.second) } }.take(MAX_SIZE_BATCH)
        if (wanted.isEmpty()) return
        sizeExecutor.execute {
            val out = JSONObject()
            var heads = 0
            for ((tag, group) in wanted.groupBy { it.second }) {
                val listing = listingFor(tag)
                for ((url, _, asset) in group) {
                    // A HEAD (a round trip and a redirect) only for what a listing did not answer, a few per ask:
                    // a failed listing must not turn one screen into a thousand requests.
                    val n = listing?.get(asset) ?: if (heads < MAX_HEADS_PER_ASK) {
                        heads++
                        try { headSize(url) } catch (_: Exception) { null }
                    } else null
                    if (n != null && n > 0L) out.put(url, n)
                }
            }
            emit(JSONObject().put("type", "sizes").put("sizes", out).toString())
        }
    }

    private fun listingFor(tag: String): Map<String, Long>? {
        synchronized(sizeLock) {
            val hit = sizeCache[tag]
            if (hit != null && clock() - hit.first < SIZE_TTL) return hit.second
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

    /** `[{url, key, title}, ...]`: download each (at most [MAX_BATCH] per call). */
    fun enqueueJson(json: String?) {
        val arr = parseArray(json) ?: return
        val items = ArrayList<Item>()
        for (i in 0 until minOf(arr.length(), MAX_BATCH)) {
            val o = arr.optJSONObject(i) ?: continue
            val url = o.optString("url")
            if (url.isNotEmpty()) items += Item(url, o.optString("key"), o.optString("title"))
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

    /** True when [url] is on the phone (whole, indexed). */
    fun isSaved(url: String): Boolean = synchronized(lock) { entries.containsKey(url) }

    /** Queue [items] (skipping any not from the audio releases, already on the phone, or already queued). */
    fun enqueue(items: List<Item>) {
        for (item in items) {
            val name = fileNameFor(item.url) ?: continue
            val fresh = synchronized(lock) {
                if (entries.containsKey(item.url) || queued.contains(item.url) || active?.url == item.url) false
                else { queued.add(item.url); true }
            }
            if (!fresh) continue
            emit(event("queued", item.url).toString())
            executor.execute { download(item, name) }
        }
    }

    /**
     * Stop [urls]: one still waiting comes off the queue at once (and says so); the one downloading stops at its next
     * chunk. The worker skips any task whose URL is no longer queued.
     */
    fun cancel(urls: List<String>) {
        val dropped = ArrayList<String>()
        synchronized(lock) {
            for (u in urls) {
                if (queued.remove(u)) dropped += u
                else if (active?.url == u) cancelled.add(u)
            }
        }
        for (u in dropped) emit(event("cancelled", u).toString())
    }

    /** Stop everything queued or downloading. */
    fun cancelAll() {
        val dropped: List<String>
        synchronized(lock) {
            dropped = queued.toList()
            queued.clear()
            active?.let { cancelled.add(it.url) }
        }
        for (u in dropped) emit(event("cancelled", u).toString())
    }

    /** Take [urls] off the phone (file and index entry). */
    fun remove(urls: List<String>) {
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
        if (gone.isNotEmpty()) emit(JSONObject().put("type", "removed").put("urls", JSONArray(gone)).toString())
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
        emit(JSONObject().put("type", "removed").put("all", true).toString())
    }

    /** Everything the shelf and the rows need, as one JSON object. */
    fun stateJson(): String = synchronized(lock) {
        val items = JSONArray()
        var total = 0L
        for ((url, e) in entries) {
            items.put(JSONObject().put("url", url).put("key", e.key).put("title", e.title).put("bytes", e.bytes).put("savedAt", e.savedAt))
            total += e.bytes
        }
        val a = active
        JSONObject()
            .put("items", items)
            .put("totalBytes", total)
            .put("freeBytes", runCatching { freeBytes() }.getOrDefault(-1L))
            .put("active", if (a == null) JSONObject.NULL else JSONObject().put("url", a.url).put("bytes", a.bytes).put("total", a.total))
            .put("queued", JSONArray(queued.toList()))
            .toString()
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

    private fun download(item: Item, name: String) {
        val act = Active(item.url)
        synchronized(lock) {
            // Cancelled (or removed by Remove all) while it waited: its 'cancelled' was already sent.
            if (!queued.remove(item.url)) return
            cancelled.remove(item.url)
            active = act
        }
        val part = File(dir, name + PART)
        var opened: Opened? = null
        try {
            opened = opener(item.url)
            if (opened == null) { fail(item.url, "network"); return }
            val length = opened.length
            act.total = length
            if (length > MAX_BYTES) { fail(item.url, "size"); return }
            if (length > 0 && length + SPACE_MARGIN > freeBytes()) { fail(item.url, "space"); return }
            emit(progress(act).toString())
            var total = 0L
            var lastEmit = clock()
            FileOutputStream(part).use { out ->
                opened.stream.use { input ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        if (cancelled.remove(item.url)) { out.close(); part.delete(); active = null; emit(event("cancelled", item.url).toString()); return }
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_BYTES) { fail(item.url, "size"); return }
                        out.write(buf, 0, n)
                        act.bytes = total
                        val now = clock()
                        if (now - lastEmit >= PROGRESS_MS) { lastEmit = now; emit(progress(act).toString()) }
                    }
                    out.fd.sync()
                }
            }
            if (total <= 0L || (length > 0 && total != length)) { fail(item.url, "short"); return }
            // A chunked answer declared no length: its room is checked now, before the move.
            if (length <= 0 && freeBytes() < SPACE_MARGIN) { fail(item.url, "space"); return }
            val target = File(dir, name)
            try {
                Files.move(part.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            } catch (e: Exception) {
                Timber.w(e, "offline audio: could not move %s into place", name); fail(item.url, "disk"); return
            }
            synchronized(lock) {
                entries[item.url] = Entry(name, total, clock(), item.key.take(MAX_TEXT), item.title.take(MAX_TEXT))
                persist()
                active = null   // before 'done': the page re-reads the state on it
            }
            emit(event("done", item.url).put("bytes", total).toString())
        } catch (e: Exception) {
            Timber.w(e, "offline audio: download of %s failed", item.url)
            fail(item.url, "network")
        } finally {
            if (part.exists()) part.delete()
            try { opened?.onClose?.invoke() } catch (_: Exception) { /* release best-effort */ }
            active = null
        }
    }

    private fun fail(url: String, reason: String) {
        active = null
        emit(event("failed", url).put("reason", reason).toString())
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
                sharedStore ?: OfflineAudioStore(context.applicationContext.filesDir, emit = { json -> eventSink?.invoke(json) })
                    .also { sharedStore = it }
            }

        const val DIR_NAME = "offline-audio"
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
        private const val MAX_TEXT = 240

        // The release host and the asset hosts its 302 goes to (GardenImageCache's allowlist).
        private val ALLOWED_HOSTS = setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")
        private const val MAX_REDIRECTS = 5
        private const val USER_AGENT = "VOTReader-Android/1.0"

        // Sizes: a week-old listing is asked again; one ask covers at most a big collection or book.
        private const val SIZE_TTL = 7L * 24 * 3600 * 1000
        private const val MAX_SIZE_BATCH = 400
        // One call from the page: a Bible book tops out at 150 chapters, the largest collection at 203 entries.
        private const val MAX_BATCH = 400
        private const val MAX_HEADS_PER_ASK = 40
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

        /** The release URL a stored file name came from (the inverse of [fileNameFor]); null for any other name. */
        internal fun urlForFileName(name: String): String? {
            val at = name.indexOf("__")   // a tag never holds '_', so the first "__" is the joint
            if (at <= 0) return null
            val url = PREFIX + name.substring(0, at) + "/" + name.substring(at + 2)
            return if (fileNameFor(url) == name) url else null
        }

        /** `<tag>__<asset>.mp3` for one of the app's audio releases; null for anything else. */
        fun fileNameFor(url: String): String? = splitRelease(url)?.let { (tag, asset) -> "${tag}__$asset" }

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

        private fun baseHeaders() = mapOf("Accept-Ranges" to "bytes", "Cache-Control" to "no-store")

        private fun hostAllowed(url: String): Boolean = try {
            val u = URL(url)
            u.protocol.equals("https", ignoreCase = true) && ALLOWED_HOSTS.contains((u.host ?: "").lowercase())
        } catch (_: Exception) { false }

        /** The production opener: GET with redirects followed by hand, each hop's host re-verified; 200 only. */
        fun openRelease(url: String): Opened? {
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
                if (code != HttpURLConnection.HTTP_OK) { conn.disconnect(); return null }
                return Opened(conn.inputStream, conn.contentLengthLong) { conn.disconnect() }
            }
        }
    }
}
