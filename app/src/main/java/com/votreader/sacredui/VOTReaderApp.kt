package com.votreader.sacredui

import android.app.Application
import android.os.Build
import android.webkit.WebView
import java.io.File
import timber.log.Timber

/**
 * Application subclass — plants a Timber tree on cold start.
 *
 * Debug builds get DebugTree, which auto-tags logs with the calling
 * class name and forwards every level to Logcat for chrome://inspect
 * debugging.
 *
 * Release builds get [BoundedLogTree] (NK5b) — an in-memory ring buffer
 * of the last 200 WARN+ entries, sanitized to redact content:// URIs
 * and absolute paths. The Export JSON pulls this via the
 * AndroidBridge.getCrashLog() @JavascriptInterface so a user-shared
 * diagnostic includes the recent failure trail without ever writing
 * anything to disk or sending bytes off-device.
 *
 * The release tree is held in [releaseTree] (singleton, nullable) so
 * MainActivity can read it back without re-discovering the planted
 * instance.
 */
class VOTReaderApp : Application() {

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            val tree = BoundedLogTree()
            releaseTree = tree
            Timber.plant(tree)
        }

        // #2: WebView forbids two processes sharing one data directory. This app is
        // single-process today, but if any future component/library ever spawns a
        // second process that initializes a WebView, it would crash outright with
        // "WebView data directory already in use". Give a genuine private sub-
        // process its own data-dir suffix up front — a cheap, ship-ready safeguard.
        // MUST run before any WebView is created in the process (Application.onCreate
        // is the earliest app hook; the WebView lives in the Activity).
        //
        // Gated on the EXACT "<pkg>:" sub-process prefix, NOT merely
        // "!= packageName", so a null / garbage / main process name can NEVER match:
        // setting a suffix on the MAIN process would orphan its WebView data dir —
        // i.e. all localStorage / DOM-storage USER DATA. Single-process → never fires.
        val procName = currentProcessName()
        if (procName != null && procName.startsWith("$packageName:")) {
            try {
                WebView.setDataDirectorySuffix(safeSuffix(procName))
            } catch (e: Exception) {
                Timber.w(e, "setDataDirectorySuffix failed for process %s", procName)
            }
        }
    }

    /** The current process's name, or null if it can't be determined (in which
     *  case we do nothing — see the onCreate guard). */
    private fun currentProcessName(): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return try { Application.getProcessName() } catch (_: Exception) { null }
        }
        // API 26-27: /proc/self/cmdline holds the process name as its first
        // NUL-terminated token. (ActivityManager.getRunningAppProcesses can
        // return null early in startup, so the /proc read is more reliable here.)
        return try {
            File("/proc/self/cmdline").readText().substringBefore(Char(0)).trim().ifBlank { null }
        } catch (_: Exception) { null }
    }

    companion object {
        /**
         * The currently-planted release tree, or null on debug builds.
         * MainActivity's getCrashLog @JavascriptInterface reads from
         * here.
         */
        @Volatile var releaseTree: BoundedLogTree? = null
            internal set

        /**
         * Reduce a private sub-process name ("<pkg>:<tag>") to a data-dir suffix
         * valid for WebView.setDataDirectorySuffix — the tag after the last ':',
         * stripped to letters/digits/underscore (the setter rejects path
         * separators + other punctuation). Falls back to "sub" if nothing usable
         * remains. Internal so the same-module test set can exercise it directly.
         */
        internal fun safeSuffix(processName: String): String {
            val tag = processName.substringAfterLast(':', "")
            val safe = tag.filter { it.isLetterOrDigit() || it == '_' }
            return safe.ifBlank { "sub" }
        }
    }
}
