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
