package com.votreader.sacredui

import android.net.Uri
import android.os.Build
import androidx.media3.common.MediaItem
import androidx.media3.session.CommandButton
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Item 11: PlaybackService — the ExoPlayer / Media3 service. Its inner classes
 * (PageOwnsTheQueue, Callback) stay private, so what is pinned here is what the service
 * exposes: it constructs under Robolectric (onCreate builds its real ExoPlayer +
 * MediaSession), and the companion surface — resolve, buttons, setSkipSeconds.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class PlaybackServiceTest {

    @After
    fun restoreSkip() {
        PlaybackService.setSkipSeconds(10.0)
        PlaybackService.commandSink = null
    }

    @Test
    fun `service constructs under Robolectric`() {
        var thrown: Throwable? = null
        try {
            Robolectric.setupService(PlaybackService::class.java)
        } catch (t: Throwable) {
            thrown = t
        }
        assertNull(thrown, "setupService threw: $thrown")
    }

    @Test
    fun `resolve restores the uri and mime from request metadata`() {
        val playableUrl = "https://votreader.github.io/songs/x.mp3"
        val item = MediaItem.Builder().setMediaId("s1")
            .setRequestMetadata(
                MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(playableUrl)).build(),
            ).build()
        val resolved = PlaybackService.resolve(item)
        assertEquals(Uri.parse(playableUrl), resolved.localConfiguration?.uri)
        assertEquals("audio/mpeg", resolved.localConfiguration?.mimeType)
    }

    @Test
    fun `resolve falls back to the mediaId pipe and refuses a foreign host`() {
        // A github.com url without the /VOTReader/ prefix is not ours either.
        val bad = MediaItem.Builder().setMediaId("s2|https://example.com/x.mp3").build()
        assertEquals(Uri.EMPTY, PlaybackService.resolve(bad).localConfiguration?.uri)
        val githubOther = MediaItem.Builder().setMediaId("s3|https://github.com/other/x.mp3").build()
        assertEquals(Uri.EMPTY, PlaybackService.resolve(githubOther).localConfiguration?.uri)
    }

    @Test
    fun `resolve accepts a github release asset under VOTReader`() {
        val item = MediaItem.Builder()
            .setMediaId("s4|https://github.com/VOTReader/releases/download/v1/x.mp3").build()
        val resolved = PlaybackService.resolve(item)
        assertEquals(Uri.parse("https://github.com/VOTReader/releases/download/v1/x.mp3"), resolved.localConfiguration?.uri)
        assertEquals("audio/mpeg", resolved.localConfiguration?.mimeType)
    }

    @Test
    fun `buttons are empty for a song and four spoken-word buttons otherwise`() {
        assertTrue(PlaybackService.buttons(false).isEmpty())
        val spoken = PlaybackService.buttons(true)
        assertEquals(4, spoken.size)
        assertEquals("Back 10 seconds", spoken[0].displayName)
        assertTrue(CommandButton.SLOT_BACK in spoken[0].slots)
        assertEquals("Forward 10 seconds", spoken[1].displayName)
        assertTrue(CommandButton.SLOT_FORWARD in spoken[1].slots)
        assertEquals("Previous", spoken[2].displayName)
        assertEquals("Next", spoken[3].displayName)
    }

    @Test
    fun `buttons follow the skip step`() {
        PlaybackService.setSkipSeconds(15.0)
        val spoken = PlaybackService.buttons(true)
        assertEquals("Back 15 seconds", spoken[0].displayName)
        assertEquals("Forward 15 seconds", spoken[1].displayName)
    }

    @Test
    fun `setSkipSeconds clamps to the 5 to 60 second range and restores the default`() {
        PlaybackService.setSkipSeconds(15.0)
        assertEquals(15_000L, PlaybackService.skipMs)
        PlaybackService.setSkipSeconds(Double.NaN)
        assertEquals(10_000L, PlaybackService.skipMs)
        PlaybackService.setSkipSeconds(2.0)
        assertEquals(5_000L, PlaybackService.skipMs)
        PlaybackService.setSkipSeconds(90.0)
        assertEquals(60_000L, PlaybackService.skipMs)
    }
}
