#!/usr/bin/env python3
"""Tests for tools/vot-pdf-render.py (votreader-tests-5 item 10).

Render fixture-PDF pages to PNG on a tmp SRC/OUT; the real corpus and the
real _ocr_out are never touched.
"""

import importlib.util
import io
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

import fitz

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "vot_pdf_render", HERE / "tools" / "vot-pdf-render.py")
vr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vr)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def build_book(path, pages=5):
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=612, height=792)
        page.insert_textbox(fitz.Rect(72, 100, 540, 300),
                            f"Page {i + 1} of the fixture book.", fontsize=11)
    doc.save(path)
    doc.close()
    return path


class RenderCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = pathlib.Path(self.tmp.name)
        self.src = self.dir / "source-pdfs"
        self.src.mkdir()
        self.out = self.dir / "vot"
        self.out.mkdir()
        self._patch_src = mock.patch.object(vr, "SRC", self.src)
        self._patch_src.start()
        self.addCleanup(self._patch_src.stop)
        self._patch_out = mock.patch.object(vr, "OUT", self.out)
        self._patch_out.start()
        self.addCleanup(self._patch_out.stop)
        self.pdf = build_book(self.src / "Book.pdf", pages=5)

    def _run(self, *argv):
        """Run vr.main() with argv patched and both streams captured on real
        TextIOWrappers (main() calls sys.stdout.reconfigure, which a
        StringIO does not support). Returns (rc, stdout, stderr)."""
        out_buf = io.BytesIO()
        err_buf = io.BytesIO()
        out_w = io.TextIOWrapper(out_buf, encoding="utf-8", write_through=True)
        err_w = io.TextIOWrapper(err_buf, encoding="utf-8", write_through=True)
        with mock.patch.object(sys, "argv", ["vot-pdf-render.py", *argv]):
            with mock.patch.object(sys, "stdout", out_w):
                with mock.patch.object(sys, "stderr", err_w):
                    rc = vr.main()
        return (rc, out_buf.getvalue().decode("utf-8"),
                err_buf.getvalue().decode("utf-8"))

    def _images(self):
        return self.out / "Book" / "_images"

    def _png_size(self, path):
        pix = fitz.Pixmap(str(path))
        return pix.w, pix.h

    def _assert_png(self, path):
        self.assertTrue(path.exists())
        self.assertTrue(path.read_bytes().startswith(PNG_MAGIC))


class TestRender(RenderCase):
    def test_every_page_by_default(self):
        rc, out, _err = self._run("Book.pdf")
        self.assertEqual(rc, 0)
        for n in range(1, 6):
            self._assert_png(self._images() / f"p{n:04d}.png")
            self.assertIn(f"p{n:04d}.png", out)
        self.assertIn(str(self._images()), out)
        self.assertEqual(self._png_size(self._images() / "p0001.png"),
                         (1275, 1650))

    def test_every_nth_page(self):
        rc, _out, _err = self._run("Book.pdf", "--every", "2")
        self.assertEqual(rc, 0)
        for n in (1, 3, 5):
            self.assertTrue((self._images() / f"p{n:04d}.png").exists())
        for n in (2, 4):
            self.assertFalse((self._images() / f"p{n:04d}.png").exists())

    def test_named_pages(self):
        rc, _out, _err = self._run("Book.pdf", "--pages", "2,4")
        self.assertEqual(rc, 0)
        for n in (2, 4):
            self.assertTrue((self._images() / f"p{n:04d}.png").exists())
        for n in (1, 3, 5):
            self.assertFalse((self._images() / f"p{n:04d}.png").exists())

    def test_dpi_scales_output(self):
        rc, _out, _err = self._run("Book.pdf", "--pages", "1", "--dpi", "72")
        self.assertEqual(rc, 0)
        self.assertEqual(self._png_size(self._images() / "p0001.png"), (612, 792))

    def test_existing_png_is_skipped(self):
        images = self._images()
        images.mkdir(parents=True, exist_ok=True)
        sentinel = images / "p0002.png"
        sentinel.write_bytes(b"SENTINEL")
        rc, _out, _err = self._run("Book.pdf", "--pages", "2,3")
        self.assertEqual(rc, 0)
        self.assertEqual(sentinel.read_bytes(), b"SENTINEL")
        self._assert_png(images / "p0003.png")

    def test_summary_goes_to_stderr(self):
        _rc, out, err = self._run("Book.pdf", "--pages", "1")
        self.assertIn("# 1 pages at 150 dpi", err)
        self.assertNotIn("# 1 pages", out)


if __name__ == "__main__":
    unittest.main()
