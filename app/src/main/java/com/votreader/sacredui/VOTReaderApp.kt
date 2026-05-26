package com.votreader.sacredui

import android.app.Application
import timber.log.Timber

/**
 * Application subclass — exists solely to plant Timber's DebugTree on
 * cold start. Auto-tags logs with the calling class name; in release
 * builds nothing is planted, so logging compiles down to no-ops.
 */
class VOTReaderApp : Application() {

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
    }
}
