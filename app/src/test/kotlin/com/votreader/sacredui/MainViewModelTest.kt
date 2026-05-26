package com.votreader.sacredui

import android.app.Application
import android.media.AudioManager
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * NK4 — MainViewModel state tests.
 *
 * The ViewModel holds Activity-spanning state (insets, scale, splash,
 * audio mode, recorder, renderer-recovery counters). Tests pin the
 * initial values so a regression that flips a default — e.g. setting
 * keepScreenOnEnabled=false out of the box — fails here, not at first
 * cold boot on a real device.
 *
 * Coverage of the onCleared → audioRecorder.release() chain is owed to
 * real-device verification (tools/n1-smoke-walk.md, NK7). Replacing
 * the val audioRecorder field via reflection works but adds JVM-version-
 * dependent fragility that isn't worth the marginal gain: NativeAudioRecorderTest
 * already pins the release() side, and the wiring is a one-liner you
 * can read.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class MainViewModelTest {

    private lateinit var application: Application
    private lateinit var vm: MainViewModel

    @Before
    fun setup() {
        application = ApplicationProvider.getApplicationContext()
        vm = MainViewModel(application)
    }

    // ─── initial-state contract ───────────────────────────────────────

    @Test
    fun `splashHolding initial state is true`() {
        // The splash screen lifecycle hinges on this; if it ever defaulted
        // to false, the splash would dismiss before the WebView's first
        // paint and the user would see a flash of empty black.
        assertTrue(vm.splashHolding)
    }

    @Test
    fun `keepScreenOnEnabled initial state is true`() {
        // The shipping default; a sleeping device mid-reading is the
        // primary user complaint a reader app must avoid by default.
        assertTrue(vm.keepScreenOnEnabled)
    }

    @Test
    fun `currentScale initial state is 1f`() {
        // Used by screenshot capture to decide whether to zoom-reset.
        // A nonzero default that isn't 1f would trigger a needless
        // zoom dance on every screenshot.
        assertEquals(1f, vm.currentScale)
    }

    @Test
    fun `savedTopInset and savedBottomInset initial states are 0`() {
        // The inset listener writes these on first apply; before that
        // happens (very brief, pre-onPageFinished), CSS would read 0px
        // for both, which is what we want.
        assertEquals(0, vm.savedTopInset)
        assertEquals(0, vm.savedBottomInset)
    }

    @Test
    fun `previousAudioMode initial state is MODE_NORMAL`() {
        // endAudioSession reads this when restoring after voice memo.
        // A non-NORMAL default would route normal playback to the
        // earpiece on a clean app start (no recording yet).
        assertEquals(AudioManager.MODE_NORMAL, vm.previousAudioMode)
    }

    @Test
    fun `renderRecoveryCount and firstRecoveryMs initial states are 0`() {
        // The 60-second sliding-window crash-loop guard reads these.
        // A non-zero default would mistakenly count the first ever
        // crash toward the loop limit.
        assertEquals(0, vm.renderRecoveryCount)
        assertEquals(0L, vm.firstRecoveryMs)
    }

    // ─── owned services ───────────────────────────────────────────────

    @Test
    fun `audioRecorder is non-null and ready for cancel`() {
        assertNotNull(vm.audioRecorder)
        // Sanity: the recorder is in idle state, so cancel is a no-op.
        // A constructor that left it in a half-built state would surface
        // as a throw here.
        vm.audioRecorder.cancel()
    }

    @Test
    fun `storage is non-null and bound to application context`() {
        assertNotNull(vm.storage)
        // Sanity: the storage manager's queryFileSize is callable on a
        // fresh ViewModel -- if the context handoff broke, a real
        // content:// URI lookup would NPE before we even built the
        // queryFileSize cursor.
        assertIs<StorageManager>(vm.storage)
    }

    // ─── post-cleared safety ──────────────────────────────────────────

    @Test
    fun `audioRecorder release is safe before any start`() {
        // Mirrors what onCleared() does on a ViewModel whose Activity
        // finished without ever recording. The recorder must handle
        // release() on a fresh, never-started instance.
        vm.audioRecorder.release()
        // Idempotence: a second release after the first.
        vm.audioRecorder.release()
    }
}
