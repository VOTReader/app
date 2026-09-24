package com.votreader.sacredui

import android.os.Build
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull

/**
 * v11-android-03 (improvement sweep 2026-09-22, REPORT #7): Back on Home must
 * behave like Home, not like "quit".
 *
 * use-android-back.js returns "false" only on the home screen (nothing left to
 * pop). MainActivity used to answer that with finish(): onDestroy then stopped
 * the streaming audio and destroyed the WebView that owns the <audio> element,
 * so Back on Home killed the letter playing in the background and the next
 * launch was a cold start. moveTaskToBack(true) is what Android 12+ does for a
 * root activity on its own, and what pressing Home already did: onPause keeps
 * the audio alive while vm.streamAudioActive.
 *
 * Driven through the REAL onCreate and the real back dispatcher; the JS answer
 * is fed through Robolectric's ShadowWebView evaluateJavascript callback, the
 * same ValueCallback the production evaluateJavascript would call.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class MainActivityBackToHomeTest {

    private fun backWithJsAnswer(answer: String): MainActivity {
        val activity = Robolectric.buildActivity(MainActivity::class.java).create().start().resume().get()
        activity.onBackPressedDispatcher.onBackPressed()
        val webView = shadowOf(activity.activeWebView)
        assertEquals(
            true,
            webView.lastEvaluatedJavascript?.contains("handleAndroidBack"),
            "the back press must ask JS first (window.handleAndroidBack)",
        )
        val callback = webView.lastEvaluatedJavascriptCallback
        assertNotNull(callback, "the back press must wait for JS's answer")
        callback.onReceiveValue(answer)
        return activity
    }

    @Test
    fun `Back on Home (JS consumed nothing) sends the app to the background instead of finishing it`() {
        val activity = backWithJsAnswer("\"false\"")
        assertFalse(
            activity.isFinishing,
            "finish() on an unconsumed back destroys the WebView and stops the playing letter; " +
                "moveTaskToBack(true) keeps both, like the Home button",
        )
    }

    @Test
    fun `control - a back JS consumed leaves the activity alone`() {
        val activity = backWithJsAnswer("\"true\"")
        assertFalse(activity.isFinishing)
    }
}
