package com.votreader.sacredui

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import timber.log.Timber

/**
 * File I/O surface area for the JS layer: read a picked URI into base64
 * for the import flow, write Export JSON into Downloads, query URI sizes
 * before allocating to avoid OOM. Centralized so the size-cap policy
 * (MAX_IMPORT_SIZE) lives in one place rather than scattered between
 * the picker callback and saveToDownloads.
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
     * Write [content] (UTF-8) to the system Downloads collection as
     * [filename]. Requires Android 10+ (the MediaStore Downloads
     * collection didn't exist before then); older devices return
     * Failure("requires_android_10").
     */
    fun writeJsonToDownloads(filename: String, content: String): Result<Unit> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return Result.Failure("requires_android_10")
        }
        return try {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, filename)
                put(MediaStore.Downloads.MIME_TYPE, "application/json")
            }
            val uri = context.contentResolver.insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
            ) ?: return Result.Failure("no_uri")
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(content.toByteArray(Charsets.UTF_8))
            } ?: return Result.Failure("no_output_stream")
            Result.Success(Unit)
        } catch (e: Exception) {
            Timber.w(e, "saveToDownloads failed")
            Result.Failure(e.message ?: "write_failed")
        }
    }

    /**
     * Ask [uri]'s content provider how big the resource is, in bytes.
     * Returns -1L if OpenableColumns.SIZE is absent / null (some pickers
     * skip it). Public so callers can use the value directly when they
     * want their own rejection policy rather than the canned [readUriAsBase64].
     */
    fun queryFileSize(uri: Uri): Long {
        context.contentResolver.query(
            uri, arrayOf(OpenableColumns.SIZE), null, null, null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (idx != -1 && !cursor.isNull(idx)) return cursor.getLong(idx)
            }
        }
        return -1L
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
