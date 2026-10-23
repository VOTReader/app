package com.votreader.sacredui

import com.votreader.sacredui.PlanReminderLogic.Plan
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * rp-s1: when the daily reading-plan reminder goes off and what it says (call 4A: one a day at most across plans,
 * silent once today is done, quiet after 7 untouched days, rotating wording). Plain JVM; JaCoCo floors it at 0.95.
 */
class PlanReminderLogicTest {

    private val zone: ZoneId = ZoneId.of("America/Denver")
    // 2026-10-23 is a Friday.
    private val fri = LocalDate.of(2026, 10, 23)
    private fun at(day: LocalDate, h: Int, m: Int = 0) = day.atTime(h, m).atZone(zone)
    private fun plan(
        id: String = "a", time: String = "07:30", weekdays: List<Boolean>? = null, done: LocalDate? = null,
        active: LocalDate? = fri, end: LocalDate? = null, paused: Boolean = false, name: String = "Bible in a Year",
    ) = Plan(id, name, PlanReminderLogic.parseTime(time)!!, weekdays, done, active, end, paused)

    @Test
    fun `times and dates parse strictly`() {
        assertEquals(LocalTime.of(7, 30), PlanReminderLogic.parseTime("07:30"))
        assertEquals(LocalTime.of(6, 5), PlanReminderLogic.parseTime(" 6:05 "))
        assertEquals(LocalTime.of(23, 59), PlanReminderLogic.parseTime("23:59"))
        for (bad in listOf(null, "", "24:00", "7:60", "7", "07:30:00", "ab:cd", "-1:30")) assertNull(PlanReminderLogic.parseTime(bad), "$bad")
        assertEquals(fri, PlanReminderLogic.parseDate("2026-10-23"))
        for (bad in listOf(null, "", "2026-02-30", "2026-1-5", "20261023", "2026-10-23T00:00")) assertNull(PlanReminderLogic.parseDate(bad), "$bad")
    }

    @Test
    fun `the next alarm is the plan's time today when it is still ahead, else tomorrow`() {
        val p = listOf(plan())
        assertEquals(at(fri, 7, 30), PlanReminderLogic.nextFire(p, at(fri, 6), null, fri, catchUp = false))
        assertEquals(at(fri.plusDays(1), 7, 30), PlanReminderLogic.nextFire(p, at(fri, 7, 30), null, fri, catchUp = false))
        assertEquals(at(fri.plusDays(1), 7, 30), PlanReminderLogic.nextFire(p, at(fri, 9), null, fri, catchUp = false))
    }

    @Test
    fun `one a day across plans - the earliest due plan sets the time, a notified day is skipped`() {
        val p = listOf(plan("a", "08:00"), plan("b", "07:00"), plan("c", "21:00"))
        assertEquals(at(fri, 7), PlanReminderLogic.nextFire(p, at(fri, 6), null, fri, false))
        // Notified today: nothing more today, not even plan c's 21:00.
        assertEquals(at(fri.plusDays(1), 7), PlanReminderLogic.nextFire(p, at(fri, 7, 1), fri, fri, false))
    }

    @Test
    fun `a day already done is silent and the next reading day is chosen`() {
        val p = listOf(plan(done = fri))
        assertEquals(at(fri.plusDays(1), 7, 30), PlanReminderLogic.nextFire(p, at(fri, 6), null, fri, false))
        assertNull(PlanReminderLogic.message(p, at(fri, 7, 30), null, fri))
        assertFalse(PlanReminderLogic.anyDueToday(p, fri, fri))
        // Two plans, one done: the other still reminds.
        val two = listOf(plan("a", done = fri), plan("b", "09:00", name = "The Volumes in Order"))
        assertEquals(at(fri, 9), PlanReminderLogic.nextFire(two, at(fri, 6), null, fri, false))
        assertTrue(PlanReminderLogic.anyDueToday(two, fri, fri))
    }

    @Test
    fun `only the plan's weekdays remind, Sunday first, and none on reads every day`() {
        // Monday, Wednesday, Friday.
        val mwf = listOf(false, true, false, true, false, true, false)
        assertTrue(PlanReminderLogic.readsOn(plan(weekdays = mwf), fri))
        val sat = fri.plusDays(1)
        assertFalse(PlanReminderLogic.readsOn(plan(weekdays = mwf), sat))
        // From Friday after its time: Saturday and Sunday off, Monday 26th.
        assertEquals(at(LocalDate.of(2026, 10, 26), 7, 30), PlanReminderLogic.nextFire(listOf(plan(weekdays = mwf)), at(fri, 8), null, fri, false))
        // Sunday only: index 0.
        val sun = listOf(true, false, false, false, false, false, false)
        assertTrue(PlanReminderLogic.readsOn(plan(weekdays = sun), LocalDate.of(2026, 10, 25)))
        assertFalse(PlanReminderLogic.readsOn(plan(weekdays = sun), fri))
        assertTrue(PlanReminderLogic.readsOn(plan(weekdays = List(7) { false }), sat))
        assertTrue(PlanReminderLogic.readsOn(plan(weekdays = listOf(true, false)), sat))   // not 7 long: ignored
    }

    @Test
    fun `a paused plan and one past its end never remind`() {
        assertNull(PlanReminderLogic.nextFire(listOf(plan(paused = true)), at(fri, 6), null, fri, false))
        assertFalse(PlanReminderLogic.readsOn(plan(end = fri.minusDays(1)), fri))
        assertTrue(PlanReminderLogic.readsOn(plan(end = fri), fri))
        assertEquals(at(fri, 7, 30), PlanReminderLogic.nextFire(listOf(plan(end = fri)), at(fri, 6), null, fri, false))
        assertNull(PlanReminderLogic.nextFire(listOf(plan(end = fri)), at(fri, 8), null, fri, false))
        assertNull(PlanReminderLogic.nextFire(emptyList(), at(fri, 6), null, fri, false))
    }

    @Test
    fun `a plan untouched for more than 7 days goes quiet and is listed for the page to ask`() {
        val touched = fri.minusDays(7)
        assertFalse(PlanReminderLogic.isQuiet(plan(active = touched), fri, fri))
        assertTrue(PlanReminderLogic.isQuiet(plan(active = touched), fri.plusDays(1), fri))
        // Its last reminder is the 7th untouched day, then nothing.
        val p = listOf(plan(active = touched))
        assertEquals(at(fri, 7, 30), PlanReminderLogic.nextFire(p, at(fri, 6), null, fri, false))
        assertNull(PlanReminderLogic.nextFire(p, at(fri, 8), null, fri, false))
        assertEquals(listOf("a"), PlanReminderLogic.quiet(listOf(plan(active = fri.minusDays(8)), plan("b")), fri, fri))
        // No active date: the day the list came stands in.
        assertTrue(PlanReminderLogic.isQuiet(plan(active = null), fri, fri.minusDays(8)))
        assertFalse(PlanReminderLogic.isQuiet(plan(active = null), fri, null))
        // A day the plan does not read is not listed as quiet (nothing would have reminded anyway).
        val sunOnly = listOf(true, false, false, false, false, false, false)
        assertEquals(emptyList(), PlanReminderLogic.quiet(listOf(plan(active = fri.minusDays(30), weekdays = sunOnly)), fri, fri))
    }

    @Test
    fun `after a reboot a time passed within the grace window fires now, an older one waits for tomorrow`() {
        val p = listOf(plan())
        val now = at(fri, 9)
        assertEquals(now, PlanReminderLogic.nextFire(p, now, null, fri, catchUp = true))
        assertEquals(at(fri.plusDays(1), 7, 30), PlanReminderLogic.nextFire(p, now, null, fri, catchUp = false))
        assertEquals(at(fri.plusDays(1), 7, 30), PlanReminderLogic.nextFire(p, at(fri, 11, 30), null, fri, catchUp = true))
        // Already notified today: no catch-up.
        assertEquals(at(fri.plusDays(1), 7, 30), PlanReminderLogic.nextFire(p, now, fri, fri, catchUp = true))
    }

    @Test
    fun `the message names the due plans and fires only within the grace window`() {
        val one = PlanReminderLogic.message(listOf(plan()), at(fri, 7, 30), null, fri)
        assertNotNull(one)
        assertEquals("a", one.planId)
        assertEquals("Bible in a Year", one.title)
        assertTrue(one.text in PlanReminderLogic.LINES)
        // Early (Robolectric or a clock change), late past the grace, or today already sent: nothing.
        assertNull(PlanReminderLogic.message(listOf(plan()), at(fri, 7, 29), null, fri))
        assertNull(PlanReminderLogic.message(listOf(plan()), at(fri, 11, 31), null, fri))
        assertNotNull(PlanReminderLogic.message(listOf(plan()), at(fri, 11, 29), null, fri))
        assertNull(PlanReminderLogic.message(listOf(plan()), at(fri, 8), fri, fri))

        val two = PlanReminderLogic.message(listOf(plan("b", "07:00", name = "The Volumes in Order"), plan("a")), at(fri, 8), null, fri)
        assertEquals("b", two!!.planId)
        assertEquals("The Volumes in Order and Bible in a Year", two.title)
        val three = PlanReminderLogic.message(
            listOf(plan("a"), plan("b", "07:00", name = "Psalms"), plan("c", "06:00", name = "Letters")), at(fri, 8), null, fri,
        )
        assertEquals("c", three!!.planId)
        assertEquals("Letters and 2 more", three.title)
        // A plan whose time is still ahead today is not in this one; it does not get its own later either (one a day).
        val later = PlanReminderLogic.message(listOf(plan("a", "07:00"), plan("b", "20:00", name = "Psalms")), at(fri, 7, 5), null, fri)
        assertEquals("Bible in a Year", later!!.title)
    }

    @Test
    fun `the wording moves on each day and repeats only after the whole list`() {
        val days = (0L until PlanReminderLogic.LINES.size.toLong()).map { PlanReminderLogic.lineFor(fri.plusDays(it)) }
        assertEquals(PlanReminderLogic.LINES.size, days.toSet().size)
        assertNotEquals(PlanReminderLogic.lineFor(fri), PlanReminderLogic.lineFor(fri.plusDays(1)))
        assertEquals(PlanReminderLogic.lineFor(fri), PlanReminderLogic.lineFor(fri.plusDays(PlanReminderLogic.LINES.size.toLong())))
        // Before 1970 too (floorMod, never a negative index).
        PlanReminderLogic.lineFor(LocalDate.of(1960, 1, 1))
        for (l in PlanReminderLogic.LINES) assertFalse(l.contains('!'), l)
    }

    @Test
    fun `a DST change keeps the reader's wall-clock time`() {
        // US clocks go back 2026-11-01 02:00; 7:30 stays 7:30 local.
        val sat = LocalDate.of(2026, 10, 31)
        val next = PlanReminderLogic.nextFire(listOf(plan(active = sat)), at(sat, 8), null, sat, false)!!
        assertEquals(LocalTime.of(7, 30), next.toLocalTime())
        assertEquals(LocalDate.of(2026, 11, 1), next.toLocalDate())
        // Spring forward 2027-03-14: a 02:30 reminder lands in the gap and is moved forward, never dropped.
        val gapDay = LocalDate.of(2027, 3, 14)
        val gap = PlanReminderLogic.nextFire(listOf(plan(time = "02:30", active = gapDay)), at(gapDay, 0), null, gapDay, false)!!
        assertEquals(gapDay, gap.toLocalDate())
        assertTrue(gap.isAfter(ZonedDateTime.of(gapDay.atTime(1, 59), zone)))
    }
}
