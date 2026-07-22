package com.votreader.sacredui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
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
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.PixelCopy
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
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
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebResourceErrorCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import androidx.webkit.WebViewClientCompat
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import timber.log.Timber

class MainActivity : AppCompatActivity(), BridgeHost {

    // State that survives configuration changes lives in [MainViewModel]
    // -- recorder + temp file, audio session, scale, insets, splash hold,
    // renderer-recovery counters. See its KDoc for the full inventory and
    // the onCleared cleanup contract. Activity-scoped state below stays in
    // this class because it's bound to the current WebView / Activity (and
    // is stale across config changes anyway).
    private val vm: MainViewModel by viewModels()

    private lateinit var webView: WebView
    private val screenshotInFlight = AtomicBoolean(false)

    // Main-thread handler for the splash safety hatch (#3). Owns exactly one
    // pending callback — the absolute-timeout splash release scheduled in
    // onCreate and cancelled in onDestroy.
    private val mainHandler = Handler(Looper.getMainLooper())
    // #3: absolute splash-liveness backstop. onPageFinished + onReceivedError
    // already release vm.splashHolding on every normal path (page loaded OR
    // main-frame errored), so a stuck splash needs a WebView that fires NEITHER
    // — a silently-wedged renderer. This fires unconditionally SPLASH_HATCH_MS
    // after launch; releasing an already-false flag is a harmless no-op, so the
    // common case pays nothing. Scheduled in onCreate, removed in onDestroy.
    private val splashSafetyHatch = Runnable {
        if (vm.splashHolding) {
            Timber.w("Splash still holding after %d ms — releasing via safety hatch", SPLASH_HATCH_MS)
            vm.splashHolding = false
        }
    }
    // Audio session management for voice recording. startAudioSession() puts
    // the device into MODE_IN_COMMUNICATION so the WebView's AudioRecord can
    // reliably acquire the mic on Android 8+ (Pixel/Samsung); endAudioSession()
    // restores the prior mode so normal playback isn't routed to the earpiece.
    private var audioManager: AudioManager? = null
    // Launcher for the import file picker; registered in onCreate before the
    // WebView is created so it is ready before any JS calls openFilePicker().
    private lateinit var filePickerLauncher: ActivityResultLauncher<String>

    // Launcher for the SAF "create document" export picker (Settings → Your
    // Data → Export). Lets the user choose the destination folder + filename,
    // and — unlike the old MediaStore.Downloads path — works on every
    // supported API level (SAF is API 19+; minSdk here is 26), so Export is
    // reachable on Android 8/9 where Downloads-collection writes hard-failed.
    // The JSON payload is held in pendingExportContent between launch and the
    // picker result, then written to the chosen URI and cleared. The field
    // also serves as the picker's in-flight flag: launchExportPicker refuses
    // a second launch while it's non-null (see its comment for the clobber
    // that would otherwise result).
    private lateinit var exportPickerLauncher: ActivityResultLauncher<String>
    private var pendingExportContent: String? = null

    // Launchers for the v3 STREAMING backup (BACKUP-STREAMING-PLAN P3). Unlike
    // the v2 launchers above (which read/write the whole payload in the result
    // callback), these only obtain the destination/source URI: the callback
    // stashes it on the vm and fires __onV3ExportReady / __onV3ImportReady, then
    // AppInterface's v3Export*/v3Import* methods stream the bytes frame-by-frame
    // off the binder thread. The import picker accepts any type ("*/*") so a
    // .votbak container OR a legacy .json backup is pickable; the native
    // magic-sniff in StorageManager.beginV3Import routes them.
    private lateinit var v3ExportPickerLauncher: ActivityResultLauncher<String>
    private lateinit var v3ImportPickerLauncher: ActivityResultLauncher<Array<String>>

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

    // Disk cache for Garden page images (shouldInterceptRequest path). The
    // GitHub release redirect is no-cache, so without this every page turn
    // re-downloaded the image + re-did the redirect hop — visible lag on a
    // phone. Keyed by page number (tier stripped) so a quality change
    // overwrites rather than accumulating copies. Lazy: built on first use,
    // survives WebView rebuilds (onRenderProcessGone) since it's Activity-
    // scoped, not WebView-scoped.
    private val gardenCache: GardenImageCache by lazy { GardenImageCache(cacheDir) }

    // #5: the asset loader + its handler are stateless w.r.t. the WebView
    // instance, so build them ONCE (lazy) and reuse across renderer-crash
    // rebuilds instead of re-allocating in every createConfiguredWebView pass.
    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()
    }

    // Single conduit for every JS callback this Activity fires. Reads
    // [webView] lazily via the lambda so onRenderProcessGone replacing
    // the WebView instance picks up automatically -- no re-instantiation
    // of the bridge required.
    private val bridge: JsBridge = JsBridge(webViewProvider = { webView })

    // The JS-facing surface (window.AndroidBridge from the WebView side).
    // Constructor-injected with `this` as the BridgeHost so the class is
    // unit-testable without an Activity. See AppInterface.kt + BridgeHost.kt.
    private val appInterface: AppInterface by lazy { AppInterface(this, bridge, vm) }

    // ─── BridgeHost implementation ──────────────────────────────────────
    // Exposes the Activity surface AppInterface needs (window, context,
    // current WebView, AudioManager, launchers, screenshot capture).
    override val activityContext: Context get() = this
    override val activityWindow: Window get() = window
    override val activeWebView: WebView get() = webView
    override val audioSystemService: AudioManager? get() = audioManager
    // NTV3: wipe the native Garden image disk cache from the JS "Clear All" flow.
    override fun clearGardenCache() { gardenCache.clear() }
    override fun postToUi(action: () -> Unit) = runOnUiThread(action)
    override fun launchFilePicker() {
        filePickerLauncher.launch("application/json")
    }
    override fun launchExportPicker(suggestedName: String, content: String) {
        // Double-launch guard: pendingExportContent doubles as the in-flight
        // flag (set just before launch, cleared FIRST in the result callback
        // before any other work). Without this, a second export launched
        // while the first picker is still open would clobber the stashed
        // payload — the first picker's result would then write the SECOND
        // export's content — and re-launching a pending
        // ActivityResultLauncher can throw outright. The skip reports back
        // through the existing "error:<reason>" contract so JS's generic
        // export-error toast fires instead of the request vanishing silently.
        if (pendingExportContent != null) {
            Timber.w("Export picker already in flight; dropping re-launch")
            bridge.callOptional(JsEvent.ExportComplete, "error:busy")
            return
        }
        pendingExportContent = content
        try {
            exportPickerLauncher.launch(suggestedName)
        } catch (e: Exception) {
            // Launch itself failed (e.g. Activity state already saved) —
            // clear the flag so exports aren't permanently wedged, and
            // report through the same error contract.
            pendingExportContent = null
            Timber.w(e, "Export picker launch failed")
            bridge.callOptional(JsEvent.ExportComplete, "error:launch_failed")
        }
    }
    override fun launchV3ExportPicker(suggestedName: String) {
        v3ExportPickerLauncher.launch(suggestedName)
    }
    override fun launchV3ImportPicker() {
        // "*/*" so a .votbak (octet-stream) container OR a legacy .json backup
        // are both visible; the native magic-sniff distinguishes them.
        v3ImportPickerLauncher.launch(arrayOf("*/*"))
    }
    override fun launchMicPermissionRequest() {
        micPrepLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }
    override fun hasAudioPermission(): Boolean = ContextCompat.checkSelfPermission(
        this, Manifest.permission.RECORD_AUDIO
    ) == PackageManager.PERMISSION_GRANTED
    override fun captureScreenshot(topCropDp: Int, maxDim: Int, jpegQuality: Int): String {
        if (!screenshotInFlight.compareAndSet(false, true)) return ""
        return try {
            runBlocking {
                withTimeoutOrNull(2_000L) {
                    captureScreenshotSuspend(topCropDp, maxDim, jpegQuality)
                } ?: ""
            }
        } finally {
            screenshotInFlight.set(false)
        }
    }

    companion object {
        // Allowlist for shouldOverrideUrlLoading — anything not in this list
        // is refused (not handed to Intent.ACTION_VIEW) so a stray
        // `intent://` or `javascript:` URI in any data file can't launch
        // arbitrary apps or escalate. Asset-loader URLs are matched by
        // exact prefix earlier and don't reach this allowlist.
        private val ALLOWED_EXTERNAL_SCHEMES = setOf("https", "http", "mailto", "tel")

        // #3: how long the splash may hold before the safety hatch force-releases
        // it. 5s comfortably clears a normal cold boot (splash → first paint is
        // sub-second on real devices) while still bounding a wedged-renderer hang.
        private const val SPLASH_HATCH_MS = 5_000L
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
                bridge.callOptional(JsEvent.ImportFile, null)
                return@registerForActivityResult
            }
            // #1: the read + base64 encode (up to MAX_IMPORT_SIZE) is synchronous
            // I/O + CPU work — run it OFF the Main thread so a large legacy pick
            // can't jank the UI. (This is the legacy v2 import path; the primary
            // v3 path already streams off the binder thread.) Result handling
            // resumes on Main (lifecycleScope default); bridge.callOptional
            // marshals onto the WebView thread itself, so its dispatch is
            // thread-agnostic regardless.
            //
            // Size cap + read + base64 all live in StorageManager; Failure here
            // covers oversize, unknown-size, and read-error alike. All flow back
            // to JS as the same null callback the cancel path uses -- JS has one
            // generic error toast for the whole class of failures, so keeping
            // them indistinguishable matches the existing UX contract.
            lifecycleScope.launch {
                val r = withContext(Dispatchers.IO) { vm.storage.readUriAsBase64(uri) }
                when (r) {
                    is StorageManager.Result.Success -> bridge.callOptional(JsEvent.ImportFile, r.value)
                    // Pass the oversize case through as a controlled "too_large" code
                    // so JS can show a specific "that file is too large" message. Every
                    // other failure stays a bare null (one arg) -- byte-identical to the
                    // cancel path above, so a generic read error remains silent as
                    // before. The raw reason (which may carry an exception message)
                    // never crosses the bridge; it is already in logcat via
                    // StorageManager's Timber.w.
                    is StorageManager.Result.Failure ->
                        if (r.reason == "too_large") {
                            bridge.callOptional(JsEvent.ImportFile, null, "too_large")
                        } else {
                            bridge.callOptional(JsEvent.ImportFile, null)
                        }
                }
            }
        }

        // SAF export picker — fires when the user chooses (or cancels) the
        // export destination. On success writes the stashed JSON to the
        // chosen URI and reports back to JS via window.__onExportComplete
        // ("ok" / "error:<reason>" / "cancelled"). pendingExportContent is
        // ALWAYS cleared first, so a cancelled or failed export never leaves
        // the (potentially large) payload dangling in memory.
        exportPickerLauncher = registerForActivityResult(
            ActivityResultContracts.CreateDocument("application/json")
        ) { uri ->
            val content = pendingExportContent
            // Clear the in-flight flag SYNCHRONOUSLY (before the async write) so
            // the launchExportPicker double-launch guard sees the picker as done
            // the instant its result lands; `content` is captured in the local
            // val above, so it survives into the coroutine closure below.
            pendingExportContent = null
            when {
                uri == null -> bridge.callOptional(JsEvent.ExportComplete, "cancelled")
                content == null -> bridge.callOptional(JsEvent.ExportComplete, "error:no_content")
                // #1: write the (potentially large) payload OFF the Main thread.
                else -> lifecycleScope.launch {
                    val r = withContext(Dispatchers.IO) { vm.storage.writeTextToUri(uri, content) }
                    when (r) {
                        is StorageManager.Result.Success -> bridge.callOptional(JsEvent.ExportComplete, "ok")
                        is StorageManager.Result.Failure -> bridge.callOptional(JsEvent.ExportComplete, "error:${r.reason}")
                    }
                }
            }
        }

        // v3 streaming export picker (BACKUP-STREAMING-PLAN P3). Obtains the
        // destination URI ONLY — stash it on the vm and signal JS, which then
        // streams the container frame-by-frame via AppInterface.v3Export*.
        // (Created doc MIME octet-stream; the suggested name carries .votbak.)
        v3ExportPickerLauncher = registerForActivityResult(
            ActivityResultContracts.CreateDocument("application/octet-stream")
        ) { uri ->
            vm.pendingV3ExportUri = uri
            bridge.callOptional(JsEvent.V3ExportReady, if (uri != null) "ok" else "cancelled")
        }

        // v3 streaming import picker. Obtains the source URI ONLY — stash it and
        // signal JS, which then reads the manifest + streams the blobs via
        // AppInterface.v3Import*. OpenDocument (not GetContent) so the URI stays
        // readable for the whole streaming session.
        v3ImportPickerLauncher = registerForActivityResult(
            ActivityResultContracts.OpenDocument()
        ) { uri ->
            vm.pendingV3ImportUri = uri
            bridge.callOptional(JsEvent.V3ImportReady, if (uri != null) "ok" else "cancelled")
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
                    bridge.callOptional(JsEvent.MicPermissionResult, true)
                }, 250L)
            } else {
                bridge.callOptional(JsEvent.MicPermissionResult, false)
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
            vm.currentScale = 1f
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

        // #3: arm the absolute splash-release backstop once the load is kicked
        // off. Idempotent with the onPageFinished / onReceivedError releases —
        // whichever fires first wins; this only matters if none ever does.
        mainHandler.postDelayed(splashSafetyHatch, SPLASH_HATCH_MS)

        onBackPressedDispatcher.addCallback(this) {
            // All in-app navigation is JS-driven, so webView.canGoBack() is
            // always false (single URL, no history stack). Route the
            // hardware back press through window.handleAndroidBack() — the
            // JS handler returns "true" when it consumed the press (closed
            // a sheet, popped fromLetterStack, navigated to a parent
            // screen) and "false" when there's nothing to pop. On "false"
            // we finish() so the user actually exits, instead of being
            // stuck on the home screen.
            //
            // DUAL ENCODING: evaluateJavascript JSON-encodes the JS return
            // value, so a JS string "true" arrives as `"true"` (quoted) but
            // a JS boolean true arrives as `true` (unquoted). Today's JS
            // returns the string; the classification accepts BOTH so a
            // future JS refactor to a bare boolean can't silently flip the
            // contract into "exit the app even though JS consumed the
            // press". The encoding check is extracted to
            // MainActivityLogic.isBackPressConsumed (unit-tested boundary
            // cases in MainActivityLogicTest).
            bridge.callWithResult(
                "(typeof window.handleAndroidBack === 'function') ? window.handleAndroidBack() : 'false'"
            ) { result ->
                if (!MainActivityLogic.isBackPressConsumed(result)) finish()
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
    // setOnTouchListener (below) feeds a GestureDetector but returns false --
    // it never consumes the event, so the WebView keeps its own click +
    // accessibility handling intact, and the ClickableViewAccessibility lint
    // check (meant for views that swallow touches) doesn't apply here.
    @SuppressLint("ClickableViewAccessibility")
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

        // #5 (WebView hardening): the app is entirely local and persists ALL
        // state in DOM storage — no cookies are read or written anywhere, and
        // external links open in a SEPARATE app via ACTION_VIEW (with its own
        // cookie jar). Disable the WebView cookie jar outright to shed unused
        // attack surface, aligned with the project's minimize-surface policy.
        // setAcceptCookie is process-global; setAcceptThirdPartyCookies pins it
        // for this instance too (belt-and-suspenders). mixedContentMode is
        // already NEVER_ALLOW above.
        CookieManager.getInstance().setAcceptCookie(false)
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, false)

        wv.addJavascriptInterface(appInterface, "AndroidBridge")
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
                // Local app assets first (the common case — every bundle, CSS,
                // font, icon served from appassets.androidplatform.net).
                val asset = assetLoader.shouldInterceptRequest(request.url)
                if (asset != null) return asset
                // Garden page images: serve from / populate the disk cache so
                // navigation is instant on the 2nd+ view and limited-data users
                // don't re-download. Returns null for any non-Garden URL, so
                // everything else loads exactly as before.
                return gardenCache.intercept(request.url.toString())
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

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceErrorCompat
            ) {
                super.onReceivedError(view, request, error)
                // Safety hatch for the splash contract: dismissal is driven
                // solely by onPageFinished above, which never fires if the
                // MAIN-FRAME load fails — the splash would stick on screen
                // forever. Mirror the same 80ms-delayed release here so the
                // user lands on the WebView's error surface instead of an
                // unkillable splash. Conservative by design: index.html is
                // a bundled asset served by WebViewAssetLoader, so a main-
                // frame failure is near-impossible in practice; sub-resource
                // errors (images, fonts) deliberately do NOT touch the
                // splash — only the main frame gates it.
                if (request.isForMainFrame) {
                    Timber.w(
                        "Main-frame load failed (%s) for %s — releasing splash hold",
                        error.description, request.url
                    )
                    view.postDelayed({ vm.splashHolding = false }, 80L)
                }
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

                // NTV1: the JS endAudioSession() can't fire — the renderer that owned
                // the recording is gone — so restore the audio mode here.
                restoreAudioModeIfActive()

                val decision = MainActivityLogic.decideRecovery(
                    vm.firstRecoveryMs, vm.renderRecoveryCount, System.currentTimeMillis()
                )
                vm.firstRecoveryMs = decision.firstRecoveryMs
                vm.renderRecoveryCount = decision.renderRecoveryCount

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
                vm.currentScale = 1f

                if (decision.showRetryView) {
                    Timber.w("Renderer crashed %d times in 60s. Showing retry view; webView is live but detached until user taps.", vm.renderRecoveryCount)
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

        // Single-tap → open the annotation action chip. Android WebView routes
        // a tap on selectable <mark> text into its native text-selection
        // machinery, which emits NO `click` and NO bubbling `touchend`, so a
        // plain tap on a highlight never reached the JS chip handler -- only a
        // long-press (via the selection ActionMode) did, which the user found
        // annoying. This GestureDetector observes the tap WITHOUT consuming it
        // (the OnTouchListener returns false), converts device px → CSS px
        // (zoom is disabled — setSupportZoom(false)/useWideViewPort(false) — so
        // dividing by display density is exact), and asks the JS side to
        // hit-test the point and open the chip. Because nothing is consumed,
        // the existing selection / drag-to-create-highlight / scroll pipeline
        // is byte-for-byte untouched: this is purely additive.
        var touchDownX = 0f
        var touchDownY = 0f
        val tapDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapUp(e: MotionEvent): Boolean {
                val density = resources.displayMetrics.density
                // GestureDetector's scroll slop (~8 dp) is wider than the WebView's
                // (~3 dp), so a small scroll can reach onSingleTapUp even though the
                // page moved. Reject it if the finger drifted more than 4 dp vertically
                // (and more vertically than horizontally, so horizontal swipes are fine).
                val dyDp = Math.abs(e.y - touchDownY) / density
                val dxDp = Math.abs(e.x - touchDownX) / density
                if (dyDp > 4f && dyDp > dxDp) return false
                // #3: divide out the WebView scale too (vm.currentScale; 1.0 when
                // unzoomed) so the tap maps to the correct CSS coordinate even if
                // zoom is ever re-enabled via the setZoomEnabled bridge.
                MainActivityLogic.deviceToCssPx(e.x, e.y, density, vm.currentScale)?.let { (cx, cy) ->
                    bridge.callOptional(JsEvent.AnnotationTap, cx, cy)
                }
                return false  // never consume — the tap still flows to the WebView
            }
        })
        wv.setOnTouchListener { _, ev ->
            if (ev.actionMasked == MotionEvent.ACTION_DOWN) {
                touchDownX = ev.x
                touchDownY = ev.y
            }
            tapDetector.onTouchEvent(ev)
            false
        }

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
        val message = "The page stopped responding. Tap to reload."
        val tv = TextView(this).apply {
            text = message
            gravity = Gravity.CENTER
            textSize = 18f
            setPadding(48, 48, 48, 48)
            // A11y: the whole screen was just replaced under the user with no
            // announcement — a screen-reader user would otherwise get silence
            // at exactly the moment the app failed. Mark this as a heading (so
            // it's a navigable landmark), give it a button role + full-sentence
            // description including the tap action, and announce the change.
            ViewCompat.setAccessibilityHeading(this, true)
            contentDescription = "$message Double-tap anywhere to reload the app."
            ViewCompat.setAccessibilityDelegate(this, object : androidx.core.view.AccessibilityDelegateCompat() {
                override fun onInitializeAccessibilityNodeInfo(
                    v: android.view.View,
                    info: androidx.core.view.accessibility.AccessibilityNodeInfoCompat
                ) {
                    super.onInitializeAccessibilityNodeInfo(v, info)
                    info.className = android.widget.Button::class.java.name
                }
            })
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
        // Announce AFTER attach (post): a detached view drops the announcement.
        // announceForAccessibility is soft-deprecated in favour of live regions,
        // but for a ONE-SHOT "the screen just changed and here's why" it remains
        // the correct + simplest call, and it works on the whole API 26+ range
        // (a live region announces on content change, not reliably on first
        // attach). Same deliberate-deprecation idiom as the Vibrator path.
        @Suppress("DEPRECATION")
        tv.post { tv.announceForAccessibility(message) }
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
    ): String {
        // (U9) PixelCopy needs the LIVE WebView surface and the zoom bracket is a
        // WebView API call, so the CAPTURE must run on Main — but ONLY that. The
        // crop → downscale → JPEG-compress → base64 below is pure CPU work on the
        // captured bitmap; it was needlessly tying up the UI thread. It now runs
        // on Dispatchers.Default, freeing Main the moment the surface is copied.
        //
        // (The @JavascriptInterface entry still runBlocking()s on the BINDER
        // thread — NOT Main, so there's no main-thread ANR to "fix" by going
        // fire-and-forget; the review's premise was overstated [verified against
        // source]. A window.__onScreenshotComplete async-contract rewrite is a
        // cross-bridge change needing device verification for marginal gain over
        // this off-Main encode, so it's deliberately deferred.)
        val capture: Pair<Bitmap, Int>? = withContext(Dispatchers.Main) {
            val w = webView.width
            val h = webView.height
            if (w <= 0 || h <= 0) return@withContext null

            val originalScale = vm.currentScale
            val needsZoomReset = originalScale > 0f && abs(originalScale - 1f) > 0.005f
            if (needsZoomReset) webView.zoomBy(1f / originalScale)

            try {
                val density = resources.displayMetrics.density
                val topCropPx = (topCropDp * density).toInt().coerceIn(0, h - 1)
                if (h - topCropPx <= 0) return@withContext null

                val location = IntArray(2).also { webView.getLocationInWindow(it) }
                val srcRect = Rect(location[0], location[1], location[0] + w, location[1] + h)
                val full = createBitmap(w, h, Bitmap.Config.ARGB_8888)
                val ok = capturePixelCopy(srcRect, full)
                if (!ok) { full.recycle(); return@withContext null }
                Pair(full, topCropPx)
            } finally {
                // Restore zoom immediately after the capture, still on Main.
                if (needsZoomReset) webView.zoomBy(originalScale)
            }
        }
        if (capture == null) return ""

        return withContext(Dispatchers.Default) {
            val (full, topCropPx) = capture
            // Recycle bookkeeping: full/cropped/scaled live OUTSIDE the try so
            // the finally can release every allocation on ALL paths. Previously
            // the recycles were inline on the happy path only — any exception
            // mid-pipeline (createBitmap OOM, compress failure) skipped them
            // all, leaking multi-MB native bitmap allocations per failed shot.
            var cropped: Bitmap? = null
            var scaled: Bitmap? = null
            try {
                val c = Bitmap.createBitmap(full, 0, topCropPx, full.width, full.height - topCropPx)
                cropped = c
                val longest = max(c.width, c.height)
                val scale = if (longest > maxDim) maxDim.toFloat() / longest else 1f
                val s = if (scale < 1f) {
                    val sw = (c.width * scale).toInt().coerceAtLeast(1)
                    val sh = (c.height * scale).toInt().coerceAtLeast(1)
                    c.scale(sw, sh, filter = true)
                } else c
                scaled = s
                val stream = ByteArrayOutputStream()
                s.compress(Bitmap.CompressFormat.JPEG, jpegQuality.coerceIn(30, 100), stream)
                "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
            } catch (e: Exception) {
                Timber.w(e, "Screenshot encode failed")
                ""
            } finally {
                // createBitmap()/scale() may return their SOURCE bitmap for a
                // no-op (zero-height crop / scale == 1f), so compare by
                // identity and recycle each distinct instance exactly once.
                scaled?.takeIf { it !== cropped && it !== full }?.recycle()
                cropped?.takeIf { it !== full }?.recycle()
                full.recycle()
            }
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

    /**
     * NTV1: if a recording session is still active when this surface tears down, the
     * JS endAudioSession() may never fire (renderer crash / activity finish) — leaving
     * the device stuck in MODE_IN_COMMUNICATION (whole-device earpiece routing) until
     * something else resets it. Restore the saved prior mode. Guarded on the current
     * mode AND only called from teardown paths (onRenderProcessGone / onDestroy) where
     * no live recording can exist, so it can never disturb an in-progress capture.
     * No-op when audioManager isn't cached yet or the mode was never overridden.
     */
    private fun restoreAudioModeIfActive() {
        val am = audioManager ?: return
        if (am.mode == AudioManager.MODE_IN_COMMUNICATION) {
            try { am.mode = vm.previousAudioMode } catch (e: Exception) { Timber.w(e, "restoreAudioMode failed") }
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    /**
     * #2: relieve heap pressure by pruning the WebView's IN-MEMORY resource
     * cache on a moderate+ trim signal. clearCache(false) drops only the memory
     * cache — never disk, and never DOM storage (where every journal / note /
     * bookmark / link record lives). Gated to TRIM_MEMORY_MODERATE+ via
     * MainActivityLogic.shouldTrimWebViewCache so a foreground low-memory signal
     * doesn't cost re-fetch jank mid-read; assets are local, so a background
     * drop repopulates cheaply on the next foregrounding. Modest by design —
     * the lazy JS corpora live on the renderer's JS heap, not this cache — but
     * free and safe. Runs on the main thread (onTrimMemory's contract), so the
     * WebView call needs no marshaling; guard the lateinit for an early signal.
     */
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (MainActivityLogic.shouldTrimWebViewCache(level) && ::webView.isInitialized) {
            webView.clearCache(false)
            // Also tell the JS layer to shed its own regenerable caches (the
            // journal media object-URL LRU) — the biggest in-heap wins live on the
            // JS side, not in this native resource cache. No-ops if the handler is
            // absent (web/PWA); routes through webView.post (bridge is thread-safe).
            bridge.callOptional("__onTrimMemory")
        }
    }

    override fun onDestroy() {
        // #3: drop the pending splash safety hatch — the Activity is gone, so
        // there's nothing left to release (and nothing to leak).
        mainHandler.removeCallbacks(splashSafetyHatch)
        // NTV1: restore the audio mode if a recording session was still active
        // (the activity is finishing; the JS teardown may not have run).
        restoreAudioModeIfActive()
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

}
