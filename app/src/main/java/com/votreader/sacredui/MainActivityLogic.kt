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
     * Convert a device-pixel tap coordinate to CSS px. The WebView reports the
     * document at `density * scale` physical px per CSS px, so both factors
     * divide out. [scale] is the app-normalized WebView scale (vm.currentScale;
     * 1.0 == no zoom). Zoom is disabled today (setSupportZoom(false), no live JS
     * caller of setZoomEnabled, index.html user-scalable=no), so scale is 1.0 in
     * practice and this reduces to deviceX / density — but the setZoomEnabled/
     * getZoomScale bridge is still exposed, so accounting for scale keeps the tap
     * hit-test correct if zoom is ever re-enabled instead of silently off by the
     * scale factor. Returns null on a non-positive density OR scale so the tap is
     * dropped rather than emitting Infinity/NaN coordinates (which would hit-test
     * the wrong annotation). [scale] defaults to 1.0 for callers that never zoom.
     */
    fun deviceToCssPx(
        deviceX: Float,
        deviceY: Float,
        density: Float,
        scale: Float = 1f
    ): Pair<Float, Float>? {
        if (density <= 0f || scale <= 0f) return null
        val effective = density * scale
        return Pair(deviceX / effective, deviceY / effective)
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

    /**
     * Decide what (if anything) MainActivity's WebViewClient should Timber-log
     * from an onReceivedHttpError callback. HTTP-level failures (404/500) never
     * fire onReceivedError, so a Garden image URL that fell through
     * gardenCache.intercept() to the WebView's own load used to fail SILENTLY.
     *
     * Returns a message ONLY when [isGardenHost] (MainActivity computes that
     * via GardenImageCache.hostAllowed — the same U7 allowlist the fetch path
     * uses, so the fetch gate and the log gate can never drift apart) and the
     * message names ONLY host + status: the full URL can carry signed query
     * params (rscd tokens) that don't belong in the log. Every other host
     * returns null — logging all sub-resource HTTP errors would spam the log
     * with failures the app can't act on. Pure diagnostic; no UX change (the
     * WebView still renders its own error surface).
     */
    fun gardenHttpErrorLogMessage(
        isGardenHost: Boolean,
        host: String?,
        statusCode: Int
    ): String? =
        if (isGardenHost) "Garden asset HTTP $statusCode for host ${host ?: "<unknown>"}" else null
}
