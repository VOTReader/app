package com.votreader.sacredui

import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * n6-15: a shared passage link opens the installed app. MainActivity declares an autoVerify VIEW filter for
 * https://votreader.github.io/app (verified by the site root's /.well-known/assetlinks.json, repo
 * VOTReader/VOTReader.github.io), and only for /app: the songs' pages and files stay the browser's.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ManifestAppLinksTest {
    private fun handlers(url: String): List<String> {
        val app: Application = ApplicationProvider.getApplicationContext()
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(app.packageName)
        return app.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY).map { it.activityInfo.name }
    }

    @Test
    fun `a shared passage link resolves to MainActivity`() {
        assertEquals(listOf(MainActivity::class.java.name), handlers("https://votreader.github.io/app/?p=bible%3Ajohn%3A3%3A16"))
        assertEquals(listOf(MainActivity::class.java.name), handlers("https://votreader.github.io/app?p=bible:john:3:16"))
    }

    @Test
    fun `other addresses on the host stay the browser's`() {
        assertTrue(handlers("https://votreader.github.io/songs/catalog.json").isEmpty())
        assertTrue(handlers("https://votreader.github.io/songs-1/3fa9c1d2e4b5.mp3").isEmpty())
        assertTrue(handlers("https://votreader.github.io/").isEmpty())
        assertTrue(handlers("http://votreader.github.io/app/").isEmpty())
    }

    @Test
    fun `the app's own page resolves to MainActivity in every shape a link carries`() {
        // A shared passage (passage-link.js PUBLIC_APP_URL + ?p=), the bare app address, and the PWA's
        // start_url (./index.html), with or without a key.
        val app = listOf(MainActivity::class.java.name)
        assertEquals(app, handlers("https://votreader.github.io/app/"))
        assertEquals(app, handlers("https://votreader.github.io/app"))
        assertEquals(app, handlers("https://votreader.github.io/app/index.html"))
        assertEquals(app, handlers("https://votreader.github.io/app/index.html?p=bible%3Ajohn%3A3%3A16"))
    }

    @Test
    fun `the site's other pages under app stay the browser's`() {
        // W57 sent About's Privacy policy link to a browser from inside the app. Tapped anywhere
        // else (a mail, a message, the site), the /app/ prefix claim still opened VOTReader, which
        // found no passage key and showed nothing: the privacy page never appeared.
        assertTrue(handlers("https://votreader.github.io/app/privacy.html").isEmpty())
        assertTrue(handlers("https://votreader.github.io/app/icons/icon-512.png").isEmpty())
        assertTrue(handlers("https://votreader.github.io/app/offline.html").isEmpty())
    }
}
