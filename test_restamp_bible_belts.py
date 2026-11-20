"""Unit tests for tools/restamp-bible-belts.py — re-key alignment belts
after a CASE-ONLY corpus edit.

The script is a one-shot tool: at top level it reconfigures stdout, loads
tools/batch-align-bible.py (EDITIONS) and tools/_alignlib.py (sha10), then
compares each belt's versesHash against the hash of the OLD text (from
--old-data) and the NEW text (from app/src/main/assets/src/data/
bible-<translation>.js) and, for a belt aligned to exactly the old text
whose text differs only in letter case, restamps it to the new hash.
Dry run by default; --apply writes. A belt whose hash is neither old nor
new, whose text differs beyond case, or whose chapter is missing from
either corpus is reported, untouched, and the run exits 1.

Stdlib unittest + exec only. The script is loaded by reading its source and
exec'ing it in a fresh namespace with __file__ pointed at a temp tools dir,
so BASE (and DATA, which falls out of it) land in a temp tree that mirrors
the repo: a stub batch-align-bible.py (EDITIONS only — the real one loads
hone-bible.py at import) plus fixture belts, and fixture old/new flat
bible-kjv.js files. The REAL _alignlib is preloaded into sys.modules, so
sha10 is the project's own. The script reads and writes files with bare
open() calls, which leave them unclosed; the exec filters that
ResourceWarning (the leak is the script's, not the test's).

Run:  python -m unittest test_restamp_bible_belts -v   (from repo root)
"""

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = Path(_HERE, "tools", "restamp-bible-belts.py").read_text(encoding="utf-8")

# The real _alignlib, preloaded so the exec'd script's `import _alignlib`
# resolves to the project's own sha10 (stdlib-only import: difflib,
# hashlib, json, os, re, subprocess, sys, unicodedata).
_AL_SPEC = importlib.util.spec_from_file_location(
    "_alignlib", Path(_HERE, "tools", "_alignlib.py"))
_AL = importlib.util.module_from_spec(_AL_SPEC)
_AL_SPEC.loader.exec_module(_AL)
sys.modules.setdefault("_alignlib", _AL)

_BAB_STUB = '''\
EDITIONS = {"brm-kjv": {"translation": "kjv"},
            "wop-nkjv": {"translation": "nkjv"}}
'''

_OLD = {
    "genesis": {
        "1": [{"n": 1, "text": "In the beginning God created the heaven and the earth."},
              {"n": 2, "text": "And the earth was without form, and void."}],
        "2": [{"n": 1, "text": "Thus the heavens and the earth were finished."}],
        "3": [{"n": 1, "text": "Now the serpent was more subtil than any beast."}],
        "4": [{"n": 2, "text": "Second verse first."},
              {"n": 1, "text": "First verse second."}],
    },
    "matthew-plain": {
        "1": [{"n": 1, "text": "The book of the generation of Jesus Christ."},
              {"n": 2, "text": "Abraham begat Isaac."}],
    },
}

_NEW = {
    "genesis": {
        "1": [{"n": 1, "text": "In the beginning GOD created the heaven and the earth."},
              {"n": 2, "text": "And the earth was without form, and void."}],
        "2": [{"n": 1, "text": "Thus the heavens and the earth were finished."}],
        "3": [{"n": 1, "text": "Now the serpent was more crafty than any beast."}],
        "4": [{"n": 2, "text": "Second verse first."},
              {"n": 1, "text": "First verse second."}],
    },
    "matthew-plain": {
        "1": [{"n": 1, "text": "The book of the generation of JESUS CHRIST."},
              {"n": 2, "text": "Abraham begat Isaac."}],
    },
}


class _ReconfigStringIO(io.StringIO):
    """StringIO with the no-op reconfigure() the scripts call at import."""

    def reconfigure(self, *a, **k):
        pass


class _RestampCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.tools = self.root / "tools"
        self.belts = self.tools / "_align-work" / "bible" / "brm-kjv"
        self.belts.mkdir(parents=True)
        (self.tools / "batch-align-bible.py").write_text(
            _BAB_STUB, encoding="utf-8")
        self.data = (self.root / "app" / "src" / "main" / "assets" / "src"
                     / "data")
        self.data.mkdir(parents=True)
        self.old_path = self.root / "bible-kjv-old.js"
        self.old_path.write_text(
            "var BIBLE_KJV = " + json.dumps(_OLD) + ";", encoding="utf-8")
        (self.data / "bible-kjv.js").write_text(
            "var BIBLE_KJV = " + json.dumps(_NEW) + ";", encoding="utf-8")

    def _rows(self, flat, book, ch):
        rows = flat.get("matthew-plain" if book == "matthew" else book,
                        {}).get(str(ch))
        return sorted(([r["n"], str(r["text"])] for r in rows),
                      key=lambda r: r[0])

    def _vhash(self, rows):
        return _AL.sha10(json.dumps(rows, ensure_ascii=False,
                                    separators=(",", ":")))

    def _set_belt(self, name, book, ch, verses_hash):
        d = {"bookId": book, "chapter": ch,
             "verses": [{"n": 1, "status": "CONFIRMED"}],
             "versesHash": verses_hash}
        p = self.belts / name
        p.write_text(json.dumps(d), encoding="utf-8")
        return p

    def _read_belt(self, name):
        return json.loads((self.belts / name).read_text(encoding="utf-8"))

    def run_restamp(self, argv):
        """Exec the script against the fixtures; return (rc, stdout)."""
        ns = {"__name__": "restamp_bible_belts",
              "__file__": str(self.tools / "restamp-bible-belts.py")}
        old_argv = sys.argv
        buf = _ReconfigStringIO()
        try:
            sys.argv = ["restamp-bible-belts.py", *argv]
            with contextlib.redirect_stdout(buf), warnings.catch_warnings():
                warnings.simplefilter("ignore", ResourceWarning)
                exec(compile(_SRC, "restamp-bible-belts.py", "exec"), ns)
                rc = ns["main"]()
        finally:
            sys.argv = old_argv
        return rc, buf.getvalue()

    def load_ns(self):
        """Exec the script without running main(); return the namespace."""
        ns = {"__name__": "restamp_bible_belts",
              "__file__": str(self.tools / "restamp-bible-belts.py")}
        buf = _ReconfigStringIO()
        with contextlib.redirect_stdout(buf), warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            exec(compile(_SRC, "restamp-bible-belts.py", "exec"), ns)
        return ns

    def _base_argv(self, *extra):
        return ["--edition", "brm-kjv", "--old-data", str(self.old_path),
                *extra]

    def _clean_belts(self):
        """One restampable, one matthew, one already-current belt."""
        self._set_belt("genesis_001.json", "genesis", 1,
                       self._vhash(self._rows(_OLD, "genesis", 1)))
        self._set_belt("matthew_001.json", "matthew", 1,
                       self._vhash(self._rows(_OLD, "matthew", 1)))
        self._set_belt("genesis_002.json", "genesis", 2,
                       self._vhash(self._rows(_NEW, "genesis", 2)))


class FlatMapTest(_RestampCase):
    def _flat_map(self, ns, path, translation):
        # flat_map() reads with a bare open(), which leaves the file
        # unclosed; filter that ResourceWarning at the call site — the
        # leak is the script's, not the test's.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            return ns["flat_map"](path, translation)

    def test_flat_map_reads_prefixed_json(self):
        ns = self.load_ns()
        self.assertEqual(self._flat_map(ns, str(self.old_path), "kjv"),
                         _OLD)

    def test_flat_map_rejects_wrong_prefix(self):
        ns = self.load_ns()
        bad = self.root / "bible-asv.js"
        bad.write_text("var BIBLE_ASV = {}; ", encoding="utf-8")
        with self.assertRaises(SystemExit) as cm:
            self._flat_map(ns, str(bad), "kjv")
        self.assertIn("not a flat translation file", str(cm.exception))

    def test_flat_map_accepts_no_trailing_semicolon(self):
        ns = self.load_ns()
        plain = self.root / "bible-kjv-plain.js"
        plain.write_text("var BIBLE_KJV = " + json.dumps(_OLD),
                         encoding="utf-8")
        self.assertEqual(self._flat_map(ns, str(plain), "kjv"), _OLD)


class ChapterRowsTest(_RestampCase):
    def test_chapter_rows_sorts_by_verse_number(self):
        ns = self.load_ns()
        self.assertEqual(ns["chapter_rows"](_OLD, "genesis", 4),
                         [[1, "First verse second."],
                          [2, "Second verse first."]])

    def test_chapter_rows_maps_matthew_to_matthew_plain(self):
        ns = self.load_ns()
        self.assertEqual(ns["chapter_rows"](_OLD, "matthew", 1),
                         [[1, "The book of the generation of Jesus Christ."],
                          [2, "Abraham begat Isaac."]])

    def test_chapter_rows_missing_returns_none(self):
        ns = self.load_ns()
        self.assertIsNone(ns["chapter_rows"](_OLD, "genesis", 99))
        self.assertIsNone(ns["chapter_rows"](_OLD, "obadiah", 1))


class VhashTest(_RestampCase):
    def test_vhash_is_sha10_of_canonical_rows(self):
        ns = self.load_ns()
        rows = self._rows(_OLD, "genesis", 1)
        want = _AL.sha10(json.dumps(rows, ensure_ascii=False,
                                    separators=(",", ":")))
        self.assertEqual(ns["vhash"](rows), want)
        self.assertEqual(ns["vhash"](rows), ns["vhash"](rows))


class DryRunTest(_RestampCase):
    def test_dry_run_counts_and_changes_nothing(self):
        self._clean_belts()
        rc, out = self.run_restamp(self._base_argv())
        self.assertEqual(rc, 0)
        self.assertIn("brm-kjv: 3 belts -- already current 1, "
                      "would restamp 2, not case-only 0, "
                      "stale before the edit 0, no chapter 0  (DRY RUN)",
                      out)
        self.assertEqual(
            self._read_belt("genesis_001.json")["versesHash"],
            self._vhash(self._rows(_OLD, "genesis", 1)))
        self.assertNotIn("restamped", self._read_belt("genesis_001.json"))


class ApplyTest(_RestampCase):
    def test_apply_restamps_and_records(self):
        self._clean_belts()
        rc, out = self.run_restamp(self._base_argv("--apply"))
        self.assertEqual(rc, 0)
        self.assertIn("brm-kjv: 3 belts -- already current 1, "
                      "restamped 2, not case-only 0, "
                      "stale before the edit 0, no chapter 0  (APPLIED)",
                      out)
        gen = self._read_belt("genesis_001.json")
        self.assertEqual(
            gen["versesHash"], self._vhash(self._rows(_NEW, "genesis", 1)))
        self.assertEqual(gen["restamped"], {
            "from": self._vhash(self._rows(_OLD, "genesis", 1)),
            "to": self._vhash(self._rows(_NEW, "genesis", 1)),
            "reason": "case-only corpus edit",
            "tool": "restamp-bible-belts.py"})
        mat = self._read_belt("matthew_001.json")
        self.assertEqual(
            mat["versesHash"], self._vhash(self._rows(_NEW, "matthew", 1)))
        cur = self._read_belt("genesis_002.json")
        self.assertNotIn("restamped", cur)
        self.assertEqual(
            cur["versesHash"], self._vhash(self._rows(_NEW, "genesis", 2)))


class ProblemsTest(_RestampCase):
    def test_problems_return_1_and_name_each(self):
        self._set_belt("genesis_001.json", "genesis", 1, "deadbeef00")
        self._set_belt("genesis_003.json", "genesis", 3,
                       self._vhash(self._rows(_OLD, "genesis", 3)))
        self._set_belt("obadiah_001.json", "obadiah", 1, "deadbeef00")
        # Skipped by name or shape; none of these counts as a belt.
        (self.belts / "CAMPAIGN_001.json").write_text("{}", encoding="utf-8")
        (self.belts / "progress.json").write_text("{}", encoding="utf-8")
        (self.belts / "audio-index.json").write_text("{}", encoding="utf-8")
        (self.belts / "genesis_001.tx.json").write_text(
            "{}", encoding="utf-8")
        (self.belts / "genesis_001.wav.json").write_text(
            "{}", encoding="utf-8")
        (self.belts / "notes.txt").write_text("not json", encoding="utf-8")
        (self.belts / "bad.json").write_text("[]", encoding="utf-8")
        (self.belts / "nokeys.json").write_text(
            json.dumps({"bookId": "genesis", "chapter": 1}),
            encoding="utf-8")
        rc, out = self.run_restamp(self._base_argv())
        self.assertEqual(rc, 1)
        self.assertIn("brm-kjv: 3 belts -- already current 0, "
                      "would restamp 0, not case-only 1, "
                      "stale before the edit 1, no chapter 1  (DRY RUN)",
                      out)
        self.assertIn("belt hash deadbeef00 is neither old", out)
        self.assertIn("needs a re-align", out)
        self.assertIn("text differs beyond letter case: needs a re-align",
                      out)
        self.assertIn("chapter missing from old or new corpus", out)


class NkjvTest(_RestampCase):
    def test_nkjv_edition_refused(self):
        with self.assertRaises(SystemExit) as cm:
            self.run_restamp(["--edition", "wop-nkjv", "--old-data",
                              str(self.old_path)])
        self.assertIn("nkjv is Format C", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
