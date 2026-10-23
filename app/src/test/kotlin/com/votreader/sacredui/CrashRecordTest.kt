package com.votreader.sacredui

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** ds5 s41.1: the crash record the Export's diagnostic tail reads after the process died. */
class CrashRecordTest {

    @Test
    fun `a crash entry names the exception and its first frames, with credentials redacted`() {
        val e = IllegalStateException("load failed https://cdn.example.com/a.mp3?token=SECRET")
        val json = CrashRecord.entryJson(1_760_000_000_000L, e)
        assertTrue(json.startsWith("{\"t\":1760000000000,\"lvl\":\"E\",\"tag\":\"crash\",\"msg\":"))
        assertTrue("java.lang.IllegalStateException: load failed https://cdn.example.com/a.mp3[redacted]" in json)
        assertTrue("CrashRecordTest" in json, "the first frames are kept")
        assertFalse("SECRET" in json)
    }

    @Test
    fun `a crash on a file in a folder with a space keeps none of its path`() {
        val e = java.io.FileNotFoundException("/storage/emulated/0/Private Notes/prayer.txt: open failed: ENOENT")
        val json = CrashRecord.entryJson(1L, e)
        assertTrue("FileNotFoundException: [path]: open failed" in json, json)
        assertFalse("Notes" in json || "prayer" in json, json)
    }

    @Test
    fun `merge joins entry arrays and skips empty or broken ones`() {
        assertEquals("[]", CrashRecord.merge("[]", "", "[]"))
        assertEquals("[{\"a\":1},{\"b\":2}]", CrashRecord.merge("[{\"a\":1}]", "[]", "not json", "[{\"b\":2}]"))
    }

    @Test
    fun `before install there is nothing to read`() {
        assertEquals("[]", CrashRecord.entriesJson())
    }
}
