package com.votreader.sacredui

import android.app.Activity
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.OpenableColumns
import android.os.Build
import android.os.Bundle
import android.os.Looper
import androidx.lifecycle.ViewModelProvider
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** A documents provider that records which documents were deleted (DocumentsContract.deleteDocument
 *  reaches it as call("android:deleteDocument")) and answers each document's size: 0 (a document the
 *  picker just created) unless [sizes] says otherwise (a file the reader chose to overwrite). */
class RecordingDocsProvider : ContentProvider() {
    companion object {
        const val AUTHORITY = "test.docs"
        val deleted = CopyOnWriteArrayList<Uri>()
        val sizes = ConcurrentHashMap<Uri, Long>()
    }
    override fun onCreate() = true
    override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
        if (method == "android:deleteDocument") {
            @Suppress("DEPRECATION")
            (extras?.getParcelable("uri") as Uri?)?.let { deleted.add(it) }
        }
        return Bundle()
    }
    override fun query(uri: Uri, p: Array<out String>?, s: String?, a: Array<out String>?, o: String?): Cursor =
        MatrixCursor(arrayOf(OpenableColumns.SIZE)).apply { addRow(arrayOf<Any>(sizes[uri] ?: 0L)) }
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<out String>?) = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<out String>?) = 0
}

/**
 * W12 (sweep 2026-10-13): the system file pickers behind backup, notes export and import.
 *
 * - A device with no document picker app: the v3 export, v3 import and v2 import launches threw
 *   out of the UI-thread post and crashed the app; each must answer JS with its error instead.
 * - The notes export (.md) asked the picker for application/json, so the provider renamed the
 *   file to "… notes 2026-10-14.md.json".
 * - A picker answer that arrives after Android killed the app (the payload and the request lived
 *   only in memory) left an empty created document behind: an empty .votbak that Verify and
 *   Import call corrupt, or an empty notes file. It must be deleted.
 *
 * Driven through the real onCreate and the real ActivityResultRegistry; process death is a new
 * ActivityController (a new ViewModelStore) restored from the first one's saved state.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class MainActivityPickerTest {

    private val orphan: Uri = Uri.parse("content://${RecordingDocsProvider.AUTHORITY}/document/orphan")

    @Before
    fun setup() {
        RecordingDocsProvider.deleted.clear()
        RecordingDocsProvider.sizes.clear()
        Robolectric.setupContentProvider(RecordingDocsProvider::class.java, RecordingDocsProvider.AUTHORITY)
    }

    private fun idle() = shadowOf(Looper.getMainLooper()).idle()

    // visible(): JsBridge.callOptional goes through webView.post, which runs only once the view is attached.
    private fun started() = Robolectric.buildActivity(MainActivity::class.java).create().start().resume().visible()

    private fun lastJs(activity: MainActivity): String {
        idle()
        return shadowOf(activity.activeWebView).lastEvaluatedJavascript ?: ""
    }

    private fun vmOf(activity: MainActivity) = ViewModelProvider(activity)[MainViewModel::class.java]

    /** Launch a picker, then kill the "process": a fresh controller (fresh ViewModelStore and fields)
     *  restored from the saved state, the way Android restarts the app to deliver the picker's answer. */
    private fun relaunchedAfterProcessDeath(launch: (MainActivity) -> Unit): Pair<MainActivity, Int> {
        val first = started()
        launch(first.get())
        val request = shadowOf(first.get()).nextStartedActivityForResult
        assertNotNull(request, "the picker must have been launched")
        val saved = Bundle()
        first.pause().stop().saveInstanceState(saved).destroy()
        val second = Robolectric.buildActivity(MainActivity::class.java).create(saved).start().resume().visible()
        return second.get() to request.requestCode
    }

    private fun awaitDeleted(uri: Uri, ms: Long = 2_000L): Boolean {
        val deadline = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < deadline) {
            idle()
            if (uri in RecordingDocsProvider.deleted) return true
            Thread.sleep(10)
        }
        return uri in RecordingDocsProvider.deleted
    }

    // ── no document picker on the device ──

    @Test
    fun `v3 backup export with no picker app answers launch_failed instead of crashing`() {
        val activity = started().get()
        shadowOf(RuntimeEnvironment.getApplication()).checkActivities(true)
        activity.launchV3ExportPicker("votreader-backup-2026-10-14.votbak")
        val js = lastJs(activity)
        assertTrue(js.contains("__onV3ExportReady") && js.contains("error:launch_failed"), js)
    }

    @Test
    fun `v3 backup import and verify with no picker app answer launch_failed instead of crashing`() {
        val activity = started().get()
        shadowOf(RuntimeEnvironment.getApplication()).checkActivities(true)
        activity.launchV3ImportPicker()
        val js = lastJs(activity)
        assertTrue(js.contains("__onV3ImportReady") && js.contains("error:launch_failed"), js)
    }

    @Test
    fun `v2 import with no picker app answers like a cancel instead of crashing`() {
        val activity = started().get()
        shadowOf(RuntimeEnvironment.getApplication()).checkActivities(true)
        activity.launchFilePicker()
        assertEquals("window.__onImportFile && window.__onImportFile(null)", lastJs(activity))
    }

    // ── the notes export keeps its .md name ──

    @Test
    fun `a notes export asks the picker for a markdown document so the file keeps its md name`() {
        val activity = started().get()
        activity.launchExportPicker("Matthew notes 2026-10-14.md", "# Notes")
        val intent = shadowOf(activity).nextStartedActivityForResult.intent
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, intent.action)
        assertEquals("text/markdown", intent.type)
        assertEquals("Matthew notes 2026-10-14.md", intent.getStringExtra(Intent.EXTRA_TITLE))
    }

    @Test
    fun `control - a json export still asks the picker for application json`() {
        val activity = started().get()
        activity.launchExportPicker("votreader-backup.json", "{}")
        assertEquals("application/json", shadowOf(activity).nextStartedActivityForResult.intent.type)
    }

    // ── an answer that arrives after process death ──

    @Test
    fun `a notes export answered after process death deletes the empty document it created`() {
        val (activity, rq) = relaunchedAfterProcessDeath { it.launchExportPicker("Matthew notes 2026-10-14.md", "# Notes") }
        assertTrue(activity.activityResultRegistry.dispatchResult(rq, Activity.RESULT_OK, Intent().setData(orphan)))
        assertTrue(awaitDeleted(orphan), "the created notes file has no content to write: it must not stay behind empty")
    }

    @Test
    fun `a v3 backup export answered after process death deletes the empty votbak and stashes nothing`() {
        val (activity, rq) = relaunchedAfterProcessDeath { it.launchV3ExportPicker("votreader-backup-2026-10-14.votbak") }
        assertTrue(activity.activityResultRegistry.dispatchResult(rq, Activity.RESULT_OK, Intent().setData(orphan)))
        assertTrue(awaitDeleted(orphan), "nobody will stream into this .votbak: an empty one reads as a corrupt backup")
        assertNull(vmOf(activity).pendingV3ExportUri)
    }

    @Test
    fun `control - after process death a chosen file that already holds bytes is never deleted`() {
        // The reader picked an existing backup to overwrite; the app died before anything was written.
        // Their old file is intact and must stay that way.
        val existing = Uri.parse("content://${RecordingDocsProvider.AUTHORITY}/document/older-backup")
        RecordingDocsProvider.sizes[existing] = 4096L
        val (activity, rq) = relaunchedAfterProcessDeath { it.launchV3ExportPicker("votreader-backup-2026-10-14.votbak") }
        assertTrue(activity.activityResultRegistry.dispatchResult(rq, Activity.RESULT_OK, Intent().setData(existing)))
        assertFalse(awaitDeleted(existing, 500L), "a file with bytes is the reader's own: never deleted")
    }

    // ── a renderer death mid-backup (W12's process-death path, for the renderer) ──
    // The renderer is likeliest to run out of memory exactly when the page streams a media-heavy
    // backup. The fresh page it reboots into asks for nothing, so the dead page's backup must end
    // the way its own abort would have ended it.

    private fun rendererDies(activity: MainActivity) {
        val wv = activity.activeWebView
        wv.webViewClient.onRenderProcessGone(wv, null)
        idle()
    }

    /** A provider stream the test can see closed (Robolectric hands it out for its uri). */
    private class SeenStream : ByteArrayOutputStream() {
        @Volatile var closed = false
        override fun close() { closed = true; super.close() }
    }

    /** Pick [dest] in the v3 save picker; the answer lands while the page that asked is alive. */
    private fun pickedForBackup(activity: MainActivity, dest: Uri, sink: SeenStream) {
        shadowOf(activity.contentResolver).registerOutputStream(dest, sink)
        activity.launchV3ExportPicker("votreader-backup-2026-11-04.votbak")
        val request = shadowOf(activity).nextStartedActivityForResult
        shadowOf(activity).receiveResult(request.intent, Activity.RESULT_OK, Intent().setData(dest))
        assertEquals(dest, vmOf(activity).pendingV3ExportUri)
    }

    @Test
    fun `a v3 backup export answered after the page's renderer died deletes the empty votbak and stashes nothing`() {
        val activity = started().get()
        activity.launchV3ExportPicker("votreader-backup-2026-11-04.votbak")
        val request = shadowOf(activity).nextStartedActivityForResult
        rendererDies(activity)
        shadowOf(activity).receiveResult(request.intent, Activity.RESULT_OK, Intent().setData(orphan))
        assertTrue(awaitDeleted(orphan), "the page that asked died with its renderer: nobody will stream into this .votbak")
        assertNull(vmOf(activity).pendingV3ExportUri)
    }

    @Test
    fun `an export the page was streaming when its renderer died is closed and its partial deleted`() {
        val activity = started().get()
        val dest = Uri.parse("content://${RecordingDocsProvider.AUTHORITY}/document/streaming")
        RecordingDocsProvider.sizes[dest] = 4096L   // half-written: an empty-only delete would keep it
        val sink = SeenStream()
        pickedForBackup(activity, dest, sink)
        val storage = vmOf(activity).storage
        // What the page's AndroidBridge.v3ExportBegin / v3ExportWriteBlob / v3ExportChunk do, cut mid-frame.
        assertIs<StorageManager.Result.Success<Unit>>(storage.beginV3Export(dest, "{}".toByteArray(Charsets.UTF_8)))
        assertIs<StorageManager.Result.Success<Unit>>(storage.v3ExportWriteBlobHeader(10L))
        assertIs<StorageManager.Result.Success<Unit>>(storage.v3ExportWriteChunk(ByteArray(4)))
        rendererDies(activity)
        assertTrue(awaitDeleted(dest), "a half-written .votbak nothing will finish reads as a corrupt backup: it must go")
        assertTrue(sink.closed, "the dead page's export stream must be closed, not left open")
        assertNull(vmOf(activity).pendingV3ExportUri)
    }

    @Test
    fun `control - a backup the page finished before its renderer died is never deleted`() {
        val activity = started().get()
        val dest = Uri.parse("content://${RecordingDocsProvider.AUTHORITY}/document/finished")
        RecordingDocsProvider.sizes[dest] = 4096L
        pickedForBackup(activity, dest, SeenStream())
        val storage = vmOf(activity).storage
        assertIs<StorageManager.Result.Success<Unit>>(storage.beginV3Export(dest, "{}".toByteArray(Charsets.UTF_8)))
        assertIs<StorageManager.Result.Success<Unit>>(storage.finishV3Export(commit = true, uri = dest))
        // The renderer died after the commit, before AndroidBridge.v3ExportFinish cleared the stashed uri.
        rendererDies(activity)
        assertFalse(awaitDeleted(dest, 500L), "a finished backup holds the reader's data: never deleted")
    }

    @Test
    fun `control - a v3 backup export answered in the same process is stashed and reported ready`() {
        val controller = started()
        val activity = controller.get()
        activity.launchV3ExportPicker("votreader-backup-2026-10-14.votbak")
        val request = shadowOf(activity).nextStartedActivityForResult
        val dest = Uri.parse("content://${RecordingDocsProvider.AUTHORITY}/document/real")
        shadowOf(activity).receiveResult(request.intent, Activity.RESULT_OK, Intent().setData(dest))
        val js = lastJs(activity)
        assertEquals("window.__onV3ExportReady && window.__onV3ExportReady('ok')", js)
        assertEquals(dest, vmOf(activity).pendingV3ExportUri)
        assertTrue(RecordingDocsProvider.deleted.isEmpty())
    }
}
