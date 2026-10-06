"""gen-vot-glyphs.py - the app's own symbol glyphs (zones L1, 2026-10-05).

WHY. EB Garamond, Cinzel and the Reading Fonts carry Latin text only. The UI also draws symbols (the tab
count's square, the tab card's vertical ellipsis, the clear-search cross, the ornament star, play and
disclosure triangles, check marks, arrows), and a glyph a face lacks falls through to whatever the device
has: Cambria Math and Segoe UI Symbol on Windows, Noto Sans Symbols on Android, nothing on a bare Linux.
tools/e2e-phone-fit.mjs (F1) fails on any face the app does not ship.

WHAT. One small woff2 (fonts/vot-glyphs.woff2, ~4 KB) subset from DejaVu Sans (free licence,
fonts/LICENSE-DejaVu.txt; the search glyph from DejaVu Sans Mono, the download arrow from DejaVu Serif), and
an @font-face block in app.css that adds it to EVERY family the app names, limited by unicode-range to these
code points. A family is then the bundled face for letters and this file for symbols, with no change to any
font-family stack. The block sits outside #custom-fonts, so System Serif (classic) gets the symbols too: its
'EB Garamond' has only this face, which covers no letter, so letters still fall through to the device serif.

Run (regenerate, never hand-edit the block):
  npm pack dejavu-fonts-ttf  (into an empty scratch folder; tar -xzf it)
  python tools/gen-vot-glyphs.py <that folder>/package/ttf
Writes the woff2, then rewrites app.css between the GLYPHS-BEGIN / GLYPHS-END markers.
"""
import os
import re
import sys

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'app', 'src', 'main', 'assets')
OUT = os.path.join(ASSETS, 'fonts', 'vot-glyphs.woff2')
CSS = os.path.join(ASSETS, 'app.css')

# The symbols the UI draws (source scan of src/, app.css and index.html, 2026-10-05).
SANS = [0x2017, 0x2020, 0x2021, 0x2070] + list(range(0x2074, 0x207A)) + [
    0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x2195, 0x2197, 0x21C4, 0x21D2, 0x21D4, 0x2213,
    0x2248, 0x2260, 0x2264, 0x2265, 0x22EE, 0x22EF,
    0x25A2, 0x25B2, 0x25B4, 0x25B6, 0x25B8, 0x25BC, 0x25BE, 0x25C0, 0x25C2, 0x25CB, 0x25CF,
    0x266A, 0x2713, 0x2715, 0x2726, 0x2756]
PARTS = [('DejaVuSans.ttf', SANS), ('DejaVuSansMono.ttf', [0x2315]), ('DejaVuSerif.ttf', [0x2913])]
HTML = os.path.join(ASSETS, 'index.html')


def build_font(ttf_dir, tmp_dir):
    parts = []
    for fn, cps in PARTS:
        o = subset.Options()
        o.layout_features = []
        o.hinting = False
        o.notdef_outline = fn == 'DejaVuSans.ttf'
        o.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
        o.drop_tables += ['FFTM', 'MATH', 'GSUB', 'GPOS', 'GDEF', 'kern']
        f = subset.load_font(os.path.join(ttf_dir, fn), o)
        s = subset.Subsetter(o)
        s.populate(unicodes=cps)
        s.subset(f)
        p = os.path.join(tmp_dir, 'vot-glyphs-part-' + fn)
        f.save(p)
        parts.append(p)
    m = Merger().merge(parts)
    for nid, val in ((1, 'VOT Glyphs'), (4, 'VOT Glyphs'), (6, 'VOTGlyphs-Regular')):
        m['name'].setName(val, nid, 3, 1, 0x409)
    m['head'].created = m['head'].modified = 0  # the same bytes on every run
    m.recalcTimestamp = False
    m.flavor = 'woff2'
    m.save(OUT)
    for p in parts:
        os.remove(p)
    return sorted(c for c in TTFont(OUT).getBestCmap() if c > 0x7F)


FACE_RE = re.compile(r"@font-face \{ font-family: '([^']+)'; font-weight: ([0-9 ]+); font-style: (normal|italic);")


def faces(css):
    """Every (family, weight, style) the app declares. Chrome groups a family's faces by these descriptors and
    picks ONE group for a run of text before it looks at unicode-range, so a glyph face must copy each group's
    descriptors exactly: a 100 900 glyph face beside a 400 800 EB Garamond face won the match and left every
    letter to the device serif."""
    out = []
    for text in (open(HTML, encoding='utf-8').read(), re.sub(r'/\* GLYPHS-BEGIN.*?GLYPHS-END \*/', '', css, flags=re.S)):
        for key in FACE_RE.findall(text):
            if key not in out:
                out.append(key)
    return out


def css_block(cps, css):
    rng = ', '.join('U+%04X' % c for c in cps)
    lines = ['      /* GLYPHS-BEGIN (tools/gen-vot-glyphs.py; regenerate, never hand-edit). The UI\'s symbols in every',
             '         declared face: fonts/vot-glyphs.woff2 (DejaVu, fonts/LICENSE-DejaVu.txt), limited to these code points. */']
    for fam, weight, style in faces(css):
        lines.append("      @font-face { font-family: '%s'; font-weight: %s; font-style: %s; src: url('../fonts/vot-glyphs.woff2') format('woff2'); font-display: block; unicode-range: %s; }" % (fam, weight, style, rng))
    lines.append('      /* GLYPHS-END */')
    return '\n'.join(lines) + '\n'


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cps = build_font(sys.argv[1], os.path.dirname(OUT))
    css = open(CSS, encoding='utf-8', newline='').read()
    block = css_block(cps, css)
    m = re.search(r'      /\* GLYPHS-BEGIN.*?/\* GLYPHS-END \*/\n', css, re.S)
    if m:
        css = css[:m.start()] + block + css[m.end():]
    else:
        anchor = css.index('\n', css.index("fonts/reading/lexend-latin-wght-normal.woff2")) + 1
        css = css[:anchor] + block + css[anchor:]
    open(CSS, 'w', encoding='utf-8', newline='').write(css)
    print('%d code points, %d bytes, %d faces' % (len(cps), os.path.getsize(OUT), len(faces(css))))


if __name__ == '__main__':
    main()
