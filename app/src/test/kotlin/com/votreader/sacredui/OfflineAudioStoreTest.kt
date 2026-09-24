package com.votreader.sacredui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.Executor
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Listening item 8 (Corbin 2026-09-22 "yes after reset"): recordings downloaded to the phone play with no signal.
 * OfflineAudioStore keeps the files (filesDir: a chosen download must not be evicted like a cache) and serves them
 * back to the WebView's <audio> element through shouldInterceptRequest, Range requests included, so play, seek and
 * the read-along clock work offline exactly as online.
 *
 * T3 (storage + the intercept path): what is pinned here is what must never go wrong on a phone:
 *   - only the app's own audio releases are ever fetched or written, as flat safe file names;
 *   - a partial download is never served (it is a .part until its length checks out, and a stray .part is swept);
 *   - the index survives a restart; remove really frees the space;
 *   - Range answers are exact (200 full, 206 slice with Content-Range, 416 past the end).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class OfflineAudioStoreTest {

    @get:Rule val tmp = TemporaryFolder()

    private val url1 = "https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-christmas-B.mp3"
    private val url2 = "https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/brm-genesis-001.mp3"
    private val direct = Executor { it.run() }

    /** Runs nothing until run() - so a test can hold downloads in the queue. */
    private class Held : Executor {
        val tasks = ArrayList<Runnable>()
        override fun execute(command: Runnable) { tasks += command }
        fun run() { while (tasks.isNotEmpty()) tasks.removeAt(0).run() }
    }
    private val events = mutableListOf<JSONObject>()
    private val body = ByteArray(1000) { (it % 251).toByte() }

    private fun opened(bytes: ByteArray = body, length: Long = bytes.size.toLong()) =
        OfflineAudioStore.Opened(ByteArrayInputStream(bytes), length)

    private fun store(
        root: File = tmp.root,
        free: Long = 10L shl 30,
        opener: (String) -> OfflineAudioStore.Opened? = { opened() },
    ) = OfflineAudioStore(root, opener = opener, executor = direct, freeBytes = { free }, emit = { events += JSONObject(it) })

    private fun item(url: String, key: String = "one:christmas", title: String = "Christmas") =
        OfflineAudioStore.Item(url, key, title)

    // ── names ─────────────────────────────────────────────────────────

    @Test
    fun `only the app's own audio releases are accepted, as flat safe file names`() {
        assertEquals("audio-v1__one-christmas-B.mp3", OfflineAudioStore.fileNameFor(url1))
        assertEquals("audio-brm-v1__brm-genesis-001.mp3", OfflineAudioStore.fileNameFor(url2))
        val base = "https://github.com/VOTReader/votreader-assets/releases/download/"
        assertNull(OfflineAudioStore.fileNameFor(base + "garden-v1/garden_001.jpg"), "not audio")
        assertNull(OfflineAudioStore.fileNameFor("https://github.com/someone/else/releases/download/audio-v1/x.mp3"), "another repo")
        assertNull(OfflineAudioStore.fileNameFor(base.replace("https:", "http:") + "audio-v1/x.mp3"), "not https")
        assertNull(OfflineAudioStore.fileNameFor(base + "audio-v1/..%2F..%2Fx.mp3"), "an encoded traversal")
        assertNull(OfflineAudioStore.fileNameFor(base + "audio-v1/a/b.mp3"), "a nested path")
        assertNull(OfflineAudioStore.fileNameFor(base + "audio-v1/x.mp3?evil=1"), "a query")
    }

    // ── download ──────────────────────────────────────────────────────

    @Test
    fun `a download lands whole, is indexed with its key and title, and says so`() {
        val s = store()
        s.enqueue(listOf(item(url1)))
        assertTrue(s.isSaved(url1))
        val f = File(File(tmp.root, "offline-audio"), "audio-v1__one-christmas-B.mp3")
        assertContentEquals(body, f.readBytes())
        val state = JSONObject(s.stateJson())
        val saved = state.getJSONArray("items").getJSONObject(0)
        assertEquals(url1, saved.getString("url"))
        assertEquals("one:christmas", saved.getString("key"))
        assertEquals("Christmas", saved.getString("title"))
        assertEquals(1000L, saved.getLong("bytes"))
        assertEquals(1000L, state.getLong("totalBytes"))
        assertEquals("done", events.last().getString("type"))
        assertEquals(url1, events.last().getString("url"))
    }

    @Test
    fun `a download cut short is never saved or served, and its part file is gone`() {
        val s = store(opener = {
            OfflineAudioStore.Opened(object : InputStream() {
                var n = 0
                override fun read(): Int { if (n++ < 300) return 7; throw IOException("connection reset") }
            }, 1000L)
        })
        s.enqueue(listOf(item(url1)))
        assertFalse(s.isSaved(url1))
        assertNull(s.intercept(url1, null))
        assertTrue(File(tmp.root, "offline-audio").listFiles { f -> f.name.endsWith(".part") }.isNullOrEmpty())
        assertEquals("failed", events.last().getString("type"))
    }

    @Test
    fun `a body shorter than its declared length is a failure, not a truncated recording`() {
        val s = store(opener = { opened(ByteArray(600), 1000L) })
        s.enqueue(listOf(item(url1)))
        assertFalse(s.isSaved(url1))
        assertEquals("failed", events.last().getString("type"))
    }

    @Test
    fun `no room on the phone refuses the download before a byte is written`() {
        val s = store(free = 50L shl 20)   // 50 MB free: under the recording + the 200 MB margin
        s.enqueue(listOf(item(url1)))
        assertFalse(s.isSaved(url1))
        val last = events.last()
        assertEquals("failed", last.getString("type"))
        assertEquals("space", last.getString("reason"))
    }

    @Test
    fun `a URL outside the audio releases is refused without being fetched`() {
        var fetched = 0
        val s = store(opener = { fetched++; opened() })
        s.enqueue(listOf(item("https://example.com/x.mp3")))
        assertEquals(0, fetched)
        assertFalse(s.isSaved("https://example.com/x.mp3"))
    }

    // ── restart, remove ───────────────────────────────────────────────

    @Test
    fun `the index survives a restart and a stray part file is swept`() {
        store().enqueue(listOf(item(url1)))
        val dir = File(tmp.root, "offline-audio")
        File(dir, "audio-v1__half-B.mp3.part").writeBytes(ByteArray(10))
        val again = store()
        assertTrue(again.isSaved(url1))
        assertFalse(File(dir, "audio-v1__half-B.mp3.part").exists())
    }

    @Test
    fun `remove frees the file and the index entry, remove all empties the shelf`() {
        val s = store()
        s.enqueue(listOf(item(url1), item(url2, "bible-brm-kjv:genesis", "Genesis 1")))
        assertEquals(2000L, JSONObject(s.stateJson()).getLong("totalBytes"))
        s.remove(listOf(url1))
        assertFalse(s.isSaved(url1))
        assertFalse(File(File(tmp.root, "offline-audio"), "audio-v1__one-christmas-B.mp3").exists())
        assertTrue(s.isSaved(url2))
        s.removeAll()
        val state = JSONObject(s.stateJson())
        assertEquals(0, state.getJSONArray("items").length())
        assertEquals(0L, state.getLong("totalBytes"))
        assertEquals(JSONArray().toString(), state.getJSONArray("items").toString())
    }

    // ── serving (Range) ───────────────────────────────────────────────

    /**
     * What Android WebView does with a stream returned from shouldInterceptRequest (Chromium
     * components/embedder_support/android/util/input_stream_reader.cc + android_stream_reader_url_loader.cc): it takes
     * the size from available(), bounds the REQUEST's Range against it (HttpByteRange::ComputeBounds), skips to the
     * first byte itself, and reads to the end of the stream. A body the app pre-cut would be skipped twice (the
     * refutation of 2026-09-24, MUST 1), so the store hands over the file from byte 0, capped after the last byte.
     */
    private fun webviewReads(resp: android.webkit.WebResourceResponse, range: String?): ByteArray {
        val stream = resp.data
        val size = stream.available().toLong()
        var first = 0L
        var last = size - 1
        if (range != null) {
            val spec = range.removePrefix("bytes=")
            val a = spec.substringBefore('-')
            val b = spec.substringAfter('-')
            if (a.isEmpty()) { first = maxOf(0L, size - b.toLong()); last = size - 1 }
            else { first = a.toLong(); last = if (b.isEmpty()) size - 1 else minOf(b.toLong(), size - 1) }
            require(first < size) { "ERR_REQUEST_RANGE_NOT_SATISFIABLE" }
        }
        var skip = first
        while (skip > 0) { val k = stream.skip(skip); require(k > 0) { "skip stalled" }; skip -= k }
        val out = stream.readBytes()
        assertEquals(last - first + 1, out.size.toLong(), "WebView sends Content-Length = last - first + 1; the stream must end there")
        return out
    }

    @Test
    fun `a saved recording is served the way WebView reads it - whole, or a slice it cuts itself`() {
        val s = store()
        s.enqueue(listOf(item(url1)))

        val full = assertNotNull(s.intercept(url1, null))
        assertEquals(200, full.statusCode)
        assertEquals("audio/mpeg", full.mimeType)
        assertEquals("bytes", full.responseHeaders["Accept-Ranges"])
        assertNull(full.responseHeaders["Content-Length"], "WebView sets Content-Length itself; a second one could disagree")
        assertContentEquals(body, webviewReads(full, null))

        val part = assertNotNull(s.intercept(url1, "bytes=10-19"))
        assertEquals(206, part.statusCode)
        assertEquals("bytes 10-19/1000", part.responseHeaders["Content-Range"])
        assertContentEquals(body.copyOfRange(10, 20), webviewReads(part, "bytes=10-19"))

        // A resume or scrub past the middle: the case that came back ERR_FAILED when the body was pre-cut.
        val late = assertNotNull(s.intercept(url1, "bytes=700-"))
        assertEquals("bytes 700-999/1000", late.responseHeaders["Content-Range"])
        assertContentEquals(body.copyOfRange(700, 1000), webviewReads(late, "bytes=700-"))

        val tail = assertNotNull(s.intercept(url1, "bytes=-5"))
        assertEquals("bytes 995-999/1000", tail.responseHeaders["Content-Range"])
        assertContentEquals(body.copyOfRange(995, 1000), webviewReads(tail, "bytes=-5"))

        val past = assertNotNull(s.intercept(url1, "bytes=1000-"))
        assertEquals(416, past.statusCode)
        assertEquals("bytes */1000", past.responseHeaders["Content-Range"])

        assertNull(s.intercept(url2, null), "not downloaded: the WebView loads it itself")
    }

    @Test
    fun `range parsing covers the forms a media element sends`() {
        assertEquals(OfflineAudioStore.RangeAnswer.Full, OfflineAudioStore.parseRange(null, 1000))
        assertEquals(OfflineAudioStore.RangeAnswer.Full, OfflineAudioStore.parseRange("items=0-5", 1000))
        assertEquals(OfflineAudioStore.RangeAnswer.Full, OfflineAudioStore.parseRange("bytes=0-1,5-9", 1000))
        assertEquals(OfflineAudioStore.RangeAnswer.Part(0, 999), OfflineAudioStore.parseRange("bytes=0-", 1000))
        assertEquals(OfflineAudioStore.RangeAnswer.Part(100, 999), OfflineAudioStore.parseRange("bytes=100-5000", 1000))
        assertEquals(OfflineAudioStore.RangeAnswer.Part(0, 999), OfflineAudioStore.parseRange("bytes=-5000", 1000))
        assertEquals(OfflineAudioStore.RangeAnswer.Unsatisfiable, OfflineAudioStore.parseRange("bytes=1000-1001", 1000))
        // RFC 9110 14.1.1: a last-pos before the first-pos is an INVALID spec, ignored (the whole body), not a 416.
        assertEquals(OfflineAudioStore.RangeAnswer.Full, OfflineAudioStore.parseRange("bytes=20-10", 1000))
    }

    // ── the refutation of 2026-09-24 (lanes/readalong/out/offline-refute-claude.md) ──

    private fun heldStore(held: Held, opened: MutableList<String> = mutableListOf()) =
        OfflineAudioStore(tmp.root, opener = { u -> opened += u; opened() }, executor = held, freeBytes = { 10L shl 30 },
            emit = { events += JSONObject(it) })

    @Test
    fun `cancel takes a queued download off at once, and it is never fetched`() {
        val held = Held()
        val opened = mutableListOf<String>()
        val s = heldStore(held, opened)
        s.enqueue(listOf(item(url1), item(url2)))
        s.cancel(listOf(url2))
        val last = events.last()
        assertEquals("cancelled", last.getString("type"))
        assertEquals(url2, last.getString("url"))
        assertEquals(0, JSONObject(s.stateJson()).getJSONArray("queued").let { q -> (0 until q.length()).count { q.getString(it) == url2 } })
        held.run()
        assertEquals(listOf(url1), opened)
        assertTrue(s.isSaved(url1))
        assertFalse(s.isSaved(url2))
        // A new Download after the cancel is a new download.
        s.enqueue(listOf(item(url2)))
        held.run()
        assertTrue(s.isSaved(url2))
    }

    @Test
    fun `the same recording queued twice downloads once`() {
        val held = Held()
        val opened = mutableListOf<String>()
        val s = heldStore(held, opened)
        s.enqueue(listOf(item(url1)))
        s.enqueue(listOf(item(url1)))
        held.run()
        assertEquals(listOf(url1), opened)
    }

    @Test
    fun `remove all stops what is still queued, so the shelf does not refill`() {
        val held = Held()
        val opened = mutableListOf<String>()
        val s = heldStore(held, opened)
        s.enqueue(listOf(item(url1), item(url2)))
        s.removeAll()
        held.run()
        assertTrue(opened.isEmpty())
        assertEquals(0, JSONObject(s.stateJson()).getJSONArray("items").length())
    }

    @Test
    fun `a recording whose index entry was lost is found again from its file name`() {
        store().enqueue(listOf(item(url1)))
        File(File(tmp.root, "offline-audio"), "index.json").delete()
        val again = store()
        assertTrue(again.isSaved(url1), "a file on disk the index lost is listed again, so it can be played and removed")
        val it = JSONObject(again.stateJson()).getJSONArray("items").getJSONObject(0)
        assertEquals("one-christmas-B", it.getString("title"))
        assertEquals(1000L, it.getLong("bytes"))
    }

    @Test
    fun `done is announced after the download stops being active`() {
        var activeAtDone: Any? = "unset"
        lateinit var s: OfflineAudioStore
        s = OfflineAudioStore(tmp.root, opener = { opened() }, executor = direct, freeBytes = { 10L shl 30 }, emit = { json ->
            val e = JSONObject(json)
            if (e.getString("type") == "done") activeAtDone = JSONObject(s.stateJson()).get("active")
        })
        s.enqueue(listOf(item(url1)))
        assertEquals(JSONObject.NULL, activeAtDone)
    }
}
