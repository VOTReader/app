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

    @Test
    fun `the HEAD budget is per release and window, not per call, so rows asking one by one spend 40 (n2-02)`() {
        var headed = 0
        val s = store(lister = { null }, head = { headed++; 5L })
        (1..66).forEach { s.requestSizes(listOf(base + "audio-v1/letter-$it-B.mp3")) }
        assertEquals(40, headed)
        s.requestSizes(listOf(b1))
        assertEquals(41, headed, "another release has its own budget")
        now += 11L * 60 * 1000
        s.requestSizes(listOf(base + "audio-v1/letter-99-B.mp3"))
        assertEquals(42, headed, "a new window, a new budget")
    }

    @Test
    fun `each answer names what it was asked, answered or not`() {
        val s = store(lister = { null })
        s.requestSizes(listOf(a1, a1, "https://example.com/x.mp3"))
        val last = events.last()
        assertEquals("sizes", last.getString("type"))
        val asked = last.getJSONArray("asked")
        assertEquals(listOf(a1, "https://example.com/x.mp3"), (0 until asked.length()).map { asked.getString(it) })
        assertEquals(0, last.getJSONObject("sizes").length())
    }

    // ── n2-01: a recording uploaded again (same URL, new bytes) shows as an update ──

    private fun savingStore(lister: (String) -> Map<String, Long>?, body: () -> ByteArray) = OfflineAudioStore(
        tmp.root, opener = { OfflineAudioStore.Opened(java.io.ByteArrayInputStream(body()), body().size.toLong()) },
        executor = direct, freeBytes = { 1L shl 40 }, emit = { events += JSONObject(it) },
        clock = { now }, sizeLister = lister, headSize = { null }, sizeExecutor = direct,
    )

    private fun staleOf(s: OfflineAudioStore, url: String): Boolean {
        val items = JSONObject(s.stateJson()).getJSONArray("items")
        return (0 until items.length()).map { items.getJSONObject(it) }.first { it.getString("url") == url }.optBoolean("stale", false)
    }

    @Test
    fun `a recording whose release asset changed size is stale once the shelf checks, and an update replaces it`() {
        var listed = 1000L
        var bytes = ByteArray(1000) { 1 }
        val s = savingStore(lister = { mapOf("one-christmas-B.mp3" to listed) }, body = { bytes })
        s.enqueue(listOf(OfflineAudioStore.Item(a1, "one:christmas", "Christmas")))
        assertTrue(s.isSaved(a1))
        s.checkSaved()
        assertEquals("checked", events.last().getString("type"))
        assertEquals(false, staleOf(s, a1), "the same size: not stale")
        listed = 900L                                   // uploaded again, trimmed
        now += 7L * 3600 * 1000                         // the shelf opens later: its listing is older than 6 h
        s.checkSaved()
        assertEquals(true, staleOf(s, a1))
        s.enqueue(listOf(OfflineAudioStore.Item(a1, "one:christmas", "Christmas")))
        assertEquals(1, events.count { it.optString("type") == "queued" }, "a plain download of a saved one is refused")
        bytes = ByteArray(900) { 2 }
        s.enqueue(listOf(OfflineAudioStore.Item(a1, "one:christmas", "Christmas", update = true)))
        assertTrue(s.isSaved(a1))
        assertEquals(900L, s.fileFor(a1)!!.length())
        assertEquals(false, staleOf(s, a1), "the new bytes match the listing")
    }

    @Test
    fun `a stored index without the new field reads as before, and no listing means not stale`() {
        val s = savingStore(lister = { null }, body = { ByteArray(10) { 3 } })
        s.enqueue(listOf(OfflineAudioStore.Item(a1, "one:christmas", "Christmas")))
        s.checkSaved()
        assertEquals(false, staleOf(s, a1))
        val again = savingStore(lister = { null }, body = { ByteArray(0) })   // a new store reads the index from disk
        assertTrue(again.isSaved(a1))
        assertEquals(10L, again.fileFor(a1)!!.length())
    }

    @Test
    fun `remove during an update stops it, so the recording does not come back`() {
        val held = mutableListOf<Runnable>()
        val s = OfflineAudioStore(
            tmp.root, opener = { OfflineAudioStore.Opened(java.io.ByteArrayInputStream(ByteArray(5)), 5L) },
            executor = { held += it }, freeBytes = { 1L shl 40 }, emit = { events += JSONObject(it) },
            clock = { now }, sizeLister = { null }, headSize = { null }, sizeExecutor = direct,
        )
        s.enqueue(listOf(OfflineAudioStore.Item(a1, "k", "t")))
        held.removeAt(0).run()
        assertTrue(s.isSaved(a1))
        s.enqueue(listOf(OfflineAudioStore.Item(a1, "k", "t", update = true)))
        s.remove(listOf(a1))
        held.forEach { it.run() }
        assertEquals(false, s.isSaved(a1))
    }

    @Test
    fun `a download newer than the cached listing is not stale (the refuter's repro)`() {
        var listed = 1000L
        val s = savingStore(lister = { mapOf("one-christmas-B.mp3" to listed) }, body = { ByteArray(900) { 4 } })
        s.requestSizes(listOf(a1))                      // the collection screen cached 1000
        listed = 900L                                   // then the asset was uploaded again
        now += 3600L * 1000                             // an hour on, the listener downloads it: 900 bytes, current
        s.enqueue(listOf(OfflineAudioStore.Item(a1, "one:christmas", "Christmas")))
        assertEquals(900L, s.fileFor(a1)!!.length())
        assertEquals(false, staleOf(s, a1))
        s.checkSaved()                                  // the cache is under 6 h old: not read again, still not stale
        assertEquals(false, staleOf(s, a1))
        val again = savingStore(lister = { null }, body = { ByteArray(0) })   // and after a restart, offline
        assertEquals(false, staleOf(again, a1))
    }
}
