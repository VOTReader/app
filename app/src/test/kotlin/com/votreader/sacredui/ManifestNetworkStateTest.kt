package com.votreader.sacredui

import android.app.Application
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertTrue

/**
 * Listening item 8 (the refutation of 2026-09-24, MUST 2): WebView keeps navigator.onLine true, and never fires
 * 'offline', unless the app holds ACCESS_NETWORK_STATE (Chromium android_webview StartupTasks). Without it the player's
 * offline gate and the "Needs a connection" rows never engage on the phone. A normal permission: no prompt.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ManifestNetworkStateTest {
    @Test
    fun `the app asks for ACCESS_NETWORK_STATE so the page can tell it has no signal`() {
        val app: Application = ApplicationProvider.getApplicationContext()
        val info = app.packageManager.getPackageInfo(app.packageName, PackageManager.GET_PERMISSIONS)
        val requested = info.requestedPermissions?.toList() ?: emptyList()
        assertTrue("android.permission.ACCESS_NETWORK_STATE" in requested, "requested: $requested")
    }
}
