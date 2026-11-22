"""Unit tests for tools/extract-occasion-lines.py — the occasion-line audit.

The script is a one-shot audit tool: at top level it reads ten downloaded
website HTML files from a hardcoded D:\\VOTReader-studio path, splits each
into <article> entries, and prints (and TSV-writes) every letter-header line
that is wholly a parenthetical — the "occasion" line. The pure core is
strip_tags() (tags out, <br> to newline, entities unescaped), title_of()
(both <h2> shapes) and header_block() (the first justify-aligned <p>).

Stdlib unittest + exec only. The script is loaded by reading its source,
rewriting the hardcoded HTML dir and TSV paths to temp fixture files,
re-subbing FORMAT_A to the fixture stems, and exec'ing it in a fresh
namespace, so no real Downloaded Webssite Source is read and nothing is
written outside the temp dir (the item-7 _audit-compare precedent). Unlike
the audit scripts, this one reads and writes through with-blocks throughout,
so no ResourceWarning filter is needed for the exec.

A missing stem file raises FileNotFoundError — the driver has no guard —
pinned as current behaviour, not fixed.

Run:  python -m unittest test_extract_occasion_lines -v   (from repo root)
"""

import contextlib
import io
import os
import re
import tempfile
import unittest
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = Path(_HERE, "tools", "extract-occasion-lines.py").read_text(encoding="utf-8")

_HTML_TOKEN = r'''r"D:\VOTReader-studio\Downloaded Webssite Source"'''
_TSV_TOKEN = r'''r"D:\VOTReader-studio\tools\_occasion-lines.tsv"'''

VOLUME_1 = """<article id="letter-1">
<h2 class="ltitle">First Letter Title</h2>
<p style="text-align: justify">Spoken to Timothy<br>(Regarding Thanksgiving)<br>November 2026</p>
<p>Body text here.</p>
</article>
<article id="letter-2">
<h2><span class="mw-headline" id="x">Second Letter</span></h2>
<p style="text-align: justify">Spoken to Timothy<br>(For the Feast)<br>(A second occasion)<br>December 2026</p>
</article>
<article id="letter-3">
<p style="text-align: justify">(No title here)</p>
</article>
<article id="letter-4">
<h2 class="ltitle">No Header Letter</h2>
<p>Just body, no justify header.</p>
</article>
"""

VOLUME_2 = """<article id="other-1">
<h2 class="ltitle">Plain Letter</h2>
<p style="text-align: justify">Spoken to Timothy<br>November 2026</p>
</article>
"""


class _OccasionCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.html_dir = self.root / "html"
        self.html_dir.mkdir()
        self.tsv = self.root / "_occasion-lines.tsv"

    def run_script(self, files, stems=("volume_1", "volume_2")):
        """Exec the script against fixture HTML; return (ns, stdout)."""
        for stem, content in files.items():
            (self.html_dir / (stem + ".html")).write_text(content, encoding="utf-8")
        src = _SRC.replace(_HTML_TOKEN, repr(str(self.html_dir)))
        src = src.replace(_TSV_TOKEN, repr(str(self.tsv)))
        src = re.sub(
            r"FORMAT_A = \[.*?\]",
            "FORMAT_A = [%s]" % ", ".join(repr(s) for s in stems),
            src,
            flags=re.S,
        )
        ns = {"__name__": "extract_occasion_lines"}
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            exec(compile(src, "extract-occasion-lines.py", "exec"), ns)
        return ns, buf.getvalue()

    def load_helpers(self):
        """Exec with empty fixture files; return the namespace for unit tests."""
        ns, _ = self.run_script({"volume_1": "", "volume_2": ""})
        return ns


class TestHelpers(_OccasionCase):
    def test_strip_tags_converts_br_strips_tags_unescapes_entities(self):
        ns = self.load_helpers()
        self.assertEqual(
            ns["strip_tags"]("A<br>B<br/>C <b>bold</b> &amp; &quot;q&quot;"),
            "A\nB\nC bold & \"q\"",
        )

    def test_title_of_ltitle_shape(self):
        ns = self.load_helpers()
        art = '<h2 class="ltitle">A <i>fine</i> title</h2><p>body</p>'
        self.assertEqual(ns["title_of"](art), "A fine title")

    def test_title_of_mw_headline_shape(self):
        ns = self.load_helpers()
        art = '<h2><span class="mw-headline" id="x">Second Letter</span></h2>'
        self.assertEqual(ns["title_of"](art), "Second Letter")

    def test_title_of_none_when_no_h2(self):
        ns = self.load_helpers()
        self.assertIsNone(ns["title_of"]("<p>No heading here.</p>"))

    def test_header_block_is_the_justify_paragraph(self):
        ns = self.load_helpers()
        art = (
            '<p style="text-align: justify">Spoken to Timothy<br>(An occasion)</p>'
            "<p>Body.</p>"
        )
        self.assertEqual(
            ns["header_block"](art), "Spoken to Timothy<br>(An occasion)"
        )

    def test_header_block_none_when_no_justify_paragraph(self):
        ns = self.load_helpers()
        self.assertIsNone(ns["header_block"]('<p style="text-align: left">Hi</p>'))
        self.assertIsNone(ns["header_block"]("<p>No style at all.</p>"))


class TestDriver(_OccasionCase):
    def test_end_to_end_rows_total_and_tsv(self):
        _, out = self.run_script({"volume_1": VOLUME_1, "volume_2": VOLUME_2})
        lines = out.splitlines()
        self.assertEqual(lines[0], "TOTAL occasion lines (Format A): 3")
        self.assertEqual(lines[1], "")
        self.assertEqual(
            lines[2:],
            [
                "volume_1\tFirst Letter Title\t(Regarding Thanksgiving)",
                "volume_1\tSecond Letter\t(For the Feast)",
                "volume_1\tSecond Letter\t(A second occasion)",
            ],
        )
        # The TSV carries the same rows, tab-separated, no header.
        self.assertEqual(
            self.tsv.read_text(encoding="utf-8").splitlines(),
            [
                "volume_1\tFirst Letter Title\t(Regarding Thanksgiving)",
                "volume_1\tSecond Letter\t(For the Feast)",
                "volume_1\tSecond Letter\t(A second occasion)",
            ],
        )
        # An article with no title and one with no header are skipped;
        # plain header lines are not occasion lines; volume_2 adds none.
        self.assertNotIn("No title here", out)
        self.assertNotIn("No Header Letter", out)
        self.assertNotIn("Spoken to Timothy", out)
        self.assertNotIn("Plain Letter", out)

    def test_empty_fixtures_print_zero_and_write_empty_tsv(self):
        _, out = self.run_script({"volume_1": "", "volume_2": ""})
        self.assertEqual(out, "TOTAL occasion lines (Format A): 0\n\n")
        self.assertEqual(self.tsv.read_text(encoding="utf-8"), "")

    def test_missing_stem_file_raises(self):
        # The driver has no guard: a stem with no HTML file takes the
        # whole run down with FileNotFoundError. Pinned, not fixed.
        with self.assertRaises(FileNotFoundError):
            self.run_script({"volume_1": VOLUME_1}, stems=("volume_1", "volume_9"))


if __name__ == "__main__":
    unittest.main()
