package com.votreader.sacredui

import org.junit.Test
import kotlin.test.assertEquals

/**
 * Item 10 - NativeAudioPort's own surface: the two default methods, and
 * the fake the controller's doc comment promises tests use. The pure
 * decisions (NativeAudioLogic) already have NativeAudioLogicTest; this
 * file pins only what that file does not: the interface contract itself.
 */
class NativeAudioTest {

    /** A port that records every call it receives, doing nothing. */
    private class FakePort : NativeAudioPort {
        val calls = ArrayList<String>()
        override fun load(json: String?) { calls += "load" }
        override fun play() { calls += "play" }
        override fun pause() { calls += "pause" }
        override fun seek(positionMs: Long) { calls += "seek" }
        override fun rate(rate: Double) { calls += "rate" }
        override fun volume(volume: Double) { calls += "volume" }
        override fun upcoming(json: String?) { calls += "upcoming" }
        override fun meta(json: String?) { calls += "meta" }
        override fun release() { calls += "release" }
        override fun journal(): String { calls += "journal"; return "fake-journal" }
    }

    @Test
    fun `default prewarm does nothing`() {
        val port = FakePort()
        port.prewarm()
        assertEquals(emptyList(), port.calls)
    }

    @Test
    fun `default loop does nothing`() {
        val port = FakePort()
        port.loop("{\"id\":1,\"url\":\"https://votreader.github.io/songs/x.mp3\",\"startMs\":0,\"endMs\":10000,\"times\":2,\"pass\":1}")
        assertEquals(emptyList(), port.calls)
    }

    @Test
    fun `fake port records the abstract calls`() {
        val port = FakePort()
        port.load(null)
        port.play()
        assertEquals("fake-journal", port.journal())
        assertEquals(listOf("load", "play", "journal"), port.calls)
    }
}
