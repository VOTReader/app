package com.votreader.sacredui

import android.app.Application
import android.media.AudioManager
import android.net.Uri
import androidx.lifecycle.AndroidViewModel

/**
 * Holds the per-Activity state that survives configuration changes -- the
 * native audio recorder, the audio session mode, the cached insets, the
 * renderer recovery counter. MainActivity's manifest already declares
 * configChanges for orientation/uiMode/screenSize/etc., so the Activity
 * does not actually rebuild on rotation -- but moving state here gives
 * us:
 *
 *   1. A single, named place every piece of orchestration-relevant state
 *      lives, separate from the Activity's lifecycle wiring.
 *   2. A centralized onCleared hook that fires on user-driven Activity
 *      finish, so recorder + temp-file cleanup runs in exactly one place
 *      instead of duplicating between onDestroy paths.
 *   3. Future-proofing for any config change that escapes the manifest
 *      list (e.g. locale change) -- the Activity would recreate but the
 *      recorder would survive.
 *
 * Process death still loses everything -- ViewModel does not survive an
 * abrupt OS kill, but neither does the rest of the in-memory state, so
 * this is acceptance, not regression.
 *
 * AndroidViewModel (rather than plain ViewModel) so we can hand the
 * Application context to [NativeAudioRecorder] -- it needs it for the
 * Android 12+ MediaRecorder(context) constructor and for cacheDir lookup.
 */
class MainViewModel(application: Application) : AndroidViewModel(application) {

    // ---- UI / chrome state ----
    var savedTopInset: Int = 0
    var savedBottomInset: Int = 0

    @Volatile var currentScale: Float = 1f
    var keepScreenOnEnabled: Boolean = true
    @Volatile var splashHolding: Boolean = true

    // ---- Audio session ----
    var previousAudioMode: Int = AudioManager.MODE_NORMAL

    // ---- Native recorder. Owns its own lock + recorder + temp-file state. ----
    val audioRecorder: NativeAudioRecorder = NativeAudioRecorder(application)

    // ---- File I/O. The legacy v2 read/write helpers are stateless; the v3
    // streaming sessions (BACKUP-STREAMING-PLAN P3) hold an open stream + frame
    // counters internally between bridge calls.
    val storage: StorageManager = StorageManager(application)

    // ---- v3 streaming backup: the SAF picker is async, so the chosen
    // destination (export) / source (import) URI is stashed here between
    // v3*Open() launching the picker and the binder-thread bridge methods that
    // open the stream. @Volatile because the picker callback writes on the UI
    // thread and the @JavascriptInterface methods read on a binder thread.
    @Volatile var pendingV3ExportUri: Uri? = null
    @Volatile var pendingV3ImportUri: Uri? = null

    // ---- Renderer-crash recovery (60-second sliding window) ----
    var renderRecoveryCount: Int = 0
    var firstRecoveryMs: Long = 0L

    /**
     * Fires when the ViewModelStore is cleared -- i.e. the Activity is
     * finishing (not just config-changing). Releases the recorder so a
     * mid-recording app exit doesn't leak the mic session or orphan a
     * cacheDir temp file. The recorder handles the synchronization
     * internally, so this is a single delegated call.
     */
    override fun onCleared() {
        super.onCleared()
        audioRecorder.release()
        // Free any v3 backup stream left open by an export/import interrupted
        // by the Activity finishing mid-flight (best-effort; no file delete).
        storage.releaseV3Sessions()
    }
}
