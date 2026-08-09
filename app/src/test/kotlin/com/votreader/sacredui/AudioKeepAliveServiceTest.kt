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
        assertEquals("Playing audio", AudioKeepAliveService.NOTIFICATION_TEXT)
        // startForeground(0, ...) is an IllegalArgumentException on every API level.
        assertTrue(AudioKeepAliveService.NOTIFICATION_ID != 0)
    }

    @Test
    fun `the stop action is package-qualified`() {
        // A bare "STOP" would collide with a platform/third-party broadcast the
        // moment this service ever gets a notification action or a PendingIntent.
        assertTrue(AudioKeepAliveService.ACTION_STOP.startsWith("com.votreader.sacredui."))
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
