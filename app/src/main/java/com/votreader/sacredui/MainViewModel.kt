package com.votreader.sacredui

import android.media.AudioManager
import android.media.MediaRecorder
import androidx.lifecycle.ViewModel
import java.io.File
import timber.log.Timber

/**
 * Holds the per-Activity state that survives configuration changes -- the
 * recorder, the audio session mode, the cached insets, the renderer
 * recovery counter. MainActivity's manifest already declares
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
 */
class MainViewModel : ViewModel() {

    // ---- UI / chrome state ----
    var savedTopInset: Int = 0
    var savedBottomInset: Int = 0

    @Volatile var currentScale: Float = 1f
    var keepScreenOnEnabled: Boolean = true
    @Volatile var splashHolding: Boolean = true

    // ---- Audio session ----
    var previousAudioMode: Int = AudioManager.MODE_NORMAL

    // ---- Native recorder state (guarded by recLock) ----
    val recLock = Any()
    var nativeRecorder: MediaRecorder? = null
    var nativeRecordFile: File? = null
    var nativeRecordStartMs: Long = 0L
    var nativeRecordPausedAccumMs: Long = 0L
    var nativeRecordPauseStartMs: Long = 0L

    // ---- Renderer-crash recovery (60-second sliding window) ----
    var renderRecoveryCount: Int = 0
    var firstRecoveryMs: Long = 0L

    /**
     * Fires when the ViewModelStore is cleared -- i.e. the Activity is
     * finishing (not just config-changing). Releases the recorder and
     * deletes the orphan temp file. Runs in one place instead of being
     * duplicated across [MainActivity.onDestroy] and other lifecycle
     * paths, so the cleanup invariant is harder to break in future.
     */
    override fun onCleared() {
        super.onCleared()
        synchronized(recLock) {
            nativeRecorder?.let {
                try { it.stop() } catch (_: Exception) {}
                try { it.release() } catch (e: Exception) {
                    Timber.w(e, "Recorder release on ViewModel clear failed")
                }
            }
            nativeRecorder = null
            nativeRecordFile?.let {
                try { it.delete() } catch (_: Exception) {}
            }
            nativeRecordFile = null
        }
    }
}
