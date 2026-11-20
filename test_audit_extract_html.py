"""Unit tests for tools/_audit-extract-html.py — the site-HTML extractor.

The script parses the downloaded website HTML (one file per collection)
into per-letter records (title, headerLines, bodyWords, footnotes,
relatedTopics) and writes tools/_audit-html.json. The parsers are pure
functions; the driver at top level reads ten hardcoded files from
D:\\VOTReader-studio\\Downloaded Webssite Source and writes the JSON to a
hardcoded path, so a plain import runs the driver against the real files.

Stdlib unittest + exec only. The script is loaded by reading its source,
rewriting the hardcoded HTML_DIR and output paths to temp fixture files,
and exec'ing it in a fresh namespace, so no real downloaded HTML is read
and nothing is written outside the temp dir. The parsers are exercised
both directly and through the driver. One pinned quirk: body_text's
header test misses "Spoken to Timothy" (header_lines catches it), so such
a header paragraph lands in the body word count.

Run:  python -m unittest test_audit_extract_html -v   (from repo root)
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
_SRC = Path(_HERE, "tools", "_audit-extract-html.py").read_text(encoding="utf-8")

_DIR_TOKEN = r'''r"D:\VOTReader-studio\Downloaded Webssite Source"'''
_OUT_TOKEN = r'''r"D:\VOTReader-studio\tools\_audit-html.json"'''

# Two <article> blocks with titles (ltitle + mw-headline shapes) and one
# titleless block, which the driver skips.
_FIXTURE = """<html><body>
<article id="a1">
<h2 class="ltitle">First Letter Title</h2>
<p style="text-align: justify">7/23/11<br>From YahuShua, Our Lord<br>A Parable Given to Timothy</p>
<p style="text-align: justify">Body paragraph one with some words here.</p>
<p style="text-align: center">Body paragraph two more words follow along.</p>
<li id="cite_note-1">↑ First footnote text.</li>
<li id="cite_note-2">↑ Second footnote text.</li>
<h2><span class="mw-headline" id="Related_Topics">Related Topics</span></h2>
<ul><li><a href="#">Topic One</a></li><li><a href="#">Topic Two</a></li></ul>
</article>
<article id="a2">
<h2><span class="mw-headline" id="Second_Letter">Second Letter Title</span></h2>
<p style="text-align: justify">Spoken to Timothy<br>Second header line</p>
<p style="text-align: justify">Second body text here.</p>
</article>
<article id="a3">
<p style="text-align: justify">No title here at all.</p>
</article>
</body></html>
"""

# Body paragraph one (7 words) + paragraph two (7 words) = 14 words.
_A1_BODY = ("Body paragraph one with some words here. "
            "Body paragraph two more words follow along.")


class _ExtractCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.html_dir = self.root / "html"
        self.html_dir.mkdir()
        self.out_path = self.root / "_audit-html.json"

    def run_driver(self, argv=None, fixture=_FIXTURE):
        """Exec the script against fixture HTML; return (ns, stdout, json)."""
        import re
        stems = re.findall(r'"(\w+)":', _SRC.split("FILES = {")[1].split("}")[0])
        for stem in stems:
            (self.html_dir / (stem + ".html")).write_text(fixture, encoding="utf-8")
        src = _SRC.replace(_DIR_TOKEN, repr(str(self.html_dir)))
        src = src.replace(_OUT_TOKEN, repr(str(self.out_path)))
        ns = {"__name__": "audit_extract_html"}
        old_argv = sys.argv
        buf = io.StringIO()
        try:
            sys.argv = ["_audit-extract-html.py"] + (argv or [])
            with contextlib.redirect_stdout(buf), warnings.catch_warnings():
                # The script reads its inputs with bare open(...).read(),
                # which leaves the files unclosed; silence that warning for
                # the exec — the leak is the script's, not the test's.
                warnings.simplefilter("ignore", ResourceWarning)
                exec(compile(src, "_audit-extract-html.py", "exec"), ns)
        finally:
            sys.argv = old_argv
        data = json.loads(self.out_path.read_text(encoding="utf-8"))
        return ns, buf.getvalue(), data


class DriverTest(_ExtractCase):
    def test_writes_all_collections(self):
        _, out, data = self.run_driver()
        self.assertEqual(sorted(data), [
            "Letters from Timothy", "Letters to the Flock",
            "The Lord's Rebuke", "Volume Five", "Volume Four",
            "Volume One", "Volume Seven", "Volume Six",
            "Volume Three", "Volume Two"])
        for label, letters in data.items():
            self.assertEqual(len(letters), 2, label)
        self.assertIn("Extracted HTML records:", out)
        self.assertIn("Volume One: 2 letters", out)

    def test_titles_both_shapes(self):
        _, _, data = self.run_driver()
        titles = [r["title"] for r in data["Volume One"]]
        self.assertEqual(titles, ["First Letter Title", "Second Letter Title"])

    def test_titleless_article_skipped(self):
        _, _, data = self.run_driver()
        self.assertEqual(len(data["Volume One"]), 2)

    def test_first_letter_record(self):
        _, _, data = self.run_driver()
        r = data["Volume One"][0]
        self.assertEqual(r["headerLines"], [
            "7/23/11", "From YahuShua, Our Lord", "A Parable Given to Timothy"])
        self.assertEqual(r["bodyWords"], 14)
        self.assertEqual(r["bodyHead"], " ".join(_A1_BODY.split()[:12]))
        self.assertEqual(r["bodyTail"], " ".join(_A1_BODY.split()[-12:]))
        self.assertEqual(r["fnCount"], 2)
        self.assertEqual(r["footnotes"], [
            {"n": "1", "text": "First footnote text."},
            {"n": "2", "text": "Second footnote text."}])
        self.assertEqual(r["relatedTopics"], ["Topic One", "Topic Two"])

    def test_second_letter_record(self):
        _, _, data = self.run_driver()
        r = data["Volume One"][1]
        self.assertEqual(r["headerLines"], ["Spoken to Timothy", "Second header line"])
        # body_text's header test misses "Spoken to Timothy", so the header
        # paragraph is counted as body: 6 header words + 4 body words.
        self.assertEqual(r["bodyWords"], 10)
        self.assertEqual(r["fnCount"], 0)
        self.assertEqual(r["footnotes"], [])
        self.assertEqual(r["relatedTopics"], [])

    def test_sample_flag_prints_second_record(self):
        _, out, _ = self.run_driver(argv=["--sample"])
        self.assertIn("Second Letter Title", out)


class ParserTest(_ExtractCase):
    def test_strip_tags(self):
        ns, _, _ = self.run_driver()
        strip = ns["strip_tags"]
        self.assertEqual(strip("a<br>b"), "a\nb")
        self.assertEqual(strip("a<br/>b"), "a\nb")
        self.assertEqual(
            strip('keep<sup class="reference"><a>[1]</a></sup> me'), "keep me")
        self.assertEqual(
            strip('keep <a class="external autonumber" href="#">[3]</a> me'),
            "keep  me")
        self.assertEqual(strip("fish &amp; chips"), "fish & chips")
        self.assertEqual(strip("<p>plain <b>bold</b></p>"), "plain bold")

    def test_norm(self):
        ns, _, _ = self.run_driver()
        self.assertEqual(ns["norm"]("  a   b\n c  "), "a b c")
        self.assertEqual(ns["norm"](""), "")

    def test_get_title(self):
        ns, _, _ = self.run_driver()
        get_title = ns["get_title"]
        self.assertEqual(get_title('<h2 class="ltitle">My Title</h2>'), "My Title")
        self.assertEqual(
            get_title('<h2><span class="mw-headline" id="X">Other</span></h2>'),
            "Other")
        self.assertIsNone(get_title('<h2 class="other">Nope</h2>'))
        self.assertIsNone(get_title("no headings at all"))

    def test_header_lines_empty_without_date_or_attribution(self):
        ns, _, _ = self.run_driver()
        art = ('<p style="text-align: justify">Just a paragraph<br>Second line</p>')
        self.assertEqual(ns["header_lines"](art), [])

    def test_body_text_empty_without_paragraphs(self):
        ns, _, _ = self.run_driver()
        self.assertEqual(ns["body_text"]("<p>nothing aligned</p>"), ("", 0))

    def test_footnotes_empty(self):
        ns, _, _ = self.run_driver()
        self.assertEqual(ns["footnotes"]("<p>no notes</p>"), [])

    def test_related_topics_empty(self):
        ns, _, _ = self.run_driver()
        self.assertEqual(ns["related_topics"]("<p>no topics</p>"), [])


if __name__ == "__main__":
    unittest.main()
