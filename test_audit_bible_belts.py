"""Unit tests for tools/audit-bible-belts.py — what the alignment belts say
about the chapter CUTS.

The script is a one-shot audit: at top level it reconfigures stdout, loads
tools/batch-align-bible.py (EDITIONS + audio_index + proven_share) and
tools/_alignlib.py (settings_hash / settings_for), then walks the edition's
audio index against the belt JSONs in tools/_align-work/bible/<edition>/
and prints the leading/trailing/inner UNSPOKEN runs, the below-0.90 list
and a one-line verdict. Read-only.

Stdlib unittest + exec only. The script is loaded by reading its source and
exec'ing it in a fresh namespace with __file__ pointed at a temp tools dir
holding a stub batch-align-bible.py (EDITIONS + audio_index + proven_share,
the last with the real counting logic) and fixture belts + audio files, so
no real D:/BibleAudio file is read and nothing is written. The REAL
_alignlib is preloaded into sys.modules, so settings_hash / settings_for
are the project's own. The script reads belt files with bare
json.load(open(...)), which leaves them unclosed; the exec filters that
ResourceWarning (the leak is the script's, not the test's).

Run:  python -m unittest test_audit_bible_belts -v   (from repo root)
"""

import contextlib
import importlib.util
import io
import json
import os
import re
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = Path(_HERE, "tools", "audit-bible-belts.py").read_text(encoding="utf-8")

# The real _alignlib, preloaded so the exec'd script's `import _alignlib`
# resolves to the project's own settings_hash / settings_for (stdlib-only
# import: difflib, hashlib, json, os, re, subprocess, sys, unicodedata).
_AL_SPEC = importlib.util.spec_from_file_location(
    "_alignlib", Path(_HERE, "tools", "_alignlib.py"))
_AL = importlib.util.module_from_spec(_AL_SPEC)
_AL_SPEC.loader.exec_module(_AL)
sys.modules.setdefault("_alignlib", _AL)

_BAB_STUB = '''\
import json
import os


EDITIONS = {"brm-kjv": {"family": "bible-brm-kjv", "translation": "kjv"}}


def audio_index(ed):
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "_audio-index.json"), encoding="utf-8") as f:
        return {(b, c): (p, a) for b, c, p, a in json.load(f)}


def _is_proven(row):
    return row.get("status") == "CONFIRMED" or str(
        row.get("status", "")).startswith("PROBED")


def proven_share(belt):
    rows = belt.get("verses") or []
    if not rows:
        return 0.0
    return sum(1 for r in rows if _is_proven(r)) / len(rows)
'''


class _ReconfigStringIO(io.StringIO):
    """StringIO with the no-op reconfigure() the scripts call at import."""

    def reconfigure(self, *a, **k):
        pass


def _belt(book, ch, statuses, settings_hash=None, audio_size=None):
    d = {"bookId": book, "chapter": ch,
         "verses": [{"n": i + 1, "status": s}
                    for i, s in enumerate(statuses)]}
    if settings_hash is not None:
        d["settings_hash"] = settings_hash
    if audio_size is not None:
        d["audioSize"] = audio_size
    return d


class _AuditCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.tools = self.root / "tools"
        self.belts = self.tools / "_align-work" / "bible" / "brm-kjv"
        self.belts.mkdir(parents=True)
        (self.tools / "batch-align-bible.py").write_text(
            _BAB_STUB, encoding="utf-8")
        self.audio = self.root / "audio"
        self.audio.mkdir()
        self.want = _AL.settings_hash(_AL.settings_for("bible-brm-kjv"))

    def _audio_file(self, name, data):
        p = self.audio / name
        p.write_bytes(data)
        return str(p)

    def _set_index(self, entries):
        (self.tools / "_audio-index.json").write_text(
            json.dumps(entries), encoding="utf-8")

    def _set_belt(self, name, belt):
        (self.belts / name).write_text(json.dumps(belt), encoding="utf-8")

    def run_audit(self, argv=()):
        """Exec the script against the fixtures; return (rc, stdout)."""
        ns = {"__name__": "audit_bible_belts",
              "__file__": str(self.tools / "audit-bible-belts.py")}
        old_argv = sys.argv
        buf = _ReconfigStringIO()
        try:
            sys.argv = ["audit-bible-belts.py", *argv]
            with contextlib.redirect_stdout(buf), warnings.catch_warnings():
                warnings.simplefilter("ignore", ResourceWarning)
                exec(compile(_SRC, "audit-bible-belts.py", "exec"), ns)
                rc = ns["main"]()
        finally:
            sys.argv = old_argv
        return rc, buf.getvalue()

    def load_ns(self):
        """Exec the script without running main(); return the namespace."""
        ns = {"__name__": "audit_bible_belts",
              "__file__": str(self.tools / "audit-bible-belts.py")}
        buf = _ReconfigStringIO()
        with contextlib.redirect_stdout(buf), warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            exec(compile(_SRC, "audit-bible-belts.py", "exec"), ns)
        return ns


class LoadTest(_AuditCase):
    def test_load_imports_a_module_from_a_path(self):
        ns = self.load_ns()
        mod_path = self.root / "tiny_mod.py"
        mod_path.write_text("VALUE = 41\n", encoding="utf-8")
        m = ns["load"](str(mod_path), "tiny_mod")
        self.assertEqual(m.VALUE, 41)


class VerdictTest(_AuditCase):
    def _happy(self):
        gen = self._audio_file("genesis_001.mp3", b"GEN1")
        exo = self._audio_file("exodus_002.mp3", b"EXODUS2")
        lev = self._audio_file("leviticus_003.mp3", b"LEV")
        num = self._audio_file("numbers_004.mp3", b"NUMBERS4")
        self._set_index([["genesis", 1, gen, "brm1_genesis_001"],
                         ["exodus", 2, exo, "brm1_exodus_002"],
                         ["leviticus", 3, lev, "brm1_leviticus_003"],
                         ["numbers", 4, num, "brm1_numbers_004"]])
        self._set_belt("genesis_001.json", _belt(
            "genesis", 1, ["UNSPOKEN", "UNSPOKEN", "CONFIRMED", "REVIEW",
                           "UNSPOKEN"], self.want, 4))
        self._set_belt("exodus_002.json", _belt(
            "exodus", 2, ["CONFIRMED"] * 4, self.want, 7))
        self._set_belt("leviticus_003.json", _belt(
            "leviticus", 3, ["UNSPOKEN"] * 3, "stalehash", 3))
        return self.run_audit()

    def test_verdict_line_counts(self):
        rc, out = self._happy()
        self.assertEqual(rc, 0)
        self.assertIn("brm-kjv: 3 belts, 1 chapters without a belt, "
                      "1 belts not current for the audio on disk", out)
        self.assertIn("  no belt: numbers_004", out)

    def test_leading_and_trailing_sections(self):
        _, out = self._happy()
        self.assertIn("leading UNSPOKEN (file starts late / previous file "
                      "ends late): 2", out)
        self.assertIn("trailing UNSPOKEN (file ends early / next file "
                      "starts early): 2", out)
        self.assertRegex(
            out, r"genesis\s+ch\s+1\s+first 2 of 5 verses unspoken"
                 r"\s+proven 0\.200")
        self.assertRegex(
            out, r"leviticus\s+ch\s+3\s+last 3 of 3 verses unspoken"
                 r"\s+proven 0\.000\s+\(belt stale\)")

    def test_inner_unspoken_and_low_sections(self):
        _, out = self._happy()
        self.assertIn("UNSPOKEN inside the chapter (reader skipped text, "
                      "or transcript miss): 0", out)
        self.assertIn("below the 0.90 silent-ship bar: 2  "
                      "(below the 0.60 gate: 2)", out)
        self.assertIn("  0.200  genesis_001  5v  unspoken 3  review 1", out)
        self.assertIn("verses 12  unspoken 6  review 1  mean proven 0.4000",
                      out)


class InnerTest(_AuditCase):
    def test_inner_unspoken_counted(self):
        p = self._audio_file("john_001.mp3", b"JOHN1")
        self._set_index([["john", 1, p, "brm1_john_001"]])
        self._set_belt("john_001.json", _belt(
            "john", 1, ["CONFIRMED", "UNSPOKEN", "CONFIRMED"],
            self.want, 5))
        rc, out = self.run_audit()
        self.assertEqual(rc, 0)
        self.assertIn("UNSPOKEN inside the chapter (reader skipped text, "
                      "or transcript miss): 1", out)
        self.assertRegex(
            out, r"john\s+ch\s+1\s+1 inner unspoken of 3\s+proven 0\.667")


class CurrentTest(_AuditCase):
    def test_stale_by_audio_size(self):
        p = self._audio_file("mark_001.mp3", b"MARK1")
        self._set_index([["mark", 1, p, "brm1_mark_001"]])
        self._set_belt("mark_001.json", _belt(
            "mark", 1, ["CONFIRMED"] * 2, self.want, 999))
        rc, out = self.run_audit()
        self.assertEqual(rc, 0)
        self.assertIn("brm-kjv: 1 belts, 0 chapters without a belt, "
                      "1 belts not current for the audio on disk", out)

    def test_belt_without_stamps_is_not_current(self):
        p = self._audio_file("acts_001.mp3", b"ACTS1")
        self._set_index([["acts", 1, p, "brm1_acts_001"]])
        self._set_belt("acts_001.json", _belt("acts", 1, ["CONFIRMED"]))
        rc, out = self.run_audit()
        self.assertEqual(rc, 0)
        self.assertIn("1 belts not current for the audio on disk", out)

    def test_empty_belt_counts_zero_verses(self):
        p = self._audio_file("luke_001.mp3", b"LUKE1")
        self._set_index([["luke", 1, p, "brm1_luke_001"]])
        self._set_belt("luke_001.json", _belt("luke", 1, [], self.want, 5))
        rc, out = self.run_audit()
        self.assertEqual(rc, 0)
        self.assertIn("verses 0  unspoken 0  review 0  mean proven 0.0000",
                      out)
        self.assertIn("below the 0.90 silent-ship bar: 1  "
                      "(below the 0.60 gate: 1)", out)


if __name__ == "__main__":
    unittest.main()
