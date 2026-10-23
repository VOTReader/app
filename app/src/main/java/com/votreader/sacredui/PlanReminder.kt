package com.votreader.sacredui

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber
import java.time.LocalDate
import java.time.ZonedDateTime

/**
 * rp-s1: the daily reading-plan reminder on Android (Corbin's call 4A, 2026-10-22). The page owns the plans; this owns
 * the alarm and the notification, because the reminder has to arrive with the app closed.
 *
 * The page sends the plans whose reminder is on with [set] (AppInterface.planReminderSet) whenever one changes: a tick,
 * a pause, a new time, a stop. The list is kept in private SharedPreferences, and one inexact alarm
 * (setAndAllowWhileIdle: no exact-alarm permission, still fires in Doze, may be late) is set for the next time any plan
 * wants a reminder. When it goes off, [onAlarm] decides from the stored list alone (PlanReminderLogic), posts at most one
 * notification that day, and sets the next alarm. A reboot, an app update or a clock or time-zone change sets it again
 * ([PlanReminderReceiver]), catching up on a reminder that passed less than PlanReminderLogic.GRACE ago.
 *
 * The page's contract (JSON in, JSON out; unknown fields ignored):
 *   in  {"plans":[{"id","name","time":"HH:MM","weekdays":[7 x bool, Sunday first],"done":"YYYY-MM-DD",
 *                  "active":"YYYY-MM-DD","end":"YYYY-MM-DD","paused":bool}]}   (an empty list turns it off)
 *   out {"ok":bool,"allowed":bool,"next":<epoch ms, 0 = none>,"quiet":[ids gone quiet]}
 * A tap opens the app; the plan's id waits for the page in [takeOpened] (and reaches a running page as
 * JsEvent.PlanReminderOpen).
 */
object PlanReminder {
    const val CHANNEL_ID = "reading_plan_reminder"
    const val CHANNEL_NAME = "Reading plan reminders"
    const val NOTIFICATION_ID = 7301
    const val ACTION_FIRE = "com.votreader.sacredui.PLAN_REMINDER_FIRE"
    const val ACTION_OPEN = "com.votreader.sacredui.PLAN_REMINDER_OPEN"
    const val EXTRA_PLAN = "plan"

    private const val PREFS = "plan_reminder"
    private const val K_PLANS = "plans"
    private const val K_SET_ON = "set_on"
    private const val K_LAST = "last_notified"
    private const val K_NEXT = "next"
    private const val K_OPENED = "opened"
    private const val MAX_PLANS = 50

    /** Take the page's list, store it, set the alarm. Returns the status JSON; a list that will not parse changes nothing. */
    fun set(context: Context, json: String?, now: ZonedDateTime = ZonedDateTime.now()): String {
        val plans = parse(json) ?: return status(context, now, ok = false)
        prefs(context).edit()
            .putString(K_PLANS, json)
            .putString(K_SET_ON, now.toLocalDate().toString())
            .apply()
        // Today done or quiet everywhere: a reminder still showing from this morning is no longer true.
        if (!PlanReminderLogic.anyDueToday(plans, now.toLocalDate(), now.toLocalDate())) cancelShown(context)
        schedule(context, now, catchUp = false)
        return status(context, now, ok = true)
    }

    /** The status JSON (see the class KDoc) without changing anything. */
    fun status(context: Context, now: ZonedDateTime = ZonedDateTime.now(), ok: Boolean = true): String {
        val p = prefs(context)
        val plans = storedPlans(context)
        val quiet = PlanReminderLogic.quiet(plans, now.toLocalDate(), PlanReminderLogic.parseDate(p.getString(K_SET_ON, null)))
        return JSONObject()
            .put("ok", ok)
            .put("allowed", allowed(context))
            .put("next", p.getLong(K_NEXT, 0L))
            .put("quiet", JSONArray(quiet))
            .toString()
    }

    /** The alarm went off: post today's one reminder if it is due, then set the next alarm. */
    fun onAlarm(context: Context, now: ZonedDateTime = ZonedDateTime.now()) {
        val p = prefs(context)
        val plans = storedPlans(context)
        val last = PlanReminderLogic.parseDate(p.getString(K_LAST, null))
        val setOn = PlanReminderLogic.parseDate(p.getString(K_SET_ON, null))
        val msg = PlanReminderLogic.message(plans, now, last, setOn)
        if (msg != null) {
            // Marked sent before the post: a post that throws must not turn into a second try every alarm today.
            p.edit().putString(K_LAST, now.toLocalDate().toString()).apply()
            post(context, msg)
        }
        schedule(context, now, catchUp = false)
    }

    /** Set the alarm again after a reboot, an update or a clock change (alarms do not survive the first). */
    fun reschedule(context: Context, now: ZonedDateTime = ZonedDateTime.now()) = schedule(context, now, catchUp = true)

    /** A tap on the reminder opened [intent]: keep its plan for the page. Returns the plan id, or null for another intent. */
    fun noteOpened(context: Context, intent: Intent?): String? {
        if (intent?.action != ACTION_OPEN) return null
        val id = intent.getStringExtra(EXTRA_PLAN)?.takeIf { it.isNotBlank() && it.length <= 200 } ?: return null
        prefs(context).edit().putString(K_OPENED, id).apply()
        return id
    }

    /** The plan a reminder tap opened, once: "" when there is none (or it was taken already). */
    fun takeOpened(context: Context): String {
        val p = prefs(context)
        val id = p.getString(K_OPENED, null) ?: return ""
        p.edit().remove(K_OPENED).apply()
        return id
    }

    /** Whether a reminder can show: the app's notifications and this channel are on (and, on 13+, the permission). */
    fun allowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        val mgr = NotificationManagerCompat.from(context)
        if (!mgr.areNotificationsEnabled()) return false
        val ch = context.getSystemService(NotificationManager::class.java)?.getNotificationChannel(CHANNEL_ID)
        return ch == null || ch.importance != NotificationManager.IMPORTANCE_NONE
    }

    /** The page's JSON to plans, or null when it is not the contract's shape. Bad plans inside a good list are dropped. */
    internal fun parse(json: String?): List<PlanReminderLogic.Plan>? {
        val root = try { JSONObject(json ?: return null) } catch (_: Exception) { return null }
        val arr = root.optJSONArray("plans") ?: return null
        val out = ArrayList<PlanReminderLogic.Plan>()
        for (i in 0 until minOf(arr.length(), MAX_PLANS)) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id", "").takeIf { it.isNotBlank() && it.length <= 200 } ?: continue
            val time = if (o.has("time")) PlanReminderLogic.parseTime(o.optString("time")) ?: continue
                       else PlanReminderLogic.DEFAULT_TIME
            val wd = o.optJSONArray("weekdays")?.let { a -> if (a.length() == 7) (0 until 7).map { a.optBoolean(it) } else null }
            out += PlanReminderLogic.Plan(
                id = id,
                name = o.optString("name", "").trim().take(80).ifBlank { "Your reading plan" },
                time = time,
                weekdays = wd,
                done = PlanReminderLogic.parseDate(o.optString("done", "")),
                active = PlanReminderLogic.parseDate(o.optString("active", "")),
                end = PlanReminderLogic.parseDate(o.optString("end", "")),
                paused = o.optBoolean("paused", false),
            )
        }
        return out
    }

    private fun storedPlans(context: Context): List<PlanReminderLogic.Plan> =
        parse(prefs(context).getString(K_PLANS, null)) ?: emptyList()

    private fun schedule(context: Context, now: ZonedDateTime, catchUp: Boolean) {
        val p = prefs(context)
        val at = PlanReminderLogic.nextFire(
            storedPlans(context), now,
            PlanReminderLogic.parseDate(p.getString(K_LAST, null)),
            PlanReminderLogic.parseDate(p.getString(K_SET_ON, null)),
            catchUp,
        )
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = alarmIntent(context)
        if (at == null) {
            am.cancel(pi)
            p.edit().putLong(K_NEXT, 0L).apply()
            return
        }
        val ms = at.toInstant().toEpochMilli()
        try {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
            p.edit().putLong(K_NEXT, ms).apply()
        } catch (e: Exception) {
            // An app at the alarm cap (500) is refused with an exception; the reminder is a nicety, never a crash.
            Timber.w(e, "plan reminder alarm refused")
            p.edit().putLong(K_NEXT, 0L).apply()
        }
    }

    private fun alarmIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context, 0,
        Intent(context, PlanReminderReceiver::class.java).setAction(ACTION_FIRE),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun post(context: Context, msg: PlanReminderLogic.Message) {
        if (!allowed(context)) return
        ensureChannel(context)
        val open = Intent(context, MainActivity::class.java)
            .setAction(ACTION_OPEN)
            .putExtra(EXTRA_PLAN, msg.planId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val content = PendingIntent.getActivity(
            context, 1, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(msg.title)
            .setContentText(msg.text)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(content)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, n)
        } catch (e: SecurityException) {
            Timber.w(e, "plan reminder not posted: notifications refused")
        }
    }

    private fun cancelShown(context: Context) {
        try { NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID) } catch (_: Exception) { }
    }

    /** Idempotent; IMPORTANCE_DEFAULT: it sounds as the reader's notification settings say, once a day at most. */
    internal fun ensureChannel(context: Context) {
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        mgr.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "One reminder a day for the reading plans you asked to be reminded about."
            },
        )
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}

/**
 * rp-s1: the reminder's alarm, and the system broadcasts after which it must be set again (an alarm does not survive a
 * reboot; a clock or time-zone change moves what "7:30" means). Not exported: the alarm's PendingIntent is explicit, and
 * the system delivers its own broadcasts to an unexported receiver.
 */
class PlanReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        try {
            when (intent?.action) {
                PlanReminder.ACTION_FIRE -> PlanReminder.onAlarm(context)
                Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
                Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> PlanReminder.reschedule(context)
            }
        } catch (e: Exception) {
            Timber.w(e, "plan reminder receiver")
        }
    }
}
