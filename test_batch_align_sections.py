"""batch-align-sections: ONE recording, MANY letters -- position is not identity.

tools/batch-align-sections.py concatenates a compilation's letters into one
virtual Format-B letter (global paragraph index), runs the letters' belt, and
splits the rows back BY OWNER. The cases below are the boundaries where a
plausible shipper goes wrong silently:

  split     rows land under the letter that owns the fragment, with the
            letter's OWN paragraph index, on the section's clock; the spoken
            title (aligned so the belt has something to bind between letters)
            never ships; an UNSPOKEN row leaves the coverage denominator
  order     the shipped file lists assets in AUDIO_SECTIONS order and a
            compilation nothing aligned this run keeps what it shipped
            (a crash is not a regression); a non-manifest key refuses
  gate      tools/check-audio-sync.js reads the fixture through
            AUDIO_SYNC_SECTIONS_FILE: intact -> exit 0; two letters swapped
            -> SECTION-ORDER, exit 1 (the page-follow would navigate backwards)
"""
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "batch_align_sections", os.path.join(ROOT, "tools", "batch-align-sections.py"))
bas = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bas)
FIXTURE = os.path.join(ROOT, "tools", "fixtures", "audio-sync-sections.fixture.js")


def frag(pi, cs, ce, text):
    return {"pi": pi, "cs": cs, "ce": ce, "text": text}


class SplitByOwner(unittest.TestCase):
    def setUp(self):
        self._saved = bas.ha.fragments_for
        letters = {
            "wtlb1:a": ([frag(0, 0, 10, "Come to Me."), frag(1, 0, 8, "Rest now.")], "B"),
            "wtlb1:b": ([frag(0, 0, 12, "Hold fast now.")], "B"),
        }
        bas.ha.fragments_for = lambda key: letters[key]

    def tearDown(self):
        bas.ha.fragments_for = self._saved

    def test_virtual_letter_and_split(self):
        keys = [("wtlb1:a", "A Title"), ("wtlb1:b", "B Title")]
        frags, owner = bas.virtual_letter(keys)
        # title, a.p0, a.p1, title, b.p0 -- the second letter's global pi follows the first's top
        self.assertEqual([f["pi"] for f in frags], [-1, 0, 1, -2, 2])
        self.assertEqual(owner, [None, ("wtlb1:a", 0), ("wtlb1:a", 1), None, ("wtlb1:b", 0)])
        swapped, _ = bas.virtual_letter(list(reversed(keys)))
        self.assertNotEqual(bas.ha.fragments_hash(frags), bas.ha.fragments_hash(swapped),
                            "candidate ORDER is an input; a resume must not reuse a belt built the other way round")
        belt = {"results": [
            {"fi": 0, "tokens": 2, "hit": 2, "status": "CONFIRMED", "ship_t": 1.0},   # spoken title: never ships
            {"fi": 1, "tokens": 3, "hit": 3, "status": "CONFIRMED", "ship_t": 2.5},
            {"fi": 2, "tokens": 2, "hit": 0, "status": "UNSPOKEN"},                  # leaves the denominator
            {"fi": 3, "tokens": 2, "hit": 2, "status": "CONFIRMED", "ship_t": 40.0},
            {"fi": 4, "tokens": 3, "hit": 2, "status": "PROBED", "ship_t": 41.7},
        ]}
        rows, stats = bas.per_letter(belt, owner, frags)
        self.assertEqual(rows, {"wtlb1:a": [[2.5, 0, 0, 10, 0]], "wtlb1:b": [[41.7, 0, 0, 12, 0]]})
        cov_a, uns_a, shp_a, tot_a = stats["wtlb1:a"]
        self.assertEqual((cov_a, shp_a, tot_a), (1.0, 1, 2))          # 3/(5-2), not 3/5
        self.assertAlmostEqual(uns_a, 0.4)
        self.assertAlmostEqual(stats["wtlb1:b"][0], 2 / 3)


class ShipOrderAndCarryForward(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self._saved = bas.OUT_JS
        bas.OUT_JS = os.path.join(self.dir.name, "audio-sync-sections.js")

    def tearDown(self):
        bas.OUT_JS = self._saved
        self.dir.cleanup()

    def read(self):
        m = re.search(r"var AUDIO_SYNC_SECTIONS = (\{.*?\n\});", open(bas.OUT_JS, encoding="utf-8").read(), re.S)
        return json.loads(m.group(1))

    def test_order_carry_and_refusal(self):
        sections = {"wtlb1": [["Part 1 · Intro–19", "A", "V"], ["Part 2 · 20–39", "B", "V"]]}
        manifest = {"wtlb1:x": [["x1", "V"]], "wtlb1:y": [["y1", "V"]], "sections:A": [["A", "V"]]}
        bas.ship({"B": {"wtlb1:y": [[5.0, 0, 0, 4, 0]]}}, sections, manifest, "h")
        self.assertEqual(list(self.read()), ["B"])
        # a run that aligned only A keeps B (no result != no timings) and lists A first
        bas.ship({"A": {"wtlb1:x": [[1.0, 0, 0, 3, 0]]}}, sections, manifest, "h")
        out = self.read()
        self.assertEqual(list(out), ["A", "B"])
        self.assertEqual(out["B"], {"wtlb1:y": [[5.0, 0, 0, 4, 0]]})
        with self.assertRaises(AssertionError):
            bas.ship({"A": {"sections:A": [[1.0, 0, 0, 3, 0]]}}, sections, manifest, "h")
        with self.assertRaises(AssertionError):
            bas.ship({"A": {"wtlb1:x": [[1.0, 0, 0, 3]]}}, sections, manifest, "h")


class GateSeesSectionOrder(unittest.TestCase):
    """tools/check-audio-sync.js on the committed fixture, both arms (~4 s each)."""

    def run_gate(self, path):
        env = dict(os.environ, AUDIO_SYNC_SECTIONS_FILE=path)
        p = subprocess.run(["node", os.path.join("tools", "check-audio-sync.js")], cwd=ROOT, env=env,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        return p.returncode, p.stdout + p.stderr

    def test_fixture_passes_and_swapped_order_fails(self):
        rc, out = self.run_gate(FIXTURE)
        self.assertEqual(rc, 0, out)
        self.assertIn("6 letters in 2 compilations", out)
        src = open(FIXTURE, encoding="utf-8").read()
        a, b = '"wtlb1:come-love-awaits-you"', '"wtlb1:crowning-glory"'
        i, j = src.index(a), src.index(b)
        ra, rb = src[i:src.index("\n", i)].rstrip(","), src[j:src.index("\n", j)].rstrip(",")
        swapped = src.replace(ra, "@@A@@").replace(rb, ra).replace("@@A@@", rb)
        self.assertNotEqual(swapped, src)
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "swapped.js")
            open(bad, "w", encoding="utf-8").write(swapped)
            rc, out = self.run_gate(bad)
        self.assertEqual(rc, 1, out)
        self.assertIn("SECTION-ORDER", out)


if __name__ == "__main__":
    unittest.main()
