"""Tests for tools/_alignlib.py — the read-along alignment core (item 13).

Pure functions only: normalizers, the matcher, Needleman-Wunsch, the
transcript fill and its guard, the probe scan, the belt, and the settings
registry. No model, no GPU, no network, no ffmpeg: the legs that need them
are excluded by design (see the NOT-COVERED note at the bottom).

Import seam: tools/ goes on sys.path, then `import _alignlib as al` — the
module docstring's own usage. Top-level imports are stdlib only.
"""
import hashlib
import json
import os
import struct
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

ROOT = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(ROOT, "tools")
sys.path.insert(0, TOOLS)

import _alignlib as al  # noqa: E402


def _settings(**overrides):
    s = dict(al.SETTINGS_BASE)
    s.update(overrides)
    return s


class TestNormalizers(unittest.TestCase):
    def test_norm_token_keeps_apostrophes(self):
        self.assertEqual(al.norm_token("Lord's"), "lord's")
        self.assertEqual(al.norm_token("Don't!"), "don't")
        self.assertEqual(al.norm_token("YahuShua"), "yahushua")
        self.assertEqual(al.norm_token("\u201cHello\u201d"), "hello")

    def test_norm_token_folds_curly_apostrophe(self):
        # A curly apostrophe becomes a straight one and is KEPT.
        self.assertEqual(al.norm_token("\u2019tis"), "'tis")

    def test_legacy_strips_apostrophes_too(self):
        self.assertEqual(al._norm_token_legacy("lord's"), "lords")
        self.assertEqual(al._norm_token_legacy("\u2019tis"), "tis")
        self.assertEqual(al._norm_token_legacy("Don't"), "dont")

    def test_normalizer_picks_by_setting(self):
        self.assertIs(al.normalizer({"norm_apostrophes": True}), al.norm_token)
        self.assertIs(al.normalizer({"norm_apostrophes": False}),
                      al._norm_token_legacy)
        self.assertIs(al.normalizer({}), al.norm_token)  # default: kept

    def test_match_normalizer_follows_the_transcript(self):
        words = [["lords", 0.0, 1.0]]  # no apostrophe anywhere: legacy domain
        self.assertIs(al.match_normalizer({"norm_apostrophes": True}, words),
                      al._norm_token_legacy)
        words = [["lord's", 0.0, 1.0]]  # an apostrophe: same domain as norm_token
        self.assertIs(al.match_normalizer({"norm_apostrophes": True}, words),
                      al.norm_token)
        # The setting itself off always means legacy, whatever the words say.
        self.assertIs(al.match_normalizer({"norm_apostrophes": False}, words),
                      al._norm_token_legacy)

    def test_ascii_fold(self):
        self.assertEqual(al.ascii_fold("caf\u00e9"), "cafe")
        self.assertEqual(al.ascii_fold("\u201cHello\u201d \u2014 world\u2026"),
                         '"Hello"   world ')
        self.assertEqual(al.ascii_fold("it\u2019s"), "it's")

    def test_spoken_words_splits_never_fuses(self):
        # "Lord:Beloved" is two tokens, never the phantom "lordbeloved".
        self.assertEqual(al.spoken_words("Thus says The Lord:Beloved, hear."),
                         ["thus", "says", "the", "lord", "beloved", "hear"])
        self.assertEqual(al.spoken_words("chapter 18"), ["chapter", "18"])
        self.assertEqual(al.spoken_words("'tis the season"), ["tis", "the", "season"])

    def test_is_digit_token(self):
        self.assertTrue(al.is_digit_token("18"))
        self.assertTrue(al.is_digit_token("1st"))
        self.assertFalse(al.is_digit_token("lord"))
        self.assertFalse(al.is_digit_token(""))
        self.assertFalse(al.is_digit_token(None))


class TestMatcher(unittest.TestCase):
    def test_tok_match_exact_and_prefix(self):
        self.assertEqual(al.tok_match("lord", "lord"), "exact")
        self.assertEqual(al.tok_match("speaking", "speak"), "prefix")
        self.assertEqual(al.tok_match("speak", "speaking"), "prefix")

    def test_prefix_guard_keeps_short_words_out(self):
        self.assertIsNone(al.tok_match("the", "there"))
        self.assertIsNone(al.tok_match("there", "three"))
        self.assertIsNone(al.tok_match("in", "into"))

    def test_name_match_needs_the_name_in_names(self):
        names = {"benaiah"}
        self.assertEqual(al.tok_match("binaya", "benaiah", names), "name")
        # Order matters: a is spoken, b is reference. Swapped, b is not a name.
        self.assertIsNone(al.tok_match("benaiah", "binaya", names))
        self.assertIsNone(al.tok_match("binaya", "benaiah"))
        # Ordinary words never get the name witness unless they are in the
        # chapter's names: "there"/"three" share a consonant skeleton, so
        # with "three" in names the witness IS granted — the names list,
        # not the sound, is the gate.
        self.assertIsNone(al.tok_match("there", "three"))
        self.assertEqual(al.tok_match("there", "three", {"three"}), "name")

    def test_name_tokens(self):
        names = al.name_tokens("Then Benaiah the son of Jehoiada went.")
        self.assertEqual(names, {"benaiah", "jehoiada"})
        # Sentence openers and short words are not names.
        self.assertNotIn("then", al.name_tokens("Then God said."))
        self.assertNotIn("god", al.name_tokens("Then God said."))

    def test_witness_stamp(self):
        self.assertEqual(al.witness_stamp({}), {"witness": "strict"})
        self.assertEqual(al.witness_stamp({"name_tolerant": True}),
                         {"witness": "name-tolerant", "tolerance": 3})
        self.assertEqual(al.TOLERANCE, 3)

    def test_spelling_fold_by_list_not_rule(self):
        self.assertEqual(al.spelling_fold("labouring"), "laboring")
        self.assertEqual(al.spelling_fold("neighbour"), "neighbor")
        self.assertEqual(al.spelling_fold("shewed"), "showed")
        self.assertEqual(al.spelling_fold("fulness"), "fullness")
        self.assertEqual(al.spelling_fold("brake"), "break")
        self.assertEqual(al.spelling_fold("aught"), "ought")
        self.assertEqual(al.spelling_fold("throughly"), "thoroughly")
        # Never a rule on -our: these are different words, untouched.
        self.assertEqual(al.spelling_fold("scoured"), "scoured")
        self.assertEqual(al.spelling_fold("your"), "your")
        self.assertEqual(al.spelling_fold("four"), "four")

    def test_name_fold(self):
        self.assertEqual(al._name_fold("malchijah"), "malkiah")
        self.assertEqual(al._skel("malkiah"), "mlkh")

    def test_name_alike(self):
        self.assertTrue(al.name_alike("pashur", "pashhur"))
        self.assertTrue(al.name_alike("malak", "malluch"))
        self.assertTrue(al.name_alike("hattish", "hattush"))
        self.assertTrue(al.name_alike("binaya", "benaiah"))
        self.assertFalse(al.name_alike("binaya", "benaiah", iah=False))
        # The iah rule adds the h, never drops it: two men, 1 Chr 11:41/44.
        self.assertFalse(al.name_alike("uzzia", "uriah"))
        # Short names have too few consonants to tell apart.
        self.assertFalse(al.name_alike("amos", "amos"))
        self.assertFalse(al.name_alike("joab", "joab"))


class TestNeedlemanWunsch(unittest.TestCase):
    def test_exact_path(self):
        words = [["the", 0.0, 0.5], ["lord", 0.6, 1.0]]
        self.assertEqual(al.nw_align(words, ["the", "lord"], _settings()),
                         {0: 0, 1: 1})

    def test_prefix_earns_a_match(self):
        words = [["speaking", 0.0, 0.5]]
        self.assertEqual(al.nw_align(words, ["speak"], _settings()), {0: 0})

    def test_empty_sides(self):
        self.assertEqual(al.nw_align([], ["a"], _settings()), {})
        self.assertEqual(al.nw_align([["a", 0.0, 1.0]], [], _settings()), {})

    def test_path_is_monotone(self):
        words = [["x", 0.0, 0.5], ["the", 0.6, 1.0], ["y", 1.1, 1.5],
                 ["lord", 1.6, 2.0]]
        path = al.nw_align(words, ["the", "lord"], _settings())
        self.assertEqual(path, {0: 1, 1: 3})
        self.assertEqual(list(sorted(path)), sorted(path))

    def test_nw_rows_folds_by_owner(self):
        words = [["a", 0.0, 0.5], ["b", 0.6, 1.0], ["c", 1.1, 1.5]]
        rows = al.nw_rows(words, ["a", "b", "c"], ["u1", "u2", "u2"],
                          {0: 0, 2: 2})
        self.assertEqual(rows["u1"], {"t": 0.0, "tEnd": 0.5, "hit": 1,
                                      "tot": 1, "firstSpoken": 0})
        # u2's first token was unspoken: firstSpoken is its local index.
        self.assertEqual(rows["u2"], {"t": 1.1, "tEnd": 1.5, "hit": 1,
                                      "tot": 2, "firstSpoken": 1})

    def test_nw_rows_first_spoken_skips_unspoken_prefix(self):
        words = [["b", 0.6, 1.0], ["c", 1.1, 1.5]]
        rows = al.nw_rows(words, ["a", "b", "c", "d"], ["u", "u", "u", "u"],
                          {2: 0, 3: 1})
        # Leading printed tokens sit before firstSpoken; the start is the
        # first token the transcript actually contains.
        self.assertEqual(rows["u"]["firstSpoken"], 2)
        self.assertEqual(rows["u"]["t"], 0.6)

    def test_nw_rows_omits_unmatched_owners(self):
        self.assertEqual(al.nw_rows([["a", 0.0, 0.5]], ["a"], ["u"], {}), {})


class TestJsonAndWav(unittest.TestCase):
    def test_dump_json_round_trips_and_leaves_no_part(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "cache.json")
            al.dump_json(path, {"a": [1, 2], "b": "x"})
            self.assertFalse(os.path.exists(path + ".part"))
            self.assertEqual(al.load_json(path), {"a": [1, 2], "b": "x"})

    def test_load_json_missing_or_broken_is_a_miss(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(al.load_json(os.path.join(d, "nope.json")))
            bad = os.path.join(d, "bad.json")
            with open(bad, "w", encoding="utf-8") as f:
                f.write("{not json")
            self.assertIsNone(al.load_json(bad))

    def test_err_line(self):
        self.assertEqual(al.err_line(ValueError("first\nsecond")), "first")
        # A bare assert has no message: the type name, never an IndexError.
        self.assertEqual(al.err_line(AssertionError()), "AssertionError")
        self.assertEqual(al.err_line(ValueError("x" * 200)), "x" * 110)
        self.assertEqual(al.err_line(ValueError("abcdef"), n=3), "abc")

    def _wav_bytes(self, data=b"\x00\x00\x01\x00", riff_size=None, data_size=None):
        body = (b"fmt " + struct.pack("<I", 16) + b"\x00" * 16
                + b"data" + struct.pack("<I", len(data) if data_size is None else data_size)
                + data)
        total = 12 + len(body)
        return (b"RIFF" + struct.pack("<I", total - 8 if riff_size is None else riff_size)
                + b"WAVE" + body)

    def test_wav_complete(self):
        with tempfile.TemporaryDirectory() as d:
            good = os.path.join(d, "good.wav")
            with open(good, "wb") as f:
                f.write(self._wav_bytes())
            self.assertTrue(al.wav_complete(good))
            # A conversion killed part-way leaves the sizes disagreeing.
            short = os.path.join(d, "short.wav")
            with open(short, "wb") as f:
                f.write(self._wav_bytes(data_size=100))
            self.assertFalse(al.wav_complete(short))
            notwav = os.path.join(d, "text.txt")
            with open(notwav, "wb") as f:
                f.write(b"hello world, not a wav")
            self.assertFalse(al.wav_complete(notwav))
            self.assertFalse(al.wav_complete(os.path.join(d, "missing.wav")))


class TestTranscriptFill(unittest.TestCase):
    def test_tx_holes(self):
        words = [["a", 1.0, 2.0], ["b", 25.0, 26.0]]
        self.assertEqual(al.tx_holes(words, 60, 20.0),
                         [(2.0, 25.0), (26.0, 60.0)])
        self.assertEqual(al.tx_holes([], 30, 20.0), [(0.0, 30.0)])
        self.assertEqual(al.tx_holes([], 10, 20.0), [])  # too short to count
        self.assertEqual(al.tx_holes(words, 60, 40.0), [])

    def test_tx_max_gap(self):
        words = [["a", 1.0, 2.0], ["b", 5.0, 6.0]]
        self.assertEqual(al.tx_max_gap(words, 0, 10), 4.0)
        self.assertEqual(al.tx_max_gap(words, 0, 3), 1.0)
        self.assertEqual(al.tx_max_gap([], 0, 10), 10.0)

    def test_tx_fill_keeps_the_best_ear_whole(self):
        # The stub ear hears the same word on every ask; round 2 asks only
        # the sub-hole that is still >= mn, never the span it already filled.
        def ear(t0, t1):
            return [["x", 5.0, 6.0]]

        words, report = al.tx_fill([["a", 0.0, 1.0], ["b", 30.0, 31.0]],
                                   60.0, [("mms", ear)])
        self.assertEqual([w[0] for w in words],
                         ["a", "x", "x", "b", "x", "x"])
        self.assertEqual([w[1] for w in words], [0.0, 5.7, 11.4, 30.0, 35.7, 41.4])
        first = report[0]
        self.assertEqual((first["variant"], first["added"], first["asks"]),
                         ("mms", 2, 2))
        self.assertEqual(first["gapAfter"], 17.6)

    def test_tx_fill_no_hole_no_work(self):
        words = [["a", 0.0, 30.0]]
        new, report = al.tx_fill(words, 30.0, [("mms", lambda t0, t1: [])])
        self.assertEqual(new, words)
        self.assertEqual(report, [])

    def test_tx_fill_stamp(self):
        tx = {"fill": {"v": 1},
              "words": [["a", 1.0, 2.0], ["b", 25.0, 26.0]], "dur": 60}
        self.assertEqual(al.tx_fill_stamp(tx), {"txFill": 1, "txHoles": 2})
        self.assertEqual(al.tx_fill_stamp({"words": [], "dur": 30}),
                         {"txFill": 0, "txHoles": 1})


class TestFillGuard(unittest.TestCase):
    def test_fill_move_ok(self):
        self.assertTrue(al._fill_move_ok(10.0, 8.5))   # back >= 1 s
        self.assertFalse(al._fill_move_ok(10.0, 9.5))  # sub-second, not a seek
        self.assertFalse(al._fill_move_ok(10.0, 11.0))  # forward, never
        self.assertTrue(al._fill_move_ok(30.0, 29.5))  # back off a 30 s seek
        self.assertTrue(al._fill_move_ok(31.0, 30.5))  # within seek tolerance
        self.assertFalse(al._fill_move_ok(32.0, 31.5))  # past seek tolerance

    def test_kept_move_and_reverted_move(self):
        old = [{"n": 1, "t": 10.0, "tEnd": 12.0}]
        rows, rep = al.fill_guard(old, [{"n": 1, "t": 8.0, "tEnd": 12.0}])
        self.assertEqual(rows[0]["t"], 8.0)
        self.assertEqual((rep["kept"], rep["reverted"]), (1, 0))
        rows, rep = al.fill_guard(old, [{"n": 1, "t": 9.5, "tEnd": 12.0}])
        self.assertEqual(rows[0], old[0])  # the old row back, whole
        self.assertEqual((rep["kept"], rep["reverted"]), (0, 1))

    def test_prefer_a_pulls_a_kept_move_back_off_whisper(self):
        old = [{"n": 1, "t": 10.0, "tEnd": 12.0}]
        new = [{"n": 1, "t": 8.0, "tEnd": 12.0, "tA": 8.5, "tB": 8.0}]
        rows, rep = al.fill_guard(old, new)
        self.assertEqual(rows[0]["t"], 8.46)  # tA - 0.04, never before tB
        self.assertEqual(rep["tA"], [1])

    def test_review_guess_starting_inside_the_previous_verse_stays_dark(self):
        old = [{"n": 1, "t": 0.0, "tEnd": 6.0}, {"n": 2, "t": None}]
        new = [{"n": 1, "t": 0.0, "tEnd": 6.0},
               {"n": 2, "t": 5.0, "status": "REVIEW", "tA": 5.0, "tB": 5.0}]
        rows, rep = al.fill_guard(old, new)
        self.assertIsNone(rows[1]["t"])
        self.assertEqual(rep["darkKept"], [2])

    def test_review_guess_far_past_both_legs_stays_dark(self):
        old = [{"n": 1, "t": None}]
        new = [{"n": 1, "t": 20.0, "status": "REVIEW", "tA": 5.0, "tB": 5.0}]
        rows, rep = al.fill_guard(old, new)
        self.assertIsNone(rows[0]["t"])
        self.assertEqual(rep["darkKept"], [1])

    def test_newly_dark_is_left_as_the_belt_says(self):
        old = [{"n": 1, "t": 5.0, "tEnd": 6.0}]
        rows, rep = al.fill_guard(old, [{"n": 1, "t": None, "tEnd": 6.0}])
        self.assertIsNone(rows[0]["t"])
        self.assertEqual(rep["newlyDark"], 1)

    def test_reverted_row_clamps_its_tend(self):
        old = [{"n": 1, "t": 10.0, "tEnd": 12.0}, {"n": 2, "t": 13.0, "tEnd": 14.0}]
        new = [{"n": 1, "t": 9.5, "tEnd": 12.0}, {"n": 2, "t": 11.0, "tEnd": 14.0}]
        rows, rep = al.fill_guard(old, new)
        self.assertEqual(rows[0]["t"], 10.0)      # reverted to the old onset
        self.assertEqual(rows[0]["tEnd"], 11.0)   # clamped to the next onset


class TestProbeScan(unittest.TestCase):
    WANT = ["and", "the", "word", "of", "the", "lord"]

    def test_probe_ok_exact(self):
        self.assertTrue(al.probe_ok(self.WANT, list(self.WANT)))

    def test_probe_ok_tolerates_one_misheard_word(self):
        # One misheard FUNCTION word costs one token; the content words
        # (word, lord) still have to match — that is the Deut-15 guard.
        heard = ["and", "the", "word", "off", "the", "lord"]
        self.assertTrue(al.probe_ok(self.WANT, heard))
        # Losing a content word instead fails the probe.
        heard = ["and", "the", "word", "of", "the", "kings"]
        self.assertFalse(al.probe_ok(self.WANT, heard))

    def test_probe_ok_needs_its_content_words(self):
        heard = ["and", "the", "said", "of", "the", "kings"]
        self.assertFalse(al.probe_ok(self.WANT, heard))

    def test_scan_is_non_consuming_on_a_miss(self):
        want = ["a", "b", "c", "d", "e"]
        self.assertTrue(al._scan(want, ["a", "x", "b", "c", "d", "e"],
                                 lambda h, w: h == w))

    def test_second_chance_hears_kjv_the_modern_way(self):
        want = ["shewed", "him", "the", "way"]
        heard = ["showed", "him", "the", "way"]
        self.assertFalse(al.probe_ok(want, heard))
        self.assertTrue(al.second_chance(want, heard))
        self.assertTrue(al.probe_ok(want, heard, tolerant=True))

    def test_second_chance_hears_iah_names(self):
        want = ["and", "benaiah", "said"]
        heard = ["and", "binaya", "said"]
        names = {"benaiah"}
        self.assertFalse(al.probe_ok(want, heard, names))
        self.assertTrue(al.second_chance(want, heard, names))
        self.assertTrue(al.probe_ok(want, heard, names, tolerant=True))

    def test_probe_with_fake_leg_and_pcm(self):
        leg = SimpleNamespace(
            transcribe_probe=lambda pcm: [
                SimpleNamespace(text="and the word of the lord god said")])
        s = al.settings_for("letters-A")
        with mock.patch.object(al, "pcm_16k", return_value=[0] * 160000):
            ok, heard, second = al.probe("x.wav", 1.0,
                                          "And the word of the LORD", s, leg)
        self.assertTrue(ok)
        self.assertEqual(heard, ["and", "the", "word", "of", "the",
                                 "lord", "god", "said"])
        self.assertFalse(second)

    def test_probe_empty_audio_returns_no_hearing(self):
        leg = SimpleNamespace(transcribe_probe=lambda pcm: [])
        s = al.settings_for("letters-A")
        with mock.patch.object(al, "pcm_16k", return_value=[]):
            self.assertEqual(al.probe("x.wav", 1.0, "and the word", s, leg),
                             (False, []))


class TestInterpolateRuns(unittest.TestCase):
    def test_run_spreads_proportionally(self):
        rows = [{"t": 0.0, "status": "CONFIRMED"},
                {"t": None, "status": "REVIEW"},
                {"t": None, "status": "REVIEW"},
                {"t": 10.0, "status": "CONFIRMED"}]
        al._interpolate_runs(rows)
        self.assertEqual([r["t"] for r in rows], [0.0, 3.33, 6.67, 10.0])
        self.assertTrue(rows[1]["interpolated"])
        self.assertTrue(rows[2]["interpolated"])

    def test_weights_by_token_count(self):
        rows = [{"t": 0.0, "status": "CONFIRMED"},
                {"t": None, "status": "REVIEW"},
                {"t": None, "status": "REVIEW"},
                {"t": 12.0, "status": "CONFIRMED"}]
        al._interpolate_runs(rows, 12.0, [1, 3, 1, 1])
        self.assertEqual([r["t"] for r in rows], [0.0, 5.14, 10.29, 12.0])

    def test_unspoken_consumes_no_time(self):
        rows = [{"t": 0.0, "status": "CONFIRMED"},
                {"t": None, "status": "UNSPOKEN"},
                {"t": None, "status": "REVIEW"},
                {"t": 10.0, "status": "CONFIRMED"}]
        al._interpolate_runs(rows)
        self.assertIsNone(rows[1]["t"])  # never painted, never interpolated
        self.assertEqual(rows[2]["t"], 5.0)

    def test_trailing_run_without_end_stays_unproven(self):
        rows = [{"t": 0.0, "status": "CONFIRMED"},
                {"t": None, "status": "REVIEW"}]
        al._interpolate_runs(rows)
        self.assertIsNone(rows[1]["t"])

    def test_sounds_like_start(self):
        self.assertTrue(al._sounds_like_start("eltika", ["eltekeh"]))
        self.assertTrue(al._sounds_like_start("mijakan", ["me", "jarkon"]))
        self.assertFalse(al._sounds_like_start("have", ["he"]))
        # The docstring's "amen" for "Amam" does NOT clear the 0.6 bar
        # (ratio 0.5): pin the code, not the comment.
        self.assertFalse(al._sounds_like_start("amen", ["amam"]))

    def test_voice_onset(self):
        sil = [(4.0, 6.0)]
        self.assertEqual(al._voice_onset(5.0, sil), 5.95)  # pause end - 0.05
        self.assertEqual(al._voice_onset(3.0, sil), 3.0)   # outside any pause
        # A start more than max_snap early stays where whisper put it.
        self.assertEqual(al._voice_onset(1.0, [(0.0, 5.0)]), 1.0)

    def test_make_snap(self):
        snap = al.make_snap([(4.0, 6.0)])
        self.assertEqual(snap(5.0), 5.95)
        self.assertEqual(snap(3.0), 3.0)
        self.assertEqual(al.make_snap([(4.0, 10.0)])(4.5), 4.5)  # too far


class TestBelt(unittest.TestCase):
    def _unit(self, owner, tokens, n):
        return {"owner": owner, "tokens": tokens, "ident": {"n": n}}

    def _deny_probe(self, t, expect):
        return (False, ["zzz"])

    def test_confirmed_legs_agree(self):
        A = {"u1": {"t": 10.0, "tEnd": 12.0}}
        B = {"u1": {"t": 10.4, "hit": 2, "tot": 2, "firstSpoken": 0}}
        rows = al.belt(A, B, [self._unit("u1", ["and", "the", "word"], 1)],
                       _settings(), self._deny_probe)
        self.assertEqual(rows[0]["status"], "CONFIRMED")
        self.assertEqual(rows[0]["t"], 10.0)  # min(): the later stamp is not taken
        self.assertEqual(rows[0]["delta"], 0.4)
        self.assertEqual(rows[0]["tEnd"], 12.0)

    def test_confirmed_epsilon_covers_float_dust(self):
        # Legs exactly 0.60 apart read 0.6000000000000014: still CONFIRMED.
        A = {"u1": {"t": 10.0, "tEnd": 12.0}}
        B = {"u1": {"t": 10.600000000000001, "hit": 2, "tot": 2,
                    "firstSpoken": 0}}
        rows = al.belt(A, B, [self._unit("u1", ["and", "the"], 1)],
                       _settings(), self._deny_probe)
        self.assertEqual(rows[0]["status"], "CONFIRMED")

    def test_skipped_prefix_trims_the_probe_and_takes_word_ts(self):
        A = {"u1": {"t": 10.0, "tEnd": 12.0, "wordTs": [9.0, 10.5]}}
        B = {"u1": {"t": 10.5, "hit": 2, "tot": 3, "firstSpoken": 1}}
        calls = []

        def probe(t, expect):
            calls.append((t, expect))
            return (True, ["says"])

        rows = al.belt(A, B,
                       [self._unit("u1", ["thus", "says", "the", "lord"], 1)],
                       _settings(), probe)
        self.assertEqual(rows[0]["status"], "CONFIRMED")
        self.assertEqual(rows[0]["t"], 10.5)  # wordTs[1], not leg A's 10.0
        self.assertEqual(rows[0]["skippedPrefix"], "thus")
        self.assertEqual(calls, [])  # legs agreed: no probe spent

    def test_probed_a_first_then_b(self):
        A = {"u1": {"t": 10.0, "tEnd": 12.0}}
        B = {"u1": {"t": 12.0, "hit": 2, "tot": 2, "firstSpoken": 0}}

        def probe(t, expect):
            return (True, ["and", "the", "word"]) if t == 10.0 else (False, ["x"])

        rows = al.belt(A, B, [self._unit("u1", ["and", "the", "word"], 1)],
                       _settings(), probe)
        self.assertEqual((rows[0]["status"], rows[0]["t"]), ("PROBED_A", 10.0))
        self.assertEqual(rows[0]["probe"], "and the word")

        def probe_b(t, expect):
            return (False, ["x"]) if t == 10.0 else (True, ["and", "the"])

        rows = al.belt(A, B, [self._unit("u1", ["and", "the", "word"], 1)],
                       _settings(), probe_b)
        self.assertEqual((rows[0]["status"], rows[0]["t"]), ("PROBED_B", 12.0))

    def test_second_chance_only_when_nothing_passed(self):
        A = {"u1": {"t": 10.0, "tEnd": 12.0}}
        B = {"u1": {"t": 12.0, "hit": 2, "tot": 2, "firstSpoken": 0}}

        def probe(t, expect):
            return (False, ["x"], True)  # second question says yes

        rows = al.belt(A, B, [self._unit("u1", ["and", "the", "word"], 1)],
                       _settings(), probe)
        self.assertEqual(rows[0]["status"], "PROBED_A")
        self.assertTrue(rows[0]["secondChance"])
        self.assertEqual(rows[0]["t"], 10.0)  # A is asked first

    def test_review_interpolates_and_snap_skips_it(self):
        A = {"u1": {"t": 10.0, "tEnd": 12.0},
             "u2": {"t": 20.0, "tEnd": 22.0}}
        B = {"u1": {"t": 10.2, "hit": 2, "tot": 2, "firstSpoken": 0},
             "u2": {"t": 30.0, "hit": 4, "tot": 4, "firstSpoken": 0}}
        units = [self._unit("u1", ["and", "the", "word"], 1),
                 self._unit("u2", ["thus", "says", "lord"], 2)]
        rows = al.belt(A, B, units, _settings(), self._deny_probe,
                       snap_fn=lambda t: t + 5.0, end_t=40.0)
        self.assertEqual(rows[1]["status"], "REVIEW")
        self.assertEqual(rows[1]["t"], 25.0)  # spread across the gap
        self.assertTrue(rows[1]["interpolated"])
        self.assertNotIn("snapped_from", rows[1])  # snap skips interpolated
        self.assertEqual(len(rows[1]["probeMisses"]), 2)

    def test_unspoken_when_whisper_found_none_of_it(self):
        A = {"u1": {"t": 20.0, "tEnd": 22.0}}
        B = {"u1": {"t": 30.0, "hit": 0, "tot": 4, "firstSpoken": 0}}
        rows = al.belt(A, B, [self._unit("u1", ["thus", "says", "lord"], 1)],
                       _settings(), self._deny_probe)
        self.assertEqual(rows[0]["status"], "UNSPOKEN")
        self.assertIsNone(rows[0]["t"])

    def test_past_tx_cut_is_review_not_unspoken(self):
        A = {"u1": {"t": 25.0, "tEnd": 27.0}}
        B = {"u1": {"t": 30.0, "hit": 0, "tot": 4, "firstSpoken": 0}}
        rows = al.belt(A, B, [self._unit("u1", ["thus", "says", "lord"], 1)],
                       _settings(), self._deny_probe, tx_cut=20.0)
        self.assertEqual(rows[0]["status"], "REVIEW")
        self.assertTrue(rows[0]["pastTxCut"])

    def test_snap_bias_clamp_and_lead_in_order(self):
        A = {"u1": {"t": 10.0, "tEnd": 12.0}, "u2": {"t": 9.0, "tEnd": 11.0}}
        B = {"u1": {"t": 10.2, "hit": 2, "tot": 2, "firstSpoken": 0},
             "u2": {"t": 9.0, "hit": 2, "tot": 2, "firstSpoken": 0}}
        units = [self._unit("u1", ["and", "the"], 1),
                 self._unit("u2", ["thus", "says"], 2)]
        s = _settings(onset_bias_s=0.2, lead_in=0.0)
        rows = al.belt(A, B, units, s, self._deny_probe,
                       snap_fn=lambda t: round(t + 0.1, 2))
        # Snap, then bias: 10.0 -> 10.1 -> 10.3.
        self.assertEqual(rows[0]["t"], 10.3)
        self.assertEqual(rows[0]["snapped_from"], 10.0)
        # The second row would land at 9.3: clamped to the row before it.
        self.assertEqual(rows[1]["t"], 10.3)
        self.assertTrue(rows[1]["clamped"])

    def test_lead_in_shifts_the_shipped_onset(self):
        A = {"u1": {"t": 10.0, "tEnd": 12.0}}
        B = {"u1": {"t": 10.2, "hit": 2, "tot": 2, "firstSpoken": 0}}
        rows = al.belt(A, B, [self._unit("u1", ["and", "the"], 1)],
                       _settings(lead_in=0.5), self._deny_probe)
        self.assertEqual(rows[0]["t"], 9.5)


class TestRegistry(unittest.TestCase):
    def test_settings_base_pins(self):
        base = al.SETTINGS_BASE
        self.assertEqual((base["match_exact"], base["match_prefix"],
                         base["gap_transcript"], base["gap_fragment"]),
                        (2.0, 1.4, -0.35, -0.55))
        self.assertEqual((base["agree_sec"], base["probe_len"],
                         base["probe_tokens"], base["lead_in"]),
                        (0.6, 7.0, 6, 0.0))
        self.assertEqual((al.TX_FILL, al.TX_FILL_MIN, al.FILL_GUARD,
                         al.FILL_BACK, al.FILL_SEEK, al.FILL_SEEK_TOL,
                         al.PREFER_A, al.PREFER_A_BACK, al.TX_ANCHOR),
                        (1, 20.0, 2, 1.0, 30.0, 1.0, 0.7, 0.04, 2))

    def test_settings_for(self):
        s = al.settings_for("letters-B")
        self.assertEqual(s["min_frag_hit"], 0.4)
        self.assertEqual(s["unit"], "paragraph")
        self.assertEqual(s["family"], "letters-B")
        self.assertEqual(al.settings_for("bible-brm-kjv")["psalm_superscription"],
                         "unprinted")
        with self.assertRaises(KeyError):
            al.settings_for("no-such-family")

    def test_settings_for_overrides_and_never_mutates_base(self):
        s = al.settings_for("letters-A", agree_sec=1.0)
        self.assertEqual(s["agree_sec"], 1.0)
        self.assertEqual(al.SETTINGS_BASE["agree_sec"], 0.6)
        # A None override is ignored, not written.
        self.assertEqual(al.settings_for("letters-A", agree_sec=None)["agree_sec"],
                         0.6)

    def test_sha10_and_settings_hash(self):
        self.assertEqual(al.sha10("abc"),
                         hashlib.sha1(b"abc").hexdigest()[:10])
        self.assertEqual(len(al.sha10("x")), 10)
        s = al.settings_for("letters-A")
        h = al.settings_hash(s)
        self.assertEqual(len(h), 10)
        # name_tolerant is a per-chapter witness mode, not a family setting:
        # it must not move the hash.
        self.assertEqual(al.settings_hash({**s, "name_tolerant": True}), h)
        self.assertNotEqual(al.settings_hash({**s, "agree_sec": 1.0}), h)

    def test_emit_settings_sheet(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "sheet.md")
            self.assertEqual(al.emit_settings_sheet(path), path)
            text = open(path, encoding="utf-8").read()
            for family in sorted(al.FAMILIES):
                self.assertIn(family, text)
                self.assertIn(al.settings_hash(al.settings_for(family)), text)
            self.assertIn("agree_sec", text)


class TestReleaseCaches(unittest.TestCase):
    def test_release_caches_drops_the_one_entry_pcm_cache(self):
        al._PCM_CACHE["path"] = "x.wav"
        al._PCM_CACHE["pcm"] = [0, 1]
        al.release_caches()
        self.assertEqual(al._PCM_CACHE, {"path": None, "pcm": None})


# NOT COVERED here, by design (see the item-13 scope in the list LOG):
# - WhisperLeg / MMSLeg: need faster-whisper + torchaudio models.
# - to_wav16k / silence_intervals: ffmpeg subprocess.
# - load_wav_16k / pcm_16k: torch + numpy + a real 16 kHz mono wav.
# - _self_mem / rss_gb / commit_gb / vram_free_gb: Windows ctypes / CUDA.
# - cuda_dll_dirs: Windows-only guards.
# - tx_anchor: already covered by test_tx_anchor.py (14 tests).


if __name__ == "__main__":
    unittest.main()
