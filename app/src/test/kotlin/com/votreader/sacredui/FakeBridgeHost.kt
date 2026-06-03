package com.votreader.sacredui

import android.content.Context
import android.media.AudioManager
import android.view.Window
import android.webkit.WebView
import io.mockk.mockk

/**
 * Test double for [BridgeHost]. Plain class with public mutable fields
 * so each test can dial in the exact configuration it needs before
 * exercising [AppInterface].
 *
 * Default behaviour:
 *   - All framework refs (Context, Window, WebView) are relaxed mocks
 *     so accessing them in production code under test never NPEs.
 *   - audioSystemService starts null (matches the pre-onCreate window).
 *   - hasAudioPermission returns false (denied by default; flip per test).
 *   - postToUi executes the lambda immediately on the calling thread.
 *     Tests that want to inspect the queue can flip [executePostedImmediately]
 *     to false and assert against [postedActions].
 *   - captureScreenshot returns a canned data URI; tests that exercise
 *     takeScreenshot just assert the AppInterface delegates the call.
 */
class FakeBridgeHost(
    override val activityContext: Context = mockk(relaxed = true),
    override val activityWindow: Window = mockk(relaxed = true),
    override val activeWebView: WebView = mockk(relaxed = true)
) : BridgeHost {

    override var audioSystemService: AudioManager? = null
    var hasAudioPermissionValue: Boolean = false
    var captureScreenshotResult: String = "data:image/jpeg;base64,fake"

    /** Set to false to capture posted actions without running them. */
    var executePostedImmediately: Boolean = true
    val postedActions: MutableList<() -> Unit> = mutableListOf()

    var filePickerLaunchCount: Int = 0
    var micPermissionLaunchCount: Int = 0

    /** Records (suggestedName, content) for every launchExportPicker call. */
    val exportPickerCalls: MutableList<Pair<String, String>> = mutableListOf()

    /** Records the suggestedName of every launchV3ExportPicker call. */
    val v3ExportPickerCalls: MutableList<String> = mutableListOf()

    /** Counts launchV3ImportPicker calls. */
    var v3ImportPickerLaunchCount: Int = 0

    /** Optional exception that launchFilePicker throws when invoked. */
    var filePickerThrowsOnLaunch: Exception? = null

    /** Optional exception that launchMicPermissionRequest throws when invoked. */
    var micPermissionThrowsOnLaunch: Exception? = null

    /** Records args passed to captureScreenshot, in call order. */
    val captureScreenshotCalls: MutableList<Triple<Int, Int, Int>> = mutableListOf()

    override fun postToUi(action: () -> Unit) {
        postedActions.add(action)
        if (executePostedImmediately) action()
    }

    override fun launchFilePicker() {
        filePickerLaunchCount++
        filePickerThrowsOnLaunch?.let { throw it }
    }

    override fun launchExportPicker(suggestedName: String, content: String) {
        exportPickerCalls.add(suggestedName to content)
    }

    override fun launchV3ExportPicker(suggestedName: String) {
        v3ExportPickerCalls.add(suggestedName)
    }

    override fun launchV3ImportPicker() {
        v3ImportPickerLaunchCount++
    }

    override fun launchMicPermissionRequest() {
        micPermissionLaunchCount++
        micPermissionThrowsOnLaunch?.let { throw it }
    }

    override fun hasAudioPermission(): Boolean = hasAudioPermissionValue

    override fun captureScreenshot(topCropDp: Int, maxDim: Int, jpegQuality: Int): String {
        captureScreenshotCalls.add(Triple(topCropDp, maxDim, jpegQuality))
        return captureScreenshotResult
    }
}
