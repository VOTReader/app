package com.votreader.sacredui

import android.content.res.Configuration
import android.os.Looper
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.util.ReflectionHelpers
import org.robolectric.util.ReflectionHelpers.ClassParameter
import java.util.Locale
import kotlin.test.assertFalse
import kotlin.test.assertSame

/**
 * Configuration changes MainActivity rides through in place. A recreation runs onDestroy's teardown: the memo
 * being recorded (paused as the reader left for Settings) is cancelled and its file deleted, the native player
 * shuts down mid-letter, and the page reloads. Sweep W14 declared font size, display size and language for that
 * reason; Bold text (fontWeightAdjustment, Android 12+), the switch beside Font size on the same Settings screen,
 * was left out, and so were the other changes a phone can send (color mode, grammatical gender, touchscreen).
 *
 * Driven through the real onCreate and Robolectric's configurationChange, which keeps the activity only when the
 * manifest's configChanges (parsed from the binary manifest by the framework's own PackageParser) covers every
 * changed bit, and otherwise recreates it the way Android does.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MainActivityConfigChangeTest {

    private fun assertRidesThrough(what: String, change: Configuration.() -> Unit) {
        val controller = Robolectric.buildActivity(MainActivity::class.java).create().start().resume().visible()
        val activity = controller.get()
        val next = Configuration(activity.resources.configuration).apply(change)
        controller.configurationChange(next)
        shadowOf(Looper.getMainLooper()).idle()
        assertSame(
            activity, controller.get(),
            "$what recreated MainActivity: its onDestroy cancels the memo being recorded, stops the letter " +
                "playing and reloads the page",
        )
        assertFalse(activity.isDestroyed, "$what destroyed MainActivity")
    }

    @Test
    fun `Bold text (font weight) does not recreate the reader`() =
        assertRidesThrough("Bold text") { fontWeightAdjustment = 300 }

    @Test
    fun `a color mode change (wide color gamut, HDR) does not recreate the reader`() =
        assertRidesThrough("A color mode change") {
            colorMode = Configuration.COLOR_MODE_WIDE_COLOR_GAMUT_YES or Configuration.COLOR_MODE_HDR_YES
        }

    @Test
    fun `a grammatical gender change does not recreate the reader`() =
        assertRidesThrough("A grammatical gender change") {
            // The setter is hidden in the SDK stubs; Settings > Languages sets it on Android 14+.
            ReflectionHelpers.callInstanceMethod<Unit>(
                this, "setGrammaticalGender",
                ClassParameter.from(Int::class.javaPrimitiveType, Configuration.GRAMMATICAL_GENDER_FEMININE),
            )
        }

    @Test
    fun `a touchscreen change does not recreate the reader`() =
        assertRidesThrough("A touchscreen change") { touchscreen = Configuration.TOUCHSCREEN_NOTOUCH }

    // ── controls: what W14 already declared still rides through ──

    @Test
    fun `control - font size, dark mode, rotation, display size and language still do not recreate it`() {
        assertRidesThrough("Font size") { fontScale = 1.3f }
        assertRidesThrough("Dark mode") {
            uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
                if ((uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES) {
                    Configuration.UI_MODE_NIGHT_NO
                } else {
                    Configuration.UI_MODE_NIGHT_YES
                }
        }
        assertRidesThrough("Rotation") {
            orientation = if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
                Configuration.ORIENTATION_PORTRAIT
            } else {
                Configuration.ORIENTATION_LANDSCAPE
            }
            val w = screenWidthDp
            screenWidthDp = screenHeightDp
            screenHeightDp = w
        }
        assertRidesThrough("Display size") { densityDpi += 40 }
        assertRidesThrough("Language") { setLocale(Locale.forLanguageTag("es-MX")) }
    }
}
