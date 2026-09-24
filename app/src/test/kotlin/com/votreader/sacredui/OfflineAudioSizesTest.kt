package com.votreader.sacredui

import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.Executor
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Listening item 8: the rows say "Download · 18 MB" and the collection confirm says "29 recordings · 210 MB" BEFORE
 * anything is downloaded, so the sizes come from the release itself: one listing per release tag (GitHub's release
 * JSON carries every asset's size), cached on the phone for a week, with a HEAD per file only for what a listing does
 * not answer. The answer goes to the page as one event: {type: "sizes", sizes: {url: bytes}}.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class OfflineAudioSizesTest {

    @get:Rule val tmp = TemporaryFolder()

    private val base = "https://github.com/VOTReader/votreader-assets/releases/download/"
    private val a1 = base + "audio-v1/one-christmas-B.mp3"
    private val a2 = base + "audio-v1/one-wide-path-B.mp3"
    private val b1 = base + "audio-brm-v1/brm-genesis-001.mp3"
    private val direct = Executor { it.run() }
    private val events = mutableListOf<JSONObject>()
    private var now = 1_000_000L

    private fun store(
        lister: (String) -> Map<String, Long>?,
        head: (String) -> Long? = { null },
    ) = OfflineAudioStore(
        tmp.root, opener = { null }, executor = direct, freeBytes = { 1L shl 40 }, emit = { events += JSONObject(it) },
        clock = { now }, sizeLister = lister, headSize = head, sizeExecutor = direct,
    )

    private fun lastSizes(): JSONObject = events.last { it.getString("type") == "sizes" }.getJSONObject("sizes")

    @Test
    fun `one listing per release answers every recording in it, and the next ask is served from the cache`() {
        val asked = mutableListOf<String>()
        val s = store(lister = { tag -> asked += tag; mapOf("one-christmas-B.mp3" to 18_000_000L, "one-wide-path-B.mp3" to 6_000_000L) })
        s.requestSizes(listOf(a1, a2))
        assertEquals(listOf("audio-v1"), asked)
        assertEquals(18_000_000L, lastSizes().getLong(a1))
        assertEquals(6_000_000L, lastSizes().getLong(a2))
        s.requestSizes(listOf(a1))
        assertEquals(listOf("audio-v1"), asked, "a fresh cache is not asked again")
        assertEquals(18_000_000L, lastSizes().getLong(a1))
    }

    @Test
    fun `the cache outlives the store and expires after a week`() {
        val asked = mutableListOf<String>()
        val lister: (String) -> Map<String, Long>? = { tag -> asked += tag; mapOf("brm-genesis-001.mp3" to 3_000_000L) }
        store(lister).requestSizes(listOf(b1))
        store(lister).requestSizes(listOf(b1))
        assertEquals(1, asked.size, "a new store reads the cached listing from disk")
        now += 8L * 24 * 3600 * 1000
        store(lister).requestSizes(listOf(b1))
        assertEquals(2, asked.size, "a week-old listing is fetched again")
    }

    @Test
    fun `what a listing does not answer is asked by HEAD, and a failed listing falls back entirely`() {
        val heads = mutableListOf<String>()
        val s = store(lister = { mapOf("one-christmas-B.mp3" to 18L) }, head = { url -> heads += url; 7L })
        s.requestSizes(listOf(a1, a2))
        assertEquals(listOf(a2), heads)
        assertEquals(7L, lastSizes().getLong(a2))

        val heads2 = mutableListOf<String>()
        val t = store(lister = { null }, head = { url -> heads2 += url; 9L })
        t.requestSizes(listOf(b1))
        assertEquals(listOf(b1), heads2)
        assertEquals(9L, lastSizes().getLong(b1))
    }

    @Test
    fun `urls outside the audio releases are never looked up`() {
        var listed = 0
        var headed = 0
        val s = store(lister = { listed++; emptyMap() }, head = { headed++; 1L })
        s.requestSizes(listOf("https://example.com/x.mp3"))
        assertEquals(0, listed)
        assertEquals(0, headed)
        assertTrue(events.none { it.getString("type") == "sizes" && it.getJSONObject("sizes").length() > 0 })
    }

    @Test
    fun `a failed listing is not asked again for ten minutes, and HEADs are capped per ask`() {
        var listed = 0
        var headed = 0
        val s = store(lister = { listed++; null }, head = { headed++; 5L })
        val many = (1..60).map { base + "audio-v1/letter-$it-B.mp3" }
        s.requestSizes(many)
        assertEquals(1, listed)
        assertEquals(40, headed, "at most 40 HEADs for one ask")
        s.requestSizes(many)
        assertEquals(1, listed, "a failed listing is remembered")
        now += 11L * 60 * 1000
        s.requestSizes(many)
        assertEquals(2, listed, "and asked again after ten minutes")
    }
}
