"""The audio-facts sidecar and the FACTS mode it enables, driven end to end.

Until this landed, no gate that runs on a LANDING had ever checked that a
shipped timing matches its audio. tools/validate-bible-sync.py has the check --
"the last onset lies inside the chapter's local audio" -- but ci.yml and
ci-gates.sh both pass --structural, deliberately, because the check reaches
through a .gitignore'd tools/_align-work/ into a drive CI does not have.
tools/audio-facts.json commits the FACTS instead, and --audio-facts runs the
duration leg on any clone.

A gate whose only fixture is the data it already ships can be green for want of
a DISCRIMINATING case, so every arm here is driven against a planted fixture
rather than against the corpus:

  A1  correct sidecar + correct data          -> GREEN
  A2  an onset one centisecond past the end   -> RED, and names the chapter
  A3  a sidecar missing that chapter          -> RED (this is what stale looks like)
  A3b a mis-keyed entry (wrong chapter/edition) -> RED, with no audio at all
  A4  --structural over the SAME fixtures     -> GREEN: what the old gate could not see
  A5  audit_facts against planted files       -> RED on bytes, on sha256, on assetId
  A6  --audio-facts with --structural         -> refused rather than silently ignored

A4 is the control that makes the rest a measurement: without it, "the new gate
is red" says nothing about whether the old one would have been too.
"""
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(ROOT, "tools")
VBS = os.path.join(TOOLS, "validate-bible-sync.py")
# genesis 1 in the KJV: 31 verses, so ship() sizes the array to 31 slots.
GENESIS_1_VERSES = 31


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def run_vbs(*args):
    r = subprocess.run([sys.executable, VBS, *args], capture_output=True,
                       encoding="utf-8", errors="replace", cwd=ROOT)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


class SidecarGate(unittest.TestCase):
    """One planted chapter, so the fixture -- not the corpus -- decides the answer."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="audio-facts-test-")
        cls.seq = 0
        cls.dur = 100.0
        # Onsets in centiseconds, non-decreasing, the last one comfortably inside
        # a 100 s chapter. Verse 1 at 0.5 s, then a second apart.
        cls.onsets = [50 + 100 * i for i in range(GENESIS_1_VERSES)]

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def next_id(self):
        # A counter, not len(listdir): the audit test drops a subdirectory in
        # here and a name derived from the directory's size would then collide.
        type(self).seq += 1
        return type(self).seq

    def data_file(self, onsets):
        p = os.path.join(self.tmp, f"bible-sync-brm-kjv-{self.next_id()}.js")
        table = {"genesis": {"1": onsets}}
        with open(p, "w", encoding="utf-8") as f:
            f.write("var BIBLE_SYNC_BRM_KJV = " + json.dumps(table) + ";\n")
        return p

    def facts_file(self, section):
        p = os.path.join(self.tmp, f"facts-{self.next_id()}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({"editions": {"brm-kjv": section}}, f)
        return p

    def good_section(self):
        return {"brm1_genesis_001": {"book": "genesis", "chapter": 1, "bytes": 1,
                                     "dur": self.dur, "sha256": "0" * 64}}

    # -- A1 ----------------------------------------------------------------
    def test_correct_sidecar_and_data_is_green(self):
        rc, out = run_vbs("--edition", "brm-kjv",
                          "--data", self.data_file(self.onsets),
                          "--audio-facts", self.facts_file(self.good_section()))
        self.assertEqual(rc, 0, out)
        self.assertIn("OK (facts)", out)
        # The mode line must SAY which legs ran: a FACTS pass that reads like a
        # FULL pass is how a partial gate gets quoted as a full one.
        self.assertIn("mode FACTS", out)
        self.assertIn("belts and audio bytes NOT checked", out)

    # -- A2 ----------------------------------------------------------------
    def test_onset_past_the_audio_end_is_red(self):
        """One centisecond past, not a wild value: the boundary is the case a
        gate written from the happy path gets wrong."""
        onsets = list(self.onsets)
        onsets[-1] = int(self.dur * 100)          # exactly the end == past it
        rc, out = run_vbs("--edition", "brm-kjv",
                          "--data", self.data_file(onsets),
                          "--audio-facts", self.facts_file(self.good_section()))
        self.assertEqual(rc, 1, out)
        self.assertIn("genesis_001", out)
        self.assertIn("past the audio end", out)

    # -- A3 ----------------------------------------------------------------
    def test_sidecar_missing_the_chapter_is_red(self):
        rc, out = run_vbs("--edition", "brm-kjv",
                          "--data", self.data_file(self.onsets),
                          "--audio-facts", self.facts_file({}))
        self.assertEqual(rc, 1, out)
        self.assertIn("no audio facts for this chapter", out)

    def test_sidecar_without_this_edition_is_red_not_empty(self):
        """A section that is ABSENT is not a section that is empty: an edition
        the sidecar has never heard of must fail loudly rather than pass with
        nothing to check."""
        p = os.path.join(self.tmp, "facts-no-edition.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({"editions": {"web-ebible": {}}}, f)
        rc, out = run_vbs("--edition", "brm-kjv",
                          "--data", self.data_file(self.onsets), "--audio-facts", p)
        self.assertEqual(rc, 1, out)
        self.assertIn("no section for edition", out)

    # -- A3b  the identity leg a clone CAN run -----------------------------
    def test_a_mis_keyed_entry_is_red_without_any_audio(self):
        """The belts are .gitignore'd and the mp3s are off-repo, so CI cannot
        compare a sidecar size against a belt's audioSize -- there is nothing in
        the repo carrying one. What a clone CAN check is that an entry names the
        chapter it claims to describe: a mis-keyed entry is a real record
        pointing at the wrong file, which is what a hand edit produces."""
        bad = {"brm1_genesis_002": {"book": "genesis", "chapter": 1, "bytes": 1,
                                    "dur": self.dur, "sha256": "0" * 64}}
        rc, out = run_vbs("--edition", "brm-kjv",
                          "--data", self.data_file(self.onsets),
                          "--audio-facts", self.facts_file(bad))
        self.assertEqual(rc, 1, out)
        self.assertIn("does not name genesis 1", out)

    def test_another_editions_entry_in_this_section_is_red(self):
        wrong_edition = {"web1_genesis_001": {"book": "genesis", "chapter": 1, "bytes": 1,
                                              "dur": self.dur, "sha256": "0" * 64}}
        rc, out = run_vbs("--edition", "brm-kjv",
                          "--data", self.data_file(self.onsets),
                          "--audio-facts", self.facts_file(wrong_edition))
        self.assertEqual(rc, 1, out)
        self.assertIn("is not a 'brm' asset", out)

    # -- A4  THE CONTROL ---------------------------------------------------
    def test_structural_mode_cannot_see_any_of_it(self):
        """The old gate over the same broken fixture. It passes -- which is the
        whole reason this file exists, and the reason the new arms are evidence
        rather than a tautology."""
        onsets = list(self.onsets)
        onsets[-1] = int(self.dur * 100) + 5000   # 50 s past the end of the audio
        rc, out = run_vbs("--edition", "brm-kjv",
                          "--data", self.data_file(onsets), "--structural")
        self.assertEqual(rc, 0, out)
        self.assertIn("OK (structural)", out)

    # -- A5 ----------------------------------------------------------------
    def test_audit_catches_a_sidecar_that_no_longer_matches_the_files(self):
        """FULL mode's leg, on planted files rather than mp3s: bytes, sha256 and
        the asset id are file facts, so they need no ffprobe and no audio."""
        vbs = _load(VBS, "validate_bible_sync_under_test")
        d = tempfile.mkdtemp(prefix="audio-facts-files-", dir=self.tmp)
        path = os.path.join(d, "brm1_genesis_001.mp3")
        with open(path, "wb") as f:
            f.write(b"pretend audio")
        idx = {("genesis", 1): (path, "brm1_genesis_001")}
        real = {"book": "genesis", "chapter": 1, "bytes": os.path.getsize(path),
                "dur": 1.0, "sha256": hashlib.sha256(b"pretend audio").hexdigest(),
                "assetId": "brm1_genesis_001"}

        # truthful sidecar, hash leg on -> nothing to report
        self.assertEqual(vbs.audit_facts("brm-kjv", idx, {("genesis", 1): real}, True), [])

        # planted wrong hash -> RED, and ONLY with the hash leg on, which is the
        # honest limit of the cheap audit rather than a hole to leave unsaid
        bad_hash = dict(real, sha256="f" * 64)
        self.assertTrue(any("sha256" in w for _, w in
                            vbs.audit_facts("brm-kjv", idx, {("genesis", 1): bad_hash}, True)))
        self.assertEqual(vbs.audit_facts("brm-kjv", idx, {("genesis", 1): bad_hash}, False), [])

        # planted wrong size -> RED even with the cheap audit
        bad_bytes = dict(real, bytes=real["bytes"] + 1)
        self.assertTrue(any("bytes" in w for _, w in
                            vbs.audit_facts("brm-kjv", idx, {("genesis", 1): bad_bytes}, False)))

        # planted wrong asset id -> RED: 48 brm-kjv chapters share a byte size
        # with another chapter, so the id is the thing that says WHICH file this is
        bad_id = dict(real, assetId="brm1_genesis_002")
        self.assertTrue(any("assetId" in w for _, w in
                            vbs.audit_facts("brm-kjv", idx, {("genesis", 1): bad_id}, False)))

        # audio on disk that the sidecar never heard of, and the reverse
        self.assertTrue(any("no entry in audio-facts" in w for _, w in
                            vbs.audit_facts("brm-kjv", idx, {}, False)))
        self.assertTrue(any("no audio on disk" in w for _, w in
                            vbs.audit_facts("brm-kjv", {}, {("genesis", 1): real}, False)))

    # -- A6 ----------------------------------------------------------------
    def test_the_two_no_audio_modes_refuse_to_combine(self):
        rc, out = run_vbs("--structural", "--audio-facts", "nonexistent.json")
        self.assertEqual(rc, 2, out)
        self.assertIn("pick one", out)

    def test_hash_audit_is_refused_outside_full_mode(self):
        rc, out = run_vbs("--structural", "--audit-audio-hashes")
        self.assertEqual(rc, 2, out)
        self.assertIn("only", out)


class Generator(unittest.TestCase):
    def test_it_refuses_an_edition_with_no_mirror_rather_than_crashing(self):
        """tsot-matthew resolves its assets from the Drive listing, not from a
        mirror's collect(), so audio_index() would die on re.escape(None). A
        refusal names the reason; a traceback reads as a broken tool."""
        r = subprocess.run([sys.executable, os.path.join(TOOLS, "build-audio-facts.py"),
                            "--edition", "tsot-matthew",
                            "--out", os.path.join(tempfile.gettempdir(), "unused.json")],
                           capture_output=True, encoding="utf-8", errors="replace", cwd=ROOT)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("no mirror script", r.stdout)

    def test_it_refuses_an_unknown_edition(self):
        r = subprocess.run([sys.executable, os.path.join(TOOLS, "build-audio-facts.py"),
                            "--edition", "not-an-edition",
                            "--out", os.path.join(tempfile.gettempdir(), "unused.json")],
                           capture_output=True, encoding="utf-8", errors="replace", cwd=ROOT)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("unknown edition", r.stdout)


if __name__ == "__main__":
    unittest.main()
