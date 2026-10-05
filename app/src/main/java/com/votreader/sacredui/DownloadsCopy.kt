package com.votreader.sacredui

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import timber.log.Timber
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The weekly copy of the reader's data in Downloads/VOTReader (datasafe 2026-10-05, dl-weekly).
 *
 * [SnapshotStore] survives a WebView storage wipe but not an uninstall or "Clear storage". This copy is a
 * plain file the reader can see, share and import: it survives an uninstall, and it carries the data
 * across to another build of the app (the future Play build has its own storage). Once a week the page
 * hands it the same JSON a snapshot holds (no photos or recordings: Export carries those), and the newest
 * [KEEP] copies this app wrote are kept; older ones are deleted. Files are
 * `votreader-weekly-yyyy-MM-dd.votbak`; Import reads them like any backup (the native import sniffs JSON).
 *
 * Android 10+ only: before that a Downloads write needs a storage permission the app does not ask for,
 * so [save] says false and the page shows no weekly line. The folder I/O sits behind [Folder] so the
 * name, cap and rotation rules are tested without a MediaStore.
 *
 * Thread-safe (synchronized): bridge calls land on binder threads. Every failure is quiet.
 */
class DownloadsCopy(private val folder: Folder?) {

    /** One copy this app wrote: its id in the folder, display name and when it was written (epoch ms). */
    data class Entry(val id: Long, val name: String, val at: Long)

    /** Where copies live. Lists only copies this app wrote (scoped storage shows an app its own files). */
    interface Folder {
        fun write(name: String, bytes: ByteArray): Boolean
        fun list(): List<Entry>
        fun delete(id: Long): Boolean
    }

    companion object {
        const val KEEP = 4
        const val MAX_BYTES = 24L * 1024 * 1024
        const val RELATIVE_DIR = "Download/VOTReader/"
        private val NAME = Regex("""^votreader-weekly-\d{4}-\d{2}-\d{2}.*\.votbak$""")

        fun fileName(nowMs: Long): String =
            "votreader-weekly-" + SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(nowMs)) + ".votbak"

        fun isCopyName(name: String?): Boolean = name != null && NAME.matches(name)

        /** The copies to delete so the newest [keep] remain. */
        fun toDelete(entries: List<Entry>, keep: Int = KEEP): List<Entry> =
            entries.filter { isCopyName(it.name) }.sortedByDescending { it.at }.drop(keep)

        /** The MediaStore Downloads folder on Android 10+, else null (no weekly copy). */
        fun forDevice(resolver: ContentResolver): DownloadsCopy =
            DownloadsCopy(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStoreFolder(resolver) else null)
    }

    /** False when unsupported here, empty, too big, or the write failed. */
    @Synchronized
    fun save(json: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
        val f = folder ?: return false
        if (json.isNullOrBlank()) return false
        val bytes = json.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_BYTES) return false
        return try {
            if (!f.write(fileName(nowMs), bytes)) return false
            for (e in toDelete(f.list())) f.delete(e.id)
            true
        } catch (e: Exception) {
            Timber.w(e, "weekly copy failed")
            false
        }
    }

    /** `{"supported":bool,"count":n,"newestAt":ms}` for the page (newestAt 0 when there is none). */
    @Synchronized
    fun statusJson(): String {
        val f = folder ?: return """{"supported":false,"count":0,"newestAt":0}"""
        return try {
            val copies = f.list().filter { isCopyName(it.name) }
            val newest = copies.maxOfOrNull { it.at } ?: 0L
            """{"supported":true,"count":${copies.size},"newestAt":$newest}"""
        } catch (e: Exception) {
            """{"supported":true,"count":0,"newestAt":0}"""
        }
    }

    /** Downloads/VOTReader through MediaStore (API 29+): no permission, and the files outlive the app. */
    private class MediaStoreFolder(private val resolver: ContentResolver) : Folder {
        private val collection: Uri =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) MediaStore.Downloads.EXTERNAL_CONTENT_URI
            else MediaStore.Files.getContentUri("external")

        override fun write(name: String, bytes: ByteArray): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream")
                put(MediaStore.MediaColumns.RELATIVE_PATH, RELATIVE_DIR)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(collection, values) ?: return false
            return try {
                val out = resolver.openOutputStream(uri) ?: throw IllegalStateException("no stream")
                out.use { it.write(bytes) }
                resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                true
            } catch (e: Exception) {
                // Never leave a half-written pending file behind.
                try { resolver.delete(uri, null, null) } catch (_: Exception) { }
                Timber.w(e, "weekly copy write failed")
                false
            }
        }

        override fun list(): List<Entry> {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return emptyList()
            val out = mutableListOf<Entry>()
            val cols = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.DATE_ADDED)
            resolver.query(
                collection, cols,
                "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?",
                arrayOf(RELATIVE_DIR, "votreader-weekly-%"), null,
            )?.use { c ->
                while (c.moveToNext()) out.add(Entry(c.getLong(0), c.getString(1) ?: "", c.getLong(2) * 1000L))
            }
            return out
        }

        override fun delete(id: Long): Boolean =
            try { resolver.delete(ContentUris.withAppendedId(collection, id), null, null) > 0 } catch (e: Exception) { false }
    }
}
