package com.votreader.sacredui

import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.net.toUri
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * W57 (sweep 2026-10-13): About's "Privacy policy" (https://votreader.github.io/app/privacy.html) is an address this
 * app claims (the n6-15 App Link), so a plain ACTION_VIEW came back to this package and showed nothing. BrowserLink
 * sends it to a browser: its selector is a web address our manifest does not claim.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BrowserLinkTest {
    private val privacy = "https://votreader.github.io/app/privacy.html"
    private val pm: PackageManager get() = ApplicationProvider.getApplicationContext<android.app.Application>().packageManager
    private val ours: String get() = ApplicationProvider.getApplicationContext<android.app.Application>().packageName

    private fun matchesUs(intent: Intent): Boolean =
        pm.queryIntentActivities(intent, 0).any { it.activityInfo.packageName == ours }

    @Test
    fun `a plain VIEW of the privacy page is ours - the loop`() {
        val plain = Intent(Intent.ACTION_VIEW, privacy.toUri()).addCategory(Intent.CATEGORY_BROWSABLE)
        assertTrue(matchesUs(plain), "the manifest's App Link filter claims /app/privacy.html")
    }

    @Test
    fun `the browser intent keeps the address and is chosen by a selector we never match`() {
        val intent = BrowserLink.viewIntent(privacy.toUri())
        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals(privacy, intent.dataString)
        assertTrue(intent.hasCategory(Intent.CATEGORY_BROWSABLE))
        val selector = assertNotNull(intent.selector)
        assertEquals(Intent.ACTION_VIEW, selector.action)
        assertTrue(selector.hasCategory(Intent.CATEGORY_BROWSABLE))
        assertFalse(SharedLink.isAppLink(selector.dataString), "the selector is no address of ours")
        assertFalse(matchesUs(selector), "so Android never resolves it to this package")
    }
}
