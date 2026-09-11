"""batch-align's shipper must never delete a letter it simply did not run.

tools/batch-align.py rebuilds src/data/audio-sync.js volume by volume: it drops
every key belonging to the volumes in the run and re-adds the ones its report
carries. A unit that RAISED (the twelve-section rendition's CTC failure) or that
tools/align-supervisor.py skipped for exceeding the RSS ceiling never reaches
that report -- so the rebuild erased timings that were already shipped, turning
one crash or one memory spike into a silent coverage regression. Nothing caught
it: check-audio-sync.js validates the rows that are present and has no floor and
no comparison against the file's previous self, so a shorter audio-sync.js
passes every gate in the repo.

Measured when this was written: 15 of Volume Two's 26 shipped letters had no
belt on disk, so a `--volkeys one,two,seven` ship pass would re-align all 15 and
erase any that failed.

The cases below are one test each because the interesting property is the
BOUNDARY -- carrying forward must not become blanket preservation:

  kept      a unit with a result       -> rebuilt from its belt
  erased    a unit with NO result      -> its shipped rows survive   (the bug)
  excluded  a unit below the ship gate -> dropped, deliberately      (control)
  retired   a key gone from the manifest -> dropped, deliberately    (control)

Without the controls this would also pass on a shipper that never deletes
anything, which is a different defect.
"""
import importlib.util
import json
import os
import re
import tempfile
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "batch_align", os.path.join(ROOT, "tools", "batch-align.py"))
bam = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bam)

WANT = "testhash01"


def row(label, tag="OK"):
    """One tools/batch-align.py report tuple: (label, cov, shp, tot, C, P, R, tag, unspoken)."""
    return (label, 0.99, 3, 3, 3, 0, 0, tag, 0.0)


class ShipCarriesForwardUnrunUnits(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = self.dir.name
        # EVERY path ship() writes is redirected, or the test rewrites the repo:
        # the first cut of the provenance sidecar left PROVENANCE pointing at
        # tools/audio-sync-provenance.json, and pre-commit's run of this suite
        # replaced the committed 729-key sidecar with these four keys.
        self._saved = (bam.SYNC_JS, bam.HONE, bam.PROVENANCE)
        bam.SYNC_JS = os.path.join(d, "audio-sync.js")
        bam.HONE = os.path.join(d, "hone")
        bam.PROVENANCE = os.path.join(d, "audio-sync-provenance.json")
        os.makedirs(bam.HONE)
        self.addCleanup(self.dir.cleanup)
        self.addCleanup(self._restore)

        # What is already shipped. Volume "one" is a bystander: it is not in the
        # run, so nothing may touch it.
        self.before = {
            "one:untouched": [[1.0, 0, 0, 4, 0]],
            "two:kept": [[9.0, 9, 9, 99, 0]],
            "two:erased": [[2.0, 0, 0, 7, 0]],
            "two:excluded": [[3.0, 0, 0, 7, 0]],
            "two:retired": [[4.0, 0, 0, 7, 0]],
        }
        self._write_sync(self.before)
        # Only the unit with a result has a belt to rebuild from.
        self._write_belt("two:kept", [[9.5, 1, 0, 5, 0]])
        self._write_belt("two:excluded", [[3.5, 1, 0, 5, 0]])

    def _restore(self):
        bam.SYNC_JS, bam.HONE, bam.PROVENANCE = self._saved

    def _write_sync(self, sync):
        lines = ",\n".join(json.dumps(k) + ":" + json.dumps(v) for k, v in sorted(sync.items()))
        with open(bam.SYNC_JS, "w", encoding="utf-8", newline="\n") as f:
            f.write("var AUDIO_SYNC = {\n" + lines + "\n};\nvar AUDIO_SYNC_ALT = {\n\n};\n")

    def _write_belt(self, key, tuples):
        with open(bam.belt_path(key), "w", encoding="utf-8") as f:
            json.dump({"tuples": tuples}, f)

    def _after(self):
        with open(bam.SYNC_JS, encoding="utf-8") as f:
            text = f.read()
        return json.loads(re.search(r"var AUDIO_SYNC = (\{.*?\n\});", text, re.S).group(1))

    def _ship(self):
        # "two:retired" is deliberately absent from `keys`: the manifest no
        # longer carries it.
        bam.ship({"two"}, [row("two:kept"), row("two:excluded", "EXCLUDED")], WANT,
                 keys={"two:kept", "two:erased", "two:excluded"})
        return self._after()

    def test_a_unit_with_no_result_keeps_its_shipped_timings(self):
        after = self._ship()
        self.assertIn("two:erased", after,
                      "a unit that raised or hit the RSS ceiling lost its shipped timings")
        self.assertEqual(after["two:erased"], self.before["two:erased"])

    def test_a_unit_with_a_result_is_rebuilt_from_its_belt(self):
        after = self._ship()
        self.assertEqual(after["two:kept"], [[9.5, 1, 0, 5, 0]])

    def test_deliberate_drops_still_drop(self):
        after = self._ship()
        self.assertNotIn("two:excluded", after,
                         "a unit below the ship gate must not be carried forward")
        self.assertNotIn("two:retired", after,
                         "a key gone from the manifest must not be carried forward")

    def test_other_volumes_are_untouched(self):
        after = self._ship()
        self.assertEqual(after["one:untouched"], self.before["one:untouched"])


class ShipRecordsWhichRecordingEachTimelineBelongsTo(unittest.TestCase):
    """The provenance sidecar (tools/audio-sync-provenance.json).

    AUDIO_SYNC is keyed by LETTER and aligned against one RECORDING; the
    manifest can swap a letter's primary recording without touching
    audio-sync.js (it did: one:and-he-shall-be-called-i-am played Benjamin's
    voice under text-to-speech timings). The belts know which asset each part
    was aligned against and are gitignored, so ship() writes that down where
    check-audio-sync.js can compare it to the manifest on every commit.

      belt present        -> its parts' asset ids, in part order
      belt gone, seen     -> the previous sidecar's entry (carried forward)
      belt gone, unseen   -> null, which the gate fails rather than guesses
      key no longer shipped -> not in the sidecar at all              (control)
    """
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = self.dir.name
        self._saved = (bam.SYNC_JS, bam.HONE, bam.PROVENANCE)
        bam.SYNC_JS = os.path.join(d, "audio-sync.js")
        bam.HONE = os.path.join(d, "hone")
        bam.PROVENANCE = os.path.join(d, "audio-sync-provenance.json")
        os.makedirs(bam.HONE)
        self.addCleanup(self.dir.cleanup)
        self.addCleanup(self._restore)
        with open(bam.SYNC_JS, "w", encoding="utf-8", newline="\n") as f:
            f.write("var AUDIO_SYNC = {\n"
                    + ",\n".join(json.dumps(k) + ":" + json.dumps([[1.0, 0, 0, 4, 0]]) for k in
                                 ["one:belted", "one:two-parts", "one:carried", "one:unknown", "one:retired"])
                    + "\n};\nvar AUDIO_SYNC_ALT = {\n\n};\n")
        with open(bam.belt_path("one:belted"), "w", encoding="utf-8") as f:
            json.dump({"tuples": [[1.0, 0, 0, 4, 0]], "parts": [{"part": 0, "asset": "A1"}]}, f)
        with open(bam.belt_path("one:two-parts"), "w", encoding="utf-8") as f:
            json.dump({"tuples": [[1.0, 0, 0, 4, 0], [2.0, 0, 0, 4, 1]],
                       "parts": [{"part": 0, "asset": "P0"}, {"part": 1, "asset": "P1"}]}, f)
        # A previous sidecar vouches for one belt-less key and not the other.
        with open(bam.PROVENANCE, "w", encoding="utf-8") as f:
            json.dump({"primary": {"one:carried": ["OLD"], "one:retired": ["GONE"]}}, f)

    def _restore(self):
        bam.SYNC_JS, bam.HONE, bam.PROVENANCE = self._saved

    def _ship(self):
        bam.ship({"one"}, [row("one:belted"), row("one:two-parts")], WANT,
                 keys={"one:belted", "one:two-parts", "one:carried", "one:unknown"})
        with open(bam.PROVENANCE, encoding="utf-8") as f:
            return json.load(f)["primary"]

    def test_a_belt_names_its_recording_per_part(self):
        prov = self._ship()
        self.assertEqual(prov["one:belted"], ["A1"])
        self.assertEqual(prov["one:two-parts"], ["P0", "P1"])

    def test_a_carried_forward_key_keeps_its_previous_entry(self):
        self.assertEqual(self._ship()["one:carried"], ["OLD"])

    def test_a_key_nothing_vouches_for_is_null_not_guessed(self):
        prov = self._ship()
        self.assertIn("one:unknown", prov)
        self.assertIsNone(prov["one:unknown"])

    def test_a_key_no_longer_shipped_leaves_the_sidecar(self):
        self.assertNotIn("one:retired", self._ship())


class OnlyNamesUnitsTheVolumeActuallyHas(unittest.TestCase):
    """--only <keys> aligns the named units and lets ship() carry the volume's
    others forward (one chapter per commit, 2026-09-11). The check that earns
    its keep: a key the volume does not carry must refuse up front. Without it
    a typo aligns nothing, ships nothing new, and exits 0 with every key
    reported as carried forward -- a run that looks finished and did no work.
    Runs main() only as far as the manifest (in the repo): no fragments, no
    model, no audio."""

    def _main(self, *argv):
        import sys
        saved = sys.argv
        sys.argv = ["batch-align.py", *argv]
        try:
            with self.assertRaises(SystemExit) as cm:
                bam.main()
        finally:
            sys.argv = saved
        return cm.exception

    def test_a_key_outside_the_volume_refuses_before_any_work(self):
        e = self._main("--volkeys", "study", "--no-ship", "--only", "study:not-a-chapter")
        self.assertIn("study:not-a-chapter", str(e))
        self.assertIn("--only names keys not in volumes", str(e))

    def test_the_volume_prefix_is_checked_too(self):
        # A real letter key under the wrong --volkeys is the same mistake.
        e = self._main("--volkeys", "study", "--no-ship", "--only", "one:christmas")
        self.assertIn("one:christmas", str(e))


if __name__ == "__main__":
    unittest.main()
