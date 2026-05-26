package com.votreader.sacredui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Rect
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.view.PixelCopy
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.TextView
import androidx.activity.addCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.graphics.createBitmap
import androidx.core.graphics.scale
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import androidx.webkit.WebViewClientCompat
import java.io.ByteArrayOutputStream
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import timber.log.Timber

class MainActivity : AppCompatActivity() {

    // State that survives configuration changes lives in [MainViewModel]
    // -- recorder + temp file, audio session, scale, insets, splash hold,
    // renderer-recovery counters. See its KDoc for the full inventory and
    // the onCleared cleanup contract. Activity-scoped state below stays in
    // this class because it's bound to the current WebView / Activity (and
    // is stale across config changes anyway).
    private val vm: MainViewModel by viewModels()

    private lateinit var webView: WebView
    // Audio session management for voice recording. startAudioSession() puts
    // the device into MODE_IN_COMMUNICATION so the WebView's AudioRecord can
    // reliably acquire the mic on Android 8+ (Pixel/Samsung); endAudioSession()
    // restores the prior mode so normal playback isn't routed to the earpiece.
    private var audioManager: AudioManager? = null
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

    // Single conduit for every JS callback this Activity fires. Reads
    // [webView] lazily via the lambda so onRenderProcessGone replacing
    // the WebView instance picks up automatically -- no re-instantiation
    // of the bridge required.
    private val bridge: JsBridge = JsBridge { webView }

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
        // the WebView's first paint (see vm.splashHolding + onPageFinished
        // below) so the cold-boot transition is launcher icon → splash icon
        // → first frame with no flash of empty black. core-splashscreen
        // backports the Android 12+ API to API 23+; we target 26+.
        val splash = installSplashScreen()
        splash.setKeepOnScreenCondition { vm.splashHolding }
        super.onCreate(savedInstanceState)

        // Register the file-picker launcher before the WebView is attached.
        // The callback fires when the user picks a file (after returning from
        // the system file chooser). It reads the file content in Kotlin and
        // delivers it to JS as base64 via window.__onImportFile so that
        // allowContentAccess=false on the WebView is never a factor.
        filePickerLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri == null) {
                // User cancelled the picker
                bridge.callOptional("__onImportFile", null)
                return@registerForActivityResult
            }
            // Size cap + read + base64 all live in StorageManager;
            // Failure here covers oversize, unknown-size, and read-error
            // alike. All flow back to JS as the same null callback the
            // cancel path uses -- JS has one generic error toast for the
            // whole class of failures, so keeping them indistinguishable
            // matches the existing UX contract.
            when (val r = vm.storage.readUriAsBase64(uri)) {
                is StorageManager.Result.Success -> bridge.callOptional("__onImportFile", r.value)
                is StorageManager.Result.Failure -> bridge.callOptional("__onImportFile", null)
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
                    bridge.callOptional("__onMicPermissionResult", true)
                }, 250L)
            } else {
                bridge.callOptional("__onMicPermissionResult", false)
            }
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (vm.keepScreenOnEnabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Debug-only: let Chrome DevTools attach to the WebView via
        // chrome://inspect/#devices. Static method — affects all WebViews
        // in the process. BuildConfig.DEBUG is false on release builds, so
        // the debugging surface is never exposed in shipped APKs.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager

        webView = createConfiguredWebView()
        setContentView(webView)

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
            bridge.callWithResult(
                "(typeof window.handleAndroidBack === 'function') ? window.handleAndroidBack() : 'false'"
            ) { result ->
                if (result != "\"true\"") finish()
            }
        }
    }

    /**
     * Build and wire up the WebView used as the app's root view. Extracted
     * from onCreate so onRenderProcessGone can rebuild a fresh WebView when
     * the renderer process dies — every listener, client, and JS bridge is
     * established here, so the new instance is fully equivalent to the
     * original from the moment it leaves this method.
     *
     * The inset listener + requestApplyInsets are also wired here because
     * they attach to a specific WebView; the back-press dispatcher stays in
     * onCreate (Activity-scoped, reads the [webView] field at fire time).
     */
    private fun createConfiguredWebView(): WebView {
        val wv = WebView(this)

        wv.settings.apply {
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

        wv.addJavascriptInterface(AppInterface(), "AndroidBridge")
        // Route JS console output to Logcat so production crashes / [object CSS]
        // React-warning class failures / WebView errors are visible via
        // `adb logcat -s WebViewJS`. Previously discarded silently.
        wv.webChromeClient = object : WebChromeClient() {
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
        wv.webViewClient = object : WebViewClientCompat() {
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
                view.postDelayed({ vm.splashHolding = false }, 80L)
            }

            override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) {
                super.onScaleChanged(view, oldScale, newScale)
                vm.currentScale = newScale
            }

            /**
             * Recover from a Chromium renderer process death (OOM, sandbox
             * crash, force-kill). Without this override, the system kills
             * the Activity and the user sees a white screen. We rebuild the
             * WebView via [createConfiguredWebView] and reload index.html.
             *
             * If the same content crashes the renderer 3 times in 60 s we
             * stop auto-recovering and show a tap-to-reload view, otherwise
             * a reliably-crashing page would create an infinite loop.
             */
            override fun onRenderProcessGone(
                view: WebView,
                detail: RenderProcessGoneDetail?
            ): Boolean {
                val crashed = detail?.didCrash() ?: false
                Timber.w("WebView renderer died (crashed=%b). Recovering.", crashed)

                val now = System.currentTimeMillis()
                if (vm.firstRecoveryMs == 0L || now - vm.firstRecoveryMs > 60_000L) {
                    vm.renderRecoveryCount = 0
                    vm.firstRecoveryMs = now
                }
                vm.renderRecoveryCount++

                // Resolve any in-flight WebView resource requests bound to
                // the dying instance — same cleanup as onDestroy. The
                // PermissionRequest / file-chooser callback would otherwise
                // leak and the JS getUserMedia promise would hang.
                pendingMicPermission?.let { try { it.deny() } catch (_: Exception) {} }
                pendingMicPermission = null
                fileChooserCallback?.let { try { it.onReceiveValue(null) } catch (_: Exception) {} }
                fileChooserCallback = null

                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()

                // Always rebuild the WebView FIRST so the bridge's lazy
                // webViewProvider never reads the destroyed instance --
                // any in-flight launcher callback or pending bridge call
                // that lands during the retry-view window would otherwise
                // post on the dead WebView and crash. Both paths use the
                // same fresh instance; the retry path just defers
                // attaching + loading until the user taps.
                webView = createConfiguredWebView()

                if (vm.renderRecoveryCount > 2) {
                    Timber.e("Renderer crashed %d times in 60s. Showing retry view.", vm.renderRecoveryCount)
                    showRendererCrashRetryView()
                    return true
                }

                setContentView(webView)
                webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
                return true
            }
        }

        ViewCompat.setOnApplyWindowInsetsListener(wv) { _, insets ->
            // Include IME (soft-keyboard) in the bottom inset so floating
            // UI like the surprise FAB or NoteSheet anchor moves above the
            // keyboard instead of being hidden behind it.
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    or WindowInsetsCompat.Type.displayCutout()
                    or WindowInsetsCompat.Type.ime()
            )
            vm.savedTopInset = bars.top
            vm.savedBottomInset = bars.bottom
            injectInsets()
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(wv)

        // Per-frame IME slide tracking. Without this callback, the inset
        // listener above only fires at the START and END of the keyboard
        // animation, so bottom-anchored UI "jumps" into place instead of
        // sliding with the keyboard. WindowInsetsAnimationCompat dispatches
        // onProgress at ~60Hz with interpolated insets, and we write the
        // bottom inset straight into --inset-bottom every frame so the CSS
        // tracks the keyboard smoothly. onEnd asks for one final dispatch
        // through the normal listener so the resting state is pixel-perfect.
        ViewCompat.setWindowInsetsAnimationCallback(
            wv,
            object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onProgress(
                    insets: WindowInsetsCompat,
                    runningAnimations: MutableList<WindowInsetsAnimationCompat>
                ): WindowInsetsCompat {
                    val bars = insets.getInsets(
                        WindowInsetsCompat.Type.systemBars()
                            or WindowInsetsCompat.Type.displayCutout()
                            or WindowInsetsCompat.Type.ime()
                    )
                    val density = resources.displayMetrics.density
                    val topDp = String.format(Locale.US, "%.2f", bars.top / density)
                    val bottomDp = String.format(Locale.US, "%.2f", bars.bottom / density)

                    // Intentional N1.5 exception: bypasses JsBridge because
                    // this fires ~60x/sec during IME animations and the
                    // per-frame overhead of escapeArg + joinToString +
                    // webView.post would burn budget for no safety win --
                    // the only interpolated values are %.2f-formatted
                    // numbers, which can't contain quote/backslash/newline.
                    webView.evaluateJavascript(
                        "(function(){var r=document.documentElement&&document.documentElement.style;" +
                            "if(r){r.setProperty('--inset-top','${topDp}px');" +
                            "r.setProperty('--inset-bottom','${bottomDp}px')}})()",
                        null
                    )
                    return insets
                }

                override fun onEnd(animation: WindowInsetsAnimationCompat) {
                    // Final pixel-perfect state -- routes through the normal
                    // inset listener (above), which updates vm.savedTopInset /
                    // vm.savedBottomInset for any future injectInsets() callers.
                    ViewCompat.requestApplyInsets(wv)
                }
            }
        )

        return wv
    }

    /**
     * Fallback shown when the renderer has crashed repeatedly in a short
     * window — see [onRenderProcessGone]. A tap resets the counter and
     * rebuilds a fresh WebView; if the underlying issue resolves itself
     * (transient OOM, sandbox flake) the user is back in. If it doesn't,
     * the cycle just repeats once more and lands back here.
     */
    private fun showRendererCrashRetryView() {
        val tv = TextView(this).apply {
            text = "The page stopped responding. Tap to reload."
            gravity = Gravity.CENTER
            textSize = 18f
            setPadding(48, 48, 48, 48)
            setOnClickListener {
                vm.renderRecoveryCount = 0
                vm.firstRecoveryMs = 0L
                // [webView] was already rebuilt by onRenderProcessGone
                // before this retry view was shown -- attach it now and
                // trigger the load. No need to create another instance.
                setContentView(webView)
                webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
            }
        }
        setContentView(tv)
    }

    private fun injectInsets() {
        val density = resources.displayMetrics.density
        val topDp = String.format(Locale.US, "%.2f", vm.savedTopInset / density)
        val bottomDp = String.format(Locale.US, "%.2f", vm.savedBottomInset / density)
        // The bridge's setCssProperties carries the same null-documentElement
        // guard that the inline JS template used to ship (the listener can
        // fire during the initial layout pass before loadUrl finishes parsing
        // the document, leaving documentElement briefly null and otherwise
        // throwing 3× "Cannot read properties of null" per cold boot).
        bridge.setCssProperties(
            "--inset-top" to "${topDp}px",
            "--inset-bottom" to "${bottomDp}px"
        )
    }

    // Deliver a finished native recording to JS. base64 is null on failure;
    // mime is always audio/mp4 (AAC in MPEG-4). The bridge marshals the call
    // onto the WebView's thread; nativeRecordStop runs on a binder thread.
    private fun postNativeComplete(base64: String?, durationMs: Long) {
        bridge.callOptional("__onNativeRecordingComplete", base64, durationMs, "audio/mp4")
    }

    /**
     * Hop to Dispatchers.Main, capture the WebView via [capturePixelCopy],
     * crop / scale / JPEG-encode the result, and return the data URI. The
     * @JavascriptInterface entry point wraps this in runBlocking +
     * withTimeoutOrNull so JS still sees a synchronous String return.
     *
     * The zoom-reset dance preserves the legacy behavior: thumbnails are
     * always at 1x for consistent visual appearance, even when the user
     * has pinched-zoomed the live view.
     */
    private suspend fun captureScreenshotSuspend(
        topCropDp: Int,
        maxDim: Int,
        jpegQuality: Int
    ): String = withContext(Dispatchers.Main) {
        val w = webView.width
        val h = webView.height
        if (w <= 0 || h <= 0) return@withContext ""

        val originalScale = vm.currentScale
        val needsZoomReset = originalScale > 0f && abs(originalScale - 1f) > 0.005f
        if (needsZoomReset) webView.zoomBy(1f / originalScale)

        try {
            val density = resources.displayMetrics.density
            val topCropPx = (topCropDp * density).toInt().coerceIn(0, h - 1)
            val croppedH = h - topCropPx
            if (croppedH <= 0) return@withContext ""

            val location = IntArray(2).also { webView.getLocationInWindow(it) }
            val srcRect = Rect(
                location[0], location[1],
                location[0] + w, location[1] + h
            )
            val full = createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val ok = capturePixelCopy(srcRect, full)
            if (!ok) {
                full.recycle()
                return@withContext ""
            }

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
            "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        } catch (e: Exception) {
            Timber.w(e, "Screenshot capture failed")
            ""
        } finally {
            if (needsZoomReset) webView.zoomBy(originalScale)
        }
    }

    /**
     * Wrap PixelCopy.request in a suspend function. The continuation
     * resumes with `true` on PixelCopy.SUCCESS, `false` otherwise.
     *
     * Cancellation handling: PixelCopy's contract requires [dest] to
     * stay alive until the callback fires ("must not be modified or
     * recycled until the callback is invoked"). So invokeOnCancellation
     * does NOT recycle eagerly -- it flags the cancellation, and the
     * PixelCopy callback handles the recycle once the native side is
     * done with the bitmap. Either way an interrupted capture cleans
     * up; we just defer the cleanup to a safe moment.
     */
    private suspend fun capturePixelCopy(srcRect: Rect, dest: Bitmap): Boolean =
        suspendCancellableCoroutine { cont ->
            val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)
            cont.invokeOnCancellation { cancelled.set(true) }
            try {
                PixelCopy.request(
                    window, srcRect, dest,
                    { pixelResult ->
                        if (cancelled.get() || !cont.isActive) {
                            // Cancelled (timeout / parent cancellation) --
                            // safe to recycle now that PixelCopy is done.
                            try { dest.recycle() } catch (_: Exception) {}
                            return@request
                        }
                        if (pixelResult != PixelCopy.SUCCESS) {
                            Timber.w("PixelCopy failed with code %d", pixelResult)
                        }
                        cont.resume(pixelResult == PixelCopy.SUCCESS)
                    },
                    Handler(Looper.getMainLooper())
                )
            } catch (e: IllegalArgumentException) {
                // PixelCopy.request itself rejected the args (rare --
                // typically srcRect outside window bounds). The callback
                // will not fire, so we recycle here ourselves.
                try { dest.recycle() } catch (_: Exception) {}
                if (cont.isActive) cont.resume(false)
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
        // callback is dead either way -- on a config-change recreation the
        // JS-side watchdog + the already-granted fast-path on the next
        // getUserMedia retry handle recovery cleanly.
        pendingMicPermission?.let { try { it.deny() } catch (_: Exception) {} }
        pendingMicPermission = null
        // A still-open file chooser must get null or the WebView leaks the
        // callback ("ValueCallback already called" on the next chooser).
        fileChooserCallback?.let { try { it.onReceiveValue(null) } catch (_: Exception) {} }
        fileChooserCallback = null
        // Recorder cleanup lives in MainViewModel.onCleared -- the
        // ViewModelStore fires it on isFinishing=true (user exited the
        // app), and the recorder state survives config-change paths
        // unconditionally (configChanges in manifest already prevents the
        // most common recreations, ViewModel covers any that slip through).
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
                vm.keepScreenOnEnabled = enabled
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
                    bridge.callOptional("__onMicPermissionResult", true)
                } else {
                    try {
                        micPrepLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    } catch (e: Exception) {
                        Timber.w(e, "requestMicPermission launch failed")
                        bridge.callOptional("__onMicPermissionResult", false)
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
            runOnUiThread {
                val am = audioManager ?: return@runOnUiThread
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
            runOnUiThread {
                if (!enabled) {
                    val current = vm.currentScale
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
                val current = vm.currentScale
                if (current > 0f && (current != 1f)) webView.zoomBy(1f / current)
            }
        }

        @JavascriptInterface
        @Suppress("unused")
        fun getZoomScale(): Float = vm.currentScale

        @JavascriptInterface
        fun takeScreenshot(topCropDp: Int, maxDim: Int, jpegQuality: Int): String {
            // The JS-facing API is synchronous (returns the base64 directly),
            // so we runBlocking on this binder thread until the coroutine
            // resolves. Inside, the work hops to Dispatchers.Main for the
            // WebView reads + PixelCopy request; the 2-second timeout is the
            // same cap the CountDownLatch version enforced.
            return runBlocking {
                withTimeoutOrNull(2_000L) {
                    captureScreenshotSuspend(topCropDp, maxDim, jpegQuality)
                } ?: ""
            }
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
            return when (val r = vm.storage.writeJsonToDownloads(filename, content)) {
                is StorageManager.Result.Success -> "ok"
                is StorageManager.Result.Failure -> "error:${r.reason}"
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
