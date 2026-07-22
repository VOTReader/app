package com.votreader.sacredui

import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertFalse

/**
 * MainActivityLogic — the two pure helpers extracted from MainActivity (T5):
 * the tap device-px -> CSS-px conversion (a wrong divisor/guard opens the
 * annotation chip on the wrong point) and the renderer crash-loop decision
 * (3-strikes-in-60s -> retry view). Both were inline + untested in MainActivity.
 *
 * Plain JUnit, no Robolectric — the logic is framework-free, so it instruments
 * for JaCoCo and runs in :app:testDebugUnitTest without the Android sandbox.
 */
class MainActivityLogicTest {

    // ── deviceToCssPx ──────────────────────────────────────────────────
    @Test
    fun `divides by density`() {
        val (x, y) = MainActivityLogic.deviceToCssPx(100f, 200f, 2.0f)!!
        assertEquals(50f, x)
        assertEquals(100f, y)
    }

    @Test
    fun `identity passthrough at density 1`() {
        val (x, y) = MainActivityLogic.deviceToCssPx(37f, 88f, 1.0f)!!
        assertEquals(37f, x)
        assertEquals(88f, y)
    }

    @Test
    fun `fractional density`() {
        val (x, y) = MainActivityLogic.deviceToCssPx(350f, 700f, 3.5f)!!
        assertEquals(100f, x)
        assertEquals(200f, y)
    }

    @Test
    fun `density zero drops the tap (no divide-by-zero)`() {
        assertNull(MainActivityLogic.deviceToCssPx(100f, 200f, 0f))
    }

    @Test
    fun `negative density drops the tap`() {
        assertNull(MainActivityLogic.deviceToCssPx(100f, 200f, -1f))
    }

    // ── decideRecovery ─────────────────────────────────────────────────
    @Test
    fun `cold first crash starts the window, no retry`() {
        val d = MainActivityLogic.decideRecovery(prevFirstMs = 0L, prevCount = 0, now = 1_000L)
        assertEquals(1_000L, d.firstRecoveryMs)
        assertEquals(1, d.renderRecoveryCount)
        assertFalse(d.showRetryView)
    }

    @Test
    fun `second crash inside the window, still no retry`() {
        val d = MainActivityLogic.decideRecovery(prevFirstMs = 1_000L, prevCount = 1, now = 5_000L)
        assertEquals(1_000L, d.firstRecoveryMs)
        assertEquals(2, d.renderRecoveryCount)
        assertFalse(d.showRetryView)
    }

    @Test
    fun `third crash inside the window trips the retry view`() {
        val d = MainActivityLogic.decideRecovery(prevFirstMs = 1_000L, prevCount = 2, now = 9_000L)
        assertEquals(3, d.renderRecoveryCount)
        assertTrue(d.showRetryView)
    }

    @Test
    fun `crash after the window expires resets the count`() {
        // now - firstMs = 60_001 (> 60_000) -> reset
        val d = MainActivityLogic.decideRecovery(prevFirstMs = 1_000L, prevCount = 2, now = 61_001L)
        assertEquals(61_001L, d.firstRecoveryMs)
        assertEquals(1, d.renderRecoveryCount)
        assertFalse(d.showRetryView)
    }

    @Test
    fun `crash exactly at the window edge does NOT reset (strict greater-than)`() {
        // now - firstMs == 60_000 exactly -> NOT > 60_000 -> no reset, count increments
        val d = MainActivityLogic.decideRecovery(prevFirstMs = 1_000L, prevCount = 1, now = 61_000L)
        assertEquals(1_000L, d.firstRecoveryMs)
        assertEquals(2, d.renderRecoveryCount)
        assertFalse(d.showRetryView)
    }

    // ── isBackPressConsumed ────────────────────────────────────────────
    // The back-press contract: JS returns "true" when it consumed the press.
    // evaluateJavascript JSON-encodes the return value, so a JS string "true"
    // arrives as `"true"` (quoted) but a JS boolean true arrives as `true`
    // (unquoted). Both encodings must mean "consumed" — missing either one
    // finish()es the Activity even though JS handled the press.
    @Test
    fun `quoted string true means consumed (today's JS encoding)`() {
        assertTrue(MainActivityLogic.isBackPressConsumed("\"true\""))
    }

    @Test
    fun `unquoted boolean true means consumed (refactor-proof)`() {
        assertTrue(MainActivityLogic.isBackPressConsumed("true"))
    }

    @Test
    fun `quoted string false means NOT consumed`() {
        assertFalse(MainActivityLogic.isBackPressConsumed("\"false\""))
    }

    @Test
    fun `unquoted boolean false means NOT consumed`() {
        assertFalse(MainActivityLogic.isBackPressConsumed("false"))
    }

    @Test
    fun `js null (missing handler) means NOT consumed`() {
        assertFalse(MainActivityLogic.isBackPressConsumed("null"))
    }

    @Test
    fun `kotlin null result means NOT consumed`() {
        assertFalse(MainActivityLogic.isBackPressConsumed(null))
    }

    // ── shouldTrimWebViewCache ─────────────────────────────────────────
    // Prune the WebView in-memory cache only at TRIM_MEMORY_MODERATE(60)+ —
    // background LRU-midpoint states. Foreground RUNNING_* levels (5/10/15) and
    // the lighter background UI_HIDDEN(20)/BACKGROUND(40) signals must NOT trim,
    // or the user gets re-fetch jank mid-read. The 60 boundary is inclusive.
    @Test
    fun `trims at MODERATE exactly (inclusive boundary)`() {
        assertTrue(MainActivityLogic.shouldTrimWebViewCache(60))
    }

    @Test
    fun `trims at COMPLETE (above MODERATE)`() {
        assertTrue(MainActivityLogic.shouldTrimWebViewCache(80))
    }

    @Test
    fun `does NOT trim just below MODERATE`() {
        assertFalse(MainActivityLogic.shouldTrimWebViewCache(59))
    }

    @Test
    fun `does NOT trim at BACKGROUND(40) or UI_HIDDEN(20)`() {
        assertFalse(MainActivityLogic.shouldTrimWebViewCache(40))
        assertFalse(MainActivityLogic.shouldTrimWebViewCache(20))
    }

    @Test
    fun `does NOT trim on foreground RUNNING levels (5,10,15)`() {
        assertFalse(MainActivityLogic.shouldTrimWebViewCache(5))
        assertFalse(MainActivityLogic.shouldTrimWebViewCache(10))
        assertFalse(MainActivityLogic.shouldTrimWebViewCache(15))
    }

    @Test
    fun `custom window and threshold params are honored`() {
        val d = MainActivityLogic.decideRecovery(
            prevFirstMs = 100L, prevCount = 0, now = 200L, windowMs = 10L, maxRecoveries = 0
        )
        // now - firstMs = 100 > 10 -> reset; newCount = 1 > maxRecoveries(0) -> retry
        assertEquals(200L, d.firstRecoveryMs)
        assertEquals(1, d.renderRecoveryCount)
        assertTrue(d.showRetryView)
    }
}
