package com.votreader.sacredui

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.annotation.ChecksSdkIntAtLeast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import timber.log.Timber

/**
 * Process anchor for streaming audio-letter playback.
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
 * NO MEDIA3 / MEDIASESSION. A plain started Service is enough for the
 * OOM-adjustment win; the app already publishes transport metadata through the
 * web MediaSession API from JS, so a native MediaSessionService would duplicate
 * state across the bridge for no user-visible gain (and pull in a dependency).
 *
 * LIFECYCLE. Started from [AppInterface.setAudioActive] via
 * [BridgeHost.setAudioKeepAlive] (edge-triggered by JS — no debounce needed),
 * stopped on the matching `false`, on [MainActivity.onDestroy] (the WebView is
 * destroyed there, so playback is over whether or not JS said so), and on
 * [onTaskRemoved] (swipe-away kills the Activity's WebView; without this the
 * ongoing notification would outlive the audio).
 *
 * START_NOT_STICKY: the playback intent lives entirely in JS. A service the
 * system restarts with a null intent has nothing to keep alive — it would just
 * post a "Playing audio" notification over silence.
 */
class AudioKeepAliveService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopEverything()
            return START_NOT_STICKY
        }
        try {
            ensureChannel()
            val notification = buildNotification()
            // API 29+ takes the foreground-service TYPE in the call itself; the
            // manifest declaration alone is what API 26-28 has. From API 34 the
            // typed form is mandatory for mediaPlayback (and is backed by the
            // FOREGROUND_SERVICE_MEDIA_PLAYBACK permission in the manifest).
            if (usesTypedForeground(Build.VERSION.SDK_INT)) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
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
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun stopEverything() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
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
        return NotificationCompat.Builder(this, CHANNEL_ID)
            // A platform drawable: a notification small icon is drawn as a white
            // silhouette, so the launcher mipmap would render as a blob. No new
            // resource needed for a transport glyph the platform already ships.
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(NOTIFICATION_TEXT)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .build()
    }

    companion object {
        /** Notification channel id. Stable — changing it strands the user's
         *  per-channel settings on an orphaned channel. */
        const val CHANNEL_ID = "vot_audio_playback"

        /** User-visible channel name (Settings → Notifications → VOTReader). */
        const val CHANNEL_NAME = "Audio playback"

        /** Notification id. Any non-zero constant; 0 is illegal for startForeground. */
        const val NOTIFICATION_ID = 4201

        /** Body text of the ongoing notification. */
        const val NOTIFICATION_TEXT = "Playing audio"

        /** Explicit stop command (see [onStartCommand]). Package-qualified so it
         *  can never collide with a platform or third-party action. */
        const val ACTION_STOP = "com.votreader.sacredui.action.AUDIO_KEEPALIVE_STOP"

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
                } else {
                    context.stopService(intent)
                }
            } catch (e: Throwable) {
                Timber.w(e, "audio keep-alive %s failed", if (active) "start" else "stop")
            }
        }
    }
}
