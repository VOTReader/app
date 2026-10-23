package com.votreader.sacredui

import android.annotation.SuppressLint
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import org.json.JSONObject
import timber.log.Timber
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.Executors

/**
 * sy4-3: song votes from the APK send with the app closed (Corbin 2026-10-22, DECISIONS "Song voting": "Votes queue
 * offline and send when online even with the app closed").
 *
 * The page (utils/song-votes.js) hands each vote to [queue] (AppInterface.queueSongVote): only a like or the clearing
 * of one ({install, song, v: 1|0, at, traits}); a thumbs-down never leaves the phone and never reaches here. The
 * outbox is private SharedPreferences keyed by song (the latest vote per song wins). One persisted job with a network
 * constraint ([SongVoteJob], JobScheduler: the platform scheduler WorkManager itself runs on, with no library added
 * to the APK) posts them to the votes Worker when there is a connection, survives a reboot, and is rescheduled with
 * the system's backoff while anything is left. The Worker is idempotent per (install, song, at), so a resend is
 * harmless: 2xx and 400 (malformed, it will never take it) leave the outbox; 429, 5xx and no network keep it.
 *
 * [installId] is the per-install id the votes carry: ANDROID_ID (per app signing key and user, so it survives a
 * reinstall), salted and hashed, never sent raw.
 */
object SongVotes {
    const val VOTE_URL = "https://votes.votreader.workers.dev/v1/vote"
    const val JOB_ID = 7311
    private const val PREFS = "song_votes_outbox"
    private const val MAX_QUEUED = 2000
    private const val MAX_AGE_MS = 89L * 24 * 3600 * 1000
    private val SONG = Regex("^[0-9a-f]{12}$")
    private val INSTALL = Regex("^[A-Za-z0-9_-]{16,64}$")

    /** The hashed install id ("" when the platform gives none). */
    @SuppressLint("HardwareIds")
    fun installId(context: Context): String {
        val raw = try { Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) } catch (e: Exception) { null }
        return idFrom(raw)
    }

    /** ANDROID_ID -> 32 base64url characters of SHA-256("votreader-song-votes|" + id); "" for none. */
    fun idFrom(androidId: String?): String {
        if (androidId.isNullOrBlank()) return ""
        val d = MessageDigest.getInstance("SHA-256").digest(("votreader-song-votes|$androidId").toByteArray(Charsets.UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(d).substring(0, 32)
    }

    /** A vote body the Worker would accept, or null. */
    fun parse(json: String?): JSONObject? {
        if (json.isNullOrBlank() || json.length > 1000) return null
        return try {
            val o = JSONObject(json)
            val v = o.optInt("v", -1)
            val ok = INSTALL.matches(o.optString("install")) && SONG.matches(o.optString("song")) &&
                (v == 0 || v == 1) && o.optLong("at", 0L) > 0L
            if (ok) o else null
        } catch (e: Exception) { null }
    }

    /** Keep a vote (the latest per song) and ask for a send when there is a network. False when it is not a vote. */
    fun queue(context: Context, json: String?): Boolean {
        val o = parse(json) ?: return false
        val p = prefs(context)
        if (p.all.size >= MAX_QUEUED && !p.contains(o.getString("song"))) return false
        p.edit().putString(o.getString("song"), o.toString()).apply()
        schedule(context)
        return true
    }

    /** The waiting votes, oldest first. */
    fun pending(context: Context): List<JSONObject> =
        prefs(context).all.values.mapNotNull { parse(it as? String) }.sortedBy { it.optLong("at") }

    fun schedule(context: Context) {
        val js = context.getSystemService(JobScheduler::class.java) ?: return
        val job = JobInfo.Builder(JOB_ID, ComponentName(context, SongVoteJob::class.java))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .setBackoffCriteria(60_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .build()
        try { js.schedule(job) } catch (e: Exception) { Timber.w(e, "song votes: could not schedule the send") }
    }

    /** What one answer means: "sent", "drop" or "keep". */
    fun outcome(status: Int): String = when {
        status in 200..299 -> "sent"
        status == 400 -> "drop"
        else -> "keep"
    }

    /**
     * Send what waits, oldest first; stop at the first one kept (no network, 429, 5xx). True when the outbox is empty.
     * [post] returns the HTTP status, or -1 for no answer (tests pass their own).
     */
    fun drain(context: Context, now: Long = System.currentTimeMillis(), post: (String) -> Int = ::httpPost): Boolean {
        val p = prefs(context)
        for (o in pending(context)) {
            val r = if (now - o.optLong("at") > MAX_AGE_MS) "drop" else outcome(post(o.toString()))
            if (r == "keep") return false
            // Remove it unless a newer vote for the song took its place meanwhile.
            val song = o.getString("song")
            val cur = parse(p.getString(song, null))
            if (cur != null && cur.optLong("at") == o.optLong("at") && cur.optInt("v") == o.optInt("v")) p.edit().remove(song).apply()
        }
        return p.all.isEmpty()
    }

    private fun httpPost(body: String): Int {
        var c: HttpURLConnection? = null
        return try {
            c = (URL(VOTE_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 15_000
                doOutput = true
                useCaches = false
                setRequestProperty("Content-Type", "application/json")
            }
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            c.responseCode
        } catch (e: Exception) {
            -1
        } finally {
            c?.disconnect()
        }
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}

/** The job [SongVotes.schedule] asks for: runs with a network, posts the outbox off the main thread. */
class SongVoteJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        val app = applicationContext
        EXEC.execute {
            val done = try { SongVotes.drain(app) } catch (e: Exception) { Timber.w(e, "song votes: send failed"); false }
            jobFinished(params, !done)
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true

    private companion object {
        val EXEC = Executors.newSingleThreadExecutor()
    }
}
