package com.votreader.sacredui

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.annotation.ChecksSdkIntAtLeast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import timber.log.Timber

/**
 * Process anchor for streaming audio-letter playback — and, since 2026-08-09,
 * the app's face on the SYSTEM media surfaces (the Quick Settings media card,
 * lock screen, headset/Bluetooth buttons).
 *
 * WHY THIS EXISTS. Playback lives in the WebView's HTML5 <audio> element, so
 * the only thing keeping it alive was [MainActivity.onPause] skipping
 * `webView.onPause()` while [MainViewModel.streamAudioActive] is true. That
 * survives screen-off, but nothing anchored the PROCESS: a backgrounded
 * activity is an ordinary kill candidate, and under memory pressure Android
 * would reap it mid-letter. A foreground service with
 * `foregroundServiceType="mediaPlayback"` gives the process the same
 * OOM-adjustment protection a native media player gets, and gives the user the
 * standard ongoing-playback notification.
 *
 * ADDITIVE, NOT A REPLACEMENT. The onPause skip is still what keeps the media
 * element itself running; this service only keeps the process around it alive.
 * If the service fails to start (background-start restrictions on API 31+, a
 * denied channel, an OEM quirk) playback still works exactly as it did before —
 * every entry point swallows its own failure and logs at WARN.
 *
 * MEDIA SESSION (owner call 2026-08-09, superseding the earlier "no session"
 * note). The web MediaSession API the player drives is INERT inside a WebView —
 * it never surfaces a system media card, so the APK showed only a bare
 * "Playing audio" line (and on Android 13+ without POST_NOTIFICATIONS, nothing
 * at all). This service now owns a [MediaSessionCompat] + MediaStyle
 * notification, fed by [AppInterface.setAudioNowPlaying] mirroring exactly the
 * metadata the JS player already gives navigator.mediaSession. Transport
 * intent flows the other way through [commandSink] → JsBridge →
 * window.__votMediaCommand — the JS player stays the single source of playback
 * truth; native renders state and forwards intent. Still no media3: playback
 * is the WebView's <audio>; androidx.media's session + style is the whole need.
 *
 * LIFECYCLE. Started from [AppInterface.setAudioActive] via
 * [BridgeHost.setAudioKeepAlive] (edge-triggered by JS — no debounce needed),
 * stopped on the matching `false`, on [MainActivity.onDestroy] (the WebView is
 * destroyed there, so playback is over whether or not JS said so), and on
 * [onTaskRemoved] (swipe-away kills the Activity's WebView; without this the
 * ongoing notification would outlive the audio). Now-playing metadata rides
 * ACTION_UPDATE intents into the same onStartCommand (delivered in call order
 * after the setActive start, so an update can never beat the start).
 *
 * START_NOT_STICKY: the playback intent lives entirely in JS. A service the
 * system restarts with a null intent has nothing to keep alive — it would just
 * post a "Playing audio" notification over silence.
 */
class AudioKeepAliveService : Service() {

    private var session: MediaSessionCompat? = null
    private var artwork: Bitmap? = null

    // Last now-playing snapshot — rendered into the notification + session on
    // every intent. Defaults cover the brief window between the setActive(true)
    // start and the first metadata update.
    private var npTitle: String = "Audio letter"
    private var npArtist: String = "The Volumes of Truth"
    private var npPlaying: Boolean = true
    private var npPositionMs: Long = 0L
    private var npDurationMs: Long = 0L
    private var npRate: Float = 1f

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        // The pending start has landed; `running` is the authority from here.
        // NOT cleared in onDestroy: a new setActive(true) can race an old
        // instance's teardown, and clearing there would wipe the new start's
        // flag and drop its first update all over again.
        startPending = false
        // The QS card's square art. icon-512 ships in assets for the PWA
        // manifest — decode once, reuse for every notification refresh.
        artwork = try {
            assets.open("icons/icon-512.png").use { BitmapFactory.decodeStream(it) }
        } catch (e: Exception) {
            Timber.w(e, "media artwork decode failed — card falls back to app icon"); null
        }
        session = try {
            MediaSessionCompat(this, "VOTReaderAudio").apply {
                setCallback(object : MediaSessionCompat.Callback() {
                    override fun onPlay() { commandSink?.invoke("play", 0L) }
                    override fun onPause() { commandSink?.invoke("pause", 0L) }
                    override fun onSkipToNext() { commandSink?.invoke("next", 0L) }
                    override fun onSkipToPrevious() { commandSink?.invoke("prev", 0L) }
                    override fun onSeekTo(pos: Long) { commandSink?.invoke("seekTo", pos) }
                })
                isActive = true
            }
        } catch (e: Exception) {
            // A session-less service still anchors the process; the card is lost,
            // the audio is not.
            Timber.w(e, "MediaSession create failed — keep-alive continues without a card"); null
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopEverything(); return START_NOT_STICKY }
            // Notification action buttons land here (a PendingIntent can't call
            // the session callback directly); route into the same sink.
            ACTION_CMD -> { commandSink?.invoke(intent.getStringExtra(EXTRA_CMD) ?: "toggle", 0L) }
            ACTION_UPDATE -> {
                npTitle = intent.getStringExtra(EXTRA_TITLE)?.ifBlank { null } ?: npTitle
                npArtist = intent.getStringExtra(EXTRA_ARTIST)?.ifBlank { null } ?: npArtist
                npPlaying = intent.getBooleanExtra(EXTRA_PLAYING, npPlaying)
                npPositionMs = intent.getLongExtra(EXTRA_POSITION_MS, npPositionMs)
                npDurationMs = intent.getLongExtra(EXTRA_DURATION_MS, npDurationMs)
                npRate = intent.getFloatExtra(EXTRA_RATE, npRate)
            }
        }
        try {
            ensureChannel()
            syncSession()
            val notification = buildNotification()
            // FGS-UPDATE (2026-09-01): only ENTER the foreground state when it is
            // required — a start intent (startForegroundService demands a matching
            // startForeground within 5 s) or a PLAYING snapshot. An update or
            // command that lands while PAUSED is a plain startService on an
            // already-started service; calling startForeground there is a
            // background foreground-service start on API 31+ whenever the app is
            // not visible and not on a temp allowlist, which throws
            // ForegroundServiceStartNotAllowedException and — via the catch below —
            // tears the paused card and its session down. notify() alone refreshes
            // the detached card and has no such limit. The DETACH below stays
            // unconditional: the pause EDGE (still attached) needs it, and it is a
            // no-op once detached. Pinned by AudioKeepAliveServiceUpdateTest.
            val enterForeground = intent?.action == null || npPlaying
            if (enterForeground) {
                // API 29+ takes the foreground-service TYPE in the call itself; the
                // manifest declaration alone is what API 26-28 has. From API 34 the
                // typed form is mandatory for mediaPlayback (and is backed by the
                // FOREGROUND_SERVICE_MEDIA_PLAYBACK permission in the manifest).
                // Re-calling startForeground on a PLAYING update is the documented
                // way to refresh a foreground notification — idempotent, not a restart.
                if (usesTypedForeground(Build.VERSION.SDK_INT)) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
            if (!npPlaying) {
                // PAUSED: standard media-app demotion. The service stays up
                // (the paused card's Play button needs the process + WebView
                // alive) but the notification DETACHES from the foreground
                // contract so the user can swipe it away — an FGS-attached
                // notification is not dismissible. The re-notify keeps it
                // visible after the detach; its deleteIntent (ACTION_STOP)
                // makes the swipe stop the service cleanly, and the next
                // playing edge re-foregrounds via setActive(true).
                stopForeground(STOP_FOREGROUND_DETACH)
                try {
                    getSystemService(NotificationManager::class.java)
                        ?.notify(NOTIFICATION_ID, notification)
                } catch (se: SecurityException) {
                    // POST_NOTIFICATIONS denied on 13+ — card hidden, session
                    // (lock screen / headset) still live.
                    Timber.w(se, "paused-card notify blocked (no notification permission)")
                }
            }
        } catch (e: Throwable) {
            // startForeground can throw ForegroundServiceStartNotAllowedException
            // (API 31+ background start) or InvalidForegroundServiceTypeException
            // (API 34+). Stop immediately: a started-but-not-foregrounded service
            // is what the platform ANRs/crashes the app over, and playback does
            // not depend on us.
            Timber.w(e, "audio keep-alive startForeground failed — WebView keep-alive still active")
            stopEverything()
        }
        return START_NOT_STICKY
    }

    /**
     * The Activity (and its WebView, and therefore playback) dies with the task.
     * Without this the ongoing notification would outlive the audio it claims to
     * describe, and the user cannot swipe an ongoing notification away.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopEverything()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        running = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        try { session?.release() } catch (_: Exception) { /* teardown best-effort */ }
        session = null
        super.onDestroy()
    }

    private fun stopEverything() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /** Push the current snapshot into the MediaSession (metadata + state). */
    private fun syncSession() {
        val s = session ?: return
        try {
            val md = MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, npTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, npArtist)
                .apply {
                    if (npDurationMs > 0) putLong(MediaMetadataCompat.METADATA_KEY_DURATION, npDurationMs)
                    artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) }
                }
                .build()
            s.setMetadata(md)
            s.setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setActions(SESSION_ACTIONS)
                    .setState(
                        if (npPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                        npPositionMs,
                        // Rate 0 while paused: the system stops interpolating the
                        // seekbar; the real rate while playing keeps it honest at
                        // the player's speed presets.
                        if (npPlaying) npRate else 0f
                    )
                    .build()
            )
        } catch (e: Exception) {
            Timber.w(e, "media session sync failed — card may lag playback")
        }
    }

    /**
     * Idempotent channel creation. `createNotificationChannel` on an existing id
     * is an update, not a duplicate, but the read-first check keeps a user's own
     * later tweaks to the channel from being reset on every play. IMPORTANCE_LOW
     * + no sound/vibration/badge: an ongoing transport notification must never
     * make noise. NotificationChannel is API 26 and minSdk is 26, so no guard.
     */
    private fun ensureChannel() {
        val mgr = getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        mgr.createNotificationChannel(channel)
    }

    /** PendingIntent that routes a transport command back through this service. */
    private fun cmdIntent(cmd: String, requestCode: Int): PendingIntent =
        PendingIntent.getService(
            this,
            requestCode,
            Intent(this, AudioKeepAliveService::class.java)
                .setAction(ACTION_CMD)
                .putExtra(EXTRA_CMD, cmd),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun buildNotification(): Notification {
        // singleTask MainActivity: tapping brings the existing task forward
        // rather than starting a second reader. FLAG_IMMUTABLE is required from
        // API 31 and harmless below.
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            // A platform drawable: a notification small icon is drawn as a white
            // silhouette, so the launcher mipmap would render as a blob. No new
            // resource needed for a transport glyph the platform already ships.
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(npTitle)
            .setContentText(npArtist)
            .setContentIntent(contentIntent)
            .setOngoing(npPlaying)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            // Swiping the (paused, detached) card stops the service outright —
            // without this the swipe would orphan a running service with no
            // notification. Unreachable while playing (FGS-attached = no swipe).
            .setDeleteIntent(
                PendingIntent.getService(
                    this,
                    4,
                    Intent(this, AudioKeepAliveService::class.java).setAction(ACTION_STOP),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
            .addAction(android.R.drawable.ic_media_previous, "Previous", cmdIntent("prev", 1))
            .addAction(
                if (npPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (npPlaying) "Pause" else "Play",
                cmdIntent("toggle", 2)
            )
            .addAction(android.R.drawable.ic_media_next, "Next", cmdIntent("next", 3))
        artwork?.let { builder.setLargeIcon(it) }
        session?.sessionToken?.let { token ->
            builder.setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(token)
                    .setShowActionsInCompactView(0, 1, 2)
            )
        }
        return builder.build()
    }

    companion object {
        /** Notification channel id. Stable — changing it strands the user's
         *  per-channel settings on an orphaned channel. */
        const val CHANNEL_ID = "vot_audio_playback"

        /** User-visible channel name (Settings → Notifications → VOTReader). */
        const val CHANNEL_NAME = "Audio playback"

        /** Notification id. Any non-zero constant; 0 is illegal for startForeground. */
        const val NOTIFICATION_ID = 4201

        /** Explicit stop command (see [onStartCommand]). Package-qualified so it
         *  can never collide with a platform or third-party action. */
        const val ACTION_STOP = "com.votreader.sacredui.action.AUDIO_KEEPALIVE_STOP"

        /** Now-playing metadata refresh (title/artist/state/position). */
        const val ACTION_UPDATE = "com.votreader.sacredui.action.AUDIO_NOWPLAYING_UPDATE"

        /** A notification-action transport command (extra [EXTRA_CMD]). */
        const val ACTION_CMD = "com.votreader.sacredui.action.AUDIO_MEDIA_CMD"

        const val EXTRA_CMD = "cmd"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_PLAYING = "playing"
        const val EXTRA_POSITION_MS = "positionMs"
        const val EXTRA_DURATION_MS = "durationMs"
        const val EXTRA_RATE = "rate"

        /** Everything the QS card / lock screen / headset may ask of the player. */
        const val SESSION_ACTIONS: Long =
            PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_SEEK_TO

        /**
         * Where system transport commands go: MainActivity registers a sink that
         * forwards (cmd, posMs) over the JsBridge as window.__votMediaCommand,
         * and clears it in onDestroy (same pattern as [VOTReaderApp.releaseTree]).
         * Null (no Activity alive) → the command drops harmlessly: with the
         * WebView gone there is no player to command.
         */
        @Volatile
        var commandSink: ((cmd: String, posMs: Long) -> Unit)? = null

        /** True between onCreate and onDestroy. [updateNowPlaying] gates on it
         *  so a trailing metadata update (JS teardown race after the
         *  setAudioActive(false) stop) can never RESURRECT the service into a
         *  silent "paused" notification with no keep-alive edge left to
         *  clear it. */
        @Volatile
        private var running = false

        /**
         * True between [setActive]`(true)` and the service's [onCreate].
         *
         * `startForegroundService` is ASYNCHRONOUS — it enqueues the start and
         * returns — so `running` is still false when the JS player sends its
         * first now-playing update synchronously on the next line. Gating
         * [updateNowPlaying] on `running` alone dropped exactly that update, and
         * the first media card of a session showed the "Audio letter / The
         * Volumes of Truth" placeholder instead of the real title.
         *
         * Cleared by [setActive]`(false)` and by [onCreate], NEVER by
         * [onDestroy]: a fresh start can race a previous instance's teardown,
         * and clearing there would wipe the new start's flag. It does not widen
         * the resurrection hole `running` guards — after a stop both flags are
         * false, so a trailing update is still dropped.
         *
         * The one window this leaves open is not reachable, and is written down
         * here so the next reader does not have to re-derive it: a start that is
         * enqueued but whose [onCreate] never runs would strand the flag true.
         * Every way that happens closes it anyway — a throw from
         * `startForegroundService` leaves it false (it is set only after the
         * call returns), an explicit stop clears it, and process death resets
         * the companion along with everything else.
         */
        @Volatile
        private var startPending = false

        /**
         * True when [sdkInt] must pass the foreground-service TYPE to
         * `startForeground`. The typed overload is API 29 (Q); below that the
         * two-arg form is the only one that exists and the manifest's
         * `foregroundServiceType` is the whole declaration.
         *
         * Extracted (rather than inlined into [onStartCommand]) so the branch is
         * exercised on the JVM without Robolectric — the Android callback around
         * it is not unit-testable, the decision is.
         *
         * @ChecksSdkIntAtLeast tells lint "true ⇒ running on Q+", which is what
         * lets the typed startForeground call inside the guard pass the NewApi
         * check. The claim holds because the one production call site passes
         * Build.VERSION.SDK_INT — keep it that way.
         */
        @ChecksSdkIntAtLeast(api = Build.VERSION_CODES.Q)
        fun usesTypedForeground(sdkInt: Int): Boolean = sdkInt >= Build.VERSION_CODES.Q

        /**
         * The one wiring entry point: start the anchor while audio streams, stop
         * it when it doesn't. Idempotent in both directions (a repeat start is a
         * notification update; stopping a dead service is a no-op) and never
         * throws — the WebView keep-alive path in [MainActivity.onPause] works
         * with or without us, so a failure here is a WARN, not a user-visible
         * error.
         *
         * STOP USES `stopService`, NOT an [ACTION_STOP] `startService`: pausing
         * playback while the app is backgrounded (screen off, another app in
         * front) is the normal case, and a background `startService` throws
         * IllegalStateException on API 26+ — the notification would be stranded
         * on exactly the path that matters most. `stopService` has no such
         * restriction. [ACTION_STOP] remains handled for an explicit
         * intent-driven stop.
         */
        fun setActive(context: Context, active: Boolean) {
            try {
                val intent = Intent(context, AudioKeepAliveService::class.java)
                if (active) {
                    ContextCompat.startForegroundService(context, intent)
                    // Only once the start is actually enqueued — a throw above
                    // must not leave a pending flag behind. onCreate has not run
                    // yet, so this is what lets the update JS sends on the very
                    // next line through [updateNowPlaying]'s gate.
                    startPending = true
                } else {
                    // Cleared BEFORE the call: stopService may throw, and the
                    // intent to stop is already settled by then.
                    startPending = false
                    context.stopService(intent)
                }
            } catch (e: Throwable) {
                Timber.w(e, "audio keep-alive %s failed", if (active) "start" else "stop")
            }
        }

        /**
         * Refresh the now-playing snapshot (title/artist/playing/position/rate)
         * — the QS card, lock screen and notification all re-render from it.
         * Gated on [running] OR [startPending]: an update while the service is
         * down is dropped (there is no card to refresh, and starting one here
         * would post a notification over silence), but one sent in the window
         * between [setActive]`(true)` and the async [onCreate] is NOT — it rides
         * the intent queue behind the start, which the platform delivers in call
         * order, so it can never beat it. While playing, our own foreground
         * service holds the process at FGS procstate, so the plain
         * startService clears the background-start restriction. Never throws
         * (same contract as [setActive]).
         */
        fun updateNowPlaying(
            context: Context,
            title: String?,
            artist: String?,
            playing: Boolean,
            positionMs: Long,
            durationMs: Long,
            rate: Float,
        ) {
            if (!running && !startPending) return
            try {
                context.startService(
                    Intent(context, AudioKeepAliveService::class.java)
                        .setAction(ACTION_UPDATE)
                        .putExtra(EXTRA_TITLE, title ?: "")
                        .putExtra(EXTRA_ARTIST, artist ?: "")
                        .putExtra(EXTRA_PLAYING, playing)
                        .putExtra(EXTRA_POSITION_MS, positionMs)
                        .putExtra(EXTRA_DURATION_MS, durationMs)
                        .putExtra(EXTRA_RATE, rate)
                )
            } catch (e: Throwable) {
                Timber.w(e, "now-playing update dropped (service not startable here)")
            }
        }
    }
}
