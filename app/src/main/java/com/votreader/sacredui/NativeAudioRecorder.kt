package com.votreader.sacredui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import java.io.File
import timber.log.Timber

/**
 * Owns the native MediaRecorder lifecycle for journal voice memos. The
 * WebView's getUserMedia path was unreliable across the Android version
 * / OEM matrix (NotReadableError on Pixel 9 Pro, AAUDIO_ERROR_DISCONNECTED
 * on Samsung mid-recording), so the JS recorder calls
 * AndroidBridge.nativeRecord* whenever this bridge is present and reads
 * back the encoded AAC/MPEG-4 blob via window.__onNativeRecordingComplete.
 *
 * Threading: every public method synchronizes on [lock]. @JavascriptInterface
 * methods invoke them from binder threads, and the Activity-side cleanup
 * paths (ViewModel.onCleared, onDestroy fallback) need to safely race
 * against the recorder state from main / UI threads.
 *
 * State: a recording in progress holds a MediaRecorder + a temp file in
 * the app's cacheDir. cancel() / release() / stop() all clear both back
 * to null, so the recorder is either "idle" or "active with file" --
 * no half-state.
 */
class NativeAudioRecorder(private val context: Context) {

    private val lock = Any()
    private var recorder: MediaRecorder? = null
    private var recordFile: File? = null
    private var startMs = 0L
    private var pausedAccumMs = 0L
    private var pauseStartMs = 0L

    /**
     * Begin recording. Returns Success on a healthy start; Failure with a
     * reason on permission denial or MediaRecorder configuration error.
     * On Failure, all internal state is cleared back to "idle" -- no
     * dangling temp file, no half-initialised recorder.
     */
    fun start(): Result<Unit> = synchronized(lock) {
        if (ContextCompat.checkSelfPermission(
                context, Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return Result.Failure("permission")
        }

        // Drop any prior instance defensively -- the JS side could double-
        // fire start without a stop / cancel in between (race with
        // recoveries, network hiccups). We never want two recorders alive.
        try { recorder?.release() } catch (_: Exception) {}
        recorder = null
        recordFile?.let { try { it.delete() } catch (_: Exception) {} }
        recordFile = null

        return try {
            val f = File.createTempFile("votrec_", ".m4a", context.cacheDir)
            val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
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
            recorder = mr
            recordFile = f
            startMs = System.currentTimeMillis()
            pausedAccumMs = 0L
            pauseStartMs = 0L
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.w(e, "nativeRecordStart failed")
            try { recorder?.release() } catch (_: Exception) {}
            recorder = null
            recordFile?.let { try { it.delete() } catch (_: Exception) {} }
            recordFile = null
            Result.Failure(e.message ?: "start_failed")
        }
    }

    fun pause(): Result<Unit> = synchronized(lock) {
        return try {
            recorder?.pause()
            pauseStartMs = System.currentTimeMillis()
            Result.Success(Unit)
        } catch (e: Exception) {
            Result.Failure(e.message ?: "pause_failed")
        }
    }

    fun resume(): Result<Unit> = synchronized(lock) {
        return try {
            recorder?.resume()
            if (pauseStartMs > 0L) {
                pausedAccumMs += System.currentTimeMillis() - pauseStartMs
                pauseStartMs = 0L
            }
            Result.Success(Unit)
        } catch (e: Exception) {
            Result.Failure(e.message ?: "resume_failed")
        }
    }

    /** Peak amplitude since the last call (0..32767). Drives the waveform. */
    fun amplitude(): Int = synchronized(lock) {
        try { recorder?.maxAmplitude ?: 0 } catch (_: Exception) { 0 }
    }

    /**
     * Stop recording and produce the encoded payload. Returns Success with
     * base64 (AAC/MPEG-4) + duration in ms; Failure on stop error
     * (e.g. stopped too fast for any valid frames), file read error, or
     * "no_recording" if start was never called or already cleared.
     */
    fun stop(): Result<RecordingResult> = synchronized(lock) {
        val mr = recorder
        val f = recordFile
        recorder = null
        if (mr == null || f == null) {
            recordFile = null
            return Result.Failure("no_recording")
        }
        var durMs = System.currentTimeMillis() - startMs - pausedAccumMs
        if (pauseStartMs > 0L) {
            durMs -= System.currentTimeMillis() - pauseStartMs
        }
        try {
            mr.stop()
        } catch (e: Exception) {
            // stop() throws if stopped too fast (no valid frames written).
            Timber.w(e, "nativeRecordStop stop() failed")
            try { mr.release() } catch (_: Exception) {}
            try { f.delete() } catch (_: Exception) {}
            recordFile = null
            return Result.Failure("stop_failed")
        }
        try { mr.release() } catch (_: Exception) {}
        return try {
            val bytes = f.readBytes()
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            try { f.delete() } catch (_: Exception) {}
            recordFile = null
            Result.Success(RecordingResult(b64, if (durMs < 0L) 0L else durMs))
        } catch (e: Exception) {
            Timber.w(e, "nativeRecordStop read failed")
            try { f.delete() } catch (_: Exception) {}
            recordFile = null
            Result.Failure("read_failed")
        }
    }

    /** Abort recording and delete the temp file. No JS callback. */
    fun cancel() {
        synchronized(lock) {
            val mr = recorder
            val f = recordFile
            recorder = null
            recordFile = null
            if (mr != null) {
                try { mr.stop() } catch (_: Exception) {}
                try { mr.release() } catch (_: Exception) {}
            }
            f?.let { try { it.delete() } catch (_: Exception) {} }
        }
    }

    /**
     * Released by [MainViewModel.onCleared] when the Activity is
     * finishing, so a recording in progress at app-exit doesn't leak the
     * mic session or orphan its cacheDir temp file.
     */
    fun release() = cancel()

    data class RecordingResult(val base64: String, val durationMs: Long)

    sealed interface Result<out T> {
        data class Success<T>(val value: T) : Result<T>
        data class Failure(val reason: String) : Result<Nothing>
    }
}
