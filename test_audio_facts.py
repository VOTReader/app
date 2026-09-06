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
  A5b a missing ffprobe                       -> None, never a traceback; and FULL
                                                 REFUSES rather than skipping every
                                                 duration leg in silence -- asserted
                                                 as an EXIT CODE through the real CLI
                                                 with PATH stripped, not as a predicate
  A6  --audio-facts with --structural         -> refused rather than silently ignored

A4 is the control that makes the rest a measurement: without it, "the new gate
is red" says nothing about whether the old one would have been too.
"""
import argparse
import contextlib
import hashlib
import importlib.util
import io
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


class _Capture(io.StringIO):
    """StringIO that tolerates sys.stdout.reconfigure().

    check() loads batch-align-bible.py, whose module body reconfigures stdout for
    UTF-8 -- a bare StringIO has no such method, so redirecting stdout around it
    raises AttributeError from an import rather than from the code under test."""

    def reconfigure(self, **kw):
        pass


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

    # -- A5b  ffprobe is not everywhere, and its ABSENCE must not read as a pass
    def test_a_missing_ffprobe_returns_none_instead_of_raising(self):
        """Caught by branch CI, not by three local 28/28 gate sets: the runner has
        no ffprobe, and subprocess raised FileNotFoundError out of a library
        function. A tool that only works where its dependencies happen to be
        installed is not a gate."""
        vbs = _load(VBS, "validate_bible_sync_ffprobe_missing")
        d = tempfile.mkdtemp(prefix="audio-facts-noffprobe-", dir=self.tmp)
        path = os.path.join(d, "x.mp3")
        with open(path, "wb") as f:
            f.write(b"not audio")
        real_run = vbs.subprocess.run

        def boom(*a, **k):
            raise FileNotFoundError(2, "No such file or directory", "ffprobe")

        vbs.subprocess.run = boom
        try:
            self.assertIsNone(vbs.ffprobe_dur(path))
        finally:
            vbs.subprocess.run = real_run

    def test_full_mode_refuses_when_ffprobe_is_absent(self):
        """And the None must not be read as a passing check. Every duration leg
        skips on None, so FULL without ffprobe would pass them all by not running
        them -- silent for a reason unrelated to what it measures. It refuses,
        and the refusal fires BEFORE audio_index(), which needs a drive no clone
        has, so this arm runs anywhere."""
        vbs = _load(VBS, "validate_bible_sync_refusal")
        self.assertTrue(vbs.require_ffprobe.__doc__)      # it exists and is documented
        ns = argparse.Namespace(edition="brm-kjv", data=self.data_file(self.onsets),
                                structural=False, audio_facts=None,
                                audit_audio_hashes=False, all_editions=False)
        real = vbs.require_ffprobe
        vbs.require_ffprobe = lambda: False
        try:
            io_ = _Capture()
            with contextlib.redirect_stdout(io_):
                rc = vbs.check("brm-kjv", ns)
            out = io_.getvalue()
        finally:
            vbs.require_ffprobe = real
        self.assertEqual(rc, 1, out)
        self.assertIn("FULL mode needs ffprobe on PATH", out)

    def test_full_mode_exits_1_through_the_entry_point_with_no_ffprobe(self):
        """The predicate is not the wiring, and the wiring is what pre-commit
        reads. This runs the real CLI with PATH stripped of ffprobe and asserts
        the EXIT CODE, so the invariant is enforced rather than described: on a
        machine that cannot see the audio, a Bible timings change is RED by
        design. Verified that Python still starts with an emptied PATH before
        relying on it -- sys.executable is absolute and its DLLs sit beside it."""
        empty = tempfile.mkdtemp(prefix="audio-facts-nopath-", dir=self.tmp)
        env = dict(os.environ)
        env["PATH"] = empty
        r = subprocess.run([sys.executable, VBS, "--edition", "brm-kjv",
                            "--data", self.data_file(self.onsets)],
                           capture_output=True, encoding="utf-8", errors="replace",
                           cwd=ROOT, env=env)
        out = (r.stdout or "") + (r.stderr or "")
        self.assertEqual(r.returncode, 1, out)
        self.assertIn("FULL mode needs ffprobe on PATH", out)
        self.assertIn("--audio-facts", out)          # and it names the way forward

    @unittest.skipUnless(shutil.which("ffprobe"),
                         "needs ffprobe on PATH; CI runners have none, which is the "
                         "condition the refusal arm above covers")
    def test_require_ffprobe_is_true_where_ffprobe_exists(self):
        """The TRUE branch of the predicate, which nothing else exercises. It
        skips with a reason that names ffprobe so a CI log says WHY rather than
        only counting a skip -- and the skipped total is pinned nowhere: a rising
        count with a different reason is a finding, a pinned number is a comment
        that goes stale."""
        vbs = _load(VBS, "validate_bible_sync_haveffprobe")
        self.assertTrue(vbs.require_ffprobe())

    def test_the_duration_leg_of_the_audit_actually_fires(self):
        """The dur leg is the one arm the planted-file test cannot reach, because
        ffprobe returns None on a file that is not audio -- so without this the
        leg is uncovered and would read as covered."""
        vbs = _load(VBS, "validate_bible_sync_durleg")
        d = tempfile.mkdtemp(prefix="audio-facts-durleg-", dir=self.tmp)
        path = os.path.join(d, "brm1_genesis_001.mp3")
        with open(path, "wb") as f:
            f.write(b"pretend audio")
        idx = {("genesis", 1): (path, "brm1_genesis_001")}
        facts = {("genesis", 1): {"book": "genesis", "chapter": 1,
                                  "bytes": os.path.getsize(path), "dur": 10.0,
                                  "sha256": hashlib.sha256(b"pretend audio").hexdigest(),
                                  "assetId": "brm1_genesis_001"}}
        real = vbs.ffprobe_dur
        vbs.ffprobe_dur = lambda _p: 12.5          # the file really is 12.5 s
        try:
            found = vbs.audit_facts("brm-kjv", idx, facts, False)
        finally:
            vbs.ffprobe_dur = real
        self.assertTrue(any("dur 10.0" in w and "12.500" in w for _, w in found), found)
        # and it must NOT name a cause it cannot know
        self.assertTrue(all("sidecar is stale" not in w for _, w in found), found)
        self.assertTrue(any("find which before regenerating" in w for _, w in found), found)

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
