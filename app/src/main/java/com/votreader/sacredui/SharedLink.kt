package com.votreader.sacredui

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder

/**
 * n6-15 (sweep 2): a shared passage link opens the installed app.
 *
 * Share puts `https://votreader.github.io/app/?p=<key>` under a quote (utils/passage-link.js). The manifest's
 * autoVerify VIEW filter, verified by the site root's `/.well-known/assetlinks.json` (repo VOTReader/VOTReader.github.io,
 * this APK's signing-key SHA-256), sends that link here instead of the browser. MainActivity boots the page with the key
 * ([bootUrl]) or, when the app is already open, hands it to the running page ([openInPageJs]).
 *
 * The key is read with the page's own rule (passage-link.js PUBLIC_KEY), so what the page would refuse never reaches it,
 * and a key can only ever hold `[A-Za-z0-9._:-]`: safe inside the JS string [openInPageJs] builds.
 */
object SharedLink {
    const val HOST = "votreader.github.io"
    const val PAGE = "https://appassets.androidplatform.net/assets/index.html"

    // Mirror of passage-link.js PUBLIC_KEY; keep the two in step.
    private val PUBLIC_KEY = Regex(
        "^(?:bible:[a-z0-9-]{2,40}:\\d{1,3}:\\d{1,3}|study:[a-z0-9-]{2,60}:[a-z0-9-]{1,16}" +
            "|(?:letter|wtlb|blessed|holy-days):[A-Za-z0-9._-]{1,120}:\\d{1,4})$",
    )
    private val RANGE = Regex(":\\d+-\\d+$")

    /** The public passage key a shared link carries, or null for any other address. */
    fun keyOf(url: String?): String? {
        if (url.isNullOrBlank()) return null
        val uri = try { URI(url) } catch (_: Exception) { return null }
        if (!"https".equals(uri.scheme, ignoreCase = true)) return null
        if (!HOST.equals(uri.host, ignoreCase = true)) return null
        val path = uri.rawPath ?: ""
        if (path != "/app" && !path.startsWith("/app/")) return null
        val raw = uri.rawQuery ?: return null
        val p = raw.split('&').firstOrNull { it.startsWith("p=") }?.substring(2) ?: return null
        val key = try { URLDecoder.decode(p, "UTF-8") } catch (_: Exception) { return null }.replace(RANGE, "")
        return if (PUBLIC_KEY.matches(key)) key else null
    }

    /** The page's boot address, carrying the key the way openSharedPassage reads it. */
    fun bootUrl(key: String?): String = if (key == null) PAGE else PAGE + "?p=" + URLEncoder.encode(key, "UTF-8")

    /** JS for the running page: opens [key] through its hook; evaluates to false when the hook is not there yet. */
    fun openInPageJs(key: String): String {
        require(PUBLIC_KEY.matches(key)) { "SharedLink: not a public key" }
        return "(function(){var f=window.__votOpenSharedPassage;if(typeof f!=='function')return false;" +
            "return f('$key')===true;})()"
    }
}
