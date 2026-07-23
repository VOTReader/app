package com.votreader.sacredui

import org.junit.Test
import kotlin.test.assertEquals

/**
 * #2 — VOTReaderApp.safeSuffix: reduce a private sub-process name ("<pkg>:<tag>")
 * to a WebView.setDataDirectorySuffix-valid suffix. The setter rejects path
 * separators + punctuation, so the tag after the last ':' is stripped to
 * letters/digits/underscore, with a "sub" fallback when nothing usable remains.
 *
 * Pure string logic — no Application/WebView needed, so plain JUnit exercises it.
 * (The process-name detection + the setDataDirectorySuffix call itself are
 * framework-bound and covered by the single-process guard + on-device behavior.)
 */
class VOTReaderAppTest {

    @Test
    fun `takes the tag after the last colon`() {
        assertEquals("sub", VOTReaderApp.safeSuffix("com.votreader.sacredui:sub"))
    }

    @Test
    fun `strips punctuation to path-safe chars`() {
        assertEquals("worker2", VOTReaderApp.safeSuffix("com.votreader.sacredui:worker.2"))
    }

    @Test
    fun `keeps digits and underscores`() {
        assertEquals("bg_1", VOTReaderApp.safeSuffix("pkg:bg_1"))
    }

    @Test
    fun `falls back to sub when the tag is empty`() {
        assertEquals("sub", VOTReaderApp.safeSuffix("pkg:"))
    }

    @Test
    fun `falls back to sub when the tag is all punctuation`() {
        assertEquals("sub", VOTReaderApp.safeSuffix("pkg:.-."))
    }

    @Test
    fun `no colon yields the fallback (never reached in production, but defined)`() {
        // substringAfterLast(':', "") returns "" when there is no ':' → fallback.
        // In production safeSuffix is only called for a "<pkg>:<tag>" name.
        assertEquals("sub", VOTReaderApp.safeSuffix("com.votreader.sacredui"))
    }
}
