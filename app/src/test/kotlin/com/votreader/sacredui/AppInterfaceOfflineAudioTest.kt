package com.votreader.sacredui

import io.mockk.mockk
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.util.concurrent.Executor
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Listening item 8: the page's side of the offline store. JS hands the bridge JSON (a list of {url, key, title} to
 * download, a list of urls or ["*"] to remove or cancel) and reads the whole state back as JSON. Untrusted input:
 * bad JSON, a non-array, a missing store (an older host) must each be a quiet no-op, never a throw across the bridge.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class AppInterfaceOfflineAudioTest {

    @get:Rule val tmp = TemporaryFolder()

    private val url1 = "https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-christmas-B.mp3"
    private val url2 = "https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-wide-path-B.mp3"
    private val events = mutableListOf<JSONObject>()

    private fun subject(): Pair<AppInterface, OfflineAudioStore> {
        val store = OfflineAudioStore(
            tmp.root,
            opener = { OfflineAudioStore.Opened(ByteArrayInputStream(ByteArray(100)), 100L) },
            executor = Executor { it.run() },
            freeBytes = { 10L shl 30 },
            emit = { events += JSONObject(it) },
            sizeLister = { mapOf("one-christmas-B.mp3" to 18_000_000L) },
            headSize = { null },
            sizeExecutor = Executor { it.run() },
        )
        val host = object : BridgeHost by FakeBridgeHost() {
            override val offlineAudio: OfflineAudioStore get() = store
        }
        return AppInterface(host, mockk(relaxed = true), mockk(relaxed = true)) to store
    }

    @Test
    fun `save downloads each listed recording, state reports them, remove takes them off`() {
        val (app, store) = subject()
        app.offlineAudioSave("""[{"url":"$url1","key":"one:christmas","title":"Christmas"},{"url":"$url2","key":"one:wide-path","title":"The Wide Path"}]""")
        assertTrue(store.isSaved(url1))
        assertTrue(store.isSaved(url2))
        val state = JSONObject(app.offlineAudioState())
        assertEquals(2, state.getJSONArray("items").length())
        assertEquals(200L, state.getLong("totalBytes"))
        app.offlineAudioRemove("""["$url1"]""")
        assertFalse(store.isSaved(url1))
        app.offlineAudioRemove("""["*"]""")
        assertFalse(store.isSaved(url2))
    }

    @Test
    fun `sizes are looked up for the listed recordings and answered as one event`() {
        val (app, _) = subject()
        app.offlineAudioSizes("""["$url1"]""")
        val sizes = events.last { it.getString("type") == "sizes" }.getJSONObject("sizes")
        assertEquals(18_000_000L, sizes.getLong(url1))
        app.offlineAudioSizes("not json")   // quiet
    }

    @Test
    fun `cancel reaches the store for a list and for everything`() {
        val held = mutableListOf<Runnable>()
        val store = OfflineAudioStore(
            tmp.root,
            opener = { OfflineAudioStore.Opened(ByteArrayInputStream(ByteArray(100)), 100L) },
            executor = Executor { held += it },
            freeBytes = { 10L shl 30 },
            emit = { events += JSONObject(it) },
            sizeLister = { null }, headSize = { null }, sizeExecutor = Executor { it.run() },
        )
        val host = object : BridgeHost by FakeBridgeHost() {
            override val offlineAudio: OfflineAudioStore get() = store
        }
        val app = AppInterface(host, mockk(relaxed = true), mockk(relaxed = true))
        app.offlineAudioSave("""[{"url":"$url1","key":"k1","title":"t1"},{"url":"$url2","key":"k2","title":"t2"}]""")
        app.offlineAudioCancel("""["$url1"]""")
        assertEquals(listOf(url1), events.filter { it.getString("type") == "cancelled" }.map { it.getString("url") })
        app.offlineAudioCancel("""["*"]""")
        assertEquals(listOf(url1, url2), events.filter { it.getString("type") == "cancelled" }.map { it.getString("url") })
        held.forEach { it.run() }
        assertFalse(store.isSaved(url1))
        assertFalse(store.isSaved(url2))
        app.offlineAudioCancel("[]")
        app.offlineAudioSizes("[]")
        app.offlineAudioRemove("[]")
    }

    @Test
    fun `bad input is a quiet no-op`() {
        val (app, store) = subject()
        app.offlineAudioSave(null)
        app.offlineAudioSave("not json")
        app.offlineAudioSave("""{"url":"$url1"}""")
        app.offlineAudioRemove("[1, {}]")
        app.offlineAudioCancel(null)
        assertFalse(store.isSaved(url1))
    }

    @Test
    fun `a host without the store answers an empty state and ignores the rest`() {
        val app = AppInterface(FakeBridgeHost(), mockk(relaxed = true), mockk(relaxed = true))
        assertEquals("", app.offlineAudioState())
        app.offlineAudioSave("""[{"url":"$url1","key":"k","title":"t"}]""")
    }
}
