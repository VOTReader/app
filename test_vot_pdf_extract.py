#!/usr/bin/env python3
"""Tests for tools/vot-pdf-extract.py (votreader-tests-5 item 10).

Deterministic text-layer extraction on fitz-generated fixture PDFs only.
OUT (and SRC for main()) are rebound to a tmp dir for every test; the real
corpus and the real _ocr_out are never touched.
"""

import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

import fitz

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "vot_pdf_extract", HERE / "tools" / "vot-pdf-extract.py")
ve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ve)

HEAD = "THE VOLUMES OF TRUTH"
BODY1 = ("In the beginning the garden stood in the light of the morning, "
         "and the trees bore fruit in their season.")
BODY2 = ("The letters came one by one, each carrying a word for the household, "
         "and none of them returned empty.")
BODY3 = ("A third page holds the same measure of words, steady and plain, "
         "so the thin page stands out against it.")


def build_book(path):
    """Five-page fixture book.

    Pages 1-3: running head + body + folio 1-3. Page 4: one short line +
    folio 4 (thin against the book's median). Page 5: one small image, no
    text (empty + image-only). Two outline entries.
    """
    doc = fitz.open()
    bodies = [BODY1, BODY2, BODY3]
    for i in range(3):
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 30), HEAD, fontsize=11)
        page.insert_textbox(fitz.Rect(72, 100, 540, 300), bodies[i], fontsize=11)
        page.insert_text((72, 760), str(i + 1), fontsize=11)
    page = doc.new_page(width=612, height=792)
    page.insert_textbox(fitz.Rect(72, 100, 540, 300), "Short page.", fontsize=11)
    page.insert_text((72, 760), "4", fontsize=11)
    page = doc.new_page(width=612, height=792)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 20, 20))
    pix.clear_with(200)
    page.insert_image(fitz.Rect(50, 50, 70, 70), pixmap=pix)
    doc.set_toc([[1, "The Garden", 1], [1, "The Letters", 3]])
    doc.save(path)
    doc.close()
    return path


def build_geometry(path):
    """Two pages: edge-band lines, then a clean two-column page."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 30), HEAD, fontsize=11)
    page.insert_text((72, 48), "X" * 70, fontsize=11)
    page.insert_text((72, 400), "Middle of the page.", fontsize=11)
    page.insert_text((72, 760), "9", fontsize=11)
    page = doc.new_page(width=612, height=792)
    page.insert_textbox(fitz.Rect(40, 60, 572, 90), "A Prophecy Fulfilled", fontsize=14)
    page.insert_textbox(fitz.Rect(40, 100, 250, 200),
                        "Left first: the word came in the morning.", fontsize=11)
    page.insert_textbox(fitz.Rect(40, 210, 250, 300),
                        "Left second: the household heard it.", fontsize=11)
    page.insert_textbox(fitz.Rect(320, 100, 560, 200),
                        "Right first: the fulfilment followed at evening.", fontsize=11)
    page.insert_textbox(fitz.Rect(320, 210, 560, 300),
                        "Right second: nothing was lost.", fontsize=11)
    doc.save(path)
    doc.close()
    return path


class ExtractCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = pathlib.Path(self.tmp.name)
        self.out = self.dir / "vot"
        self.out.mkdir()
        self._patch_out = mock.patch.object(ve, "OUT", self.out)
        self._patch_out.start()
        self.addCleanup(self._patch_out.stop)
        self.pdf = build_book(self.dir / "Fixture.pdf")

    def _run_main(self, *argv):
        """Run ve.main() with argv patched and stdout captured on a real
        TextIOWrapper (main() calls sys.stdout.reconfigure, which a
        StringIO does not support). Returns (rc, printed text)."""
        buf = io.BytesIO()
        wrapper = io.TextIOWrapper(buf, encoding="utf-8", write_through=True)
        with mock.patch.object(sys, "argv", ["vot-pdf-extract.py", *argv]):
            with mock.patch.object(sys, "stdout", wrapper):
                rc = ve.main()
        return rc, buf.getvalue().decode("utf-8")


class TestClean(ExtractCase):
    def test_ligatures_expand(self):
        self.assertEqual(ve.clean("ﬁsh ﬂow ﬀect")[0], "fish flow ffect")
        self.assertEqual(ve.clean("ﬃ ﬄ")[0], "ffi ffl")

    def test_soft_hyphen_removed(self):
        self.assertEqual(ve.clean("exam­ple")[0], "example")

    def test_folio_on_first_line(self):
        body, folio = ve.clean("1\nbody text")
        self.assertEqual((body, folio), ("body text", "1"))

    def test_folio_on_last_line(self):
        body, folio = ve.clean("body text\n99")
        self.assertEqual((body, folio), ("body text", "99"))

    def test_first_folio_wins(self):
        body, folio = ve.clean("1\nbody text\n2")
        self.assertEqual((body, folio), ("body text", "1"))

    def test_mid_page_bare_number_is_kept(self):
        body, folio = ve.clean("a\nb\n42\nd\ne")
        self.assertEqual((body, folio), ("a\nb\n42\nd\ne", None))

    def test_five_digit_number_is_not_a_folio(self):
        body, folio = ve.clean("12345\nbody text")
        self.assertEqual((body, folio), ("12345\nbody text", None))

    def test_empty(self):
        self.assertEqual(ve.clean(""), ("", None))


class TestHeadings(ExtractCase):
    def test_outline_entries(self):
        doc = fitz.open()
        for _ in range(3):
            doc.new_page()
        doc.set_toc([[1, "The Garden", 1], [2, "A Letter", 3]])
        self.assertEqual(ve.headings(doc), [
            {"level": 1, "title": "The Garden", "page": 1},
            {"level": 2, "title": "A Letter", "page": 3},
        ])
        doc.close()

    def test_no_outline(self):
        doc = fitz.open()
        doc.new_page()
        self.assertEqual(ve.headings(doc), [])
        doc.close()


class TestHeadingShaped(ExtractCase):
    def test_counts_uppercase_lines_only(self):
        pages = ["HELLO WORLD\nmixed\n1234\nABC\nABCD EFGH"]
        self.assertEqual(ve.heading_shaped(pages), 2)

    def test_length_bounds(self):
        self.assertEqual(ve.heading_shaped(["ABCD"]), 1)
        self.assertEqual(ve.heading_shaped(["ABC"]), 0)
        self.assertEqual(ve.heading_shaped(["A" * 120]), 1)
        self.assertEqual(ve.heading_shaped(["A" * 121]), 0)


class TestEdgeLines(ExtractCase):
    def test_only_edge_band_short_lines(self):
        doc = fitz.open(build_geometry(self.dir / "geo.pdf"))
        lines = ve.edge_lines(doc[0])
        doc.close()
        self.assertEqual(lines, [HEAD, "9"])

    def test_no_edge_lines(self):
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 400), "Middle of the page.", fontsize=11)
        self.assertEqual(ve.edge_lines(page), [])
        doc.close()


class TestColumnText(ExtractCase):
    def test_two_column_page_reorders(self):
        doc = fitz.open(build_geometry(self.dir / "geo.pdf"))
        text = ve.column_text(doc[1])
        doc.close()
        self.assertIsNotNone(text)
        self.assertTrue(text.startswith("A Prophecy Fulfilled"))
        order = [text.index(s) for s in (
            "Left first", "Left second", "Right first", "Right second")]
        self.assertEqual(order, sorted(order))

    def test_single_column_returns_none(self):
        doc = fitz.open(self.pdf)
        self.assertIsNone(ve.column_text(doc[0]))
        doc.close()

    def test_few_blocks_returns_none(self):
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 100), "One block only.", fontsize=11)
        self.assertIsNone(ve.column_text(page))
        doc.close()


class TestExtract(ExtractCase):
    def test_full_run(self):
        inv = ve.extract(self.pdf)
        dest = self.out / "Fixture"
        self.assertEqual(inv["slug"], "Fixture")
        self.assertEqual(inv["source_pdf"], "Fixture.pdf")
        self.assertEqual(inv["page_count"], 5)
        self.assertTrue(inv["has_text_layer"])
        for i in range(5):
            self.assertTrue((dest / f"page_{i:04d}.txt").exists())
        all_txt = (dest / "all.txt").read_text(encoding="utf-8")
        for n in range(1, 6):
            self.assertIn(f"==== PAGE {n} ====", all_txt)
        on_disk = json.loads((dest / "inventory.json").read_text(encoding="utf-8"))
        self.assertEqual(on_disk, inv)

    def test_page_meta(self):
        inv = ve.extract(self.pdf)
        p1, p4, p5 = inv["pages"][0], inv["pages"][3], inv["pages"][4]
        self.assertEqual(p1["page"], 1)
        self.assertEqual(p1["folio"], "1")
        self.assertEqual(p1["running_heads"], [HEAD])
        self.assertEqual(p1["images"], 0)
        self.assertGreater(p1["chars"], 100)
        self.assertEqual(p1["words"], 24)
        self.assertEqual(p4["folio"], "4")
        self.assertEqual(p4["chars"], len("Short page."))
        self.assertEqual(p5["folio"], "")
        self.assertEqual(p5["chars"], 0)
        self.assertEqual(p5["images"], 1)
        self.assertEqual((self.out / "Fixture" / "page_0003.txt").read_text(
            encoding="utf-8"), "Short page.")

    def test_flags(self):
        inv = ve.extract(self.pdf)
        flags = inv["flags"]
        self.assertTrue(flags["coverage_ok"])
        self.assertEqual(flags["empty_pages"], [5])
        self.assertEqual(flags["thin_pages"], [4])
        self.assertEqual(flags["imageonly_pages"], [5])
        self.assertEqual(flags["multicolumn_pages"], 0)
        self.assertEqual(flags["multicolumn_sample"], [])
        self.assertEqual(flags["running_heads"], [HEAD])
        self.assertEqual(flags["folio_pages"], 4)
        self.assertEqual(flags["folio_pages_rejected"], 0)
        self.assertTrue(flags["folio_trustworthy"])
        self.assertEqual(flags["folio_break_count"], 0)
        self.assertEqual(flags["outline_headings"], 2)
        self.assertEqual(flags["heading_shaped_lines"], 3)
        self.assertTrue(flags["outline_trustworthy"])

    def test_folio_break_recorded_but_series_kept(self):
        doc = fitz.open()
        for folio in ("1", "2", "5"):
            page = doc.new_page(width=612, height=792)
            page.insert_textbox(fitz.Rect(72, 100, 540, 300),
                                "Body text for the folio book.", fontsize=11)
            page.insert_text((72, 760), folio, fontsize=11)
        path = self.dir / "Breaks.pdf"
        doc.save(path)
        doc.close()
        inv = ve.extract(path)
        self.assertEqual(inv["flags"]["folio_breaks"],
                         [{"page": 3, "folio": 5, "prev_folio": 2}])
        self.assertTrue(inv["flags"]["folio_trustworthy"])
        self.assertEqual([m["folio"] for m in inv["pages"]], ["1", "2", "5"])

    def test_untrustworthy_folio_series_is_dropped(self):
        doc = fitz.open()
        for i in range(6):
            page = doc.new_page(width=612, height=792)
            page.insert_textbox(fitz.Rect(72, 100, 540, 300),
                                "Body text for the folio book.", fontsize=11)
            page.insert_text((72, 760), str(2 * i + 1), fontsize=11)
        path = self.dir / "Wild.pdf"
        doc.save(path)
        doc.close()
        inv = ve.extract(path)
        flags = inv["flags"]
        self.assertFalse(flags["folio_trustworthy"])
        self.assertEqual(flags["folio_pages"], 0)
        self.assertEqual(flags["folio_pages_rejected"], 6)
        self.assertEqual(flags["folio_break_count"], 5)
        self.assertEqual([m["folio"] for m in inv["pages"]], [""] * 6)


class TestMain(ExtractCase):
    def test_one_pdf_through_argv(self):
        with mock.patch.object(ve, "SRC", self.dir):
            rc, out = self._run_main("Fixture.pdf")
        self.assertEqual(rc, 0)
        self.assertIn("Fixture", out)
        corpus = json.loads((self.out / "CORPUS.json").read_text(encoding="utf-8"))
        self.assertEqual(len(corpus), 1)
        self.assertEqual(corpus[0]["slug"], "Fixture")
        self.assertTrue((self.out / "Fixture" / "inventory.json").exists())

    def test_missing_pdf_is_reported_not_fatal(self):
        with mock.patch.object(ve, "SRC", self.dir):
            rc, out = self._run_main("Nope.pdf")
        self.assertEqual(rc, 0)
        self.assertIn("MISSING", out)
        corpus = json.loads((self.out / "CORPUS.json").read_text(encoding="utf-8"))
        self.assertEqual(corpus, [])

    def test_default_is_every_pdf_in_src(self):
        with mock.patch.object(ve, "SRC", self.dir):
            rc, _out = self._run_main()
        self.assertEqual(rc, 0)
        corpus = json.loads((self.out / "CORPUS.json").read_text(encoding="utf-8"))
        self.assertEqual([c["slug"] for c in corpus], ["Fixture"])


if __name__ == "__main__":
    unittest.main()
