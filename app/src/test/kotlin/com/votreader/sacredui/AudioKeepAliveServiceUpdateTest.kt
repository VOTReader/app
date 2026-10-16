package com.votreader.sacredui

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNotSame
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * FGS-UPDATE (2026-09-01): a now-playing update that lands while the card is
 * PAUSED must refresh the detached notification with notify() alone, never by
 * re-calling startForeground.
 *
 * After the pause demotion (stopForeground DETACH) the service is a plain
 * started service. On API 31+ a startForeground from a process that is neither
 * visible nor on a temp allowlist throws ForegroundServiceStartNotAllowed-
 * Exception; onStartCommand's catch turns that into stopEverything(), so a
 * duplicate pause event or a focus-loss pause while backgrounded silently kills
 * the paused card and its media session. Robolectric does not model the
 * restriction, so this pins the CALL PATTERN: the last startForeground
 * notification must be the SAME object after a paused update (no new
 * startForeground), while a PLAYING update and a plain start intent (the
 * startForegroundService contract) must still enter the foreground. A start
 * intent is the resume (sweep v040): it must stay there, not detach again on
 * the paused snapshot it lands on.
 *
 * @Config pins SDK 35: the cached android-all jar at a level where the
 * restriction is live.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class AudioKeepAliveServiceUpdateTest {

    private val app: Application get() = ApplicationProvider.getApplicationContext()

    private fun startIntent() = Intent(app, AudioKeepAliveService::class.java)

    private fun update(playing: Boolean, positionMs: Long = 0L) =
        Intent(app, AudioKeepAliveService::class.java)
            .setAction(AudioKeepAliveService.ACTION_UPDATE)
            .putExtra(AudioKeepAliveService.EXTRA_TITLE, "Letter")
            .putExtra(AudioKeepAliveService.EXTRA_ARTIST, "The Volumes of Truth")
            .putExtra(AudioKeepAliveService.EXTRA_PLAYING, playing)
            .putExtra(AudioKeepAliveService.EXTRA_POSITION_MS, positionMs)
            .putExtra(AudioKeepAliveService.EXTRA_DURATION_MS, 60_000L)
            .putExtra(AudioKeepAliveService.EXTRA_RATE, 1f)

    @Test
    fun updateWhilePausedRefreshesTheCardWithoutReenteringTheForeground() {
        val svc = Robolectric.buildService(AudioKeepAliveService::class.java).create().get()
        val shadow = shadowOf(svc)

        svc.onStartCommand(startIntent(), 0, 1)                       // setActive(true)
        assertFalse(shadow.isForegroundStopped, "start must enter the foreground")

        svc.onStartCommand(update(playing = false), 0, 2)            // pause -> demotion
        assertTrue(shadow.isForegroundStopped, "pause must detach the card")
        val attachedAtPause = shadow.lastForegroundNotification
        assertNotNull(attachedAtPause)

        svc.onStartCommand(update(playing = false, positionMs = 5_000L), 0, 3)  // seek / duplicate pause, still paused

        // RED today: onStartCommand calls startForeground on EVERY intent, so a
        // new Notification replaces the one from the pause. GREEN once a paused
        // update is notify()-only.
        assertSame(
            attachedAtPause, shadow.lastForegroundNotification,
            "ACTION_UPDATE while paused must not call startForeground (background FGS start on API 31+)"
        )
        assertTrue(shadow.isForegroundStopped, "the card must stay detached while paused")
        val nm = shadowOf(app.getSystemService(NotificationManager::class.java))
        assertNotNull(
            nm.getNotification(AudioKeepAliveService.NOTIFICATION_ID),
            "the paused card must still be refreshed via notify()"
        )
    }

    @Test
    fun playingUpdateAfterAPauseReentersTheForeground() {
        val svc = Robolectric.buildService(AudioKeepAliveService::class.java).create().get()
        val shadow = shadowOf(svc)
        svc.onStartCommand(startIntent(), 0, 1)
        svc.onStartCommand(update(playing = false), 0, 2)
        val attachedAtPause = shadow.lastForegroundNotification

        svc.onStartCommand(update(playing = true), 0, 3)             // resume

        assertNotSame(attachedAtPause, shadow.lastForegroundNotification, "resume must call startForeground again")
        assertFalse(shadow.isForegroundStopped, "resume must re-attach the card")
    }

    @Test
    fun startIntentAfterAPauseEntersTheForegroundAndStaysThereAsPlaying() {
        // startForegroundService demands a matching startForeground within 5 s;
        // the snapshot's play state must never be allowed to skip it.
        val svc = Robolectric.buildService(AudioKeepAliveService::class.java).create().get()
        val shadow = shadowOf(svc)
        svc.onStartCommand(startIntent(), 0, 1)
        svc.onStartCommand(update(playing = false), 0, 2)
        val attachedAtPause = shadow.lastForegroundNotification

        svc.onStartCommand(startIntent(), 0, 3)                       // resume: setActive(true), before JS syncs 'playing'

        assertNotSame(attachedAtPause, shadow.lastForegroundNotification, "a start intent must call startForeground")
        // Sweep v040: JS raises setActive(true) only on the 'playing' edge, so a start intent IS the resume. Read
        // with the snapshot still paused, the same pass detached the card again: swipeable, showing Play over
        // playing audio, and the process unprotected until the playing update re-entered the foreground from a
        // plain startService (a background FGS start on API 31+, refused -> CMD_REFUSED -> stopEverything).
        assertFalse(shadow.isForegroundStopped, "the resume start must stay in the foreground, not detach again")
        assertTrue(shadow.isLastForegroundNotificationAttached, "the resumed card must stay attached")
        val card = shadow.lastForegroundNotification
        assertEquals("Pause", card.actions[1].title.toString(), "the resumed card must offer Pause, not Play")
        assertTrue(card.flags and Notification.FLAG_ONGOING_EVENT != 0, "the resumed card must be ongoing")
    }
}
