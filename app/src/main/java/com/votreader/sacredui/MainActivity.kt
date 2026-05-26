package com.votreader.sacredui

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.AudioManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.addCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.graphics.createBitmap
import androidx.core.graphics.scale
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import androidx.webkit.WebViewClientCompat
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import timber.log.Timber

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var savedTopInset = 0
    private var savedBottomInset = 0
    @Volatile private var currentScale = 1f
    // Read by setKeepScreenOn(); flips FLAG_KEEP_SCREEN_ON on/off from JS.
    private var keepScreenOnEnabled = true
    // Audio session management for voice recording. startAudioSession() puts
    // the device into MODE_IN_COMMUNICATION so the WebView's AudioRecord can
    // reliably acquire the mic on Android 8+ (Pixel/Samsung); endAudioSession()
    // restores the prior mode so normal playback isn't routed to the earpiece.
    private var audioManager: AudioManager? = null
    private var previousAudioMode = AudioManager.MODE_NORMAL
    // Native voice-recording state. Recording is done with the OS MediaRecorder
    // (AAC/MPEG-4 → .m4a) instead of WebView getUserMedia, which is unreliable
    // across the Android version/OEM matrix. recLock guards all access since
    // @JavascriptInterface methods are invoked on a binder thread, not main.
    private val recLock = Any()
    private var nativeRecorder: MediaRecorder? = null
    private var nativeRecordFile: File? = null
    private var nativeRecordStartMs = 0L
    private var nativeRecordPausedAccumMs = 0L
    private var nativeRecordPauseStartMs = 0L
    // Held true while the system splash screen should remain on top. Flipped
    // false after onPageFinished + a short delay to let React mount, so the
    // cold-boot transition is splash → first frame with no black flash.
    @Volatile private var splashHolding = true
    // Launcher for the import file picker; registered in onCreate before the
    // WebView is created so it is ready before any JS calls openFilePicker().
    private lateinit var filePickerLauncher: ActivityResultLauncher<String>

    // Launcher for the WebChromeClient.onShowFileChooser callback (image
    // inserts via <input type="file"> in the journal editor). The callback
    // is held in fileChooserCallback so the result lands back on the WebView.
    private lateinit var webFileChooserLauncher: ActivityResultLauncher<String>
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    // Pending WebView permission request — captured when JS calls
    // getUserMedia and we need to ask the user for RECORD_AUDIO at runtime.
    private var pendingMicPermission: PermissionRequest? = null
    private lateinit var micPermissionLauncher: ActivityResultLauncher<String>
    // Proactive RECORD_AUDIO request, driven by JS BEFORE getUserMedia (via
    // AppInterface.requestMicPermission). Result is pushed back to JS as
    // window.__onMicPermissionResult(granted). Separate from the launcher
    // above so the two flows never clobber each other's callback.
    private lateinit var micPrepLauncher: ActivityResultLauncher<String>

    companion object {
        // Allowlist for shouldOverrideUrlLoading — anything not in this list
        // is refused (not handed to Intent.ACTION_VIEW) so a stray
        // `intent://` or `javascript:` URI in any data file can't launch
        // arbitrary apps or escalate. Asset-loader URLs are matched by
        // exact prefix earlier and don't reach this allowlist.
        private val ALLOWED_EXTERNAL_SCHEMES = setOf("https", "http", "mailto", "tel")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Install the system splash BEFORE super.onCreate. Held visible until
        // the WebView's first paint (see splashHolding + onPageFinished
        // below) so the cold-boot transition is launcher icon → splash icon
        // → first frame with no flash of empty black. core-splashscreen
        // backports the Android 12+ API to API 23+; we target 26+.
        val splash = installSplashScreen()
        splash.setKeepOnScreenCondition { splashHolding }
        super.onCreate(savedInstanceState)

        // Register the file-picker launcher before the WebView is attached.
        // The callback fires when the user picks a file (after returning from
        // the system file chooser). It reads the file content in Kotlin and
        // delivers it to JS as base64 via window.__onImportFile so that
        // allowContentAccess=false on the WebView is never a factor.
        filePickerLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) {
                try {
                    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    webView.post {
                        webView.evaluateJavascript("window.__onImportFile && window.__onImportFile('$b64')", null)
                    }
                } catch (e: Exception) {
                    Timber.w(e, "Import file read failed")
                    webView.post {
                        webView.evaluateJavascript("window.__onImportFile && window.__onImportFile(null)", null)
                    }
                }
            } else {
                // User cancelled the picker
                webView.post {
                    webView.evaluateJavascript("window.__onImportFile && window.__onImportFile(null)", null)
                }
            }
        }

        // WebView file chooser launcher — drives <input type="file"> for
        // image inserts in the journal editor. Holds the WebView callback in
        // fileChooserCallback so multiple flows (chooser cancel, file picked,
        // error) all resolve the same callback.
        webFileChooserLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            val cb = fileChooserCallback
            fileChooserCallback = null
            if (cb != null) {
                if (uri != null) cb.onReceiveValue(arrayOf(uri)) else cb.onReceiveValue(null)
            }
        }

        // Runtime RECORD_AUDIO permission — required by every Android since
        // API 23 (we target 26+, so always asked at runtime). The WebView's
        // PermissionRequest is held in pendingMicPermission and either
        // granted or denied based on the OS result.
        micPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val req = pendingMicPermission
            pendingMicPermission = null
            if (req != null) {
                if (granted) {
                    // Wait 250 ms before granting the WebView permission so the OS
                    // audio subsystem can release the AudioRecord session it holds
                    // while verifying mic access during the permission dialog. Without
                    // this delay, WebView's getUserMedia() immediately fires
                    // NotReadableError on Pixel 9 Pro and other Android 12+ devices
                    // even though no other app is using the microphone.
                    webView.postDelayed({
                        runOnUiThread {
                            try { req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) }
                            catch (e: Exception) { Timber.w(e, "PermissionRequest grant failed") }
                        }
                    }, 250L)
                } else {
                    runOnUiThread {
                        try { req.deny() }
                        catch (e: Exception) { Timber.w(e, "PermissionRequest deny failed") }
                    }
                }
            }
        }

        // Proactive mic-permission launcher — the JS recorder calls
        // AppInterface.requestMicPermission() before getUserMedia; we report
        // the OS result back so JS only proceeds when capture will succeed.
        micPrepLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                // Same 250 ms grace period as micPermissionLauncher — lets the OS
                // release its AudioRecord session before JS calls getUserMedia().
                webView.postDelayed({
                    webView.evaluateJavascript(
                        "window.__onMicPermissionResult && window.__onMicPermissionResult(true)", null
                    )
                }, 250L)
            } else {
                webView.post {
                    webView.evaluateJavascript(
                        "window.__onMicPermissionResult && window.__onMicPermissionResult(false)", null
                    )
                }
            }
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (keepScreenOnEnabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Debug-only: let Chrome DevTools attach to the WebView via
        // chrome://inspect/#devices. Static method — affects all WebViews
        // in the process. BuildConfig.DEBUG is false on release builds, so
        // the debugging surface is never exposed in shipped APKs.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView = WebView(this)
        setContentView(webView)

        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager

        webView.settings.apply {
            @Suppress("SetJavaScriptEnabled")
            javaScriptEnabled = true
            domStorageEnabled = true
            // Block raw file:// reads — those could expose any file on disk
            // the app process has rights to. `allowContentAccess` is enabled
            // so the WebView can read content:// URIs delivered by
            // onShowFileChooser (journal image insert) — those are scoped
            // by the OS to whatever the user explicitly picked.
            allowFileAccess = false
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // Audio playback (journal voice memos) must start without a user
            // gesture for the preview play button to work right after recording.
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = false
            useWideViewPort = false
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()

        webView.addJavascriptInterface(AppInterface(), "AndroidBridge")
        // Route JS console output to Logcat so production crashes / [object CSS]
        // React-warning class failures / WebView errors are visible via
        // `adb logcat -s WebViewJS`. Previously discarded silently.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                val src = msg.sourceId() ?: ""
                val line = msg.lineNumber()
                val text = msg.message()
                when (msg.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> Timber.tag("WebViewJS").e("%s  (%s:%d)", text, src, line)
                    ConsoleMessage.MessageLevel.WARNING -> Timber.tag("WebViewJS").w("%s  (%s:%d)", text, src, line)
                    ConsoleMessage.MessageLevel.DEBUG -> Timber.tag("WebViewJS").d("%s  (%s:%d)", text, src, line)
                    else -> Timber.tag("WebViewJS").i("%s  (%s:%d)", text, src, line)
                }
                return true
            }

            // Drives the journal editor's image <input type=file>. Without
            // this override, file inputs silently no-op on Android WebView.
            // We accept whatever MIME the input advertises (the journal
            // editor requests images only); fall back to images if none.
            // If the user cancels, the callback gets null. Only one chooser
            // can be active — a stale callback is resolved before the next.
            // (Kotlin block comments NEST, so this stays line-comments to
            //  avoid any slash-star / star-slash sequence breaking the lexer.)
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                // Resolve any leftover callback from a prior chooser
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                // Prefer the most-specific MIME advertised by the input.
                // Fall back to image/* for safety (journal editor's main use).
                val accept = fileChooserParams.acceptTypes
                    ?.firstOrNull { !it.isNullOrBlank() }
                    ?: "image/*"

                return try {
                    webFileChooserLauncher.launch(accept)
                    true
                } catch (e: Exception) {
                    Timber.w(e, "onShowFileChooser launch failed")
                    fileChooserCallback = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }

            /** Called by the WebView when JS requests permission to use
             *  device capabilities (mic/camera). For RECORD_AUDIO we ask the
             *  user at runtime if not already granted, then resolve the
             *  PermissionRequest on the result. Any other resource (camera,
             *  midi, etc.) is denied — the app has no use for them. */
            override fun onPermissionRequest(request: PermissionRequest) {
                val resources = request.resources
                val wantsMic = resources?.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE } == true
                if (!wantsMic) {
                    runOnUiThread { try { request.deny() } catch (_: Exception) {} }
                    return
                }
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    // Delay the grant 250 ms (same as micPermissionLauncher /
                    // micPrepLauncher). When permission is already granted, this
                    // path fires synchronously with Chromium opening AudioRecord;
                    // on Pixel 12+ the privacy-indicator subsystem may still hold
                    // the mic for a beat. The delay lets the hardware free up
                    // before WebView's capture attempt, preventing NotReadableError.
                    webView.postDelayed({
                        runOnUiThread {
                            try { request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) }
                            catch (e: Exception) { Timber.w(e, "Mic grant failed") }
                        }
                    }, 250L)
                } else {
                    // Hold the WebView request; ask the OS for RECORD_AUDIO.
                    pendingMicPermission?.let { try { it.deny() } catch (_: Exception) {} }
                    pendingMicPermission = request
                    runOnUiThread {
                        try { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) }
                        catch (e: Exception) {
                            Timber.w(e, "RECORD_AUDIO launch failed")
                            pendingMicPermission = null
                            try { request.deny() } catch (_: Exception) {}
                        }
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingMicPermission === request) pendingMicPermission = null
            }
        }
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val urlStr = url.toString()
                // Asset loader uses https://appassets.androidplatform.net/assets/
                if (urlStr.startsWith("https://appassets.androidplatform.net/assets/") || urlStr.startsWith("about:")) return false
                // Scheme allowlist — refuse intent://, javascript:, content:,
                // file:, etc. A compromised data file (or a stray test fixture)
                // could otherwise trigger Intent.ACTION_VIEW with an
                // arbitrary scheme and launch unwanted apps.
                val scheme = url.scheme?.lowercase(Locale.US)
                if (scheme == null || scheme !in ALLOWED_EXTERNAL_SCHEMES) {
                    Timber.w("Refused external URL with disallowed scheme: %s", urlStr)
                    return true
                }
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, urlStr.toUri()))
                } catch (e: Exception) {
                    Timber.w(e, "ACTION_VIEW failed for %s", urlStr)
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectInsets()
                // Release the splash after a short delay — React mounts a
                // tick or two after onPageFinished, so 80ms covers the gap
                // without making the splash feel slow. If it's already
                // dismissed (config change re-load), this is a no-op.
                view.postDelayed({ splashHolding = false }, 80L)
            }

            override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) {
                super.onScaleChanged(view, oldScale, newScale)
                currentScale = newScale
            }
        }

        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            // Include IME (soft-keyboard) in the bottom inset so floating
            // UI like the surprise FAB or NoteSheet anchor moves above the
            // keyboard instead of being hidden behind it.
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    or WindowInsetsCompat.Type.displayCutout()
                    or WindowInsetsCompat.Type.ime()
            )
            savedTopInset = bars.top
            savedBottomInset = bars.bottom
            injectInsets()
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(webView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            // Fresh cold start (not a config-change restore). All UI assets
            // are bundled in the APK and served locally by WebViewAssetLoader,
            // so HTTP-caching the `src/*.js` module files buys nothing but
            // costs correctness: after an APK update the WebView would keep
            // serving the OLD cached module (the recurring "I don't see my
            // change" bug). Clear the resource cache here so every launch
            // loads the freshly-bundled JS. This clears the file/resource
            // cache ONLY — localStorage / DOM storage (where all journal,
            // notes, bookmarks, links data live) is untouched.
            webView.clearCache(true)
            webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        }

        onBackPressedDispatcher.addCallback(this) {
            // All in-app navigation is JS-driven, so webView.canGoBack() is
            // always false (single URL, no history stack). Route the
            // hardware back press through window.handleAndroidBack() — the
            // JS handler returns "true" when it consumed the press (closed
            // a sheet, popped fromLetterStack, navigated to a parent
            // screen) and "false" when there's nothing to pop. On "false"
            // we finish() so the user actually exits, instead of being
            // stuck on the home screen.
            webView.evaluateJavascript(
                "(typeof window.handleAndroidBack === 'function') ? window.handleAndroidBack() : 'false'"
            ) { result ->
                if (result != "\"true\"") finish()
            }
        }
    }

    private fun injectInsets() {
        val density = resources.displayMetrics.density
        val topDp = String.format(Locale.US, "%.2f", savedTopInset / density)
        val bottomDp = String.format(Locale.US, "%.2f", savedBottomInset / density)
        // Guard documentElement — the WindowInsets listener fires during the
        // initial layout pass before loadUrl finishes parsing the document,
        // so documentElement can be null on the first 1-3 invocations. Without
        // the guard, every cold boot logged 3× "Uncaught TypeError: Cannot
        // read properties of null (reading 'style')" to Logcat / WebViewJS.
        val js = """
            (function() {
                var r = document.documentElement && document.documentElement.style;
                if (!r) return;
                r.setProperty('--inset-top',    '${topDp}px');
                r.setProperty('--inset-bottom', '${bottomDp}px');
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    // Deliver a finished native recording to JS. base64 is null on failure;
    // mime is always audio/mp4 (AAC in MPEG-4). Marshalled onto the WebView's
    // own thread via webView.post since nativeRecordStop runs on a binder thread.
    private fun postNativeComplete(base64: String?, durationMs: Long) {
        val arg = if (base64 == null) "null" else "'$base64'"
        webView.post {
            webView.evaluateJavascript(
                "window.__onNativeRecordingComplete && " +
                    "window.__onNativeRecordingComplete($arg, $durationMs, 'audio/mp4')",
                null
            )
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        // Resolve any in-flight WebView resource requests before the WebView
        // is torn down. A held PermissionRequest / file-chooser callback is
        // bound to this (dying) WebView; leaving it unresolved leaks it and
        // the JS getUserMedia promise would hang. Unconditional because the
        // callback is dead either way — on a config-change recreation the
        // JS-side watchdog + the already-granted fast-path on the next
        // getUserMedia retry handle recovery cleanly.
        pendingMicPermission?.let { try { it.deny() } catch (_: Exception) {} }
        pendingMicPermission = null
        // A still-open file chooser must get null or the WebView leaks the
        // callback ("ValueCallback already called" on the next chooser).
        fileChooserCallback?.let { try { it.onReceiveValue(null) } catch (_: Exception) {} }
        fileChooserCallback = null
        // Release a native recorder still running if the activity is destroyed
        // mid-recording (config change, app killed) — otherwise the mic session
        // leaks and the temp file is orphaned in cacheDir.
        synchronized(recLock) {
            nativeRecorder?.let {
                try { it.stop() } catch (_: Exception) {}
                try { it.release() } catch (_: Exception) {}
            }
            nativeRecorder = null
            nativeRecordFile?.let { try { it.delete() } catch (_: Exception) {} }
            nativeRecordFile = null
        }
        webView.destroy()
        super.onDestroy()
    }

    inner class AppInterface {

        @JavascriptInterface
        fun setLightStatusBar(light: Boolean) {
            runOnUiThread {
                WindowInsetsControllerCompat(window, window.decorView)
                    .isAppearanceLightStatusBars = light
            }
        }

        @JavascriptInterface
        fun setKeepScreenOn(enabled: Boolean) {
            runOnUiThread {
                keepScreenOnEnabled = enabled
                if (enabled) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
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
            runOnUiThread {
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    webView.post {
                        webView.evaluateJavascript(
                            "window.__onMicPermissionResult && window.__onMicPermissionResult(true)", null
                        )
                    }
                } else {
                    try {
                        micPrepLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    } catch (e: Exception) {
                        Timber.w(e, "requestMicPermission launch failed")
                        webView.post {
                            webView.evaluateJavascript(
                                "window.__onMicPermissionResult && window.__onMicPermissionResult(false)", null
                            )
                        }
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
            runOnUiThread {
                val am = audioManager ?: return@runOnUiThread
                previousAudioMode = am.mode
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
            runOnUiThread {
                val am = audioManager ?: return@runOnUiThread
                try {
                    am.mode = previousAudioMode
                } catch (e: Exception) {
                    Timber.w(e, "endAudioSession restoreMode failed")
                }
            }
        }

        // ─── Native voice recording (Android-reliable path) ──────────────
        // The JS recorder uses these instead of getUserMedia/MediaRecorder when
        // window.AndroidBridge.nativeRecordStart exists. Records AAC into an
        // MPEG-4 (.m4a) temp file in cacheDir — playable by an HTML <audio>
        // element and storable as a Blob, so the existing preview/IndexedDB
        // pipeline is unchanged. RECORD_AUDIO is ensured by requestMicPermission
        // before JS calls these.

        /** Start recording. Returns "ok" or "error:<reason>" synchronously. */
        @JavascriptInterface
        fun nativeRecordStart(): String {
            synchronized(recLock) {
                if (ContextCompat.checkSelfPermission(
                        this@MainActivity, Manifest.permission.RECORD_AUDIO
                    ) != PackageManager.PERMISSION_GRANTED) {
                    return "error:permission"
                }
                try { nativeRecorder?.release() } catch (_: Exception) {}
                nativeRecorder = null
                nativeRecordFile?.let { try { it.delete() } catch (_: Exception) {} }
                nativeRecordFile = null
                return try {
                    val f = File.createTempFile("votrec_", ".m4a", cacheDir)
                    val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        MediaRecorder(this@MainActivity)
                    } else {
                        @Suppress("DEPRECATION") MediaRecorder()
                    }
                    mr.setAudioSource(MediaRecorder.AudioSource.MIC)
                    mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                    mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                    mr.setAudioEncodingBitRate(96000)
                    mr.setAudioSamplingRate(44100)
                    mr.setOutputFile(f.absolutePath)
                    mr.prepare()
                    mr.start()
                    nativeRecorder = mr
                    nativeRecordFile = f
                    nativeRecordStartMs = System.currentTimeMillis()
                    nativeRecordPausedAccumMs = 0L
                    nativeRecordPauseStartMs = 0L
                    "ok"
                } catch (e: Exception) {
                    Timber.w(e, "nativeRecordStart failed")
                    try { nativeRecorder?.release() } catch (_: Exception) {}
                    nativeRecorder = null
                    nativeRecordFile?.let { try { it.delete() } catch (_: Exception) {} }
                    nativeRecordFile = null
                    "error:" + (e.message ?: "start_failed")
                }
            }
        }

        @JavascriptInterface
        fun nativeRecordPause(): String {
            synchronized(recLock) {
                return try {
                    nativeRecorder?.pause()
                    nativeRecordPauseStartMs = System.currentTimeMillis()
                    "ok"
                } catch (e: Exception) { "error:" + (e.message ?: "pause_failed") }
            }
        }

        @JavascriptInterface
        fun nativeRecordResume(): String {
            synchronized(recLock) {
                return try {
                    nativeRecorder?.resume()
                    if (nativeRecordPauseStartMs > 0L) {
                        nativeRecordPausedAccumMs += System.currentTimeMillis() - nativeRecordPauseStartMs
                        nativeRecordPauseStartMs = 0L
                    }
                    "ok"
                } catch (e: Exception) { "error:" + (e.message ?: "resume_failed") }
            }
        }

        /** Peak amplitude since the last call (0..32767). Drives the waveform. */
        @JavascriptInterface
        fun nativeRecordAmplitude(): Int {
            synchronized(recLock) {
                return try { nativeRecorder?.maxAmplitude ?: 0 } catch (e: Exception) { 0 }
            }
        }

        /** Stop, then deliver the audio to JS via
         *  window.__onNativeRecordingComplete(base64, durationMs, mime).
         *  base64 is null on failure. The read/encode runs on this binder
         *  thread (already off the UI thread) then posts to the WebView. */
        @JavascriptInterface
        fun nativeRecordStop() {
            synchronized(recLock) {
                val mr = nativeRecorder
                val f = nativeRecordFile
                nativeRecorder = null
                if (mr == null || f == null) {
                    nativeRecordFile = null
                    postNativeComplete(null, 0L)
                    return
                }
                var durMs = System.currentTimeMillis() - nativeRecordStartMs - nativeRecordPausedAccumMs
                if (nativeRecordPauseStartMs > 0L) {
                    durMs -= System.currentTimeMillis() - nativeRecordPauseStartMs
                }
                try {
                    mr.stop()
                } catch (e: Exception) {
                    // stop() throws if stopped too fast (no valid frames written).
                    Timber.w(e, "nativeRecordStop stop() failed")
                    try { mr.release() } catch (_: Exception) {}
                    try { f.delete() } catch (_: Exception) {}
                    nativeRecordFile = null
                    postNativeComplete(null, 0L)
                    return
                }
                try { mr.release() } catch (_: Exception) {}
                try {
                    val bytes = f.readBytes()
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    try { f.delete() } catch (_: Exception) {}
                    nativeRecordFile = null
                    postNativeComplete(b64, if (durMs < 0L) 0L else durMs)
                } catch (e: Exception) {
                    Timber.w(e, "nativeRecordStop read failed")
                    try { f.delete() } catch (_: Exception) {}
                    nativeRecordFile = null
                    postNativeComplete(null, 0L)
                }
            }
        }

        /** Abort recording and delete the temp file with no JS callback. */
        @JavascriptInterface
        fun nativeRecordCancel() {
            synchronized(recLock) {
                val mr = nativeRecorder
                val f = nativeRecordFile
                nativeRecorder = null
                nativeRecordFile = null
                if (mr != null) {
                    try { mr.stop() } catch (_: Exception) {}
                    try { mr.release() } catch (_: Exception) {}
                }
                f?.let { try { it.delete() } catch (_: Exception) {} }
            }
        }

        @JavascriptInterface
        fun setZoomEnabled(enabled: Boolean) {
            runOnUiThread {
                if (!enabled) {
                    val current = currentScale
                    if (current > 0f && (current != 1f)) webView.zoomBy(1f / current)
                }
                webView.settings.setSupportZoom(enabled)
                webView.settings.builtInZoomControls = enabled
                webView.settings.displayZoomControls = false
            }
        }

        @JavascriptInterface
        fun resetZoom() {
            runOnUiThread {
                val current = currentScale
                if (current > 0f && (current != 1f)) webView.zoomBy(1f / current)
            }
        }

        @JavascriptInterface
        @Suppress("unused")
        fun getZoomScale(): Float = currentScale

        @JavascriptInterface
        fun takeScreenshot(topCropDp: Int, maxDim: Int, jpegQuality: Int): String {
            val latch = CountDownLatch(1)
            var result = ""
            runOnUiThread {
                try {
                    val w = webView.width
                    val h = webView.height
                    if (w > 0 && h > 0) {
                        val originalScale = currentScale
                        val needsZoomReset = originalScale > 0f && abs(originalScale - 1f) > 0.005f
                        if (needsZoomReset) webView.zoomBy(1f / originalScale)

                        val density = resources.displayMetrics.density
                        val topCropPx = (topCropDp * density).toInt().coerceIn(0, h - 1)
                        val croppedH = h - topCropPx
                        if (croppedH > 0) {
                            val full = createBitmap(w, h, Bitmap.Config.ARGB_8888)
                            webView.draw(Canvas(full))
                            val cropped = Bitmap.createBitmap(full, 0, topCropPx, w, croppedH)
                            full.recycle()
                            val longest = max(cropped.width, cropped.height)
                            val scale = if (longest > maxDim) maxDim.toFloat() / longest else 1f
                            val scaled = if (scale < 1f) {
                                val sw = (cropped.width * scale).toInt().coerceAtLeast(1)
                                val sh = (cropped.height * scale).toInt().coerceAtLeast(1)
                                cropped.scale(sw, sh, filter = true).also { cropped.recycle() }
                            } else cropped
                            val stream = ByteArrayOutputStream()
                            scaled.compress(Bitmap.CompressFormat.JPEG, jpegQuality.coerceIn(30, 100), stream)
                            scaled.recycle()
                            result = "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                        }

                        if (needsZoomReset) webView.zoomBy(originalScale)
                    }
                } catch (_: Exception) {}
                latch.countDown()
            }
            latch.await(2L, TimeUnit.SECONDS)
            return result
        }

        /** Open the system JSON file picker. When the user picks a file (or
         *  cancels), the file content is base64-encoded and delivered back to
         *  JS as window.__onImportFile(b64) — or null on cancel/error. */
        @JavascriptInterface
        fun openFilePicker() {
            runOnUiThread {
                filePickerLauncher.launch("application/json")
            }
        }

        /** Write [content] (UTF-8 text) to the Downloads folder as [filename].
         *  Returns "ok" on success or "error:<reason>" on failure. Requires
         *  Android 10+ (API 29) for the MediaStore Downloads collection; on
         *  older devices returns "error:requires_android_10". */
        @JavascriptInterface
        fun saveToDownloads(filename: String, content: String): String {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                return "error:requires_android_10"
            }
            return try {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, "application/json")
                }
                val uri = contentResolver.insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
                ) ?: return "error:no_uri"
                contentResolver.openOutputStream(uri)?.use { stream ->
                    stream.write(content.toByteArray(Charsets.UTF_8))
                }
                "ok"
            } catch (e: Exception) {
                Timber.w(e, "saveToDownloads failed")
                "error:${e.message}"
            }
        }

        @JavascriptInterface
        fun setImmersiveMode(immersive: Boolean) {
            runOnUiThread {
                val controller = WindowInsetsControllerCompat(window, window.decorView)
                if (immersive) {
                    controller.hide(WindowInsetsCompat.Type.systemBars())
                    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                } else {
                    controller.show(WindowInsetsCompat.Type.systemBars())
                }
            }
        }
    }
}
