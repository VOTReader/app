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
}
