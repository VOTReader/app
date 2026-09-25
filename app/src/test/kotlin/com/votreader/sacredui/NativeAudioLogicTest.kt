package com.votreader.sacredui

import com.votreader.sacredui.NativeAudioLogic.RawJson
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * m3: the native player's decisions that need no Android. Plain JVM (JaCoCo measures it): the clamps on page input,
 * the mime a GitHub release asset needs, which urls may play, the hand-built JSON the page reads, and the journal of
 * seams crossed while the page was not listening.
 */
class NativeAudioLogicTest {

    @Test
    fun `a bad speed plays at 1x and a wild one is held to the player's range`() {
        assertEquals(1.25f, NativeAudioLogic.clampRate(1.25))
        assertEquals(1f, NativeAudioLogic.clampRate(0.0))
        assertEquals(1f, NativeAudioLogic.clampRate(-2.0))
        assertEquals(1f, NativeAudioLogic.clampRate(Double.NaN))
        assertEquals(1f, NativeAudioLogic.clampRate(Double.POSITIVE_INFINITY))
        assertEquals(0.25f, NativeAudioLogic.clampRate(0.01))
        assertEquals(4f, NativeAudioLogic.clampRate(9.0))
    }

    @Test
    fun `volume is 0 to 1 and a start before 0 is 0`() {
        assertEquals(0.4f, NativeAudioLogic.clampVolume(0.4))
        assertEquals(0f, NativeAudioLogic.clampVolume(-1.0))
        assertEquals(1f, NativeAudioLogic.clampVolume(3.0))
        assertEquals(1f, NativeAudioLogic.clampVolume(Double.NaN))
        assertEquals(0L, NativeAudioLogic.clampStartMs(-5L))
        assertEquals(1500L, NativeAudioLogic.clampStartMs(1500L))
    }

    @Test
    fun `an mp3 url says audio-mpeg whatever the host answers, others are sniffed`() {
        val release = "https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/one-christmas-B.mp3"
        assertEquals("audio/mpeg", NativeAudioLogic.mimeFor(release))
        assertEquals("audio/mpeg", NativeAudioLogic.mimeFor("https://x.io/A.MP3?download=1#t=3"))
        assertEquals("audio/mp4", NativeAudioLogic.mimeFor("https://x.io/a.m4a"))
        assertEquals("audio/mp4", NativeAudioLogic.mimeFor("https://x.io/a.aac"))
        assertEquals("audio/ogg", NativeAudioLogic.mimeFor("https://x.io/a.opus"))
        assertNull(NativeAudioLogic.mimeFor("https://x.io/stream"))
    }

    @Test
    fun `only https recordings (and a local test server) may play`() {
        assertTrue(NativeAudioLogic.playable("https://votreader.github.io/songs-1/a.mp3"))
        assertTrue(NativeAudioLogic.playable("http://127.0.0.1:8089/a.mp3"))
        assertTrue(NativeAudioLogic.playable("http://localhost:8089/a.mp3"))
        assertFalse(NativeAudioLogic.playable(null))
        assertFalse(NativeAudioLogic.playable("http://evil.example/a.mp3"))
        assertFalse(NativeAudioLogic.playable("file:///data/data/x/a.mp3"))
        assertFalse(NativeAudioLogic.playable("content://x/a"))
        assertFalse(NativeAudioLogic.playable("https://x.io/" + "a".repeat(NativeAudioLogic.MAX_URL)))
    }

    @Test
    fun `lock-screen text is bounded and null is empty`() {
        assertEquals("", NativeAudioLogic.label(null))
        assertEquals(NativeAudioLogic.MAX_TEXT, NativeAudioLogic.label("x".repeat(500)).length)
    }

    @Test
    fun `the JSON the page reads escapes everything a title can hold`() {
        assertEquals("\"a\\\"b\\\\c\\nd\\re\\tf\\u0001\\u2028\"", NativeAudioLogic.quote("a\"b\\c\nd\re\tf\u0001 "))
        assertEquals(
            "{\"s\":\"x\",\"b\":true,\"l\":5,\"f\":1.5,\"d\":0.5,\"n\":null,\"bad\":0,\"badf\":0,\"raw\":[1],\"o\":\"Seam\"}",
            NativeAudioLogic.obj(
                "s" to "x", "b" to true, "l" to 5L, "f" to 1.5f, "d" to 0.5, "n" to null,
                "bad" to Double.NaN, "badf" to Float.NaN, "raw" to RawJson("[1]"), "o" to "Seam",
            ),
        )
        assertEquals("{\"o\":\"X(1)\"}", NativeAudioLogic.obj("o" to object { override fun toString() = "X(1)" }))
    }

    @Test
    fun `the journal numbers every seam, keeps the last cap, and renders them`() {
        val j = NativeAudioLogic.Journal(cap = 2)
        assertEquals(0L, j.last())
        assertEquals(emptyList(), j.seams())
        val s1 = j.add("a", "b", 10L)
        j.add("b", "c", 20L)
        j.add("c", "d", 30L)
        assertEquals(1L, s1.seq)
        assertEquals(3L, j.last())
        assertEquals(listOf(2L, 3L), j.seams().map { it.seq })
        assertEquals(
            "[{\"seq\":2,\"from\":\"b\",\"url\":\"c\",\"at\":20},{\"seq\":3,\"from\":\"c\",\"url\":\"d\",\"at\":30}]",
            NativeAudioLogic.seamsJson(j.seams()).json,
        )
    }
}
