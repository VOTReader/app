package com.votreader.sacredui

import android.Manifest
import android.app.Application
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * NK4 — NativeAudioRecorder state-machine tests.
 *
 * MediaRecorder is JNI-backed and cannot be exercised in a JVM unit test
 * (Robolectric ships a no-op shadow that doesn't actually capture audio).
 * Anything past the start() permission check requires a real device, so
 * these tests focus on the surface that doesn't need a live MediaRecorder:
 *
 *   - the permission gate in start()
 *   - state-machine safety for null-recorder calls (stop, pause, resume,
 *     amplitude)
 *   - cancel / release idempotence
 *   - Result sealed-interface contract
 *
 * Real-device verification of the full record → preview → save flow is
 * owed against an actual phone — see tools/n1-smoke-walk.md (NK7).
 *
 * Class-level @Config: Q (API 29) so the SDK base matches the rest of
 * the suite and the runtime can resolve MediaRecorder(context).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class NativeAudioRecorderTest {

    private lateinit var application: Application
    private lateinit var recorder: NativeAudioRecorder

    @Before
    fun setup() {
        application = ApplicationProvider.getApplicationContext()
        recorder = NativeAudioRecorder(application)
        // Default: revoke RECORD_AUDIO so start() tests the deny path.
        // Individual tests grant it back when they need to (none currently
        // do, since a real start() can't be tested without JNI).
        shadowOf(application).denyPermissions(Manifest.permission.RECORD_AUDIO)
    }

    @After
    fun tearDown() {
        recorder.release()
    }

    // ─── start permission gate ────────────────────────────────────────

    @Test
    fun `start without RECORD_AUDIO returns Failure permission`() {
        // Permission revoked in @Before. The check happens BEFORE any
        // MediaRecorder instantiation, so this test is reliable in the
        // unit-test JVM (no JNI required).
        val result = recorder.start()
        assertIs<NativeAudioRecorder.Result.Failure>(result)
        assertEquals("permission", result.reason)
    }

    // ─── null-recorder state safety ───────────────────────────────────

    @Test
    fun `stop without prior start returns no_recording`() {
        val result = recorder.stop()
        assertIs<NativeAudioRecorder.Result.Failure>(result)
        assertEquals("no_recording", result.reason)
    }

    @Test
    fun `pause without prior start is a graceful no-op`() {
        // Per production: recorder?.pause() short-circuits to a no-op,
        // pauseStartMs gets a non-meaningful timestamp, return Success.
        // Documents the "pause is forgiving" UX behaviour so a regression
        // that suddenly returns Failure here would be caught.
        val result = recorder.pause()
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(result)
    }

    @Test
    fun `resume without prior start is a graceful no-op`() {
        // Same reasoning as pause -- the JS side calls resume() whenever
        // its own state thinks "paused", and we don't want to surface an
        // error during a recovery flow that the native side has already
        // forgotten.
        val result = recorder.resume()
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(result)
    }

    @Test
    fun `amplitude without recorder returns 0`() {
        // Drives the waveform UI; a stale poll after stop/cancel should
        // render a flat line, not throw.
        assertEquals(0, recorder.amplitude())
    }

    // ─── cancel / release idempotence ─────────────────────────────────

    @Test
    fun `cancel without prior start does not throw`() {
        // Defensive: the Activity's onDestroy / ViewModel's onCleared
        // both call release() (which is cancel()); a fresh recorder
        // that's never seen a start() must handle that gracefully.
        recorder.cancel()
    }

    @Test
    fun `cancel called twice in a row does not throw`() {
        // The state machine: first cancel clears recorder + recordFile
        // to null; second cancel hits the null-and-null branch (no-op).
        // Guards against a subtle regression where the second call
        // tried to re-stop a recorder that was already null.
        recorder.cancel()
        recorder.cancel()
    }

    @Test
    fun `release is alias for cancel`() {
        // release() simply delegates to cancel() in production. Calling
        // release first then cancel second is the post-onCleared +
        // post-onDestroy ordering; both should be benign.
        recorder.release()
        recorder.cancel()
    }

    @Test
    fun `release called three times in a row does not throw`() {
        recorder.release()
        recorder.release()
        recorder.release()
    }

    @Test
    fun `release then stop returns no_recording`() {
        // Defines the post-release contract: any further state-modifying
        // call returns its "nothing here" failure, not a throw.
        recorder.release()
        val result = recorder.stop()
        assertIs<NativeAudioRecorder.Result.Failure>(result)
        assertEquals("no_recording", result.reason)
    }

    // ─── Result sealed-interface contract ─────────────────────────────

    @Test
    fun `Result Success and Failure are distinct`() {
        val s: NativeAudioRecorder.Result<Int> =
            NativeAudioRecorder.Result.Success(7)
        val f: NativeAudioRecorder.Result<Int> =
            NativeAudioRecorder.Result.Failure("bad")
        assertIs<NativeAudioRecorder.Result.Success<Int>>(s)
        assertIs<NativeAudioRecorder.Result.Failure>(f)
        assertEquals(7, (s as NativeAudioRecorder.Result.Success<Int>).value)
        assertEquals("bad", (f as NativeAudioRecorder.Result.Failure).reason)
    }

    @Test
    fun `RecordingResult holds base64 and duration`() {
        val r = NativeAudioRecorder.RecordingResult("dGVzdA==", 1234L)
        assertEquals("dGVzdA==", r.base64)
        assertEquals(1234L, r.durationMs)
    }
}
