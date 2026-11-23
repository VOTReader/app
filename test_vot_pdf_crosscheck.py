#!/usr/bin/env python3
"""Tests for tools/vot-pdf-crosscheck.py (votreader-tests-5 item 9).

Leg 1b: the same words typeset three ways — shingle coverage between
editions, on fixture page files + inventory.json only. OUT is rebound
to a tmp dir for every test; no real _ocr_out corpus is read.
"""

import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "vot_pdf_crosscheck", HERE / "tools" / "vot-pdf-crosscheck.py")
xc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(xc)

TOKENS_A = "alpha beta gamma delta epsilon zeta eta theta".split()
TOKENS_B = "iota kappa lambda mu nu xi omicron pi".split()
TOC_TEXT = ("Contents\nThe First Letter\n226\n"
            "The Second Letter\n222-225\nThe Third Letter")


def write_book(out, slug, pages):
    """pages: list of (page_number, text). Writes page files + inventory."""
    book = out / slug
    book.mkdir(parents=True, exist_ok=True)
    for n, text in pages:
        (book / f"page_{n - 1:04d}.txt").write_text(text, encoding="utf-8")
    (book / "inventory.json").write_text(json.dumps({
        "pages": [{"page": n} for n, _ in pages]}), encoding="utf-8")
    return book


class CrosscheckCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = pathlib.Path(self.tmp.name) / "vot"
        self.out.mkdir()
        self._patch_out = mock.patch.object(xc, "OUT", self.out)
        self._patch_out.start()
        self.addCleanup(self._patch_out.stop)


class TestIsTocPage(CrosscheckCase):
    def test_contents_page_with_locators(self):
        # 6 lines, 2 locators ("226", "222-225") -> 2/6 >= 0.33.
        self.assertTrue(xc.is_toc_page(TOC_TEXT))

    def test_en_dash_range_counts_as_locator(self):
        text = "Contents\nA\n222\u2013225\nB\n226\nC"
        self.assertTrue(xc.is_toc_page(text))

    def test_fewer_than_six_lines_is_never_toc(self):
        self.assertFalse(xc.is_toc_page("Contents\n226\n227"))

    def test_one_locator_in_six_lines_is_not_toc(self):
        self.assertFalse(xc.is_toc_page("Contents\nA\n226\nB\nC\nD"))

    def test_no_locators_is_not_toc(self):
        self.assertFalse(xc.is_toc_page("One\nTwo\nThree\nFour\nFive\nSix"))


class TestShingles(CrosscheckCase):
    def test_fewer_than_k_tokens_is_no_shingles(self):
        self.assertEqual(xc.shingles(["a"] * 7), [])

    def test_exactly_k_tokens_is_one_shingle(self):
        self.assertEqual(xc.shingles(list("abcdefgh")),
                         ["a b c d e f g h"])

    def test_k_plus_one_tokens_is_two_shingles(self):
        self.assertEqual(xc.shingles(list("abcdefghi")),
                         ["a b c d e f g h", "b c d e f g h i"])


class TestTokensWithPages(CrosscheckCase):
    def setUp(self):
        super().setUp()
        write_book(self.out, "bk", [
            (1, "Alpha beta\ngamma delta"),
            (2, "epsilon zeta\neta theta"),
        ])

    def test_tokens_lowercased_in_page_order(self):
        toks, pages, toc = xc.tokens_with_pages("bk")
        self.assertEqual(toks, ["alpha", "beta", "gamma", "delta",
                                "epsilon", "zeta", "eta", "theta"])
        self.assertEqual(pages, [1, 1, 1, 1, 2, 2, 2, 2])
        self.assertEqual(toc, [])

    def test_line_break_hyphen_is_rejoined(self):
        write_book(self.out, "hy", [(1, "A well-\nknown fact")])
        toks, _, _ = xc.tokens_with_pages("hy")
        self.assertEqual(toks, ["a", "wellknown", "fact"])

    def test_toc_page_skipped_by_default(self):
        write_book(self.out, "toc", [
            (1, " ".join(TOKENS_A)),
            (2, TOC_TEXT),
        ])
        toks, pages, toc = xc.tokens_with_pages("toc")
        self.assertEqual(toc, [2])
        self.assertEqual(pages, [1] * 8)
        self.assertNotIn("226", toks)

    def test_toc_page_included_when_skip_is_off(self):
        write_book(self.out, "toc", [
            (1, "Alpha beta"),
            (2, TOC_TEXT),
        ])
        toks, _, toc = xc.tokens_with_pages("toc", skip_toc=False)
        self.assertEqual(toc, [2])
        self.assertIn("226", toks)

    def test_missing_inventory_raises(self):
        with self.assertRaises(FileNotFoundError):
            xc.tokens_with_pages("nosuchbook")


class TestCheck(CrosscheckCase):
    def setUp(self):
        super().setUp()
        write_book(self.out, "sub", [
            (1, " ".join(TOKENS_A)),
            (2, " ".join(TOKENS_B)),
        ])

    def _sup(self, tokens):
        write_book(self.out, "sup", [(1, " ".join(tokens))])

    def test_identical_editions_cover_fully(self):
        self._sup(TOKENS_A + TOKENS_B)
        r = xc.check("sub", "sup", {})
        self.assertEqual(r["coverage"], 1.0)
        self.assertEqual(r["missing_shingles"], 0)
        self.assertEqual(r["interior_coverage"], 1.0)
        self.assertEqual(r["divergence_runs"], 0)
        self.assertEqual(r["worst"], [])

    def test_missing_second_half(self):
        # 16 subset tokens -> 9 shingles; only the first survives.
        # Missing shingles 1..8 form one run; 7 straddle the page break.
        self._sup(TOKENS_A)
        r = xc.check("sub", "sup", {})
        self.assertEqual(r["shingles"], 9)
        self.assertEqual(r["missing_shingles"], 8)
        self.assertEqual(r["coverage"], 0.111111)
        self.assertEqual(r["page_straddling_misses"], 7)
        self.assertEqual(r["interior_missing"], 1)
        self.assertEqual(r["interior_coverage"], 0.5)
        self.assertEqual(r["divergence_runs"], 1)
        self.assertEqual(r["worst"], [{
            "sub_page": 1,
            "shingles_missing": 8,
            "approx_words": 15,
            "excerpt_head": "beta gamma delta epsilon zeta eta theta iota",
        }])

    def test_subset_shorter_than_k_has_no_shingles(self):
        write_book(self.out, "tiny", [(1, "one two three")])
        self._sup(TOKENS_A + TOKENS_B)
        r = xc.check("tiny", "sup", {})
        self.assertEqual(r["shingles"], 0)
        self.assertEqual(r["coverage"], 0.0)
        self.assertEqual(r["divergence_runs"], 0)

    def test_toc_pages_excluded_from_subset(self):
        write_book(self.out, "subtoc", [
            (1, " ".join(TOKENS_A)),
            (2, TOC_TEXT),
        ])
        self._sup(TOKENS_A)
        r = xc.check("subtoc", "sup", {})
        self.assertEqual(r["toc_pages_excluded"], [2])
        self.assertEqual(r["subset_tokens"], 8)
        self.assertEqual(r["coverage"], 1.0)


class TestMain(CrosscheckCase):
    def test_one_real_pair_runs_and_writes_json(self):
        write_book(self.out, "letters-vol1", [
            (1, " ".join(TOKENS_A)), (2, " ".join(TOKENS_B))])
        write_book(self.out, "letters-vol1_7", [
            (1, " ".join(TOKENS_A)), (2, " ".join(TOKENS_B))])
        self.assertEqual(xc.main(), 0)
        data = json.loads(
            (self.out / "CROSSCHECK.json").read_text(encoding="utf-8"))
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["subset"], "letters-vol1")
        self.assertEqual(data[0]["coverage"], 1.0)

    def test_no_pairs_extracted_writes_empty_list(self):
        self.assertEqual(xc.main(), 0)
        data = json.loads(
            (self.out / "CROSSCHECK.json").read_text(encoding="utf-8"))
        self.assertEqual(data, [])


if __name__ == "__main__":
    unittest.main()
