package com.votreader.sacredui

/**
 * Typed registry of every "native -> JS" callback fired through
 * [JsBridge.callOptional]. Each entry names the window.__onX function
 * the JS side defines; the sealed hierarchy gives a compiler-checked,
 * grep-friendly single source of truth for the bridge's upward API
 * surface.
 *
 * JS-side receivers:
 *   ImportFile            -> SettingsScreen.__onImportFile(b64OrNull, errCode?)
 *   ExportComplete        -> SettingsScreen.__onExportComplete("ok"|"error:<reason>"|"cancelled")
 *   V3ExportReady         -> SettingsScreen.__onV3ExportReady("ok"|"cancelled"|"error:<reason>")
 *   V3ImportReady         -> SettingsScreen.__onV3ImportReady("ok"|"cancelled"|"error:<reason>")
 *   MicPermissionResult   -> JournalRecordingSheet.__onMicPermissionResult(granted)
 *   NativeRecordingComplete -> JournalRecordingSheet.__onNativeRecordingComplete(b64, durMs, mime)
 *   AnnotationTap         -> SelectionToolbar.__nativeTapAnnotation(cssX, cssY)
 */
sealed class JsEvent(val fn: String) {
    data object ImportFile : JsEvent("__onImportFile")

    // Result of the SAF export-document picker (Settings → Your Data →
    // Export). "ok" when the JSON was written to the user-chosen URI,
    // "error:<reason>" on a write failure, "cancelled" when the user
    // dismissed the picker. Mirrors ImportFile's async-callback shape.
    data object ExportComplete : JsEvent("__onExportComplete")

    // v3 streaming backup (BACKUP-STREAMING-PLAN P3). The SAF picker is async,
    // so the destination/source URI arrives in an ActivityResult callback AFTER
    // v3ExportOpen()/v3ImportOpen() returns. These fire once the picker settles
    // and the chosen URI is stashed, so the JS driver knows it may proceed (or
    // that the user cancelled). "ok" = a URI was chosen; "cancelled" = the user
    // dismissed the picker; "error:<reason>" = the launch itself failed.
    data object V3ExportReady : JsEvent("__onV3ExportReady")
    data object V3ImportReady : JsEvent("__onV3ImportReady")

    data object MicPermissionResult : JsEvent("__onMicPermissionResult")
    data object NativeRecordingComplete : JsEvent("__onNativeRecordingComplete")

    // A confirmed single tap on the WebView. Android WebView swallows taps
    // on selectable <mark> text (the touch is reserved for native text
    // selection), so a tap on a highlight never reaches the JS click/touch
    // handlers -- only a long-press did. MainActivity's GestureDetector
    // observes the tap without consuming it and forwards the CSS-pixel
    // coordinates here; the JS side hit-tests the point and opens the
    // annotation action chip. Coordinates are %.f numbers, never strings.
    data object AnnotationTap : JsEvent("__nativeTapAnnotation")
}
