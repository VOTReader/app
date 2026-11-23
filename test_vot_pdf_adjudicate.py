#!/usr/bin/env python3
"""Tests for tools/vot-pdf-adjudicate.py (votreader-tests-5 item 9).

Leg 3: the vision sample adjudicated against the extracted text layer,
on fixture page files + inventory.json only. Never the real _ocr_out
corpus: OUT and SAMPLE are rebound to a tmp dir for every test.
"""

import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "vot_pdf_adjudicate", HERE / "tools" / "vot-pdf-adjudicate.py")
adj = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(adj)

PAGE1_LINES = [
    "The First Letter",
    "In the beginning God created the heaven",
    "and the earth was without form",
    "and the Spirit moved upon the waters",
    "Thus saith the Lord",
    "And the evening and the morning were the first day",
]
PAGE2_LINES = [
    "The Second Letter",
    "Hearken unto Me",
    "Thus saith the Lord God",
]


def write_book(out, slug="vol1"):
    book = out / slug
    book.mkdir(parents=True, exist_ok=True)
    (book / "page_0000.txt").write_text("\n".join(PAGE1_LINES) + "\n",
                                         encoding="utf-8")
    (book / "page_0001.txt").write_text("\n".join(PAGE2_LINES) + "\n",
                                         encoding="utf-8")
    (book / "inventory.json").write_text(json.dumps({
        "pages": [{"page": 1, "folio": "1"}, {"page": 2, "folio": "2"}],
    }), encoding="utf-8")
    return book


def rec(page=1, first="The First Letter", last="Thus saith the Lord",
        count=7, extras=None):
    return {"book": "vol1", "page": page, "first_line": first,
            "last_line": last, "line_count": count,
            "extras": extras if extras is not None else []}


class AdjudicateCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = pathlib.Path(self.tmp.name) / "vot"
        self.out.mkdir()
        self._patch_out = mock.patch.object(adj, "OUT", self.out)
        self._patch_out.start()
        self.addCleanup(self._patch_out.stop)
        self._patch_sample = mock.patch.object(
            adj, "SAMPLE", self.out / "_vision-sample")
        self._patch_sample.start()
        self.addCleanup(self._patch_sample.stop)
        adj._FOLIO_CACHE.clear()
        self.addCleanup(adj._FOLIO_CACHE.clear)
        write_book(self.out)


class TestToks(AdjudicateCase):
    def test_lowercases_and_splits_on_non_alphanumerics(self):
        self.assertEqual(adj.toks("Hello, World! 123"),
                         ["hello", "world", "123"])

    def test_empty_and_none_are_no_tokens(self):
        self.assertEqual(adj.toks(""), [])
        self.assertEqual(adj.toks(None), [])


class TestContained(AdjudicateCase):
    HAY = ["the", "quick", "brown", "fox"]

    def test_needle_in_order(self):
        self.assertTrue(adj.contained("quick brown", self.HAY))

    def test_needle_out_of_order_is_not_contained(self):
        self.assertFalse(adj.contained("brown quick", self.HAY))

    def test_empty_needle_is_vacuously_contained(self):
        self.assertTrue(adj.contained("", self.HAY))

    def test_needle_normalised_like_the_page(self):
        self.assertTrue(adj.contained("Quick, Brown!", self.HAY))
        self.assertFalse(adj.contained("quick fox brown", self.HAY))


class TestPageLines(AdjudicateCase):
    def test_strips_lines_and_drops_blanks(self):
        self.assertEqual(adj.page_lines("vol1", 1), PAGE1_LINES)

    def test_missing_page_file_is_none(self):
        self.assertIsNone(adj.page_lines("vol1", 9))
        self.assertIsNone(adj.page_lines("nosuchbook", 1))


class TestFolios(AdjudicateCase):
    def test_maps_page_to_folio(self):
        self.assertEqual(adj.folios("vol1"), {1: "1", 2: "2"})

    def test_missing_inventory_is_empty(self):
        self.assertEqual(adj.folios("nosuchbook"), {})

    def test_cache_holds_until_cleared(self):
        self.assertEqual(adj.folios("vol1")[1], "1")
        inv = self.out / "vol1" / "inventory.json"
        inv.write_text(json.dumps(
            {"pages": [{"page": 1, "folio": "9"}, {"page": 2, "folio": "2"}]}),
            encoding="utf-8")
        self.assertEqual(adj.folios("vol1")[1], "1")
        adj._FOLIO_CACHE.clear()
        self.assertEqual(adj.folios("vol1")[1], "9")


class TestJudge(AdjudicateCase):
    def test_agree_when_all_four_match(self):
        r = adj.judge(rec())
        self.assertEqual(r["verdict"], "AGREE")
        self.assertTrue(r["first_line_ok"])
        self.assertTrue(r["last_line_ok"])
        self.assertFalse(r["last_line_was_folio"])
        self.assertEqual(r["line_count_vision"], 7)
        self.assertEqual(r["line_count_expected"], 7)
        self.assertTrue(r["line_count_ok"])
        self.assertEqual(r["folio"], "1")
        self.assertIsNone(r["misaligned_with_page"])
        self.assertEqual(r["missing_extras"], [])

    def test_last_line_may_be_the_folio(self):
        r = adj.judge(rec(last="1"))
        self.assertTrue(r["last_line_was_folio"])
        self.assertTrue(r["last_line_ok"])
        self.assertEqual(r["verdict"], "AGREE")

    def test_first_line_wrong(self):
        r = adj.judge(rec(first="A Different Opening"))
        self.assertFalse(r["first_line_ok"])
        self.assertEqual(r["verdict"], "DISAGREE")

    def test_last_line_wrong(self):
        r = adj.judge(rec(last="Not On This Page At All"))
        self.assertFalse(r["last_line_ok"])
        self.assertEqual(r["verdict"], "DISAGREE")

    def test_last_line_must_be_in_the_tail_window(self):
        # "The First Letter" is line 1; the tail window is the last four lines.
        r = adj.judge(rec(last="The First Letter"))
        self.assertFalse(r["last_line_ok"])
        self.assertEqual(r["verdict"], "DISAGREE")

    def test_first_line_must_be_in_the_head_window(self):
        # Line 4 is inside the head window; line 6 is not.
        self.assertTrue(adj.judge(
            rec(first="and the Spirit moved upon the waters"))["first_line_ok"])
        self.assertFalse(adj.judge(
            rec(first="And the evening and the morning were the first day"))
            ["first_line_ok"])

    def test_line_count_at_the_tolerance_edge(self):
        # Expected 7; tolerance is max(2, 7 * 0.20) = 2, inclusive.
        self.assertTrue(adj.judge(rec(count=9))["line_count_ok"])
        self.assertFalse(adj.judge(rec(count=10))["line_count_ok"])

    def test_line_count_far_off_disagrees(self):
        r = adj.judge(rec(count=1))
        self.assertFalse(r["line_count_ok"])
        self.assertEqual(r["verdict"], "DISAGREE")

    def test_missing_extra_disagrees(self):
        r = adj.judge(rec(extras=["a marginal note"]))
        self.assertEqual(r["missing_extras"], ["a marginal note"])
        self.assertEqual(r["verdict"], "DISAGREE")

    def test_extra_present_in_the_text_is_not_missing(self):
        self.assertEqual(
            adj.judge(rec(extras=["In the beginning"]))["verdict"], "AGREE")

    def test_bare_number_extra_is_not_an_element(self):
        self.assertEqual(adj.judge(rec(extras=["1"]))["verdict"], "AGREE")

    def test_folio_of_another_page_is_misaligned(self):
        r = adj.judge(rec(last="2"))
        self.assertEqual(r["misaligned_with_page"], 2)
        self.assertEqual(r["verdict"], "MISALIGNED")

    def test_no_text_layer_file(self):
        r = adj.judge(rec(page=9))
        self.assertEqual(r["verdict"], "NO_TEXT_LAYER_FILE")

    def test_empty_first_line_is_vacuously_contained(self):
        r = adj.judge(rec(first=""))
        self.assertTrue(r["first_line_ok"])
        self.assertEqual(r["verdict"], "AGREE")


class TestMain(AdjudicateCase):
    def _write_sample(self, results):
        sample = self.out / "_vision-sample"
        sample.mkdir(parents=True, exist_ok=True)
        (sample / "one.json").write_text(
            json.dumps({"results": results}), encoding="utf-8")

    def test_agreeing_sample_writes_adjudication(self):
        self._write_sample([rec()])
        self.assertEqual(adj.main(), 0)
        data = json.loads(
            (self.out / "ADJUDICATION.json").read_text(encoding="utf-8"))
        self.assertEqual(data["pages"], 1)
        self.assertEqual(data["agree"], 1)
        self.assertEqual(data["categories"]["first line"], 1)
        self.assertEqual(data["results"][0]["verdict"], "AGREE")

    def test_disagreeing_sample_still_exits_zero(self):
        self._write_sample([rec(first="A Different Opening")])
        self.assertEqual(adj.main(), 0)
        data = json.loads(
            (self.out / "ADJUDICATION.json").read_text(encoding="utf-8"))
        self.assertEqual(data["agree"], 0)
        self.assertEqual(data["results"][0]["verdict"], "DISAGREE")

    def test_no_sample_dir_exits(self):
        with self.assertRaises(SystemExit):
            adj.main()

    def test_empty_sample_exits(self):
        self._write_sample([])
        with self.assertRaises(SystemExit):
            adj.main()


if __name__ == "__main__":
    unittest.main()
