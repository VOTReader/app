"""tools/gen-vot-glyphs.py: the app's symbol glyphs in every declared face (zones L1, 2026-10-05)."""
import importlib.util
import os
import sys
import tempfile
import unittest

_spec = importlib.util.spec_from_file_location(
    "gen_vot_glyphs", os.path.join(os.path.dirname(__file__), "tools", "gen-vot-glyphs.py"))
g = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(g)

# A small index.html: two faces, one duplicated, one multi-value weight + italic.
HTML = """\
@font-face { font-family: 'Cinzel'; font-weight: 400; font-style: normal; src: url('../fonts/x.woff2') format('woff2'); }
@font-face { font-family: 'EB Garamond'; font-weight: 400 800; font-style: italic; src: url('../fonts/x.woff2') format('woff2'); }
@font-face { font-family: 'Cinzel'; font-weight: 400; font-style: normal; src: url('../fonts/x.woff2') format('woff2'); }
"""

# A small app.css: one new face, a GLYPHS block whose face must be stripped,
# and a repeat of the HTML Cinzel face (must not appear twice).
CSS = """\
@font-face { font-family: 'Cinzel Decorative'; font-weight: 700; font-style: normal; src: url('../fonts/x.woff2') format('woff2'); }
      /* GLYPHS-BEGIN (tools/gen-vot-glyphs.py; regenerate, never hand-edit). */
      @font-face { font-family: 'Ghost'; font-weight: 400; font-style: normal; src: url('../fonts/vot-glyphs.woff2') format('woff2'); font-display: block; unicode-range: U+2017; }
      /* GLYPHS-END */
@font-face { font-family: 'Cinzel'; font-weight: 400; font-style: normal; src: url('../fonts/x.woff2') format('woff2'); }
"""

FIXTURE_FACES = [
    ("Cinzel", "400", "normal"),
    ("EB Garamond", "400 800", "italic"),
    ("Cinzel Decorative", "700", "normal"),
]


class FixtureHtml(unittest.TestCase):
    """faces() / css_block() against the fixture HTML (the real index.html patched out)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._html = os.path.join(self._tmp.name, "index.html")
        with open(self._html, "w", encoding="utf-8") as f:
            f.write(HTML)
        self._orig_html = g.HTML
        g.HTML = self._html

    def tearDown(self):
        g.HTML = self._orig_html
        self._tmp.cleanup()

    def test_faces_dedupes_and_keeps_html_order_first(self):
        assert g.faces(CSS) == FIXTURE_FACES

    def test_faces_keeps_multi_value_weight_and_italic(self):
        assert ("EB Garamond", "400 800", "italic") in g.faces(CSS)

    def test_faces_strips_the_glyphs_block(self):
        assert all(fam != "Ghost" for fam, _w, _s in g.faces(CSS))

    def test_css_block_is_exact(self):
        expected = (
            "      /* GLYPHS-BEGIN (tools/gen-vot-glyphs.py; regenerate, never hand-edit). The UI's symbols in every\n"
            "         declared face: fonts/vot-glyphs.woff2 (DejaVu, fonts/LICENSE-DejaVu.txt), limited to these code points. */\n"
            "      @font-face { font-family: 'Cinzel'; font-weight: 400; font-style: normal; src: url('../fonts/vot-glyphs.woff2') format('woff2'); font-display: block; unicode-range: U+2017, U+2713; }\n"
            "      @font-face { font-family: 'EB Garamond'; font-weight: 400 800; font-style: italic; src: url('../fonts/vot-glyphs.woff2') format('woff2'); font-display: block; unicode-range: U+2017, U+2713; }\n"
            "      @font-face { font-family: 'Cinzel Decorative'; font-weight: 700; font-style: normal; src: url('../fonts/vot-glyphs.woff2') format('woff2'); font-display: block; unicode-range: U+2017, U+2713; }\n"
            "      /* GLYPHS-END */\n"
        )
        assert g.css_block([0x2017, 0x2713], CSS) == expected

    def test_css_block_range_is_comma_joined_upper_hex(self):
        block = g.css_block([0x2017, 0x2020, 0x2074], "")
        assert "unicode-range: U+2017, U+2020, U+2074; }" in block
        assert block.endswith("\n")


class SymbolSets(unittest.TestCase):
    def test_sans_is_the_scanned_symbol_list(self):
        assert g.SANS == (
            [0x2017, 0x2020, 0x2021, 0x2070] + list(range(0x2074, 0x207A)) + [
                0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x2195, 0x2197, 0x21C4, 0x21D2, 0x21D4, 0x2213,
                0x2248, 0x2260, 0x2264, 0x2265, 0x22EE, 0x22EF,
                0x25A2, 0x25B2, 0x25B4, 0x25B6, 0x25B8, 0x25BC, 0x25BE, 0x25C0, 0x25C2, 0x25CB, 0x25CF,
                0x266A, 0x2713, 0x2715, 0x2726, 0x2756]
        )

    def test_parts_cover_sans_mono_and_serif(self):
        assert g.PARTS == [("DejaVuSans.ttf", g.SANS),
                           ("DejaVuSansMono.ttf", [0x2315]),
                           ("DejaVuSerif.ttf", [0x2913])]

    def test_union_is_45_code_points_all_above_ascii(self):
        cps = sorted(set(g.SANS) | {0x2315, 0x2913})
        assert len(cps) == 45
        assert all(c > 0x7F for c in cps)


class MainNoArgs(unittest.TestCase):
    def test_no_argv_exits_with_the_usage(self):
        argv = sys.argv
        sys.argv = ["gen-vot-glyphs.py"]
        try:
            with self.assertRaises(SystemExit) as cm:
                g.main()
        finally:
            sys.argv = argv
        assert cm.exception.code == g.__doc__


class LiveIndexHtml(unittest.TestCase):
    def test_faces_reads_the_real_index_html(self):
        # The 6 faces shipped in index.html (2026-11-18); a new font there updates this pin.
        assert g.faces("") == [
            ("Cinzel", "400", "normal"),
            ("Cinzel", "600 700", "normal"),
            ("Cinzel Decorative", "400", "normal"),
            ("Cinzel Decorative", "700", "normal"),
            ("EB Garamond", "400 800", "normal"),
            ("EB Garamond", "400 800", "italic"),
        ]


if __name__ == "__main__":
    unittest.main()
