"""The weekly flock sync must never report a corpus bump it did not write.

tools/flock-audio-sync.py runs unattended on a schedule. Its bump_corpus() moves
CORPUS_VERSION in service-worker.js and CORPUS_CONTENT_VERSION in
src/search/cache.js, then returns the new number, which the caller puts straight
into the commit message.

WHY THIS FILE EXISTS. Both moves are str.replace on a literal anchor, and
str.replace returns its input UNCHANGED when the anchor misses. The
service-worker anchor pins the exact single space before `//`. Reformat that one
line and the bump silently does nothing while bump_corpus() still returns `new`:
the job then commits changed audio content under the old version, and the
CORPUS_VERSION gate fails hours later saying "content changed but CORPUS_VERSION
was not bumped" -- a correct gate naming the wrong cause, in a job nobody is
watching. Re-anchoring on something looser would leave the same defect one
reformat away; asserting the write actually happened does not.

The half-bumped tree is the second failure, and it is worse than the first. If
service-worker.js were written before cache.js were checked, a missed cache
anchor would leave CORPUS_VERSION moved and CORPUS_CONTENT_VERSION not -- and
CORPUS_CONTENT_VERSION feeds the search-index cache signature, so a stale index
would survive the corpus swap with the version gate perfectly happy. Hence the
third test: on any missed anchor, NEITHER file is written.
"""
import importlib.util
import os
import tempfile
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))

_spec = importlib.util.spec_from_file_location(
    "flock_audio_sync", os.path.join(ROOT, "tools", "flock-audio-sync.py"))
flock = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(flock)

SW_GOOD = (
    "const CACHE_VERSION = 'v41';\n"
    "const CORPUS_VERSION = 'c48'; // c47->c48 (2026-09-05): something earlier.\n"
    "self.addEventListener('install', () => {});\n"
)
# The one-character reformat that kills the anchor: two spaces before the //.
SW_REFORMATTED = SW_GOOD.replace("'c48'; //", "'c48';  //")

CACHE_GOOD = "export const CORPUS_CONTENT_VERSION = 'c48';\n"
CACHE_STALE_ANCHOR = "export const CORPUS_CONTENT_VERSION = \"c48\";\n"   # double quotes


class BumpCorpus(unittest.TestCase):
    def _files(self, sw_text, cache_text):
        d = tempfile.mkdtemp()
        sw = os.path.join(d, "service-worker.js")
        cache = os.path.join(d, "cache.js")
        open(sw, "w", encoding="utf-8", newline="\n").write(sw_text)
        open(cache, "w", encoding="utf-8", newline="\n").write(cache_text)
        flock.SW, flock.CACHE = sw, cache
        return sw, cache

    def test_both_anchors_present_bumps_both_files(self):
        sw, cache = self._files(SW_GOOD, CACHE_GOOD)
        self.assertEqual(flock.bump_corpus(), 49)
        sw_after = open(sw, encoding="utf-8").read()
        self.assertIn("const CORPUS_VERSION = 'c49';", sw_after)
        self.assertIn("c48->c49", sw_after)
        # The previous entry survives: line 44 of the real file is one long
        # accumulating line and a bump PREPENDS to it, never replaces it.
        self.assertIn("c47->c48", sw_after)
        self.assertIn("CORPUS_CONTENT_VERSION = 'c49'", open(cache, encoding="utf-8").read())

    def test_reformatted_service_worker_anchor_raises(self):
        self._files(SW_REFORMATTED, CACHE_GOOD)
        with self.assertRaises(RuntimeError) as e:
            flock.bump_corpus()
        self.assertIn("CORPUS_VERSION anchor missed", str(e.exception))

    def test_a_missed_anchor_writes_NEITHER_file(self):
        # cache.js is the one that misses; service-worker.js is perfectly good
        # and must still be left alone, or the tree is half-bumped.
        sw, cache = self._files(SW_GOOD, CACHE_STALE_ANCHOR)
        with self.assertRaises(RuntimeError) as e:
            flock.bump_corpus()
        self.assertIn("CORPUS_CONTENT_VERSION anchor missed", str(e.exception))
        self.assertEqual(open(sw, encoding="utf-8").read(), SW_GOOD)
        self.assertEqual(open(cache, encoding="utf-8").read(), CACHE_STALE_ANCHOR)


if __name__ == "__main__":
    unittest.main()
