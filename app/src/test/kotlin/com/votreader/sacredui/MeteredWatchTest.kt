package com.votreader.sacredui

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowNetwork
import org.robolectric.shadows.ShadowNetworkCapabilities
import io.mockk.every
import io.mockk.mockk
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Item 11: MeteredWatch — whether the default network is unmetered, kept current by a
 * default-network callback. The shadow answers are pinned as the shadow answers, not device
 * behaviour: ShadowConnectivityManager defaults to isActiveNetworkMetered TRUE and an
 * activeNetwork of Network(0), so a fresh watch starts unmetered() == false and
 * online() == true. The online half is a shadow artifact — on a real device with no
 * network, activeNetwork is null and online() is false.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class MeteredWatchTest {

    private val application: Application = ApplicationProvider.getApplicationContext()

    @Test
    fun `fresh watch starts metered and online under the shadow defaults`() {
        val watch = MeteredWatch(application)
        assertFalse(watch.unmetered(), "shadow isActiveNetworkMetered defaults to true")
        // Shadow default activeNetwork is Network(0), not null — see the class doc.
        assertTrue(watch.online())
    }

    @Test
    fun `start registers one default-network callback`() {
        val cm = application.getSystemService(ConnectivityManager::class.java)!!
        val watch = MeteredWatch(application)
        watch.start {}
        assertEquals(1, shadowOf(cm).networkCallbacks.size)
    }

    @Test
    fun `callback flips free and up, moved flag, no-fire repeat`() {
        val cm = application.getSystemService(ConnectivityManager::class.java)!!
        val watch = MeteredWatch(application)
        var fired = 0
        watch.start { fired++ }
        val network = ShadowNetwork.newInstance(1)
        val cb = shadowOf(cm).networkCallbacks.first()
        // NOT_METERED caps: up flips false->true (moved), free flips false->true.
        val caps = ShadowNetworkCapabilities.newInstance()
        shadowOf(caps).addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        cb.onCapabilitiesChanged(network, caps)
        assertTrue(watch.unmetered())
        assertTrue(watch.online())
        assertEquals(1, fired)
        // Lost: up flips true->false (moved), free drops to false.
        cb.onLost(network)
        assertFalse(watch.unmetered())
        assertFalse(watch.online())
        assertEquals(2, fired)
        // Bare caps: up flips false->true (moved), free stays false — still fires.
        val bare = ShadowNetworkCapabilities.newInstance()
        cb.onCapabilitiesChanged(network, bare)
        assertFalse(watch.unmetered())
        assertTrue(watch.online())
        assertEquals(3, fired)
        // Same bare caps again: nothing flips, nothing fires.
        cb.onCapabilitiesChanged(network, bare)
        assertEquals(3, fired)
    }

    @Test
    fun `throwing listener is swallowed and the watch state still moves`() {
        val cm = application.getSystemService(ConnectivityManager::class.java)!!
        val watch = MeteredWatch(application)
        watch.start { throw IllegalStateException("boom") }
        val network = ShadowNetwork.newInstance(1)
        val cb = shadowOf(cm).networkCallbacks.first()
        // Flip free true first, so the lost below actually runs the listener.
        val caps = ShadowNetworkCapabilities.newInstance()
        shadowOf(caps).addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        cb.onCapabilitiesChanged(network, caps)
        assertTrue(watch.unmetered())
        // Lost: the listener throws, the swallow keeps the state move.
        cb.onLost(network)
        assertFalse(watch.unmetered())
        assertFalse(watch.online())
    }

    @Test
    fun `no connectivity manager reads as unmetered and offline, start is a no-op`() {
        val noCm = mockk<Context> {
            every { getSystemService(ConnectivityManager::class.java) } returns null
        }
        val watch = MeteredWatch(noCm)
        assertTrue(watch.unmetered())
        assertFalse(watch.online())
        watch.start { throw IllegalStateException("must not run") }
    }

    @Test
    fun `unmeteredBy counts NOT_METERED only at SDK Q`() {
        val free = ShadowNetworkCapabilities.newInstance()
        shadowOf(free).addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        assertTrue(MeteredWatch.unmeteredBy(free))
        val bare = ShadowNetworkCapabilities.newInstance()
        assertFalse(MeteredWatch.unmeteredBy(bare))
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.R])
    fun `unmeteredBy counts TEMPORARILY_NOT_METERED from Android R`() {
        val temp = ShadowNetworkCapabilities.newInstance()
        shadowOf(temp).addCapability(NetworkCapabilities.NET_CAPABILITY_TEMPORARILY_NOT_METERED)
        assertTrue(MeteredWatch.unmeteredBy(temp))
        val bare = ShadowNetworkCapabilities.newInstance()
        assertFalse(MeteredWatch.unmeteredBy(bare))
    }
}
