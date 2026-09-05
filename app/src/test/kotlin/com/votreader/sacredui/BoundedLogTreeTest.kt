package com.votreader.sacredui

import android.util.Log
import org.junit.jupiter.api.Test
import timber.log.Timber
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

    @Test
    fun `entry sanitizes a sensitive tag (not just the message)`() {
        // Defense-in-depth: every real call site uses a static tag, but the
        // export advertises a sanitized tail. A dynamic content:// URI forced as
        // the tag must be redacted exactly like it would be inside the message.
        val tree = BoundedLogTree()
        tree.record(Log.WARN, "content://com.example.provider/secret.json", "ok")
        val entry = tree.getEntries().single()
        assertEquals("[uri]", entry.tag)
        assertEquals("ok", entry.message)
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
    fun `sanitize strips HTTP query and fragment secrets but keeps endpoint`() {
        val out = BoundedLogTree.sanitize(
            "Failed https://example.test/releases/file.jpg?token=secret#trace"
        )
        assertEquals("Failed https://example.test/releases/file.jpg[redacted]", out)
    }

    @Test
    fun `sanitize handles uppercase schemes and URL userinfo`() {
        val out = BoundedLogTree.sanitize(
            "Failed HTTPS://user:password@example.test/file?token=secret"
        )
        assertEquals("Failed HTTPS://[redacted]@example.test/file[redacted]", out)
    }

    @Test
    fun `sanitize removes all userinfo through the last authority at sign`() {
        val out = BoundedLogTree.sanitize("Failed https://user:secret@more@example.test/file")
        assertEquals("Failed https://[redacted]@example.test/file", out)
    }

    @Test
    fun `log applies sanitize before storing`() {
        // End-to-end: a log payload that includes a sensitive substring
        // should land redacted, not raw.
        val tree = BoundedLogTree()
        tree.record(Log.WARN, "T", "Pick from /storage/emulated/0/file.json failed")
        assertEquals("Pick from [path] failed", tree.getEntries().single().message)
    }

    // ─── toJson + escaping (NK5b) ─────────────────────────────────────

    @Test
    fun `toJson on empty buffer returns empty array`() {
        assertEquals("[]", BoundedLogTree().toJson())
    }

    @Test
    fun `toJson renders single entry`() {
        val tree = BoundedLogTree(clock = { 1_700_000_000_000L })
        tree.record(Log.WARN, "MyTag", "hello")
        assertEquals(
            "[{\"t\":1700000000000,\"lvl\":\"W\",\"tag\":\"MyTag\",\"msg\":\"hello\"}]",
            tree.toJson()
        )
    }

    @Test
    fun `toJson renders multiple entries in insertion order`() {
        var t = 0L
        val tree = BoundedLogTree(clock = { ++t })
        tree.record(Log.WARN, "A", "one")
        tree.record(Log.ERROR, "B", "two")
        assertEquals(
            "[{\"t\":1,\"lvl\":\"W\",\"tag\":\"A\",\"msg\":\"one\"}," +
                "{\"t\":2,\"lvl\":\"E\",\"tag\":\"B\",\"msg\":\"two\"}]",
            tree.toJson()
        )
    }

    @Test
    fun `toJson emits literal null for null tag`() {
        val tree = BoundedLogTree(clock = { 0L })
        tree.record(Log.WARN, null, "msg")
        assertEquals(
            "[{\"t\":0,\"lvl\":\"W\",\"tag\":null,\"msg\":\"msg\"}]",
            tree.toJson()
        )
    }

    @Test
    fun `toJson maps WARN ERROR ASSERT to W E A`() {
        var t = 0L
        val tree = BoundedLogTree(clock = { ++t })
        tree.record(Log.WARN, "T", "w")
        tree.record(Log.ERROR, "T", "e")
        tree.record(Log.ASSERT, "T", "a")
        val json = tree.toJson()
        assertTrue("\"lvl\":\"W\"" in json)
        assertTrue("\"lvl\":\"E\"" in json)
        assertTrue("\"lvl\":\"A\"" in json)
    }

    @Test
    fun `jsonString escapes quote and backslash`() {
        assertEquals("\"a\\\"b\\\\c\"", BoundedLogTree.jsonString("a\"b\\c"))
    }

    @Test
    fun `jsonString escapes hot-path control chars`() {
        // Newline, CR, tab — the three most common control chars in
        // free-text log lines.
        assertEquals(
            "\"line1\\nline2\\r\\tcol\"",
            BoundedLogTree.jsonString("line1\nline2\r\tcol")
        )
    }

    @Test
    fun `jsonString escapes other control chars via uXXXX`() {
        // Form feed (0x0c) + bell (0x07) — uncommon but a malformed
        // payload could contain them. Falls back to the generic
        // sub-0x20 path.
        assertEquals(
            "\"\\u0007\\u000c\"",
            BoundedLogTree.jsonString("\u0007\u000c")
        )
    }

    @Test
    fun `jsonString leaves non-ASCII verbatim`() {
        // Unicode passes through; the consumer reads the output as UTF-8.
        // Em-dash + arrow + ellipsis — multi-byte UTF-8 sequences.
        val msg = "— → …"
        assertEquals("\"$msg\"", BoundedLogTree.jsonString(msg))
    }

    @Test
    fun `toJson roundtrips a sanitized payload`() {
        // Realistic end-to-end: a log line with a sensitive path lands
        // sanitized in the entry, AND the JSON-string escape keeps the
        // surrounding text intact.
        val tree = BoundedLogTree(clock = { 99L })
        tree.record(Log.WARN, "Pick", "Picked /storage/emulated/0/x.json: \"odd\"")
        // After sanitize: "Picked [path]: \"odd\""
        // After jsonString: "\"Picked [path]: \\\"odd\\\"\""
        assertEquals(
            "[{\"t\":99,\"lvl\":\"W\",\"tag\":\"Pick\"," +
                "\"msg\":\"Picked [path]: \\\"odd\\\"\"}]",
            tree.toJson()
        )
    }

    // ─── levelChar ────────────────────────────────────────────────────

    @Test
    fun `levelChar maps Log priorities`() {
        assertEquals("W", BoundedLogTree.levelChar(Log.WARN))
        assertEquals("E", BoundedLogTree.levelChar(Log.ERROR))
        assertEquals("A", BoundedLogTree.levelChar(Log.ASSERT))
        // Unknown levels (shouldn't appear post-filter, but defensive).
        assertEquals("?", BoundedLogTree.levelChar(Log.DEBUG))
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

    // ─── per-entry byte cap ─────────────────────────────────────────────
    //
    // The buffer bounds entry COUNT and never touched the message — but Timber's
    // prepareLog appends getStackTraceString(t) to the message BEFORE log() ever
    // sees it. Measured in this JVM: 90 bytes for a plain WARN, 5,489 with one
    // throwable, 5,853 with three chained causes, ~1.05 MB for 200 of them —
    // inside the diagnostic export the reader shares from Settings. A logger that
    // destroys the log is worse than no logger: one 5 KB entry evicts 5 KB of
    // other evidence from a ring that counts entries.
    //
    // These go through Timber rather than calling log() with a hand-composed
    // message, because the composition IS the defect: a test against a message
    // shape I invented would pass against a tree that never sees the real one.

    private fun captureWarn(t: Throwable?, message: String): BoundedLogTree {
        Timber.uprootAll()
        val tree = BoundedLogTree()
        Timber.plant(tree)
        if (t == null) Timber.w(message) else Timber.w(t, message)
        Timber.uprootAll()
        return tree
    }

    private fun chained(depth: Int): Throwable {
        var t: Throwable = IllegalStateException("root cause text")
        for (i in 0 until depth) t = RuntimeException("wrapper $i text", t)
        return t
    }

    private fun storedBytes(tree: BoundedLogTree) =
        tree.getEntries().single().message.toByteArray(Charsets.UTF_8).size

    @Test
    fun `a WARN carrying a throwable is stored under the 512-byte entry cap`() {
        val tree = captureWarn(
            java.io.IOException("ENOSPC: no space left on device"),
            "audio keep-alive startForeground failed",
        )
        val size = storedBytes(tree)
        assertTrue(size <= 512, "entry was $size bytes")
    }

    // 512 is written as a literal here, NOT read from the constant it checks.
    // Asserting against BoundedLogTree's own constant would pass whatever that
    // constant became, which is not a cap, it is a mirror.

    @Test
    fun `a plain message over the cap is capped too`() {
        val tree = captureWarn(null, "x".repeat(4000))
        val size = storedBytes(tree)
        assertTrue(size <= 512, "entry was $size bytes")
    }

    @Test
    fun `200 throwable entries keep the whole export under 128 KB`() {
        Timber.uprootAll()
        val tree = BoundedLogTree()
        Timber.plant(tree)
        repeat(200) { Timber.w(java.io.IOException("ENOSPC: no space left on device"), "v3 export write failed") }
        Timber.uprootAll()
        val bytes = tree.toJson().toByteArray(Charsets.UTF_8).size
        assertTrue(bytes < 131_072, "export was $bytes bytes")
    }

    @Test
    fun `only the first three frames are kept and the rest are counted`() {
        val tree = captureWarn(java.io.IOException("boom"), "v3 export write failed")
        val stored = tree.getEntries().single().message
        assertEquals(3, stored.split("\n\tat ").size - 1, "frame lines in: $stored")
        assertTrue(Regex("""\+\d+ frames""").containsMatchIn(stored), "no dropped-frame marker in: $stored")
    }

    // ── the three controls ─────────────────────────────────────────
    // All three pass BEFORE the cap exists and after it. Without them,
    // "everything is under 512 bytes" is satisfied by a tree that stores nothing
    // useful. They do NOT all catch the same wrong fix, and saying which catches
    // what is the difference between a control and a decoration:
    //
    //   stored whole      catches a budget so tight it truncates ordinary lines,
    //                     or a cap applied where it should not be. It PASSES
    //                     against message.take(512) -- that is not its job.
    //   cause chain       catches message.take(512), the obvious wrong fix: the
    //                     first 512 characters of a Timber message are the head,
    //                     the toString and some frames, so every "Caused by:"
    //                     falls off the end and the root cause is lost.
    //   surrogate pair    catches ANY char-based truncation, take(512) included.
    //                     The leading "A" below is load-bearing: without it the
    //                     cut lands on an even index, every pair survives by
    //                     luck, and the control passes against the very fix it
    //                     exists to fail.

    @Test
    fun `control - a plain message under the cap is stored whole, not truncated`() {
        val msg = "audio keep-alive startForeground failed — WebView keep-alive still active"
        val tree = captureWarn(null, msg)
        assertEquals(msg, tree.getEntries().single().message)
    }

    @Test
    fun `control - the whole cause chain's messages survive the cap`() {
        val tree = captureWarn(chained(3), "v3 export write failed")
        val stored = tree.getEntries().single().message
        assertTrue(stored.contains("root cause text"), "root cause lost from: $stored")
        for (i in 0 until 3) {
            assertTrue(stored.contains("wrapper $i text"), "wrapper $i lost from: $stored")
        }
    }

    @Test
    fun `control - the cap never splits a surrogate pair`() {
        // A blind message.take(512) cuts on a UTF-16 unit and can leave a lone
        // high surrogate. toJson() emits code points above the control range
        // verbatim, so that lone surrogate reaches the reader's export as
        // invalid UTF-8 and can break JSON.parse on the JS side.
        // "A" first, so a char-based cut lands mid-pair instead of between pairs.
        val tree = captureWarn(null, "A" + "\uD83D\uDD25".repeat(400))
        val stored = tree.getEntries().single().message
        assertTrue(stored.isNotEmpty(), "nothing stored at all")
        assertTrue(!stored.last().isHighSurrogate(), "stored value ends on a lone high surrogate")
    }

}
