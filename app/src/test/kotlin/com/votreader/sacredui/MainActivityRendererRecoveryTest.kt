package com.votreader.sacredui

import android.os.Build
import android.os.Looper
import android.view.View
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

/**
 * What the page set on the window must not outlive the page. A renderer death reloads it fresh
 * (onRenderProcessGone), and the fresh page boots believing the system bars are showing: its
 * fullscreen double-tap state lives in memory (use-fullscreen-gesture.js), and GardenView and
 * Scripture Web clear immersive mode only from an unmount that never runs once the renderer is
 * gone. So a renderer death in fullscreen or in the Garden left the bars hidden on whatever screen
 * the page came back to, and the next fullscreen double-tap seemed to do nothing.
 *
 * SDK Q: WindowInsetsControllerCompat hides the bars there through the decor view's system UI
 * flags, which the test can read back. The renderer death goes through the WebView client, as
 * the WebView itself delivers it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class MainActivityRendererRecoveryTest {

    @Suppress("DEPRECATION")
    private val barsHidden = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION

    @Suppress("DEPRECATION")
    private fun hiddenBars(activity: MainActivity) = activity.window.decorView.systemUiVisibility and barsHidden

    @Test
    fun `a renderer death in fullscreen gives the fresh page its system bars back`() {
        val activity = Robolectric.buildActivity(MainActivity::class.java).create().start().resume().visible().get()
        activity.applyImmersiveMode(true)
        assertEquals(barsHidden, hiddenBars(activity), "precondition: fullscreen hides both bars")

        val wv = activity.activeWebView
        wv.webViewClient.onRenderProcessGone(wv, null)
        shadowOf(Looper.getMainLooper()).idle()

        assertEquals(
            0, hiddenBars(activity),
            "the fresh page boots believing the bars are showing; left hidden, its first fullscreen double-tap " +
                "seems to do nothing",
        )
    }

    @Test
    fun `control - a renderer death outside fullscreen leaves the bars showing`() {
        val activity = Robolectric.buildActivity(MainActivity::class.java).create().start().resume().visible().get()
        val wv = activity.activeWebView
        wv.webViewClient.onRenderProcessGone(wv, null)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(0, hiddenBars(activity))
    }
}
