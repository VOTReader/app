"""P5e bundle helper — extracts MULTIPLE inline helpers into one module.

Differs from _p4_extract_view.py (which extracts one component per file):
this script takes a bundle SPEC and lifts a related cluster of helpers
into a single utility module. Designed for pure-function helpers that
don't need their own file each.

Usage:
  python tools/_p5e_bundle_helpers.py <out-subdir/name.js> <header> <fn1> [fn2 ...]

Examples:
  python tools/_p5e_bundle_helpers.py utils/hl-keys.js "HL key builders" \\
    bibleHlKey letterHlKey wtlbHlKey studyHlKey

Same brace-match + hook upgrade + refuse-to-write guards as the
component extractor. Functions are removed from index.html in their
original positions (breadcrumb left in place) and concatenated into the
bundle in the order given.
"""

import sys, os, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

if len(sys.argv) < 4:
    print('usage: %s <out-subdir/name.js> <header> <fn1> [fn2 ...]' % sys.argv[0])
    sys.exit(2)

OUT_REL = sys.argv[1]
HEADER = sys.argv[2]
FN_NAMES = sys.argv[3:]

IDX = 'D:/VOTReader-studio/app/src/main/assets/index.html'
OUT = 'D:/VOTReader-studio/app/src/main/assets/src/' + OUT_REL

with open(IDX, 'r', encoding='utf-8', newline='') as f:
    text = f.read()
NL = '\r\n' if '\r\n' in text[:4096] else '\n'
print('LE:', 'CRLF' if NL == '\r\n' else 'LF')


def find_func_close(s, fn_start):
    """Brace-match from a function's body opener through to its closing }.
    Handles strings ("", '', ``), line/block comments, and regex literals.
    Returns index AFTER the closing brace, or -1 on failure."""
    n = len(s)
    p = s.find('(', fn_start)
    if p == -1: return -1
    depth = 1; p += 1
    # Paren-match the param list
    while p < n and depth:
        c = s[p]
        if c == '"' or c == "'":
            p += 1
            while p < n and s[p] != c:
                if s[p] == '\\': p += 2
                else: p += 1
            p += 1
        elif c == '`':
            p += 1
            while p < n and s[p] != '`':
                if s[p] == '\\': p += 2
                elif s[p:p+2] == '${':
                    p += 2; bd = 1
                    while p < n and bd:
                        if s[p] == '{': bd += 1
                        elif s[p] == '}': bd -= 1
                        p += 1
                else: p += 1
            p += 1
        elif s[p:p+2] == '//':
            nl = s.find('\n', p); p = nl if nl != -1 else n
        elif s[p:p+2] == '/*':
            e = s.find('*/', p+2)
            if e == -1: return -1
            p = e + 2
        elif c == '(': depth += 1; p += 1
        elif c == ')': depth -= 1; p += 1
        else: p += 1
    if depth: return -1
    while p < n and s[p] in ' \t\r\n': p += 1
    if p >= n or s[p] != '{': return -1
    p += 1; depth = 1; prev = '{'
    while p < n and depth:
        c = s[p]
        if c == '"' or c == "'":
            p += 1
            while p < n and s[p] != c:
                if s[p] == '\\': p += 2
                else: p += 1
            p += 1; prev = '"'
        elif c == '`':
            p += 1
            while p < n and s[p] != '`':
                if s[p] == '\\': p += 2
                elif s[p:p+2] == '${':
                    p += 2; bd = 1
                    while p < n and bd:
                        if s[p] == '{': bd += 1
                        elif s[p] == '}': bd -= 1
                        p += 1
                else: p += 1
            p += 1; prev = '`'
        elif s[p:p+2] == '//':
            nl = s.find('\n', p); p = nl if nl != -1 else n
        elif s[p:p+2] == '/*':
            e = s.find('*/', p+2)
            if e == -1: return -1
            p = e + 2
        elif c == '/' and prev in '=(,!&|?:;{}[':
            p += 1; in_class = False
            while p < n:
                cc = s[p]
                if cc == '\\': p += 2; continue
                if cc == '[': in_class = True
                elif cc == ']': in_class = False
                elif cc == '/' and not in_class: p += 1; break
                elif cc == '\n': break
                p += 1
            prev = '/'
        elif c == '{':
            depth += 1; p += 1; prev = '{'
        elif c == '}':
            depth -= 1; p += 1
            if depth == 0: return p
            prev = '}'
        elif c in ' \t\r\n': p += 1
        else: prev = c; p += 1
    return -1


# Locate each function's body span (start, end). Process in REVERSE
# file order so earlier offsets stay valid when we splice removals.
spans = []
for fn in FN_NAMES:
    # Anchor: `function NAME(` at line start (column 0) to avoid matching
    # nested helpers
    pat = NL + 'function ' + fn + '('
    i = text.find(pat)
    if i == -1:
        # Maybe at file start (no leading newline)
        if text.startswith('function ' + fn + '('):
            i_start = 0
        else:
            print('FATAL: function', fn, 'not found at column 0')
            sys.exit(1)
    else:
        i_start = i + len(NL)
    # Uniqueness — only one top-level definition
    next_i = text.find(NL + 'function ' + fn + '(', i_start)
    if next_i != -1:
        print('FATAL: function', fn, 'defined multiple times at top level')
        sys.exit(1)
    j_end = find_func_close(text, i_start)
    if j_end == -1:
        print('FATAL: brace-match failed for', fn); sys.exit(1)
    spans.append((fn, i_start, j_end))

# Hook upgrade on each body (defensive — most pure helpers don't use hooks)
hooks = ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback']
bodies = []
total_upgrades = 0
total_body_bytes = 0
for fn, s, e in spans:
    body = text[s:e]
    n_upgrades = 0
    for h in hooks:
        pat = re.compile(r'(?<![.\w])' + h + r'\(')
        matches = pat.findall(body)
        if matches:
            body = pat.sub('React.' + h + '(', body)
            n_upgrades += len(matches)
    if 'React.React.' in body:
        print('FATAL: double-React. introduced in', fn); sys.exit(1)
    for h in hooks:
        leftover = re.compile(r'(?<![.\w])' + h + r'\(').findall(body)
        if leftover:
            print('FATAL: bare hook leftover in', fn, ':', h); sys.exit(1)
    if not body.rstrip().endswith('}'):
        print('FATAL: body of', fn, 'does not end with }'); sys.exit(1)
    if not body.lstrip().startswith('function ' + fn + '('):
        print('FATAL: body of', fn, 'does not start with signature'); sys.exit(1)
    if len(body) < 30 or len(body) > 50000:
        print('FATAL: body size out of range for', fn, ':', len(body)); sys.exit(1)
    bodies.append((fn, body, n_upgrades, s, e))
    total_upgrades += n_upgrades
    total_body_bytes += len(body)

# Compose module
module_lines = [
    '/* ' + '=' * 67,
    '   ' + HEADER,
    '   ' + '=' * 67,
    '   Global-scope module. Concatenates with index.html via <script src>.',
    '   Bundled helpers (P5e):',
]
for fn, b, _u, _s, _e in bodies:
    module_lines.append('   - ' + fn)
module_lines.append('   ' + '=' * 67 + ' */' )
module_lines.append('')
module_text = NL.join(module_lines) + NL + NL
for fn, body, _u, _s, _e in bodies:
    module_text += body.rstrip() + NL + NL

# Splice removals from text — replace each span with a breadcrumb.
# Process in REVERSE order to keep earlier offsets valid.
new_text = text
removed = 0
for fn, s, e in reversed(spans):
    crumb = '/* ' + fn + ' --> extracted to src/' + OUT_REL + ' */'
    new_text = new_text[:s] + crumb + new_text[e:]
    removed += (e - s) - len(crumb)

# Sanity: each function name must no longer appear as a top-level `function NAME(`
for fn in FN_NAMES:
    if (NL + 'function ' + fn + '(') in new_text:
        print('FATAL: inline `function', fn, '(` still in index.html after extract')
        sys.exit(1)

# Wire <script src> if not already present
src_tag = '<script src="src/' + OUT_REL + '"></script>'
if src_tag in new_text:
    print('NOTE: <script src> for', OUT_REL, 'already present, not re-inserting')
else:
    anchor = NL + '  <script src="src/ui/screens/LinksScreen.js"></script>'
    if new_text.count(anchor) != 1:
        print('FATAL: insert anchor not unique/found (count=%d)' % new_text.count(anchor))
        sys.exit(1)
    new_text = new_text.replace(anchor, NL + '  ' + src_tag + anchor, 1)

# Write
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write(module_text)
print('OK: wrote', OUT, '(%d bytes, %d functions, %d hook upgrades)' % (
    len(module_text), len(bodies), total_upgrades))
with open(IDX, 'w', encoding='utf-8', newline='') as f:
    f.write(new_text)
print('OK: rewrote index.html (was %d, now %d, delta %d)' % (
    len(text), len(new_text), len(new_text) - len(text)))
