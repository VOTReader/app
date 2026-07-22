package com.votreader.sacredui

import com.sun.net.httpserver.HttpServer
import org.junit.Test
import org.junit.Before
import org.junit.After
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertFalse

/**
 * GardenImageCache — page-key derivation + clear/size.
 *
 * The behaviour under test is the one the user explicitly required: the
 * SAME Garden page at DIFFERENT quality tiers must map to the SAME cache
 * file, so re-reading at a new tier OVERWRITES rather than accumulating one
 * copy per tier ("the user can't have 5+ copies of the same 200+ images at
 * different quality levels"). That guarantee lives in cacheNameFor(), which
 * strips the tier and keys by page number only.
 *
 * No network / no WebView here — cacheNameFor() is pure string logic, and
 * clear()/sizeBytes() operate on a temp dir. The actual fetch + disk-serve
 * path is exercised on-device (the redirect + HttpURLConnection can't be
 * meaningfully unit-tested without a live network).
 */
class GardenImageCacheTest {

    private lateinit var tmp: File
    private lateinit var cache: GardenImageCache

    @Before
    fun setup() {
        tmp = File.createTempFile("garden-test", "").apply { delete(); mkdirs() }
        cache = GardenImageCache(tmp)
    }

    @After
    fun teardown() {
        tmp.deleteRecursively()
    }

    // ─── page-key derivation (the overwrite-not-accumulate guarantee) ───

    @Test
    fun `same page at different tiers maps to the same cache file`() {
        val base = "https://github.com/VOTReader/votreader-assets/releases/download"
        val mobile   = cache.cacheNameFor("$base/garden-mobile/garden_042.jpg")
        val standard = cache.cacheNameFor("$base/garden-standard/garden_042.jpg")
        val native   = cache.cacheNameFor("$base/garden-native/garden_042.jpg")
        val ultra    = cache.cacheNameFor("$base/garden-ultra/garden_042.jpg")
        // All four tiers of page 42 → ONE filename → re-read overwrites.
        assertEquals("garden_042.jpg", mobile)
        assertEquals(mobile, standard)
        assertEquals(mobile, native)
        assertEquals(mobile, ultra)
    }

    @Test
    fun `different pages map to different cache files`() {
        val base = "https://github.com/VOTReader/votreader-assets/releases/download/garden-standard"
        assertEquals("garden_001.jpg", cache.cacheNameFor("$base/garden_001.jpg"))
        assertEquals("garden_209.jpg", cache.cacheNameFor("$base/garden_209.jpg"))
    }

    @Test
    fun `matches the redirected release-assets URL too`() {
        // After the 302, the page number rides in the response-content-
        // disposition / rscd filename query on the signed asset URL.
        val redirected = "https://release-assets.githubusercontent.com/github-production-release-asset/" +
            "1205622232/abc?rscd=attachment%3B+filename%3Dgarden_017.jpg&sig=XYZ"
        assertEquals("garden_017.jpg", cache.cacheNameFor(redirected))
    }

    @Test
    fun `non-Garden URLs return null (left to the normal WebView load)`() {
        assertNull(cache.cacheNameFor("https://appassets.androidplatform.net/assets/index.html"))
        assertNull(cache.cacheNameFor("https://github.com/VOTReader/votreader-assets/releases/download/garden-standard/cover.png"))
        assertNull(cache.cacheNameFor("https://example.com/garden.jpg")) // no page number
        assertNull(cache.cacheNameFor("about:blank"))
    }

    // ─── clear + size ───

    @Test
    fun `clear removes cached files and sizeBytes reflects contents`() {
        val gdir = File(tmp, "garden")
        File(gdir, "garden_001.jpg").writeBytes(ByteArray(100))
        File(gdir, "garden_002.jpg").writeBytes(ByteArray(250))
        assertEquals(350L, cache.sizeBytes())

        cache.clear()
        assertEquals(0L, cache.sizeBytes())
        assertTrue((gdir.listFiles() ?: emptyArray()).isEmpty())
    }

    @Test
    fun `sizeBytes is zero on a fresh cache`() {
        assertEquals(0L, cache.sizeBytes())
    }

    // ─── U7: host allowlist (SSRF guard) ───

    @Test
    fun `hostAllowed accepts the known Garden asset hosts`() {
        assertTrue(cache.hostAllowed("https://github.com/VOTReader/votreader-assets/releases/download/garden-ultra/garden_042.jpg"))
        assertTrue(cache.hostAllowed("https://release-assets.githubusercontent.com/x/y?rscd=garden_017.jpg"))
        assertTrue(cache.hostAllowed("https://objects.githubusercontent.com/anything"))
    }

    @Test
    fun `hostAllowed rejects non-allowlisted and look-alike hosts`() {
        assertFalse(cache.hostAllowed("https://evil.test/garden_001.jpg"))
        assertFalse(cache.hostAllowed("https://github.com.evil.test/garden_001.jpg"))  // look-alike suffix
        assertFalse(cache.hostAllowed("https://raw.githubusercontent.com/x/garden_001.jpg"))  // different gh host
        assertFalse(cache.hostAllowed("not a url"))
        assertFalse(cache.hostAllowed("file:///etc/passwd"))
    }

    @Test
    fun `intercept refuses a garden-pattern URL on a non-allowlisted host and writes nothing`() {
        // The garden_NNN.jpg regex matches, but the host is not allowlisted, so
        // intercept must return null (→ WebView + CSP handle it) without fetching
        // and without writing any cache file. This is the SSRF guard (U7).
        val gdir = File(tmp, "garden")
        assertNull(cache.intercept("https://evil.test/garden_001.jpg"))
        assertEquals(0L, cache.sizeBytes())
        assertTrue((gdir.listFiles() ?: emptyArray()).none { it.name.startsWith("garden_") })
    }

    // ─── NTV-2: streaming size guard (chunked / unknown Content-Length) ───

    @Test
    fun `chunked response over the per-image cap fails closed and writes no usable file`() {
        // NTV-2 + #1: the declared-length fast-reject in downloadToFile() can only
        // see a declared Content-Length. A chunked response declares NONE
        // (contentLength == -1), so the cap must be enforced against the bytes
        // that ACTUALLY arrive — and now that the download STREAMS to disk, the
        // footprint stays ~16 KB regardless of body size. One byte over the cap
        // must fail CLOSED (null → cache miss; the WebView loads the image itself).
        // No exception may escape (never-throw design).
        val payload = ByteArray(GardenImageCache.MAX_DOWNLOAD_BYTES + 1) { 0x6A }
        val dest = File(tmp, "over.tmp")
        withServer(payload) { url ->
            assertNull(cache.downloadToFile(url, dest))
        }
        // Nothing was published into the page cache.
        assertEquals(0L, cache.sizeBytes())
        val gdir = File(tmp, "garden")
        assertTrue((gdir.listFiles() ?: emptyArray()).none { it.name.startsWith("garden_") })
    }

    @Test
    fun `chunked response under the cap streams to the file intact`() {
        // Companion guard test: unknown Content-Length is legitimate for small
        // bodies too, so the streaming cap must not break normal chunked
        // downloads — a body under the cap must arrive on disk byte-for-byte.
        val payload = ByteArray(64 * 1024) { 0x2E }
        val dest = File(tmp, "under.tmp")
        withServer(payload) { url ->
            assertEquals(payload.size.toLong(), cache.downloadToFile(url, dest))
            assertContentEquals(payload, dest.readBytes())
        }
    }

    // ─── #2: redirect target host re-verification (SSRF guard on the hop) ───

    @Test
    fun `redirect to a non-allowlisted host is refused and never fetched`() {
        // The initial host is gated by intercept(); this proves the SECOND line of
        // defense: a 302 whose Location points off the Garden allowlist is refused
        // BEFORE the app connects to it. RED-provable — with automatic redirect
        // following (the pre-#2 behaviour) the app would fetch the off-allowlist
        // target and hand its bytes back to the WebView with ACAO:*. Here the
        // target is a live loopback server, so a following implementation WOULD
        // return its payload and set the hit flag; the fix returns null and the
        // target is never contacted.
        val dest = File(tmp, "redir.tmp")
        withRedirectChain { redirectUrl, targetWasHit ->
            assertNull(cache.downloadToFile(redirectUrl, dest))
            assertFalse(targetWasHit(), "off-allowlist redirect target must never be contacted")
        }
    }

    /**
     * Serve [payload] from a loopback HttpServer with NO Content-Length
     * (sendResponseHeaders(200, 0) → chunked transfer encoding, so the
     * client sees contentLength == -1), then run [block] against its URL.
     * This is the response shape the declared-length guard is blind to.
     */
    private fun withServer(payload: ByteArray, block: (String) -> Unit) {
        val server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        server.createContext("/garden_999.jpg") { ex ->
            ex.sendResponseHeaders(200, 0) // 0 = chunked: body length unknown to the client
            ex.responseBody.use { it.write(payload) }
        }
        server.start()
        try {
            block("http://127.0.0.1:${server.address.port}/garden_999.jpg")
        } finally {
            server.stop(0)
        }
    }

    /**
     * Stand up TWO loopback servers: a "redirect" server that 302s to a live
     * "target" server (both on 127.0.0.1, which is NOT on ALLOWED_HOSTS). Runs
     * [block] with the redirect URL and a probe reporting whether the target was
     * ever contacted. If the download follows the hop, the target sets its flag
     * and returns bytes; if #2 refuses the hop, the flag stays false.
     */
    private fun withRedirectChain(block: (redirectUrl: String, targetWasHit: () -> Boolean) -> Unit) {
        val hit = java.util.concurrent.atomic.AtomicBoolean(false)
        val target = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        target.createContext("/garden_998.jpg") { ex ->
            hit.set(true)
            val body = ByteArray(1024) { 0x5A }
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        target.start()
        val targetUrl = "http://127.0.0.1:${target.address.port}/garden_998.jpg"
        val redirect = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        redirect.createContext("/garden_999.jpg") { ex ->
            ex.responseHeaders.add("Location", targetUrl)
            ex.sendResponseHeaders(302, -1)
            ex.close()
        }
        redirect.start()
        try {
            block("http://127.0.0.1:${redirect.address.port}/garden_999.jpg") { hit.get() }
        } finally {
            redirect.stop(0)
            target.stop(0)
        }
    }
}
