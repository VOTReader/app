package com.votreader.sacredui

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
import java.io.InputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Download only on Wi-Fi (ra6, Corbin 2026-10-14, brief design-10): with the switch on and the network metered, a
 * download waits in the queue and lands once the network is unmetered; one on its way stops, keeps no bytes, and
 * starts again from the top on Wi-Fi; a cancel ends the wait. Off (the default) nothing changes. A real worker thread:
 * the wait is the worker's.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class OfflineAudioWifiOnlyTest {

    @get:Rule val tmp = TemporaryFolder()

    private val url1 = "https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-christmas-B.mp3"
    private val body = ByteArray(1000) { (it % 251).toByte() }
    private val events = ArrayList<JSONObject>()
    private val worker = Executors.newSingleThreadExecutor()
    private val unmetered = AtomicBoolean(false)
    private val opens = AtomicInteger()

    @After fun stop() { worker.shutdownNow() }

    private fun store(opener: (String) -> OfflineAudioStore.Opened? = { opens.incrementAndGet(); OfflineAudioStore.Opened(ByteArrayInputStream(body), body.size.toLong()) }) =
        OfflineAudioStore(tmp.root, opener = opener, executor = worker, freeBytes = { 10L shl 30 },
            emit = { synchronized(events) { events += JSONObject(it) } }, unmetered = { unmetered.get() })

    private fun item() = OfflineAudioStore.Item(url1, "one:christmas", "Christmas")

    private fun waitFor(what: String, cond: () -> Boolean) {
        val until = System.currentTimeMillis() + 5_000
        while (!cond()) {
            if (System.currentTimeMillis() > until) throw AssertionError("timed out waiting for $what")
            Thread.sleep(20)
        }
    }

    private fun types() = synchronized(events) { events.map { it.getString("type") } }

    private fun leftovers() = File(tmp.root, "offline-audio").listFiles { f -> f.name.endsWith(".part") }?.map { it.name } ?: emptyList()

    @Test
    fun `on a metered network a download waits in the queue, then lands once the network is unmetered`() {
        val s = store()
        s.setWifiOnly(true)
        synchronized(events) { events.clear() }
        s.enqueue(listOf(item()))
        Thread.sleep(300)
        assertEquals(0, opens.get(), "nothing fetched over mobile data")
        assertEquals(listOf("queued", "checked"), types(), "the rows re-read the state at once")
        val st = JSONObject(s.stateJson())
        assertTrue(st.getBoolean("waiting"), "the rows can say Waiting for Wi-Fi")
        assertEquals(url1, st.getJSONArray("queued").getString(0))
        unmetered.set(true)
        s.gateChanged()
        waitFor("the download") { s.isSaved(url1) }
        assertEquals(1, opens.get())
        assertFalse(JSONObject(s.stateJson()).getBoolean("waiting"))
        assertTrue("checked" in types(), "each change of the gate tells the rows to re-read")
    }

    @Test
    fun `turning the switch off lets a waiting download go on`() {
        val s = store()
        s.setWifiOnly(true)
        s.enqueue(listOf(item()))
        Thread.sleep(200)
        assertEquals(0, opens.get())
        s.setWifiOnly(false)
        waitFor("the download") { s.isSaved(url1) }
    }

    @Test
    fun `one on its way stops when the network turns metered, keeps no bytes, and starts again from the top on Wi-Fi`() {
        unmetered.set(true)
        val s = store(opener = {
            val n = opens.incrementAndGet()
            val input = object : InputStream() {
                private val inner = ByteArrayInputStream(body)
                override fun read(): Int = inner.read()
                override fun read(b: ByteArray, off: Int, len: Int): Int {
                    // The first try loses Wi-Fi after its first chunk.
                    if (n == 1) unmetered.set(false)
                    return inner.read(b, off, len)
                }
            }
            OfflineAudioStore.Opened(input, body.size.toLong())
        })
        s.setWifiOnly(true)
        s.enqueue(listOf(item()))
        waitFor("the stop") { JSONObject(s.stateJson()).getBoolean("waiting") }
        assertFalse(s.isSaved(url1))
        assertEquals(emptyList(), leftovers(), "no partial bytes kept")
        val st = JSONObject(s.stateJson())
        assertEquals(url1, st.getJSONArray("queued").getString(0), "back in the queue")
        assertTrue(st.isNull("active"))
        assertFalse(types().any { it == "failed" || it == "cancelled" || it == "done" }, "a wait, not a failure: ${types()}")
        unmetered.set(true)
        s.gateChanged()
        waitFor("the second try") { s.isSaved(url1) }
        assertEquals(2, opens.get(), "started again from the top")
        assertEquals(body.size.toLong(), s.fileFor(url1)!!.length())
    }

    @Test
    fun `a cancel ends the wait, and Wi-Fi afterwards fetches nothing`() {
        val s = store()
        s.setWifiOnly(true)
        s.enqueue(listOf(item()))
        Thread.sleep(200)
        s.cancel(listOf(url1))
        assertEquals("cancelled", synchronized(events) { events.last().getString("type") })
        unmetered.set(true)
        s.gateChanged()
        Thread.sleep(300)
        assertEquals(0, opens.get())
        assertFalse(s.isSaved(url1))
        assertFalse(JSONObject(s.stateJson()).getBoolean("waiting"))
    }

    @Test
    fun `off by default a metered network downloads as before`() {
        val s = store()
        s.enqueue(listOf(item()))
        waitFor("the download") { s.isSaved(url1) }
        assertFalse(JSONObject(s.stateJson()).getBoolean("waiting"))
    }
}
