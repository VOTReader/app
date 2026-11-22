"""Tests for tools/validate-bible-sync.py -- the Bible read-along gate.

The script runs at import with no exports and no main guard, so it is
loaded here via importlib (the check-app-size / sync-sw-version
precedent). The real _alignlib is used (settings_for/settings_hash/sha10
are stdlib-only); batch-align-bible.py is a per-test fixture written
into a temp tools dir, and the script's BASE / DATA / ROOT globals are
patched onto temp trees after import, so no real corpus, belt, audio or
manifest is ever read or written.
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
from types import SimpleNamespace
from unittest import mock

ROOT = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(ROOT, "tools")


def _load_vbs():
    spec = importlib.util.spec_from_file_location(
        "validate_bible_sync", os.path.join(TOOLS, "validate-bible-sync.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


vbs = _load_vbs()

sys.path.insert(0, TOOLS)
import _alignlib as al  # noqa: E402

FAMILY = "bible-brm-kjv"

BAB_TEMPLATE = """\
EDITIONS = {{"test-ed": {{"family": "bible-brm-kjv", "translation": "kjv"}}}}
MIN_PROVEN = 0.6
GATE_PINS = {{}}
AUDIO_INDEX = {audio_index}
def is_proven(row):
    return row.get("status") == "CONFIRMED" or str(row.get("status", "")).startswith("PROBED")
def audio_index(ed):
    return AUDIO_INDEX
def extract_all(translation, tmp):
    raise AssertionError("extract_all must not run when a flat map exists")
def gate_pin(ed, d):
    return GATE_PINS.get((ed, d.get("bookId"), d.get("chapter")))
def proven_share(belt):
    rows = belt.get("verses") or []
    if not rows:
        return 0.0
    return sum(1 for r in rows if is_proven(r)) / len(rows)
def clears_gate(ed, d):
    return proven_share(d) >= MIN_PROVEN or gate_pin(ed, d) is not None
"""

DEFAULT_FLAT = {
    "genesis": {
        "1": [{"n": 1, "text": "In the beginning"},
              {"n": 2, "text": "And the earth was without form"},
              {"n": 3, "text": "And God said, Let there be light"}],
        # Sparse like WEB: no verse 3 (acts 8:37 / 15:34 / 24:7 / luke 17:36).
        "2": [{"n": 1, "text": "Thus the heavens"},
              {"n": 2, "text": "And on the seventh day"},
              {"n": 4, "text": "These are the generations"}],
    },
    "matthew-plain": {
        "1": [{"n": 1, "text": "The book of the generation"},
              {"n": 2, "text": "Abraham begat Isaac"}],
    },
}

DEFAULT_TABLE = {"genesis": {"1": [0, 120, 250], "2": [0, 100, 0, 300]}}


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


@contextlib.contextmanager
def script_reads():
    """Calls into the script under test: it reads files with bare open()
    calls, which leave them unclosed; silence that ResourceWarning here --
    the leak is the script's, not the test's (audit-compare precedent)."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ResourceWarning)
        yield


class TestRebuild(unittest.TestCase):
    def test_empty_belt(self):
        self.assertEqual(vbs.rebuild({}), [])
        self.assertEqual(vbs.rebuild({"verses": []}), [])
        self.assertEqual(vbs.rebuild({"verses": None}), [])

    def test_unpinned_maps_times_to_centiseconds(self):
        belt = {"verses": [
            {"n": 1, "t": None, "status": "UNSPOKEN"},
            {"n": 2, "t": 1.2, "status": "CONFIRMED"},
            {"n": 3, "t": 2.5, "status": "PROBED-2"},
        ]}
        self.assertEqual(vbs.rebuild(belt), [0, 120, 250])

    def test_tiny_onset_is_one_never_zero(self):
        belt = {"verses": [{"n": 1, "t": 0.004, "status": "CONFIRMED"}]}
        self.assertEqual(vbs.rebuild(belt), [1])

    def test_unspoken_with_a_time_stays_dark(self):
        belt = {"verses": [{"n": 1, "t": 1.0, "status": "UNSPOKEN"}]}
        self.assertEqual(vbs.rebuild(belt), [0])

    def test_pinned_keeps_proven_rows_only(self):
        belt = {"verses": [
            {"n": 1, "t": 1.0, "status": "CONFIRMED"},
            {"n": 2, "t": 2.0, "status": "PROBED"},
            {"n": 3, "t": 3.0, "status": "GUESS"},
            {"n": 4, "t": 4.0, "status": "UNSPOKEN"},
        ]}
        self.assertEqual(vbs.rebuild(belt, pinned=True), [100, 200, 0, 0])
        self.assertEqual(vbs.rebuild(belt, pinned=False), [100, 200, 300, 0])

    def test_onset_at_or_before_the_one_above_goes_dark(self):
        belt = {"verses": [
            {"n": 1, "t": 1.0, "status": "CONFIRMED"},
            {"n": 2, "t": 1.0, "status": "CONFIRMED"},
            {"n": 3, "t": 2.0, "status": "CONFIRMED"},
        ]}
        self.assertEqual(vbs.rebuild(belt), [100, 0, 200])
        belt["verses"][1]["t"] = 0.5
        self.assertEqual(vbs.rebuild(belt), [100, 0, 200])


class TestAudioEndProblem(unittest.TestCase):
    def test_ffprobe_failure_is_a_problem_not_a_skip(self):
        self.assertEqual(
            vbs.audio_end_problem(1.0, None),
            "could not read the audio's length (ffprobe), so the last onset is unchecked")

    def test_last_onset_at_or_past_the_end(self):
        self.assertEqual(vbs.audio_end_problem(60.0, 60.0),
                         "last onset 60.00s is past the audio end 60.00s")
        self.assertEqual(vbs.audio_end_problem(61.5, 60.0),
                         "last onset 61.50s is past the audio end 60.00s")

    def test_last_onset_inside_is_fine(self):
        self.assertIsNone(vbs.audio_end_problem(59.9, 60.0))


class TestBeltsOnDisk(unittest.TestCase):
    def test_missing_dir_yields_nothing(self):
        self.assertEqual(list(vbs.belts_on_disk(os.path.join("no", "such", "dir"))), [])

    def test_only_real_belts(self):
        with tempfile.TemporaryDirectory() as d:
            good = {"bookId": "genesis", "chapter": 1, "verses": []}
            write_text(os.path.join(d, "genesis_001.json"), json.dumps(good))
            write_text(os.path.join(d, "notes.json"), json.dumps(["not", "a", "dict"]))
            write_text(os.path.join(d, "other.json"), json.dumps({"bookId": "x"}))
            write_text(os.path.join(d, "genesis_001.tx.json"), json.dumps(good))
            write_text(os.path.join(d, "genesis_001.wav.json"), json.dumps(good))
            write_text(os.path.join(d, "CAMPAIGN-1.json"), json.dumps(good))
            write_text(os.path.join(d, "progress.json"), json.dumps(good))
            write_text(os.path.join(d, "audio-index.json"), json.dumps(good))
            with script_reads():
                self.assertEqual(list(vbs.belts_on_disk(d)), [good])


class TestLoad(unittest.TestCase):
    def test_loads_a_module_from_path(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "tiny.py")
            write_text(path, "VALUE = 41\n")
            m = vbs.load(path, "tiny_mod")
            self.assertEqual(m.VALUE, 41)


class TestFfprobeDur(unittest.TestCase):
    def test_parses_duration(self):
        with mock.patch.object(vbs.subprocess, "run",
                               return_value=mock.Mock(stdout="12.5\n")) as run:
            self.assertEqual(vbs.ffprobe_dur("x.mp3"), 12.5)
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0][:2], ["ffprobe", "-v"])
        self.assertEqual(run.call_args.args[0][-1], "x.mp3")

    def test_unparseable_or_empty_output_is_none(self):
        for out in ("garbage\n", "", "  \n"):
            with mock.patch.object(vbs.subprocess, "run",
                                   return_value=mock.Mock(stdout=out)):
                self.assertIsNone(vbs.ffprobe_dur("x.mp3"))


class FixtureTree(unittest.TestCase):
    """A temp repo slice: tools/ (fixture bab), data/ (flat map + manifest),
    and the app tree (audio-track.js). vbs globals are patched onto it."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = self.tmp.name
        self.tools = os.path.join(self.root, "tools")
        self.data = os.path.join(self.root, "data")
        os.makedirs(os.path.join(
            self.root, "app", "src", "main", "assets", "src", "utils"))
        os.makedirs(self.tools)
        os.makedirs(self.data)
        self._write_bab()
        self.write_flat_map(DEFAULT_FLAT)
        self.write_manifest({})
        self.write_audio_track("bible-test")
        self._saved = (vbs.BASE, vbs.DATA, vbs.ROOT)
        vbs.BASE, vbs.DATA, vbs.ROOT = self.tools, self.data, self.root
        self.addCleanup(self._restore_globals)

    def _restore_globals(self):
        vbs.BASE, vbs.DATA, vbs.ROOT = self._saved

    def _write_bab(self, audio_index=None):
        write_text(os.path.join(self.tools, "batch-align-bible.py"),
                   BAB_TEMPLATE.format(audio_index=repr(audio_index or {})))

    def write_flat_map(self, flat):
        write_text(os.path.join(self.data, "bible-kjv.js"),
                   "var BIBLE_KJV = " + json.dumps(flat) + ";\n")

    def write_manifest(self, partial):
        write_text(os.path.join(self.data, "bible-audio-manifest.js"),
                   "var BIBLE_SYNC_PARTIAL = " + json.dumps(partial) + ";\n")

    def write_audio_track(self, volkey):
        if volkey is None:
            body = "'other-ed': Object.freeze({volKey: 'bible-other'}),\n"
        else:
            body = ("'test-ed': Object.freeze({volKey: '%s', label: 'Test'}),\n" % volkey)
        write_text(os.path.join(self.root, "app", "src", "main", "assets",
                                "src", "utils", "audio-track.js"),
                   "'use strict';\nconst TRACKS = {\n" + body + "};\n")

    def write_data_file(self, table, name="bible-sync-test-ed.js"):
        path = os.path.join(self.root, name)
        write_text(path, "var BIBLE_SYNC_TEST_ED = " + json.dumps(table) + ";\n")
        return path

    def run_check(self, data=None, structural=True, ed="test-ed", tmp=None):
        args = SimpleNamespace(edition=ed, data=data, structural=structural)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), script_reads():
            rc = vbs._check(ed, args, tmp or self.root)
        return rc, buf.getvalue()

    def verses_hash(self, book, ch, flat=None):
        rows = (flat or DEFAULT_FLAT).get(
            "matthew-plain" if book == "matthew" else book, {}).get(str(ch), [])
        return al.sha10(json.dumps([[r["n"], r["text"]] for r in sorted(rows, key=lambda r: r["n"])],
                                    ensure_ascii=False, separators=(",", ":")))

    def want_settings_hash(self):
        return al.settings_hash(al.settings_for(FAMILY))


class TestFlatTranslationMap(FixtureTree):
    def test_nkjv_and_missing_and_marker_are_none(self):
        with script_reads():
            self.assertIsNone(vbs.flat_translation_map("nkjv"))
            self.assertIsNone(vbs.flat_translation_map("wop-nkjv"))
            self.assertIsNone(vbs.flat_translation_map("vot-matthew"))

    def test_wrong_prefix_is_none(self):
        write_text(os.path.join(self.data, "bible-web.js"),
                   "var SOMETHING_ELSE = {};")
        with script_reads():
            self.assertIsNone(vbs.flat_translation_map("web"))

    def test_missing_semicolon_is_none(self):
        write_text(os.path.join(self.data, "bible-web.js"),
                   "var BIBLE_WEB = {}")
        with script_reads():
            self.assertIsNone(vbs.flat_translation_map("web"))

    def test_happy_path(self):
        with script_reads():
            self.assertEqual(vbs.flat_translation_map("kjv"), DEFAULT_FLAT)


class TestFreshVerses(FixtureTree):
    def test_flat_path_uses_the_matthew_plain_alias(self):
        rows = vbs.fresh_verses(None, "test-ed", "matthew", 1, self.root,
                                flat=DEFAULT_FLAT)
        self.assertEqual(rows, [{"n": 1, "text": "The book of the generation"},
                                {"n": 2, "text": "Abraham begat Isaac"}])

    def test_flat_path_sorts_and_strings(self):
        flat = {"genesis": {"1": [{"n": 2, "text": 5}, {"n": 1, "text": "a"}]}}
        self.assertEqual(vbs.fresh_verses(None, "test-ed", "genesis", 1, self.root, flat=flat),
                         [{"n": 1, "text": "a"}, {"n": 2, "text": "5"}])

    def test_flat_path_missing_book_or_chapter_is_none(self):
        self.assertIsNone(vbs.fresh_verses(None, "test-ed", "exodus", 1, self.root, flat=DEFAULT_FLAT))
        self.assertIsNone(vbs.fresh_verses(None, "test-ed", "genesis", 9, self.root, flat=DEFAULT_FLAT))

    def test_every_path(self):
        every = {"genesis": {"1": [{"n": 1, "text": "x"}]}}
        self.assertEqual(vbs.fresh_verses(None, "test-ed", "genesis", 1, self.root, every=every),
                         [{"n": 1, "text": "x"}])


class TestEditionVolKey(FixtureTree):
    def test_found(self):
        with script_reads():
            self.assertEqual(vbs.edition_vol_key("test-ed"), "bible-test")

    def test_missing_edition_is_none(self):
        with script_reads():
            self.assertIsNone(vbs.edition_vol_key("nope"))


class TestLoadPartialMap(FixtureTree):
    def test_happy_path(self):
        self.write_manifest({"bible-test:genesis": [1, 2]})
        with script_reads():
            self.assertEqual(vbs.load_partial_map(), {"bible-test:genesis": [1, 2]})

    def test_absent_var_is_empty(self):
        write_text(os.path.join(self.data, "bible-audio-manifest.js"),
                   "var SOMETHING_ELSE = {};\n")
        with script_reads():
            self.assertEqual(vbs.load_partial_map(), {})


class TestCheckStructural(FixtureTree):
    def test_happy_path(self):
        path = self.write_data_file(DEFAULT_TABLE)
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 0, out)
        self.assertIn("OK (structural)", out)
        self.assertIn("excluded by versification (1): genesis 2:3", out)

    def test_wrong_length(self):
        path = self.write_data_file({"genesis": {"1": [0, 120]}})
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 1)
        self.assertIn("2 slots for verse numbers 1..3", out)

    def test_stray_timing_at_a_verse_the_edition_lacks(self):
        path = self.write_data_file({"genesis": {"2": [0, 100, 50, 300]}})
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 1)
        self.assertIn("timed at verse 3, which this edition does not have", out)

    def test_non_integer_or_negative_slot(self):
        for arr in ([0, True, 250], [0, -5, 250], [0, 120.5, 250]):
            path = self.write_data_file({"genesis": {"1": arr}})
            rc, out = self.run_check(data=path)
            self.assertEqual(rc, 1, arr)
            self.assertIn("non-integer or negative slot", out)

    def test_onset_must_step_forward(self):
        for arr in ([0, 120, 120], [0, 250, 120]):
            path = self.write_data_file({"genesis": {"1": arr}})
            rc, out = self.run_check(data=path)
            self.assertEqual(rc, 1, arr)
            self.assertIn("onset does not step forward at verse 3", out)

    def test_empty_corpus(self):
        self.write_flat_map({"genesis": {"1": []}})
        path = self.write_data_file({"genesis": {"1": [0, 0]}})
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 1)
        self.assertIn("reference corpus has no verses for this chapter", out)

    def test_missing_chapter_in_corpus(self):
        path = self.write_data_file({"genesis": {"3": [0]}})
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 1)
        self.assertIn("reference verses could not be extracted", out)

    def test_var_not_found(self):
        path = os.path.join(self.root, "bible-sync-test-ed.js")
        write_text(path, "var BIBLE_SYNC_OTHER = {};\n")
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 1)
        self.assertIn("BIBLE_SYNC_TEST_ED not found", out)

    def test_unknown_edition(self):
        path = self.write_data_file(DEFAULT_TABLE)
        rc, out = self.run_check(data=path, ed="nope")
        self.assertEqual(rc, 1)
        self.assertIn("not a known edition", out)

    def test_partial_map_mismatch(self):
        self.write_manifest({"bible-test:genesis": [1]})
        path = self.write_data_file(DEFAULT_TABLE)
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 1)
        self.assertIn("BIBLE_SYNC_PARTIAL lists 1 timed chapter(s), the data file ships 2", out)

    def test_no_volkey(self):
        self.write_audio_track(None)
        path = self.write_data_file(DEFAULT_TABLE)
        rc, out = self.run_check(data=path)
        self.assertEqual(rc, 1)
        self.assertIn("no volKey for this edition", out)


class TestCheckFull(FixtureTree):
    def setUp(self):
        super().setUp()
        self.mp3 = os.path.join(self.root, "genesis_001.mp3")
        write_text(self.mp3, "fake mp3 bytes")
        self.mp3_size = os.path.getsize(self.mp3)
        self._write_bab(audio_index={("genesis", 1): (self.mp3, "tag")})

    def belt_rows(self):
        return [{"n": 1, "t": None, "status": "UNSPOKEN"},
                {"n": 2, "t": 1.2, "status": "CONFIRMED"},
                {"n": 3, "t": 2.5, "status": "CONFIRMED"}]

    def write_belt(self, book, ch, verses, settings_hash=None, verses_hash=None, audio_size=None):
        belt = {"bookId": book, "chapter": ch,
                "settings_hash": settings_hash if settings_hash is not None else self.want_settings_hash(),
                "versesHash": verses_hash if verses_hash is not None else self.verses_hash(book, ch),
                "audioSize": audio_size if audio_size is not None else self.mp3_size,
                "verses": verses}
        write_text(os.path.join(self.tools, "_align-work", "bible", "test-ed",
                                "%s_%03d.json" % (book, ch)), json.dumps(belt))
        return belt

    def run_full(self, data):
        with mock.patch.object(vbs, "ffprobe_dur", return_value=60.0):
            return self.run_check(data=data, structural=False)

    def test_happy_path(self):
        self.write_belt("genesis", 1, self.belt_rows())
        path = self.write_data_file({"genesis": {"1": [0, 120, 250]}})
        rc, out = self.run_full(path)
        self.assertEqual(rc, 0, out)
        self.assertIn("OK: every chapter matches its corpus, its audio and its belt", out)

    def test_rebuild_mismatch(self):
        self.write_belt("genesis", 1, self.belt_rows())
        path = self.write_data_file({"genesis": {"1": [0, 120, 999]}})
        rc, out = self.run_full(path)
        self.assertEqual(rc, 1)
        self.assertIn("shipped array != rebuilt from belt", out)

    def test_stale_settings_hash(self):
        self.write_belt("genesis", 1, self.belt_rows(), settings_hash="0000000000")
        path = self.write_data_file({"genesis": {"1": [0, 120, 250]}})
        rc, out = self.run_full(path)
        self.assertEqual(rc, 1)
        self.assertIn("belt settings 0000000000 !=", out)

    def test_no_belt_on_disk(self):
        os.makedirs(os.path.join(self.tools, "_align-work", "bible", "test-ed"), exist_ok=True)
        path = self.write_data_file({"genesis": {"1": [0, 120, 250]}})
        rc, out = self.run_full(path)
        self.assertEqual(rc, 1)
        self.assertIn("no belt on disk", out)

    def test_no_belt_folder(self):
        path = self.write_data_file({"genesis": {"1": [0, 120, 250]}})
        rc, out = self.run_full(path)
        self.assertEqual(rc, 1)
        self.assertIn("no belt folder", out)

    def test_gate_clearing_belt_missing_from_the_file(self):
        self._write_bab(audio_index={("genesis", 1): (self.mp3, "tag"),
                                     ("genesis", 2): (self.mp3, "tag")})
        self.write_belt("genesis", 1, self.belt_rows())
        self.write_belt("genesis", 2, [{"n": 1, "t": 1.0, "status": "CONFIRMED"},
                                       {"n": 2, "t": 2.0, "status": "CONFIRMED"},
                                       {"n": 4, "t": 4.0, "status": "CONFIRMED"}])
        self.write_manifest({"bible-test:genesis": [1]})
        path = self.write_data_file({"genesis": {"1": [0, 120, 250]}})
        rc, out = self.run_full(path)
        self.assertEqual(rc, 1)
        self.assertIn("current belt clears the gate but is not in the data file", out)


class TestMain(FixtureTree):
    def run_main(self, argv):
        buf = io.StringIO()
        with mock.patch.object(sys, "argv", argv):
            with contextlib.redirect_stdout(buf), script_reads():
                rc = vbs.main()
        return rc, buf.getvalue()

    def test_single_edition_structural_happy(self):
        path = self.write_data_file(DEFAULT_TABLE)
        rc, out = self.run_main(["validate-bible-sync.py", "--edition", "test-ed",
                                 "--data", path, "--structural"])
        self.assertEqual(rc, 0, out)
        self.assertIn("OK (structural)", out)

    def test_data_and_all_editions_is_an_error(self):
        err = io.StringIO()
        with mock.patch.object(sys, "argv", ["validate-bible-sync.py", "--data", "x.js",
                                             "--all-editions"]):
            with contextlib.redirect_stderr(err):
                with self.assertRaises(SystemExit) as cm:
                    vbs.main()
        self.assertEqual(cm.exception.code, 2)

    def test_all_editions_with_no_files(self):
        empty = os.path.join(self.root, "empty-data")
        os.makedirs(empty)
        saved = vbs.DATA
        vbs.DATA = empty
        try:
            rc, out = self.run_main(["validate-bible-sync.py", "--all-editions"])
        finally:
            vbs.DATA = saved
        self.assertEqual(rc, 1)
        self.assertIn("found no src/data/bible-sync-*.js to check", out)


if __name__ == "__main__":
    unittest.main()
