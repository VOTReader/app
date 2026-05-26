package com.votreader.sacredui

import android.webkit.WebView

/**
 * Single conduit for evaluating JavaScript inside the WebView. Wraps the
 * raw evaluateJavascript API so callers never construct JS source code by
 * Kotlin string concatenation -- every argument flows through escapeArg,
 * which escapes quotes / backslashes / newlines / line-separator chars so
 * a value with embedded special characters can't break the generated JS.
 *
 * The constructor takes a webViewProvider (rather than the WebView
 * directly) so the bridge always reads the *current* WebView from the
 * caller. This matters for MainActivity.onRenderProcessGone, which
 * replaces the WebView instance after a renderer crash -- bridge calls
 * after recovery route to the fresh WebView without re-instantiating
 * this object.
 *
 * Threading: callOptional and setCssProperties internally route through
 * webView.post, so they are safe to call from any thread (including the
 * @JavascriptInterface binder thread). callWithResult forwards directly
 * to evaluateJavascript and must be called on the WebView's thread (the
 * back-press dispatcher already runs there).
 */
class JsBridge(private val webViewProvider: () -> WebView) {

    private val webView: WebView get() = webViewProvider()

    /**
     * Invoke window.[fn]([args]...) iff window.[fn] is defined. Each arg
     * flows through escapeArg -- strings become safe JS string literals,
     * booleans / numbers their literal form, null becomes the literal
     * `null`. Posts to the WebView thread.
     *
     * [fn] is restricted to a bare JS identifier (matches [FN_NAME], i.e.
     * `\w+`). Without that check, a future caller passing something like
     * `__onFoo(); doEvilThing(` would yield a generated JS source where
     * the prefix executes before the trailing args even render -- a
     * structural injection. Every existing caller in MainActivity uses
     * a hardcoded `__onCamelCase` string, so the require() is invariant
     * in production and only fires on programmer error.
     */
    fun callOptional(fn: String, vararg args: Any?) {
        require(fn.matches(FN_NAME)) { "JsBridge: fn must be a JS identifier, got '$fn'" }
        val rendered = args.joinToString(", ") { escapeArg(it) }
        val js = "window.$fn && window.$fn($rendered)"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    /**
     * Evaluate an arbitrary JS expression and forward the (JSON-encoded)
     * result to [callback]. Use for the rare synchronous-return path
     * (e.g. handleAndroidBack returning "true"/"false"). [js] is taken as
     * a trusted expression -- callers must not interpolate untrusted
     * values into it.
     */
    fun callWithResult(js: String, callback: (String) -> Unit) {
        webView.evaluateJavascript(js, callback)
    }

    /**
     * Set CSS custom properties on documentElement. Property names and
     * values are escaped via quote, so an arbitrary value can't break
     * the generated source. Guarded against null documentElement -- the
     * listener may fire during initial layout before parsing, where
     * documentElement is briefly null.
     */
    fun setCssProperties(vararg pairs: Pair<String, String>) {
        if (pairs.isEmpty()) return
        val setters = pairs.joinToString("") { (name, value) ->
            "r.setProperty(${quote(name)},${quote(value)});"
        }
        val js = "(function(){" +
            "var r=document.documentElement&&document.documentElement.style;" +
            "if(!r)return;" +
            setters +
            "})();"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    // `internal` (not `private`) so the same-module test source set can
    // exercise these directly -- they are pure functions of their input,
    // so unit-testing them without spinning up a Robolectric WebView is
    // the right call. The visibility change is test-only; production
    // callers (callOptional, setCssProperties) sit inside this class
    // and are unaffected.
    internal fun escapeArg(arg: Any?): String = when (arg) {
        null -> "null"
        is Boolean -> arg.toString()
        is Number -> arg.toString()
        is String -> quote(arg)
        else -> throw IllegalArgumentException(
            "JsBridge: unsupported arg type ${arg::class.simpleName}"
        )
    }

    // JS string literal with \, ', \n, \r, U+0000, and U+2028 / U+2029
    // escaped.
    //
    // U+2028 / U+2029 (LINE / PARAGRAPH SEPARATOR) are valid characters
    // in JSON strings but illegal as bare characters in JavaScript source
    // -- not escaping them would turn an apparently-safe payload into a
    // syntax error inside evaluateJavascript.
    //
    // U+0000 (NUL) is similarly legal in a JSON string but a parser-
    // hostile char in a JS source string literal -- embedded NUL has
    // historically tripped V8 and other engines (truncating the string,
    // raising "Invalid character"). Escaping it preserves the bytes
    // through the bridge and back to JS-side memory.
    internal fun quote(s: String): String {
        val sb = StringBuilder(s.length + 2)
        sb.append('\'')
        for (c in s) {
            when (c) {
                '\\' -> sb.append("\\\\")
                '\'' -> sb.append("\\'")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\u0000' -> sb.append("\\u0000")
                ' ' -> sb.append("\\u2028")
                ' ' -> sb.append("\\u2029")
                else -> sb.append(c)
            }
        }
        sb.append('\'')
        return sb.toString()
    }

    companion object {
        // JS identifier regex used by callOptional's require(). Restrictive
        // by choice -- the bridge's actual callees are all `__onCamelCase`
        // style; widening to e.g. `[$\w]+` would broaden the surface
        // without any concrete need. If a future feature needs dotted
        // names (e.g. `console.log`), route through callWithResult (which
        // takes a trusted JS expression) instead of relaxing this.
        private val FN_NAME = Regex("^\\w+$")
    }
}
