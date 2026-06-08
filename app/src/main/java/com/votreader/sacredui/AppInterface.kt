package com.votreader.sacredui

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.util.Base64
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.webkit.JavascriptInterface
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import timber.log.Timber

/**
 * The JS-facing bridge surface (bound as `window.AndroidBridge` from the
 * WebView side). Every method annotated @JavascriptInterface is callable
 * from JS; everything else is internal plumbing.
 *
 * Constructor-injects its three dependencies so the class is fully
 * testable without an Activity:
 *
 *   - [host] — the BridgeHost abstraction over Activity surface (window,
 *     context, WebView, launchers, screenshot capture).
 *
 *   - [bridge] — the JsBridge for native-to-JS callbacks. Posts every
 *     call onto the WebView thread; safe to invoke from binder threads
 *     (where @JavascriptInterface methods land).
 *
 *   - [vm] — the MainViewModel holding state that survives config
 *     changes: audioRecorder, storage, currentScale, previousAudioMode,
 *     keepScreenOnEnabled.
 *
 * Threading: every @JavascriptInterface method arrives on a binder
 * thread (not the UI thread). UI-touching work routes through
 * host.postToUi { }; everything else (storage, recorder, vibrator,
 * crash log read) is thread-safe and runs inline.
 */
class AppInterface(
    private val host: BridgeHost,
    private val bridge: JsBridge,
    private val vm: MainViewModel
) {

    // (U19) Cache the Vibrator lookup — haptic() can fire on many taps and
    // getSystemService on every call is wasteful. The service is process-stable
    // + thread-safe, so a lazy singleton is safe from the binder thread where
    // @JavascriptInterface methods land.
    private val vibrator: Vibrator by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (host.activityContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            host.activityContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    @JavascriptInterface
    fun setLightStatusBar(light: Boolean) {
        host.postToUi {
            WindowInsetsControllerCompat(host.activityWindow, host.activityWindow.decorView)
                .isAppearanceLightStatusBars = light
        }
    }

    @JavascriptInterface
    fun setKeepScreenOn(enabled: Boolean) {
        host.postToUi {
            vm.keepScreenOnEnabled = enabled
            if (enabled) {
                host.activityWindow.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                host.activityWindow.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    // Called by the JS voice recorder BEFORE getUserMedia. If RECORD_AUDIO
    // is already granted we tell JS immediately; otherwise we show the OS
    // permission dialog and report the result via micPrepLauncher's
    // callback (window.__onMicPermissionResult). Proactively settling the
    // OS permission means the subsequent WebView onPermissionRequest can
    // grant synchronously — no grant-after-dialog race / hang.
    @JavascriptInterface
    fun requestMicPermission() {
        host.postToUi {
            if (host.hasAudioPermission()) {
                bridge.callOptional(JsEvent.MicPermissionResult, true)
            } else {
                try {
                    host.launchMicPermissionRequest()
                } catch (e: Exception) {
                    Timber.w(e, "requestMicPermission launch failed")
                    bridge.callOptional(JsEvent.MicPermissionResult, false)
                }
            }
        }
    }

    // Called by the JS recorder right after getUserMedia resolves. Switching
    // to MODE_IN_COMMUNICATION keeps the mic AudioRecord session stable on
    // Android 8+ — without it, Pixel/Samsung devices intermittently drop the
    // capture (AAUDIO_ERROR_DISCONNECTED) or never acquire it (NotReadableError).
    @JavascriptInterface
    fun startAudioSession() {
        host.postToUi {
            val am = host.audioSystemService ?: return@postToUi
            // N2: only capture the prior mode when we're NOT already in a
            // recording session. A double startAudioSession() without an
            // intervening endAudioSession() (a recovery re-fire, a re-mounted
            // sheet, or a start after a failed stop) would otherwise save
            // MODE_IN_COMMUNICATION as "previous", and endAudioSession() would
            // then restore TO communication mode and never return to normal —
            // stranding the device on earpiece routing. The normal path (mode is
            // NORMAL at start) is unchanged.
            if (am.mode != AudioManager.MODE_IN_COMMUNICATION) {
                vm.previousAudioMode = am.mode
            }
            try {
                am.mode = AudioManager.MODE_IN_COMMUNICATION
            } catch (e: Exception) {
                Timber.w(e, "startAudioSession setMode failed")
            }
        }
    }

    // Called by the JS recorder when recording stops (entering preview) and
    // again from cleanup(). Restores the prior audio mode so preview/saved
    // playback routes to the speaker normally, not the earpiece. Idempotent.
    @JavascriptInterface
    fun endAudioSession() {
        host.postToUi {
            val am = host.audioSystemService ?: return@postToUi
            try {
                am.mode = vm.previousAudioMode
            } catch (e: Exception) {
                Timber.w(e, "endAudioSession restoreMode failed")
            }
        }
    }

    // ─── Native voice recording (Android-reliable path) ──────────────
    // The JS recorder uses these instead of getUserMedia/MediaRecorder
    // when window.AndroidBridge.nativeRecordStart exists. Records AAC
    // into an MPEG-4 (.m4a) temp file in cacheDir -- playable by an
    // HTML <audio> element and storable as a Blob, so the existing
    // preview/IndexedDB pipeline is unchanged. RECORD_AUDIO is ensured
    // by requestMicPermission before JS calls these.
    //
    // The MediaRecorder lifecycle + threading + temp-file management
    // all live in [NativeAudioRecorder]; these @JavascriptInterface
    // methods are thin delegates whose only job is to translate
    // Result<T> into the "ok" / "error:<reason>" string the JS side
    // already expects. The string shape stays identical so the JS
    // contract is preserved bit-for-bit.

    /** Start recording. Returns "ok" or "error:<reason>" synchronously. */
    @JavascriptInterface
    fun nativeRecordStart(): String = when (val r = vm.audioRecorder.start()) {
        is NativeAudioRecorder.Result.Success -> "ok"
        is NativeAudioRecorder.Result.Failure -> "error:${r.reason}"
    }

    @JavascriptInterface
    fun nativeRecordPause(): String = when (val r = vm.audioRecorder.pause()) {
        is NativeAudioRecorder.Result.Success -> "ok"
        is NativeAudioRecorder.Result.Failure -> "error:${r.reason}"
    }

    @JavascriptInterface
    fun nativeRecordResume(): String = when (val r = vm.audioRecorder.resume()) {
        is NativeAudioRecorder.Result.Success -> "ok"
        is NativeAudioRecorder.Result.Failure -> "error:${r.reason}"
    }

    /** Peak amplitude since the last call (0..32767). Drives the waveform. */
    @JavascriptInterface
    fun nativeRecordAmplitude(): Int = vm.audioRecorder.amplitude()

    /** Stop, then deliver the audio to JS via
     *  window.__onNativeRecordingComplete(base64, durationMs, mime).
     *  base64 is null on failure. The read/encode runs on this binder
     *  thread (already off the UI thread) then posts to the WebView. */
    @JavascriptInterface
    fun nativeRecordStop() {
        when (val r = vm.audioRecorder.stop()) {
            is NativeAudioRecorder.Result.Success ->
                postNativeComplete(r.value.base64, r.value.durationMs)
            is NativeAudioRecorder.Result.Failure ->
                postNativeComplete(null, 0L)
        }
    }

    /** Abort recording and delete the temp file with no JS callback. */
    @JavascriptInterface
    fun nativeRecordCancel() {
        vm.audioRecorder.cancel()
    }

    @JavascriptInterface
    fun setZoomEnabled(enabled: Boolean) {
        host.postToUi {
            val wv = host.activeWebView
            if (!enabled) {
                val current = vm.currentScale
                if (current > 0f && (current != 1f)) wv.zoomBy(1f / current)
            }
            wv.settings.setSupportZoom(enabled)
            wv.settings.builtInZoomControls = enabled
            wv.settings.displayZoomControls = false
        }
    }

    @JavascriptInterface
    fun resetZoom() {
        host.postToUi {
            val current = vm.currentScale
            if (current > 0f && (current != 1f)) host.activeWebView.zoomBy(1f / current)
        }
    }

    @JavascriptInterface
    fun getZoomScale(): Float = vm.currentScale

    @JavascriptInterface
    fun takeScreenshot(topCropDp: Int, maxDim: Int, jpegQuality: Int): String =
        host.captureScreenshot(topCropDp, maxDim, jpegQuality)

    /** Open the system JSON file picker. When the user picks a file (or
     *  cancels), the file content is base64-encoded and delivered back to
     *  JS as window.__onImportFile(b64) — or null on cancel/error. */
    @JavascriptInterface
    fun openFilePicker() {
        host.postToUi {
            host.launchFilePicker()
        }
    }

    /** Export [content] (UTF-8 text) to a user-chosen location via the
     *  system "create document" picker (SAF). Asynchronous: returns
     *  immediately after launching the picker; the outcome is delivered to
     *  JS as window.__onExportComplete("ok" | "error:<reason>" |
     *  "cancelled"). Unlike the old Downloads-collection path this works on
     *  every supported API level (SAF is API 19+), so Export is reachable
     *  on Android 8/9 where Downloads writes hard-failed. [suggestedName]
     *  pre-fills the picker's filename field; the user can override the
     *  name and folder. */
    @JavascriptInterface
    fun saveToFile(suggestedName: String, content: String) {
        host.postToUi { host.launchExportPicker(suggestedName, content) }
    }

    // ─── v3 streaming backup (BACKUP-STREAMING-PLAN P3) ──────────────────
    // GB-scale export/import. The binary framing lives in StorageManager (a
    // native mirror of src/utils/backup-container.js); these
    // @JavascriptInterface methods are the CHUNKED bridge between the JS driver
    // (SettingsScreen) and that framing. base64 is the transient bridge
    // encoding ONLY — the string bridge can't carry raw bytes / GBs in one arg
    // — and is NEVER written to disk. The SAF picker is async, so
    // v3ExportOpen/v3ImportOpen just launch it; the chosen URI lands in the
    // MainActivity result callback (stashed on the vm) and these binder-thread
    // methods then do all the stream I/O off the UI thread. JS only ever holds
    // one <=ANDROID_CHUNK slice at a time, so peak memory is bounded regardless
    // of total backup size.

    /** Map a StorageManager Unit result to the "ok"/"error:<reason>" string the
     *  JS bridge contract expects (same shape as the recorder methods). */
    private fun okOr(r: StorageManager.Result<Unit>): String = when (r) {
        is StorageManager.Result.Success -> "ok"
        is StorageManager.Result.Failure -> "error:${r.reason}"
    }

    /** Launch the SAF create-document picker for a v3 export. The chosen URI
     *  arrives in the MainActivity callback, which fires __onV3ExportReady. */
    @JavascriptInterface
    fun v3ExportOpen(suggestedName: String) {
        host.postToUi { host.launchV3ExportPicker(suggestedName) }
    }

    /** Open the stashed export URI and write the container header (magic + the
     *  manifest frame). [manifestJson] is the buildV3Manifest output. Returns
     *  "ok" / "error:<reason>". Runs on the binder thread (off the UI thread). */
    @JavascriptInterface
    fun v3ExportBegin(manifestJson: String): String {
        val uri = vm.pendingV3ExportUri ?: return "error:no_destination"
        return okOr(vm.storage.beginV3Export(uri, manifestJson.toByteArray(Charsets.UTF_8)))
    }

    /** Write the next media frame's 8-byte length header. [sizeStr] is the
     *  blob's exact byte length as a decimal string (a JS number loses
     *  precision past 2^53 and @JavascriptInterface int overflows at 2 GB). */
    @JavascriptInterface
    fun v3ExportWriteBlob(sizeStr: String): String {
        val size = sizeStr.toLongOrNull() ?: return "error:bad_size"
        return okOr(vm.storage.v3ExportWriteBlobHeader(size))
    }

    /** Decode one base64 chunk of the current blob and append its raw bytes. */
    @JavascriptInterface
    fun v3ExportChunk(base64: String): String {
        val bytes = try { Base64.decode(base64, Base64.NO_WRAP) }
            catch (e: IllegalArgumentException) { return "error:bad_base64" }
        return okOr(vm.storage.v3ExportWriteChunk(bytes))
    }

    /** Finish the export. [commit] true → flush + close; false → abort (close +
     *  delete the partial file). Clears the stashed URI either way. */
    @JavascriptInterface
    fun v3ExportFinish(commit: Boolean): String {
        val r = okOr(vm.storage.finishV3Export(commit, vm.pendingV3ExportUri))
        vm.pendingV3ExportUri = null
        return r
    }

    /** Launch the SAF open-document picker for a v3 import. The chosen URI
     *  arrives in the MainActivity callback, which fires __onV3ImportReady. */
    @JavascriptInterface
    fun v3ImportOpen() {
        host.postToUi { host.launchV3ImportPicker() }
    }

    /** Open the stashed import URI, sniff the format, and return
     *  "v3:<manifestJson>" (a v3 container — stream the blobs next),
     *  "legacy:<jsonText>" (a whole v1/v2 backup), or "error:<reason>". */
    @JavascriptInterface
    fun v3ImportBegin(): String {
        val uri = vm.pendingV3ImportUri ?: return "error:no_source"
        return when (val r = vm.storage.beginV3Import(uri)) {
            is StorageManager.Result.Success -> r.value
            is StorageManager.Result.Failure -> "error:${r.reason}"
        }
    }

    /** Advance to the next media frame; returns its declared byte length as a
     *  decimal string (JS cross-checks it against manifest.media[i].size) or
     *  "error:<reason>". */
    @JavascriptInterface
    fun v3ImportNextBlob(): String = when (val r = vm.storage.v3ImportNextBlob()) {
        is StorageManager.Result.Success -> r.value.toString()
        is StorageManager.Result.Failure -> "error:${r.reason}"
    }

    /** Read up to [maxBytes] of the current frame as base64. "" = the current
     *  frame is fully read (advance to the next). "error:<reason>" on a
     *  truncated/corrupt stream. (base64 never contains ':', so the error
     *  sentinel is unambiguous.) */
    @JavascriptInterface
    fun v3ImportReadChunk(maxBytes: Int): String = when (val r = vm.storage.v3ImportReadChunk(maxBytes)) {
        is StorageManager.Result.Success ->
            if (r.value.isEmpty()) "" else Base64.encodeToString(r.value, Base64.NO_WRAP)
        is StorageManager.Result.Failure -> "error:${r.reason}"
    }

    /** Close the import stream (success, cancel, or error cleanup). Clears the
     *  stashed URI. */
    @JavascriptInterface
    fun v3ImportClose() {
        vm.storage.closeV3Import()
        vm.pendingV3ImportUri = null
    }

    /**
     * Return the BoundedLogTree's JSON-array snapshot, used by the
     * JS-side Export to include a diagnostic tail in the user's
     * "Your Data" export. Returns "[]" on debug builds (the
     * DebugTree is planted instead of BoundedLogTree, so there's no
     * captured buffer to read). The contract from JS's perspective
     * is "always a valid JSON array string", which both branches
     * honour.
     */
    @JavascriptInterface
    fun getCrashLog(): String {
        return VOTReaderApp.releaseTree?.toJson() ?: "[]"
    }

    /**
     * NTV3: delete the native Garden image disk cache (cacheDir/garden, capped at
     * 800 MB). Wired to the JS "Clear All My Data" flow so the native cache doesn't
     * survive a full wipe (the JS side only clears IndexedDB + localStorage). Runs
     * synchronously on the binder thread (NOT the UI thread) — GardenImageCache.clear()
     * is plain file I/O and swallows its own errors.
     */
    @JavascriptInterface
    fun clearGardenCache() {
        host.clearGardenCache()
    }

    @JavascriptInterface
    fun setImmersiveMode(immersive: Boolean) {
        host.postToUi {
            val controller = WindowInsetsControllerCompat(host.activityWindow, host.activityWindow.decorView)
            if (immersive) {
                controller.hide(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    /**
     * Fire a short haptic vibration so WebView interactions feel native.
     * Styles: 0 = tick (light), 1 = click (medium), 2 = heavy click,
     * 3 = double click. On API 29+ uses predefined platform effects;
     * on API 26-28 falls back to duration/amplitude one-shots.
     * Safe to call from the binder thread (Vibrator is thread-safe).
     */
    @JavascriptInterface
    fun haptic(style: Int) {
        val effect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            VibrationEffect.createPredefined(
                when (style) {
                    1 -> VibrationEffect.EFFECT_CLICK
                    2 -> VibrationEffect.EFFECT_HEAVY_CLICK
                    3 -> VibrationEffect.EFFECT_DOUBLE_CLICK
                    else -> VibrationEffect.EFFECT_TICK
                }
            )
        } else {
            VibrationEffect.createOneShot(
                when (style) { 1 -> 20L; 2 -> 30L; 3 -> 40L; else -> 10L },
                when (style) { 1 -> 128; 2 -> 200; 3 -> 255; else -> 80 }
            )
        }
        try {
            vibrator.vibrate(effect)
        } catch (e: Exception) {
            Timber.w(e, "haptic(%d) failed", style)
        }
    }

    // Deliver a finished native recording to JS. base64 is null on failure;
    // mime is always audio/mp4 (AAC in MPEG-4). The bridge marshals the call
    // onto the WebView's thread; nativeRecordStop runs on a binder thread.
    private fun postNativeComplete(base64: String?, durationMs: Long) {
        bridge.callOptional(JsEvent.NativeRecordingComplete, base64, durationMs, "audio/mp4")
    }
}
