#!/usr/bin/env python3
"""Generate tools/eslint-globals.generated.js by scanning all sources of
window-attached globals. eslint.config.js imports the generated file.

Runs as part of `npm run lint` (chained before eslint), and via the
pre-commit hook (when source files are staged). Belt-and-suspenders so
the globals list cannot go stale relative to the bundles.

Sources scanned:
  1. _entry-b.js / _entry.js / _entry-d.js — Object.assign(window, {...})
     blocks (the canonical export point for bundle B/C/D modules).
  2. index.html — top-level `const|let|var|function|class NAME` declarations
     inside the inline <script> blocks (TabsContext, BIBLE_BOOK_LIST,
     COLLECTIONS, the hook-DAG-style declarations, etc.).
  3. index.html — `window.NAME = …` assignments (the lexical-mirror script
     + any runtime window writes inside inline boot code).
  4. src/data/*.js — top-level UPPER_CASE_DECL declarations (corpus data
     globals like LETTERS_V1, MATTHEW, BIBLE_STUDIES, BOOKS, etc.).
  5. A hand-maintained VENDOR list (React, ReactDOM, FlexSearch, etc.
     — globals from .min.js files we don't parse).

Output: tools/eslint-globals.generated.js with one exported object literal
(`readonly` mode for everything — nothing here is App-writable as a global).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ENTRY_FILES = [
    ROOT / 'app/src/main/assets/src/stores/_entry-b.js',
    ROOT / 'app/src/main/assets/src/renderer/_entry.js',
    ROOT / 'app/src/main/assets/src/ui/_entry-d.js',
]
INDEX_HTML = ROOT / 'app/src/main/assets/index.html'
DATA_DIR = ROOT / 'app/src/main/assets/src/data'
OUT_FILE = ROOT / 'tools/eslint-globals.generated.js'

VENDOR_GLOBALS = [
    'React', 'ReactDOM',
    'FlexSearch', 'html2canvas',
    'VotSearch', 'VotSearchData',
]


def extract_object_assign_idents(text, entry_file):
    """Find every Object.assign(window, ...) call and harvest its exports.

    Three call shapes appear in the entry files:
      1. Object.assign(window, { A, B, C })        — explicit named exports
      2. Object.assign(window, NS1, NS2, NS3)      — wildcard namespace spreads
      3. Mixed: Object.assign(window, NS1, { D })  — combo
    """
    out = set()
    # Match Object.assign(window, <args...>) and split on top-level commas.
    for m in re.finditer(
        r'Object\.assign\s*\(\s*window\s*,\s*((?:[^()]*|\([^()]*\))*)\)',
        text, re.DOTALL,
    ):
        args = m.group(1)
        # Walk args, splitting on commas that are at brace depth 0
        parts, buf, depth = [], '', 0
        for ch in args:
            if ch == '{': depth += 1
            if ch == '}': depth -= 1
            if ch == ',' and depth == 0:
                parts.append(buf.strip()); buf = ''
            else:
                buf += ch
        if buf.strip(): parts.append(buf.strip())

        for part in parts:
            if part.startswith('{'):
                # Inline object — pull every identifier
                body = part.strip('{}')
                for ident in re.findall(r'(?:^|[,\s])([A-Za-z_$][A-Za-z0-9_$]*)\s*(?=[,}\n])', body):
                    if ident not in ('window', 'Object', 'assign'):
                        out.add(ident)
            else:
                # Bare identifier — a wildcard namespace import. Resolve to the
                # module it was imported from and extract its named exports.
                ns = part.strip()
                if not re.match(r'^[A-Za-z_$][A-Za-z0-9_$]*$', ns):
                    continue
                ns_idents = resolve_wildcard_namespace(ns, text, entry_file)
                out |= ns_idents
    return out


def resolve_wildcard_namespace(ns_name, entry_text, entry_file):
    """Given a namespace identifier like 'HubScreen', find its
    `import * as HubScreen from '...'` line in the entry file, then read
    that target file and extract its top-level `export function|const|let|var|class NAME`.
    """
    m = re.search(
        r'import\s+\*\s+as\s+' + re.escape(ns_name) + r"\s+from\s+['\"]([^'\"]+)['\"]",
        entry_text,
    )
    if not m:
        return set()
    rel_path = m.group(1)
    # Resolve relative to the entry file's directory
    target = (entry_file.parent / rel_path).resolve()
    if not target.exists():
        return set()
    target_text = target.read_text(encoding='utf-8')
    # All top-level `export NAME` (function/const/let/var/class)
    exports = set(re.findall(
        r'^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)',
        target_text, re.MULTILINE,
    ))
    return exports


def extract_top_level_decls(text):
    """Find `const|let|var|function|class NAME` at column 0 (top-level)."""
    return set(re.findall(
        r'^(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)',
        text, re.MULTILINE,
    ))


def extract_window_writes(text):
    """Find `window.NAME = …` assignments. Excludes `window.NAME = null` cleanups —
    those are bridge writes the same NAME is also created by, so they're already
    captured by a setup elsewhere. We collect every name; dedup happens via set."""
    return set(re.findall(r'window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=', text))


def extract_corpus_globals():
    """Top-level UPPER_CASE_NAME decls in src/data/*.js — corpus + translation
    globals. Filter to ALL_CAPS_WITH_UNDERSCORES naming so we don't slurp
    function-scoped helpers that happen to have leading-cap names."""
    out = set()
    for f in sorted(DATA_DIR.glob('*.js')):
        text = f.read_text(encoding='utf-8')
        for ident in re.findall(
            r'^(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=',
            text, re.MULTILINE,
        ):
            out.add(ident)
    return out


def main():
    all_globals = set(VENDOR_GLOBALS)

    # 1. Bundle entry Object.assign blocks
    for f in ENTRY_FILES:
        if not f.exists():
            print(f'WARN: missing entry file {f}', file=sys.stderr)
            continue
        text = f.read_text(encoding='utf-8')
        idents = extract_object_assign_idents(text, f)
        all_globals |= idents

    # 2 + 3. index.html — top-level decls + window.X = …
    if INDEX_HTML.exists():
        idx_text = INDEX_HTML.read_text(encoding='utf-8')
        all_globals |= extract_top_level_decls(idx_text)
        all_globals |= extract_window_writes(idx_text)

    # 4. Corpus data globals
    all_globals |= extract_corpus_globals()

    # Sort for stable git diffs
    sorted_globals = sorted(all_globals)

    # Emit JS module
    lines = [
        '// AUTO-GENERATED by tools/gen-eslint-globals.py — do not hand-edit.',
        '// Regenerate via `npm run lint:globals` (also runs implicitly via',
        '// `npm run lint` and the pre-commit hook).',
        '//',
        '// Sources scanned: _entry-{b,d}.js Object.assign(window) blocks,',
        '// _entry.js (renderer), index.html top-level decls + window.X = …,',
        '// src/data/*.js top-level UPPER_CASE_DECL, plus a hand-maintained',
        '// VENDOR list inside the generator script.',
        f'// Total: {len(sorted_globals)} distinct identifiers.',
        '',
        'export const projectGlobals = {',
    ]
    for name in sorted_globals:
        lines.append(f'  {name}: "readonly",')
    lines.append('};')
    lines.append('')

    OUT_FILE.write_text('\n'.join(lines), encoding='utf-8')
    print(f'WROTE {OUT_FILE.relative_to(ROOT)} ({len(sorted_globals)} globals)')


if __name__ == '__main__':
    main()
