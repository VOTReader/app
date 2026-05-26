package com.votreader.sacredui

/**
 * Typed registry of every "native -> JS" callback fired through
 * [JsBridge.callOptional]. Each entry names the window.__onX function
 * the JS side defines; the sealed hierarchy gives a compiler-checked,
 * grep-friendly single source of truth for the bridge's upward API
 * surface.
 *
 * JS-side receivers:
 *   ImportFile            -> SettingsScreen.__onImportFile(b64OrNull)
 *   MicPermissionResult   -> JournalRecordingSheet.__onMicPermissionResult(granted)
 *   NativeRecordingComplete -> JournalRecordingSheet.__onNativeRecordingComplete(b64, durMs, mime)
 */
sealed class JsEvent(val fn: String) {
    data object ImportFile : JsEvent("__onImportFile")
    data object MicPermissionResult : JsEvent("__onMicPermissionResult")
    data object NativeRecordingComplete : JsEvent("__onNativeRecordingComplete")
}
