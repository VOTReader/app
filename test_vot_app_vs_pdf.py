#!/usr/bin/env python3
"""Tests for tools/vot-app-vs-pdf.py (votreader-tests-5 item 8).

The ground-truth audit core on fixtures only: tokenize, TOC detection,
shingles, runs, cover, the app/PDF loaders on tmp dirs, and main() on a
fixture pair. Never the real corpus or the real PDFs. The item FLAG asked
whether either core can run on fixtures: both can, so no escalation.
"""

import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "vot_app_vs_pdf", HERE / "tools" / "vot-app-vs-pdf.py")
vs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vs)


class TestTokenize(unittest.TestCase):
    def test_letters_and_digits_split_and_digits_drop(self):
        # The footnote-superscript case from the module docstring: "love1"
        # must not break the word, and page folios / verse numbers vanish.
        self.assertEqual(vs.tokenize("love1 and 42 peace"),
                         ["love", "and", "peace"])
        self.assertEqual(vs.tokenize("well-known"), ["well", "known"])
        self.assertEqual(vs.tokenize("123 45"), [])
        self.assertEqual(vs.tokenize(""), [])

    def test_uppercase_is_the_callers_job(self):
        # TOKEN is [a-z]+ with no IGNORECASE; app_tokens and
        # pdf_tokens_with_pages lower the text before tokenizing.
        self.assertEqual(vs.tokenize("ABC def"), ["def"])


class TestIsTocPage(unittest.TestCase):
    TOC = "\n".join([
        "Contents", "Volume One", "Let There Be Light", "12", "34 - 56",
        "78", "90", "A Word of Warning",
    ])
    BODY = "\n".join([
        "Thus says The Lord", "To everyone who hears", "Hear the word",
        "of the Lord your God", "For I have spoken", "and it shall be",
        "so says the Lord", "Amen and amen",
    ])

    def test_toc_page_detected(self):
        self.assertTrue(vs.is_toc_page(self.TOC))

    def test_body_page_not_toc(self):
        self.assertFalse(vs.is_toc_page(self.BODY))

    def test_too_few_lines_is_never_toc(self):
        self.assertFalse(vs.is_toc_page("12\n34\n56\n78"))


class TestShingles(unittest.TestCase):
    def test_short_token_list_has_no_shingles(self):
        self.assertEqual(vs.shingles(["a"] * 7), [])

    def test_k_is_eight(self):
        toks = [f"w{i}" for i in range(9)]
        self.assertEqual(vs.shingles(toks), [
            " ".join(toks[0:8]),
            " ".join(toks[1:9]),
        ])


class TestRunsOf(unittest.TestCase):
    def test_consecutive_missing_merge_and_singletons_drop(self):
        toks = [f"w{i}" for i in range(20)]
        anchors = [f"p:{i}" for i in range(20)]
        # 0-2 is one run; 5-6 is one run; 9 alone is shorter than MIN_RUN.
        n, detail = vs.runs_of([0, 1, 2, 5, 6, 9], anchors, toks)
        self.assertEqual(n, 2)
        self.assertEqual(len(detail), 2)
        # Longest run first; approx_words is run length + K.
        self.assertEqual(detail[0]["anchor"], "p:0")
        self.assertEqual(detail[0]["approx_words"], 3 + vs.K - 1)
        self.assertEqual(detail[0]["head"], " ".join(toks[0:8]))
        self.assertEqual(detail[1]["anchor"], "p:5")
        self.assertEqual(detail[1]["approx_words"], 2 + vs.K - 1)

    def test_no_missing_no_runs(self):
        self.assertEqual(vs.runs_of([], [], []), (0, []))


class TestCover(unittest.TestCase):
    WORDS = "alpha beta gamma delta epsilon zeta eta theta iota kappa".split()

    def test_identical_text_covers_fully(self):
        r = vs.cover(self.WORDS, self.WORDS)
        self.assertEqual(r["shingles"], 3)
        self.assertEqual(r["missing"], 0)
        self.assertEqual(r["coverage"], 1.0)
        self.assertEqual(r["runs"], 0)
        self.assertEqual(r["worst"], [])

    def test_one_novel_word_breaks_its_shingles_only(self):
        other = self.WORDS[:5] + ["lambda"] + self.WORDS[6:]
        r = vs.cover(other, self.WORDS)
        # The novel word sits in every 8-shingle that spans it: 3 of 3.
        self.assertEqual(r["missing"], 3)
        self.assertEqual(r["coverage"], 0.0)
        self.assertEqual(r["runs"], 1)

    def test_short_sub_has_no_shingles_so_coverage_is_zero(self):
        r = vs.cover(["a", "b", "c"], self.WORDS)
        self.assertEqual(r["shingles"], 0)
        self.assertEqual(r["coverage"], 0.0)

    def test_cover_is_directional(self):
        sup = self.WORDS + ["lambda"]
        self.assertEqual(vs.cover(self.WORDS, sup)["coverage"], 1.0)
        self.assertEqual(vs.cover(sup, self.WORDS)["coverage"], 0.75)


class TestAppTokens(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = pathlib.Path(self.tmp.name) / "_app-text"
        self.app.mkdir()
        self.addCleanup(self.tmp.cleanup)

    def write_app(self, name, strings, apparatus=None):
        payload = {"strings": strings}
        if apparatus is not None:
            payload["apparatus"] = apparatus
        (self.app / f"{name}.json").write_text(
            json.dumps(payload), encoding="utf-8")

    def test_body_strings_only_apparatus_excluded(self):
        self.write_app("fx", ["Alpha beta", "gamma delta"],
                       apparatus=["apparatus words here"])
        with mock.patch.object(vs, "APP", self.app):
            toks = vs.app_tokens(["fx"])
        self.assertEqual(toks, ["alpha", "beta", "gamma", "delta"])

    def test_markup_directives_stripped(self):
        # The whole directive goes, including the word inside it: the
        # directive is app markup, never printed body text.
        self.write_app("fx", ["Hear {{em:the}} word {{note:x}} now"])
        with mock.patch.object(vs, "APP", self.app):
            self.assertEqual(vs.app_tokens(["fx"]),
                             ["hear", "word", "now"])

    def test_missing_collection_skipped_all_missing_is_none(self):
        with mock.patch.object(vs, "APP", self.app):
            self.assertIsNone(vs.app_tokens(["nope"]))
        self.write_app("fx", ["alpha beta"])
        with mock.patch.object(vs, "APP", self.app):
            self.assertEqual(vs.app_tokens(["nope", "fx"]),
                             ["alpha", "beta"])


class TestPdfTokens(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = pathlib.Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def write_pdf(self, slug, pages):
        d = self.out / slug
        d.mkdir()
        (d / "inventory.json").write_text(
            json.dumps({"pages": [{"page": n} for n in pages]}),
            encoding="utf-8")
        for n, text in pages.items():
            (d / f"page_{n - 1:04d}.txt").write_text(text, encoding="utf-8")

    def test_tokens_and_page_anchors(self):
        self.write_pdf("fxpdf", {1: "Alpha beta gamma",
                                 2: "delta epsilon zeta"})
        with mock.patch.object(vs, "OUT", self.out):
            toks, pages = vs.pdf_tokens_with_pages(["fxpdf"])
        self.assertEqual(toks, ["alpha", "beta", "gamma",
                                "delta", "epsilon", "zeta"])
        self.assertEqual(pages, ["fxpdf:1"] * 3 + ["fxpdf:2"] * 3)

    def test_hyphenated_line_break_joins(self):
        self.write_pdf("fxpdf", {1: "word-\nwrap here"})
        with mock.patch.object(vs, "OUT", self.out):
            toks, _ = vs.pdf_tokens_with_pages(["fxpdf"])
        self.assertEqual(toks, ["wordwrap", "here"])

    def test_missing_inventory_and_missing_page_skipped(self):
        with mock.patch.object(vs, "OUT", self.out):
            self.assertEqual(vs.pdf_tokens_with_pages(["nope"]), ([], []))
        self.write_pdf("fxpdf", {1: "alpha", 2: "beta"})
        (self.out / "fxpdf" / "page_0001.txt").unlink()
        with mock.patch.object(vs, "OUT", self.out):
            toks, pages = vs.pdf_tokens_with_pages(["fxpdf"])
        self.assertEqual(toks, ["alpha"])
        self.assertEqual(pages, ["fxpdf:1"])


class TestMain(unittest.TestCase):
    def test_fixture_pair_compared_both_directions(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            app = root / "_app-text"
            app.mkdir()
            (app / "fx.json").write_text(json.dumps({
                "strings": ["alpha beta gamma delta epsilon zeta "
                            "eta theta iota kappa"]}), encoding="utf-8")
            pdf = root / "fxpdf"
            pdf.mkdir()
            (pdf / "inventory.json").write_text(
                json.dumps({"pages": [{"page": 1}]}), encoding="utf-8")
            (pdf / "page_0000.txt").write_text(
                "alpha beta gamma delta epsilon zeta eta theta "
                "iota kappa lambda", encoding="utf-8")
            # main() reconfigures stdout, which io.StringIO lacks, so
            # capture through a real TextIOWrapper instead.
            buf = io.BytesIO()
            out = io.TextIOWrapper(buf, encoding="utf-8",
                                     write_through=True)
            with mock.patch.object(vs, "APP", app), \
                    mock.patch.object(vs, "OUT", root), \
                    mock.patch.object(vs, "PAIRS",
                                      [("Fixture", ["fx"], ["fxpdf"])]), \
                    contextlib.redirect_stdout(out):
                rc = vs.main()
            text = buf.getvalue().decode("utf-8")
            self.assertEqual(rc, 0)
            report = json.loads(
                (root / "APP-VS-PDF.json").read_text(encoding="utf-8"))
            self.assertEqual(len(report), 1)
            self.assertEqual(report[0]["collection"], "Fixture")
            self.assertEqual(report[0]["app_to_pdf"]["coverage"], 1.0)
            self.assertEqual(report[0]["pdf_to_app"]["coverage"], 0.75)
            self.assertEqual(report[0]["app_to_pdf"]["runs"], 0)
            self.assertEqual(report[0]["pdf_to_app"]["runs"], 0)
            self.assertIn("Fixture", text)


if __name__ == "__main__":
    unittest.main()
