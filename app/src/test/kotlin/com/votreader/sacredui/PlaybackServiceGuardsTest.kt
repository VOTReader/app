package com.votreader.sacredui

import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config
import java.util.concurrent.ExecutionException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * audio-retire-n1: the guards of the exported PlaybackService, which PlaybackServiceTest (the companion surface)
 * does not reach.
 *  - PageOwnsTheQueue: what plays is the page's. Next and previous go to the page ([PlaybackService.commandSink]);
 *    a jump to another item, repeat and shuffle never reach the player; skip back and forward use the page's step.
 *  - Callback: another app's controller (system media card, Bluetooth, car, watch) gets transport only, and may
 *    not set what plays (onAddMediaItems refuses it).
 *  - The service's lifecycle: a swipe from recents ends playback, the skip step redraws the buttons, and a
 *    destroyed service no longer hears the step.
 *
 * PageOwnsTheQueue runs over a mock player, so every call it lets through (or holds back) is visible. The
 * Callback runs against the real session that onCreate builds; no media is ever prepared, so nothing streams.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class PlaybackServiceGuardsTest {

    private val sent = ArrayList<String>()
    private val inner = mockk<Player>(relaxed = true)
    private lateinit var queue: PlaybackService.PageOwnsTheQueue
    private var service: ServiceController<PlaybackService>? = null

    @Before
    fun setup() {
        every { inner.currentMediaItemIndex } returns 1
        every { inner.currentPosition } returns 30_000L
        every { inner.duration } returns 60_000L
        every { inner.availableCommands } returns
            Player.Commands.Builder().addAll(Player.COMMAND_PLAY_PAUSE, Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM).build()
        PlaybackService.commandSink = { cmd, _ -> sent += cmd }
        queue = PlaybackService.PageOwnsTheQueue(inner)
    }

    @After
    fun teardown() {
        PlaybackService.commandSink = null
        PlaybackService.setSkipSeconds(10.0)
        service?.destroy()
        service = null
        idleMain()
    }

    private fun idleMain() = shadowOf(Looper.getMainLooper()).idle()

    /** A live PlaybackService (onCreate ran: real ExoPlayer, real MediaSession). */
    private fun started(): PlaybackService {
        val sc = Robolectric.buildService(PlaybackService::class.java).create()
        service = sc
        return sc.get()
    }

    private fun controller(pkg: String): MediaSession.ControllerInfo =
        MediaSession.ControllerInfo.createTestOnlyControllerInfo(
            pkg, /* pid = */ 1, /* uid = */ 10_123, /* libraryVersion = */ 0, /* interfaceVersion = */ 0,
            /* trusted = */ false, Bundle.EMPTY, /* isPackageNameVerified = */ true,
        )

    private fun spokenItem(url: String) = MediaItem.Builder().setMediaId("7|$url")
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(url)).build())
        .build()

    private val playable = "https://votreader.github.io/songs/x.mp3"

    // ── PageOwnsTheQueue ──────────────────────────────────────────────

    @Test
    fun `next and previous are always offered, on top of the player's own commands`() {
        val commands = queue.availableCommands
        for (c in listOf(
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
            Player.COMMAND_PLAY_PAUSE, Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
        )) {
            assertTrue(commands.contains(c), "missing command $c")
            assertTrue(queue.isCommandAvailable(c), "isCommandAvailable($c) false")
        }
        assertFalse(queue.isCommandAvailable(Player.COMMAND_STOP), "a command the player lacks is not invented")
    }

    @Test
    fun `next and previous go to the page, never to the player`() {
        queue.seekToNext()
        queue.seekToNextMediaItem()
        queue.seekToPrevious()
        queue.seekToPreviousMediaItem()
        assertEquals(listOf("next", "next", "prev", "prev"), sent)
        verify(exactly = 0) { inner.seekToNext() }
        verify(exactly = 0) { inner.seekToNextMediaItem() }
        verify(exactly = 0) { inner.seekToPrevious() }
        verify(exactly = 0) { inner.seekToPreviousMediaItem() }
    }

    @Test
    fun `next with no page listening is dropped quietly`() {
        PlaybackService.commandSink = null
        queue.seekToNext()
        queue.seekToPrevious()
        verify(exactly = 0) { inner.seekToNext() }
        verify(exactly = 0) { inner.seekToPrevious() }
    }

    @Test
    fun `a jump to another item is refused, a seek within the current one goes through`() {
        queue.seekTo(2, 0L)
        queue.seekTo(0, 5_000L)
        queue.seekToDefaultPosition(0)
        queue.seekToDefaultPosition(3)
        verify(exactly = 0) { inner.seekTo(2, any()) }
        verify(exactly = 0) { inner.seekTo(0, any()) }
        verify(exactly = 0) { inner.seekToDefaultPosition(any()) }

        queue.seekTo(1, 5_000L)
        queue.seekToDefaultPosition(1)
        verify(exactly = 1) { inner.seekTo(1, 5_000L) }
        verify(exactly = 1) { inner.seekToDefaultPosition(1) }
    }

    @Test
    fun `repeat and shuffle never reach the player`() {
        queue.repeatMode = Player.REPEAT_MODE_ALL
        queue.repeatMode = Player.REPEAT_MODE_ONE
        queue.shuffleModeEnabled = true
        verify(exactly = 0) { inner.repeatMode = any() }
        verify(exactly = 0) { inner.shuffleModeEnabled = any() }
    }

    @Test
    fun `skip back and forward use the page's step, not ExoPlayer's`() {
        PlaybackService.setSkipSeconds(15.0)
        assertEquals(15_000L, queue.seekBackIncrement)
        assertEquals(15_000L, queue.seekForwardIncrement)
        queue.seekBack()
        queue.seekForward()
        verify(exactly = 1) { inner.seekTo(15_000L) }
        verify(exactly = 1) { inner.seekTo(45_000L) }
        verify(exactly = 0) { inner.seekBack() }
        verify(exactly = 0) { inner.seekForward() }
    }

    @Test
    fun `skip back stops at the start`() {
        every { inner.currentPosition } returns 3_000L
        queue.seekBack()
        verify(exactly = 1) { inner.seekTo(0L) }
    }

    @Test
    fun `skip forward stops at the end, and runs on when the length is unknown`() {
        every { inner.currentPosition } returns 55_000L
        queue.seekForward()
        verify(exactly = 1) { inner.seekTo(60_000L) }

        every { inner.duration } returns C.TIME_UNSET
        queue.seekForward()
        verify(exactly = 1) { inner.seekTo(65_000L) }
    }

    // ── Callback: the exported service's guards ───────────────────────

    @Test
    fun `another app's controller gets transport only`() {
        val svc = started()
        val car = controller("com.example.car")
        val session = assertNotNull(svc.onGetSession(car))
        val result = svc.Callback().onConnect(session, car)
        assertTrue(result.isAccepted)
        val cmds = result.availablePlayerCommands
        for (c in listOf(
            Player.COMMAND_CHANGE_MEDIA_ITEMS, Player.COMMAND_SET_MEDIA_ITEM, Player.COMMAND_SEEK_TO_MEDIA_ITEM,
            Player.COMMAND_SET_REPEAT_MODE, Player.COMMAND_SET_SHUFFLE_MODE,
        )) assertFalse(cmds.contains(c), "a foreign controller was given command $c")
        for (c in listOf(
            Player.COMMAND_PLAY_PAUSE, Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, Player.COMMAND_SEEK_BACK,
            Player.COMMAND_SEEK_FORWARD, Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_PREVIOUS,
        )) assertTrue(cmds.contains(c), "a foreign controller lost transport command $c")
    }

    @Test
    fun `the app's own controller may change what plays`() {
        val svc = started()
        val own = controller(svc.packageName)
        val session = assertNotNull(svc.onGetSession(own))
        val cmds = svc.Callback().onConnect(session, own).availablePlayerCommands
        assertTrue(cmds.contains(Player.COMMAND_CHANGE_MEDIA_ITEMS))
        assertTrue(cmds.contains(Player.COMMAND_SET_MEDIA_ITEM))
        assertTrue(cmds.contains(Player.COMMAND_SEEK_TO_MEDIA_ITEM))
    }

    @Test
    fun `another app may not set what plays`() {
        val svc = started()
        // A look-alike name is refused too: the check is exact, not a prefix.
        for (pkg in listOf("com.example.car", svc.packageName + ".evil")) {
            val foreign = controller(pkg)
            val session = assertNotNull(svc.onGetSession(foreign))
            val future = svc.Callback().onAddMediaItems(session, foreign, mutableListOf(spokenItem(playable)))
            assertTrue(future.isDone, "the refusal must not wait ($pkg)")
            val e = assertFailsWith<ExecutionException>("items from '$pkg' were accepted") { future.get() }
            assertIs<SecurityException>(e.cause)
        }
    }

    @Test
    fun `the app's own items come back with their uri restored`() {
        val svc = started()
        val own = controller(svc.packageName)
        val session = assertNotNull(svc.onGetSession(own))
        val foreignHost = "https://example.com/x.mp3"
        val items = svc.Callback()
            .onAddMediaItems(session, own, mutableListOf(spokenItem(playable), spokenItem(foreignHost))).get()
        assertEquals(2, items.size)
        assertEquals(Uri.parse(playable), items[0].localConfiguration?.uri)
        assertEquals("audio/mpeg", items[0].localConfiguration?.mimeType)
        // Even the app's own request cannot point the player off the allowed hosts.
        assertEquals(Uri.EMPTY, items[1].localConfiguration?.uri)
    }

    // ── the service's lifecycle ───────────────────────────────────────

    @Test
    fun `swiped away from recents, playback ends and the service stops itself`() {
        val svc = started()
        val player = assertNotNull(svc.onGetSession(controller(svc.packageName))).player
        assertIs<PlaybackService.PageOwnsTheQueue>(player)
        player.playWhenReady = true
        svc.onTaskRemoved(null)
        idleMain()
        assertFalse(player.playWhenReady)
        assertEquals(Player.STATE_IDLE, player.playbackState)
        assertTrue(shadowOf(svc).isStoppedBySelf)
    }

    @Test
    fun `spoken word shows the skip buttons, a song leaves media3 its own`() {
        val svc = started()
        val session = assertNotNull(svc.onGetSession(controller(svc.packageName)))
        assertEquals(4, session.mediaButtonPreferences.size, "nothing loaded yet counts as spoken word")

        session.player.setMediaItem(
            MediaItem.Builder().setMediaId("1|$playable").setUri(playable)
                .setMediaMetadata(MediaMetadata.Builder().setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC).build()).build(),
        )
        idleMain()
        assertTrue(session.mediaButtonPreferences.isEmpty(), "a song kept the skip buttons")

        session.player.setMediaItem(
            MediaItem.Builder().setMediaId("2|$playable").setUri(playable)
                .setMediaMetadata(
                    MediaMetadata.Builder().setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK_CHAPTER).build(),
                ).build(),
        )
        idleMain()
        assertEquals(4, session.mediaButtonPreferences.size, "spoken word lost the skip buttons")
    }

    @Test
    fun `a new skip step redraws the buttons with its number`() {
        val svc = started()
        val session = assertNotNull(svc.onGetSession(controller(svc.packageName)))
        assertEquals("Back 10 seconds", session.mediaButtonPreferences[0].displayName)
        PlaybackService.setSkipSeconds(20.0)
        idleMain()
        assertEquals("Back 20 seconds", session.mediaButtonPreferences[0].displayName)
        assertEquals("Forward 20 seconds", session.mediaButtonPreferences[1].displayName)
    }

    @Test
    fun `a destroyed service no longer hears the skip step`() {
        val sc = Robolectric.buildService(PlaybackService::class.java).create()
        idleMain()
        PlaybackService.setSkipSeconds(20.0)
        assertFalse(shadowOf(Looper.getMainLooper()).isIdle, "a live service redraws on a new step")
        idleMain()
        sc.destroy()
        idleMain()
        PlaybackService.setSkipSeconds(25.0)
        assertTrue(shadowOf(Looper.getMainLooper()).isIdle, "the dead service's redraw is still hooked")
        assertEquals(25_000L, PlaybackService.skipMs)
    }
}
