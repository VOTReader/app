package com.votreader.sacredui

import org.junit.Test
import java.util.Calendar
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * DownloadsCopy (datasafe dl-weekly 2026-10-05): the weekly copy in Downloads/VOTReader. The MediaStore
 * folder is swapped for an in-memory one; the name, size cap and keep-the-newest-4 rules are what is pinned.
 */
class DownloadsCopyTest {

    private class FakeFolder : DownloadsCopy.Folder {
        val files = mutableListOf<DownloadsCopy.Entry>()
        val bytes = mutableMapOf<Long, ByteArray>()
        var clock = 0L
        var failWrite = false
        private var nextId = 1L
        override fun write(name: String, bytes: ByteArray): Boolean {
            if (failWrite) return false
            val id = nextId++
            files.add(DownloadsCopy.Entry(id, name, clock))
            this.bytes[id] = bytes
            return true
        }
        override fun list(): List<DownloadsCopy.Entry> = files.toList()
        override fun delete(id: Long): Boolean = files.removeIf { it.id == id }
    }

    private fun at(y: Int, m: Int, d: Int): Long =
        Calendar.getInstance().apply { clear(); set(y, m - 1, d, 12, 0, 0) }.timeInMillis

    @Test fun `names carry the local date`() {
        assertEquals("votreader-weekly-2026-10-05.votbak", DownloadsCopy.fileName(at(2026, 10, 5)))
        assertTrue(DownloadsCopy.isCopyName("votreader-weekly-2026-10-05 (1).votbak"))
        assertFalse(DownloadsCopy.isCopyName("votreader-backup-2026-10-05.votbak"))
    }

    @Test fun `keeps the newest four copies and leaves other files alone`() {
        val folder = FakeFolder()
        folder.files.add(DownloadsCopy.Entry(999, "votreader-backup-2026-09-01.votbak", 0))
        val copy = DownloadsCopy(folder)
        for (week in 0 until 6) {
            folder.clock = at(2026, 9, 1) + week * 7L * 86_400_000
            assertTrue(copy.save("{\"week\":$week}", folder.clock))
        }
        val names = folder.files.map { it.name }
        assertEquals(5, names.size)
        assertTrue("votreader-backup-2026-09-01.votbak" in names)
        assertEquals(listOf("2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"),
            folder.files.filter { DownloadsCopy.isCopyName(it.name) }.map { it.name.substring(17, 27) })
    }

    @Test fun `refuses empty, oversized, a failed write, and devices without a folder`() {
        val folder = FakeFolder()
        val copy = DownloadsCopy(folder)
        assertFalse(copy.save(""))
        assertFalse(copy.save(null))
        assertFalse(copy.save("x".repeat((DownloadsCopy.MAX_BYTES + 1).toInt())))
        folder.failWrite = true
        assertFalse(copy.save("{}"))
        assertTrue(folder.files.isEmpty())
        assertFalse(DownloadsCopy(null).save("{}"))
        assertEquals("""{"supported":false,"count":0,"newestAt":0}""", DownloadsCopy(null).statusJson())
    }

    @Test fun `status counts this app's copies and names the newest`() {
        val folder = FakeFolder()
        val copy = DownloadsCopy(folder)
        assertEquals("""{"supported":true,"count":0,"newestAt":0}""", copy.statusJson())
        folder.clock = 1000; copy.save("{}", at(2026, 9, 28))
        folder.clock = 2000; copy.save("{}", at(2026, 10, 5))
        assertEquals("""{"supported":true,"count":2,"newestAt":2000}""", copy.statusJson())
    }
}
