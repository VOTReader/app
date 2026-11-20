"""Unit tests for tools/wordnet-pairs.py — one-word synonym pairs out of a
WordNet 3.x database.

The script is importable with no side effects (only re / os / sys at top
level; main() runs under the __main__ guard), so the tests load it with
importlib and exercise clean() / read_index() / read_data() directly plus
main() end to end on a fixture dict directory: one noun synset per link
kind (syn, sim via adj, hyp), a syn link that must beat a hyp link for the
same pair, rank order from the index, and words the readers must drop
(non-plain, unranked, duplicated).

Run:  python -m unittest test_wordnet_pairs -v   (from repo root)
"""

import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location(
    "wordnet_pairs", Path(_HERE, "tools", "wordnet-pairs.py"))
wp = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(wp)

_INDEX_NOUN = """\
dog n 1 1 @ 1 0 00000001
canine n 1 1 @ 1 0 00000001
animal n 1 1 @ 1 0 00000002
walk n 2 1 @ 2 0 00000003 00000005
stride n 1 1 @ 1 0 00000003
tread n 2 1 @ 2 0 00000004 00000005
"""

_DATA_NOUN = """\
00000001 03 n 02 dog 0 canine 0 001 @ 00000002 n 0000 | a domestic animal
00000002 03 n 01 animal 0 000 | an animal
00000003 03 n 05 walk 0 stride 0 walk 0 walk2 0 ghost 0 000 | to move on foot
00000004 03 n 01 tread 0 001 @ 00000003 n 0000 | to step
00000005 03 n 02 tread 0 walk 0 000 | to step heavily
"""

_INDEX_ADJ = """\
quick a 1 1 & 1 0 00000101
rapid a 1 1 & 1 0 00000102
"""

_DATA_ADJ = """\
00000101 03 a 01 quick 0 001 & 00000102 s 0000 | fast
00000102 03 s 01 rapid 0 000 | speedy
"""

_EXPECTED = [
    "animal\tcanine\thyp\t1\t1",
    "animal\tdog\thyp\t1\t1",
    "canine\tdog\tsyn\t1\t1",
    "quick\trapid\tsim\t1\t1",
    "stride\ttread\thyp\t1\t1",
    "stride\twalk\tsyn\t1\t1",
    "tread\twalk\tsyn\t2\t2",
]


class CleanTest(unittest.TestCase):
    def test_clean_accepts_plain_lowercase(self):
        self.assertEqual(wp.clean("dog"), "dog")
        self.assertEqual(wp.clean("DOG"), "dog")
        self.assertEqual(wp.clean("dog(a)"), "dog")
        self.assertEqual(wp.clean("dog(p)"), "dog")
        self.assertEqual(wp.clean("dog(ip)"), "dog")

    def test_clean_rejects_non_plain_words(self):
        self.assertIsNone(wp.clean("well-known"))
        self.assertIsNone(wp.clean("dog2"))
        self.assertIsNone(wp.clean("dogs'"))
        self.assertIsNone(wp.clean(""))
        self.assertIsNone(wp.clean("a1"))


class ReadIndexTest(unittest.TestCase):
    def test_read_index_keeps_sense_order(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "index.noun"
            p.write_text(_INDEX_NOUN, encoding="utf-8")
            idx = wp.read_index(str(p))
        self.assertEqual(idx["dog"], ["00000001"])
        self.assertEqual(idx["walk"], ["00000003", "00000005"])
        self.assertEqual(idx["tread"], ["00000004", "00000005"])
        self.assertEqual(len(idx), 6)


class ReadDataTest(unittest.TestCase):
    def test_read_data_words_sim_and_hypernyms(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "data.noun"
            p.write_text(_DATA_NOUN, encoding="utf-8")
            data = wp.read_data(str(p))
        # Raw words, uncleaned; synset offsets as strings.
        self.assertEqual(data["00000001"],
                         (["dog", "canine"], [], ["00000002"]))
        self.assertEqual(data["00000002"], (["animal"], [], []))
        self.assertEqual(data["00000003"][0],
                         ["walk", "stride", "walk", "walk2", "ghost"])
        self.assertEqual(data["00000004"], (["tread"], [], ["00000003"]))
        self.assertEqual(data["00000005"], (["tread", "walk"], [], []))

    def test_read_data_similar_to_is_adj_only(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "data.adj"
            p.write_text(_DATA_ADJ, encoding="utf-8")
            data = wp.read_data(str(p))
        self.assertEqual(data["00000101"],
                         (["quick"], ["00000102"], []))
        self.assertEqual(data["00000102"], (["rapid"], [], []))


class MainTest(unittest.TestCase):
    def test_end_to_end(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "index.noun").write_text(_INDEX_NOUN, encoding="utf-8")
            (d / "data.noun").write_text(_DATA_NOUN, encoding="utf-8")
            (d / "index.adj").write_text(_INDEX_ADJ, encoding="utf-8")
            (d / "data.adj").write_text(_DATA_ADJ, encoding="utf-8")
            for name in ("index.verb", "data.verb", "index.adv", "data.adv"):
                (d / name).write_text("", encoding="utf-8")
            out = d / "pairs.tsv"
            old_argv = sys.argv
            buf = io.StringIO()
            try:
                sys.argv = ["wordnet-pairs.py", str(d), str(out)]
                with contextlib.redirect_stdout(buf):
                    wp.main()
            finally:
                sys.argv = old_argv
            # Sorted by pair; syn beats hyp for (tread, walk) even though
            # the hyp link has the lower ranks; walk2 / ghost never appear.
            self.assertEqual(out.read_text(encoding="utf-8").splitlines(),
                             _EXPECTED)
            self.assertIn("[wordnet-pairs] 7 pairs -> ", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
