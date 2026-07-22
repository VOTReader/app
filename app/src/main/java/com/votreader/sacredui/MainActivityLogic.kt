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

    /**
     * Classify the evaluateJavascript result of window.handleAndroidBack():
     * true when JS consumed the hardware back press (closed a sheet, popped
     * fromLetterStack, navigated to a parent screen), false when MainActivity
     * should finish().
     *
     * DUAL ENCODING: evaluateJavascript JSON-encodes the JS return value, so
     * the SAME logical answer arrives in two shapes depending on what the JS
     * function returns — a JS string "true" arrives as `"true"` (quoted),
     * while a JS boolean true arrives as `true` (unquoted). The JS side
     * returns the string today, but a refactor to a bare boolean must not
     * silently break the contract (the app would exit despite JS consuming
     * the press) — so both encodings are accepted. Everything else ("false"
     * either encoding, "null" when the handler is missing, a Kotlin null
     * result) means not-consumed.
     */
    fun isBackPressConsumed(result: String?): Boolean =
        result == "\"true\"" || result == "true"

    /**
     * The onTrimMemory level at/above which MainActivity prunes the WebView's
     * in-memory resource cache. Mirrors ComponentCallbacks2.TRIM_MEMORY_MODERATE
     * (a frozen platform constant == 60), kept as a literal here so this module
     * stays framework-free (no android import) and JaCoCo-instrumentable.
     */
    const val TRIM_MEMORY_MODERATE_LEVEL = 60

    /**
     * Decide whether an onTrimMemory([level]) signal is severe enough to drop
     * the WebView's in-memory resource cache. True only at TRIM_MEMORY_MODERATE
     * (60) and above — the background LRU-midpoint / COMPLETE(80) states — so the
     * lighter background signals (UI_HIDDEN 20, BACKGROUND 40) and every
     * foreground RUNNING_* level (5/10/15) are left alone: clearing the cache
     * while the app is still interactive would only cost re-fetch jank for no
     * pressure win. Assets are local (WebViewAssetLoader) so a background drop is
     * cheap to repopulate on the next foregrounding.
     */
    fun shouldTrimWebViewCache(level: Int): Boolean =
        level >= TRIM_MEMORY_MODERATE_LEVEL
}
