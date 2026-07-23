package com.votreader.sacredui

import android.app.Application
import android.content.Context
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.test.core.app.ApplicationProvider
import io.mockk.confirmVerified
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * WAVE-0 — haptic USAGE_TOUCH tagging.
 *
 * On API 33+ (the REAL floor of vibrate(VibrationEffect, VibrationAttributes);
 * VibrationAttributes itself exists from 30, the overload only from 33) every
 * haptic must carry VibrationAttributes.USAGE_TOUCH so the system's
 * touch-haptics master toggle can silence it — an untagged vibration is
 * USAGE_UNKNOWN and ignores that setting. Below 33 the one-arg vibrate()
 * path must remain byte-for-byte the pre-fix behaviour.
 *
 * Setup: Robolectric so VibrationAttributes + VibrationEffect are real
 * instrumented classes (plain-JVM android.jar stubs would throw "Stub!").
 * The Vibrator itself is a MockK mock registered as the system service via
 * ShadowApplication.setSystemService, so AppInterface's cached U19 lookup
 * lands on OUR instance and verify { } can pin the exact overload + attrs.
 * SDKs are pinned per-method to cached android-all jars (35 and 29).
 */
@RunWith(RobolectricTestRunner::class)
class AppInterfaceHapticTest {

    private fun newApp(context: Context, vibrator: Vibrator): AppInterface {
        // AppInterface resolves the Vibrator itself from the host context
        // (VibratorManager on S+, the legacy service below it), so register
        // the mock under whichever name the current SDK's lookup will use.
        val app = context as Application
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = mockk<VibratorManager>()
            every { manager.defaultVibrator } returns vibrator
            shadowOf(app).setSystemService(Context.VIBRATOR_MANAGER_SERVICE, manager)
        } else {
            shadowOf(app).setSystemService(Context.VIBRATOR_SERVICE, vibrator)
        }
        val host = FakeBridgeHost(activityContext = context)
        return AppInterface(host, mockk(relaxed = true), mockk(relaxed = true))
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.VANILLA_ICE_CREAM])
    fun `haptic on API 33+ vibrates with USAGE_TOUCH attributes`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val vibrator = mockk<Vibrator>(relaxed = true)
        val app = newApp(context, vibrator)

        app.haptic(1)

        // The attributes-carrying overload must be used, tagged USAGE_TOUCH.
        verify(exactly = 1) {
            vibrator.vibrate(
                any<VibrationEffect>(),
                match<VibrationAttributes> {
                    it.usage == VibrationAttributes.USAGE_TOUCH
                }
            )
        }
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.Q])
    fun `haptic below API 33 keeps the plain one-arg vibrate path`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val vibrator = mockk<Vibrator>(relaxed = true)
        val app = newApp(context, vibrator)

        app.haptic(1)

        // Exactly one vibration, through the legacy one-arg overload, and
        // NOTHING else (confirmVerified pins "no attributes overload used"
        // without referencing the API-33 VibrationAttributes class, which
        // does not exist in the Q android-all jar).
        verify(exactly = 1) { vibrator.vibrate(any<VibrationEffect>()) }
        confirmVerified(vibrator)
    }
}
