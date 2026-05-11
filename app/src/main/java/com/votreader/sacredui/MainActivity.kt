package com.votreader.sacredui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle
import android.util.Base64
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.createBitmap
import androidx.core.graphics.scale
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
    private var currentScale = 1f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

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
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // Asset loader uses https://appassets.androidplatform.net/assets/
                if (url.startsWith("https://appassets.androidplatform.net/assets/") || url.startsWith("about:")) return false
                startActivity(Intent(Intent.ACTION_VIEW, url.toUri()))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectInsets()
            }

            override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) {
                super.onScaleChanged(view, oldScale, newScale)
                currentScale = newScale
            }
        }

        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
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
            if (webView.canGoBack()) webView.goBack()
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
