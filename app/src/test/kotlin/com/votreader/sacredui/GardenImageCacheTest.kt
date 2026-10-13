package com.votreader.sacredui

import com.sun.net.httpserver.HttpServer
import org.junit.Test
import org.junit.Before
import org.junit.After
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertFalse

/**
 * GardenImageCache — cache names, the hit/miss/store path, the temp sweep, clear/size, and the fetch guards.
 *
 * Two guarantees the owner relies on meet here. A page is served at the quality he picked: the cache name
 * carries the tier, so a copy stored at another tier is a miss (vs6, sweep 2026-10-13 W6: a quality change
 * used to do nothing for pages already viewed). And one file per page, never one per tier ("the user can't
 * have 5+ copies of the same 200+ images at different quality levels"): storing a page deletes its other
 * tiers' copies.
 *
 * No network / no WebView here: open() is the plain-JVM body intercept() wraps, driven through a fake
 * fetcher; clear()/sizeBytes() operate on a temp dir; the real download runs against loopback servers.
 */
class GardenImageCacheTest {

    private companion object {
        const val BASE = "https://github.com/VOTReader/votreader-assets/releases/download"
    }

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

    /** A distinct body per URL, so a test can tell which tier's bytes were served. */
    private fun bodyFor(url: String): ByteArray = url.toByteArray()

    /** The cached image files for one page, sorted (temp files excluded). */
    private fun pageFiles(page: String): List<String> =
        (File(tmp, "garden").listFiles() ?: emptyArray())
            .map { it.name }.filter { it.startsWith("garden_$page") && it.endsWith(".jpg") }.sorted()

    // ─── cache names: the page AND its tier (vs6) ───

    @Test
    fun `each tier of a page has its own name, so a cached file is only ever served at its own tier`() {
        val mobile   = cache.cacheNameFor("$BASE/garden-mobile/garden_042.jpg")
        val standard = cache.cacheNameFor("$BASE/garden-standard/garden_042.jpg")
        val native   = cache.cacheNameFor("$BASE/garden-native/garden_042.jpg")
        val ultra    = cache.cacheNameFor("$BASE/garden-ultra/garden_042.jpg")
        assertEquals("garden_042.mobile.jpg", mobile)
        assertEquals("garden_042.standard.jpg", standard)
        assertEquals("garden_042.native.jpg", native)
        assertEquals("garden_042.ultra.jpg", ultra)
    }

    @Test
    fun `different pages map to different cache files`() {
        assertEquals("garden_001.standard.jpg", cache.cacheNameFor("$BASE/garden-standard/garden_001.jpg"))
        assertEquals("garden_209.standard.jpg", cache.cacheNameFor("$BASE/garden-standard/garden_209.jpg"))
    }

    @Test
    fun `the redirected release-assets URL names no tier, so it is left to the WebView`() {
        // After the 302 the page number rides in the rscd filename query, but the tier is gone: caching
        // or serving it could hand back another tier's file. The app only requests the github.com URL.
        val redirected = "https://release-assets.githubusercontent.com/github-production-release-asset/" +
            "1205622232/abc?rscd=attachment%3B+filename%3Dgarden_017.jpg&sig=XYZ"
        assertNull(cache.cacheNameFor(redirected))
        val fetched = mutableListOf<String>()
        val c = GardenImageCache(tmp) { url, dest -> fetched += url; dest.writeBytes(ByteArray(10)); 10L }
        assertNull(c.open(redirected))
        assertTrue(fetched.isEmpty())
    }

    // ─── vs6: the quality setting reaches pages already viewed ───

    @Test
    fun `a quality change refetches a viewed page at the new tier and keeps one file per page`() {
        val fetched = mutableListOf<String>()
        val c = GardenImageCache(tmp) { url, dest ->
            fetched += url
            val body = bodyFor(url)
            dest.writeBytes(body)
            body.size.toLong()
        }
        val mobile = "$BASE/garden-mobile/garden_042.jpg"
        val ultra = "$BASE/garden-ultra/garden_042.jpg"
        assertContentEquals(bodyFor(mobile), c.open(mobile)!!.use { it.readBytes() })
        // Raising the quality: the page must come back at Ultra, not as the Mobile copy already on disk.
        assertContentEquals(bodyFor(ultra), c.open(ultra)!!.use { it.readBytes() })
        assertEquals(listOf(mobile, ultra), fetched)
        // Ultra is now the cached copy (a hit, no third fetch) ...
        assertContentEquals(bodyFor(ultra), c.open(ultra)!!.use { it.readBytes() })
        assertEquals(2, fetched.size)
        // ... and the only one: the Mobile copy went when Ultra was stored ("no 5 copies").
        assertEquals(listOf("garden_042.ultra.jpg"), pageFiles("042"))
    }

    @Test
    fun `a cached file from before tiers were named is replaced, not served`() {
        val gdir = File(tmp, "garden")
        File(gdir, "garden_042.jpg").writeBytes(ByteArray(64) { 0x55 })   // an old install's untiered copy
        val standard = "$BASE/garden-standard/garden_042.jpg"
        val c = GardenImageCache(tmp) { url, dest -> dest.writeBytes(bodyFor(url)); bodyFor(url).size.toLong() }
        assertContentEquals(bodyFor(standard), c.open(standard)!!.use { it.readBytes() })
        assertEquals(listOf("garden_042.standard.jpg"), pageFiles("042"))
    }

    // ─── vs6: the temp sweep never deletes a download still being written ───

    @Test
    fun `the temp sweep leaves another page's in-flight download alone`() {
        // Two pages miss at once: page 1 is still downloading when page 2 is stored and the cap thread
        // sweeps temp files (sweepAndCap is that thread's body). Page 1 must still arrive whole and be cached.
        val full = ByteArray(4096) { (it % 251).toByte() }
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        var fetches = 0
        val c = GardenImageCache(tmp) { _, dest ->
            fetches++
            dest.writeBytes(full.copyOfRange(0, 2048))   // half on disk (stream closed, so any OS can delete it)
            started.countDown()
            assertTrue(release.await(10, TimeUnit.SECONDS))
            dest.appendBytes(full.copyOfRange(2048, full.size))
            full.size.toLong()
        }
        val url = "$BASE/garden-standard/garden_001.jpg"
        var served: ByteArray? = null
        val t = thread { served = c.open(url)?.use { it.readBytes() } }
        assertTrue(started.await(10, TimeUnit.SECONDS))
        c.sweepAndCap()
        release.countDown()
        t.join(10_000)
        assertContentEquals(full, served)
        // Cached whole: the next view is a hit.
        assertContentEquals(full, c.open(url)!!.use { it.readBytes() })
        assertEquals(1, fetches)
    }

    @Test
    fun `the temp sweep still removes a temp file no download owns`() {
        val gdir = File(tmp, "garden")
        val orphan = File(gdir, "garden_007.standard.jpg.3.tmp").apply { writeBytes(ByteArray(32)) }
        val legacyOrphan = File(gdir, "garden_008.jpg.tmp").apply { writeBytes(ByteArray(32)) }
        cache.sweepAndCap()
        assertFalse(orphan.exists())
        assertFalse(legacyOrphan.exists())
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
        assertFalse(cache.hostAllowed("http://github.com/VOTReader/votreader-assets/releases/download/garden-ultra/garden_001.jpg"))
        assertFalse(cache.hostAllowed("not a url"))
        assertFalse(cache.hostAllowed("file:///etc/passwd"))
    }

    @Test
    fun `intercept refuses a garden-pattern URL on a non-allowlisted host and writes nothing`() {
        // The garden_NNN.jpg regex matches, but the host is not allowlisted, so
        // intercept must return null (→ WebView + CSP handle it) without fetching
        // and without writing any cache file. This is the SSRF guard (U7).
        val gdir = File(tmp, "garden")
        val evil = "https://evil.test/garden-ultra/garden_001.jpg"
        assertEquals("garden_001.ultra.jpg", cache.cacheNameFor(evil))   // the name matches; only the host check stops it
        assertNull(cache.intercept(evil))
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
