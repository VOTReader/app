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

    /** A snapshot's shape: the page always hands over a JSON object with its stores. */
    private fun j(v: String) = """{"app":"VOTReader","stores":{"v":"$v"}}"""

    private fun names(): List<String> {
        val arr = JSONArray(store.listJson())
        return (0 until arr.length()).map { arr.getJSONObject(it).getString("name") }
    }

    @Test fun `save then list and read round-trips, newest first`() {
        assertTrue(store.save(j("1"), at(2026, 10, 1)))
        assertTrue(store.save(j("2"), at(2026, 10, 2)))
        val n = names()
        assertEquals(listOf("snap-20261002-120000.json", "snap-20261001-120000.json"), n)
        assertEquals(j("2"), store.read(n[0]))
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
        assertTrue(store.save(j("one"), t))
        assertTrue(store.save(j("two"), t))
        // Same day: prune keeps the newest only.
        assertEquals(listOf("snap-20261003-120001.json"), names())
        assertEquals(j("two"), store.read(names()[0]))
    }

    @Test fun `prune keeps one per day for 7 days, then one per week for 4 weeks`() {
        // 60 consecutive days, two saves a day.
        val cal = Calendar.getInstance().apply { clear(); set(2026, 7, 1, 9, 0, 0) }
        repeat(60) {
            store.save(j("am"), cal.timeInMillis)
            store.save(j("pm"), cal.timeInMillis + 8 * 3600_000L)
            cal.add(Calendar.DAY_OF_MONTH, 1)
        }
        val n = names()
        assertEquals(SnapshotStore.KEEP_DAYS + SnapshotStore.KEEP_WEEKS, n.size)
        // The newest 7 are 7 distinct consecutive days, each its later (pm) save.
        val days = n.take(7).map { it.substring(5, 13) }
        assertEquals(7, days.toSet().size)
        assertTrue(n.take(7).all { store.read(it) == j("pm") })
        // The 4 weekly ones are all older than the daily ones and in distinct weeks.
        assertTrue(n.drop(7).all { it < n[6] })
    }

    @Test fun `weekly keepers across a year boundary are one per real week`() {
        // Daily saves from Dec 1 to Jan 20: the 4 weekly keepers fall in Dec/Jan
        // and must be 4 distinct Sunday-started weeks (WEEK_OF_YEAR split Dec 27-31).
        val cal = Calendar.getInstance().apply { clear(); set(2026, 11, 1, 10, 0, 0) }
        while (cal.get(Calendar.YEAR) == 2026 || cal.get(Calendar.DAY_OF_YEAR) <= 20) {
            store.save(j("d"), cal.timeInMillis); cal.add(Calendar.DAY_OF_MONTH, 1)
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
        store.save(j("a"), at(2026, 10, 1)); store.save(j("b"), at(2026, 10, 2))
        File(File(dir, "snapshots"), "keep.txt").writeText("x")
        assertTrue(store.clear())
        assertEquals(emptyList(), names())
        assertTrue(File(File(dir, "snapshots"), "keep.txt").exists())
    }

    @Test fun `a leftover tmp from a killed save is swept`() {
        File(dir, "snapshots").mkdirs()
        val tmp = File(File(dir, "snapshots"), "snap-20261001-120000.json.tmp").apply { writeText("half") }
        store.save(j("whole"), at(2026, 10, 2))
        assertFalse(tmp.exists())
    }

    // W9 (sweep 2026-10-13): a snapshot renamed before its bytes reached the disk could come
    // back from a power cut empty or cut short, and as the newest of its day it made prune
    // delete the good copy before it.
    @Test fun `a snapshot a power cut left broken is never listed and never keeps its day (W9)`() {
        assertTrue(store.save(j("good"), at(2026, 10, 1, 9)))
        val snaps = File(dir, "snapshots")
        File(snaps, "snap-20261001-180000.json").writeText("""{"app":"VOTReader","stores":{"vot-no""")
        File(snaps, "snap-20261001-190000.json").writeText("")
        assertEquals(listOf("snap-20261001-090000.json"), names())
        assertTrue(store.save(j("next"), at(2026, 10, 2)))
        assertEquals(listOf("snap-20261002-120000.json", "snap-20261001-090000.json"), names())
        assertEquals(j("good"), store.read("snap-20261001-090000.json"))
        assertFalse(File(snaps, "snap-20261001-180000.json").exists())   // swept like a leftover .tmp
        assertFalse(File(snaps, "snap-20261001-190000.json").exists())
    }

    @Test fun `a snapshot broken in the middle is caught too, not only at its ends (W9 refuter)`() {
        assertTrue(store.save(j("good"), at(2026, 10, 1, 9)))
        val snaps = File(dir, "snapshots")
        File(snaps, "snap-20261001-180000.json").writeText("""{"stores":}""")
        assertEquals(listOf("snap-20261001-090000.json"), names())
        assertTrue(store.save(j("next"), at(2026, 10, 2)))
        assertEquals(j("good"), store.read("snap-20261001-090000.json"))
        assertEquals(listOf("snap-20261002-120000.json", "snap-20261001-090000.json"), names())
    }

    @Test fun `a snapshot the page could not read never keeps its day (lenient JSON, or no stores) (W9 refuter round 2)`() {
        assertTrue(store.save(j("good"), at(2026, 10, 1, 9)))
        val snaps = File(dir, "snapshots")
        File(snaps, "snap-20261001-180000.json").writeText("""{"stores":foo}""")
        File(snaps, "snap-20261001-190000.json").writeText("""{'stores':{}}""")
        File(snaps, "snap-20261001-200000.json").writeText("""{"app":"VOTReader"}""")
        File(snaps, "snap-20261001-210000.json").writeText("""{"stores":{}} {}""")
        File(snaps, "snap-20261001-220000.json").writeText("""{"stores":{},"stores":null}""")   // JSON.parse keeps the last
        assertEquals(listOf("snap-20261001-090000.json"), names())
        assertTrue(store.save(j("next"), at(2026, 10, 2)))
        assertEquals(j("good"), store.read("snap-20261001-090000.json"))
        assertEquals(listOf("snap-20261002-120000.json", "snap-20261001-090000.json"), names())
    }

    @Test fun `a real snapshot's JSON reads (numbers, escapes, nesting, unicode)`() {
        val json = """{"app":"VOTReader","exportVersion":3,"summary":{"highlights":2,"x":-1.5e-3,"y":0,"z":10E+2},""" +
            """"stores":{"vot-notes":{"a1":{"body":"line\n\"quoted\" \u00e9 \\ é ✝","keys":["bible:john:3:16",[]],"n":null,"t":true,"f":false}},"vot-links":[]}}"""
        assertTrue(store.save(json, at(2026, 10, 1)))
        assertEquals(listOf("snap-20261001-120000.json"), names())
        // A key the page reads as "stores" through an escape, and a later duplicate that fixes an earlier bad one.
        File(File(dir, "snapshots"), "snap-20261001-130000.json").writeText("""{"\u0073tores":{}}""")
        File(File(dir, "snapshots"), "snap-20261002-130000.json").writeText("""{"stores":null,"stores":{"v":1}}""")
        assertEquals(listOf("snap-20261002-130000.json", "snap-20261001-130000.json", "snap-20261001-120000.json"), names())
    }

    @Test fun `a snapshot's bytes are forced to the disk before it takes its name (W9)`() {
        val named = File(File(dir, "snapshots"), "snap-20261001-120000.json")
        val cloudCopy = File(File(dir, "snapshot-cloud"), "snap-20261001-120000.json")
        val seen = mutableListOf<Pair<Boolean, Boolean>>()
        store.sync = { out -> seen.add(named.exists() to cloudCopy.exists()); out.fd.sync() }
        assertTrue(store.save(j("a"), at(2026, 10, 1)))
        // The snapshot, then its cloud copy (ds-backup): each synced before it has its name.
        assertEquals(listOf(false to false, true to false), seen)
        assertEquals(j("a"), store.read(named.name))
    }

    // ds-backup: Google's cloud backup takes only snapshot-cloud/ (one copy of the newest
    // snapshot), so the 25 MB per-app cap holds however many snapshots the phone keeps.
    private fun cloud() = File(dir, "snapshot-cloud").listFiles()?.map { it.name }?.sorted() ?: emptyList()

    @Test fun `the cloud copy is the newest snapshot, and only it`() {
        assertTrue(store.save(j("1"), at(2026, 10, 1)))
        assertTrue(store.save(j("2"), at(2026, 10, 2)))
        assertEquals(listOf("snap-20261002-120000.json"), cloud())
        assertEquals(j("2"), File(dir, "snapshot-cloud/snap-20261002-120000.json").readText())
    }

    @Test fun `a restored phone with only the cloud copy lists and reads it`() {
        File(dir, "snapshot-cloud").mkdirs()
        File(dir, "snapshot-cloud/snap-20261001-120000.json").writeText(j("c"))
        assertEquals(listOf("snap-20261001-120000.json"), names())
        assertEquals(j("c"), store.read("snap-20261001-120000.json"))
    }

    @Test fun `snapshots from before the cloud copy seed it with the newest`() {
        assertTrue(store.save(j("1"), at(2026, 10, 1)))
        assertTrue(store.save(j("2"), at(2026, 10, 2)))
        File(dir, "snapshot-cloud").deleteRecursively()
        names()
        assertEquals(listOf("snap-20261002-120000.json"), SnapshotStore(File(dir, "snapshots")).let { it.listJson(); cloud() })
    }

    @Test fun `clear removes the cloud copy too`() {
        assertTrue(store.save(j("1"), at(2026, 10, 1)))
        assertTrue(store.clear())
        assertEquals(emptyList(), cloud())
        assertEquals(emptyList(), names())
    }
}
