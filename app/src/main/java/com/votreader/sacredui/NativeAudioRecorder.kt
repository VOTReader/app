package com.votreader.sacredui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import androidx.annotation.VisibleForTesting
import androidx.core.content.ContextCompat
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import timber.log.Timber

/**
 * Owns the native MediaRecorder lifecycle for journal voice memos. The
 * WebView's getUserMedia path was unreliable across the Android version
 * / OEM matrix (NotReadableError on Pixel 9 Pro, AAUDIO_ERROR_DISCONNECTED
 * on Samsung mid-recording), so the JS recorder calls
 * AndroidBridge.nativeRecord* whenever this bridge is present and reads
 * back the encoded AAC/MPEG-4 blob via window.__onNativeRecordingComplete.
 *
 * Threading: every public method that touches recorder STATE synchronizes on
 * [lock]. @JavascriptInterface methods invoke them from binder threads, and the
 * Activity-side cleanup paths (ViewModel.onCleared, onDestroy fallback) need to
 * safely race against the recorder state from main / UI threads.
 *
 * [readRecording], [deleteRecording] and [listRecordings] are the three deliberate
 * exceptions: they touch only files already finished and handed off, never [recorder]
 * or [recordFile], so there is nothing for the lock to protect -- and taking it would
 * park a multi-megabyte base64 read in front of a [cancel] arriving from an
 * Activity teardown.
 *
 * State: a recording in progress holds a MediaRecorder + a temp file in
 * the app's cacheDir. cancel() / release() / stop() all clear both back
 * to null, so the recorder is either "idle" or "active with file" --
 * no half-state.
 */
class NativeAudioRecorder(private val context: Context) {

    private val lock = Any()

    /**
     * Names [stop] handed to JS, mapped to the [SystemClock.elapsedRealtime] at which
     * it handed them over. The sweep must not touch a live claim: a served file becomes
     * sweep-eligible [RECORDING_TTL_MS] after stop(), a fetch that keeps failing is
     * retried for longer than that, and the user's natural response to a stuck memo is
     * to record again -- a start(), which swept the one file journal-3 2a exists to
     * rescue. (That window was 60 s until 2026-09-06, which is what made this map
     * load-bearing rather than merely tidy.)
     *
     * BOUNDED AT [CLAIM_TTL_MS]. Only [deleteRecording] ends a claim deliberately, and
     * its caller runs only on the COMMIT path, so a memo the reader never commits --
     * a session killed between the read and the put -- leaves a claim nobody releases.
     * Without a ceiling a long-lived process would pin every such memo it ever served;
     * twenty five-minute memos is ~72 MB of cacheDir held against a fetch that stopped
     * being plausible many hours earlier.
     * A day is far outside anything a fetch or a recovery read could still want (the
     * happy path fetches within a second of stop()) and far inside "forever". The
     * sweep evicts expired entries as it passes, so the map is bounded too, not just
     * the disk.
     *
     * WHY elapsedRealtime AND NOT WALL TIME. This measures an interval inside one
     * process. Wall time can step backwards -- NTP, the user changing the clock --
     * and a claim would then look younger than it is, for hours. The sweep's OTHER
     * comparison, file age, has to stay on wall time because it reads a filesystem
     * mtime. Two clocks in one function, each against what it can actually compare to.
     *
     * In memory ON PURPOSE. A crash empties it, so the next session's orphans are
     * swept normally -- and orphans from a dead session are the only case the sweep
     * was ever for. Concurrent because [deleteRecording] runs on a binder thread
     * outside [lock] while the sweep runs under it.
     */
    private val servedNames = ConcurrentHashMap<String, Long>()
    private var recorder: MediaRecorder? = null
    private var recordFile: File? = null
    private var startMs = 0L
    private var pausedAccumMs = 0L
    private var pauseStartMs = 0L

    // Written from MediaRecorder's listener callbacks (its own event thread),
    // read under [lock] in stop(). @Volatile rather than lock-guarded writes:
    // a callback that blocked on a lock stop() already holds would serialise
    // the mic's event thread behind file I/O for no gain.
    /** A hardware/server error killed the session — the MPEG-4 file never got
     *  its moov atom, so it is unplayable and must not be handed to JS. */
    @Volatile private var recorderFailed = false
    /**
     * [MAX_DURATION_MS] was reached: MediaRecorder stopped and finalised the file
     * ITSELF, and `stop()` must not call `stop()` on it again.
     *
     * MEASURED on emulator-5554 (API 34) rather than assumed, 2026-09-04 — and the
     * measurement CORRECTED the reason this exists. Confirmed: the info callback
     * fires (`MediaWriter: Recorder event msg:2, ext1:800`) and the recorder does
     * enter a non-recording state (`StagefrightRecorder: stop while neither
     * recording nor paused`). NOT confirmed: that a second `stop()` throws. On
     * API 34 it does not — it logs that warning and returns, and an A/B with this
     * guard neutered produced a 75,821-byte playable file either way.
     *
     * So this is defence against the DOCUMENTED contract (`MediaRecorder.stop()`
     * is specified to throw IllegalStateException from an invalid state, which
     * `stop()`'s catch would turn into a deleted file), not against a loss proven
     * on this platform. AOSP's leniency here is an implementation detail no OEM or
     * API level is obliged to share, and skipping a redundant stop on an
     * already-stopped recorder is right regardless. Evidence:
     * `evidence/journal6-maxduration-logcat.txt`.
     */
    @Volatile private var autoStopped = false

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

        // #1: clean any orphaned served memos from an interrupted prior session
        // (the happy path fetches the file + drops the reference within a second).
        // BELOW the permission check, not above it: the sweep deletes files, and a
        // tap that is refused the mic is no reason to prune anybody's data.
        sweepStaleRecordings()

        // Drop any prior instance defensively -- the JS side could double-
        // fire start without a stop / cancel in between (race with
        // recoveries, network hiccups). We never want two recorders alive.
        // reset() returns the old recorder to its idle state (freeing the mic /
        // encoder) BEFORE release(); on some OEMs this releases the hardware more
        // promptly, reducing the chance the fresh MediaRecorder below hits a
        // still-busy mic on a rapid restart.
        recorder?.let {
            try { it.reset() } catch (_: Exception) {}
            try { it.release() } catch (_: Exception) {}
        }
        recorder = null
        recordFile?.let { try { it.delete() } catch (_: Exception) {} }
        recordFile = null
        recorderFailed = false
        autoStopped = false

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
            mr.setAudioEncodingBitRate(AUDIO_BIT_RATE)
            mr.setAudioSamplingRate(44100)
            mr.setOutputFile(f.absolutePath)
            // OnErrorListener is MediaRecorder's ONLY notification channel for a
            // session killed underneath it — an incoming call yanking the
            // AudioRecord, an OEM audio-focus steal, a media-server death. Without
            // it those failed in total silence and stop() handed JS a truncated
            // file as a success.
            mr.setOnErrorListener { _, what, extra ->
                Timber.w("recorder error what=%d extra=%d — session died mid-recording", what, extra)
                recorderFailed = true
            }
            mr.setOnInfoListener { _, what, _ -> onRecorderInfo(what) }
            // Native backstop for recording length. The real cap is the JS-side
            // 300 s timer in JournalRecordingSheet; this sits 30 s above it so JS
            // still owns the normal stop, and this only catches the case JS cannot
            // — a throttled/stalled foreground timer (background tab, doze) leaving
            // the mic open indefinitely. Must be set before prepare().
            mr.setMaxDuration(MAX_DURATION_MS)
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

    /**
     * MediaRecorder's OnInfoListener body, extracted from the lambda so the JVM can
     * reach it: Robolectric's ShadowMediaRecorder records the listener but never
     * fires it, so the lambda's contents are unreachable from a unit test.
     *
     * Only MEDIA_RECORDER_INFO_MAX_DURATION_REACHED means "the recorder stopped and
     * finalised the file itself" — the other info codes (max filesize, and whatever
     * an OEM adds) must NOT set [autoStopped], or a still-running recorder would
     * never get its stop() and the memo would never be finalised.
     */
    @VisibleForTesting
    internal fun onRecorderInfo(what: Int) {
        if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
            Timber.i("recorder reached the %d ms native backstop and stopped itself", MAX_DURATION_MS)
            autoStopped = true
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
        if (recorderFailed) {
            // The session died mid-recording (OnErrorListener fired). An MPEG-4
            // whose moov atom was never written is unplayable, so there is nothing
            // to salvage — but JS now learns the recording FAILED instead of being
            // handed a truncated file that looks fine until playback.
            try { mr.reset() } catch (_: Exception) {}
            try { mr.release() } catch (_: Exception) {}
            try { f.delete() } catch (_: Exception) {}
            recordFile = null
            return Result.Failure("recorder_error")
        }
        // Skip stop() when the recorder already stopped ITSELF at the native
        // backstop: the file is complete. Where the platform honours the documented
        // IllegalStateException for a stop() from a non-recording state, the throw
        // would land in the delete path below and destroy a full-length memo. API 34
        // does not throw (measured — see [autoStopped]), so this is contract defence
        // rather than a fix for a loss proven here.
        if (!autoStopped) {
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
        }
        try { mr.release() } catch (_: Exception) {}
        val safeDur = if (durMs < 0L) 0L else durMs
        // #1 (fetch bridge): move the finished recording into the served
        // recordings/ dir under a uuid name and hand JS a URL to fetch, instead of
        // base64-inflating the whole file through the string bridge (a 5-min memo
        // is ~6.7 MB of base64 for evaluateJavascript to parse). If the move fails
        // for any reason, fall back to the base64 path so a recording is never lost.
        val served = File(recordingsDir(), UUID.randomUUID().toString() + ".m4a")
        val moved = try { f.renameTo(served) } catch (_: Exception) { false }
        if (moved) {
            // JS now owns this name until it calls deleteRecording; the sweep skips it
            // until then, however old the FILE gets waiting for a fetch that keeps
            // failing -- but not past CLAIM_TTL_MS, because the release runs only on
            // the COMMIT path and a memo the reader never commits leaves a claim
            // nobody ends, which would pin the file for the whole process.
            servedNames[served.name] = SystemClock.elapsedRealtime()
            recordFile = null
            return Result.Success(RecordingResult(base64 = null, durationMs = safeDur, fileName = served.name))
        }
        val b64 = encodeFileToBase64(f)
        try { f.delete() } catch (_: Exception) {}
        recordFile = null
        return if (b64 == null) Result.Failure("read_failed")
        else Result.Success(RecordingResult(base64 = b64, durationMs = safeDur, fileName = null))
    }

    /**
     * Base64 of the served recording [name], or null.
     *
     * journal-3 2a: the SECOND route to a finished memo. The happy path hands JS a
     * /recordings/ URL to fetch; when that fetch fails non-transiently the finished
     * .m4a is still sitting in [recordingsDir] and nothing in JS can reach it again.
     * This is how it gets it back.
     *
     * The trade, stated because it is real, and sized honestly: at the ceiling this
     * reintroduces the exact cost the fetch bridge exists to avoid. ~7.9 M base64
     * characters is ~15.8 MB as an ART String (UTF-16), on top of the 5.94 MB byte
     * array and Base64's own transient copy, before evaluateJavascript copies it
     * again -- nearer 30 MB of peak native memory than the 8 MB the character count
     * suggests. Worth paying only because the alternative on this path is losing the
     * recording outright.
     *
     * ONE null covers missing, unreadable, over-ceiling, EMPTY and refused alike -- JS
     * needs no way to tell them apart from the reader and it leaks least -- but the
     * interesting cases log DIFFERENT Timber lines, so a rejected name is greppable in
     * logcat. The empty case is the one JS can still distinguish, because
     * [listRecordings] reports it as a row with `"size": 0` rather than by omitting it.
     */
    fun readRecording(name: String): String? {
        val f = resolveServedRecording(name) ?: return null
        if (!f.isFile) {
            Timber.i("readRecording: no served recording named %s", name)
            return null
        }
        return encodeFileToBase64(f)
    }

    /**
     * Delete the served recording [name]; true only if a file was actually removed.
     *
     * journal-3 2a: the handshake half, and the only thing that ends a claim
     * deliberately. JS calls this once the bytes are committed to its own store, so
     * the native side stops holding a copy of something already saved. Until it does,
     * [servedNames] keeps the file out of [sweepStaleRecordings] -- which exists for
     * the memos of a session that died, the only ones nobody is coming back for.
     *
     * THIS SAID "NOTHING CALLS THIS YET" UNTIL 2026-09-06 AND THAT WAS FALSE. The
     * caller landed in `90857ce7` (journal-3 2a-web) and lives at
     * `JournalRecordingSheet.jsx:269`, inside `JournalMediaStore.put(record).then(...)`
     * -- after the put RESOLVES, never before, because `put()` resolving is the
     * durability line (STORE-3 resolves it on the transaction commit, not the
     * request's onsuccess). Releasing the file any earlier opens a window where native
     * has let go and JS has not yet got it, and a crash inside that window loses the
     * recording with the bytes deleted from under it. It is witnessed by one positive
     * and three negative assertions in `JournalRecordingSheet.test.jsx` (:517 fires,
     * :514 / :582 / :601 must not fire before the put resolves), which is what makes
     * it a handshake rather than a call.
     *
     * The stale sentence outlived the thing it described by a whole phase, and it was
     * propagated into a commit message and three peer reports before the Web Builder
     * grepped main. **A VERB WITH NO CALLER AND A VERB WHOSE CALLER YOU HAVE NOT
     * LOOKED FOR PRODUCE THE SAME READING.** A caller list belongs in a commit, not in
     * a KDoc, because the KDoc cannot notice when it stops being true.
     *
     * The claim is dropped even when the unlink fails: JS is finished with the file
     * either way, and a claim nothing can release would pin the file for the life of
     * the process. A file left behind by a failed delete is then an ordinary orphan
     * and the sweep can have it.
     */
    fun deleteRecording(name: String): Boolean {
        val f = resolveServedRecording(name) ?: return false
        servedNames.remove(f.name)
        return try {
            f.delete()
        } catch (e: Exception) {
            Timber.w(e, "deleteRecording failed for %s", name)
            false
        }
    }

    /**
     * Every served memo still on disk, as a JSON array string. NEVER null.
     *
     * journal-3 2b: the recovery half. [readRecording] answers "give me this memo",
     * which needs a name JS already has; this answers "what is still here", which is
     * the only question a session that was KILLED can ask -- its in-flight name died
     * with the page. Without it a memo written by a process that never got to hand the
     * name over is unreachable until the sweep takes it.
     *
     *     [{"name":"<uuid>.m4a","size":<bytes>,"mtime":<epoch millis>}, ...]
     *
     * `mtime` is [File.lastModified], WALL CLOCK, and describes the FILE. The claim
     * ceiling ([CLAIM_TTL_MS]) runs on [SystemClock.elapsedRealtime] and is invisible
     * here -- deliberately: JS reconciles against its own store, not against a clock.
     *
     * TWO RETURN VALUES THAT MUST NOT COLLAPSE INTO EACH OTHER:
     *
     *   "[]"                 looked, and the directory is empty -- nothing to recover
     *   "error:list_failed"  could not look ([File.listFiles] null, or a throw)
     *
     * A null must never be able to impersonate a value. `listFiles()` returns null for
     * an I/O error and for a path that is not a directory, and the tempting `?: []`
     * would report "nothing to recover" about a directory nobody managed to read. The
     * failure answers a String (so the never-null rule holds) that fails
     * JSON.parse-is-an-array on the JS side and lands in "could not enumerate".
     *
     * EVERY LISTED NAME HAS PASSED [resolveServedRecording], so the lister can never
     * offer a row the reader will refuse, and the JS reconciliation cannot retry
     * forever against a name nothing returns. That holds for the SIZE CEILING too --
     * a file over [MAX_RECORDING_BYTES] is omitted rather than listed, because it
     * reads back null. The one deliberate exception is a zero-byte file: it is listed
     * with `"size": 0` and the reader still refuses it, which is what lets JS say
     * "that memo is empty" rather than "could not read it".
     *
     * Hand-rolled JSON, following [BoundedLogTree.toJson] -- the org.json classes are
     * Android-stub in a pure-JVM unit test. NO ESCAPING IS NEEDED HERE and that is a
     * property of the filter, not an oversight: every name has matched [SERVED_NAME],
     * which admits only lowercase hex, `-` and `.m4a`. A field carrying free text
     * would need the escaping [BoundedLogTree] does.
     *
     * No size ceiling, unlike [encodeFileToBase64]: a row is bounded at ~70 bytes by
     * [SERVED_NAME]'s fixed shape, so the reply grows with the file COUNT, which the
     * sweep already bounds -- where a single base64 read is bounded by nothing but the
     * file it was handed.
     *
     * Takes no lock, for the same reason [readRecording] and [deleteRecording] do not:
     * it touches only files already finished and handed off, never [recorder] or
     * [recordFile].
     */
    fun listRecordings(): String {
        val files = try {
            recordingsDir().listFiles()
        } catch (e: Exception) {
            Timber.w(e, "listRecordings: recordings/ could not be enumerated")
            null
        }
        if (files == null) {
            Timber.w("listRecordings: could not enumerate recordings/")
            return LIST_FAILED
        }
        val sb = StringBuilder(files.size * 80 + 2).append('[')
        var n = 0
        for (f in files) {
            // isFile AFTER the resolve, not before: resolveServedRecording hands back
            // the name-built File when the path has vanished (an ordinary swept memo,
            // or the sweep racing this loop), and that File must not become a row.
            val real = resolveServedRecording(f.name) ?: continue
            if (!real.isFile) continue
            // OVER THE CEILING IS "name absent", not a row. The contract's own line is
            // `unreadable (refused name, I/O, over the size ceiling) -> name absent`,
            // and the first draft of this loop listed such a file anyway -- so the
            // lister would have offered a row the reader refuses, which is the one
            // thing the filter exists to make impossible, and JS would have retried
            // that name forever. Caught by the Web Builder asking what "listed but
            // reads null" means for a row that is NOT size 0. The zero-byte row stays
            // the single deliberate exception.
            val len = real.length()
            if (len > MAX_RECORDING_BYTES) {
                Timber.w("listRecordings: omitting %s, %d bytes is over the %d ceiling",
                    real.name, len, MAX_RECORDING_BYTES)
                continue
            }
            if (n++ > 0) sb.append(',')
            sb.append("{\"name\":\"").append(real.name).append('"')
                .append(",\"size\":").append(len)
                .append(",\"mtime\":").append(real.lastModified())
                .append('}')
        }
        return sb.append(']').toString()
    }

    /**
     * The trust boundary for all three JS-facing file verbs: resolve [name] to a file in
     * [recordingsDir], or refuse it. Two locks, and they are not redundant by accident.
     *
     * 1. [SERVED_NAME] -- the name must be the uuid shape [stop] itself writes. It
     *    refuses every path-shaped string: a traversal never reaches the filesystem.
     * 2. Canonical PARENT equality with recordings/. This one catches what a name can
     *    never show: a SYMLINK sitting in recordings/ under a perfectly legal uuid
     *    name, whose canonical parent is somewhere else entirely. Lock 1 sees a valid
     *    name and passes it; only this refuses it.
     *
     * Both locks are load-bearing and both are proven: delete lock 1 and the evil.txt
     * case fails, delete lock 2 and the symlink case fails. The symlink test needs a
     * privilege Windows only grants under Developer Mode, so it is guarded with
     * assumeTrue and skips on a host without it rather than failing there.
     *
     * Parent EQUALITY, deliberately, not a path prefix: startsWith on the canonical
     * path also says yes to a sibling directory named recordings-anything.
     */
    private fun resolveServedRecording(name: String): File? {
        // Every refusal logs a TRUNCATED name. Timber.w lands in BoundedLogTree on
        // release, which bounds entry COUNT and not entry SIZE, and that buffer is
        // carried into the user-shareable diagnostic export -- this is the first
        // bridge path that can put an arbitrary-length JS string in there. A legal
        // name is 40 characters, so 64 loses nothing real. (Security, 2026-09-04.)
        if (!SERVED_NAME.matches(name)) {
            Timber.w("refused served-recording name (shape): %s", name.take(LOGGED_NAME_CHARS))
            return null
        }
        val dir = recordingsDir()
        val f = File(dir, name)
        // toRealPath(), NOT File.canonicalFile. getCanonicalPath resolves symbolic
        // links on Linux -- so on Android this lock worked -- but on Windows it does
        // not, so the same code refused a symlink on device and followed one on the
        // machine the gates run on. Found by the test below actually running, which
        // is the only reason it is not still a comment claiming otherwise.
        // Path.toRealPath() follows links on both, so this lock now means one thing
        // everywhere and is provable where it is checked.
        // BOTH resolves inside the same try. recordingsDir() mkdirs first, but if that
        // ever fails -- cacheDir evicted between the mkdirs and the resolve, disk full
        // -- resolving the DIR throws too, and an exception crossing the
        // @JavascriptInterface boundary is a different failure shape from the clean
        // null every other path on this method returns. (Security, 2026-09-04.)
        val real = try {
            val realDir = dir.toPath().toRealPath()
            val realFile = f.toPath().toRealPath()
            if (realFile.parent != realDir) {
                Timber.w("refused served-recording name (outside recordings/): %s", name.take(LOGGED_NAME_CHARS))
                return null
            }
            realFile
        } catch (e: java.nio.file.NoSuchFileException) {
            // Ordinary: swept, or never written. Not an attack -- hand the File back
            // and let the caller report it missing.
            //
            // NOTE the shape difference: here containment was never CHECKED, where
            // below it was checked and passed. A symlink appearing between this throw
            // and the caller's read would be followed. Same threat model as the window
            // below -- it needs code already inside this app's sandbox, which owns the
            // directory outright -- but it is a wider window and worth naming.
            return f
        } catch (e: Exception) {
            Timber.w(e, "refused served-recording name (unresolvable): %s", name.take(LOGGED_NAME_CHARS))
            return null
        }
        // Hand back the RESOLVED path, not the name-built one: the read then re-opens
        // exactly what was checked. A swap between here and there is still
        // theoretically possible, and needs the same in-sandbox foothold.
        return real.toFile()
    }

    /**
     * Whole-file base64, or null on any refusal, read error, or empty file.
     *
     * Shared by [readRecording] and [stop]'s fallback branch so the size ceiling lives
     * in ONE place. The stop() read has had no ceiling since it was written; routing
     * both callers through here closes that sibling for free. The visible consequence
     * is that an over-ceiling file now makes stop() return Failure("read_failed")
     * instead of inflating it onto the bridge -- intended, since [MAX_RECORDING_BYTES]
     * sits above anything this recorder can legitimately produce.
     */
    private fun encodeFileToBase64(f: File): String? = try {
        val len = f.length()
        if (len > MAX_RECORDING_BYTES) {
            Timber.w(
                "refusing to encode %s: %d bytes is over the %d ceiling",
                f.name, len, MAX_RECORDING_BYTES
            )
            null
        } else if (len == 0L) {
            // journal-3 2b. A file that exists and holds nothing encodes to "", which
            // is falsy in JS and lands in the caller's `if (!recovered)` branch beside
            // a refusal -- so the reader is told "Could not read the recording from the
            // device" about a file that was read perfectly and had nothing in it.
            // Those are different things to tell someone about their own voice memo.
            //
            // Same family as the atob(null) case already guarded in
            // JournalRecordingSheet: "null" is valid base64, three bytes
            // [158,233,101], which would commit as a memo that plays as silence. A
            // value that decodes into something plausible is worse than a refusal, and
            // "" decoding to a zero-size Blob is the quieter version of it.
            //
            // HERE rather than in readRecording, because stop()'s fallback branch
            // shares this function and has the same defect: a zero-byte temp file
            // would be delivered to __onNativeRecordingComplete as an empty base64
            // string instead of a Failure. One guard covers both callers.
            //
            // The 0/empty distinction survives into the listing: nativeListRecordings
            // reports the file with "size": 0 while the reader refuses it, which is
            // what lets JS say "that memo is empty" instead of retrying a name
            // forever against a reader that will never hand back bytes.
            Timber.i("served recording %s exists but holds no bytes", f.name)
            null
        } else {
            Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
        }
    } catch (e: Exception) {
        Timber.w(e, "base64 encode failed for %s", f.name)
        null
    }

    /** Abort recording and delete the temp file. No JS callback. */
    fun cancel() {
        synchronized(lock) {
            val mr = recorder
            val f = recordFile
            recorder = null
            recordFile = null
            recorderFailed = false
            autoStopped = false
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

    /** cacheDir/recordings — the WebViewAssetLoader-served dir for finished memos
     *  (MainActivity registers a /recordings/ PathHandler over it). Files here are
     *  transient + OS-evictable; the durable copy lives in the JS IndexedDB media
     *  store once JS fetches the URL. */
    private fun recordingsDir(): File = File(context.cacheDir, RECORDINGS_DIR).apply { mkdirs() }

    /** Delete served recordings older than [RECORDING_TTL_MS] — orphans left when
     *  the app died before JS fetched them (the happy path fetches within a second
     *  of stop()).
     *
     *  AGE ALONE IS NOT ENOUGH, and the KDoc here used to say it was: a memo whose
     *  fetch fails is retried past the cutoff while JS still needs it. [servedNames]
     *  is the second condition -- anything this process handed out and JS has not
     *  released is spared, until the claim itself ages out at [CLAIM_TTL_MS].
     *  Expired claims are dropped here rather than anywhere else, so the map is
     *  bounded by the same pass that bounds the directory. Best-effort; never throws. */
    private fun sweepStaleRecordings() {
        try {
            // Two clocks, deliberately: file age is a filesystem mtime and must be
            // compared to wall time; a claim's age is an interval inside this process
            // and must not be able to shrink when the wall clock steps backwards.
            val cutoff = System.currentTimeMillis() - RECORDING_TTL_MS
            val claimCutoff = SystemClock.elapsedRealtime() - CLAIM_TTL_MS
            servedNames.entries.removeIf { it.value < claimCutoff }
            recordingsDir().listFiles()?.forEach { file ->
                if (file.isFile && !servedNames.containsKey(file.name) && file.lastModified() < cutoff) {
                    try { file.delete() } catch (_: Exception) {}
                }
            }
        } catch (_: Exception) { /* best-effort */ }
    }

    /** base64 is set only on the fallback (file-move failed); fileName is the
     *  served recordings/ file name on the happy fetch-bridge path. Exactly one of
     *  the two is non-null on success. */
    data class RecordingResult(val base64: String?, val durationMs: Long, val fileName: String? = null)

    sealed interface Result<out T> {
        data class Success<T>(val value: T) : Result<T>
        data class Failure(val reason: String) : Result<Nothing>
    }

    companion object {
        const val RECORDINGS_DIR = "recordings"

        /**
         * How long an orphaned served memo stays on disk before the sweep may take it.
         *
         * WAS 60 SECONDS, AND THAT NUMBER QUIETLY DEFEATED THE RECOVERY IT WAS MEANT TO
         * ALLOW. The sweep runs inside [start], so at 60 s the real window was not a
         * duration at all -- it was "until the reader records again". And the reader
         * most likely to be holding an orphan is the one whose session was killed, whose
         * first move on relaunch is often to record the thing again: the sweep ate the
         * memo at exactly the moment they were about to be offered it. A recovery
         * feature that only works for someone who launches, notices, and does NOT touch
         * record is a feature for nobody. (Web Builder, journal-3 2b.)
         *
         * SEVEN DAYS IS ONLY SAFE WITH A COLLECTOR, AND THE COLLECTOR ALREADY SHIPS.
         * [deleteRecording]'s caller landed in `90857ce7` at
         * `JournalRecordingSheet.jsx:269`, on the COMMIT path -- the bytes are in
         * JournalMediaStore, so release the file. Without it a week-long TTL would mean
         * every served `.m4a` sitting in cacheDir for a week after a fetch that
         * succeeded in the first second (~3.6 MB per five-minute memo); with it, the
         * normal case costs nothing and this ceiling is left for what it was always
         * for -- the memos of a session that died.
         *
         * I ARGUED FOR THIS MOVE ON THE GROUNDS THAT THE COLLECTOR WAS ARRIVING IN THE
         * SAME BATCH. It had already been shipping. The conclusion was right and the
         * premise was stale, which is the more dangerous of the two ways to be wrong:
         * grep main for the caller before reasoning about whether one exists.
         *
         * The two ceilings are ordered on purpose. [CLAIM_TTL_MS] (24 h) expires well
         * inside this, so an abandoned claim can never pin a file past its own TTL.
         */
        const val RECORDING_TTL_MS = 7L * 24L * 60L * 60L * 1000L

        /** How long a name handed to JS keeps its file out of the sweep. A ceiling,
         *  not a deadline: everything a fetch or a recovery read could plausibly want
         *  happens in the first seconds, and this only decides when an abandoned claim
         *  stops costing cacheDir.
         *
         *  A BACKSTOP, NOT THE MECHANISM -- and it has not been the mechanism since
         *  `90857ce7`. The JS side releases by handshake as soon as the bytes are in
         *  JournalMediaStore, so this only catches claims that never get released: a
         *  session that died between the read and the put. Deliberately shorter than
         *  [RECORDING_TTL_MS] so a stale claim cannot outlive the file it protects. */
        const val CLAIM_TTL_MS = 24L * 60L * 60L * 1000L

        /** Native recording-length backstop, 30 s above JournalRecordingSheet's
         *  300 s JS cap so JS owns the normal stop and this only fires when that
         *  timer is throttled or stalled. */
        const val MAX_DURATION_MS = 330_000

        /** The bit rate handed to MediaRecorder. Named rather than inline because
         *  [MAX_RECORDING_BYTES] is derived from it -- raising one must carry the
         *  other along. */
        const val AUDIO_BIT_RATE = 96_000

        /**
         * Ceiling on a whole-file base64 read, DERIVED rather than picked: the longest
         * recording this class can produce under its own [MAX_DURATION_MS] backstop at
         * [AUDIO_BIT_RATE], plus 50 % for MPEG-4 container overhead. ~5.94 MB.
         *
         * So it is not a limit on normal use -- a file above it did not come from this
         * recorder under this config. Encoding an arbitrary-sized file into a string
         * for evaluateJavascript to parse is how a foreign or pathological file left in
         * recordings/ would take the heap with it.
         */
        val MAX_RECORDING_BYTES: Long =
            MAX_DURATION_MS / 1000L * (AUDIO_BIT_RATE / 8) * 3 / 2

        /** [listRecordings] could not look, as distinct from looking and finding
         *  nothing ("[]"). A String rather than null so the never-null rule on this
         *  verb holds, and one that fails JSON.parse-is-an-array on the JS side rather
         *  than parsing into an empty list. Pinned by name in NativeAudioRecorderTest
         *  against the literal, so renaming it here reddens rather than passing. */
        const val LIST_FAILED = "error:list_failed"

        /** Exactly the name shape [stop] writes: UUID.randomUUID().toString() + ".m4a". */
        private val SERVED_NAME = Regex("^[0-9a-f-]{36}\\.m4a$")

        /** How much of a refused name is safe to log. A legal name is 40 characters;
         *  a refused one came from JS and has no length at all. */
        private const val LOGGED_NAME_CHARS = 64
    }
}
