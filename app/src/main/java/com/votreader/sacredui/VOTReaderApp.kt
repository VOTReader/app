package com.votreader.sacredui

import android.app.Application
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
    }

    companion object {
        /**
         * The currently-planted release tree, or null on debug builds.
         * MainActivity's getCrashLog @JavascriptInterface reads from
         * here.
         */
        @Volatile var releaseTree: BoundedLogTree? = null
            internal set
    }
}
