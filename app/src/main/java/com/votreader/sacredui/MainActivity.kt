package com.votreader.sacredui

import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.addCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
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
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var savedTopInset = 0
    private var savedBottomInset = 0
    @Volatile private var currentScale = 1f
    // Read by setKeepScreenOn(); flips FLAG_KEEP_SCREEN_ON on/off from JS.
    private var keepScreenOnEnabled = true
    // Held true while the system splash screen should remain on top. Flipped
    // false after onPageFinished + a short delay to let React mount, so the
    // cold-boot transition is splash → first frame with no black flash.
    @Volatile private var splashHolding = true
    // Launcher for the import file picker; registered in onCreate before the
    // WebView is created so it is ready before any JS calls openFilePicker().
    private lateinit var filePickerLauncher: ActivityResultLauncher<String>

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
                    Log.w("VOTReader", "import file read failed", e)
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

        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (keepScreenOnEnabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            @Suppress("SetJavaScriptEnabled")
            javaScriptEnabled = true
            domStorageEnabled = true
            // Disable unsafe file access APIs
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
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
                val level = when (msg.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.ERROR
                    ConsoleMessage.MessageLevel.WARNING -> Log.WARN
                    ConsoleMessage.MessageLevel.DEBUG -> Log.DEBUG
                    else -> Log.INFO
                }
                Log.println(level, "WebViewJS", "${msg.message()}  ($src:$line)")
                return true
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
                    Log.w("VOTReader", "Refused external URL with disallowed scheme: $urlStr")
                    return true
                }
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, urlStr.toUri()))
                } catch (e: Exception) {
                    Log.w("VOTReader", "ACTION_VIEW failed for $urlStr", e)
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
        val js = """
            (function() {
                var r = document.documentElement.style;
                r.setProperty('--inset-top',    '${topDp}px');
                r.setProperty('--inset-bottom', '${bottomDp}px');
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
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
                Log.w("VOTReader", "saveToDownloads failed", e)
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
