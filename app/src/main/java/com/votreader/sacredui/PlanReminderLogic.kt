package com.votreader.sacredui

import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/**
 * rp-s1 (reading plans S1, Corbin's call 4A, 2026-10-22): when the daily reading-plan reminder fires, and what it says.
 *
 * The page hands the native side the plans that have a reminder on ([PlanReminder.set]); the alarm then fires with the
 * page closed, so every rule has to be decided here from that list alone:
 *   - one notification a day at most, across all plans (the earliest due plan's time sets it);
 *   - a plan is silent on a day its reading is already done, on a day of the week it does not read, past its end, and
 *     while paused (the page leaves a paused plan out; `paused` here is the belt to that);
 *   - a plan nobody has touched for more than [QUIET_AFTER_DAYS] days goes quiet on its own until the page sends a
 *     newer `active` date (the page asks the reader once whether to keep it: [quiet] lists them);
 *   - the wording rotates by date, so the same line does not come back every morning.
 *
 * Pure JVM (java.time, no Android): the JaCoCo floor in app/build.gradle.kts measures it, PlanReminderLogicTest drives it.
 */
object PlanReminderLogic {

    /** A plan untouched for more than this many days goes quiet (call 4A: "pauses itself after 7 untouched days"). */
    const val QUIET_AFTER_DAYS = 7L

    /**
     * An alarm that Doze or a reboot held back still fires within this long after the plan's time; past it, that day's
     * reminder is skipped instead of arriving at a time the reader never chose.
     */
    val GRACE: Duration = Duration.ofHours(4)

    /** Used when the page sends no time (call 4A's suggested default). */
    val DEFAULT_TIME: LocalTime = LocalTime.of(7, 30)

    /**
     * One plan with its reminder on.
     * [weekdays]: the reading days, Sunday first (the page's `run.weekdays`); null or none on = every day.
     * [done]: the date the reader last finished a day of this plan. [active]: the last date the reader touched it.
     */
    data class Plan(
        val id: String,
        val name: String,
        val time: LocalTime,
        val weekdays: List<Boolean>? = null,
        val done: LocalDate? = null,
        val active: LocalDate? = null,
        val end: LocalDate? = null,
        val paused: Boolean = false,
    )

    /** What one notification says. [planId] is the plan a tap opens (the earliest due one). */
    data class Message(val planId: String, val title: String, val text: String)

    // Calm and short, no guilt, no exclamation marks (the research in the reading-plan brief: one respectful reminder
    // helps, nagging hurts; rotating copy helped retention).
    internal val LINES = listOf(
        "Today's reading is ready when you are.",
        "A few quiet minutes with today's reading?",
        "Your reading for today is here.",
        "Today's portion is waiting for you.",
        "When you have a moment, today's reading is ready.",
        "Pick up today's reading whenever it suits you.",
    )

    /** "HH:MM" (24 h) to a time, or null for anything else. */
    fun parseTime(s: String?): LocalTime? {
        val m = Regex("^(\\d{1,2}):(\\d{2})$").find(s?.trim() ?: return null) ?: return null
        val h = m.groupValues[1].toInt()
        val min = m.groupValues[2].toInt()
        return if (h in 0..23 && min in 0..59) LocalTime.of(h, min) else null
    }

    /** "YYYY-MM-DD" to a date, or null for anything else (2026-02-30 included). */
    fun parseDate(s: String?): LocalDate? {
        if (s.isNullOrBlank() || !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(s)) return null
        return try { LocalDate.parse(s) } catch (_: Exception) { null }
    }

    /** Whether [plan] reads on [day]: not paused, not past its end, and [day] is one of its weekdays. */
    fun readsOn(plan: Plan, day: LocalDate): Boolean {
        if (plan.paused) return false
        if (plan.end != null && day.isAfter(plan.end)) return false
        val wd = plan.weekdays
        if (wd != null && wd.size == 7 && wd.any { it } && !wd[day.dayOfWeek.value % 7]) return false
        return true
    }

    /**
     * Whether [plan] has gone quiet by [day]: untouched for more than [QUIET_AFTER_DAYS] days. [setOn] (the day the
     * page last sent the list) stands in for a missing `active`.
     */
    fun isQuiet(plan: Plan, day: LocalDate, setOn: LocalDate?): Boolean {
        val since = plan.active ?: setOn ?: return false
        return ChronoUnit.DAYS.between(since, day) > QUIET_AFTER_DAYS
    }

    /** Whether [plan] wants a reminder on [day]. */
    fun dueOn(plan: Plan, day: LocalDate, setOn: LocalDate?): Boolean =
        readsOn(plan, day) && plan.done != day && !isQuiet(plan, day, setOn)

    /** The ids of the plans that have gone quiet by [today] (the page asks once whether to keep each). */
    fun quiet(plans: List<Plan>, today: LocalDate, setOn: LocalDate?): List<String> =
        plans.filter { readsOn(it, today) && isQuiet(it, today, setOn) }.map { it.id }

    /**
     * When the alarm should next go off, or null when no plan will want a reminder in the next eight days.
     *
     * A day already notified ([lastNotified]) is skipped. On today, a time already passed is skipped, unless
     * [catchUp] (after a reboot or a clock change, when the alarm that was set may have been lost) and it passed less
     * than [GRACE] ago: then the alarm goes off at [now] and [message] decides.
     */
    fun nextFire(
        plans: List<Plan>,
        now: ZonedDateTime,
        lastNotified: LocalDate?,
        setOn: LocalDate?,
        catchUp: Boolean,
    ): ZonedDateTime? {
        val today = now.toLocalDate()
        for (offset in 0L..8L) {
            val day = today.plusDays(offset)
            if (day == lastNotified) continue
            var best: ZonedDateTime? = null
            for (p in plans) {
                if (!dueOn(p, day, setOn)) continue
                val at = day.atTime(p.time).atZone(now.zone)
                val candidate = when {
                    at.isAfter(now) -> at
                    catchUp && Duration.between(at, now) < GRACE -> now
                    else -> null
                } ?: continue
                if (best == null || candidate.isBefore(best)) best = candidate
            }
            if (best != null) return best
        }
        return null
    }

    /**
     * What to show when the alarm goes off at [now], or null for nothing: today already notified, every plan done or
     * quiet, or no plan's time reached within the last [GRACE].
     */
    fun message(plans: List<Plan>, now: ZonedDateTime, lastNotified: LocalDate?, setOn: LocalDate?): Message? {
        val today = now.toLocalDate()
        if (today == lastNotified) return null
        val due = plans.filter { p ->
            if (!dueOn(p, today, setOn)) return@filter false
            val at = today.atTime(p.time).atZone(now.zone)
            !at.isAfter(now) && Duration.between(at, now) < GRACE
        }.sortedWith(compareBy({ it.time }, { it.id }))
        if (due.isEmpty()) return null
        val first = due[0]
        val title = when (due.size) {
            1 -> first.name
            2 -> "${first.name} and ${due[1].name}"
            else -> "${first.name} and ${due.size - 1} more"
        }
        return Message(first.id, title, lineFor(today))
    }

    /** Whether any plan still wants a reminder today (when none does, a notification still showing is taken down). */
    fun anyDueToday(plans: List<Plan>, today: LocalDate, setOn: LocalDate?): Boolean =
        plans.any { dueOn(it, today, setOn) }

    /** Today's line: by date, so the wording moves on each day and is the same all of one day. */
    fun lineFor(day: LocalDate): String = LINES[Math.floorMod(day.toEpochDay(), LINES.size.toLong()).toInt()]
}
