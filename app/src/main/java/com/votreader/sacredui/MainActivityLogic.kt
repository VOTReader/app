package com.votreader.sacredui

/**
 * T5 — pure helpers extracted from MainActivity so they can be unit-tested.
 *
 * Both functions are framework-free (no Android imports), so plain JUnit
 * exercises them and JaCoCo instruments them without Robolectric. MainActivity
 * passes in the framework-derived inputs (display density, System.currentTime-
 * Millis()) and applies the result; the decision math lives here.
 */
object MainActivityLogic {

    /**
     * Convert a device-pixel tap coordinate to CSS px by dividing by the display
     * density. Zoom is disabled in this WebView (setSupportZoom(false) /
     * useWideViewPort(false)), so the division is exact. Returns null when
     * density <= 0 so the tap is dropped rather than dividing by zero / emitting
     * Infinity coordinates (which would hit-test the wrong annotation).
     */
    fun deviceToCssPx(deviceX: Float, deviceY: Float, density: Float): Pair<Float, Float>? {
        if (density <= 0f) return null
        return Pair(deviceX / density, deviceY / density)
    }

    /** Outcome of a renderer-crash recovery decision. */
    data class RecoveryDecision(
        val firstRecoveryMs: Long,
        val renderRecoveryCount: Int,
        val showRetryView: Boolean
    )

    /**
     * Decide how to update the renderer-crash recovery counter when the WebView
     * renderer dies. A crash more than [windowMs] after the first one resets the
     * window; the (maxRecoveries+1)-th crash within the window trips the retry
     * view. Mirrors the inline math in MainActivity.onRenderProcessGone exactly
     * (default 60s window, retry after the 3rd crash).
     */
    fun decideRecovery(
        prevFirstMs: Long,
        prevCount: Int,
        now: Long,
        windowMs: Long = 60_000L,
        maxRecoveries: Int = 2
    ): RecoveryDecision {
        val reset = prevFirstMs == 0L || now - prevFirstMs > windowMs
        val baseFirst = if (reset) now else prevFirstMs
        val baseCount = if (reset) 0 else prevCount
        val newCount = baseCount + 1
        return RecoveryDecision(baseFirst, newCount, newCount > maxRecoveries)
    }
}
