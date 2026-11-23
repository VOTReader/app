#!/usr/bin/env python3
"""Tests for tools/vot-pdf-fidelity.py (votreader-tests-5 item 9).

Verbatim fidelity audit: norm, the seeded random plan, and the
difflib score — on fixture page files + inventory.json only. OUT,
PLAN and SAMPLE are rebound to a tmp dir for every test.
"""

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "vot_pdf_fidelity", HERE / "tools" / "vot-pdf-fidelity.py")
fid = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fid)


class FidelityCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = pathlib.Path(self.tmp.name) / "vot"
        self.out.mkdir()
        self.plan_path = self.out / "_fidelity-plan.json"
        self._patch_out = mock.patch.object(fid, "OUT", self.out)
        self._patch_out.start()
        self.addCleanup(self._patch_out.stop)
        self._patch_plan = mock.patch.object(fid, "PLAN", self.plan_path)
        self._patch_plan.start()
        self.addCleanup(self._patch_plan.stop)
        self._patch_sample = mock.patch.object(
            fid, "SAMPLE", self.out / "_fidelity-sample")
        self._patch_sample.start()
        self.addCleanup(self._patch_sample.stop)


class TestNorm(FidelityCase):
    def test_quotes_and_dashes_fold(self):
        self.assertEqual(
            fid.norm("\u2018Tis \u201cquoted\u201d \u2014 a\u2013b"),
            "'Tis \"quoted\" - a-b")

    def test_nbsp_becomes_a_space(self):
        self.assertEqual(fid.norm("a\u00a0\u00a0b"), "a b")

    def test_whitespace_runs_collapse_and_strip(self):
        self.assertEqual(fid.norm("  a\n\n  b\t c "), "a b c")

    def test_case_is_significant(self):
        self.assertEqual(fid.norm("Hello World"), "Hello World")

    def test_none_and_empty(self):
        self.assertEqual(fid.norm(None), "")
        self.assertEqual(fid.norm(""), "")


class TestBuildPlan(FidelityCase):
    def _write_corpus(self):
        (self.out / "CORPUS.json").write_text(json.dumps(
            [{"slug": "bk1"}]), encoding="utf-8")
        book = self.out / "bk1"
        book.mkdir(parents=True, exist_ok=True)
        (book / "inventory.json").write_text(json.dumps({"pages": [
            {"page": 1, "chars": 100},
            {"page": 2, "chars": 0},
            {"page": 3, "chars": 50},
        ]}), encoding="utf-8")

    def test_pool_is_text_bearing_pages_only(self):
        self._write_corpus()
        plan = fid.build_plan(40, 20260805)
        self.assertEqual(plan["seed"], 20260805)
        self.assertEqual(plan["pool_size"], 2)
        self.assertEqual(plan["n"], 2)
        self.assertEqual(plan["pages"], [
            {"book": "bk1", "page": 1, "chars": 100},
            {"book": "bk1", "page": 3, "chars": 50},
        ])
        written = json.loads(self.plan_path.read_text(encoding="utf-8"))
        self.assertEqual(written, plan)

    def test_same_seed_is_deterministic(self):
        self._write_corpus()
        first = fid.build_plan(40, 7)
        second = fid.build_plan(40, 7)
        self.assertEqual(first["pages"], second["pages"])

    def test_empty_pool_is_an_empty_plan(self):
        (self.out / "CORPUS.json").write_text(json.dumps(
            [{"slug": "bk1"}]), encoding="utf-8")
        book = self.out / "bk1"
        book.mkdir(parents=True, exist_ok=True)
        (book / "inventory.json").write_text(json.dumps({"pages": [
            {"page": 1, "chars": 0}]}), encoding="utf-8")
        plan = fid.build_plan(40, 20260805)
        self.assertEqual(plan["pool_size"], 0)
        self.assertEqual(plan["n"], 0)
        self.assertEqual(plan["pages"], [])


class TestScore(FidelityCase):
    TRUTH = "alpha beta gamma delta"

    def _write_page(self, text=TRUTH, page=1):
        book = self.out / "bk1"
        book.mkdir(parents=True, exist_ok=True)
        (book / f"page_{page - 1:04d}.txt").write_text(text, encoding="utf-8")

    def _write_sample(self, results):
        sample = self.out / "_fidelity-sample"
        sample.mkdir(parents=True, exist_ok=True)
        (sample / "one.json").write_text(
            json.dumps({"results": results}), encoding="utf-8")

    def _score(self):
        self.assertEqual(fid.score(), 0)
        return json.loads(
            (self.out / "FIDELITY.json").read_text(encoding="utf-8"))

    def test_identical_transcription_scores_one(self):
        self._write_page()
        self._write_sample([{"book": "bk1", "page": 1, "text": self.TRUTH}])
        data = self._score()
        self.assertEqual(data["pages"], 1)
        row = data["results"][0]
        self.assertEqual(row["char_agreement"], 1.0)
        self.assertEqual(row["word_agreement"], 1.0)
        self.assertEqual(row["content_agreement"], 1.0)
        self.assertEqual(row["cer"], 0.0)
        self.assertEqual(data["char_agreement_weighted"], 1.0)

    def test_page_may_be_given_as_a_padded_string(self):
        self._write_page()
        self._write_sample([{"book": "bk1", "page": "p0001",
                             "text": self.TRUTH}])
        data = self._score()
        self.assertEqual(data["pages"], 1)
        self.assertEqual(data["results"][0]["page"], 1)

    def test_one_word_wrong(self):
        self._write_page("the quick brown fox")
        self._write_sample([{"book": "bk1", "page": 1,
                             "text": "the quick brown dog"}])
        data = self._score()
        row = data["results"][0]
        self.assertLess(row["char_agreement"], 1.0)
        self.assertEqual(row["word_agreement"], 0.75)
        self.assertEqual(row["content_agreement"], 0.75)
        self.assertFalse(row["order_only"])

    def test_right_words_wrong_order_is_order_only(self):
        self._write_page()
        self._write_sample([{"book": "bk1", "page": 1,
                             "text": "delta gamma beta alpha"}])
        data = self._score()
        row = data["results"][0]
        self.assertEqual(row["content_agreement"], 1.0)
        self.assertLess(row["word_agreement"], 0.99)
        self.assertTrue(row["order_only"])

    def test_missing_page_file_is_skipped(self):
        self._write_sample([{"book": "bk1", "page": 9, "text": "x"}])
        with self.assertRaises(SystemExit):
            fid.score()

    def test_no_sample_dir_exits(self):
        with self.assertRaises(SystemExit):
            fid.score()


class TestMain(FidelityCase):
    def _write_corpus(self):
        (self.out / "CORPUS.json").write_text(json.dumps(
            [{"slug": "bk1"}]), encoding="utf-8")
        book = self.out / "bk1"
        book.mkdir(parents=True, exist_ok=True)
        (book / "inventory.json").write_text(json.dumps({"pages": [
            {"page": 1, "chars": 100}, {"page": 2, "chars": 50}]}),
            encoding="utf-8")

    def test_plan_through_argv(self):
        self._write_corpus()
        with mock.patch.object(sys, "argv",
                               ["vot-pdf-fidelity.py", "plan",
                                "--n", "2", "--seed", "7"]):
            self.assertEqual(fid.main(), 0)
        plan = json.loads(self.plan_path.read_text(encoding="utf-8"))
        self.assertEqual(plan["n"], 2)
        self.assertEqual(plan["seed"], 7)

    def test_score_through_argv(self):
        book = self.out / "bk1"
        book.mkdir(parents=True, exist_ok=True)
        (book / "page_0000.txt").write_text("alpha beta gamma delta",
                                            encoding="utf-8")
        sample = self.out / "_fidelity-sample"
        sample.mkdir(parents=True, exist_ok=True)
        (sample / "one.json").write_text(json.dumps({"results": [
            {"book": "bk1", "page": 1, "text": "alpha beta gamma delta"}]}),
            encoding="utf-8")
        with mock.patch.object(sys, "argv", ["vot-pdf-fidelity.py", "score"]):
            self.assertEqual(fid.main(), 0)
        data = json.loads(
            (self.out / "FIDELITY.json").read_text(encoding="utf-8"))
        self.assertEqual(data["pages"], 1)


if __name__ == "__main__":
    unittest.main()
