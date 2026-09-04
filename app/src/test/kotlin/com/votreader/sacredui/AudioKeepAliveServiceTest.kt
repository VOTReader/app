package com.votreader.sacredui

import android.app.Application
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * AudioKeepAliveService — the mediaPlayback foreground service that anchors the
 * process while an audio letter streams.
 *
 * Two things are worth pinning on the JVM; everything else about a foreground
 * service (does the notification actually appear, does the process actually
 * survive a memory-pressure sweep) is owed to the device walk:
 *
 *   1. The NOTIFICATION CONSTANTS. The channel id is a user-visible identity —
 *      changing it strands whatever the user set on the old channel — and
 *      NOTIFICATION_ID must be non-zero or startForeground throws outright.
 *
 *   2. The DECISIONS. `usesTypedForeground` picks the API 29+ typed
 *      startForeground overload, and `setActive` picks start-vs-stop and (the
 *      part that bites) stops via stopService rather than a background
 *      startService. Robolectric records both so the choice is asserted, not
 *      read.
 *
 * @Config pins SDK=Q — the exact boundary of the typed-startForeground branch,
 * and the level the rest of the Robolectric suite already runs at.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class AudioKeepAliveServiceTest {

    // ─── notification identity ────────────────────────────────────────

    @Test
    fun `channel and notification constants are stable and legal`() {
        assertEquals("vot_audio_playback", AudioKeepAliveService.CHANNEL_ID)
        assertEquals("Audio playback", AudioKeepAliveService.CHANNEL_NAME)
        // (NOTIFICATION_TEXT retired 2026-08-09 — the MediaStyle notification
        // shows the real track title/artist from the now-playing snapshot.)
        // startForeground(0, ...) is an IllegalArgumentException on every API level.
        assertTrue(AudioKeepAliveService.NOTIFICATION_ID != 0)
    }

    @Test
    fun `every service action is package-qualified`() {
        // A bare "STOP" would collide with a platform/third-party broadcast the
        // moment this service ever gets a notification action or a PendingIntent
        // — and since the media-card rework it HAS both.
        assertTrue(AudioKeepAliveService.ACTION_STOP.startsWith("com.votreader.sacredui."))
        assertTrue(AudioKeepAliveService.ACTION_UPDATE.startsWith("com.votreader.sacredui."))
        assertTrue(AudioKeepAliveService.ACTION_CMD.startsWith("com.votreader.sacredui."))
    }

    @Test
    fun `the session advertises the full transport surface`() {
        // The QS card / lock screen only renders the buttons the PlaybackState
        // ACTIONS advertise — dropping a bit silently loses that control.
        val a = AudioKeepAliveService.SESSION_ACTIONS
        for (bit in longArrayOf(
            android.support.v4.media.session.PlaybackStateCompat.ACTION_PLAY,
            android.support.v4.media.session.PlaybackStateCompat.ACTION_PAUSE,
            android.support.v4.media.session.PlaybackStateCompat.ACTION_PLAY_PAUSE,
            android.support.v4.media.session.PlaybackStateCompat.ACTION_SKIP_TO_NEXT,
            android.support.v4.media.session.PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS,
            android.support.v4.media.session.PlaybackStateCompat.ACTION_SEEK_TO,
        )) {
            assertTrue(a and bit != 0L, "SESSION_ACTIONS missing bit $bit")
        }
    }

    @Test
    fun `updateNowPlaying without a running service is dropped, not a resurrection`() {
        // A trailing metadata update after the setAudioActive(false) stop must
        // NOT re-start the service into a silent notification with no
        // keep-alive edge left to clear it (the `running` / `startPending` gate).
        val app = ApplicationProvider.getApplicationContext<Application>()
        // Companion state is shared across tests and test order is not source
        // order, so clear a start left pending by another case first.
        AudioKeepAliveService.setActive(app, false)
        AudioKeepAliveService.updateNowPlaying(app, "T", "A", true, 0L, 0L, 1f)
        assertNull(shadowOf(app).nextStartedService, "update must not start a stopped service")
    }

    @Test
    fun `the first now-playing update queued behind setActive(true) is delivered, not dropped`() {
        // startForegroundService is ASYNCHRONOUS: onCreate — and therefore
        // `running = true` — has not happened when the JS player sends its first
        // metadata update on the very next line. Gating only on `running` drops
        // that update, and the first media card of a session shows the
        // placeholder "Audio letter / The Volumes of Truth" instead of the real
        // title. Intents to a service are delivered in call order, so the update
        // rides the queue safely behind the start.
        val app = ApplicationProvider.getApplicationContext<Application>()
        try {
            AudioKeepAliveService.setActive(app, true)
            AudioKeepAliveService.updateNowPlaying(app, "Letter", "The Volumes of Truth", true, 0L, 60_000L, 1f)

            assertNotNull(shadowOf(app).nextStartedService, "the start intent")
            val update = shadowOf(app).nextStartedService
            assertNotNull(update, "the update must ride the queue behind the start, not be dropped")
            assertEquals(AudioKeepAliveService.ACTION_UPDATE, update.action)
        } finally {
            AudioKeepAliveService.setActive(app, false) // companion state is shared across tests
        }
    }

    // ─── API-level branch ─────────────────────────────────────────────

    @Test
    fun `typed startForeground is used from Q up and not below`() {
        // The three-arg startForeground(id, notification, type) overload is API
        // 29. Below it only the two-arg form exists — calling the typed one
        // would NoSuchMethodError on an API 26-28 device (minSdk is 26).
        assertFalse(AudioKeepAliveService.usesTypedForeground(Build.VERSION_CODES.O))
        assertFalse(AudioKeepAliveService.usesTypedForeground(Build.VERSION_CODES.P))
        assertTrue(AudioKeepAliveService.usesTypedForeground(Build.VERSION_CODES.Q))
        assertTrue(AudioKeepAliveService.usesTypedForeground(34))
        assertTrue(AudioKeepAliveService.usesTypedForeground(36))
    }

    // ─── start / stop wiring ──────────────────────────────────────────

    @Test
    fun `setActive true starts the service`() {
        val app = ApplicationProvider.getApplicationContext<Application>()
        AudioKeepAliveService.setActive(app, true)

        val started = shadowOf(app).nextStartedService
        assertNotNull(started, "setAudioActive(true) must start the keep-alive service")
        assertEquals(AudioKeepAliveService::class.java.name, started.component?.className)
        // A plain start, never the stop command.
        assertNull(started.action)
    }

    @Test
    fun `setActive false stops the service instead of starting one with ACTION_STOP`() {
        // Pausing playback while backgrounded (screen off, another app in front)
        // is the NORMAL case, and a background startService throws
        // IllegalStateException on API 26+ — which would strand the ongoing
        // notification on exactly the path that matters most. stopService has no
        // background restriction.
        val app = ApplicationProvider.getApplicationContext<Application>()
        AudioKeepAliveService.setActive(app, false)

        val stopped = shadowOf(app).nextStoppedService
        assertNotNull(stopped, "setAudioActive(false) must stop the keep-alive service")
        assertEquals(AudioKeepAliveService::class.java.name, stopped.component?.className)
        assertNull(shadowOf(app).nextStartedService, "stop must not start a service")
    }

    @Test
    fun `setActive is idempotent and never throws`() {
        // JS edge-triggers this, but a re-mounted player / a replayed queue can
        // repeat an edge, and MainActivity.onDestroy stops it a second time.
        // Neither may throw into the binder thread.
        val app = ApplicationProvider.getApplicationContext<Application>()
        AudioKeepAliveService.setActive(app, true)
        AudioKeepAliveService.setActive(app, true)
        AudioKeepAliveService.setActive(app, false)
        AudioKeepAliveService.setActive(app, false)

        assertNotNull(shadowOf(app).nextStartedService)
        assertNotNull(shadowOf(app).nextStartedService)
        assertNotNull(shadowOf(app).nextStoppedService)
        assertNotNull(shadowOf(app).nextStoppedService)
    }
}
