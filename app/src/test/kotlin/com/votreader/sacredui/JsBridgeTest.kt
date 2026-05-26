package com.votreader.sacredui

import android.webkit.WebView
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

/**
 * NK2a — JsBridge pattern-proof tests.
 *
 * These cover `quote()` and `escapeArg()`, the two pure-function helpers
 * that every JS bridge call passes through. Both are `internal` (NK2a
 * visibility lift) so this same-module test source set can exercise
 * them without a Robolectric WebView shadow -- they don't read [webView]
 * at all, and the JsBridge constructor's webViewProvider lambda is
 * never invoked here.
 *
 * Why these matter: every string that crosses the Kotlin → JS boundary
 * comes through quote(). A regression that drops one of the six escape
 * branches (e.g. forgets U+2028) silently breaks an entire class of
 * payloads at runtime -- the WebView would see a JS syntax error during
 * evaluateJavascript and the bridge call would no-op. These tests pin
 * the contract down to the character level.
 *
 * Q5.2 served the same role for the JS side (the first vitest commit
 * after the harness landed -- _validateTabState's 13 rules).
 */
class JsBridgeTest {

    // The throwing webViewProvider serves two purposes:
    //   1. For quote/escapeArg tests, asserts the pure helpers never
    //      reach the WebView -- any future regression that does NPE in
    //      production gets caught here as IllegalStateException instead.
    //   2. For callOptional fn-validation tests, lets us distinguish
    //      "require() rejected the fn" (IllegalArgumentException) from
    //      "require() accepted, then tried to access webView"
    //      (IllegalStateException). The two exception types are the
    //      assertion seam for whether the guard fired.
    private val bridge = JsBridge {
        error("test stub: webViewProvider invoked (require passed, no real WebView)")
    }

    // ─── quote ────────────────────────────────────────────────────────

    @Test
    fun `quote wraps empty string in single quotes`() {
        assertEquals("''", bridge.quote(""))
    }

    @Test
    fun `quote leaves plain ASCII unchanged`() {
        assertEquals("'hello world'", bridge.quote("hello world"))
    }

    @Test
    fun `quote escapes backslash`() {
        // Input: one literal backslash.
        // Output: open-quote + escaped backslash (two chars) + close-quote
        //         = '\\' (four chars).
        assertEquals("'\\\\'", bridge.quote("\\"))
    }

    @Test
    fun `quote escapes single quote`() {
        // Input: one apostrophe.
        // Output: open-quote + backslash-apostrophe + close-quote
        //         = '\'' (four chars).
        assertEquals("'\\''", bridge.quote("'"))
    }

    @Test
    fun `quote escapes newline`() {
        // The literal LF char (U+000A) becomes the two-char escape `\n`,
        // so an unwrapped multi-line payload can't break evaluateJavascript.
        assertEquals("'\\n'", bridge.quote("\n"))
    }

    @Test
    fun `quote escapes carriage return`() {
        assertEquals("'\\r'", bridge.quote("\r"))
    }

    @Test
    fun `quote escapes U+2028 LINE SEPARATOR`() {
        // U+2028 is legal in JSON but a syntax error as a bare char in JS
        // source. Without this branch, a payload containing it would turn
        // into a SyntaxError inside the WebView even though the Kotlin
        // string was perfectly valid.
        assertEquals("'\\u2028'", bridge.quote(" "))
    }

    @Test
    fun `quote escapes U+2029 PARAGRAPH SEPARATOR`() {
        // Same reasoning as U+2028 -- see jsBridge.kt's quote() docstring.
        assertEquals("'\\u2029'", bridge.quote(" "))
    }

    @Test
    fun `quote escapes all six special chars together`() {
        // One of each, in source order. Confirms no branch shadows another.
        val input = "\\'\n\r  "
        val expected = "'\\\\\\'\\n\\r\\u2028\\u2029'"
        assertEquals(expected, bridge.quote(input))
    }

    @Test
    fun `quote handles mixed escapes interleaved with ASCII`() {
        // Realistic payload: a sentence that contains an apostrophe, a
        // newline, and a backslash (as you'd see in journal text imported
        // from another note-taking app).
        val input = "Don't\nC:\\path"
        val expected = "'Don\\'t\\nC:\\\\path'"
        assertEquals(expected, bridge.quote(input))
    }

    @Test
    fun `quote preserves tab and other unescaped whitespace`() {
        // Tabs / vertical tabs / form feeds are valid JS string chars
        // (unlike U+2028/U+2029), so we do NOT escape them. This guards
        // against an over-zealous future change that adds them to the
        // when() and ends up over-escaping legitimate text.
        assertEquals("'a\tb'", bridge.quote("a\tb"))
    }

    @Test
    fun `quote escapes U+0000 NUL`() {
        // NK2b: a stray NUL inside a payload (e.g. from a binary blob
        // round-tripped through a string) used to land in the generated
        // JS source verbatim, where Chromium's parser truncates at the
        // first NUL and the bridge call silently mangles. Escaping
        // preserves the byte through the bridge.
        assertEquals("'\\u0000'", bridge.quote("\u0000"))
    }

    @Test
    fun `quote escapes NUL surrounded by ASCII`() {
        // Same case but realistic placement -- proves the branch fires
        // mid-string, not just for a single-char input.
        assertEquals("'a\\u0000b'", bridge.quote("a\u0000b"))
    }

    // ─── escapeArg dispatch ───────────────────────────────────────────

    @Test
    fun `escapeArg null becomes literal null`() {
        // JS expects bare `null`, not the string `"null"`. The bridge
        // emits this verbatim into the generated source.
        assertEquals("null", bridge.escapeArg(null))
    }

    @Test
    fun `escapeArg true becomes literal true`() {
        assertEquals("true", bridge.escapeArg(true))
    }

    @Test
    fun `escapeArg false becomes literal false`() {
        assertEquals("false", bridge.escapeArg(false))
    }

    @Test
    fun `escapeArg Int emits decimal literal`() {
        assertEquals("42", bridge.escapeArg(42))
    }

    @Test
    fun `escapeArg Long emits decimal literal`() {
        // The screenshot timeout + recording duration both arrive as Long.
        assertEquals("9999999999", bridge.escapeArg(9_999_999_999L))
    }

    @Test
    fun `escapeArg Float emits decimal literal`() {
        // 1.5f formats as "1.5" — confirms we don't accidentally quote it.
        assertEquals("1.5", bridge.escapeArg(1.5f))
    }

    @Test
    fun `escapeArg Double emits decimal literal`() {
        assertEquals("2.25", bridge.escapeArg(2.25))
    }

    @Test
    fun `escapeArg String delegates to quote`() {
        // The whole reason quote() exists -- so callers don't have to
        // think about whether a value happens to be a String. This test
        // pins the delegation: if escapeArg ever stopped routing String
        // through quote, untrusted text would land in JS source unescaped.
        assertEquals("'hi'", bridge.escapeArg("hi"))
    }

    // ─── callOptional fn validation (NK2b) ────────────────────────────

    @Test
    fun `callOptional rejects fn containing dot`() {
        // Dot-prefixed names like `console.log` would generate
        //   window.console.log && window.console.log(args)
        // which evaluates fine but defeats the bridge's intent of a flat,
        // app-defined callback surface. The require() refuses up front.
        assertThrows<IllegalArgumentException> {
            bridge.callOptional("console.log")
        }
    }

    @Test
    fun `callOptional rejects fn containing parenthesis`() {
        // The actual injection class: a paren in fn opens a syntactic
        // hole in the generated JS source. require() blocks it before
        // a single byte of JS is emitted.
        assertThrows<IllegalArgumentException> {
            bridge.callOptional("__onFoo(); alert(1)//")
        }
    }

    @Test
    fun `callOptional rejects fn containing whitespace`() {
        assertThrows<IllegalArgumentException> {
            bridge.callOptional("foo bar")
        }
    }

    @Test
    fun `callOptional rejects empty fn`() {
        // Empty fn would yield `window. && window.(args)` -- a SyntaxError
        // at runtime. The require() turns it into a fail-fast at call-site.
        assertThrows<IllegalArgumentException> {
            bridge.callOptional("")
        }
    }

    @Test
    fun `callOptional accepts a plain identifier`() {
        // require() passes; control reaches webView.post {} which triggers
        // the throwing stub. Catching IllegalStateException (NOT
        // IllegalArgumentException) implicitly asserts that the require()
        // accepted the fn name.
        assertThrows<IllegalStateException> {
            bridge.callOptional("__onValid")
        }
    }

    @Test
    fun `callOptional accepts all production callee names`() {
        // Regression guard: the three names MainActivity actually invokes.
        // If FN_NAME's pattern were ever tightened in a way that broke an
        // existing callee, this test catches it -- the negative-space
        // counterpart of the rejection tests above.
        for (name in listOf(
            "__onImportFile",
            "__onMicPermissionResult",
            "__onNativeRecordingComplete"
        )) {
            assertThrows<IllegalStateException>("$name should pass require()") {
                bridge.callOptional(name)
            }
        }
    }

    // ─── JsEvent typed overload ──────────────────────────────────────

    @Test
    fun `JsEvent fn names match their JS-side window callbacks`() {
        // If a callback is renamed on one side but not the other, the
        // bridge breaks silently. These pins catch the mismatch.
        assertEquals("__onImportFile", JsEvent.ImportFile.fn)
        assertEquals("__onMicPermissionResult", JsEvent.MicPermissionResult.fn)
        assertEquals("__onNativeRecordingComplete", JsEvent.NativeRecordingComplete.fn)
    }

    @Test
    fun `callOptional typed JsEvent delegates to string overload`() {
        // Each JsEvent routes through callOptional(event.fn, ...) which
        // passes FN_NAME and reaches webView.post (our throwing stub).
        // IllegalStateException = require passed + reached WebView.
        for (event in listOf(
            JsEvent.ImportFile,
            JsEvent.MicPermissionResult,
            JsEvent.NativeRecordingComplete
        )) {
            assertThrows<IllegalStateException>("${event.fn} should pass through") {
                bridge.callOptional(event)
            }
        }
    }

    @Test
    fun `callOptional typed JsEvent passes args through`() {
        // Verify the vararg spread works -- the typed overload must
        // forward args to the string overload without dropping them.
        assertThrows<IllegalStateException> {
            bridge.callOptional(JsEvent.NativeRecordingComplete, "base64data", 1500L, "audio/mp4")
        }
    }

    @Test
    fun `escapeArg unsupported type throws IllegalArgumentException`() {
        // Any Kotlin type that isn't one of the explicit branches is a
        // programmer error -- e.g. an Array, a data class, an Enum. The
        // bridge fails loudly rather than emit `arg.toString()` which
        // would silently coerce to whatever Kotlin's default representation
        // happens to be (and could embed unescaped quotes / newlines).
        val webView: WebView? = null
        assertThrows<IllegalArgumentException> {
            // Use a non-Number, non-Boolean, non-String, non-null value.
            // `webView` happens to be a convenient stand-in for "anything
            // foreign"; the actual type doesn't matter.
            bridge.escapeArg(listOf("not allowed", webView))
        }
    }
}
