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
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * journal-6 — RED repro (Verifier execution helper).
 *
 * NativeAudioRecorder.start() (~lines 74-100) configures audio source /
 * output format / encoder / bitrate / sample rate / output file, then
 * prepare()s and start()s the MediaRecorder -- but registers NO
 * setOnErrorListener, NO setOnInfoListener, and never calls setMaxDuration.
 * Consequence: a mic seizure mid-recording (an incoming call yanking the
 * AudioRecord session, an OEM audio-focus steal) fails completely
 * SILENTLY -- OnErrorListener is the only notification channel MediaRecorder
 * has for that class of failure -- and there is no NATIVE backstop on
 * recording length; the cap that exists is a throttleable JS-side timer
 * only (background-tab / doze can stall it).
 *
 * Repro mechanism: Robolectric's ShadowMediaRecorder is a real (if no-op --
 * no JNI, no live mic) implementation of MediaRecorder's setters.
 * setOnErrorListener / setOnInfoListener / setMaxDuration are RECORDED on
 * the shadow, not silently dropped, so reflecting into NativeAudioRecorder's
 * private `recorder` field to reach the live MediaRecorder instance and
 * reading the shadow's own public getters (getErrorListener/getInfoListener/
 * getMaxDuration) proves exactly what the PRODUCTION start() call sequence
 * did and did not wire up. This is the same permission-granted start() path
 * NativeAudioRecorderTest's header comment flags as reachable specifically
 * *because* ShadowMediaRecorder no-ops the dangerous calls.
 *
 * Class-level @Config: Q (API 29), matching NativeAudioRecorderTest so the
 * SDK base is identical across the recorder suite (selects the no-arg
 * MediaRecorder() constructor branch, same as production on API <31).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class Journal6RecorderListenersReproTest {

    private lateinit var application: Application
    private lateinit var recorder: NativeAudioRecorder

    @Before
    fun setup() {
        application = ApplicationProvider.getApplicationContext()
        recorder = NativeAudioRecorder(application)
        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
    }

    /**
     * Reach the MediaRecorder instance NativeAudioRecorder.start() built and
     * retained in its private `recorder` field. This reflection step only
     * reaches the INSTANCE -- the assertions below read it through
     * ShadowMediaRecorder's own public getters, never through raw reflection
     * into MediaRecorder's private fields, so what's asserted is the
     * production start() call sequence's real behaviour.
     */
    private fun liveMediaRecorder(): MediaRecorder {
        val field = NativeAudioRecorder::class.java.getDeclaredField("recorder")
        field.isAccessible = true
        return field.get(recorder) as? MediaRecorder
            ?: error("NativeAudioRecorder.start() did not retain a MediaRecorder instance")
    }

    @Test
    fun `start registers an error listener so a mic seizure is not silent`() {
        val result = recorder.start()
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(result)

        val shadow = shadowOf(liveMediaRecorder())
        assertNotNull(
            shadow.errorListener,
            "start() never calls setOnErrorListener -- a mic seizure (e.g. an " +
                "incoming call yanking the AudioRecord session) fails completely " +
                "silently, with no way for the app to know recording died."
        )
    }

    @Test
    fun `start registers an info listener`() {
        val result = recorder.start()
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(result)

        val shadow = shadowOf(liveMediaRecorder())
        assertNotNull(
            shadow.infoListener,
            "start() never calls setOnInfoListener -- MediaRecorder.OnInfoListener " +
                "events (e.g. MEDIA_RECORDER_INFO_MAX_DURATION_REACHED / " +
                "MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) are dropped on the floor."
        )
    }

    @Test
    fun `start sets a native max duration backstop`() {
        val result = recorder.start()
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(result)

        val shadow = shadowOf(liveMediaRecorder())
        assertTrue(
            shadow.maxDuration > 0,
            "start() never calls setMaxDuration -- the recording-length cap is " +
                "only a throttleable JS-side timer (background tab / doze can " +
                "stall it), with no native backstop in the recorder itself."
        )
    }
}
