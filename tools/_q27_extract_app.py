#!/usr/bin/env python3
"""Q2.7-1 — extract function App() from index.html to src/app.js verbatim.

This is a SINGLE-USE script (like the other tools/_*.py extractors).
It splices index.html lines 1000-3221 (the App() body) out to a new
src/app.js with a header + the React-hook destructure prefix + the
verbatim body + a window.App export. index.html gets the App() block
replaced by a one-line breadcrumb.

NO JSX conversion happens here. Every React.createElement(...) call
stays verbatim. JSX conversion lands in Q2.7-2.

Refuse-to-write guards mirror tools/_p4_extract_view.py — boundaries
must match exactly or the script aborts before touching either file.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'app' / 'src' / 'main' / 'assets' / 'index.html'
APP_JS = ROOT / 'app' / 'src' / 'main' / 'assets' / 'src' / 'app.js'

# Read index.html preserving exact line endings.
text = INDEX.read_text(encoding='utf-8')
lines = text.splitlines(keepends=True)

# ── Refuse-to-write guards ──────────────────────────────────────────────
# Line 1000 (Python index 999) must start with 'function App() {'.
# Line 3221 (Python index 3220) must be exactly '}' (the closing brace).
if not lines[999].startswith('function App() {'):
    sys.exit(f"ABORT: line 1000 is not 'function App() {{', got: {lines[999][:60]!r}")
if lines[3220].rstrip('\r\n') != '}':
    sys.exit(f"ABORT: line 3221 is not '}}', got: {lines[3220]!r}")

# Confirm lines 999 and 3222 are blank — clean isolation around the block.
if lines[998].strip() != '':
    sys.exit(f"ABORT: line 999 is not blank, got: {lines[998]!r}")
if lines[3221].strip() != '':
    sys.exit(f"ABORT: line 3222 is not blank, got: {lines[3221]!r}")

# ── Build src/app.js ────────────────────────────────────────────────────
HEADER = """\
/* ═══════════════════════════════════════════════════════════════════════
   App — the composition root (Q2.7-1)
   ═══════════════════════════════════════════════════════════════════════
   This file is the root React component. It composes every screen,
   every sheet, every hook, every store into one orchestrator.

   Extracted from index.html in Q2.7-1 as a VERBATIM move. Every
   React.createElement(...) call stays as-is. JSX conversion is the
   next commit (Q2.7-2).

   Bundles into dist/bundle-d.js via ../ui/_entry-d.js. The bundle's
   esbuild IIFE wrapper ships as a classic <script>, not a module, so
   free-variable references (useState/useEffect/etc. from inline #1,
   BIBLE_BOOK_LIST + TabsContext + studyShortTitle from inline #3)
   resolve through the classic-script global lexical environment —
   exactly as they do for the ~80 other modules in bundle-d that read
   them today. No window.* shims required.

   The destructure below mirrors index.html inline #1 — kept here for
   clarity so this file reads as self-contained.
   ═══════════════════════════════════════════════════════════════════════ */
const { useState, useEffect, useCallback, useRef, useMemo } = React;

"""

FOOTER = """\

// Expose App on window for the createRoot script at the bottom of
// index.html to find it. Replaces the implicit window.App that the
// top-level `function App() {}` declaration created when this lived
// in a classic-script inline block.
if (typeof window !== 'undefined') { window.App = App; }
export { App };
"""

# Python slice [999:3221] = 1-indexed lines 1000-3221 inclusive (the App body).
body = ''.join(lines[999:3221])
app_js_out = HEADER + body + FOOTER

# Make sure parent dir exists (it does, but be defensive).
APP_JS.parent.mkdir(parents=True, exist_ok=True)
APP_JS.write_text(app_js_out, encoding='utf-8')

# ── Patch index.html ────────────────────────────────────────────────────
# Replace lines 1000-3221 with a single-line breadcrumb comment.
# Keep lines 1-999 (Python [:999]) and lines 3222+ (Python [3221:]).
BREADCRUMB = '/* App() extracted to src/app.js (Q2.7-1 — verbatim move; JSX conversion in Q2.7-2) */\n'
new_html = ''.join(lines[:999]) + BREADCRUMB + ''.join(lines[3221:])
INDEX.write_text(new_html, encoding='utf-8')

# ── Report ──────────────────────────────────────────────────────────────
app_js_lines = app_js_out.count('\n') + (0 if app_js_out.endswith('\n') else 1)
new_html_lines = new_html.count('\n') + (0 if new_html.endswith('\n') else 1)
orig_html_lines = text.count('\n') + (0 if text.endswith('\n') else 1)

print(f"WROTE  {APP_JS.relative_to(ROOT)}  ({app_js_lines} lines)")
print(f"PATCH  {INDEX.relative_to(ROOT)}  ({orig_html_lines} -> {new_html_lines} lines, delta {new_html_lines - orig_html_lines})")
print()
print("Body extracted: lines 1000-3221 (2222 lines)")
print(f"src/app.js   = header ({HEADER.count(chr(10))} lines) + body (2222) + footer ({FOOTER.count(chr(10))} lines)")
