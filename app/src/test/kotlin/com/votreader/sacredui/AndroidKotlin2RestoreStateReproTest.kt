package com.votreader.sacredui

import android.os.Build
import android.os.Bundle
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

/**
 * android-kotlin-2 — RED repro (Verifier execution helper).
 *
 * MainActivity.onCreate (~line 541-542):
 *   if (savedInstanceState != null) {
 *       webView.restoreState(savedInstanceState)
 *   } else {
 *       webView.clearCache(true)
 *       webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
 *   }
 *
 * WebView.restoreState() is documented to return null when the bundle
 * carries no usable/committed WebView navigation state, and today's code
 * discards that return value outright. onSaveInstanceState (~line 1319)
 * calls webView.saveState(outState) UNCONDITIONALLY, and saveState() writes
 * nothing when the WebView never finished a committed navigation before the
 * process died. Net effect: a process-death restore from exactly that kind
 * of bundle takes the restore branch (savedInstanceState != null), gets a
 * null back from restoreState(), and falls through to nothing -- no
 * loadUrl, ever. Permanent black screen on resume.
 *
 * Repro mechanism: this is driven through MainActivity's REAL onCreate via
 * Robolectric.buildActivity(...).create(bundle) -- not a fake/mocked
 * predicate. Robolectric's ShadowWebView.restoreState() has the identical
 * null-on-no-history contract as real WebView (confirmed by disassembling
 * ShadowWebView 4.14.1's bytecode: it reads Bundle key
 * "ShadowWebView.History" via Bundle.getStringArrayList; when that key is
 * absent it falls back to an empty history list and returns null). So a
 * plain empty Bundle() is non-null (takes the restore branch) but carries
 * no WebView history -- exactly the process-death-with-nothing-committed
 * shape the finding describes -- and reproduces the real defect end to end:
 * MainActivity never calls loadUrl, provable via
 * ShadowWebView.getLastLoadedUrl() staying null instead of the start URL.
 *
 * Class-level @Config: Q (API 29), matching the rest of the Kotlin suite
 * (NativeAudioRecorderTest). MainViewModel/NativeAudioRecorder/StorageManager
 * construction along the way is side-effect-free at construction time (see
 * their own source) so driving the real Activity lifecycle here carries no
 * hidden framework calls beyond what onCreate already does in production.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class AndroidKotlin2RestoreStateReproTest {

    @Test
    fun `resume from a bundle with no usable WebView state must still load the start URL`() {
        val controller = Robolectric.buildActivity(MainActivity::class.java)
        // Non-null (takes the restoreState branch) but carries NO WebView
        // history -- the exact shape of a process-death restore where
        // saveState() never wrote anything (WebView had no committed
        // navigation before death). This is the finding's precondition,
        // not a contrived input.
        val bundleWithNoUsableWebViewState = Bundle()

        val activity = controller.create(bundleWithNoUsableWebViewState).get()

        val shadowWebView = shadowOf(activity.activeWebView)
        assertEquals(
            "https://appassets.androidplatform.net/assets/index.html",
            shadowWebView.lastLoadedUrl,
            "restoreState() returned null (bundle had no usable WebView history) " +
                "but MainActivity discarded that result and never fell through to " +
                "clearCache(true) + loadUrl(...) -- the WebView loaded nothing at " +
                "all. This is the permanent black screen on resume."
        )
    }
}
