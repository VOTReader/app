package com.votreader.sacredui

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.util.Log
import timber.log.Timber
import java.io.File

/**
 * ds5 s41.1: a record of the last fatal crash, for the Export's diagnostic tail.
 *
 * [BoundedLogTree] lives in memory and dies with the process, so a crash was the one
 * thing the export could never show. [install] chains a default uncaught-exception
 * handler that writes ONE small sanitized record (time, exception class, message,
 * the first frames; paths and URIs redacted by [BoundedLogTree.sanitize]) to
 * filesDir, then hands the crash on to the previous handler unchanged. [entriesJson]
 * reads it back, with the system's last exit reasons on API 30+ (ApplicationExitInfo:
 * crashes, native crashes, ANRs, low-memory kills), in the same entry shape as
 * [BoundedLogTree.toJson]. Nothing leaves the device unless the reader exports.
 */
object CrashRecord {
    private const val FILE = "last-crash.json"
    private const val FRAMES = 6
    private const val EXIT_REASONS = 3

    /** The application context, set by [install]; null until then (debug builds, unit tests). */
    @Volatile private var appContext: Context? = null

    /** Chain the handler (once per process). */
    fun install(context: Context) {
        appContext = context.applicationContext
        val file = File(context.filesDir, FILE)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        if (previous is Handler) return
        Thread.setDefaultUncaughtExceptionHandler(Handler(file, previous))
    }

    private class Handler(
        private val file: File,
        private val previous: Thread.UncaughtExceptionHandler?,
    ) : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(t: Thread, e: Throwable) {
            try { file.writeText("[" + entryJson(System.currentTimeMillis(), e) + "]") } catch (_: Throwable) { /* never mask the crash */ }
            previous?.uncaughtException(t, e)
        }
    }

    /** One crash as a diagnostic entry: `{"t","lvl":"E","tag":"crash","msg"}`, sanitized. */
    internal fun entryJson(at: Long, e: Throwable): String {
        val frames = e.stackTrace.take(FRAMES).joinToString(" | ") { "${it.className}.${it.methodName}:${it.lineNumber}" }
        val cause = e.cause?.let { " caused by ${it.javaClass.name}: ${it.message ?: ""}" } ?: ""
        val msg = BoundedLogTree.sanitize("${e.javaClass.name}: ${e.message ?: ""}$cause at $frames")
        return entry(at, "crash", msg)
    }

    private fun entry(at: Long, tag: String, msg: String): String =
        "{\"t\":$at,\"lvl\":\"${BoundedLogTree.levelChar(Log.ERROR)}\",\"tag\":${BoundedLogTree.jsonString(tag)},\"msg\":${BoundedLogTree.jsonString(msg)}}"

    /** Join JSON arrays of entries into one ("[]" when all are empty). */
    internal fun merge(vararg arrays: String): String {
        val parts = arrays.map { it.trim() }
            .filter { it.length > 2 && it.startsWith("[") && it.endsWith("]") }
            .map { it.substring(1, it.length - 1) }
        return "[" + parts.joinToString(",") + "]"
    }

    /** The saved crash record and the recent exit reasons, as a JSON array ("[]" before [install]). */
    fun entriesJson(): String = appContext?.let { entriesJson(it) } ?: "[]"

    internal fun entriesJson(context: Context): String {
        val saved = try { File(context.filesDir, FILE).takeIf { it.isFile }?.readText() ?: "[]" } catch (_: Throwable) { "[]" }
        return merge(saved, exitReasonsJson(context))
    }

    private fun exitReasonsJson(context: Context): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return "[]"
        return try {
            val am = context.getSystemService(ActivityManager::class.java) ?: return "[]"
            val rows = am.getHistoricalProcessExitReasons(context.packageName, 0, EXIT_REASONS)
                .filter { it.reason in NOTABLE }
                .map { entry(it.timestamp, "exit", BoundedLogTree.sanitize("process ended: ${reasonName(it.reason)}" + (it.description?.let { d -> " ($d)" } ?: ""))) }
            "[" + rows.joinToString(",") + "]"
        } catch (e: Throwable) {
            Timber.w(e, "exit reasons unavailable")
            "[]"
        }
    }

    private val NOTABLE = setOf(
        ApplicationExitInfo.REASON_CRASH,
        ApplicationExitInfo.REASON_CRASH_NATIVE,
        ApplicationExitInfo.REASON_ANR,
        ApplicationExitInfo.REASON_LOW_MEMORY,
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE,
    )

    private fun reasonName(r: Int): String = when (r) {
        ApplicationExitInfo.REASON_CRASH -> "crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native crash"
        ApplicationExitInfo.REASON_ANR -> "not responding"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low memory"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "failed to start"
        else -> "reason $r"
    }
}
