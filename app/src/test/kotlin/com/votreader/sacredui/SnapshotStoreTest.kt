package com.votreader.sacredui

import org.json.JSONArray
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import android.os.Build
import java.io.File
import java.nio.file.Files
import java.util.Calendar
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * SnapshotStore (datasafe 2026-10-05): the rolling snapshots kept outside the
 * WebView's storage. Robolectric only for org.json; the store itself is plain
 * file I/O on a temp dir.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class SnapshotStoreTest {

    private lateinit var dir: File
    private lateinit var store: SnapshotStore

    @Before fun setUp() {
        dir = Files.createTempDirectory("snaps").toFile()
        store = SnapshotStore(File(dir, "snapshots"))
    }

    @After fun tearDown() { dir.deleteRecursively() }

    private fun at(y: Int, m: Int, d: Int, h: Int = 12): Long =
        Calendar.getInstance().apply { clear(); set(y, m - 1, d, h, 0, 0) }.timeInMillis

    private fun names(): List<String> {
        val arr = JSONArray(store.listJson())
        return (0 until arr.length()).map { arr.getJSONObject(it).getString("name") }
    }

    @Test fun `save then list and read round-trips, newest first`() {
        assertTrue(store.save("""{"a":1}""", at(2026, 10, 1)))
        assertTrue(store.save("""{"a":2}""", at(2026, 10, 2)))
        val n = names()
        assertEquals(listOf("snap-20261002-120000.json", "snap-20261001-120000.json"), n)
        assertEquals("""{"a":2}""", store.read(n[0]))
        assertEquals(at(2026, 10, 2), JSONArray(store.listJson()).getJSONObject(0).getLong("at"))
    }

    @Test fun `refuses empty, blank and oversized snapshots`() {
        assertFalse(store.save(null))
        assertFalse(store.save("  "))
        assertFalse(store.save("x".repeat((SnapshotStore.MAX_BYTES + 1).toInt())))
        assertEquals(emptyList(), names())
    }

    @Test fun `read never leaves the directory`() {
        File(dir, "secret.json").writeText("nope")
        assertEquals("", store.read("../secret.json"))
        assertEquals("", store.read("snap-20261001-120000.json"))   // absent
        assertEquals("", store.read(null))
    }

    @Test fun `two saves in one second both survive the save and the newest wins the day`() {
        val t = at(2026, 10, 3)
        assertTrue(store.save("one", t))
        assertTrue(store.save("two", t))
        // Same day: prune keeps the newest only.
        assertEquals(listOf("snap-20261003-120001.json"), names())
        assertEquals("two", store.read(names()[0]))
    }

    @Test fun `prune keeps one per day for 7 days, then one per week for 4 weeks`() {
        // 60 consecutive days, two saves a day.
        val cal = Calendar.getInstance().apply { clear(); set(2026, 7, 1, 9, 0, 0) }
        repeat(60) {
            store.save("am", cal.timeInMillis)
            store.save("pm", cal.timeInMillis + 8 * 3600_000L)
            cal.add(Calendar.DAY_OF_MONTH, 1)
        }
        val n = names()
        assertEquals(SnapshotStore.KEEP_DAYS + SnapshotStore.KEEP_WEEKS, n.size)
        // The newest 7 are 7 distinct consecutive days, each its later (pm) save.
        val days = n.take(7).map { it.substring(5, 13) }
        assertEquals(7, days.toSet().size)
        assertTrue(n.take(7).all { store.read(it) == "pm" })
        // The 4 weekly ones are all older than the daily ones and in distinct weeks.
        assertTrue(n.drop(7).all { it < n[6] })
    }

    @Test fun `weekly keepers across a year boundary are one per real week`() {
        // Daily saves from Dec 1 to Jan 20: the 4 weekly keepers fall in Dec/Jan
        // and must be 4 distinct Sunday-started weeks (WEEK_OF_YEAR split Dec 27-31).
        val cal = Calendar.getInstance().apply { clear(); set(2026, 11, 1, 10, 0, 0) }
        while (cal.get(Calendar.YEAR) == 2026 || cal.get(Calendar.DAY_OF_YEAR) <= 20) {
            store.save("d", cal.timeInMillis); cal.add(Calendar.DAY_OF_MONTH, 1)
        }
        val weekly = names().drop(SnapshotStore.KEEP_DAYS)
        assertEquals(SnapshotStore.KEEP_WEEKS, weekly.size)
        val sundays = weekly.map {
            val c = Calendar.getInstance().apply {
                clear(); set(it.substring(5, 9).toInt(), it.substring(9, 11).toInt() - 1, it.substring(11, 13).toInt())
            }
            c.add(Calendar.DAY_OF_MONTH, Calendar.SUNDAY - c.get(Calendar.DAY_OF_WEEK)); c.timeInMillis
        }
        assertEquals(weekly.size, sundays.toSet().size)
    }

    @Test fun `clear removes every snapshot and leaves other files`() {
        store.save("a", at(2026, 10, 1)); store.save("b", at(2026, 10, 2))
        File(File(dir, "snapshots"), "keep.txt").writeText("x")
        assertTrue(store.clear())
        assertEquals(emptyList(), names())
        assertTrue(File(File(dir, "snapshots"), "keep.txt").exists())
    }

    @Test fun `a leftover tmp from a killed save is swept`() {
        File(dir, "snapshots").mkdirs()
        val tmp = File(File(dir, "snapshots"), "snap-20261001-120000.json.tmp").apply { writeText("half") }
        store.save("whole", at(2026, 10, 2))
        assertFalse(tmp.exists())
    }
}
