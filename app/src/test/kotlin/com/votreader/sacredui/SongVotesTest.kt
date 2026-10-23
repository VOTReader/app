package com.votreader.sacredui

import android.app.Application
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * sy4-3: the APK's song-vote outbox (Corbin 2026-10-22): the page hands a like or its clearing over, it is kept by
 * song, a persisted network-constrained job sends it with the app closed, and the per-install id comes from
 * ANDROID_ID, hashed.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SongVotesTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val install = "abcdefghijklmnopqrstuv"
    private fun vote(song: String, v: Int, at: Long) =
        """{"install":"$install","song":"$song","v":$v,"at":$at,"traits":{"w":412,"h":915,"dpr":2.63,"tz":"America/Denver"}}"""
    private val now = 1_792_000_000_000L
    private val a = "aaaaaaaaaaaa"
    private val b = "bbbbbbbbbbbb"

    @Before
    fun clear() {
        app.getSharedPreferences("song_votes_outbox", 0).edit().clear().commit()
        app.getSystemService(JobScheduler::class.java).cancelAll()
    }

    @Test
    fun `a vote is kept by song and a network-constrained persisted job is asked for`() {
        assertTrue(SongVotes.queue(app, vote(a, 1, now)))
        assertEquals(listOf(a), SongVotes.pending(app).map { it.getString("song") })
        val job: JobInfo? = app.getSystemService(JobScheduler::class.java).getPendingJob(SongVotes.JOB_ID)
        assertNotNull(job)
        assertEquals(JobInfo.NETWORK_TYPE_ANY, job.networkType)
        assertTrue(job.isPersisted)
    }

    @Test
    fun `only the latest vote per song waits`() {
        SongVotes.queue(app, vote(a, 1, now))
        SongVotes.queue(app, vote(a, 0, now + 5))
        val p = SongVotes.pending(app)
        assertEquals(1, p.size)
        assertEquals(0, p[0].getInt("v"))
    }

    @Test
    fun `refuses anything that is not a like or a clear (a thumbs-down never leaves the phone)`() {
        assertFalse(SongVotes.queue(app, vote(a, -1, now)))
        assertFalse(SongVotes.queue(app, vote("nope", 1, now)))
        assertFalse(SongVotes.queue(app, """{"install":"short","song":"$a","v":1,"at":$now}"""))
        assertFalse(SongVotes.queue(app, "not json"))
        assertFalse(SongVotes.queue(app, null))
        assertTrue(SongVotes.pending(app).isEmpty())
    }

    @Test
    fun `drain posts oldest first and empties on 204`() {
        SongVotes.queue(app, vote(b, 1, now + 10))
        SongVotes.queue(app, vote(a, 1, now))
        val sent = mutableListOf<String>()
        assertTrue(SongVotes.drain(app, now + 20) { body -> sent.add(JSONObject(body).getString("song")); 204 })
        assertEquals(listOf(a, b), sent)
        assertTrue(SongVotes.pending(app).isEmpty())
    }

    @Test
    fun `no network, 429 and 5xx keep the vote and 400 drops it`() {
        SongVotes.queue(app, vote(a, 1, now))
        assertFalse(SongVotes.drain(app, now) { -1 })
        assertFalse(SongVotes.drain(app, now) { 429 })
        assertFalse(SongVotes.drain(app, now) { 503 })
        assertEquals(1, SongVotes.pending(app).size)
        assertTrue(SongVotes.drain(app, now) { 400 })
        assertTrue(SongVotes.pending(app).isEmpty())
    }

    @Test
    fun `a vote too old for the Worker is dropped without a request`() {
        SongVotes.queue(app, vote(a, 1, now))
        var calls = 0
        assertTrue(SongVotes.drain(app, now + 95L * 24 * 3600 * 1000) { calls++; 204 })
        assertEquals(0, calls)
    }

    @Test
    fun `a newer vote queued while one is on the wire is not lost`() {
        SongVotes.queue(app, vote(a, 1, now))
        assertFalse(SongVotes.drain(app, now + 10) { SongVotes.queue(app, vote(a, 0, now + 5)); 204 })
        assertEquals(0, SongVotes.pending(app).single().getInt("v"))
    }

    @Test
    fun `the install id is ANDROID_ID hashed, stable, and fits the Worker's pattern`() {
        Settings.Secure.putString(app.contentResolver, Settings.Secure.ANDROID_ID, "9774d56d682e549c")
        val id = SongVotes.installId(app)
        assertEquals(id, SongVotes.installId(app))
        assertTrue(Regex("^[A-Za-z0-9_-]{16,64}$").matches(id))
        assertFalse(id.contains("9774d56d682e549c"))
        assertNotEquals(SongVotes.idFrom("9774d56d682e549c"), SongVotes.idFrom("0000000000000001"))
        assertEquals("", SongVotes.idFrom(null))
        assertEquals("", SongVotes.idFrom(""))
    }

    @Test
    fun `outcomes`() {
        assertEquals("sent", SongVotes.outcome(204))
        assertEquals("sent", SongVotes.outcome(200))
        assertEquals("drop", SongVotes.outcome(400))
        assertEquals("keep", SongVotes.outcome(429))
        assertEquals("keep", SongVotes.outcome(500))
        assertEquals("keep", SongVotes.outcome(-1))
    }
}
