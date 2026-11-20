"""Unit tests for tools/vot-es-report.py — the Spanish mirror completeness report.

The report measures the Spanish mirror (fetched posts + standalone pages) against
this repo's English corpus: it categorises each post from the section-index
membership (never from the per-post "category" field — that selector picked up a
sidebar link and labelled 350 of 352 posts Part Two), counts the English side
from the app's own data files, and writes SPANISH.json + SPANISH-GAP.md.

The two puppeteer scrapers in this item (vot-es-membership.mjs, vot-es-pages.mjs)
have no testable core — top-level await, live Wix, zero exports — and are
escalated in LOG.md, not tested here.

Stdlib unittest + importlib only. The module is loaded from
tools/vot-es-report.py and its path globals (ES/POSTS/DATA) are pointed at temp
fixture dirs, so no real _ocr_out data is read or written and nothing touches
the network. main() calls sys.stdout.reconfigure(), which io.StringIO lacks,
so stdout is captured with a StringIO subclass that adds a no-op reconfigure.

Run:  python -m unittest test_vot_es_report -v   (from repo root)
"""

import contextlib
import importlib.util
import io
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "vot_es_report", os.path.join(_HERE, "tools", "vot-es-report.py")
)
report = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(report)


class _CapturedStdout(io.StringIO):
    """StringIO with the reconfigure() main() calls (a real stdout has it)."""

    def reconfigure(self, *args, **kwargs):
        return None


def _post(slug, words, title="T"):
    return {
        "slug": slug,
        "title": title,
        "url": "https://losvolumenes.wixsite.com/los-volumenes/post/" + slug,
        "words": words,
        "paragraphs": ["para one", "para two"],
    }


class ReportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.es = self.root / "_ocr_out" / "spanish"
        self.posts = self.es / "posts"
        self.pages = self.es / "pages"
        self.data = self.root / "app" / "src" / "main" / "assets" / "src" / "data"
        for d in (self.posts, self.pages, self.data):
            d.mkdir(parents=True)
        self._orig = (report.ES, report.POSTS, report.DATA)
        report.ES, report.POSTS, report.DATA = self.es, self.posts, self.data
        self.addCleanup(self._restore_paths)
        self.addCleanup(self.tmp.cleanup)

    def _restore_paths(self):
        report.ES, report.POSTS, report.DATA = self._orig

    def _write_data(self, one=2, two=2, blessed=3):
        # wtlb-one: quoted "num": N form; wtlb-two: bare num: N form.
        (self.data / "wtlb-one.js").write_text(
            "export const WTLB_ONE = [\n"
            + "".join('  {"num": %d, "title": "A"},\n' % n for n in range(1, one + 1))
            + "];\n",
            encoding="utf-8",
        )
        (self.data / "wtlb-two.js").write_text(
            "export const WTLB_TWO = [\n"
            + "".join('  {num: %d, title: "B"},\n' % n for n in range(1, two + 1))
            + "];\n",
            encoding="utf-8",
        )
        (self.data / "the-blessed.js").write_text(
            "export const BLESSED = [\n"
            + "".join('  {"num": %d},\n' % n for n in range(1, blessed + 1))
            + "];\n",
            encoding="utf-8",
        )

    def _write_posts(self, posts, membership=("CARTA-UNO",), losbendecidos=True):
        for p in posts:
            (self.posts / (p["slug"] + ".json")).write_text(
                json.dumps(p), encoding="utf-8"
            )
        if membership is not None:
            (self.es / "MEMBERSHIP.json").write_text(
                json.dumps({"parte1": list(membership)}), encoding="utf-8"
            )
        if losbendecidos:
            (self.pages / "losbendecidos.json").write_text(
                json.dumps(
                    {
                        "name": "losbendecidos",
                        "url": "https://losvolumenes.wixsite.com/los-volumenes/losbendecidos",
                        "title": "Los Bendecidos",
                        "headings": ["Intro", "One", "Two", "Three"],
                        "paragraphs": ["p1", "p2"],
                        "words": 400,
                        "postLinks": 2,
                    }
                ),
                encoding="utf-8",
            )

    def _run_main(self):
        buf = _CapturedStdout()
        with contextlib.redirect_stdout(buf):
            rc = report.main()
        return rc, buf.getvalue()

    def _read_manifest(self):
        return json.loads((self.es / "SPANISH.json").read_text(encoding="utf-8"))

    def _read_gap(self):
        return (self.es / "SPANISH-GAP.md").read_text(encoding="utf-8")

    def test_english_counts_both_num_forms_and_missing_file_skipped(self):
        self._write_data(one=2, two=2, blessed=0)
        (self.data / "the-blessed.js").unlink()
        self.assertEqual(
            report.english_counts(),
            {"wtlb-one.js": 2, "wtlb-two.js": 2},
        )

    def test_main_happy_path(self):
        self._write_data()
        self._write_posts(
            [_post("carta-uno", 100), _post("carta-dos", 50), _post("carta-corta", 5)]
        )
        rc, _out = self._run_main()
        self.assertEqual(rc, 0)

        manifest = self._read_manifest()
        self.assertEqual(manifest["source"], "https://losvolumenes.wixsite.com/los-volumenes")
        self.assertEqual(manifest["language"], "es")
        self.assertEqual(manifest["posts"], 3)
        self.assertEqual(manifest["total_words"], 155)
        self.assertEqual(manifest["categories"], {"": 1, "parte-2": 2})
        self.assertEqual(
            manifest["english_baseline"],
            {"wtlb-one.js": 2, "wtlb-two.js": 2, "the-blessed.js": 3},
        )
        self.assertEqual(
            manifest["standalone_pages"]["losbendecidos"]["words"], 400
        )
        self.assertEqual(
            manifest["standalone_pages"]["losbendecidos"]["headings"],
            ["Intro", "One", "Two", "Three"],
        )
        by_slug = {e["slug"]: e for e in manifest["entries"]}
        self.assertEqual(
            by_slug["carta-uno"]["collection"], "Words to Live By: Part One"
        )
        self.assertEqual(by_slug["carta-uno"]["collection_source"], "parte1 index")
        self.assertEqual(
            by_slug["carta-dos"]["collection"], "Words to Live By: Part Two"
        )
        self.assertEqual(
            by_slug["carta-dos"]["collection_source"], "remainder (not on parte1 index)"
        )
        self.assertEqual(by_slug["carta-corta"]["scraped_category_UNRELIABLE"], "")
        self.assertEqual(by_slug["carta-corta"]["words"], 5)

        gap = self._read_gap()
        self.assertIn("- posts fetched: **3**", gap)
        self.assertIn("- total words: **155**", gap)
        self.assertIn("- median words/entry: 50", gap)
        self.assertIn("- entries under 20 words (suspect renders): **1**", gap)
        self.assertIn(
            "| `parte-2` | Words to Live By: Part Two | 2 | 2 | 0 |", gap
        )
        self.assertIn(
            "| `(none)` | Words to Live By: Part One | 1 | 2 | 1 |", gap
        )
        self.assertIn(
            "- rendered as one page with **4 headings**, 400 words, 2 blog links",
            gap,
        )
        self.assertIn("4 vs 4 — match", gap)
        self.assertIn("## Suspect entries (<20 words)", gap)
        self.assertIn("- `carta-corta` — 5 words — https://", gap)
        self.assertIn(
            "- none — every English WTLB/Blessed collection is present in the Spanish mirror.",
            gap,
        )

    def test_main_membership_percent_decoding(self):
        # MEMBERSHIP.json comes from index-page hrefs; a %2D entry must match
        # the plain slug, the same way the case-insensitive match does.
        self._write_data()
        self._write_posts([_post("carta-tres", 80)], membership=("carta%2Dtres",))
        rc, _out = self._run_main()
        self.assertEqual(rc, 0)
        manifest = self._read_manifest()
        self.assertEqual(manifest["categories"], {"": 1})
        self.assertEqual(
            manifest["entries"][0]["collection"], "Words to Live By: Part One"
        )

    def test_main_no_membership_file_means_all_parte2(self):
        self._write_data()
        self._write_posts(
            [_post("carta-uno", 100), _post("carta-dos", 50)], membership=None
        )
        rc, _out = self._run_main()
        self.assertEqual(rc, 0)
        manifest = self._read_manifest()
        self.assertEqual(manifest["categories"], {"parte-2": 2})
        for e in manifest["entries"]:
            self.assertEqual(e["collection"], "Words to Live By: Part Two")
            self.assertEqual(
                e["collection_source"], "remainder (not on parte1 index)"
            )

    def test_main_no_posts_dir_exits_with_message(self):
        shutil.rmtree(self.posts)
        with self.assertRaises(SystemExit) as cm:
            self._run_main()
        self.assertIn("no Spanish posts yet", str(cm.exception))

    def test_main_no_pages_dir_lists_blessed_missing(self):
        self._write_data()
        self._write_posts(
            [_post("carta-uno", 100), _post("carta-dos", 50)],
            losbendecidos=False,
        )
        shutil.rmtree(self.pages)
        rc, _out = self._run_main()
        self.assertEqual(rc, 0)
        manifest = self._read_manifest()
        self.assertEqual(manifest["standalone_pages"], {})
        gap = self._read_gap()
        self.assertNotIn("Los Bendecidos", gap)
        self.assertIn("- `the-blessed.js` (3 entries)", gap)

    def test_main_empty_posts_dir(self):
        self._write_data()
        rc, _out = self._run_main()
        self.assertEqual(rc, 0)
        manifest = self._read_manifest()
        self.assertEqual(manifest["posts"], 0)
        self.assertEqual(manifest["total_words"], 0)
        self.assertEqual(manifest["categories"], {})
        gap = self._read_gap()
        self.assertIn("- posts fetched: **0**", gap)
        self.assertNotIn("median words/entry", gap)
        self.assertNotIn("Suspect entries", gap)


if __name__ == "__main__":
    unittest.main()
