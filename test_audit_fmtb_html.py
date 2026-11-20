"""Unit tests for tools/_audit-fmtb-html.py — the Format B HTML extractor.

The script parses the Words To Live By One/Two + The Blessed pages into
per-entry records (title, bodyWords, bodyHead, bodyTail). Entries are
delimited by mw-headline / ltitle headings within one page; headings whose
normalised key is in SKIP (contents, relatedtopics, audio, ...) are not
entries. The driver at top level reads three hardcoded files from
D:\\VOTReader-studio\\Downloaded Webssite Source and writes the JSON to a
hardcoded path, so a plain import runs the driver against the real files.

Stdlib unittest + exec only. The script is loaded by reading its source,
rewriting the hardcoded HTML_DIR and output paths to temp fixture files,
and exec'ing it in a fresh namespace, so no real downloaded HTML is read
and nothing is written outside the temp dir. HEAD_RE is defined but unused
(the loop uses inline regexes) — pinned by absence of a test, not fixed.

Run:  python -m unittest test_audit_fmtb_html -v   (from repo root)
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
_SRC = Path(_HERE, "tools", "_audit-fmtb-html.py").read_text(encoding="utf-8")

_DIR_TOKEN = r'''r"D:\VOTReader-studio\Downloaded Webssite Source"'''
_OUT_TOKEN = r'''r"D:\VOTReader-studio\tools\_audit-fmtb-html.json"'''

_FIXTURE = """<html><body>
<h2><span class="mw-headline" id="Contents">Contents</span></h2>
<p>toc stuff</p>
<h2><span class="mw-headline" id="First_Word">First Word</span></h2>
<p>First word body text here with several words to count.</p>
<h2><span class="mw-headline" id="Audio">Audio</span></h2>
<p>audio stuff</p>
<h2 class="ltitle">Second Word</h2>
<p>Second word body, a few more words in this paragraph here.</p>
<h2><span class="mw-headline" id="Empty"></span></h2>
<p>empty heading body</p>
<h2><span class="mw-headline" id="References">References</span></h2>
<p>refs</p>
</body></html>
"""


class _FmtbCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.html_dir = self.root / "html"
        self.html_dir.mkdir()
        self.out_path = self.root / "_audit-fmtb-html.json"

    def run_driver(self, fixture=_FIXTURE):
        """Exec the script against fixture HTML; return (ns, stdout, json)."""
        for stem in ("words_to_live_by_1", "words_to_live_by_2", "the_blessed"):
            (self.html_dir / (stem + ".html")).write_text(fixture, encoding="utf-8")
        src = _SRC.replace(_DIR_TOKEN, repr(str(self.html_dir)))
        src = src.replace(_OUT_TOKEN, repr(str(self.out_path)))
        ns = {"__name__": "audit_fmtb_html"}
        old_argv = sys.argv
        buf = io.StringIO()
        try:
            sys.argv = ["_audit-fmtb-html.py"]
            with contextlib.redirect_stdout(buf), warnings.catch_warnings():
                # The script reads its inputs with bare open(...).read(),
                # which leaves the files unclosed; silence that warning for
                # the exec — the leak is the script's, not the test's.
                warnings.simplefilter("ignore", ResourceWarning)
                exec(compile(src, "_audit-fmtb-html.py", "exec"), ns)
        finally:
            sys.argv = old_argv
        data = json.loads(self.out_path.read_text(encoding="utf-8"))
        return ns, buf.getvalue(), data


class DriverTest(_FmtbCase):
    def test_writes_all_three_labels(self):
        _, out, data = self.run_driver()
        self.assertEqual(sorted(data), ["The Blessed", "WTLB One", "WTLB Two"])
        for label, entries in data.items():
            self.assertEqual(len(entries), 2, label)
        self.assertIn("Extracted Format B HTML records:", out)
        self.assertIn("WTLB One: 2 sections", out)

    def test_skip_headings_excluded(self):
        _, _, data = self.run_driver()
        titles = [e["title"] for e in data["WTLB One"]]
        self.assertEqual(titles, ["First Word", "Second Word"])

    def test_empty_heading_skipped(self):
        _, _, data = self.run_driver()
        titles = [e["title"] for e in data["WTLB One"]]
        self.assertNotIn("", titles)

    def test_first_entry_words_head_tail(self):
        _, _, data = self.run_driver()
        e = data["WTLB One"][0]
        self.assertEqual(e["bodyWords"], 10)
        self.assertEqual(
            e["bodyHead"], "First word body text here with several words to count.")
        self.assertEqual(
            e["bodyTail"], "First word body text here with several words to count.")

    def test_ltitle_heading_is_entry(self):
        _, _, data = self.run_driver()
        e = data["WTLB One"][1]
        self.assertEqual(e["title"], "Second Word")
        self.assertEqual(e["bodyWords"], 11)
        self.assertEqual(
            e["bodyHead"],
            "Second word body, a few more words in this paragraph here.")
        self.assertEqual(
            e["bodyTail"],
            "Second word body, a few more words in this paragraph here.")

    def test_body_stops_at_next_heading(self):
        # "First Word" must not swallow the Audio section's text.
        _, _, data = self.run_driver()
        e = data["WTLB One"][0]
        self.assertNotIn("audio", e["bodyHead"].lower())
        self.assertEqual(e["bodyWords"], 10)


class HelperTest(_FmtbCase):
    def test_strip(self):
        ns, _, _ = self.run_driver()
        strip = ns["strip"]
        self.assertEqual(strip("<p>plain <b>bold</b></p>"), " plain  bold  ")
        self.assertEqual(
            strip('keep<sup class="reference"><a>[1]</a></sup> me'), "keep me")
        self.assertEqual(strip("fish &amp; chips"), "fish & chips")

    def test_norm(self):
        ns, _, _ = self.run_driver()
        self.assertEqual(ns["norm"]("  a   b\n c  "), "a b c")

    def test_keyf(self):
        ns, _, _ = self.run_driver()
        keyf = ns["keyf"]
        self.assertEqual(keyf("Related Topics"), "relatedtopics")
        self.assertEqual(keyf("Audio Recordings"), "audiorecordings")
        self.assertEqual(keyf(None), "")
        # keyf is what the SKIP check runs on, so a SKIP heading matches.
        self.assertIn(keyf("Related Topics"), ns["SKIP"])
        self.assertIn(keyf("Audio"), ns["SKIP"])


if __name__ == "__main__":
    unittest.main()
