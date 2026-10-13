package com.votreader.sacredui

import android.Manifest
import android.app.Application
import android.content.ComponentName
import android.content.pm.ActivityInfo
import android.media.MediaRecorder
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.IOException
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Sweep W14 (2026-10-13): Android voice memos.
 *  - Locking the screen mid-memo recorded silence (Android hands a backgrounded app a silent mic) and saved it at full
 *    length: the app now pauses the memo as it leaves the screen and tells the page, which shows Paused.
 *  - A font size or language change recreated the activity, and its teardown cancelled (deleted) the memo: the
 *    activity now takes those changes itself.
 *  - A start that failed left its MediaRecorder holding the mic (so the retry failed too) and its votrec_*.m4a behind.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class JournalMemoLeaveScreenTest {

    private lateinit var application: Application
    private lateinit var recorder: NativeAudioRecorder

    @Before
    fun setup() {
        application = ApplicationProvider.getApplicationContext()
        recorder = NativeAudioRecorder(application)
        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
    }

    @After
    fun tearDown() {
        recorder.release()
    }

    private fun tempMemos(): Set<String> =
        application.cacheDir.listFiles()?.filter { it.name.startsWith("votrec_") }?.map { it.name }?.toSet() ?: emptySet()

    /** A MediaRecorder whose prepare() fails, as a mic another app holds makes it. */
    @Suppress("DEPRECATION")
    private class BusyMicRecorder : MediaRecorder() {
        var released = false
        override fun prepare() { throw IOException("mic busy") }
        override fun release() { released = true; super.release() }
    }

    // ─── a failed start ───────────────────────────────────────────────

    @Test
    fun `a start that fails frees its recorder and leaves no temp file behind`() {
        val busy = BusyMicRecorder()
        recorder.newRecorder = { busy }
        val before = tempMemos()
        assertIs<NativeAudioRecorder.Result.Failure>(recorder.start())
        assertTrue(busy.released, "the failed MediaRecorder still holds the mic, so the retry fails too")
        assertEquals(before, tempMemos(), "the failed start's votrec_*.m4a stayed in cacheDir")
    }

    // ─── leaving the screen ───────────────────────────────────────────

    @Test
    fun `leaving the screen pauses a live memo once, and again after a resume`() {
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())
        assertTrue(recorder.pauseIfRecording(), "a live memo pauses as the app leaves the screen")
        assertFalse(recorder.pauseIfRecording(), "a memo already paused is not paused again (its pause clock stays)")
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.resume())
        assertTrue(recorder.pauseIfRecording())
    }

    @Test
    fun `nothing recording, or a memo the backstop already finished, is left alone`() {
        assertFalse(recorder.pauseIfRecording())
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())
        recorder.onRecorderInfo(MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED)
        assertFalse(recorder.pauseIfRecording())
    }

    @Test
    fun `the page is told only when a memo was paused`() {
        val bridge = mockk<JsBridge>(relaxed = true)
        val audio = mockk<NativeAudioRecorder>(relaxed = true)
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder } returns audio
        val app = AppInterface(FakeBridgeHost(), bridge, vm)

        every { audio.pauseIfRecording() } returns false
        app.pauseRecordingForBackground()
        verify(exactly = 0) { bridge.callOptional(JsEvent.NativeRecordingPaused) }

        every { audio.pauseIfRecording() } returns true
        app.pauseRecordingForBackground()
        verify(exactly = 1) { bridge.callOptional(JsEvent.NativeRecordingPaused) }
        assertEquals("__onNativeRecordingPaused", JsEvent.NativeRecordingPaused.fn)
    }

    // ─── a font size or language change ───────────────────────────────

    @Test
    fun `the reader takes font size, display size, language and keyboard changes itself`() {
        val info = application.packageManager.getActivityInfo(ComponentName(application, MainActivity::class.java), 0)
        val want = mapOf(
            "fontScale" to ActivityInfo.CONFIG_FONT_SCALE,
            "density" to ActivityInfo.CONFIG_DENSITY,
            "locale" to ActivityInfo.CONFIG_LOCALE,
            "layoutDirection" to ActivityInfo.CONFIG_LAYOUT_DIRECTION,
            "keyboard" to ActivityInfo.CONFIG_KEYBOARD,
            "navigation" to ActivityInfo.CONFIG_NAVIGATION,
            "orientation" to ActivityInfo.CONFIG_ORIENTATION,   // already there: proves the manifest was read
        )
        val missing = want.filter { (_, bit) -> info.configChanges and bit == 0 }.keys
        assertTrue(missing.isEmpty(), "MainActivity is recreated (and the memo deleted) on: $missing")
    }
}
