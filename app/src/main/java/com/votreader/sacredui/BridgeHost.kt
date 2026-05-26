package com.votreader.sacredui

import android.content.Context
import android.media.AudioManager
import android.view.Window
import android.webkit.WebView

/**
 * Abstraction over the Activity surface that [AppInterface] needs.
 *
 * Exists so AppInterface can be unit-tested without spinning up the full
 * Activity lifecycle -- tests substitute a [FakeBridgeHost] that records
 * what the bridge called and lets the test assert against it. MainActivity
 * implements this directly, so production code pays zero runtime cost.
 *
 * Design notes:
 *
 *   - WebView is exposed via a property getter (not a stored ref) because
 *     onRenderProcessGone rebuilds the WebView; AppInterface must always
 *     read the *current* instance, not a snapshot.
 *
 *   - AudioManager is nullable because the Activity caches it lazily in
 *     onCreate; a binder-thread call that lands before that cache is set
 *     should no-op gracefully rather than NPE.
 *
 *   - launchFilePicker / launchMicPermissionRequest are explicit verbs
 *     instead of exposing the raw ActivityResultLauncher fields, because
 *     a launcher only fires safely if the Activity owns it -- routing
 *     through methods keeps that contract enforceable at the host.
 *
 *   - captureScreenshot bundles its async machinery (runBlocking +
 *     withTimeoutOrNull + suspendCancellableCoroutine + PixelCopy) behind
 *     a synchronous return so the @JavascriptInterface contract is
 *     preserved. The Activity owns the implementation; the host just
 *     exposes the entry point.
 */
interface BridgeHost {
    /** Application context — for getSystemService, checkSelfPermission. */
    val activityContext: Context

    /** Activity window — for FLAG_KEEP_SCREEN_ON + WindowInsetsControllerCompat. */
    val activityWindow: Window

    /** Current WebView. Reads dynamically so renderer-crash rebuilds are picked up. */
    val activeWebView: WebView

    /** AudioManager, cached in Activity.onCreate. Null before that runs. */
    val audioSystemService: AudioManager?

    /** Hop to the UI thread. */
    fun postToUi(action: () -> Unit)

    /** Launch the system JSON file picker (Settings import flow). */
    fun launchFilePicker()

    /** Launch the proactive RECORD_AUDIO permission request. */
    fun launchMicPermissionRequest()

    /**
     * True if RECORD_AUDIO is currently granted. Wraps the static
     * ContextCompat.checkSelfPermission call so AppInterface can be
     * tested without spinning up Robolectric for a permission probe.
     */
    fun hasAudioPermission(): Boolean

    /**
     * Capture the WebView as a JPEG data URI. Synchronous return preserves
     * the @JavascriptInterface contract; implementation runs the actual
     * PixelCopy + encode on the UI thread with a bounded timeout.
     */
    fun captureScreenshot(topCropDp: Int, maxDim: Int, jpegQuality: Int): String
}
