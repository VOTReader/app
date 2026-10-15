#!/usr/bin/env python3
"""sync-v2-kit.py - copy the design lane's v2 kit into the app (mw4, 2026-10-14).

The v2 look is the design lane's kit (D:/Swarm/lanes/design/out/v2-step2): kit.css (tokens + components), screens.css (layout
recipes) and icons.js (the one icon set). The app keeps byte-for-byte copies under app/src/main/assets/src/v2/, changed only
where the app must: the two font urls point at the app's own fonts/ (the same woff2 files), and icons.js becomes an ES module.

  python tools/sync-v2-kit.py [--from D:/Swarm/lanes/design/out/v2-step2] [--check]

--check exits 1 when the app's copies differ from what a sync would write (the kit moved on).
"""
import argparse, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'src', 'v2')
FONTS = ('eb-garamond-latin-wght-normal.woff2', 'eb-garamond-latin-wght-italic.woff2')

KIT_HEAD = ("/* v2 kit (mw4, 2026-10-14): copied from the design lane's D:/Swarm/lanes/design/out/v2-step2/kit/kit.css (dz5..dz10),\n"
            "   byte for byte except the two font urls (the app's own fonts/, the same files: md5 checked). The ONE source of truth for\n"
            "   v2 colour, type and spacing: change a token here, never a literal in a screen. Re-sync with tools/sync-v2-kit.py. */\n")
SCR_HEAD = ("/* v2 layout recipes (mw4): copied from the design lane's v2-step2/screens/screens.css byte for byte (tools/sync-v2-kit.py).\n"
            "   They move into kit.css once Corbin approves the screens (design's note below). */\n")
ICON_HEAD = ("// v2 icons (mw4): the design lane's v2-step2/kit/icons.js as an ES module (tools/sync-v2-kit.py writes this file;\n"
             "// edit the kit, then re-sync). Each value is an SVG string, or a function of `on` / size returning one.\n")


def build(src):
    kit = open(os.path.join(src, 'kit', 'kit.css'), encoding='utf-8').read()
    for f in FONTS:
        kit = kit.replace("url('%s')" % f, "url('../fonts/%s')" % f)
    if kit.count("url('../fonts/") != len(FONTS):
        raise SystemExit("sync-v2-kit: kit.css font urls moved; expected url('<name>.woff2') for " + ', '.join(FONTS))
    scr = open(os.path.join(src, 'screens', 'screens.css'), encoding='utf-8').read()
    ic = open(os.path.join(src, 'kit', 'icons.js'), encoding='utf-8').read()
    start, cut = ic.index('window.I = {'), ic.index('// stamp:')
    body = ic[start:cut].rstrip() + '\n'
    body = body.replace('window.I = {', 'export const I = {', 1)
    return {'kit.css': KIT_HEAD + kit, 'screens.css': SCR_HEAD + scr, 'icons.js': ICON_HEAD + body}


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='src', default='D:/Swarm/lanes/design/out/v2-step2')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args(argv)
    out = build(a.src)
    stale = []
    for name, text in out.items():
        p = os.path.join(DEST, name)
        old = open(p, encoding='utf-8').read() if os.path.exists(p) else None
        if old == text:
            continue
        stale.append(name)
        if not a.check:
            os.makedirs(DEST, exist_ok=True)
            open(p, 'w', encoding='utf-8', newline='').write(text)
    if a.check:
        print('sync-v2-kit: ' + ('stale: ' + ', '.join(stale) if stale else 'the app matches the kit'))
        return 1 if stale else 0
    print('sync-v2-kit: wrote ' + (', '.join(stale) if stale else 'nothing (already current)'))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
