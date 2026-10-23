package com.votreader.sacredui

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import timber.log.Timber

/**
 * dl-d2: downloads keep going with the app closed. On Android 14+ the queue runs under a user-initiated data transfer
 * job (JobInfo.setUserInitiated), which keeps the process alive like a foreground service and shows the notification
 * "Downloading 3 of 31". The downloads themselves stay in OfflineAudioStore's worker: the job only holds the process
 * up while the store is busy and paints the notification from [OfflineAudioStore.summary].
 *
 * Android lets an app schedule such a job only while the reader can see it: [schedule] runs when the page queues a
 * download or resumes, and again from MainActivity.onResume when a queue saved from an earlier run is still busy. Where
 * it cannot (Android 13 and older, or not visible), the downloads still run while the process lives, and a restart
 * picks the saved queue up.
 */
object DownloadJob {
    const val JOB_ID = 0x0D1D2
    const val NOTIFICATION_ID = 0x0D1D2
    const val CHANNEL_ID = "downloads"
    const val ACTION_PAUSE = "com.votreader.sacredui.DOWNLOADS_PAUSE"

    /** Schedule the job if the queue has work and none is scheduled or running. Never throws. */
    fun schedule(context: Context, store: OfflineAudioStore) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        try {
            val app = context.applicationContext
            val js = app.getSystemService(JobScheduler::class.java) ?: return
            if (js.getPendingJob(JOB_ID) != null) return
            val s = store.summary()
            if (!s.busy || s.paused) return
            val info = JobInfo.Builder(JOB_ID, ComponentName(app, DownloadJobService::class.java))
                .setUserInitiated(true)
                .setRequiredNetworkType(if (s.wifiOnly) JobInfo.NETWORK_TYPE_UNMETERED else JobInfo.NETWORK_TYPE_ANY)
                .setEstimatedNetworkBytes(s.leftBytes.coerceAtLeast(0L), 0L)
                .build()
            js.schedule(info)
        } catch (e: Exception) {
            // Not visible, or the system refused: the worker goes on while the process lives.
            Timber.w(e, "downloads: the user-initiated job could not be scheduled")
        }
    }

    /** The notification's words for [s]: (title, text, progress 0..1000 or -1 for none). */
    fun words(s: OfflineAudioStore.Summary): Triple<String, String, Int> {
        val n = (s.done + 1).coerceAtMost(maxOf(s.total, 1))
        val title = when (s.reason) {
            "paused" -> "Downloads paused"
            "wifi" -> "Waiting for Wi-Fi"
            "space" -> "Waiting for storage space"
            "offline" -> "No connection"
            "retrying" -> "Server didn't answer · trying again"
            else -> if (s.total > 1) "Downloading $n of ${s.total}" else "Downloading"
        }
        val parts = ArrayList<String>()
        if (s.reason != null && s.total > 1) parts += "${s.done} of ${s.total} on this phone"
        if (s.reason == null && s.activeTotal > 0L) parts += "${mb(s.activeBytes)} of ${mb(s.activeTotal)}"
        if (s.leftBytes > 0L) parts += "${mb(s.leftBytes)} left"
        val progress = if (s.total > 0) ((s.done * 1000L + (if (s.activeTotal > 0L) s.activeBytes * 1000L / s.activeTotal else 0L)) / s.total).toInt().coerceIn(0, 1000) else -1
        return Triple(title, parts.joinToString(" · "), progress)
    }

    private fun mb(bytes: Long): String {
        val m = bytes / (1024.0 * 1024.0)
        return if (m >= 1024.0) String.format(java.util.Locale.US, "%.1f GB", m / 1024.0)
        else if (m >= 10.0) "${m.toLong()} MB" else String.format(java.util.Locale.US, "%.1f MB", m)
    }

    internal fun notification(context: Context, s: OfflineAudioStore.Summary): android.app.Notification {
        ensureChannel(context)
        val (title, text, progress) = words(s)
        val open = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val content = PendingIntent.getActivity(context, 2, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val pause = PendingIntent.getBroadcast(
            context, 3, Intent(context, DownloadActionReceiver::class.java).setAction(ACTION_PAUSE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val b = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(content)
            .addAction(0, "Pause", pause)
        if (text.isNotEmpty()) b.setContentText(text)
        if (progress >= 0) b.setProgress(1000, progress, false)
        return b.build()
    }

    /** Idempotent; IMPORTANCE_LOW: a silent, ongoing progress line. */
    private fun ensureChannel(context: Context) {
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        mgr.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Progress of recordings downloading to this phone."
            },
        )
    }
}

/**
 * The user-initiated data transfer job (API 34+): shows the notification, refreshes it each second, and finishes when
 * the queue is empty or paused. Stopped by the system (network lost, quota) it asks to run again; stopped by the reader
 * from the system's task manager it pauses the queue, as a Pause would.
 */
class DownloadJobService : JobService() {
    private val main = Handler(Looper.getMainLooper())
    private var tick: Runnable? = null

    override fun onStartJob(params: JobParameters): Boolean {
        val store = OfflineAudioStore.shared(this)
        val first = store.summary()
        if (!first.busy || first.paused) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            setNotification(params, DownloadJob.NOTIFICATION_ID, DownloadJob.notification(this, first), JOB_END_NOTIFICATION_POLICY_REMOVE)
        }
        val r = object : Runnable {
            override fun run() {
                val s = store.summary()
                if (!s.busy || s.paused) { tick = null; jobFinished(params, false); return }
                try {
                    NotificationManagerCompat.from(this@DownloadJobService).notify(DownloadJob.NOTIFICATION_ID, DownloadJob.notification(this@DownloadJobService, s))
                } catch (e: SecurityException) {
                    // Notifications refused: the job runs on, the system's task manager still lists it.
                }
                main.postDelayed(this, TICK_MS)
            }
        }
        tick = r
        main.postDelayed(r, TICK_MS)
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        tick?.let { main.removeCallbacks(it) }
        tick = null
        val store = OfflineAudioStore.shared(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && params.stopReason == JobParameters.STOP_REASON_USER) {
            store.pause()
            return false
        }
        return store.busy() && !store.isPaused()
    }

    private companion object {
        const val TICK_MS = 1_000L
    }
}

/** The notification's Pause. Not exported: its PendingIntent names it. */
class DownloadActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        try {
            if (intent?.action == DownloadJob.ACTION_PAUSE) OfflineAudioStore.shared(context).pause()
        } catch (e: Exception) {
            Timber.w(e, "downloads: pause from the notification")
        }
    }
}
