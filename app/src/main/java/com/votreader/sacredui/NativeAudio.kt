package com.votreader.sacredui

/**
 * m3 (2026-09-24): the page's recording plays in ExoPlayer, not the WebView's <audio>. utils/native-audio.js is a
 * stand-in element the player drives exactly as it drove <audio>; this is the native end of that element, reached
 * through AppInterface's audio* methods. [NativeAudioController] implements it in the app; tests use a fake.
 *
 * Every call arrives from a @JavascriptInterface binder thread and must be cheap and never throw: the implementation
 * posts the work to the main looper, where the MediaController lives. JSON in is untrusted page input.
 */
interface NativeAudioPort {
    /** Point the player at a recording: {url, startMs, rate, volume, autoplay, title, artist, album, upcoming:[...]}. */
    fun load(json: String?)
    fun play()
    fun pause()
    fun seek(positionMs: Long)
    fun rate(rate: Double)
    fun volume(volume: Double)
    /** The recordings to play after the current one without the page: [{url, title, artist, album, rate}], or []. */
    fun upcoming(json: String?)
    /** Stop and let go of the recording (the element's removeAttribute('src') + load()). */
    fun release()
    /** A snapshot the page reads when it comes back on screen: position, state and the seams it may have missed. */
    fun journal(): String
}

/**
 * The decisions the native player makes that need no Android: clamps, the mime a GitHub release asset needs, and the
 * journal of seams crossed without the page. Plain JVM, so JaCoCo measures it.
 */
object NativeAudioLogic {
    /** ExoPlayer's speed range is wider; the app offers 0.5x to 3x (1 % steps). A bad number plays at 1x. */
    fun clampRate(rate: Double): Float =
        if (rate.isFinite() && rate > 0.0) rate.coerceIn(0.25, 4.0).toFloat() else 1f

    fun clampVolume(volume: Double): Float =
        if (volume.isFinite()) volume.coerceIn(0.0, 1.0).toFloat() else 1f

    fun clampStartMs(ms: Long): Long = if (ms > 0L) ms else 0L

    /**
     * GitHub release assets answer `application/octet-stream`, which an <audio> ignores and ExoPlayer would have to
     * sniff; an .mp3 url says what it is. Anything else is left to the extractors (null).
     */
    fun mimeFor(url: String): String? {
        val path = url.substringBefore('?').substringBefore('#').lowercase()
        return when {
            path.endsWith(".mp3") -> "audio/mpeg"
            path.endsWith(".m4a") || path.endsWith(".mp4") || path.endsWith(".aac") -> "audio/mp4"
            path.endsWith(".ogg") || path.endsWith(".opus") -> "audio/ogg"
            else -> null
        }
    }

    /** Only the app's own recordings play natively (the page checks too; native does not trust it). */
    fun playable(url: String?): Boolean =
        url != null && url.length <= MAX_URL && (url.startsWith("https://") ||
            url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost"))

    /** Page text shown on the lock screen and in the notification, bounded. */
    fun label(text: String?): String = (text ?: "").take(MAX_TEXT)

    /** Seam number [seq]: the recording [from] ended and [url] began, natively, at [at] (epoch ms). */
    data class Seam(val seq: Long, val from: String, val url: String, val at: Long)

    /**
     * The last [cap] seams crossed natively, oldest first, each numbered. The page remembers the number of the last
     * one it handled and, back on screen, replays each later one it missed (read credit, forgetting the finished
     * recording's place). A page that slept through more than [cap] seams replays the last [cap].
     */
    class Journal(private val cap: Int = 64) {
        private val seams = ArrayDeque<Seam>()
        private var seq = 0L

        @Synchronized fun add(from: String, url: String, at: Long): Seam {
            val seam = Seam(++seq, from, url, at)
            seams.addLast(seam)
            while (seams.size > cap) seams.removeFirst()
            return seam
        }

        @Synchronized fun last(): Long = seq

        /**
         * Forget the seams (the numbering goes on). At every load by the page: a seam from before it is not this
         * page's to replay (a reloaded page replayed an old "this recording ended" mid-listen, refutation M2).
         */
        @Synchronized fun clear() { seams.clear() }

        @Synchronized fun seams(): List<Seam> = seams.toList()
    }

    /** A JSON string literal; the event and journal JSON is built by hand so this stays plain JVM. */
    fun quote(s: String): String {
        val b = StringBuilder(s.length + 2).append('"')
        for (c in s) when {
            c == '"' -> b.append("\\\"")
            c == '\\' -> b.append("\\\\")
            c == '\n' -> b.append("\\n")
            c == '\r' -> b.append("\\r")
            c == '\t' -> b.append("\\t")
            c < ' ' || c == ' ' || c == ' ' -> b.append(String.format("\\u%04x", c.code))
            else -> b.append(c)
        }
        return b.append('"').toString()
    }

    /** {"k":v,...} from pairs; a String value is quoted, a Boolean or Number written bare, null as null. */
    fun obj(vararg pairs: Pair<String, Any?>): String = pairs.joinToString(",", "{", "}") { (k, v) ->
        quote(k) + ":" + when (v) {
            null -> "null"
            is String -> quote(v)
            is Boolean -> v.toString()
            is Double -> if (v.isFinite()) v.toString() else "0"
            is Float -> if (v.isFinite()) v.toString() else "0"
            is Number -> v.toString()
            is RawJson -> v.json
            else -> quote(v.toString())
        }
    }

    /** A value [obj] writes as-is (a nested object or array already rendered). */
    @JvmInline value class RawJson(val json: String)

    fun seamsJson(seams: List<Seam>): RawJson =
        RawJson(seams.joinToString(",", "[", "]") { obj("seq" to it.seq, "from" to it.from, "url" to it.url, "at" to it.at) })

    const val MAX_URL = 2048
    const val MAX_TEXT = 200
}
