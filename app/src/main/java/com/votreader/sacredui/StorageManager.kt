package com.votreader.sacredui

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.util.Base64
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.InputStream
import timber.log.Timber

/**
 * File I/O surface area for the JS layer: read a picked URI into base64
 * for the import flow, write Export JSON to a user-chosen URI (from the
 * SAF create-document picker), query URI sizes before allocating to avoid
 * OOM. Centralized so the size-cap policy (MAX_IMPORT_SIZE) lives in one
 * place rather than scattered between the picker callback and the writer.
 *
 * All operations return [Result] -- a sealed interface with Success / Failure.
 * Distinct from kotlin.Result so a Failure can carry a plain string
 * reason that matches what JS expects in the "error:<reason>" string.
 */
class StorageManager(private val context: Context) {

    /**
     * Read [uri] into memory and return its content as a base64 string.
     * Rejects files larger than [maxBytes] (defaults to MAX_IMPORT_SIZE)
     * and any URI whose provider does not expose a size -- the Export
     * format is one we own end-to-end, so an unknown size is suspicious
     * enough to refuse rather than read blindly.
     */
    fun readUriAsBase64(
        uri: Uri,
        maxBytes: Long = MAX_IMPORT_SIZE
    ): Result<String> {
        val size = queryFileSize(uri)
        if (size < 0L) {
            Timber.w("Import rejected: unknown file size for %s", uri)
            return Result.Failure("unknown_size")
        }
        if (size > maxBytes) {
            Timber.w("Import rejected: size=%d (limit=%d)", size, maxBytes)
            return Result.Failure("too_large")
        }
        return try {
            val bytes = context.contentResolver.openInputStream(uri)
                ?.use { it.readBytes() }
                ?: ByteArray(0)
            Result.Success(Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (e: Exception) {
            Timber.w(e, "Import file read failed")
            Result.Failure(e.message ?: "read_failed")
        }
    }

    /**
     * Write [content] (UTF-8) to an already-chosen SAF document [uri]
     * (the result of ACTION_CREATE_DOCUMENT, where the user picked the
     * destination folder + filename). Unlike the old Downloads-collection
     * writer this works on every supported API level — SAF is API 19+,
     * so this is the path that makes Export reachable on Android 8/9
     * (minSdk here is 26), where the MediaStore.Downloads collection
     * doesn't exist and the previous writer hard-failed. The picker also
     * needs no storage permission, so nothing is added to the manifest.
     */
    fun writeTextToUri(uri: Uri, content: String): Result<Unit> {
        return try {
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(content.toByteArray(Charsets.UTF_8))
            } ?: return Result.Failure("no_output_stream")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.w(e, "writeTextToUri failed")
            Result.Failure(e.message ?: "write_failed")
        }
    }

    /**
     * Ask [uri]'s content provider how big the resource is, in bytes.
     * Returns -1L if OpenableColumns.SIZE is absent / null (some pickers
     * skip it), OR if the query itself throws -- a revoked URI
     * permission yields SecurityException, a closed provider yields
     * IllegalStateException, etc. Caller treats -1L as "suspicious,
     * reject"; folding the exception path into the same branch keeps
     * the JS-facing contract uniform (one Failure mode for "could not
     * determine size") and prevents the exception from escaping the
     * filePickerLauncher callback and crashing the app.
     */
    fun queryFileSize(uri: Uri): Long {
        return try {
            context.contentResolver.query(
                uri, arrayOf(OpenableColumns.SIZE), null, null, null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (idx != -1 && !cursor.isNull(idx)) return cursor.getLong(idx)
                }
            }
            -1L
        } catch (e: Exception) {
            Timber.w(e, "queryFileSize failed for %s", uri)
            -1L
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  v3 STREAMING CONTAINER (BACKUP-STREAMING-PLAN P3) — native framing
    // ═══════════════════════════════════════════════════════════════════
    //  Native mirror of src/utils/backup-container.js. The binary framing
    //  lives HERE (not in JS) because the Android WebView-69 floor lacks
    //  Blob.arrayBuffer()/.stream() (Chromium-76 APIs), so the JS codec can't
    //  run on Android; native owns the framing and the JS side only feeds
    //  (export) / consumes (import) base64 chunks across the string bridge.
    //
    //  ON-DISK LAYOUT (all integers big-endian — identical to the web codec's
    //  encodeUint64BE; DataOutputStream.writeLong / readLong ARE big-endian):
    //    [8]            magic = "VOTBACK1"
    //    [8]            manifest length (uint64 BE)
    //    [manifestLen]  manifest UTF-8 JSON
    //    per media frame, IN manifest.media ORDER:
    //      [8]          blob length (uint64 BE)
    //      [blobLen]    blob raw bytes
    //
    //  Streaming guarantee: only ONE chunk (<=ANDROID_CHUNK on the JS side)
    //  is ever in memory, so this scales to whatever the device can store —
    //  no whole-payload copy, no base64 inflation on disk (base64 is only the
    //  transient bridge encoding, never written to the file).
    //
    //  Threading: every @JavascriptInterface call lands on a binder thread and
    //  the JS caller blocks on the return, so calls are serialized — but they
    //  may land on different binder threads, so each session method takes
    //  [v3Lock] for cross-thread visibility of the stream + frame counters.
    //  The picker callbacks (UI thread) only stash the chosen Uri; the stream
    //  is opened + driven entirely from these binder-thread methods.

    private val v3Lock = Any()

    // ── export session ──
    private var exportOut: DataOutputStream? = null
    // Bytes still expected in the current blob frame (0 = no frame in flight /
    // frame complete). Cross-checked so a short/over write fails loudly rather
    // than producing a silently-corrupt only-backup.
    private var exportFrameRemaining: Long = 0L

    // ── import session ──
    private var importIn: DataInputStream? = null
    // Bytes still unread in the current frame; -1 = no frame advanced yet.
    private var importFrameRemaining: Long = -1L

    /**
     * Open [uri] for writing and emit the container header: magic + the
     * manifest frame ([manifestBytes] is the UTF-8 JSON the JS side built via
     * buildV3Manifest). Holds the stream open for the per-blob frames that
     * follow. Any prior session is force-closed first (defensive).
     */
    fun beginV3Export(uri: Uri, manifestBytes: ByteArray): Result<Unit> = synchronized(v3Lock) {
        closeExportQuietly()
        return try {
            val raw = context.contentResolver.openOutputStream(uri)
                ?: return Result.Failure("no_output_stream")
            val out = DataOutputStream(BufferedOutputStream(raw))
            out.write(CONTAINER_MAGIC)
            out.writeLong(manifestBytes.size.toLong())
            out.write(manifestBytes)
            exportOut = out
            exportFrameRemaining = 0L
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.w(e, "beginV3Export failed")
            closeExportQuietly()
            Result.Failure(e.message ?: "begin_failed")
        }
    }

    /**
     * Write the next media frame's 8-byte big-endian length. The prior frame
     * MUST be fully written (exportFrameRemaining == 0) — otherwise the file
     * would be misframed. [size] is the blob's exact byte length.
     */
    fun v3ExportWriteBlobHeader(size: Long): Result<Unit> = synchronized(v3Lock) {
        val out = exportOut ?: return Result.Failure("no_session")
        if (exportFrameRemaining != 0L) return Result.Failure("frame_incomplete")
        if (size < 0L) return Result.Failure("bad_size")
        return try {
            out.writeLong(size)
            exportFrameRemaining = size
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.w(e, "v3ExportWriteBlobHeader failed")
            Result.Failure(e.message ?: "write_failed")
        }
    }

    /**
     * Append [bytes] (one decoded chunk of the current blob's raw data) to the
     * open stream. Refuses to write past the declared frame length (a guard
     * against a JS-side accounting bug corrupting the frame boundaries).
     */
    fun v3ExportWriteChunk(bytes: ByteArray): Result<Unit> = synchronized(v3Lock) {
        val out = exportOut ?: return Result.Failure("no_session")
        if (bytes.size > exportFrameRemaining) return Result.Failure("frame_overflow")
        return try {
            out.write(bytes)
            exportFrameRemaining -= bytes.size
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.w(e, "v3ExportWriteChunk failed")
            Result.Failure(e.message ?: "write_failed")
        }
    }

    /**
     * Finish the export. [commit] true → flush + close (the happy path; fails
     * if the last frame was left short). [commit] false → close + best-effort
     * delete the partial document at [uri] so a truncated, misleading-looking
     * backup is never left behind (the only-backup must fail clean).
     */
    fun finishV3Export(commit: Boolean, uri: Uri?): Result<Unit> = synchronized(v3Lock) {
        val out = exportOut ?: return Result.Failure("no_session")
        exportOut = null
        val incomplete = exportFrameRemaining != 0L
        exportFrameRemaining = 0L
        return try {
            if (commit) {
                if (incomplete) {
                    try { out.close() } catch (_: Exception) { /* already failing */ }
                    uri?.let { deleteDocumentQuietly(it) }
                    return Result.Failure("frame_incomplete")
                }
                out.flush()
                out.close()
                Result.Success(Unit)
            } else {
                try { out.close() } catch (_: Exception) { /* aborting — best-effort */ }
                uri?.let { deleteDocumentQuietly(it) }
                Result.Success(Unit)
            }
        } catch (e: Exception) {
            Timber.w(e, "finishV3Export failed")
            Result.Failure(e.message ?: "finish_failed")
        }
    }

    /**
     * Open [uri] for reading and sniff the format by its first bytes:
     *   • "VOTBACK1" magic → a v3 container. Reads the manifest frame and
     *     returns "v3:" + the manifest JSON; the stream stays open, positioned
     *     at the first media frame, for v3ImportNextBlob / v3ImportReadChunk.
     *   • anything else → a legacy v1/v2 JSON backup (starts with '{'). Reads
     *     the whole file (bounded by MAX_IMPORT_SIZE — legacy backups are
     *     small) and returns "legacy:" + the JSON text; no streaming session.
     * The "v3:" / "legacy:" prefix is unambiguous: a JSON payload starts with
     * '{', never with those ASCII tags.
     */
    fun beginV3Import(uri: Uri): Result<String> = synchronized(v3Lock) {
        closeImportQuietly()
        return try {
            val raw = context.contentResolver.openInputStream(uri)
                ?: return Result.Failure("no_input_stream")
            val bis = BufferedInputStream(raw)
            bis.mark(CONTAINER_MAGIC.size + 8)
            val head = ByteArray(CONTAINER_MAGIC.size)
            val n = readUpTo(bis, head)
            if (n == CONTAINER_MAGIC.size && head.contentEquals(CONTAINER_MAGIC)) {
                // v3 — stream is now positioned right after the magic.
                val dis = DataInputStream(bis)
                val manifestLen = dis.readLong()
                if (manifestLen < 0L || manifestLen > MAX_V3_MANIFEST_SIZE) {
                    try { dis.close() } catch (_: Exception) {}
                    return Result.Failure("bad_manifest_len")
                }
                // Guard the allocation itself: OutOfMemoryError is an Error, not an
                // Exception, so the function's outer try/catch would NOT catch it —
                // a length under the cap but past this device's heap would crash.
                // Fail it gracefully instead (the user's existing data is untouched;
                // a corrupt backup just declines to import rather than killing the app).
                val manifestBytes = try {
                    ByteArray(manifestLen.toInt())
                } catch (_: OutOfMemoryError) {
                    try { dis.close() } catch (_: Exception) {}
                    return Result.Failure("manifest_too_large")
                }
                dis.readFully(manifestBytes)
                importIn = dis
                importFrameRemaining = -1L
                Result.Success("v3:" + String(manifestBytes, Charsets.UTF_8))
            } else {
                // legacy JSON — rewind and read the whole (bounded) file.
                bis.reset()
                val bytes = readBounded(bis, MAX_IMPORT_SIZE)
                try { bis.close() } catch (_: Exception) {}
                if (bytes == null) return Result.Failure("too_large")
                Result.Success("legacy:" + String(bytes, Charsets.UTF_8))
            }
        } catch (e: Exception) {
            Timber.w(e, "beginV3Import failed")
            closeImportQuietly()
            Result.Failure(e.message ?: "begin_failed")
        }
    }

    /**
     * Advance to the next media frame: read its 8-byte big-endian length and
     * arm the per-frame byte counter. Returns the frame's declared size so the
     * JS side can cross-check it against manifest.media[i].size (corruption
     * detection, mirroring the web readContainer's size check). The previous
     * frame MUST be fully consumed first.
     */
    fun v3ImportNextBlob(): Result<Long> = synchronized(v3Lock) {
        val dis = importIn ?: return Result.Failure("no_session")
        if (importFrameRemaining > 0L) return Result.Failure("frame_incomplete")
        return try {
            val len = dis.readLong()
            if (len < 0L) return Result.Failure("bad_frame_len")
            importFrameRemaining = len
            Result.Success(len)
        } catch (e: Exception) {
            Timber.w(e, "v3ImportNextBlob failed")
            Result.Failure(e.message ?: "read_failed")
        }
    }

    /**
     * Read up to [maxBytes] of the current frame's raw data. Returns an empty
     * array when the current frame is fully consumed (the caller stops and
     * advances). A premature EOF (stream ends before the frame's declared
     * length is reached) is a truncated/corrupt backup and fails loudly.
     */
    fun v3ImportReadChunk(maxBytes: Int): Result<ByteArray> = synchronized(v3Lock) {
        val dis = importIn ?: return Result.Failure("no_session")
        if (importFrameRemaining <= 0L) return Result.Success(ByteArray(0))
        val want = minOf(maxBytes.toLong(), importFrameRemaining).toInt()
        if (want <= 0) return Result.Success(ByteArray(0))
        return try {
            val buf = ByteArray(want)
            var read = 0
            while (read < want) {
                val r = dis.read(buf, read, want - read)
                if (r < 0) return Result.Failure("truncated") // EOF mid-frame
                read += r
            }
            importFrameRemaining -= read
            Result.Success(buf)
        } catch (e: Exception) {
            Timber.w(e, "v3ImportReadChunk failed")
            Result.Failure(e.message ?: "read_failed")
        }
    }

    /** Close the import stream (success, cancel, or error cleanup). Idempotent. */
    fun closeV3Import(): Result<Unit> = synchronized(v3Lock) {
        closeImportQuietly()
        return Result.Success(Unit)
    }

    /** Release any open v3 export/import streams on lifecycle teardown (Activity
     *  finish / ViewModel clear) WITHOUT deleting — a partial export left by an
     *  interrupted session fails the import integrity checks, so the file is
     *  safe to leave; this only frees the file handles. Idempotent. */
    fun releaseV3Sessions() = synchronized(v3Lock) {
        closeExportQuietly()
        closeImportQuietly()
    }

    private fun closeExportQuietly() {
        try { exportOut?.close() } catch (_: Exception) { /* best-effort */ }
        exportOut = null
        exportFrameRemaining = 0L
    }

    private fun closeImportQuietly() {
        try { importIn?.close() } catch (_: Exception) { /* best-effort */ }
        importIn = null
        importFrameRemaining = -1L
    }

    /** Best-effort delete of a SAF document we created (used on a failed/aborted export). */
    private fun deleteDocumentQuietly(uri: Uri) {
        try { DocumentsContract.deleteDocument(context.contentResolver, uri) }
        catch (e: Exception) { Timber.w(e, "deleteDocument (abort cleanup) failed for %s", uri) }
    }

    /** Read up to [buf].size bytes, returning the count actually read (handles a
     *  short read that isn't EOF). Used to peek the magic without over-reading. */
    private fun readUpTo(input: InputStream, buf: ByteArray): Int {
        var read = 0
        while (read < buf.size) {
            val r = input.read(buf, read, buf.size - read)
            if (r < 0) break
            read += r
        }
        return read
    }

    /** Read the whole stream into memory, or null if it exceeds [max] bytes
     *  (the legacy-backup safety cap — v3 streaming has no such cap). */
    private fun readBounded(input: InputStream, max: Long): ByteArray? {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
            val r = input.read(buf)
            if (r < 0) break
            total += r
            if (total > max) return null
            out.write(buf, 0, r)
        }
        return out.toByteArray()
    }

    companion object {
        // Cap on the import readBytes() allocation -- a heavy user export
        // (10k highlights + a year of voice memos) tops out around
        // 20-30 MB; 50 MB is ~2x headroom. The picker MIME hint is
        // "application/json" but Android does not enforce it, so the cap
        // stops an accidental or hostile GB-scale pick from OOM-ing the
        // app even before we get to readBytes.
        // CROSS-LANGUAGE PAIR: the web import path enforces the same 50 MB in
        // platform-bridge.js (WEB_MAX_IMPORT_BYTES). Keep the two values in sync.
        // (v3 STREAMING import is NOT bounded by this — see beginV3Import; the
        // cap only guards the legacy whole-file JSON read.)
        const val MAX_IMPORT_SIZE = 50L * 1024 * 1024

        // v3 container magic: ASCII "VOTBACK1". Byte-identical to the web codec's
        // CONTAINER_MAGIC (backup-container.js) so a backup written on either
        // platform imports on the other. A legacy v1/v2 backup is JSON starting
        // with '{' (0x7B); a v3 container starts with 'V' (0x56) — the sniff in
        // beginV3Import distinguishes them.
        val CONTAINER_MAGIC: ByteArray = "VOTBACK1".toByteArray(Charsets.US_ASCII)

        // Corruption guard on the v3 manifest-frame allocation: a manifest holds
        // the structured stores (JSON, bounded to single-digit MBs even after
        // years of text) + per-blob METADATA only, never the blob bytes. A length
        // far past that is a corrupt/garbage header, not a real backup — refuse
        // rather than attempt the alloc.
        //
        // The value must sit BELOW the device heap ceiling, not just be "large":
        // the old 256 MB cap was higher than the default heap on many devices
        // (64-256 MB, largeHeap off), so a garbage header declaring e.g. 250 MB
        // PASSED this guard and then OOM-crashed on the ByteArray below — the
        // guard undershot its own purpose. 128 MB is still ~10x any real manifest
        // (a decades-prolific journaler is well under that) yet rejects an obvious
        // garbage length before a single byte is allocated. The allocation itself
        // is ALSO wrapped in an OutOfMemoryError catch (see beginV3Import) so an
        // under-cap-but-still-too-big length on a small-heap device fails as a
        // graceful Result.Failure instead of crashing — belt and suspenders, since
        // the outer try/catch(Exception) does NOT catch OOM (an Error, not an
        // Exception).
        const val MAX_V3_MANIFEST_SIZE = 128L * 1024 * 1024
    }

    sealed interface Result<out T> {
        data class Success<T>(val value: T) : Result<T>
        data class Failure(val reason: String) : Result<Nothing>
    }
}
