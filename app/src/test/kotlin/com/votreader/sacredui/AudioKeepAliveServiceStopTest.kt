package com.votreader.sacredui

import android.app.Application
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadows.ShadowService
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Sweep v039 (2026-10-14): stopping the service while PAUSED must take the paused media card down with it.
 *
 * The pause demotes the card with stopForeground(STOP_FOREGROUND_DETACH) and re-posts it through
 * NotificationManager.notify. From then on the card is no longer the service's: the platform changes a detached
 * notification "only through direct calls to the notification manager" (Service.STOP_FOREGROUND_DETACH), so the
 * stopForeground(STOP_FOREGROUND_REMOVE) in onDestroy leaves it up. Pressing the player's close button while paused
 * (setActive(false) -> stopService), swiping the app away (onTaskRemoved) or the Activity dying (onDestroy ->
 * setActive(false)) left a stale "Play" card for a session that no longer existed; its Play restarted the service
 * with placeholder text and no player behind it.
 *
 * Robolectric's ShadowService cancels the last foreground notification on any REMOVE, attached or not, which hides
 * exactly this bug. [ShadowServiceDetachContract] keeps the platform's rule instead.
 *
 * @Config pins SDK 35, the level the other keep-alive tests use.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], shadows = [ShadowServiceDetachContract::class])
class AudioKeepAliveServiceStopTest {

    private val app: Application get() = ApplicationProvider.getApplicationContext()

    private fun cardShowing() =
        shadowOf(app.getSystemService(NotificationManager::class.java))
            .getNotification(AudioKeepAliveService.NOTIFICATION_ID) != null

    private fun startIntent() = Intent(app, AudioKeepAliveService::class.java)

    private fun update(playing: Boolean) =
        Intent(app, AudioKeepAliveService::class.java)
            .setAction(AudioKeepAliveService.ACTION_UPDATE)
            .putExtra(AudioKeepAliveService.EXTRA_TITLE, "Letter")
            .putExtra(AudioKeepAliveService.EXTRA_ARTIST, "The Volumes of Truth")
            .putExtra(AudioKeepAliveService.EXTRA_PLAYING, playing)
            .putExtra(AudioKeepAliveService.EXTRA_POSITION_MS, 5_000L)
            .putExtra(AudioKeepAliveService.EXTRA_DURATION_MS, 60_000L)
            .putExtra(AudioKeepAliveService.EXTRA_RATE, 1f)

    /** A letter started (setActive(true)) and then paused: the card is up and detached from the service. */
    private fun pausedService(): ServiceController<AudioKeepAliveService> {
        val controller = Robolectric.buildService(AudioKeepAliveService::class.java).create()
        controller.get().onStartCommand(startIntent(), 0, 1)
        controller.get().onStartCommand(update(playing = false), 0, 2)
        assertFalse(shadowOf(controller.get()).isLastForegroundNotificationAttached, "precondition: pause detaches")
        assertTrue(cardShowing(), "precondition: the paused card is showing")
        return controller
    }

    @Test
    fun `stopping the service while paused removes the detached card`() {
        val controller = pausedService()

        controller.destroy()                          // player close -> setActive(false) -> stopService

        assertFalse(cardShowing(), "the paused card must not outlive the service")
    }

    @Test
    fun `swiping the app away while paused removes the detached card`() {
        val controller = pausedService()

        controller.get().onTaskRemoved(null)
        assertTrue(shadowOf(controller.get()).isStoppedBySelf, "onTaskRemoved stops the service")
        controller.destroy()                          // what the platform does after stopSelf

        assertFalse(cardShowing(), "the paused card must not outlive the service")
    }

    @Test
    fun `stopping the service while playing still removes the attached card`() {
        // Control for the shadow: an attached card goes with the service, as before.
        val controller = Robolectric.buildService(AudioKeepAliveService::class.java).create()
        controller.get().onStartCommand(startIntent(), 0, 1)
        controller.get().onStartCommand(update(playing = true), 0, 2)
        assertNotNull(shadowOf(controller.get()).lastForegroundNotification)

        controller.destroy()

        assertNull(
            shadowOf(app.getSystemService(NotificationManager::class.java))
                .getNotification(AudioKeepAliveService.NOTIFICATION_ID),
        )
    }
}

/**
 * ShadowService with the platform's STOP_FOREGROUND_DETACH contract: once detached, the notification belongs to the
 * notification manager, and a later stopForeground(STOP_FOREGROUND_REMOVE) does not touch it (the stock shadow
 * cancels it anyway). An attached notification is removed as before.
 */
@Implements(Service::class)
class ShadowServiceDetachContract : ShadowService() {
    @Implementation(minSdk = Build.VERSION_CODES.N)
    override fun stopForeground(flags: Int) {
        val removeWhileDetached = flags and Service.STOP_FOREGROUND_REMOVE != 0 && !isLastForegroundNotificationAttached
        super.stopForeground(if (removeWhileDetached) flags and Service.STOP_FOREGROUND_REMOVE.inv() else flags)
    }
}
