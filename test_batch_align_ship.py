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


class _ShipFixture(unittest.TestCase):
    """A temp SYNC_JS / HONE / PROVENANCE, both maps of audio-sync.js, and belts."""
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

    def _restore(self):
        bam.SYNC_JS, bam.HONE, bam.PROVENANCE = self._saved

    def _write_sync(self, sync, alt):
        def body(m):
            return ",\n".join(json.dumps(k) + ":" + json.dumps(v) for k, v in sorted(m.items()))
        with open(bam.SYNC_JS, "w", encoding="utf-8", newline="\n") as f:
            f.write("var AUDIO_SYNC = {\n" + body(sync) + "\n};\nvar AUDIO_SYNC_ALT = {\n" + body(alt) + "\n};\n")

    def _write_belt(self, key, tuples, asset=None, parts=None):
        with open(bam.belt_path(key, asset), "w", encoding="utf-8") as f:
            json.dump({"tuples": tuples, "parts": parts or []}, f)

    def _after(self):
        with open(bam.SYNC_JS, encoding="utf-8") as f:
            text = f.read()
        return (json.loads(re.search(r"var AUDIO_SYNC = (\{.*?\n\});", text, re.S).group(1)),
                json.loads(re.search(r"var AUDIO_SYNC_ALT = (\{.*?\n\});", text, re.S).group(1)))

    def _sidecar(self):
        with open(bam.PROVENANCE, encoding="utf-8") as f:
            return json.load(f)


class ShipKeepsAPrimaryWhenOnlyItsAlternateReported(_ShipFixture):
    """W19 (sweep 2026-10-13). `reported` stripped '@asset', so an alternate's
    row counted as its letter's primary: when the primary job raised and the
    alternate succeeded, the primary was neither carried forward nor rebuilt,
    and the coverage floor then blocked the commit as a 'lost timeline'."""
    def test_the_primary_is_carried_forward(self):
        self._write_sync({"two:k": [[5.0, 0, 0, 7, 0]]}, {"A0": [[1.0, 0, 0, 4, 0]]})
        self._write_belt("two:k", [[1.5, 1, 0, 5, 0]], "A0", [{"part": 0, "asset": "A0"}])
        bam.ship({"two"}, [row("two:k@A0")], WANT, keys={"two:k"},
                 alternates={"two:k": [["V", [["A0"]]]]})
        sync, alt = self._after()
        self.assertEqual(sync.get("two:k"), [[5.0, 0, 0, 7, 0]],
                         "the primary that raised lost its shipped timings because its alternate reported")
        self.assertEqual(alt["A0"], [[1.5, 1, 0, 5, 0]])


class AlternateTimelinesLeaveWithTheirReason(_ShipFixture):
    """W20 (sweep 2026-10-13). AUDIO_SYNC_ALT entries were only ever written:
    a retired alternate's rows blocked the gate for good (NO-ALTERNATE-OWNER),
    and a re-cut rendition whose new belt was EXCLUDED or empty kept painting
    the old timing over the new audio. A deliberate drop now goes into the
    sidecar's `excluded`, the record check-audio-sync's coverage floor reads,
    for primaries and alternates alike (one policy for both maps)."""
    ALTS = {"two:p": [["V", [["EXC"]]], ["W", [["EMPTY"]]],
                      ["X", [["P0", "Part 1"], ["P1", "Part 2"]]], ["Y", [["UNRUN"]]]],
            "one:o": [["V", [["OTHERVOL"]]]]}

    def setUp(self):
        super().setUp()
        old = [[9.0, 0, 0, 4, 0]]
        self._write_sync({"two:p": old, "two:x": old, "one:o": old},
                         {a: old for a in ("RETIRED", "EXC", "EMPTY", "P0", "P1", "UNRUN", "OTHERVOL")})
        self._write_belt("two:p", [[1.5, 1, 0, 5, 0]], parts=[{"part": 0, "asset": "PRI"}])
        self._write_belt("two:x", [[1.5, 1, 0, 5, 0]], parts=[{"part": 0, "asset": "PRX"}])
        self._write_belt("two:p", [[2.0, 1, 0, 5, 0]], "EXC", [{"part": 0, "asset": "EXC"}])
        self._write_belt("two:p", [], "EMPTY", [{"part": 0, "asset": "EMPTY"}])
        # The two-part rendition placed rows in part 0 only this run.
        self._write_belt("two:p", [[3.0, 1, 0, 5, 0]], "P0",
                         [{"part": 0, "asset": "P0"}, {"part": 1, "asset": "P1"}])
        with open(bam.PROVENANCE, "w", encoding="utf-8") as f:
            json.dump({"primary": {"two:x": ["PRX"], "one:o": ["PRO"]},
                       "excluded": {"two:p": "EXCLUDED 0.41", "one:gone": "EXCLUDED 0.10"}}, f)
        bam.ship({"two"}, [row("two:p"), row("two:p@EXC", "EXCLUDED"), row("two:p@EMPTY"),
                           row("two:p@P0"), row("two:x", "EXCLUDED")], WANT,
                 keys={"two:p", "two:x"}, alternates=self.ALTS)
        self.sync, self.alt = self._after()

    def test_a_retired_alternate_leaves(self):
        self.assertNotIn("RETIRED", self.alt, "an alternate no longer in AUDIO_ALTERNATES kept its rows")

    def test_an_excluded_or_empty_alternate_leaves(self):
        self.assertNotIn("EXC", self.alt, "an EXCLUDED re-run kept painting the old timing")
        self.assertNotIn("EMPTY", self.alt, "an empty re-run kept painting the old timing")

    def test_a_part_with_no_rows_this_run_leaves(self):
        self.assertEqual(self.alt.get("P0"), [[3.0, 1, 0, 5, 0]])
        self.assertNotIn("P1", self.alt, "a part the re-run placed nothing in kept its old rows")

    def test_an_unrun_alternate_and_other_volumes_stay(self):
        self.assertEqual(self.alt.get("UNRUN"), [[9.0, 0, 0, 4, 0]])
        self.assertEqual(self.alt.get("OTHERVOL"), [[9.0, 0, 0, 4, 0]])
        self.assertEqual(self.sync.get("one:o"), [[9.0, 0, 0, 4, 0]])

    def test_every_deliberate_drop_is_recorded_for_the_floor(self):
        ex = self._sidecar().get("excluded") or {}
        for k in ("two:x", "alt:EXC", "alt:EMPTY", "alt:P1"):
            self.assertIn(k, ex, f"{k} was dropped on purpose but the sidecar does not say so")
        self.assertNotIn("alt:RETIRED", ex, "a retired alternate needs no waiver: it left with its owner")

    def test_a_key_that_ships_again_leaves_the_record(self):
        ex = self._sidecar().get("excluded") or {}
        self.assertIn("two:p", self.sync)
        self.assertNotIn("two:p", ex, "a key shipping again is still listed as excluded")
        self.assertIn("one:gone", ex, "another volume's record is not this run's to drop")


class FloorAcceptsTheShippersRecordedDrops(unittest.TestCase):
    """W20's gate half: tools/check-audio-sync.js's coverage floor failed every
    deliberate EXCLUDED drop of a timeline HEAD shipped, so the shipper's own
    policy could never pass pre-commit. It now accepts a lost key exactly when
    the sidecar's `excluded` names it. Drives the real gate against git HEAD,
    with a working copy that dropped one shipped key (~4 s per arm)."""
    def _gate(self, excluded):
        import subprocess
        import tempfile as tf
        head = subprocess.run(["git", "show", "HEAD:app/src/main/assets/src/data/audio-sync.js"], cwd=ROOT,
                              capture_output=True, text=True, encoding="utf-8", check=True).stdout
        sync = json.loads(re.search(r"var AUDIO_SYNC = (\{.*?\n\});", head, re.S).group(1))
        alt = json.loads(re.search(r"var AUDIO_SYNC_ALT = (\{.*?\n\});", head, re.S).group(1))
        lost = sorted(sync)[0]
        del sync[lost]
        with open(bam.PROVENANCE, encoding="utf-8") as f:
            prov = json.load(f)
        prov["excluded"] = {lost: "EXCLUDED 0.30"} if excluded else {}

        def body(m):
            return ",\n".join(json.dumps(k) + ":" + json.dumps(v) for k, v in sorted(m.items()))
        with tf.TemporaryDirectory() as d:
            sp, pp = os.path.join(d, "audio-sync.js"), os.path.join(d, "prov.json")
            with open(sp, "w", encoding="utf-8", newline="\n") as f:
                f.write("var AUDIO_SYNC = {\n" + body(sync) + "\n};\nvar AUDIO_SYNC_ALT = {\n" + body(alt) + "\n};\n")
            with open(pp, "w", encoding="utf-8") as f:
                json.dump(prov, f)
            env = dict(os.environ, AUDIO_SYNC_FILE=sp, AUDIO_SYNC_PROVENANCE_FILE=pp)
            p = subprocess.run(["node", os.path.join("tools", "check-audio-sync.js"), "--json"], cwd=ROOT,
                               env=env, capture_output=True, text=True, encoding="utf-8")
        return lost, json.loads(p.stdout).get("lost") or []

    def test_an_unrecorded_drop_fails_and_a_recorded_one_passes(self):
        lost, flagged = self._gate(excluded=False)
        self.assertIn(lost, flagged, "control: a timeline HEAD shipped must count as lost")
        lost, flagged = self._gate(excluded=True)
        self.assertNotIn(lost, flagged, "the floor refused a drop the shipper recorded as deliberate")


class IsCurrentComparesTheRecordingAndTheTranscript(unittest.TestCase):
    """W21: a belt was reused when only settings and fragments matched, so a part
    added, removed or replaced behind an unchanged first asset got no read-along
    (or an orphan row). W23: a belt built on a TRUNCATED transcript was current
    forever, its dark tail permanent though the transcript itself is not cached."""
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def _belt(self, **extra):
        p = os.path.join(self.dir.name, "b.json")
        body = {"settings_hash": WANT, "fragmentsHash": "F",
                "parts": [{"part": 0, "asset": "A0"}, {"part": 1, "asset": "A1"}]}
        body.update(extra)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(body, f)
        return p

    def test_same_recording_is_current(self):
        self.assertTrue(bam.is_current(self._belt(), WANT, "F", ["A0", "A1"]))

    def test_a_changed_part_list_is_not_current(self):
        p = self._belt()
        for want in (["A0", "A1", "A2"], ["A0"], ["A0", "B1"]):
            self.assertFalse(bam.is_current(p, WANT, "F", want), f"belt reused for parts {want}")

    def test_the_tracks_stamp_wins_over_the_parts_consumed(self):
        # run_belt stops once every fragment is consumed, so `parts` can be a
        # prefix of the rendition; `tracks` records the whole list it resolved.
        p = self._belt(parts=[{"part": 0, "asset": "A0"}], tracks=["A0", "A1"])
        self.assertTrue(bam.is_current(p, WANT, "F", ["A0", "A1"]))
        self.assertFalse(bam.is_current(p, WANT, "F", ["A0", "A1", "A2"]))

    def test_no_track_list_asked_keeps_the_old_key(self):
        self.assertTrue(bam.is_current(self._belt(), WANT, "F"))

    def test_a_truncated_transcript_is_never_current(self):
        self.assertFalse(bam.is_current(self._belt(txTruncated=[1]), WANT, "F", ["A0", "A1"]))
        self.assertFalse(bam.is_current(self._belt(txTruncated=[1]), WANT, "F"))


class MainAsksEachBeltForItsOwnRecording(_ShipFixture):
    """W21's wiring: main() hands is_current the part list the manifest plays
    now -- AUDIO_MANIFEST's for the primary, the rendition's own for an
    alternate -- so a belt aligned against other parts is re-run, and one
    aligned against the same parts is not. No model, no audio: run_belt is a stub."""
    def test_only_the_belt_whose_parts_changed_is_re_run(self):
        ha, al = bam.ha, bam.al
        want = al.settings_hash(al.settings_for("letters-A"))
        manifest = {"two:k": [["A0", "B"], ["A1", "B", "Part 2"]]}
        alternates = {"two:k": [["V", [["C0", "Part 1"], ["C1", "Part 2"]]]]}
        frag = [{"bi": 0, "cs": 0, "ce": 4, "text": "word"}]
        fh = ha.fragments_hash(frag)
        for asset, parts in ((None, ["A0"]), ("C0", ["C0", "C1"])):
            with open(bam.belt_path("two:k", asset), "w", encoding="utf-8") as f:
                json.dump({"settings_hash": want, "fragmentsHash": fh, "tuples": [], "fragments": 1,
                           "parts": [{"part": i, "asset": a} for i, a in enumerate(parts)]}, f)
        calls = []
        saved = (ha.js_object, ha.fragments_for, ha.run_belt, al.release_caches, bam.REPORTS)
        ha.js_object = lambda name: {"AUDIO_MANIFEST": manifest, "AUDIO_ALTERNATES": alternates}[name]
        ha.fragments_for = lambda key: (frag, "A")
        ha.run_belt = lambda key, s, asset=None: calls.append((key, asset)) or {"tuples": [], "fragments": 1}
        al.release_caches = lambda: None
        bam.REPORTS = self.dir.name

        def restore():
            ha.js_object, ha.fragments_for, ha.run_belt, al.release_caches, bam.REPORTS = saved
        self.addCleanup(restore)
        import sys
        argv, sys.argv = sys.argv, ["batch-align.py", "--volkeys", "two", "--no-ship"]
        try:
            bam.main()
        finally:
            sys.argv = argv
        self.assertEqual(calls, [("two:k", None)],
                         "the primary belt aligned against [A0] alone was reused for [A0, A1], "
                         "or the alternate whose parts still match was re-run")


if __name__ == "__main__":
    unittest.main()
