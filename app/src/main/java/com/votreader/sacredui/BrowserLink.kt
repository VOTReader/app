package com.votreader.sacredui

import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri

/**
 * W57 (sweep 2026-10-13): open one of this app's own addresses (SharedLink.isAppLink, e.g. the hosted
 * https://votreader.github.io/app/privacy.html) in a BROWSER. A plain ACTION_VIEW resolves to this package (the
 * verified App Link) and loops back into the app; the selector makes Android pick the activity by a web address no
 * app claims but browsers (any https), and the browser it picks gets this intent, address and all.
 */
object BrowserLink {
    /** Any https address on a host nobody verifies: only apps that take every web address match it. */
    const val SELECTOR_URL = "https://example.com/"

    fun viewIntent(uri: Uri): Intent =
        Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).apply {
            selector = Intent(Intent.ACTION_VIEW, SELECTOR_URL.toUri()).addCategory(Intent.CATEGORY_BROWSABLE)
        }
}
