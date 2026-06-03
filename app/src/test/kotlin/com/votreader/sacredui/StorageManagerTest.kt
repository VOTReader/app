package com.votreader.sacredui

import android.content.ContentResolver
import android.content.Context
import android.database.MatrixCursor
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import io.mockk.clearAllMocks
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * NK3 — StorageManager tests.
 *
 * Setup: Robolectric brings up the Android framework runtime (so
 * Base64.encodeToString, Uri.parse, MatrixCursor, etc. all behave like
 * real Android instead of throwing "Stub! method not mocked"). The
 * Context + ContentResolver are MockK stubs so each test can dial in the
 * exact CR behaviour it wants.
 *
 * Class-level @Config pins SDK=Q purely to fix the android-all jar
 * Robolectric loads; nothing here is SDK-gated anymore. The export
 * writer (writeTextToUri) targets a SAF document URI, which works on
 * every supported API level — that's the whole point of the SAF switch
 * (the old MediaStore.Downloads writer hard-failed on Android 8/9).
 *
 * StorageManager only touches `context.contentResolver` (never cacheDir
 * / packageName / resources), so a relaxed Context mock with one stubbed
 * accessor is sufficient -- the real Robolectric Context isn't needed.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class StorageManagerTest {

    private lateinit var context: Context
    private lateinit var cr: ContentResolver
    private lateinit var storage: StorageManager

    @Before
    fun setup() {
        context = mockk(relaxed = true)
        cr = mockk(relaxed = false)
        every { context.contentResolver } returns cr
        storage = StorageManager(context)
    }

    @After
    fun tearDown() {
        clearAllMocks()
    }

    // ─── queryFileSize ────────────────────────────────────────────────

    @Test
    fun `queryFileSize returns size from SIZE column`() {
        val uri = Uri.parse("content://test/file")
        every { cr.query(uri, any(), null, null, null) } returns
            sizeCursor(12_345L)
        assertEquals(12_345L, storage.queryFileSize(uri))
    }

    @Test
    fun `queryFileSize returns -1 when SIZE column is absent`() {
        val uri = Uri.parse("content://test/no-size")
        // A picker that returns name + mime but no SIZE -- production
        // code's getColumnIndex(SIZE) returns -1, branch falls through
        // to the final -1L.
        val cursor = MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME))
        cursor.addRow(arrayOf("file.json"))
        every { cr.query(uri, any(), null, null, null) } returns cursor
        assertEquals(-1L, storage.queryFileSize(uri))
    }

    @Test
    fun `queryFileSize returns -1 when SIZE column value is null`() {
        val uri = Uri.parse("content://test/null-size")
        val cursor = MatrixCursor(arrayOf(OpenableColumns.SIZE))
        cursor.addRow(arrayOf<Any?>(null))
        every { cr.query(uri, any(), null, null, null) } returns cursor
        assertEquals(-1L, storage.queryFileSize(uri))
    }

    @Test
    fun `queryFileSize returns -1 when cursor is empty`() {
        // moveToFirst() returns false → branch falls through.
        val uri = Uri.parse("content://test/empty")
        val cursor = MatrixCursor(arrayOf(OpenableColumns.SIZE))
        every { cr.query(uri, any(), null, null, null) } returns cursor
        assertEquals(-1L, storage.queryFileSize(uri))
    }

    @Test
    fun `queryFileSize returns -1 when query returns null cursor`() {
        val uri = Uri.parse("content://test/null-cursor")
        every { cr.query(uri, any(), null, null, null) } returns null
        assertEquals(-1L, storage.queryFileSize(uri))
    }

    @Test
    fun `queryFileSize returns -1 when query throws SecurityException`() {
        // The ff0f459 regression test. A SecurityException from query()
        // would crash the filePickerLauncher callback before this fix;
        // the try/catch in queryFileSize now folds it into the
        // unknown-size return path.
        val uri = Uri.parse("content://test/revoked")
        every { cr.query(uri, any(), null, null, null) } throws
            SecurityException("Permission Denial: reading com.example")
        assertEquals(-1L, storage.queryFileSize(uri))
    }

    @Test
    fun `queryFileSize returns -1 when query throws IllegalStateException`() {
        // A provider whose process died mid-call throws ISE. Same
        // exception class as a "closed cursor" path. Both fold into
        // unknown-size.
        val uri = Uri.parse("content://test/dead-provider")
        every { cr.query(uri, any(), null, null, null) } throws
            IllegalStateException("Provider unavailable")
        assertEquals(-1L, storage.queryFileSize(uri))
    }

    // ─── readUriAsBase64 ──────────────────────────────────────────────

    @Test
    fun `readUriAsBase64 success returns base64 of file content`() {
        val uri = Uri.parse("content://test/payload")
        val bytes = "hello world".toByteArray(Charsets.UTF_8)
        every { cr.query(uri, any(), null, null, null) } returns
            sizeCursor(bytes.size.toLong())
        every { cr.openInputStream(uri) } returns ByteArrayInputStream(bytes)

        val result = storage.readUriAsBase64(uri)
        assertIs<StorageManager.Result.Success<String>>(result)
        // Base64.NO_WRAP of "hello world" is "aGVsbG8gd29ybGQ=".
        assertEquals(
            Base64.encodeToString(bytes, Base64.NO_WRAP),
            result.value
        )
    }

    @Test
    fun `readUriAsBase64 rejects file larger than maxBytes`() {
        val uri = Uri.parse("content://test/too-big")
        // queryFileSize returns a value over the limit BEFORE we read
        // the file -- the cap protects against OOM, not against malice.
        every { cr.query(uri, any(), null, null, null) } returns
            sizeCursor(100L * 1024 * 1024)  // 100 MB > 50 MB default cap

        val result = storage.readUriAsBase64(uri)
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("too_large", result.reason)
        // openInputStream should NEVER be invoked -- the size check fires first.
        verify(exactly = 0) { cr.openInputStream(any<Uri>()) }
    }

    @Test
    fun `readUriAsBase64 respects custom maxBytes`() {
        // Same path but caller supplies a tighter cap.
        val uri = Uri.parse("content://test/custom-cap")
        every { cr.query(uri, any(), null, null, null) } returns
            sizeCursor(1024L)
        val result = storage.readUriAsBase64(uri, maxBytes = 100L)
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("too_large", result.reason)
    }

    @Test
    fun `readUriAsBase64 rejects unknown-size URI`() {
        // queryFileSize returns -1 -- the SecurityException / null
        // cursor / missing column class. JS sees Failure("unknown_size").
        val uri = Uri.parse("content://test/no-size")
        every { cr.query(uri, any(), null, null, null) } returns null

        val result = storage.readUriAsBase64(uri)
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("unknown_size", result.reason)
        verify(exactly = 0) { cr.openInputStream(any<Uri>()) }
    }

    @Test
    fun `readUriAsBase64 fails when stream read throws`() {
        val uri = Uri.parse("content://test/io-error")
        every { cr.query(uri, any(), null, null, null) } returns
            sizeCursor(10L)
        every { cr.openInputStream(uri) } returns object : InputStream() {
            override fun read(): Int = throw IOException("disk read fail")
        }

        val result = storage.readUriAsBase64(uri)
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("disk read fail", result.reason)
    }

    @Test
    fun `readUriAsBase64 null openInputStream falls back to empty success`() {
        // The ?: ByteArray(0) fallback in the production code. Empty
        // bytes → empty Base64. Documents a behaviour that's deliberately
        // forgiving: a content-provider that returns null is treated as
        // "empty file", not "fail" -- the JS side gets an empty payload
        // and shows the same "imported nothing" error.
        val uri = Uri.parse("content://test/null-stream")
        every { cr.query(uri, any(), null, null, null) } returns
            sizeCursor(0L)
        every { cr.openInputStream(uri) } returns null

        val result = storage.readUriAsBase64(uri)
        assertIs<StorageManager.Result.Success<String>>(result)
        assertEquals("", result.value)
    }

    @Test
    fun `readUriAsBase64 round-trips arbitrary binary content`() {
        // A non-ASCII payload (an export blob would contain UTF-8 text +
        // base64-encoded images). Confirms we don't accidentally treat
        // bytes as text anywhere.
        val uri = Uri.parse("content://test/binary")
        val bytes = byteArrayOf(0, 1, 2, 0xFF.toByte(), 0x7F.toByte(), 0x80.toByte())
        every { cr.query(uri, any(), null, null, null) } returns
            sizeCursor(bytes.size.toLong())
        every { cr.openInputStream(uri) } returns ByteArrayInputStream(bytes)

        val result = storage.readUriAsBase64(uri)
        assertIs<StorageManager.Result.Success<String>>(result)
        // Decoding the result must yield the original bytes.
        val decoded = Base64.decode(result.value, Base64.NO_WRAP)
        assertTrue(decoded.contentEquals(bytes))
    }

    // ─── writeTextToUri (SAF export) ──────────────────────────────────
    // The export writer now targets a user-chosen SAF document URI
    // (ACTION_CREATE_DOCUMENT) instead of the MediaStore.Downloads
    // collection. SAF is API 19+, so — unlike the old writer — there is
    // NO SDK floor; Android 8/9 (minSdk 26) can export. These tests stub
    // only contentResolver.openOutputStream(uri).

    @Test
    fun `writeTextToUri success writes content to the chosen Uri`() {
        val uri = Uri.parse("content://com.android.providers.downloads.documents/document/42")
        val stream = ByteArrayOutputStream()
        every { cr.openOutputStream(uri) } returns stream

        val result = storage.writeTextToUri(uri, "{\"a\":1}")
        assertIs<StorageManager.Result.Success<Unit>>(result)
        assertEquals("{\"a\":1}", stream.toString(Charsets.UTF_8.name()))
    }

    @Test
    fun `writeTextToUri fails when openOutputStream returns null`() {
        val uri = Uri.parse("content://test/no-stream")
        every { cr.openOutputStream(uri) } returns null

        val result = storage.writeTextToUri(uri, "{}")
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("no_output_stream", result.reason)
    }

    @Test
    fun `writeTextToUri fails when stream write throws`() {
        val uri = Uri.parse("content://test/full-disk")
        every { cr.openOutputStream(uri) } returns object : OutputStream() {
            override fun write(b: Int) = throw IOException("quota exceeded")
            override fun write(b: ByteArray) = throw IOException("quota exceeded")
            override fun write(b: ByteArray, off: Int, len: Int) =
                throw IOException("quota exceeded")
        }

        val result = storage.writeTextToUri(uri, "{}")
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("quota exceeded", result.reason)
    }

    @Test
    fun `writeTextToUri encodes content as UTF-8`() {
        // The arrow / em-dash / ellipsis test: each is > 1 byte in UTF-8.
        // Confirms toByteArray(Charsets.UTF_8) round-trips correctly.
        val uri = Uri.parse("content://test/utf8")
        val stream = ByteArrayOutputStream()
        every { cr.openOutputStream(uri) } returns stream

        val payload = "—…—"  // 3 chars, 9 bytes UTF-8
        storage.writeTextToUri(uri, payload)
        assertEquals(payload, stream.toString(Charsets.UTF_8.name()))
        assertEquals(9, stream.size())
    }

    // ─── Result sealed interface ──────────────────────────────────────

    @Test
    fun `Result Success destructures into its value`() {
        val r: StorageManager.Result<Int> = StorageManager.Result.Success(7)
        val (v) = r as StorageManager.Result.Success<Int>
        assertEquals(7, v)
    }

    @Test
    fun `Result Failure destructures into its reason`() {
        val r: StorageManager.Result<Int> = StorageManager.Result.Failure("nope")
        val (reason) = r as StorageManager.Result.Failure
        assertEquals("nope", reason)
    }

    @Test
    fun `Result Success equals same value`() {
        assertEquals(
            StorageManager.Result.Success("x"),
            StorageManager.Result.Success("x")
        )
    }

    @Test
    fun `Result Failure equals same reason`() {
        assertEquals(
            StorageManager.Result.Failure("nope"),
            StorageManager.Result.Failure("nope")
        )
    }

    // ─── v3 streaming container (BACKUP-STREAMING-PLAN P3) ────────────
    // The native framing must be byte-identical to the web codec
    // (src/utils/backup-container.js) so a backup written on either platform
    // imports on the other. These exercise the framing directly over
    // ByteArray streams (the same way writeTextToUri's tests stub the CR).

    @Test
    fun `v3 export writes the exact on-disk framing (magic + BE lengths + raw bytes)`() {
        val uri = Uri.parse("content://test/v3-export")
        val sink = ByteArrayOutputStream()
        every { cr.openOutputStream(uri) } returns sink

        val manifest = "{\"app\":\"VOTReader\",\"exportVersion\":3}".toByteArray(Charsets.UTF_8)
        val blob1 = byteArrayOf(1, 2, 3, 0xFF.toByte())
        val blob2 = "voice".toByteArray(Charsets.UTF_8)

        assertIs<StorageManager.Result.Success<Unit>>(storage.beginV3Export(uri, manifest))
        assertIs<StorageManager.Result.Success<Unit>>(storage.v3ExportWriteBlobHeader(blob1.size.toLong()))
        assertIs<StorageManager.Result.Success<Unit>>(storage.v3ExportWriteChunk(blob1))
        assertIs<StorageManager.Result.Success<Unit>>(storage.v3ExportWriteBlobHeader(blob2.size.toLong()))
        assertIs<StorageManager.Result.Success<Unit>>(storage.v3ExportWriteChunk(blob2))
        assertIs<StorageManager.Result.Success<Unit>>(storage.finishV3Export(commit = true, uri = uri))

        // The exact layout the web codec also produces: magic, BE manifest len,
        // manifest, then per-frame BE len + raw bytes.
        val expected = ByteArrayOutputStream().apply {
            write("VOTBACK1".toByteArray(Charsets.US_ASCII))
            write(beLong(manifest.size.toLong())); write(manifest)
            write(beLong(blob1.size.toLong())); write(blob1)
            write(beLong(blob2.size.toLong())); write(blob2)
        }.toByteArray()

        assertTrue(
            sink.toByteArray().contentEquals(expected),
            "native v3 framing must match backup-container.js byte-for-byte"
        )
    }

    @Test
    fun `v3 round-trips manifest + media bytes exactly (write then read back)`() {
        // WRITE a container to a buffer.
        val exportUri = Uri.parse("content://test/v3-exp")
        val sink = ByteArrayOutputStream()
        every { cr.openOutputStream(exportUri) } returns sink
        val manifestJson = "{\"exportVersion\":3,\"media\":[{\"id\":\"m1\",\"size\":4},{\"id\":\"m2\",\"size\":5}]}"
        val m1 = byteArrayOf(0, 1, 2, 0x80.toByte())            // includes a high byte
        val m2 = byteArrayOf(9, 8, 7, 6, 5)
        storage.beginV3Export(exportUri, manifestJson.toByteArray(Charsets.UTF_8))
        storage.v3ExportWriteBlobHeader(m1.size.toLong()); storage.v3ExportWriteChunk(m1)
        storage.v3ExportWriteBlobHeader(m2.size.toLong()); storage.v3ExportWriteChunk(m2)
        storage.finishV3Export(commit = true, uri = exportUri)
        val container = sink.toByteArray()

        // READ it back.
        val importUri = Uri.parse("content://test/v3-imp")
        every { cr.openInputStream(importUri) } returns ByteArrayInputStream(container)
        val begin = storage.beginV3Import(importUri)
        assertIs<StorageManager.Result.Success<String>>(begin)
        assertEquals("v3:$manifestJson", begin.value)        // manifest survives verbatim

        val n1 = storage.v3ImportNextBlob()
        assertIs<StorageManager.Result.Success<Long>>(n1)
        assertEquals(4L, n1.value)
        assertTrue(readWholeFrame().contentEquals(m1))       // bytes survive exactly

        val n2 = storage.v3ImportNextBlob()
        assertIs<StorageManager.Result.Success<Long>>(n2)
        assertEquals(5L, n2.value)
        assertTrue(readWholeFrame().contentEquals(m2))

        assertIs<StorageManager.Result.Success<Unit>>(storage.closeV3Import())
    }

    @Test
    fun `beginV3Import sniffs a legacy JSON backup and returns it tagged`() {
        val uri = Uri.parse("content://test/legacy")
        val json = "{\"app\":\"VOTReader\",\"exportVersion\":2,\"stores\":{}}"
        every { cr.openInputStream(uri) } returns ByteArrayInputStream(json.toByteArray(Charsets.UTF_8))
        val r = storage.beginV3Import(uri)
        assertIs<StorageManager.Result.Success<String>>(r)
        assertEquals("legacy:$json", r.value)
    }

    @Test
    fun `v3 import detects a truncated media frame`() {
        // Frame header declares 10 bytes but only 3 follow before EOF.
        val truncated = ByteArrayOutputStream().apply {
            write("VOTBACK1".toByteArray(Charsets.US_ASCII))
            val manifest = "{\"media\":[{\"id\":\"m1\",\"size\":10}]}".toByteArray(Charsets.UTF_8)
            write(beLong(manifest.size.toLong())); write(manifest)
            write(beLong(10L)); write(byteArrayOf(1, 2, 3))     // says 10, gives 3
        }.toByteArray()
        val uri = Uri.parse("content://test/trunc")
        every { cr.openInputStream(uri) } returns ByteArrayInputStream(truncated)

        assertIs<StorageManager.Result.Success<String>>(storage.beginV3Import(uri))
        val n = storage.v3ImportNextBlob()
        assertIs<StorageManager.Result.Success<Long>>(n)
        assertEquals(10L, n.value)
        // Reading the frame hits EOF before the declared length → loud failure.
        val chunk = storage.v3ImportReadChunk(64)
        assertIs<StorageManager.Result.Failure>(chunk)
        assertEquals("truncated", chunk.reason)
    }

    @Test
    fun `v3 export rejects a short final frame on commit`() {
        val uri = Uri.parse("content://test/short")
        every { cr.openOutputStream(uri) } returns ByteArrayOutputStream()
        storage.beginV3Export(uri, "{}".toByteArray(Charsets.UTF_8))
        storage.v3ExportWriteBlobHeader(5L)
        storage.v3ExportWriteChunk(byteArrayOf(1, 2, 3))         // only 3 of 5
        val r = storage.finishV3Export(commit = true, uri = uri)
        assertIs<StorageManager.Result.Failure>(r)
        assertEquals("frame_incomplete", r.reason)
    }

    @Test
    fun `v3 export refuses to overflow a frame`() {
        val uri = Uri.parse("content://test/overflow")
        every { cr.openOutputStream(uri) } returns ByteArrayOutputStream()
        storage.beginV3Export(uri, "{}".toByteArray(Charsets.UTF_8))
        storage.v3ExportWriteBlobHeader(2L)
        val r = storage.v3ExportWriteChunk(byteArrayOf(1, 2, 3, 4, 5))  // 5 > 2
        assertIs<StorageManager.Result.Failure>(r)
        assertEquals("frame_overflow", r.reason)
    }

    @Test
    fun `v3 export rejects a new blob header before the prior frame completes`() {
        val uri = Uri.parse("content://test/incomplete")
        every { cr.openOutputStream(uri) } returns ByteArrayOutputStream()
        storage.beginV3Export(uri, "{}".toByteArray(Charsets.UTF_8))
        storage.v3ExportWriteBlobHeader(5L)
        storage.v3ExportWriteChunk(byteArrayOf(1, 2, 3))         // frame not done
        val r = storage.v3ExportWriteBlobHeader(2L)              // illegal: prior frame open
        assertIs<StorageManager.Result.Failure>(r)
        assertEquals("frame_incomplete", r.reason)
    }

    @Test
    fun `v3 bridge methods fail cleanly with no open session`() {
        assertEquals("no_session", (storage.v3ExportWriteBlobHeader(1L) as StorageManager.Result.Failure).reason)
        assertEquals("no_session", (storage.v3ExportWriteChunk(byteArrayOf(1)) as StorageManager.Result.Failure).reason)
        assertEquals("no_session", (storage.v3ImportNextBlob() as StorageManager.Result.Failure).reason)
        // finish/close with no session are benign no-ops / failures, never crashes.
        assertIs<StorageManager.Result.Failure>(storage.finishV3Export(commit = true, uri = null))
        assertIs<StorageManager.Result.Success<Unit>>(storage.closeV3Import())
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    /** Drain the current import frame via small reads (exercises multi-read). */
    private fun readWholeFrame(): ByteArray {
        val out = ByteArrayOutputStream()
        while (true) {
            val r = storage.v3ImportReadChunk(3)
            assertIs<StorageManager.Result.Success<ByteArray>>(r)
            if (r.value.isEmpty()) break
            out.write(r.value)
        }
        return out.toByteArray()
    }

    /** 8-byte big-endian encoding (the spec's frame/manifest length format). */
    private fun beLong(v: Long): ByteArray {
        val b = ByteArray(8)
        for (i in 0 until 8) b[i] = (v ushr (8 * (7 - i))).toByte()
        return b
    }

    private fun sizeCursor(size: Long): MatrixCursor {
        val c = MatrixCursor(arrayOf(OpenableColumns.SIZE))
        c.addRow(arrayOf<Any?>(size))
        return c
    }
}
