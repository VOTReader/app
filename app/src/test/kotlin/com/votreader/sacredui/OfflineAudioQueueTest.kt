package com.votreader.sacredui

import androidx.test.core.app.ApplicationProvider
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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
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
    private fun pool() = Executors.newFixedThreadPool(OfflineAudioStore.PARALLEL).also { workers += it }

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
        later: List<Long> = listOf(600_000L),
    ) = OfflineAudioStore(tmp.root, opener = opener, executor = executor, freeBytes = free,
        emit = { synchronized(events) { events += JSONObject(it) } },
        rangeOpener = rangeOpener ?: { u, _, _ -> opener(u) }, online = online, retryDelays = retries, laterDelays = later)

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
        synchronized(events) { events.clear() }
        val gate = CountDownLatch(1)
        // The second update never gets an answer (the app is killed while it waits); the first lands.
        val s1 = store(executor = pool(), opener = { u -> if (u == url(2)) { gate.await(5, TimeUnit.SECONDS); null } else whole() })
        s1.enqueue(listOf(1, 2).map { OfflineAudioStore.Item(url(it), "bible-kjv-$it", "Chapter $it", update = true) })
        waitFor("the first update") { types().contains("done") }
        val st = state()
        gate.countDown()
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
        waitFor("the retry") { s.isSaved(url(1)) }
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

    // dl-rework D (defects 18, 19): after the quick retries a failure was dropped, and a restart forgot it.
    @Test
    fun `a download that keeps failing goes on the will-try-again list after the retries, and comes back at the next start`() {
        val tries = java.util.concurrent.atomic.AtomicInteger()
        val s = store(opener = { tries.incrementAndGet(); null }, retries = listOf(1L, 1L, 1L), later = listOf(600_000L))
        s.enqueueJson(items(2).toString())
        waitFor("both on the list") { types().count { it == "failed" } == 2 }
        assertEquals(2 * 4, tries.get(), "one try and three retries each")
        val st = JSONObject(s.stateJson())
        assertEquals(0, st.getJSONObject("left").getInt("count"))
        assertEquals(2, st.getJSONObject("batch").getInt("failed"))
        assertEquals("later", st.getString("reason"))
        assertEquals(2, st.getJSONArray("later").length())
        assertEquals("network", st.getJSONArray("later").getJSONObject(0).getString("reason"))
        assertTrue(st.getJSONArray("later").getJSONObject(0).getLong("at") > System.currentTimeMillis() + 60_000, "its next try is minutes away")
        val again = state()
        assertEquals(2, again.getJSONArray("later").length(), "kept across a restart")
        assertEquals(0, again.getJSONArray("queued").length())
        // The next start tries it at once (a start is one of its times), and it lands.
        val s3 = store()
        waitFor("the next start's try") { s3.isSaved(url(1)) && s3.isSaved(url(2)) }
    }

    // dl-rework D (defect 23): a GitHub 404 or 5xx read as no network.
    @Test
    fun `a 404 or a 5xx is the server's answer with its status, not no network`() {
        val s = store(opener = { throw OfflineAudioStore.ServerAnswer(404) })
        s.enqueueJson(items(1).toString())
        waitFor("the list") { types().contains("failed") }
        val failed = events.first { it.getString("type") == "failed" }
        assertEquals("server", failed.getString("reason"))
        assertEquals(404, failed.getInt("status"))
        val later = JSONObject(s.stateJson()).getJSONArray("later").getJSONObject(0)
        assertEquals(404, later.getInt("status"))
        val saved = JSONObject(File(dir(), "queue.json").readText()).getJSONArray("items").getJSONObject(0)
        assertEquals(true, saved.getBoolean("later"))
        assertEquals("server", saved.getString("reason"))
        assertEquals(404, saved.getInt("status"))
    }

    // dl-rework D (defect 9): one at a time, first in first out; a tap waited behind a whole edition.
    @Test
    fun `three download at once, and one tapped by itself goes ahead of a set`() {
        val gates = ConcurrentHashMap<String, CountDownLatch>()
        val opened = java.util.Collections.synchronizedList(ArrayList<String>())
        val s = store(executor = pool(), opener = { u ->
            opened += u
            gates.getOrPut(u) { CountDownLatch(1) }.await(5, TimeUnit.SECONDS)
            whole()
        })
        for (i in 1..5) gates[url(i)] = CountDownLatch(1)
        gates[url(9)] = CountDownLatch(0)
        s.enqueueJson(items(5).toString())
        waitFor("three on their way") { opened.size == 3 }
        Thread.sleep(100)
        assertEquals(3, opened.size, "never more than three at once")
        assertEquals(3, JSONObject(s.stateJson()).getJSONArray("actives").length())
        s.enqueueJson(JSONArray().put(JSONObject().put("url", url(9)).put("key", "k").put("title", "tapped").put("pri", "tap")).toString())
        val q = JSONObject(s.stateJson()).getJSONArray("queue")
        assertEquals(url(9), q.getJSONObject(3).getString("url"), "next in line, ahead of the set")
        gates[url(1)]!!.countDown()
        waitFor("the next to start") { opened.size >= 4 }
        assertEquals(url(9), opened[3])
        for (i in 2..5) gates[url(i)]!!.countDown()
        waitFor("all") { (1..5).all { s.isSaved(url(it)) } && s.isSaved(url(9)) }
    }

    // dl-rework D (defect 11): the first one that did not fit held the whole queue.
    @Test
    fun `one that does not fit is stepped over, and the queue holds only when nothing left fits`() {
        val room = 50_000L
        val s = store(executor = pool(), free = { (200L shl 20) + room })
        val big = JSONObject().put("url", url(1)).put("key", "k").put("title", "big").put("bytes", 10_000_000)
        val small = JSONObject().put("url", url(2)).put("key", "k").put("title", "small").put("bytes", body.size)
        s.enqueueJson(JSONArray().put(big).put(small).toString())
        waitFor("the small one") { s.isSaved(url(2)) }
        waitFor("the hold") { JSONObject(s.stateJson()).optString("reason") == "space" }
        assertFalse(s.isSaved(url(1)))
        assertEquals(10_000_000L - room, JSONObject(s.stateJson()).getLong("need"), "the real shortfall")
        assertFalse("failed" in types(), "no room is a wait, never a failure")
    }

    // dl-rework: resume.json names every download on its way; the one-entry file from before is read as a list of one.
    @Test
    fun `several downloads on their way keep their bytes across a kill and each resumes from its own`() {
        val s1 = store(executor = held)
        s1.enqueueJson(items(2).toString())
        File(dir(), "audio-bible-v1__kjv-c1.mp3.part").writeBytes(body.copyOf(3_000))
        File(dir(), "audio-bible-v1__kjv-c2.mp3.part").writeBytes(body.copyOf(6_000))
        File(dir(), "resume.json").writeText(JSONObject().put("v", 2).put("items", JSONArray()
            .put(JSONObject().put("url", url(1)).put("total", body.size).put("etag", "\"e1\"").put("synced", 3_000))
            .put(JSONObject().put("url", url(2)).put("total", body.size).put("etag", "\"e1\"").put("synced", 5_000))).toString())
        val froms = java.util.Collections.synchronizedList(ArrayList<Long>())
        val s2 = store(opener = { throw AssertionError("must resume, not start over") }, rangeOpener = { _, from, _ -> froms += from; part(from) })
        assertEquals(listOf(3_000L, 5_000L), froms.sorted(), "each from its own synced bytes")
        assertTrue(body.contentEquals(s2.fileFor(url(1))!!.readBytes()))
        assertTrue(body.contentEquals(s2.fileFor(url(2))!!.readBytes()))
        assertFalse(File(dir(), "resume.json").exists())
    }

    // dl-rework (defect 13): a pending job kept the rule it was scheduled with; turning the switch off left it on Wi-Fi.
    @Test
    fun `a pending job is replaced when the queue needs the other network rule`() {
        val app = ApplicationProvider.getApplicationContext<android.content.Context>()
        val js = app.getSystemService(android.app.job.JobScheduler::class.java)
        val s = OfflineAudioStore(tmp.root, opener = { whole() }, executor = held, unmetered = { false })
        s.setWifiOnly(true)
        s.enqueueJson(items(1).toString())
        DownloadJob.schedule(app, s)
        assertEquals(true, js.getPendingJob(DownloadJob.JOB_ID)!!.extras.getBoolean(DownloadJob.EXTRA_UNMETERED))
        s.setWifiOnly(false)
        DownloadJob.schedule(app, s)
        assertEquals(false, js.getPendingJob(DownloadJob.JOB_ID)!!.extras.getBoolean(DownloadJob.EXTRA_UNMETERED))
        assertEquals(android.app.job.JobInfo.NETWORK_TYPE_ANY, js.getPendingJob(DownloadJob.JOB_ID)!!.networkType)
    }

    // dl-rework (defects 12, 13): the job's network rule follows the queue.
    @Test
    fun `the job is wanted only for work it can do, and asks for Wi-Fi when only automatic ones are left`() {
        val auto = JSONArray().put(JSONObject().put("url", url(1)).put("key", "k").put("title", "auto").put("wifi", true))
        val s = OfflineAudioStore(tmp.root, opener = { whole() }, executor = held, unmetered = { false })
        s.enqueueJson(auto.toString())
        assertTrue(s.summary().needsUnmetered, "only an automatic download is left: it needs Wi-Fi")
        assertTrue(DownloadJob.wanted(s.summary()))
        s.enqueueJson(items(2).toString())
        assertFalse(s.summary().needsUnmetered, "the listener's own run on any network")
        s.setWifiOnly(true)
        assertTrue(s.summary().needsUnmetered, "the switch on: Wi-Fi only")
        s.pause()
        assertFalse(DownloadJob.wanted(s.summary()))
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
