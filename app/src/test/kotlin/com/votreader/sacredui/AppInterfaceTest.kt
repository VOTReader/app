package com.votreader.sacredui

import android.media.AudioManager
import android.view.WindowManager
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

/**
 * NK8 — AppInterface tests.
 *
 * Exists to prove the AppInterface extraction (commit 639de65) actually
 * earned its testability. Every @JavascriptInterface method that has
 * non-trivial logic gets coverage; pure platform delegations (haptic,
 * the WindowInsetsControllerCompat status-bar / immersive methods) are
 * verified to route through postToUi but their platform effects are
 * left to the real-device walk.
 *
 * Pattern:
 *   - [FakeBridgeHost] satisfies the BridgeHost contract with plain
 *     class fields. Tests dial in the exact state they need and assert
 *     against the recorded interactions.
 *   - [JsBridge] is mocked via MockK; verify { } pins what AppInterface
 *     calls back into JS land without spinning up a real WebView.
 *   - [MainViewModel] is constructed against a Robolectric-free path
 *     for tests that only touch its mutable fields; tests that need
 *     the recorder / storage substitute a relaxed MockK instance.
 */
class AppInterfaceTest {

    private fun newSubject(
        host: FakeBridgeHost = FakeBridgeHost(),
        bridge: JsBridge = mockk(relaxed = true),
        vm: MainViewModel = mockk(relaxed = true)
    ): Triple<AppInterface, FakeBridgeHost, JsBridge> {
        val app = AppInterface(host, bridge, vm)
        return Triple(app, host, bridge)
    }

    // ─── Native recorder delegation ───────────────────────────────────

    @Test
    fun `nativeRecordStart success returns ok`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.start() } returns NativeAudioRecorder.Result.Success(Unit)
        val (app, _, _) = newSubject(vm = vm)
        assertEquals("ok", app.nativeRecordStart())
    }

    @Test
    fun `nativeRecordStart failure returns error string`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.start() } returns NativeAudioRecorder.Result.Failure("permission")
        val (app, _, _) = newSubject(vm = vm)
        assertEquals("error:permission", app.nativeRecordStart())
    }

    @Test
    fun `nativeRecordPause delegates result mapping`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.pause() } returns NativeAudioRecorder.Result.Failure("pause_failed")
        val (app, _, _) = newSubject(vm = vm)
        assertEquals("error:pause_failed", app.nativeRecordPause())
    }

    @Test
    fun `nativeRecordResume delegates result mapping`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.resume() } returns NativeAudioRecorder.Result.Success(Unit)
        val (app, _, _) = newSubject(vm = vm)
        assertEquals("ok", app.nativeRecordResume())
    }

    @Test
    fun `nativeRecordAmplitude reads from recorder`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.amplitude() } returns 12345
        val (app, _, _) = newSubject(vm = vm)
        assertEquals(12345, app.nativeRecordAmplitude())
    }

    @Test
    fun `nativeRecordCancel delegates to recorder cancel`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.cancel() } just Runs
        val (app, _, _) = newSubject(vm = vm)
        app.nativeRecordCancel()
        verify(exactly = 1) { vm.audioRecorder.cancel() }
    }

    @Test
    fun `nativeRecordStop success posts NativeRecordingComplete with data`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.stop() } returns
            NativeAudioRecorder.Result.Success(NativeAudioRecorder.RecordingResult("b64data", 9876L))
        val bridge = mockk<JsBridge>(relaxed = true)
        val (app, _, _) = newSubject(bridge = bridge, vm = vm)

        app.nativeRecordStop()

        verify(exactly = 1) {
            bridge.callOptional(JsEvent.NativeRecordingComplete, "b64data", 9876L, "audio/mp4")
        }
    }

    @Test
    fun `nativeRecordStop failure posts NativeRecordingComplete with null payload`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.stop() } returns NativeAudioRecorder.Result.Failure("stop_failed")
        val bridge = mockk<JsBridge>(relaxed = true)
        val (app, _, _) = newSubject(bridge = bridge, vm = vm)

        app.nativeRecordStop()

        verify(exactly = 1) {
            bridge.callOptional(JsEvent.NativeRecordingComplete, null, 0L, "audio/mp4")
        }
    }

    // ─── Storage delegation (SAF export) ──────────────────────────────

    @Test
    fun `saveToFile posts to UI thread and launches the export picker`() {
        val host = FakeBridgeHost()
        val (app, _, _) = newSubject(host = host)

        app.saveToFile("export.json", "{}")

        assertEquals(1, host.postedActions.size, "should hop through postToUi")
        assertEquals(1, host.exportPickerCalls.size)
    }

    @Test
    fun `saveToFile forwards suggested name and content verbatim`() {
        val host = FakeBridgeHost()
        val (app, _, _) = newSubject(host = host)

        app.saveToFile("my-export-2026.json", "{\"k\":\"v\"}")

        assertEquals(
            "my-export-2026.json" to "{\"k\":\"v\"}",
            host.exportPickerCalls[0]
        )
    }

    // ─── Zoom + screenshot ────────────────────────────────────────────

    @Test
    fun `getZoomScale reads from vm`() {
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.currentScale } returns 1.75f
        val (app, _, _) = newSubject(vm = vm)
        assertEquals(1.75f, app.getZoomScale())
    }

    @Test
    fun `takeScreenshot delegates to host with same args`() {
        val host = FakeBridgeHost().apply { captureScreenshotResult = "data:image/jpeg;base64,XYZ" }
        val (app, _, _) = newSubject(host = host)

        val result = app.takeScreenshot(48, 1024, 85)

        assertEquals("data:image/jpeg;base64,XYZ", result)
        assertEquals(1, host.captureScreenshotCalls.size)
        assertEquals(Triple(48, 1024, 85), host.captureScreenshotCalls[0])
    }

    // ─── File picker + crash log ──────────────────────────────────────

    @Test
    fun `openFilePicker posts to UI thread and launches picker`() {
        val host = FakeBridgeHost()
        val (app, _, _) = newSubject(host = host)

        app.openFilePicker()

        assertEquals(1, host.postedActions.size, "should hop through postToUi")
        assertEquals(1, host.filePickerLaunchCount)
    }

    @Test
    fun `getCrashLog returns empty array when releaseTree is null`() {
        // Default state -- VOTReaderApp.releaseTree is null on debug builds
        // (and in this test environment, where VOTReaderApp.onCreate never ran).
        VOTReaderApp.releaseTree = null
        val (app, _, _) = newSubject()
        assertEquals("[]", app.getCrashLog())
    }

    @Test
    fun `getCrashLog returns tree JSON when releaseTree is set`() {
        val tree = BoundedLogTree()
        VOTReaderApp.releaseTree = tree
        try {
            val (app, _, _) = newSubject()
            // Whatever the tree's toJson() format is, AppInterface must
            // forward it verbatim. The exact shape is BoundedLogTree's
            // contract (covered by BoundedLogTreeTest); we only assert
            // the forwarding here.
            assertEquals(tree.toJson(), app.getCrashLog())
        } finally {
            VOTReaderApp.releaseTree = null
        }
    }

    // ─── Audio session ────────────────────────────────────────────────

    @Test
    fun `startAudioSession saves prior mode and switches to MODE_IN_COMMUNICATION`() {
        val am = mockk<AudioManager>(relaxed = true)
        every { am.mode } returns AudioManager.MODE_NORMAL
        every { am.mode = any() } just Runs
        val host = FakeBridgeHost().apply { audioSystemService = am }
        val vm = mockk<MainViewModel>(relaxed = true)
        val (app, _, _) = newSubject(host = host, vm = vm)

        app.startAudioSession()

        verify { vm.previousAudioMode = AudioManager.MODE_NORMAL }
        verify { am.mode = AudioManager.MODE_IN_COMMUNICATION }
    }

    @Test
    fun `startAudioSession does NOT re-save prior mode on a double-start (N2 guard)`() {
        val am = mockk<AudioManager>(relaxed = true)
        every { am.mode } returns AudioManager.MODE_IN_COMMUNICATION // already mid-session
        every { am.mode = any() } just Runs
        val host = FakeBridgeHost().apply { audioSystemService = am }
        val vm = mockk<MainViewModel>(relaxed = true)
        val (app, _, _) = newSubject(host = host, vm = vm)

        app.startAudioSession()

        // N2: a second start (mode already COMMUNICATION) must NOT overwrite
        // previousAudioMode — otherwise endAudioSession would restore TO
        // communication mode and strand the device. The mode is still applied.
        verify(exactly = 0) { vm.previousAudioMode = any() }
        verify { am.mode = AudioManager.MODE_IN_COMMUNICATION }
    }

    @Test
    fun `startAudioSession is a safe no-op when AudioManager is null`() {
        val host = FakeBridgeHost() // audioSystemService = null
        val vm = mockk<MainViewModel>(relaxed = true)
        val (app, _, _) = newSubject(host = host, vm = vm)

        // Should not throw. With no AudioManager, vm.previousAudioMode
        // must NOT be touched (otherwise endAudioSession would later
        // overwrite the real prior mode with a stale value).
        app.endAudioSession()
        app.startAudioSession()

        verify(exactly = 0) { vm.previousAudioMode = any() }
    }

    @Test
    fun `endAudioSession restores vm previousAudioMode`() {
        val am = mockk<AudioManager>(relaxed = true)
        every { am.mode = any() } just Runs
        val host = FakeBridgeHost().apply { audioSystemService = am }
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.previousAudioMode } returns AudioManager.MODE_NORMAL
        val (app, _, _) = newSubject(host = host, vm = vm)

        app.endAudioSession()

        verify { am.mode = AudioManager.MODE_NORMAL }
    }

    // ─── Keep-screen-on toggle ────────────────────────────────────────

    @Test
    fun `setKeepScreenOn true updates vm and adds window flag`() {
        val host = FakeBridgeHost()
        val vm = mockk<MainViewModel>(relaxed = true)
        val (app, _, _) = newSubject(host = host, vm = vm)

        app.setKeepScreenOn(true)

        verify { vm.keepScreenOnEnabled = true }
        verify { host.activityWindow.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    @Test
    fun `setKeepScreenOn false updates vm and clears window flag`() {
        val host = FakeBridgeHost()
        val vm = mockk<MainViewModel>(relaxed = true)
        val (app, _, _) = newSubject(host = host, vm = vm)

        app.setKeepScreenOn(false)

        verify { vm.keepScreenOnEnabled = false }
        verify { host.activityWindow.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    // ─── Mic permission flow ──────────────────────────────────────────

    @Test
    fun `requestMicPermission granted path reports true without launching dialog`() {
        val host = FakeBridgeHost().apply { hasAudioPermissionValue = true }
        val bridge = mockk<JsBridge>(relaxed = true)
        val (app, _, _) = newSubject(host = host, bridge = bridge)

        app.requestMicPermission()

        verify(exactly = 1) { bridge.callOptional(JsEvent.MicPermissionResult, true) }
        assertEquals(0, host.micPermissionLaunchCount, "no dialog should launch when already granted")
    }

    @Test
    fun `requestMicPermission denied path triggers OS dialog and posts no result yet`() {
        val host = FakeBridgeHost().apply { hasAudioPermissionValue = false }
        val bridge = mockk<JsBridge>(relaxed = true)
        val (app, _, _) = newSubject(host = host, bridge = bridge)

        app.requestMicPermission()

        assertEquals(1, host.micPermissionLaunchCount)
        // The result arrives asynchronously via micPrepLauncher's callback
        // (driven from MainActivity.onCreate's registerForActivityResult),
        // not from this method. So no callOptional fires here.
        verify(exactly = 0) { bridge.callOptional(JsEvent.MicPermissionResult, any<Boolean>()) }
    }

    @Test
    fun `requestMicPermission launcher exception reports false to JS`() {
        val host = FakeBridgeHost().apply {
            hasAudioPermissionValue = false
            micPermissionThrowsOnLaunch = IllegalStateException("Activity not started")
        }
        val bridge = mockk<JsBridge>(relaxed = true)
        val (app, _, _) = newSubject(host = host, bridge = bridge)

        app.requestMicPermission()

        assertEquals(1, host.micPermissionLaunchCount)
        verify(exactly = 1) { bridge.callOptional(JsEvent.MicPermissionResult, false) }
    }

    // ─── postToUi routing for status bar / immersive mode ─────────────

    @Test
    fun `setLightStatusBar posts to UI thread`() {
        val host = FakeBridgeHost().apply { executePostedImmediately = false }
        val (app, _, _) = newSubject(host = host)

        app.setLightStatusBar(true)

        assertEquals(1, host.postedActions.size)
    }

    @Test
    fun `setImmersiveMode posts to UI thread`() {
        val host = FakeBridgeHost().apply { executePostedImmediately = false }
        val (app, _, _) = newSubject(host = host)

        app.setImmersiveMode(true)
        app.setImmersiveMode(false)

        assertEquals(2, host.postedActions.size)
    }

    // ─── Smoke: AppInterface end-to-end without an Activity ──────────

    @Test
    fun `AppInterface routes through a real JsBridge without an Activity`() {
        // This is the structural payoff of the BridgeHost extraction.
        // Pre-extraction, instantiating AppInterface required a fully-
        // initialised MainActivity (window, webView, audioManager,
        // launchers, etc.) AND a Robolectric runtime. Post-extraction,
        // a plain unit test on the JVM is sufficient. If this test ever
        // starts requiring Robolectric, the extraction has regressed.
        //
        // Use a real JsBridge whose webViewProvider throws -- proves the
        // wiring reaches the bridge (which then errors when it tries to
        // touch the non-existent WebView). IllegalStateException = the
        // call made it through AppInterface -> JsBridge.callOptional ->
        // webViewProvider, which is the full bridge path under test.
        val realBridge = JsBridge { error("test stub: no WebView") }
        val vm = mockk<MainViewModel>(relaxed = true)
        every { vm.audioRecorder.stop() } returns
            NativeAudioRecorder.Result.Failure("test")
        val app = AppInterface(FakeBridgeHost(), realBridge, vm)

        assertThrows<IllegalStateException> { app.nativeRecordStop() }
    }
}
