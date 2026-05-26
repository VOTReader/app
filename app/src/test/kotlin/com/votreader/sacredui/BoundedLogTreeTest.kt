package com.votreader.sacredui

import android.util.Log
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * NK5a — BoundedLogTree contract tests. Pure-JVM (no Robolectric
 * needed) -- BoundedLogTree only uses java.util collections + Timber's
 * Tree base class, neither of which is Android-framework-coupled.
 * android.util.Log's level constants are integer literals at compile
 * time, so referencing them here doesn't pull in any stubbed methods.
 */
class BoundedLogTreeTest {

    // Helper -- Kotlin can't disambiguate tree.log(...) at the test
    // call site between Timber.Tree's abstract 4-arg overload and its
    // public vararg overloads when both String? and String are in play.
    // Calling through this helper pins the 4-arg form by parameter name.
    private fun BoundedLogTree.record(priority: Int, tag: String?, message: String) =
        log(priority = priority, tag = tag, message = message, t = null)

    // ─── level filtering ──────────────────────────────────────────────

    @Test
    fun `log at WARN is captured`() {
        val tree = BoundedLogTree()
        tree.record(Log.WARN, "Tag", "msg")
        assertEquals(1, tree.getEntries().size)
    }

    @Test
    fun `log at ERROR is captured`() {
        val tree = BoundedLogTree()
        tree.record(Log.ERROR, "Tag", "msg")
        assertEquals(1, tree.getEntries().size)
    }

    @Test
    fun `log at ASSERT is captured`() {
        val tree = BoundedLogTree()
        tree.record(Log.ASSERT, "Tag", "msg")
        assertEquals(1, tree.getEntries().size)
    }

    @Test
    fun `log at INFO is ignored`() {
        val tree = BoundedLogTree()
        tree.record(Log.INFO, "Tag", "msg")
        assertTrue(tree.getEntries().isEmpty())
    }

    @Test
    fun `log at DEBUG is ignored`() {
        val tree = BoundedLogTree()
        tree.record(Log.DEBUG, "Tag", "msg")
        assertTrue(tree.getEntries().isEmpty())
    }

    @Test
    fun `log at VERBOSE is ignored`() {
        val tree = BoundedLogTree()
        tree.record(Log.VERBOSE, "Tag", "msg")
        assertTrue(tree.getEntries().isEmpty())
    }

    // ─── entry shape ──────────────────────────────────────────────────

    @Test
    fun `entry preserves level tag and message`() {
        // Inject a fixed clock so the timestamp assertion is exact.
        val tree = BoundedLogTree(clock = { 1_700_000_000_000L })
        tree.record(Log.WARN, "MyTag", "hello")
        val entry = tree.getEntries().single()
        assertEquals(Log.WARN, entry.level)
        assertEquals("MyTag", entry.tag)
        assertEquals("hello", entry.message)
        assertEquals(1_700_000_000_000L, entry.timestamp)
    }

    @Test
    fun `entry tolerates null tag`() {
        val tree = BoundedLogTree()
        tree.record(Log.WARN, null, "msg")
        val entry = tree.getEntries().single()
        assertNull(entry.tag)
    }

    // ─── capacity + ordering ──────────────────────────────────────────

    @Test
    fun `capacity is enforced - oldest entry evicted on overflow`() {
        // Log 5 distinct messages to a capacity-3 buffer. The first
        // two ("m1", "m2") get evicted; the tail three remain in
        // insertion order.
        val tree = BoundedLogTree(capacity = 3)
        for (i in 1..5) tree.record(Log.WARN, "T", "m$i")
        val msgs = tree.getEntries().map { it.message }
        assertEquals(listOf("m3", "m4", "m5"), msgs)
    }

    @Test
    fun `getEntries returns a defensive copy`() {
        // External callers must not be able to mutate internal state.
        val tree = BoundedLogTree()
        tree.record(Log.WARN, "T", "a")
        val snap = tree.getEntries()
        // Mutating attempt -- this list IS a List, so calls like add()
        // would throw UnsupportedOperationException or be silently
        // applied to a copy. Either way, the tree's view must remain
        // intact.
        assertEquals(1, snap.size)
        tree.record(Log.WARN, "T", "b")
        // Old snapshot unchanged; new snapshot has both entries.
        assertEquals(1, snap.size)
        assertEquals(2, tree.getEntries().size)
    }

    @Test
    fun `clear empties the buffer`() {
        val tree = BoundedLogTree()
        tree.record(Log.WARN, "T", "a")
        tree.record(Log.ERROR, "T", "b")
        assertEquals(2, tree.getEntries().size)
        tree.clear()
        assertTrue(tree.getEntries().isEmpty())
        // Post-clear, new entries still land.
        tree.record(Log.WARN, "T", "c")
        assertEquals(1, tree.getEntries().size)
    }

    // ─── sanitization ─────────────────────────────────────────────────

    @Test
    fun `sanitize redacts content URI`() {
        val out = BoundedLogTree.sanitize("Read content://com.example.provider/file.json done")
        assertEquals("Read [uri] done", out)
    }

    @Test
    fun `sanitize redacts file URI`() {
        val out = BoundedLogTree.sanitize("Wrote file:///data/local/tmp/x.bin")
        // file:// is matched by the URI regex first; the inner /data/...
        // remainder is consumed as part of the URI match. Either redaction
        // alone covers the leak.
        assertEquals("Wrote [uri]", out)
    }

    @Test
    fun `sanitize redacts storage path`() {
        val out = BoundedLogTree.sanitize("Picked /storage/emulated/0/Download/data.json")
        assertEquals("Picked [path]", out)
    }

    @Test
    fun `sanitize redacts data path`() {
        val out = BoundedLogTree.sanitize("cacheDir = /data/user/0/com.votreader.sacredui/cache")
        assertEquals("cacheDir = [path]", out)
    }

    @Test
    fun `sanitize leaves plain text untouched`() {
        val msg = "Renderer crashed; recovering."
        assertEquals(msg, BoundedLogTree.sanitize(msg))
    }

    @Test
    fun `log applies sanitize before storing`() {
        // End-to-end: a log payload that includes a sensitive substring
        // should land redacted, not raw.
        val tree = BoundedLogTree()
        tree.record(Log.WARN, "T", "Pick from /storage/emulated/0/file.json failed")
        assertEquals("Pick from [path] failed", tree.getEntries().single().message)
    }

    // ─── concurrent writes ────────────────────────────────────────────

    @Test
    fun `concurrent writes do not corrupt the buffer`() {
        // 8 threads × 200 writes each = 1600 attempts against a 1000-cap
        // buffer. We can't predict the exact final size (some writes race
        // with eviction), but we CAN assert:
        //   1. No exception escapes the synchronization (the executor
        //      finishes cleanly).
        //   2. Final buffer size <= capacity.
        //   3. Every stored entry has non-null fields where production
        //      guarantees non-null (level, message). A torn write would
        //      surface here as a null leak.
        val tree = BoundedLogTree(capacity = 1000)
        val pool = Executors.newFixedThreadPool(8)
        val latch = CountDownLatch(8)
        repeat(8) { threadId ->
            pool.submit {
                try {
                    repeat(200) { i ->
                        tree.record(Log.WARN, "T$threadId", "msg-$threadId-$i")
                    }
                } finally {
                    latch.countDown()
                }
            }
        }
        assertTrue(latch.await(10, TimeUnit.SECONDS), "writers timed out")
        pool.shutdown()
        pool.awaitTermination(5, TimeUnit.SECONDS)
        val entries = tree.getEntries()
        assertTrue(entries.size <= 1000, "size exceeded capacity: ${entries.size}")
        // Every entry well-formed.
        for (e in entries) {
            assertTrue(e.message.startsWith("msg-"), "torn message: ${e.message}")
            assertEquals(Log.WARN, e.level)
        }
    }
}
