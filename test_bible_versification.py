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
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "app", "src", "main", "assets", "src", "data")


def _payload(path):
    """The first object literal out of a `var X = {...};` data file.

    `raw_decode` rather than a slice to the last brace: some of these files declare more than one
    value, and slicing to `rindex("}")` then reports "Extra data" — a PARSE failure that reads
    exactly like a corrupt file when the file is fine and merely has a second declaration.
    """
    with open(path, encoding="utf-8") as fh:           # `with`, not a bare open(): this repo is
        text = fh.read()                               # counting ResourceWarnings, not ignoring them
    return json.JSONDecoder().raw_decode(text, text.index("{"))[0]


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


def _editions():
    """Every shipped file that IS a verse edition, recognised by shape rather than by a name list.

    Returns (editions, unknown). An allowlist over a growing set of data files fails SILENTLY when
    somebody adds one; classifying by shape and failing on anything unrecognised forces the decision
    at the moment the file is added, by whoever knows what it holds.
    """
    editions, unknown = {}, []
    for name in sorted(os.listdir(DATA)):
        if not name.startswith("bible-") or not name.endswith(".js"):
            continue
        path = os.path.join(DATA, name)
        try:
            payload = _payload(path)
        except Exception as exc:                       # noqa: BLE001 - the filename is the point
            unknown.append("%s (could not parse: %s)" % (name, exc))
            continue
        if not isinstance(payload, dict):
            unknown.append("%s (top level is %s, not an object)" % (name, type(payload).__name__))
            continue
        # Look for the first NON-EMPTY chapter, not chapters[0]: an edition whose first chapter
        # happened to be empty would otherwise be classified as "not an edition" and skipped whole.
        sample = next((ch for book in payload.values() if isinstance(book, dict)
                       for ch in book.values() if isinstance(ch, list) and ch), None)
        if isinstance(sample, list) and isinstance(sample[0], dict) and "n" in sample[0]:
            editions[name] = payload                    # rows of {"n": ..., "text": ...}
        # Anything else is a timing/sync array file or a manifest, and is not this gate's business.
    return editions, unknown


class VerseNumbering(unittest.TestCase):

    def test_every_chapter_is_strictly_increasing_and_unique(self):
        editions, unknown = _editions()
        self.assertEqual(unknown, [], "unrecognised bible-*.js file(s); classify them here rather "
                                      "than letting the walk skip them silently")
        self.assertTrue(editions, "no editions found — DATA path wrong, which would pass vacuously")

        bad, chapters = [], 0
        for name, payload in editions.items():
            for book, chs in payload.items():
                for ch, rows in chs.items():
                    chapters += 1
                    for problem in violations(rows):
                        bad.append("%s %s %s: %s" % (name, book, ch, problem))
        self.assertEqual(bad, [], "verse numbering broken in %d place(s)" % len(bad))
        # A floor, so a walk that silently stopped reading cannot pass as a clean run: "0 violations"
        # over 0 chapters is the vacuous pass this whole family of gate keeps producing. 8,768 today,
        # and the floor sits below it with room rather than pinning the exact number, which would go
        # stale on the next edition and fail for the wrong reason.
        self.assertGreater(chapters, 8000, "only %d chapters walked" % chapters)
        self.assertGreaterEqual(len(editions), 5, "only %d editions found" % len(editions))

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

    def test_a_gap_is_not_a_violation(self):
        """The control in the other direction: sparse numbering is legal and must stay legal, or this
        gate would block the WEB, the HNV, the ASV, the BSB and both partial editions."""
        self.assertEqual(violations([{"n": 1}, {"n": 2}, {"n": 4}]), [])


if __name__ == "__main__":
    unittest.main()
