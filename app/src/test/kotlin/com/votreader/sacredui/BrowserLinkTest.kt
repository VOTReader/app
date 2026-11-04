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
 * W57 (sweep 2026-10-13): About's "Privacy policy" (https://votreader.github.io/app/privacy.html) was an address this
 * app claimed (the n6-15 App Link, then a /app/ prefix), so a plain ACTION_VIEW came back to this package and showed
 * nothing. BrowserLink sends the page's own /app links to a browser: its selector is a web address our manifest does
 * not claim. The manifest now claims only the app's page (/app, /app/, /app/index.html; ManifestAppLinksTest), and a
 * plain VIEW of that still comes straight back: the loop BrowserLink is for.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BrowserLinkTest {
    private val privacy = "https://votreader.github.io/app/privacy.html"
    private val appPage = "https://votreader.github.io/app/"
    private val pm: PackageManager get() = ApplicationProvider.getApplicationContext<android.app.Application>().packageManager
    private val ours: String get() = ApplicationProvider.getApplicationContext<android.app.Application>().packageName

    private fun matchesUs(intent: Intent): Boolean =
        pm.queryIntentActivities(intent, 0).any { it.activityInfo.packageName == ours }

    @Test
    fun `a plain VIEW of the app's own page is ours - the loop`() {
        val plain = Intent(Intent.ACTION_VIEW, appPage.toUri()).addCategory(Intent.CATEGORY_BROWSABLE)
        assertTrue(matchesUs(plain), "the manifest's App Link filter claims the app's page, /app/")
        assertTrue(SharedLink.isAppLink(appPage), "so the page's own link to it takes the browser route")
    }

    @Test
    fun `the privacy page is no longer claimed, and still takes the browser route from inside the app`() {
        val plain = Intent(Intent.ACTION_VIEW, privacy.toUri()).addCategory(Intent.CATEGORY_BROWSABLE)
        assertFalse(matchesUs(plain), "tapped in any other app, the privacy page must open in a browser, not here")
        assertTrue(SharedLink.isAppLink(privacy))
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
