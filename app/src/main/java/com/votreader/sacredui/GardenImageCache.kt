package com.votreader.sacredui

import android.webkit.WebResourceResponse
import timber.log.Timber
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

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
 * One file per page, named for its tier (the user's explicit "no 5 copies"
 * rule, and his quality setting honoured):
 *   The cache filename carries the page AND the tier it was fetched at
 *   (garden_042.ultra.jpg), so a page stored at another quality is a miss and
 *   comes back at the quality now chosen (vs6: a page-only name used to serve
 *   the first tier ever viewed, so a quality change did nothing for pages
 *   already seen, and lowering to Mobile kept decoding Ultra-size bitmaps
 *   under Mobile's memory cap). Storing a page deletes its other tiers'
 *   copies, so the store stays bounded to <= GARDEN_TOTAL (209) files,
 *   whatever mix of tiers the user has browsed. A small total-byte cap is
 *   also enforced as a backstop (the Ultra tier's pages are large).
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
class GardenImageCache(
    cacheRoot: File,
    // How a miss reaches disk: (url, dest) -> bytes written, or null. Production streams it from the
    // network (downloadToFile); tests pass a fake so the hit/miss/publish path runs with no network.
    fetcher: ((url: String, dest: File) -> Long?)? = null,
) {

    private val dir = File(cacheRoot, "garden").apply { mkdirs() }

    private val fetch: (String, File) -> Long? = fetcher ?: { url, dest -> downloadToFile(url, dest) }

    // Per-page locks so concurrent requests for the same page don't both
    // fetch. Keyed by page number string ("042"), whatever the tier. Cheap; at most 209 keys.
    private val locks = ConcurrentHashMap<String, Any>()

    // vs6: the temp files downloads are writing right now. Each download gets a name no other shares
    // (tmpSeq) and registers it here BEFORE the file exists, so the cap thread's sweep can tell an orphan
    // (sweep it) from another page's download still in flight (it used to delete those too: the page
    // then failed to store and the WebView fetched it again, uncached).
    private val inFlight = ConcurrentHashMap.newKeySet<String>()
    private val tmpSeq = AtomicLong()

    // U7: single-flight guard so concurrent cache misses don't each spawn a
    // cap-enforcer thread that races the others on the same directory.
    private val capRunning = AtomicBoolean(false)

    /**
     * If [url] is a Garden page image, return a cached/just-fetched
     * response; otherwise null (the caller falls through to the WebView's
     * normal load). Never throws — any failure returns null.
     */
    fun intercept(url: String): WebResourceResponse? = open(url)?.let { response(it) }

    /** The body [intercept] serves for [url]: a stream of the cached file (a hit, or a miss just fetched
     *  and stored), or null to leave the load to the WebView. Never throws. Visible for test. */
    internal fun open(url: String): InputStream? {
        val (page, tier) = keyOf(url) ?: return null
        val name = nameOf(page, tier)
        // U7: only natively fetch from the known Garden asset hosts. The
        // garden_NNN.jpg regex matches the page token ANYWHERE in the URL, so
        // without this an injected <img src="https://evil/garden_001.jpg"> would
        // be fetched with the app's network identity (SSRF-shaped) and returned
        // with Access-Control-Allow-Origin:*. A non-allowlisted host falls
        // through to the WebView's own load, which CSP img-src then governs.
        if (!hostAllowed(url)) {
            Timber.tag("GardenCache").w("blocked non-allowlisted Garden host: %s", url)
            return null
        }
        return try {
            val file = File(dir, name)
            val lock = locks.getOrPut(page) { Any() }
            synchronized(lock) {
                // Cache hit: serve straight from disk via a FileInputStream so a
                // page revisit never pulls the whole (multi-MB) image into heap.
                // POSIX unlink semantics keep an in-flight read valid even if the
                // cap-enforcer evicts this file mid-serve.
                if (file.exists() && file.length() > 0L) {
                    return FileInputStream(file)
                }
                // Cache miss (a copy at another tier is a miss too): stream the download
                // straight to a temp file (constant ~16 KB footprint — never the whole
                // image in heap), then atomic-rename into place, drop the page's other
                // tiers, and serve from the file.
                val tmp = File(dir, "$name.${tmpSeq.incrementAndGet()}.tmp")
                inFlight.add(tmp.name)
                try {
                    val wrote = fetch(url, tmp)
                    if (wrote == null || wrote <= 0L) {
                        try { tmp.delete() } catch (_: Exception) {}
                        return null
                    }
                    return if (tmp.renameTo(file)) {
                        dropOtherTiers(page, keep = name)
                        enforceCapAsync()
                        FileInputStream(file)
                    } else {
                        // Rename failed (rare — same-filesystem cacheDir). Serve the
                        // bytes we already have on disk, then drop the orphan .tmp.
                        // This is the ONLY miss path that reads the image into memory,
                        // and only when publishing to the cache itself failed.
                        val bytes = try { tmp.readBytes() } catch (_: Exception) { null }
                        try { tmp.delete() } catch (_: Exception) {}
                        if (bytes != null && bytes.isNotEmpty()) ByteArrayInputStream(bytes) else null
                    }
                } finally {
                    inFlight.remove(tmp.name)
                }
            }
        } catch (e: Exception) {
            Timber.tag("GardenCache").w(e, "intercept failed for %s", url)
            null
        }
    }

    /** The cache filename for a Garden URL ("garden_042.ultra.jpg"), or null if the
     *  URL is not a Garden page image at a named tier. Visible for test. */
    internal fun cacheNameFor(url: String): String? = keyOf(url)?.let { (page, tier) -> nameOf(page, tier) }

    private fun nameOf(page: String, tier: String) = "garden_$page.$tier.jpg"

    /** Delete [page]'s cached copies other than [keep]: its other tiers, and the untiered
     *  garden_042.jpg an install from before vs6 left. Keeps one file per page. */
    private fun dropOtherTiers(page: String, keep: String) {
        dir.listFiles { f -> f.isFile && f.name != keep && f.name.startsWith("garden_$page.") && f.name.endsWith(".jpg") }
            ?.forEach { it.delete() }
    }

    /** True iff [url]'s host is a known Garden asset host. Visible for test.
     *  U7: gates the native fetch so the garden_NNN.jpg page-token regex can't
     *  be abused to fetch arbitrary hosts with the app's network identity. */
    internal fun hostAllowed(url: String): Boolean = try {
        val parsed = URL(url)
        parsed.protocol.equals("https", ignoreCase = true) &&
            ALLOWED_HOSTS.contains((parsed.host ?: "").lowercase())
    } catch (_: Exception) { false }

    /** The (zero-padded page, tier id) a Garden image URL names, or null. Only the github.com release
     *  URL the app requests names its tier (.../download/garden-ultra/garden_042.jpg); the asset URL it
     *  302s to carries the filename alone, so it is left to the WebView rather than guessed at. */
    private fun keyOf(url: String): Pair<String, String>? {
        val m = GARDEN_RE.find(url) ?: return null
        return m.groupValues[2] to m.groupValues[1].lowercase()
    }

    /**
     * Open [urlStr] and return a connected [HttpURLConnection] positioned at a
     * 200 OK body, following redirects MANUALLY so every hop's host can be
     * re-verified against [ALLOWED_HOSTS] (#2). HttpURLConnection's automatic
     * redirect-following is disabled precisely so a 30x Location can't bounce
     * the app's network identity to an arbitrary host (SSRF-shaped) and have
     * the result served back to the WebView with Access-Control-Allow-Origin:*.
     * The INITIAL host is already gated by intercept()'s hostAllowed check (and
     * by the caller in tests); this re-verifies each REDIRECT TARGET before
     * following it. Returns null on a disallowed hop, a missing/unparseable
     * Location, too many hops, or any non-200 terminal code. The caller reads
     * inputStream then disconnect()s.
     */
    private fun openStream(urlStr: String): HttpURLConnection? {
        var current = urlStr
        var hops = 0
        while (true) {
            val conn = (URL(current).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false   // follow hops by hand + re-verify
                connectTimeout = 15_000
                readTimeout = 20_000
                requestMethod = "GET"
                // Identify ourselves to GitHub's asset hosts rather than sending the
                // default "Java/<ver>" UA — a good-citizen header that eases any
                // server-side rate-limit/throttle handling and traffic auditing.
                setRequestProperty("User-Agent", USER_AGENT)
            }
            val code = conn.responseCode
            if (code in 300..399 && code != HttpURLConnection.HTTP_NOT_MODIFIED) {
                val loc = conn.getHeaderField("Location")
                conn.disconnect()
                if (loc.isNullOrBlank()) {
                    Timber.tag("GardenCache").w("redirect with no Location from %s", current)
                    return null
                }
                if (++hops > MAX_REDIRECTS) {
                    Timber.tag("GardenCache").w("too many redirects starting at %s", urlStr)
                    return null
                }
                // Resolve a possibly-relative Location against the current URL.
                val next = try { URL(URL(current), loc).toString() } catch (_: Exception) {
                    Timber.tag("GardenCache").w("unparseable redirect Location: %s", loc)
                    return null
                }
                // #2: the load-bearing check — refuse a redirect to any host not
                // on the Garden allowlist BEFORE opening a connection to it.
                if (!hostAllowed(next)) {
                    Timber.tag("GardenCache").w("redirect to non-allowlisted host refused: %s", next)
                    return null
                }
                current = next
                continue
            }
            if (code != HttpURLConnection.HTTP_OK) {
                Timber.tag("GardenCache").w("download HTTP %d for %s", code, current)
                conn.disconnect()
                return null
            }
            return conn
        }
    }

    /** Stream [url] to [dest] in constant memory (#1), following redirects via
     *  [openStream] (each hop host-verified — #2) and enforcing the per-image cap
     *  on the bytes that actually arrive. Returns the number of bytes written, or
     *  null on any failure / over-cap (the caller deletes the partial file).
     *  Visible for test (the streaming + redirect guards are exercised against a
     *  loopback server, which the host allowlist keeps unreachable from
     *  intercept()). */
    internal fun downloadToFile(url: String, dest: File): Long? {
        var conn: HttpURLConnection? = null
        return try {
            conn = openStream(url) ?: return null
            // NTV-2: reject an oversized asset by its declared Content-Length BEFORE
            // reading a byte. Fast path only — a chunked response declares -1 and
            // sails past this, so streamCapped below is what actually enforces the cap.
            val declared = conn.contentLength
            if (declared > MAX_DOWNLOAD_BYTES) {
                Timber.tag("GardenCache").w("download too large (Content-Length %d) for %s", declared, url)
                return null
            }
            conn.inputStream.use { input ->
                FileOutputStream(dest).use { output -> streamCapped(input, output) }
            }
        } catch (e: Exception) {
            Timber.tag("GardenCache").w(e, "download failed for %s", url)
            null
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    /**
     * Copy [input] to [output] in 16 KB chunks, failing closed (null) the moment
     * the running total exceeds MAX_DOWNLOAD_BYTES.
     *
     * Why this exists: the declared Content-Length fast-reject in [downloadToFile]
     * is blind to chunked responses (Content-Length -1), so a cap checked only
     * against the header has a hole exactly where it was meant to protect a budget
     * device — an unknown-length body would otherwise stream UNBOUNDED. Enforcing
     * the cap on the bytes that ACTUALLY arrive closes it, and streaming to disk
     * keeps the footprint at one 16 KB chunk regardless of image size (#1). The
     * count is checked before each chunk is written, so nothing past the cap is
     * ever written; an over-cap body degrades to null (a cache miss — the WebView
     * loads the image itself), never to an escaped exception.
     */
    private fun streamCapped(input: InputStream, output: OutputStream): Long? {
        val chunk = ByteArray(16 * 1024)
        var total = 0L
        while (true) {
            val n = input.read(chunk)
            if (n < 0) break
            total += n
            if (total > MAX_DOWNLOAD_BYTES) {
                Timber.tag("GardenCache").w(
                    "download aborted mid-stream past %d bytes (unknown or understated Content-Length)",
                    MAX_DOWNLOAD_BYTES
                )
                return null
            }
            output.write(chunk, 0, n)
        }
        output.flush()
        return total
    }

    private fun response(body: InputStream): WebResourceResponse {
        val headers = mapOf(
            // Let the WebView keep its own in-memory copy across the session
            // too, so even the 1st repaint of an already-seen page is instant.
            "Cache-Control" to "max-age=31536000",
            "Access-Control-Allow-Origin" to "*"
        )
        return WebResourceResponse("image/jpeg", null, 200, "OK", headers, body)
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
        // U7: single-flight — if an enforcer is already running, skip. Without
        // this, a fast page-crawl spawned one thread per cache miss and they
        // raced on the same directory (double-counting, redundant deletes).
        if (!capRunning.compareAndSet(false, true)) return
        Thread {
            try {
                sweepAndCap()
            } catch (e: Exception) {
                Timber.tag("GardenCache").w(e, "cap enforcement failed")
            } finally {
                capRunning.set(false)
            }
        }.apply { isDaemon = true; name = "garden-cache-cap" }.start()
    }

    /** The enforcer's body, run synchronously. Visible for test. */
    internal fun sweepAndCap() {
        // Sweep orphaned .tmp files first — a failed (e.g. disk-full)
        // write can leave a *.jpg.tmp that the .jpg-only byte-cap below
        // never reclaims, so it would leak indefinitely otherwise. A temp
        // file a download is still writing is not an orphan (vs6).
        dir.listFiles { f -> f.isFile && f.name.endsWith(".tmp") && f.name !in inFlight }?.forEach { it.delete() }
        val files = dir.listFiles { f -> f.isFile && f.name.endsWith(".jpg") } ?: return
        var total = 0L
        for (f in files) total += f.length()
        if (total <= MAX_BYTES) return
        // Evict least-recently-modified first until under cap.
        val byAge = files.sortedBy { it.lastModified() }
        var i = 0
        while (total > MAX_BYTES && i < byAge.size) {
            val f = byAge[i]; val len = f.length()
            if (f.delete()) total -= len
            i++
        }
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
        // U7: the only hosts the Garden native cache will fetch from — the
        // github.com release URL and the githubusercontent asset hosts its
        // 302 redirects to (matching the CSP img-src allowance). Any other host
        // is refused (intercept returns null → the WebView loads it under CSP).
        private val ALLOWED_HOSTS = setOf(
            "github.com",
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com"
        )

        // Cap the manual redirect chain. GitHub's release download is a single
        // 302 to the signed asset host; a handful of hops is generous headroom
        // while still bounding a pathological redirect loop.
        private const val MAX_REDIRECTS = 5

        // Good-citizen UA for the Garden asset fetches (see openStream).
        private const val USER_AGENT = "VOTReader-Android/1.0"

        // garden-<tier>/garden_NNN.jpg — captures the tier (the release tag's
        // suffix, as garden.js builds it) and the zero-padded page number from
        // the github.com release path. The tier is [a-z0-9] only, so it is safe
        // inside a file name. Case-insensitive on the extension for safety.
        private val GARDEN_RE = Regex("""/garden-([a-z0-9]{1,16})/garden_(\d{1,4})\.jpg""", RegexOption.IGNORE_CASE)

        // 800 MB — above a full 209-page Ultra read (~720 MB measured on
        // device; ~680 MB advertised) with margin for the 8 MB outlier
        // pages. Every tier's complete book fits without mid-read eviction;
        // the cap only guards against a page-keying regression or a future
        // tier larger than Ultra. cacheDir is OS-evictable under storage
        // pressure regardless, so this is a soft ceiling on a soft store.
        private const val MAX_BYTES = 800L * 1024 * 1024

        // NTV-2: per-IMAGE ceiling, checked against the declared Content-Length BEFORE
        // a download is read into heap. Ultra pages are ~3.5 MB (max ~8.3 MB on device),
        // so 48 MB is a generous backstop guarding a budget device against a huge or
        // compromised asset that slipped past the host allowlist. Visible for test.
        internal const val MAX_DOWNLOAD_BYTES = 48 * 1024 * 1024
    }
}
