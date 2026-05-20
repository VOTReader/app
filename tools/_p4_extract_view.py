"""P4 extraction helper — parameterized, refuse-to-write guarded.
Extracts one React screen component from index.html into its own
src/ui/screens/X.js module.

Usage:
  python tools/_p4_extract_view.py LetterView SelectField

The script:
  1. Slices the file from `function {VIEW_NAME}({` to the last
     `\\r\\n}\\r\\n` before `function {NEXT_NAME}(` — that's the VIEW's
     closing brace.
  2. Upgrades bare React-hook calls to React.X form
     (useState/useEffect/useRef/useMemo/useCallback) for module
     self-containment.
  3. Writes the module with a docstring header.
  4. Replaces the inline definition with a one-line breadcrumb stub.
  5. Inserts <script src> for the new module at the canonical screens
     point — right before the existing LinksScreen.js / BookmarksScreen
     .js / HighlightsScreen.js block at the end of index.html.

  Refuses to write unless every invariant holds (size sanity, body ends
  with closing brace, function signature unique, etc.)."""

import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

if len(sys.argv) not in (3, 4):
    print('usage: %s <VIEW_NAME> <NEXT_FUNC_NAME> [<subdir>]' % sys.argv[0])
    print('  subdir defaults to "ui/screens"; pass e.g. "ui/components" for shared')
    sys.exit(2)

VIEW = sys.argv[1]
NEXT = sys.argv[2]
SUBDIR = sys.argv[3] if len(sys.argv) == 4 else 'ui/screens'

IDX = 'D:/VOTReader-studio/app/src/main/assets/index.html'
SCREENS_DIR = 'D:/VOTReader-studio/app/src/main/assets/src/' + SUBDIR
OUT = os.path.join(SCREENS_DIR, VIEW + '.js')

with open(IDX, 'r', encoding='utf-8', newline='') as f:
    text = f.read()

# Detect actual line-ending convention so anchors line up regardless of
# git's autocrlf state. Previous P-scripts assumed CRLF; this one adapts.
NL = '\r\n' if '\r\n' in text[:4096] else '\n'
print('detected line ending: %s' % ('CRLF' if NL == '\r\n' else 'LF'))

# Locate the function — must be uniquely defined inline. Accept both
# destructured `function NAME({` and bare `function NAME(` forms; some
# small utilities like HomeBtn(), TabsNavBtn(), LibraryNav(opts) use
# the bare paren.
start_anchor_destructured = 'function ' + VIEW + '({'
start_anchor_bare = 'function ' + VIEW + '('
i_start = text.find(start_anchor_destructured)
if i_start == -1:
    i_start = text.find(start_anchor_bare)
    if i_start == -1:
        print('FATAL: function %s( not found' % VIEW); sys.exit(1)
    # confirm uniqueness on the bare form too
    if text.find(start_anchor_bare, i_start + 1) != -1:
        print('FATAL: function %s( appears multiple times' % VIEW); sys.exit(1)
else:
    if text.find(start_anchor_destructured, i_start + 1) != -1:
        print('FATAL: %s appears multiple times' % start_anchor_destructured); sys.exit(1)

# Find the next top-level function (terminator), then walk back to find
# this view's closing `}` line.
i_next = text.find('function ' + NEXT + '(', i_start)
if i_next == -1:
    print('FATAL: terminator function %s not found after %s' % (NEXT, VIEW)); sys.exit(1)

# The VIEW's closing brace is at the position of the last newline+`}`
# pattern strictly BEFORE the next function. Try the strict pattern
# first (function followed by a blank line), then relax to allow
# adjacent functions with no blank line between (`\n}\n` → `\n}`).
i_close = text.rfind(NL + '}' + NL, i_start, i_next)
end_pattern_len = len(NL + '}' + NL)
if i_close == -1:
    i_close = text.rfind(NL + '}', i_start, i_next)
    end_pattern_len = len(NL + '}')
    if i_close == -1:
        print('FATAL: could not find closing brace for', VIEW); sys.exit(1)
body_end = i_close + end_pattern_len
body = text[i_start:body_end]

# ── Hook upgrade — bare → React.useX (self-containment) ──────────────
# Only upgrade BARE calls. A naive str.replace turned existing
# `React.useMemo(` into `React.React.useMemo(` on the first run — the
# WtlbEntryView crashed with "Cannot read properties of undefined
# (reading 'useMemo')" because `React.React` is undefined. Negative
# lookbehind ensures the match is only on bare-name calls, not on
# `something.useMemo(` (already prefixed) or `useStateNamed(`.
import re
hooks = ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback']
upgrade_count = 0
for h in hooks:
    pattern = re.compile(r'(?<![.\w])' + h + r'\(')
    matches = pattern.findall(body)
    if matches:
        body = pattern.sub('React.' + h + '(', body)
        upgrade_count += len(matches)
        print('  upgraded %d bare %s → React.%s' % (len(matches), h + '(', h + '('))

# ── Sanity guards ────────────────────────────────────────────────────
problems = []
if len(body) < 300:
    problems.append('body suspiciously small (<300B — almost certainly truncated): %d bytes' % len(body))
if len(body) > 50000:
    problems.append('body suspiciously large: %d bytes' % len(body))
stripped = body.rstrip()
if not stripped.endswith('}'):
    problems.append('body does not end with } (closing brace) — truncated?')
if not stripped.startswith('function ' + VIEW + '('):
    problems.append('body does not start with the function signature')
# After upgrade, no bare hook calls should remain AND no double-React
# pattern should have been introduced (the bug caught by the harness on
# the WtlbEntryView first-extraction attempt).
if 'React.React.' in body:
    problems.append('double-React.React. pattern present — naive replace bug')
for h in hooks:
    # Bare match: same regex used for the upgrade. Anything left = bug.
    leftover = re.compile(r'(?<![.\w])' + h + r'\(').findall(body)
    if leftover:
        problems.append('post-upgrade: %d bare %s( still in body' % (len(leftover), h))

# ── Module text ──────────────────────────────────────────────────────
HEADER = (
    '/* ═══════════════════════════════════════════════════════════════════════' + NL +
    '   ' + VIEW + ' — extracted React screen component' + NL +
    '   ═══════════════════════════════════════════════════════════════════════' + NL +
    '   Global-scope module. Concatenates with index.html via <script src>.' + NL +
    '   Self-contained — uses React.useX hooks directly (no dependency on the' + NL +
    '   inline script\'s `const { useState, ... } = React` destructuring).' + NL +
    '   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,' + NL +
    '   findEntryContext, applyDOMHighlights, etc.) are global-lexical and' + NL +
    '   resolve at render time from the surrounding scripts.' + NL +
    '   ═══════════════════════════════════════════════════════════════════════ */' + NL +
    NL
)
module_text = HEADER + body.rstrip() + NL

# ── Build new index.html ─────────────────────────────────────────────
SRC_PATH = 'src/' + SUBDIR + '/' + VIEW + '.js'
breadcrumb = '/* ' + VIEW + ' → extracted to ' + SRC_PATH + ' */' + NL
new_text = text[:i_start] + breadcrumb + text[body_end:]

# Insert <script src> right BEFORE the LinksScreen.js block (canonical
# screens/components insertion point — all module loads cluster here).
INSERT_ANCHOR = NL + '  <script src="src/ui/screens/LinksScreen.js"></script>'
if new_text.count(INSERT_ANCHOR) != 1:
    problems.append('insert anchor not unique/found (count=%d)' % new_text.count(INSERT_ANCHOR))
new_tag = NL + '  <script src="' + SRC_PATH + '"></script>'
new_text = new_text.replace(INSERT_ANCHOR, new_tag + INSERT_ANCHOR, 1)

# After-state: the inline function must be GONE from index.html
if 'function ' + VIEW + '(' in new_text:
    problems.append('index.html still contains inline `function %s(`' % VIEW)
# Tag exactly once
n_tag = new_text.count('<script src="' + SRC_PATH + '"></script>')
if n_tag != 1:
    problems.append('expected 1 <script src> for %s, got %d' % (VIEW, n_tag))

# Sanity print
print('extracted bytes: %d..%d  (len %d)' % (i_start, body_end, body_end - i_start))
print('module bytes   :', len(module_text))
print('hook upgrades  :', upgrade_count)
print('index.html: was %d, now %d (delta %+d)' % (len(text), len(new_text), len(new_text) - len(text)))

if problems:
    print('REFUSING TO WRITE - sanity failed:')
    for p in problems: print('  -', p)
    sys.exit(1)

os.makedirs(SCREENS_DIR, exist_ok=True)
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write(module_text)
print('OK: wrote', OUT, '(%d bytes)' % len(module_text))
with open(IDX, 'w', encoding='utf-8', newline='') as f:
    f.write(new_text)
print('OK: rewrote index.html (%d bytes)' % len(new_text))
