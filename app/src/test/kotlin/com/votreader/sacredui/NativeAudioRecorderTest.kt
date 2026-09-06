package com.votreader.sacredui

import android.Manifest
import android.app.Application
import android.os.Build
import android.os.SystemClock
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
import org.robolectric.shadows.ShadowSystemClock
import java.io.File
import java.io.RandomAccessFile
import java.time.Duration
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

    // ─── journal-3 2b: the zero-byte served memo ───────────────────────────
    // Written first as a parked RED (park-zerobyte-red fbf5e325) so the surface was
    // agreed before either half existed; it goes green with the guard in
    // encodeFileToBase64 that lands beside it.
    //
    // A served file that exists and holds nothing used to read back as "":
    // resolveServedRecording passes, isFile is true, 0 is under the ceiling, and
    // Base64.encodeToString(ByteArray(0), NO_WRAP) is the empty string. JS then does
    // atob("") -> a zero-size Blob -> the caller's !recovered guard, whose message is
    // "Could not read the recording from the device." That sentence is honest about a
    // file it could not use and wrong about WHY: the file was read perfectly and there
    // was nothing in it.
    //
    // Same family as atob(null) giving three bytes [158,233,101] that commit as a memo
    // playing silence -- measured, and guarded in JournalRecordingSheet. A value that
    // decodes into something plausible is worse than a refusal.
    @Test
    fun `a served recording with no bytes reads as null, not an empty string`() {
        val empty = File(servedDir(), servedName()).apply { writeBytes(ByteArray(0)) }
        assertTrue(empty.exists() && empty.length() == 0L, "the fixture must be a real zero-byte file")

        assertNull(
            recorder.readRecording(empty.name),
            "an existing but empty served file must read as null -- \"\" decodes to a " +
                "zero-size blob the caller cannot tell from a read it could not do"
        )
    }

    @Test
    fun `the zero-byte case is not vacuous - the same name with bytes reads back`() {
        // The control. Without it, `returns null` above would pass just as happily
        // against a name resolveServedRecording refused outright, which is a different
        // verdict about a different file.
        val name = servedName()
        File(servedDir(), name).writeBytes(byteArrayOf(1, 2, 3))

        assertNotNull(
            recorder.readRecording(name),
            "a served file WITH bytes must still read back, or the null above proves nothing"
        )
    }

    @Test
    fun `an orphan from a killed session survives the reader recording again`() {
        // THE BEHAVIOUR THE TTL CHANGE IS FOR, and it fails on the old 60 s constant.
        // The sweep runs inside start(), so at 60 s the recovery window was not a
        // duration -- it was "until the reader records again". The reader most likely
        // to hold an orphan is the one whose session was killed, and their first move
        // on relaunch is often to record the thing again, so the sweep took the memo at
        // exactly the moment nativeListRecordings would have offered it.
        //
        // One hour old: far past the old ceiling, far inside the new one. No claim on
        // it, because a claim dies with the process that made it -- which is precisely
        // what makes this file an orphan rather than a live memo.
        val orphan = File(servedDir(), servedName()).apply { writeBytes(byteArrayOf(7, 7, 7)) }
        orphan.setLastModified(System.currentTimeMillis() - 60L * 60L * 1000L)
        assertTrue(
            orphan.lastModified() < System.currentTimeMillis() - 60_000L,
            "the fixture must be older than the 60 s this test exists to replace"
        )

        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())

        assertTrue(
            orphan.exists(),
            "an hour-old orphan must survive a fresh recording -- at 60 s the sweep ate " +
                "the memo the recovery listing exists to offer"
        )
        assertTrue(
            listedNames(recorder.listRecordings()).contains(orphan.name),
            "and it must still be enumerable, which is the whole point of surviving"
        )
    }

    @Test
    fun `an orphan past the new TTL is still swept`() {
        // The other side, so the change is a longer window and not a disabled sweep.
        // Without this, "the file survives" is equally satisfied by deleting the sweep.
        val ancient = File(servedDir(), servedName()).apply { writeBytes(byteArrayOf(1)) }
        ancient.setLastModified(
            System.currentTimeMillis() - NativeAudioRecorder.RECORDING_TTL_MS - 5_000L
        )

        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())

        assertFalse(
            ancient.exists(),
            "past RECORDING_TTL_MS the sweep must still take it, or the TTL is not a TTL"
        )
    }

    // ─── journal-3 2b: nativeListRecordings ────────────────────────────────
    // The recovery half. readRecording answers "give me this memo", which needs a name
    // JS already has; the lister answers "what is still here", which is the only
    // question a session that was KILLED can ask -- its in-flight name died with the
    // page. The return table these pin lives beside the row in BridgeContractTest.
    //
    // Asserted against the EXACT STRING rather than a parsed structure wherever there
    // is one row: the agreement between the two halves is the byte shape, so key order
    // and an unexpected extra field must redden here rather than pass a lenient parse.
    // Multi-row cases read names back with `listedNames` because listFiles() order is
    // not specified and the contract does not promise one.

    @Test
    fun `a recordings directory that was read and is empty lists as an empty array`() {
        assertTrue(servedDir().isDirectory, "the directory must exist, or this is the failure case")

        assertEquals(
            "[]", recorder.listRecordings(),
            "an empty directory answers \"[]\" -- nothing to recover, as distinct from could not tell"
        )
    }

    @Test
    fun `a served memo is listed with its name, size and mtime`() {
        val name = servedName()
        val f = File(servedDir(), name).apply { writeBytes(ByteArray(1234)) }

        assertEquals(
            "[{\"name\":\"$name\",\"size\":1234,\"mtime\":${f.lastModified()}}]",
            recorder.listRecordings(),
            "the row shape is the agreement between the Kotlin verb and the JS caller"
        )
    }

    @Test
    fun `a zero-byte memo is LISTED with size 0 even though the reader refuses it`() {
        // The one deliberate asymmetry in the 2b table, and the reason the zero-byte
        // guard above does not simply hide the file: LISTED so JS can say "that memo is
        // empty", REFUSED by the reader so nothing empty is ever committed as a memo.
        // Omitting it instead would leave JS reconciling forever against a name that is
        // on disk, is not in its store, and never returns bytes.
        val name = servedName()
        File(servedDir(), name).writeBytes(ByteArray(0))

        assertTrue(
            recorder.listRecordings().contains("\"name\":\"$name\",\"size\":0,"),
            "an empty served memo must be listed with size 0, not omitted"
        )
        assertNull(
            recorder.readRecording(name),
            "and the reader must still refuse it, or the asymmetry this test is about does not exist"
        )
    }

    @Test
    fun `the listing offers no name the reader would refuse`() {
        // THE POISON IS THE POINT. A lister that simply returned listFiles() would pass
        // every other test in this block and hand JS two names the reader refuses --
        // which is a reconciliation loop that never terminates, because the name is on
        // disk, absent from the JS store, and unreadable forever.
        val legal = servedName()
        File(servedDir(), legal).writeBytes(byteArrayOf(1))
        plantAtNaivePath("evil.txt", byteArrayOf(2))
        plantAtNaivePath("NOT-A-UUID-SHAPED-NAME-AT-ALL-XXXXXX.m4a", byteArrayOf(3))

        // The control: the poison must really be in the directory, or "one row" is a
        // statement about an empty directory rather than about the filter.
        assertEquals(
            3, servedDir().listFiles()?.size,
            "all three files must be on disk, or the filter is not being tested"
        )

        val names = listedNames(recorder.listRecordings())
        assertEquals(listOf(legal), names, "only a name the reader accepts may be listed")
        for (n in names) {
            assertNotNull(
                recorder.readRecording(n),
                "the lister offered $n and the reader refuses it -- the two verbs must agree"
            )
        }
    }

    @Test
    fun `a file over the size ceiling is omitted from the listing, because the reader refuses it`() {
        // The contract's line is `unreadable (refused name, I/O, over the size ceiling)
        // -> name absent`, and the first draft of listRecordings listed such a file
        // anyway: a row the reader refuses, which is a JS reconciliation loop that
        // never terminates. Sparse via setLength -- a real 5.9 MB write would be the
        // slowest test in the class.
        val big = File(servedDir(), servedName())
        RandomAccessFile(big, "rw").use { it.setLength(NativeAudioRecorder.MAX_RECORDING_BYTES + 1) }
        assertTrue(
            big.length() > NativeAudioRecorder.MAX_RECORDING_BYTES,
            "the fixture must really be over the ceiling, or this proves nothing"
        )
        val ok = servedName()
        File(servedDir(), ok).writeBytes(byteArrayOf(1, 2, 3))

        // The control is the SECOND file: without it, "the big one is absent" is
        // equally satisfied by a lister that returned "[]" for an unrelated reason.
        assertEquals(
            listOf(ok), listedNames(recorder.listRecordings()),
            "an over-ceiling file must be omitted while a normal one is still listed"
        )
        assertNull(
            recorder.readRecording(big.name),
            "and the reader must refuse it -- that refusal is WHY it is omitted"
        )
    }

    @Test
    fun `a listing that could not look says so, and cannot answer that the directory was empty`() {
        // Poison: make recordings/ a FILE. mkdirs() then fails without throwing and
        // listFiles() returns null -- the exact path that must NOT collapse into "[]".
        // The tempting `?: emptyList()` would report "nothing to recover" about a
        // directory nobody managed to read, which is a null impersonating a value.
        val dir = servedDir()
        dir.deleteRecursively()
        dir.writeBytes(byteArrayOf(0))
        assertTrue(
            dir.isFile,
            "the poison must leave recordings/ a non-directory, or listFiles() never returns null"
        )

        // The LITERAL, deliberately, not NativeAudioRecorder.LIST_FAILED: this string
        // crosses the bridge and the JS side matches on it, so renaming the constant
        // must redden here rather than follow along quietly.
        assertEquals(
            "error:list_failed", recorder.listRecordings(),
            "a listing that could not look must not be able to say the directory was empty"
        )
    }

    /** Names out of a listing, in the order the lister emitted them. listFiles() order
     *  is unspecified and the contract does not promise one, so multi-row assertions
     *  compare membership rather than a byte-exact string. */
    private fun listedNames(json: String): List<String> =
        Regex("\"name\":\"([^\"]+)\"").findAll(json).map { it.groupValues[1] }.toList()

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
        // This test builds its fixture inline rather than through serveOneMemo(), so it
        // needs the same correction: Robolectric's ShadowMediaRecorder captures no
        // audio, the served file is ZERO BYTES, and readRecording used to answer "" for
        // it -- which is what the assertNotNull below has been passing on since it was
        // written. Plant what a real recorder would have left.
        memo.writeBytes(byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7))

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

    /**
     * Serve a memo through the real stop() path and hand back its name. The claim
     * these tests are about only exists because stop() made it.
     */
    private fun serveOneMemo(): String {
        shadowOf(application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        assertIs<NativeAudioRecorder.Result.Success<Unit>>(recorder.start())
        val stopped = assertIs<NativeAudioRecorder.Result.Success<NativeAudioRecorder.RecordingResult>>(
            recorder.stop()
        )
        val name = requireNotNull(stopped.value.fileName) {
            "stop() must have taken the fetch-bridge path, or this test proves nothing"
        }
        // ROBOLECTRIC'S ShadowMediaRecorder CAPTURES NO AUDIO, so the file stop() moved
        // into recordings/ is ZERO BYTES -- and that was invisible until the journal-3
        // 2b zero-byte guard landed. readRecording used to answer "" for an empty file,
        // so both `assertNotNull(recorder.readRecording(served))` assertions below
        // passed on an empty string: the "and it must still be recoverable" half of the
        // two sweep tests was decorative, and the guard is what made it say so.
        //
        // Plant the bytes a real recorder would have written and assert they are there.
        // Callers age the file AFTER this, so the write does not disturb their mtime.
        val f = File(servedDir(), name)
        f.writeBytes(byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7))
        assertTrue(
            f.length() > 0,
            "the served fixture must hold bytes, or every readRecording assertion on it is vacuous"
        )
        return name
    }

    /**
     * Move the monotonic clock the claim ages against, and PROVE it moved. Measured
     * rather than assumed, because the first version of these tests advanced the
     * shadow clock and asserted on System.currentTimeMillis(), which Robolectric
     * does NOT drive here -- it moved 0 ms of a requested 25 h. Without this
     * assertion the 23 h test would have passed against a claim zero milliseconds
     * old, which is the wrong reason for the right answer.
     */
    private fun advanceHours(h: Long) {
        val before = SystemClock.elapsedRealtime()
        ShadowSystemClock.advanceBy(Duration.ofHours(h))
        val moved = SystemClock.elapsedRealtime() - before
        assertTrue(
            moved >= Duration.ofHours(h).toMillis(),
            "the shadow clock must move SystemClock.elapsedRealtime() (moved ${moved}ms of ${h}h), " +
                "or every claim-expiry assertion below is vacuous"
        )
    }

    /** Make the file itself sweep-eligible. Separate knob from the claim's age on
     *  purpose: the sweep reads a filesystem mtime against the WALL clock, and the
     *  claim ages against the MONOTONIC one, so these tests move one at a time. */
    private fun ageFilePastTtl(f: File) {
        f.setLastModified(System.currentTimeMillis() - NativeAudioRecorder.RECORDING_TTL_MS - 5_000L)
    }

    @Test
    fun `a claim JS never released stops protecting its memo after a day`() {
        // The claim is unbounded in one direction by design -- nothing but
        // deleteRecording ends it -- so a session that runs for days could pin every
        // memo it ever served. Twenty five-minute memos is ~72 MB of cacheDir held
        // against a fetch that stopped being plausible many hours ago.
        val served = serveOneMemo()
        val memo = File(servedDir(), served)
        assertTrue(memo.exists(), "the served memo must be on disk before the sweep runs")
        ageFilePastTtl(memo)

        advanceHours(25)
        recorder.start()

        assertFalse(
            memo.exists(),
            "a claim older than CLAIM_TTL_MS must stop protecting its file"
        )
    }

    @Test
    fun `a claim under a day still protects its memo`() {
        // The control, and the half that must not regress: the bound exists to stop
        // an abandoned claim pinning cacheDir forever, NOT to put a deadline on a
        // recovery. Anything a fetch or a retry could still plausibly want is well
        // inside this window -- the happy path fetches within a second.
        val served = serveOneMemo()
        val memo = File(servedDir(), served)
        ageFilePastTtl(memo)

        advanceHours(23)
        recorder.start()

        assertTrue(
            memo.exists(),
            "a claim inside CLAIM_TTL_MS must still spare its file, however stale the file looks"
        )
        assertNotNull(
            recorder.readRecording(served),
            "and it must still be readable -- surviving on disk is only half of it"
        )
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
