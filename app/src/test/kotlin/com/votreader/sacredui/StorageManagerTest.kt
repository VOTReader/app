package com.votreader.sacredui

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.database.MatrixCursor
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import io.mockk.clearAllMocks
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
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
 * Base64.encodeToString, MediaStore.Downloads.EXTERNAL_CONTENT_URI,
 * MatrixCursor, etc. all behave like real Android instead of throwing
 * "Stub! method not mocked"). The Context + ContentResolver are MockK
 * stubs so each test can dial in the exact CR behaviour it wants.
 *
 * Class-level @Config pins SDK=Q (API 29) — the floor where
 * writeJsonToDownloads is allowed to work. The single pre-Q test
 * overrides at method level via @Config(sdk = [VERSION_CODES.P]) so
 * the Robolectric runner loads API 28's android-all jar for that case
 * only.
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

    // ─── writeJsonToDownloads ─────────────────────────────────────────

    @Test
    fun `writeJsonToDownloads success on Q+ writes content to inserted Uri`() {
        val outUri = Uri.parse("content://media/external/downloads/42")
        val captured = slot<ContentValues>()
        val stream = ByteArrayOutputStream()
        every {
            cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, capture(captured))
        } returns outUri
        every { cr.openOutputStream(outUri) } returns stream

        val result = storage.writeJsonToDownloads("VOTReader-export.json", "{\"a\":1}")
        assertIs<StorageManager.Result.Success<Unit>>(result)
        assertEquals("VOTReader-export.json",
            captured.captured.getAsString(MediaStore.Downloads.DISPLAY_NAME))
        assertEquals("application/json",
            captured.captured.getAsString(MediaStore.Downloads.MIME_TYPE))
        assertEquals("{\"a\":1}", stream.toString(Charsets.UTF_8.name()))
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.P])
    fun `writeJsonToDownloads on pre-Q returns requires_android_10`() {
        // Method-level @Config switches Robolectric to API 28. The early
        // return fires BEFORE any MediaStore.Downloads access, so the
        // MediaStore.Downloads class isn't loaded on the pre-Q SDK jar.
        val result = storage.writeJsonToDownloads("x.json", "{}")
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("requires_android_10", result.reason)
        // Critically: insert should never have been called.
        verify(exactly = 0) { cr.insert(any<Uri>(), any()) }
    }

    @Test
    fun `writeJsonToDownloads fails when insert returns null`() {
        every {
            cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any())
        } returns null

        val result = storage.writeJsonToDownloads("x.json", "{}")
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("no_uri", result.reason)
        // openOutputStream not invoked when there's no URI to write to.
        verify(exactly = 0) { cr.openOutputStream(any<Uri>()) }
    }

    @Test
    fun `writeJsonToDownloads fails when openOutputStream returns null`() {
        val outUri = Uri.parse("content://media/external/downloads/42")
        every {
            cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any())
        } returns outUri
        every { cr.openOutputStream(outUri) } returns null

        val result = storage.writeJsonToDownloads("x.json", "{}")
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("no_output_stream", result.reason)
    }

    @Test
    fun `writeJsonToDownloads fails when stream write throws`() {
        val outUri = Uri.parse("content://media/external/downloads/42")
        every {
            cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any())
        } returns outUri
        every { cr.openOutputStream(outUri) } returns object : OutputStream() {
            override fun write(b: Int) = throw IOException("quota exceeded")
            override fun write(b: ByteArray) = throw IOException("quota exceeded")
            override fun write(b: ByteArray, off: Int, len: Int) =
                throw IOException("quota exceeded")
        }

        val result = storage.writeJsonToDownloads("x.json", "{}")
        assertIs<StorageManager.Result.Failure>(result)
        assertEquals("quota exceeded", result.reason)
    }

    @Test
    fun `writeJsonToDownloads encodes content as UTF-8`() {
        // The arrow / em-dash / ellipsis test: each is > 1 byte in UTF-8.
        // Confirms toByteArray(Charsets.UTF_8) round-trips correctly.
        val outUri = Uri.parse("content://media/external/downloads/42")
        val stream = ByteArrayOutputStream()
        every {
            cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any())
        } returns outUri
        every { cr.openOutputStream(outUri) } returns stream

        val payload = "—…—"  // 3 chars, 9 bytes UTF-8
        storage.writeJsonToDownloads("export.json", payload)
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

    // ─── Helpers ──────────────────────────────────────────────────────

    private fun sizeCursor(size: Long): MatrixCursor {
        val c = MatrixCursor(arrayOf(OpenableColumns.SIZE))
        c.addRow(arrayOf<Any?>(size))
        return c
    }
}
