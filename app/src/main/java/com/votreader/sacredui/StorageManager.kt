package com.votreader.sacredui

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
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

    companion object {
        // Cap on the import readBytes() allocation -- a heavy user export
        // (10k highlights + a year of voice memos) tops out around
        // 20-30 MB; 50 MB is ~2x headroom. The picker MIME hint is
        // "application/json" but Android does not enforce it, so the cap
        // stops an accidental or hostile GB-scale pick from OOM-ing the
        // app even before we get to readBytes.
        const val MAX_IMPORT_SIZE = 50L * 1024 * 1024
    }

    sealed interface Result<out T> {
        data class Success<T>(val value: T) : Result<T>
        data class Failure(val reason: String) : Result<Nothing>
    }
}
