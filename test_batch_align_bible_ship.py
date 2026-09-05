"""The Bible shipper addresses its array by VERSE NUMBER, and must keep doing so.

tools/batch-align-bible.py ships `BIBLE_SYNC_<EDITION>[book][chapter]` as one
array of centiseconds. It writes each belt row at `arr[row["n"] - 1]`, sizes the
array to `max(n)`, and `row["n"]` is the EDITION's own verse number -- which for
some editions is SPARSE. ReadAlongHighlight._bibleRowsFor reads position `i` back
as verse NUMBER `i + 1` and resolves it in the DOM by that number
(`bibleHlKey(book, chapter, n)`), so the two ends agree by verse identity and a
verse either side lacks simply paints nothing.

WHY THIS FILE EXISTS. Two readers concluded on 2026-09-05 that the array was
DENSE -- one slot per row, in row order -- and that it therefore needed a fix to
index it by the app's verse slots. It does not; but the dense reading is the one
that looks right, and writing it would shift every verse after a gap by one for
the rest of the chapter, silently, with every gate in the repo green. Measured
against the real corpus at the time, WEB omits exactly one mid-chapter verse in
each of acts 8 (:37), acts 15 (:34), acts 24 (:7) and luke 17 (:36); today's
shipper places verse 38 of acts 8 at index 37 (CORRECT), a dense shipper places
it at index 36 (WRONG, and so on to the end of the chapter).

The shipped brm-kjv file cannot catch this: KJV is dense in all 1,161 of its
chapters, so `max(n)` and `len(rows)` agree everywhere in it and both shippers
produce identical bytes. The gap is the whole discriminator, so the fixture below
is a real gapped chapter and not a synthetic one.

Not asserted here, deliberately: the array's LENGTH. Padding a short chapter with
trailing zeros is harmless -- an absent slot and a zero slot both paint nothing --
so pinning the length would fail a change that costs the reader nothing. The one
property that must hold is that no index ever carries another verse's time.
"""
import importlib.util
import json
import os
import re
import tempfile
import unittest

ROOT = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "batch_align_bible", os.path.join(ROOT, "tools", "batch-align-bible.py"))
bab = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bab)

# acts 8 as the WEB edition numbers it: verse 37 is absent, and 38-40 keep their
# own numbers rather than closing the gap.
ACTS8_WEB = [n for n in range(1, 41) if n != 37]


def belt(book_id, chapter, verse_numbers):
    """One belt, every verse proven, at a time this test can trace: verse n at
    n.00 seconds, so a slot holding the wrong verse's time is legible as the
    number of the verse it really belongs to rather than as a bare mismatch."""
    return {
        "bookId": book_id,
        "chapter": chapter,
        "settings_hash": "testhash01",
        "verses": [{"n": n, "t": float(n), "status": "CONFIRMED"} for n in verse_numbers],
    }


class ShipIndexesByVerseNumber(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.belts = os.path.join(self.dir.name, "belts")
        os.makedirs(self.belts)
        # ship() writes into DATA -- point it at the temp dir or a test run
        # rewrites the repo's real src/data file.
        self._saved_data = bab.DATA
        bab.DATA = os.path.join(self.dir.name, "data")
        os.makedirs(bab.DATA)
        self.addCleanup(self._restore)

    def _restore(self):
        bab.DATA = self._saved_data

    def _ship(self, *belts):
        for d in belts:
            name = "%s_%03d.json" % (d["bookId"], d["chapter"])
            with open(os.path.join(self.belts, name), "w", encoding="utf-8") as fh:
                json.dump(d, fh)
        bab.ship("web-ebible", self.belts)
        src = open(os.path.join(bab.DATA, "bible-sync-web-ebible.js"), encoding="utf-8").read()
        body = re.search(r"var BIBLE_SYNC_WEB_EBIBLE = (\{.*\});\s*$", src, re.S)
        self.assertTrue(body, "shipper wrote no assignment this test can read")
        return json.loads(body.group(1))

    def test_a_gapped_chapter_keeps_every_verse_at_its_own_number(self):
        arr = self._ship(belt("acts", 8, ACTS8_WEB))["acts"]["8"]
        # The renderer calls index i verse i+1, so this IS the reader's view.
        for n in ACTS8_WEB:
            self.assertEqual(arr[n - 1], n * 100,
                             "index %d should carry verse %d, carries verse %s"
                             % (n - 1, n, arr[n - 1] / 100))
        # The verse this edition does not have paints nothing rather than
        # borrowing its neighbour's onset.
        self.assertEqual(arr[36], 0, "acts 8:37 is absent from WEB and must stay 0")

    def test_a_dense_chapter_is_unaffected(self):
        # The control. Without it the assertion above would also pass on a
        # shipper that had simply stopped writing anything after a gap, and it
        # is the shape every KJV chapter has -- so this is what must not move
        # while the gapped case is being protected.
        arr = self._ship(belt("john", 1, list(range(1, 6))))["john"]["1"]
        self.assertEqual(arr, [100, 200, 300, 400, 500])


if __name__ == "__main__":
    unittest.main()
