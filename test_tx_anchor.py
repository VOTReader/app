"""_alignlib.tx_anchor: two kinds of Bible onset the belt got wrong, re-placed from the transcript it
already has (the c64 refuter, 2026-09-25). Fixtures are the refuter's real cases, trimmed."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))
import _alignlib as al  # noqa: E402


def units(*texts):
    return [{"tokens": al.spoken_words(t), "text": t} for t in texts]


class PrefixFrom(unittest.TestCase):
    def test_a_misheard_first_name_takes_the_onset_back(self):
        # WOP Joshua 19:44-45: 'Eltekeh' heard 'eltika'; leg B skipped it and the onset sat on Gibbethon.
        rows = [{"n": 43, "t": 350.0, "tEnd": 357.9, "status": "CONFIRMED"},
                {"n": 44, "t": 359.38, "status": "CONFIRMED", "skippedPrefix": "eltekeh"},
                {"n": 45, "t": 363.0, "status": "CONFIRMED"}]
        words = [["baalath", 356.9, 357.8], ["eltika", 358.18, 358.9], ["gibbethon", 359.38, 360.1]]
        ch = al.tx_anchor(rows, units("Elon, Timnah, Ekron,", "Eltekeh, Gibbethon, Baalath,", "Jehud"), words)
        # WOP has no silence map: the whisper start moves a quarter second on (the v2 refuter).
        self.assertEqual(ch, [(44, 359.38, 358.43, "prefixFrom")])
        self.assertEqual(rows[1]["prefixFrom"], 359.38)

    def test_a_spoken_section_heading_is_not_the_verse(self):
        # WEB Deuteronomy 15:19: the reader speaks the heading 'Firstborn Animals' before 'You shall dedicate'.
        rows = [{"n": 18, "t": 232.5, "tEnd": 247.0, "status": "PROBED_A"},
                {"n": 19, "t": 253.62, "status": "PROBED_A", "skippedPrefix": "you shall dedicate"},
                {"n": 20, "t": 271.0, "status": "PROBED_A"}]
        words = [["firstborn", 247.06, 247.9], ["animals", 250.08, 250.8], ["all", 250.84, 251.0]]
        self.assertEqual(al.tx_anchor(rows, units("x", "You shall dedicate all the firstborn", "y"), words), [])


class TxAnchor(unittest.TestCase):
    def rows(self, t_guess, tB):
        return [{"n": 1, "t": 5.72, "tEnd": 17.86, "status": "PROBED_A"},
                {"n": 2, "t": t_guess, "tB": tB, "status": "REVIEW", "interpolated": True},
                {"n": 3, "t": 26.46, "status": "PROBED_A"}]

    WORDS = [["his", 16.3, 16.56], ["father's", 16.56, 17.2], ["wife", 17.2, 17.54], ["you", 18.18, 18.86],
             ["are", 18.86, 19.04], ["arrogant", 19.04, 19.6], ["and", 19.6, 20.18], ["didn't", 20.18, 20.68],
             ["mourn", 20.68, 21.14], ["for", 25.82, 26.4]]
    SIL = [[17.9, 18.8]]        # the pause before "you"; the voice at ~18.78

    def test_a_guess_inside_the_previous_verse_moves_to_leg_b_on_the_first_word(self):
        # WEB 1 Corinthians 5:2: the recording reads 'arrogant' for 'puffed up', so the probe scan
        # fails, but tB sits on 'you' after verse 1's end.
        rows = self.rows(16.09, 18.18)
        ch = al.tx_anchor(rows, units("x", "You are puffed up, and didn't rather mourn", "For I"), self.WORDS, sil=self.SIL)
        self.assertEqual(ch, [(2, 16.09, 18.75, "txAnchor")])
        self.assertNotIn("interpolated", rows[1])
        self.assertEqual(rows[1]["status"], "REVIEW")

    def test_the_scan_finds_the_opening_without_leg_b(self):
        rows = self.rows(16.09, None)
        ch = al.tx_anchor(rows, units("x", "You are arrogant, and didn't mourn", "For I"), self.WORDS, sil=self.SIL)
        self.assertEqual(ch, [(2, 16.09, 18.75, "txAnchor")])

    def test_nothing_moves_past_a_proven_neighbour_or_onto_another_word(self):
        rows = self.rows(16.09, 25.82)          # tB on the NEXT verse's 'for'
        self.assertEqual(al.tx_anchor(rows, units("x", "You are puffed up", "For I"), self.WORDS[:3] + self.WORDS[-1:]), [])
        self.assertTrue(rows[1]["interpolated"])

    def test_a_proven_row_is_never_touched(self):
        rows = self.rows(16.09, 18.18)
        rows[1].update(status="PROBED_A", interpolated=False)
        rows[1].pop("interpolated")
        self.assertEqual(al.tx_anchor(rows, units("x", "You are arrogant", "For I"), self.WORDS), [])


class Refuted2(unittest.TestCase):
    """The v2 refuter's worse classes (2026-09-26 21:5x, out/txanchor/refute-v3/verdicts.md)."""

    def test_a_repeated_opening_takes_leg_a_at_the_first_match(self):
        # BRM Luke 3:24: "which was the son of" opens every clause; the previous end (221.49) runs
        # past whisper's "which" @ 221.2; leg A's 221.89 at the pause's end is the voice.
        rows = [{"n": 23, "t": 213.67, "tEnd": 221.49, "status": "PROBED_A"},
                {"n": 24, "tA": 221.89, "tB": 221.2, "t": 221.75, "status": "REVIEW", "interpolated": True},
                {"n": 25, "t": 229.83, "status": "PROBED_A"}]
        words = [["of", 220.88, 221.02], ["eli", 221.02, 221.2], ["which", 221.2, 221.76], ["was", 221.76, 222.1],
                 ["the", 222.1, 222.24], ["son", 222.24, 222.4], ["of", 222.4, 222.54], ["matthat", 222.54, 222.94],
                 ["which", 222.94, 223.4], ["was", 223.4, 223.6], ["the", 223.6, 223.78], ["son", 223.78, 223.9]]
        ch = al.tx_anchor(rows, units("x", "Which was the son of Matthat, which was the son of Levi", "y"), words,
                          sil=[[221.54, 221.89]])
        self.assertEqual(ch, [(24, 221.75, 221.89, "txAnchor")])

    def test_an_unsnapped_whisper_start_needs_a_full_second(self):
        # BRM Exodus 20:12: "honour" starts 0.52 s early in a breath the map does not call silence.
        rows = [{"n": 11, "t": 70.0, "tEnd": 86.5, "status": "PROBED_A"},
                {"n": 12, "t": 87.38, "status": "PROBED_A", "skippedPrefix": "Honour"},
                {"n": 13, "t": 95.0, "status": "PROBED_A"}]
        words = [["honour", 86.82, 87.3], ["thy", 87.38, 87.6]]
        self.assertEqual(al.tx_anchor(rows, units("x", "Honour thy father", "y"), words, sil=[[80.0, 81.0]]), [])


class Refuted(unittest.TestCase):
    """The v1 refuter's worse classes (2026-09-26 02:2x, out/txanchor/refute/verdicts.md)."""

    def test_a_start_inside_the_pause_moves_to_the_pause_end(self):
        # WEB Job 26:2: whisper starts "how" at 7.72 inside the pause [7.43, 8.84]; the voice is at 8.80.
        rows = [{"n": 1, "t": 2.1, "tEnd": 7.4, "status": "PROBED_A"},
                {"n": 2, "t": 9.9, "tB": 7.72, "status": "REVIEW", "interpolated": True},
                {"n": 3, "t": 14.0, "status": "PROBED_A"}]
        words = [["job", 2.1, 2.5], ["how", 7.72, 9.0], ["have", 9.0, 9.2], ["you", 9.2, 9.4], ["helped", 9.4, 9.8]]
        ch = al.tx_anchor(rows, units("x", "How have you helped him", "y"), words, sil=[[7.43, 8.84]])
        self.assertEqual(ch, [(2, 9.9, 8.79, "txAnchor")])

    def test_the_scan_needs_the_opening_words_in_a_row(self):
        # WOP 1 Chronicles 24:15: v14's "the sixteenth" is not v15's "the seventeenth".
        rows = [{"n": 14, "t": 118.0, "tEnd": 119.0, "status": "PROBED_A"},
                {"n": 15, "tA": 124.2, "t": 123.64, "status": "REVIEW", "interpolated": True},
                {"n": 16, "t": 130.0, "status": "PROBED_A"}]
        words = [["the", 120.18, 120.3], ["sixteenth", 120.3, 121.0], ["to", 121.0, 121.2], ["immer", 121.2, 121.8],
                 ["the", 124.1, 124.2], ["seventeenth", 124.2, 125.0], ["to", 125.0, 125.2], ["hezir", 125.2, 125.9]]
        ch = al.tx_anchor(rows, units("x", "the seventeenth to Hezir", "y"), words)
        self.assertEqual(ch, [(15, 123.64, 124.2, "txAnchor")])

    def test_the_scan_starts_after_the_previous_guess(self):
        rows = [{"n": 1, "t": 100.0, "tEnd": 101.0, "status": "PROBED_A"},
                {"n": 2, "t": 105.0, "status": "REVIEW", "interpolated": True},
                {"n": 3, "t": 109.0, "status": "REVIEW", "interpolated": True},
                {"n": 4, "t": 115.0, "status": "PROBED_A"}]
        words = [["and", 102.0, 102.2], ["the", 102.2, 102.4], ["king", 102.4, 103.0], ["said", 103.0, 103.5],
                 ["and", 110.0, 110.2], ["the", 110.2, 110.4], ["king", 110.4, 111.0], ["went", 111.0, 111.5]]
        ch = al.tx_anchor(rows, units("x", "and the king said", "and the king went", "y"), words)
        self.assertEqual(ch, [(2, 105.0, 102.15, "txAnchor"), (3, 109.0, 110.15, "txAnchor")])

    def test_leg_b_on_a_bare_the_is_not_the_verse(self):
        # WEB 1 Samuel 13:21: tB on "the" of "for the mattocks"; the reader says "yet they had a file".
        rows = [{"n": 20, "t": 290.0, "tEnd": 300.9, "status": "PROBED_A"},
                {"n": 21, "t": 301.1, "tB": 302.44, "status": "REVIEW", "interpolated": True},
                {"n": 22, "t": 310.0, "status": "PROBED_A"}]
        words = [["yet", 301.1, 301.3], ["they", 301.3, 301.5], ["had", 301.5, 301.7], ["for", 302.2, 302.44],
                 ["the", 302.44, 302.6], ["mattocks", 302.6, 303.2]]
        self.assertEqual(al.tx_anchor(rows, units("x", "The price was a pim for the mattocks", "y"), words), [])

    def test_wop_keeps_leg_a_inside_the_matched_word(self):
        # WOP 1 Chronicles 1:15: whisper "the" 121.10-122.00 absorbs the music gap; leg A's 122.01 is the voice.
        rows = [{"n": 14, "t": 116.63, "tEnd": 121.09, "status": "PROBED_A"},
                {"n": 15, "tA": 122.01, "tB": 121.1, "t": 122.02, "status": "REVIEW", "interpolated": True},
                {"n": 16, "t": 127.41, "status": "PROBED_A"}]
        words = [["the", 121.1, 122.0], ["hivite", 122.0, 122.6], ["the", 122.6, 122.8], ["arkite", 122.8, 123.4]]
        ch = al.tx_anchor(rows, units("x", "the Hivite, the Arkite", "y"), words)
        self.assertEqual(ch, [(15, 122.02, 122.01, "txAnchor")])

    def test_prefix_needs_long_words_ending_before_the_kept_one(self):
        # WOP John 21:6: "have" (of v5) is not "He" of the unspoken "And He said to them".
        rows = [{"n": 5, "t": 38.0, "tEnd": 42.0, "status": "PROBED_A"},
                {"n": 6, "t": 47.66, "status": "PROBED_A", "skippedPrefix": "And He said to them"},
                {"n": 7, "t": 55.0, "status": "PROBED_A"}]
        words = [["have", 42.98, 43.3], ["you", 43.3, 43.5], ["cast", 47.66, 48.0]]
        self.assertEqual(al.tx_anchor(rows, units("x", "And He said to them, Cast the net", "y"), words), [])
        # WOP Jeremiah 4:29: the kept word itself ("they", heard from 325.92) is not the skipped "The".
        rows = [{"n": 28, "t": 300.0, "tEnd": 325.8, "status": "PROBED_A"},
                {"n": 29, "t": 326.55, "status": "PROBED_A", "skippedPrefix": "The whole city"},
                {"n": 30, "t": 340.0, "status": "PROBED_A"}]
        words = [["they", 325.92, 326.8], ["shall", 326.8, 327.0]]
        self.assertEqual(al.tx_anchor(rows, units("x", "The whole city they shall flee", "y"), words), [])


if __name__ == "__main__":
    unittest.main()
