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
        self._saved = (bam.SYNC_JS, bam.HONE)
        bam.SYNC_JS = os.path.join(d, "audio-sync.js")
        bam.HONE = os.path.join(d, "hone")
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
        bam.SYNC_JS, bam.HONE = self._saved

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


if __name__ == "__main__":
    unittest.main()
