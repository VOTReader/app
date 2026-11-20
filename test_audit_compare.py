"""Unit tests for tools/_audit-compare.py — the HTML<->app audit differ.

The script is a one-shot differ: at top level it loads two JSON files from
hardcoded paths under D:\\VOTReader-studio\\tools and dispatches on
sys.argv[1] (titles / headcov / headers / body / fn / related). The pure
core is key() (normalise a title to alphanumerics) and find() (exact key
match, then a loose containment match for trailing-drift titles).

Stdlib unittest + exec only. The script is loaded by reading its source,
rewriting the two hardcoded input paths to temp fixture JSON files, and
exec'ing it in a fresh namespace with sys.argv set to the mode under test,
so no real _audit-html.json / _audit-app.json is read and nothing is
written. key() / find() are exercised both directly and through the modes.
An unknown mode prints nothing — pinned as current behaviour, not fixed.
One finding the tests pin: a headcov header line that spans two app fields
does not match, despite the script's comment saying it does — key()
strips the spaces, so the joined header holds neither line's keyed text
whole. The script's top-level json.load(open(...)) calls also leave their
files unclosed; the exec filters that ResourceWarning (the leak is the
script's, not the test's).

Run:  python -m unittest test_audit_compare -v   (from repo root)
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = Path(_HERE, "tools", "_audit-compare.py").read_text(encoding="utf-8")

_HTML_TOKEN = r'''r"D:\VOTReader-studio\tools\_audit-html.json"'''
_APP_TOKEN = r'''r"D:\VOTReader-studio\tools\_audit-app.json"'''


def _rec(title, **kw):
    # App records carry header fields the differ reads by key; defaults
    # match an app record with an empty header / no body.
    r = {"title": title, "headerLines": [], "bodyWords": 100,
         "fnCount": 0, "relatedTopics": [],
         "date": "", "from": "", "spoken": "", "forLine": "",
         "noteLine": "", "metaAddendum": "", "sectionIntroText": "",
         "bodyText": ""}
    r.update(kw)
    return r


class _CompareCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def run_mode(self, html_data, app_data, mode):
        """Exec the script against fixture data; return (ns, stdout)."""
        hp = self.root / "html.json"
        ap = self.root / "app.json"
        hp.write_text(json.dumps(html_data), encoding="utf-8")
        ap.write_text(json.dumps(app_data), encoding="utf-8")
        src = _SRC.replace(_HTML_TOKEN, repr(str(hp)))
        src = src.replace(_APP_TOKEN, repr(str(ap)))
        ns = {"__name__": "audit_compare"}
        old_argv = sys.argv
        buf = io.StringIO()
        try:
            sys.argv = ["_audit-compare.py", mode]
            with contextlib.redirect_stdout(buf), warnings.catch_warnings():
                # The script reads its inputs with bare json.load(open(...)),
                # which leaves the files unclosed; silence that warning for
                # the exec — the leak is the script's, not the test's.
                warnings.simplefilter("ignore", ResourceWarning)
                exec(compile(src, "_audit-compare.py", "exec"), ns)
        finally:
            sys.argv = old_argv
        return ns, buf.getvalue()

    def ns(self):
        return self.run_mode({"Volume One": []}, {}, "titles")[0]


class KeyFindTest(_CompareCase):
    def test_key_normalises(self):
        key = self.ns()["key"]
        self.assertEqual(key("Hello, World!"), "helloworld")
        self.assertEqual(key("A Parable — Given to Timothy…"), "aparablegiventotimothy")
        self.assertEqual(key(None), "")
        self.assertEqual(key(""), "")

    def test_find_exact_and_case_insensitive(self):
        find = self.ns()["find"]
        arr = [_rec("The Word Spoken"), _rec("Another Letter")]
        self.assertEqual(find(arr, "THE WORD SPOKEN!")["title"], "The Word Spoken")
        self.assertEqual(find(arr, "another letter")["title"], "Another Letter")

    def test_find_loose_containment(self):
        # Trailing "... Says The Lord" drift: containment either way, < 12 apart.
        find = self.ns()["find"]
        arr = [_rec("A Word")]
        self.assertEqual(find(arr, "A Word Says The Lord")["title"], "A Word")

    def test_find_loose_rejects_far_apart(self):
        find = self.ns()["find"]
        arr = [_rec("A Word")]
        # Lengths 5 vs 26 differ by 21, over the 12 limit.
        self.assertIsNone(find(arr, "A Word Says The Lord To All Men"))

    def test_find_returns_none(self):
        find = self.ns()["find"]
        self.assertIsNone(find([_rec("Something Else")], "No Such Letter"))
        self.assertIsNone(find([], "Anything"))


class TitlesModeTest(_CompareCase):
    def test_lists_only_each_side(self):
        html = {"Volume One": [_rec("Alpha"), _rec("The Word, Spoken"),
                                _rec("Only In Html")]}
        app = {"Volume One": [_rec("Alpha"), _rec("The Word Spoken"),
                               _rec("Only In App")]}
        _, out = self.run_mode(html, app, "titles")
        self.assertIn("IN HTML, NOT APP:", out)
        self.assertIn("Only In Html", out)
        self.assertIn("IN APP, NOT HTML:", out)
        self.assertIn("Only In App", out)
        self.assertNotIn("Alpha", out.split("===")[1])
        self.assertIn("HTML 3 / app 3", out)

    def test_all_matched(self):
        html = {"Volume One": [_rec("Alpha")]}
        app = {"Volume One": [_rec("Alpha")]}
        _, out = self.run_mode(html, app, "titles")
        self.assertIn("all titles matched.", out)

    def test_missing_collection_counts_as_empty(self):
        html = {"Volume One": [_rec("Alpha")]}
        _, out = self.run_mode(html, {}, "titles")
        self.assertIn("HTML 1 / app 0", out)
        self.assertIn("IN HTML, NOT APP:", out)
        self.assertIn("    - Alpha", out)


class HeadcovModeTest(_CompareCase):
    def _one(self, header_lines, app_fields):
        html = {"Volume One": [_rec("Alpha", headerLines=header_lines)]}
        app = {"Volume One": [_rec("Alpha", **app_fields)]}
        return self.run_mode(html, app, "headcov")

    def test_missing_line_reported(self):
        # A header line that spans two app fields does not match: key()
        # strips the spaces, so the joined header "7/23/11 YahuShua" keys
        # to "72311yahushua", which holds neither line's keyed text whole.
        # (The script's own comment says such a merged line "still
        # matches" — it does not, when the fields are separate.)
        _, out = self._one(
            ["7/23/11 A Parable Given to Timothy", "From YahuShua"],
            {"date": "7/23/11", "from": "YahuShua"})
        self.assertIn("2 header lines checked, 2 missing", out)
        self.assertIn("missing: '7/23/11 A Parable Given to Timothy'", out)
        self.assertIn("missing: 'From YahuShua'", out)

    def test_covered_line_not_reported(self):
        # A header line matches only when its keyed text is a substring of
        # the keyed joined header; a line spanning two fields does not.
        _, out = self._one(
            ["A Parable Given to Timothy"],
            {"forLine": "A Parable Given to Timothy"})
        self.assertIn("1 header lines checked, 0 missing", out)

    def test_an_addendum_spelling_matches(self):
        # "An addendum to X" (site wording) matches the app's "Addendum to X".
        _, out = self._one(
            ["An addendum to Repentance"],
            {"metaAddendum": "Repentance"})
        self.assertIn("1 header lines checked, 0 missing", out)

    def test_long_line_falls_back_to_body(self):
        # A >200-char prose line is accepted from bodyText, not the header.
        prose = "A very long opening paragraph " + "word " * 45
        self.assertGreater(len(prose), 200)
        _, out = self._one([prose], {"bodyText": prose})
        self.assertIn("1 header lines checked, 0 missing", out)

    def test_long_line_missing_from_body_is_reported(self):
        prose = "A very long opening paragraph " + "word " * 45
        _, out = self._one([prose], {"bodyText": "something else entirely"})
        self.assertIn("1 header lines checked, 1 missing", out)

    def test_leading_date_recomposed(self):
        # Header line carries the date glued to the text; the app holds the
        # date and the text in separate fields.
        _, out = self._one(
            ["2026A Parable Given"],
            {"date": "2026", "forLine": "A Parable Given"})
        self.assertIn("1 header lines checked, 0 missing", out)

    def test_unmatched_title_skipped(self):
        html = {"Volume One": [_rec("Ghost", headerLines=["From YahuShua"])]}
        app = {"Volume One": [_rec("Alpha", **{"from": "YahuShua"})]}
        _, out = self.run_mode(html, app, "headcov")
        self.assertIn("0 header lines checked, 0 missing", out)


class HeadersModeTest(_CompareCase):
    def _one(self, header_lines, app_fields):
        html = {"Volume One": [_rec("Alpha", headerLines=header_lines)]}
        app = {"Volume One": [_rec("Alpha", **app_fields)]}
        return self.run_mode(html, app, "headers")

    def test_occasion_mismatch(self):
        _, out = self._one(
            ["(Regarding suicide)", "7/23/11"],
            {"date": "7/23/11", "noteLine": "(Regarding fear)"})
        self.assertIn("occasion: HTML '(Regarding suicide)'", out)
        self.assertIn("vs app '(Regarding fear)'", out)

    def test_occasion_match_silent(self):
        _, out = self._one(
            ["(Regarding suicide)"],
            {"noteLine": "(Regarding suicide)"})
        self.assertNotIn("occasion:", out)

    def test_blank_app_header(self):
        _, out = self._one(
            ["7/23/11", "From YahuShua"],
            {"date": "", "from": "", "forLine": "", "noteLine": ""})
        self.assertIn("BLANK app header", out)

    def test_date_missing_in_app(self):
        _, out = self._one(
            ["7/23/11 A Parable"],
            {"date": "", "noteLine": ""})
        self.assertIn("date missing in app (HTML 7/23/11)", out)

    def test_date_present_silent(self):
        _, out = self._one(["7/23/11 A Parable"], {"date": "7/23/11"})
        self.assertNotIn("date missing", out)


class BodyFnRelatedModeTest(_CompareCase):
    def test_body_ratio_flags_both_directions(self):
        html = {"Volume One": [_rec("Thin", bodyWords=100),
                                _rec("Fat", bodyWords=100),
                                _rec("Fine", bodyWords=100)]}
        app = {"Volume One": [_rec("Thin", bodyWords=50),
                               _rec("Fat", bodyWords=150),
                               _rec("Fine", bodyWords=100)]}
        _, out = self.run_mode(html, app, "body")
        self.assertIn("Thin", out)
        self.assertIn("50%", out)
        self.assertIn("Fat", out)
        self.assertIn("150%", out)
        self.assertNotIn("Fine", out)

    def test_body_skips_short_html(self):
        html = {"Volume One": [_rec("Short", bodyWords=10)]}
        app = {"Volume One": [_rec("Short", bodyWords=100)]}
        _, out = self.run_mode(html, app, "body")
        self.assertNotIn("Short", out)

    def test_fn_count_mismatch(self):
        html = {"Volume One": [_rec("Alpha", fnCount=3), _rec("Beta", fnCount=2)]}
        app = {"Volume One": [_rec("Alpha", fnCount=1), _rec("Beta", fnCount=2)]}
        _, out = self.run_mode(html, app, "fn")
        self.assertIn("Alpha", out)
        self.assertIn("HTML=3 app=1", out)
        self.assertNotIn("Beta", out)

    def test_related_count_mismatch(self):
        html = {"Volume One": [_rec("Alpha", relatedTopics=["a", "b"])]}
        app = {"Volume One": [_rec("Alpha", relatedTopics=["a"])]}
        _, out = self.run_mode(html, app, "related")
        self.assertIn("Alpha", out)
        self.assertIn("HTML=2 app=1", out)

    def test_unknown_mode_prints_nothing(self):
        _, out = self.run_mode({"Volume One": [_rec("Alpha")]},
                                {"Volume One": [_rec("Alpha")]}, "bogus")
        self.assertEqual(out, "")


if __name__ == "__main__":
    unittest.main()
