package com.votreader.sacredui

import android.Manifest
import android.app.Application
import android.media.MediaRecorder
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadow.api.Shadow
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadows.ShadowMediaRecorder
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * The native max-duration backstop, and the data-loss trap inside it.
 *
 * When MediaRecorder reaches setMaxDuration it STOPS AND FINALISES THE FILE
 * ITSELF, then reports MEDIA_RECORDER_INFO_MAX_DURATION_REACHED. `stop()` is
 * DOCUMENTED to throw IllegalStateException when called from a non-recording
 * state, and [NativeAudioRecorder.stop]'s catch for that throw deletes the temp
 * file — so on any platform that honours the contract, setMaxDuration without the
 * `if (!autoStopped)` guard destroys the very recording the backstop fired to
 * protect.
 *
 * HOW MUCH OF THAT IS MEASURED (emulator-5554, API 34, 2026-09-04): the info
 * callback fires and the recorder does enter a non-recording state, both observed
 * in logcat. The throw does NOT happen there — API 34 logs `stop while neither
 * recording nor paused` and returns, and an A/B with the guard neutered kept the
 * file either way. This suite therefore asserts the DOCUMENTED contract, which is
 * what an OEM or another API level may well enforce; it is not a replay of
 * behaviour seen on API 34.
 *
 * WHY THIS TEST CARRIES ITS OWN SHADOW. Robolectric's real ShadowMediaRecorder
 * cannot express that trap — its `stop()` is `{ state = STATE_INITIAL; return; }`
 * and never throws, from any state. Against it, the guard's presence and absence
 * produce identical results, so a test written on the stock shadow passes just as
 * happily with the guard deleted. [DoubleStopThrowsShadowMediaRecorder] restores
 * the one platform behaviour that makes the branch observable: stop() outside the
 * recording state throws, exactly as the real class documents.
 *
 * @Config(sdk = Q) matches the rest of the recorder suite.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q], shadows = [DoubleStopThrowsShadowMediaRecorder::class])
class NativeAudioRecorderBackstopTest {

    private lateinit var application: Application
    private lateinit var recorder: NativeAudioRecorder

    @Before
    fun setup() {
        application = ApplicationProvider.getApplicationContext()
        recorder = NativeAudioRecorder(application)
        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
    }

    private fun liveMediaRecorder(): MediaRecorder {
        val field = NativeAudioRecorder::class.java.getDeclaredField("recorder")
        field.isAccessible = true
        return field.get(recorder) as? MediaRecorder ?: error("start() retained no MediaRecorder")
    }

    /** Our own shadow instance for the live recorder, for its stop() call count. */
    private fun stopSpy(mr: MediaRecorder): DoubleStopThrowsShadowMediaRecorder =
        Shadow.extract(mr)

    private fun servedRecordings(): List<File> =
        File(application.cacheDir, NativeAudioRecorder.RECORDINGS_DIR).listFiles()?.toList().orEmpty()

    @Test
    fun `a recording the backstop stopped is kept, not deleted by a second stop`() {
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())

        // The recorder hits MAX_DURATION: it stops itself (so a later stop() would
        // throw), then reports the info code. Both halves, in the real order.
        val mr = liveMediaRecorder()
        mr.stop()
        recorder.onRecorderInfo(MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED)

        val result = recorder.stop()

        assertEquals(
            1, stopSpy(mr).stopCalls,
            "only the backstop's own stop should have reached the recorder; a second " +
                "one from stop() is the throw that deletes the file"
        )

        assertIs<NativeAudioRecorder.Result.Success<NativeAudioRecorder.RecordingResult>>(
            result,
            "the backstop finalised a complete recording; stop() must hand it to JS, " +
                "not call stop() a second time and delete the file on the throw"
        )
        assertTrue(
            servedRecordings().any { it.name == result.value.fileName },
            "the finished memo must still exist on disk for JS to fetch"
        )
    }

    @Test
    fun `only the max-duration code means the recorder stopped itself`() {
        // MAX_FILESIZE_REACHED does NOT stop the recorder, and neither does any
        // other info code. Treating one as an auto-stop would skip the real stop()
        // and leave the memo unfinalised — the mirror-image data loss.
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())
        val mr = liveMediaRecorder()
        recorder.onRecorderInfo(MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)
        recorder.onRecorderInfo(MediaRecorder.MEDIA_RECORDER_INFO_UNKNOWN)

        // Nothing auto-stopped, so stop() takes its normal path: the recorder is
        // still RECORDING, the shadow permits the stop, and the memo is produced.
        val result = recorder.stop()
        assertIs<NativeAudioRecorder.Result.Success<NativeAudioRecorder.RecordingResult>>(
            result,
            "an info code that does not stop the recorder must leave stop() to do it"
        )
        assertEquals(
            1, stopSpy(mr).stopCalls,
            "stop() must actually have stopped the recorder — if a non-max-duration " +
                "info code wrongly set autoStopped, the memo is never finalised"
        )
    }

    @Test
    fun `the backstop is set above the JS cap, not below it`() {
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())
        val maxDuration = shadowOf(liveMediaRecorder()).maxDuration
        assertTrue(
            maxDuration > 300_000,
            "the native backstop ($maxDuration ms) must sit ABOVE JournalRecordingSheet's " +
                "300000 ms JS cap, or it would cut recordings short instead of backstopping them"
        )
        assertFalse(maxDuration > 600_000, "a backstop that far out stops being a backstop")
    }
}

/**
 * ShadowMediaRecorder with the one real behaviour the stock shadow drops: stop()
 * outside the recording state throws, as the platform documents. Without this the
 * `if (!autoStopped)` guard is unobservable and its test is vacuous.
 */
@Implements(MediaRecorder::class)
class DoubleStopThrowsShadowMediaRecorder : ShadowMediaRecorder() {
    /** How many times stop() reached the recorder. The stock shadow records no
     *  call count, and the end state cannot stand in for one: release() lands on
     *  STATE_RELEASED whether or not stop() ran first. */
    var stopCalls = 0
        private set

    @Implementation
    override fun stop() {
        check(state == STATE_RECORDING) { "stop() called in state $state, not STATE_RECORDING" }
        stopCalls++
        super.stop()
    }
}
