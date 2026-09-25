package com.votreader.sacredui

import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * n6-15 (sweep 2): a shared passage link (https://votreader.github.io/app/?p=<key>, utils/passage-link.js) opens the
 * installed app. SharedLink reads the key out of the VIEW intent's address with the page's own rules, so a link the
 * page would refuse never reaches it, and builds the two ways in (the boot URL, the running page's hook).
 */
class SharedLinkTest {
    @Test
    fun `reads the key a shared link carries`() {
        assertEquals("bible:john:3:16", SharedLink.keyOf("https://votreader.github.io/app/?p=bible%3Ajohn%3A3%3A16"))
        assertEquals("bible:john:3:16", SharedLink.keyOf("https://votreader.github.io/app/?p=bible:john:3:16"))
        assertEquals("letter:c62-regarding-spiritual-gifts:12",
            SharedLink.keyOf("https://votreader.github.io/app/index.html?utm=x&p=letter%3Ac62-regarding-spiritual-gifts%3A12#top"))
        assertEquals("study:lamb-of-god-1:b3", SharedLink.keyOf("https://VOTReader.github.io/app?p=study:lamb-of-god-1:b3"))
    }

    @Test
    fun `a selection range on the key is dropped, as the page drops it`() {
        assertEquals("bible:john:3:16", SharedLink.keyOf("https://votreader.github.io/app/?p=bible:john:3:16:4-20"))
    }

    @Test
    fun `anything else is no shared link`() {
        for (url in listOf(
            null, "", "not a url",
            "https://votreader.github.io/app/",                                   // no key: just the app
            "https://votreader.github.io/app/?p=",                                 // empty
            "https://votreader.github.io/app/?p=journal:abc:1",                    // the reader's own writing never travels
            "https://votreader.github.io/app/?p=bible:john:3:16%27);alert(1);//", // not a key
            "http://votreader.github.io/app/?p=bible:john:3:16",                   // not https
            "https://evil.example/app/?p=bible:john:3:16",                         // not our host
            "https://votreader.github.io.evil.example/app/?p=bible:john:3:16",
            "https://votreader.github.io/songs/?p=bible:john:3:16",                // not the app
            "https://votreader.github.io/appx/?p=bible:john:3:16",
        )) assertNull(SharedLink.keyOf(url), "should refuse: $url")
    }

    @Test
    fun `the boot URL carries the key the way the page reads it`() {
        assertEquals("https://appassets.androidplatform.net/assets/index.html?p=bible%3Ajohn%3A3%3A16",
            SharedLink.bootUrl("bible:john:3:16"))
        assertEquals("https://appassets.androidplatform.net/assets/index.html", SharedLink.bootUrl(null))
    }

    @Test
    fun `the running page is asked through its hook, and says whether it was there`() {
        val js = SharedLink.openInPageJs("letter:c62:12")
        assertTrue(js.contains("window.__votOpenSharedPassage"))
        assertTrue(js.contains("'letter:c62:12'"))
        assertTrue(js.contains("return false"))   // no hook yet (page still booting): the caller reloads with the key
        assertFalse(js.contains("\n"))
    }
}
