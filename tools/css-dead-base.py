#!/usr/bin/env python3
"""css-dead-base.py - find (and with --write, delete) base CSS declarations that a later rule always overrides.

vot-ui 2026-11-15 (overhaul, OWNER-NOTES 1). Most screens wear the kit through a LATER block that re-sets the old
base rule property by property (.more-menu, .select-sheet, ...). The old declarations stay in the file, cost bytes,
and make every census of "old look" count CSS no reader ever sees.

A declaration `p: v` in a top-level style rule R is dead when, for EVERY selector s in R's selector list, some later
top-level style rule lists s too (same text after whitespace normalisation) and declares the same property p.
Same selector = same specificity; later + top level (never inside @media / @supports / @layer) = it always applies
and always wins. Conservative by construction:
  - only an exact property-name match (a later `border` does not kill an earlier `border-color`, nor the reverse);
  - an earlier `!important` is kept unless the later one is `!important` too;
  - rules inside any at-rule are neither removed nor counted as overriders;
  - a rule whose every declaration dies is removed whole; its comment stays.

  python tools/css-dead-base.py [--css app/src/main/assets/app.css] [--write] [--list]
Prints the count, the bytes saved, and (with --list) every removed declaration with its line and the line that
overrides it.
"""
import argparse
import io
import re
import sys


def scan_blocks(text, start, end):
    """Yield (prelude_start, prelude_end, body_start, body_end) for each block at this nesting level."""
    i = start
    pre = start
    depth = 0
    while i < end:
        c = text[i]
        if text.startswith('/*', i):
            j = text.find('*/', i + 2)
            i = (j + 2) if j >= 0 else end
            continue
        if c in '"\'':
            j = i + 1
            while j < end and text[j] != c:
                j += 2 if text[j] == '\\' else 1
            i = j + 1
            continue
        if c == '{':
            if depth == 0:
                body = i + 1
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                yield pre, body - 1, body, i
                pre = i + 1
        elif c == ';' and depth == 0:
            pre = i + 1     # a statement at-rule (@import ...;)
        i += 1


def split_decls(text, start, end):
    """(decl_start, decl_end_including_semicolon, prop, important) for each declaration in a rule body."""
    out = []
    i = start
    d0 = start
    paren = 0
    while i <= end:
        c = text[i] if i < end else ';'
        if i < end and text.startswith('/*', i):
            j = text.find('*/', i + 2)
            i = (j + 2) if j >= 0 else end
            continue
        if c in '"\'' and i < end:
            j = i + 1
            while j < end and text[j] != c:
                j += 2 if text[j] == '\\' else 1
            i = j + 1
            continue
        if c == '(':
            paren += 1
        elif c == ')':
            paren -= 1
        elif c == ';' and paren == 0:
            raw = re.sub(r'/\*.*?\*/', '', text[d0:i], flags=re.S)
            if ':' in raw and raw.strip():
                prop = raw.split(':', 1)[0].strip().lower()
                important = bool(re.search(r'!\s*important\s*$', raw.strip(), re.I))
                # the span starts at the declaration's first non-space, non-comment character
                s = d0
                while True:
                    while s < i and text[s].isspace():
                        s += 1
                    if text.startswith('/*', s):
                        s = text.find('*/', s + 2) + 2
                        continue
                    break
                out.append((s, min(i + 1, end), prop, important))
            d0 = i + 1
        i += 1
    return out


NEWER = re.compile(r'(?<![a-z_-])(?:dvh|svh|lvh|dvw|svw|lvw|dvb|svb|lvb|dvi|svi|lvi|cqw|cqh|cqi|cqb|cqmin|cqmax)\b|'
                   r'(?<![\w-])(?:env|color-mix|oklch|oklab|lch|lab|clamp|min|max|light-dark|round|mod|rem|hwb)\(|:has\(', re.I)


def newer_features(decl):
    """The parse-time features a declaration's VALUE needs that an old WebView lacks (minSdk 26 allows Chromium < 79)."""
    v = decl.split(':', 1)[1] if ':' in decl else ''
    return set(m.group(0).lower() for m in NEWER.finditer(v))


def norm_sel(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s*([>+~])\s*', r'\1', s)
    return s


def split_selectors(prelude):
    parts, depth, cur = [], 0, ''
    for c in prelude:
        if c in '([':
            depth += 1
        elif c in ')]':
            depth -= 1
        if c == ',' and depth == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += c
    parts.append(cur)
    return [norm_sel(p) for p in parts if norm_sel(p)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--css', default='app/src/main/assets/app.css')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    text = io.open(a.css, encoding='utf-8').read()
    line_of = lambda pos: text.count('\n', 0, pos) + 1

    rules = []   # (index, selectors, decls, prelude_start, body_end)
    for ps, pe, bs, be in scan_blocks(text, 0, len(text)):
        prelude = re.sub(r'/\*.*?\*/', '', text[ps:pe], flags=re.S).strip()
        if not prelude or prelude.startswith('@'):
            continue
        rules.append((len(rules), split_selectors(prelude), split_decls(text, bs, be), ps, be))

    # later[(selector, prop)] = list of (rule index, important, position)
    later = {}
    for idx, sels, decls, _, _ in rules:
        for s in sels:
            for ds, de, prop, imp in decls:
                later.setdefault((s, prop), []).append((idx, imp, ds, de))

    dead = []   # (decl_start, decl_end, prop, overrider_pos)
    for idx, sels, decls, _, _ in rules:
        for ds, de, prop, imp in decls:
            over = None
            for s in sels:
                hits = [h for h in later.get((s, prop), []) if h[0] > idx and (h[1] or not imp)]
                # a fallback pair: when a later value needs a feature the earlier one does not, an older WebView drops
                # the later one at parse and the earlier is live there (hub 11-15). Keep it.
                if any(newer_features(text[h[2]:h[3]]) - newer_features(text[ds:de]) for h in hits):
                    hits = []
                if not hits:
                    over = None
                    break
                over = hits[-1][2]
            if over is not None:
                dead.append((ds, de, prop, over))

    if a.list:
        for ds, de, prop, over in dead:
            print(f'{line_of(ds)}: {text[ds:de].strip()[:110]}   <- {line_of(over)}')
    saved = sum(de - ds for ds, de, _, _ in dead)
    print(f'[css-dead-base] {len(dead)} overridden declarations, {saved} bytes in {a.css}')
    if not a.write or not dead:
        return 0

    # remove declarations, and a rule left with no declarations (its own text only; comments before it stay)
    kill = sorted(((ds, de) for ds, de, _, _ in dead), reverse=True)
    dead_set = set((ds, de) for ds, de in kill)
    whole = []
    for idx, sels, decls, ps, be in rules:
        if decls and all((ds, de) in dead_set for ds, de, _, _ in decls):
            # the rule's own text: from its selector's first character to its closing brace
            s = ps
            while True:
                while s < be and text[s].isspace():
                    s += 1
                if text.startswith('/*', s):
                    s = text.find('*/', s + 2) + 2
                    continue
                break
            whole.append((s, be + 1))
    spans = whole + [k for k in kill if not any(ws <= k[0] and k[1] <= we for ws, we in whole)]
    spans.sort(reverse=True)
    out = text
    for s, e in spans:
        # eat the spaces after a removed declaration so lines do not fill with gaps
        e2 = e
        while e2 < len(out) and out[e2] == ' ':
            e2 += 1
        out = out[:s] + out[e2:]
    # a line left holding nothing but spaces goes
    out = re.sub(r'\n[ \t]+\n', '\n', out)
    io.open(a.css, 'w', encoding='utf-8', newline='').write(out)
    print(f'[css-dead-base] wrote {a.css}: {len(text)} -> {len(out)} bytes ({len(whole)} rules removed whole)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
