#!/usr/bin/env python3
"""Tests for tools/msb-pdf-diff.py (votreader-tests-5 item 6).

The diff / note-matching core on fixtures only: a small PDF generated
with fitz, hand-written page text, and a fixture matthew.js. Never the
real official PDF or the real corpus. The item FLAG asked whether the
core can run on a small generated fixture PDF: it can (TestExtract),
so no escalation.
"""

import contextlib
import importlib.util
import io
import json
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

import fitz  # PyMuPDF; extract() itself falls back to it when pdftotext is gone

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "msb_pdf_diff", HERE / "tools" / "msb-pdf-diff.py")
msb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(msb)

TEXT = """\
Matthew Chapter 1
1 The book of the generation of Jesus Christ
The Scriptures of Truth:
1:1 Genesis 5:1 The book of the generations of Adam
The Volumes of Truth:
1:1 Volume One, Let There Be Light: In the beginning God created
Also see online:
https://thevolumesoftruth.com/test
MATTHEW
1
Matthew Chapter 2
1 Now when Jesus was born in Bethlehem
"""

CH1_TEXT, CH2_TEXT = TEXT.split("Matthew Chapter 2")
CH2_TEXT = "Matthew Chapter 2" + CH2_TEXT


def app_fixture():
    return {
        1: {"num": 1,
            "verses": [{"n": 1, "text": "The book of the generation of Jesus Christ"}],
            "scriptures": [{"ref": "1:1",
                             "cite": "Genesis 5:1 The book of the generations of Adam"}],
            "votNotes": [{"ref": "1:1", "vol": "Volume One",
                            "letter": "Let There Be Light",
                            "excerpt": "In the beginning God created"}],
            "links": [{"url": "https://thevolumesoftruth.com/test"}]},
        2: {"num": 2,
            "verses": [{"n": 1, "text": "Now when Jesus was born in Bethlehem"}],
            "scriptures": [], "votNotes": [], "links": []},
    }


def matthew_js(app):
    chapters = [dict(c, num=n) for n, c in sorted(app.items())]
    return "const MATTHEW = " + json.dumps({"chapters": chapters}) + ";\n"


def make_pdf(path, text):
    doc = fitz.open()
    page = doc.new_page(width=1200, height=1000)
    page.insert_textbox((20, 20, 1180, 980), text, fontsize=11)
    doc.save(path)
    doc.close()


class TestKey(unittest.TestCase):
    def test_strips_punctuation_and_case(self):
        self.assertEqual(msb.key("Hello, World!"), "helloworld")
        self.assertEqual(msb.key("1:1-3, Vol. One"), "113volone")

    def test_nfkc_folds_fullwidth(self):
        self.assertEqual(msb.key("ＡＢＣ １２３"), "abc123")

    def test_none_and_empty(self):
        self.assertEqual(msb.key(None), "")
        self.assertEqual(msb.key(""), "")


class TestParse(unittest.TestCase):
    def test_chapters_and_sections(self):
        ch = msb.parse(TEXT)
        self.assertEqual(sorted(ch), [1, 2])
        self.assertEqual(ch[1]["verses"],
                         ["1 The book of the generation of Jesus Christ"])
        self.assertEqual(ch[1]["sot"],
                         ["1:1 Genesis 5:1 The book of the generations of Adam"])
        self.assertEqual(ch[1]["vot"],
                         ["1:1 Volume One, Let There Be Light: "
                          "In the beginning God created"])
        self.assertEqual(ch[1]["online"], ["https://thevolumesoftruth.com/test"])
        self.assertEqual(ch[2]["verses"],
                         ["1 Now when Jesus was born in Bethlehem"])

    def test_footer_lines_skipped(self):
        ch = msb.parse("Matthew Chapter 1\n1 Verse one\nMATTHEW\n1\nCHAPTER 1\n")
        self.assertEqual(ch[1]["verses"], ["1 Verse one"])

    def test_lines_before_first_chapter_dropped(self):
        ch = msb.parse("Cover page\nSome intro\nMatthew Chapter 1\n1 Verse one\n")
        self.assertEqual(sorted(ch), [1])
        self.assertEqual(ch[1]["verses"], ["1 Verse one"])

    def test_vot_row_continued_across_page_break(self):
        ch = msb.parse("Matthew Chapter 1\nThe Volumes of Truth:\n"
                       "1:1 Volume One, Let There Be\n"
                       "Light: In the beginning\n")
        self.assertEqual(ch[1]["vot"],
                         ["1:1 Volume One, Let There Be Light: In the beginning"])

    def test_form_feed_is_a_line_break(self):
        ch = msb.parse("Matthew Chapter 1\n1 Verse one\f1 Verse two\n")
        self.assertEqual(ch[1]["verses"], ["1 Verse one", "1 Verse two"])

    def test_see_online_head_stays_in_vot_row(self):
        # "See online:" is not a section head; only "Also see online:" is.
        ch = msb.parse("Matthew Chapter 1\nThe Volumes of Truth:\n"
                       "1:1 Volume One, Title: excerpt See online: https://x.test/a\n")
        self.assertEqual(ch[1]["vot"],
                         ["1:1 Volume One, Title: excerpt See online: https://x.test/a"])


class TestPdfRow(unittest.TestCase):
    def test_ref_and_rest(self):
        self.assertEqual(msb.pdf_row("1:1 Volume One, Title: excerpt"),
                         ("1:1", "Volume One, Title: excerpt"))

    def test_range_and_multi_ref(self):
        ref, rest = msb.pdf_row("1:1-3, 2:5 Volume One, Title: excerpt")
        self.assertEqual(ref, "1:1-3, 2:5")
        self.assertEqual(rest, "Volume One, Title: excerpt")

    def test_continued_on_page_note_stripped(self):
        _, rest = msb.pdf_row("1:1 Volume One, Title: excerpt "
                              "(continued on the next page)")
        self.assertEqual(rest, "Volume One, Title: excerpt")
        _, rest = msb.pdf_row("1:1 Volume One, Title: excerpt "
                              "(continued on the following page)")
        self.assertEqual(rest, "Volume One, Title: excerpt")

    def test_see_online_tail_stripped_even_with_space_in_address(self):
        _, rest = msb.pdf_row("1:1 Volume One, Title: excerpt See online: "
                              "https://x.test/Out! Part_Two")
        self.assertEqual(rest, "Volume One, Title: excerpt")

    def test_bare_url_stripped(self):
        _, rest = msb.pdf_row("1:1 Volume One, Title https://x.test/a excerpt")
        self.assertEqual(rest, "Volume One, Title  excerpt")

    def test_topic_label_stripped(self):
        _, rest = msb.pdf_row("22:11 wedding garment: The king saw a man")
        self.assertEqual(rest, "The king saw a man")

    def test_title_alias_applied(self):
        _, rest = msb.pdf_row("1:1 I Am Calling You Out: Part One: excerpt")
        self.assertEqual(rest, "I Am Calling You Out! (Part 1): excerpt")


class TestAppRow(unittest.TestCase):
    def test_vol_and_letter_joined(self):
        self.assertEqual(msb.app_row({"vol": "Volume One", "letter": "Title",
                                      "excerpt": "ex"}),
                         ("Volume One, Title", "ex"))

    def test_vol_equal_to_letter_not_doubled(self):
        self.assertEqual(msb.app_row({"vol": "title", "letter": "Title",
                                      "excerpt": "ex"}),
                         ("Title", "ex"))

    def test_missing_fields_are_empty(self):
        self.assertEqual(msb.app_row({}), ("", ""))
        self.assertEqual(msb.app_row({"vol": "Volume One"}), ("Volume One, ", ""))


class TestDiffVot(unittest.TestCase):
    def test_clean_fixture(self):
        self.assertEqual(msb.diff_vot(msb.parse(TEXT), app_fixture()), [])

    def test_pdf_row_not_in_app(self):
        pdf = msb.parse(TEXT)
        pdf[1]["vot"].append("1:9 Volume One, A Missing Letter: some excerpt")
        problems = msb.diff_vot(pdf, app_fixture())
        self.assertEqual(len(problems), 1)
        self.assertIn("PDF row not in app", problems[0])

    def test_app_row_not_in_pdf(self):
        app = app_fixture()
        app[1]["votNotes"].append({"ref": "1:9", "vol": "Volume One",
                                   "letter": "An Extra Letter", "excerpt": "ex"})
        problems = msb.diff_vot(msb.parse(TEXT), app)
        self.assertEqual(len(problems), 1)
        self.assertIn("app row not in PDF", problems[0])

    def test_app_chapter_the_pdf_lacks(self):
        app = app_fixture()
        app[3] = {"num": 3, "verses": [], "scriptures": [],
                  "votNotes": [{"ref": "3:1", "vol": "Volume One",
                                "letter": "Third Chapter Letter", "excerpt": "ex"}],
                  "links": []}
        problems = msb.diff_vot(msb.parse(TEXT), app)
        self.assertEqual(problems, ["vot ch3 app row not in PDF: 3:1 Volume One, "
                                   "Third Chapter Letter"])

    def test_row_filed_under_the_next_chapter(self):
        app = app_fixture()
        note = app[1]["votNotes"].pop()
        app[2]["votNotes"].append(note)
        problems = msb.diff_vot(msb.parse(TEXT), app)
        self.assertEqual(len(problems), 1)
        self.assertIn("app has it as ch2 1:1", problems[0])

    def test_same_text_wrong_ref(self):
        app = app_fixture()
        app[1]["votNotes"][0]["ref"] = "1:2"
        problems = msb.diff_vot(msb.parse(TEXT), app)
        self.assertEqual(len(problems), 1)
        self.assertIn("app has it as ch1 1:2", problems[0])

    def test_known_difference_suppressed(self):
        # KNOWN (5, "5:17", "Let The Law Be Written in Your Heart"): the PDF
        # files the letter under Words To Live By, the app under Part Two.
        pdf = {5: {"verses": [], "sot": [], "online": [],
                   "vot": ["5:17 Let The Law Be Written in Your Heart "
                            "Words To Live By excerpt"]}}
        app = {5: {"num": 5, "verses": [], "scriptures": [],
                  "votNotes": [{"ref": "5:17", "vol": "Part Two",
                                "letter": "Let The Law Be Written in Your Heart",
                                "excerpt": "different excerpt"}], "links": []}}
        self.assertEqual(msb.diff_vot(pdf, app), [])

    def test_title_only_pdf_row_matches_app_with_excerpt(self):
        pdf = msb.parse(TEXT)
        pdf[1]["vot"] = ["1:1 Volume One, Let There Be Light"]
        self.assertEqual(msb.diff_vot(pdf, app_fixture()), [])


class TestDiffSot(unittest.TestCase):
    def test_clean_fixture(self):
        self.assertEqual(msb.diff_sot(msb.parse(TEXT), app_fixture()), [])

    def test_merged_cite_split(self):
        # The app splits one PDF cite across two items under one ref.
        pdf = {1: {"verses": [], "vot": [], "online": [],
                   "sot": ["11:13-14 Malachi 4:4-6 These verses say more"]}}
        app = {1: {"num": 1, "verses": [], "votNotes": [], "links": [],
                  "scriptures": [{"ref": "11:13-14", "cite": "Malachi 4:4-6"},
                                 {"ref": "11:13-14", "cite": "These verses say more"}]}}
        self.assertEqual(msb.diff_sot(pdf, app), [])

    def test_mismatch_reports_first_difference(self):
        app = app_fixture()
        app[1]["scriptures"][0]["cite"] = "Genesis 5:2 The book of the generations"
        problems = msb.diff_sot(msb.parse(TEXT), app)
        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith("sot ch1: first difference at"))


class TestDiffLinks(unittest.TestCase):
    def test_clean_fixture(self):
        self.assertEqual(msb.diff_links(msb.parse(TEXT), app_fixture()), [])

    def test_link_in_pdf_not_app(self):
        app = app_fixture()
        app[1]["links"] = []
        problems = msb.diff_links(msb.parse(TEXT), app)
        self.assertEqual(problems,
                         ["links ch1: in the PDF, not the app: "
                          "['thevolumesoftruth.com/test']"])

    def test_link_in_app_not_pdf(self):
        app = app_fixture()
        app[1]["links"].append({"url": "https://example.com/extra"})
        problems = msb.diff_links(msb.parse(TEXT), app)
        self.assertEqual(problems,
                         ["links ch1: in the app, not the PDF: ['example.com/extra']"])

    def test_known_link_suppressed(self):
        pdf = {5: {"verses": [], "sot": [], "vot": [],
                   "online": ["https://thevolumesoftruth.com/the_blessed"]}}
        app = {5: {"num": 5, "verses": [], "scriptures": [], "votNotes": [],
                  "links": []}}
        self.assertEqual(msb.diff_links(pdf, app), [])

    def test_vot_see_online_url_not_required_in_app_links(self):
        # A vot row's "See online" address opens in-app; it is in `every`,
        # not in `core`, so the app need not list it.
        pdf = {1: {"verses": [], "sot": [], "online": [],
                   "vot": ["1:1 Volume One, Title: excerpt See online: "
                            "https://thevolumesoftruth.com/letter"]}}
        app = {1: {"num": 1, "verses": [], "scriptures": [],
                  "votNotes": [{"ref": "1:1", "vol": "Volume One",
                                "letter": "Title", "excerpt": "excerpt"}],
                  "links": []}}
        self.assertEqual(msb.diff_links(pdf, app), [])


class TestDiffVerses(unittest.TestCase):
    def test_clean_fixture(self):
        self.assertEqual(msb.diff_verses(msb.parse(TEXT), app_fixture()), [])

    def test_text_differs(self):
        app = app_fixture()
        app[1]["verses"][0]["text"] = "The book of the generation of Jesus the Christ"
        self.assertEqual(msb.diff_verses(msb.parse(TEXT), app),
                         ["verses ch1: text differs"])


class TestExtract(unittest.TestCase):
    def test_generated_pdf_via_pdftotext(self):
        with tempfile.TemporaryDirectory() as d:
            pdf = pathlib.Path(d) / "fixture.pdf"
            make_pdf(pdf, TEXT)
            text = msb.extract(pdf)
            self.assertIn("Matthew Chapter 1", text)
            self.assertIn("1:1 Volume One, Let There Be Light", text)
            self.assertEqual(sorted(msb.parse(text)), [1, 2])

    def test_fitz_fallback_when_pdftotext_missing(self):
        with tempfile.TemporaryDirectory() as d:
            pdf = pathlib.Path(d) / "fixture.pdf"
            make_pdf(pdf, TEXT)
            with mock.patch.object(shutil, "which", return_value=None):
                text = msb.extract(pdf)
            self.assertIn("Matthew Chapter 1", text)
            self.assertEqual(sorted(msb.parse(text)), [1, 2])


class TestMain(unittest.TestCase):
    def _run_main(self, tmp, argv, app=None):
        text_dir = pathlib.Path(tmp) / "text"
        text_dir.mkdir()
        (text_dir / "p0001.txt").write_text(CH1_TEXT, encoding="utf-8")
        (text_dir / "p0002.txt").write_text(CH2_TEXT, encoding="utf-8")
        data = pathlib.Path(tmp) / "matthew.js"
        data.write_text(matthew_js(app or app_fixture()), encoding="utf-8")
        out = io.StringIO()
        with mock.patch.object(msb, "DATA", data), \
                mock.patch.object(sys, "argv", ["msb-pdf-diff.py"] + argv), \
                contextlib.redirect_stdout(out):
            rc = msb.main()
        return rc, out.getvalue(), text_dir

    def test_text_dir_happy_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            rc, out, _ = self._run_main(tmp, ["--text-dir", str(pathlib.Path(tmp) / "text")])
            self.assertEqual(rc, 0)
            self.assertIn("chapters PDF 2 / app 2", out)
            self.assertIn("0 new difference(s)", out)

    def test_text_dir_mismatch_is_exit_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            text_dir = pathlib.Path(tmp) / "text"
            text_dir.mkdir()
            (text_dir / "p0001.txt").write_text(
                CH1_TEXT.replace("In the beginning God created",
                                 "In the beginning God created the heavens"),
                encoding="utf-8")
            (text_dir / "p0002.txt").write_text(CH2_TEXT, encoding="utf-8")
            data = pathlib.Path(tmp) / "matthew.js"
            data.write_text(matthew_js(app_fixture()), encoding="utf-8")
            out = io.StringIO()
            with mock.patch.object(msb, "DATA", data), \
                    mock.patch.object(sys, "argv",
                                      ["msb-pdf-diff.py", "--text-dir", str(text_dir)]), \
                    contextlib.redirect_stdout(out):
                rc = msb.main()
            self.assertEqual(rc, 1)
            # One problem each way: the PDF row is not in the app, and the
            # app row is not in the PDF.
            self.assertIn("2 new difference(s)", out.getvalue())
            self.assertIn("vot ch1", out.getvalue())

    def test_fetch_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = pathlib.Path(tmp) / "fixture.pdf"
            pdf.write_bytes(b"OLD-BYTES")
            with mock.patch("urllib.request.urlopen",
                             return_value=io.BytesIO(b"OLD-BYTES")):
                rc, out, text_dir = self._run_main(
                    tmp, ["--fetch", "--text-dir", str(pathlib.Path(tmp) / "text"),
                            str(pdf)])
            self.assertEqual(rc, 0)
            self.assertIn("UNCHANGED", out)
            self.assertEqual(pdf.read_bytes(), b"OLD-BYTES")

    def test_fetch_new_version_writes_the_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = pathlib.Path(tmp) / "fixture.pdf"
            pdf.write_bytes(b"OLD-BYTES")
            with mock.patch("urllib.request.urlopen",
                             return_value=io.BytesIO(b"NEW-BYTES")):
                rc, out, text_dir = self._run_main(
                    tmp, ["--fetch", "--text-dir", str(pathlib.Path(tmp) / "text"),
                            str(pdf)])
            self.assertEqual(rc, 0)
            self.assertIn("NEW VERSION", out)
            self.assertEqual(pdf.read_bytes(), b"NEW-BYTES")


if __name__ == "__main__":
    unittest.main()
