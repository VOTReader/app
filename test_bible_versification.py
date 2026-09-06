"""Verse numbering inside every shipped bible edition.

WHY THIS EXISTS. `ship()` writes a timing at `arr[n - 1]` and sizes the array to `max(n)`, where `n`
is the EDITION's own verse number. Both of those are only safe while, inside a chapter, the verse
numbers are strictly increasing and unique: a duplicate silently overwrites a slot that another verse
already owns, and an out-of-order number puts a timing behind an earlier one, while `len(arr)`,
`max(n)` and every other length check in `tools/validate-bible-sync.py` still pass. Nothing else in
the tree looks at that property, so this is where it is pinned.

It is a RULE over whatever is shipped, deliberately not a list of chapters. A list goes stale the day
an edition is added or the corpus is refreshed, and it goes stale silently, which is the worst way.
Measured when this was written (2026-09-06, main 7416be36): **0 violations across 9 editions and
8,768 chapters**, in 0.7 s, so the rule costs nothing today and fires on a bad ingest.

WHAT IT DELIBERATELY DOES NOT ASSERT. Which chapters are sparse. Sparse numbering is normal and it is
NOT a WEB quirk with four instances, which is what a reader of the old comment in
`tools/validate-bible-sync.py` would have concluded:

    bible-kjv.js    1189 chapters   sparse=0     bible-web.js    1189   sparse=4
    bible-lsv.js    1189            sparse=0     bible-hnv.js    1189   sparse=4   (the same four)
    bible-ylt.js    1189            sparse=0     bible-asv.js    1189   sparse=15
    bible-rkjv.js    223            sparse=221   bible-bsb.js    1189   sparse=15
    bible-rnkjv.js   222            sparse=220

The WEB and the HNV drop luke 17:36 and acts 8:37, 15:34, 24:7. The ASV and the BSB drop fifteen each,
including matthew 17, 18, 23 and mark 7, 9, 11. The RKJV and the RNKJV are PARTIAL editions of 26
books and are ~99 % sparse by construction, so a per-chapter verse count means something different
there. Three editions have no gaps at all, which is why a dense-shipper bug never surfaces on the KJV.

Run: python -m unittest test_bible_versification -v
"""

import json
import re
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "app", "src", "main", "assets", "src", "data")


def _payload(path):
    """The first JSON value out of a `var X = ...;` data file.

    Two things this got wrong before, both silent:

    * `raw_decode` rather than a slice to the last brace. Some of these files declare more than one
      value, and slicing to `rindex("}")` reports "Extra data" — a PARSE failure that reads exactly
      like a corrupt file when the file is fine and merely has a second declaration.
    * The value may be an ARRAY. `bible-studies.js` is a top-level array, so seeking `{` walked past
      the array opener into the first element and returned ONE STUDY as if it were the whole payload
      — a fragment that classifies fine and tells you nothing. A parser that silently returns part of
      a file is worse than one that raises.
    """
    with open(path, encoding="utf-8") as fh:           # `with`, not a bare open(): this repo is
        text = fh.read()                               # counting ResourceWarnings, not ignoring them
    # Anchored on the DECLARATION, not on a bracket and not on a bare `=`. These files open with a
    # header comment that contains both: `[appBookId, title]` in one, and
    # `BIBLE_SYNC_BRM_KJV[bookId][chapter] = [cs, cs, ...]` in another — so `[`, and even `= [`,
    # match inside the prose. `var NAME = {` is the only thing that cannot.
    m = re.search(r"\b(?:var|const|let)\s+\w+\s*=\s*[{\[]", text)
    if not m:
        raise ValueError("no `var NAME = {` or `= [` declaration in the file")
    return json.JSONDecoder().raw_decode(text, m.end() - 1)[0]


def violations(rows):
    """Every way a chapter's verse numbers can break `arr[n - 1]` / `max(n)`, as strings.

    Kept separate from the file walk so the planted-fault cases below exercise the same code the
    real data does. A checker that only ever runs on good input is not a checker.
    """
    nums = [r["n"] for r in rows]
    out = []
    if not nums:
        out.append("no verses")
        return out
    if len(set(nums)) != len(nums):
        dupes = sorted({n for n in nums if nums.count(n) > 1})
        out.append("duplicate verse number(s) %s" % dupes)
    if nums != sorted(nums):
        out.append("verse numbers out of order: %s" % nums[:12])
    if min(nums) < 1:
        out.append("verse number below 1: %s" % min(nums))
    return out


# The files under `bible-*.js` that are NOT verse editions, each with the reason it is exempt. This
# is a LIST on purpose, and it is the right shape here: the open set that grows (editions, and the
# per-edition sync files) is covered by a rule below, and the closed set of one-off exceptions has to
# be justified one at a time. Anything matching neither FAILS by name, which forces the decision onto
# whoever adds the file and still knows what it holds.
NOT_EDITIONS = {
    "bible-audio-manifest.js": "an audio manifest: its object literal is empty in the source and is "
                               "populated by a loop at the bottom of the file",
    "bible-studies.js": "a top-level array of letter studies, not a book -> chapter -> verses map",
}


def _editions(data=None):
    """Classify every `bible-*.js` under `data`. Returns (editions, unknown).

    An allowlist over a growing set of data files fails SILENTLY when somebody adds one, so editions
    are recognised by SHAPE. But a shape test needs somewhere for "matched nothing" to go, and the
    first version of this let it fall out of the loop: a file that parsed to `{}` was neither an
    edition nor an unknown, and the suite passed green over it. Planted and confirmed 2026-09-06 —
    exactly the vacuous pass this gate exists to prevent, in the gate itself. Every branch below now
    ends in a classification.
    """
    data = data or DATA
    editions, unknown = {}, []
    for name in sorted(os.listdir(data)):
        if not name.startswith("bible-") or not name.endswith(".js"):
            continue
        if name in NOT_EDITIONS:
            continue                                   # exempt by name, with its reason recorded above
        path = os.path.join(data, name)
        try:
            payload = _payload(path)
        except Exception as exc:                       # noqa: BLE001 - the filename is the point
            unknown.append("%s (could not parse: %s)" % (name, exc))
            continue
        if not isinstance(payload, dict) or not payload:
            unknown.append("%s (payload is %s, and empty or not an object)" % (name, type(payload).__name__))
            continue
        # The first NON-EMPTY chapter, not chapters[0]: an edition whose first chapter happened to be
        # empty would otherwise read as "not an edition" and be skipped whole.
        sample = next((ch for book in payload.values() if isinstance(book, dict)
                       for ch in book.values() if isinstance(ch, list) and ch), None)
        if sample is None:
            unknown.append("%s (book-shaped but holds no chapter with any rows)" % name)
        elif isinstance(sample[0], dict) and "n" in sample[0]:
            editions[name] = payload                    # rows of {"n": ..., "text": ...}
        elif name.startswith("bible-sync-") and isinstance(sample[0], (int, float)):
            continue                                    # a timing file: chapters are arrays of numbers
        else:
            unknown.append("%s (chapters hold %s, which is neither verse rows nor timings)"
                           % (name, type(sample[0]).__name__))
    return editions, unknown


class VerseNumbering(unittest.TestCase):

    def test_every_chapter_is_strictly_increasing_and_unique(self):
        editions, unknown = _editions()
        self.assertEqual(unknown, [], "unrecognised bible-*.js file(s); classify them here rather "
                                      "than letting the walk skip them silently")
        self.assertTrue(editions, "no editions found — DATA path wrong, which would pass vacuously")

        bad, chapters = [], 0
        for name, payload in editions.items():
            # Anti-vacuity, per edition and RELATIONAL rather than a number in prose: an edition that
            # parsed to something with no books, or a book with no chapters, has to fail here and not
            # quietly contribute nothing to a global total. The Data Builder's note on the first
            # version was right — a floor like "> 8,000 chapters" fails in the direction that blames
            # the data the day the corpus legitimately shrinks, and it would not have caught a single
            # empty edition sitting beside eight full ones anyway.
            self.assertTrue(payload, "%s has no books" % name)
            for book, chs in payload.items():
                self.assertTrue(chs, "%s %s has no chapters" % (name, book))
                for ch, rows in chs.items():
                    chapters += 1
                    for problem in violations(rows):
                        bad.append("%s %s %s: %s" % (name, book, ch, problem))
        self.assertEqual(bad, [], "verse numbering broken in %d place(s)" % len(bad))
        print("\n  %d editions, %d chapters checked" % (len(editions), chapters))

    def test_the_kjv_is_dense(self):
        """`tools/validate-bible-sync.py` and ci.yml both rest on this: because the KJV numbers every
        chapter 1..len, a dense shipper and a sparse shipper emit identical bytes for brm-kjv, so that
        file cannot catch the indexing bug. If the KJV ever stops being dense, that reasoning changes
        and the comments must change with it."""
        payload = _payload(os.path.join(DATA, "bible-kjv.js"))
        sparse = [
            "%s %s" % (book, ch)
            for book, chs in payload.items()
            for ch, rows in chs.items()
            if [r["n"] for r in rows] != list(range(1, len(rows) + 1))
        ]
        self.assertEqual(sparse, [], "the KJV is no longer dense")

    # --- the planted faults: the checker must go red on each, or it proves nothing above ---

    def test_a_duplicate_verse_number_is_caught(self):
        rows = [{"n": 1}, {"n": 2}, {"n": 2}, {"n": 3}]
        self.assertTrue(any("duplicate" in v for v in violations(rows)), violations(rows))

    def test_an_out_of_order_verse_number_is_caught(self):
        rows = [{"n": 1}, {"n": 3}, {"n": 2}, {"n": 4}]
        self.assertTrue(any("out of order" in v for v in violations(rows)), violations(rows))

    def test_a_real_chapter_with_a_planted_fault_goes_red(self):
        """The same two faults again, but planted into a copy of a REAL chapter — so the case that
        goes red is the shape the walk actually reads, not a four-element hand-made list."""
        payload = _payload(os.path.join(DATA, "bible-web.js"))
        rows = payload["acts"]["8"]                      # the gapped chapter: 1..36, 38..40
        self.assertEqual(violations(rows), [], "the unmodified chapter must be clean — the control")

        duped = [dict(r) for r in rows]
        duped[10]["n"] = duped[9]["n"]
        self.assertTrue(any("duplicate" in v for v in violations(duped)))

        swapped = [dict(r) for r in rows]
        swapped[10]["n"], swapped[11]["n"] = swapped[11]["n"], swapped[10]["n"]
        self.assertTrue(any("out of order" in v for v in violations(swapped)))

    def test_the_classifier_fails_on_anything_it_does_not_recognise(self):
        """The bite for the classifier, which is the half a checker usually forgets to test.

        The first version of `_editions()` let "matched no shape" fall out of the loop, so a data file
        that parsed to `{}` was neither an edition nor an unknown and the whole suite passed green
        over it — the vacuous pass this gate exists to prevent, sitting in the gate. These fixtures
        are written to a temp directory rather than into the real data folder: a test that plants a
        file beside the shipped corpus is one crash away from leaving it there.
        """
        import shutil
        import tempfile

        tmp = tempfile.mkdtemp(prefix="versenum-")
        try:
            def write(n, s):
                with open(os.path.join(tmp, n), "w", encoding="utf-8") as fh:
                    fh.write(s)

            write("bible-good.js", 'var A = {"genesis":{"1":[{"n":1,"text":"x"},{"n":2,"text":"y"}]}};')
            write("bible-sync-good.js", 'var B = {"genesis":{"1":[0,120,240]}};')
            write("bible-empty.js", "var C = {};")
            write("bible-books-no-chapters.js", 'var D = {"genesis":{}};')
            write("bible-wrong-rows.js", 'var E = {"genesis":{"1":["just a string"]}};')
            write("bible-broken.js", "var F = not json at all;")

            editions, unknown = _editions(tmp)
            self.assertEqual(sorted(editions), ["bible-good.js"], "only the real edition is an edition")
            named = " | ".join(unknown)
            for expected in ("bible-empty.js", "bible-books-no-chapters.js",
                             "bible-wrong-rows.js", "bible-broken.js"):
                self.assertIn(expected, named, "%s was skipped silently instead of failing" % expected)
            self.assertNotIn("bible-sync-good.js", named, "a timing file is a known non-edition")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_a_gap_is_not_a_violation(self):
        """The control in the other direction: sparse numbering is legal and must stay legal, or this
        gate would block the WEB, the HNV, the ASV, the BSB and both partial editions."""
        self.assertEqual(violations([{"n": 1}, {"n": 2}, {"n": 4}]), [])


if __name__ == "__main__":
    unittest.main()
