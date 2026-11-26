package com.votreader.sacredui

import android.app.Application
import android.content.ComponentName
import android.os.Build
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Item 10 - the port surface of NativeAudioController that needs no live
 * MediaController.
 *
 * What this file pins: every call the page can make is cheap and never
 * throws on its binder thread, and the answers it gives synchronously -
 * the not-playable error, the empty journal - are exact. A call that
 * needs the player posts its work to the main looper and, without a
 * controller, queues a connect; that half is asserted only as nothing
 * yet: no emit, no throw, synchronously.
 *
 * What it cannot pin (device walk, like NativeAudioRecorderTest's NK7):
 * anything past a successful connect. A refused connect is pinned (the
 * no-service tests below declare the service unbindable). Under Robolectric the MediaController
 * service bind delivers a null ComponentName, so the Media3 session
 * connection throws NullPointerException when the main looper idles
 * after a connect was triggered - an environment limit, not a
 * controller bug. So no test here idles the main looper after a
 * connect-triggering call; the only idles are after shutdown(), whose
 * posted block never connects (closed makes every later onMain block
 * return early).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class NativeAudioControllerTest {

    private lateinit var application: Application
    private val emitted = ArrayList<String>()
    private lateinit var controller: NativeAudioController

    private val playable = "https://votreader.github.io/songs/x.mp3"
    private val unplayable = "https://example.com/x.mp3"

    @Before
    fun setup() {
        application = ApplicationProvider.getApplicationContext()
        controller = NativeAudioController(application) { emitted += it }
    }

    /** Runs the main looper. Only safe when no connect was triggered (see the class doc). */
    private fun idleMain() = shadowOf(Looper.getMainLooper()).idle()

    private fun loadJson(url: String): String {
        val o = JSONObject()
        o.put("url", url)
        o.put("title", "T")
        o.put("artist", "A")
        o.put("album", "Al")
        o.put("rate", 1.0)
        o.put("volume", 1.0)
        o.put("autoplay", false)
        o.put("startMs", 0)
        o.put("upcoming", JSONArray())
        return o.toString()
    }

    private fun loopJson(): String {
        val o = JSONObject()
        o.put("id", 1)
        o.put("url", playable)
        o.put("startMs", 0)
        o.put("endMs", 10000)
        o.put("times", 2)
        o.put("pass", 1)
        return o.toString()
    }

    // --- load: the synchronous answers ---

    @Test
    fun `load null emits nothing`() {
        controller.load(null)
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `load garbage emits nothing`() {
        controller.load("not json")
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `load empty object emits not-playable with empty url`() {
        controller.load("{}")
        assertEquals(1, emitted.size)
        val o = JSONObject(emitted[0])
        assertEquals("error", o.getString("type"))
        assertEquals("", o.getString("url"))
        assertEquals(0, o.getInt("code"))
        assertEquals("not-playable", o.getString("name"))
    }

    @Test
    fun `load unplayable url emits not-playable with that url`() {
        controller.load(loadJson(unplayable))
        assertEquals(1, emitted.size)
        val o = JSONObject(emitted[0])
        assertEquals("error", o.getString("type"))
        assertEquals(unplayable, o.getString("url"))
        assertEquals(0, o.getInt("code"))
        assertEquals("not-playable", o.getString("name"))
    }

    @Test
    fun `load http url emits not-playable - https only`() {
        controller.load(loadJson("http://votreader.github.io/songs/x.mp3"))
        assertEquals(1, emitted.size)
        assertEquals("not-playable", JSONObject(emitted[0]).getString("name"))
    }

    @Test
    fun `load playable url emits nothing synchronously`() {
        controller.load(loadJson(playable))
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `load with unplayable upcoming entries emits nothing`() {
        val upcoming = JSONArray()
        upcoming.put(JSONObject().put("url", unplayable))
        upcoming.put(JSONObject().put("url", playable))
        val o = JSONObject(loadJson(playable))
        o.put("upcoming", upcoming)
        controller.load(o.toString())
        assertTrue(emitted.isEmpty())
    }

    // --- the other port calls: silent and unthrowing, synchronously ---

    @Test
    fun `play emits nothing synchronously`() {
        controller.play()
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `pause emits nothing synchronously`() {
        controller.pause()
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `seek emits nothing synchronously`() {
        controller.seek(60_000L)
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `rate emits nothing synchronously`() {
        controller.rate(2.0)
        controller.rate(Double.NaN)
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `volume emits nothing synchronously`() {
        controller.volume(0.5)
        controller.volume(Double.NaN)
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `upcoming garbage emits nothing`() {
        controller.upcoming("garbage")
        idleMain()
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `upcoming empty list emits nothing synchronously`() {
        controller.upcoming("[]")
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `meta garbage emits nothing`() {
        controller.meta("not json")
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `meta empty object emits nothing synchronously`() {
        controller.meta("{}")
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `release emits nothing synchronously`() {
        controller.release()
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `loop empty string emits nothing synchronously`() {
        controller.loop("")
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `prewarm emits nothing synchronously`() {
        controller.prewarm()
        assertTrue(emitted.isEmpty())
    }

    @Test
    fun `journal is empty before any state event`() {
        assertEquals("", controller.journal())
    }

    // --- a playback service that cannot be bound (audio-retire-n1) ---
    //
    // Declaring the service's component unbindable makes Robolectric's bindService answer false, so Media3
    // rejects the connection without ever reaching the onServiceConnected path the class doc warns about,
    // and the main looper is safe to idle.

    private fun unbindable() = shadowOf(application)
        .declareComponentUnbindable(ComponentName(application, PlaybackService::class.java))

    @Test
    fun `a service that cannot be reached tells the page no-service`() {
        unbindable()
        controller.load(loadJson(playable))
        idleMain()
        assertEquals(1, emitted.size)
        val o = JSONObject(emitted[0])
        assertEquals("error", o.getString("type"))
        assertEquals("no-service", o.getString("name"))
        assertEquals(0, o.getInt("code"))
        // The load was queued behind the connect and never ran, so no url is playing yet.
        assertEquals("", o.getString("url"))
        assertEquals("", controller.journal())
    }

    @Test
    fun `after a failed connect the next call tries again`() {
        unbindable()
        controller.load(loadJson(playable))
        idleMain()
        controller.play()
        idleMain()
        // A connect left half-open would swallow every later call silently; each call gets its own answer.
        assertEquals(2, emitted.size)
        assertTrue(emitted.all { JSONObject(it).getString("name") == "no-service" })
    }

    // --- after shutdown: everything is a no-op, except the sync error ---

    @Test
    fun `shutdown then load playable emits nothing`() {
        controller.shutdown()
        idleMain()
        controller.load(loadJson(playable))
        idleMain()
        assertTrue(emitted.isEmpty())
        assertEquals("", controller.journal())
    }

    @Test
    fun `shutdown then load unplayable still emits not-playable`() {
        controller.shutdown()
        idleMain()
        controller.load(loadJson(unplayable))
        idleMain()
        assertEquals(1, emitted.size)
        val o = JSONObject(emitted[0])
        assertEquals("not-playable", o.getString("name"))
        assertEquals(unplayable, o.getString("url"))
    }

    @Test
    fun `shutdown then every port call is silent`() {
        controller.shutdown()
        idleMain()
        controller.play()
        controller.pause()
        controller.seek(1_000L)
        controller.rate(1.5)
        controller.volume(0.5)
        controller.upcoming("[]")
        controller.meta("{}")
        controller.release()
        controller.loop(loopJson())
        controller.prewarm()
        idleMain()
        assertTrue(emitted.isEmpty())
        assertEquals("", controller.journal())
    }

    @Test
    fun `shutdown twice is silent`() {
        controller.shutdown()
        idleMain()
        controller.shutdown()
        idleMain()
        assertTrue(emitted.isEmpty())
    }
}
