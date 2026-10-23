package com.votreader.sacredui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
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
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * dl-d2, the native side of offline downloads (downloads brief 3f, 6 D2, 7 items 1 and 11): any number of urls in one
 * call, a queue that survives a restart, Pause / Resume all, a download that goes on from its bytes (Range), retries
 * before a failure, and waits that say why (space, offline) instead of failing.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class OfflineAudioQueueTest {

    @get:Rule val tmp = TemporaryFolder()

    private val base = "https://github.com/VOTReader/votreader-assets/releases/download/audio-bible-v1/"
    private fun url(i: Int) = base + "kjv-c$i.mp3"
    private val body = ByteArray(10_000) { (it % 251).toByte() }
    private val events = ArrayList<JSONObject>()
    private val workers = ArrayList<java.util.concurrent.ExecutorService>()
    private val direct = Executor { it.run() }
    /** Holds every task: nothing downloads (a store whose worker never got to run, as at a kill). */
    private val held = Executor { }

    @After fun stop() { workers.forEach { it.shutdownNow() } }

    private fun worker() = Executors.newSingleThreadExecutor().also { workers += it }

    private fun whole() = OfflineAudioStore.Opened(ByteArrayInputStream(body), body.size.toLong(), etag = "\"e1\"")

    /** The bytes from [from], as a server's 206 answers them. */
    private fun part(from: Long) = OfflineAudioStore.Opened(
        ByteArrayInputStream(body, from.toInt(), body.size - from.toInt()), body.size - from, start = from, total = body.size.toLong(), etag = "\"e1\"")

    /** A stream that breaks (a lost connection) after [n] bytes. */
    private fun breaking(n: Int) = OfflineAudioStore.Opened(object : InputStream() {
        private var pos = 0
        override fun read(): Int = throw UnsupportedOperationException()
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (pos >= n) throw IOException("connection reset")
            val k = minOf(len, n - pos)
            System.arraycopy(body, pos, b, off, k)
            pos += k
            return k
        }
    }, body.size.toLong(), etag = "\"e1\"")

    private fun store(
        executor: Executor = direct,
        opener: (String) -> OfflineAudioStore.Opened? = { whole() },
        rangeOpener: ((String, Long, String?) -> OfflineAudioStore.Opened?)? = null,
        free: () -> Long = { 10L shl 30 },
        online: () -> Boolean = { true },
        retries: List<Long> = emptyList(),
    ) = OfflineAudioStore(tmp.root, opener = opener, executor = executor, freeBytes = free,
        emit = { synchronized(events) { events += JSONObject(it) } },
        rangeOpener = rangeOpener ?: { u, _, _ -> opener(u) }, online = online, retryDelays = retries)

    private fun items(n: Int) = JSONArray().apply {
        for (i in 1..n) put(JSONObject().put("url", url(i)).put("key", "bible-kjv-$i").put("title", "Chapter $i").put("bytes", 1000))
    }

    private fun dir() = File(tmp.root, OfflineAudioStore.DIR_NAME)
    private fun parts() = dir().listFiles { f -> f.name.endsWith(".part") }?.map { it.name } ?: emptyList()
    private fun types() = synchronized(events) { events.map { it.getString("type") } }
    private fun state() = JSONObject(OfflineAudioStore(tmp.root, opener = { null }, executor = held, emit = {}).stateJson())

    private fun waitFor(what: String, cond: () -> Boolean) {
        val until = System.currentTimeMillis() + 5_000
        while (!cond()) {
            if (System.currentTimeMillis() > until) throw AssertionError("timed out waiting for $what (events ${types()})")
            Thread.sleep(20)
        }
    }

    // ── brief item 1: a whole edition in one Download ────────────────

    @Test
    fun `a whole edition of 1189 urls in one call is queued whole, not cut at 400`() {
        val s = store(executor = held)
        s.enqueueJson(items(1189).toString())
        val st = JSONObject(s.stateJson())
        assertEquals(1189, st.getJSONArray("queued").length())
        assertEquals(1189, st.getJSONObject("left").getInt("count"))
        assertEquals(1189L * 1000, st.getJSONObject("left").getLong("bytes"), "the page's bytes total the queue")
        assertEquals(1189, st.getJSONObject("batch").getInt("total"))
        val queued = types().indexOf("queued").let { events[it].getJSONArray("urls").length() }
        assertEquals(1189, queued, "one queued event names them all")
    }

    // ── brief item 11: the queue survives a close or a restart ────────

    @Test
    fun `the queue survives a restart in order, and the next start downloads it`() {
        val s1 = store(executor = held)
        s1.enqueueJson(items(3).toString())
        assertTrue(File(dir(), "queue.json").isFile)
        val st = state()
        assertEquals(listOf(url(1), url(2), url(3)), (0 until 3).map { st.getJSONArray("queued").getString(it) })
        assertEquals(3, st.getJSONObject("batch").getInt("total"))
        val s2 = store()   // the next start, with a worker
        for (i in 1..3) assertTrue(s2.isSaved(url(i)), "chapter $i downloaded after the restart")
        assertEquals(0, JSONObject(s2.stateJson()).getJSONArray("queued").length())
        assertEquals(3, JSONObject(s2.stateJson()).getJSONObject("batch").getInt("done"))
    }

    @Test
    fun `a cancelled download does not come back at the next start`() {
        val s1 = store(executor = held)
        s1.enqueueJson(items(3).toString())
        s1.cancel(listOf(url(2)))
        val st = state()
        assertEquals(listOf(url(1), url(3)), (0 until st.getJSONArray("queued").length()).map { st.getJSONArray("queued").getString(it) })
        assertEquals(2, st.getJSONObject("batch").getInt("total"), "a cancel leaves the batch's count")
        s1.cancelAll()
        assertEquals(0, state().getJSONArray("queued").length())
    }

    @Test
    fun `a finished update does not download again after a kill`() {
        store().enqueueJson(items(2).toString())   // both on the phone
        var runs = 0
        val firstOnly = Executor { if (runs++ == 0) it.run() }   // killed after the first update landed
        val s1 = store(executor = firstOnly)
        s1.enqueue(listOf(1, 2).map { OfflineAudioStore.Item(url(it), "bible-kjv-$it", "Chapter $it", update = true) })
        val st = state()
        assertEquals(listOf(url(2)), (0 until st.getJSONArray("queued").length()).map { st.getJSONArray("queued").getString(it) })
    }

    @Test
    fun `paused holds across a restart, and resume goes on`() {
        val s1 = store(executor = held)
        s1.enqueueJson(items(1).toString())
        s1.pause()
        val w = worker()
        val s2 = store(executor = w)
        Thread.sleep(200)
        assertFalse(s2.isSaved(url(1)), "still paused after the restart")
        val st = JSONObject(s2.stateJson())
        assertTrue(st.getBoolean("paused"))
        assertEquals("paused", st.getString("reason"))
        s2.resume()
        waitFor("the download after resume") { s2.isSaved(url(1)) }
        assertTrue(JSONObject(s2.stateJson()).isNull("reason"))
    }

    // ── Range resume ──────────────────────────────────────────────────

    @Test
    fun `a broken connection is retried from its bytes with a Range, and the file lands whole`() {
        val froms = ArrayList<Pair<Long, String?>>()
        val s = store(opener = { breaking(4_000) }, rangeOpener = { _, from, etag -> froms += from to etag; part(from) }, retries = listOf(1L))
        s.enqueueJson(items(1).toString())
        assertTrue(s.isSaved(url(1)), "events ${types()}")
        assertEquals<List<Pair<Long, String?>>>(listOf(4_000L to "\"e1\""), froms, "asked from the bytes on disk, If-Range on the ETag")
        assertTrue(body.contentEquals(s.fileFor(url(1))!!.readBytes()), "the joined file is the server's bytes")
        assertFalse("failed" in types(), "a retry that worked is no failure")
        assertEquals("retrying", events.first { it.getString("type") == "waiting" }.getString("reason"))
        assertEquals(emptyList<String>(), parts())
        assertFalse(File(dir(), "resume.json").exists())
    }

    @Test
    fun `after a kill the next start resumes from the synced bytes, cutting off what came after`() {
        // What a kill leaves: the queue, resume.json saying 3000 bytes were synced, and a .part with 5000 (the last
        // 2000 may never have reached the disk).
        val s1 = store(executor = held)
        s1.enqueueJson(items(1).toString())
        val name = "audio-bible-v1__kjv-c1.mp3.part"
        File(dir(), name).writeBytes(body.copyOf(5_000))
        File(dir(), "resume.json").writeText(JSONObject().put("url", url(1)).put("total", body.size).put("etag", "\"e1\"").put("synced", 3_000).toString())
        val froms = ArrayList<Long>()
        val s2 = store(opener = { throw AssertionError("must resume, not start over") }, rangeOpener = { _, from, _ -> froms += from; part(from) })
        assertEquals(listOf(3_000L), froms)
        assertTrue(body.contentEquals(s2.fileFor(url(1))!!.readBytes()))
    }

    @Test
    fun `a server that answers a resume with the whole file starts it from the top, never splicing`() {
        val s1 = store(executor = held)
        s1.enqueueJson(items(1).toString())
        File(dir(), "audio-bible-v1__kjv-c1.mp3.part").writeBytes(ByteArray(3_000) { 7 })   // not the server's bytes
        File(dir(), "resume.json").writeText(JSONObject().put("url", url(1)).put("total", body.size).put("etag", "\"old\"").put("synced", 3_000).toString())
        val s2 = store(rangeOpener = { _, _, _ -> whole() })   // the ETag changed: If-Range sends 200 and the whole
        assertTrue(body.contentEquals(s2.fileFor(url(1))!!.readBytes()))
    }

    @Test
    fun `a file that changed size since its bytes were kept starts again from the top`() {
        val s1 = store(executor = held)
        s1.enqueueJson(items(1).toString())
        File(dir(), "audio-bible-v1__kjv-c1.mp3.part").writeBytes(body.copyOf(3_000))
        File(dir(), "resume.json").writeText(JSONObject().put("url", url(1)).put("total", 99_999).put("synced", 3_000).toString())
        var whole = 0
        val s2 = store(opener = { whole++; whole() }, rangeOpener = { _, from, _ -> part(from) })
        assertEquals(1, whole)
        assertTrue(body.contentEquals(s2.fileFor(url(1))!!.readBytes()))
    }

    @Test
    fun `a stray part with no resume record is swept at start, and never served`() {
        File(dir().apply { mkdirs() }, "audio-bible-v1__kjv-c9.mp3.part").writeBytes(ByteArray(10))
        val s = store()
        assertEquals(emptyList<String>(), parts())
        assertNull(s.intercept(url(9), null))
    }

    @Test
    fun `Pause keeps the bytes of the one on its way, and Resume goes on from them`() {
        val w = worker()
        lateinit var s: OfflineAudioStore
        val pausedOnce = AtomicBoolean(false)
        val from = AtomicLong(-1)
        s = store(executor = w, opener = {
            OfflineAudioStore.Opened(object : InputStream() {
                private val inner = ByteArrayInputStream(body)
                override fun read(): Int = inner.read()
                override fun read(b: ByteArray, off: Int, len: Int): Int {
                    val n = inner.read(b, off, minOf(len, 2_000))
                    if (!pausedOnce.getAndSet(true)) s.pause()
                    return n
                }
            }, body.size.toLong(), etag = "\"e1\"")
        }, rangeOpener = { _, f, _ -> from.set(f); part(f) })
        s.enqueueJson(items(1).toString())
        waitFor("the pause") { JSONObject(s.stateJson()).isNull("active") && s.isPaused() }
        assertEquals(listOf("audio-bible-v1__kjv-c1.mp3.part"), parts())
        assertFalse("failed" in types() || "cancelled" in types())
        s.resume()
        waitFor("the resumed download") { s.isSaved(url(1)) }
        assertEquals(2_000L, from.get())
        assertTrue(body.contentEquals(s.fileFor(url(1))!!.readBytes()))
    }

    // ── waits that say why ────────────────────────────────────────────

    @Test
    fun `not enough room waits for space instead of failing, and goes on once room is made`() {
        val free = AtomicLong(0)
        val w = worker()
        val s = store(executor = w, free = { free.get() })
        s.enqueueJson(items(1).toString())
        waitFor("the space wait") { types().contains("waiting") }
        assertEquals("space", events.first { it.getString("type") == "waiting" }.getString("reason"))
        assertEquals("space", JSONObject(s.stateJson()).getString("reason"))
        assertFalse("failed" in types())
        free.set(10L shl 30)
        s.gateChanged()
        waitFor("the download") { s.isSaved(url(1)) }
    }

    @Test
    fun `with no network a failure waits for one and spends no retry`() {
        val up = AtomicBoolean(false)
        var tries = 0
        val w = worker()
        val s = store(executor = w, opener = { tries++; if (up.get()) whole() else null }, online = { up.get() })
        s.enqueueJson(items(1).toString())
        waitFor("the offline wait") { JSONObject(s.stateJson()).optString("reason") == "offline" }
        assertFalse("failed" in types(), "no network is a wait, never a failure")
        up.set(true)
        s.gateChanged()
        waitFor("the download") { s.isSaved(url(1)) }
    }

    @Test
    fun `a server that keeps failing is a failure only after the retries, and leaves the queue`() {
        var tries = 0
        val s = store(opener = { tries++; null }, retries = listOf(1L, 1L, 1L))
        s.enqueueJson(items(2).toString())
        assertEquals(2 * 4, tries, "one try and three retries each")
        assertEquals(2, types().count { it == "failed" })
        val st = JSONObject(s.stateJson())
        assertEquals(0, st.getJSONObject("left").getInt("count"))
        assertEquals(2, st.getJSONObject("batch").getInt("failed"))
        assertEquals(0, state().getJSONArray("queued").length(), "a failure does not come back at the next start")
    }

    // ── the production Range parse and the notification's words ──────

    @Test
    fun `Content-Range is read strictly`() {
        assertEquals(4000L to 10000L, OfflineAudioStore.parseContentRange("bytes 4000-9999/10000"))
        assertEquals(-1L to -1L, OfflineAudioStore.parseContentRange("bytes 4000-9999/*"))
        assertEquals(-1L to -1L, OfflineAudioStore.parseContentRange("bytes 9999-4000/10000"))
        assertEquals(-1L to -1L, OfflineAudioStore.parseContentRange(null))
    }

    @Test
    fun `the notification says how far the batch is, and why it waits`() {
        val s = OfflineAudioStore.Summary(busy = true, paused = false, reason = null, done = 2, total = 31, failed = 0,
            activeBytes = 3L shl 20, activeTotal = 12L shl 20, leftBytes = 232L shl 20, wifiOnly = false)
        val (title, text, progress) = DownloadJob.words(s)
        assertEquals("Downloading 3 of 31", title)
        assertEquals("3.0 MB of 12 MB · 232 MB left", text)
        assertTrue(progress in 70..80, "progress $progress")
        val w = DownloadJob.words(OfflineAudioStore.Summary(true, false, "wifi", 2, 31, 0, 0, -1, 0, true))
        assertEquals("Waiting for Wi-Fi", w.first)
        assertEquals("2 of 31 on this phone", w.second)
    }
}
