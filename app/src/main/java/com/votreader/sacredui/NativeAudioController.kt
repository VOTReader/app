package com.votreader.sacredui

import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.votreader.sacredui.NativeAudioLogic.obj
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber

/**
 * m3: the app's end of [PlaybackService]. A MediaController on the main looper, connected at the first call (a
 * reader who never listens never starts the service). The page's calls arrive on binder threads; JSON is parsed there
 * and the player work is posted here. Every player edge goes back to the page as one [JsEvent.NativeAudio] JSON
 * string through [emit], plus a 1 Hz tick while playing so the page's clock and resume point stay current with the
 * screen off.
 *
 * The seam: the page hands over the recordings to play next ([upcoming]); ExoPlayer moves into the next one by itself,
 * and this reports a `transition` (and journals it) so the page files the finished recording as heard and adopts the
 * new one. Played items are dropped from the front, so the player's list is always [current, upcoming...].
 */
class NativeAudioController(
    private val context: Context,
    private val emit: (String) -> Unit,
) : NativeAudioPort {

    private val main = Handler(Looper.getMainLooper())
    private var future: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private val pending = ArrayList<(MediaController) -> Unit>()
    /** The speed each recording plays at (songs at 1x, readings at the reading speed), applied at its seam. */
    private val rates = HashMap<String, Float>()
    private val journal = NativeAudioLogic.Journal()
    /** The url playing, and the id of its item: ids are unique per load, so a repeat of one url is still a seam. */
    private var current: String? = null
    private var currentId: String? = null
    private var serial = 0L
    private var reason = 0

    @Volatile private var snapshot = ""

    private class Track(val url: String, val title: String, val artist: String, val album: String, val rate: Float)

    // ── the port (binder threads) ─────────────────────────────────────

    override fun load(json: String?) {
        val o = parse(json) ?: return
        val track = track(o) ?: run { emit(obj("type" to "error", "url" to o.optString("url"), "code" to 0, "name" to "not-playable")); return }
        val next = tracks(o.optJSONArray("upcoming"))
        val startMs = NativeAudioLogic.clampStartMs(o.optLong("startMs"))
        val volume = NativeAudioLogic.clampVolume(o.optDouble("volume", 1.0))
        val autoplay = o.optBoolean("autoplay", false)
        onMain { c ->
            rates.clear()
            (listOf(track) + next).forEach { rates[it.url] = it.rate }
            current = track.url
            val items = (listOf(track) + next).map(::item)
            currentId = items[0].mediaId
            c.setMediaItems(items, 0, startMs)
            c.setPlaybackSpeed(track.rate)
            c.volume = volume
            c.prepare()
            c.playWhenReady = autoplay
            state(c, "state")
        }
    }

    override fun play() = onMain { c ->
        if (c.mediaItemCount == 0) return@onMain
        if (c.playbackState == Player.STATE_IDLE) c.prepare()
        if (c.playbackState == Player.STATE_ENDED) c.seekTo(c.currentMediaItemIndex, 0L)
        c.play()
    }

    override fun pause() = onMain { it.pause() }

    override fun seek(positionMs: Long) = onMain { c ->
        if (c.mediaItemCount > 0) c.seekTo(NativeAudioLogic.clampStartMs(positionMs))
        state(c, "state")
    }

    override fun rate(rate: Double) {
        val r = NativeAudioLogic.clampRate(rate)
        onMain { c -> c.setPlaybackSpeed(r); current?.let { rates[it] = r } }
    }

    override fun volume(volume: Double) {
        val v = NativeAudioLogic.clampVolume(volume)
        onMain { it.volume = v }
    }

    override fun upcoming(json: String?) {
        val next = try { tracks(JSONArray(json ?: "[]")) } catch (e: Exception) { return }
        onMain { c ->
            val i = c.currentMediaItemIndex
            if (c.mediaItemCount == 0 || i < 0) return@onMain
            next.forEach { rates[it.url] = it.rate }
            val have = (i + 1 until c.mediaItemCount).map { urlOf(c.getMediaItemAt(it)) }
            if (have == next.map { it.url }) return@onMain
            if (i + 1 < c.mediaItemCount) c.removeMediaItems(i + 1, c.mediaItemCount)
            if (next.isNotEmpty()) c.addMediaItems(next.map(::item))
        }
    }

    override fun release() = onMain { c ->
        c.stop()
        c.clearMediaItems()
        rates.clear()
        current = null
        currentId = null
        state(c, "state")
    }

    override fun journal(): String = snapshot

    /** The Activity is going: stop (the page that owns the queue goes with it) and let the service go. */
    fun shutdown() = main.post {
        main.removeCallbacks(ticker)
        controller?.let { it.removeListener(listener); it.stop(); it.clearMediaItems() }
        future?.let { MediaController.releaseFuture(it) }
        future = null
        controller = null
        pending.clear()
    }

    // ── main looper ───────────────────────────────────────────────────

    private fun onMain(block: (MediaController) -> Unit) {
        main.post {
            val c = controller
            if (c != null) run(c, block) else { pending += block; connect() }
        }
    }

    private fun run(c: MediaController, block: (MediaController) -> Unit) {
        try { block(c) } catch (e: Exception) { Timber.w(e, "native audio: a player call threw") }
    }

    private fun connect() {
        if (future != null) return
        val f = MediaController.Builder(context, SessionToken(context, ComponentName(context, PlaybackService::class.java)))
            .buildAsync()
        future = f
        f.addListener({
            try {
                val c = f.get()
                controller = c
                c.addListener(listener)
                val queued = pending.toList()
                pending.clear()
                queued.forEach { run(c, it) }
            } catch (e: Exception) {
                Timber.w(e, "native audio: could not connect to the playback service")
                future = null
                pending.clear()
                emit(obj("type" to "error", "url" to (current ?: ""), "code" to 0, "name" to "no-service"))
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private val ticker = object : Runnable {
        override fun run() {
            val c = controller ?: return
            if (!c.isPlaying) return
            state(c, "tick")
            main.postDelayed(this, TICK_MS)
        }
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, why: Int) {
            val c = controller ?: return
            val id = mediaItem?.mediaId
            // Dropping the played item from the front is reported as a second transition INTO the same item: one
            // seam, not two (measured on the emulator, m3a look 23:20).
            if (id == currentId) return
            val url = mediaItem?.let(::urlOf)
            currentId = id
            val auto = why == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || why == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT
            if (!auto || url == null) { current = url; return }
            val from = current ?: ""
            current = url
            rates[url]?.let { c.setPlaybackSpeed(it) }
            val seam = journal.add(from, url, System.currentTimeMillis())
            state(c, "transition", "from" to from, "seq" to seam.seq)
            val i = c.currentMediaItemIndex
            if (i > 0) c.removeMediaItems(0, i)
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, why: Int) { reason = why }

        override fun onPlayerError(error: PlaybackException) {
            val c = controller ?: return
            state(c, "error", "code" to error.errorCode, "name" to error.errorCodeName)
        }

        override fun onEvents(player: Player, events: Player.Events) {
            val c = controller ?: return
            if (events.containsAny(
                    Player.EVENT_IS_PLAYING_CHANGED, Player.EVENT_PLAYBACK_STATE_CHANGED,
                    Player.EVENT_PLAY_WHEN_READY_CHANGED, Player.EVENT_PLAYBACK_PARAMETERS_CHANGED,
                )
            ) state(c, "state")
            main.removeCallbacks(ticker)
            if (c.isPlaying) main.postDelayed(ticker, TICK_MS)
        }
    }

    /** Emit one event and refresh the journal snapshot the page reads on its return. */
    private fun state(c: MediaController, type: String, vararg extra: Pair<String, Any?>) {
        val dur = c.duration.takeIf { it != C.TIME_UNSET && it > 0L } ?: 0L
        val base = arrayOf(
            "type" to type,
            "url" to (c.currentMediaItem?.let(::urlOf) ?: ""),
            "pos" to c.currentPosition.coerceAtLeast(0L),
            "dur" to dur,
            "buf" to c.bufferedPosition.coerceAtLeast(0L),
            "rate" to c.playbackParameters.speed,
            "playing" to c.isPlaying,
            "want" to c.playWhenReady,
            "buffering" to (c.playbackState == Player.STATE_BUFFERING),
            "ended" to (c.playbackState == Player.STATE_ENDED),
            "idle" to (c.playbackState == Player.STATE_IDLE),
            "reason" to reason,
            "last" to journal.last(),
        )
        val json = obj(*base, *extra)
        snapshot = obj(*base, "seams" to NativeAudioLogic.seamsJson(journal.seams()))
        emit(json)
    }

    // ── page JSON (untrusted) ─────────────────────────────────────────

    private fun parse(json: String?): JSONObject? = try { JSONObject(json ?: "") } catch (e: Exception) { null }

    private fun track(o: JSONObject?): Track? {
        val url = o?.optString("url")?.takeIf { NativeAudioLogic.playable(it) } ?: return null
        return Track(
            url,
            NativeAudioLogic.label(o.optString("title")),
            NativeAudioLogic.label(o.optString("artist")),
            NativeAudioLogic.label(o.optString("album")),
            NativeAudioLogic.clampRate(o.optDouble("rate", 1.0)),
        )
    }

    private fun tracks(a: JSONArray?): List<Track> =
        if (a == null) emptyList() else (0 until minOf(a.length(), MAX_UPCOMING)).mapNotNull { track(a.optJSONObject(it)) }

    /** The recording's url: carried in the request metadata (the id is "<serial>|<url>"). */
    private fun urlOf(item: MediaItem): String = item.requestMetadata.mediaUri?.toString() ?: item.mediaId.substringAfter('|')

    private fun item(t: Track): MediaItem = MediaItem.Builder()
        .setMediaId("${++serial}|${t.url}")
        .setUri(t.url)
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(t.url.toUri()).build())
        .setMediaMetadata(
            MediaMetadata.Builder().setTitle(t.title).setArtist(t.artist).setAlbumTitle(t.album.ifEmpty { null }).build(),
        )
        .build()

    private companion object {
        const val TICK_MS = 1_000L
        const val MAX_UPCOMING = 4
    }
}
