package com.votreader.sacredui

import android.Manifest
import android.app.Application
import android.os.Build
import android.util.Base64
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * NK4 — NativeAudioRecorder state-machine tests.
 *
 * MediaRecorder is JNI-backed and cannot be exercised in a JVM unit test
 * (Robolectric ships a no-op shadow that doesn't actually capture audio).
 * Anything past the start() permission check requires a real device, so
 * these tests focus on the surface that doesn't need a live MediaRecorder:
 *
 *   - the permission gate in start()
 *   - state-machine safety for null-recorder calls (stop, pause, resume,
 *     amplitude)
 *   - cancel / release idempotence
 *   - Result sealed-interface contract
 *
 * Real-device verification of the full record → preview → save flow is
 * owed against an actual phone — see tools/n1-smoke-walk.md (NK7).
 *
 * Class-level @Config: Q (API 29) so the SDK base matches the rest of
 * the suite and the runtime can resolve MediaRecorder(context).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class NativeAudioRecorderTest {

    private lateinit var application: Application
    private lateinit var recorder: NativeAudioRecorder

    @Before
    fun setup() {
        application = ApplicationProvider.getApplicationContext()
        recorder = NativeAudioRecorder(application)
        // Default: revoke RECORD_AUDIO so start() tests the deny path.
        // Individual tests grant it back when they need to (none currently
        // do, since a real start() can't be tested without JNI).
        shadowOf(application).denyPermissions(Manifest.permission.RECORD_AUDIO)
    }

    @After
    fun tearDown() {
        recorder.release()
    }

    // ─── start permission gate ────────────────────────────────────────

    @Test
    fun `start without RECORD_AUDIO returns Failure permission`() {
        // Permission revoked in @Before. The check happens BEFORE any
        // MediaRecorder instantiation, so this test is reliable in the
        // unit-test JVM (no JNI required).
        val result = recorder.start()
        assertIs<NativeAudioRecorder.Result.Failure>(result)
        assertEquals("permission", result.reason)
    }

    // ─── null-recorder state safety ───────────────────────────────────

    @Test
    fun `stop without prior start returns no_recording`() {
        val result = recorder.stop()
        assertIs<NativeAudioRecorder.Result.Failure>(result)
        assertEquals("no_recording", result.reason)
    }

    @Test
    fun `pause without prior start is a graceful no-op`() {
        // Per production: recorder?.pause() short-circuits to a no-op,
        // pauseStartMs gets a non-meaningful timestamp, return Success.
        // Documents the "pause is forgiving" UX behaviour so a regression
        // that suddenly returns Failure here would be caught.
        val result = recorder.pause()
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(result)
    }

    @Test
    fun `resume without prior start is a graceful no-op`() {
        // Same reasoning as pause -- the JS side calls resume() whenever
        // its own state thinks "paused", and we don't want to surface an
        // error during a recovery flow that the native side has already
        // forgotten.
        val result = recorder.resume()
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(result)
    }

    @Test
    fun `amplitude without recorder returns 0`() {
        // Drives the waveform UI; a stale poll after stop/cancel should
        // render a flat line, not throw.
        assertEquals(0, recorder.amplitude())
    }

    // ─── cancel / release idempotence ─────────────────────────────────

    @Test
    fun `cancel without prior start does not throw`() {
        // Defensive: the Activity's onDestroy / ViewModel's onCleared
        // both call release() (which is cancel()); a fresh recorder
        // that's never seen a start() must handle that gracefully.
        recorder.cancel()
    }

    @Test
    fun `cancel called twice in a row does not throw`() {
        // The state machine: first cancel clears recorder + recordFile
        // to null; second cancel hits the null-and-null branch (no-op).
        // Guards against a subtle regression where the second call
        // tried to re-stop a recorder that was already null.
        recorder.cancel()
        recorder.cancel()
    }

    @Test
    fun `release is alias for cancel`() {
        // release() simply delegates to cancel() in production. Calling
        // release first then cancel second is the post-onCleared +
        // post-onDestroy ordering; both should be benign.
        recorder.release()
        recorder.cancel()
    }

    @Test
    fun `release called three times in a row does not throw`() {
        recorder.release()
        recorder.release()
        recorder.release()
    }

    @Test
    fun `release then stop returns no_recording`() {
        // Defines the post-release contract: any further state-modifying
        // call returns its "nothing here" failure, not a throw.
        recorder.release()
        val result = recorder.stop()
        assertIs<NativeAudioRecorder.Result.Failure>(result)
        assertEquals("no_recording", result.reason)
    }

    // ─── Result sealed-interface contract ─────────────────────────────

    @Test
    fun `Result Success and Failure are distinct`() {
        val s: NativeAudioRecorder.Result<Int> =
            NativeAudioRecorder.Result.Success(7)
        val f: NativeAudioRecorder.Result<Int> =
            NativeAudioRecorder.Result.Failure("bad")
        assertIs<NativeAudioRecorder.Result.Success<Int>>(s)
        assertIs<NativeAudioRecorder.Result.Failure>(f)
        assertEquals(7, (s as NativeAudioRecorder.Result.Success<Int>).value)
        assertEquals("bad", (f as NativeAudioRecorder.Result.Failure).reason)
    }

    @Test
    fun `RecordingResult holds base64 and duration`() {
        val r = NativeAudioRecorder.RecordingResult("dGVzdA==", 1234L)
        assertEquals("dGVzdA==", r.base64)
        assertEquals(1234L, r.durationMs)
    }

    @Test
    fun `RecordingResult carries an optional served fileName`() {
        // #1: the happy fetch-bridge path returns a fileName (no base64).
        val r = NativeAudioRecorder.RecordingResult(base64 = null, durationMs = 500L, fileName = "abc.m4a")
        assertEquals(null, r.base64)
        assertEquals(500L, r.durationMs)
        assertEquals("abc.m4a", r.fileName)
    }

    // ─── #1: served-recording orphan sweep ────────────────────────────

    @Test
    fun `start sweeps stale served recordings but keeps fresh ones`() {
        // start() prunes recordings/ files older than the TTL (memos orphaned when
        // the app died before JS fetched them) but never a just-served file (an
        // in-flight fetch is only seconds old). The sweep runs BELOW the permission
        // check -- deleting files is not something a refused start should do -- so
        // this test has to grant RECORD_AUDIO to reach it at all.
        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        val dir = File(application.cacheDir, NativeAudioRecorder.RECORDINGS_DIR).apply { mkdirs() }
        val stale = File(dir, "stale.m4a").apply { writeBytes(ByteArray(4)) }
        val fresh = File(dir, "fresh.m4a").apply { writeBytes(ByteArray(4)) }
        stale.setLastModified(System.currentTimeMillis() - NativeAudioRecorder.RECORDING_TTL_MS - 5_000L)

        recorder.start()

        assertFalse(stale.exists(), "a stale served recording should be swept on start")
        assertTrue(fresh.exists(), "a just-served recording must survive (fetch may be in flight)")
    }

    @Test
    fun `a served memo JS has not released survives the sweep`() {
        // The loss journal-3 2a exists to prevent, from the other side. A served file
        // becomes sweep-eligible RECORDING_TTL_MS after stop(); a fetch that keeps
        // failing is retried for longer than that, and the user's natural response to
        // a stuck memo is to record again -- which is a start(), which swept it.
        //
        // The orphan planted alongside is the control: if the sweep stopped working
        // altogether the first assertion would pass for the wrong reason.
        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())
        val stopped = assertIs<NativeAudioRecorder.Result.Success<NativeAudioRecorder.RecordingResult>>(
            recorder.stop()
        )
        val served = requireNotNull(stopped.value.fileName) {
            "stop() must have taken the fetch-bridge path, or this test proves nothing"
        }
        val memo = File(servedDir(), served)
        assertTrue(memo.exists(), "the served memo must be on disk before the sweep runs")

        val orphan = File(servedDir(), servedName()).apply { writeBytes(ByteArray(4)) }
        val old = System.currentTimeMillis() - NativeAudioRecorder.RECORDING_TTL_MS - 5_000L
        memo.setLastModified(old)
        orphan.setLastModified(old)

        recorder.start()

        assertTrue(
            memo.exists(),
            "a memo JS was handed and has not released must survive start(), however old"
        )
        assertNotNull(
            recorder.readRecording(served),
            "and it must still be recoverable -- surviving on disk is only half of it"
        )
        assertFalse(
            orphan.exists(),
            "an orphan no one claimed must still be swept, or the sweep has simply stopped"
        )

        // The handshake is the only thing that ends the claim.
        assertTrue(recorder.deleteRecording(served), "deleteRecording must remove the claimed memo")
        assertFalse(memo.exists(), "and the file must actually be gone afterwards")

        // The claim is keyed by name, so releasing it has to be observable: a file that
        // later takes the released name is an ordinary orphan again. Without the remove
        // in deleteRecording the claim outlives the file it was made for and pins that
        // name for the life of the process, and nothing else in this suite would notice.
        val reused = File(servedDir(), served).apply { writeBytes(ByteArray(4)) }
        reused.setLastModified(old)

        recorder.start()

        assertFalse(reused.exists(), "a released name must go back to being sweepable")
    }

    @Test
    fun `a start refused for permission sweeps nothing`() {
        // RECORD_AUDIO revoked in @Before. The sweep destroys data, so it belongs
        // below the gate: a tap with the mic revoked is not a reason to prune.
        val orphan = File(servedDir(), servedName()).apply { writeBytes(ByteArray(4)) }
        orphan.setLastModified(System.currentTimeMillis() - NativeAudioRecorder.RECORDING_TTL_MS - 5_000L)

        assertIs<NativeAudioRecorder.Result.Failure>(recorder.start())

        assertTrue(orphan.exists(), "a start refused for permission must not delete anything")
    }

    // ─── journal-3 2a: readRecording / deleteRecording ────────────────
    //
    // Both verbs take a name that came from JS, so the tests that matter are the
    // ones a NAIVE implementation would pass. Every negative case below plants a
    // real, readable file at exactly the path `File(recordingsDir(), name)`
    // resolves to, so "returns null" can only come from the validation and never
    // from "there was nothing there anyway".

    /** The dir the recorder serves finished memos from. */
    private fun servedDir(): File =
        File(application.cacheDir, NativeAudioRecorder.RECORDINGS_DIR).apply { mkdirs() }

    /** A name matching the shape stop() actually writes. */
    private fun servedName(): String = UUID.randomUUID().toString() + ".m4a"

    /**
     * Plant `bytes` at exactly the path an UNVALIDATED `File(recordingsDir(), name)`
     * would open, and assert the poison is real: it exists, and (for a traversal
     * name) it genuinely lands outside recordings/. Computing the path this way
     * rather than hardcoding one keeps the test honest whatever cacheDir looks like
     * under Robolectric — on device the same string resolves to
     * /data/data/com.votreader.sacredui/databases/vot.db.
     */
    private fun plantAtNaivePath(name: String, bytes: ByteArray): File {
        val naive = File(servedDir(), name)
        naive.parentFile?.mkdirs()
        naive.writeBytes(bytes)
        assertTrue(naive.exists(), "the poison must exist or this test proves nothing")
        return naive
    }

    @Test
    fun `R8 - readRecording refuses a traversal name and touches nothing outside recordings`() {
        val poison = byteArrayOf(1, 2, 3, 4, 5)
        val db = plantAtNaivePath(TRAVERSAL, poison)
        assertFalse(
            db.canonicalFile.parentFile == servedDir().canonicalFile,
            "the traversal must actually escape recordings/, or this is not a traversal test"
        )

        assertNull(recorder.readRecording(TRAVERSAL), "a traversal name must be refused")

        assertTrue(db.exists(), "a refused read must not delete anything")
        assertContentEquals(poison, db.readBytes(), "a refused read must not alter anything")
    }

    @Test
    fun `deleteRecording refuses a traversal name and leaves the target in place`() {
        val poison = byteArrayOf(9, 9, 9)
        val db = plantAtNaivePath(TRAVERSAL, poison)

        assertFalse(recorder.deleteRecording(TRAVERSAL), "a traversal name must be refused")

        assertTrue(db.exists(), "the file outside recordings/ must survive")
        assertContentEquals(poison, db.readBytes())
    }

    @Test
    fun `readRecording refuses a name that is not the uuid shape the recorder writes`() {
        // This one is INSIDE recordings/, so the canonical-containment check passes
        // it. Only the name-shape check can refuse it — which is what makes this the
        // test that bites that layer on its own.
        val intruder = File(servedDir(), "evil.txt").apply { writeBytes(byteArrayOf(7)) }
        assertEquals(
            servedDir().canonicalFile, intruder.canonicalFile.parentFile,
            "the fixture must sit inside recordings/, or it proves the wrong layer"
        )

        assertNull(recorder.readRecording("evil.txt"))

        assertTrue(intruder.exists())
    }

    @Test
    fun `readRecording refuses a symlink in recordings that points outside it`() {
        // The case that makes the canonical-parent check load-bearing rather than
        // defence in depth (Security, 2026-09-04): the NAME is perfectly legal, so
        // the name-shape lock passes it. Only resolving the link refuses it.
        //
        // assumeTrue, not a hard requirement: creating a symlink on Windows needs
        // Developer Mode or elevation, so a dev box without it SKIPS this rather than
        // reporting a failure that says nothing about the code.
        val secret = File(application.cacheDir.parentFile, "outside.txt").apply {
            writeBytes(byteArrayOf(4, 2))
        }
        val link = File(servedDir(), servedName())
        try {
            Files.createSymbolicLink(link.toPath(), secret.toPath())
        } catch (e: Exception) {
            assumeTrue("symlink creation unavailable on this host: " + e, false)
        }
        assumeTrue(link.exists())

        assertNull(recorder.readRecording(link.name), "a symlink out of recordings/ must be refused")

        assertTrue(secret.exists(), "the link target must be untouched")
        assertContentEquals(byteArrayOf(4, 2), secret.readBytes())
    }

    @Test
    fun `readRecording returns the bytes of a served recording`() {
        val bytes = ByteArray(64) { it.toByte() }
        val name = servedName()
        File(servedDir(), name).writeBytes(bytes)

        val b64 = recorder.readRecording(name)

        assertNotNull(b64, "a well-named served recording must be readable")
        // Decode rather than re-encoding and comparing strings: an equality check
        // against Base64.encodeToString would only restate the implementation.
        assertContentEquals(bytes, Base64.decode(b64, Base64.NO_WRAP))
    }

    @Test
    fun `readRecording returns null for a well-named file that is not there`() {
        assertNull(recorder.readRecording(servedName()))
    }

    @Test
    fun `deleteRecording removes a served recording and reports whether it did`() {
        val name = servedName()
        val f = File(servedDir(), name).apply { writeBytes(byteArrayOf(1)) }

        assertTrue(recorder.deleteRecording(name), "deleting a real served file returns true")
        assertFalse(f.exists())
        assertFalse(recorder.deleteRecording(name), "deleting it twice reports false the second time")
    }

    @Test
    fun `readRecording refuses a file bigger than this recorder could have produced`() {
        // Sparse via setLength — a real 5.9 MB write would be the slowest test in the
        // suite for no extra proof.
        val name = servedName()
        val big = File(servedDir(), name)
        RandomAccessFile(big, "rw").use { it.setLength(NativeAudioRecorder.MAX_RECORDING_BYTES + 1) }
        assertTrue(big.length() > NativeAudioRecorder.MAX_RECORDING_BYTES)

        assertNull(recorder.readRecording(name), "an over-ceiling file must not be base64'd onto the bridge")

        assertTrue(big.exists(), "refusing to read it is not a licence to delete it")
    }

    private companion object {
        /** On device this resolves to /data/data/<pkg>/databases/vot.db — the real
         *  database, one directory move above the served cache dir. */
        const val TRAVERSAL = "../../databases/vot.db"
    }
}
