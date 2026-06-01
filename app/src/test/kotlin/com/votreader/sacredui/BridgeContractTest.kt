package com.votreader.sacredui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * U17 — JS↔Kotlin bridge contract.
 *
 * AppInterface's @JavascriptInterface methods ARE the `window.AndroidBridge`
 * surface that the JS PlatformBridge (src/utils/platform-bridge.js → androidImpl)
 * mirrors method-for-method. There was no test pinning that surface, so a
 * rename / removal / signature change on the Kotlin side could silently diverge
 * from the JS callers (a runtime "undefined is not a function" on device only).
 *
 * This reflects the live @JavascriptInterface set and asserts it equals the
 * documented contract below. Add / rename / remove a bridge method ⇒ this test
 * fails until you update BOTH this map AND platform-bridge.js's androidImpl.
 * (The JS side's existence is pinned by platform-bridge.test.js's method asserts;
 * together the two sides can't drift unnoticed.)
 *
 * Pure-JVM (no Robolectric) + reflection only — never instantiates AppInterface,
 * so it needs none of its Activity-coupled constructor deps.
 */
class BridgeContractTest {

    // method name → parameter count. The single source of truth for the bridge.
    private val expectedContract = mapOf(
        "setLightStatusBar" to 1,
        "setKeepScreenOn" to 1,
        "setImmersiveMode" to 1,
        "setZoomEnabled" to 1,
        "resetZoom" to 0,
        "getZoomScale" to 0,
        "requestMicPermission" to 0,
        "startAudioSession" to 0,
        "endAudioSession" to 0,
        "nativeRecordStart" to 0,
        "nativeRecordPause" to 0,
        "nativeRecordResume" to 0,
        "nativeRecordAmplitude" to 0,
        "nativeRecordStop" to 0,
        "nativeRecordCancel" to 0,
        "takeScreenshot" to 3,
        "openFilePicker" to 0,
        "saveToFile" to 2,
        "getCrashLog" to 0,
        "haptic" to 1
    )

    @Test
    fun `the @JavascriptInterface surface matches the documented JS bridge contract`() {
        // Filter by annotation SIMPLE NAME (string), not the JavascriptInterface
        // class identity — robust against the mockable android.jar's annotation
        // class resolution in the unit-test classpath.
        val actual = AppInterface::class.java.declaredMethods
            .filter { m -> m.annotations.any { it.annotationClass.simpleName == "JavascriptInterface" } }
            .associate { it.name to it.parameterCount }

        assertEquals(
            "AppInterface @JavascriptInterface methods drifted from the window.AndroidBridge " +
                "contract — update platform-bridge.js androidImpl + this map together.",
            expectedContract,
            actual
        )
    }
}
