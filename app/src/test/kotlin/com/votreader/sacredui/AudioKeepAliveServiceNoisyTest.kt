package com.votreader.sacredui

import android.app.Application
import android.content.Intent
import android.media.AudioManager
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * v02-audio-10 (improvement sweep 2026-09-22, REPORT #7): pulling the headphones
 * out (or a Bluetooth headset dropping) must PAUSE the letter, not carry on out
 * loud through the phone speaker. Chrome does this in its own chrome/ layer; the
 * WebView has none of it, so the APK listens for ACTION_AUDIO_BECOMING_NOISY
 * while a listening session is open (the keep-alive service's lifetime) and
 * sends the player an explicit "pause" (idempotent since v02-audio-02: a Pause
 * while paused stays paused).
 *
 * @Config SDK 35: registerReceiver's exported-flag rules are live there.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class AudioKeepAliveServiceNoisyTest {

    private val app: Application get() = ApplicationProvider.getApplicationContext()

    @After
    fun clearSink() { AudioKeepAliveService.commandSink = null }

    private fun unplug() {
        app.sendBroadcast(Intent(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
        shadowOf(Looper.getMainLooper()).idle()
    }

    @Test
    fun `headphones unplugged during a listening session send the player an explicit pause`() {
        val cmds = mutableListOf<String>()
        AudioKeepAliveService.commandSink = { cmd, _ -> cmds += cmd }
        val controller = Robolectric.buildService(AudioKeepAliveService::class.java).create()
        unplug()
        assertEquals(listOf("pause"), cmds)
        controller.destroy()
    }

    @Test
    fun `once the session is over the receiver is gone`() {
        val cmds = mutableListOf<String>()
        AudioKeepAliveService.commandSink = { cmd, _ -> cmds += cmd }
        Robolectric.buildService(AudioKeepAliveService::class.java).create().destroy()
        unplug()
        assertTrue(cmds.isEmpty(), "a destroyed service must not keep a receiver registered")
    }
}
