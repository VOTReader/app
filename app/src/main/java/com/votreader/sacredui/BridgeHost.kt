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

    /**
     * Launch the SAF "create document" picker so the user chooses the
     * export destination (folder + filename). [content] is the JSON
     * payload to write once a URI comes back; the host stashes it and
     * writes it in the picker-result callback, reporting the outcome to
     * JS via window.__onExportComplete. Works on every supported API
     * level (SAF is API 19+) and needs no storage permission.
     */
    fun launchExportPicker(suggestedName: String, content: String)

    /** Launch the proactive RECORD_AUDIO permission request. */
    fun launchMicPermissionRequest()

    /**
     * Launch the SAF create-document picker for a v3 streaming export
     * (BACKUP-STREAMING-PLAN P3). Unlike [launchExportPicker] (v2: the whole
     * payload is handed over up front), this only obtains the destination URI
     * — the host stashes it on the vm and fires __onV3ExportReady; the bytes
     * are then streamed frame-by-frame through AppInterface's v3Export* methods.
     * [suggestedName] pre-fills the picker's filename (a `.votbak` name).
     */
    fun launchV3ExportPicker(suggestedName: String)

    /**
     * Launch the SAF open-document picker for a v3 streaming import. Obtains
     * the source URI only (the host stashes it on the vm and fires
     * __onV3ImportReady); the file is then read frame-by-frame through
     * AppInterface's v3Import* methods. Accepts any file type so a `.votbak`
     * container or a legacy `.json` backup are both pickable — the native
     * magic-sniff in beginV3Import routes them.
     */
    fun launchV3ImportPicker()

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

    /**
     * NTV3: delete the native Garden image disk cache (cacheDir/garden). Invoked off
     * the UI thread (the @JavascriptInterface bridge call runs on a binder thread);
     * GardenImageCache owns the directory + swallows its own I/O errors.
     */
    fun clearGardenCache()
}
