package com.votreader.sacredui

import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import timber.log.Timber
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * android-kotlin-4 — VOTReaderApp.onCreate must plant [BoundedLogTree] on EVERY
 * variant, not only the release one.
 *
 * The bug it pins: onCreate was an either/or (`if (BuildConfig.DEBUG) plant
 * DebugTree else plant BoundedLogTree`), so on a debug build — the build a
 * tester actually installs — VOTReaderApp.releaseTree stayed null and
 * AppInterface.getCrashLog returned "[]" forever. SettingsScreen's "Your Data"
 * export advertises a merged native + JS diagnostic tail; the native half was
 * structurally empty there, hiding every native WARN/ERROR (renderer death,
 * failed export write, refused recording name).
 *
 * These tests run on the DEBUG variant, which is what makes them meaningful:
 * unit tests always build `debug`, so the first assertion in each test asserts
 * that fact as a control — if BuildConfig.DEBUG were ever false here the tests
 * would be exercising the branch that was never broken, and passing for the
 * wrong reason.
 *
 * @Config pins SDK=Q to match the rest of the Kotlin suite. Robolectric's own
 * application instance is reused, but every test uproots the forest and nulls
 * releaseTree BEFORE calling onCreate, so nothing here can pass on state left
 * behind by Robolectric's automatic onCreate or by another test class (both
 * AppInterfaceTest and this file write the same global).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class VOTReaderAppLogTreeTest {

    /** Plant nothing and hold nothing across tests — [Timber] and
     *  [VOTReaderApp.releaseTree] are both process-global. */
    private fun freshApp(): VOTReaderApp {
        assertTrue(
            BuildConfig.DEBUG,
            "control: unit tests must build the debug variant, or these tests " +
                "exercise the branch that was never broken",
        )
        Timber.uprootAll()
        VOTReaderApp.releaseTree = null
        val app = ApplicationProvider.getApplicationContext<VOTReaderApp>()
        app.onCreate()
        return app
    }

    @After
    fun tearDown() {
        Timber.uprootAll()
        VOTReaderApp.releaseTree = null
    }

    @Test
    fun `onCreate plants the BoundedLogTree on the debug variant too`() {
        freshApp()

        assertNotNull(
            VOTReaderApp.releaseTree,
            "releaseTree must hold the planted buffer — getCrashLog reads it",
        )
        assertTrue(
            Timber.forest().any { it is BoundedLogTree },
            "BoundedLogTree must be in the forest, or nothing feeds the buffer",
        )
    }

    @Test
    fun `debug still gets the DebugTree as well`() {
        freshApp()

        // The control on the fix: planting the buffer must not cost the Logcat
        // tree that chrome://inspect debugging relies on. Timber supports both.
        assertTrue(
            Timber.forest().any { it is Timber.DebugTree },
            "DebugTree must still be planted on debug",
        )
    }

    @Test
    fun `a warning logged after onCreate is readable through getCrashLog`() {
        freshApp()

        Timber.w("android-kotlin-4 probe")
        val json = VOTReaderApp.releaseTree!!.toJson()

        assertTrue(
            json.contains("android-kotlin-4 probe"),
            "the WARN must reach the buffer the export reads; got: $json",
        )
    }

    @Test
    fun `the WARN floor still holds — an info line is not captured`() {
        freshApp()

        Timber.i("info noise")

        // Poison control for the test above: if the buffer swallowed everything,
        // "a warning is readable" would pass against a tree with no level filter.
        assertTrue(
            VOTReaderApp.releaseTree!!.toJson() == "[]",
            "INFO must not be captured; got: ${VOTReaderApp.releaseTree!!.toJson()}",
        )
    }
}
