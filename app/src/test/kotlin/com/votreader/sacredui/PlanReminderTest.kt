package com.votreader.sacredui

import android.Manifest
import android.app.AlarmManager
import android.app.Application
import android.app.NotificationManager
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * rp-s1: the reminder's Android half - the page's JSON, the one inexact alarm, the notification, the receiver and
 * the tap's hand-off to the page. The decisions themselves are PlanReminderLogicTest's.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PlanReminderTest {

    private val app: Application = ApplicationProvider.getApplicationContext()
    private val zone = ZoneId.of("America/Denver")
    private val fri = LocalDate.of(2026, 10, 23)
    private fun at(day: LocalDate, h: Int, m: Int = 0) = ZonedDateTime.of(day.atTime(h, m), zone)
    private val am get() = shadowOf(app.getSystemService(AlarmManager::class.java))
    private val nm get() = shadowOf(app.getSystemService(NotificationManager::class.java))

    private fun list(vararg plans: String) = """{"plans":[${plans.joinToString(",")}]}"""
    private fun p(id: String = "run-1", time: String = "07:30", extra: String = "") =
        """{"id":"$id","name":"Bible in a Year","time":"$time","active":"2026-10-23"$extra}"""

    @Before
    fun allow() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    @Test
    fun `set stores the list and sets one inexact alarm that may fire in Doze`() {
        val out = JSONObject(PlanReminder.set(app, list(p()), at(fri, 6)))
        assertTrue(out.getBoolean("ok"))
        assertTrue(out.getBoolean("allowed"))
        val expect = at(fri, 7, 30).toInstant().toEpochMilli()
        assertEquals(expect, out.getLong("next"))
        assertEquals(1, am.scheduledAlarms.size)
        val alarm = am.scheduledAlarms[0]
        assertEquals(expect, alarm.triggerAtMs)
        assertEquals(AlarmManager.RTC_WAKEUP, alarm.type)
        assertTrue(alarm.isAllowWhileIdle)
        // Setting again replaces the alarm (same PendingIntent), never stacks a second.
        PlanReminder.set(app, list(p(time = "08:15")), at(fri, 6))
        assertEquals(1, am.scheduledAlarms.size)
        assertEquals(at(fri, 8, 15).toInstant().toEpochMilli(), am.scheduledAlarms[0].triggerAtMs)
    }

    @Test
    fun `an empty list turns it off and a list that will not parse changes nothing`() {
        PlanReminder.set(app, list(p()), at(fri, 6))
        for (bad in listOf(null, "", "nope", "{}", """{"plans":3}""")) {
            val out = JSONObject(PlanReminder.set(app, bad, at(fri, 6)))
            assertFalse(out.getBoolean("ok"), "$bad")
            assertEquals(1, am.scheduledAlarms.size, "$bad")
        }
        val off = JSONObject(PlanReminder.set(app, list(), at(fri, 6)))
        assertTrue(off.getBoolean("ok"))
        assertEquals(0L, off.getLong("next"))
        assertEquals(0, am.scheduledAlarms.size)
    }

    @Test
    fun `the parse keeps good plans, drops bad ones and fills the defaults`() {
        val plans = PlanReminder.parse(
            list(
                """{"id":"a","name":"  ","weekdays":[true,false,false,false,false,false,true],"done":"2026-10-23","end":"bad"}""",
                """{"id":"","time":"07:00"}""",
                """{"id":"b","time":"25:00"}""",
                """{"id":"c","name":"Psalms","time":"21:05","paused":true,"weekdays":[true]}""",
                "7",
            ),
        )!!
        assertEquals(listOf("a", "c"), plans.map { it.id })
        assertEquals("Your reading plan", plans[0].name)
        assertEquals(PlanReminderLogic.DEFAULT_TIME, plans[0].time)
        assertEquals(listOf(true, false, false, false, false, false, true), plans[0].weekdays)
        assertEquals(fri, plans[0].done)
        assertNull(plans[0].end)
        assertTrue(plans[1].paused)
        assertNull(plans[1].weekdays)
    }

    @Test
    fun `the alarm posts one reminder a day and sets tomorrow's`() {
        PlanReminder.set(app, list(p()), at(fri, 6))
        PlanReminder.onAlarm(app, at(fri, 7, 31))
        assertEquals(1, nm.size())
        val n = nm.getNotification(PlanReminder.NOTIFICATION_ID)
        assertEquals("Bible in a Year", n.extras.getString(NotificationCompat.EXTRA_TITLE))
        assertTrue(n.extras.getString(NotificationCompat.EXTRA_TEXT) in PlanReminderLogic.LINES)
        assertEquals(PlanReminder.CHANNEL_ID, n.channelId)
        assertEquals(NotificationCompat.CATEGORY_REMINDER, n.category)
        val channel = app.getSystemService(NotificationManager::class.java).getNotificationChannel(PlanReminder.CHANNEL_ID)
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, channel.importance)
        assertEquals(at(fri.plusDays(1), 7, 30).toInstant().toEpochMilli(), am.scheduledAlarms.single().triggerAtMs)
        // A second alarm the same day (a clock change, a duplicate delivery) posts nothing more.
        app.getSystemService(NotificationManager::class.java).cancelAll()
        PlanReminder.onAlarm(app, at(fri, 9))
        assertEquals(0, nm.size())
    }

    @Test
    fun `finishing today takes a reminder still showing down, and a done day posts nothing`() {
        PlanReminder.set(app, list(p()), at(fri, 6))
        PlanReminder.onAlarm(app, at(fri, 7, 31))
        assertEquals(1, nm.size())
        PlanReminder.set(app, list(p(extra = ""","done":"2026-10-23"""")), at(fri, 8))
        assertEquals(0, nm.size())

        PlanReminder.set(app, list(p(extra = ""","done":"2026-10-24"""")), at(fri.plusDays(1), 6))
        PlanReminder.onAlarm(app, at(fri.plusDays(1), 7, 31))
        assertEquals(0, nm.size())
    }

    @Test
    fun `with notifications refused nothing is posted and the status says so`() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val out = JSONObject(PlanReminder.set(app, list(p()), at(fri, 6)))
        assertFalse(out.getBoolean("allowed"))
        PlanReminder.onAlarm(app, at(fri, 7, 31))
        assertEquals(0, nm.size())
        // The alarm still moves on to tomorrow, so allowing later needs no new set.
        assertEquals(at(fri.plusDays(1), 7, 30).toInstant().toEpochMilli(), am.scheduledAlarms.single().triggerAtMs)
    }

    @Test
    fun `the status lists plans gone quiet`() {
        PlanReminder.set(app, list("""{"id":"old","name":"x","time":"07:30","active":"2026-10-01"}""", p()), at(fri, 6))
        val st = JSONObject(PlanReminder.status(app, at(fri, 6)))
        assertEquals(1, st.getJSONArray("quiet").length())
        assertEquals("old", st.getJSONArray("quiet").getString(0))
    }

    @Test
    fun `after a reboot the receiver sets the alarm again and catches up a reminder just missed`() {
        PlanReminder.set(app, list(p()), at(fri, 6))
        am.scheduledAlarms.toList().forEach { app.getSystemService(AlarmManager::class.java).cancel(it.operation!!) }
        assertEquals(0, am.scheduledAlarms.size)
        PlanReminder.reschedule(app, at(fri, 8))
        assertEquals(at(fri, 8).toInstant().toEpochMilli(), am.scheduledAlarms.single().triggerAtMs)
        // The receiver routes the system broadcasts to it (with the real clock: an alarm is set either way).
        am.scheduledAlarms.toList().forEach { app.getSystemService(AlarmManager::class.java).cancel(it.operation!!) }
        PlanReminder.set(app, list(p(extra = ""","weekdays":[true,true,true,true,true,true,true]""")), ZonedDateTime.now())
        am.scheduledAlarms.toList().forEach { app.getSystemService(AlarmManager::class.java).cancel(it.operation!!) }
        PlanReminderReceiver().onReceive(app, Intent(Intent.ACTION_BOOT_COMPLETED))
        assertEquals(1, am.scheduledAlarms.size)
        // Anything else is ignored, and a null intent does not throw.
        PlanReminderReceiver().onReceive(app, Intent("something.else"))
        PlanReminderReceiver().onReceive(app, null)
    }

    @Test
    fun `the receiver's own alarm action runs the alarm`() {
        val now = ZonedDateTime.now()
        val t = now.minusMinutes(1).toLocalTime()
        val time = "%02d:%02d".format(t.hour, t.minute)
        // A minute ago, today: due now (unless the test runs in the minute after midnight, when it is yesterday's).
        if (t.isAfter(now.toLocalTime())) return
        PlanReminder.set(app, list("""{"id":"r","name":"Psalms","time":"$time","active":"${now.toLocalDate()}"}"""), now)
        PlanReminderReceiver().onReceive(app, Intent(PlanReminder.ACTION_FIRE))
        assertEquals(1, nm.size())
    }

    @Test
    fun `a tap's plan waits for the page once and other intents are left alone`() {
        val tap = Intent(app, MainActivity::class.java).setAction(PlanReminder.ACTION_OPEN).putExtra(PlanReminder.EXTRA_PLAN, "run-1")
        assertEquals("run-1", PlanReminder.noteOpened(app, tap))
        assertEquals("run-1", PlanReminder.takeOpened(app))
        assertEquals("", PlanReminder.takeOpened(app))
        assertNull(PlanReminder.noteOpened(app, Intent(Intent.ACTION_VIEW)))
        assertNull(PlanReminder.noteOpened(app, null))
        assertNull(PlanReminder.noteOpened(app, Intent(PlanReminder.ACTION_OPEN)))
        assertEquals("", PlanReminder.takeOpened(app))
    }

    @Test
    fun `the posted reminder's tap opens MainActivity with the plan`() {
        PlanReminder.set(app, list(p(id = "run-9")), at(fri, 6))
        PlanReminder.onAlarm(app, at(fri, 7, 31))
        val pi = nm.getNotification(PlanReminder.NOTIFICATION_ID).contentIntent
        assertNotNull(pi)
        val intent = shadowOf(pi).savedIntent
        assertEquals(PlanReminder.ACTION_OPEN, intent.action)
        assertEquals("run-9", intent.getStringExtra(PlanReminder.EXTRA_PLAN))
        assertEquals(MainActivity::class.java.name, intent.component?.className)
        assertTrue(shadowOf(pi).isImmutable)
    }
}
