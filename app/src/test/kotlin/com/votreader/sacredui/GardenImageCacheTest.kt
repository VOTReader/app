package com.votreader.sacredui

import org.junit.Test
import org.junit.Before
import org.junit.After
import java.io.File
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
}
