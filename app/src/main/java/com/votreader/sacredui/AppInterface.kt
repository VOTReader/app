package com.votreader.sacredui

import android.content.Context
import android.media.AudioManager
import android.os.Build
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
            vm.previousAudioMode = am.mode
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
    @Suppress("unused")
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

    /** Write [content] (UTF-8 text) to the Downloads folder as [filename].
     *  Returns "ok" on success or "error:<reason>" on failure. Requires
     *  Android 10+ (API 29) for the MediaStore Downloads collection; on
     *  older devices returns "error:requires_android_10". */
    @JavascriptInterface
    fun saveToDownloads(filename: String, content: String): String {
        return when (val r = vm.storage.writeJsonToDownloads(filename, content)) {
            is StorageManager.Result.Success -> "ok"
            is StorageManager.Result.Failure -> "error:${r.reason}"
        }
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
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (host.activityContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            host.activityContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
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
