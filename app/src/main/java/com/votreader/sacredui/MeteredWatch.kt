package com.votreader.sacredui

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import timber.log.Timber

/**
 * Whether the phone's default network is unmetered (Wi-Fi, Ethernet), kept current by a default-network callback, for
 * Download only on Wi-Fi (ra6, OfflineAudioStore). "Wi-Fi" is Android's own sense of it: a metered Wi-Fi (a phone's
 * hotspot) counts as mobile data, and no network at all is not Wi-Fi either, so a waiting download keeps waiting.
 * ACCESS_NETWORK_STATE is already declared (a normal permission, no prompt).
 */
class MeteredWatch(context: Context) {
    private val cm: ConnectivityManager? = context.getSystemService(ConnectivityManager::class.java)

    @Volatile
    private var free: Boolean = try { cm?.let { !it.isActiveNetworkMetered } ?: true } catch (e: Exception) { true }

    /** The default network is unmetered now. */
    fun unmetered(): Boolean = free

    /** Follow the default network; [onChange] runs (on a ConnectivityManager thread) each time the answer flips. */
    fun start(onChange: () -> Unit) {
        val m = cm ?: return
        try {
            m.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    set(unmeteredBy(caps), onChange)
                }

                override fun onLost(network: Network) {
                    set(false, onChange)
                }
            })
        } catch (e: Exception) {
            // Without the callback the first answer stands, and a waiting download re-checks it on its own timer.
            Timber.w(e, "metered watch: the default-network callback could not be registered")
        }
    }

    private fun set(now: Boolean, onChange: () -> Unit) {
        if (now == free) return
        free = now
        try { onChange() } catch (e: Exception) { Timber.w(e, "metered watch: a listener threw") }
    }

    companion object {
        /** Unmetered by these capabilities (a carrier's temporarily unmetered plan counts, from Android 11). */
        fun unmeteredBy(caps: NetworkCapabilities): Boolean =
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                    caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_TEMPORARILY_NOT_METERED))
    }
}
