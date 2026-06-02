# ── JS bridge keep rules ────────────────────────────────────────────────
# AppInterface is bound as window.AndroidBridge via addJavascriptInterface;
# its @JavascriptInterface methods are invoked reflectively from the WebView,
# so R8 must never rename or strip them -- otherwise the entire native bridge
# (import, export, recording, screenshot, haptic) silently breaks in a
# minified release build.
#
# AppInterface is a TOP-LEVEL class as of the N1 native extraction. The old
# `MainActivity$AppInterface` inner-class rule matched nothing, so once
# minification is enabled the bridge methods would have been stripped. Keep
# the class + its annotated methods, plus a wildcard backstop so any future
# @JavascriptInterface class is covered automatically.
-keep class com.votreader.sacredui.AppInterface {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
