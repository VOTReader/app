package com.votreader.sacredui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.PixelCopy
import android.view.View
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
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebResourceErrorCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import androidx.webkit.WebViewAssetLoader.InternalStoragePathHandler
import androidx.webkit.WebViewClientCompat
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.math.abs
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
            // #1: serve finished voice memos from cacheDir/recordings/ so JS can
            // fetch() them (native networking) instead of receiving a base64 string
            // through the bridge. Same-origin as index.html, so CSP connect-src
            // 'self' allows the fetch; InternalStoragePathHandler blocks any path
            // traversal outside the dir.
            .addPathHandler(
                "/recordings/",
                InternalStoragePathHandler(
                    this,
                    File(cacheDir, NativeAudioRecorder.RECORDINGS_DIR).apply { mkdirs() }
                )
            )
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
    override fun applyImmersiveMode(immersive: Boolean) {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        if (immersive) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
        // THE fix for "fullscreen turns on but nothing expands": hiding the
        // bars is not guaranteed to deliver a fresh inset dispatch to the
        // WebView, so --inset-bottom kept the gesture-bar reservation and the
        // layout never moved. Ask for the pass explicitly.
        if (::webView.isInitialized) ViewCompat.requestApplyInsets(webView)
    }
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

        // #1: onPageFinished fallback for the splash release — long enough that the
        // deterministic onAppReady() handshake (a few hundred ms after paint) wins
        // on a healthy boot, short enough that a page which loads but never signals
        // ready still un-sticks well before the 5 s absolute hatch.
        private const val PAGE_FINISHED_SPLASH_FALLBACK_MS = 1_500L
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
        // REQUIRED for an app that toggles immersive mode. Under the DEFAULT
        // cutout mode a window may lay out into the cutout only while that
        // cutout is contained inside a system bar, so the moment the status
        // bar hides Android letterboxes the window BELOW the cutout — content
        // visibly jumps up and down across every fullscreen transition on any
        // cutout device. Android's own guidance: "Use always, shortEdges or
        // never cutout modes if your app needs to transition into and out of
        // immersive mode." No-op while the bars are visible.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
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
            // #1: do NOT hard-set vm.currentScale = 1f here. restoreState restores
            // the WebView's own zoom and onScaleChanged owns the truth from there; a
            // config-change restore keeps the (surviving) ViewModel's real scale, and
            // a process-death restore starts from the 1f default anyway. Overwriting
            // with 1f would strand hit-tests / screenshots on the wrong scale if zoom
            // were ever re-enabled (disabled today, so this is latent-correctness
            // hardening, matching deviceToCssPx's scale-awareness).
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
            // Both OFF. file:// reads could expose any file on disk the app
            // process has rights to. allowContentAccess gates loading a
            // content:// URL from PAGE MARKUP (<img src="content://…">), which
            // nothing in this app does — it is NOT what feeds the file chooser.
            //
            // Neither consumer needs it, and the second was PROVEN on-device
            // rather than reasoned about (2026-07-30, Pixel/Android 17,
            // WebView 150.0.7871.124, this flag false):
            //   - IMPORT hands JS base64 read in Kotlin (see onCreate), so it
            //     never touched this setting to begin with.
            //   - JOURNAL IMAGE INSERT (<input type="file"> ->
            //     onShowFileChooser) still works: the photo picker opened, the
            //     picked content:// URI came back through filePathCallback, and
            //     the page read the File to completion — 10,623,375 of
            //     10,623,375 bytes via FileReader.readAsArrayBuffer. The URI
            //     arrives with its own read grant from the chooser result; this
            //     setting is not in that path.
            // Re-run that check if the chooser wiring or the WebView major
            // changes: set true only with evidence, not on suspicion.
            allowFileAccess = false
            allowContentAccess = false
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

        // #3: native-reader polish. OVER_SCROLL_NEVER drops the edge glow/stretch
        // (this is a single-page reader — no pull-to-refresh), so scrolling feels
        // like a book rather than a web page. The dark background (matching the
        // default dark theme) removes the brief white flash the WebView's default
        // background could otherwise show before the first CSS paint — the splash
        // covers this on a normal boot (onAppReady, #1 of the prior batch), so it's
        // defense-in-depth for the fallback/reload edge; the app's CSS paints a
        // solid themed bg over it either way.
        wv.overScrollMode = View.OVER_SCROLL_NEVER
        wv.setBackgroundColor(Color.BLACK)

        // #FPS (owner-reported "feels choppy / low fps", 2026-07-28): on ARR
        // (adaptive-refresh) devices — Pixel 9 Pro, Android 15+ — the system
        // renders each view at its VOTED frame rate, and a WebView lands in the
        // "normal" category (60 Hz on this panel) even mid-fling, while the
        // launcher and native apps scroll at 120. Measured on-device: rAF locked
        // at ~17 ms with zero long tasks during active scrolling — the content
        // was fine; the SURFACE was half-rate. Vote the WebView at the panel's
        // peak so flings composite at full refresh. Battery stays adaptive: the
        // vote only applies while the view is actually producing frames; a
        // static page still lets the panel idle down. API-gated: the View
        // frame-rate vote is Android 15+ (API 35); older devices keep today's
        // behavior. Never throws — a missing display just skips the vote.
        try {
            val peak = display?.supportedModes?.maxOfOrNull { it.refreshRate } ?: 0f
            if (peak > 60f) {
                // View-level vote (API 35+). MEASURED INSUFFICIENT ALONE on the
                // Pixel 9 Pro: framestats still showed a pure 16.7 ms vsync grid —
                // Chromium's own 60 Hz content vote outranks the View hint.
                if (android.os.Build.VERSION.SDK_INT >= 35) {
                    wv.requestedFrameRate = peak
                }
                // Window-level vote: preferredRefreshRate outranks the ARR
                // "normal" category, putting Choreographer on the fast grid so
                // WebView fling frames can present at panel peak. This is a
                // RENDER-RATE vote, not a redraw source — a static page still
                // produces no frames and the LTPO panel still idles down, so the
                // battery cost while reading stays ~nil.
                val lp = window.attributes
                lp.preferredRefreshRate = peak
                window.attributes = lp
                Timber.i("Frame-rate votes: view+window %.0f Hz (panel peak)", peak)
            }
        } catch (e: Exception) {
            Timber.w(e, "frame-rate vote failed — staying at default")
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
                // #1: the PRIMARY splash release is now the deterministic
                // AppInterface.onAppReady() handshake (fired when React paints its
                // first frame), which lands within a few hundred ms — before this
                // FALLBACK. onPageFinished only means the DOCUMENT loaded, not that
                // React mounted, so releasing at ~80 ms here used to risk dismissing
                // to a black background on a slow device. This longer fallback only
                // fires if onAppReady never arrives on an otherwise-loaded page (a
                // JS error before the ready call); whichever fires first wins
                // (setting an already-false flag is a no-op).
                view.postDelayed({ vm.splashHolding = false }, PAGE_FINISHED_SPLASH_FALLBACK_MS)
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

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                // Diagnostic only. HTTP-level failures (404/500) never fire
                // onReceivedError above, so a Garden image URL that fell
                // through gardenCache.intercept() to the WebView's own load
                // used to fail SILENTLY. Logs host + status ONLY for the
                // Garden/github asset hosts (same U7 allowlist as the fetch
                // path, via gardenCache.hostAllowed); every other host is
                // ignored to keep the log free of un-actionable spam. The
                // gating + message shape is pinned by MainActivityLogicTest.
                // No UX change: the WebView still renders its own error
                // surface; nothing here touches the splash contract.
                MainActivityLogic.gardenHttpErrorLogMessage(
                    isGardenHost = gardenCache.hostAllowed(request.url.toString()),
                    host = request.url.host,
                    statusCode = errorResponse.statusCode
                )?.let { Timber.w(it) }
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

                // NTV1: block stale bridge starts, cancel capture, and restore
                // focus/mode under the same lock used by nativeRecordStart().
                appInterface.stopAudioCaptureForTeardown()

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
            val bars = insets.getInsets(reservedInsetTypes())
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
                    val bars = insets.getInsets(reservedInsetTypes())
                    val density = resources.displayMetrics.density
                    val topDp = String.format(Locale.US, "%.2f", bars.top / density)
                    val bottomDp = String.format(Locale.US, "%.2f", bars.bottom / density)

                    // Intentional N1.5 exception: bypasses JsBridge because
                    // this fires ~60x/sec during IME animations and the
                    // per-frame overhead of escapeArg + joinToString +
                    // webView.post would burn budget for no safety win --
                    // the only interpolated values are %.2f-formatted
                    // numbers, which can't contain quote/backslash/newline.
                    // #2: evaluate on the LOCAL wv (the instance this callback is
                    // bound to), consistent with onEnd's requestApplyInsets(wv) —
                    // never on a replaced instance during a renderer-crash rebuild.
                    wv.evaluateJavascript(
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

    /**
     * Which inset types the web layout reserves space for, as --inset-top /
     * --inset-bottom. This is Compose's `safeDrawing` set, expressed for
     * Views: system bars ∪ display cutout ∪ IME. Android's edge-to-edge
     * guidance is explicitly to take "the logical or of the system bars and
     * the display cutout types" and never to hardcode a bar or cutout size.
     *
     * Nothing here is per-device: every number comes from the live
     * WindowInsets, per edge, so the same code yields the right answer on a
     * notchless phone, a punch-hole, a waterfall edge, gesture nav, or
     * 3-button nav. What fullscreen actually reclaims therefore VARIES BY
     * DEVICE, which is correct:
     *   - no cutout        → top inset falls to 0, the whole status-bar strip
     *                        is reclaimed
     *   - status bar taller than the cutout → the difference is reclaimed
     *   - cutout taller than the status bar (Pixel 9 Pro: 68dp vs 48dp) →
     *     nothing is free at the top; the camera, not the bar, was setting
     *     --inset-top all along
     * The cutout stays reserved in immersive mode for exactly that reason.
     * Dropping it was tried and reverted: it does not reclaim space Android
     * says is safe, it just moves the layout under the camera — on the test
     * device it put the top-nav history button directly beneath the lens.
     */
    private fun reservedInsetTypes(): Int =
        WindowInsetsCompat.Type.systemBars() or
            WindowInsetsCompat.Type.displayCutout() or
            WindowInsetsCompat.Type.ime()

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
     * JPEG-encode the result, and return the data URI. The
     * @JavascriptInterface entry point wraps this in runBlocking +
     * withTimeoutOrNull so JS still sees a synchronous String return.
     *
     * SINGLE-ALLOCATION PIPELINE: PixelCopy scales its srcRect into whatever
     * Bitmap it's handed, so the nav crop (srcRect top edge) and the maxDim
     * downscale (dest allocated at final thumbnail size) both happen inside
     * the hardware copy. The old pipeline held up to three concurrent
     * bitmaps (full screen ≈ w*h*4 bytes, cropped, scaled); now only the
     * ~thumbnail-sized dest ever exists. Geometry math is pure —
     * MainActivityLogic.screenshotGeometry, unit-tested.
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
        // JPEG-compress → base64 below is pure CPU work on the captured bitmap;
        // it runs on Dispatchers.Default, freeing Main the moment the surface
        // is copied.
        //
        // (The @JavascriptInterface entry still runBlocking()s on the BINDER
        // thread — NOT Main, so there's no main-thread ANR to "fix" by going
        // fire-and-forget; the review's premise was overstated [verified against
        // source]. A window.__onScreenshotComplete async-contract rewrite is a
        // cross-bridge change needing device verification for marginal gain over
        // this off-Main encode, so it's deliberately deferred.)
        val capture: Bitmap? = withContext(Dispatchers.Main) {
            val w = webView.width
            val h = webView.height
            val geo = MainActivityLogic.screenshotGeometry(
                w, h, topCropDp, resources.displayMetrics.density, maxDim
            ) ?: return@withContext null

            val originalScale = vm.currentScale
            val needsZoomReset = originalScale > 0f && abs(originalScale - 1f) > 0.005f
            if (needsZoomReset) webView.zoomBy(1f / originalScale)

            try {
                val location = IntArray(2).also { webView.getLocationInWindow(it) }
                val srcRect = Rect(
                    location[0], location[1] + geo.topCropPx,
                    location[0] + w, location[1] + h
                )
                val dest = createBitmap(geo.destWidth, geo.destHeight, Bitmap.Config.ARGB_8888)
                val ok = capturePixelCopy(srcRect, dest)
                if (!ok) { dest.recycle(); return@withContext null }
                dest
            } finally {
                // Restore zoom immediately after the capture, still on Main.
                if (needsZoomReset) webView.zoomBy(originalScale)
            }
        }
        if (capture == null) return ""

        return withContext(Dispatchers.Default) {
            try {
                val stream = ByteArrayOutputStream()
                capture.compress(Bitmap.CompressFormat.JPEG, jpegQuality.coerceIn(30, 100), stream)
                "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
            } catch (e: Exception) {
                Timber.w(e, "Screenshot encode failed")
                ""
            } finally {
                // Recycle in finally so a compress failure can't leak the
                // (small) dest allocation.
                capture.recycle()
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

    override fun onPause() {
        super.onPause()
        // Streaming audio keep-alive: WebView.onPause() halts HTML5 media, so
        // while an audio letter is playing (vm.streamAudioActive, set via the
        // setAudioActive bridge) skip it — screen-off / brief backgrounding
        // keeps the letter reading aloud. Everything else pauses as before;
        // onResume()'s webView.onResume() is a safe no-op when we never paused.
        if (!vm.streamAudioActive) webView.onPause()
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
        // NTV1: share the recorder/session lifecycle lock with nativeRecordStart().
        appInterface.stopAudioCaptureForTeardown()
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
        webView.destroy()
        super.onDestroy()
    }

}
