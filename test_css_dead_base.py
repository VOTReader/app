"""tools/css-dead-base.py: base CSS declarations a later rule always overrides."""
import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest

_spec = importlib.util.spec_from_file_location(
    "css_dead_base", os.path.join(os.path.dirname(__file__), "tools", "css-dead-base.py"))
d = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(d)


def blocks(text):
    return list(d.scan_blocks(text, 0, len(text)))


class ScanBlocks(unittest.TestCase):
    def test_two_rules_yield_two_blocks(self):
        text = ".a { color: red; } .b { margin: 0; }"
        bs = blocks(text)
        assert len(bs) == 2
        assert text[bs[0][0]:bs[0][1]].strip() == ".a"
        assert text[bs[1][0]:bs[1][1]].strip() == ".b"
        assert text[bs[0][2]:bs[0][3]] == " color: red; "
        assert text[bs[1][2]:bs[1][3]] == " margin: 0; "

    def test_comment_braces_ignored(self):
        # The raw prelude slice still carries the comment (main() strips it);
        # what matters is the braces inside it do not split the block.
        text = "/* { } */ .a { color: red; }"
        bs = blocks(text)
        assert len(bs) == 1
        assert text[bs[0][2]:bs[0][3]] == " color: red; "

    def test_string_braces_ignored(self):
        text = '.a { content: "{"; color: red; }'
        bs = blocks(text)
        assert len(bs) == 1
        assert "color: red" in text[bs[0][2]:bs[0][3]]

    def test_single_quote_string_braces_ignored(self):
        text = ".a { content: '{'; color: red; }"
        assert len(blocks(text)) == 1

    def test_nested_media_yields_only_the_at_rule_block(self):
        text = "@media (min-width: 1px) { .a { color: red; } }"
        bs = blocks(text)
        assert len(bs) == 1
        assert text[bs[0][0]:bs[0][1]].strip() == "@media (min-width: 1px)"

    def test_import_statement_resets_the_prelude(self):
        text = '@import "x.css"; .a { color: red; }'
        bs = blocks(text)
        assert len(bs) == 1
        assert text[bs[0][0]:bs[0][1]].strip() == ".a"


class SplitDecls(unittest.TestCase):
    def _decls(self, body):
        return d.split_decls(body, 0, len(body))

    def test_semicolon_inside_parens_is_not_a_split(self):
        decls = self._decls("background: url(data:image/png;base64,AAA); color: red;")
        assert [p for _s, _e, p, _i in decls] == ["background", "color"]

    def test_semicolon_inside_a_string_is_not_a_split(self):
        decls = self._decls('content: ";"; color: red;')
        assert [p for _s, _e, p, _i in decls] == ["content", "color"]

    def test_prop_is_lowercased(self):
        decls = self._decls("COLOR: red; Margin: 0;")
        assert [p for _s, _e, p, _i in decls] == ["color", "margin"]

    def test_important_variants(self):
        decls = self._decls(
            "color: red !important; margin: 0 ! important; padding: 0 !IMPORTANT; border: 0;")
        assert [i for _s, _e, _p, i in decls] == [True, True, True, False]

    def test_span_starts_at_first_non_space_non_comment_char(self):
        body = "/* c */ color: red; margin: 0;"
        decls = self._decls(body)
        assert body[decls[0][0]:decls[0][1]] == "color: red;"
        assert body[decls[1][0]:decls[1][1]] == "margin: 0;"

    def test_no_colon_and_empty_decls_skipped(self):
        decls = self._decls("color: red; junk; ; margin: 0;")
        assert [p for _s, _e, p, _i in decls] == ["color", "margin"]

    def test_trailing_decl_without_semicolon_counts(self):
        decls = self._decls("color: red")
        assert len(decls) == 1
        assert decls[0][2] == "color"


class NewerFeatures(unittest.TestCase):
    def test_viewport_units(self):
        # The real shape is digit-prefixed (100dvh): it must match, or the
        # fallback-pair guard never fires for viewport units (flag 3).
        assert d.newer_features("height: dvh") == {"dvh"}
        assert d.newer_features("height: 100dvh") == {"dvh"}
        assert d.newer_features("width: 100svw") == {"svw"}
        assert d.newer_features("height: 100DVH") == {"dvh"}
        assert d.newer_features("height: calc(100dvh - 4px)") == {"dvh"}
        # A unit name inside a longer word or custom property is not a unit.
        assert d.newer_features("height: var(--x-dvh)") == set()
        assert d.newer_features("grid-area: advh") == set()

    def test_functions(self):
        assert d.newer_features("color: color-mix(in srgb, red 50%, blue)") == {"color-mix("}
        assert d.newer_features("width: clamp(1px, 2vw, 3px)") == {"clamp("}
        assert d.newer_features("width: min(100%, 20rem)") == {"min("}
        assert d.newer_features("width: env(safe-area-inset-top)") == {"env("}

    def test_plain_values_have_no_newer_features(self):
        assert d.newer_features("margin: 0") == set()
        assert d.newer_features("font-size: 1rem") == set()
        assert d.newer_features("height: 10px") == set()

    def test_no_colon_means_no_value(self):
        assert d.newer_features("nocolon") == set()

    def test_has_pseudo(self):
        assert d.newer_features("color: red:has(x)") == {":has("}


class Selectors(unittest.TestCase):
    def test_norm_sel_collapses_whitespace_and_tightens_combinators(self):
        assert d.norm_sel("  .a   .b  ") == ".a .b"
        assert d.norm_sel(".a  >  .b + .c ~ .d") == ".a>.b+.c~.d"
        assert d.norm_sel(".a /* x */ .b") == ".a .b"

    def test_split_selectors_keeps_commas_inside_parens_and_brackets(self):
        assert d.split_selectors('.a, .b:not(.c, .d), [data-x="a,b"]') == [
            ".a", ".b:not(.c, .d)", '[data-x="a,b"]']

    def test_split_selectors_drops_empty_parts(self):
        assert d.split_selectors(".a,, .b ,") == [".a", ".b"]


class MainEndToEnd(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._css = os.path.join(self._tmp.name, "test.css")
        self._argv = sys.argv

    def tearDown(self):
        sys.argv = self._argv
        self._tmp.cleanup()

    def _run(self, text, *extra):
        with open(self._css, "w", encoding="utf-8") as f:
            f.write(text)
        sys.argv = ["css-dead-base.py", "--css", self._css, *extra]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = d.main()
        with open(self._css, encoding="utf-8") as f:
            after = f.read()
        return code, buf.getvalue(), after

    def test_dead_decl_count_and_bytes(self):
        code, out, _after = self._run(".a { color: red; margin: 0; } .a { color: blue; }")
        assert code == 0
        assert "[css-dead-base] 1 overridden declarations, 11 bytes in " in out

    def test_list_prints_line_numbers(self):
        code, out, _after = self._run(
            ".a {\n  color: red;\n}\n.a {\n  color: blue;\n}\n", "--list")
        assert code == 0
        assert "2: color: red;   <- 5" in out

    def test_write_removes_decl_and_whole_rule_keeps_comment_and_is_idempotent(self):
        text = "/* keep me */\n.a { color: red; }\n.a { color: blue; margin: 0; }\n"
        code, out, after = self._run(text, "--write")
        assert code == 0
        assert "keep me" in after
        assert "color: red" not in after
        assert ".a { color: blue; margin: 0; }" in after
        assert "1 rules removed whole" in out
        code2, out2, _after2 = self._run(after)
        assert code2 == 0
        assert "0 overridden declarations" in out2

    def test_write_with_no_dead_leaves_the_file_alone(self):
        text = ".a { color: red; }\n.b { color: blue; }\n"
        code, out, after = self._run(text, "--write")
        assert code == 0
        assert after == text
        assert "0 overridden declarations" in out

    def test_important_kept_unless_later_is_important_too(self):
        _code, out, _after = self._run(
            ".a { color: red !important; } .a { color: blue; }")
        assert "0 overridden declarations" in out
        _code, out, _after = self._run(
            ".a { color: red !important; } .a { color: blue !important; }")
        assert "1 overridden declarations" in out

    def test_at_rule_rules_neither_remove_nor_override(self):
        _code, out, _after = self._run(
            ".a { color: red; } @media (min-width: 1px) { .a { color: blue; } }")
        assert "0 overridden declarations" in out

    def test_border_does_not_kill_border_color(self):
        _code, out, _after = self._run(
            ".a { border-color: red; } .a { border: 1px solid blue; }")
        assert "0 overridden declarations" in out
        _code, out, _after = self._run(
            ".a { border: 1px solid red; } .a { border-color: blue; }")
        assert "0 overridden declarations" in out

    def test_fallback_pair_keeps_the_earlier_decl(self):
        _code, out, _after = self._run(
            ".a { width: 100px; } .a { width: clamp(1px, 2vw, 3px); }")
        assert "0 overridden declarations" in out

    def test_fallback_pair_keeps_a_vh_decl_before_a_dvh_one(self):
        _code, out, _after = self._run(
            ".a { height: 100vh; } .a { height: 100dvh; }")
        assert "0 overridden declarations" in out

    def test_plain_later_value_kills_a_clamp_earlier_decl(self):
        _code, out, _after = self._run(
            ".a { width: clamp(1px, 2vw, 3px); } .a { width: 100px; }")
        assert "1 overridden declarations" in out

    def test_multi_selector_rule_dead_only_if_every_selector_overridden(self):
        _code, out, _after = self._run(
            ".a, .b { color: red; } .a { color: blue; }")
        assert "0 overridden declarations" in out
        _code, out, _after = self._run(
            ".a, .b { color: red; } .a { color: blue; } .b { color: green; }")
        assert "1 overridden declarations" in out

    def test_whitespace_variant_selectors_match(self):
        _code, out, _after = self._run(
            ".a  >  .b { color: red; } .a>.b { color: blue; }")
        assert "1 overridden declarations" in out

    def test_runs_on_the_real_app_css(self):
        real = os.path.join(os.path.dirname(__file__),
                            "app", "src", "main", "assets", "app.css")
        sys.argv = ["css-dead-base.py", "--css", real]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = d.main()
        assert code == 0
        assert "[css-dead-base]" in buf.getvalue()


if __name__ == "__main__":
    unittest.main()
