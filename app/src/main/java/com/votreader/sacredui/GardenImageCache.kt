package com.votreader.sacredui

import android.webkit.WebResourceResponse
import timber.log.Timber
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * On-disk cache for "A Return to the Garden" page images, sitting in the
 * WebView's shouldInterceptRequest path.
 *
 * Why this exists:
 *   Garden images are hosted on GitHub Releases. A request to
 *   github.com/.../releases/download/garden-<tier>/garden_NNN.jpg returns a
 *   302 redirect (Cache-Control: no-cache) to a signed
 *   release-assets.githubusercontent.com URL. Because the redirect itself is
 *   no-cache, the WebView's HTTP cache never reuses it — so EVERY page turn
 *   re-did the github.com hop AND re-downloaded the full image. On a phone
 *   that's a visible lag per navigation (desktop hides it behind a fast pipe
 *   + a large in-memory image cache). This cache serves a stored copy
 *   instantly on the 2nd+ view and removes the redirect round-trip.
 *
 * Page-keyed, NOT tier-keyed (the user's explicit "no 5 copies" rule):
 *   The cache filename is derived from the PAGE NUMBER only (garden_042),
 *   with the tier stripped. So re-reading the book at a different quality
 *   OVERWRITES the same page's stored image rather than accumulating one
 *   copy per tier. The store is therefore bounded to <= GARDEN_TOTAL (209)
 *   files, whatever mix of tiers the user has browsed. A small total-byte
 *   cap is also enforced as a backstop (the Ultra tier's pages are large).
 *
 * Storage location: cacheDir/garden/. cacheDir is app-private and OS-
 * evictable under storage pressure, which is exactly right for regenerable
 * data — it is NOT user data, never part of the export, and re-downloads on
 * demand if the OS reclaims it.
 *
 * Threading: shouldInterceptRequest is called on a WebView background
 * thread (never the UI thread), so the synchronous fetch-on-miss here is
 * safe and correct — it's the same thread WebView would have blocked on to
 * fetch the image itself. A per-page lock prevents two in-flight requests
 * for the same page from both downloading. All failures degrade to null
 * (WebView then loads the image itself, exactly as before this cache) so a
 * cache bug can never PREVENT an image from loading.
 */
class GardenImageCache(cacheRoot: File) {

    private val dir = File(cacheRoot, "garden").apply { mkdirs() }

    // Per-page locks so concurrent requests for the same page don't both
    // fetch. Keyed by page number string ("042"). Cheap; at most 209 keys.
    private val locks = ConcurrentHashMap<String, Any>()

    /**
     * If [url] is a Garden page image, return a cached/just-fetched
     * response; otherwise null (the caller falls through to the WebView's
     * normal load). Never throws — any failure returns null.
     */
    fun intercept(url: String): WebResourceResponse? {
        val name = cacheNameFor(url) ?: return null
        return try {
            val file = File(dir, name)
            val lock = locks.getOrPut(name) { Any() }
            synchronized(lock) {
                if (file.exists() && file.length() > 0L) {
                    return response(file.readBytes())
                }
                val bytes = download(url) ?: return null
                // Write to a temp file then atomic-rename so a crash mid-write
                // never leaves a truncated image that would later be served as
                // "cached". The page-keyed name means a new tier overwrites.
                val tmp = File(dir, "$name.tmp")
                tmp.writeBytes(bytes)
                if (!tmp.renameTo(file)) { tmp.delete(); return response(bytes) }
                enforceCapAsync()
                return response(bytes)
            }
        } catch (e: Exception) {
            Timber.tag("GardenCache").w(e, "intercept failed for %s", url)
            null
        }
    }

    /** The cache filename for a Garden URL ("garden_042.jpg"), or null if the
     *  URL is not a Garden page image. Internally page-keyed (tier stripped),
     *  so the SAME page at any tier maps to the SAME file. Visible for test. */
    internal fun cacheNameFor(url: String): String? {
        val page = pageOf(url) ?: return null
        return "garden_$page.jpg"
    }

    /** Extract the zero-padded page token from a Garden image URL, or null. */
    private fun pageOf(url: String): String? {
        // Match the github.com release URL AND the redirected
        // release-assets URL (the filename appears in the
        // response-content-disposition / rscd query on the latter).
        val m = GARDEN_RE.find(url) ?: return null
        return m.groupValues[1]
    }

    /** Fetch [url], following the GitHub redirect. Returns bytes or null. */
    private fun download(url: String): ByteArray? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true   // follow the 302 to release-assets
                connectTimeout = 15_000
                readTimeout = 20_000
                requestMethod = "GET"
            }
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) {
                Timber.tag("GardenCache").w("download HTTP %d for %s", code, url)
                return null
            }
            val bytes = conn.inputStream.use { it.readBytes() }
            if (bytes.isEmpty()) null else bytes
        } catch (e: Exception) {
            Timber.tag("GardenCache").w(e, "download failed for %s", url)
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    private fun response(bytes: ByteArray): WebResourceResponse {
        val headers = mapOf(
            // Let the WebView keep its own in-memory copy across the session
            // too, so even the 1st repaint of an already-seen page is instant.
            "Cache-Control" to "max-age=31536000",
            "Access-Control-Allow-Origin" to "*"
        )
        return WebResourceResponse("image/jpeg", null, 200, "OK", headers, ByteArrayInputStream(bytes))
    }

    /**
     * Backstop byte-cap. The page-key already bounds the COUNT to <=209
     * (one file per page, any tier overwrites), so this only matters for
     * total bytes. It must sit ABOVE a full read of the LARGEST tier so a
     * normal cover-to-cover read never evicts mid-browse (eviction during
     * an active read would re-download the page the user just left — the
     * exact lag this cache exists to remove). Measured on-device: Ultra
     * pages avg ~3.5 MB (max ~8.3 MB) → a full 209-page Ultra read is
     * ~720 MB, matching the tier's advertised ~680 MB. MAX_BYTES is set
     * above that with margin, so the cap is a true safety backstop (only
     * trips if page-keying ever regressed, or a future tier grows past
     * Ultra) rather than something that fires in normal use. Best-effort,
     * off the request path (fire-and-forget on a daemon thread).
     */
    private fun enforceCapAsync() {
        Thread {
            try {
                val files = dir.listFiles { f -> f.isFile && f.name.endsWith(".jpg") } ?: return@Thread
                var total = 0L
                for (f in files) total += f.length()
                if (total <= MAX_BYTES) return@Thread
                // Evict least-recently-modified first until under cap.
                val byAge = files.sortedBy { it.lastModified() }
                var i = 0
                while (total > MAX_BYTES && i < byAge.size) {
                    val f = byAge[i]; val len = f.length()
                    if (f.delete()) { total -= len; locks.remove(f.name) }
                    i++
                }
            } catch (e: Exception) {
                Timber.tag("GardenCache").w(e, "cap enforcement failed")
            }
        }.apply { isDaemon = true; name = "garden-cache-cap" }.start()
    }

    /** Delete every cached Garden image (Settings → Clear, or tier wipe). */
    fun clear() {
        try {
            dir.listFiles()?.forEach { it.delete() }
            locks.clear()
        } catch (e: Exception) {
            Timber.tag("GardenCache").w(e, "clear failed")
        }
    }

    /** Total bytes currently cached (for diagnostics / a future size row). */
    fun sizeBytes(): Long {
        return try {
            (dir.listFiles() ?: emptyArray()).sumOf { if (it.isFile) it.length() else 0L }
        } catch (_: Exception) { 0L }
    }

    companion object {
        // garden_NNN.jpg — captures the zero-padded page number from either
        // the github.com release path or the redirected asset URL's
        // filename query. Case-insensitive on the extension for safety.
        private val GARDEN_RE = Regex("""garden_(\d{1,4})\.jpg""", RegexOption.IGNORE_CASE)

        // 800 MB — above a full 209-page Ultra read (~720 MB measured on
        // device; ~680 MB advertised) with margin for the 8 MB outlier
        // pages. Every tier's complete book fits without mid-read eviction;
        // the cap only guards against a page-keying regression or a future
        // tier larger than Ultra. cacheDir is OS-evictable under storage
        // pressure regardless, so this is a soft ceiling on a soft store.
        private const val MAX_BYTES = 800L * 1024 * 1024
    }
}
