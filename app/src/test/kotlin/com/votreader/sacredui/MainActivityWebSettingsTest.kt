package com.votreader.sacredui

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import io.mockk.mockk
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * MainActivity.applyReaderWebSettings — the WebSettings contract the reader
 * depends on.
 *
 * EVERY assertion here POISONS the setting to the opposite value first. That is
 * the whole point: Robolectric's RoboWebSettings ships defaults that happen to
 * match several of the values we want (textZoom is already 100, allowContentAccess
 * is already false), so a plain "assert it equals the right value" test passes
 * just as happily against a function that sets nothing at all. Poisoning first
 * makes each assertion fail if its line is deleted, which is the only version of
 * this test worth having.
 *
 * @Config pins SDK=Q to match the rest of the Kotlin suite.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class MainActivityWebSettingsTest {

    /** A WebView's settings, pre-set to the WRONG value for everything asserted. */
    private fun poisonedSettings(): WebSettings {
        val wv = WebView(ApplicationProvider.getApplicationContext())
        return wv.settings.apply {
            textZoom = 175
            allowFileAccess = true
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            javaScriptEnabled = false
            domStorageEnabled = false
        }
    }

    private fun applied(): WebSettings {
        val s = poisonedSettings()
        // The Activity instance is never touched by this method — it only writes to
        // the WebSettings handed in — so calling it on a bare instance is honest.
        MainActivity().applyReaderWebSettings(s)
        return s
    }

    @Test
    fun `text zoom is pinned at 100 so the system font scale cannot stack on Text Size`() {
        // a11y-ux-6. Reproduced on emulator-5554 (WebView 113): with textZoom left
        // alone, Android's Display > Font size multiplied the page's computed px on
        // top of the app's own --font-scale — reading text measured 18 -> 23.4 ->
        // 27px across system 1.0x / 1.3x / 1.5x while --font-scale stayed "1" — and
        // the px chrome pin drifted with it (.top-nav 91.1 -> 101.1px).
        assertEquals(100, applied().textZoom, "system font scale would stack on --font-scale")
    }

    @Test
    fun `file and content access stay off`() {
        // Security decisions, previously unreachable from any unit test: file://
        // reads would expose anything the app process can read, and content:// from
        // page markup is not what feeds the file chooser (proven on-device
        // 2026-07-30 — see the note on the method).
        val s = applied()
        assertFalse(s.allowFileAccess, "file:// access must stay off")
        assertFalse(s.allowContentAccess, "content:// access from page markup must stay off")
    }

    @Test
    fun `mixed content is never allowed`() {
        assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, applied().mixedContentMode)
    }

    // ─── a11y-ux-6, second half: the system size is HONOURED, not ignored ──
    //
    // Pinning textZoom stops the OS font size stacking on --font-scale, but on its
    // own it also throws the OS setting away: a reader who set Android's Display >
    // Font size to its largest step got no larger text at all. The bridge reports
    // that scale so the app can apply it ONCE, through its own --font-scale, which
    // app.css routes to text while chrome stays px-pinned. That is the whole reason
    // it goes through --font-scale rather than back through textZoom.

    /** An AppInterface whose host context carries [fontScale], the way a device
     *  with that Display > Font size setting hands one to the Activity. */
    private fun bridgeAtSystemFontScale(fontScale: Float): AppInterface {
        val base = ApplicationProvider.getApplicationContext<Application>()
        val cfg = Configuration(base.resources.configuration).apply { this.fontScale = fontScale }
        val scaled: Context = base.createConfigurationContext(cfg)
        return AppInterface(FakeBridgeHost(activityContext = scaled), mockk(relaxed = true), mockk(relaxed = true))
    }

    @Test
    fun `the bridge reports the system font scale at the largest setting`() {
        // 2.0 is the top of Android's Display > Font size slider. Poisoned by
        // construction: 1.0 is the value a hardcoded stub would return, and it is
        // exactly the value that means "the reader's setting was thrown away".
        assertEquals(
            2.0f, bridgeAtSystemFontScale(2.0f).getSystemFontScale(), 0.0f,
            "the largest system text size must reach the app, not be flattened to 1"
        )
    }

    @Test
    fun `the bridge reports intermediate system font scales, not just a boolean large`() {
        // Guards the lazy wrong fix — a threshold that returns 1 or 2 would pass the
        // test above and still lose every step in between.
        assertEquals(1.3f, bridgeAtSystemFontScale(1.3f).getSystemFontScale(), 0.0f)
        assertEquals(0.85f, bridgeAtSystemFontScale(0.85f).getSystemFontScale(), 0.0f)
    }

    @Test
    fun `the reader's own requirements are still applied`() {
        // Guards the extraction itself: if the move ever drops one of these, the
        // app boots to a blank page rather than failing loudly.
        val s = applied()
        assertTrue(s.javaScriptEnabled, "the whole UI is JS")
        assertTrue(s.domStorageEnabled, "localStorage carries the state migration")
    }
}
